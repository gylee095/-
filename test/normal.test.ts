// 평소 범위와 이탈 (normal.ts) — 신호마다의 평소 범위를 벗어난 것이 몇 개인가, 얼마나 드문가
import { describe, expect, it } from "vitest";
import { EMPIRICAL_DAYS, LONG_DAYS, assessNormal, foldLong, type NormLong } from "../src/core/normal.js";
import { foldProx, assessProximity } from "../src/core/proximity.js";

const NOW = Date.parse("2026-11-13T03:00:00Z");
const row = (id: string, z: number | undefined, direction: "high" | "low" | "both" = "high", extra: Record<string, unknown> = {}) =>
  ({ id, label: `${id} (설명)`, groupLabel: "묶음", unit: "건", direction, stateLabel: "정상", reading: { value: 10 + (z ?? 0), baseline: 10, sd: 1, z, n: 100, state: z === undefined ? "learning" : "normal", at: NOW }, ...extra }) as any;

describe("평소 범위와 이탈", () => {
  it("나쁜 방향으로 2 표준편차를 넘은 신호만 센다 — 높을수록·낮을수록·양쪽 다 나쁜 신호를 구분한다", () => {
    const n = assessNormal([row("a", 2.5), row("b", -2.5), row("c", -2.5, "low"), row("d", -3, "both"), row("e", 1.9), row("f", 4.2)]);
    expect(n.measured).toBe(6);
    expect(n.items.filter((x) => x.out).map((x) => x.id).sort()).toEqual(["a", "c", "d", "f"]);
    expect(n.k).toBe(4);
    expect(n.items.find((x) => x.id === "f")!.far).toBe(true);
    expect(n.items[0].id).toBe("f"); // 가장 많이 벗어난 것부터
  });
  it("평소를 모르는 신호(학습 중·측정 불가·수집 실패)는 세지 않는다", () => {
    const n = assessNormal([row("a", 3), row("b", undefined), row("c", 3, "high", { stateLabel: "측정 불가" }), row("d", 3, "high", { failing: { source: "x", since: 0 } })]);
    expect(n).toMatchObject({ measured: 1, k: 1, learning: 1 });
  });
  it("드문 정도: 기록이 적으면 이론값, 14일이 쌓이면 실제 기록으로 — 쌓일수록 정확해진다", () => {
    const board = [...Array.from({ length: 38 }, (_, i) => row(`q${i}`, 0)), row("x", 3), row("y", 3), row("z", 3)];
    const early = assessNormal(board, [0, 1, 0]);
    expect(early.rarity.basis).toBe("theory");
    expect(early.rarity.pct).toBeLessThan(15); // 41개 중 3개가 함께 벗어나는 것은 이론상 드물다
    expect(early.usual).toBeCloseTo(0.9, 1);
    const past = [...Array(EMPIRICAL_DAYS - 2).fill(1), 3, 4];
    const later = assessNormal(board, past);
    expect(later.rarity).toMatchObject({ basis: "record", days: EMPIRICAL_DAYS, pct: Math.round((2 / EMPIRICAL_DAYS) * 100) });
    expect(later.usual).toBeCloseTo(past.reduce((a, b) => a + b, 0) / past.length, 1);
    expect(assessNormal([row("a", 0)]).rarity.text).toMatch(/벗어난 신호가 없어요/);
  });
  it("긴 평소: 날이 바뀌면 어제의 하루 평균을 넣는다(날 수·평균·흩어짐만 남긴다). 30일이 쌓이면 긴 평소 대비도 본다", () => {
    let L: NormLong | undefined;
    for (let d = 0; d < LONG_DAYS + 1; d++) for (const v of [8, 12]) L = foldLong(L, [{ ...row("a", 0), reading: { ...row("a", 0).reading, value: v + (d % 2) } }], NOW + d * 86400_000);
    expect(L!.days).toBe(LONG_DAYS);
    expect(L!.long.a[0]).toBe(LONG_DAYS);
    expect(L!.long.a[1]).toBeCloseTo(10.5, 5);
    expect(Object.keys(L!.today.s)).toEqual(["a"]);
    // 최근 4주 기준으로는 범위 안(z 0)이어도 긴 평소 기준으로는 크게 벗어날 수 있다
    const drift = { ...row("a", 0), reading: { ...row("a", 0).reading, value: 14 } };
    expect(assessNormal([drift], [], L).items[0].zLong).toBeGreaterThan(2);
    expect(assessNormal([drift], [], { ...L!, days: LONG_DAYS - 1 }).items[0].zLong).toBeUndefined();
  });
  it("하루 기록에 '그날 가장 많이 벗어났던 수'를 남긴다", () => {
    const p = assessProximity([], [], NOW);
    let h = foldProx(undefined, p, 1, NOW, 2).hist;
    h = foldProx(h, p, 1, NOW + 600_000, 1).hist;
    expect(h.days[0].k).toBe(2);
    h = foldProx(h, p, 1, NOW + 1200_000, 5).hist;
    expect(h.days[0].k).toBe(5);
    expect(foldProx(undefined, p, 1, NOW).hist.days[0].k).toBeUndefined();
  });
});
