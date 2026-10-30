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
