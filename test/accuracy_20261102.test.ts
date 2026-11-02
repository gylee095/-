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

describe("위치 이름과 정찰기 범위는 core/geo.ts 한 곳에서 (11/2: 도쿄 근처 호주 공군기가 '동해 상공'으로 보였다)", () => {
  it("실제 위치들", async () => {
    const { placeName } = await import("../src/core/geo.js");
    expect(placeName(35.9, 139.65)).toBe("일본 쪽 상공"); // 11/2 호주 공군 KC-30A (A39-006)
    expect(placeName(38.12, 138.95)).toBe("일본 쪽 상공"); // 일본 P-1 니가타
    expect(placeName(37.09, 127.03)).toBe("한반도 상공"); // 오산
    expect(placeName(37.97, 124.7)).toBe("서해 상공"); // 백령도
    expect(placeName(39.5, 131.5)).toBe("동해 상공");
    expect(placeName(26.35, 127.77)).toBe("남쪽 바다(동중국해) 상공"); // 가데나
    expect(placeName(38.9, 121.6)).toBe("중국 쪽 상공"); // 다롄
  });
  it("정찰·급유기 수: 도쿄 근처 2대는 세지 않고, 동해 위 코브라볼은 센다", () => {
    const ac = (type: string, reg: string, lat: number, lon: number) => normalize({ hex: reg, t: type, r: reg, lat, lon, alt_baro: 30000, dbFlags: 1 });
    const m = airMetrics([], [ac("A332", "A39-006", 35.9, 139.65), ac("P8", "A47-003", 36.23, 139.76), ac("R135", "61-2662", 39.5, 133.0)]);
    const isr = m.find((x) => x.indicator === "air.isr_airborne")!;
    expect(isr.value).toBe(1);
  });
});

describe("시장 값은 자기 거래 날짜를 갖는다 (11/2 월요일 화면의 '미국 상장 한국 ETF −5.52%'는 10/30 금요일 미국 장 값이었다)", () => {
  const MON = Date.UTC(2026, 10, 2, 6, 30); // 11/2 15:30 KST
  const FRI_US = Date.UTC(2026, 9, 30, 20, 0); // 10/30 16:00 뉴욕
  it("미국 장 날짜를 붙이고, 휴장한 이웃 증시는 빼고 비교한다", async () => {
    const { equityMetrics } = await import("../src/core/collectors/markets.js");
    const ms = equityMetrics([
      { symbol: "^KS11", changePct: 2.24, at: MON },
      { symbol: "^N225", changePct: -1.0, at: MON },
      { symbol: "^TWII", changePct: 3.0, at: MON - 3 * 86400_000 }, // 휴장 — 지난 금요일 값
      { symbol: "EWY", changePct: -5.52, at: FRI_US },
    ]);
    const eq = ms.find((x) => x.indicator === "market.kr_equity_rel_pct")!;
    expect(eq.value).toBeCloseTo(3.24, 2); // 2.24 − (−1.0): 휴장한 대만은 빼고
    expect(eq.meta).toMatchObject({ peersSkipped: ["^TWII"], ewyAt: FRI_US });
    const { interpret } = await import("../src/core/interpret.js");
    const { INDICATOR_BY_ID, GROUP_LABEL, STATE_LABEL } = await import("../src/core/indicators.js");
    const d = INDICATOR_BY_ID["market.kr_equity_rel_pct"];
    const row: any = { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: "", latency: "", caveats: "", absolute: d.absolute, reading: { indicator: d.id, value: eq.value, at: MON, n: 0, state: "normal", meta: eq.meta }, stateLabel: STATE_LABEL.normal, history: [] };
    const it2 = interpret({ now: MON, threat: { level: 1, label: "평시", summary: "", lastProvocation: null } as any, board: [row], patterns: [], briefs: [] });
    expect(it2.perIndicator["market.kr_equity_rel_pct"]).toMatch(/미국 상장 한국 ETF -5\.52%\(10\/30 미국 장\)/);
    expect(it2.perIndicator["market.kr_equity_rel_pct"]).toMatch(/휴장한 곳 빼고/);
  });
});
