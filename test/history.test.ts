// 판정 기록: 하루 요약·시간별 순간·순위
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/store.js";
import { foldDay, kstDay, recordRisk, snapshotOf, summarize, type RiskDay } from "../src/core/history.js";
import type { WarRisk } from "../src/core/warrisk.js";

const T = Date.UTC(2026, 10, 1, 0, 5); // 09:05 KST
const MIN = 60_000;
const war = (at: number, phase: 1 | 2 | 3, clash: number): WarRisk =>
  ({
    at, phase, phaseLabel: "", phaseReasons: [`이유 ${phase}`], clash30d: { low: 0, high: 0, point: clash }, war30d: { low: 0, high: 0, point: clash / 20 }, usual: { clash: 1.8, war: 0.09 },
    domains: [{ id: "military", label: "군사 동향", level: 2, levelLabel: "경계", drivers: [], measured: 1, total: 1, why: "" }],
    firstMover: { kind: "neutral", text: "" }, tripwires: [], restraints: [], blindSpots: [], headline: "",
  }) as WarRisk;

describe("판정 기록", () => {
  it("하루 요약: 최고·평균·가장 높았던 순간, 날이 바뀌면 새로", () => {
    let d = foldDay(undefined, snapshotOf(war(T, 2, 3.6)));
    d = foldDay(d, snapshotOf(war(T + 5 * MIN, 3, 25)));
    d = foldDay(d, snapshotOf(war(T + 10 * MIN, 2, 3.6)));
    expect(d).toMatchObject({ day: "2026-11-01", n: 3, maxPhase: 3, maxClash: 25 });
    expect(d.avgClash).toBeCloseTo((3.6 + 25 + 3.6) / 3, 2);
    expect(d.peak.phase).toBe(3);
    expect(d.peak.levels.military).toBe(2);
    const next = foldDay(d, snapshotOf(war(T + 24 * 3600_000, 1, 1.8)));
    expect(next).toMatchObject({ day: "2026-11-02", n: 1, maxClash: 1.8 });
  });
  it("순위: 기록된 날 중 오늘 국지 충돌 확률이 몇 번째로 높은가", () => {
    const days: RiskDay[] = [1.8, 4, 3.6, 2].map((c, i) => foldDay(undefined, snapshotOf(war(T - (3 - i) * 86400_000, 2, c))));
    const s = summarize(days, T);
    expect(s.today).toMatchObject({ d: "2026-11-01", clash: 2 });
    expect(s.rank).toEqual({ clash: 3, of: 4, window: 90 });
    expect(s.recent.map((r) => r.d)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("5분마다 오늘 기록을 갱신하고, 시간이 바뀔 때만 순간 기록과 요약을 남긴다", async () => {
    const store = new MemoryStore();
    expect((await recordRisk(store, war(T, 2, 3.6))).hourly).toBe(true);
    expect((await recordRisk(store, war(T + 5 * MIN, 3, 25))).hourly).toBe(false);
    expect((await recordRisk(store, war(T + 60 * MIN, 2, 3.6))).hourly).toBe(true);
    expect(await store.getRiskHourly(0)).toHaveLength(2);
    expect((await store.getRiskDay(kstDay(T)))!.maxClash).toBe(25);
    const sum = JSON.parse((await store.getKv("risk:summary"))!);
    expect(sum).toMatchObject({ days: 1, since: "2026-11-01", today: { phase: 3, clash: 25 } });
  });
});
