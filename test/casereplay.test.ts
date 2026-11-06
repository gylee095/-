// 사례집 재생: 운영 규칙을 그대로 쓰는지, 미래 정보를 쓰지 않는지, 채점이 맞는지
import { describe, expect, it } from "vitest";
import { caseBoard, readinessScore, replayCase, scoreCase, type CaseDay, type CaseFile } from "../src/core/casereplay.js";

const dates = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400_000).toISOString().slice(0, 10));
const mk = (over: Partial<CaseFile> = {}, day: (date: string) => Partial<CaseDay> = () => ({})): CaseFile => {
  const ds = dates("2022-01-01", 60);
  return { id: "t", name: "시험", outcome: "war", truthDate: "2022-03-01", start: ds[0], end: ds[ds.length - 1], preroll: [], days: ds.map((date) => ({ date, ...day(date) })), gov: [], airspace: [], sources: [], retrieved: "2026-11-06", ...over };
};
const us = (date: string, value: number) => ({ date, indicator: "official.us_travel_level_kr", value, what: "", source: "x" });

describe("지표 표", () => {
  it("없는 신호는 값을 지어내지 않고 측정 불가", () => {
    const row = caseBoard(mk(), "2022-01-05", undefined).find((r) => r.id === "market.usdkrw_change_pct")!;
    expect(row.reading).toBeUndefined();
    expect(row.stateLabel).toBe("측정 불가");
  });
  it("정부 경보는 발표일 전에는 보이지 않는다 (미래 정보 금지)", () => {
    const c = mk({ gov: [us("2022-02-10", 3)] });
    const find = (d: string) => caseBoard(c, d, undefined).find((r) => r.id === "official.us_travel_level_kr")!;
    expect(find("2022-02-09").reading).toBeUndefined();
    expect(find("2022-02-10").reading?.state).toBe("anomalous");
  });
  it("시장 값은 운영 문턱 그대로 판정한다 (환율 1.5 상승, 3 이상)", () => {
    const state = (fxPct: number) => caseBoard(mk({}, () => ({ fxPct })), "2022-01-05", undefined).find((r) => r.id === "market.usdkrw_change_pct")!.reading!.state;
    expect(state(1)).toBe("normal");
    expect(state(1.5)).toBe("elevated");
    expect(state(3)).toBe("anomalous");
  });
  it("영공 신호는 7일 동안만 유지된다", () => {
    const c = mk({ airspace: [{ date: "2022-02-01", what: "운항 중단", source: "x" }] });
    const air = (d: string) => caseBoard(c, d, undefined).find((r) => r.id === "air.civil_airborne")!.reading;
    expect(air("2022-02-07")?.state).toBe("anomalous");
    expect(air("2022-02-08")).toBeUndefined();
  });
});

describe("전쟁 직전 대비 점수", () => {
  it("평소 0, 우크라이나 전날 100, 그 사이는 비례, 밖은 잘라 낸다", () => {
    const s = { usualGauge: 0.08, eveGauge: 0.78 };
    expect(readinessScore(0.08, s)).toBe(0);
    expect(readinessScore(0.78, s)).toBe(100);
    expect(readinessScore(0.43, s)).toBe(50);
    expect(readinessScore(0.02, s)).toBe(0);
    expect(readinessScore(1, s)).toBe(100);
  });
});

describe("재생과 채점", () => {
  it("아무 신호가 없으면 평온, 미 3단계 경보 뒤로는 임박 — 운영 규칙과 같다", () => {
    const c = mk({ gov: [us("2022-02-10", 3)] });
    const r = replayCase(c);
    expect(r.find((x) => x.date === "2022-02-09")!.phase).toBe(1);
    expect(r.find((x) => x.date === "2022-02-10")!.phase).toBe(4);
  });
  it("미리 잡은 날짜·선행일을 센다", () => {
    const c = mk({ gov: [us("2022-02-10", 3)] });
    const s = scoreCase(c, replayCase(c));
    expect(s.firstCrisis).toBe("2022-02-10");
    expect(s.crisisLeadDays).toBe(19);
    expect(s.caught).toBe(true);
    expect(s.eveLevel).toBe(4);
    expect(s.falseAlarmDays).toBe(0);
  });
  it("정답 30일 전보다 이른 경보는 맞힘이 아니라 헛경보", () => {
    const c = mk({ gov: [us("2022-01-05", 3), { ...us("2022-01-10", 1) }] });
    const s = scoreCase(c, replayCase(c));
    expect(s.caught).toBe(false);
    expect(s.falseAlarmDays).toBe(5);
  });
  it("엄격 기준: 30일보다 먼저 켜져 정답까지 이어진 경보도 30일 전까지는 헛경보, 선행일은 최대 30일", () => {
    const c = mk({ gov: [us("2022-01-20", 3)] });
    const s = scoreCase(c, replayCase(c));
    expect(s.caught).toBe(true);
    expect(s.firstCrisis).toBe("2022-01-30");
    expect(s.crisisLeadDays).toBe(30);
    expect(s.falseAlarmDays).toBe(10);
  });
  it("전쟁이 안 난 사례는 3단계 이상이 모두 헛경보이고 잡음으로 치지 않는다", () => {
    const c = mk({ outcome: "no_war", truthDate: undefined, gov: [us("2022-02-20", 3)] });
    const s = scoreCase(c, replayCase(c));
    expect(s.caught).toBe(false);
    expect(s.falseAlarmDays).toBe(10);
    expect(s.quietDays).toBe(60);
  });
  it("단계가 바뀐 횟수를 세고, 정답 당일은 채점에서 뺀다", () => {
    const c = mk({ gov: [us("2022-02-10", 3), us("2022-02-15", 1)] });
    const s = scoreCase(c, replayCase(c));
    expect(s.flips).toBe(2);
    expect(s.days).toBe(59);
  });
  it("측정 범위를 정직하게 적는다", () => {
    const c = mk({ gov: [us("2022-02-10", 3)] }, () => ({ fxPct: 0 }));
    const s = scoreCase(c, replayCase(c));
    expect(s.coverage.find((x) => x.domain === "gov")!.measured).toBe(1);
    expect(s.coverage.find((x) => x.domain === "money")!.measured).toBe(1);
    expect(s.coverage.find((x) => x.domain === "military")!.measured).toBe(0);
  });
  it("보도량은 최근 4주 기록과 비교한다 — 지난 날만 기준선에 들어간다", () => {
    const c = mk({}, (date) => ({ media: date === "2022-02-20" ? 1000 : 100 + (date.charCodeAt(9) % 3) }));
    const r = replayCase(c);
    expect(r.find((x) => x.date === "2022-02-20")!.hot.some((h) => h.id === "media.war_talk_24h")).toBe(true);
    expect(r.find((x) => x.date === "2022-02-19")!.hot.some((h) => h.id === "media.war_talk_24h")).toBe(false);
  });
});
