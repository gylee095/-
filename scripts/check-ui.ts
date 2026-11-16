// 대시보드 화면 점검: npm run check:ui [상태.json]  (2026-11-02)
// 휴대폰 폭(390px)·밝은/어두운 화면에서 묶음과 카드를 모두 펼쳐 놓고 본다:
//  - 화면보다 넓은 것(가로로 밀림)  - 스크립트 오류  - 빈칸·영어 상태어('?대', undefined, NaN, anomalous …)
// 11/2 점검에서 '시스템 상태' 표가 418px 로 화면 밖으로 나간 것을 사람 눈으로 찾은 뒤 만들었다.
// 상태 파일이 없으면 KEW_SECRET 으로 지금 서버 상태를 받는다 (비밀값이 든 setup 은 지운다). 브라우저(Playwright)가 있는 곳에서만 돈다.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { DASHBOARD_HTML } from "../src/worker/dashboard.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BAD = /\?(대|건|%|배|원|일)(?![가-힣])|\bundefined\b|\bNaN\b|\banomalous\b|\belevated\b|\[object Object\]/;
const URL_STATE = "https://korea-early-warning.gylee-30d.workers.dev/api/state?hours=72";

async function loadState(): Promise<any> {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const key = process.env.KEW_SECRET;
  if (!key) throw new Error("상태 파일 경로를 주거나 KEW_SECRET 을 설정하세요 (프록시 뒤라 Node 가 서버에 못 닿으면: curl 로 /api/state 를 받아 setup 을 지운 파일을 넘긴다)");
  const res = await fetch(URL_STATE, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`상태 받기 실패 HTTP ${res.status}`);
  return res.json();
}

const st = await loadState();
st.setup = { pushChannels: st.setup?.pushChannels ?? [], ntfySubscribeUrl: null, connectorUrl: "" };
const html = (DASHBOARD_HTML as string).replace("<head>", "<head><script>window.__KEW_STATE__=" + JSON.stringify(st).replace(/</g, "\\u003c") + "</script>");
const browser = await chromium.launch();
const problems: string[] = [];
for (const scheme of ["light", "dark"] as const) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  page.on("pageerror", (e: Error) => problems.push(`[${scheme}] 스크립트 오류: ${e.message}`));
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true));
    document.querySelectorAll(".sumpanel,.srcbox").forEach((d) => ((d as HTMLElement).style.display = "block")); // 세 칸을 눌렀을 때 뜨는 설명도 모두 펼쳐 본다
    document.querySelectorAll(".ind").forEach((n) => n.classList.add("open"));
  });
  await page.waitForTimeout(800);
  const r = await page.evaluate((badSrc: string) => {
    const bad = new RegExp(badSrc);
    const W = window.innerWidth;
    const wide = Array.from(document.querySelectorAll("body *"))
      .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.right > W + 1; })
      .slice(0, 5).map((n) => `${n.tagName.toLowerCase()}.${(n as HTMLElement).className} → ${Math.round(n.getBoundingClientRect().right)}px`);
    const lines = document.body.innerText.split("\n").filter((l) => bad.test(l)).slice(0, 5);
    return { scrollW: document.documentElement.scrollWidth, wide, lines, cardErrors: Array.from(document.querySelectorAll(".card")).filter((n) => /표시 오류/.test((n as HTMLElement).innerText)).length };
  }, BAD.source);
  if (r.scrollW > 390) problems.push(`[${scheme}] 가로로 밀림: 페이지 폭 ${r.scrollW}px — ${r.wide.join(" / ")}`);
  for (const l of r.lines) problems.push(`[${scheme}] 빈칸·영어 표시: ${l.slice(0, 120)}`);
  if (r.cardErrors) problems.push(`[${scheme}] 카드 표시 오류 ${r.cardErrors}개`);
  await page.close();
}
await browser.close();
if (problems.length) {
  console.error("화면 점검 실패:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("화면 점검 통과: 390px 밝은·어두운 화면, 모두 펼침 — 가로 밀림·스크립트 오류·빈칸 표시 없음");
