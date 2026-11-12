// 스레드(Threads) 자동 홍보 게시 (2026-11-12 사용자: 북한 도발 뉴스가 떠서 사람들이 관심을 가질 때마다 자동으로 글을 올린다)
//   언제: 운영자 사건 알림이 실제로 나간 '북한의 발사·포격·경보' 사건 — 사건 하나에 한 번, 하루 THREADS_DAILY_MAX(기본 3)번, 2시간 간격
//   무엇: 사건 한 줄 + 그 순간의 '오늘의 판정'(화면과 같은 숫자 — official) + 주소. 글은 정해 둔 네 가지 틀(A~D)을 번갈아 쓴다.
//         사람이 보지 않고 바로 공개되므로 문장을 그때그때 지어내지 않는다 — 들어가는 사실은 수집한 사건 요약과 판정뿐이다.
//   금지: 손님인 척하는 후기('써 봤는데 대박')·없는 적중 사례·'안 울리면 안전하다' 같은 장담. 만든 사람이 자기 계정에 올리는 글이다.
//   시험 서버에는 토큰을 넣지 않는다(deploy.yml) — 크론도 없어 올라가지 않는다.
import { briefEvent } from "./brief.js";
import { sendPush, type PushEnv } from "./notify.js";
import { OFFICIAL_KEY, OFFICIAL_PREV_KEY, type Official } from "./official.js";
export { OFFICIAL_KEY, OFFICIAL_PREV_KEY };
import { STATUS_LABEL } from "./policy.js";
import { kstDay } from "./store.js";
import type { CrisisEvent } from "./types.js";
import { hash } from "./util.js";
import { fmtRiskPct } from "./warrisk.js";

export const THREADS_API = "https://graph.threads.com";
/** 스레드 글 길이 한도 (그림말은 바이트로 세므로 여유를 둔다) */
export const THREADS_MAX_CHARS = 500;
export const THREADS_DAILY_MAX = 3;
/** 연달아 쏘는 날 같은 이야기를 줄줄이 올리지 않게 */
export const THREADS_GAP_MS = 2 * 3600_000;
/** 오래가는 토큰(60일)을 이 간격으로 새로 받는다 */
export const TOKEN_REFRESH_MS = 7 * 86400_000;
export const THREADS_STATE_KEY = "threads:state";
export const THREADS_TOKEN_KEY = "threads:token";
export const STYLES = ["A", "B", "C", "D"] as const;
export type ThreadsStyle = (typeof STYLES)[number];

type Kv = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };

export interface ThreadsLog {
  at: number;
  eventId: string;
  style: ThreadsStyle;
  text: string;
  ok: boolean;
  /** 올라간 글의 번호 (스레드 앱에서 반응을 견줄 때) */
  postId?: string;
  error?: string;
}

export interface ThreadsState {
  /** 사건 → 올린 시각 (사건 하나에 한 번) */
  posted: Record<string, number>;
  log: ThreadsLog[];
  /** 지금까지 올린 수 — 틀을 번갈아 고르는 데 쓴다 */
  n: number;
  /** 실패를 운영자에게 알린 한국 날짜 (하루 한 번만) */
  failDay?: string;
}

export interface PostFacts {
  headline: string;
  /** '공식확인' · '교차확인' · '속보·공식발표 인용' */
  label: string;
  /** 지금 판정 한 줄 (없으면 판정 줄을 뺀다) */
  verdict?: string;
  /** 어제 판정과 견준 말 */
  change?: string;
  url: string;
}

/** 화면과 같은 숫자(오늘의 판정)로 한 줄을 만든다 */
export function verdictOf(off?: Official, prev?: Official): Pick<PostFacts, "verdict" | "change"> {
  if (!off) return {};
  const verdict = `${off.phase}단계(${off.phaseLabel}) · 앞으로 30일 국지 충돌 약 ${fmtRiskPct(off.clash30d.point)}`;
  if (!prev) return { verdict };
  const change = prev.phase === off.phase ? "어제와 같은 단계" : `어제 ${prev.phase}단계에서 ${off.phase > prev.phase ? "올라감" : "내려감"}`;
  return { verdict, change };
}

