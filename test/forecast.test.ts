// 스스로 채점하는 예측 — 앞으로 30일·7일 큰 도발 확률과 채점
import { describe, expect, it } from "vitest";
import { forecastMajor, loadMajorDays, recordMajorDays, scoreForecasts, type MajorDay } from "../src/core/forecast.js";
import { FORECAST_CALIBRATION, MAJOR_DAYS } from "../src/core/tension_history.js";
import { MemoryStore } from "../src/core/store.js";
import type { RiskDay } from "../src/core/history.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 10, 2, 3, 0);
const DAY = 86400_000;
const kday = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

describe("앞으로 30일 큰 도발 확률", () => {
  it("보정표는 단조 증가하고, 평균은 지난 10년 실제 비율이다 (30일 약 19%)", () => {
    const ps = FORECAST_CALIBRATION.d30.bins.map((b) => b.p);
    expect([...ps].sort((a, b) => a - b)).toEqual(ps);
    expect(FORECAST_CALIBRATION.d30.base).toBeGreaterThan(0.15);
    expect(FORECAST_CALIBRATION.d30.base).toBeLessThan(0.25);
    expect(MAJOR_DAYS).toContain("2017-09-03"); // 6차 핵실험
  });
  it("최근 180일 큰 도발이 없으면 낮고, 잦으면 높다", () => {
    const none = forecastMajor([], NOW);
    const many = forecastMajor(Array.from({ length: 8 }, (_, i) => ({ d: kday(NOW - (10 + i * 20) * DAY), what: "x" })), NOW);
    expect(none.p30).toBeLessThan(10);
    expect(many.p30).toBeGreaterThan(40);
    expect(many.count180).toBe(8);
  });
  it("지금 값: CSIS 일지 + 시스템이 감지한 날을 합쳐 계산", async () => {
    const store = new MemoryStore();
    const f = forecastMajor(await loadMajorDays(store), NOW);
    expect(f.p30).toBeGreaterThan(0);
    expect(f.base30).toBeCloseTo(FORECAST_CALIBRATION.d30.base * 100, 1);
  });
});

describe("큰 도발 날 기록", () => {
  it("북한의 실제 도발(위험도 4 이상)만 남긴다 — 철수 보도·경보 단어·훈련은 아님", async () => {
    const store = new MemoryStore();
    const b = (o: Partial<EventBrief>): EventBrief => ({ headline: "북한, ICBM 발사", isProvocation: true, danger: { level: 4, label: "", reason: "" }, at: NOW - 3600_000, ...o });
    const n = await recordMajorDays(store, [b({}), b({ headline: "철수 보도", evacuation: "official" }), b({ headline: "워치콘", posture: [{ id: "watchcon_up", label: "", domain: "gov", level: 2 }] }), b({ headline: "탄도 1발", danger: { level: 3, label: "", reason: "" } })], NOW);
    expect(n).toBe(1);
    expect(await recordMajorDays(store, [b({})], NOW + 3600_000)).toBe(0); // 같은 날은 한 번
    const days = await loadMajorDays(store);
    expect(days.at(-1)).toMatchObject({ d: kday(NOW - 3600_000), what: "북한, ICBM 발사" });
  });
});

describe("채점", () => {
  const day = (d: string, p: number): RiskDay => ({ day: d, n: 1, maxPhase: 2, maxClash: 3, avgClash: 3, maxWar: 0.2, peak: { at: 0, phase: 2, clash: 3, war: 0.2, levels: {}, why: [] }, p30First: p });
  it("30일이 지난 날만, 그날 첫 예측으로 채점한다 — 맞힌 예측은 평균값보다 점수가 좋다", () => {
    const majors: MajorDay[] = [{ d: "2026-11-20", what: "ICBM" }];
    const days = [day("2026-10-25", 60), day("2026-10-26", 60), day("2026-11-30", 10)];
    const s = scoreForecasts(days, majors, Date.UTC(2026, 11, 5));
    expect(s.n).toBe(2); // 11/30 은 아직
    expect(s.skill!).toBeGreaterThan(0);
  });
  it("아직 30일이 안 됐으면 첫 채점 날을 알려 준다", () => {
    const s = scoreForecasts([day("2026-11-01", 20)], [], NOW);
    expect(s).toMatchObject({ n: 0, firstDue: "2026-12-02" });
  });
});
