// 아이폰 푸시. 설정된 채널 모두에 보내고 하나라도 성공하면 성공으로 본다.
//  - ntfy      : 무료 iOS 앱. 단, ntfy.sh 는 발신 IP 단위로 요청을 제한해 Cloudflare 공유 IP 에서 429 가 잦다 → 계정 토큰(NTFY_TOKEN) 사용 권장
//  - Telegram  : 봇 토큰 + 채팅 ID. 무료·안정적(IP 제한 없음). 권장 보조 채널
//  - Discord   : 웹훅 URL. 무료
//  - Bark      : 무료 iOS 앱(계정 불필요). 앱이 주는 키 하나로 전송, 긴급 알림(무음 돌파) 지원. ntfy 대체로 권장
//  - Pushover  : 유료(1회 구매). iOS 긴급 알림(무음 돌파) 가능
import type { Env } from "./types.js";

export interface PushMessage {
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
}

interface PushEnv extends Env {
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

export async function sendPush(env: PushEnv, msg: PushMessage, fetchImpl: typeof fetch = fetch): Promise<PushResult[]> {
  const tasks: Promise<PushResult>[] = [];

  if (env.NTFY_TOPIC) {
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
  return Promise.all(tasks);
}

/** 설정된 채널 목록 (대시보드 표시용) */
export function pushChannels(env: PushEnv): string[] {
  const out: string[] = [];
  if (env.NTFY_TOPIC) out.push(env.NTFY_TOKEN ? "ntfy(계정 토큰)" : "ntfy(익명)");
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push("telegram");
  if (env.DISCORD_WEBHOOK_URL) out.push("discord");
  if (env.BARK_KEY) out.push("bark");
  if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) out.push("pushover");
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
