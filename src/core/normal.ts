// 평소 범위와 이탈 (2026-11-13 사용자: "신호는 늘 오르락내리락한다 — 그 평범한 흔들림의 범위를 배워 두면, 거기서 벗어나는 것을 잡을 수 있다. 기록이 쌓일수록 그게 이 서비스의 자산이 된다")
//
// 세 가지를 한다:
//  ① 신호마다 '평소 범위'(평소 값 ± 2 표준편차)와 지금 위치를 보여 준다. 평소 값은 징후마다 이미 배우고 있는 것(최근 4주 같은 시간대)을 쓴다.
//  ② 오늘 '나쁜 방향으로' 범위를 벗어난 신호가 몇 개인지(k) 세고, 그게 얼마나 드문 일인지 말한다 — 기록이 적을 때는 이론값(신호가 서로 무관하고 종 모양으로
//     흔들린다고 놓은 값)으로, 날마다 쌓이는 실제 기록(하루 중 가장 많이 벗어났던 수)이 14일을 넘으면 그 기록으로. 쌓일수록 이쪽이 정확해진다.
//  ③ 긴 평소: 최근 4주만 보면 긴장이 몇 달 이어질 때 그게 '평소'가 돼 버린다. 그래서 신호마다 하루 평균의 긴 기록(전체 기간 평균·흔들림)을 따로 쌓는다(KV norm:long).
//     30일이 쌓이면 '긴 평소 대비'도 함께 보여 준다.
// 이 값은 아직 단계·%·알림에 쓰지 않는다 — 평소에 몇 개가 우연히 벗어나는지를 먼저 재야 헛경보를 알 수 있다.
import type { BoardRow } from "./state.js";
import { kstDay } from "./store.js";

export const NORM_LONG_KEY = "norm:long";
/** 범위 밖으로 보는 기준 (표준편차의 몇 배) · 크게 벗어남 */
export const OUT_Z = 2, FAR_Z = 4;
/** 실제 기록으로 드문 정도를 말하기 시작하는 날 수 · 긴 평소를 보여 주기 시작하는 날 수 */
export const EMPIRICAL_DAYS = 14, LONG_DAYS = 30;
/** 종 모양으로 흔들릴 때 한쪽으로 2 표준편차를 넘을 확률 */
const P_OUT = 0.0228;

export interface NormItem {
  id: string;
  label: string;
  group: string;
  /** 나쁜 방향을 +로 놓은 이탈 정도 (표준편차의 몇 배) */
  z: number;
  value: number;
  baseline: number;
  sd: number;
  unit: string;
  out: boolean;
  far: boolean;
  /** 긴 평소 대비 이탈 (30일 이상 쌓였을 때만) */
  zLong?: number;
}

export interface NormView {
  /** 평소 범위를 아는 신호 수 · 그중 나쁜 방향으로 범위를 벗어난 수 */
  measured: number;
  k: number;
  /** 아직 평소를 배우는 중인 신호 수 */
  learning: number;
  items: NormItem[];
  /** 평소 하루에 벗어나는 수 (기대값) */
  usual: number;
  /** 이 정도 이상 벗어난 날의 비율 % 와 그 근거 */
  rarity: { pct: number; basis: "theory" | "record"; days: number; text: string };
  /** 긴 평소를 쌓은 날 수 */
  longDays: number;
  text: string;
}

/** 긴 평소의 재료: 오늘 누적(합·횟수)과 신호별 [날 수, 평균, 제곱편차 합] */
export interface NormLong {
  v: 1;
  today: { d: string; s: Record<string, [number, number]> };
  long: Record<string, [number, number, number]>;
  days: number;
}
export const emptyLong = (now: number): NormLong => ({ v: 1, today: { d: kstDay(now), s: {} }, long: {}, days: 0 });

const usable = (r: BoardRow) => !!r.reading && r.stateLabel !== "측정 불가" && !r.failing && typeof r.reading.z === "number" && typeof r.reading.baseline === "number" && (r.reading.sd ?? 0) > 0;
/** 나쁜 방향을 +로: 높을수록 나쁜 신호는 그대로, 낮을수록 나쁜 신호는 뒤집고, 양쪽 다 나쁜 신호는 절댓값 */
const bad = (dir: BoardRow["direction"], z: number) => (dir === "low" ? -z : dir === "both" ? Math.abs(z) : z);

/** 포아송 분포에서 k 이상이 나올 확률 */
function poissonTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda), cdf = term;
  for (let i = 1; i < k; i++) { term *= lambda / i; cdf += term; }
  return Math.max(0, 1 - cdf);
}

