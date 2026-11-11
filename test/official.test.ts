// 오늘의 판정 (2026-11-06): 대시보드를 열 때마다 3.8% ↔ 4.0% 가 오가지 않게 — 숫자는 하루 한 번(오전 8시), 단계가 바뀌면 바로
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/store.js";
import { OFFICIAL_KEY, OFFICIAL_PREV_KEY, applyOfficial, makeOfficial, officialDue, updateOfficial } from "../src/core/official.js";

const H = 3600_000;
const D8 = Date.UTC(2026, 10, 5, 23, 0); // 11/6 08:00 KST
const dom = (money: number) => [
  { id: "money", label: "돈의 움직임", level: money, levelLabel: ["평소", "주의", "경계", "심각"][money] },
  { id: "military", label: "군사 동향", level: 1, levelLabel: "주의" },
];
const w = (phase: number, point: number, money = 0) =>
  ({ phase, phaseLabel: ["", "평온", "긴장", "위기", "임박", "교전"][phase], phaseReasons: [`${phase}단계 이유`], clash30d: { low: 2, high: 4, point }, war30d: { low: 0.08, high: 0.2, point: 0.18 }, gauge: { now: 0.3, usual: 0.08 }, vsUsual: point / 1.8, domains: dom(money), headline: "x" }) as any;

describe("공식 판정은 언제 새로 정하나", () => {
  it("처음 · 새 날 오전 8시 이후 · 확인된 단계가 바뀌었을 때만", () => {
    expect(officialDue(undefined, w(2, 3.8), 2, D8)).toBe("first");
    const cur = makeOfficial(w(2, 3.8), D8, "daily");
    expect(officialDue(cur, w(2, 4.0, 1), 2, D8 + 3 * H)).toBeUndefined(); // 같은 날 안의 3.8 ↔ 4.0 은 무시
    expect(officialDue(cur, w(2, 4.0), 2, D8 + 23 * H)).toBeUndefined(); // 다음 날 07:00 — 아직
    expect(officialDue(cur, w(2, 4.0), 2, D8 + 24 * H)).toBe("daily"); // 다음 날 08:00
    expect(officialDue(cur, w(3, 15), 2, D8 + 1 * H)).toBeUndefined(); // 단계가 바뀐 것 같아도 확인 전이면 그대로
    expect(officialDue(cur, w(3, 15), 3, D8 + 1 * H)).toBe("phase"); // 알림과 같은 규칙으로 확인되면 바로
  });
});

