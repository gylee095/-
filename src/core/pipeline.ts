// 한 번의 감시 사이클: 수집 → 저장(중복 제거) → 상관분석 → 알림 판단 → 발송 → 기록
import { briefEvent } from "./brief.js";
import type { CollectResult, CrisisEvent, Env } from "./types.js";
import type { Store } from "./store.js";
import { healthOf } from "./store.js";
import { runCollectors } from "./collectors/index.js";
import { airspaceAnomaly, updateBaseline } from "./collectors/opensky.js";
import { correlate } from "./correlate.js";
import { decideAlerts, formatAlert, posture, type AlertDecision } from "./policy.js";
import { sendPush } from "./notify.js";

export const LOOKBACK_MS = 72 * 3600_000;

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
  alerts: { eventId: string; kind: AlertDecision["kind"]; title: string; sent: boolean; reason: string }[];
  suppressed: { eventId: string; title: string; reason: string }[];
  posture: ReturnType<typeof posture>;
}

export async function runCycle(env: Env, store: Store, opts: CycleOptions = {}): Promise<CycleReport> {
  const now = opts.now ?? Date.now();
  const results = opts.collect ? await opts.collect() : await runCollectors(env, opts.only, now);

  // 항공기 수 → 시간대별 기준선 갱신 및 급감 감지
  for (const r of results) {
    const airborne = r.meta?.airborne;
    if (airborne === undefined) continue;
    const key = `${r.source}:baseline:h${new Date(now + 9 * 3600_000).getUTCHours()}`;
    const prev = await store.getKv(key);
    const baseline = prev ? Number(prev) : undefined;
    const anomaly = airspaceAnomaly(airborne, baseline, now, undefined, r.source);
    if (anomaly) r.signals.push(anomaly);
    // 이상 상황에서는 기준선을 오염시키지 않는다
    else await store.setKv(key, String(updateBaseline(baseline, airborne)));
  }

  const newSignals = await store.putSignals(results.flatMap((r) => r.signals));
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

  return {
    at: now,
    sources: results.map((r) => ({ source: r.source, ok: r.ok, raw: r.rawCount, signals: r.signals.length, error: r.error, skipped: r.skipped })),
    newSignals,
    events,
    alerts,
    suppressed: suppressed.map((s) => ({ eventId: s.event.id, title: s.event.title, reason: s.reason })),
    posture: posture(events, now),
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