/** 네 가지 틀 — A 속보 · B 차분 · C 제작기 · D 질문. 어느 틀이 반응이 좋은지는 기록(log.style)과 스레드 앱의 반응으로 견준다 */
export function threadsText(style: ThreadsStyle, f: PostFacts): string {
  const what = `${f.headline} [${f.label}]`;
  const v = f.verdict;
  const vc = v ? `${v}${f.change ? ` (${f.change})` : ""}` : undefined;
  const lines: (string | undefined | false)[] =
    style === "A"
      ? [`🚨 ${what}`, "", vc && `지금 한반도 전쟁 위험 판정\n→ ${vc}`, vc && "", "공개 정보를 5분마다 살피고, 전쟁 위험 단계가 실제로 바뀔 때만 알림을 보냅니다.", f.url]
      : style === "B"
        ? [what, "", "속보가 뜰 때마다 '이번엔 진짜인가' 싶죠.", v && `지금 판정은 ${v}${f.change ? `, ${f.change}` : ""}입니다.`, "", "도발 하나하나가 아니라, 전쟁 위험 단계가 실제로 바뀔 때만 알려 드립니다.", f.url]
        : style === "C"
          ? ["혼자 만들고 있는 한반도 조기경보입니다.", "", `방금: ${what}`, vc && `이 순간 판정: ${vc}`, "", "뉴스·항공기·환율 같은 공개 정보를 5분마다 모아 계산합니다. 예언이 아니라, 평소와 무엇이 다른지 보여 주는 계기판입니다.", f.url]
          : [`"${f.headline}" — 그래서 지금 얼마나 위험한 걸까요?`, "", v, f.change, v && "", "숫자는 하루 한 번 정하고, 단계가 바뀌면 바로 알림이 갑니다.", f.url];
  const text = lines.filter((x): x is string => typeof x === "string").join("\n").replace(/\n{3,}/g, "\n\n");
  if (text.length <= THREADS_MAX_CHARS - 20) return text;
  // 너무 길면 사건 한 줄을 줄인다 (주소·판정은 남긴다)
  const over = text.length - (THREADS_MAX_CHARS - 20);
  return threadsText(style, { ...f, headline: f.headline.slice(0, Math.max(20, f.headline.length - over - 1)) + "…" });
}

/** 공개로 올려도 되는 사건인가 — 훈련·정정·논평 기사·확인 안 된 단일 보도는 올리지 않는다 */
export function postable(e: CrisisEvent): { ok: boolean; headline: string; label: string } {
  const brief = briefEvent(e, e.evidence ?? []);
  const quote = e.basis === "official_quote" && e.status === "UNVERIFIED";
  const label = quote ? "속보·공식발표 인용" : STATUS_LABEL[e.status];
  const ok = brief.isProvocation && !e.drill && !e.retracted && (e.status !== "UNVERIFIED" || (quote && e.breaking));
  return { ok, headline: brief.headline, label };
}

async function loadState(store: Kv): Promise<ThreadsState> {
  const raw = await store.getKv(THREADS_STATE_KEY);
  return raw ? (JSON.parse(raw) as ThreadsState) : { posted: {}, log: [], n: 0 };
}

/** 새로 받은 토큰이 있으면 그것을, 없으면 등록한 비밀값을 쓴다. 비밀값을 바꿔 넣으면 예전에 새로 받은 것은 버린다 */
async function currentToken(env: PushEnv, store: Kv): Promise<string | undefined> {
  if (!env.THREADS_ACCESS_TOKEN) return undefined;
  const raw = await store.getKv(THREADS_TOKEN_KEY);
  const saved = raw ? (JSON.parse(raw) as { token: string; src: string; at: number }) : undefined;
  return saved && saved.src === hash(env.THREADS_ACCESS_TOKEN) ? saved.token : env.THREADS_ACCESS_TOKEN;
}

/** 하루 한 번 부른다: 토큰이 60일 뒤 끊기지 않게 일주일마다 새로 받아 둔다 */
export async function refreshThreadsToken(env: PushEnv, store: Kv, now: number, fetchImpl: typeof fetch = fetch): Promise<"skipped" | "refreshed" | "failed"> {
  if (!env.THREADS_ACCESS_TOKEN || env.STAGING) return "skipped";
  const src = hash(env.THREADS_ACCESS_TOKEN);
  const raw = await store.getKv(THREADS_TOKEN_KEY);
  const saved = raw ? (JSON.parse(raw) as { token: string; src: string; at: number }) : undefined;
  const mine = saved && saved.src === src ? saved : undefined;
  if (mine && now - mine.at < TOKEN_REFRESH_MS) return "skipped";
  try {
    const res = await fetchImpl(`${THREADS_API}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(mine?.token ?? env.THREADS_ACCESS_TOKEN)}`);
    const j = (await res.json().catch(() => ({}))) as { access_token?: string };
    if (!res.ok || !j.access_token) return "failed"; // 받은 지 24시간이 안 된 토큰은 거절된다 — 내일 다시
    await store.setKv(THREADS_TOKEN_KEY, JSON.stringify({ token: j.access_token, src, at: now }));
    return "refreshed";
  } catch {
    return "failed";
  }
}

