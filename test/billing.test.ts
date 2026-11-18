// 유료 알림 (결제사 페이앱, 2026-11-05): 돈과 코드가 오가는 길.
// 페이앱 결제통보가 진짜(연동 VALUE·해시·시각)이고 금액이 맞아야만 코드가 생긴다. 코드는 기기 3대, 취소되면 즉시 무효.
import { describe, expect, it } from "vitest";
import {
  DEVICES_PER_CODE,
  PRICE_KRW,
  billingSummary,
  cancelWithPayApp,
  createOrder,
  handlePayAppNotice,
  loadOrders,
  normalizeCode,
  orderStatus,
  payAppConfig,
  payAppHash,
  payAppTime,
  redeemCode,
  refundOrder,
  type PayAppConfig,
} from "../src/core/billing.js";
import { MemoryStore } from "../src/core/store.js";

const cfg: PayAppConfig = { userid: "kewshop", linkkey: "LK_test_key", linkval: "LV_secret_value", requestkey: "RK_secret_key" };
const NOW = Date.UTC(2026, 10, 5, 3, 0, 0); // 11/5 12:00 KST

/** 페이앱이 보내는 것과 같은 모양의 결제통보 */
async function notice(over: Record<string, string>, at = NOW): Promise<Record<string, string>> {
  const responsedate = payAppTime(at);
  return {
    userid: cfg.userid,
    linkkey: cfg.linkkey,
    linkval: cfg.linkval,
    responsedate,
    hash: await payAppHash(cfg.userid, responsedate, cfg.requestkey),
    goodname: "한반도 조기경보 알림 — 평생",
    price: "4900",
    mul_no: "777001",
    pay_state: "4",
    ...over,
  };
}

async function paidOrder() {
  const store = new MemoryStore();
  const o = await createOrder(store, NOW);
  await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1" }), NOW);
  const r = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4", csturl: "https://www.payapp.kr/CST/abc" }), NOW + 1000);
  if (r.reply !== "SUCCESS" || !r.order?.code) throw new Error("결제완료 실패");
  return { store, order: o, code: r.order.code };
}

describe("설정", () => {
  it("네 값이 모두 있어야 결제를 연다 (하나라도 없으면 '결제 준비 중')", () => {
    expect(payAppConfig({ PAYAPP_USERID: "a", PAYAPP_LINKKEY: "b", PAYAPP_LINKVAL: "c" })).toBeUndefined();
    expect(payAppConfig({ PAYAPP_USERID: "a", PAYAPP_LINKKEY: "b", PAYAPP_LINKVAL: "c", PAYAPP_REQUESTKEY: "d" })).toEqual({ userid: "a", linkkey: "b", linkval: "c", requestkey: "d" });
  });
  it("페이앱 시각은 한국 시각 14자리", () => {
    expect(payAppTime(NOW)).toBe("20261105120000");
  });
});

describe("주문", () => {
  it("금액은 서버가 정한다 (4,900원), 결제 전엔 코드 없음, 주문마다 일회용 열쇠", async () => {
    const store = new MemoryStore();
    const a = await createOrder(store, NOW);
    const b = await createOrder(store, NOW);
    expect(a.amount).toBe(PRICE_KRW);
    expect(PRICE_KRW).toBe(4900);
    expect(a.code).toBeUndefined();
    expect(a.claim).toMatch(/^[0-9a-f]{36}$/);
    expect(a.claim).not.toBe(b.claim);
  });
  it("상태 조회는 주문번호 + 열쇠가 둘 다 맞아야 하고, 코드는 결제완료 뒤에만 보인다", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    expect(await orderStatus(store, o.orderId, "wrong")).toBeUndefined();
    expect(await orderStatus(store, o.orderId, o.claim)).toEqual({ status: "created" });
    await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId }), NOW);
    const s = await orderStatus(store, o.orderId, o.claim);
    expect(s).toMatchObject({ status: "paid", code: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/), receiptUrl: undefined });
  });
});

