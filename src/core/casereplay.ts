// 외국 전쟁 사례집 재생 — 지금 판정 규칙(evaluate·assessWarRisk)에 사례의 하루치 신호를 그대로 넣어 채점한다 (docs/ROADMAP.md 1순위).
// 규칙을 복사하지 않는다: 운영 코드가 바뀌면 채점도 같이 바뀌어야 "같은 시험지로 1.0 vs 2.0"을 비교할 수 있다.
// 자료가 없는 신호는 값을 지어내지 않고 '측정 불가'로 둔다 — 그래서 성적표에 측정 범위(coverage)를 함께 적는다.
import { DOMAINS, assessWarRisk, type DomainId, type Level, type Phase } from "./warrisk.js";
import { INDICATORS, INDICATOR_BY_ID, addToDay, dayBaseline, evaluate, type DayHistory } from "./indicators.js";
import type { BoardRow } from "./state.js";
import type { Reading } from "./types.js";
import { articleRatio } from "./collectors/wiki.js";

export type CaseOutcome = "war" | "attack" | "no_war";

/** 시장·관심·보도 신호 하루치. 없는 값은 비워 둔다 */
export interface CaseDay {
  date: string;
  /** 현지 통화 약세 % (전일 대비, + = 약세) → market.usdkrw_change_pct */
  fxPct?: number;
  /** 현지 증시 − 비교 증시 %p → market.kr_equity_rel_pct */
  equityRel?: number;
  /** 방산주 − 시장 %p → market.defense_rel_pct */
  defenseRel?: number;
  /** 위키백과 문서 묶음 배율의 중앙값 ×100 → psych.wiki_korea_attention */
  wikiPct?: number;
  /** 전쟁 언급 보도 건수 → media.war_talk_24h */
  media?: number;
}

/** 정부 신호 변화. date 부터 다음 변화 전까지 그 값이 유지된다 */
export interface CaseGovEvent {
  date: string;
  indicator: string;
  value: number;
  what: string;
  source: string;
}

export interface CaseFile {
  id: string;
  name: string;
  outcome: CaseOutcome;
  /** 정답 날짜 (no_war 는 없음) */
  truthDate?: string;
  start: string;
  end: string;
  /** 보도 기준선용 창 이전 날들 */
  preroll: { date: string; media?: number }[];
  days: CaseDay[];
  /** 창 시작 때 이미 적용 중이던 값 포함, 날짜순 */
  gov: CaseGovEvent[];
  /** 영공 폐쇄·항공사 운항 중단이 있었던 날 */
  airspace: { date: string; what: string; source: string }[];
  sources: string[];
  retrieved: string;
}

const DAY_MS = 86400_000;
/** 공역 신호는 사건일부터 이만큼 유지한다 */
const AIRSPACE_DAYS = 7;
const atOf = (date: string) => Date.parse(`${date}T12:00:00Z`);
const dayDiff = (a: string, b: string) => Math.round((atOf(a) - atOf(b)) / DAY_MS);

const SERIES: [keyof CaseDay, string][] = [
  ["fxPct", "market.usdkrw_change_pct"],
  ["equityRel", "market.kr_equity_rel_pct"],
  ["defenseRel", "market.defense_rel_pct"],
  ["wikiPct", "psych.wiki_korea_attention"],
];

/** 그날까지 공개된 값만으로 지표 표를 만든다. 없는 지표는 '측정 불가' */
export function caseBoard(c: CaseFile, date: string, mediaHist: DayHistory | undefined): BoardRow[] {
  const at = atOf(date);
  const readings: Record<string, Reading> = {};
  const today = c.days.find((d) => d.date === date);
  for (const [key, id] of SERIES) {
    const v = today?.[key];
    if (typeof v === "number") readings[id] = evaluate(INDICATOR_BY_ID[id], v, at, undefined);
  }
  if (typeof today?.media === "number") {
    const id = "media.war_talk_24h";
    readings[id] = evaluate(INDICATOR_BY_ID[id], today.media, at, undefined, undefined, dayBaseline(mediaHist, date) ?? null);
  }
  // 날짜순으로 덮어쓴다 (파일 순서를 믿지 않는다), 모르는 지표 id 는 바로 실패
  for (const g of [...c.gov].sort((a, b) => a.date.localeCompare(b.date))) {
    if (g.date > date) continue;
    const def = INDICATOR_BY_ID[g.indicator];
    if (!def) throw new Error(`${c.id}: 모르는 지표 ${g.indicator}`);
    if (!def.absolute) throw new Error(`${c.id}: ${g.indicator} 는 고정 문턱 지표가 아니라 사건 값으로 판정할 수 없다`);
    readings[g.indicator] = evaluate(def, g.value, at, undefined, { what: g.what });
  }
  const air = c.airspace.filter((a) => a.date <= date && dayDiff(date, a.date) < AIRSPACE_DAYS).sort((a, b) => a.date.localeCompare(b.date));
  if (air.length) readings["air.civil_airborne"] = { indicator: "air.civil_airborne", value: 0, at, n: 0, state: "anomalous", meta: { what: air[air.length - 1].what } };
  return INDICATORS.map((d) => {
    const r = readings[d.id];
    return { id: d.id, label: d.label, group: d.group, groupLabel: d.group, unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, coverage: d.coverage, absolute: d.absolute, reading: r, stateLabel: !r ? "측정 불가" : r.state === "learning" ? "학습 중" : "측정", history: [] };
  });
}

