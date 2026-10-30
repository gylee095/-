// 서방 정부의 자국민 대상 경보 — '펜타곤 피자 지수'의 공식 버전.
//  - 미 국무부 여행경보(travel.state.gov RSS): South Korea 단계 1~4
//  - 영국 FCDO 여행권고(gov.uk Atom): 최신 갱신 요약에 안보 문구 포함 여부
import type { CollectResult, Metric, Signal } from "../types.js";
import { fetchText } from "../util.js";

export const US_TRAVEL_RSS = "https://travel.state.gov/_res/rss/TAsTWs.xml";
export const UK_TRAVEL_ATOM = "https://www.gov.uk/foreign-travel-advice/south-korea.atom";

export interface UsAdvisory {
  level: number;
  title: string;
  pubDate?: number;
  url: string;
}

/** South Korea 항목만 찾는다 (RSS 전체는 500KB 가 넘으므로 Country-Tag 로 먼저 위치를 잡는다) */
export function parseUsAdvisory(xml: string): UsAdvisory | undefined {
  const tag = xml.indexOf('domain="Country-Tag">KS<');
  if (tag < 0) return undefined;
  const start = xml.lastIndexOf("<item>", tag);
  const end = xml.indexOf("</item>", tag);
  if (start < 0 || end < 0) return undefined;
  const item = xml.slice(start, end);
  const title = /<title>([\s\S]*?)<\/title>/.exec(item)?.[1]?.trim() ?? "";
  const level = Number(/Level\s*(\d)/.exec(/domain="Threat-Level">([^<]*)</.exec(item)?.[1] ?? title)?.[1] ?? NaN);
  const pd = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1]?.trim();
  const url = /<link>([\s\S]*?)<\/link>/.exec(item)?.[1]?.trim() ?? "https://travel.state.gov";
  return { level: Number.isFinite(level) ? level : 0, title, pubDate: pd ? Date.parse(pd) : undefined, url };
}

export const UK_SECURITY_RE = /North Korea|DPRK|military|tension|missile|security situation|leave the country|evacuat|conflict|hostilit|advise against/i;

export interface UkAdvice {
  updated?: number;
  summary: string;
  securityFlag: boolean;
}

export function parseUkAdvice(atom: string): UkAdvice {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(atom)?.[1] ?? atom;
  const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1];
  const summary = (/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { updated: updated ? Date.parse(updated) : undefined, summary, securityFlag: UK_SECURITY_RE.test(summary) };
}

export function travelSignals(us: UsAdvisory | undefined, prevUsLevel: number | undefined, uk: UkAdvice, now: number): Signal[] {
  const out: Signal[] = [];
  if (us && (us.level >= 3 || (prevUsLevel !== undefined && us.level !== prevUsLevel))) {
    const severity = us.level >= 4 ? 90 : us.level === 3 ? 75 : us.level > (prevUsLevel ?? 0) ? 45 : 20;
    out.push({
      id: `travel_us:${us.level}:${us.pubDate ?? Math.floor(now / 86400_000)}`,
      source: "travel",
      sourceKind: "official",
      category: "civil_alert_other",
      title: `미 국무부 한국 여행경보 ${prevUsLevel !== undefined && us.level !== prevUsLevel ? `${prevUsLevel}→${us.level}단계로 변경` : `${us.level}단계`}: ${us.title}`,
      summary: us.level >= 3 ? "미국 정부가 자국민에게 한국 방문 재고·금지를 권고 — 매우 드문 조치" : "단계 변경 자체가 신호",
      url: us.url,
      eventTime: us.pubDate,
      publishedTime: us.pubDate,
      detectedTime: now,
      severity,
    });
  }
  if (uk.securityFlag && uk.updated && now - uk.updated < 3 * 86400_000) {
    out.push({
      id: `travel_uk:${uk.updated}`,
      source: "travel",
      sourceKind: "official",
      category: "civil_alert_other",
      title: `영국 외무부 한국 여행권고 갱신(안보 관련): ${uk.summary.slice(0, 80)}`,
      summary: uk.summary.slice(0, 300),
      url: "https://www.gov.uk/foreign-travel-advice/south-korea",
      eventTime: uk.updated,
      publishedTime: uk.updated,
      detectedTime: now,
      severity: 55,
    });
  }
  return out;
}

export async function collectTravel(prevUsLevel: number | undefined, now = Date.now()): Promise<CollectResult & { usLevel?: number }> {
  const [usR, ukR] = await Promise.allSettled([fetchText(US_TRAVEL_RSS, {}, 25000), fetchText(UK_TRAVEL_ATOM)]);
  const us = usR.status === "fulfilled" ? parseUsAdvisory(usR.value) : undefined;
  const uk = ukR.status === "fulfilled" ? parseUkAdvice(ukR.value) : { summary: "", securityFlag: false };
  const errors = [usR, ukR].flatMap((r, i) => (r.status === "rejected" ? [`${i === 0 ? "US" : "UK"}: ${String(r.reason).slice(0, 80)}`] : []));
  const metrics: Metric[] = [];
  if (us) metrics.push({ indicator: "official.us_travel_level_kr", value: us.level, meta: { title: us.title, pubDate: us.pubDate } });
  if (ukR.status === "fulfilled") metrics.push({ indicator: "official.uk_advice_security_flag", value: uk.securityFlag ? 1 : 0, meta: { updated: uk.updated, summary: uk.summary.slice(0, 200) } });
  return {
    source: "travel",
    ok: errors.length < 2,
    error: errors.join("; ") || undefined,
    fetchedAt: now,
    rawCount: (us ? 1 : 0) + (ukR.status === "fulfilled" ? 1 : 0),
    signals: travelSignals(us, prevUsLevel, uk, now),
    metrics,
    usLevel: us?.level,
  };
}
