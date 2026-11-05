// Cloudflare Worker: 5분 크론 감시 사이클 + 원격 MCP 커넥터 + 모바일 대시보드
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { notifyPhaseChange } from "../core/phasealert.js";
import { addSub, loadSubs, loadVapid, removeSub, sendWebPush, type PushSubscriptionJson } from "../core/webpush.js";
import { ICON_SVG, SERVICE_WORKER_JS, WEB_MANIFEST } from "./pwa.js";
import { DEVICES_PER_CODE, PAYAPP_PAYTYPES, PRODUCT_NAME, SHOP_NAME, attachStartReport, billingSummary, setExtraReports, createOrder, loadOrders, handlePayAppNotice, orderStatus, paidOrderByCode, payAppConfig, redeemCode, refundOrder } from "../core/billing.js";
import { CURRENT_KEY, addDemoReports, freezeState, loadFull, loadReports, reportFromRisk, saveCurrent, snapshotForPurchase, summarize, visibleReports, type Report } from "../core/reports.js";
import { buyPage, failPage, successPage, termsPage } from "./buy.js";
import { OG_JPG_BASE64 } from "./og.js";
import { readOnlyD1 } from "./readonly.js";
import { ICON_PNG_BASE64 } from "./icons.js";
import { mePage } from "./me.js";
import { pushBody, situationFromRecords } from "../core/pushtext.js";
import { fmtRiskPct } from "../core/warrisk.js";
import { SCHEDULE } from "../core/sources.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env as CoreEnv } from "../core/types.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { postWithRetry, pushChannels, sendPush } from "../core/notify.js";
import { registerTools } from "../mcp/tools.js";
import { D1_FREE_LIMITS, D1Store, type D1Usage } from "./d1store.js";
import { REPORT_THEME_CSS, DASHBOARD_HTML } from "./dashboard.js";
import { loadMonthUsage, maybeFireDeep } from "../core/deep.js";
import { recordRisk } from "../core/history.js";
import { recordMajorDays } from "../core/forecast.js";

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
  // 시험 서버는 본 서버와 다른 토픽 — 같은 비밀값을 써도 시험 알림이 운영자 폰(본 서버 토픽)으로 가지 않게
  if (!e.NTFY_TOPIC && e.KEW_SECRET) e.NTFY_TOPIC = `kew-${(await sha256Hex(`${e.STAGING ? "ntfy:staging:" : "ntfy:"}${e.KEW_SECRET}`)).slice(0, 24)}`;
  if (e.PUBLIC_URL) e.DASHBOARD_URL = e.PUBLIC_URL; // 정해 둔 공개 주소가 최우선 — 크론(요청 없음)에서 보내는 알림 링크도 이 주소로
  else if (!e.DASHBOARD_URL && origin) e.DASHBOARD_URL = origin;
  return e;
}

/**
 * 공개 주소로 옮기기 (2026-11-05): www 와 예전 주소(workers.dev)로 들어온 손님 화면은 공개 주소로 보낸다.
 * API·결제 통보·MCP·운영자 화면(/ops)은 옮기지 않는다 — 진행 중인 결제와 분석관 연결이 끊기지 않게.
 */
export function publicRedirect(req: Request, url: URL, publicUrl?: string): Response | undefined {
  if (!publicUrl || req.method !== "GET") return undefined;
  const pub = new URL(publicUrl);
  if (url.host === pub.host) return undefined;
  const page = ["/", "/index.html", "/buy", "/buy/success", "/buy/fail", "/terms", "/me"].includes(url.pathname) || url.pathname.startsWith("/r/");
  if (!page && url.host !== `www.${pub.host}`) return undefined;
  return Response.redirect(`${pub.origin}${url.pathname}${url.search}`, 301);
}

/**
 * 시험 서버 표시 (2026-11-06): 화면 맨 위에 빨간 띠, 검색 제외, 홈 화면 앱 이름에 '(시험)' — 본 서버와 헷갈리지 않게.
 * 시험 서버는 데이터베이스가 따로라 손님 구독·결제가 없고, 운영자 알림·결제·Claude 루틴 비밀값도 넣지 않는다(deploy.yml).
 */
