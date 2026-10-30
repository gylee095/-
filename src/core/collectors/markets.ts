// 시장 반응: 원·달러 환율 (Yahoo Finance 비공식 차트 API, 키 불필요, 간헐적 429)
import type { CollectResult, Metric } from "../types.js";
import { fetchJson } from "../util.js";

const UA = "Mozilla/5.0 (compatible; KoreaEarlyWarning/0.1; personal research)";

export interface FxQuote {
  price: number;
  previousClose: number;
  changePct: number;
  at?: number;
  dayHigh?: number;
  dayLow?: number;
}

export function parseYahooChart(data: any): FxQuote {
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("Yahoo 응답에 시세 없음");
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  return {
    price: meta.regularMarketPrice,
    previousClose: prev,
    changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    at: meta.regularMarketTime ? meta.regularMarketTime * 1000 : undefined,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
  };
}

export async function fetchUsdKrw(): Promise<FxQuote> {
  const data = await fetchJson<any>("https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=2d&interval=15m", { headers: { "User-Agent": UA } });
  return parseYahooChart(data);
}

export async function collectMarkets(now = Date.now()): Promise<CollectResult> {
  const fx = await fetchUsdKrw();
  const metrics: Metric[] = [
    { indicator: "market.usdkrw_change_pct", value: Math.abs(fx.changePct), meta: { price: fx.price, previousClose: fx.previousClose, signedPct: +fx.changePct.toFixed(2), dayHigh: fx.dayHigh, dayLow: fx.dayLow, quoteTime: fx.at } },
  ];
  return { source: "markets", ok: true, fetchedAt: now, rawCount: 1, signals: [], metrics };
}
