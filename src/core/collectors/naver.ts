// 사람들의 불안 — 네이버 데이터랩 검색어 트렌드(공식 API, 무료 키, 하루 단위·전일까지).
// 한국 사람들이 '전쟁', '대피소', '생존배낭'을 평소보다 얼마나 더 찾는가. 언론발 공포에도 움직이므로 정부·돈의 움직임과 대조해서 읽는다.
import type { CollectResult, Metric } from "../types.js";
import { fetchText } from "../util.js";

export const NAVER_DATALAB = "https://openapi.naver.com/v1/datalab/search";

export const NAVER_GROUPS: { groupName: string; keywords: string[] }[] = [
  { groupName: "전쟁 불안", keywords: ["전쟁", "전쟁 나면", "전쟁 가능성", "전쟁 터지면", "전쟁 나나"] },
  { groupName: "대피", keywords: ["대피소", "방공호", "민방위 대피소", "대피소 위치", "대피 요령"] },
  { groupName: "생존 준비", keywords: ["생존배낭", "비상식량", "생존가방", "비상용품"] },
  { groupName: "북한 도발", keywords: ["북한 미사일", "북한 도발", "북한 포격", "북한 공격"] },
];

const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function naverRequest(id: string, secret: string, now: number): { url: string; init: RequestInit } {
  const body = { startDate: kstDate(now - 36 * 86400_000), endDate: kstDate(now - 86400_000), timeUnit: "date", keywordGroups: NAVER_GROUPS };
  return {
    url: NAVER_DATALAB,
    init: { method: "POST", headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret, "content-type": "application/json" }, body: JSON.stringify(body) },
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

export interface NaverGroupRatio {
  group: string;
  date: string;
  /** 마지막 날 ÷ 직전 28일 중앙값 */
  ratio: number;
}

export function naverRatios(json: any): NaverGroupRatio[] {
  const out: NaverGroupRatio[] = [];
  for (const r of json?.results ?? []) {
    const data = ((r?.data ?? []) as { period: string; ratio: number }[]).filter((d) => d?.period).sort((a, b) => a.period.localeCompare(b.period));
    if (data.length < 21) continue;
    const last = data[data.length - 1];
    const usual = median(data.slice(-29, -1).map((d) => Number(d.ratio)));
    if (!(usual > 0)) continue;
    out.push({ group: r.title, date: last.period, ratio: Number(last.ratio) / usual });
  }
  return out;
}

export function naverMetrics(ratios: NaverGroupRatio[]): Metric[] {
  const anxiety = ratios.filter((r) => r.group !== "북한 도발");
  if (!anxiety.length) return [];
  const worst = anxiety.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return [
    {
      indicator: "psych.naver_war_search",
      value: Math.round(worst.ratio * 100),
      meta: { dataDate: worst.date, worstGroup: worst.group, groups: ratios.map((r) => ({ group: r.group, ratio: +r.ratio.toFixed(2) })), note: "네이버 검색량 — 평소(직전 28일 중앙값) 대비 배율, 불안 검색어 묶음 중 가장 큰 값" },
    },
  ];
}

export async function collectNaver(id: string | undefined, secret: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!id || !secret) return { source: "naver_datalab", ok: true, skipped: "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정 (네이버 개발자센터 무료 키)", signals: [], fetchedAt: now, rawCount: 0 };
  const { url, init } = naverRequest(id, secret, now);
  const ratios = naverRatios(JSON.parse(await fetchText(url, init, 20000)));
  const metrics = naverMetrics(ratios);
  return { source: "naver_datalab", ok: metrics.length > 0, error: metrics.length ? undefined : "검색량 데이터 부족", fetchedAt: now, rawCount: ratios.length, signals: [], metrics };
}
