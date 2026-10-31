// 서방·일본 정부가 한국에 머무는 자국민에게 내는 경보 — 미·영(travel.ts)에 더해 캐나다·독일·일본.
// 정부는 비공개 정보를 갖고 있으므로, 여러 나라가 '함께' 경보를 올리는 것은 전쟁 위험의 가장 강한 공개 신호다.
//  - 캐나다: data.international.gc.ca JSON — advisory-state 0(평소 주의)~3(모든 여행 자제)
//  - 독일: auswaertiges-amt.de opendata — warning / partialWarning / situationWarning / situationPartWarning
//  - 일본: 외무성 해외안전정보 오픈데이터(한국 0082L.xml) — 위험 레벨 1~4 와 주한 공관 영사 메일(최신순)
import type { CollectResult, Metric } from "../types.js";
import { fetchHead, fetchJson } from "../util.js";

export const CA_URL = "https://data.international.gc.ca/travel-voyage/index-updated.json";
export const DE_URL = "https://www.auswaertiges-amt.de/opendata/travelwarning";
export const JP_URL = "https://www.ezairyu.mofa.go.jp/opendata/country/0082L.xml";

export interface CaAdvisory {
  level: number;
  text: string;
  published?: string;
}

export function parseCanada(json: any): CaAdvisory | undefined {
  const kr = json?.data?.KR;
  if (!kr) return undefined;
  return { level: Number(kr["advisory-state"] ?? 0), text: kr.eng?.["advisory-text"] ?? "", published: kr["date-published"]?.date };
}

export interface DeAdvisory {
  /** 0 없음 · 1 부분 경고 · 2 전면 경고 */
  level: number;
  flags: string[];
  lastModified?: number;
}

export function parseGermany(json: any): DeAdvisory | undefined {
  const resp = json?.response ?? {};
  for (const v of Object.values(resp) as any[]) {
    if (!v || typeof v !== "object" || v.countryCode !== "KR") continue;
    const flags = ["warning", "partialWarning", "situationWarning", "situationPartWarning"].filter((k) => v[k] === true);
    const level = v.warning || v.situationWarning ? 2 : v.partialWarning || v.situationPartWarning ? 1 : 0;
    return { level, flags, lastModified: typeof v.lastModified === "number" ? v.lastModified * 1000 : undefined };
  }
  return undefined;
}

export interface JpMail {
  at: number;
  title: string;
}

export interface JpAdvisory {
  /** 외무성 위험 레벨 1~4 중 한국 내 지역에 걸린 가장 높은 레벨 (0 = 없음) */
  riskLevel: number;
  mails: JpMail[];
}

/** 북한·한반도 정세에 관한 메일 (미사일 발사 속보 포함) */
export const JP_NK_RE = /北朝鮮|朝鮮半島|ミサイル|弾道|核実験|南北/;
/** 발사 보고가 아니라 '정세' 자체에 대한 주의 환기 */
export const JP_SITUATION_RE = /情勢|緊張|緊迫|注意喚起|安全確保|不測の事態/;
/** 출국·대피 권고 — 이 수준은 정부가 전쟁 위험을 행동으로 인정한 것 */
export const JP_EVAC_RE = /退避|出国を(検討|勧め)|渡航(は)?(中止|止めて)|避難.*(勧告|指示)|早期の出国/;

export function parseJapan(xml: string): JpAdvisory {
  let riskLevel = 0;
  for (const n of [4, 3, 2, 1]) {
    if (new RegExp(`<riskLevel${n}>\\s*1\\s*</riskLevel${n}>`).test(xml)) {
      riskLevel = n;
      break;
    }
  }
  const mails: JpMail[] = [];
  for (const m of xml.matchAll(/<mail>([\s\S]*?)<\/mail>/g)) {
    const d = /<leaveDate[^>]*>\s*(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\s*<\/leaveDate>/.exec(m[1]);
    const title = /<title>([\s\S]*?)<\/title>/.exec(m[1])?.[1]?.trim();
    if (!d || !title) continue;
    const at = Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4] - 9, +d[5], +d[6]); // 일본 시각(UTC+9)
    mails.push({ at, title });
  }
  return { riskLevel, mails };
}

