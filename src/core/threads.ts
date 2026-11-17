// 스레드(Threads) 자동 홍보 게시 — 글은 담백하게, 오글거리지 않게 (2026-11-16 사용자 결정)
//   ① 앱 소개: 앱의 % 가 오늘 아침 판정보다 5%p 넘게 오르고 징조·움직임이 새로 켜져 30분 이어질 때(잡음 항목 제외) — 예시 화면 2장 + 소개 글 + 주소
//   ③ 개발 소식: 사용자가 "오늘 수정한 것들 올리자"고 할 때 에이전트가 요약해 /api/threads/post 로
//   ② 큰 뉴스: 운영자 사건 알림이 나간 북한 발사·포격 사건 — 무슨 일인지 한 줄 + 짧은 소개 + 주소
//   넣지 않는 것: 우리 판정(단계·%·어제 대비) — 그건 결제한 손님이 받는 정보다(11/16 사용자: 스레드에 다 적으면 살 이유가 없다).
//                손님인 척하는 후기·없는 적중 사례·'안 울리면 안전' 같은 장담·공포를 부추기는 말.
//   같은 글이 되풀이되지 않게 정해 둔 문장 여러 개를 번갈아 쓴다(문장을 그때그때 지어내지 않는다 — 사람이 보지 않고 공개된다).
//   하루 THREADS_DAILY_MAX(기본 3)번, 글 사이 2시간. 시험 서버에는 토큰을 넣지 않는다(deploy.yml) — 크론도 없어 올라가지 않는다.
import { briefEvent } from "./brief.js";
import { sendPush, type PushEnv } from "./notify.js";
import { kstDay } from "./store.js";
import { OFFICIAL_KEY } from "./official.js";
import type { CrisisEvent } from "./types.js";
import { hash } from "./util.js";

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
/** 소개 글에 붙이는 예시 화면 (src/worker/promo.ts 가 내준다) */
export const PROMO_IMAGES = ["/promo/1.jpg", "/promo/2.jpg"];
/** 웹사이트 첫 화면의 신호 수와 같아야 한다 ('43가지 신호로 보는 한반도 전쟁 위험') */
export const SIGNAL_COUNT = 43;

export type PostKind = "intro" | "news" | "dev";

/** ① 앱 소개 글 — 예시 화면 2장과 함께 */
export const INTRO_TEXTS: ((url: string) => string)[] = [
  (u) => `직접 만든 앱 소개할게요.\n\n전쟁 얘기 나올 때마다 계속 찾아보게 돼서,\n공개된 신호 ${SIGNAL_COUNT}개를 매일 지켜보다가 위험 단계가 바뀌면 알림을 주는 앱을 만들었어요.\n평소엔 조용하고, 뭔가 달라질 때만 와요.\n\n${u}`,
  (u) => `한반도 전쟁 위험 알림 앱을 만들었어요.\n\n뉴스, 항공기, 환율, 검색량 같은 공개 신호 ${SIGNAL_COUNT}개를 매일 보고,\n위험 단계가 바뀌거나 징조가 보이면 휴대폰으로 알려 줘요.\n\n${u}`,
  (u) => `전쟁 뉴스를 일일이 찾아보지 않으려고 만든 앱이에요.\n\n공개 신호 ${SIGNAL_COUNT}개를 매일 확인하고, 단계가 바뀔 때만 알림이 와요.\n사진은 단계가 올라갔을 때 오는 알림의 예시 화면이에요.\n\n${u}`,
  (u) => `혼자 만든 앱이라 완벽하진 않아요.\n그래도 공개 신호 ${SIGNAL_COUNT}개를 매일 보고, 전쟁 위험 단계가 바뀌면 바로 알려 줘요.\n평소엔 알림이 거의 없어요.\n\n${u}`,
];

