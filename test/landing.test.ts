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
