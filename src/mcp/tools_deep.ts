// 심층 분석 도구 — '특이한 날'에 깨어난 Claude Code 세션이 요청을 읽고, 보고서와 자기 사용량을 남긴다.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../core/types.js";
import type { Store } from "../core/store.js";
import { buildState } from "../core/state.js";
import { sendPush } from "../core/notify.js";
import { addUsage, loadMonthUsage, type DeepRequestNote } from "../core/deep.js";
import { fmtKst } from "../core/util.js";

const out = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ ...out({ ok: false, error: String((e as Error)?.message ?? e) }), isError: true });

const usageSchema = z
  .object({
    model: z.string().max(60).optional(),
    input_tokens: z.number().int().min(0).optional(),
    output_tokens: z.number().int().min(0).optional(),
    cache_read_tokens: z.number().int().min(0).optional(),
    cache_write_tokens: z.number().int().min(0).optional(),
    cost_usd: z.number().min(0).optional().describe("API 요금 환산치 (get_session 의 external_metadata.usage.cost_usd)"),
  })
  .describe("이 세션의 사용량 — mcp__claude-code-remote__get_session(세션 ID 생략)의 external_metadata.usage 를 그대로 옮긴다");

export function registerDeepTools(server: McpServer, ctx: { env: Env; store: Store }) {
  const { env, store } = ctx;

  server.registerTool(
    "get_deep_request",
    {
      title: "심층 분석 요청 읽기",
      description:
        "서버가 '특이한 날'로 판단해 심층 분석을 요청한 이유(새로 생긴 이유·전체 이유), 요청 시각·번호, 그리고 지금의 전쟁 위험 판정을 반환한다. " +
        "깨어난 세션은 routine-fire-payload 의 요약보다 이 도구의 내용을 기준으로 조사를 시작한다. 이번 달 사용량과 상한도 함께 준다.",
      inputSchema: {},
    },
    async () => {
      try {
        const notes = await store.getNotes(Date.now() - 7 * 86400_000);
        const req = notes.find((n) => n.kind === "deep_request");
        const st = await buildState(store, Date.now() - 72 * 3600_000, env.DISABLED_SOURCES);
        const usage = await loadMonthUsage(store, Date.now());
        const d = req?.data as DeepRequestNote | undefined;
        return out({
          request: d ? { id: d.id, at: fmtKst(d.at), why: d.fresh.map((r) => r.text), allReasons: d.reasons.map((r) => r.text), manual: d.manual } : null,
          lastReport: (() => {
            const r = notes.find((n) => n.kind === "deep_report");
            return r ? { at: fmtKst(r.at), text: r.text.slice(0, 600) } : null;
          })(),
          warRisk: { headline: st.warRisk.headline, firstMover: st.warRisk.firstMover.text, domains: st.warRisk.domains.map((x) => ({ domain: x.label, level: x.levelLabel, drivers: x.drivers })), tripwires: st.warRisk.tripwires },
          monthUsage: usage,
          budget: { dailyMax: Number(env.DEEP_DAILY_MAX ?? 2), monthlyUsd: Number(env.DEEP_MONTHLY_BUDGET_USD ?? 30) },
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "record_deep_report",
    {
      title: "심층 분석 보고서 기록 (대시보드 '클로드 심층 분석' + 아이폰 알림)",
      description:
        "심층 조사 결과를 남긴다. 대시보드에 그대로 보이고, notify=true 면 아이폰으로 한 번 알린다. 사실(출처 있는 것)과 추론을 구분하고, " +
        "확률은 숫자로, 자동 판정과 다르면 이유를 쓴다. usage 에는 끝나기 직전 get_session(자기 자신)의 사용량을 넣는다 — 대시보드 '사용량'에 쌓인다.",
      inputSchema: {
        request_id: z.string().max(40).optional().describe("get_deep_request 의 request.id"),
        title: z.string().max(80).describe("한 줄 제목 — 일반인 말로 (예: '생존배낭 검색 89배 — 확성기 담화에 대중이 먼저 반응')"),
        summary: z.string().max(600).describe("결론 2~4문장 — 무엇이 이상했고, 원인이 무엇이며, 전쟁 위험을 어떻게 보는지"),
        findings: z.array(z.object({ fact: z.string().max(240), source: z.string().max(300).optional().describe("URL 또는 도구 이름") })).max(10).describe("확인한 사실 (출처 있는 것만)"),
        timeline: z.array(z.object({ date: z.string().max(20), event: z.string().max(200) })).max(15).optional().describe("시간순 정리 — 누가 먼저 움직였는지 보이게"),
        hypotheses: z.array(z.object({ hypothesis: z.string().max(200), for: z.array(z.string().max(200)).max(5), against: z.array(z.string().max(200)).max(5) })).max(4),
        analogs: z.array(z.object({ case: z.string().max(80), similar: z.string().max(200), different: z.string().max(200) })).max(3).optional().describe("비슷한 과거 사례와 다른 점"),
        war_phase: z.number().int().min(1).max(5),
        p_clash_30d: z.number().min(0).max(100).describe("앞으로 30일 국지 충돌 %"),
        p_war_30d: z.number().min(0).max(100).describe("앞으로 30일 전면전 %"),
        reasoning: z.string().max(500).describe("확률을 이렇게 본 이유 — 자동 판정과 같으면 같다고, 다르면 무엇 때문에 다른지"),
        watch: z.array(z.string().max(160)).max(5).describe("앞으로 지켜볼 신호·시한 (날짜 포함)"),
        open_questions: z.array(z.string().max(160)).max(5).optional().describe("못 푼 질문 — 다음 분석이 확인할 것"),
        wished_data: z.array(z.string().max(160)).max(5).optional().describe("있었으면 좋았을 자료 — 나중에 수집기로 붙일 후보"),
        usage: usageSchema.optional(),
        session_id: z.string().max(80).optional().describe("get_session 결과의 ccr.id (session_...) — 사용량 중복 방지"),
        notify: z.boolean().default(true),
      },
    },
    async (a) => {
      try {
        const now = Date.now();
        const text = [
          `[심층 분석] ${a.title}`,
          a.summary,
          `전쟁 위험 ${a.war_phase}단계 · 30일 국지 충돌 ${a.p_clash_30d}% · 전면전 ${a.p_war_30d}% — ${a.reasoning}`,
          a.findings.length ? `[확인한 사실] ${a.findings.map((f) => f.fact).join(" / ")}` : "",
          a.watch.length ? `[지켜볼 것] ${a.watch.join(" / ")}` : "",
        ].filter(Boolean).join("\n");
        await store.addNote({ at: now, author: "claude-deep", kind: "deep_report", text, data: a });
        let month;
        if (a.usage) month = await addUsage(store, "deep", a.usage, now, a.session_id);
        let push: unknown;
        if (a.notify) {
          push = await sendPush(env, {
            title: `[심층 분석] ${a.title}`.slice(0, 120),
            body: `${a.summary.slice(0, 220)}\n30일 국지 충돌 ${a.p_clash_30d}% · 전면전 ${a.p_war_30d}%`,
            priority: a.war_phase >= 4 ? 5 : a.war_phase >= 3 ? 4 : 3,
            url: env.DASHBOARD_URL,
          });
        }
        return out({ ok: true, monthUsage: month, push });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "record_usage",
    {
      title: "사용량 기록 (정기 분석·지난 심층 분석)",
      description:
        "Claude 세션 1회 실행의 사용량을 이번 달 합계에 더한다. 정기 분석(kind=scheduled)은 끝나기 직전 get_session(자기 자신)의 usage 와 세션 ID 를 넣는다. " +
        "get_session 의 사용량은 세션 누적값이라 서버가 지난번 기록과의 차이만 더한다. 금액은 API 요금 환산 참고치이며 실제로는 구독 사용 한도에서 차감된다.",
      inputSchema: { kind: z.enum(["scheduled", "deep"]), usage: usageSchema, session_id: z.string().max(80).describe("get_session 결과의 ccr.id (session_...) — 누적값에서 이번 증가분만 더하는 데 쓴다") },
    },
    async ({ kind, usage, session_id }) => {
      try {
        const now = Date.now();
        const month = await addUsage(store, kind, usage, now, session_id);
        await store.addNote({ at: now, author: "claude-agent", kind: "usage", text: `${kind} 사용량: API 환산 $${(usage.cost_usd ?? 0).toFixed(2)}`, data: { kind, usage, session_id } });
        return out({ ok: true, monthUsage: month });
      } catch (e) {
        return fail(e);
      }
    },
  );
}
