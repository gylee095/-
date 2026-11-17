// 알림은 전쟁 위험 단계가 실제로 바뀌었을 때만 (2026-11-03)
// 10/31~11/3 휴대폰으로 간 다섯 번은 모두 심층 분석 보고서였고 결론이 같았다('2단계·국지 충돌 4~5%').
import { RUBRIC_VERSION } from "../src/core/rubric.js";
import { DIGEST_ON, digestDue, digestMessage, realSigns } from "../src/core/phasealert.js";
import { describe, expect, it } from "vitest";
import { decidePhaseAlert, notifyPhaseChange, PHASE_STATE_KEY, DOWN_HOLD_MS, PHASE_ALERTS_PER_DAY, type PhaseNotifyState } from "../src/core/phasealert.js";
import { deepPushDecision } from "../src/core/deep.js";
import { MemoryStore } from "../src/core/store.js";
import type { WarRisk } from "../src/core/warrisk.js";

const NOW = Date.UTC(2026, 10, 3, 3, 0); // 11/3 12:00 KST
const MIN = 60_000;
const H = 3600_000;
const w = (phase: 1 | 2 | 3 | 4 | 5, point = phase === 3 ? 15 : 3.6) =>
  ({ phase, phaseLabel: ["", "평온", "긴장", "위기", "임박", "교전"][phase], clash30d: { low: 0, high: 0, point }, usual: { clash: 1.8, war: 0.09 }, vsUsual: point / 1.8, phaseReasons: ["두 나라 정부가 여행경보를 올림"], tripwires: ["미국 3단계 이상 → 임박"] }) as unknown as WarRisk;

