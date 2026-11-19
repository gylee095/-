// 분석관 노트 (2026-11-19 사용자: "분석이 쌓여야 분석관의 판단이 좋아진다" — 단, 쌓아서 다 읽히면 토큰이 계속 늘어난다)
// 정기 분석관은 매번 새 대화로 시작해 지난 판단을 모른다. 그래서 분석관이 스스로 고쳐 쓰는 짧은 노트 하나를 둔다:
// ① 신호의 평소 모습(이 경보는 한 달에 몇 번, 대개 무엇 때문) ② 틀렸던 판단과 교훈 ③ 지금 이어지는 큰 흐름.
// 크기는 고정한다 — 30줄·한 줄 160자까지. 넘치면 저장하지 않고 '덜 중요한 줄을 지워라'고 돌려보낸다. 그래서 몇 달이 지나도 읽는 양이 같다.
export const NOTEBOOK_KEY = "analyst:notebook";
export const NOTEBOOK_MAX_LINES = 30;
export const NOTEBOOK_MAX_CHARS = 160;
export const NOTEBOOK_SECTIONS = ["평소", "교훈", "흐름"] as const;

export interface Notebook { text: string; at: number; lines: number }

/** 노트 글을 검사한다. 머리줄('[평소]'·'[교훈]'·'[흐름]')은 줄 수에 넣지 않는다. 문제가 있으면 무엇을 고칠지 한국어로 돌려준다 */
export function checkNotebook(raw: string): { ok: true; text: string; lines: number } | { ok: false; error: string } {
  const rows = raw.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const body = rows.filter((l) => !/^\s*\[(평소|교훈|흐름)\]\s*$/.test(l));
  if (!body.length) return { ok: false, error: "빈 노트는 저장하지 않는다" };
  if (body.length > NOTEBOOK_MAX_LINES) return { ok: false, error: `${body.length}줄 — ${NOTEBOOK_MAX_LINES}줄까지다. 덜 중요하거나 오래돼 지금과 상관없는 줄을 지우고 다시 저장하라` };
  const long = body.filter((l) => l.trim().length > NOTEBOOK_MAX_CHARS);
  if (long.length) return { ok: false, error: `한 줄 ${NOTEBOOK_MAX_CHARS}자까지다 — 줄여야 할 줄: ${long.map((l) => l.trim().slice(0, 30) + "…").join(" / ")}` };
  if (/sk-ant-|Bearer\s+\S{12,}|KEW_SECRET/i.test(raw)) return { ok: false, error: "비밀값처럼 보이는 글이 있다 — 노트에 쓰지 않는다" };
  return { ok: true, text: rows.join("\n"), lines: body.length };
}

export const loadNotebook = (raw: string | null | undefined): Notebook | undefined => {
  try { return raw ? (JSON.parse(raw) as Notebook) : undefined; } catch { return undefined; }
};