export async function markStaging(res: Response, url: URL): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  const headers = new Headers(res.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  if (url.pathname === "/manifest.webmanifest") {
    const m = (await res.json()) as { name: string; short_name: string };
    return new Response(JSON.stringify({ ...m, name: `${m.name} (시험)`, short_name: `시험 ${m.short_name}` }), { status: res.status, headers });
  }
  if (!type.includes("text/html")) return new Response(res.body, { status: res.status, headers });
  const ribbon = '<div style="position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#ffd400;color:#000;font:700 12px/1 -apple-system,sans-serif;text-align:center;padding:4px 0;pointer-events:none;letter-spacing:.04em">STAGING · 시험 서버 — 손님에게 보이지 않아요</div>';
  const html = (await res.text()).replace(/<\/body>/i, `${ribbon}</body>`);
  return new Response(html, { status: res.status, headers });
}

/**
 * 실험 비교 (시험 서버): A = 본 서버가 5분마다 남긴 최신 판정(본 서버 코드), B = 같은 데이터로 이 코드가 지금 낸 판정.
 * 규칙을 바꾼 효과만 보이도록 입력은 같다.
 */
async function abCompare(store: D1Store, b: Awaited<ReturnType<typeof buildState>>["warRisk"]) {
  const raw = await store.getKv(CURRENT_KEY);
  const a = raw ? (JSON.parse(raw) as Report) : undefined;
  const B = reportFromRisk(b, Date.now(), "snapshot");
  return { a: a ?? null, b: B };
}

