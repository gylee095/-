// 신호의 '이상 구간' 기록 (2026-11-16 사용자: "신호는 실시간으로 잡는데, 4대가 10분만 그러다 사라질 수도 있다 — 하루 타임라인에서 언제 동안 그런 신호가 잡혔는지,
// 그리고 찾아보니 이런 이유더라가 함께 보여야 한다")
// 5분마다 잴 때 신호가 평소 범위를 벗어나면(주의·이상) 시작 시각을, 돌아오면 끝 시각과 가장 나빴던 값을 남긴다. 사라진 신호도 흔적이 남아
// 분석관이 나중에 원인을 확인할 수 있고, 화면에서 그 신호를 누르면 타임라인으로 보인다. 판정(단계·%)에는 쓰지 않는다.
import type { BoardRow } from "./state.js";

export const EPISODES_KEY = "signal:episodes";
/** 화면·분석에 쓰는 기간 · 끝난 구간이 이 안에 다시 시작되면 같은 구간으로 잇는다(깜빡임 방지) */
export const EPISODE_KEEP = 72 * 3600_000, EPISODE_JOIN = 15 * 60_000;

export interface Episode {
  id: string;
  from: number;
  /** 끝난 시각 — 없으면 아직 이어지는 중 */
  to?: number;
  /** 마지막으로 이상을 본 시각 */
  seen: number;
  /** 가장 나빴던 값과 그때의 평소 값 */
  peak: number;
  baseline?: number;
  /** 가장 높았던 수준 */
  level: "elevated" | "anomalous";
  /** 그 순간의 세부 (기종·제목 등) — 나중에는 알 수 없으니 그때 남긴다 */
  detail?: string;
}
export interface EpisodeLog { v: 1; list: Episode[] }

const abnormal = (r: BoardRow) => !!r.reading && !r.failing && r.stateLabel !== "측정 불가" && (r.reading.state === "anomalous" || r.reading.state === "elevated");
const worse = (dir: BoardRow["direction"], a: number, b: number, base?: number) =>
  dir === "low" ? Math.min(a, b) : dir === "both" && base !== undefined ? (Math.abs(a - base) >= Math.abs(b - base) ? a : b) : Math.max(a, b);

/** 그 순간의 세부를 한 줄로: 군용기 기종, 기사 제목, 수집기가 남긴 메모 */
export function detailOf(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  const types = meta.types as Record<string, number> | undefined;
  if (types && Object.keys(types).length) return Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}대`).join(", ");
  const ac = meta.aircraft as { what?: string }[] | undefined;
  if (ac?.length) return ac.slice(0, 4).map((a) => String(a.what ?? "").split("(")[0].trim()).filter(Boolean).join(", ");
  const titles = meta.titles as string[] | undefined;
  if (titles?.length) return String(titles[0]).slice(0, 80);
  const pts = meta.points as { site?: string; km?: number; frp?: number }[] | undefined;
  if (pts?.length) return pts.slice(0, 2).map((p) => `${p.site ?? ""} ${p.km ?? "?"}km ${p.frp ?? "?"}MW`).join(", ");
  if (typeof meta.note === "string") return meta.note.slice(0, 80);
  return undefined;
}

/** 5분 주기에서: 지금 이상인 신호는 구간을 열거나 잇고, 정상으로 돌아온 신호는 닫는다. 72시간이 지난 구간은 버린다 */
export function foldEpisodes(prev: EpisodeLog | undefined, board: BoardRow[], now: number): EpisodeLog {
  const list = (prev?.list ?? []).map((e) => ({ ...e })).filter((e) => now - (e.to ?? e.seen) < EPISODE_KEEP);
  for (const r of board) {
    const openIdx = list.findIndex((e) => e.id === r.id && e.to === undefined);
    if (abnormal(r)) {
      const rd = r.reading!, level = rd.state as Episode["level"], d = detailOf(rd.meta as Record<string, unknown> | undefined);
      let e = openIdx >= 0 ? list[openIdx] : undefined;
      if (!e) {
        // 방금 끝난 구간이 있으면 이어 붙인다
        const last = list.filter((x) => x.id === r.id && x.to !== undefined).sort((a, b) => b.to! - a.to!)[0];
        if (last && now - last.to! <= EPISODE_JOIN) { delete last.to; e = last; }
      }
      if (!e) { list.push({ id: r.id, from: now, seen: now, peak: rd.value, ...(rd.baseline !== undefined ? { baseline: rd.baseline } : {}), level, ...(d ? { detail: d } : {}) }); continue; }
      const p = worse(r.direction, e.peak, rd.value, e.baseline ?? rd.baseline);
      if (p !== e.peak || !e.detail) { if (p !== e.peak) e.peak = p; if (d && (p === rd.value || !e.detail)) e.detail = d; }
      if (level === "anomalous") e.level = "anomalous";
      e.seen = now;
    } else if (openIdx >= 0) {
      // 값을 못 받는 동안에는 닫지 않는다 — 정상으로 확인됐을 때만 닫는다
      if (r.reading && !r.failing && r.stateLabel !== "측정 불가") list[openIdx].to = now;
    }
  }
  return { v: 1, list };
}

/** 신호별로 최근 구간 (최신 먼저) */
export function episodesBy(log: EpisodeLog | undefined, now: number, within = EPISODE_KEEP): Record<string, Episode[]> {
  const out: Record<string, Episode[]> = {};
  for (const e of log?.list ?? []) if (now - (e.to ?? now) < within) (out[e.id] ??= []).push(e);
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.from - a.from);
  return out;
}
export const parseEpisodes = (raw: string | null | undefined): EpisodeLog | undefined => {
  try { const j = raw ? (JSON.parse(raw) as EpisodeLog) : undefined; return j && Array.isArray(j.list) ? j : undefined; } catch { return undefined; }
};
