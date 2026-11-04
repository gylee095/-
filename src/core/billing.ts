// 유료 알림 (2026-11-04): 4,900원 1회 결제 → 활성화 코드 → 휴대폰에서 코드로 알림 켜기 → 'paid' 구독.
// 돈이 오가는 길은 세 가지 원칙으로 짠다.
//  1. 결제 확정은 서버가 토스에 직접 확인한다(승인 API). 브라우저가 "결제됐다"고 말하는 것은 믿지 않는다.
//  2. 코드는 결제 뒤 서버만 만든다. 코드 없이는 유료 구독이 될 수 없고, 코드는 기기 몇 대까지만 쓴다(가족 공유 여지, 무한 복제 방지).
//  3. 비밀키(TOSS_SECRET_KEY)는 서버 안에서만 쓰고 어디에도 적지 않는다.
import type { Store } from "./store.js";

export const PRICE_KRW = 4900;
export const PRODUCT_NAME = "한반도 조기경보 알림 — 평생";
/** 코드 하나로 켤 수 있는 기기 수 (본인 폰 + 가족 기기) */
export const DEVICES_PER_CODE = 3;
export const ORDERS_KEY = "billing:orders";

export interface Order {
  orderId: string;
  /** 활성화 코드 — 결제 확정 뒤에만 생긴다 */
  code?: string;
  amount: number;
  status: "created" | "paid" | "failed" | "refunded";
  refundedAt?: number;
  createdAt: number;
  paidAt?: number;
  paymentKey?: string;
  /** 이 코드로 알림을 켠 구독 주소(기기) 수 */
  devices: string[];
  /** 토스가 돌려준 승인 응답 일부 (영수증 URL 등, 비밀 없음) */
  receiptUrl?: string;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 뺌

function randomCode(groups = 3, len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * len));
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i && i % len === 0) s += "-";
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return s;
}

export const newOrderId = () => `kew_${Date.now().toString(36)}_${randomCode(1, 6)}`;

export async function loadOrders(store: Pick<Store, "getKv">): Promise<Order[]> {
  const raw = await store.getKv(ORDERS_KEY);
  return raw ? (JSON.parse(raw) as Order[]) : [];
}

async function saveOrders(store: Pick<Store, "setKv">, orders: Order[], now: number) {
  // 하루 넘은 미결제 주문은 버린다 (결제창만 열고 닫은 것). 시계는 호출한 쪽의 now 하나만 쓴다
  const keep = orders.filter((o) => o.status !== "created" || now - o.createdAt < 24 * 3600_000);
  await store.setKv(ORDERS_KEY, JSON.stringify(keep.slice(-5000)));
}

/** 결제창을 열기 전에 주문을 만든다 — 금액은 서버가 정한다 */
export async function createOrder(store: Pick<Store, "getKv" | "setKv">, now: number): Promise<Order> {
  const orders = await loadOrders(store);
  const o: Order = { orderId: newOrderId(), amount: PRICE_KRW, status: "created", createdAt: now, devices: [] };
  orders.push(o);
  await saveOrders(store, orders, now);
  return o;
}

export interface TossConfirmResult {
  ok: boolean;
  receiptUrl?: string;
  error?: string;
}

/**
 * 토스 승인 API: 브라우저가 돌려받은 paymentKey·orderId·amount 를 서버가 비밀키로 확정한다.
 * 금액은 우리 주문의 금액과 같아야 한다 — 브라우저가 보낸 amount 로 확정하지 않는다.
 */