/** ② 큰 뉴스 글 — 무슨 일인지 한 줄(누구나 아는 뉴스) + 짧은 소개. 우리 판정은 넣지 않는다 */
export const NEWS_TEXTS: ((what: string, u: string) => string)[] = [
  (w, u) => `${w}\n\n이번 일로 한반도 전쟁 위험 단계가 바뀌는지는 앱에서 알림으로 알려 드려요.\n${u}`,
  (w, u) => `${w}\n\n공개 신호 ${SIGNAL_COUNT}개를 매일 보고, 전쟁 위험 단계가 바뀌면 알림을 보내는 앱을 만들어 운영하고 있어요.\n${u}`,
  (w, u) => `${w}\n\n전쟁 뉴스를 계속 찾아보지 않아도, 단계가 바뀌면 알림이 와요.\n${u}`,
];

type Kv = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };

export interface ThreadsLog {
  at: number;
  eventId: string;
  kind?: PostKind;
  /** 쓴 문장 번호 (I1~I4 · N1~N3) — 어느 글이 반응이 좋은지 스레드 앱에서 견줄 때 */
  style: string;
  text: string;
  /** 붙인 사진 수 (사진 올리기에 실패하면 글만 올리고 0) */
  images?: number;
  ok: boolean;
  postId?: string;
  error?: string;
}

export interface ThreadsState {
  /** 사건·날짜 → 올린 시각 (같은 것은 한 번) */
  posted: Record<string, number>;
  log: ThreadsLog[];
  /** 지금까지 올린 수 (예전 기록) */
  n: number;
  /** 종류별로 올린 수 — 문장을 번갈아 고르는 데 쓴다 */
  nk?: Partial<Record<PostKind, number>>;
  failDay?: string;
  /** ① 앱의 % 가 의미 있게 오르기 시작한 시각 (30분 이어지는지 본다) */
  riseSince?: number;
}

/** 사건 한 줄: 확인 전 속보는 그렇다고 적는다 */
export function newsLine(headline: string, unconfirmed: boolean): string {
  const h = headline.replace(/(\d)\s+발/g, "$1발"); // 화면용 요약은 '2 발' — 글에서는 '2발'
  return unconfirmed ? `${h} (속보, 아직 확인 중)` : h;
}

/** 글 만들기: 종류별로 n 번째 문장 (번갈아). 500자를 넘으면 사건 줄을 줄인다 */
export function threadsText(kind: PostKind, n: number, url: string, what = ""): { style: string; text: string } {
  if (kind === "intro") {
    const i = n % INTRO_TEXTS.length;
    return { style: `I${i + 1}`, text: INTRO_TEXTS[i](url) };
  }
  const i = n % NEWS_TEXTS.length;
  let text = NEWS_TEXTS[i](what, url);
  if (text.length > THREADS_MAX_CHARS - 20) text = NEWS_TEXTS[i](what.slice(0, Math.max(20, what.length - (text.length - THREADS_MAX_CHARS + 21))) + "…", url);
  return { style: `N${i + 1}`, text };
}

