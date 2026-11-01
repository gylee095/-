// 사람들의 불안 — 네이버 데이터랩 검색어 트렌드(공식 API, 무료 키, 하루 단위·전일까지).
// 2026년부터 키 발급이 NAVER API HUB(네이버 클라우드)로 옮겨 갔다: 주소·인증 헤더 이름만 다르고 요청·응답 형식은 같다.
// 예전 개발자센터(openapi.naver.com) 키도 쓸 수 있도록, API HUB 가 인증을 거부하면 예전 주소로 한 번 더 시도한다.
// 한국 사람들이 '전쟁', '대피소', '생존배낭'을 평소보다 얼마나 더 찾는가. 언론발 공포에도 움직이므로 정부·돈의 움직임과 대조해서 읽는다.
import type { CollectResult, Metric } from "../types.js";
import { fetchText } from "../util.js";

export const NAVER_HUB_TREND = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";
export const NAVER_DATALAB = "https://openapi.naver.com/v1/datalab/search";

export const NAVER_GROUPS: { groupName: string; keywords: string[] }[] = [
  { groupName: "전쟁 불안", keywords: ["전쟁", "전쟁 나면", "전쟁 가능성", "전쟁 터지면", "전쟁 나나"] },
  { groupName: "대피", keywords: ["대피소", "방공호", "민방위 대피소", "대피소 위치", "대피 요령"] },
  { groupName: "생존 준비", keywords: ["생존배낭", "비상식량", "생존가방", "비상용품"] },
  { groupName: "북한 도발", keywords: ["북한 미사일", "북한 도발", "북한 포격", "북한 공격"] },
];

const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function naverRequest(id: string, secret: string, now: number, api: "hub" | "classic" = "hub"): { url: string; init: RequestInit } {
  const body = { startDate: kstDate(now - 36 * 86400_000), endDate: kstDate(now - 86400_000), timeUnit: "date", keywordGroups: NAVER_GROUPS };
  const headers: Record<string, string> =
    api === "hub" ? { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret, "content-type": "application/json" } : { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret, "content-type": "application/json" };
  return { url: api === "hub" ? NAVER_HUB_TREND : NAVER_DATALAB, init: { method: "POST", headers, body: JSON.stringify(body) } };
}

/** 과거 검증용: 묶음 하나의 긴 기간 일별 값 (2016-01-01부터 가능). 묶음마다 따로 받아 각자의 최댓값=100 기준으로 정밀도를 지킨다 */
export async function fetchNaverHistory(id: string, secret: string, group: { groupName: string; keywords: string[] }, from: string, to: string): Promise<any> {
  const body = JSON.stringify({ startDate: from, endDate: to, timeUnit: "date", keywordGroups: [group] });
  const hub = { method: "POST", headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret, "content-type": "application/json" }, body };
  try {
    return JSON.parse(await fetchText(NAVER_HUB_TREND, hub, 30000));
  } catch (e) {
    if (!/HTTP (401|403)/.test(String((e as Error).message))) throw e;
    const classic = { method: "POST", headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret, "content-type": "application/json" }, body };
    return JSON.parse(await fetchText(NAVER_DATALAB, classic, 30000));
  }
}

/** API HUB 로 먼저, 인증 거부(401·403)면 예전 개발자센터 주소로 */
export async function fetchNaverTrend(id: string, secret: string, now: number): Promise<any> {
  const hub = naverRequest(id, secret, now, "hub");
  try {
    return JSON.parse(await fetchText(hub.url, hub.init, 20000));
  } catch (e) {
    if (!/HTTP (401|403)/.test(String((e as Error).message))) throw e;
    const classic = naverRequest(id, secret, now, "classic");
    try {
      return JSON.parse(await fetchText(classic.url, classic.init, 20000));
    } catch (e2) {
      throw new Error(`API HUB: ${String((e as Error).message).slice(0, 160)} / 개발자센터: ${String((e2 as Error).message).slice(0, 160)}`);
    }
  }
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
  /** 직전 28일 중앙값 (응답 전체 최댓값 = 100 기준 상대값) */
  usual: number;
  /** 최근 14일 상대값 — 하루짜리 튐인지 며칠째인지 보려고 */
  recent: { date: string; v: number }[];
  /** 응답에 들어 있던 날 수 (검색이 0인 날은 빠질 수 있다) */
  days: number;
}

export function naverRatios(json: any): NaverGroupRatio[] {
  const out: NaverGroupRatio[] = [];
  for (const r of json?.results ?? []) {
    const data = ((r?.data ?? []) as { period: string; ratio: number }[]).filter((d) => d?.period).sort((a, b) => a.period.localeCompare(b.period));
    if (data.length < 21) continue;
    const last = data[data.length - 1];
    const usual = median(data.slice(-29, -1).map((d) => Number(d.ratio)));
    if (!(usual > 0)) continue;
    out.push({ group: r.title, date: last.period, ratio: Number(last.ratio) / usual, usual: +usual.toFixed(3), recent: data.slice(-14).map((d) => ({ date: d.period.slice(5), v: +Number(d.ratio).toFixed(2) })), days: data.length });
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
      meta: { dataDate: worst.date, worstGroup: worst.group, groups: ratios.map((r) => ({ group: r.group, ratio: +r.ratio.toFixed(2), usual: r.usual, days: r.days, recent: r.recent })), note: "네이버 검색량 — 평소(직전 28일 중앙값) 대비 배율, 불안 검색어 묶음 중 가장 큰 값" },
    },
  ];
}

export async function collectNaver(id: string | undefined, secret: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!id || !secret) return { source: "naver_datalab", ok: true, skipped: "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정 (네이버 개발자센터 무료 키)", signals: [], fetchedAt: now, rawCount: 0 };
  const ratios = naverRatios(await fetchNaverTrend(id, secret, now));
  const metrics = naverMetrics(ratios);
  return { source: "naver_datalab", ok: metrics.length > 0, error: metrics.length ? undefined : "검색량 데이터 부족", fetchedAt: now, rawCount: ratios.length, signals: [], metrics };
}