export interface ReplayDay {
  date: string;
  phase: Phase;
  levels: Record<DomainId, Level>;
  /** 영역 수준의 합 */
  pressure: number;
  /** 보도량이 기준선으로 실제 판정됐나 (학습 중이 아님) */
  mediaJudged: boolean;
  /** 온도계 눈금 (WarRisk.gauge.now) — 전쟁 직전 대비 점수의 재료 */
  gauge: number;
  reasons: string[];
  hot: { id: string; pts: 1 | 2 }[];
}

export function replayCase(c: CaseFile): ReplayDay[] {
  let hist: DayHistory | undefined;
  for (const p of c.preroll) if (typeof p.media === "number") hist = addToDay(hist, p.media, atOf(p.date));
  return c.days.map((d) => {
    const board = caseBoard(c, d.date, hist);
    const w = assessWarRisk({ now: atOf(d.date), board, briefs: [], patterns: [] });
    if (typeof d.media === "number") hist = addToDay(hist, d.media, atOf(d.date));
    const levels = Object.fromEntries(w.domains.map((x) => [x.id, x.level])) as Record<DomainId, Level>;
    const hot: ReplayDay["hot"] = board.flatMap((r): ReplayDay["hot"] => (r.reading?.state === "anomalous" ? [{ id: r.id, pts: 2 }] : r.reading?.state === "elevated" ? [{ id: r.id, pts: 1 }] : []));
    const mediaJudged = !!board.find((b) => b.id === "media.war_talk_24h")?.reading && board.find((b) => b.id === "media.war_talk_24h")!.reading!.state !== "learning";
    return { date: d.date, phase: w.phase, mediaJudged, levels, pressure: w.domains.reduce((a, x) => a + x.level, 0), gauge: w.gauge.now, reasons: w.phaseReasons, hot };
  });
}

/** 전쟁 직전 대비 점수 눈금: 0 = 한반도 평소(평온 단계 기준점), 100 = 우크라이나 침공 전날 판정 */
export interface ReadinessScale {
  usualGauge: number;
  eveGauge: number;
}

