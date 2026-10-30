import { describe, expect, it } from "vitest";
import { sendPush, pushChannels } from "../src/core/notify.js";

function fake(statuses: Record<string, number[]>) {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const host = new URL(url).host;
    const q = statuses[host] ?? [200];
    const status = q.length > 1 ? q.shift()! : q[0];
    calls.push({ url, body: typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body });
    return new Response(status === 200 ? "{}" : "err", { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const msg = { title: "[속보] 북한, 탄도미사일 발사", body: "본문\n둘째 줄", priority: 4, url: "https://x.example" };

describe("푸시 채널", () => {
  it("ntfy JSON 발행에 한글 제목이 그대로 들어가고, 429 는 한 번 재시도한다", async () => {
    const { f, calls } = fake({ "ntfy.sh": [429, 200] });
    const r = await sendPush({ NTFY_TOPIC: "t" }, msg, f);
    expect(r[0]).toMatchObject({ channel: "ntfy", ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.title).toBe(msg.title);
    expect(calls[1].body.topic).toBe("t");
  });
  it("ntfy 가 계속 429 면 실패 사유에 안내를 붙이고, Telegram 이 성공하면 전체는 성공", async () => {
    const { f, calls } = fake({ "ntfy.sh": [429], "api.telegram.org": [200] });
    const r = await sendPush({ NTFY_TOPIC: "t", TELEGRAM_BOT_TOKEN: "b", TELEGRAM_CHAT_ID: "1" } as any, msg, f);
    expect(r.find((x) => x.channel === "ntfy")!.error).toMatch(/429/);
    expect(r.find((x) => x.channel === "telegram")!.ok).toBe(true);
    expect(r.some((x) => x.ok)).toBe(true);
    const tg = calls.find((c) => c.url.includes("telegram"))!;
    expect(tg.body.chat_id).toBe("1");
    expect(tg.body.text).toContain("탄도미사일");
  });
  it("채널 목록", () => {
    expect(pushChannels({ NTFY_TOPIC: "t", DISCORD_WEBHOOK_URL: "https://d" } as any)).toEqual(["ntfy(익명)", "discord"]);
    expect(pushChannels({})).toEqual([]);
  });
});

describe("Bark 채널", () => {
  it("JSON 푸시에 device_key·level 이 들어가고 응답 code 200 을 성공으로 본다", async () => {
    const calls: any[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ code: 200, message: "success" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendPush({ BARK_KEY: "abc" } as any, { ...msg, priority: 5 }, f);
    expect(r[0]).toMatchObject({ channel: "bark", ok: true });
    expect(calls[0].url).toBe("https://api.day.app/push");
    expect(calls[0].body.device_key).toBe("abc");
    expect(calls[0].body.level).toBe("critical");
    expect(calls[0].body.title).toBe(msg.title);
  });
  it("HTTP 200 이어도 본문 code 가 400 이면 실패로 본다", async () => {
    const f = (async () => new Response(JSON.stringify({ code: 400, message: "device key invalid" }), { status: 200 })) as unknown as typeof fetch;
    const r = await sendPush({ BARK_KEY: "bad" } as any, msg, f);
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toMatch(/invalid/);
  });
  it("429 가 이어지면 최대 4회 시도 후 실패", async () => {
    let n = 0;
    const f = (async () => { n++; return new Response("limit", { status: 429 }); }) as unknown as typeof fetch;
    const r = await sendPush({ NTFY_TOPIC: "t" }, msg, f);
    expect(n).toBe(4);
    expect(r[0].ok).toBe(false);
  });
});
