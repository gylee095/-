// 2026-11-17: 합참 "러시아 군용기 여러 대 KADIZ 진입 후 이탈"을 놓쳤다 — 제목에 '북한'도 '미사일'도 없어 어느 분류 규칙에도 걸리지 않았다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { airspaceViolated, classifyText } from "../src/core/classify.js";
import { briefEvent } from "../src/core/brief.js";
import { collectRss } from "../src/core/collectors/news.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/kadiz_titles.json", import.meta.url), "utf8")) as Record<string, { t: string }[]>;
const NOW = Date.parse("2026-11-17T09:30:00+09:00");

describe("주변국 군용기의 KADIZ 진입·영공 침범", () => {
  it("KADIZ 진입 기사를 잡는다 — '영공침범 없어'는 침범이 아니다", () => {
    for (const { t } of fx.entry) {
      const c = classifyText(t);
      expect(c, t).toMatchObject({ category: "air_incursion", severity: 45 });
      expect(airspaceViolated(t), t).toBe(false);
    }
  });
  it("영공을 실제로 침범했으면 더 무겁게 본다", () => {
    for (const { t } of fx.violation) expect(classifyText(t), t).toMatchObject({ category: "air_incursion", severity: 70 });
  });
  it("대만·일본 방공식별구역 기사와 행사 기사는 아니다", () => {
    for (const { t } of fx.not) expect(classifyText(t)?.category, t).not.toBe("air_incursion");
  });
  it("사건 요약: 진입은 '주의'(주요 소식에 보인다), 침범은 '경계'. 북한의 도발로 세지 않는다", () => {
    const ev = (title: string, severity: number) => ({ id: "e", categories: ["air_incursion"], status: "UNVERIFIED", basis: "official_quote", severity, firstDetectedTime: NOW, lastUpdatedTime: NOW, signalIds: ["s"], title }) as any;
    const sig = (title: string, severity: number) => [{ id: "s", source: "rss_breaking", sourceKind: "media", category: "air_incursion", title, summary: "yna.co.kr · 공식발표 인용", detectedTime: NOW, severity }] as any;
    const a = briefEvent(ev(fx.entry[0].t, 45), sig(fx.entry[0].t, 45));
    expect(a.danger).toMatchObject({ level: 2, label: "주의" });
    expect(a.danger.reason).toMatch(/KADIZ.*영공 침범은 아님/);
    expect(a.isProvocation).toBe(false);
    expect(a.headline).toBe(fx.entry[0].t);
    expect(briefEvent(ev(fx.violation[0].t, 70), sig(fx.violation[0].t, 70)).danger).toMatchObject({ level: 3, reason: "주변국 군용기의 영공 침범" });
  });
  it("뉴스 수집에서 실제로 신호가 된다 (전에는 여기서 버려졌다)", async () => {
    const rss = `<rss><channel>${[fx.entry[0].t, fx.entry[4].t, fx.not[0].t].map((t, i) => `<item><title><![CDATA[${t}]]></title><link>https://www.yna.co.kr/view/AKR${i}</link><pubDate>${new Date(NOW - 600_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(rss, { headers: { "content-type": "application/xml" } })) as typeof fetch;
    try {
      const r = await collectRss(["https://www.yna.co.kr/rss/news.xml"], NOW, "rss_breaking");
      expect(r.signals.map((s) => [s.category, s.title])).toEqual([["air_incursion", fx.entry[0].t], ["air_incursion", fx.entry[4].t]]); // 제목에 지역 말이 없는 "중·러 군용기 8대, 오늘 낮 방공식별구역 침범"도
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("언론 단독 신호는 심각도가 낮게 눌려도(20) 영공 침범은 제목으로 알아본다", () => {
    const t = fx.violation[0].t;
    const b = briefEvent({ id: "e", categories: ["air_incursion"], status: "UNVERIFIED", basis: "media", severity: 20, firstDetectedTime: NOW, lastUpdatedTime: NOW, signalIds: ["s"], title: t } as any, [{ id: "s", source: "rss_breaking", sourceKind: "media", category: "air_incursion", title: t, summary: "yna.co.kr", detectedTime: NOW, severity: 20 }] as any);
    expect(b.danger).toMatchObject({ level: 3, reason: "주변국 군용기의 영공 침범" });
  });
  it("군·외교 기사는 '정치' 목록에 오래 남는다 — 그 목록은 사건으로만 받고 보도량 지표에는 넣지 않는다", async () => {
    const { BREAKING_FEEDS, EVENT_ONLY_FEEDS } = await import("../src/core/collectors/news.js");
    expect(EVENT_ONLY_FEEDS).toEqual(["https://www.yna.co.kr/rss/politics.xml", "https://www.yna.co.kr/rss/international.xml"]);
    const item = (t: string, i: number) => `<item><title><![CDATA[${t}]]></title><link>https://www.yna.co.kr/view/AKR${i}</link><pubDate>${new Date(NOW - 600_000).toUTCString()}</pubDate></item>`;
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: any) => new Response(`<rss><channel>${String(u).includes("politics") ? item(fx.entry[1].t, 1) + item("北, 전쟁 준비 완료 선언", 2) : item("오늘의 날씨", 9)}</channel></rss>`)) as typeof fetch;
    try {
      const base = await collectRss(BREAKING_FEEDS, NOW, "rss_breaking");
      const more = await collectRss(BREAKING_FEEDS, NOW, "rss_breaking", EVENT_ONLY_FEEDS);
      expect(base.signals).toHaveLength(0);
      expect(more.signals.map((s) => s.category)).toContain("air_incursion");
      expect(more.metrics).toEqual(base.metrics); // 정치 목록의 '전쟁' 기사가 보도량 지표를 올리지 않는다
      expect(more.ok).toBe(true);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
