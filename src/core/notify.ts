// 아이폰 푸시. 설정된 채널 모두에 보내고 하나라도 성공하면 성공으로 본다.
//  - ntfy      : 무료 iOS 앱. 단, ntfy.sh 는 발신 IP 단위로 요청을 제한해 Cloudflare 공유 IP 에서 429 가 잦다 → 계정 토큰(NTFY_TOKEN) 사용 권장
//  - Telegram  : 봇 토큰 + 채팅 ID. 무료·안정적(IP 제한 없음). 권장 보조 채널
//  - Discord   : 웹훅 URL. 무료
//  - Bark      : 무료 iOS 앱(계정 불필요). 앱이 주는 키 하나로 전송, 긴급 알림(무음 돌파) 지원. ntfy 대체로 권장
//  - Pushover  : 유료(1회 구매). iOS 긴급 알림(무음 돌파) 가능
import type { Store } from "./store.js";
import { broadcastWebPush } from "./webpush.js";
import { makeOpsSnapshot, pointToSnapshot } from "./opsnap.js";
import type { Env } from "./types.js";

/** 누구에게 가나. owner = 운영자(Bark·운영자 웹 푸시)만, all = 공개 구독자까지. 기본 owner — 테스트·시스템 경고가 사람들에게 가는 사고를 구조로 막는다 (2026-11-04) */
export type Audience = "owner" | "all";

export interface PushMessage {
  audience?: Audience;
  /** 알림 묶음 — 테스트는 'kew-test' 로 따로 묶여 실제 알림을 덮어쓰지 않는다 */
  tag?: string;
  title: string;
  body: string;
  /** 1(최저)~5(긴급) */
  priority: number;
  url?: string;
}

export interface PushResult {
  channel: string;
  ok: boolean;
  error?: string;
  /** 보낼 대상이 없어 건너뜀 — 성공으로도 실패로도 세지 않는다 (결과 목록에서 뺀다) */
  skipped?: boolean;
}

export interface PushEnv extends Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DISCORD_WEBHOOK_URL?: string;
  BARK_KEY?: string;
  BARK_SERVER?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 429(요청 제한)·5xx 면 간격을 늘려 가며 최대 4회 시도한다.
 * Cloudflare 의 발신 IP 는 요청마다 바뀔 수 있어, ntfy.sh 처럼 IP 단위로 제한하는 서버에는 재시도 자체가 효과가 있다.
 */
export async function postWithRetry(fetchImpl: typeof fetch, url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let res = await fetchImpl(url, init);
  for (let i = 1; i < attempts && (res.status === 429 || res.status >= 500); i++) {
    await sleep(600 * i + Math.random() * 400);
    res = await fetchImpl(url, init);
  }
  return res;
}

/**
 * 익명 ntfy.sh 는 Cloudflare 공유 IP 에서 계속 429 로 막힌다(2026-10-30·31 실측 — 10번 중 10번).
 * 다른 채널(Bark·Telegram·Discord·Pushover)이 있으면 익명 ntfy 는 건너뛴다. 계정 토큰(NTFY_TOKEN)이 있으면 그대로 쓴다.
 */
export function useNtfy(env: PushEnv): boolean {
  if (!env.NTFY_TOPIC) return false;
  if (env.NTFY_TOKEN) return true;
  const others = !!(env.BARK_KEY || (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) || env.DISCORD_WEBHOOK_URL || (env.PUSHOVER_TOKEN && env.PUSHOVER_USER));
  return !others;
}

