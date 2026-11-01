// 북한 장마당 물가 — 아시아프레스 'Latest Market Price Index Inside N.Korea' (북한 안 협력자 조사, 매주, 2017년 10월~).
// 북한 안쪽을 공개적으로 볼 수 있는 거의 유일한 창이다. 전쟁을 준비하면 군이 연료를 비축하고 주민이 쌀을 사재기해 값이 뛸 것이라는 논리지만,
// 제재·국경 봉쇄·밀수 단속·국제 유가(2026-03 미국-이란 전쟁)로도 크게 뛴다. 그래서 판정에는 약한 힌트로만 쓴다(북한 쪽 영역 최대 1점).
// 판정: 이번 주 값 ÷ 직전 8주 중앙값 (휘발유·쌀·달러 환율). 10배 오타 같은 튀는 값은 앞뒤 중앙값으로 거른다. 근거: docs/INDICATORS.md 0.7
import type { CollectResult, Metric } from "../types.js";
import { fetchText } from "../util.js";

export const ASIAPRESS_PRICES = "https://www.asiapress.org/rimjin-gang/north-k-korea-prices/";
const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12 };

export interface PriceWeek {
  d: string;
  gas?: number;
  diesel?: number;
  rice?: number;
  corn?: number;
  cny?: number;
  usd?: number;
}

const decode = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const num = (x: string | undefined) => {
  const m = /([\d,.]{3,})\s*Won/i.exec(x ?? "") ?? /^([\d,]{3,})/.exec((x ?? "").trim());
  const v = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/** 표의 한 줄: 날짜(뒤에 설명이 붙기도 함) · 휘발유 · 경유 · 쌀 · 옥수수 · 위안 · 달러 (북한 원, kg당) */
export function parsePriceTable(html: string): PriceWeek[] {
  const out = new Map<string, PriceWeek>();
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => decode(m[1]));
    if (cells.length < 6) continue;
    const m = /^([A-Z][a-z]{2,4})\.?\s*(\d{1,2}),\s*(\d{4})/.exec(cells[0]);
    if (!m || !MONTHS[m[1]]) continue;
    const d = `${m[3]}-${String(MONTHS[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    out.set(d, { d, gas: num(cells[1]), diesel: num(cells[2]), rice: num(cells[3]), corn: num(cells[4]), cny: num(cells[5]), usd: num(cells[6]) });
  }
  return [...out.values()].sort((a, b) => a.d.localeCompare(b.d));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

/** 마지막 주 값 ÷ 직전 8주 중앙값 − 1 (%). 앞뒤 값 중앙값의 3배를 넘거나 1/3 밑인 값(오타)은 뺀다 */
export function weeklyChange(weeks: PriceWeek[], key: keyof Omit<PriceWeek, "d">): { pct: number; value: number; usual: number; date: string } | undefined {
  const pts = weeks.map((w) => ({ d: w.d, v: w[key] as number | undefined })).filter((p): p is { d: string; v: number } => p.v !== undefined);
  const clean = pts.filter((p, i) => {
    const near = pts.slice(Math.max(0, i - 2), i + 3).map((x) => x.v);
    const m = median(near);
    return p.v < m * 3 && p.v > m / 3;
  });
  if (clean.length < 7) return undefined;
  const last = clean[clean.length - 1];
  const usual = median(clean.slice(-9, -1).map((p) => p.v));
  if (!(usual > 0)) return undefined;
  return { pct: Math.round((last.v / usual - 1) * 1000) / 10, value: last.v, usual: Math.round(usual), date: last.d };
}

export function nkMarketMetrics(weeks: PriceWeek[]): Metric[] {
  const out: Metric[] = [];
  const recent = weeks.slice(-8).map((w) => ({ d: w.d.slice(5), gas: w.gas, rice: w.rice, usd: w.usd }));
  const fuel = weeklyChange(weeks, "gas");
  const diesel = weeklyChange(weeks, "diesel");
  if (fuel) out.push({ indicator: "nk.fuel_price_change_pct", value: fuel.pct, meta: { dataDate: fuel.date, gasWon: fuel.value, usualWon: fuel.usual, dieselPct: diesel?.pct, recent, note: "북한 장마당 휘발유 kg당 값 — 직전 8주 중앙값 대비 (아시아프레스 매주 조사)" } });
  const rice = weeklyChange(weeks, "rice");
  if (rice) out.push({ indicator: "nk.rice_price_change_pct", value: rice.pct, meta: { dataDate: rice.date, riceWon: rice.value, usualWon: rice.usual, recent, note: "북한 장마당 쌀 kg당 값 — 직전 8주 중앙값 대비" } });
  const usd = weeklyChange(weeks, "usd");
  if (usd) out.push({ indicator: "nk.usd_rate_change_pct", value: usd.pct, meta: { dataDate: usd.date, usdWon: usd.value, usualWon: usd.usual, note: "북한 장마당 1달러 값(원) — 직전 8주 중앙값 대비 (오르면 북한 돈이 약해짐)" } });
  return out;
}

export async function collectNkMarket(now = Date.now()): Promise<CollectResult> {
  const html = await fetchText(ASIAPRESS_PRICES, { headers: { "User-Agent": "Mozilla/5.0 (compatible; KoreaEarlyWarning/0.1; personal research)" } }, 25000);
  const weeks = parsePriceTable(html);
  if (weeks.length < 10) return { source: "nk_market", ok: false, error: `표를 읽지 못함 (${weeks.length}주)`, fetchedAt: now, rawCount: weeks.length, signals: [] };
  return { source: "nk_market", ok: true, fetchedAt: now, rawCount: weeks.length, signals: [], metrics: nkMarketMetrics(weeks) };
}