describe("단계 알림 판단", () => {
  it("처음엔 지금 단계를 기억만 한다 (배포하자마자 울리지 않게)", () => {
    const r = decidePhaseAlert(undefined, w(2), NOW);
    expect(r.message).toBeUndefined();
    expect(r.state.phase).toBe(2);
  });

  it("같은 단계면 숫자가 3.4% → 3.8% 로 흔들려도 알리지 않는다", () => {
    let st: PhaseNotifyState = { phase: 2, at: NOW };
    for (const p of [3.4, 3.6, 3.8, 3.5, 3.6]) {
      const r = decidePhaseAlert(st, w(2, p), NOW);
      expect(r.message).toBeUndefined();
      st = r.state;
    }
  });

  it("올라감: 5분 주기 두 번 이어지면 알린다 — 한 번 튄 값은 알리지 않는다", () => {
    const s0: PhaseNotifyState = { phase: 2, at: NOW };
    const r1 = decidePhaseAlert(s0, w(3), NOW);
    expect(r1.message).toBeUndefined();
    // 다음 주기에 다시 2단계면 없던 일
    const back = decidePhaseAlert(r1.state, w(2), NOW + 5 * MIN);
    expect(back.message).toBeUndefined();
    expect(back.state.pending).toBeUndefined();
    // 두 번 이어지면 알림
    const r2 = decidePhaseAlert(r1.state, w(3), NOW + 5 * MIN);
    expect(r2.message?.direction).toBe("up");
    expect(r2.message?.title).toBe("3단계 위기 (약 15%) 나빠짐 · 2단계 긴장에서");
    // 이전 값이 있으면 제목에도 '몇 % → 몇 %'
    const withAgo = decidePhaseAlert(r1.state, w(3), NOW + 5 * MIN, { clashAgo: 3.8, agoLabel: "어제 이맘때" });
    expect(withAgo.message?.title).toBe("3단계 위기 (3.8% → 15%) 나빠짐 · 2단계 긴장에서");
    expect(withAgo.message?.body.split("\n")[0]).toBe("⬆ 나빠짐: 2단계 긴장 → 3단계 위기 · 30일 국지 충돌 3.8%(어제 이맘때) → 15%(지금)");
    expect(r2.message?.body.split("\n")[0]).toBe("⬆ 나빠짐: 2단계 긴장 → 3단계 위기");
    expect(r2.message?.body).toMatch(/\n지금 한반도 상황 : 3단계 위기 \(나빠짐 : 30일 국지 충돌 약 15%\)\n/);
    expect(r2.message?.body).toMatch(/평소 약 2%의 8\.3배/);
    expect(r2.message?.priority).toBe(4);
    expect(r2.state.phase).toBe(3);
  });

  it("내려감: 6시간 넘게 이어져야 알린다, 그 사이 다시 오르면 없던 일", () => {
    const s0: PhaseNotifyState = { phase: 3, at: NOW };
    let st = decidePhaseAlert(s0, w(2), NOW).state;
    expect(decidePhaseAlert(st, w(2), NOW + DOWN_HOLD_MS - MIN).message).toBeUndefined();
    const down = decidePhaseAlert(st, w(2), NOW + DOWN_HOLD_MS);
    expect(down.message?.title).toBe("2단계 긴장 (약 4%) 좋아짐 · 3단계 위기에서");
    expect(down.message?.priority).toBe(2);
    // 4시간 뒤 다시 3단계 → 알림 없이 3단계 그대로
    st = decidePhaseAlert(s0, w(2), NOW).state;
    const again = decidePhaseAlert(st, w(3), NOW + 4 * H);
    expect(again.message).toBeUndefined();
    expect(again.state.phase).toBe(3);
    expect(again.state.pending).toBeUndefined();
  });

  it("하루 한도를 넘으면 단계만 바꿔 기억하고 알리지 않는다 — 단, 위기(3단계) 이상으로 오르는 알림은 한도와 상관없이 보낸다", () => {
    const day = "2026-11-03";
    const down: PhaseNotifyState = { phase: 2, at: NOW, sent: { [day]: PHASE_ALERTS_PER_DAY }, pending: { phase: 1, since: NOW - 7 * 3600_000, seen: 9 } };
    const r = decidePhaseAlert(down, w(1), NOW);
    expect(r.message).toBeUndefined();
    expect(r.state.phase).toBe(1);
    const up: PhaseNotifyState = { phase: 2, at: NOW, sent: { [day]: PHASE_ALERTS_PER_DAY }, pending: { phase: 3, since: NOW - 5 * MIN, seen: 1 } };
    const r2 = decidePhaseAlert(up, w(3), NOW);
    expect(r2.message?.direction).toBe("up");
    expect(r2.state.phase).toBe(3);
  });
  it("같은 긴장 단계 안에서: 배경만으로 긴장이다가 실제 징조·움직임이 나타나면 두 번 확인 뒤 한 번 알린다 (12시간 안에는 되풀이하지 않는다)", () => {
    const prox = (signs: number, moves: number) => ({ index: 20, vs: { days: 0 }, rubric: { signs, moves, context: 6, surprise: moves >= 3 && signs < 3 } }) as any;
    const calm = { ...w(2), proximity: prox(0, 0) }, signs = { ...w(2), proximity: prox(3, 0) }, moves = { ...w(2), proximity: prox(0, 3) };
    expect(realSigns(calm)).toBe(false);
    let st: PhaseNotifyState = { phase: 2, at: NOW };
    let r = decidePhaseAlert(st, signs, NOW);
    expect(r.message).toBeUndefined(); // 첫 번째는 확인만
    r = decidePhaseAlert(r.state, signs, NOW + 5 * MIN);
    expect(r.message?.title).toMatch(/2단계 긴장 20% · 실제 징조가 나타남/);
    expect(r.message?.body).toMatch(/9개 중 3개/);
    st = r.state;
    expect(decidePhaseAlert(st, signs, NOW + 10 * MIN).message).toBeUndefined(); // 이미 알렸다
    // 잠깐 꺼졌다 다시 켜지면(6시간 안) 같은 상황이 이어지는 것 — 다시 알리지도, '가라앉았다'고 하지도 않는다
    st = decidePhaseAlert(st, calm, NOW + 15 * MIN).state;
    expect(st.sub).toBe(true);
    const back = decidePhaseAlert(st, moves, NOW + 60 * MIN);
    expect(back.message).toBeUndefined();
    expect(back.state.subOff).toBeUndefined();
    // 마무리 (11/17): 징조가 사라져 6시간 이어지면 '가라앉았어요'를 조용한 알림으로 한 번
    st = decidePhaseAlert(back.state, calm, NOW + 2 * H).state;
    expect(decidePhaseAlert(st, calm, NOW + 7 * H).message).toBeUndefined(); // 5시간째
    const clear = decidePhaseAlert(st, calm, NOW + 8 * H + MIN);
    expect(clear.message).toMatchObject({ title: "2단계 긴장 20% · 실제 징조가 가라앉았어요", priority: 2, direction: "down", note: true });
    expect(clear.state.sub).toBe(false);
    expect(decidePhaseAlert(clear.state, calm, NOW + 9 * H).message).toBeUndefined(); // 한 번만
    // 가라앉은 뒤 다시 나타나면(처음 알린 지 12시간 뒤) 새로 알린다
    const again = decidePhaseAlert(decidePhaseAlert(clear.state, moves, NOW + 13 * H).state, moves, NOW + 13 * H + 5 * MIN);
    expect(again.message?.body).toMatch(/기습 주의/);
  });
  it("마무리 알림은 하루 한도와 상관없이 간다 — 안심시키는 소식이 막히면 안 된다", () => {
    const prox = (signs: number) => ({ index: 20, vs: { days: 0 }, rubric: { signs, moves: 0, context: 6, surprise: false } }) as any;
    const day = new Date(NOW + 8 * H + 9 * H).toISOString().slice(0, 10);
    const st: PhaseNotifyState = { phase: 2, at: NOW, sub: true, subOff: NOW, sent: { [day]: PHASE_ALERTS_PER_DAY } };
    expect(decidePhaseAlert(st, { ...w(2), proximity: prox(0) }, NOW + 8 * H).message?.title).toMatch(/가라앉았어요/);
  });
  it("주간 요약은 꺼져 있다 (11/12). 켜면: 월요일 오전 9시(한국 시간) 이후 한 번, 같은 주에는 다시 보내지 않는다", () => {
    expect(DIGEST_ON).toBe(false);
    expect(digestDue({ phase: 2, at: NOW }, Date.parse("2026-11-16T00:05:00Z"))).toBeUndefined();
    const mon9 = Date.parse("2026-11-16T00:05:00Z"); // 월요일 09:05 KST
    expect(digestDue({ phase: 2, at: NOW }, mon9, true)).toBe("2026-11-16");
    expect(digestDue({ phase: 2, at: NOW, digest: "2026-11-16" }, mon9 + 3600_000, true)).toBeUndefined();
    expect(digestDue({ phase: 2, at: NOW }, mon9 - 3600_000, true)).toBeUndefined(); // 월요일 8시
    expect(digestDue({ phase: 2, at: NOW }, mon9 + 86400_000, true)).toBeUndefined(); // 화요일
    const m = digestMessage({ ...w(2), proximity: { index: 15, vs: { d7: 0, days: 8 }, rubric: { signs: 0, moves: 0, context: 6 } } as any });
    expect(m.title).toBe("주간 요약 · 2단계 긴장 15%");
    expect(m.body).toMatch(/지난주와 같아요/);
  });
});