export async function confirmWithToss(secretKey: string, paymentKey: string, orderId: string, amount: number, fetchImpl: typeof fetch = fetch): Promise<TossConfirmResult> {
  try {
    const res = await fetchImpl("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${secretKey}:`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const j = (await res.json().catch(() => ({}))) as { status?: string; receipt?: { url?: string }; message?: string; code?: string };
    if (!res.ok || j.status !== "DONE") return { ok: false, error: `${j.code ?? res.status} ${j.message ?? ""}`.trim() };
    return { ok: true, receiptUrl: j.receipt?.url };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

/** 결제 확정 → 코드 발급. 같은 주문을 두 번 확정해도 코드는 하나 */
export async function markPaid(store: Pick<Store, "getKv" | "setKv">, orderId: string, paymentKey: string, receiptUrl: string | undefined, now: number): Promise<Order> {
  const orders = await loadOrders(store);
  const o = orders.find((x) => x.orderId === orderId);
  if (!o) throw new Error("주문 없음");
  if (o.status === "paid" && o.code) return o;
  o.status = "paid";
  o.paidAt = now;
  o.paymentKey = paymentKey;
  o.receiptUrl = receiptUrl;
  o.code = randomCode();
  await saveOrders(store, orders, now);
  return o;
}

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z2-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");

/** 코드로 기기를 등록한다. 결제된 주문의 코드여야 하고, 기기 수 상한을 넘지 않아야 한다. 같은 기기는 다시 등록해도 한 자리 */
export async function redeemCode(store: Pick<Store, "getKv" | "setKv">, code: string, endpoint: string, now = Date.now()): Promise<{ ok: true; order: Order } | { ok: false; reason: string }> {
  const norm = normalizeCode(code);
  const orders = await loadOrders(store);
  const o = orders.find((x) => x.code === norm);
  if (!o || o.status !== "paid") return { ok: false, reason: "맞지 않는 코드예요. 결제 뒤 받은 코드를 다시 확인해 주세요." };
  if (!o.devices.includes(endpoint)) {
    if (o.devices.length >= DEVICES_PER_CODE) return { ok: false, reason: `이 코드는 기기 ${DEVICES_PER_CODE}대까지 쓸 수 있어요. 이미 다 썼어요.` };
    o.devices.push(endpoint);
    await saveOrders(store, orders, now);
  }
  return { ok: true, order: o };
}

/** 토스 결제 취소 API — 전액 */
export async function cancelWithToss(secretKey: string, paymentKey: string, reason: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${secretKey}:`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancelReason: reason.slice(0, 200) }),
    });
    const j = (await res.json().catch(() => ({}))) as { status?: string; message?: string; code?: string };
    if (!res.ok || (j.status !== "CANCELED" && j.status !== "PARTIAL_CANCELED")) return { ok: false, error: `${j.code ?? res.status} ${j.message ?? ""}`.trim() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

/** 환불: 토스 취소가 성공해야만 주문을 refunded 로 바꾸고, 그 코드로 켠 기기 목록을 돌려준다(호출한 쪽이 구독을 지운다). 코드는 즉시 못 쓰게 된다 */
export async function refundOrder(store: Pick<Store, "getKv" | "setKv">, secretKey: string, by: { orderId?: string; code?: string }, reason: string, now: number, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; orderId: string; devices: string[] } | { ok: false; error: string }> {
  const orders = await loadOrders(store);
  const norm = by.code ? normalizeCode(by.code) : undefined;
  const o = orders.find((x) => (by.orderId && x.orderId === by.orderId) || (norm && x.code === norm));
  if (!o) return { ok: false, error: "주문 없음" };
  if (o.status === "refunded") return { ok: true, orderId: o.orderId, devices: [] };
  if (o.status !== "paid" || !o.paymentKey) return { ok: false, error: `환불할 수 없는 상태: ${o.status}` };
  const c = await cancelWithToss(secretKey, o.paymentKey, reason, fetchImpl);
  if (!c.ok) return { ok: false, error: `토스 취소 실패: ${c.error}` };
  const devices = o.devices;
  o.status = "refunded";
  o.refundedAt = now;
  o.devices = [];
  await saveOrders(store, orders, now);
  return { ok: true, orderId: o.orderId, devices };
}

/** 운영자 화면용 요약 (코드·결제키 같은 민감한 값은 뺀다) */
export async function billingSummary(store: Pick<Store, "getKv">, now: number) {
  const orders = await loadOrders(store);
  const paid = orders.filter((o) => o.status === "paid");
  const day = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  const today = day(now);
  return {
    paid: paid.length,
    paidToday: paid.filter((o) => o.paidAt && day(o.paidAt) === today).length,
    revenueKrw: paid.reduce((a, o) => a + o.amount, 0),
    devices: paid.reduce((a, o) => a + o.devices.length, 0),
    pendingOrders: orders.filter((o) => o.status === "created").length,
    refunded: orders.filter((o) => o.status === "refunded").length,
  };
}
