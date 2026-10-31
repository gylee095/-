// Cloudflare Worker: 5분 크론 감시 사이클 + 원격 MCP 커넥터 + 모바일 대시보드
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env as CoreEnv } from "../core/types.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { postWithRetry, pushChannels, sendPush } from "../core/notify.js";
import { registerTools } from "../mcp/tools.js";
import { D1Store } from "./d1store.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { loadMonthUsage, maybeFireDeep } from "../core/deep.js";

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

async function handleMcp(req: Request, env: Env): Promise<Response> {
  // 요청마다 새 서버·무상태 트랜스포트 (Workers 에는 요청 간 메모리 공유가 보장되지 않음)
  const server = new McpServer({ name: "korea-early-warning", version: "0.2.0" });
  registerTools(server, { env, store: new D1Store(env.DB) });
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

/** 사이클 실행 결과(또는 오류)를 대시보드가 볼 수 있게 기록 */
async function runAndRecord(env: Env, store: D1Store, now: number, trigger: string, only?: string[]) {
  try {
    const report = await runCycle(env, store, { now, only });
    await store.setKv("last_cycle", JSON.stringify({ at: report.at, trigger, sources: report.sources, alerts: report.alerts, newSignals: report.newSignals }));
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
    await store.setKv(`cron_seen:${ctrl.cron}`, String(ctrl.scheduledTime));
    const report = await runAndRecord(env, store, ctrl.scheduledTime, `cron ${ctrl.cron}`, group);
    if (!report || "error" in report) return;
    // 특이한 날이면 Claude Code 심층 분석을 깨운다 (5분 주기에서만, 토큰이 있을 때만)
    if (ctrl.cron === "*/5 * * * *" && env.CLAUDE_ROUTINE_URL && env.CLAUDE_ROUTINE_TOKEN) {
      try {
        const st = await buildState(store, report.at - 72 * 3600_000, env.DISABLED_SOURCES);
        await maybeFireDeep(store, env, { warRisk: st.warRisk, briefs: st.events.map((e) => e.brief), patterns: st.patterns, now: report.at, dashboardUrl: env.DASHBOARD_URL });
      } catch (e) {
        await store.setKv("deep:last_error", JSON.stringify({ at: report.at, error: String((e as Error)?.message ?? e).slice(0, 300) })).catch(() => {});
      }
    }
    const d = new Date(report.at);
    if (d.getUTCHours() === 15 && d.getUTCMinutes() < 5) ctx.waitUntil(store.prune(report.at - 30 * 86400_000));
  },

  async fetch(req: Request, rawEnv: Env): Promise<Response> {
    const url = new URL(req.url);
    const env = await resolveEnv(rawEnv, url.origin);
    const store = new D1Store(env.DB);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/health") return json({ ok: true, configured: !!env.KEW_SECRET });

    // 원격 MCP 커넥터: claude.ai 설정 → 커넥터 → 사용자 지정 커넥터 추가 에 이 URL 을 등록
    if (url.pathname.startsWith("/mcp/")) {
      if (!safeEq(url.pathname.slice(5), env.KEW_SECRET)) return json({ error: "not found" }, 404);
      return handleMcp(req, env);
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
  },
};