export function readinessScore(gauge: number, s: ReadinessScale): number {
  const x = ((gauge - s.usualGauge) / (s.eveGauge - s.usualGauge)) * 100;
  if (!Number.isFinite(x) || s.eveGauge <= s.usualGauge) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** 평시로 보는 날인가 — 채점과 성적표가 같은 정의를 쓴다: 정답 30일 전보다 앞선 날, 전쟁 안 난 사례는 전부 */
export function isQuietDay(c: Pick<CaseFile, "truthDate">, date: string): boolean {
  return !c.truthDate || dayDiff(c.truthDate, date) > FORECAST_DAYS;
}

/** 위키 조회수 배율 (날짜 → 문서별 '어제 ÷ 그 전 28일 중앙값'의 중앙값 ×100). 운영 지표처럼 어제 자료까지만 쓴다 — 오늘·미래 조회수는 들어가지 않는다 */
export function wikiDaily(all: { name: string; series: Map<string, number> }[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let t = atOf(from) + 29 * DAY_MS; t <= atOf(to); t += DAY_MS) {
    const yesterday = new Date(t - DAY_MS).toISOString().slice(0, 10);
    const ratios = all.flatMap(({ name, series }) => {
      if (!series.has(yesterday)) return []; // 어제 값이 빠진 문서는 더 오래된 날을 '어제'로 착각하므로 뺀다 (11/6 검토)
      const r = articleRatio(name, new Map([...series].filter(([k]) => k <= yesterday)));
      return r ? [r.ratio] : [];
    }).sort((a, b) => a - b);
    if (ratios.length < 4) continue;
    const m = ratios.length >> 1;
    out.set(new Date(t).toISOString().slice(0, 10), Math.round((ratios.length % 2 ? ratios[m] : (ratios[m - 1] + ratios[m]) / 2) * 100));
  }
  return out;
}

export interface SignalScore {
  id: string;
  label: string;
  /** 정답 전에 처음 켜진 날 (없으면 undefined) */
  first?: string;
  /** 정답 며칠 전인가 */
  leadDays?: number;
  /** 창 전체에서 켜진 날 수 */
  hotDays: number;
  /** 평시(정답 30일 전보다 앞선 날, no_war 는 창 전체)에 켜진 날 수 */
  quietHotDays: number;
}

export interface CaseScore {
  id: string;
  name: string;
  outcome: CaseOutcome;
  truthDate?: string;
  days: number;
  /** 정답 전 3단계 이상이 처음 된 날 */
  firstCrisis?: string;
  crisisLeadDays?: number;
  firstImminent?: string;
  imminentLeadDays?: number;
  /** 정답 전날 단계 */
  eveLevel?: Phase;
  /** 정답 전날 영역 수준의 합 */
  evePressure?: number;
  /** 헛경보: no_war 는 창 전체, 전쟁 사례는 정답 30일 전보다 앞서 3단계 이상인 날 수 */
  falseAlarmDays: number;
  /** 평시 구간 날 수 (헛경보 비율의 분모) */
  quietDays: number;
  /** 단계가 바뀐 횟수 = 알림 횟수에 해당 (하루 단위 원값) */
  flips: number;
  caught: boolean;
  coverage: { domain: DomainId; label: string; measured: number; total: number }[];
  signals: SignalScore[];
}

/** 예보 기간이 30일이므로, 정답 30일 전보다 이른 경보는 맞힌 것으로 치지 않는다 */
export const FORECAST_DAYS = 30;

export function scoreCase(c: CaseFile, replay: ReplayDay[]): CaseScore {
  const before = c.truthDate ? replay.filter((r) => r.date < c.truthDate!) : replay;
  const lead = (d?: string) => (d && c.truthDate ? dayDiff(c.truthDate, d) : undefined);
  const inHorizon = (r: ReplayDay) => !isQuietDay(c, r.date);
  const quiet = before.filter((r) => !inHorizon(r));
  // 엄격 기준 (11/6 제3자 검토): 예보는 30일이므로 정답 30일 전보다 앞선 3단계 이상은 이어져 있어도 모두 헛경보다.
  // (한때 '정답까지 이어진 구간은 잡음'으로 셌더니 계속 켜져 있는 신호의 헛경보 31일이 숨었다.) 선행일은 그래서 최대 30일.
  const firstCrisis = before.find((r) => inHorizon(r) && r.phase >= 3)?.date;
  const firstImminent = before.find((r) => inHorizon(r) && r.phase >= 4)?.date;
  const falseAlarmDays = quiet.filter((r) => r.phase >= 3).length;
  const eve = c.truthDate ? before[before.length - 1] : undefined;
  let flips = 0;
  for (let i = 1; i < before.length; i++) if (before[i].phase !== before[i - 1].phase) flips++;

  // 측정 범위: 채점한 날 중 한 번이라도 값이 있었던 지표 (마지막 하루만 보면 일찍 끝난 영공 신호 등이 빠진다 — 11/6 검토)
  const measuredIds = new Set<string>();
  // '학습 중'(기준선 부족)은 판정에 쓰이지 않았으므로 측정으로 세지 않는다
  for (const r of before) for (const b of caseBoard(c, r.date, undefined)) if (b.reading && b.reading.state !== "learning") measuredIds.add(b.id);
  if (replay.some((r) => before.includes(r) && r.mediaJudged)) measuredIds.add("media.war_talk_24h");
  const coverage = DOMAINS.map((d) => ({ domain: d.id, label: d.label, total: d.indicators.length, measured: d.indicators.filter((i) => measuredIds.has(i)).length }));

  const ids = [...new Set(before.flatMap((r) => r.hot.map((h) => h.id)))]; // 정답일 당일·이후에만 켜진 신호는 표에 올리지 않는다
  const signals: SignalScore[] = ids.map((id) => {
    const on = before.filter((r) => r.hot.some((h) => h.id === id));
    const first = on.find(inHorizon)?.date;
    return { id, label: INDICATOR_BY_ID[id].label, first, leadDays: lead(first), hotDays: on.length, quietHotDays: on.filter((r) => !inHorizon(r)).length };
  }).sort((a, b) => (b.leadDays ?? -1) - (a.leadDays ?? -1));

  return {
    id: c.id, name: c.name, outcome: c.outcome, truthDate: c.truthDate, days: before.length,
    firstCrisis, crisisLeadDays: lead(firstCrisis), firstImminent, imminentLeadDays: lead(firstImminent),
    eveLevel: eve?.phase, evePressure: eve?.pressure,
    falseAlarmDays, quietDays: quiet.length,
    flips, caught: !!firstCrisis, coverage, signals,
  };
}
