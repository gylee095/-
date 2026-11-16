// 신호별 '왜 이런가' 한 줄 (2026-11-16 사용자: "군용기 4대가 평소와 다르다고 뜨는데, 클로드에게 물어 왜 이런지 알아낸 다음 그 신호 옆에 같이 적어 주고 분석에도 참고하게")
// AI 분석관이 하루 두 번, 평소와 다른 신호마다 원인을 확인해(기종·보도·사후 자료) 한 줄로 남긴다. 화면의 그 신호 바로 아래에 '클로드:'로 보인다.
// 판정(단계·%)은 바꾸지 않는다 — 설명일 뿐이다. 36시간이 지나면 낡은 설명으로 보고 지운다.
import type { SourceLink } from "./precursors.js";

export const SIGNAL_NOTES_KEY = "signal:notes";
export const NOTE_TTL = 36 * 3600_000;
export interface SignalNote { text: string; at: number; src?: SourceLink[] }
export type SignalNotes = Record<string, SignalNote>;

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.slice(0, 40); } };

/** 한 줄에 하나: '징후id: 설명 https://기사주소' — 모르는 id·빈 설명은 버린다. 설명 200자, 링크 3개까지 */
export function parseSignalNotes(text: string, validIds: string[], now: number): SignalNotes {
  const out: SignalNotes = {};
  for (const line of text.split(/\n+/)) {
    const m = /^\s*[-*]?\s*([a-z_]+\.[a-z0-9_]+)\s*[:=]\s*(.+)$/.exec(line);
    if (!m || !validIds.includes(m[1])) continue;
    const urls = [...new Set(m[2].match(URL_RE) ?? [])].slice(0, 3);
    const t = m[2].replace(URL_RE, "").replace(/\s+/g, " ").replace(/[\s,·|]+$/, "").trim();
    if (!t) continue;
    out[m[1]] = { text: t.slice(0, 200), at: now, ...(urls.length ? { src: urls.map((u) => ({ t: hostOf(u), u })) } : {}) };
  }
  return out;
}

/** 새 설명을 얹고(같은 신호는 바꿈) 낡은 것은 지운다 */
export function mergeSignalNotes(prev: SignalNotes | undefined, add: SignalNotes, now: number): SignalNotes {
  const out: SignalNotes = {};
  for (const [id, n] of Object.entries({ ...(prev ?? {}), ...add })) if (now - n.at < NOTE_TTL) out[id] = n;
  return out;
}
export const liveNotes = (raw: string | null | undefined, now: number): SignalNotes => {
  try { return raw ? mergeSignalNotes(JSON.parse(raw) as SignalNotes, {}, now) : {}; } catch { return {}; }
};