describe("5분 주기에서 보내기", () => {
  const ok = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
  const bad = (async () => new Response("no", { status: 400 })) as unknown as typeof fetch; // 400 은 채널이 다시 시도하지 않아 빨리 끝난다
  const env = { BARK_KEY: "k" } as any;

  it("올라간 단계가 확인되면 한 번 보내고 알림 기록에 남긴다", async () => {
    const store = new MemoryStore();
    await notifyPhaseChange(store, env, w(2), NOW, ok);
    await notifyPhaseChange(store, env, w(3), NOW + 5 * MIN, ok);
    const r = await notifyPhaseChange(store, env, w(3), NOW + 10 * MIN, ok);
    expect(r.ok).toBe(true);
    expect(r.sent?.direction).toBe("up");
    expect((await store.getAlerts(0)).map((a) => a.title)).toEqual(["3단계 위기 (약 15%) 나빠짐 · 2단계 긴장에서"]);
    // 같은 단계가 이어지면 더 보내지 않는다
    expect((await notifyPhaseChange(store, env, w(3), NOW + 15 * MIN, ok)).sent).toBeUndefined();
  });

  it("판정 규칙이 바뀐 직후에는 단계가 달라져도 알리지 않고 새 단계를 기억만 한다 (11/12 규칙 3.0)", async () => {
    const store = new MemoryStore();
    let sent = 0;
    const count = (async () => { sent++; return new Response("ok"); }) as unknown as typeof fetch;
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 2, at: NOW, pending: { phase: 1, since: NOW, seen: 5 } })); // 이전 규칙이 남긴 기억 (rule 없음)
    const r = await notifyPhaseChange(store, env, w(1), NOW + 5 * MIN, count);
    expect(r.sent).toBeUndefined();
    expect(sent).toBe(0);
    expect(JSON.parse((await store.getKv(PHASE_STATE_KEY))!)).toMatchObject({ phase: 1, rule: RUBRIC_VERSION });
  });
  it("주간 요약은 꺼져 있어서 월요일 오전 9시가 지나도 손님에게 아무것도 가지 않는다 (11/12)", async () => {
    const mon9 = Date.parse("2026-11-16T00:05:00Z");
    const store = new MemoryStore();
    let sent = 0;
    const count = (async () => { sent++; return new Response("ok"); }) as unknown as typeof fetch;
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 2, at: NOW, rule: RUBRIC_VERSION }));
    const r = await notifyPhaseChange(store, env, w(2), mon9, count);
    expect(r.sent).toBeUndefined();
    expect(sent).toBe(0);
  });
  it("못 보냈으면 다음 주기에 다시 (세 번 실패하면 넘어간다)", async () => {
    const store = new MemoryStore();
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 2, at: NOW, rule: RUBRIC_VERSION, pending: { phase: 3, since: NOW, seen: 1 } }));
    const f1 = await notifyPhaseChange(store, env, w(3), NOW + 5 * MIN, bad);
    expect(f1.ok).toBe(false);
    expect(f1.state.phase).toBe(2);
    await notifyPhaseChange(store, env, w(3), NOW + 10 * MIN, bad);
    const f3 = await notifyPhaseChange(store, env, w(3), NOW + 15 * MIN, bad);
    expect(f3.state.phase).toBe(3);
  });
});

