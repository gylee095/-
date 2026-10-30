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
export async function processMetrics(store: Store, metrics: Metric[], now: number): Promise<Reading[]> {
  if (!metrics.length) return [];
  const raw = await store.getKv("baselines");
  const baselines: BaselineMap = raw ? JSON.parse(raw) : {};
  const readingsRaw = await store.getKv("readings");
  const latest: Record<string, Reading> = readingsRaw ? JSON.parse(readingsRaw) : {};
  const readings: Reading[] = [];
  for (const m of metrics) {
    const def = INDICATOR_BY_ID[m.indicator];
    if (!def) continue;
    const key = `${def.id}|${slotKey(def, now)}`;
    const prev = baselines[key];
    const reading = evaluate(def, m.value, now, prev, m.meta);
    readings.push(reading);
    latest[def.id] = reading;
    const due = !prev?.updatedAt || now - prev.updatedAt >= updateIntervalMs(def.slots);
    const contaminating = reading.state === "anomalous" && (prev?.n ?? 0) >= 10;
    if (due && !contaminating) baselines[key] = { ...updateBaseline(prev, m.value, alphaFor(def.slots)), updatedAt: now };
  }
  await store.setKv("baselines", JSON.stringify(baselines));
  await store.setKv("readings", JSON.stringify(latest));
  await store.putMetrics(readings);
  return readings;
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

  const signals = await store.getSignals(now - LOOKBACK_MS);
  const events = correlate(signals);
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
  await store.putEvents(events);

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
    sources: results.map((r) => ({ source: r.source, ok: r.ok, raw: r.rawCount, signals: r.signals.length, error: r.error, skipped: r.skipped })),
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
