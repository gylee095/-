// Cloudflare Worker: 5분 크론 감시 사이클 + 모바일 대시보드 + 에이전트용 API
import type { Env as CoreEnv } from "../core/types.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { sendPush } from "../core/notify.js";
import { D1Store } from "./d1store.js";
import { DASHBOARD_HTML } from "./dashboard.js";

interface Env extends CoreEnv {
  DB: D1Database;
  DASHBOARD_TOKEN?: string;
  AGENT_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function bearer(req: Request): string | undefined {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
}

/** 타이밍 공격 방지용 상수 시간 비교 */
function safeEq(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export default {
  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext) {
    const store = new D1Store(env.DB);
    const report = await runCycle(env, store);
    await store.setKv("last_cycle", JSON.stringify({ at: report.at, sources: report.sources, alerts: report.alerts, newSignals: report.newSignals }));
    // 하루 한 번(00시대 첫 실행) 30일 지난 데이터 정리
    if (new Date(report.at).getUTCHours() === 15 && new Date(report.at).getUTCMinutes() < 5) ctx.waitUntil(store.prune(report.at - 30 * 86400_000));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const store = new D1Store(env.DB);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const isAgent = safeEq(bearer(req), env.AGENT_TOKEN);
    const isViewer = isAgent || safeEq(bearer(req), env.DASHBOARD_TOKEN);

    if (url.pathname === "/api/state" && req.method === "GET") {
      if (!isViewer) return json({ error: "unauthorized" }, 401);
      const hours = Math.min(Number(url.searchParams.get("hours") ?? 72), 720);
      return json(await buildState(store, Date.now() - hours * 3600_000));
    }

    if (!isAgent) return json({ error: "unauthorized" }, 401);

    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { only?: string[]; dryRun?: boolean };
      return json(await runCycle(env, store, { only: body.only, dryRun: body.dryRun }));
    }
    if (url.pathname === "/api/notes" && req.method === "POST") {
      const body = (await req.json()) as { text: string; author?: string; eventIds?: string[] };
      if (!body.text) return json({ error: "text required" }, 400);
      await store.addNote({ at: Date.now(), author: body.author ?? "agent", text: body.text.slice(0, 4000), eventIds: body.eventIds });
      return json({ ok: true });
    }
    if (url.pathname === "/api/notify" && req.method === "POST") {
      const body = (await req.json()) as { title: string; body: string; priority?: number; dedupeKey: string };
      if (!body.dedupeKey) return json({ error: "dedupeKey required" }, 400);
      const key = `agent_push:${body.dedupeKey}`;
      if (await store.getKv(key)) return json({ ok: true, suppressed: "이미 같은 dedupeKey로 발송됨" });
      const res = await sendPush(env, { title: body.title, body: body.body, priority: body.priority ?? 3, url: env.DASHBOARD_URL });
      if (res.some((r) => r.ok)) await store.setKv(key, String(Date.now()));
      return json({ ok: res.some((r) => r.ok), results: res });
    }
    return json({ error: "not found" }, 404);
  },
};
