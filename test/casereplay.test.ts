// 사례집 재생: 운영 규칙을 그대로 쓰는지, 미래 정보를 쓰지 않는지, 채점이 맞는지
import { describe, expect, it } from "vitest";
import { caseBoard, isQuietDay, readinessScore, replayCase, scoreCase, wikiDaily, type CaseDay, type CaseFile } from "../src/core/casereplay.js";

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

describe("검토 반영 (11/6 self-verify)", () => {
  it("보도량: 앞날의 폭증은 그 전날 판정을 하나도 바꾸지 못한다 (미래 정보 금지)", () => {
    const base = (date: string) => ({ media: 100 + (date.charCodeAt(9) % 3) });
    const spike = (date: string) => ({ media: date >= "2022-02-20" ? 5000 : base(date).media });
    const a = replayCase(mk({}, base)), b = replayCase(mk({}, spike));
    const pick = (r: typeof a) => r.filter((x) => x.date < "2022-02-20").map((x) => [x.phase, x.gauge, x.hot.map((h) => h.id).join()]);
    expect(pick(b)).toEqual(pick(a));
  });
  it("위키: 날짜 t 의 값은 t 당일과 그 뒤 조회수가 바뀌어도 그대로 (하루 늦춤)", () => {
    const ds = dates("2022-01-01", 50);
    const mkSeries = (bump: boolean) => ["a", "b", "c", "d"].map((name) => ({ name, series: new Map(ds.map((d) => [d, bump && d >= "2022-02-10" ? 9999 : 100 + (d.charCodeAt(9) % 5)])) }));
    const a = wikiDaily(mkSeries(false), ds[0], ds[ds.length - 1]), b = wikiDaily(mkSeries(true), ds[0], ds[ds.length - 1]);
    expect(b.get("2022-02-10")).toBe(a.get("2022-02-10"));
    expect(b.get("2022-02-11")).toBeGreaterThan(a.get("2022-02-11")!);
  });
  it("평시 정의는 정답 31일 전까지, 30일 전부터는 예보 구간", () => {
    expect(isQuietDay({ truthDate: "2022-03-01" }, "2022-01-29")).toBe(true);
    expect(isQuietDay({ truthDate: "2022-03-01" }, "2022-01-30")).toBe(false);
    expect(isQuietDay({ truthDate: undefined }, "2022-02-28")).toBe(true);
  });
  it("신호별 성적도 엄격 기준 — 선행 30일, 평시 켜진 날 10", () => {
    const c = mk({ gov: [us("2022-01-20", 3)] });
    const sig = scoreCase(c, replayCase(c)).signals.find((x) => x.id === "official.us_travel_level_kr")!;
    expect(sig.leadDays).toBe(30);
    expect(sig.quietHotDays).toBe(10);
  });
  it("정부 사건은 파일 순서가 아니라 날짜 순서로, 모르는 지표는 실패", () => {
    const c = mk({ gov: [us("2022-02-15", 1), us("2022-02-10", 3)] });
    expect(caseBoard(c, "2022-02-16", undefined).find((r) => r.id === "official.us_travel_level_kr")!.reading!.value).toBe(1);
    expect(() => caseBoard(mk({ gov: [{ ...us("2022-02-10", 3), indicator: "official.nope" }] }), "2022-02-11", undefined)).toThrow();
  });
  it("시장·위키 네 신호가 모두 지표로 들어가고, 측정 범위는 채점한 모든 날 기준", () => {
    const c = mk({ airspace: [{ date: "2022-01-05", what: "x", source: "x" }] }, () => ({ fxPct: 0, equityRel: 0, defenseRel: 0, wikiPct: 100 }));
    const board = caseBoard(c, "2022-01-10", undefined);
    for (const id of ["market.usdkrw_change_pct", "market.kr_equity_rel_pct", "market.defense_rel_pct", "psych.wiki_korea_attention"]) expect(board.find((r) => r.id === id)!.reading).toBeDefined();
    const cov = scoreCase(c, replayCase(c)).coverage;
    expect(cov.find((x) => x.domain === "military")!.measured).toBe(1); // 1/5 영공 사건 — 마지막 날엔 꺼져 있어도 센다
  });
  it("눈금이 퇴화하면 점수는 0 (NaN·뒤집힘 없음)", () => {
    expect(readinessScore(0.5, { usualGauge: 0.08, eveGauge: 0.08 })).toBe(0);
    expect(readinessScore(0.5, { usualGauge: 0.08, eveGauge: 0.05 })).toBe(0);
  });
});

