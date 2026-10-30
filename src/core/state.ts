// 대시보드·에이전트가 공유하는 상태 스냅샷
import type { Store } from "./store.js";
import { latencyMetrics } from "./pipeline.js";
import { posture } from "./policy.js";
import { listSources } from "./sources.js";
import { briefEvent, currentThreat } from "./brief.js";
import type { Signal } from "./types.js";

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
  const enriched = events
    .map((e) => {
      const sigs = e.signalIds.map((id) => byId.get(id)).filter((x): x is Signal => !!x);
      return { ...e, signals: sigs, brief: briefEvent(e, sigs) };
    })
    .sort((a, b) => b.brief.at - a.brief.at);
  // 같은 도발을 뒤늦게 다룬 언론 단독 묶음은 앞선(근거가 더 강한) 사건의 후속 보도로 합친다
  for (const later of [...enriched]) {
    if (later.basis !== "media" || !later.brief.isProvocation) continue;
    const origin = enriched.find(
      (e) => e !== later && e.basis !== "media" && e.brief.isProvocation && later.brief.at - e.brief.at >= 0 && later.brief.at - e.brief.at < 18 * 3600_000 &&
        (!later.brief.weapon || !e.brief.weapon || later.brief.weapon === e.brief.weapon),
    );
    if (!origin) continue;
    origin.signals = [...origin.signals, ...later.signals];
    if (later.brief.latest && (!origin.brief.latest || later.brief.latest.at > origin.brief.latest.at)) origin.brief.latest = later.brief.latest;
    enriched.splice(enriched.indexOf(later), 1);
  }
  return {
    now,
    threat: currentThreat(enriched.map((e) => e.brief), now),
    posture: posture(events, now),
    lastCycle: lastCycle ? JSON.parse(lastCycle) : null,
    events: enriched,
    health: health.filter((h) => !disabled.has(h.source)),
    alerts: alerts.slice(-50).reverse(),
    notes,
    metrics: latencyMetrics(events),
    sources: listSources().filter((s) => !disabled.has(s.id)),
  };
}
