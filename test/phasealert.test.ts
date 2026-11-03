// 알림은 전쟁 위험 단계가 실제로 바뀌었을 때만 (2026-11-03)
// 10/31~11/3 휴대폰으로 간 다섯 번은 모두 심층 분석 보고서였고 결론이 같았다('2단계·국지 충돌 4~5%').
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
    expect(r2.message?.title).toBe("[전쟁 위험 올라감] 2단계 긴장 → 3단계 위기");
    expect(r2.message?.body).toMatch(/약 15% \(평소의 8\.3배, 평소 약 2%\)/);
    expect(r2.message?.priority).toBe(4);
    expect(r2.state.phase).toBe(3);
  });

  it("내려감: 6시간 넘게 이어져야 알린다, 그 사이 다시 오르면 없던 일", () => {
    const s0: PhaseNotifyState = { phase: 3, at: NOW };
    let st = decidePhaseAlert(s0, w(2), NOW).state;
    expect(decidePhaseAlert(st, w(2), NOW + DOWN_HOLD_MS - MIN).message).toBeUndefined();
    const down = decidePhaseAlert(st, w(2), NOW + DOWN_HOLD_MS);
    expect(down.message?.title).toBe("[전쟁 위험 내려감] 3단계 위기 → 2단계 긴장");
    expect(down.message?.priority).toBe(2);
    // 4시간 뒤 다시 3단계 → 알림 없이 3단계 그대로
    st = decidePhaseAlert(s0, w(2), NOW).state;
    const again = decidePhaseAlert(st, w(3), NOW + 4 * H);
    expect(again.message).toBeUndefined();
    expect(again.state.phase).toBe(3);
    expect(again.state.pending).toBeUndefined();
  });

  it("하루 한도를 넘으면 단계만 바꿔 기억하고 알리지 않는다", () => {
    const day = "2026-11-03";
    const s0: PhaseNotifyState = { phase: 2, at: NOW, sent: { [day]: PHASE_ALERTS_PER_DAY }, pending: { phase: 3, since: NOW - 5 * MIN, seen: 1 } };
    const r = decidePhaseAlert(s0, w(3), NOW);
    expect(r.message).toBeUndefined();
    expect(r.state.phase).toBe(3);
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
    expect((await store.getAlerts(0)).map((a) => a.title)).toEqual(["[전쟁 위험 올라감] 2단계 긴장 → 3단계 위기"]);
    // 같은 단계가 이어지면 더 보내지 않는다
    expect((await notifyPhaseChange(store, env, w(3), NOW + 15 * MIN, ok)).sent).toBeUndefined();
  });

  it("못 보냈으면 다음 주기에 다시 (세 번 실패하면 넘어간다)", async () => {
    const store = new MemoryStore();
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ phase: 2, at: NOW, pending: { phase: 3, since: NOW, seen: 1 } }));
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
