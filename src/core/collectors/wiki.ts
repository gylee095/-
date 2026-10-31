// 사람들의 관심 — 위키백과 문서 조회수(Wikimedia 공개 API, 키 불필요, 하루 단위·약 1일 지연).
// 한 문서만 튀면 인물 뉴스일 수 있으므로, 여러 문서의 '평소 대비 배율'의 중앙값을 쓴다(여러 문서가 함께 늘어야 커진다).
import type { CollectResult, Metric } from "../types.js";
import { fetchJson } from "../util.js";

export const WIKI_UA = "KoreaEarlyWarning/0.1 (https://github.com/gylee095/-; personal research)";

/** 한반도 전쟁·북한군 관련 문서 (영어·일본어·한국어) */
export const WIKI_BASKET: [string, string][] = [
  ["en", "North_Korea"], ["en", "Korean_War"], ["en", "Korean_Demilitarized_Zone"], ["en", "Korean_People's_Army"], ["en", "Kim_Jong_Un"],
  ["ja", "朝鮮戦争"], ["ja", "金正恩"], ["ko", "한국_전쟁"], ["ko", "조선인민군"],
];
/** 세계적인 전쟁 불안(한반도와 무관한 사건에도 움직인다) — 참고용 */
export const WIKI_WW3: [string, string] = ["en", "World_War_III"];

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

export function wikiUrl(project: string, article: string, from: number, to: number): string {
  return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${ymd(from)}/${ymd(to)}`;
}

export function parseWikiSeries(json: any): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of json?.items ?? []) if (typeof it?.timestamp === "string") m.set(it.timestamp.slice(0, 8), Number(it.views ?? 0));
  return m;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

export interface ArticleRatio {
  article: string;
  views: number;
  usual: number;
  ratio: number;
}

/** 마지막 날 조회수 ÷ 그 전 28일 중앙값. 평소 조회가 너무 적은 문서(중앙값 5 미만)는 뺀다 */
export function articleRatio(article: string, series: Map<string, number>): ArticleRatio | undefined {
  const days = [...series.keys()].sort();
  if (days.length < 21) return undefined;
  const last = days[days.length - 1];
  const prior = days.slice(-29, -1).map((d) => series.get(d) ?? 0);
  const usual = median(prior);
  if (usual < 5) return undefined;
  const views = series.get(last) ?? 0;
  return { article, views, usual, ratio: views / usual };
}

export interface WikiSummary {
  date: string;
  /** 문서별 배율의 중앙값 (1.0 = 평소) */
  medianRatio: number;
  articles: ArticleRatio[];
  ww3Ratio?: number;
}

export function summarizeWiki(date: string, ratios: ArticleRatio[], ww3?: ArticleRatio): WikiSummary | undefined {
  if (ratios.length < 4) return undefined;
  return { date, medianRatio: median(ratios.map((r) => r.ratio)), articles: [...ratios].sort((a, b) => b.ratio - a.ratio), ww3Ratio: ww3?.ratio };
}

export function wikiMetrics(s: WikiSummary): Metric[] {
  const top = s.articles[0];
  return [
    {
      indicator: "psych.wiki_korea_attention",
      value: Math.round(s.medianRatio * 100),
      meta: {
        dataDate: s.date,
        top: top && { article: top.article, ratio: +top.ratio.toFixed(1) },
        articles: s.articles.map((a) => ({ article: a.article, ratio: +a.ratio.toFixed(2), views: a.views, usual: Math.round(a.usual) })),
        ww3Ratio: s.ww3Ratio !== undefined ? +s.ww3Ratio.toFixed(2) : undefined,
        note: "위키백과 한반도 관련 문서 조회수 — 평소(직전 28일 중앙값) 대비 배율의 중앙값, 1일 지연",
      },
    },
  ];
}

export async function collectWiki(now = Date.now()): Promise<CollectResult> {
  const to = now - 86400_000; // 어제(UTC)까지 확정
  const from = to - 35 * 86400_000;
  const all = [...WIKI_BASKET, WIKI_WW3];
  const res = await Promise.allSettled(all.map(([p, a]) => fetchJson<any>(wikiUrl(p, a, from, to), { headers: { "User-Agent": WIKI_UA } }, 20000)));
  const ratios: ArticleRatio[] = [];
  let ww3: ArticleRatio | undefined;
  let date = "";
  res.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const series = parseWikiSeries(r.value);
    const label = `${all[i][0]}:${all[i][1]}`;
    const ar = articleRatio(label, series);
    const last = [...series.keys()].sort().pop() ?? "";
    if (last > date) date = last;
    if (!ar) return;
    if (i === all.length - 1) ww3 = ar;
    else ratios.push(ar);
  });
  const s = summarizeWiki(date, ratios, ww3);
  const failed = res.filter((r) => r.status === "rejected").length;
  if (!s) return { source: "wiki", ok: false, error: `문서 ${ratios.length}개만 받음 (실패 ${failed})`, fetchedAt: now, rawCount: ratios.length, signals: [] };
  return { source: "wiki", ok: true, error: failed ? `일부 실패 ${failed}건` : undefined, fetchedAt: now, rawCount: ratios.length, signals: [], metrics: wikiMetrics(s) };
}
