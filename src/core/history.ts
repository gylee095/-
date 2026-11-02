// 판정 기록 — 자동 판정(단계·30일 확률·영역 수준)을 시간마다·하루마다 영구히 남겨 "지금이 지난 기록 중 어디쯤인가"를 본다.
// 5분 주기마다 오늘 하루의 최고·평균을 갱신하고, 한 시간에 한 번 그 순간을 남긴다. 보관 기간 제한 없음 (하루 24+1 줄).
import type { Store } from "./store.js";
import type { DomainId, Level, Phase, WarRisk } from "./warrisk.js";

export interface RiskSnapshot {
  at: number;
  phase: Phase;
  /** 30일 국지 충돌 % (판정 범위 안의 점) */
  clash: number;
  /** 30일 전면전 % */
  war: number;
  levels: Partial<Record<DomainId, Level>>;
  /** 판정의 주요 근거 (앞의 몇 개) */
  why: string[];
  /** 긴장 온도계 (과거 10년 같은 잣대) — 계산되면 함께 남긴다 */
  tension?: { raw: number; pct: number };
  /** 앞으로 30일 큰 도발 확률 (%) — 스스로 채점하는 예측 (forecast.ts) */
  p30?: number;
}

export interface RiskDay {
  /** 한국 날짜 YYYY-MM-DD */
  day: string;
  /** 이 날 기록한 판정 횟수 (5분마다) */
  n: number;
  maxPhase: Phase;
  maxClash: number;
  avgClash: number;
  maxWar: number;
  /** 가장 높았던 순간 */
  peak: RiskSnapshot;
  maxTension?: number;
  maxTensionPct?: number;
  /** 그날 첫 예측 (그날 사건을 보기 전) — 30일 뒤 채점에 쓴다 */
  p30First?: number;
}

export interface RiskSummary {
  at: number;
  /** 기록이 있는 날 수와 첫날 */
  days: number;
  since?: string;
  /** 최근 90일 (오래된 → 최근) */
  recent: { d: string; phase: number; clash: number; tension?: number }[];
  today?: { d: string; phase: number; clash: number; tension?: number; tensionPct?: number };
  /** 오늘이 기록된 날 중 국지 충돌 확률이 몇 번째로 높은지 (1 = 가장 높음) */
  rank?: { clash: number; of: number; window: number };
  /** 스스로 채점: 30일이 지난 예측의 점수 */
  score?: import("./forecast.js").ForecastScore;
}

export const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 차트용 시간별 점 (주식 차트처럼) — KV 하나에 30일(720점)만 가볍게. 영역 수준은 정부·엘리트·돈·군사·북한·사람들 순서의 숫자 6자리 */
export interface RiskPoint {
  /** 정시 (ms) */
  t: number;
  ph: Phase;
  /** 30일 국지 충돌 % */
  c: number;
  /** 30일 전면전 % */
  w: number;
  lv: string;
  /** 긴장 온도계 백분위 */
  tp?: number;
  /** 30일 큰 도발 확률 % */
  p?: number;
}
export const DOMAIN_ORDER: DomainId[] = ["gov", "elite", "money", "military", "nkwords", "public"];
export const SERIES_KEY = "risk:series";
export const SERIES_DAYS = 30;

export function pointOf(s: RiskSnapshot): RiskPoint {
  return {
    t: Math.floor(s.at / 3600_000) * 3600_000,
    ph: s.phase,
    c: +s.clash.toFixed(2),
    w: +s.war.toFixed(2),
    lv: DOMAIN_ORDER.map((d) => s.levels[d] ?? 0).join(""),
    ...(s.tension ? { tp: s.tension.pct } : {}),
    ...(s.p30 !== undefined ? { p: s.p30 } : {}),
  };
}

/** 차트 점 읽기 — KV 가 비어 있으면(처음) 시간별 판정 기록 표에서 30일치를 만든다 */
export async function loadSeries(store: Store, now: number): Promise<RiskPoint[]> {
  const raw = await store.getKv(SERIES_KEY);
  if (raw) return JSON.parse(raw) as RiskPoint[];
  return (await store.getRiskHourly(now - SERIES_DAYS * 86400_000)).map(pointOf);
}

