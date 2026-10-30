// 언론(GDELT, RSS) — 알림 트리거가 아니라 교차검증과 '뉴스 대비 리드타임' 측정용
import type { CollectResult, Signal } from "../types.js";
import { classifyText, isKoreaRelevant } from "../classify.js";
import { fetchJson, fetchText, hash, parseCompactUtc } from "../util.js";

const GDELT_QUERY =
  '("North Korea" OR DPRK OR 북한) (missile OR artillery OR "nuclear test" OR shelling OR 미사일 OR 포격 OR 경계경보)';

export async function searchGdelt(query: string, timespan = "3h", max = 75): Promise<any[]> {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&timespan=${timespan}&maxrecords=${max}&sort=datedesc`;
  const txt = await fetchText(url);
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

export const DEFAULT_FEEDS = [
  "https://news.google.com/rss/search?q=%EB%B6%81%ED%95%9C+%EB%AF%B8%EC%82%AC%EC%9D%BC+OR+%ED%8F%AC%EA%B2%A9+OR+%EA%B2%BD%EA%B3%84%EA%B2%BD%EB%B3%B4+when:1d&hl=ko&gl=KR&ceid=KR:ko",
  "https://www.yna.co.kr/rss/northkorea.xml",
];

export async function collectRss(feeds = DEFAULT_FEEDS, now = Date.now()): Promise<CollectResult> {
  const signals: Signal[] = [];
  let rawCount = 0;
  const errors: string[] = [];
  for (const f of feeds) {
    try {
      const items = parseRss(await fetchText(f));
      rawCount += items.length;
      for (const it of items) signals.push(...mediaSignal("rss_news", it.link, it.title, it.pubDate, now));
    } catch (e) {
      errors.push(String(e));
    }
  }
  return { source: "rss_news", ok: errors.length < feeds.length, error: errors.join("; ") || undefined, fetchedAt: now, rawCount, signals };
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

function mediaSignal(source: string, url: string, title: string, published: number | undefined, now: number, domain?: string): Signal[] {
  if (!title || !isKoreaRelevant(title)) return [];
  const cls = classifyText(title);
  if (!cls || cls.category === "civil_alert_other") return [];
  return [
    {
      id: `${source}:${hash(url || title)}`,
      source,
      sourceKind: "media",
      category: cls.category,
      title: title.slice(0, 120),
      summary: domain ? `출처 도메인: ${domain}` : "언론 보도",
      url,
      eventTime: undefined,
      publishedTime: published,
      detectedTime: now,
      // 언론은 단독으로 알림을 만들지 않으므로 심각도를 낮게 둔다 (사건 심각도는 다른 신호가 결정)
      severity: Math.min(cls.severity, 20),
      drill: cls.drill,
      retraction: cls.retraction,
    },
  ];
}
