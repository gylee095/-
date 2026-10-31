// 예측시장(Polymarket) — 돈을 건 사람들이 매기는 '한반도 전쟁' 가격. 키 불필요 공개 API.
// 낮은 확률(수 %)은 실제보다 높게 매겨지는 경향(롱샷 편향·자금 묶임 비용)이 있어, 절대값보다 '변화'를 본다.
import type { CollectResult, Metric } from "../types.js";
import { fetchJson } from "../util.js";

export const PM_SEARCH = "https://gamma-api.polymarket.com/public-search";
// 검색어가 넓으면 응답이 수백 KB 가 된다(예: "trump kim jong un" 529KB) — Worker CPU 를 아끼려고 좁은 검색어만 쓴다 (합계 약 100KB)
export const PM_QUERIES = ["north korea invade", "north korea war", "north korea diplomatic meeting", "north korea talks"];

export interface PmMarket {
  id: string;
  question: string;
  yes: number;
  volume: number;
  endDate?: string;
  slug?: string;
}

const KOREA_RE = /korea|kim jong un|pyongyang/i;
export const PM_WAR_RE = /invade|invasion|\bwar\b|military (clash|conflict|action)|armed conflict|strike on|attack on|nuclear (attack|strike)|declare war/i;
const PM_NOT_WAR_RE = /trade war|bitcoin|etf|ewy|inflation|bank of korea|election|lol|overwatch|worlds|kimchi/i;
export const PM_DIPLO_RE = /diplomatic meeting|direct talks|meet with kim jong un|visit north korea|summit/i;
export const PM_REGIME_RE = /kim jong un out|supreme leader/i;

export function parsePmSearch(json: any): PmMarket[] {
  const out: PmMarket[] = [];
  for (const ev of json?.events ?? []) {
    for (const m of ev?.markets ?? []) {
      if (!m || m.closed || m.active === false || typeof m.question !== "string") continue;
      let prices: number[] = [];
      try {
        prices = (typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices ?? []).map(Number);
      } catch {
        continue;
      }
      if (!Number.isFinite(prices[0])) continue;
      out.push({ id: String(m.id), question: m.question, yes: prices[0], volume: Number(m.volume ?? 0), endDate: m.endDate, slug: ev.slug ?? m.slug });
    }
  }
  return out;
}

export interface PmSummary {
  war?: PmMarket & { daysLeft?: number };
  diplomacy: PmMarket[];
  regime?: PmMarket;
  /** 이번 달 북한 미사일 시험 0회일 확률 → 1회 이상 = 1 - 이 값 */
  testsNone?: PmMarket;
}

export function summarizePm(markets: PmMarket[], now: number): PmSummary {
  const uniq = [...new Map(markets.map((m) => [m.id, m])).values()].filter((m) => KOREA_RE.test(m.question));
  const daysLeft = (m: PmMarket) => (m.endDate ? (Date.parse(m.endDate) - now) / 86400_000 : undefined);
  const war = uniq.filter((m) => PM_WAR_RE.test(m.question) && !PM_NOT_WAR_RE.test(m.question));
  // 만기가 2주 이상 남은 시장 중 거래가 가장 많은 것 (만기 직전 가격은 왜곡이 크다)
  const pick = [...war].sort((a, b) => b.volume - a.volume).find((m) => (daysLeft(m) ?? 99) >= 14) ?? war.sort((a, b) => b.volume - a.volume)[0];
  return {
    war: pick && { ...pick, daysLeft: daysLeft(pick) },
    diplomacy: uniq.filter((m) => PM_DIPLO_RE.test(m.question) && (daysLeft(m) ?? 99) > 0 && m.volume >= 1000).sort((a, b) => b.volume - a.volume).slice(0, 4),
    regime: uniq.filter((m) => PM_REGIME_RE.test(m.question)).sort((a, b) => b.volume - a.volume)[0],
    testsNone: uniq.find((m) => /fewer than 1 north korea test/i.test(m.question)),
  };
}

/** 자주 쓰는 시장 질문을 한국어로 (모르는 형식은 원문 유지) */
export function koQuestion(q: string): string {
  const year = (s: string) => (/December 31, (\d{4})/.exec(s)?.[1] ? `${/December 31, (\d{4})/.exec(s)![1]}년 말까지` : /December 31/.test(s) ? "연말까지" : "");
  let m: RegExpExecArray | null;
  if ((m = /invade South Korea before (\d{4})/i.exec(q))) return `${m[1]}년 전 북한의 한국 침공`;
  if (/North and South Korea engage in direct talks/i.test(q)) return `${year(q)} 남북 직접 대화`.trim();
  if (/North Korea x South Korea diplomatic meeting/i.test(q)) return `${year(q)} 남북 외교 접촉(직·간접)`.trim();
  if (/US x North Korea diplomatic meeting/i.test(q)) return `${year(q)} 북미 외교 접촉`.trim();
  if ((m = /Trump meet with Kim Jong Un in (\d{4})/i.exec(q))) return `${m[1]}년 트럼프·김정은 회동`;
  if ((m = /Trump visit North Korea in (\d{4})/i.exec(q))) return `${m[1]}년 트럼프 방북`;
  if (/Trump visit North Korea by December 31/i.test(q)) return `${year(q)} 트럼프 방북`.trim();
  if ((m = /Kim Jong Un out as Supreme Leader.*?(\d{4})/i.exec(q))) return `${m[1]}년 안 김정은 실각`;
  return q;
}

export function pmMetrics(s: PmSummary): Metric[] {
  if (!s.war) return [];
  const pct = (x: number) => +(x * 100).toFixed(2);
  return [
    {
      indicator: "market.pm_war_prob",
      value: pct(s.war.yes),
      meta: {
        question: koQuestion(s.war.question),
        questionEn: s.war.question,
        endDate: s.war.endDate,
        daysLeft: s.war.daysLeft !== undefined ? Math.round(s.war.daysLeft) : undefined,
        volumeUsd: Math.round(s.war.volume),
        url: s.war.slug ? `https://polymarket.com/event/${s.war.slug}` : undefined,
        diplomacy: s.diplomacy.map((m) => ({ question: koQuestion(m.question), pct: pct(m.yes), volumeUsd: Math.round(m.volume) })),
        regimeChangePct: s.regime ? pct(s.regime.yes) : undefined,
        testsThisMonthPct: s.testsNone ? pct(1 - s.testsNone.yes) : undefined,
        note: "예측시장 가격 — 수 % 대 가격은 실제 확률보다 높게 매겨지는 경향. 절대값보다 변화를 본다",
      },
    },
  ];
}

export async function collectPolymarket(now = Date.now()): Promise<CollectResult> {
  const results = await Promise.allSettled(
    PM_QUERIES.map((q) => fetchJson<any>(`${PM_SEARCH}?q=${encodeURIComponent(q)}&limit_per_type=4&events_status=active&search_profiles=false&search_tags=false`, {}, 20000)),
  );
  const markets = results.flatMap((r) => (r.status === "fulfilled" ? parsePmSearch(r.value) : []));
  const s = summarizePm(markets, now);
  const metrics = pmMetrics(s);
  const failed = results.filter((r) => r.status === "rejected").length;
  return {
    source: "polymarket",
    ok: metrics.length > 0,
    error: metrics.length ? undefined : failed ? `검색 ${failed}건 실패` : "한반도 전쟁 시장을 찾지 못함",
    fetchedAt: now,
    rawCount: markets.length,
    signals: [],
    metrics,
  };
}
