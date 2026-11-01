// 알림 정책: '중요한 새 사건'만 푸시. 오탐 억제·중복 억제·속도 제한·정정 알림.
import type { EventBrief } from "./brief.js";
import type { AlertRecord, CrisisEvent, EventStatus } from "./types.js";
import { statusRank } from "./correlate.js";

export const THRESHOLDS: Record<EventStatus, number> = {
  CONFIRMED: 60,
  CORROBORATED: 65,
  UNVERIFIED: 85, // 단일 미확인 신호는 매우 높은 심각도일 때만, '미확인' 표기와 함께
};
export const MAX_ALERTS_PER_HOUR = 5;
/** 공식발표(합참·日방위성 등)를 인용한 [속보]는 교차확인 전이라도 이 심각도 이상이면 즉시 알린다 (속도 우선) */
export const BREAKING_QUOTE_THRESHOLD = 70;
const RESEND_SEVERITY_JUMP = 15;
/** 발송 실패 시 다음 사이클에서 재시도하는 최대 횟수 */
export const MAX_SEND_RETRIES = 3;
/** 처음 감지했을 때 이미 이만큼 지난 사건은 '새 사건'으로 알리지 않는다 (재배포·장애 복구 시 과거 기사 폭주 방지) */
export const STALE_MS = 6 * 3600_000;

export type AlertKind = "new" | "upgrade" | "correction";

export interface AlertDecision {
  event: CrisisEvent;
  kind: AlertKind;
  reason: string;
}

export function decideAlerts(events: CrisisEvent[], history: AlertRecord[], now = Date.now()): { send: AlertDecision[]; suppressed: { event: CrisisEvent; reason: string }[] } {
  const send: AlertDecision[] = [];
  const suppressed: { event: CrisisEvent; reason: string }[] = [];
  const lastByEvent = new Map<string, AlertRecord>();
  for (const a of history) if (a.ok) {
    const prev = lastByEvent.get(a.eventId);
    if (!prev || prev.sentAt < a.sentAt) lastByEvent.set(a.eventId, a);
  }
  const failures = new Map<string, number>();
  for (const a of history) if (!a.ok) failures.set(a.eventId, (failures.get(a.eventId) ?? 0) + 1);
  let budget = MAX_ALERTS_PER_HOUR - history.filter((a) => a.ok && now - a.sentAt < 3600_000).length;

  for (const e of [...events].sort((a, b) => b.severity - a.severity)) {
    const prev = lastByEvent.get(e.id);
    const origin = e.eventTime ?? e.firstPublishedTime ?? e.firstDetectedTime;
    let decision: AlertDecision | null = null;
    let reason = "";

    if (prev && e.retracted) {
      if (prev.title.startsWith("[정정]")) reason = "정정 알림 이미 발송";
      else decision = { event: e, kind: "correction", reason: "기존 알림 사건이 정정/해제됨" };
    } else if (e.basis === "media" && !((e.categories.includes("evacuation") || e.categories.includes("posture")) && e.severity >= 85)) reason = "언론 보도만 존재 (1차 원천·공식발표 인용 없음)";
    else if (e.drill) reason = "훈련 발령";
    else if (e.retracted) reason = "오발령/해제 메시지";
    else if (!prev && e.firstDetectedTime - origin > STALE_MS) reason = `최초 감지 시점에 이미 ${Math.round((e.firstDetectedTime - origin) / 3600_000)}시간 지난 사건`;
    else if (e.severity < thresholdFor(e)) reason = `심각도 ${e.severity} < ${e.status} 임계값 ${thresholdFor(e)}`;
    else if (!prev && (failures.get(e.id) ?? 0) >= MAX_SEND_RETRIES) reason = `발송 ${MAX_SEND_RETRIES}회 실패 — 푸시 설정 확인 필요`;
    else if (!prev) decision = { event: e, kind: "new", reason: "신규 중요 사건" };
    // 속보로 이미 알린 사건은 언론 교차확인만으로 다시 울리지 않고, 정부 공식 원천(재난문자 등)이 붙을 때만 갱신
    else if (statusRank(e.status) > statusRank(prev.status) && (e.basis !== "official_quote" || e.status === "CONFIRMED")) decision = { event: e, kind: "upgrade", reason: `상태 상향 ${prev.status}→${e.status}` };
    else if (e.severity >= prev.severity + RESEND_SEVERITY_JUMP) decision = { event: e, kind: "upgrade", reason: `심각도 상승 ${prev.severity}→${e.severity}` };
    else reason = "이미 알림 발송된 사건";

    if (decision) {
      // 정정 알림은 속도 제한을 받지 않는다
      if (decision.kind !== "correction" && budget <= 0) {
        suppressed.push({ event: e, reason: "시간당 알림 한도 초과" });
        continue;
      }
      if (decision.kind !== "correction") budget--;
      send.push(decision);
    } else suppressed.push({ event: e, reason });
  }
  return { send, suppressed };
}

