// Cloudflare Worker: 5분 크론 감시 사이클 + 원격 MCP 커넥터 + 모바일 대시보드
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env as CoreEnv } from "../core/types.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { postWithRetry, pushChannels, sendPush } from "../core/notify.js";
import { registerTools } from "../mcp/tools.js";
import { D1_FREE_LIMITS, D1Store, type D1Usage } from "./d1store.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { loadMonthUsage, maybeFireDeep } from "../core/deep.js";
import { recordRisk } from "../core/history.js";

interface Env extends CoreEnv {
  DB: D1Database;
  /** 하나의 개인 비밀값으로 커넥터 경로·대시보드 토큰·ntfy 토픽을 모두 유도한다 */
  KEW_SECRET?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** NTFY_TOPIC 을 따로 정하지 않으면 KEW_SECRET 에서 추측 불가능한 토픽을 만든다 */
async function resolveEnv(env: Env, origin?: string): Promise<Env> {
  const e = { ...env };
  if (!e.NTFY_TOPIC && e.KEW_SECRET) e.NTFY_TOPIC = `kew-${(await sha256Hex(`ntfy:${e.KEW_SECRET}`)).slice(0, 24)}`;
  if (!e.DASHBOARD_URL && origin) e.DASHBOARD_URL = origin;
  return e;
}

function safeEq(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function handleMcp(req: Request, env: Env, store: D1Store): Promise<Response> {
  // 요청마다 새 서버·무상태 트랜스포트 (Workers 에는 요청 간 메모리 공유가 보장되지 않음)
  const server = new McpServer({ name: "korea-early-warning", version: "0.2.0" });
  registerTools(server, { env, store });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

/** 크론 표현식별 소스 묶음 (wrangler.toml 의 crons 와 일치해야 함) */
const CRON_GROUPS: Record<string, string[]> = {
  "* * * * *": ["rss_breaking"],
  "*/5 * * * *": ["safetydata", "usgs", "emsc", "adsb_lol", "rss_news"],
  "3-59/15 * * * *": ["nga_msi", "bluesky", "markets"],
  "11 * * * *": ["travel", "korea_kr_mnd", "ioda", "aisstream", "firms", "advisories", "polymarket"],
  "41 2 * * *": ["gpsjam", "gfw", "wiki", "naver_datalab", "ecos"],
};

/** D1 무료 한도 초과 오류인가 (UTC 자정 = 한국 시간 오전 9시에 풀린다) */
export const isD1Limit = (e: unknown) => /D1_ERROR|exceeded D1|row read limit|rows? written limit/i.test(String((e as Error)?.message ?? e));

const fmtRows = (n: number) => (n >= 10_000 ? `${Math.round(n / 10_000)}만` : String(n));

/** 이번 호출의 저장소 사용량을 오늘 합계에 더하고, 하루 한도의 70%를 넘으면 하루 한 번 알린다 */
async function finishUsage(store: D1Store, env: Env, now: number): Promise<D1Usage | undefined> {
  if (!store.usage.queries) return undefined;
  try {
    const u = await store.flushUsage(now);
    if (!u) return undefined;
    const ratio = Math.max(u.read / D1_FREE_LIMITS.read, u.written / D1_FREE_LIMITS.written);
    if (ratio >= 0.7) {
      const key = `d1warn:${u.date}`;
      if (!(await store.getKv(key))) {
        await store.setKv(key, String(now));
        await sendPush(env, {
          title: "[시스템] 서버 저장소 하루 한도의 70%를 넘었습니다",
          body: `오늘 읽기 ${fmtRows(u.read)}/500만 행 · 쓰기 ${fmtRows(u.written)}/10만 행 (Cloudflare D1 무료). 한도를 넘으면 한국 시간 오전 9시까지 감시·알림·대시보드가 멈춥니다.`,
          priority: 4,
          url: env.DASHBOARD_URL,
        });
      }
    }
    return u;
  } catch {
    return undefined; // 한도 초과 등 — 기록 실패는 조용히 넘긴다
  }
}

/** 사이클 실행 결과(또는 오류)를 대시보드가 볼 수 있게 기록 */
async function runAndRecord(env: Env, store: D1Store, now: number, trigger: string, only?: string[], quietSkip = false) {
  try {
    const report = await runCycle(env, store, { now, only, quietSkip });
    await store.setKv("last_cycle", JSON.stringify({ at: report.at, trigger, sources: report.sources, alerts: report.alerts, newSignals: report.newSignals, skipped: report.skipped }));
    return report;
  } catch (e) {
    await store.setKv("last_cycle", JSON.stringify({ at: now, trigger, error: String((e as Error)?.stack ?? e).slice(0, 800) })).catch(() => {});
    if (trigger.startsWith("cron")) throw e;
    return { error: String((e as Error)?.message ?? e) } as const;
  }
}

export default {
  async scheduled(ctrl: ScheduledController, rawEnv: Env, ctx: ExecutionContext) {
    const env = await resolveEnv(rawEnv);
    const store = new D1Store(env.DB);
    // 알 수 없는 크론(배포 직후 이전 스케줄 등)은 전 소스를 돌리지 않고 속보 묶음만 실행 (CPU 한도 보호)
    const group = CRON_GROUPS[ctrl.cron] ?? CRON_GROUPS["* * * * *"];
    try {
      if (ctrl.cron === "*/5 * * * *") await store.ensureSchema().catch(() => false);
      await store.setKv(`cron_seen:${ctrl.cron}`, String(ctrl.scheduledTime));
      // 1분 주기는 새 속보가 있을 때만 상관분석까지 간다 (나머지는 5분 주기가 매번 전체를 돈다)
      const report = await runAndRecord(env, store, ctrl.scheduledTime, `cron ${ctrl.cron}`, group, ctrl.cron === "* * * * *");
      if (!report || "error" in report) return;
      const usage = await finishUsage(store, env, ctrl.scheduledTime);
      // 5분마다: 자동 판정을 기록하고(영구 보관), 특이한 날이면 Claude Code 심층 분석을 깨운다 (저장소 한도에 여유가 있을 때만)
      const tight = !!usage && usage.read > D1_FREE_LIMITS.read * 0.8;
      if (ctrl.cron === "*/5 * * * *" && !tight) {
        try {
          const st = await buildState(store, report.at - 72 * 3600_000, env.DISABLED_SOURCES);
          await recordRisk(store, { ...st.warRisk, at: report.at }).catch(async (e) => {
            await store.setKv("risk:last_error", JSON.stringify({ at: report.at, error: String((e as Error)?.message ?? e).slice(0, 300) })).catch(() => {});
          });
          if (env.CLAUDE_ROUTINE_URL && env.CLAUDE_ROUTINE_TOKEN)
            await maybeFireDeep(store, env, { warRisk: st.warRisk, briefs: st.events.map((e) => e.brief), patterns: st.patterns, now: report.at, dashboardUrl: env.DASHBOARD_URL });
        } catch (e) {
          await store.setKv("deep:last_error", JSON.stringify({ at: report.at, error: String((e as Error)?.message ?? e).slice(0, 300) })).catch(() => {});
        }
      }
      const d = new Date(report.at);
      if (d.getUTCHours() === 15 && d.getUTCMinutes() < 5) ctx.waitUntil(store.prune(report.at - 30 * 86400_000));
    } finally {
      await finishUsage(store, env, ctrl.scheduledTime);
    }
  },

  async fetch(req: Request, rawEnv: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const env = await resolveEnv(rawEnv, url.origin);
    const store = new D1Store(env.DB);
    try {
      return await route(req, url, env, store);
    } catch (e) {
      // 저장소 한도 초과는 화면에 그대로 알린다 (예전에는 1101 오류로 빈 화면이 됐다)
      if (isD1Limit(e))
        return json({ error: "storage_limit", message: "서버 저장소(Cloudflare D1 무료)의 하루 사용 한도를 넘었습니다. 한국 시간 오전 9시에 풀리며, 그때까지 감시·알림도 멈춥니다.", detail: String((e as Error)?.message ?? e).slice(0, 300) }, 503);
      return json({ error: "server_error", message: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
    } finally {
      ctx.waitUntil(finishUsage(store, env, Date.now()));
    }
  },
};

async function route(req: Request, url: URL, env: Env, store: D1Store): Promise<Response> {
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/health") return json({ ok: true, configured: !!env.KEW_SECRET });

  // 원격 MCP 커넥터: claude.ai 설정 → 커넥터 → 사용자 지정 커넥터 추가 에 이 URL 을 등록
  if (url.pathname.startsWith("/mcp/")) {
    if (!safeEq(url.pathname.slice(5), env.KEW_SECRET)) return json({ error: "not found" }, 404);
    return handleMcp(req, env, store);
  }

  const authed = safeEq(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), env.KEW_SECRET);
  if (!authed) return json({ error: "unauthorized" }, 401);

  if (url.pathname === "/api/state" && req.method === "GET") {
    const hours = Math.min(Number(url.searchParams.get("hours") ?? 72), 720);
    const st = await buildState(store, Date.now() - hours * 3600_000, env.DISABLED_SOURCES, { dailyMax: Number(env.DEEP_DAILY_MAX ?? 2), monthlyMax: Number(env.DEEP_MONTHLY_MAX_RUNS ?? 30) });
    return json({
      ...st,
      setup: {
        ntfySubscribeUrl: env.NTFY_TOPIC ? `${env.NTFY_SERVER ?? "https://ntfy.sh"}/${env.NTFY_TOPIC}` : null,
        connectorUrl: `${url.origin}/mcp/${env.KEW_SECRET}`,
        pushChannels: pushChannels(env),
      },
    });
  }
  if (url.pathname === "/api/run" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { only?: string[]; dryRun?: boolean };
    if (body.only || body.dryRun) return json(await runCycle(env, store, { only: body.only, dryRun: body.dryRun }));
    return json(await runAndRecord(env, store, Date.now(), "manual"));
  }
  if (url.pathname === "/api/deep" && req.method === "GET") {
    // 심층 분석 요청·보고서·이번 달 사용량
    const notes = await store.getNotes(Date.now() - 30 * 86400_000);
    return json({
      requests: notes.filter((n) => n.kind === "deep_request").slice(0, 10),
      reports: notes.filter((n) => n.kind === "deep_report").slice(0, 5),
      usage: await loadMonthUsage(store, Date.now()),
      state: JSON.parse((await store.getKv("deep:state")) ?? "{}"),
      lastError: JSON.parse((await store.getKv("deep:last_error")) ?? "null"),
      configured: !!(env.CLAUDE_ROUTINE_URL && env.CLAUDE_ROUTINE_TOKEN),
    });
  }
  if (url.pathname === "/api/deep/fire" && req.method === "POST") {
    // 수동 실행·점검: dryRun=true 면 깨우지 않고 판단만, force=true 면 '이미 조사함'·하루 횟수 무시 (한 달 상한은 지킴),
    // external=true 면 요청만 기록하고 깨우기는 호출한 쪽이 직접 한다 (예: Claude 세션의 fire_trigger 로 시험 실행)
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; force?: boolean; external?: boolean };
    const st = await buildState(store, Date.now() - 72 * 3600_000, env.DISABLED_SOURCES);
    const r = await maybeFireDeep(store, env, { warRisk: st.warRisk, briefs: st.events.map((e) => e.brief), patterns: st.patterns, now: Date.now(), dashboardUrl: env.DASHBOARD_URL }, { dryRun: body.dryRun, force: body.force, external: body.external, manual: true });
    return json({ decision: r.decision, request: r.request && { ...r.request, payload: r.request.payload } });
  }
  if (url.pathname === "/api/ecos-series" && req.method === "GET") {
    // 과거 검증용: 한국은행 ECOS 일별 통계를 서버의 키로 받아 날짜·값만 돌려준다 (키는 응답·오류에 넣지 않는다).
    // ?stat=802Y001&item=0030000&from=20030101&to=20261031 · ?stat=802Y001&list=1 이면 항목 목록
    if (!env.ECOS_API_KEY) return json({ error: "ECOS_API_KEY 미설정" }, 400);
    const { ECOS_HISTORY_STATS, ecosItems, ecosSeries, redactKey } = await import("../core/collectors/ecos.js");
    const stat = url.searchParams.get("stat") ?? "802Y001";
    const item = url.searchParams.get("item") ?? "0030000";
    const from = url.searchParams.get("from") ?? "20030101";
    const to = url.searchParams.get("to") ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
    if (!(ECOS_HISTORY_STATS as readonly string[]).includes(stat) || !/^[0-9A-Z]{4,10}$/.test(item) || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) return json({ error: "bad params" }, 400);
    try {
      if (url.searchParams.get("list")) return json({ stat, items: await ecosItems(env.ECOS_API_KEY, stat) });
      const rows = await ecosSeries(env.ECOS_API_KEY, stat, item, from, to);
      return json({ stat, item, from, to, count: rows.length, rows: rows.map((r) => [r.date, r.value]) });
    } catch (e) {
      return json({ error: redactKey(String((e as Error)?.message ?? e), env.ECOS_API_KEY) }, 502);
    }
  }
  if (url.pathname === "/api/history-source" && req.method === "GET") {
    // 긴장 온도계(과거 10년) 재구성용 1회성 자료 받기 — 키가 필요한 출처(네이버)와 이 컨테이너에서 막힌 출처(위키미디어)를 서버가 대신 받는다.
    // 허용 목록만: naver(묶음 번호), wiki(문서 번호), wikiparse(정해진 문서). 키·인증값은 응답에 넣지 않는다.
    const kind = url.searchParams.get("kind");
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    try {
      if (kind === "naver") {
        const { NAVER_GROUPS, fetchNaverHistory } = await import("../core/collectors/naver.js");
        const g = NAVER_GROUPS[Number(url.searchParams.get("group"))];
        if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: "bad params" }, 400);
        if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return json({ error: "NAVER 키 미설정" }, 400);
        const j = await fetchNaverHistory(env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET, g, from, to);
        return json({ group: g.groupName, keywords: g.keywords, data: (j?.results?.[0]?.data ?? []).map((d: any) => [d.period, d.ratio]) });
      }
      if (kind === "wiki") {
        const { WIKI_BASKET, WIKI_UA } = await import("../core/collectors/wiki.js");
        const a = WIKI_BASKET[Number(url.searchParams.get("i"))];
        if (!a || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) return json({ error: "bad params" }, 400);
        const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${a[0]}.wikipedia/all-access/user/${encodeURIComponent(a[1])}/daily/${from}/${to}`, { headers: { "User-Agent": WIKI_UA } });
        const j = (await r.json()) as any;
        return json({ project: a[0], article: a[1], status: r.status, data: (j?.items ?? []).map((it: any) => [String(it.timestamp).slice(0, 8), it.views]) });
      }
      if (kind === "wikiparse") {
        const page = url.searchParams.get("page") ?? "";
        if (!/^List_of_North_Korean_missile_tests$|^\d{4}_in_North_Korea$/.test(page)) return json({ error: "page not allowed" }, 400);
        const { WIKI_UA } = await import("../core/collectors/wiki.js");
        const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`, { headers: { "User-Agent": WIKI_UA } });
        const j = (await r.json()) as any;
        return json({ page, status: r.status, wikitext: j?.parse?.wikitext ?? null, error: j?.error?.info });
      }
      return json({ error: "unknown kind" }, 400);
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 502);
    }
  }
  if (url.pathname === "/api/push-probe" && req.method === "POST") {
    // ntfy.sh 가 이 Worker 의 발신 IP 를 얼마나 막는지 측정한다. 아무도 구독하지 않는 임시 토픽으로 보낸다.
    const topic = `kew-probe-${crypto.randomUUID().slice(0, 8)}`;
    const results: { attempt: number; status: number; ms: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const res = await postWithRetry(fetch, env.NTFY_SERVER ?? "https://ntfy.sh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, message: `probe ${i}` }) });
      results.push({ attempt: i + 1, status: res.status, ms: Date.now() - t0 });
    }
    return json({ topic, results, okRate: results.filter((r) => r.status === 200).length / results.length });
  }
  if (url.pathname === "/api/ais-probe" && req.method === "POST") {
    // aisstream 진단: 지정 영역을 짧게 표본 수집해 프레임 수·형식·종료 사유를 반환 (키 값은 반환하지 않음)
    if (!env.AISSTREAM_API_KEY) return json({ error: "AISSTREAM_API_KEY 미설정" }, 400);
    const body = (await req.json().catch(() => ({}))) as { box?: [[number, number], [number, number]]; ms?: number };
    const { sampleAis, vesselMetrics } = await import("../core/collectors/ais.js");
    try {
      const s = await sampleAis(env.AISSTREAM_API_KEY, body.box, Math.min(body.ms ?? 10000, 25000));
      return json({ box: body.box ?? "yellow_sea", messages: s.messages, vessels: s.vessels.size, diag: s.diag, metrics: vesselMetrics(s) });
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e) }, 200);
    }
  }
  if (url.pathname === "/api/test-push" && req.method === "POST") {
    return json(await sendPush(env, { title: "[테스트] Korea Early Warning", body: "아이폰 푸시 연결 테스트입니다.", priority: 3, url: env.DASHBOARD_URL }));
  }
  return json({ error: "not found" }, 404);
}
