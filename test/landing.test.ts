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
    expect(html).toMatch(/kewDrawQr\("\/\?go=buy"\)/); // 컴퓨터 QR 은 결제 칸으로 바로
    expect(html).toContain("#buy .card"); // 넘어오면 결제 칸으로 스크롤
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

describe("시험 서버 표시 (11/6)", async () => {
  const { markStaging } = await import("../src/worker/index.js");
  it("화면에 시험 띠, 검색 제외, 홈 화면 앱 이름에 (시험)", async () => {
    const page = await markStaging(new Response("<html><body>x</body></html>", { headers: { "content-type": "text/html; charset=utf-8" } }), new URL("https://staging.koreasiren.com/"));
    expect(await page.text()).toContain("STAGING · 시험 서버");
    expect(page.headers.get("x-robots-tag")).toMatch(/noindex/);
    const man = await markStaging(new Response(JSON.stringify({ name: "한반도 조기경보", short_name: "조기경보" }), { headers: { "content-type": "application/manifest+json" } }), new URL("https://staging.koreasiren.com/manifest.webmanifest"));
    expect(await man.json()).toMatchObject({ name: "한반도 조기경보 (시험)", short_name: "시험 조기경보" });
  });
  it("시험 서버 설정: 본 서버 데이터를 읽기만, 알림·결제·루틴 비밀값은 올리지 않고, 표 변경도 적용하지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    const st = toml.slice(toml.indexOf("[env.staging]"));
    expect(st).toMatch(/database_name = "kew"/); // 본 서버 데이터를 읽기만 (쓰기는 readonly.ts 가 버린다)
    expect(st).toMatch(/crons = \[\]/); // 시험 서버는 수집·알림을 하지 않는다
    expect(st).toMatch(/PUBLIC_URL = "https:\/\/staging\.koreasiren\.com"/);
    expect(st).toMatch(/STAGING = "1"/);
    const yml = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
    for (const k of ["BARK_KEY", "PAYAPP_LINKKEY", "CLAUDE_ROUTINE_TOKEN", "TELEGRAM_BOT_TOKEN"]) expect(yml).toMatch(new RegExp(`notStaging=\\[[^\\]]*"${k}"`));
    expect(yml).toMatch(/github\.ref_name == 'main' && 'production' \|\| 'staging'/);
    expect(yml).toMatch(/if \[ "\$TARGET" = "staging" \]; then echo "시험 서버: 마이그레이션 건너뜀"; exit 0; fi\n\s*npx wrangler d1 migrations apply/);
  });
});
