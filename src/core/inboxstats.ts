// 손님 알림함이 하루에 몇 번 열렸나 (2026-11-18 사용자와 정한 것: 손님에게 매일 볼 거리를 줄지 말지는 추측으로 정하지 않고,
// 알림이 없는 날에도 앱을 열어 보는지를 세어 보고 정한다). 누가 열었는지는 남기지 않는다 — 날짜별 횟수만, 60일.
// 운영자가 '손님 화면 보기'로 연 것도 함께 세어진다(구분하지 않는다).
export const INBOX_OPENS_KEY = "inbox:opens";
export type InboxOpens = Record<string, number>;
const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function bumpOpens(raw: string | null | undefined, now: number): InboxOpens {
  let prev: InboxOpens = {};
  try { prev = raw ? (JSON.parse(raw) as InboxOpens) : {}; } catch { prev = {}; }
  const today = kstDay(now), from = kstDay(now - 60 * 86400_000);
  const out: InboxOpens = {};
  for (const [d, n] of Object.entries(prev)) if (d >= from && typeof n === "number") out[d] = n;
  out[today] = (out[today] ?? 0) + 1;
  return out;
}
export function opensSummary(raw: string | null | undefined, now: number): { today: number; last7: number; days: InboxOpens } {
  let days: InboxOpens = {};
  try { days = raw ? (JSON.parse(raw) as InboxOpens) : {}; } catch { days = {}; }
  const from = kstDay(now - 6 * 86400_000);
  return { today: days[kstDay(now)] ?? 0, last7: Object.entries(days).filter(([d]) => d >= from).reduce((a, [, n]) => a + n, 0), days };
}
/** 알림함 맨 위의 '켜져 있다' 표시 — 숫자·단계는 넣지 않는다(화재경보기의 초록 불). 20분 넘게 확인이 없으면 늦어진다고 솔직히 적는다 */
export const ALIVE_STALE_MS = 20 * 60_000;
export const aliveOf = (lastCycleRaw: string | null | undefined, now: number): { at: number; ok: boolean } | undefined => {
  try {
    const at = lastCycleRaw ? Number((JSON.parse(lastCycleRaw) as { at?: number }).at) : NaN;
    return Number.isFinite(at) ? { at, ok: now - at < ALIVE_STALE_MS } : undefined;
  } catch { return undefined; }
};
