// 웹 푸시 (2026-11-04): 암호화를 브라우저 쪽 절차(RFC 8291)로 되풀어 같은 글이 나오는지, VAPID 서명이 공개키로 검증되는지,
// 구독 저장·끝난 구독 정리·sendPush 묶음 발송을 본다.
import { describe, expect, it } from "vitest";
import { addSub, b64u, broadcastWebPush, encryptPayload, generateVapidKeys, loadSubs, removeSub, sendWebPush, vapidAuthorization, type PushSubscriptionJson } from "../src/core/webpush.js";
import { sendPush } from "../src/core/notify.js";
import { MemoryStore } from "../src/core/store.js";

const te = new TextEncoder();
const td = new TextDecoder();

/** 브라우저 흉내: 수신 키 쌍과 auth 를 만들고, 받은 본문을 RFC 8291 대로 푼다 */
async function fakeBrowser() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub: PushSubscriptionJson = { endpoint: "https://push.example/send/abc", keys: { p256dh: b64u.encode(pub), auth: b64u.encode(auth) } };
  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, k, len * 8));
  };
  const decrypt = async (body: Uint8Array) => {
    const salt = body.slice(0, 16);
    const idlen = body[20];
    const serverPub = body.slice(21, 21 + idlen);
    const cipher = body.slice(21 + idlen);
    const sk = await crypto.subtle.importKey("raw", serverPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: sk }, kp.privateKey, 256));
    const info = new Uint8Array([...te.encode("WebPush: info\0"), ...pub, ...serverPub]);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
    const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, cipher as BufferSource));
    expect(plain[plain.length - 1]).toBe(2); // 마지막 레코드 구분자
    return td.decode(plain.slice(0, -1));
  };
  return { sub, decrypt };
}

describe("암호화·서명", () => {
  it("브라우저가 풀면 같은 글이 나온다 (aes128gcm, 헤더 rs=4096·keyid 65바이트)", async () => {
    const b = await fakeBrowser();
    const msg = JSON.stringify({ title: "3단계 위기 (약 15%) 나빠짐", body: "지금 한반도 상황 : …", url: "https://kew.example" });
    const enc = await encryptPayload(b.sub, msg);
    expect(Array.from(enc.slice(16, 20))).toEqual([0, 0, 16, 0]);
    expect(enc[20]).toBe(65);
    expect(await b.decrypt(enc)).toBe(msg);
  });

  it("VAPID 서명은 공개키로 검증되고 aud 는 푸시 서버 주소, 만료는 12시간", async () => {
    const k = await generateVapidKeys();
    const now = Date.UTC(2026, 10, 4, 3, 0);
    const h = await vapidAuthorization({ ...k, subject: "https://kew.example" }, "https://web.push.apple.com/QW1p", now);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(m[2]).toBe(k.publicKey);
    const [hd, pl, sig] = m[1].split(".");
    const payload = JSON.parse(td.decode(b64u.decode(pl)));
    expect(payload).toEqual({ aud: "https://web.push.apple.com", exp: Math.floor(now / 1000) + 12 * 3600, sub: "https://kew.example" });
    const raw = b64u.decode(k.publicKey);
    const pub = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.decode(sig) as BufferSource, te.encode(`${hd}.${pl}`))).toBe(true);
  });

  it("보내기: 헤더와 상태 처리 (201 성공, 410 은 끝난 구독)", async () => {
    const b = await fakeBrowser();
    const k = { ...(await generateVapidKeys()), subject: "mailto:x@example.com" };
    const seen: any[] = [];
    const f = (async (u: string, init: any) => { seen.push({ u, h: init.headers }); return new Response("", { status: 201 }); }) as unknown as typeof fetch;
    const r = await sendWebPush(k, b.sub, { title: "t", body: "b" }, f);
    expect(r.ok).toBe(true);
    expect(seen[0].u).toBe(b.sub.endpoint);
    expect(seen[0].h["Content-Encoding"]).toBe("aes128gcm");
    expect(seen[0].h.Authorization).toMatch(/^vapid t=/);
    const gone = await sendWebPush(k, b.sub, { title: "t", body: "b" }, (async () => new Response("gone", { status: 410 })) as unknown as typeof fetch);
    expect(gone).toMatchObject({ ok: false, gone: true, status: 410 });
  });
});

describe("구독 저장과 묶음 발송", () => {
  it("같은 주소는 하나만, 끝난 구독(410)은 지우고, 세 번 실패도 지운다", async () => {
    const store = new MemoryStore();
    const a = await fakeBrowser(), b = await fakeBrowser();
    b.sub.endpoint = "https://push.example/send/def";
    await addSub(store, a.sub, "owner", 1);
    await addSub(store, a.sub, "owner", 2);
    await addSub(store, b.sub, "public", 3);
    expect((await loadSubs(store)).map((s) => s.who)).toEqual(["owner", "public"]);
    const f = (async (u: string) => new Response("", { status: u.endsWith("def") ? 410 : 201 })) as unknown as typeof fetch;
    const r = await broadcastWebPush(store, "https://kew.example", { title: "t", body: "b" }, f);
    expect(r).toEqual({ sent: 1, failed: 1, removed: 1, total: 2 });
    expect((await loadSubs(store)).map((s) => s.endpoint)).toEqual([a.sub.endpoint]);
    const bad = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    for (let i = 0; i < 3; i++) await broadcastWebPush(store, "https://kew.example", { title: "t", body: "b" }, bad);
    expect(await loadSubs(store)).toEqual([]);
    expect(await removeSub(store, "x")).toEqual({ count: 0 });
  });

  it("sendPush 는 Bark 와 함께 웹 푸시 구독자에게도 보낸다; 구독자가 없으면 건너뛴다", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const f = (async (u: string) => { calls.push(u); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const env = { BARK_KEY: "k", DASHBOARD_URL: "https://kew.example" } as any;
    const r0 = await sendPush(env, { title: "t", body: "b", priority: 3 }, f, store);
    expect(r0.find((x) => x.channel === "webpush")).toBeUndefined(); // 구독자 없음 → 결과에 넣지 않는다 (Bark 실패를 가리지 않게)
    const a = await fakeBrowser();
    await addSub(store, a.sub, "owner", 1);
    const r1 = await sendPush(env, { title: "t", body: "b", priority: 3 }, f, store);
    expect(r1.map((x) => x.channel).sort()).toEqual(["bark", "webpush"]);
    expect(calls).toContain(a.sub.endpoint);
  });

  it("잘못된 구독 정보는 거부", async () => {
    const store = new MemoryStore();
    await expect(addSub(store, { endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }, "public", 1)).rejects.toThrow(/형식/);
  });
});
