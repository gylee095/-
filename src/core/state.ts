// 대시보드·에이전트가 공유하는 상태 스냅샷
import type { Store } from "./store.js";
import { hourlySeries, latencyMetrics, type HourlyAgg } from "./pipeline.js";
import { posture } from "./policy.js";
import { listSources } from "./sources.js";
import { briefEvent, currentThreat } from "./brief.js";
import type { Reading, Signal } from "./types.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL } from "./indicators.js";
import type { Pattern } from "./patterns.js";
import { interpret } from "./interpret.js";
import { assessWarRisk } from "./warrisk.js";
import { loadMonthUsage } from "./deep.js";
import type { RiskSummary } from "./history.js";
import { liveInputs, tensionOf, tensionView } from "./tension.js";

export interface BoardRow {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
  unit: string;
  direction: "high" | "low" | "both";
  why: string;
  latency: string;
  caveats: string;
  /** 수집 범위가 좁아 0이 '없음'을 뜻하지 않는 이유 */
  coverage?: string;
  reading?: Reading;
  stateLabel: string;
  /** 최근 24시간 시간별 평균 (스파크라인) */
  history: { hour: number; avg: number }[];
}

/** disabledSources: 꺼 둔 소스는 과거 오류 기록이 남아 있어도 상태 목록에서 뺀다 */
export async function buildState(store: Store, since: number, disabledSources = "", budget?: { dailyMax: number; monthlyMax: number }) {
  const disabled = new Set(disabledSources.split(",").map((s) => s.trim()).filter(Boolean));
  const now = Date.now();
  // 전쟁 위험 모델은 최근 14일 사건(중대 사건·도발 빈도)을 본다 — 화면의 사건 목록은 요청한 기간만 보여 준다
  const modelSince = Math.min(since, now - 14 * 24 * 3600_000);
  // 저장소(D1) 무료 한도: 신호 표 전체·시계열 표 전체를 훑지 않는다. 사건은 근거 신호 사본(evidence)을 함께 갖고 있고,
  // 스파크라인은 KV 'hourly' 한 줄에서 읽는다.
  const [events, health, alerts, notes, lastCycle, readingsRaw, patternsRaw, hourlyRaw, d1Raw, historyRaw] = await Promise.all([
    store.getEvents(modelSince),
    store.getHealth(),
    store.getAlerts(since),
    store.getNotes(since),
    store.getKv("last_cycle"),
    store.getKv("readings"),
    store.getKv("patterns"),
    store.getKv("hourly"),
    store.getKv(`d1:${new Date(now).toISOString().slice(0, 10)}`),
    store.getKv("risk:summary"),
  ]);
  // 근거 사본이 없는 옛 사건(이 변경 전에 저장된 것)만 신호를 ID로 찾아 채우고, 한 번 다시 저장한다
  const missing = events.filter((e) => !e.evidence);
  if (missing.length) {
    const found = await store.getSignalsByIds(missing.flatMap((e) => e.signalIds));
    const byId = new Map(found.map((x) => [x.id, x]));
    for (const e of missing) e.evidence = e.signalIds.map((id) => byId.get(id)).filter((x): x is Signal => !!x).slice(-60);
    await store.putEvents(missing).catch(() => {});
  }
  const enriched = events
    .map(({ evidence, ...e }) => {
      const sigs = evidence ?? [];
      return { ...e, signals: sigs, brief: briefEvent(e, sigs) };
    })
    .sort((a, b) => b.brief.at - a.brief.at);
  const hourly: HourlyAgg = hourlyRaw ? JSON.parse(hourlyRaw) : {};
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

  const readings: Record<string, Reading> = readingsRaw ? JSON.parse(readingsRaw) : {};
  const board: BoardRow[] = INDICATORS.map((d) => {
    const r = readings[d.id];
    // 30시간 넘게 갱신이 없으면 측정 불가로 본다 (일간 지표 포함)
    const stale = r && now - r.at > 30 * 3600_000;
    return {
      id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, coverage: d.coverage,
      reading: r,
      stateLabel: !r || stale ? STATE_LABEL.unavailable : STATE_LABEL[r.state],
      history: hourlySeries(hourly, d.id, now - 24 * 3600_000),
    };
  });
  const patterns: { at: number; patterns: Pattern[] } = patternsRaw ? JSON.parse(patternsRaw) : { at: 0, patterns: [] };
  const livePatterns = now - patterns.at < 6 * 3600_000 ? patterns.patterns : [];
  const assessment = notes.find((n) => n.kind === "assessment");
  // 심층 분석: 최근 보고서(72시간 안)와 요청, 이번 달 사용량
  const deepReport = notes.find((n) => n.kind === "deep_report" && now - n.at < 72 * 3600_000);
  const deepRequest = notes.find((n) => n.kind === "deep_request");
  const usage = await loadMonthUsage(store, now);
  const threat = currentThreat(enriched.map((e) => e.brief), now);
  // 규칙 기반 해설: 숫자 → 뜻 → 조합 힌트 (클로드 분석관은 이 위에서 추론한다)
  const interpretation = interpret({ now, threat, board, patterns: livePatterns, briefs: enriched.map((e) => e.brief) });
  // 전쟁 위험: 다섯 영역 → 국면 5단계 → 30일 확률 범위
  const warRisk = assessWarRisk({ now, board, briefs: enriched.map((e) => e.brief), patterns: livePatterns });
  // 긴장 온도계: 지난 10년(2016~)과 같은 잣대로 잰 오늘의 위치
  const tensionNow = tensionOf(liveInputs(board, enriched.map((e) => e.brief), now));
  const tension = { ...tensionNow, view: tensionView(tensionNow) };

  return {
    now,
    threat,
    warRisk,
    tension,
    interpretation,
    posture: posture(events.filter((e) => e.firstDetectedTime >= since), now),
    lastCycle: lastCycle ? JSON.parse(lastCycle) : null,
    events: enriched.filter((e) => e.brief.at >= since || e.firstDetectedTime >= since),
    board,
    patterns: livePatterns,
    patternsAt: patterns.at,
    assessment,
    deepReport,
    deepRequest: deepRequest && { at: deepRequest.at, text: deepRequest.text, ok: (deepRequest.data as any)?.fire?.ok, id: (deepRequest.data as any)?.id },
    usage: { ...usage, budget },
    /** 판정 기록 요약 — 최근 90일 하루 최고값과 오늘의 순위 (2026-11-01부터 기록) */
    history: historyRaw ? (JSON.parse(historyRaw) as RiskSummary) : null,
    /** 오늘(UTC) 저장소 사용량 — 무료 한도: 읽기 500만 행, 쓰기 10만 행 (한국 시간 오전 9시 초기화) */
    storage: d1Raw ? { ...(JSON.parse(d1Raw) as { read: number; written: number; calls: number }), limitRead: 5_000_000, limitWritten: 100_000 } : null,
    health: health.filter((h) => !disabled.has(h.source)),
    alerts: alerts.slice(-50).reverse(),
    notes,
    metrics: latencyMetrics(events.filter((e) => e.firstDetectedTime >= since)),
    sources: listSources().filter((s) => !disabled.has(s.id)),
  };
}
