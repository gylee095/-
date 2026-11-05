// 유료 알림 (2026-11-04, 결제사 페이앱 2026-11-05): 4,900원 1회 결제 → 활성화 코드 → 휴대폰에서 코드로 알림 켜기 → 'paid' 구독.
// 토스는 가입비 22만 원 + 연 11만 원이라 쓰지 않는다. 페이앱은 가입비·연회비 없이 건당 수수료만(비사업자 4%).
// 돈이 오가는 길의 원칙:
//  1. 결제 확정은 페이앱 서버가 우리 서버로 보내는 결제통보(feedbackurl)로만 한다. 브라우저가 "결제됐다"고 말하는 것은 믿지 않는다.
//     통보는 연동 VALUE(비밀)·해시(sha256(아이디+시각+결제KEY))·금액이 모두 맞아야 받는다.
//  2. 코드는 결제완료 통보 뒤 서버만 만든다. 코드는 기기 3대까지(가족), 환불·승인취소되면 즉시 무효.
//  3. 연동 KEY·연동 VALUE·결제KEY 는 서버 안에서만 쓰고 어디에도 적지 않는다. 브라우저에는 판매자 아이디만 간다.
import type { Store } from "./store.js";

export const PRICE_KRW = 4900;
export const PRODUCT_NAME = "한반도 조기경보 알림 — 평생";
export const SHOP_NAME = "한반도 조기경보";
/** 코드 하나로 켤 수 있는 기기 수 (본인 폰 + 가족 기기) */
export const DEVICES_PER_CODE = 3;
export const ORDERS_KEY = "billing:orders";
export const PAYAPP_API = "https://api.payapp.kr/oapi/v2";
/** 결제수단: 즉시 확정되는 것만 (가상계좌는 입금을 기다려야 해서 뺀다) */
export const PAYAPP_PAYTYPES = "card,kakaopay,naverpay,tosspay,applepay,payco,smilepay,phone";

export interface PayAppConfig {
  userid: string;
  linkkey: string;
  linkval: string;
  /** 결제KEY — 통보 해시 검증·취소 API 해시에 쓴다 */
  requestkey: string;
}

export function payAppConfig(env: { PAYAPP_USERID?: string; PAYAPP_LINKKEY?: string; PAYAPP_LINKVAL?: string; PAYAPP_REQUESTKEY?: string }): PayAppConfig | undefined {
  if (!env.PAYAPP_USERID || !env.PAYAPP_LINKKEY || !env.PAYAPP_LINKVAL || !env.PAYAPP_REQUESTKEY) return undefined;
  return { userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY, linkval: env.PAYAPP_LINKVAL, requestkey: env.PAYAPP_REQUESTKEY };
}

export interface Order {
  orderId: string;
  /** 결제 완료 화면이 코드를 받아 갈 때 쓰는 일회용 열쇠 — 주문번호만 알아서는 코드를 못 본다 */
  claim: string;
  /** 활성화 코드 — 결제완료 통보 뒤에만 생긴다 */
  code?: string;
  amount: number;
  status: "created" | "paid" | "failed" | "refunded";
  createdAt: number;
  paidAt?: number;
  refundedAt?: number;
  /** 페이앱 결제요청번호 — 취소에 쓴다 */
  mulNo?: string;
  /** 이 코드로 알림을 켠 구독 주소(기기) */
  devices: string[];
  /** 신용카드 매출전표 주소 (비밀 없음) */
  receiptUrl?: string;
  /** 결제 순간에 준 첫 리포트 (reports.ts) */
  startReportId?: string;
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

const randomToken = (bytes = 18) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

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
  const o: Order = { orderId: newOrderId(), claim: randomToken(), amount: PRICE_KRW, status: "created", createdAt: now, devices: [] };
  orders.push(o);
  await saveOrders(store, orders, now);
  return o;
}

/** 결제 완료 화면용: 주문번호 + 일회용 열쇠가 맞을 때만 상태와 코드를 준다 */
export async function orderStatus(store: Pick<Store, "getKv">, orderId: string, claim: string): Promise<{ status: Order["status"]; code?: string; receiptUrl?: string } | undefined> {
  const o = (await loadOrders(store)).find((x) => x.orderId === orderId);
  if (!o || !safeEqual(o.claim, claim)) return undefined;
  return o.status === "paid" ? { status: o.status, code: o.code, receiptUrl: o.receiptUrl } : { status: o.status };
}

