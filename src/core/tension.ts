// 긴장 온도계 — "지금이 지난 10년(2016~) 중 어디쯤인가". 확률이 아니라 같은 잣대로 잰 긴장의 크기다.
// 과거 자료가 있는 것만 쓴다: 북한 도발(CSIS Beyond Parallel), 네이버 검색(2016~), 위키백과 조회수, 코스피·방산주·원화(야후), 외국인 매매(한국은행).
// 정부 경보·북한 담화·항공·선박 신호는 과거 자료가 없어 넣지 않았다 — 그것들은 전쟁 위험 판정이 따로 본다.
// 과거 재구성(scripts/build-tension-history.ts)과 지금 계산이 같은 함수를 쓴다. 근거·검증: docs/INDICATORS.md 0.2
import type { BoardRow } from "./state.js";
import type { EventBrief } from "./brief.js";
import { TENSION_DAILY, TENSION_FROM, TENSION_Q, TENSION_TOP, TENSION_TO } from "./tension_history.js";

export type TensionKey = "nk" | "war" | "wiki" | "kospiDrop" | "defenseUp" | "krwWeak" | "foreignSell";
/** 요소별 문턱 [상위 10%, 2.5%, 0.5%, 0.1%] — 2016-02-01 ~ 2026-10-31 하루 값의 분포 */
export type Thresholds = Record<TensionKey, [number, number, number, number]>;

export interface TensionInputs {
  /** 네이버 '북한 도발' 검색(북한 미사일·도발·포격·공격) 배율 — 직전 28일 중앙값 대비 */
  nk?: number;
  /** 네이버 '전쟁 불안' 검색 배율 — 다른 나라 전쟁에도 오르므로 북한 쪽 계기(도발 검색 급증·큰 도발)가 있을 때만 센다 */
  war?: number;
  /** 위키백과 한반도 문서 배율의 중앙값 — 정상회담 같은 큰 뉴스에도 오르므로 북한 쪽 계기가 있을 때만 */
  wiki?: number;
  /** 코스피 − 닛케이·대만 평균 (%p, 음수 = 한국만 하락) */
  kospiRelPct?: number;
  /** 방산 3종 평균 − 코스피 (%p) */
  defenseRelPct?: number;
  /** 원화 약세 − 엔·대만달러 평균 약세 (%p) */
  krwRelPct?: number;
  /** 외국인 코스피 5거래일 순매수 z (음수 = 평소보다 많이 판다) */
  foreignZ?: number;
  /** 최근 7일 북한 도발 최고 위험도 (2 방사포·순항 / 3 탄도 / 4 ICBM·일본 상공·포격·위성 / 5 핵실험·영토 인근 포격) */
  maxDanger7?: number;
  /** 최근 7일 위험도 3 이상 도발이 있었던 날 수 */
  provDays7?: number;
}

export interface TensionReading {
  /** 원점수 0~9 (군사·사람·돈 각 0~3) */
  raw: number;
  /** 지난 10년 하루하루 중 오늘보다 조용했던 날의 비율 (%) */
  pct: number;
  parts: { military: number; public: number; money: number };
  units: Partial<Record<TensionKey, number>>;
  drivers: string[];
}

export const MILITARY_UNITS: Record<number, number> = { 0: 0, 1: 0, 2: 0.25, 3: 0.5, 4: 1.5, 5: 3 };

/** 상위 10% 이하 0, 상위 2.5% = 1, 0.5% = 2, 0.1% 이상 = 3 (사이는 직선) */
export function unitsOf(x: number | undefined, q: [number, number, number, number]): number {
  if (x === undefined || !Number.isFinite(x)) return 0;
  const [a, b, c, d] = q;
  if (x <= a) return 0;
  if (x <= b) return (x - a) / (b - a);
  if (x <= c) return 1 + (x - b) / (c - b);
  return Math.min(3, 2 + (x - c) / (d - c));
}