describe("화면 자료가 지금 규칙·자료와 같은가", () => {
  it("casebook_data.ts 는 data/cases 를 지금 규칙으로 다시 채점한 결과와 같다 (다르면 npx tsx scripts/score-cases.ts)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { CASEBOOK } = await import("../src/core/casebook_data.js");
    const dir = new URL("../data/cases/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "events.json" && f !== "scorecard.json");
    const scores = files.map((f) => { const c = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as CaseFile; return scoreCase(c, replayCase(c)); });
    expect(scores.filter((s) => s.caught).length).toBe(CASEBOOK.totals.caught);
    expect(scores.reduce((a, s) => a + s.falseAlarmDays, 0)).toBe(CASEBOOK.totals.falseAlarmDays);
    expect(scores.reduce((a, s) => a + s.quietDays, 0)).toBe(CASEBOOK.totals.quietDays);
    const ukr = scores.find((s) => s.id === "ukraine-2022")!;
    expect(ukr.eveLevel).toBe(CASEBOOK.anchors.find((a) => a.id === "ukraine-2022")!.phase);
  });
});

describe("검토 반영 2바퀴 (11/6 self-verify)", () => {
  it("화면 자료의 눈금·기준점·평시 점수까지 지금 규칙으로 다시 만든 값과 같다", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { CASEBOOK } = await import("../src/core/casebook_data.js");
    const { assessWarRisk } = await import("../src/core/warrisk.js");
    const dir = new URL("../data/cases/", import.meta.url);
    const cases = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "events.json" && f !== "scorecard.json").map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as CaseFile);
    const eve = (c: CaseFile) => replayCase(c).filter((d) => !c.truthDate || d.date < c.truthDate).pop()!;
    const ukr = cases.find((c) => c.id === "ukraine-2022")!;
    expect(CASEBOOK.scale.usualGauge).toBe(assessWarRisk({ now: 0, board: [], briefs: [], patterns: [] }).gauge.usual);
    expect(CASEBOOK.scale.eveGauge).toBe(eve(ukr).gauge);
    for (const a of CASEBOOK.anchors) expect(readinessScore(eve(cases.find((c) => c.id === a.id)!).gauge, CASEBOOK.scale)).toBe(a.score);
    const quiet = cases.flatMap((c) => replayCase(c).filter((d) => isQuietDay(c, d.date)).map((d) => readinessScore(d.gauge, CASEBOOK.scale))).sort((x, y) => x - y);
    expect(quiet).toEqual([...CASEBOOK.quietScores]);
  });
  it("정부 사건은 고정 문턱 지표만 (사건 값을 '학습 중'으로 조용히 버리지 않는다)", () => {
    expect(() => caseBoard(mk({ gov: [{ ...us("2022-02-10", 3), indicator: "media.war_talk_24h" }] }), "2022-02-11", undefined)).toThrow();
  });
  it("보도량이 기준선 학습 중이면 측정 범위에 넣지 않는다", () => {
    const c = mk({}, () => ({ media: 100 }));
    expect(scoreCase(c, replayCase(c)).coverage.find((x) => x.domain === "public")!.measured).toBe(1); // 기록이 쌓인 뒤엔 측정
    const short = mk({ days: [{ date: "2022-01-01", media: 100 }], start: "2022-01-01", end: "2022-01-01", truthDate: "2022-01-02" });
    expect(scoreCase(short, replayCase(short)).coverage.find((x) => x.domain === "public")!.measured).toBe(0);
  });
  it("위키: 어제 값이 빠진 문서는 그날 계산에서 뺀다", () => {
    const ds = dates("2022-01-01", 40);
    const full = (name: string) => ({ name, series: new Map(ds.map((d) => [d, 100])) });
    const gap = { name: "g", series: new Map(ds.filter((d) => d !== "2022-02-05").map((d) => [d, d === "2022-02-04" ? 900 : 100])) };
    const r = wikiDaily([full("a"), full("b"), full("c"), full("d"), gap], ds[0], ds[ds.length - 1]);
    expect(r.get("2022-02-06")).toBe(100); // 2/4 의 900 이 2/5 인 척 들어오지 않는다
  });
});