describe("결제통보 검증 — 위조는 코드를 못 만든다", () => {
  it("진짜 통보: 요청(1) → SUCCESS 로 결제 허락, 결제완료(4) → 코드 하나, 같은 통보 반복에도 코드 그대로", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    const r1 = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1" }), NOW);
    expect(r1).toMatchObject({ reply: "SUCCESS", action: "requested" });
    const r4 = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4", csturl: "https://www.payapp.kr/CST/x" }), NOW);
    expect(r4).toMatchObject({ reply: "SUCCESS", action: "paid" });
    const again = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4" }), NOW + 60_000);
    expect(again).toMatchObject({ reply: "SUCCESS", action: "already" });
    const orders = await loadOrders(store);
    expect(orders[0].code).toBe((r4 as any).order.code);
    expect(orders[0]).toMatchObject({ status: "paid", mulNo: "777001", receiptUrl: "https://www.payapp.kr/CST/x" });
  });

  it.each([
    ["연동 VALUE 가 틀림", { linkval: "guess" }, "연동 정보 불일치"],
    ["다른 판매자 아이디", { userid: "other" }, "연동 정보 불일치"],
    ["해시가 틀림 (결제KEY 모르고 만든 통보)", { hash: "00".repeat(32) }, "해시 불일치"],
    ["해시 없음", { hash: "" }, "해시 불일치"],
  ])("거부: %s", async (_name, over, reason) => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    const r = await handlePayAppNotice(store, cfg, { ...(await notice({ var1: o.orderId })), ...over }, NOW);
    expect(r).toEqual({ reply: "FAIL", reason });
    expect((await loadOrders(store))[0].code).toBeUndefined();
  });

  it("거부: 오래된 통보 (재전송 공격) — 시각과 해시가 짝이 맞아도 30분 넘으면 안 받는다", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    const r = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId }, NOW - 31 * 60_000), NOW);
    expect(r).toMatchObject({ reply: "FAIL", reason: "통보 시각이 범위를 벗어남" });
  });

  it("거부: 금액이 다르면 요청 단계에서 막는다 (브라우저가 price 를 1000 으로 바꿔도 결제가 진행되지 않음)", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1", price: "1000" }), NOW)).toEqual({ reply: "FAIL", reason: "금액이 주문과 다름" });
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4", price: "1000" }), NOW)).toEqual({ reply: "FAIL", reason: "금액이 주문과 다름" });
    expect((await loadOrders(store))[0].status).toBe("created");
  });

  it("거부: 없는 주문", async () => {
    const store = new MemoryStore();
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: "kew_nope" }), NOW)).toEqual({ reply: "FAIL", reason: "주문 없음" });
  });

  it("11/5 실제 시도: 한 주문에 결제 요청이 두 번(번호가 바뀜) → 둘 다 받고, 먼저 온 문자 링크로 결제해도 코드가 나온다", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1", mul_no: "1001" }), NOW)).toMatchObject({ reply: "SUCCESS", action: "requested" });
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1", mul_no: "1002" }), NOW + 5000)).toMatchObject({ reply: "SUCCESS", action: "requested" }); // 예전엔 여기서 '결제요청번호 불일치'로 거절했다
    const paid = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4", mul_no: "1001" }), NOW + 60_000);
    expect(paid).toMatchObject({ reply: "SUCCESS", action: "paid" });
    expect((await loadOrders(store))[0]).toMatchObject({ status: "paid", mulNo: "1001" });
  });

  it("취소는 '결제된 그 요청'의 것만 반영: 다른 요청의 취소로는 코드가 살아 있고, 결제 전 다른 요청의 요청취소로 주문이 접히지 않는다", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1", mul_no: "2001" }), NOW);
    await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "1", mul_no: "2002" }), NOW);
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "8", mul_no: "2001" }), NOW)).toMatchObject({ action: "request_canceled" });
    expect((await loadOrders(store))[0].status).toBe("created"); // 기다리는 요청(2002)은 그대로
    const r4 = await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "4", mul_no: "2002" }), NOW);
    const code = (r4 as any).order.code;
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "9", mul_no: "2001" }), NOW)).toMatchObject({ reply: "SUCCESS", action: "ignored" });
    expect((await redeemCode(store, code, "https://p/1", NOW)).ok).toBe(true);
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "9", mul_no: "2002" }), NOW)).toMatchObject({ action: "revoked", devices: ["https://p/1"] });
  });

  it("요청취소(결제 전) → failed, 코드 없음", async () => {
    const store = new MemoryStore();
    const o = await createOrder(store, NOW);
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: o.orderId, pay_state: "8" }), NOW)).toMatchObject({ reply: "SUCCESS", action: "request_canceled" });
    expect((await loadOrders(store))[0]).toMatchObject({ status: "failed" });
  });

  it("승인취소 통보(페이앱 관리 화면에서 취소해도) → 코드 무효, 켠 기기 목록을 돌려준다", async () => {
    const { store, order, code } = await paidOrder();
    await redeemCode(store, code, "https://p/1", NOW);
    const r = await handlePayAppNotice(store, cfg, await notice({ var1: order.orderId, pay_state: "9" }), NOW);
    expect(r).toMatchObject({ reply: "SUCCESS", action: "revoked", devices: ["https://p/1"] });
    expect((await redeemCode(store, code, "https://p/2", NOW)).ok).toBe(false);
  });
});

