// Cloudflare Worker: 5분 크론 감시 사이클 + 원격 MCP 커넥터 + 모바일 대시보드
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env as CoreEnv } from "../core/types.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { sendPush } from "../core/notify.js";
import { registerTools } from "../mcp/tools.js";
import { D1Store } from "./d1store.js";
import { DASHBOARD_HTML } from "./dashboard.js";

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
  "*/5 * * * *": ["safetydata", "usgs", "emsc", "adsb_lol"],
  "2-59/15 * * * *": ["nga_msi"],
  "1-59/5 * * * *": ["rss_news"],
};

/** 사이클 실행 결과(또는 오류)를 대시보드가 볼 수 있게 기록 */
async function runAndRecord(env: Env, store: D1Store, now: number, trigger: string, only?: string[]) {
  try {
    const report = await runCycle(env, store, { now, only });
    await store.setKv("last_cycle", JSON.stringify({ at: report.at, trigger, sources: report.sources, alerts: report.alerts, newSignals: report.newSignals }));
    return report;
  } catch (e) {
    await store.setKv("last_cycle", JSON.stringify({ at: now, trigger, error: String((e as Error)?.stack ?? e).slice(0, 800) })).catch(() => {});
    if (trigger === "cron") throw e;
    return { error: String((e as Error)?.message ?? e) } as const;
  }
}

export default {
  async scheduled(ctrl: ScheduledController, rawEnv: Env, ctx: ExecutionContext) {
    const env = await resolveEnv(rawEnv);
    const store = new D1Store(env.DB);
    const report = await runAndRecord(env, store, ctrl.scheduledTime, "cron", CRON_GROUPS[ctrl.cron]);
    if (!report || "error" in report) return;
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
      const st = await buildState(store, Date.now() - hours * 3600_000);
      return json({
        ...st,
        setup: {
          ntfySubscribeUrl: env.NTFY_TOPIC ? `${env.NTFY_SERVER ?? "https://ntfy.sh"}/${env.NTFY_TOPIC}` : null,
          connectorUrl: `${url.origin}/mcp/${env.KEW_SECRET}`,
        },
      });
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { only?: string[]; dryRun?: boolean };
      if (body.only || body.dryRun) return json(await runCycle(env, store, { only: body.only, dryRun: body.dryRun }));
      return json(await runAndRecord(env, store, Date.now(), "manual"));
    }
    if (url.pathname === "/api/test-push" && req.method === "POST") {
      return json(await sendPush(env, { title: "[테스트] Korea Early Warning", body: "아이폰 푸시 연결 테스트입니다.", priority: 3, url: env.DASHBOARD_URL }));
    }
    return json({ error: "not found" }, 404);
  },
};
