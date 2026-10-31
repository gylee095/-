// 엘리트·큰손 — 외국인 투자자의 코스피 순매수 (한국은행 경제통계 ECOS, 무료 키, 하루 단위·전 거래일까지).
// 글로벌 기관은 자체 정보망을 갖고 돈을 건다. 평소와 다른 '대량 순매도'가 한반도 위험과 겹치면 무겁게 본다.
// 판정: 최근 5거래일 누적 순매수를 직전 120거래일의 5일 누적 분포와 비교한 z 값 (음수 = 평소보다 많이 판다).
// 세계 증시·반도체 때문에 파는 날이 훨씬 많으므로, 전쟁 모델에서는 다른 영역과 함께 볼 때만 무게를 둔다.
import type { CollectResult, Metric } from "../types.js";
import { fetchJson } from "../util.js";

export const ECOS_API = "https://ecos.bok.or.kr/api/StatisticSearch";
/** 802Y001 주식시장(일): 0030000 외국인 순매수(유가증권시장, 억원) · 0113000 외국인 순매수(코스닥, 억원) */
export const ECOS_ITEMS = { kospi: "0030000", kosdaq: "0113000" } as const;

const ymd = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

export function ecosUrl(key: string, item: string, from: number, to: number, rows = 400): string {
  return `${ECOS_API}/${encodeURIComponent(key)}/json/kr/1/${rows}/802Y001/D/${ymd(from)}/${ymd(to)}/${item}`;
}

export interface DayValue {
  date: string;
  value: number;
}

export function parseEcos(json: any): DayValue[] {
  const rows = json?.StatisticSearch?.row ?? [];
  if (!rows.length && json?.RESULT?.MESSAGE) throw new Error(`ECOS: ${json.RESULT.CODE} ${json.RESULT.MESSAGE}`);
  return (rows as any[])
    .map((r) => ({ date: String(r.TIME), value: Number(r.DATA_VALUE) }))
    .filter((r) => /^\d{8}$/.test(r.date) && Number.isFinite(r.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface FlowSummary {
  date: string;
  net1d: number;
  net5d: number;
  /** 직전 120거래일의 5일 누적 순매수 평균·표준편차 (억원) */
  mean5d: number;
  sd5d: number;
  /** (net5d - mean) / sd — 음수가 클수록 평소보다 많이 판다 */
  z: number;
  /** 직전 120거래일 5일 누적 중 지금보다 더 많이 판 날의 비율 (%) */
  rankPct: number;
}

export function summarizeFlow(days: DayValue[], window = 120): FlowSummary | undefined {
  if (days.length < 40) return undefined;
  const sums: { date: string; s: number }[] = [];
  for (let i = 4; i < days.length; i++) sums.push({ date: days[i].date, s: days[i - 4].value + days[i - 3].value + days[i - 2].value + days[i - 1].value + days[i].value });
  const last = sums[sums.length - 1];
  // 직전 분포: 지금 5일과 겹치지 않게 5일을 비우고 그 앞 window 개
  const prior = sums.slice(Math.max(0, sums.length - 5 - window), sums.length - 5).map((x) => x.s);
  if (prior.length < 30) return undefined;
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length) || 1;
  return {
    date: last.date,
    net1d: days[days.length - 1].value,
    net5d: last.s,
    mean5d: Math.round(mean),
    sd5d: Math.round(sd),
    z: +((last.s - mean) / sd).toFixed(2),
    rankPct: Math.round((prior.filter((s) => s < last.s).length / prior.length) * 100),
  };
}

export function flowMetrics(kospi: FlowSummary, kospiDays: DayValue[], kosdaq?: FlowSummary): Metric[] {
  return [
    {
      indicator: "elite.foreign_net_kospi",
      value: kospi.z,
      meta: {
        dataDate: kospi.date,
        net1dEok: kospi.net1d,
        net5dEok: kospi.net5d,
        usual5dEok: kospi.mean5d,
        sd5dEok: kospi.sd5d,
        rankPct: kospi.rankPct,
        kosdaqNet5dEok: kosdaq?.net5d,
        series: kospiDays.slice(-10).map((d) => ({ date: d.date.slice(4), eok: d.value })),
        note: "외국인 코스피 순매수 — 최근 5거래일 합계를 직전 120거래일의 5일 합계 분포와 비교한 z (음수 = 평소보다 많이 판다)",
      },
    },
  ];
}

export async function collectEcos(key: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!key) return { source: "ecos", ok: true, skipped: "ECOS_API_KEY 미설정 (한국은행 경제통계 무료 인증키)", signals: [], fetchedAt: now, rawCount: 0 };
  const from = now - 260 * 86400_000; // 약 180거래일
  const [kospiJson, kosdaqJson] = await Promise.all([
    fetchJson<any>(ecosUrl(key, ECOS_ITEMS.kospi, from, now), {}, 20000),
    fetchJson<any>(ecosUrl(key, ECOS_ITEMS.kosdaq, from, now), {}, 20000).catch(() => undefined),
  ]);
  const kospiDays = parseEcos(kospiJson);
  const kospi = summarizeFlow(kospiDays);
  if (!kospi) return { source: "ecos", ok: false, error: `자료 부족 (${kospiDays.length}일)`, fetchedAt: now, rawCount: kospiDays.length, signals: [] };
  const kosdaq = kosdaqJson ? summarizeFlow(parseEcos(kosdaqJson)) : undefined;
  return { source: "ecos", ok: true, fetchedAt: now, rawCount: kospiDays.length, signals: [], metrics: flowMetrics(kospi, kospiDays, kosdaq) };
}
