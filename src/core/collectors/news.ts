// 언론(GDELT, RSS) — 알림 트리거가 아니라 교차검증과 '뉴스 대비 리드타임' 측정용
import type { CollectResult, Metric, Signal } from "../types.js";
import { classifyText, isKoreaRelevant } from "../classify.js";
import { fetchJson, fetchText, hash, parseCompactUtc } from "../util.js";

const GDELT_QUERY =
  '("North Korea" OR DPRK OR 북한) (missile OR artillery OR "nuclear test" OR shelling OR 미사일 OR 포격 OR 경계경보)';

export async function searchGdelt(query: string, timespan = "3h", max = 75): Promise<any[]> {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&timespan=${timespan}&maxrecords=${max}&sort=datedesc`;
  // GDELT 는 IP당 5초에 1회 제한, 응답이 느림
  const txt = await fetchText(url, {}, 25000);
  // GDELT는 결과가 없거나 쿼리 오류면 JSON이 아닌 본문을 반환한다
  if (!txt.trim().startsWith("{")) {
    if (txt.trim()) throw new Error(`GDELT: ${txt.trim().slice(0, 200)}`);
    return [];
  }
  return JSON.parse(txt).articles ?? [];
}

export function googleNewsUrl(query: string, lang: "ko" | "en" = "ko") {
  return lang === "ko"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function collectGdelt(now = Date.now()): Promise<CollectResult> {
  const arts = await searchGdelt(GDELT_QUERY);
  return { source: "gdelt", ok: true, fetchedAt: now, rawCount: arts.length, signals: parseGdelt(arts, now) };
}

export function parseGdelt(arts: any[], now: number): Signal[] {
  return arts.flatMap((a) => mediaSignal("gdelt", a.url, a.title, parseCompactUtc(a.seendate ?? ""), now, a.domain));
}

// Google News RSS 는 Cloudflare 서버 접속을 차단(503)하므로 사용하지 않는다
/** 1분마다 확인하는 속보 피드 (연합뉴스: 합참·日방위성 발표를 가장 먼저 [속보]로 전하는 국내 매체) */
export const BREAKING_FEEDS = ["https://www.yna.co.kr/rss/news.xml", "https://www.yna.co.kr/rss/northkorea.xml"];
/** 5분마다 확인하는 교차확인용 피드 */
export const SLOW_FEEDS = ["https://www.nknews.org/feed/", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://beyondparallel.csis.org/feed/"];
export const DEFAULT_FEEDS = [...BREAKING_FEEDS, ...SLOW_FEEDS];

/** 기본 피드들의 기사 중 질의어가 하나라도 제목에 포함된 것 */
export async function searchFeeds(query: string, sinceMs: number, feeds = DEFAULT_FEEDS) {
  const terms = query.split(/\s+|,|OR/i).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
  const results = await Promise.allSettled(feeds.map((f) => fetchText(f).then((x) => parseRss(x).map((i) => ({ ...i, feed: new URL(f).hostname })))));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.flatMap((r, i) => (r.status === "rejected" ? [`${new URL(feeds[i]).hostname}: ${String(r.reason).slice(0, 80)}`] : []));
  const hits = items.filter((i) => (i.pubDate ?? Date.now()) >= sinceMs && terms.some((t) => i.title.toLowerCase().includes(t)));
  return { hits, errors };
}

// 북한 담화·성명류 보도 / 적대 수사 핵심어 (연합뉴스 북한 섹션 제목 기준)
const NK_STATEMENT_RE = /담화|성명|대변인|경고|위협|비난|규탄|맹비난|反발|반발/;
const NK_HOSTILE_RE = /핵\s?(무력|공격|타격|전쟁|보복|사용)|선제|초토화|보복|섬멸|파멸|궤멸|불바다|전면전|전쟁\s?(불사|준비|상태)|적대국|주적|응징|격멸|전술핵|핵탄두/;
const NK_RE = /북한|北|김정은|김여정|평양|조선중앙|노동신문|North Korea|DPRK|Kim Jong/i;

/** 최근 기사 제목들에서 언론 템포·북한 수사 지표를 계산한다 */
export function newsMetrics(items: { title: string; pubDate?: number }[], now: number, source: string): Metric[] {
  const day = items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 24 * 3600_000 && NK_RE.test(i.title));
  const metrics: Metric[] = [];
  if (source === "rss_breaking") {
    const hour = items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 3600_000 && /\[속보\]|\[1보\]/.test(i.title) && NK_RE.test(i.title) && classifyText(i.title));
    metrics.push({ indicator: "media.breaking_nk_1h", value: hour.length, meta: { titles: hour.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    const statements = day.filter((i) => NK_STATEMENT_RE.test(i.title));
    const hostile = day.filter((i) => NK_HOSTILE_RE.test(i.title));
    metrics.push({ indicator: "rhetoric.nk_statements_24h", value: statements.length, meta: { titles: statements.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    metrics.push({ indicator: "rhetoric.nk_hostile_24h", value: hostile.length, meta: { titles: hostile.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
  }
  return metrics;
}

export async function collectRss(feeds = DEFAULT_FEEDS, now = Date.now(), source = "rss_news"): Promise<CollectResult> {
  const signals: Signal[] = [];
  const all: { title: string; pubDate?: number }[] = [];
  let rawCount = 0;
  const errors: string[] = [];
  for (const f of feeds) {
    try {
      const items = parseRss(await fetchText(f));
      rawCount += items.length;
      all.push(...items);
      for (const it of items) signals.push(...mediaSignal(source, it.link, it.title, it.pubDate, now));
    } catch (e) {
      errors.push(String(e));
    }
  }
  return { source, ok: errors.length < feeds.length, error: errors.join("; ") || undefined, fetchedAt: now, rawCount, signals, metrics: newsMetrics(all, now, source) };
}

export function parseRss(xml: string): { title: string; link: string; pubDate?: number }[] {
  const items: { title: string; link: string; pubDate?: number }[] = [];
  const decode = (s: string) =>
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "");
    const link = decode(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? "");
    const pd = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1];
    items.push({ title, link, pubDate: pd ? Date.parse(pd.trim()) : undefined });
  }
  return items;
}

// 공식 기관 발표를 인용한 제목 (예: "[속보] 合참 …", "日방위성 …", "…: JCS", "… ROK military")
const OFFICIAL_QUOTE_RE =
  /합참|합동참모본부|국방부|日\s*방위성|일본\s*방위성|방위성|대통령실|행안부|\bJCS\b|Joint Chiefs|Defense Ministry|Ministry of Defense|ROK military|South Korean military|:\s*(Seoul|Tokyo|JCS)\s*$/i;

function outletOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function mediaSignal(source: string, url: string, title: string, published: number | undefined, now: number, domain?: string): Signal[] {
  if (!title || !isKoreaRelevant(title)) return [];
  const cls = classifyText(title);
  if (!cls || cls.category === "civil_alert_other") return [];
  const citesOfficial = OFFICIAL_QUOTE_RE.test(title);
  const breaking = /\[속보\]|\[1보\]|BREAKING|FLASH/i.test(title);
  const outlet = domain ?? outletOf(url, source);
  return [
    {
      id: `${source}:${hash(url || title)}`,
      source,
      sourceKind: "media",
      category: cls.category,
      title: title.slice(0, 120),
      summary: `${outlet}${citesOfficial ? " · 공식발표 인용" : ""}`,
      url,
      eventTime: undefined,
      publishedTime: published,
      detectedTime: now,
      // 공식발표 인용 보도만 사건 심각도에 반영한다 (그 외 언론은 교차검증·리드타임 측정용)
      severity: citesOfficial ? cls.severity : Math.min(cls.severity, 20),
      citesOfficial,
      breaking,
      drill: cls.drill,
      retraction: cls.retraction,
    },
  ];
}
