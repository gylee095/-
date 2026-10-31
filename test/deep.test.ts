import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/store.js";
import { addUsage, decideDeep, deepReasons, fireRoutine, loadMonthUsage, maybeFireDeep, type DeepState } from "../src/core/deep.js";
import type { WarRisk } from "../src/core/warrisk.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 9, 31, 3, 0); // 12:00 KST
const H = 3600_000;
const ENV = { CLAUDE_ROUTINE_URL: "https://api.anthropic.com/v1/claude_code/routines/trig_X/fire", CLAUDE_ROUTINE_TOKEN: "sk-ant-oat01-test" };

/** 실측 10/31 과 같은 모양: 사람들의 불안 '경계', 나머지 평소, 2단계 */
function war(over: Partial<WarRisk> = {}): WarRisk {
  const dom = (id: any, label: string, level: any, drivers: string[] = []) => ({ id, label, level, levelLabel: ["평소", "주의", "경계", "심각"][level], drivers, measured: 1, total: 1, why: "" });
  return {
    at: NOW, phase: 2, phaseLabel: "긴장", phaseReasons: [], clash30d: { low: 2, high: 4, point: 3.2 }, war30d: { low: 0.08, high: 0.2, point: 0.15 }, usual: { clash: 1.8, war: 0.09 },
    domains: [dom("gov", "정부의 행동", 0), dom("money", "돈의 움직임", 0), dom("military", "군사 동향", 1, ["최근 7일 도발"]), dom("nkwords", "북한의 말", 0), dom("public", "사람들의 불안", 2, ["한국 사람들의 전쟁 불안 평소의 89배 (이상)"])],
    firstMover: { kind: "caveat", text: "사람들의 불안이 크게 커졌다" }, tripwires: [], restraints: [], blindSpots: [], headline: "전쟁 위험 2단계(긴장)", ...over,
  } as WarRisk;
}
const quiet = () => war({ phase: 1, domains: war().domains.map((d) => ({ ...d, level: 0 as const, levelLabel: "평소" })) });
const st0 = (): DeepState => ({ handled: {}, daily: {} });

describe("심층 분석: 특이한 날 판단", () => {
  it("조용한 날은 깨우지 않는다", () => {
    expect(deepReasons(quiet(), [], [], NOW)).toEqual([]);
    expect(decideDeep([], st0(), 0, ENV, NOW)).toMatchObject({ fire: false, skipped: "특이 사항 없음" });
  });
  it("실측 10/31: '사람들의 불안' 경계 → 깨운다", () => {
    const r = deepReasons(war(), [], [], NOW);
    expect(r.map((x) => x.key)).toEqual(["domain:public:2"]);
    expect(r[0].text).toMatch(/사람들의 불안 '경계' — 한국 사람들의 전쟁 불안 평소의 89배/);
    expect(decideDeep(r, st0(), 0, ENV, NOW).fire).toBe(true);
  });
  it("위험도 4 이상 사건·3단계 이상·보통 이상 패턴도 이유가 된다", () => {
    const b: EventBrief = { headline: "북한, ICBM 발사 → 동해", isProvocation: true, danger: { level: 4, label: "심각", reason: "" }, at: NOW - 2 * H };
    const keys = deepReasons(war({ phase: 3, phaseLabel: "위기" }), [b], [{ id: "launch_prep", name: "발사 준비", confidence: "medium" } as any], NOW).map((x) => x.key);
    expect(keys).toContain("phase:3");
    expect(keys.some((k) => k.startsWith("event:"))).toBe(true);
    expect(keys).toContain("pattern:launch_prep");
  });
  it("같은 이유는 24시간 안에 다시 깨우지 않고, 하루 최대 횟수·3시간 간격·한 달 상한을 지킨다", () => {
    const r = deepReasons(war(), [], [], NOW);
    expect(decideDeep(r, { handled: { "domain:public:2": NOW - 5 * H }, daily: {} }, 0, ENV, NOW)).toMatchObject({ fire: false, skipped: "이미 24시간 안에 조사한 이유뿐" });
    expect(decideDeep(r, { handled: { "domain:public:2": NOW - 25 * H }, daily: {} }, 0, ENV, NOW).fire).toBe(true);
    expect(decideDeep(r, { handled: {}, daily: { "2026-10-31": 2 } }, 0, ENV, NOW).skipped).toMatch(/오늘 자동 실행 2회/);
    expect(decideDeep(r, { handled: {}, daily: {}, lastFiredAt: NOW - H }, 0, ENV, NOW).skipped).toMatch(/3시간/);
    expect(decideDeep(r, st0(), 30, ENV, NOW).skipped).toMatch(/이번 달 심층 분석 30회 다 씀/);
    expect(decideDeep(r, st0(), 0, {}, NOW).skipped).toMatch(/미설정/);
    // 수동(force)은 '이미 조사함'·하루 횟수는 무시하지만 한 달 상한은 지킨다
    expect(decideDeep(r, { handled: { "domain:public:2": NOW - H }, daily: { "2026-10-31": 9 } }, 0, ENV, NOW, { force: true }).fire).toBe(true);
    expect(decideDeep(r, st0(), 30, ENV, NOW, { force: true }).fire).toBe(false);
  });
});