export function tensionRaw(x: TensionInputs, Q: Thresholds = TENSION_Q): Omit<TensionReading, "pct" | "drivers"> {
  const u: Partial<Record<TensionKey, number>> = {
    nk: unitsOf(x.nk, Q.nk),
    war: unitsOf(x.war, Q.war),
    wiki: unitsOf(x.wiki, Q.wiki),
    kospiDrop: unitsOf(x.kospiRelPct === undefined ? undefined : -x.kospiRelPct, Q.kospiDrop),
    defenseUp: unitsOf(x.defenseRelPct, Q.defenseUp),
    krwWeak: unitsOf(x.krwRelPct, Q.krwWeak),
    foreignSell: unitsOf(x.foreignZ === undefined ? undefined : -x.foreignZ, Q.foreignSell),
  };
  // 사람들: 북한 도발 검색이 기준. '전쟁' 검색과 위키 관심은 북한 쪽 계기가 있을 때만 센다 — 북한 도발 검색이 상위 10% 이상이거나
  // 최근 7일 큰 도발(위험도 4 이상: ICBM·일본 상공·포격·위성·핵실험). 다른 나라 전쟁·민방위 훈련·지진·정상회담에 오른 검색을 걸러낸다.
  // (핵실험 날 사람들은 '북한 미사일'보다 '핵실험·지진'을 찾아서, 검색만으로 열면 6차 핵실험이 빠진다 — 2017-09-03)
  const nkUp = (x.nk ?? 0) >= Q.nk[0] || (x.maxDanger7 ?? 0) >= 4;
  const pub = Math.max(u.nk!, nkUp ? u.war! : 0, nkUp ? u.wiki! : 0);
  // 돈: 네 가지 중 위 두 개의 평균 — 하나만 튄 날(업종 소식·세계 증시)은 반만 센다
  const m = [u.kospiDrop!, u.defenseUp!, u.krwWeak!, u.foreignSell!].sort((a, b) => b - a);
  const money = (m[0] + m[1]) / 2;
  const mil = Math.min(3, (MILITARY_UNITS[Math.round(x.maxDanger7 ?? 0)] ?? 0) + ((x.provDays7 ?? 0) >= 3 ? 0.5 : 0));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { raw: r2(mil + pub + money), parts: { military: r2(mil), public: r2(pub), money: r2(money) }, units: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, r2(v!)])) };
}

let sortedCache: number[] | undefined;
export function historyValues(): number[] {
  return TENSION_DAILY.split(",").map(Number);
}
/** 지난 10년 중 이 값보다 낮았던 날의 비율 (같은 값은 절반) */
export function percentileOf(raw: number): number {
  const s = (sortedCache ??= historyValues().sort((a, b) => a - b));
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid] < raw) lo = mid + 1;
    else hi = mid;
  }
  let eq = lo;
  while (eq < s.length && s[eq] === raw) eq++;
  return Math.round(((lo + (eq - lo) / 2) / s.length) * 1000) / 10;
}

const groupRatio = (r: BoardRow | undefined, name: string) => {
  const g = ((r?.reading?.meta as any)?.groups ?? []).find((x: any) => x.group === name);
  return typeof g?.ratio === "number" ? g.ratio : undefined;
};
const fresh = (r: BoardRow | undefined, now: number, maxH = 30) => (r?.reading && now - r.reading.at < maxH * 3600_000 ? r.reading : undefined);

