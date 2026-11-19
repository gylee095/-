// AI 분석관의 사건 판단 (2026-11-17 사용자: "종류를 매번 만들 수 없다 — 알아서 파악해라")
// 넓은 그물(classify.ts securityNews)로 받은 군사·안보 소식은 규칙이 중요도를 정하지 않는다. 분석관이 읽고 0~3으로 판단해 한 줄 이유와 함께 남기면,
// 화면의 그 사건이 그 수준과 이유로 보인다. 분석관은 3(경계)까지만 줄 수 있다 — 심각·위급은 정부 경보·교차확인된 사건만.
// 판정(단계·%)과 손님 알림은 바꾸지 않는다.
import type { EventBrief } from "./brief.js";
import type { CrisisEvent } from "./types.js";

export const NEWS_JUDGED_KEY = "news:judged";
export const JUDGE_KEEP = 14 * 86400_000;
export interface NewsJudgment { level: 0 | 1 | 2 | 3; why: string; at: number }
export type NewsJudgments = Record<string, NewsJudgment>;

const LABEL = ["", "관심", "주의", "경계"] as const;

/** 한 줄에 하나: '사건id=수준:이유' (수준 0 중요하지 않음 · 1 참고 · 2 주의 · 3 경계). 모르는 id 는 버린다 */
export function parseJudgments(text: string, validIds: string[], now: number): NewsJudgments {
  const out: NewsJudgments = {};
  for (const line of text.split(/\n+/)) {
    const m = /^\s*[-*]?\s*([A-Za-z0-9_:.-]+)\s*=\s*([0-3])\s*[:：]\s*(.+)$/.exec(line);
    if (!m || !validIds.includes(m[1])) continue;
    const why = m[3].replace(/\s+/g, " ").trim();
    if (why) out[m[1]] = { level: Number(m[2]) as 0 | 1 | 2 | 3, why: why.slice(0, 160), at: now };
  }
  return out;
}
export function mergeJudgments(prev: NewsJudgments | undefined, add: NewsJudgments, now: number): NewsJudgments {
  const out: NewsJudgments = {};
  for (const [id, j] of Object.entries({ ...(prev ?? {}), ...add })) if (now - j.at < JUDGE_KEEP) out[id] = j;
  return out;
}
export const loadJudgments = (raw: string | null | undefined, now: number): NewsJudgments => {
  try { return raw ? mergeJudgments(JSON.parse(raw) as NewsJudgments, {}, now) : {}; } catch { return {}; }
};

/** 분석관이 판단한 사건이면 요약의 위험도·이유를 그 판단으로 바꾼다. 넓은 그물로 받은 소식(security_news)에만 적용한다 — 미사일·경보 같은 규칙 사건은 건드리지 않는다 */
export function applyJudgment<T extends EventBrief>(brief: T, categories: string[], j: NewsJudgment | undefined): T & { judged?: boolean; pending?: boolean } {
  if (!(categories.length === 1 && categories[0] === "security_news")) return brief;
  if (!j) return { ...brief, pending: true };
  const level = (j.level === 0 ? 1 : j.level) as 1 | 2 | 3;
  return { ...brief, judged: true, danger: { level, label: LABEL[level], reason: `클로드 판단: ${j.level === 0 ? "중요하지 않음 — " : ""}${j.why}` } };
}

// ── 분석관이 직접 올리는 사건 ──
// 그물에도 안 걸린 뉴스(다른 낱말로 쓰인 제목·외신·검색으로 찾은 것)는 분석관이 제목·주소·수준·이유를 적어 직접 올린다. 화면에는 다른 사건과 똑같이 보인다.
export const NEWS_ADDED_KEY = "news:added";
export const ADDED_KEEP = 7 * 86400_000;
export interface AddedNews { id: string; title: string; url?: string; level: 1 | 2 | 3; why: string; at: number }

/** 한 줄에 하나: '수준 | 제목 | 이유 | https://주소' (수준 1 참고 · 2 주의 · 3 경계). 제목과 이유가 있어야 한다 */
export function parseAdded(text: string, now: number): AddedNews[] {
  const out: AddedNews[] = [];
  for (const line of text.split(/\n+/)) {
    const parts = line.split("|").map((x) => x.trim());
    if (parts.length < 3 || !/^[1-3]$/.test(parts[0]) || parts[1].length < 6 || parts[2].length < 4) continue;
    const url = parts.slice(3).join("|").match(/https?:\/\/[^\s<>"']+/)?.[0];
    const title = parts[1].slice(0, 120);
    let h = 0;
    for (const ch of title.replace(/\s+/g, "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    out.push({ id: `evt_cl_${h.toString(36)}`, title, ...(url ? { url } : {}), level: Number(parts[0]) as 1 | 2 | 3, why: parts[2].slice(0, 160), at: now });
  }
  return out;
}
/** 같은 제목은 새 것으로 바꾸고, 일주일 지난 것은 버린다 (40건까지) */
export function mergeAdded(prev: AddedNews[] | undefined, add: AddedNews[], now: number): AddedNews[] {
  const m = new Map<string, AddedNews>();
  for (const a of [...(prev ?? []), ...add]) if (now - a.at < ADDED_KEEP) m.set(a.id, m.has(a.id) ? { ...a, at: m.get(a.id)!.at } : a);
  return [...m.values()].sort((a, b) => a.at - b.at).slice(-40);
}
export const loadAdded = (raw: string | null | undefined, now: number): AddedNews[] => {
  try { return raw ? mergeAdded(JSON.parse(raw) as AddedNews[], [], now) : []; } catch { return []; }
};
/** 화면·분석이 다른 사건과 같은 길로 다루도록 사건 모양으로 바꾼다 */
export function addedAsEvents(list: AddedNews[]): { events: CrisisEvent[]; judged: NewsJudgments } {
  const judged: NewsJudgments = {};
  const events = list.map((a): CrisisEvent => {
    judged[a.id] = { level: a.level, why: a.why, at: a.at };
    return {
      id: a.id, group: "security", categories: ["security_news"], status: "UNVERIFIED", severity: 25, title: a.title, signalIds: [`${a.id}:s`], sources: ["analyst"],
      firstDetectedTime: a.at, drill: false, retracted: false, basis: "media", breaking: false,
      evidence: [{ id: `${a.id}:s`, source: "analyst", sourceKind: "media", category: "security_news", title: a.title, summary: "클로드 분석관이 찾아 올림", ...(a.url ? { url: a.url } : {}), detectedTime: a.at, severity: 25 }],
    };
  });
  return { events, judged };
}