/** 한 시간에 한 번: 차트 점을 더하고 30일 넘은 점은 뺀다 */
export async function appendSeries(store: Store, s: RiskSnapshot): Promise<RiskPoint[]> {
  const p = pointOf(s);
  const pts = (await loadSeries(store, s.at)).filter((x) => x.t !== p.t && x.t >= p.t - SERIES_DAYS * 86400_000);
  pts.push(p);
  pts.sort((a, b) => a.t - b.t);
  await store.setKv(SERIES_KEY, JSON.stringify(pts));
  return pts;
}

export function snapshotOf(w: WarRisk, tension?: { raw: number; pct: number }, p30?: number): RiskSnapshot {
  const levels: Partial<Record<DomainId, Level>> = {};
  for (const d of w.domains) levels[d.id] = d.level;
  return { at: w.at, phase: w.phase, clash: w.clash30d.point, war: w.war30d.point, levels, why: w.phaseReasons.slice(0, 3).map((r) => r.slice(0, 140)), ...(tension ? { tension } : {}), ...(p30 !== undefined ? { p30 } : {}) };
}

/** 오늘의 하루 기록에 이번 판정을 더한다 */
export function foldDay(prev: RiskDay | undefined, s: RiskSnapshot): RiskDay {
  const day = kstDay(s.at);
  if (!prev || prev.day !== day) {
    return { day, n: 1, maxPhase: s.phase, maxClash: s.clash, avgClash: s.clash, maxWar: s.war, peak: s, maxTension: s.tension?.raw, maxTensionPct: s.tension?.pct, p30First: s.p30 };
  }
  const n = prev.n + 1;
  const higher = s.clash > prev.peak.clash || s.phase > prev.peak.phase;
  return {
    day,
    n,
    maxPhase: Math.max(prev.maxPhase, s.phase) as Phase,
    maxClash: Math.max(prev.maxClash, s.clash),
    avgClash: +((prev.avgClash * prev.n + s.clash) / n).toFixed(3),
    maxWar: Math.max(prev.maxWar, s.war),
    peak: higher ? s : prev.peak,
    maxTension: s.tension ? Math.max(prev.maxTension ?? -Infinity, s.tension.raw) : prev.maxTension,
    maxTensionPct: s.tension ? Math.max(prev.maxTensionPct ?? -Infinity, s.tension.pct) : prev.maxTensionPct,
    p30First: prev.p30First ?? s.p30,
  };
}

export function summarize(days: RiskDay[], now: number, window = 90): RiskSummary {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const today = sorted.find((d) => d.day === kstDay(now));
  const recent = sorted.slice(-window).map((d) => ({ d: d.day, phase: d.maxPhase, clash: +d.maxClash.toFixed(2), ...(d.maxTension !== undefined ? { tension: +d.maxTension.toFixed(2) } : {}) }));
  let rank: RiskSummary["rank"];
  if (today) {
    const pool = sorted.slice(-window);
    rank = { clash: 1 + pool.filter((d) => d.maxClash > today.maxClash).length, of: pool.length, window };
  }
  return {
    at: now,
    days: sorted.length,
    since: sorted[0]?.day,
    recent,
    today: today && { d: today.day, phase: today.maxPhase, clash: +today.maxClash.toFixed(2), tension: today.maxTension, tensionPct: today.maxTensionPct },
    rank,
  };
}

/** 5분 주기에서 부른다: 오늘 기록 갱신, 한 시간에 한 번 순간 기록과 요약 갱신 */
export async function recordRisk(store: Store, w: WarRisk, tension?: { raw: number; pct: number }, p30?: number): Promise<{ hourly: boolean }> {
  const s = snapshotOf(w, tension, p30);
  const day = kstDay(s.at);
  const prev = await store.getRiskDay(day);
  await store.putRiskDay(foldDay(prev, s));
  const hour = Math.floor(s.at / 3600_000);
  const lastHour = Number((await store.getKv("risk:lastHour")) ?? 0);
  if (hour === lastHour) return { hourly: false };
  await store.putRiskHourly(s);
  await appendSeries(store, s);
  await store.setKv("risk:lastHour", String(hour));
  const days = await store.getRiskDays(kstDay(s.at - 400 * 86400_000));
  const { loadMajorDays, scoreForecasts } = await import("./forecast.js");
  const score = scoreForecasts(days, await loadMajorDays(store), s.at);
  await store.setKv("risk:summary", JSON.stringify({ ...summarize(days, s.at), score }));
  return { hourly: true };
}