/** 지금의 입력값 — 징후판과 최근 사건에서 (과거 재구성과 같은 정의) */
export function liveInputs(board: BoardRow[], briefs: EventBrief[], now: number): TensionInputs {
  const by = Object.fromEntries(board.map((b) => [b.id, b])) as Record<string, BoardRow>;
  const naver = fresh(by["psych.naver_war_search"], now, 54) ? by["psych.naver_war_search"] : undefined;
  const wiki = fresh(by["psych.wiki_korea_attention"], now, 54);
  const eq = fresh(by["market.kr_equity_rel_pct"], now, 100);
  const def = fresh(by["market.defense_rel_pct"], now, 100);
  const fz = fresh(by["elite.foreign_net_kospi"], now, 100);
  const week = briefs.filter((b) => now - b.at < 7 * 86400_000 && now - b.at >= -3600_000 && b.danger.level >= 2 && (b.isProvocation || b.danger.level >= 3));
  const kday = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  return {
    nk: groupRatio(naver, "북한 도발"),
    war: groupRatio(naver, "전쟁 불안"),
    wiki: wiki ? wiki.value / 100 : undefined,
    kospiRelPct: eq?.value,
    krwRelPct: typeof (eq?.meta as any)?.krwRelPct === "number" ? (eq!.meta as any).krwRelPct : undefined,
    defenseRelPct: def?.value,
    foreignZ: fz?.value,
    maxDanger7: week.reduce((m, b) => Math.max(m, b.danger.level), 0),
    provDays7: new Set(week.filter((b) => b.danger.level >= 3).map((b) => kday(b.at))).size,
  };
}

const PART_LABEL = { military: "북한 도발", public: "사람들의 불안", money: "한국만의 돈 움직임" } as const;

export function tensionOf(x: TensionInputs): TensionReading {
  const r = tensionRaw(x);
  const drivers: string[] = [];
  if (r.parts.military > 0) drivers.push(`${PART_LABEL.military} ${r.parts.military}점 (최근 7일 최고 위험도 ${x.maxDanger7})`);
  if (r.parts.public > 0) drivers.push(`${PART_LABEL.public} ${r.parts.public}점 (북한 도발 검색 ${x.nk?.toFixed(1) ?? "?"}배, 전쟁 검색 ${x.war?.toFixed(1) ?? "?"}배, 위키 관심 ${x.wiki?.toFixed(1) ?? "?"}배)`);
  if (r.parts.money > 0) drivers.push(`${PART_LABEL.money} ${r.parts.money}점`);
  return { ...r, pct: percentileOf(r.raw), drivers };
}

export interface TensionView {
  now: TensionReading;
  /** 지난 10년 기준 기간 */
  from: string;
  to: string;
  /** 가장 긴장됐던 날들 (사건 이름 포함) */
  top: typeof TENSION_TOP;
  /** 오늘과 원점수가 가장 가까운 과거의 큰 날들 */
  similar: typeof TENSION_TOP;
  /** 달마다 최고값 (차트용, 오래된 → 최근) — 주 단위는 휴대폰 화면에서 빗살처럼 빽빽해 읽기 어렵다 */
  monthly: { d: string; raw: number }[];
  /** 기준선: 하루 값의 상위 10%·2.5% 경계 (원점수) */
  levels: { top10: number; top2_5: number };
}

export function tensionView(now: TensionReading): TensionView {
  const vals = historyValues();
  const start = Date.parse(`${TENSION_FROM}T00:00:00Z`);
  const byMonth = new Map<string, number>();
  vals.forEach((v, i) => {
    const m = new Date(start + i * 86400_000).toISOString().slice(0, 7);
    byMonth.set(m, Math.max(byMonth.get(m) ?? 0, v));
  });
  const monthly = [...byMonth.entries()].map(([m, raw]) => ({ d: `${m}-15`, raw }));
  // 비슷했던 날: 오늘이 상위 5% 안일 때만 (그 아래는 '큰 날'과 비교할 거리가 아니다)
  const similar = now.pct >= 95 ? [...TENSION_TOP].sort((a, b) => Math.abs(a.raw - now.raw) - Math.abs(b.raw - now.raw)).slice(0, 3) : [];
  const sorted = [...vals].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { now, from: TENSION_FROM, to: TENSION_TO, top: TENSION_TOP.slice(0, 10), similar, monthly, levels: { top10: q(0.9), top2_5: q(0.975) } };
}