/**
 * @param pastK 지난 날들의 '하루 중 가장 많이 벗어났던 수' (오늘 제외)
 */
export function assessNormal(board: BoardRow[], pastK: number[] = [], long?: NormLong): NormView {
  const rows = board.filter(usable);
  const learning = board.filter((r) => r.reading?.state === "learning").length;
  const showLong = !!long && long.days >= LONG_DAYS;
  const items: NormItem[] = rows.map((r) => {
    const rd = r.reading!, z = +bad(r.direction, rd.z!).toFixed(2);
    let zLong: number | undefined;
    const L = showLong ? long!.long[r.id] : undefined;
    if (L && L[0] >= LONG_DAYS) { const sd = Math.sqrt(L[2] / (L[0] - 1)); if (sd > 0) zLong = +bad(r.direction, (rd.value - L[1]) / sd).toFixed(2); }
    return { id: r.id, label: r.label, group: r.groupLabel, z, value: rd.value, baseline: rd.baseline!, sd: rd.sd!, unit: r.unit, out: z >= OUT_Z, far: z >= FAR_Z, ...(zLong !== undefined ? { zLong } : {}) };
  }).sort((a, b) => b.z - a.z);
  const k = items.filter((x) => x.out).length, n = items.length;
  const useRecord = pastK.length >= EMPIRICAL_DAYS;
  const usual = useRecord ? +(pastK.reduce((a, b) => a + b, 0) / pastK.length).toFixed(1) : +(P_OUT * n).toFixed(1);
  const pct = useRecord ? Math.round((pastK.filter((x) => x >= k).length / pastK.length) * 100) : Math.round(poissonTail(k, P_OUT * n) * 100);
  const rarityText = k === 0
    ? "범위를 벗어난 신호가 없어요."
    : useRecord
    ? `지난 ${pastK.length}일 가운데 이만큼(${k}개 이상) 벗어난 날은 ${pastK.filter((x) => x >= k).length}일(${pct}%)이었어요.`
    : `신호들이 서로 무관하게 흔들린다면 이만큼(${k}개 이상) 벗어날 확률은 약 ${pct < 1 ? "1% 미만" : pct + "%"}예요 (이론값 — 실제 기록 ${pastK.length}일, ${EMPIRICAL_DAYS}일이 쌓이면 기록으로 바꿔요).`;
  const names = items.filter((x) => x.out).slice(0, 3).map((x) => x.label.replace(/\s*\(.*\)$/, ""));
  return {
    measured: n, k, learning, items, usual,
    rarity: { pct, basis: useRecord ? "record" : "theory", days: pastK.length, text: rarityText },
    longDays: long?.days ?? 0,
    text: `평소 범위를 아는 신호 ${n}개 중 ${k}개가 나쁜 방향으로 범위를 벗어났어요${names.length ? ` (${names.join(", ")}${k > 3 ? " 등" : ""})` : ""}. 평소엔 하루 ${usual}개쯤이에요. ${rarityText}`,
  };
}

/** 5분 주기에서: 오늘의 합에 지금 값을 더하고, 날이 바뀌었으면 어제의 하루 평균을 긴 평소에 넣는다 (웰퍼드 방식 — 날 수·평균·제곱편차 합만 남긴다) */
export function foldLong(prev: NormLong | undefined, board: BoardRow[], now: number): NormLong {
  const d = kstDay(now);
  const L: NormLong = prev ? { ...prev, today: { d: prev.today.d, s: { ...prev.today.s } }, long: { ...prev.long } } : emptyLong(now);
  if (L.today.d !== d) {
    for (const [id, [sum, cnt]] of Object.entries(L.today.s)) {
      if (!cnt) continue;
      const x = sum / cnt, [n0, m0, s0] = L.long[id] ?? [0, 0, 0];
      const n1 = n0 + 1, m1 = m0 + (x - m0) / n1;
      L.long[id] = [n1, +m1.toPrecision(8), +(s0 + (x - m0) * (x - m1)).toPrecision(8)];
    }
    L.days += 1;
    L.today = { d, s: {} };
  }
  for (const r of board) {
    if (!r.reading || r.stateLabel === "측정 불가" || r.failing || !Number.isFinite(r.reading.value)) continue;
    const [sum, cnt] = L.today.s[r.id] ?? [0, 0];
    L.today.s[r.id] = [+(sum + r.reading.value).toPrecision(10), cnt + 1];
  }
  return L;
}