describe("심층 분석: 깨우기와 기록", () => {
  it("공식 형식으로 POST: Bearer 토큰, anthropic-version, text 본문", async () => {
    let seen: any;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_01ABC", claude_code_session_url: "https://claude.ai/code/session_01ABC" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fireRoutine(ENV, "본문", fake);
    expect(r).toMatchObject({ ok: true, sessionId: "session_01ABC" });
    expect(seen.url).toBe(ENV.CLAUDE_ROUTINE_URL);
    expect((seen.init.headers as any).Authorization).toBe("Bearer sk-ant-oat01-test");
    expect((seen.init.headers as any)["anthropic-version"]).toBe("2026-10-21");
    expect(JSON.parse(seen.init.body)).toEqual({ text: "본문" });
  });
  it("429 는 실패로 남기고 '조사함' 표시를 하지 않는다 (다음 주기에 다시 시도)", async () => {
    const store = new MemoryStore();
    const fake = (async () => new Response('{"error":{"type":"rate_limit_error"}}', { status: 429, headers: { "retry-after": "600" } })) as unknown as typeof fetch;
    const { request } = await maybeFireDeep(store, ENV, { warRisk: war(), briefs: [], patterns: [], now: NOW }, { fetchImpl: fake });
    expect(request!.fire).toMatchObject({ ok: false, status: 429 });
    expect(request!.fire.error).toMatch(/retry-after 600/);
    expect(JSON.parse((await store.getKv("deep:state")) ?? "null")).toBeNull();
  });
  it("성공하면 요청 노트를 남기고 이유를 '조사함'으로 표시, 같은 날 다시 부르면 건너뛴다", async () => {
    const store = new MemoryStore();
    const fake = (async () => new Response(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_01ABC", claude_code_session_url: "https://claude.ai/code/session_01ABC" }), { status: 200 })) as unknown as typeof fetch;
    const first = await maybeFireDeep(store, ENV, { warRisk: war(), briefs: [], patterns: [], now: NOW }, { fetchImpl: fake });
    expect(first.request!.id).toBe("deep-20261031-1200");
    expect(first.request!.payload).toMatch(/왜 깨웠나:\n- 사람들의 불안 '경계'/);
    const notes = await store.getNotes(0);
    expect(notes[0].kind).toBe("deep_request");
    const again = await maybeFireDeep(store, ENV, { warRisk: war(), briefs: [], patterns: [], now: NOW + 4 * H }, { fetchImpl: fake });
    expect(again.decision.fire).toBe(false);
  });
});

describe("사용량: 세션 누적값에서 이번 증가분만 더한다", () => {
  it("정기 분석관(같은 세션)이 아침·저녁 누적값을 넣어도 증가분만 쌓인다", async () => {
    const store = new MemoryStore();
    await addUsage(store, "scheduled", { cost_usd: 0.3, input_tokens: 10, output_tokens: 1000, cache_read_tokens: 300000 }, NOW, "session_A");
    const m = await addUsage(store, "scheduled", { cost_usd: 0.56, input_tokens: 19, output_tokens: 2910, cache_read_tokens: 790414 }, NOW + 6 * H, "session_A");
    expect(m.scheduled.runs).toBe(2);
    expect(m.scheduled.cost_usd).toBeCloseTo(0.56, 4);
    expect(m.scheduled.cache_read_tokens).toBe(790414);
  });
  it("심층 분석(매번 새 세션)은 그대로 더하고, 달이 바뀌면 새로 센다", async () => {
    const store = new MemoryStore();
    await addUsage(store, "deep", { cost_usd: 2.5, output_tokens: 20000 }, NOW, "session_D1");
    await addUsage(store, "deep", { cost_usd: 1.5, output_tokens: 10000 }, NOW, "session_D2");
    expect((await loadMonthUsage(store, NOW)).deep).toMatchObject({ runs: 2, cost_usd: 4, output_tokens: 30000 });
    expect((await loadMonthUsage(store, Date.UTC(2026, 10, 1, 3))).deep.runs).toBe(0); // 11월 (한국 날짜)
  });
  it("나중에 채우기(backfill): 이미 센 실행의 토큰만 더하고 횟수는 그대로", async () => {
    const store = new MemoryStore();
    await addUsage(store, "deep", { model: "claude-sonnet-5-5" }, NOW, "deep-20261031-1200"); // 보고서 기록 때 토큰 없이 1회
    const m = await addUsage(store, "deep", { input_tokens: 43989, output_tokens: 9149, cache_read_tokens: 707685, cache_write_tokens: 41341 }, NOW, "session_01FNKpUCNTCZbMeLkeJ2u9nG", false);
    expect(m.deep).toMatchObject({ runs: 1, output_tokens: 9149, cache_read_tokens: 707685 });
  });
});
