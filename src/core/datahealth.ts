// 데이터를 제대로 받고 있나 (2026-11-02)
// 소스가 계속 실패해도 징후 카드는 마지막 값('재난문자 0건 · 정상')을 30시간까지 그대로 보여 줬다.
// 11/2 14:50부터 국민재난안전포털·정책브리핑이 서버 접속에 응답하지 않았는데(HTTP 522) 화면은 평소처럼 보였다.
// 이제 실패가 30분 넘게 이어지거나 하루 넘게 수집 기록이 없는 소스는 '못 받는 것'으로 맨 위에 보이고, 그 소스의 카드는 '수집 실패'가 된다.
import type { SourceHealth } from "./store.js";

/** 실패가 이만큼 이어지면 '못 받는 중'으로 본다 (5분 주기 소스 기준 여섯 번 연속) */
export const FAIL_AFTER_MS = 30 * 60_000;
/** 하루 한 번 도는 소스도 이만큼 기록이 없으면 멈춘 것이다 */
export const STALE_AFTER_MS = 26 * 3600_000;

export interface FailingSource {
  source: string;
  /** 사람이 읽는 짧은 이름 */
  name: string;
  /** 마지막으로 성공한 시각 (모르면 없음) */
  since?: number;
  error?: string;
}

export interface DataHealth {
  /** 지금 쓰는 소스 수 */
  total: number;
  ok: number;
  failing: FailingSource[];
  /** 아직 평소를 배우는 징후 수 */
  learning: number;
}

/** 이 소스를 지금 못 받고 있나: 실패가 30분 넘게 이어졌거나(성공 시각을 모르면 실패 그 자체), 하루 넘게 수집 기록이 없다 */
export function isFailing(h: SourceHealth | undefined, now: number): boolean {
  if (!h) return false;
  if (now - h.fetchedAt > STALE_AFTER_MS) return true;
  if (h.ok) return false;
  return now - (h.lastOkAt ?? 0) > FAIL_AFTER_MS;
}

/** '행정안전부 긴급재난문자 API (safetydata.go.kr)' → '행정안전부 긴급재난문자' */
export const shortSourceName = (name: string) => name.split(" (")[0].replace(/\s*API$/, "").trim();

export function dataHealthOf(health: SourceHealth[], sources: { id: string; name: string }[], board: { reading?: { state: string } }[], now: number): DataHealth {
  const active = new Map(sources.map((s) => [s.id, s.name]));
  const hs = health.filter((h) => active.has(h.source));
  const failing = hs
    .filter((h) => isFailing(h, now))
    .map((h) => ({ source: h.source, name: shortSourceName(active.get(h.source)!), ...(h.lastOkAt ? { since: h.lastOkAt } : {}), ...(h.error ? { error: h.error.slice(0, 120) } : {}) }));
  return { total: hs.length, ok: hs.length - failing.length, failing, learning: board.filter((b) => b.reading?.state === "learning").length };
}

/** 소스가 못 받는 중인 징후 카드에 표시를 붙인다 (값은 마지막 값 그대로 — 판정 모델은 마지막으로 알던 상태를 계속 쓴다) */
export function markFailing<T extends { reading?: { source?: string; at: number }; stateLabel: string; failing?: { source: string; since: number; error?: string } }>(
  board: T[],
  health: SourceHealth[],
  now: number,
): T[] {
  const by = new Map(health.map((h) => [h.source, h]));
  for (const row of board) {
    const src = row.reading?.source;
    const h = src ? by.get(src) : undefined;
    if (!src || !h || !isFailing(h, now)) continue;
    row.failing = { source: src, since: h.lastOkAt ?? row.reading!.at, ...(h.error ? { error: h.error.slice(0, 120) } : {}) };
    row.stateLabel = "수집 실패";
  }
  return board;
}
