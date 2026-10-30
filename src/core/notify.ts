// 아이폰 푸시: ntfy(무료, iOS 앱) 또는 Pushover(iOS Critical Alert 지원, 1회 구매)
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

export async function sendPush(env: Env, msg: PushMessage, fetchImpl: typeof fetch = fetch): Promise<PushResult[]> {
  const results: PushResult[] = [];
  if (env.NTFY_TOPIC) {
    try {
      const server = env.NTFY_SERVER ?? "https://ntfy.sh";
      const headers: Record<string, string> = {
        // ntfy 헤더는 latin-1만 허용되므로 RFC 2047 인코딩
        Title: `=?UTF-8?B?${b64(msg.title)}?=`,
        Priority: String(msg.priority),
        Tags: msg.priority >= 5 ? "rotating_light" : "warning",
      };
      if (msg.url) headers.Click = msg.url;
      if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
      const res = await fetchImpl(`${server}/${env.NTFY_TOPIC}`, { method: "POST", body: msg.body, headers });
      results.push({ channel: "ntfy", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      results.push({ channel: "ntfy", ok: false, error: String(e) });
    }
  }
  if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) {
    try {
      // Pushover priority: -2..2. 2(emergency)는 확인할 때까지 반복 → 공습경보급만
      const p = msg.priority >= 5 ? 2 : msg.priority >= 4 ? 1 : 0;
      const body = new URLSearchParams({
        token: env.PUSHOVER_TOKEN,
        user: env.PUSHOVER_USER,
        title: msg.title,
        message: msg.body,
        priority: String(p),
        ...(p === 2 ? { retry: "60", expire: "1800" } : {}),
        ...(msg.url ? { url: msg.url } : {}),
      });
      const res = await fetchImpl("https://api.pushover.net/1/messages.json", { method: "POST", body });
      results.push({ channel: "pushover", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      results.push({ channel: "pushover", ok: false, error: String(e) });
    }
  }
  if (!results.length) results.push({ channel: "none", ok: false, error: "푸시 채널 미설정 (NTFY_TOPIC 또는 PUSHOVER_*)" });
  return results;
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