describe("심층 분석 보고서는 결론이 바뀌었을 때만 알린다", () => {
  it("실제 10/31~11/3 보고서: 2단계·4~5% 로 같은 결론 → 알리지 않는다", () => {
    const reports = [{ war_phase: 2, p_clash_30d: 4 }, { war_phase: 2, p_clash_30d: 5 }, { war_phase: 2, p_clash_30d: 5 }, { war_phase: 2, p_clash_30d: 5 }, { war_phase: 2, p_clash_30d: 4.5 }];
    for (let i = 1; i < reports.length; i++) expect(deepPushDecision(reports[i], reports[i - 1], 2).push).toBe(false);
  });
  it("자동 판정과 다른 단계로 보거나, 단계·확률이 크게 바뀌면 알린다", () => {
    expect(deepPushDecision({ war_phase: 3, p_clash_30d: 12 }, { war_phase: 2, p_clash_30d: 5 }, 2).push).toBe(true);
    expect(deepPushDecision({ war_phase: 3, p_clash_30d: 12 }, { war_phase: 3, p_clash_30d: 12 }, 2).why).toMatch(/자동 판정\(2단계\)과 다른 3단계/);
    expect(deepPushDecision({ war_phase: 2, p_clash_30d: 2 }, { war_phase: 2, p_clash_30d: 4 }, 2).push).toBe(true);
    expect(deepPushDecision({ war_phase: 2, p_clash_30d: 4 }, undefined, 2).push).toBe(false);
  });
});

describe("알림 제목은 중요한 것부터 (2026-11-03)", () => {
  it("사건 알림: 위험도 · 무슨 일 · [확인 상태]", async () => {
    const { formatAlert } = await import("../src/core/policy.js");
    const e: any = { id: "e1", status: "UNVERIFIED", basis: "official_quote", severity: 75, title: '[속보] 日방위성 "北, 탄도미사일 가능성 물체 발사"', sources: ["yna.co.kr"], categories: ["missile"] };
    const brief: any = { headline: "북한, 탄도미사일 약 10 발 발사 → 동해", isProvocation: true, danger: { level: 3, label: "경계", reason: "탄도미사일 발사" }, at: 0 };
    expect(formatAlert({ event: e, kind: "new", reason: "" }, undefined, brief).title).toBe("경계 · 북한, 탄도미사일 약 10 발 발사 → 동해 [속보·공식발표 인용]");
    expect(formatAlert({ event: e, kind: "correction", reason: "" }, undefined, brief).title).toMatch(/^\[정정\] /);
  });
});

