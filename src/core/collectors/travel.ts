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
  /** 본문의 철수·출국 문구: 0 없음 · 1 자발적 출국 허용 · 2 철수 명령 · 3 즉시 출국 권고 */
  departure: 0 | 1 | 2 | 3;
  departureText?: string;
}

// 국무부 경보 본문 문구 (2022-01-23 우크라이나: "authorized the voluntary departure of U.S. direct hire employees and ordered the departure of
// eligible family members from Embassy Kyiv" → 한 달 뒤 침공). 단계 숫자와 별개로 본다 — 2023년 10월 이스라엘처럼 단계는 그대로인데 출국만 허용한 경우 대비.
// 2022-01-23 우크라이나 "should consider departing now", 2022-02-11 "should depart now" — 둘 다 '지금 떠나라'
const DEPART_NOW_RE = /(should|must) (consider )?(depart(ing)?|leav(e|ing))[^.]{0,60}(immediately|now|as soon as possible)|(depart|leave) (immediately|now)|depart [^.]{0,40}while commercial (options|flights)/i;
const DEPART_ORDERED_RE = /ordered (the )?(departure|evacuation)|ordered departure/i;
const DEPART_AUTH_RE = /authorized (the )?(voluntary )?departure|voluntary departure|authorized departure/i;

export function departureOf(text: string): { departure: UsAdvisory["departure"]; departureText?: string } {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const [re, d] of [[DEPART_NOW_RE, 3], [DEPART_ORDERED_RE, 2], [DEPART_AUTH_RE, 1]] as const) {
    const m = re.exec(plain);
    if (m) return { departure: d, departureText: plain.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80).trim() };
  }
  return { departure: 0 };
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
  const desc = (/<description>([\s\S]*?)<\/description>/.exec(item)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "");
  return { level: Number.isFinite(level) ? level : 0, title, pubDate: pd ? Date.parse(pd) : undefined, url, ...departureOf(desc) };
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
  if (us && us.departure > 0) {
    const what = us.departure === 3 ? "미국 시민 즉시 출국 권고" : us.departure === 2 ? "주한 대사관 직원·가족 철수 명령" : "주한 대사관 직원·가족 자발적 출국 허용";
    out.push({
      id: `travel_us_departure:${us.departure}:${us.pubDate ?? Math.floor(now / 86400_000)}`,
      source: "travel",
      sourceKind: "official",
      category: "evacuation",
      title: `미 국무부: ${what} (한국 여행경보 ${us.level}단계)`,
      summary: (us.departureText ?? "").slice(0, 300),
      url: us.url,
      eventTime: us.pubDate,
      publishedTime: us.pubDate,
      detectedTime: now,
      severity: 95,
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
  if (us) metrics.push({ indicator: "official.us_departure_kr", value: us.departure, meta: { text: us.departureText, level: us.level, pubDate: us.pubDate } });
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