// ── 페이앱 ──

function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 페이앱 시각 형식 yyyymmddhhiiss (한국 시각) */
export function payAppTime(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function parsePayAppTime(s: string): number | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s ?? "");
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 9 * 3600_000;
}

export const payAppHash = (userid: string, time: string, requestkey: string) => sha256Hex(userid + time + requestkey);

/** 통보 시각 허용 폭 — 페이앱 요청 규칙(±15분)보다 넉넉히: 재시도(최대 10회) 통보가 늦게 와도 받는다. 같은 통보가 여러 번 와도 결과는 같다 */
export const NOTICE_SKEW_MS = 30 * 60_000;

/** 결제통보가 진짜 페이앱에서 왔는지: 아이디·연동 KEY·연동 VALUE 일치, 해시 일치, 시각이 지금 근처 */
export async function verifyPayAppNotice(cfg: PayAppConfig, f: Record<string, string>, now: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!safeEqual(f.userid, cfg.userid) || !safeEqual(f.linkkey, cfg.linkkey) || !safeEqual(f.linkval, cfg.linkval)) return { ok: false, reason: "연동 정보 불일치" };
  const t = parsePayAppTime(f.responsedate);
  if (t === undefined || Math.abs(now - t) > NOTICE_SKEW_MS) return { ok: false, reason: "통보 시각이 범위를 벗어남" };
  const want = await payAppHash(cfg.userid, f.responsedate, cfg.requestkey);
  if (!safeEqual((f.hash ?? "").toLowerCase(), want)) return { ok: false, reason: "해시 불일치" };
  return { ok: true };
}

export type NoticeResult =
  | { reply: "SUCCESS"; action: "requested" | "paid" | "already" | "waiting" | "request_canceled" | "ignored"; order?: Order }
  | { reply: "SUCCESS"; action: "revoked"; order: Order; devices: string[] }
  | { reply: "FAIL"; reason: string };

/**
 * 결제통보 처리. 응답이 'SUCCESS' 여야 페이앱이 결제를 진행·완료로 본다(아니면 재시도).
 * 금액이 주문과 다르면 요청 단계(pay_state=1)에서 거절해 결제 자체가 진행되지 않게 한다 — 브라우저가 금액을 바꿔도 소용없다.
 */
export async function handlePayAppNotice(store: Pick<Store, "getKv" | "setKv">, cfg: PayAppConfig, f: Record<string, string>, now: number): Promise<NoticeResult> {
  const v = await verifyPayAppNotice(cfg, f, now);
  if (!v.ok) return { reply: "FAIL", reason: v.reason };
  const orders = await loadOrders(store);
  const o = orders.find((x) => x.orderId === f.var1);
  if (!o) return { reply: "FAIL", reason: "주문 없음" };
  if (o.mulNo && f.mul_no && o.mulNo !== f.mul_no) return { reply: "FAIL", reason: "결제요청번호 불일치" };
  const state = Number(f.pay_state);
  const priceOk = Number(f.price) === o.amount;
  switch (state) {
    case 1: // 요청 — 금액 확인 후 결제 진행 허락
      if (!priceOk) return { reply: "FAIL", reason: "금액이 주문과 다름" };
      if (o.status !== "created") return { reply: "SUCCESS", action: "already", order: o };
      o.mulNo = f.mul_no;
      await saveOrders(store, orders, now);
      return { reply: "SUCCESS", action: "requested", order: o };
    case 4: // 결제완료 → 코드 발급 (같은 통보가 다시 와도 코드는 하나)
      if (!priceOk) return { reply: "FAIL", reason: "금액이 주문과 다름" };
      if (o.status === "paid") return { reply: "SUCCESS", action: "already", order: o };
      if (o.status === "refunded") return { reply: "SUCCESS", action: "already", order: o };
      o.status = "paid";
      o.paidAt = now;
      o.mulNo = f.mul_no;
      o.receiptUrl = f.csturl || undefined;
      o.code = randomCode();
      await saveOrders(store, orders, now);
      return { reply: "SUCCESS", action: "paid", order: o };
    case 10: // 결제대기(가상계좌 입금 전) — 막아 두었지만 오면 기다린다
      return { reply: "SUCCESS", action: "waiting", order: o };
    case 8:
    case 16:
    case 31:
    case 32: // 요청취소 — 결제 전 취소
      if (o.status === "created") {
        o.status = "failed";
        await saveOrders(store, orders, now);
      }
      return { reply: "SUCCESS", action: "request_canceled", order: o };
    case 9:
    case 64:
    case 70:
    case 71: {
      // 승인취소·부분취소 (페이앱 관리 화면에서 취소해도 여기로 온다) → 코드 무효, 켠 기기 목록을 돌려준다
      if (o.status === "refunded") return { reply: "SUCCESS", action: "already", order: o };
      const devices = o.devices;
      o.status = "refunded";
      o.refundedAt = now;
      o.devices = [];
      await saveOrders(store, orders, now);
      return { reply: "SUCCESS", action: "revoked", order: o, devices };
    }
    default:
      return { reply: "SUCCESS", action: "ignored", order: o };
  }
}

