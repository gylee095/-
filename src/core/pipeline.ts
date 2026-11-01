// 한 번의 감시 사이클: 수집 → 저장(중복 제거) → 상관분석 → 징후 기준선 비교 → 패턴 탐지 → 알림 판단 → 발송 → 기록
import { briefEvent } from "./brief.js";
import type { CollectResult, CrisisEvent, Env, Metric, Reading, Signal } from "./types.js";
import type { Store } from "./store.js";
import { healthOf } from "./store.js";
import { runCollectors } from "./collectors/index.js";
import { correlate } from "./correlate.js";
import { decideAlerts, formatAlert, posture, type AlertDecision } from "./policy.js";
import { sendPush } from "./notify.js";
import { INDICATOR_BY_ID, evaluate, slotKey, updateBaseline, type Baseline } from "./indicators.js";
import { detectPatterns, type Pattern } from "./patterns.js";
import { hash } from "./util.js";

export const LOOKBACK_MS = 72 * 3600_000;
/** 같은 패턴은 이 간격 안에서 한 번만 알린다 (신뢰도가 올라가면 다시 알림) */
const PATTERN_ALERT_INTERVAL = 6 * 3600_000;

export interface CycleOptions {
  only?: string[];
  dryRun?: boolean;
  now?: number;
  /** 테스트용: 수집 단계를 대체 */
  collect?: () => Promise<CollectResult[]>;
  fetchImpl?: typeof fetch;
  /** 1분 주기 속보 감시: 새 신호가 없으면 상관분석·알림 판단·패턴을 건너뛴다 (5분 주기가 매번 전체를 돈다) */
  quietSkip?: boolean;
}

export interface CycleReport {
  at: number;
  sources: { source: string; ok: boolean; raw: number; signals: number; error?: string; skipped?: string }[];
  newSignals: number;
  events: CrisisEvent[];
  alerts: { eventId: string; kind: AlertDecision["kind"] | "pattern"; title: string; sent: boolean; reason: string }[];
  suppressed: { eventId: string; title: string; reason: string }[];
  posture: ReturnType<typeof posture>;
  readings: Reading[];
  patterns: Pattern[];
  /** 건너뛴 단계와 이유 (예: 새 신호 없음) */
  skipped?: string;
}

type BaselineMap = Record<string, Baseline & { updatedAt?: number }>;

/** 기준선 갱신 간격: 시간대 구간은 매 표본, 6시간 블록은 15분, 하루 구간은 1시간 */
function updateIntervalMs(slots: 24 | 4 | 1): number {
  return slots === 24 ? 0 : slots === 4 ? 15 * 60_000 : 60 * 60_000;
}

/** 기준선 기억 길이: 하루 구간은 더 길게 (약 3일), 나머지는 약 33 표본 */
function alphaFor(slots: 24 | 4 | 1): number {
  return slots === 1 ? 0.015 : 0.03;
}

/** 관측값을 기준선과 비교하고 기준선을 갱신한다. 이상치는 기준선에 반영하지 않는다(오염 방지). */
/** 시계열 표에 같은 지표를 다시 기록하는 최소 간격 (상태가 바뀌면 바로 기록).
 *  시계열 한 줄 = 쓰기 3행(표 + 인덱스 2개) — 5분마다 쓰면 하루 쓰기 한도(10만 행)의 절반을 먹어서 15분으로 둔다 (2026-11-01 실측).
 *  기준선은 KV 에서 매 표본 갱신되므로 판정에는 영향이 없다. */
export const METRIC_WRITE_INTERVAL_MS = 15 * 60_000 - 20_000;

/** 지표별 시간별 합계 — 대시보드 스파크라인용. 시계열 표를 매번 훑지 않도록 KV 한 줄에 모아 둔다. { 지표: { 시(epoch/3600000): [합, 개수] } } */
export type HourlyAgg = Record<string, Record<string, [number, number]>>;