/** 로그인 링크 서명: HMAC-SHA256(비밀값, "login:" + 만료 시각). 만료는 지금부터 15분 안이어야 한다 */
export async function loginSignature(secret: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`login:${exp}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyLoginToken(secret: string, t: string, now: number): Promise<boolean> {
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(t);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= now || exp - now > 15 * 60_000) return false;
  return safeEq(m[2], await loginSignature(secret, exp));
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
// 크론 묶음은 core/sources.ts SCHEDULE 이 정본이다
const CRON_GROUPS: Record<string, string[]> = SCHEDULE;

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
          url: (env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/ops` : undefined),
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
    if (rawEnv.STAGING) return; // 시험 서버는 수집·판정 기록·알림을 하지 않는다 (본 서버 데이터를 읽기만)
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
          await recordMajorDays(store, st.events.map((e) => e.brief), report.at).catch(() => 0);
          await saveCurrent(store, st.warRisk, report.at).catch(() => {});
          await recordRisk(store, { ...st.warRisk, at: report.at }, { raw: st.tension.raw, pct: st.tension.pct }, st.forecast.p30).catch(async (e) => {
            await store.setKv("risk:last_error", JSON.stringify({ at: report.at, error: String((e as Error)?.message ?? e).slice(0, 300) })).catch(() => {});
          });
          // 알림은 단계가 실제로 바뀌었을 때만 (2026-11-03) — 사건 알림은 파이프라인이 따로 바로 보낸다
          await notifyPhaseChange(store, env, st.warRisk, report.at, fetch, freezeState(st as unknown as Record<string, unknown>)).catch(async (e) => {
            await store.setKv("phase_notify:last_error", JSON.stringify({ at: report.at, error: String((e as Error)?.message ?? e).slice(0, 300) })).catch(() => {});
          });
          if (env.CLAUDE_ROUTINE_URL && env.CLAUDE_ROUTINE_TOKEN)
            await maybeFireDeep(store, env, { warRisk: st.warRisk, briefs: st.events.map((e) => e.brief), patterns: st.patterns, now: report.at, dashboardUrl: (env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/ops` : undefined) });
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
    const moved = publicRedirect(req, url, rawEnv.PUBLIC_URL);
    if (moved) return moved;
    const env = await resolveEnv(rawEnv, url.origin);
    // 시험 서버: 본 서버 데이터를 읽기만 하고(쓰기는 버림), 첫 화면은 실험 비교가 있는 대시보드
    if (env.STAGING) {
      env.DB = readOnlyD1(env.DB);
      if (url.pathname === "/" || url.pathname === "/index.html") return Response.redirect(`${url.origin}/ops`, 302);
    }
    const store = new D1Store(env.DB);
    try {
      const res = await route(req, url, env, store);
      return env.STAGING ? markStaging(res, url) : res;
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
    // 예전 QR·링크(/?code=)는 알림함으로
    const code = url.searchParams.get("code");
    if (code) return Response.redirect(`${url.origin}/me?code=${encodeURIComponent(code)}`, 302);
    return new Response(buyPage(payAppConfig(env)?.userid, url.origin), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (url.pathname === "/ops") return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  if (url.pathname === "/me") return new Response(mePage(), { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  if (url.pathname.startsWith("/r/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice(3));
    const o = await paidOrderByCode(store, url.searchParams.get("code") ?? "");
    if (!o) return Response.redirect(`${url.origin}/me`, 302);
    const r = visibleReports(await loadReports(store), o.paidAt ?? 0, o.startReportId, o.extraReportIds).find((x) => x.id === id);
    if (!r) return Response.redirect(`${url.origin}/me`, 302);
    const full = await loadFull(store, id);
    if (!full) return Response.redirect(`${url.origin}/me?r=${encodeURIComponent(id)}&summary=1`, 302); // 대시보드 전체를 저장하기 전에 만든 리포트
    const inject = `<script>window.__KEW_REPORT__=${JSON.stringify({ id: r.id, at: r.at, headline: r.headline, kind: r.kind, phase: r.phase }).replace(/</g, "\\u003c")};Date.now=(function(t){return function(){return t}})(${r.kind === "demo" ? Date.now() : r.at});window.__KEW_STATE__=${JSON.stringify(full).replace(/</g, "\\u003c")};</script>`;
    return new Response(DASHBOARD_HTML.replace("<head>", "<head>" + inject).replace("</head>", `<style>${REPORT_THEME_CSS}</style><meta name="theme-color" content="#0a0b0b"></head>`), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
  }
  if (url.pathname === "/api/me" && req.method === "GET") {
    // 알림함: 결제된 코드만. 결제 시점 리포트 + 결제 뒤 단계 변화 리포트 목록 (본문은 따로)
    const o = await paidOrderByCode(store, url.searchParams.get("code") ?? "");
    if (!o) return json({ error: "맞지 않는 코드예요. 결제 뒤 받은 코드를 확인해 주세요." }, 404);
    const list = visibleReports(await loadReports(store), o.paidAt ?? 0, o.startReportId, o.extraReportIds).map(summarize);
    return new Response(JSON.stringify({ code: o.code, paidAt: o.paidAt, devicesUsed: o.devices.length, devicesMax: DEVICES_PER_CODE, reports: list }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/report" && req.method === "GET") {
    const o = await paidOrderByCode(store, url.searchParams.get("code") ?? "");
    if (!o) return json({ error: "맞지 않는 코드예요." }, 404);
    const r = visibleReports(await loadReports(store), o.paidAt ?? 0, o.startReportId, o.extraReportIds).find((x) => x.id === url.searchParams.get("id"));
    if (!r) return json({ error: "볼 수 없는 리포트예요." }, 404);
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (url.pathname === "/health") return json({ ok: true, configured: !!env.KEW_SECRET });
  // 운영자 로그인 링크 (2026-11-06): 비밀값을 잊었을 때. 링크에는 비밀값이 없고 '만료 시각 + 서명'만 있다 — 서명은 비밀값으로만 만들 수 있고 15분 안에 끝난다.
  // 저장소에 쓰지 않으므로 읽기 전용 시험 서버에서도 된다. 링크 만들기: node scripts/login-link.mjs [주소]
  if (url.pathname === "/api/login" && req.method === "GET") {
    const ok = env.KEW_SECRET ? await verifyLoginToken(env.KEW_SECRET, url.searchParams.get("t") ?? "", Date.now()) : false;
    if (!ok) return json({ error: "로그인 링크가 맞지 않거나 시간이 지났어요. 새 링크를 받아 주세요." }, 401);
    return new Response(JSON.stringify({ token: env.KEW_SECRET }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  // 웹 푸시 (2026-11-04): 브라우저가 직접 알림을 띄운다 — 앱·건당 비용 없음
  if (url.pathname === "/sw.js") return new Response(SERVICE_WORKER_JS, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
  if (url.pathname === "/manifest.webmanifest") {
    const code = url.searchParams.get("code") ?? "";
    const m = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code) ? { ...WEB_MANIFEST, start_url: `/me?code=${code}` } : WEB_MANIFEST;
    return new Response(JSON.stringify(m), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" } });
  }
  if (url.pathname === "/og.jpg") return new Response(Uint8Array.from(atob(OG_JPG_BASE64), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  const iconSize = { "/icon-180.png": 180, "/apple-touch-icon.png": 180, "/apple-touch-icon-precomposed.png": 180, "/icon-192.png": 192, "/icon-512.png": 512 }[url.pathname];
  if (iconSize) return new Response(Uint8Array.from(atob(ICON_PNG_BASE64[iconSize]), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  if (url.pathname === "/icon.svg") return new Response(ICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
  // ── 유료 알림 (2026-11-04, 결제사 페이앱 11-05): 4,900원 1회 → 결제완료 통보 → 활성화 코드 → 휴대폰에서 코드로 켜기 ──
  if (url.pathname === "/buy") return new Response(buyPage(payAppConfig(env)?.userid, url.origin), { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.pathname === "/buy/success") return new Response(successPage(url.origin), { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.pathname === "/buy/fail") return new Response(failPage(url.searchParams.get("message") ?? ""), { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.pathname === "/terms") return new Response(termsPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.pathname === "/api/billing/order" && req.method === "POST") {
    // 주문은 서버가 만들고 금액도 서버가 정한다. 브라우저에는 결제창에 필요한 값(판매자 아이디·상품·금액·통보 주소)만 준다
    const cfg = payAppConfig(env);
    if (!cfg) return json({ error: "결제 준비 중이에요" }, 503);
    const o = await createOrder(store, Date.now());
    // 홈 화면 앱 안에서 시작한 결제 (11/5): 결제창은 앱 위에 잠깐 뜨는 창으로 열고, 결제가 끝나면 앱이 스스로 알아챈다.
    // 카톡 링크로 결제를 마친 화면(returnurl)은 "앱으로 돌아가세요"를 보여 준다
    const fromApp = ((await req.json().catch(() => ({}))) as { app?: boolean }).app === true;
    return json({
      orderId: o.orderId,
      claim: o.claim,
      payapp: {
        userid: cfg.userid,
        shopname: SHOP_NAME,
        goodname: PRODUCT_NAME,
        price: String(o.amount),
        var1: o.orderId,
        feedbackurl: `${url.origin}/api/billing/payapp-notify`,
        returnurl: `${url.origin}/buy/success?o=${encodeURIComponent(o.orderId)}&t=${o.claim}${fromApp ? "&app=1" : ""}`,
        // 결제 요청(카톡·문자 링크) 전송 뒤 페이앱 창이 갈 곳. 없으면 창을 닫으려 하는데 같은 탭이라 닫히지 않아 갇힌다 (11/5)
        redirecturl: `${url.origin}/buy/success?o=${encodeURIComponent(o.orderId)}&t=${o.claim}`,
        redirect: "self",
        smsuse: "y", // 번호는 페이앱 화면에서 받고, 페이앱이 결제 링크를 문자로 보낸다 (11/5)
        checkretry: "y",
        openpaytype: PAYAPP_PAYTYPES,
      },
    });
  }
  if (url.pathname === "/api/billing/payapp-notify" && req.method === "POST") {
    // 페이앱 서버 → 우리 서버. 연동 VALUE·해시·금액이 맞아야만 받고, 응답 본문이 정확히 'SUCCESS' 여야 페이앱이 진행한다
    const cfg = payAppConfig(env);
    if (!cfg) return new Response("FAIL", { status: 503 });
    const form = Object.fromEntries(new URLSearchParams(await req.text()));
    const r = await handlePayAppNotice(store, cfg, form, Date.now());
    if (r.reply === "SUCCESS" && r.action === "revoked") for (const ep of r.devices) await removeSub(store, ep);
    if (r.reply === "SUCCESS" && r.action === "paid" && r.order) {
      // 결제하자마자 받는 첫 리포트 (빈 알림함 방지)
      // 그 순간의 대시보드 전체도 함께 얼린다 (고객은 리포트를 열면 처음부터 보던 대시보드를 본다)
      const full = await buildState(store, Date.now() - 168 * 3600_000, env.DISABLED_SOURCES).then((st) => freezeState(st as unknown as Record<string, unknown>)).catch(() => undefined);
      const first = await snapshotForPurchase(store, Date.now(), full).catch(() => undefined);
      if (first) await attachStartReport(store, r.order.orderId, first.id, Date.now()).catch(() => {});
    }
    if (r.reply === "FAIL")
      await store
        .setKv("billing:last_reject", JSON.stringify({ at: Date.now(), reason: r.reason, state: form.pay_state, order: form.var1, price: form.price, responsedate: form.responsedate, fields: Object.keys(form).sort(), match: { userid: form.userid === cfg.userid, linkkey: form.linkkey === cfg.linkkey, linkval: form.linkval === cfg.linkval, hashPresent: !!form.hash } }))
        .catch(() => {});
    return new Response(r.reply, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (url.pathname === "/api/billing/status" && req.method === "GET") {
    // 결제 완료 화면이 코드를 받아 간다 — 주문번호와 그 주문의 일회용 열쇠가 둘 다 맞아야 한다
    const st = await orderStatus(store, url.searchParams.get("o") ?? "", url.searchParams.get("t") ?? "");
    if (!st) return json({ error: "주문을 찾을 수 없어요" }, 404);
    return new Response(JSON.stringify({ ...st, devices: DEVICES_PER_CODE }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/billing/activate" && req.method === "POST") {
    // 코드 + 이 기기의 푸시 구독 → paid 구독. 코드가 문지기라 인증은 필요 없다
    const body = (await req.json().catch(() => null)) as { code?: string; subscription?: PushSubscriptionJson } | null;
    if (!body?.code || !body.subscription?.endpoint) return json({ error: "code·subscription 필요" }, 400);
    const r = await redeemCode(store, body.code, body.subscription.endpoint);
    if (!r.ok) return json({ error: r.reason }, 403);
    const s = await addSub(store, body.subscription, "paid", Date.now());
    // 켜자마자 이 기기 하나에만 '켜졌어요' 알림 — 고객이 바로 확인하고(체감), 서비스 제공이 시작됐다는 기록도 된다. 다른 구독자에게는 가지 않는다
    const keys = await loadVapid(store, env.DASHBOARD_URL ?? url.origin);
    const welcome = await sendWebPush(keys, body.subscription, { title: "✅ 알림이 켜졌어요 — 한반도 조기경보", body: "앞으로 전쟁 위험 단계가 바뀔 때만 이렇게 알려 드려요. 평소엔 조용합니다.\n지금 상황 리포트는 알림함에 있어요.", url: `${url.origin}/me`, tag: "kew-welcome" }).catch(() => ({ ok: false }));
    return json({ ok: true, who: s.who, devicesUsed: r.order.devices.length, devicesMax: DEVICES_PER_CODE, welcome: welcome.ok });
  }
  if (url.pathname === "/api/push/key" && req.method === "GET") {
    const k = await loadVapid(store, env.DASHBOARD_URL ?? url.origin);
    return json({ publicKey: k.publicKey });
  }
  if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { subscription?: PushSubscriptionJson; who?: string } | null;
    if (!body?.subscription) return json({ error: "subscription 필요" }, 400);
    const authed = safeEq(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), env.KEW_SECRET);
    if (!authed) return json({ error: "알림은 결제 뒤 받은 활성화 코드로 켤 수 있어요", buy: "/buy" }, 402);
    try {
      const r = await addSub(store, body.subscription, "owner", Date.now());
      return json({ ok: true, ...r });
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e) }, 400);
    }
  }
  if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) return json({ error: "endpoint 필요" }, 400);
    return json({ ok: true, ...(await removeSub(store, body.endpoint)) });
  }

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
    const ab = env.STAGING ? await abCompare(store, st.warRisk) : undefined;
    return json({
      ...st,
      ...(ab ? { ab } : {}),
      setup: {
        ntfySubscribeUrl: env.NTFY_TOPIC ? `${env.NTFY_SERVER ?? "https://ntfy.sh"}/${env.NTFY_TOPIC}` : null,
        connectorUrl: `${url.origin}/mcp/${env.KEW_SECRET}`,
        pushChannels: pushChannels(env),
      },
    });
  }
  if (url.pathname === "/api/billing/summary" && req.method === "GET") return json(await billingSummary(store, Date.now()));
  if (url.pathname === "/api/billing/orders" && req.method === "GET") {
    const kst = (ms?: number) => (ms ? new Date(ms + 9 * 3600_000).toISOString().slice(5, 19).replace("T", " ") : null);
    return json((await loadOrders(store)).slice(-10).reverse().map((o) => ({ order: o.orderId, status: o.status, created: kst(o.createdAt), paid: kst(o.paidAt), mulNo: o.mulNo ?? null, devices: o.devices.length, startReport: !!o.startReportId })));
  }
  if (url.pathname === "/api/billing/find" && req.method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const o = (await loadOrders(store)).find((x) => x.status === "paid" && (x.orderId === q || x.mulNo === q));
    return o ? json({ order: o.orderId, inbox: `${url.origin}/me?code=${o.code}`, devices: o.devices.length }) : json({ error: "결제된 주문 없음" }, 404);
  }
  if (url.pathname === "/api/billing/demo" && req.method === "POST") {
    // 화면 확인용 예시 알림을 한 주문(코드)에만 붙인다 — 다른 손님에게는 보이지 않는다. {code, count} 붙이기 / {code, remove:true} 떼기
    const body = (await req.json().catch(() => null)) as { code?: string; count?: number; remove?: boolean } | null;
    const o = await paidOrderByCode(store, body?.code ?? "");
    if (!o) return json({ error: "결제된 코드가 아니에요" }, 404);
    if (body?.remove) { await setExtraReports(store, o.orderId, [], Date.now()); return json({ ok: true, removed: true }); }
    const st = await buildState(store, Date.now() - 168 * 3600_000, env.DISABLED_SOURCES);
    const made = await addDemoReports(store, st.warRisk, freezeState(st as unknown as Record<string, unknown>), Math.min(Math.max(body?.count ?? 3, 1), 8), Date.now());
    await setExtraReports(store, o.orderId, [...(o.extraReportIds ?? []), ...made.map((r) => r.id)], Date.now());
    return json({ ok: true, added: made.length });
  }
  if (url.pathname === "/api/billing/last-reject" && req.method === "GET") return json(JSON.parse((await store.getKv("billing:last_reject")) ?? "null"));
  if (url.pathname === "/api/billing/refund" && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { orderId?: string; code?: string; reason?: string } | null;
    if (!body?.orderId && !body?.code) return json({ error: "orderId 또는 code 필요" }, 400);
    const cfg = payAppConfig(env);
    if (!cfg) return json({ error: "페이앱 연동 정보 없음" }, 503);
    const r = await refundOrder(store, cfg, { orderId: body.orderId, code: body.code }, body.reason ?? "고객 요청 환불", Date.now());
    if (!r.ok) return json({ error: r.error }, 400);
    for (const ep of r.devices) await removeSub(store, ep);
    return json({ ok: true, orderId: r.orderId, devicesRemoved: r.devices.length });
  }
  if (url.pathname === "/api/push/subs" && req.method === "GET") {
    const subs = await loadSubs(store);
    return json({ total: subs.length, owner: subs.filter((s) => s.who === "owner").length, public: subs.filter((s) => s.who !== "owner").length });
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
    // 테스트 푸시도 실제 알림과 같은 모양으로 — 지금 상황·어제 대비·대시보드 주소 (2026-11-04)
    const st = await buildState(store, Date.now() - 24 * 3600_000, env.DISABLED_SOURCES);
    const sit = await situationFromRecords(store, Date.now(), `${st.warRisk.phase}단계 ${st.warRisk.phaseLabel}`);
    const label = st.threat.level > 1 ? st.threat.label : `${st.warRisk.phase}단계 ${st.warRisk.phaseLabel}`;
    const body = sit
      ? pushBody({ ...sit, label }, `[테스트] ${st.threat.level > 1 ? st.threat.summary : "최근 24시간 북한 발사·포격 없음"}`, env.DASHBOARD_URL)
      : `지금 한반도 상황 : ${label}\n[테스트] 연결 확인\n대시보드 : ${env.DASHBOARD_URL ?? ""}`;
    // 테스트는 첫 글자부터 테스트여야 한다 (2026-11-04: '주의 (약 4%) 테스트' 는 잘리면 실제 악화로 읽혔다). 실제 알림 틀(pushBody)을 쓰지 않는다
    const testBody = [`🧪 테스트 알림 — 실제 상황 아님`, `연결 확인용입니다. 지금 상황은 평소와 같이 ${label}입니다.`, env.DASHBOARD_URL ? `대시보드 : ${env.DASHBOARD_URL}/ops` : ""].filter(Boolean).join("\n");
    void body;
    return json(await sendPush(env, { title: "🧪 테스트 — 실제 상황 아님", body: testBody, priority: 2, url: (env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/ops` : undefined), tag: "kew-test" }, fetch, store));
  }
  return json({ error: "not found" }, 404);
}
