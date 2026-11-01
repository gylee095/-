// 긴장 온도계 — 지난 10년(2016~)과 같은 잣대
import { describe, expect, it } from "vitest";
import { historyValues, liveInputs, percentileOf, tensionOf, tensionRaw, unitsOf } from "../src/core/tension.js";
import { TENSION_FROM, TENSION_Q, TENSION_TOP } from "../src/core/tension_history.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 10, 1, 9);
const dayIndex = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${TENSION_FROM}T00:00:00Z`)) / 86400_000);
const vals = historyValues();
const at = (d: string) => vals[dayIndex(d)];
const maxAround = (d: string, k = 3) => Math.max(...vals.slice(dayIndex(d), dayIndex(d) + k + 1));

describe("긴장 온도계: 점수 매기기", () => {
  it("요소 점수: 상위 10% 이하 0, 2.5% = 1, 0.5% = 2, 0.1% 이상 = 3", () => {
    const q: [number, number, number, number] = [2, 4, 8, 16];
    expect([1, 2, 3, 4, 6, 8, 12, 16, 99].map((x) => +unitsOf(x, q).toFixed(2))).toEqual([0, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3]);
    expect(unitsOf(undefined, q)).toBe(0);
  });
  it("'전쟁' 검색은 북한 쪽 계기가 있을 때만 센다 — 다른 나라 전쟁(2022 우크라이나, 2025 이란)에 오른 검색을 걸러낸다", () => {
    const war = TENSION_Q.war[2] * 1.2; // 상위 0.5% 넘는 '전쟁' 검색
    expect(tensionRaw({ war }).parts.public).toBe(0);
    expect(tensionRaw({ war, nk: TENSION_Q.nk[0] + 0.1 }).parts.public).toBeGreaterThan(2);
    expect(tensionRaw({ war, maxDanger7: 4 }).parts.public).toBeGreaterThan(2); // 핵실험·ICBM 주간 (사람들은 '북한 미사일'보다 '핵실험'을 찾는다)
  });
  it("돈: 한 가지만 튄 날은 반만 센다 (업종 소식·세계 증시)", () => {
    const one = tensionRaw({ defenseRelPct: TENSION_Q.defenseUp[2] });
    const two = tensionRaw({ defenseRelPct: TENSION_Q.defenseUp[2], kospiRelPct: -TENSION_Q.kospiDrop[2] });
    expect(one.parts.money).toBeCloseTo(1, 1);
    expect(two.parts.money).toBeCloseTo(2, 1);
  });
  it("군사: 최근 7일 최고 위험도 — 핵실험 3점, ICBM·포격 1.5점, 탄도 0.5점, 3일 이상 연달아면 +0.5", () => {
    expect(tensionRaw({ maxDanger7: 5 }).parts.military).toBe(3);
    expect(tensionRaw({ maxDanger7: 4 }).parts.military).toBe(1.5);
    expect(tensionRaw({ maxDanger7: 3, provDays7: 3 }).parts.military).toBe(1);
  });
});

describe("긴장 온도계: 지난 10년 재구성 검증", () => {
  it("가장 긴장된 날은 2017-09-04(6차 핵실험 다음 날), 하루 값의 최고와 같다", () => {
    expect(TENSION_TOP[0].d).toBe("2017-09-04");
    expect(TENSION_TOP[0].label).toMatch(/핵실험/);
    expect(Math.max(...vals)).toBe(TENSION_TOP[0].raw);
    expect(percentileOf(TENSION_TOP[0].raw)).toBeGreaterThan(99.9);
  });
  it("2016년 이후 큰 사건 20건은 모두 사건 뒤 3일 안에 지난 10년 중 상위 3% 안", () => {
    const majors = ["2016-02-07", "2016-09-09", "2017-04-11", "2017-07-04", "2017-07-28", "2017-08-09", "2017-08-29", "2017-09-03", "2017-09-15", "2017-11-29", "2020-06-16", "2022-10-04", "2022-11-02", "2022-12-26", "2023-05-31", "2023-11-21", "2024-01-05", "2024-10-15", "2026-09-21", "2026-10-29"];
    for (const d of majors) expect([d, percentileOf(maxAround(d))]).toEqual([d, expect.any(Number)]);
    const low = majors.map((d) => ({ d, p: percentileOf(maxAround(d)) })).filter((x) => x.p < 97);
    expect(low).toEqual([]);
  });
  it("다른 나라 전쟁·민방위 훈련 날은 낮다 (2022-02-24 우크라이나 침공, 2023-10-07 하마스, 2023-08-23 을지 훈련)", () => {
    for (const d of ["2022-02-24", "2023-10-07", "2023-08-23"]) expect(percentileOf(at(d))).toBeLessThan(60);
  });
  it("백분위: 같은 값은 절반으로 센다 (원점수 0 인 날이 많다)", () => {
    const zeros = vals.filter((v) => v === 0).length / vals.length;
    expect(percentileOf(0)).toBeCloseTo((zeros / 2) * 100, 0);
  });
});

describe("긴장 온도계: 지금 값", () => {
  const board = (over: Record<string, { value: number; meta?: Record<string, unknown> }>): BoardRow[] =>
    INDICATORS.map((d) => {
      const o = over[d.id];
      const reading = o ? { indicator: d.id, at: NOW - 3600_000, n: 20, value: o.value, state: "normal" as const, meta: o.meta } : undefined;
      return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL.normal, history: [] };
    });
  it("징후판·사건에서 같은 정의로 입력을 만든다 (실측 10/29 비슷한 날 → 상위 3% 안팎)", () => {
    const b = board({
      "psych.naver_war_search": { value: 10609, meta: { groups: [{ group: "전쟁 불안", ratio: 25 }, { group: "북한 도발", ratio: 29.3 }] } },
      "psych.wiki_korea_attention": { value: 150 },
      "market.kr_equity_rel_pct": { value: -1.09, meta: { krwRelPct: 1.14 } },
      "market.defense_rel_pct": { value: -3.03 },
      "elite.foreign_net_kospi": { value: 0.9 },
    });
    const briefs: EventBrief[] = [{ headline: "북한, 탄도미사일 약 10 발 발사 → 동해", isProvocation: true, danger: { level: 3, label: "경계", reason: "" }, at: NOW - 2 * 86400_000 }];
    const x = liveInputs(b, briefs, NOW);
    expect(x).toMatchObject({ nk: 29.3, war: 25, wiki: 1.5, kospiRelPct: -1.09, krwRelPct: 1.14, defenseRelPct: -3.03, foreignZ: 0.9, maxDanger7: 3, provDays7: 1 });
    const t = tensionOf(x);
    expect(t.parts.military).toBe(0.5);
    expect(t.pct).toBeGreaterThan(95);
    expect(t.drivers.join(" ")).toMatch(/북한 도발 검색 29.3배/);
  });
  it("오래된 값(이틀 넘음)과 7일 지난 도발은 쓰지 않는다", () => {
    const b = board({ "market.kr_equity_rel_pct": { value: -5 } }).map((r) => (r.reading ? { ...r, reading: { ...r.reading, at: NOW - 5 * 86400_000 } } : r));
    const old: EventBrief[] = [{ headline: "ICBM", isProvocation: true, danger: { level: 4, label: "심각", reason: "" }, at: NOW - 8 * 86400_000 }];
    expect(liveInputs(b, old, NOW)).toMatchObject({ kospiRelPct: undefined, maxDanger7: 0 });
  });
});

describe("온도계 설명: 세지 않은 불안", () => {
  it("'전쟁' 검색이 높아도 북한 도발 검색·큰 도발이 없으면 0점 + 이유를 적는다", () => {
    const t = tensionOf({ nk: 1, war: 17.3, wiki: 1.4, maxDanger7: 3 });
    expect(t.parts.public).toBe(0);
    expect(t.note).toMatch(/'전쟁' 검색 평소의 17배.*세지 않았다/);
    const big = tensionOf({ nk: 1, war: 17.3, maxDanger7: 4 });
    expect(big.parts.public).toBeGreaterThan(0);
    expect(big.note).toBeUndefined();
  });
});