describe("알림 본문은 셋 다 같은 모양: 상황(어제 대비) · 무슨 일 · 대시보드 주소 (2026-11-04)", () => {
  it("사건 알림 — 11/4 발사 속보처럼", async () => {
    const { formatAlert } = await import("../src/core/policy.js");
    const e: any = { id: "e1", status: "UNVERIFIED", basis: "official_quote", severity: 75, title: '[속보] 합참 "북한, 동해상으로 미상 발사체 발사"', sources: ["yna.co.kr"], categories: ["missile"] };
    const brief: any = { headline: "북한, 미상 발사체 발사 → 동해상", isProvocation: true, danger: { level: 2, label: "주의", reason: "미사일·방사포 발사" }, at: 0 };
    const m = formatAlert({ event: e, kind: "new", reason: "" }, "https://kew.example", brief, { label: "긴장", clash: 3.8, clashAgo: 3.6, agoLabel: "어제 이맘때", phase: 2, phaseAgo: 2 });
    expect(m.body.split("\n")[0]).toBe("⬆ 나빠짐: 30일 국지 충돌 3.6%(어제 이맘때) → 3.8%(지금)");
    expect(m.body.split("\n")[1]).toBe("북한, 미상 발사체 발사 → 동해상");
    expect(m.body.split("\n")[2]).toBe("지금 한반도 상황 : 주의 (나빠짐 : 30일 국지 충돌 3.6% → 3.8%)");
    expect(m.body.split("\n").at(-1)).toBe("대시보드 : https://kew.example");
    // 판정 기록이 없어도 주소는 들어간다
    expect(formatAlert({ event: e, kind: "new", reason: "" }, "https://kew.example", brief).body).toMatch(/\n대시보드 : https:\/\/kew\.example$/);
  });
  it("나빠짐·좋아짐·비슷 판정", async () => {
    const { trendOf, situationLine } = await import("../src/core/pushtext.js");
    expect(trendOf({ label: "", clash: 3.8, clashAgo: 3.6 })).toBe("나빠짐");
    expect(trendOf({ label: "", clash: 3.6, clashAgo: 3.8 })).toBe("좋아짐");
    expect(trendOf({ label: "", clash: 3.62, clashAgo: 3.6 })).toBe("비슷");
    expect(trendOf({ label: "", clash: 15, clashAgo: 3.8, phase: 3, phaseAgo: 2 })).toBe("나빠짐");
    expect(situationLine({ label: "긴장", clash: 3.6 })).toBe("지금 한반도 상황 : 긴장 (비슷 : 30일 국지 충돌 약 4%)");
  });
  it("5분 주기 단계 알림 본문에도 대시보드 주소가 들어간다", async () => {
    const store = new MemoryStore();
    const env2 = { BARK_KEY: "k", DASHBOARD_URL: "https://kew.example" } as any;
    const calls: any[] = [];
    const f = (async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    await notifyPhaseChange(store, env2, w(2), NOW, f);
    await notifyPhaseChange(store, env2, w(3), NOW + 5 * MIN, f);
    await notifyPhaseChange(store, env2, w(3), NOW + 10 * MIN, f);
    expect(calls).toHaveLength(1);
    // 11/5: 고객은 알림이 올 때만 리포트를 본다 — 본문 마지막 줄과 누르면 열리는 주소가 둘 다 그 리포트
    expect(calls[0].body).toMatch(/\n리포트 : https:\/\/kew\.example\/me\?r=r_[0-9a-z]+_[0-9a-f]{8}$/);
    expect(calls[0].url).toBe(calls[0].body.split("리포트 : ")[1]);
  });
});


describe("테스트와 실제는 첫 글자부터 다르고, 실제 첫 줄은 '바뀐 것'이다 (2026-11-04 #36)", () => {
  it("바뀐 것 한 줄: 단계 > 확률 > 변화 없음", async () => {
    const { changeLine } = await import("../src/core/pushtext.js");
    expect(changeLine({ label: "위기", clash: 15, clashAgo: 3.8, agoLabel: "어제 이맘때", phase: 3, phaseAgo: 2 })).toBe("⬆ 나빠짐: 2단계 긴장 → 3단계 위기 · 30일 국지 충돌 3.8%(어제 이맘때) → 15%(지금)");
    expect(changeLine({ label: "긴장", clash: 3.8, clashAgo: 15, agoLabel: "어제 이맘때", phase: 2, phaseAgo: 3 })).toBe("⬇ 좋아짐: 3단계 위기 → 2단계 긴장 · 30일 국지 충돌 15%(어제 이맘때) → 3.8%(지금)");
    expect(changeLine({ label: "주의", clash: 3.8, clashAgo: 3.6, agoLabel: "어제 이맘때", phase: 2, phaseAgo: 2 })).toBe("⬆ 나빠짐: 30일 국지 충돌 3.6%(어제 이맘때) → 3.8%(지금)");
    // 변화가 없어도 '몇 %에서 몇 %'를 적는다 — "전에도 4%였나?" 가 안 헷갈리게 (2026-11-04 저녁)
    expect(changeLine({ label: "긴장", clash: 3.6, clashAgo: 3.62, agoLabel: "11/3 14시 (30시간 전)", phase: 2, phaseAgo: 2 })).toBe("● 변화 없음: 30일 국지 충돌 3.6%(11/3 14시 (30시간 전)) → 3.6%(지금) · 긴장");
    expect(changeLine({ label: "긴장", clash: 3.6, phase: 2 })).toBe("● 긴장 · 30일 국지 충돌 약 4% — 비교할 이전 기록 없음");
  });
  it("실제 알림의 첫 줄은 상황이 아니라 변화다 — 세 경로 모두 같은 함수", async () => {
    const { pushBody } = await import("../src/core/pushtext.js");
    const b = pushBody({ label: "주의", clash: 3.8, clashAgo: 3.6, phase: 2, phaseAgo: 2 }, "북한, 미상 발사체 발사", "https://kew.example");
    expect(b.split("\n")[0]).toMatch(/^[⬆⬇●] /);
    expect(b.split("\n")[0]).not.toMatch(/^지금 한반도 상황/);
    expect(b).toMatch(/\n지금 한반도 상황 : /);
  });
  it("테스트 알림은 첫 글자부터 테스트이고 실제 알림 틀을 쓰지 않는다 (코드 검사)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf('"/api/test-push"'), src.indexOf('"/api/test-push"') + 1200);
    expect(block).toMatch(/title: "🧪 테스트 — 실제 상황 아님"/);
    expect(block).toMatch(/🧪 테스트 알림 — 실제 상황 아님/);
    expect(block).toMatch(/tag: "kew-test"/);
    // 테스트 본문은 pushBody(실제 틀)로 만들지 않는다
    const sendLine = block.slice(block.indexOf("sendPush(env, { title: \"🧪"));
    expect(sendLine).not.toMatch(/pushBody\(/);
    // 실제 알림 제목은 '테스트'로 시작하지 않는다 (테스트와 첫 글자부터 구분)
    expect("주의 · 북한, 미상 발사체 발사 → 동해상 [속보·공식발표 인용]").not.toMatch(/^🧪/);
  });
});

describe("알림의 '이전 값'은 언제 것인지 함께 적는다 (2026-11-04 저녁)", () => {
  it("어제 이맘때 기록이 있으면 '어제 이맘때', 없으면 가장 가까운 과거 기록의 시각", async () => {
    const { situationFromRecords } = await import("../src/core/pushtext.js");
    const { appendSeries } = await import("../src/core/history.js");
    const store = new MemoryStore();
    const snap = (at: number, clash: number) => ({ at, phase: 2 as const, clash, war: 0.2, levels: {}, why: [] });
    await appendSeries(store, snap(NOW - 24 * H, 3.6));
    await appendSeries(store, snap(NOW, 3.8));
    const s = await situationFromRecords(store, NOW, "긴장");
    expect(s).toMatchObject({ clash: 3.8, clashAgo: 3.6, agoLabel: "어제 이맘때", agoAt: NOW - 24 * H });
    // 어제 이맘때 점이 없고 30시간 전 점만 있으면 그 시각을 이름으로
    const store2 = new MemoryStore();
    await appendSeries(store2, snap(NOW - 30 * H, 3.4));
    await appendSeries(store2, snap(NOW, 3.4));
    const s2 = await situationFromRecords(store2, NOW, "긴장");
    expect(s2).toMatchObject({ clashAgo: 3.4, agoLabel: "11/2 6시 (30시간 전)" });
    const { changeLine } = await import("../src/core/pushtext.js");
    expect(changeLine(s2!)).toBe("● 변화 없음: 30일 국지 충돌 3.4%(11/2 6시 (30시간 전)) → 3.4%(지금) · 긴장");
  });
});

describe("손님 알림 ③ 큰 사건 · ④ 눈에 띄는 상승과 마무리 (11/17)", () => {
  const lay = (ids: string[]) => [{ id: "signs", groups: [{ items: ids.filter((i) => i.startsWith("i_")).map((id) => ({ id, ko: id + " 항목 (설명)", got: 1 })) }] }, { id: "moves", groups: [{ items: ids.filter((i) => !i.startsWith("i_")).map((id) => ({ id, ko: id, got: 1 })) }] }];
  const px = (index: number, ids: string[] = []) => ({ index, vs: { days: 0 }, rubric: { index, signs: 0, moves: 0, context: 6, surprise: false, layers: lay(ids) } }) as any;
  it("④ 아침보다 5%p 넘게 오르고 징조·움직임이 새로 켜져 30분 이어지면 한 번 — 배경만 늘었거나 잡음 항목만이면 아니다", async () => {
    const { decideRise } = await import("../src/core/phasealert.js");
    const base: PhaseNotifyState = { phase: 2, at: NOW };
    const up = { ...w(2), proximity: px(23, ["i_leader_threat"]) };
    expect(decideRise(base, { ...w(2), proximity: px(23) }, px(17), NOW).state.riseSeen).toBeUndefined(); // 배경만
    expect(decideRise(base, { ...w(2), proximity: px(23, ["a_nk_dark"]) }, px(17), NOW).state.riseSeen).toBeUndefined(); // 잡음 항목만
    let r = decideRise(base, up, px(17), NOW);
    expect(r.message).toBeUndefined();
    r = decideRise(r.state, up, px(17), NOW + 20 * MIN);
    expect(r.message).toBeUndefined(); // 아직 30분이 안 됨
    r = decideRise(r.state, up, px(17), NOW + 31 * MIN);
    expect(r.message?.title).toBe("2단계 긴장 23% · 오늘 아침 17%에서 올랐어요");
    expect(r.message?.body).toMatch(/'i_leader_threat 항목' 항목이 새로 켜졌어요\. 단계는 그대로 2단계예요\.[\s\S]*가라앉으면 다시 알려 드려요/);
    expect(r.state.rise).toEqual({ base: 17, at: NOW + 31 * MIN });
    // 다음 날 아침 판정이 23%가 돼도(기준이 바뀌어도) 다시 알리지 않고, 기억해 둔 기준으로 가라앉음을 본다
    expect(decideRise(r.state, up, px(23, ["i_leader_threat"]), NOW + 20 * H).message).toBeUndefined();
    let c = decideRise(r.state, { ...w(2), proximity: px(18) }, px(23), NOW + 21 * H);
    expect(c.message).toBeUndefined();
    c = decideRise(c.state, { ...w(2), proximity: px(18) }, px(23), NOW + 27 * H + MIN);
    expect(c.message).toMatchObject({ title: "2단계 긴장 18% · 평소 수준으로 돌아왔어요", priority: 2, note: true });
    expect(c.state.rise).toBeUndefined();
  });
  it("④ 방금 다른 알림이 갔으면 겹쳐 보내지 않고(마무리만 따로 가는 일도 없다), 일주일 지나도 안 내려오면 기억을 지운다", async () => {
    const { decideRise, RISE_FORGET_MS } = await import("../src/core/phasealert.js");
    const up = { ...w(2), proximity: px(23, ["i_leader_threat"]) };
    const r = decideRise({ phase: 2, at: NOW, riseSeen: NOW - H, lastSentAt: NOW - H }, up, px(17), NOW);
    expect(r.message).toBeUndefined();
    expect(r.state.rise).toBeUndefined();
    expect(decideRise({ phase: 2, at: NOW, rise: { base: 17, at: NOW } }, up, px(23), NOW + RISE_FORGET_MS + 1).state.rise).toBeUndefined();
  });
  it("③ 운영자 사건 알림이 나간 북한 발사는 손님에게도 — '단계는 그대로'와 함께, 하루 한 번. 훈련·미확인 보도·알림이 안 나간 사건은 아니다", async () => {
    const { decideEvent } = await import("../src/core/phasealert.js");
    const ev = (id: string, o: Record<string, unknown> = {}) => ({ id, categories: ["missile_launch"], status: "CONFIRMED", basis: "official", severity: 80, firstDetectedTime: NOW, lastUpdatedTime: NOW, signalIds: ["s"], title: "북한, 동해상으로 탄도미사일 발사", evidence: [{ id: "s", source: "jcs", sourceKind: "official", category: "missile_launch", title: "합참 \"북한, 동해상으로 탄도미사일 발사\"", detectedTime: NOW, severity: 80 }], ...o }) as any;
    const rep = (events: any[], sent = true) => ({ events, alerts: events.map((e) => ({ eventId: e.id, kind: "new", sent })) });
    const base: PhaseNotifyState = { phase: 2, at: NOW };
    const cur = { ...w(2), proximity: px(17) };
    const d = decideEvent(base, cur, rep([ev("e1")]), NOW);
    expect(d.message?.title).toMatch(/발사.* · 단계는 그대로 2단계$/);
    expect(d.message?.body).toMatch(/전쟁 위험 단계는 그대로 2단계 긴장예요|전쟁 위험 단계는 그대로 2단계/);
    expect(d.message).toMatchObject({ priority: 3, note: true });
    expect(decideEvent(d.state, cur, rep([ev("e2")]), NOW + H).message).toBeUndefined(); // 하루 한 번
    expect(decideEvent(d.state, cur, rep([ev("e2")]), NOW + 24 * H).message).toBeDefined(); // 다음 날
    expect(decideEvent(base, cur, rep([ev("e1")], false), NOW).message).toBeUndefined(); // 운영자 알림이 안 나간 사건
    expect(decideEvent(base, cur, rep([ev("e1", { drill: true })]), NOW).message).toBeUndefined(); // 훈련
    expect(decideEvent(base, cur, rep([ev("e1", { status: "UNVERIFIED", basis: "media" })]), NOW).message).toBeUndefined(); // 미확인 보도
    // 단계가 막 오르는 중이면 '그대로'라고 하지 않는다
    expect(decideEvent({ ...base, pending: { phase: 3, since: NOW, seen: 1 } }, cur, rep([ev("e1")]), NOW).message?.title).toMatch(/단계 확인 중$/);
  });
  it("코드: 손님에게 가는 길은 여전히 phasealert.ts 뿐이고, 5분 주기가 사건 알림을 부른다. 단계가 바뀌어도 상승·사건 기억을 잃지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8")).toMatch(/notifyCustomerEvent\(store, env, st\.warRisk\.live, report, report\.at/);
    let st: PhaseNotifyState = { phase: 2, at: NOW, rise: { base: 17, at: NOW }, evDay: "2026-11-03", evIds: ["e1"] };
    st = decidePhaseAlert(st, w(3), NOW).state;
    st = decidePhaseAlert(st, w(3), NOW + 5 * MIN).state;
    expect(st).toMatchObject({ phase: 3, rise: { base: 17 }, evDay: "2026-11-03", evIds: ["e1"] });
  });
});