export async function sendPush(env: PushEnv, msg: PushMessage, fetchImpl: typeof fetch = fetch, store?: Pick<Store, "getKv" | "setKv">): Promise<PushResult[]> {
  const tasks: Promise<PushResult>[] = [];
  // 운영자 알림은 실시간 대시보드가 아니라 '보낸 그 순간의 화면'으로 연결한다 (11/6) — 고객 단계 알림(all)은 리포트로 이미 그렇다
  if ((msg.audience ?? "owner") === "owner" && store && env.DASHBOARD_URL && msg.url && /\/ops(?:$|[#?])/.test(msg.url)) {
    try {
      const snap = await makeOpsSnapshot(store, env, msg.title, Date.now());
      if (snap) msg = pointToSnapshot(msg, env.DASHBOARD_URL, snap);
    } catch {
      /* 화면을 얼리지 못해도 알림은 보낸다 (실시간 링크 그대로) */
    }
  }

  // 웹 푸시 — 브라우저 구독자 전원 (앱 설치·건당 비용 없음, 2026-11-04). 구독자가 없으면 아무 것도 하지 않는다
  if (store) {
    tasks.push(
      (async () => {
        try {
          const aud: Audience = msg.audience ?? "owner";
          const r = await broadcastWebPush(store, env.DASHBOARD_URL ?? "https://korea-early-warning.gylee-30d.workers.dev", { title: msg.title, body: msg.body, url: msg.url, tag: "kew" }, fetchImpl, aud === "all" ? (s) => s.who === "owner" || s.who === "paid" : (s) => s.who === "owner");
          if (!r.total) return { channel: "webpush", ok: false, error: "구독자 없음", skipped: true } as PushResult;
          return { channel: "webpush", ok: r.sent > 0, error: r.sent ? undefined : `${r.failed}건 실패` };
        } catch (e) {
          return { channel: "webpush", ok: false, error: String(e).slice(0, 160) };
        }
      })(),
    );
  }

  if (useNtfy(env)) {
    tasks.push(
      (async () => {
        try {
          const server = env.NTFY_SERVER ?? "https://ntfy.sh";
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
          // JSON 발행: 제목에 한글을 그대로 쓸 수 있다
          const body = JSON.stringify({
            topic: env.NTFY_TOPIC, title: msg.title, message: msg.body, priority: msg.priority,
            tags: [msg.priority >= 5 ? "rotating_light" : "warning"], ...(msg.url ? { click: msg.url } : {}),
          });
          const res = await postWithRetry(fetchImpl, server, { method: "POST", body, headers });
          return { channel: "ntfy", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}${res.status === 429 ? " (ntfy.sh IP 요청 제한 — 계정 토큰 또는 Telegram 채널 권장)" : ""}` };
        } catch (e) {
          return { channel: "ntfy", ok: false, error: String(e) };
        }
      })(),
    );
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    tasks.push(
      (async () => {
        try {
          const text = `${msg.priority >= 5 ? "🚨 " : msg.priority >= 4 ? "⚠️ " : ""}*${escapeMd(msg.title)}*\n${escapeMd(msg.body)}${msg.url ? `\n${escapeMd(msg.url)}` : ""}`;
          const res = await postWithRetry(fetchImpl, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "MarkdownV2", disable_web_page_preview: true, disable_notification: msg.priority <= 2 }),
          });
          return { channel: "telegram", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
        } catch (e) {
          return { channel: "telegram", ok: false, error: String(e) };
        }
      })(),
    );
  }

  if (env.DISCORD_WEBHOOK_URL) {
    tasks.push(
      (async () => {
        try {
          const color = msg.priority >= 5 ? 0x8e0000 : msg.priority >= 4 ? 0xd32f2f : 0xe0650b;
          const res = await postWithRetry(fetchImpl, env.DISCORD_WEBHOOK_URL!, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: msg.priority >= 4 ? "@here" : undefined, embeds: [{ title: msg.title.slice(0, 250), description: msg.body.slice(0, 4000), url: msg.url, color }] }),
          });
          return { channel: "discord", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
        } catch (e) {
          return { channel: "discord", ok: false, error: String(e) };
        }
      })(),
    );
  }

  if (env.BARK_KEY) {
    tasks.push(
      (async () => {
        try {
          const server = (env.BARK_SERVER ?? "https://api.day.app").replace(/\/$/, "");
          const res = await postWithRetry(fetchImpl, `${server}/push`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              device_key: env.BARK_KEY,
              title: msg.title,
              body: msg.body,
              // critical: 무음·집중모드 돌파 (공습경보급) / timeSensitive: 잠금화면에 바로 표시
              level: msg.priority >= 5 ? "critical" : msg.priority >= 4 ? "timeSensitive" : "active",
              group: "korea-early-warning",
              ...(msg.url ? { url: msg.url } : {}),
            }),
          });
          const text = await res.text();
          const okBody = res.ok && !/"code"\s*:\s*(?!200)\d+/.test(text);
          return { channel: "bark", ok: okBody, error: okBody ? undefined : `HTTP ${res.status} ${text.slice(0, 100)}` };
        } catch (e) {
          return { channel: "bark", ok: false, error: String(e) };
        }
      })(),
    );
  }

  if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) {
    tasks.push(
      (async () => {
        try {
          // Pushover priority: -2..2. 2(emergency)는 확인할 때까지 반복 → 공습경보급만
          const p = msg.priority >= 5 ? 2 : msg.priority >= 4 ? 1 : 0;
          const body = new URLSearchParams({
            token: env.PUSHOVER_TOKEN!,
            user: env.PUSHOVER_USER!,
            title: msg.title,
            message: msg.body,
            priority: String(p),
            ...(p === 2 ? { retry: "60", expire: "1800" } : {}),
            ...(msg.url ? { url: msg.url } : {}),
          });
          const res = await postWithRetry(fetchImpl, "https://api.pushover.net/1/messages.json", { method: "POST", body });
          return { channel: "pushover", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
        } catch (e) {
          return { channel: "pushover", ok: false, error: String(e) };
        }
      })(),
    );
  }

  if (!tasks.length) return [{ channel: "none", ok: false, error: "푸시 채널 미설정 (NTFY_TOPIC / BARK_KEY / TELEGRAM_* / DISCORD_WEBHOOK_URL / PUSHOVER_*)" }];
  return (await Promise.all(tasks)).filter((r) => !r.skipped);
}

/** 설정된 채널 목록 (대시보드 표시용) */
export function pushChannels(env: PushEnv): string[] {
  const out: string[] = [];
  if (useNtfy(env)) out.push(env.NTFY_TOKEN ? "ntfy(계정 토큰)" : "ntfy(익명)");
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push("telegram");
  if (env.DISCORD_WEBHOOK_URL) out.push("discord");
  if (env.BARK_KEY) out.push("bark");
  if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) out.push("pushover");
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
