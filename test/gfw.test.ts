import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gfwMetrics, gfwRequest, parseGfwReport, summarizeGfw, type GfwRow } from "../src/core/collectors/gfw.js";
import { evaluate, INDICATOR_BY_ID } from "../src/core/indicators.js";

const json = JSON.parse(readFileSync(new URL("./fixtures/gfw_presence_cn_drop.json", import.meta.url), "utf8"));
const NOW = Date.UTC(2026, 9, 31, 3);

/** 일별 행을 만드는 도우미: cn(i), kr(i) */
function rowsOf(days: number, cn: (i: number) => number, kr: (i: number) => number): GfwRow[] {
  const out: GfwRow[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10);
    out.push({ date, flag: "CHN", hours: cn(i), vessels: Math.round(cn(i) / 9) });
    out.push({ date, flag: "KOR", hours: kr(i), vessels: Math.round(kr(i) / 8) });
  }
  return out;
}

describe("Global Fishing Watch 서해 중국 선박", () => {
  it("요청: 위성 AIS presence, 일별, 국적별, 공간 합산, FeatureCollection 본문", () => {
    const { url, init } = gfwRequest("tok", NOW);
    const u = new URL(url);
    expect(u.pathname).toBe("/v3/4wings/report");
    expect(u.searchParams.get("datasets[0]")).toBe("public-global-presence:latest");
    expect(u.searchParams.get("group-by")).toBe("FLAG");
    expect(u.searchParams.get("temporal-resolution")).toBe("DAILY");
    expect(u.searchParams.get("spatial-aggregation")).toBe("true");
    expect(u.searchParams.get("date-range")).toBe("2026-10-10,2026-10-31");
    expect((init.headers as any).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.geojson.type).toBe("FeatureCollection");
    expect(body.geojson.features[0].geometry.coordinates[0][0]).toEqual([122.9, 34.0]);
  });

  it("응답 파싱: 데이터셋 키 아래 행들, 격자 단위로 와도 날짜·국적별로 합산", () => {
    const rows = parseGfwReport(json);
    expect(rows.filter((r) => r.flag === "CHN")).toHaveLength(21);
    const gridded = parseGfwReport({ entries: [{ "public-global-presence:v3.0": [
      { date: "2026-10-05", flag: "CHN", hours: 10, vesselIDs: 2, lat: 35.1, lon: 123.1 },
      { date: "2026-10-05", flag: "CHN", hours: 5, vesselIDs: 1, lat: 35.2, lon: 123.1 },
    ] }] });
    expect(gridded).toEqual([{ date: "2026-10-05", flag: "CHN", hours: 15, vessels: 3 }]);
  });

  it("중국 선박만 55% 감소 → 지표 '이상'(감소폭 기준)", () => {
    const s = summarizeGfw(parseGfwReport(json))!;
    expect(s.changePct).toBeLessThan(-50);
    expect(s.recentDates).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
    const [m] = gfwMetrics(s, NOW);
    expect(m.indicator).toBe("sea.gfw_cn_change_pct");
    const r = evaluate(INDICATOR_BY_ID["sea.gfw_cn_change_pct"], m.value, NOW, undefined, m.meta);
    expect(r.state).toBe("anomalous");
    expect((m.meta as any).delayDays).toBe(6);
  });

  it("증가는 위기 신호가 아니다 (방향 인지형 임계값)", () => {
    const s = summarizeGfw(rowsOf(21, (i) => (i >= 18 ? 4000 : 2400), () => 600))!;
    expect(s.changePct).toBeGreaterThan(50);
    const r = evaluate(INDICATOR_BY_ID["sea.gfw_cn_change_pct"], s.changePct, NOW, undefined);
    expect(r.state).toBe("normal");
  });

  it("마지막 날 전 국적이 함께 급감 = 처리 미완료로 보고 제외", () => {
    const s = summarizeGfw(rowsOf(21, (i) => (i === 20 ? 300 : 2400), (i) => (i === 20 ? 80 : 600)))!;
    expect(s.droppedIncomplete).toEqual(["2026-10-25"]);
    expect(Math.abs(s.changePct)).toBeLessThan(10);
  });

  it("데이터가 너무 짧으면 판정하지 않는다", () => {
    expect(summarizeGfw(rowsOf(4, () => 2400, () => 600))).toBeUndefined();
  });
});
