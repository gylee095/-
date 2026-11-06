// 외국 전쟁 사례집 재생 — 지금 판정 규칙(evaluate·assessWarRisk)에 사례의 하루치 신호를 그대로 넣어 채점한다 (docs/ROADMAP.md 1순위).
// 규칙을 복사하지 않는다: 운영 코드가 바뀌면 채점도 같이 바뀌어야 "같은 시험지로 1.0 vs 2.0"을 비교할 수 있다.
// 자료가 없는 신호는 값을 지어내지 않고 '측정 불가'로 둔다 — 그래서 성적표에 측정 범위(coverage)를 함께 적는다.
import { DOMAINS, assessWarRisk, type DomainId, type Level, type Phase } from "./warrisk.js";
import { INDICATORS, INDICATOR_BY_ID, addToDay, dayBaseline, evaluate, type DayHistory } from "./indicators.js";
import type { BoardRow } from "./state.js";
import type { Reading } from "./types.js";

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
  for (const g of c.gov) {
    if (g.date > date) continue;
    readings[g.indicator] = evaluate(INDICATOR_BY_ID[g.indicator], g.value, at, undefined, { what: g.what });
  }
  const air = c.airspace.filter((a) => a.date <= date && dayDiff(date, a.date) < AIRSPACE_DAYS);
  if (air.length) readings["air.civil_airborne"] = { indicator: "air.civil_airborne", value: 0, at, n: 0, state: "anomalous", meta: { what: air[air.length - 1].what } };
  return INDICATORS.map((d) => {
    const r = readings[d.id];
    return { id: d.id, label: d.label, group: d.group, groupLabel: d.group, unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, coverage: d.coverage, absolute: d.absolute, reading: r, stateLabel: r ? "측정" : "측정 불가", history: [] };
  });
}

export interface ReplayDay {
  date: string;
  phase: Phase;
  levels: Record<DomainId, Level>;
  /** 영역 수준의 합 */
  pressure: number;
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
    return { date: d.date, phase: w.phase, levels, pressure: w.domains.reduce((a, x) => a + x.level, 0), gauge: w.gauge.now, reasons: w.phaseReasons, hot };
  });
}

/** 전쟁 직전 대비 점수 눈금: 0 = 한반도 평소(평온 단계 기준점), 100 = 우크라이나 침공 전날 판정 */
export interface ReadinessScale {
  usualGauge: number;
  eveGauge: number;
}

export function readinessScore(gauge: number, s: ReadinessScale): number {
  const x = ((gauge - s.usualGauge) / (s.eveGauge - s.usualGauge)) * 100;
  return Math.max(0, Math.min(100, Math.round(x)));
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
  /** 헛것으로 켜진 날 수: 정답 30일 안까지 이어지지 못하고 그 전에 꺼진 날들 (no_war 는 켜진 날 전부) */
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
  const inHorizon = (r: ReplayDay) => (c.truthDate ? dayDiff(c.truthDate, r.date) <= FORECAST_DAYS : false);
  const quiet = before.filter((r) => !inHorizon(r));
  // 3단계 이상이 이어진 구간 단위로 본다: 정답 30일 안까지 이어진 구간은 '잡음'(시작일이 선행일), 그 전에 끝난 구간은 헛경보
  const runsOf = (on: (r: ReplayDay) => boolean) => {
    const out: ReplayDay[][] = [];
    let open = false;
    for (const r of before) {
      if (!on(r)) { open = false; continue; }
      if (open) out[out.length - 1].push(r);
      else out.push([r]);
      open = true;
    }
    return { live: out.find((run) => run.some(inHorizon)), stale: out.filter((run) => !run.some(inHorizon)).reduce((a, run) => a + run.length, 0) };
  };
  const crisis = runsOf((r) => r.phase >= 3);
  const firstCrisis = crisis.live?.[0].date;
  const firstImminent = runsOf((r) => r.phase >= 4).live?.[0].date;
  const falseAlarmDays = crisis.stale;
  const eve = c.truthDate ? before[before.length - 1] : undefined;
  let flips = 0;
  for (let i = 1; i < before.length; i++) if (before[i].phase !== before[i - 1].phase) flips++;

  const last = before[before.length - 1]?.date ?? c.end;
  const board = caseBoard(c, last, undefined);
  const mediaMeasured = c.days.some((d) => typeof d.media === "number");
  const measuredIds = new Set(board.filter((r) => r.reading).map((r) => r.id));
  if (mediaMeasured) measuredIds.add("media.war_talk_24h");
  const coverage = DOMAINS.map((d) => ({ domain: d.id, label: d.label, total: d.indicators.length, measured: d.indicators.filter((i) => measuredIds.has(i)).length }));

  const ids = [...new Set(replay.flatMap((r) => r.hot.map((h) => h.id)))];
  const signals: SignalScore[] = ids.map((id) => {
    const runs = runsOf((r) => r.hot.some((h) => h.id === id));
    const first = runs.live?.[0].date;
    const hotDays = before.filter((r) => r.hot.some((h) => h.id === id)).length;
    return { id, label: INDICATOR_BY_ID[id].label, first, leadDays: lead(first), hotDays, quietHotDays: runs.stale };
  }).sort((a, b) => (b.leadDays ?? -1) - (a.leadDays ?? -1));

  return {
    id: c.id, name: c.name, outcome: c.outcome, truthDate: c.truthDate, days: before.length,
    firstCrisis, crisisLeadDays: lead(firstCrisis), firstImminent, imminentLeadDays: lead(firstImminent),
    eveLevel: eve?.phase, evePressure: eve?.pressure,
    falseAlarmDays, quietDays: quiet.length,
    flips, caught: !!firstCrisis, coverage, signals,
  };
}
