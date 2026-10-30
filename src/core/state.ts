// 대시보드·에이전트가 공유하는 상태 스냅샷
import type { Store } from "./store.js";
import { latencyMetrics } from "./pipeline.js";
import { posture } from "./policy.js";
import { listSources } from "./sources.js";

export async function buildState(store: Store, since: number) {
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
    health,
    alerts: alerts.slice(-50).reverse(),
    notes,
    metrics: latencyMetrics(events),
    sources: listSources(),
  };
}
