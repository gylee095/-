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

describe("전쟁 직전 대비 점수 (11/6 self-verify)", () => {
  it("화면 점수는 정해 둔 오늘의 판정에서 나오고, 5분 계산값이 흔들려도 그대로", async () => {
    const { makeReadiness } = await import("../src/core/official.js");
    const off = makeOfficial({ ...w(2, 3.8), gauge: { now: 0.36, usual: 0.08 } }, D8, "daily");
    const a = applyOfficial({ ...w(2, 4.0, 1), gauge: { now: 0.39, usual: 0.08 } }, off, undefined);
    const b = applyOfficial({ ...w(2, 3.8), gauge: { now: 0.31, usual: 0.08 } }, off, undefined);
    expect(a.official!.readiness.score).toBe(b.official!.readiness.score);
    expect(a.official!.readiness.score).toBe(makeReadiness(0.36, 2).score);
  });
  it("문장의 단계는 실제 판정 단계 (5단계를 4단계로 말하지 않는다)", async () => {
    const { makeReadiness } = await import("../src/core/official.js");
    expect(makeReadiness(1, 5).text).toMatch(/교전/);
    expect(makeReadiness(0.8, 4).text).toMatch(/4단계/);
    expect(makeReadiness(0.36, 2).text).toMatch(/2단계의 범위/);
  });
});