export interface JpEmbassySummary {
  /** 0 없음 · 1 한반도 정세 주의 환기 · 2 출국·대피 권고 */
  alertLevel: number;
  /** 미사일 발사 보고 메일이 나간 날 수 (공관 여러 곳의 1·2보는 하루로 묶음) */
  launchDays7d: number;
  situationTitles: string[];
}

export function summarizeJpMails(mails: JpMail[], now: number, days = 7): JpEmbassySummary {
  const recent = mails.filter((m) => m.at >= now - days * 86400_000 && m.at <= now + 3600_000);
  const nk = recent.filter((m) => JP_NK_RE.test(m.title));
  // 같은 발사에 대해 서울·부산·제주 공관이 1·2보를 따로 보낸다 → 날짜(일본 시각) 단위로 묶어 센다
  const launches = new Set(nk.filter((m) => /ミサイル|弾道/.test(m.title)).map((m) => new Date(m.at + 9 * 3600_000).toISOString().slice(0, 10)));
  const evac = recent.filter((m) => JP_EVAC_RE.test(m.title) && (JP_NK_RE.test(m.title) || /情勢/.test(m.title)));
  const situation = recent.filter((m) => JP_NK_RE.test(m.title) && JP_SITUATION_RE.test(m.title) && !/発射/.test(m.title));
  return {
    alertLevel: evac.length ? 2 : situation.length ? 1 : 0,
    launchDays7d: launches.size,
    situationTitles: [...evac, ...situation].map((m) => m.title).slice(0, 5),
  };
}

export function advisoryMetrics(ca: CaAdvisory | undefined, de: DeAdvisory | undefined, jp: JpAdvisory | undefined, now: number): Metric[] {
  const out: Metric[] = [];
  if (ca) out.push({ indicator: "official.ca_level_kr", value: ca.level, meta: { text: ca.text, published: ca.published } });
  if (de) out.push({ indicator: "official.de_warning_kr", value: de.level, meta: { flags: de.flags, lastModified: de.lastModified } });
  if (jp) {
    const s = summarizeJpMails(jp.mails, now);
    out.push({ indicator: "official.jp_risk_level_kr", value: jp.riskLevel, meta: { note: "외무성 위험 레벨(한국 내 가장 높은 지역)" } });
    out.push({
      indicator: "official.jp_embassy_alert",
      value: s.alertLevel,
      meta: { launchDays7d: s.launchDays7d, titles: s.situationTitles, latestMail: jp.mails[0] ? { at: jp.mails[0].at, title: jp.mails[0].title } : undefined },
    });
  }
  return out;
}

export async function collectAdvisories(now = Date.now()): Promise<CollectResult> {
  const [ca, de, jp] = await Promise.allSettled([
    fetchJson<any>(CA_URL, {}, 20000).then(parseCanada),
    fetchJson<any>(DE_URL, {}, 20000).then(parseGermany),
    // 최신 메일이 앞에 온다 — 앞 96KB(약 15통)만 읽는다
    fetchHead(JP_URL, 96 * 1024, {}, 20000).then(parseJapan),
  ]);
  const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : undefined);
  const errors = [ca, de, jp].map((r, i) => (r.status === "rejected" ? `${["캐나다", "독일", "일본"][i]}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 120)}` : "")).filter(Boolean);
  const metrics = advisoryMetrics(val(ca), val(de), val(jp), now);
  return {
    source: "advisories",
    ok: metrics.length > 0,
    error: errors.length ? errors.join(" / ") : undefined,
    fetchedAt: now,
    rawCount: metrics.length,
    signals: [],
    metrics,
  };
}
