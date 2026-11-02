// 전쟁 위험 차트 — 시간별 기록과 '어제 이맘때와 비교' (2026-11-02)
import { describe, expect, it } from "vitest";
import { compareWithYesterday, pointNear } from "../src/core/compare.js";
import { appendSeries, loadSeries, pointOf, type RiskSnapshot } from "../src/core/history.js";
import { MemoryStore } from "../src/core/store.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL, evaluate } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 2, 3, 30); // 12:30 KST
const LABELS: Record<string, string> = { gov: "정부의 행동", elite: "엘리트·큰손", money: "돈의 움직임", military: "군사 동향", nkwords: "북한의 말·내부 사정", public: "사람들의 불안" };
const war = (phase: number, clash: number, levels: number[]) =>
  ({ phase, clash30d: { point: clash }, war30d: { point: 0.2 }, domains: Object.keys(LABELS).map((id, i) => ({ id, label: LABELS[id], level: levels[i] })) }) as any;
const snap = (at: number, phase: number, clash: number, levels: number[]): RiskSnapshot => ({ at, phase: phase as any, clash, war: 0.2, levels: Object.fromEntries(Object.keys(LABELS).map((id, i) => [id, levels[i]])) as any, why: [] });

describe("차트 점 (시간별, 30일)", () => {
  it("처음엔 시간별 판정 기록 표에서 채우고, 이후 한 시간에 한 점씩 더한다 (30일 넘은 점은 뺌)", async () => {
    const store = new MemoryStore();
    await store.putRiskHourly(snap(NOW - 40 * 86400_000, 1, 1, [0, 0, 0, 0, 0, 0]));
    await store.putRiskHourly(snap(NOW - 25 * H, 2, 4.5, [0, 0, 0, 1, 1, 2]));
    expect((await loadSeries(store, NOW)).map((p) => p.c)).toEqual([4.5]); // 30일 안만
    const pts = await appendSeries(store, snap(NOW, 2, 4, [0, 0, 0, 1, 1, 1]));
    expect(pts.map((p) => [p.c, p.lv])).toEqual([[4.5, "000112"], [4, "000111"]]);
    expect(JSON.parse((await store.getKv("risk:series"))!)).toHaveLength(2);
    expect(pointOf(snap(NOW + 25 * 60_000, 3, 12.345, [1, 0, 0, 2, 1, 1]))).toMatchObject({ t: Math.floor((NOW + 25 * 60_000) / H) * H, ph: 3, c: 12.35, lv: "100211" });
  });
  it("24시간 전에 가장 가까운 점 (앞뒤 3시간 안)", () => {
    const s = [pointOf(snap(NOW - 26 * H, 2, 5, [0, 0, 0, 0, 0, 0])), pointOf(snap(NOW - 23 * H, 2, 4.5, [0, 0, 0, 0, 0, 0]))];
    expect(pointNear(s, NOW - 24 * H)!.c).toBe(4.5);
    expect(pointNear(s, NOW - 30 * H, 2 * H)).toBeUndefined();
  });
});

describe("어제 이맘때와 비교", () => {
  const series = [pointOf(snap(NOW - 24 * H, 2, 4.5, [0, 0, 0, 1, 1, 2]))];
  it("기록이 없으면 '비교는 하루 쌓인 뒤부터'", () => {
    const c = compareWithYesterday([], war(2, 4, [0, 0, 0, 1, 1, 1]), [], [], NOW);
    expect(c.verdict).toBe("unknown");
    expect(c.headline).toMatch(/기록이 하루 쌓인 뒤/);
  });
  it("2026-11-02 같은 모양: 국지 충돌 4.5% → 4%, 사람들의 불안 경계 → 주의 → '나아졌다'", () => {
    const c = compareWithYesterday(series, war(2, 4, [0, 0, 0, 1, 1, 1]), [], [], NOW);
    expect(c.verdict).toBe("better");
    expect(c.headline).toMatch(/^어제 이맘때보다 나아졌다 — 30일 국지 충돌 4\.5% → 4%/);
    expect(c.changes).toEqual(expect.arrayContaining([{ text: "사람들의 불안 경계 → 주의", dir: -1 }]));
    expect(c.ago).toMatchObject({ phase: 2, clash: 4.5 });
  });
  it("단계가 오르면 확률이 비슷해도 '위기 쪽'", () => {
    const c = compareWithYesterday(series, war(3, 4.6, [1, 0, 0, 2, 1, 2]), [], [], NOW);
    expect(c.verdict).toBe("worse");
    expect(c.headline).toMatch(/위기 쪽으로 움직였다 — 전쟁 위험 2단계 → 3단계/);
  });
  it("작은 흔들림(0.3%p 미만)이고 영역이 그대로면 '비슷하다'", () => {
    expect(compareWithYesterday(series, war(2, 4.6, [0, 0, 0, 1, 1, 2]), [], [], NOW).verdict).toBe("same");
  });
  it("지난 24시간 새 사건과 상태가 바뀐 징후를 덧붙인다", () => {
    const d = INDICATORS.find((x) => x.id === "nk.fuel_price_change_pct")!;
    const reading = evaluate(d, 88, NOW, undefined);
    const row: BoardRow = { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, absolute: d.absolute, reading, stateLabel: STATE_LABEL[reading.state], history: [{ hour: Math.floor((NOW - 24 * H) / H), avg: 30 }] };
    const briefs = [
      { headline: "북한, 탄도미사일 발사 → 동해", isProvocation: true, danger: { level: 3, label: "경계", reason: "" }, at: NOW - 5 * H },
      { headline: "북한 담화 (말뿐)", isProvocation: false, danger: { level: 1, label: "", reason: "" }, at: NOW - 2 * H },
    ] as any;
    const c = compareWithYesterday(series, war(2, 4.5, [0, 0, 0, 1, 1, 2]), [row], briefs, NOW);
    expect(c.movers).toEqual([{ id: d.id, label: d.label, from: "정상", to: "이상", dir: 1 }]);
    expect(c.newEvents.map((e) => e.headline)).toEqual(["북한, 탄도미사일 발사 → 동해"]);
  });
});

describe("측정 방식이 바뀐 징후는 기준선을 새로 배운다", () => {
  it("군용기 수: adsb.fi 를 더한 뒤 옛 기준선(adsb.lol 만, 평소 2.5대)으로 '상승'이 되지 않는다", async () => {
    const { processMetrics } = await import("../src/core/pipeline.js");
    const { slotKey, INDICATOR_BY_ID } = await import("../src/core/indicators.js");
    const store = new MemoryStore();
    const def = INDICATOR_BY_ID["air.mil_airborne"];
    await store.setKv("baselines", JSON.stringify({ [`air.mil_airborne|${slotKey(def, NOW)}`]: { mean: 2.5, var: 1, n: 50, updatedAt: NOW - 3600_000 } }));
    const [r] = await processMetrics(store, [{ indicator: "air.mil_airborne", value: 7 }], NOW);
    expect(r.state).toBe("learning");
    expect(Object.keys(JSON.parse((await store.getKv("baselines"))!))).toContain(`air.mil_airborne#2|${slotKey(def, NOW)}`);
  });
});
