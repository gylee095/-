// 화면 문장 점검 (2026-11-02): 모든 징후의 뜻풀이를 여러 상태로 만들어, 빈칸 표시('?대')·undefined·NaN·영어 상태어가 없고
// 평소를 모르는 징후가 '평소 수준'이라고 판정하지 않는지 본다. 11/2 '기업 제트기 평소 ?대 → 평소 수준'이 화면에 나간 뒤 추가.
import { describe, expect, it } from "vitest";
import { interpret } from "../src/core/interpret.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL, LEARNING_RULE } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { IndicatorState } from "../src/core/types.js";

const NOW = Date.UTC(2026, 10, 2, 6, 0);
const rows = (state: IndicatorState, value: number, meta: (id: string) => Record<string, unknown> | undefined): BoardRow[] =>
  INDICATORS.map((d) => ({
    id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, absolute: d.absolute,
    reading: { indicator: d.id, value, at: NOW, n: 3, state, ...(state === "learning" && !d.absolute ? { days: 2 } : {}), meta: meta(d.id) },
    stateLabel: STATE_LABEL[state], history: [],
  }));
const BAD = /\?(대|건|%|배|원|일)|undefined|NaN|\bnull\b|anomalous|elevated|\blearning\b/;

describe("모든 징후의 뜻풀이에 빈칸·영어 상태어가 없다", () => {
  for (const [state, value] of [["normal", 0], ["normal", 3], ["elevated", 7], ["anomalous", 40], ["learning", 2]] as [IndicatorState, number][]) {
    it(`${STATE_LABEL[state]} · 값 ${value} · 부가 정보 없음`, () => {
      const it2 = interpret({ now: NOW, threat: { level: 1, label: "평시", summary: "", lastProvocation: null } as any, board: rows(state, value, () => undefined), patterns: [], briefs: [] });
      for (const [id, text] of Object.entries(it2.perIndicator)) expect(text, id).not.toMatch(BAD);
    });
  }
});

describe("평소를 모르면 '평소 수준'이라고 판정하지 않는다", () => {
  it("학습 중인 모든 징후 (기업 제트기는 수집기가 알려 준 '기록 2/8일')", () => {
    const meta = (id: string) => (id === "elite.kr_bizjets" ? { learning: true, learningDays: 2, need: 8, departures: 0, todaySoFar: 1 } : undefined);
    const it2 = interpret({ now: NOW, threat: { level: 1, label: "평시", summary: "", lastProvocation: null } as any, board: rows("learning", 2, meta), patterns: [], briefs: [] });
    for (const d of INDICATORS.filter((x) => !x.absolute)) expect(it2.perIndicator[d.id], d.id).not.toMatch(/→\s*평소 (수준|범위)/);
    expect(it2.perIndicator["elite.kr_bizjets"]).toMatch(/평소는 아직 모름 \(기록 2\/8일/);
  });
  it("학습 중 설명은 규칙 문장 하나에서 나온다", () => {
    const it2 = interpret({ now: NOW, threat: { level: 1, label: "평시", summary: "", lastProvocation: null } as any, board: rows("learning", 2, () => undefined), patterns: [], briefs: [] });
    const hint = it2.hints.find((h) => /평소를 아직 다 배우지 못한/.test(h.title))!;
    expect(hint.reasoning).toBe(LEARNING_RULE);
    expect(LEARNING_RULE).toMatch(/아주 큰 변화/);
  });
});

describe("문서의 징후 표는 코드와 같다 (11/2: 손으로 쓴 표가 어긋나 분석관이 옛 내용을 옮겨 썼다)", () => {
  it("docs/INDICATORS.md 자동 생성 표 = 지금 코드 — 다르면 npm run docs:indicators", async () => {
    const { readFileSync } = await import("node:fs");
    const { indicatorDocTable, DOC_BEGIN, DOC_END } = await import("../src/core/indicatordocs.js");
    const doc = readFileSync(new URL("../docs/INDICATORS.md", import.meta.url), "utf8");
    const a = doc.indexOf(DOC_BEGIN), b = doc.indexOf(DOC_END);
    expect(a).toBeGreaterThan(0);
    expect(doc.slice(a, b + DOC_END.length)).toBe(indicatorDocTable());
  });
});

describe("대시보드 표기는 서버와 같은 규칙 하나 (11/2: 전면전이 위에선 '평소 약 0.1%', 아래에선 '평소 0.1% 미만')", () => {
  it("화면의 pct() = 서버의 fmtRiskPct", async () => {
    const { DASHBOARD_HTML } = await import("../src/worker/dashboard.js");
    const { fmtRiskPct } = await import("../src/core/warrisk.js");
    const src = /function pct\(x\)\{[^}]*\}/.exec(DASHBOARD_HTML as string)![0];
    const pct = new Function(`${src}; return pct;`)() as (x: number) => string;
    for (const x of [0.05, 0.09, 0.1, 0.18, 0.2, 0.95, 1, 1.8, 3.6, 4.4, 15, 60, 99.6, 100]) expect(pct(x), String(x)).toBe(fmtRiskPct(x));
    // 화면에 다른 확률 표기 함수(예: 온도계 전용 wp)를 따로 두지 않는다
    expect(DASHBOARD_HTML as string).not.toMatch(/var wp=function/);
  });
  it("쉬운 말: '아무 날 평균' 대신 '지난 10년 평균', 표는 화면 폭 안에서 줄바꿈", async () => {
    const { DASHBOARD_HTML } = await import("../src/worker/dashboard.js");
    expect(DASHBOARD_HTML as string).not.toMatch(/아무 날 평균/);
    expect(DASHBOARD_HTML as string).toMatch(/table\{width:100%;max-width:100%;table-layout:fixed/);
  });
});