async function call(fetchImpl: typeof fetch, path: string, params: Record<string, string>): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetchImpl(`${THREADS_API}/v1.0/me/${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } };
    if (res.ok && j.id) return { id: j.id };
    return { error: `${path} ${res.status}${j.error?.code ? ` (${j.error.code})` : ""} ${j.error?.message ?? ""}`.trim().slice(0, 200) };
  } catch (e) {
    return { error: `${path} ${String((e as Error)?.message ?? e)}`.slice(0, 200) };
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 글 하나를 올린다: 담을 것을 만들고(1) 공개한다(2). 공개는 준비가 덜 됐다고 거절될 수 있어 잠깐 쉬고 두 번 더 해 본다 */
export async function publishThreads(token: string, text: string, fetchImpl: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = wait): Promise<{ id?: string; error?: string }> {
  const made = await call(fetchImpl, "threads", { media_type: "TEXT", text, access_token: token });
  if (!made.id) return made;
  let out: { id?: string; error?: string } = {};
  for (const pause of [0, 3000, 8000]) {
    if (pause) await sleep(pause);
    out = await call(fetchImpl, "threads_publish", { creation_id: made.id, access_token: token });
    if (out.id) return out;
  }
  return out;
}

export interface ThreadsResult {
  posted?: ThreadsLog;
  skipped?: string;
}

/**
 * 감시 한 바퀴가 끝난 뒤 부른다. 이번 바퀴에 운영자 알림이 나간 사건 가운데 공개로 올릴 만한 것 하나를 골라 올린다.
 * 올리지 못하면 운영자에게 하루 한 번 알린다 (토큰이 끊긴 채 조용히 멈춰 있지 않게).
 */
export async function maybePostThreads(
  env: PushEnv,
  store: Kv,
  report: { alerts: { eventId: string; kind: string; sent: boolean }[]; events: CrisisEvent[] },
  now: number,
  fetchImpl: typeof fetch = fetch,
  sleep?: (ms: number) => Promise<void>,
): Promise<ThreadsResult> {
  if (env.STAGING) return { skipped: "시험 서버" };
  const sentIds = new Set(report.alerts.filter((a) => a.sent && (a.kind === "new" || a.kind === "upgrade")).map((a) => a.eventId));
  if (!sentIds.size) return { skipped: "이번에 나간 사건 알림 없음" };
  const token = await currentToken(env, store);
  if (!token) return { skipped: "스레드 토큰 없음" };

  const st = await loadState(store);
  const picks = report.events
    .filter((e) => sentIds.has(e.id) && !st.posted[e.id])
    .map((e) => ({ e, p: postable(e) }))
    .filter((x) => x.p.ok)
    .sort((a, b) => b.e.severity - a.e.severity);
  if (!picks.length) return { skipped: "올릴 만한 사건 없음 (훈련·정정·미확인·이미 올림)" };

  const today = kstDay(now);
  const okLog = st.log.filter((l) => l.ok);
  const max = Number(env.THREADS_DAILY_MAX ?? THREADS_DAILY_MAX);
  if (okLog.filter((l) => kstDay(l.at) === today).length >= max) return { skipped: `하루 ${max}번 한도` };
  const last = okLog.length ? okLog[okLog.length - 1].at : 0;
  if (now - last < THREADS_GAP_MS) return { skipped: "직전 글에서 2시간이 안 지남" };

  const { e, p } = picks[0];
  const [offRaw, prevRaw] = await Promise.all([store.getKv(OFFICIAL_KEY), store.getKv(OFFICIAL_PREV_KEY)]);
  const style = STYLES[st.n % STYLES.length];
  const text = threadsText(style, {
    headline: p.headline,
    label: p.label,
    ...verdictOf(offRaw ? (JSON.parse(offRaw) as Official) : undefined, prevRaw ? (JSON.parse(prevRaw) as Official) : undefined),
    url: env.PUBLIC_URL ?? "https://koreasiren.com",
  });
  const res = await publishThreads(token, text, fetchImpl, sleep);
  const entry: ThreadsLog = { at: now, eventId: e.id, style, text, ok: !!res.id, ...(res.id ? { postId: res.id } : { error: res.error }) };

  st.log = [...st.log, entry].slice(-40);
  if (entry.ok) {
    st.posted[e.id] = now;
    st.n++;
    for (const [id, at] of Object.entries(st.posted)) if (now - at > 7 * 86400_000) delete st.posted[id];
  } else if (st.failDay !== today) {
    st.failDay = today;
    await sendPush(
      env,
      {
        title: "[시스템] 스레드 자동 게시 실패",
        body: `글을 올리지 못했습니다: ${entry.error ?? "이유 모름"}\n토큰이 끊겼으면(190) 새로 받아 THREADS_ACCESS_TOKEN 을 다시 등록하세요. 오늘은 다시 알리지 않습니다.`,
        priority: 3,
        url: env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/ops` : undefined,
      },
      fetchImpl,
    ).catch(() => []);
  }
  await store.setKv(THREADS_STATE_KEY, JSON.stringify(st));
  return { posted: entry };
}

/** 운영자가 보는 상태 — 토큰은 내보내지 않는다 */
export async function threadsStatus(env: PushEnv, store: Kv): Promise<{ configured: boolean; dailyMax: number; log: ThreadsLog[] }> {
  const st = await loadState(store);
  return { configured: !!env.THREADS_ACCESS_TOKEN && !env.STAGING, dailyMax: Number(env.THREADS_DAILY_MAX ?? THREADS_DAILY_MAX), log: st.log.slice().reverse() };
}
