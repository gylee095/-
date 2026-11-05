// 상품 소개 화면 (2026-11-05): 움직이는 한반도 + 그대로인 결제 흐름
import { describe, expect, it } from "vitest";
import { buyPage } from "../src/worker/buy.js";
import { KOREA_DEM } from "../src/worker/landing_dem.js";

describe("상품 소개 화면", () => {
  const html = buyPage("shop", "https://example.test");
  it("제목·결제 흐름(동의 → 페이앱 → 결제 확인)이 그대로 있다", () => {
    expect(html).toContain("39가지 신호로 보는 한반도 전쟁 위험");
    expect(html).toMatch(/id="agree"/);
    expect(html).toMatch(/id="pay"[^>]*onclick="pay\(\)"[^>]*disabled/);
    expect(html).toMatch(/PayApp\.setTarget\("_self"\)/);
    expect(html).toMatch(/function remember\(/); // 주문 기억(ORDERS_JS)
    expect(html).toMatch(/function kewGuide\(/); // 컴퓨터 QR·앱 안 화면 안내(INSTALL_JS)
    expect(html).toMatch(/location\.replace\("\/me"\)/); // 결제한 기기·홈 화면 앱은 알림함으로
    expect(buyPage(undefined, "https://example.test")).toContain("결제 준비 중");
  });
  it("지금 상황은 보여 주지 않는다 (무료 현재 상황 없음) — 장면은 연출이라고 밝힌다", () => {
    expect(html).not.toMatch(/\/api\/state|public-state|\/api\/me/);
    expect(html).toContain("지금 상황이 아닙니다");
  });
  it("빈칸이 남지 않고, 고도 격자 크기가 맞다", () => {
    expect(html).not.toMatch(/__[A-Z0-9]+__/);
    expect(KOREA_DEM.d.length).toBe(KOREA_DEM.cols * KOREA_DEM.rows);
    expect(html).toMatch(/og:image" content="https:\/\/example\.test\/og\.jpg"/);
  });
});

describe("공개 주소 koreasiren.com (11/5)", async () => {
  const { publicRedirect } = await import("../src/worker/index.js");
  const PUB = "https://koreasiren.com";
  const go = (u: string, method = "GET") => publicRedirect(new Request(u, { method }), new URL(u), PUB);
  it("예전 주소·www 로 온 손님 화면은 공개 주소로 (주소 뒤 내용 그대로)", () => {
    expect(go("https://korea-early-warning.gylee-30d.workers.dev/me?code=ABCD-EFGH-JKMN")?.headers.get("location")).toBe("https://koreasiren.com/me?code=ABCD-EFGH-JKMN");
    expect(go("https://korea-early-warning.gylee-30d.workers.dev/")?.status).toBe(301);
    expect(go("https://www.koreasiren.com/api/me?code=x")?.headers.get("location")).toBe("https://koreasiren.com/api/me?code=x");
  });
  it("API·결제 통보·MCP·운영자 화면·공개 주소 자체는 그대로", () => {
    for (const p of ["/api/billing/payapp-notify", "/api/billing/status?o=1&t=2", "/mcp/x", "/ops", "/sw.js", "/manifest.webmanifest"]) expect(go("https://korea-early-warning.gylee-30d.workers.dev" + p), p).toBeUndefined();
    expect(go("https://korea-early-warning.gylee-30d.workers.dev/", "POST")).toBeUndefined();
    expect(go("https://koreasiren.com/")).toBeUndefined();
    expect(publicRedirect(new Request("https://x.dev/"), new URL("https://x.dev/"), undefined)).toBeUndefined();
  });
});