describe("③ 큰 사건 알림이 실제로 나가는 길 (11/17)", () => {
  it("리포트를 알림 제목 그대로 한 장 남기고, 같은 사건은 다시 보내지 않는다. 방금 단계 알림이 갔으면 건너뛴다", async () => {
    const { notifyCustomerEvent } = await import("../src/core/phasealert.js");
    const { loadReports } = await import("../src/core/reports.js");
    const store = new MemoryStore();
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 2, at: NOW, rule: RUBRIC_VERSION }));
    const e = { id: "e1", categories: ["missile_launch"], status: "CONFIRMED", basis: "official", severity: 80, firstDetectedTime: NOW, lastUpdatedTime: NOW, signalIds: ["s"], title: "북한, 동해상으로 탄도미사일 발사", evidence: [{ id: "s", source: "jcs", sourceKind: "official", category: "missile_launch", title: "합참 \"북한, 동해상으로 탄도미사일 발사\"", detectedTime: NOW, severity: 80 }] } as any;
    const rep = { events: [e], alerts: [{ eventId: "e1", kind: "new", sent: true }] };
    const full = { warRisk: { phase: 2 } };
    const cur = { ...w(2), domains: [], restraints: [], war30d: { low: 0, high: 0, point: 0.5 } } as unknown as WarRisk;
    const r1 = await notifyCustomerEvent(store, { DASHBOARD_URL: "https://kew.example" } as any, cur, rep, NOW, (async () => new Response("")) as any, full);
    expect(r1.sent?.title).toMatch(/단계는 그대로 2단계$/);
    const reports = await loadReports(store);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ kind: "change", headline: r1.sent!.title, phase: 2, from: 2 });
    const st = JSON.parse((await store.getKv(PHASE_STATE_KEY))!);
    expect(st).toMatchObject({ evIds: ["e1"], rule: RUBRIC_VERSION, phase: 2 });
    expect((await notifyCustomerEvent(store, { DASHBOARD_URL: "https://kew.example" } as any, cur, rep, NOW + 5 * MIN, (async () => new Response("")) as any, full)).sent).toBeUndefined();
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 3, at: NOW, rule: RUBRIC_VERSION, lastSentAt: NOW + 24 * H - MIN }));
    expect((await notifyCustomerEvent(store, {} as any, cur, { events: [{ ...e, id: "e2" }], alerts: [{ eventId: "e2", kind: "new", sent: true }] }, NOW + 24 * H, (async () => new Response("")) as any)).sent).toBeUndefined();
  });
});