describe("활성화 코드", () => {
  it("대소문자·띄어쓰기·하이픈이 달라도 같은 코드로 받는다", () => {
    expect(normalizeCode("abcd efgh-jklm")).toBe("ABCD-EFGH-JKLM");
    expect(normalizeCode(" ABCDEFGHJKLM ")).toBe("ABCD-EFGH-JKLM");
  });
  it("기기 3대까지; 같은 기기는 다시 켜도 한 자리", async () => {
    const { store, code } = await paidOrder();
    for (let i = 1; i <= DEVICES_PER_CODE; i++) expect((await redeemCode(store, code, `https://p/${i}`, NOW)).ok).toBe(true);
    expect((await redeemCode(store, code.toLowerCase(), "https://p/1", NOW)).ok).toBe(true);
    expect(await redeemCode(store, code, "https://p/4", NOW)).toMatchObject({ ok: false, reason: expect.stringContaining(`${DEVICES_PER_CODE}대`) });
  });
  it("결제 안 된 주문·없는 코드는 거부", async () => {
    const store = new MemoryStore();
    await createOrder(store, NOW);
    expect((await redeemCode(store, "AAAA-BBBB-CCCC", "https://p/1", NOW)).ok).toBe(false);
  });
});

describe("환불 (페이앱 취소 API)", () => {
  it("취소 요청 형식: paycancel · 연동 KEY · 한국 시각 · sha256(아이디+시각+결제KEY) · 결제요청번호", async () => {
    let sent: URLSearchParams | undefined;
    let url = "";
    const f = (async (u: string, init: any) => { url = u; sent = new URLSearchParams(init.body); return new Response("state=1&errorMessage=", { status: 200 }); }) as unknown as typeof fetch;
    expect(await cancelWithPayApp(cfg, "777001", "7일 안 환불", NOW, f)).toEqual({ ok: true });
    expect(url).toBe("https://api.payapp.kr/oapi/v2");
    expect(sent!.get("cmd")).toBe("paycancel");
    expect(sent!.get("userid")).toBe("kewshop");
    expect(sent!.get("linkkey")).toBe("LK_test_key");
    expect(sent!.get("requestdate")).toBe("20261105120000");
    expect(sent!.get("hash")).toBe(await payAppHash("kewshop", "20261105120000", "RK_secret_key"));
    expect(sent!.get("mul_no")).toBe("777001");
    expect(sent!.get("partcancel")).toBe("0");
    expect(sent!.has("linkval")).toBe(false); // 연동 VALUE 는 보내지 않는다 (받을 때 확인용)
    const bad = (async () => new Response("state=0&errno=70080&errorMessage=%EC%B7%A8%EC%86%8C%EB%B6%88%EA%B0%80", { status: 200 })) as unknown as typeof fetch;
    expect(await cancelWithPayApp(cfg, "777001", "x", NOW, bad)).toMatchObject({ ok: false, error: expect.stringContaining("70080") });
  });

  it("취소가 성공해야만 refunded; 코드 즉시 무효; 켠 기기 목록; 두 번 해도 안전; 매출에서 빠진다", async () => {
    const { store, order, code } = await paidOrder();
    await redeemCode(store, code, "https://p/1", NOW);
    const fail = (async () => new Response("state=0&errorMessage=x", { status: 200 })) as unknown as typeof fetch;
    expect((await refundOrder(store, cfg, { code }, "요청", NOW, fail)).ok).toBe(false);
    expect((await redeemCode(store, code, "https://p/2", NOW)).ok).toBe(true); // 취소 실패 → 아직 유효
    const ok = (async () => new Response("state=1", { status: 200 })) as unknown as typeof fetch;
    expect(await refundOrder(store, cfg, { orderId: order.orderId }, "7일 안 환불", NOW, ok)).toEqual({ ok: true, orderId: order.orderId, devices: ["https://p/1", "https://p/2"] });
    expect((await redeemCode(store, code, "https://p/9", NOW)).ok).toBe(false);
    expect(await refundOrder(store, cfg, { orderId: order.orderId }, "다시", NOW, ok)).toEqual({ ok: true, orderId: order.orderId, devices: [] });
    // 뒤늦게 온 승인취소 통보도 문제없다
    expect(await handlePayAppNotice(store, cfg, await notice({ var1: order.orderId, pay_state: "9" }), NOW)).toMatchObject({ reply: "SUCCESS", action: "already" });
    expect(await billingSummary(store, NOW)).toMatchObject({ paid: 0, refunded: 1, revenueKrw: 0 });
  });

  it("매출 요약에는 코드·결제요청번호가 없다", async () => {
    const { store } = await paidOrder();
    const s = await billingSummary(store, NOW);
    expect(s).toMatchObject({ paid: 1, revenueKrw: 4900 });
    expect(JSON.stringify(s)).not.toMatch(/777001|[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });
});

describe("경로 규칙 (코드 검사)", () => {
  it("무료 구독 없음; 코드는 결제통보로만; 비밀값은 브라우저로 안 간다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const sub = src.slice(src.indexOf('"/api/push/subscribe"'), src.indexOf('"/api/push/subscribe"') + 700);
    expect(sub).toMatch(/if \(!authed\) return json\(\{ error: "알림은 결제 뒤 받은 활성화 코드로 켤 수 있어요"[^)]*\}, 402\)/);
    const act = src.slice(src.indexOf('"/api/billing/activate"'), src.indexOf('"/api/billing/activate"') + 700);
    expect(act).toMatch(/redeemCode\(/);
    expect(act).toMatch(/addSub\(store, body\.subscription, "paid"/);
    // 주문 응답(브라우저로 가는 것)에 연동 KEY·VALUE·결제KEY 가 없다
    const order = src.slice(src.indexOf('"/api/billing/order"'), src.indexOf('"/api/billing/payapp-notify"'));
    expect(order).not.toMatch(/linkkey|linkval|requestkey/);
    // 토스 흔적 없음, 예전 '브라우저가 확정 요청' 경로 없음
    expect(src).not.toMatch(/TOSS_|confirmWithToss|\/api\/billing\/confirm/);
    const buy = readFileSync(new URL("../src/worker/buy.ts", import.meta.url), "utf8");
    expect(buy).toMatch(/lite\.payapp\.kr\/public\/api\/v2\/payapp-lite\.js/);
    expect(buy).not.toMatch(/tosspayments|TossPayments/);
    // 11/5: 번호는 우리 사이트가 아니라 페이앱 화면에서 받는다(믿음) → 페이앱이 결제 링크 문자를 보내야 하므로 문자 발송은 켠다
    expect(buy).not.toMatch(/id="phone"|recvphone/);
    const orderRoute = src.slice(src.indexOf('"/api/billing/order"'), src.indexOf('"/api/billing/payapp-notify"'));
    expect(orderRoute).toMatch(/smsuse: "y"/);
  });
});

describe("결제 알림 — 운영자에게만 (11/17)", () => {
  it("결제·취소가 확정되면 금액·시각·주문 끝 4자리·이용 중 인원만 담는다 — 손님 정보는 없다", async () => {
    const { paymentPush } = await import("../src/core/billing.js");
    const o = (id: string, status: string) => ({ orderId: id, claim: "c", amount: 4900, status, createdAt: 0, devices: [] }) as any;
    const now = Date.parse("2026-11-17T14:03:00+09:00");
    const m = paymentPush("paid", o("kew-abc-1234", "paid"), [o("kew-abc-1234", "paid"), o("x2", "paid"), o("x3", "refunded"), o("x4", "created")], now);
    expect(m.title).toBe("💰 결제 들어옴 — 4,900원");
    expect(m.body).toBe("실제 손님 2명 · 매출 9,800원 (환불·본인 결제 제외)\n오늘: 결제 0건\n주문 …1234 · 11/17 14:03"); // 이 시험의 주문에는 결제 시각이 없어 '오늘 0건'
    // 오늘 결제 2건 중 1건을 환불하면 첫 줄은 남은 손님만, 둘째 줄은 오늘의 결제·환불 건수 (11/18 테스트 결제 때문에 헷갈렸다)
    const t = (id: string, status: string, x: object) => ({ ...o(id, status), ...x });
    const m2 = paymentPush("revoked", t("r1", "refunded", { paidAt: now - 3600_000, refundedAt: now }), [t("a", "paid", { paidAt: now - 7200_000 }), t("r1", "refunded", { paidAt: now - 3600_000, refundedAt: now }), t("me", "paid", { paidAt: now - 100, own: true })], now);
    expect(m2.body.split("\n").slice(0, 2)).toEqual(["실제 손님 1명 · 매출 4,900원 (환불·본인 결제 제외)", "오늘: 결제 2건 · 환불 1건"]);
    expect(paymentPush("revoked", o("kew-abc-1234", "refunded"), [o("kew-abc-1234", "refunded")], now).title).toBe("↩️ 결제 취소됨 — 4,900원");
    expect(JSON.stringify(m)).not.toMatch(/audience|01\d-|claim/);
  });
  it("코드: 결제통보 처리에서 paid·revoked 일 때만, 운영자에게만(audience 없음) 보낸다", async () => {
    const { readFileSync } = await import("node:fs");
    const idx = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    expect(idx).toMatch(/\(r\.action === "paid" \|\| r\.action === "revoked"\) && r\.order\) \{\s*const m = paymentPush\(/);
    expect(idx).not.toMatch(/paymentPush[\s\S]{0,300}audience/);
    expect(idx).toMatch(/\/ops\/app` : undefined \}, fetch, store\)/); // 운영자 앱(웹 푸시)에도 가게 store 를 넘긴다
  });
});

describe("운영자 본인의 결제는 손님 수·매출에서 뺀다 (11/18)", () => {
  it("결제 알림의 '이용 중 N명 (합계)'와 요약에서 빠지고 own 으로 따로 센다", async () => {
    const { paymentPush, billingSummary, markOwn, ORDERS_KEY } = await import("../src/core/billing.js");
    const { MemoryStore } = await import("../src/core/store.js");
    const now = Date.parse("2026-11-17T20:12:00+09:00");
    const o = (id: string, paidAt: number, own?: boolean) => ({ orderId: id, claim: "c", code: "X", amount: 4900, status: "paid", createdAt: paidAt - 40_000, paidAt, devices: ["d"], ...(own ? { own: true } : {}) }) as any;
    const orders = [o("mine", Date.parse("2026-11-06T00:30:08+09:00")), o("c1", now - 600_000), o("c2", now)];
    const store = new MemoryStore();
    await store.setKv(ORDERS_KEY, JSON.stringify(orders));
    expect((await billingSummary(store, now)).paid).toBe(3);
    expect(await markOwn(store, { paidAt: "11-17 99:99" }, true, now)).toBeUndefined(); // 못 찾으면 아무것도 바꾸지 않는다
    expect((await markOwn(store, { paidAt: "11-06 00:30" }, true, now))!.orderId).toBe("mine");
    const sum = await billingSummary(store, now);
    expect(sum).toMatchObject({ paid: 2, revenueKrw: 9800, own: 1, paidToday: 2 });
    const saved = JSON.parse((await store.getKv(ORDERS_KEY))!);
    expect(paymentPush("paid", saved[2], saved, now).body).toMatch(/^실제 손님 2명 · 매출 9,800원/);
    expect((await markOwn(store, { orderId: "mine" }, false, now))!.own).toBeUndefined();
    expect((await billingSummary(store, now)).paid).toBe(3);
  });
});

// 11/18 사용자: 가입 흐름을 더 고치기 전에 숫자부터 — 어디서 들어와 어디까지 갔나
describe("가입 흐름 기록: 기기·브라우저 종류만 남긴다", async () => {
  const { browserKind, viaLabel, funnelOf } = await import("../src/core/billing.js");
  it("User-Agent 를 한 낱말로 줄인다", () => {
    expect(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 355.0.0.0")).toBe("ios:threads");
    expect(browserKind("Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Barcelona 355.0.0.0 Android")).toBe("android:threads");
    expect(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe("ios:safari");
    expect(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1")).toBe("ios:chrome");
    expect(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe("ios:app");
    expect(browserKind("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36")).toBe("android:samsung");
    expect(browserKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("android:chrome");
    expect(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.0.0")).toBe("ios:kakao");
    expect(browserKind(null)).toBe("desktop:other");
    expect(viaLabel("ios:threads")).toBe("아이폰 · 스레드 앱 안");
  });
  it("시작 → 결제 → 알림 켬을 들어온 곳별로 센다. 본인 주문과 기록 없는 옛 주문은 뺀다. 환불돼도 알림을 켰던 기록은 남는다", () => {
    const o = (x: object) => ({ orderId: "k", claim: "c", amount: 4900, status: "created", createdAt: 1, devices: [], ...x }) as never;
    const f = funnelOf([
      o({ via: "ios:threads" }),
      o({ via: "ios:threads", status: "paid" }),
      o({ via: "ios:threads", status: "paid", devices: ["e1"], viaOn: ["ios:app"] }),
      o({ via: "ios:threads", status: "refunded", viaOn: ["ios:app"] }),
      o({ via: "android:chrome", status: "paid", devices: ["e2"] }),
      o({ via: "ios:safari", status: "paid", own: true }),
      o({ status: "paid", devices: ["old"] }),
    ]);
    expect(f[0]).toEqual({ via: "ios:threads", label: "아이폰 · 스레드 앱 안", started: 4, paid: 3, enabled: 2, refunded: 1 });
    expect(f[1]).toMatchObject({ via: "android:chrome", started: 1, paid: 1, enabled: 1 });
    expect(f).toHaveLength(2);
  });
});
