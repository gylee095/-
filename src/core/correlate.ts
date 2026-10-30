// 신호 → 사건 클러스터링, 다중 출처 교차검증, 상태(공식확인/교차확인/미확인) 판정
import type { Category, CrisisEvent, EventStatus, Signal } from "./types.js";
import { clamp, haversineKm, hash } from "./util.js";

interface GroupRule {
  categories: Category[];
  windowMs: number;
  radiusKm?: number;
}

export const GROUPS: Record<string, GroupRule> = {
  strike: { categories: ["air_raid_alert", "missile", "artillery", "civil_alert_other"], windowMs: 3 * 3600_000 },
  nuclear: { categories: ["nuclear_test", "seismic_anomaly"], windowMs: 2 * 3600_000, radiusKm: 150 },
  launch: { categories: ["launch_notice"], windowMs: 24 * 3600_000, radiusKm: 300 },
  gnss: { categories: ["gps_interference"], windowMs: 24 * 3600_000 },
  aviation: { categories: ["aviation_emergency"], windowMs: 3600_000, radiusKm: 100 },
  airspace: { categories: ["airspace_anomaly"], windowMs: 2 * 3600_000 },
};

export function groupOf(c: Category): string {
  for (const [g, r] of Object.entries(GROUPS)) if (r.categories.includes(c)) return g;
  return "other";
}

/** 클러스터링 기준 시각: 발생 > 공개 > 감지 */
export function signalTime(s: Signal): number {
  return s.eventTime ?? s.publishedTime ?? s.detectedTime;
}

/** 같은 내용이 다른 ID로 재게시된 경우(예: 재난문자 지역별 중복 발송) 제거 */
export function dedupeSignals(signals: Signal[]): Signal[] {
  const byId = new Map<string, Signal>();
  const byContent = new Set<string>();
  for (const s of [...signals].sort((a, b) => a.detectedTime - b.detectedTime)) {
    if (byId.has(s.id)) continue;
    const contentKey = `${s.source}|${s.category}|${s.title.replace(/\s+/g, "").slice(0, 80)}|${Math.floor(signalTime(s) / 600_000)}`;
    if (byContent.has(contentKey)) continue;
    byId.set(s.id, s);
    byContent.add(contentKey);
  }
  return [...byId.values()];
}

const STATUS_RANK: Record<EventStatus, number> = { UNVERIFIED: 0, CORROBORATED: 1, CONFIRMED: 2 };
export const statusRank = (s: EventStatus) => STATUS_RANK[s];

export function correlate(signals: Signal[]): CrisisEvent[] {
  const sorted = dedupeSignals(signals).sort((a, b) => signalTime(a) - signalTime(b));
  // 1단계: 비언론 신호로 클러스터 형성. 2단계: 언론 신호를 기존 클러스터에 부착하거나 단독 클러스터 생성
  const clusters: { group: string; signals: Signal[] }[] = [];
  const fits = (c: { group: string; signals: Signal[] }, s: Signal) => {
    const rule = GROUPS[c.group];
    if (!rule || groupOf(s.category) !== c.group) return false;
    const t = signalTime(s);
    const inWindow = c.signals.some((x) => Math.abs(signalTime(x) - t) <= rule.windowMs);
    if (!inWindow) return false;
    if (rule.radiusKm && s.lat !== undefined && s.lon !== undefined) {
      const located = c.signals.filter((x) => x.lat !== undefined && x.lon !== undefined);
      if (located.length && !located.some((x) => haversineKm(x.lat!, x.lon!, s.lat!, s.lon!) <= rule.radiusKm!)) return false;
    }
    return true;
  };
  for (const pass of ["primary", "media"] as const) {
    for (const s of sorted) {
      if ((s.sourceKind === "media") !== (pass === "media")) continue;
      const c = clusters.find((c) => fits(c, s));
      if (c) c.signals.push(s);
      else clusters.push({ group: groupOf(s.category), signals: [s] });
    }
  }
  return clusters.map((c) => buildEvent(c.group, c.signals));
}

/** 독립 출처 단위: 언론은 언론사(도메인)별, 그 외는 소스별 */
export function providerOf(s: Signal): string {
  if (s.sourceKind !== "media" || !s.url) return s.source;
  try {
    return new URL(s.url).hostname.replace(/^www\./, "");
  } catch {
    return s.source;
  }
}

export function buildEvent(group: string, sigs: Signal[]): CrisisEvent {
  const primary = sigs.filter((s) => s.sourceKind !== "media");
  const media = sigs.filter((s) => s.sourceKind === "media");
  const quoting = media.filter((s) => s.citesOfficial && !s.retraction);
  const quotingOutlets = new Set(quoting.map(providerOf));
  const anchor = [...sigs].sort((a, b) => a.detectedTime - b.detectedTime || a.id.localeCompare(b.id))[0];
  const providers = new Set(sigs.map(providerOf));
  const live = primary.filter((s) => !s.retraction);
  const retracted = primary.some((s) => s.retraction);
  const drill = primary.length > 0 && primary.every((s) => s.drill);

  // 1차 원천이 없으면 '공식발표를 인용한 서로 다른 언론사 2곳 이상'일 때만 교차확인으로 본다
  const basis: CrisisEvent["basis"] = primary.length ? "primary" : quotingOutlets.size ? "official_quote" : "media";
  let status: EventStatus = "UNVERIFIED";
  if (live.some((s) => s.sourceKind === "official" && !s.drill)) status = "CONFIRMED";
  else if (primary.length > 0 && providers.size >= 2) status = "CORROBORATED";
  else if (basis === "official_quote" && quotingOutlets.size >= 2) status = "CORROBORATED";

  const scored = primary.length ? primary : quoting.length ? quoting : sigs;
  const base = Math.max(0, ...scored.map((s) => s.severity));
  let severity = clamp(base + 5 * (providers.size - 1));
  if (retracted) severity = Math.min(severity, 30);
  if (drill) severity = Math.min(severity, 20);

  const lead = [...scored].sort((a, b) => b.severity - a.severity)[0];
  const located = sigs.find((s) => s.lat !== undefined);
  const min = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x !== undefined);
    return v.length ? Math.min(...v) : undefined;
  };
  return {
    id: `evt_${hash(anchor.id)}`,
    group,
    categories: [...new Set(sigs.map((s) => s.category))],
    status,
    severity,
    title: lead.title,
    signalIds: sigs.map((s) => s.id),
    sources: [...providers],
    eventTime: min(sigs.map((s) => s.eventTime)),
    firstPublishedTime: min(sigs.map((s) => s.publishedTime)),
    firstDetectedTime: Math.min(...sigs.map((s) => s.detectedTime)),
    firstMediaTime: min(media.map((s) => s.publishedTime ?? s.detectedTime)),
    drill,
    retracted,
    basis,
    breaking: quoting.some((s) => s.breaking),
    lat: located?.lat,
    lon: located?.lon,
  };
}
