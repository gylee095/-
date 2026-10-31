// 시장 반응: 원·달러 환율, 한국 증시의 '한국만의' 움직임, 방산주 (Yahoo Finance 비공식 API, 키 불필요, 간헐적 429)
// 돈을 건 사람들은 대중보다 먼저 움직인다. 단 세계 증시 전체가 빠지는 날과 구분하려고 일본·대만 증시와 비교한다.
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

/** 비교 묶음: 한국 증시, 이웃 증시(일본·대만), 방산 3종, 미국 상장 한국 ETF(야간 외국인 시각) */
export const EQUITY_SYMBOLS = { kospi: "^KS11", peers: ["^N225", "^TWII"], defense: ["012450.KS", "079550.KS", "064350.KS"], ewy: "EWY" };

export interface DailyMove {
  symbol: string;
  /** 직전 거래일 종가 대비 % */
  changePct: number;
  at?: number;
}

/** v7 spark 응답 → 종목별 마지막 두 종가로 일간 변동률 */
export function parseSpark(json: any): DailyMove[] {
  const out: DailyMove[] = [];
  for (const r of json?.spark?.result ?? []) {
    const resp = r?.response?.[0];
    const closes: number[] = (resp?.indicators?.quote?.[0]?.close ?? []).filter((x: unknown) => typeof x === "number");
    const meta = resp?.meta ?? {};
    const last = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    const prev = typeof meta.chartPreviousClose === "number" && closes.length < 2 ? meta.chartPreviousClose : closes.length >= 2 ? closes[closes.length - 2] : meta.previousClose;
    if (typeof last !== "number" || typeof prev !== "number" || !prev) continue;
    out.push({ symbol: r.symbol, changePct: ((last - prev) / prev) * 100, at: meta.regularMarketTime ? meta.regularMarketTime * 1000 : undefined });
  }
  return out;
}

export function equityMetrics(moves: DailyMove[]): Metric[] {
  const by = new Map(moves.map((m) => [m.symbol, m]));
  const kospi = by.get(EQUITY_SYMBOLS.kospi);
  if (!kospi) return [];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const peers = EQUITY_SYMBOLS.peers.map((s) => by.get(s)).filter(Boolean) as DailyMove[];
  const defense = EQUITY_SYMBOLS.defense.map((s) => by.get(s)).filter(Boolean) as DailyMove[];
  const r2 = (x: number) => +x.toFixed(2);
  const out: Metric[] = [];
  if (peers.length) {
    const rel = kospi.changePct - mean(peers.map((p) => p.changePct));
    out.push({
      indicator: "market.kr_equity_rel_pct",
      value: r2(rel),
      meta: { kospiPct: r2(kospi.changePct), peersPct: r2(mean(peers.map((p) => p.changePct))), ewyPct: by.get(EQUITY_SYMBOLS.ewy) ? r2(by.get(EQUITY_SYMBOLS.ewy)!.changePct) : undefined, quoteTime: kospi.at, note: "코스피 일간 변동 − 일본·대만 증시 평균 (음수 = 한국만 더 빠짐)" },
    });
  }
  if (defense.length) {
    const rel = mean(defense.map((d) => d.changePct)) - kospi.changePct;
    out.push({ indicator: "market.defense_rel_pct", value: r2(rel), meta: { defensePct: defense.map((d) => ({ symbol: d.symbol, pct: r2(d.changePct) })), kospiPct: r2(kospi.changePct), note: "방산 3종(한화에어로스페이스·LIG넥스원·현대로템) 평균 − 코스피" } });
  }
  return out;
}

export async function fetchEquities(): Promise<DailyMove[]> {
  const syms = [EQUITY_SYMBOLS.kospi, ...EQUITY_SYMBOLS.peers, ...EQUITY_SYMBOLS.defense, EQUITY_SYMBOLS.ewy].map(encodeURIComponent).join(",");
  const data = await fetchJson<any>(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${syms}&range=5d&interval=1d`, { headers: { "User-Agent": UA } });
  return parseSpark(data);
}

export async function collectMarkets(now = Date.now()): Promise<CollectResult> {
  const [fxR, eqR] = await Promise.allSettled([fetchUsdKrw(), fetchEquities()]);
  const metrics: Metric[] = [];
  if (fxR.status === "fulfilled") {
    const fx = fxR.value;
    metrics.push({ indicator: "market.usdkrw_change_pct", value: Math.abs(fx.changePct), meta: { price: fx.price, previousClose: fx.previousClose, signedPct: +fx.changePct.toFixed(2), dayHigh: fx.dayHigh, dayLow: fx.dayLow, quoteTime: fx.at } });
  }
  if (eqR.status === "fulfilled") metrics.push(...equityMetrics(eqR.value));
  const errors = [fxR, eqR].map((r, i) => (r.status === "rejected" ? `${i ? "증시" : "환율"}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 120)}` : "")).filter(Boolean);
  return { source: "markets", ok: metrics.length > 0, error: errors.length ? errors.join(" / ") : undefined, fetchedAt: now, rawCount: metrics.length, signals: [], metrics };
}
