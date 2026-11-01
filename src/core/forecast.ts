// 스스로 채점하는 예측 — "앞으로 30일(7일) 안에 큰 도발이 있을까" (2026-11-01).
// 전면전은 너무 드물어 채점할 수 없으므로, 자주 일어나 매달 채점할 수 있는 '큰 도발'(위험도 4 이상: ICBM·일본 상공·포격·위성·핵실험 등)을 맞힌다.
// 과거 10년 검증: '최근 180일 큰 도발 빈도'로 만든 예측이 평균값 찍기보다 2022~2026년에 27% 덜 틀렸다(브라이어 기술점수 +0.27).
// 긴장 온도계를 곱하면 오히려 나빠졌다(+0.23) — 온도계는 '지금 얼마나 뜨거운가', 이 예측은 '다음 달 큰 도발'.
// 매일 첫 예측을 남기고 30일 뒤 실제와 맞춰 점수를 매긴다. 근거: docs/INDICATORS.md 0.6
import type { Store } from "./store.js";
import type { EventBrief } from "./brief.js";
import type { RiskDay } from "./history.js";
import { FORECAST_CALIBRATION, MAJOR_DAYS, TENSION_TO } from "./tension_history.js";

const DAY = 86400_000;
const kday = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface MajorDay {
  d: string;
  what: string;
}

/** 큰 도발 날: CSIS 도발 일지(TENSION_TO 까지) + 그 뒤 시스템이 감지해 기록한 날 */
export async function loadMajorDays(store: Store): Promise<MajorDay[]> {
  const live: MajorDay[] = JSON.parse((await store.getKv("outcomes:major")) ?? "[]");
  const past = MAJOR_DAYS.map((d) => ({ d, what: "CSIS 도발 일지" }));
  const all = new Map<string, MajorDay>();
  for (const x of [...past, ...live.filter((x) => x.d > TENSION_TO)]) if (!all.has(x.d)) all.set(x.d, x);
  return [...all.values()].sort((a, b) => a.d.localeCompare(b.d));
}

/** 새로 감지한 큰 도발 날을 남긴다 (북한의 실제 도발, 위험도 4 이상 — 철수 보도·경보 단어는 아님) */
export async function recordMajorDays(store: Store, briefs: EventBrief[], now: number): Promise<number> {
  const fresh = briefs.filter((b) => b.isProvocation && !b.evacuation && !b.posture && b.danger.level >= 4 && now - b.at < 3 * DAY && b.at <= now + 3600_000);
  if (!fresh.length) return 0;
  const live: MajorDay[] = JSON.parse((await store.getKv("outcomes:major")) ?? "[]");
  const have = new Set(live.map((x) => x.d));
  let added = 0;
  for (const b of fresh) {
    const d = kday(b.at);
    if (have.has(d)) continue;
    live.push({ d, what: b.headline.slice(0, 80) });
    have.add(d);
    added++;
  }
  if (added) await store.setKv("outcomes:major", JSON.stringify(live.slice(-400)));
  return added;
}

export interface MajorForecast {
  /** 앞으로 30일·7일 안에 큰 도발이 있을 확률 (%) — 지난 10년 같은 빈도였던 날들의 실제 비율 */
  p30: number;
  p7: number;
  /** 아무 날이나 평균 (%) */
  base30: number;
  base7: number;
  /** 최근 180일 큰 도발 날 수와 가장 최근 날 */
  count180: number;
  last?: MajorDay;
}

function calibrated(raw: number, table: { base: number; bins: { upTo: number; p: number }[] }): number {
  const bin = table.bins.find((b) => raw <= b.upTo) ?? table.bins[table.bins.length - 1];
  return bin ? bin.p : table.base;
}

export function forecastMajor(days: MajorDay[], now: number): MajorForecast {
  const today = kday(now);
  const from = kday(now - 179 * DAY);
  const recent = days.filter((x) => x.d >= from && x.d <= today);
  const rate = (recent.length + 0.5) / 180;
  const raw30 = 1 - Math.exp(-rate * 30);
  const raw7 = 1 - Math.exp(-rate * 7);
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    p30: pct(calibrated(raw30, FORECAST_CALIBRATION.d30)),
    p7: pct(calibrated(raw7, FORECAST_CALIBRATION.d7)),
    base30: pct(FORECAST_CALIBRATION.d30.base),
    base7: pct(FORECAST_CALIBRATION.d7.base),
    count180: recent.length,
    last: [...days].reverse().find((x) => x.d <= today),
  };
}

export interface ForecastScore {
  /** 채점한 날 수 (30일이 지나 결과가 나온 날) */
  n: number;
  /** 브라이어 점수 (0 완벽, 낮을수록 좋음) — 우리 예측 vs 평균값 찍기 */
  brier?: number;
  brierBase?: number;
  /** 1 − 우리/평균 (0보다 크면 평균보다 잘 맞힘) */
  skill?: number;
  /** 첫 채점 가능한 날 */
  firstDue?: string;
}

/** 하루 기록의 첫 예측(그날 사건을 보기 전)을 30일 뒤 실제와 맞춘다 */
export function scoreForecasts(riskDays: RiskDay[], majors: MajorDay[], now: number): ForecastScore {
  const today = kday(now);
  const withF = riskDays.filter((r) => typeof r.p30First === "number").sort((a, b) => a.day.localeCompare(b.day));
  const due = withF.filter((r) => kday(toMs(r.day) + 30 * DAY) < today);
  if (!due.length) return { n: 0, firstDue: withF[0] ? kday(toMs(withF[0].day) + 31 * DAY) : undefined };
  const majorSet = majors.map((m) => m.d);
  let b = 0, b0 = 0;
  for (const r of due) {
    const end = kday(toMs(r.day) + 30 * DAY);
    const y = majorSet.some((d) => d > r.day && d <= end) ? 1 : 0;
    const p = r.p30First! / 100;
    b += (p - y) ** 2;
    b0 += (FORECAST_CALIBRATION.d30.base - y) ** 2;
  }
  const brier = b / due.length, brierBase = b0 / due.length;
  return { n: due.length, brier: +brier.toFixed(3), brierBase: +brierBase.toFixed(3), skill: brierBase > 0 ? +(1 - brier / brierBase).toFixed(2) : undefined };
}