describe("빠르게 연달아 켜지면 알린다 (11/18)", () => {
  it("지금 켜진 수가 3개에 못 미쳐도, 2주 사이 꺼져 있던 신호 3개가 새로 켜졌으면 '실제 징조가 나타남' 알림", () => {
    const prox = (fresh: number) => ({ index: 21, vs: { days: 9 }, rubric: { signs: 1.5, moves: 1.5, context: 6, surprise: false }, fresh: { days: 14, n: fresh, known: 9, items: [{ id: "a", ko: "협상 결렬", since: "2026-11-01" }, { id: "b", ko: "혈액 전방 이동", since: "2026-11-02" }, { id: "c", ko: "항공사 운항 중단", since: "2026-11-03" }].slice(0, fresh) } }) as any;
    expect(realSigns({ ...w(2), proximity: prox(2) })).toBe(false);
    expect(realSigns({ ...w(2), proximity: prox(3) })).toBe(true);
    let r = decidePhaseAlert({ phase: 2, at: NOW }, { ...w(2), proximity: prox(3) }, NOW);
    r = decidePhaseAlert(r.state, { ...w(2), proximity: prox(3) }, NOW + 5 * MIN);
    expect(r.message?.title).toMatch(/실제 징조가 나타남/);
    expect(r.message?.body).toMatch(/최근 2주 사이 꺼져 있던 신호 3개가 새로 켜졌어요: 협상 결렬, 혈액 전방 이동, 항공사 운항 중단\./);
  });
});