export function addHourly(agg: HourlyAgg, readings: Reading[], now: number, keepHours = 26): HourlyAgg {
  for (const r of readings) {
    const hour = String(Math.floor(r.at / 3600_000));
    const byHour = (agg[r.indicator] ??= {});
    const cur = byHour[hour] ?? [0, 0];
    byHour[hour] = [+(cur[0] + r.value).toFixed(4), cur[1] + 1];
  }
  const oldest = Math.floor(now / 3600_000) - keepHours;
  for (const ind of Object.keys(agg)) {
    for (const h of Object.keys(agg[ind])) if (Number(h) < oldest) delete agg[ind][h];
    if (!Object.keys(agg[ind]).length) delete agg[ind];
  }
  return agg;
}

export function hourlySeries(agg: HourlyAgg, indicator: string, since: number): { hour: number; avg: number }[] {
  const from = Math.floor(since / 3600_000);
  return Object.entries(agg[indicator] ?? {})
    .map(([h, [sum, n]]) => ({ hour: Number(h), avg: +(sum / n).toFixed(2) }))
    .filter((x) => x.hour >= from)
    .sort((a, b) => a.hour - b.hour);
}

export async function processMetrics(store: Store, metrics: Metric[], now: number): Promise<Reading[]> {
  if (!metrics.length) return [];
  const raw = await store.getKv("baselines");
  const baselines: BaselineMap = raw ? JSON.parse(raw) : {};
  const readingsRaw = await store.getKv("readings");
  const latest: Record<string, Reading> = readingsRaw ? JSON.parse(readingsRaw) : {};
  const hourlyRaw = await store.getKv("hourly");
  const hourly: HourlyAgg = hourlyRaw ? JSON.parse(hourlyRaw) : {};
  const readings: Reading[] = [];
  const toWrite: Reading[] = [];
  for (const m of metrics) {
    const def = INDICATOR_BY_ID[m.indicator];
    if (!def) continue;
    const key = `${def.id}|${slotKey(def, now)}`;
    const prev = baselines[key];
    const reading = evaluate(def, m.value, now, prev, m.meta);
    // 시계열 표에는 15분에 한 번만 남긴다 (상태가 바뀐 순간은 바로) — D1 무료 쓰기 한도 절약
    const last = latest[def.id];
    const write = !last?.writtenAt || now - last.writtenAt >= METRIC_WRITE_INTERVAL_MS || last.state !== reading.state;
    reading.writtenAt = write ? now : last!.writtenAt;
    if (write) toWrite.push(reading);
    readings.push(reading);
    latest[def.id] = reading;
    const due = !prev?.updatedAt || now - prev.updatedAt >= updateIntervalMs(def.slots);
    const contaminating = reading.state === "anomalous" && (prev?.n ?? 0) >= 10;
    if (due && !contaminating) baselines[key] = { ...updateBaseline(prev, m.value, alphaFor(def.slots)), updatedAt: now };
  }
  await store.setKv("baselines", JSON.stringify(baselines));
  await store.setKv("readings", JSON.stringify(latest));
  await store.setKv("hourly", JSON.stringify(addHourly(hourly, readings, now)));
  await store.putMetrics(toWrite);
  return readings;
}

/** 사건 저장 여부 판단용 지문 — 바뀐 사건만 다시 쓴다 */
export function eventFingerprint(e: CrisisEvent): string {
  const { evidence: _ev, ...rest } = e;
  return hash(JSON.stringify(rest) + "|" + (e.evidence ?? []).length);
}

/** 민항기 급감 → 공역 이상 신호 (사건 목록에도 올린다) */
function airspaceSignal(readings: Reading[], now: number): Signal | null {
  const r = readings.find((x) => x.indicator === "air.civil_airborne");
  if (!r || r.state !== "anomalous" || r.baseline === undefined || r.value >= r.baseline || r.baseline < 15) return null;
  return {
    id: `adsb_lol:airspace:${Math.floor(now / (30 * 60_000))}`,
    source: "adsb_lol",
    sourceKind: "sensor",
    category: "airspace_anomaly",
    title: `한반도 상공 항공기 급감: ${r.value}대 (이 시간대 평소 ${r.baseline.toFixed(0)}대)`,
    summary: `z=${r.z?.toFixed(1)} · 공역 통제 가능성. 단, 기상·수신기 장애·명절일 수 있음`,
    url: "https://adsb.lol/?lat=36.8&lon=127.6&zoom=6",
    lat: 37.5,
    lon: 127.5,
    publishedTime: now,
    detectedTime: now,
    severity: r.value < r.baseline * 0.2 ? 60 : 45,
  };
}