describe("사람에게 보이는 숫자", () => {
  it("5분마다 계산이 3.8 ↔ 4.0 을 오가도 보이는 숫자는 오늘의 판정 그대로, 계산값은 live 에 남는다", () => {
    const off = makeOfficial(w(2, 3.8), D8, "daily");
    const a = applyOfficial(w(2, 4.0, 1), off, undefined), b = applyOfficial(w(2, 3.8), off, undefined);
    expect(a.clash30d.point).toBe(3.8);
    expect(b.clash30d.point).toBe(3.8);
    expect(a.live.clash30d.point).toBe(4.0); // 단계 알림·심층 분석은 live 로 판단
    expect(a.official!.note).toMatch(/하루 한 번\(오전 8시\)/);
    expect(a.official!.basis).toMatch(/판단값/);
  });

  it("어제 판정과 비교: 같은 단계 안의 움직임은 '의미 있는 변화가 아님', 바뀐 영역을 적는다 · 단계가 바뀌면 '의미 있는 변화'", () => {
    const prev = makeOfficial(w(2, 3.8, 0), D8 - 24 * H, "daily");
    const same = applyOfficial(w(2, 4.0, 1), makeOfficial(w(2, 4.0, 1), D8, "daily"), prev).official!.change!;
    expect(same.meaningful).toBe(false);
    expect(same.text).toMatch(/같은 2단계/);
    expect(same.text).toMatch(/돈의 움직임 평소→주의/);
    expect(same.text).toMatch(/위험이 달라졌다고 보지 않아요/);
    const up = applyOfficial(w(3, 15), makeOfficial(w(3, 15), D8, "phase"), prev).official!.change!;
    expect(up.meaningful).toBe(true);
    expect(up.text).toMatch(/2단계 긴장 → 3단계 위기: 의미 있는 변화/);
  });

  it("5분 주기: 저장하고 직전 것을 '어제'로 남긴다", async () => {
    const s = new MemoryStore();
    expect(await updateOfficial(s, w(2, 3.8), D8)).toBe("first");
    expect(await updateOfficial(s, w(2, 4.0, 1), D8 + H)).toBeUndefined();
    expect(JSON.parse((await s.getKv(OFFICIAL_KEY))!).clash30d.point).toBe(3.8);
    expect(await updateOfficial(s, w(2, 4.0, 1), D8 + 24 * H)).toBe("daily");
    expect(JSON.parse((await s.getKv(OFFICIAL_PREV_KEY))!).clash30d.point).toBe(3.8);
    expect(JSON.parse((await s.getKv(OFFICIAL_KEY))!).clash30d.point).toBe(4.0);
  });

  it("코드: 단계 알림·심층 분석은 live, 화면·리포트는 공식 판정", async () => {
    const { readFileSync } = await import("node:fs");
    const idx = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    expect(idx).toMatch(/notifyPhaseChange\(store, env, st\.warRisk\.live,/);
    expect(idx).toMatch(/maybeFireDeep\(store, env, \{ warRisk: st\.warRisk\.live,/);
    expect(idx).toMatch(/updateOfficial\(store, st\.warRisk\.live, report\.at\)/);
  });
});

describe("운영자 대시보드의 개수·% 는 실시간, 오늘 아침 값은 견줄 기준 (11/12)", () => {
  const prox = (index: number, moves: number) => ({ index, rubric: { signs: 0, moves, context: 6, phase: 2, layers: [], reason: "", surprise: false, watched: 0, waiting: 0, index }, series: [{ d: "x", i: index, c: 3 }], anchors: [{ name: "a" }], record: [{ lo: 0 }], vs: { days: 1 } }) as any;
  it("화면은 지금 계산을 보이고, 오전 8시에 정한 값은 official.morning 으로 붙는다", () => {
    const off = makeOfficial({ ...w(2, 3), proximity: prox(15, 0) }, D8, "daily");
    expect(off.proximity!.series).toEqual([]); // 저장은 가볍게
    const shown = applyOfficial({ ...w(2, 3), proximity: prox(17, 0.5) }, off, undefined);
    expect(shown.proximity!.index).toBe(17);
    expect(shown.official!.morning).toEqual({ index: 15, signs: 0, moves: 0, context: 6 });
  });
  it("이전 규칙으로 정한 판정(전조 기록 없음)이면 아침 기준이 없다", () => {
    expect(applyOfficial({ ...w(2, 3), proximity: prox(17, 0.5) }, makeOfficial(w(2, 3.8), D8, "daily"), undefined).official!.morning).toBeUndefined();
  });
});

describe("readiness 내부 계산은 유지 (화면 노출만 제거, 11/6)", () => {
  it("makeReadiness 는 내부 보정 재료로 여전히 동작", async () => {
    const { makeReadiness } = await import("../src/core/official.js");
    expect(makeReadiness(0.36, 2).score).toBeGreaterThan(0);
    expect(makeReadiness(1, 5).text).toMatch(/교전/);
  });
  it("OfficialView 에 readiness 가 노출되지 않는다", () => {
    const off = makeOfficial({ ...w(2, 3.8), gauge: { now: 0.36, usual: 0.08 } }, D8, "daily");
    const view = applyOfficial({ ...w(2, 4), gauge: { now: 0.39, usual: 0.08 } }, off, undefined);
    expect(view.official).toBeDefined();
    expect((view.official as any).readiness).toBeUndefined();
  });
  it("Official 저장 객체에는 readiness 가 남는다 (내부 보정용)", () => {
    const off = makeOfficial({ ...w(2, 3.8), gauge: { now: 0.36, usual: 0.08 } }, D8, "daily");
    expect(off.readiness).toBeDefined();
    expect(off.readiness!.score).toBeGreaterThan(0);
  });
});

describe("같은 단계 사례 문장 (11/6 self-verify 3바퀴)", () => {
  it("우크라이나(100점 기준)는 비교 사례로 다시 나오지 않고, 못 잡은 사례에는 표시가 붙는다", async () => {
    const { makeReadiness } = await import("../src/core/official.js");
    const { CASEBOOK } = await import("../src/core/casebook_data.js");
    for (const a of CASEBOOK.anchors.filter((x) => x.id !== "ukraine-2022" && x.phase < 5)) {
      const t = makeReadiness((a.phase - 1 + 0.7) / 5, a.phase as 1 | 2 | 3 | 4).text;
      expect(t).toContain(`${a.name} 전날 ${a.score}점${a.caught ? "" : "(규칙이 미리 못 잡음)"}`);
      expect(t).not.toContain("우크라이나 침공 전날 100");
    }
    expect(makeReadiness(0.75, 4).text).not.toMatch(/단계가 되면/);
  });
});
