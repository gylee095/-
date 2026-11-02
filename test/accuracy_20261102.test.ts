// 2026-11-02 대시보드 점검에서 찾은 오류들
// 1) '동북아 군용기 10대' 중 절반이 일본 상공 → 군사 동향 '경계' 오판  2) 징후 조합 문구 '5498%(anomalous)'
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KOREA_THEATER_BOX, airMetrics, filterNeAsia, inBox, normalize } from "../src/core/collectors/adsb.js";
import { displayValue, shortLabel, INDICATOR_BY_ID } from "../src/core/indicators.js";
import { detectPatterns } from "../src/core/patterns.js";
import type { Reading } from "../src/core/types.js";

const json = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));
const NOW = Date.UTC(2026, 10, 2, 5, 36);

describe("군용기 수는 한반도 주변만 센다 (실제 2026-11-02 목록)", () => {
  const ac = filterNeAsia(json("adsb_mil_20261102.json").ac.map(normalize));
  const m = airMetrics([], ac);
  const mil = m.find((x) => x.indicator === "air.mil_airborne")!;

  it("동북아 8대 중 공중에 있는 한반도 주변 기체 3대만 (주한미군 C-12 2대, 한국군 수리온 헬기). 일본 상공 4대·지상 헬기는 빼고", () => {
    expect(ac.length).toBe(8);
    expect(mil.value).toBe(3);
    expect(mil.meta).toMatchObject({ types: { BE20: 2, SURN: 1 }, elsewhere: 4 });
  });

  it("범위: 한반도와 주변 바다", () => {
    expect(inBox({ lat: 37.5, lon: 127 }, KOREA_THEATER_BOX)).toBe(true); // 서울
    expect(inBox({ lat: 39.0, lon: 125.7 }, KOREA_THEATER_BOX)).toBe(true); // 평양
    expect(inBox({ lat: 37.5, lon: 131 }, KOREA_THEATER_BOX)).toBe(true); // 동해 울릉도 동쪽
    expect(inBox({ lat: 36.4, lon: 139.6 }, KOREA_THEATER_BOX)).toBe(false); // 일본 간토
    expect(inBox({ lat: 26.3, lon: 127.8 }, KOREA_THEATER_BOX)).toBe(false); // 오키나와
  });

  it("지표 이름·측정 설명도 '한반도 주변'으로 바뀌었고 기준선은 처음부터 다시 배운다", () => {
    const def = INDICATOR_BY_ID["air.mil_airborne"];
    expect(def.label).toBe("한반도 주변 군용기 수 (ADS-B 노출)");
    expect(def.measure).toMatch(/32\.5~43\.5/);
    expect(def.baselineVersion).toBe(3);
  });
});

describe("값 표기는 징후판 카드와 같고 한국어다", () => {
  it("평소 대비 배율·변화율·건수", () => {
    expect(displayValue("psych.naver_war_search", 5498)).toBe("평소의 55배");
    expect(displayValue("psych.wiki_korea_attention", 90)).toBe("평소의 0.9배");
    expect(displayValue("nk.fuel_price_change_pct", 88.4)).toBe("+88%");
    expect(displayValue("air.mil_airborne", 9)).toBe("9대");
    expect(shortLabel("한국 사람들의 전쟁 불안 (네이버 검색, 평소 대비)")).toBe("한국 사람들의 전쟁 불안");
  });

  it("징후 조합 근거: '5498%(anomalous)' 대신 '평소의 55배 (이상)'", () => {
    const rd = (indicator: string, value: number): Reading => ({ indicator, value, at: NOW, n: 30, state: "anomalous" });
    const p = detectPatterns({ "psych.naver_war_search": rd("psych.naver_war_search", 5498), "nk.fuel_price_change_pct": rd("nk.fuel_price_change_pct", 88.4) }, [], NOW);
    const md = p.find((x) => x.id === "multi_domain")!;
    expect(md.summary).toBe("한국 사람들의 전쟁 불안 평소의 55배 (이상) · 북한 장마당 휘발유값 +88% (이상)");
    expect(p.map((x) => x.summary).join(" ")).not.toMatch(/anomalous|elevated|5498/);
  });
});