function thresholdFor(e: CrisisEvent): number {
  if (e.status === "UNVERIFIED" && e.basis === "official_quote" && e.breaking) return BREAKING_QUOTE_THRESHOLD;
  // 한국을 떠나라는 보도(훈련·가짜·계획 제외, 심각도 85 이상)는 단일 출처라도 바로 알린다
  if (e.categories.includes("evacuation") || e.categories.includes("posture")) return Math.min(THRESHOLDS[e.status], 85);
  return THRESHOLDS[e.status];
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  CONFIRMED: "공식확인",
  CORROBORATED: "교차확인",
  UNVERIFIED: "미확인",
};

export function formatAlert(
  d: AlertDecision,
  dashboardUrl?: string,
  brief?: EventBrief,
): { title: string; body: string; priority: number } {
  const e = d.event;
  const label =
    e.basis === "official_quote" && e.status === "UNVERIFIED" ? "속보·공식발표 인용" : STATUS_LABEL[e.status] + (e.basis === "official_quote" ? "·언론인용" : "");
  const prefix = d.kind === "correction" ? "[정정]" : d.kind === "upgrade" ? `[갱신·${label}]` : `[${label}]`;
  const title = `${prefix} ${brief?.isProvocation ? brief.headline : e.title}`.slice(0, 120);
  const body = [
    d.kind === "correction" ? "앞서 알린 사건이 정정·해제되었습니다." : brief ? `위험도 ${brief.danger.label} (${brief.danger.reason}) · 출처 ${e.sources.join(", ")}` : `심각도 ${e.severity}/100 · 출처 ${e.sources.join(", ")}`,
    brief?.isProvocation && brief.headline !== e.title ? `원문: ${e.title}` : "",
    e.status === "UNVERIFIED" && e.basis !== "official_quote" ? "⚠ 단일 출처 미확인 신호입니다. 공식 발표를 확인하세요." : "",
    e.status === "UNVERIFIED" && e.basis === "official_quote" ? "언론사 1곳의 속보 기준이며 아직 교차확인 전입니다." : "",
    e.basis === "official_quote" && e.status !== "UNVERIFIED" ? "공식 발표를 인용한 복수 언론 보도 기준입니다 (원문 직접 확인 아님)." : "",
    dashboardUrl ? `${dashboardUrl}#${e.id}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const priority = d.kind === "correction" ? 4 : e.severity >= 85 ? 5 : e.severity >= 70 ? 4 : 3;
  return { title, body, priority };
}

/**
 * 종합 정세 수준. 전쟁 '예측'이 아니라 동시에 이상이 관측된 영역 수를 보여준다.
 * 단일 영역 이상은 최대 2단계로 제한한다.
 */
export function posture(events: CrisisEvent[], now = Date.now()): { level: number; label: string; detail: string } {
  const recent = events.filter(
    (e) => now - (e.eventTime ?? e.firstPublishedTime ?? e.firstDetectedTime) < 24 * 3600_000 && !e.drill && !e.retracted && e.status !== "UNVERIFIED" && e.severity >= 50,
  );
  const groups = new Set(recent.map((e) => e.group));
  const airRaid = recent.some((e) => e.categories.includes("air_raid_alert") && e.status === "CONFIRMED" && e.severity >= 85);
  let level = groups.size === 0 ? 1 : groups.size === 1 ? 2 : groups.size === 2 ? 3 : 4;
  if (airRaid) level = 5;
  const labels = ["", "평시 관측", "단일 영역 이상", "복수 영역 이상", "다영역 동시 이상", "공식 민방위 경보 발령"];
  return {
    level,
    label: labels[level],
    detail: `최근 24시간 확인된 이상 영역: ${[...groups].join(", ") || "없음"}. 본 지표는 관측 사실의 요약이며 전쟁 발생 예측이 아닙니다.`,
  };
}