/** 공개로 올려도 되는 사건인가 — 훈련·정정·논평 기사·확인 안 된 단일 보도는 올리지 않는다 */
export function postable(e: CrisisEvent): { ok: boolean; headline: string; unconfirmed: boolean } {
  const brief = briefEvent(e, e.evidence ?? []);
  const quote = e.basis === "official_quote" && e.status === "UNVERIFIED";
  const ok = brief.isProvocation && !e.drill && !e.retracted && (e.status !== "UNVERIFIED" || (quote && e.breaking));
  return { ok, headline: brief.headline, unconfirmed: e.status === "UNVERIFIED" };
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

/** 모든 글에 다는 주제 태그 (11/16 사용자: 스레드에 올릴 때 태그도 같이) — '전쟁' 주제 페이지에 글이 모인다. 스레드는 글 하나에 태그 하나 */
export const THREADS_TOPIC = "전쟁";

/** 태그를 달아 담아 보고, 스레드가 태그 때문에 거절하면(예: 사진 묶음에는 안 받음) 태그 없이 한 번 더 — 태그 때문에 글이 안 올라가면 안 된다 */
async function withTopic(make: (t: Record<string, string>) => Promise<{ id?: string; error?: string }>): Promise<{ id?: string; error?: string }> {
  const first = await make({ topic_tag: THREADS_TOPIC });
  return first.id ? first : make({});
}

/** 담아 둔 것을 공개한다. 준비(사진 내려받기 등)가 덜 됐다고 거절될 수 있어 쉬어 가며 몇 번 더 해 본다 */
async function publishContainer(token: string, id: string, fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void>, pauses: number[]): Promise<{ id?: string; error?: string }> {
  let out: { id?: string; error?: string } = {};
  for (const pause of pauses) {
    if (pause) await sleep(pause);
    out = await call(fetchImpl, "threads_publish", { creation_id: id, access_token: token });
    if (out.id) return out;
  }
  return out;
}

/** 글만 올린다 */
export async function publishThreads(token: string, text: string, fetchImpl: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = wait): Promise<{ id?: string; error?: string }> {
  const made = await withTopic((t) => call(fetchImpl, "threads", { media_type: "TEXT", text, ...t, access_token: token }));
  if (!made.id) return made;
  return publishContainer(token, made.id, fetchImpl, sleep, [0, 3000, 8000]);
}

/** 사진 여러 장(넘겨 보기) + 글. 사진 한 장씩 담고 → 묶고 → 공개. 사진 쪽이 실패하면 글만 올린다 */
export async function publishThreadsWithImages(token: string, text: string, imageUrls: string[], fetchImpl: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = wait): Promise<{ id?: string; error?: string; images: number }> {
  if (imageUrls.length >= 2) {
    const items: string[] = [];
    for (const image_url of imageUrls) {
      const it = await call(fetchImpl, "threads", { media_type: "IMAGE", is_carousel_item: "true", image_url, access_token: token });
      if (!it.id) break;
      items.push(it.id);
    }
    if (items.length === imageUrls.length) {
      await sleep(5000); // 스레드가 사진을 내려받을 시간
      const box = await withTopic((t) => call(fetchImpl, "threads", { media_type: "CAROUSEL", children: items.join(","), text, ...t, access_token: token }));
      if (box.id) {
        const out = await publishContainer(token, box.id, fetchImpl, sleep, [0, 5000, 15000, 30000]);
        if (out.id) return { ...out, images: imageUrls.length };
      }
    }
  }
  return { ...(await publishThreads(token, text, fetchImpl, sleep)), images: 0 };
}

export interface ThreadsResult {
  posted?: ThreadsLog;
  skipped?: string;
}

/** 한도(하루 최대 수·간격)를 보고 글 하나를 올린다. 소개 글과 뉴스 글이 같은 한도를 나눠 쓴다 */
async function postOne(env: PushEnv, store: Kv, token: string, key: string, kind: PostKind, what: string, now: number, fetchImpl: typeof fetch, sleep?: (ms: number) => Promise<void>): Promise<ThreadsResult> {
  const st = await loadState(store);
  if (st.posted[key]) return { skipped: "이미 올림" };
  const today = kstDay(now);
  const okLog = st.log.filter((l) => l.ok);
  const max = Number(env.THREADS_DAILY_MAX ?? THREADS_DAILY_MAX);
  if (okLog.filter((l) => kstDay(l.at) === today).length >= max) return { skipped: `하루 ${max}번 한도` };
  const last = okLog.length ? okLog[okLog.length - 1].at : 0;
  if (now - last < THREADS_GAP_MS) return { skipped: "직전 글에서 2시간이 안 지남" };

  const site = env.PUBLIC_URL ?? "https://koreasiren.com";
  const url = site.replace(/^https?:\/\//, "");
  const nk = st.nk ?? {};
  const { style, text } = threadsText(kind, nk[kind] ?? 0, url, what);
  const res = kind === "intro"
    ? await publishThreadsWithImages(token, text, PROMO_IMAGES.map((p) => site + p), fetchImpl, sleep)
    : { ...(await publishThreads(token, text, fetchImpl, sleep)), images: 0 };
  const entry: ThreadsLog = { at: now, eventId: key, kind, style, text, images: res.images, ok: !!res.id, ...(res.id ? { postId: res.id } : { error: res.error }) };

  st.log = [...st.log, entry].slice(-40);
  if (entry.ok) {
    st.posted[key] = now;
    st.n++;
    st.nk = { ...nk, [kind]: (nk[kind] ?? 0) + 1 };
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

/**
 * ② 큰 뉴스: 감시 한 바퀴가 끝난 뒤 부른다. 이번 바퀴에 운영자 알림이 나간 사건 가운데 공개로 올릴 만한 것 하나를 골라 올린다.
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
  const { e, p } = picks[0];
  return postOne(env, store, token, e.id, "news", newsLine(p.headline, p.unconfirmed), now, fetchImpl, sleep);
}

/** ① 앱 소개를 올리는 때 (11/16 사용자): 앱의 % 가 오늘 아침 판정보다 이만큼(%p) 넘게 오르고 */
export const RISE_MIN_PTS = 5;
/** 그 상태가 이만큼 이어지고 (한 번 튄 값으로 올리지 않게) */
export const RISE_HOLD_MS = 30 * 60_000;
/** 전쟁 전 징조·조용한 움직임 가운데 '잡음'으로 보는 항목 — 이것만 새로 켜져서는 올리지 않는다.
 *  a_nk_dark: 북한 인터넷 외부망 장애 경보는 자주 울리고 대개 위기와 상관없다 (사용자 11/16 예시) */
export const NOISY_ITEMS = ["a_nk_dark"];

type Rubricish = { index?: number; rubric?: { index: number; layers?: { id: string; groups: { items: { id: string; ko?: string; got: number }[] }[] }[] } };

/** 전쟁 전 징조·조용한 움직임 가운데 켜진 항목 (잡음 항목 제외) */
export function realItems(p?: Rubricish): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of p?.rubric?.layers ?? []) {
    if (l.id !== "signs" && l.id !== "moves") continue;
    for (const g of l.groups) for (const it of g.items) if (it.got > 0 && !NOISY_ITEMS.includes(it.id)) out.set(it.id, it.ko ?? it.id);
  }
  return out;
}

/** 지금(5분 계산)과 오늘 아침 판정을 견줘 '의미 있게 올랐나'. 배경(세계 정세·검색량·시장)만 늘어난 것은 아니다 — 징조나 움직임이 하나는 새로 켜져야 한다 */
export function riseOf(live?: Rubricish, morning?: Rubricish): { up: boolean; pts: number; added: string[] } {
  const li = live?.rubric?.index ?? live?.index, mi = morning?.rubric?.index ?? morning?.index;
  if (li === undefined || mi === undefined) return { up: false, pts: 0, added: [] };
  const before = realItems(morning);
  const added = [...realItems(live)].filter(([id]) => !before.has(id)).map(([, ko]) => ko);
  const pts = li - mi;
  return { up: pts >= RISE_MIN_PTS && added.length > 0, pts, added };
}

/**
 * ① 앱 소개: 5분마다 부른다. 앱의 % 가 오늘 아침 판정보다 5%p 넘게 오르고, 징조·움직임이 새로 켜졌고(잡음 제외),
 * 그 상태가 30분 이어지면 그날 한 번 소개 글을 올린다. 글에는 % 나 단계를 쓰지 않는다 — 올리는 때를 고르는 데만 쓴다.
 */
export async function maybePostThreadsRise(
  env: PushEnv,
  store: Kv,
  live: { proximity?: Rubricish } | undefined,
  now: number,
  fetchImpl: typeof fetch = fetch,
  sleep?: (ms: number) => Promise<void>,
): Promise<ThreadsResult> {
  if (env.STAGING) return { skipped: "시험 서버" };
  if (!env.THREADS_ACCESS_TOKEN) return { skipped: "스레드 토큰 없음" };
  const offRaw = await store.getKv(OFFICIAL_KEY);
  const morning = offRaw ? (JSON.parse(offRaw) as { proximity?: Rubricish }).proximity : undefined;
  const r = riseOf(live?.proximity, morning);
  const st = await loadState(store);
  const key = `rise:${kstDay(now)}`;
  if (!r.up) {
    if (st.riseSince) { st.riseSince = undefined; await store.setKv(THREADS_STATE_KEY, JSON.stringify(st)); }
    return { skipped: r.pts > 0 ? `+${r.pts}%p · 새 징조·움직임 ${r.added.length}개 — 문턱 아래` : "오르지 않음" };
  }
  if (st.posted[key]) return { skipped: "오늘 이미 올림" };
  if (!st.riseSince) { st.riseSince = now; await store.setKv(THREADS_STATE_KEY, JSON.stringify(st)); return { skipped: "오름 — 30분 이어지는지 확인 중" }; }
  if (now - st.riseSince < RISE_HOLD_MS) return { skipped: "오름 — 30분 이어지는지 확인 중" };
  const token = await currentToken(env, store);
  if (!token) return { skipped: "스레드 토큰 없음" };
  return postOne(env, store, token, key, "intro", "", now, fetchImpl, sleep);
}

/**
 * ③ 개발 소식 (11/16 사용자): "오늘 수정한 것들 스레드에 올리자" 라고 하면 에이전트가 오늘 본 서버(main)에 올라간 변경을
 * 담백하게 요약해 이걸로 올린다. 사람이 직접 시킨 글이라 하루 한도·간격을 보지 않는다. 판정·비밀값·내부 용어는 넣지 않는다.
 */
export async function postThreadsManual(env: PushEnv, store: Kv, text: string, now: number, fetchImpl: typeof fetch = fetch, sleep?: (ms: number) => Promise<void>, opts: { intro?: boolean } = {}): Promise<ThreadsResult> {
  if (env.STAGING) return { skipped: "시험 서버" };
  const st = await loadState(store);
  const site = env.PUBLIC_URL ?? "https://koreasiren.com";
  // intro: 사용자가 '앱 소개를 지금 올려'라고 할 때 — 정해 둔 소개 문장(차례대로) + 예시 화면 2장
  const made = opts.intro ? threadsText("intro", st.nk?.intro ?? 0, site.replace(/^https?:\/\//, "")) : { style: "D", text: text.trim() };
  const t = made.text;
  if (!t) return { skipped: "글이 비어 있음" };
  if (t.length > THREADS_MAX_CHARS) return { skipped: `${t.length}자 — ${THREADS_MAX_CHARS}자 넘음` };
  const token = await currentToken(env, store);
  if (!token) return { skipped: "스레드 토큰 없음" };
  const res = opts.intro
    ? await publishThreadsWithImages(token, t, PROMO_IMAGES.map((p) => site + p), fetchImpl, sleep)
    : { ...(await publishThreads(token, t, fetchImpl, sleep)), images: 0 };
  const kind: PostKind = opts.intro ? "intro" : "dev";
  const entry: ThreadsLog = { at: now, eventId: `${opts.intro ? "intro-manual" : "dev"}:${now}`, kind, style: made.style, text: t, images: res.images, ok: !!res.id, ...(res.id ? { postId: res.id } : { error: res.error }) };
  const st2 = await loadState(store);
  st2.log = [...st2.log, entry].slice(-40);
  if (entry.ok && opts.intro) st2.nk = { ...(st2.nk ?? {}), intro: (st2.nk?.intro ?? 0) + 1 };
  await store.setKv(THREADS_STATE_KEY, JSON.stringify(st2));
  return { posted: entry };
}

/** 운영자가 보는 상태 — 토큰은 내보내지 않는다 */
export async function threadsStatus(env: PushEnv, store: Kv): Promise<{ configured: boolean; dailyMax: number; log: ThreadsLog[] }> {
  const st = await loadState(store);
  return { configured: !!env.THREADS_ACCESS_TOKEN && !env.STAGING, dailyMax: Number(env.THREADS_DAILY_MAX ?? THREADS_DAILY_MAX), log: st.log.slice().reverse() };
}
