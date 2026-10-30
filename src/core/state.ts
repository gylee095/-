// 대시보드·에이전트가 공유하는 상태 스냅샷
import type { Store } from "./store.js";
import { latencyMetrics } from "./pipeline.js";
import { posture } from "./policy.js";
import { listSources } from "./sources.js";

/** disabledSources: 꺼 둔 소스는 과거 오류 기록이 남아 있어도 상태 목록에서 뺀다 */
export async function buildState(store: Store, since: number, disabledSources = "") {
  const disabled = new Set(disabledSources.split(",").map((s) => s.trim()).filter(Boolean));
  const now = Date.now();
  const [events, signals, health, alerts, notes, lastCycle] = await Promise.all([
    store.getEvents(since),
    store.getSignals(since),
    store.getHealth(),
    store.getAlerts(since),
    store.getNotes(since),
    store.getKv("last_cycle"),
  ]);
  const byId = new Map(signals.map((s) => [s.id, s]));
  return {
    now,
    posture: posture(events, now),
    lastCycle: lastCycle ? JSON.parse(lastCycle) : null,
    events: events.map((e) => ({ ...e, signals: e.signalIds.map((id) => byId.get(id)).filter(Boolean) })),
    health: health.filter((h) => !disabled.has(h.source)),
    alerts: alerts.slice(-50).reverse(),
    notes,
    metrics: latencyMetrics(events),
    sources: listSources().filter((s) => !disabled.has(s.id)),
  };
}
