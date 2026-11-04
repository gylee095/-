// 웹 푸시 — 브라우저(사파리·크롬)가 직접 알림을 띄운다. 앱 설치도 건당 비용도 없다 (2026-11-04).
// RFC 8291(aes128gcm 암호화)·RFC 8292(VAPID 서명)를 WebCrypto 로 직접 구현한다 — Worker 에 라이브러리를 더하지 않으려고.
// 비밀값: VAPID 개인키(환경 변수 VAPID_PRIVATE_KEY, JWK d 값)와 공개키(VAPID_PUBLIC_KEY, base64url 65바이트). 로그·노트에 쓰지 않는다.

export interface PushSubscriptionJson {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** base64url 로 인코딩한 비압축 공개키 (65바이트) */
  publicKey: string;
  /** JWK 의 d (base64url) */
  privateKey: string;
  /** mailto: 또는 https: 연락처 */
  subject: string;
}

const te = new TextEncoder();

export const b64u = {
  encode(bytes: ArrayBuffer | Uint8Array): string {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (const b of u) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

/** 새 VAPID 키 쌍 만들기 (한 번만, 결과는 비밀값으로 저장) */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64u.encode(pub), privateKey: jwk.d! };
}

function xyFromPublic(publicKey: string): { x: string; y: string } {
  const raw = b64u.decode(publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("VAPID 공개키 형식 오류");
  return { x: b64u.encode(raw.slice(1, 33)), y: b64u.encode(raw.slice(33, 65)) };
}

/** VAPID 서명 헤더 (RFC 8292): 푸시 서버에게 '이 서버가 보낸다'를 증명 */
export async function vapidAuthorization(keys: VapidKeys, endpoint: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u.encode(te.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const { x, y } = xyFromPublic(keys.publicKey);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y, d: keys.privateKey }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64u.encode(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 메시지 암호화 (RFC 8291 aes128gcm) — 구독자의 브라우저만 풀 수 있다 */
export async function encryptPayload(sub: PushSubscriptionJson, plaintext: string): Promise<Uint8Array> {
  const uaPub = b64u.decode(sub.keys.p256dh);
  const auth = b64u.decode(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info\0"), uaPub, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const padded = concat(te.encode(plaintext), new Uint8Array([2])); // 마지막 레코드 구분자
  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, padded as BufferSource));
  // 헤더: salt(16) · rs(4) · idlen(1) · keyid(65)
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([localPub.length]), localPub, cipher);
}

export interface WebPushResult {
  ok: boolean;
  status?: number;
  /** 410·404: 구독이 끝났다 — 지워야 한다 */
  gone?: boolean;
  error?: string;
}

/** 구독 하나에 알림 보내기. 본문은 JSON(title·body·url) 문자열 */
export async function sendWebPush(keys: VapidKeys, sub: PushSubscriptionJson, payload: { title: string; body: string; url?: string; tag?: string }, fetchImpl: typeof fetch = fetch, ttlSec = 24 * 3600, authHeader?: string): Promise<WebPushResult> {
  try {
    const body = await encryptPayload(sub, JSON.stringify(payload));
    const res = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader ?? (await vapidAuthorization(keys, sub.endpoint)),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSec),
        Urgency: "high",
      },
      body: body as BufferSource,
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: `HTTP ${res.status} ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

// ── 구독 저장과 발송 (KV 한 줄에 구독 목록, 키 쌍은 처음 한 번 만들어 KV 에 둔다) ──
import type { Store } from "./store.js";

export const SUBS_KEY = "webpush:subs";
export const VAPID_KEY = "webpush:vapid";
export const MAX_SUBS = 5000;

export interface StoredSub extends PushSubscriptionJson {
  /** 등록 시각 */
  at: number;
  /** 등록한 쪽 (대시보드 주인 = owner, 그 밖은 public) */
  who?: string;
  /** 마지막 실패 시각·횟수 — 여러 번 실패하면 지운다 */
  fails?: number;
}

/** 키 쌍: 없으면 한 번 만들어 저장한다 (배포·설정 단계 없이 바로 쓰려고) */
export async function loadVapid(store: Pick<Store, "getKv" | "setKv">, subject: string): Promise<VapidKeys> {
  const raw = await store.getKv(VAPID_KEY);
  if (raw) return { ...(JSON.parse(raw) as { publicKey: string; privateKey: string }), subject };
  const k = await generateVapidKeys();
  await store.setKv(VAPID_KEY, JSON.stringify(k));
  return { ...k, subject };
}

export async function loadSubs(store: Pick<Store, "getKv">): Promise<StoredSub[]> {
  const raw = await store.getKv(SUBS_KEY);
  return raw ? (JSON.parse(raw) as StoredSub[]) : [];
}

/** 구독 추가 (같은 주소는 하나만) */
export async function addSub(store: Pick<Store, "getKv" | "setKv">, sub: PushSubscriptionJson, who: string, now: number): Promise<{ count: number; who: string }> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("구독 정보 형식 오류");
  const all = await loadSubs(store);
  const prev = all.find((s) => s.endpoint === sub.endpoint);
  const subs = all.filter((s) => s.endpoint !== sub.endpoint);
  // 같은 기기가 로그인 뒤 다시 등록하면 owner 로 올린다. owner 였던 것을 public 으로 내리지는 않는다 (로그아웃 상태로 다시 눌러도)
  // 올라간 등급은 내려가지 않는다: owner 는 늘 owner, paid 는 public 으로 떨어지지 않는다
  const finalWho = prev?.who === "owner" ? "owner" : prev?.who === "paid" && who === "public" ? "paid" : who;
  subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, at: prev?.at ?? now, who: finalWho });
  if (subs.length > MAX_SUBS) subs.splice(0, subs.length - MAX_SUBS);
  await store.setKv(SUBS_KEY, JSON.stringify(subs));
  return { count: subs.length, who: finalWho };
}

export async function removeSub(store: Pick<Store, "getKv" | "setKv">, endpoint: string): Promise<{ count: number }> {
  const subs = (await loadSubs(store)).filter((s) => s.endpoint !== endpoint);
  await store.setKv(SUBS_KEY, JSON.stringify(subs));
  return { count: subs.length };
}

/** 모든 구독자에게 보내고, 끝난 구독(410·404)과 세 번 넘게 실패한 구독은 지운다 */
export async function broadcastWebPush(
  store: Pick<Store, "getKv" | "setKv">,
  subject: string,
  payload: { title: string; body: string; url?: string; tag?: string },
  fetchImpl: typeof fetch = fetch,
  only?: (s: StoredSub) => boolean,
): Promise<{ sent: number; failed: number; removed: number; total: number }> {
  const subs = await loadSubs(store);
  if (!subs.length) return { sent: 0, failed: 0, removed: 0, total: 0 };
  const keys = await loadVapid(store, subject);
  const targets = only ? subs.filter(only) : subs;
  const auth = new Map<string, Promise<string>>();
  const authFor = (endpoint: string) => {
    const o = new URL(endpoint).origin;
    if (!auth.has(o)) auth.set(o, vapidAuthorization(keys, endpoint));
    return auth.get(o)!;
  };
  const results = await Promise.all(targets.map(async (s) => sendWebPush(keys, s, payload, fetchImpl, 24 * 3600, await authFor(s.endpoint))));
  let sent = 0, failed = 0, removed = 0;
  const keep: StoredSub[] = [];
  const byEndpoint = new Map(targets.map((s, i) => [s.endpoint, results[i]]));
  for (const s of subs) {
    const r = byEndpoint.get(s.endpoint);
    if (!r) { keep.push(s); continue; }
    if (r.ok) { sent++; keep.push({ ...s, fails: 0 }); continue; }
    failed++;
    const fails = (s.fails ?? 0) + 1;
    if (r.gone || fails >= 3) removed++;
    else keep.push({ ...s, fails });
  }
  if (removed || failed) await store.setKv(SUBS_KEY, JSON.stringify(keep));
  return { sent, failed, removed, total: targets.length };
}