export async function runCycle(env: Env, store: Store, opts: CycleOptions = {}): Promise<CycleReport> {
  const now = opts.now ?? Date.now();
  const results = opts.collect ? await opts.collect() : await runCollectors(env, opts.only, now, store);

  // 징후 관측값 → 기준선 비교
  const readings = await processMetrics(store, results.flatMap((r) => r.metrics ?? []), now);
  const air = airspaceSignal(readings, now);
  const incoming = results.flatMap((r) => r.signals);
  if (air) incoming.push(air);

  const newSignals = await store.putSignals(incoming);
  await store.putHealth(results.map(healthOf));

  const sources = results.map((r) => ({ source: r.source, ok: r.ok, raw: r.rawCount, signals: r.signals.length, error: r.error, skipped: r.skipped }));
  if (opts.quietSkip && newSignals === 0) {
    // 새 신호가 없으면 사건·알림이 바뀔 것이 없다. 시간이 지나 풀리는 것(재시도·시간당 한도)은 5분 주기가 처리한다.
    return { at: now, sources, newSignals, events: [], alerts: [], suppressed: [], posture: posture([], now), readings, patterns: [], skipped: "새 신호 없음 — 상관분석 생략" };
  }

  const signals = await store.getSignals(now - LOOKBACK_MS);
  const events = correlate(signals);
  // 사건마다 근거 신호 사본을 붙여 둔다 — 대시보드·전쟁 모델이 신호 표를 다시 읽지 않도록
  const sigById = new Map(signals.map((s) => [s.id, s]));
  for (const e of events) e.evidence = e.signalIds.map((id) => sigById.get(id)).filter((x): x is Signal => !!x).slice(-60);
  const history = await store.getAlerts(now - 7 * 86400_000);
  const { send, suppressed } = decideAlerts(events, history, now);

  const alerts: CycleReport["alerts"] = [];
  for (const d of send) {
    const ids = new Set(d.event.signalIds);
    const msg = formatAlert(d, env.DASHBOARD_URL, briefEvent(d.event, signals.filter((s) => ids.has(s.id))));
    let ok = true;
    let error: string | undefined;
    let channel = "dry-run";
    if (!opts.dryRun) {
      const res = await sendPush(env, { ...msg, url: env.DASHBOARD_URL ? `${env.DASHBOARD_URL}#${d.event.id}` : undefined }, opts.fetchImpl);
      ok = res.some((r) => r.ok);
      error = res.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join("; ") || undefined;
      channel = res.map((r) => r.channel).join(",");
    }
    if (ok && !d.event.alertedTime) d.event.alertedTime = now;
    if (!opts.dryRun) {
      await store.logAlert({ eventId: d.event.id, sentAt: now, status: d.event.status, severity: d.event.severity, title: msg.title, body: msg.body, channel, ok, error });
    }
    alerts.push({ eventId: d.event.id, kind: d.kind, title: msg.title, sent: ok && !opts.dryRun, reason: error ?? d.reason });
  }
  // 바뀐 사건만 쓴다 (매 사이클 72시간 치 사건 전체를 다시 쓰면 D1 무료 쓰기 한도를 넘는다)
  const fpRaw = await store.getKv("events:fp");
  const fpPrev: Record<string, string> = fpRaw ? JSON.parse(fpRaw) : {};
  const fpNow: Record<string, string> = {};
  const changed: CrisisEvent[] = [];
  for (const e of events) {
    fpNow[e.id] = eventFingerprint(e);
    if (fpPrev[e.id] !== fpNow[e.id]) changed.push(e);
  }
  await store.putEvents(changed);
  if (changed.length || Object.keys(fpPrev).length !== events.length) await store.setKv("events:fp", JSON.stringify(fpNow));

  // 패턴 탐지 (최신 관측값 전체 기준)
  const latestRaw = await store.getKv("readings");
  const latest: Record<string, Reading> = latestRaw ? JSON.parse(latestRaw) : {};
  const patterns = detectPatterns(latest, events, now);
  await store.setKv("patterns", JSON.stringify({ at: now, patterns }));
  for (const p of patterns) {
    if (p.confidence === "low") continue;
    const key = `pattern_alert:${p.id}`;
    const prevRaw = await store.getKv(key);
    const prev = prevRaw ? (JSON.parse(prevRaw) as { at: number; confidence: string; ok?: boolean; failures?: number }) : undefined;
    const upgraded = prev && prev.confidence === "medium" && p.confidence === "high";
    // 성공 후 6시간 억제. 실패했으면 30분 뒤 재시도하되 3회까지만 (푸시 설정 오류로 매 분 재시도하지 않도록)
    const failures = prev?.ok === false ? (prev.failures ?? 1) : 0;
    const retryAfter = prev?.ok === false ? 30 * 60_000 : PATTERN_ALERT_INTERVAL;
    if (prev && !upgraded && (now - prev.at < retryAfter || failures >= 3)) continue;
    const title = `[패턴 감지·미확인] ${p.name}`;
    const body = [
      `신뢰도 ${p.confidence === "high" ? "높음" : "보통"} (점수 ${p.score}) · 근거: ${p.summary}`,
      `다른 설명 가능: ${p.alternatives[0]}`,
      "자동 탐지된 징후 조합입니다. 사건이 확인된 것이 아니며, 클로드 분석과 공식 발표를 확인하세요.",
      env.DASHBOARD_URL ? `${env.DASHBOARD_URL}#patterns` : "",
    ].filter(Boolean).join("\n");
    let ok = true;
    if (!opts.dryRun) {
      const res = await sendPush(env, { title, body, priority: p.confidence === "high" ? 4 : 3, url: env.DASHBOARD_URL }, opts.fetchImpl);
      ok = res.some((r) => r.ok);
      const error = res.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join("; ") || undefined;
      await store.logAlert({ eventId: `pattern:${p.id}`, sentAt: now, status: "UNVERIFIED", severity: p.score, title, body, channel: res.map((r) => r.channel).join(","), ok, error });
      await store.setKv(key, JSON.stringify({ at: now, confidence: p.confidence, ok, failures: ok ? 0 : failures + 1 }));
    }
    alerts.push({ eventId: `pattern:${p.id}`, kind: "pattern", title, sent: ok && !opts.dryRun, reason: `패턴 신뢰도 ${p.confidence}` });
  }

  return {
    at: now,
    sources,
    newSignals,
    events,
    alerts,
    suppressed: suppressed.map((s) => ({ eventId: s.event.id, title: s.event.title, reason: s.reason })),
    posture: posture(events, now),
    readings,
    patterns,
  };
}

/** 뉴스 대비 리드타임 등 성능 지표 */
export function latencyMetrics(events: CrisisEvent[]) {
  const rows = events
    .filter((e) => e.alertedTime)
    .map((e) => ({
      id: e.id,
      title: e.title,
      eventToAlertMin: e.eventTime ? (e.alertedTime! - e.eventTime) / 60_000 : undefined,
      publishToDetectMin: e.firstPublishedTime ? (e.firstDetectedTime - e.firstPublishedTime) / 60_000 : undefined,
      detectToAlertMin: (e.alertedTime! - e.firstDetectedTime) / 60_000,
      // 양수 = 첫 언론 보도보다 먼저 알림
      leadVsMediaMin: e.firstMediaTime ? (e.firstMediaTime - e.alertedTime!) / 60_000 : undefined,
    }));
  const leads = rows.map((r) => r.leadVsMediaMin).filter((x): x is number => x !== undefined);
  return {
    alertedEvents: rows.length,
    withMediaComparison: leads.length,
    beatMediaCount: leads.filter((x) => x > 0).length,
    medianLeadMin: leads.length ? leads.sort((a, b) => a - b)[Math.floor(leads.length / 2)] : undefined,
    rows,
  };
}
