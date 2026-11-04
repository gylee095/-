// 유료 알림 (2026-11-04): 돈과 코드가 오가는 길. 서버가 토스로 확정해야만 코드가 생기고,
// 코드는 기기 3대까지, 환불하면 즉시 못 쓰고, 금액은 서버가 정한다.
import { describe, expect, it } from "vitest";
import { DEVICES_PER_CODE, PRICE_KRW, billingSummary, confirmWithToss, createOrder, loadOrders, markPaid, normalizeCode, redeemCode, refundOrder } from "../src/core/billing.js";
import { MemoryStore } from "../src/core/store.js";

const tossOk = (status = "DONE") =>
  (async (_u: string, init: any) => {
    tossCalls.push({ url: _u, body: init?.body ? JSON.parse(init.body) : undefined, auth: init?.headers?.Authorization });
    return new Response(JSON.stringify({ status, receipt: { url: "https://dashboard.tosspayments.com/receipt/x" } }), { status: 200 });
  }) as unknown as typeof fetch;
let tossCalls: { url: string; body?: any; auth?: string }[] = [];

describe("주문과 결제 확정", () => {
  it("금액은 서버가 정한다 (4,900원)", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, 1);
    expect(o.amount).toBe(PRICE_KRW);
    expect(PRICE_KRW).toBe(4900);
    expect(o.status).toBe("created");
    expect(o.code).toBeUndefined(); // 결제 전엔 코드 없음
  });

  it("토스 승인 API: 비밀키는 Basic 인증으로만, 주문 금액으로 확정; DONE 이 아니면 실패", async () => {
    tossCalls = [];
    const r = await confirmWithToss("test_sk_x", "pk_1", "kew_1", 4900, tossOk());
    expect(r).toMatchObject({ ok: true, receiptUrl: expect.stringContaining("receipt") });
    expect(tossCalls[0].url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    expect(tossCalls[0].body).toEqual({ paymentKey: "pk_1", orderId: "kew_1", amount: 4900 });
    expect(tossCalls[0].auth).toBe(`Basic ${btoa("test_sk_x:")}`);
    const bad = await confirmWithToss("k", "p", "o", 4900, (async () => new Response(JSON.stringify({ code: "REJECT_CARD_PAYMENT", message: "한도초과" }), { status: 400 })) as unknown as typeof fetch);
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining("REJECT_CARD_PAYMENT") });
    const notDone = await confirmWithToss("k", "p", "o", 4900, tossOk("WAITING_FOR_DEPOSIT"));
    expect(notDone.ok).toBe(false);
  });

  it("확정하면 코드 하나가 생기고, 두 번 확정해도 같은 코드", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, 1);
    const a = await markPaid(store, o.orderId, "pk", "r", 2);
    expect(a.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(a.code).not.toMatch(/[01IO]/); // 헷갈리는 글자 없음
    const b = await markPaid(store, o.orderId, "pk", "r", 3);
    expect(b.code).toBe(a.code);
    expect((await loadOrders(store)).filter((x) => x.status === "paid")).toHaveLength(1);
  });
});

describe("활성화 코드", () => {
  async function paidCode() {
    const store = new MemoryStore();
    const o = await createOrder(store, 1);
    const p = await markPaid(store, o.orderId, "pk_live", "r", 2);
    return { store, code: p.code!, orderId: o.orderId };
  }

  it("대소문자·띄어쓰기·하이픈이 달라도 같은 코드로 받는다", () => {
    expect(normalizeCode("abcd efgh-jklm")).toBe("ABCD-EFGH-JKLM");
    expect(normalizeCode(" ABCDEFGHJKLM ")).toBe("ABCD-EFGH-JKLM");
  });

  it("기기 3대까지; 같은 기기는 다시 켜도 한 자리", async () => {
    const { store, code } = await paidCode();
    for (let i = 1; i <= DEVICES_PER_CODE; i++) expect((await redeemCode(store, code, `https://p/${i}`)).ok).toBe(true);
    expect((await redeemCode(store, code.toLowerCase(), "https://p/1")).ok).toBe(true); // 이미 등록된 기기
    const over = await redeemCode(store, code, "https://p/4");
    expect(over).toMatchObject({ ok: false, reason: expect.stringContaining(`${DEVICES_PER_CODE}대`) });
  });

  it("결제 안 된 주문·없는 코드는 거부", async () => {
    const store = new MemoryStore();
    await createOrder(store, 1);
    expect((await redeemCode(store, "AAAA-BBBB-CCCC", "https://p/1")).ok).toBe(false);
  });

  it("환불: 토스 취소가 성공해야만 refunded, 코드는 즉시 못 쓰고 켠 기기 목록을 돌려준다", async () => {
    const { store, code, orderId } = await paidCode();
    await redeemCode(store, code, "https://p/1");
    await redeemCode(store, code, "https://p/2");
    tossCalls = [];
    const failed = await refundOrder(store, "sk", { code }, "요청", 3, (async () => new Response(JSON.stringify({ code: "ALREADY_CANCELED_PAYMENT" }), { status: 400 })) as unknown as typeof fetch);
    expect(failed.ok).toBe(false);
    expect((await redeemCode(store, code, "https://p/3")).ok).toBe(true); // 취소 실패 → 아직 유효
    const r = await refundOrder(store, "sk", { orderId }, "7일 안 환불", 4, tossOk("CANCELED"));
    expect(r).toEqual({ ok: true, orderId, devices: ["https://p/1", "https://p/2", "https://p/3"] });
    expect(tossCalls.at(-1)!.url).toBe("https://api.tosspayments.com/v1/payments/pk_live/cancel");
    expect((await redeemCode(store, code, "https://p/9")).ok).toBe(false);
    expect((await refundOrder(store, "sk", { orderId }, "다시", 5, tossOk("CANCELED")))).toEqual({ ok: true, orderId, devices: [] }); // 두 번 환불해도 안전
    expect(await billingSummary(store, 6)).toMatchObject({ paid: 0, refunded: 1, revenueKrw: 0 });
  });

  it("매출 요약에는 코드·결제키가 없다", async () => {
    const { store } = await paidCode();
    const s = await billingSummary(store, Date.now());
    expect(s).toMatchObject({ paid: 1, revenueKrw: 4900 });
    expect(JSON.stringify(s)).not.toMatch(/pk_live|[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });
});

describe("무료 구독은 없다 (코드 검사)", () => {
  it("비밀값 없는 /api/push/subscribe 는 402, 유료 알림은 /api/billing/activate 로만", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const sub = src.slice(src.indexOf('"/api/push/subscribe"'), src.indexOf('"/api/push/subscribe"') + 700);
    expect(sub).toMatch(/if \(!authed\) return json\(\{ error: "알림은 결제 뒤 받은 활성화 코드로 켤 수 있어요"[^)]*\}, 402\)/);
    expect(sub).not.toMatch(/"public"/);
    const act = src.slice(src.indexOf('"/api/billing/activate"'), src.indexOf('"/api/billing/activate"') + 700);
    expect(act).toMatch(/redeemCode\(/);
    expect(act).toMatch(/addSub\(store, body\.subscription, "paid"/);
    // 결제 확정은 서버가 토스로: confirm 경로가 confirmWithToss 를 거친 뒤에만 markPaid
    const conf = src.slice(src.indexOf('"/api/billing/confirm"'), src.indexOf('"/api/billing/activate"'));
    expect(conf.indexOf("confirmWithToss(")).toBeGreaterThan(0);
    expect(conf.indexOf("markPaid(")).toBeGreaterThan(conf.indexOf("confirmWithToss("));
  });
});