/** 페이앱 응답(URL 인코딩 쿼리)을 읽는다 */
const parseQuery = (s: string) => Object.fromEntries(new URLSearchParams(s));

/** 결제 취소 API (전체 취소). 성공하면 페이앱이 승인취소 통보도 보낸다 — 처리는 어느 쪽이 먼저 와도 같다 */
export async function cancelWithPayApp(cfg: PayAppConfig, mulNo: string, memo: string, now: number, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  try {
    const requestdate = payAppTime(now);
    const body = new URLSearchParams({
      cmd: "paycancel",
      userid: cfg.userid,
      linkkey: cfg.linkkey,
      requestdate,
      hash: await payAppHash(cfg.userid, requestdate, cfg.requestkey),
      mul_no: mulNo,
      cancelmemo: memo.slice(0, 100),
      partcancel: "0",
    });
    const res = await fetchImpl(PAYAPP_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" }, body: body.toString() });
    const r = parseQuery(await res.text());
    if (r.state !== "1") return { ok: false, error: `${r.errno ?? res.status} ${r.errorMessage ?? ""}`.trim() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

/** 결제 순간의 첫 리포트를 주문에 붙인다 */
export async function attachStartReport(store: Pick<Store, "getKv" | "setKv">, orderId: string, reportId: string, now: number): Promise<void> {
  const orders = await loadOrders(store);
  const o = orders.find((x) => x.orderId === orderId);
  if (!o || o.startReportId) return;
  o.startReportId = reportId;
  await saveOrders(store, orders, now);
}

/** 알림함: 결제된 코드의 주문 (환불·없는 코드는 undefined) */
export async function paidOrderByCode(store: Pick<Store, "getKv">, code: string): Promise<Order | undefined> {
  const norm = normalizeCode(code ?? "");
  const o = (await loadOrders(store)).find((x) => x.code === norm);
  return o && o.status === "paid" ? o : undefined;
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

/** 환불: 페이앱 취소가 성공해야만 refunded 로 바꾸고, 그 코드로 켠 기기 목록을 돌려준다(호출한 쪽이 구독을 지운다). 코드는 즉시 못 쓰게 된다 */
export async function refundOrder(store: Pick<Store, "getKv" | "setKv">, cfg: PayAppConfig, by: { orderId?: string; code?: string }, reason: string, now: number, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; orderId: string; devices: string[] } | { ok: false; error: string }> {
  const norm = by.code ? normalizeCode(by.code) : undefined;
  const find = (list: Order[]) => list.find((x) => (by.orderId && x.orderId === by.orderId) || (norm && x.code === norm));
  const o = find(await loadOrders(store));
  if (!o) return { ok: false, error: "주문 없음" };
  if (o.status === "refunded") return { ok: true, orderId: o.orderId, devices: [] };
  if (o.status !== "paid" || !o.mulNo) return { ok: false, error: `환불할 수 없는 상태: ${o.status}` };
  const c = await cancelWithPayApp(cfg, o.mulNo, reason, now, fetchImpl);
  if (!c.ok) return { ok: false, error: `페이앱 취소 실패: ${c.error}` };
  // 취소 API 를 기다리는 사이 승인취소 통보가 먼저 와서 바꿨을 수 있으니 다시 읽는다
  const orders = await loadOrders(store);
  const cur = find(orders)!;
  if (cur.status === "refunded") return { ok: true, orderId: cur.orderId, devices: [] };
  const devices = cur.devices;
  cur.status = "refunded";
  cur.refundedAt = now;
  cur.devices = [];
  await saveOrders(store, orders, now);
  return { ok: true, orderId: cur.orderId, devices };
}

/** 운영자 화면용 요약 (코드·결제번호 같은 민감한 값은 뺀다) */
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
