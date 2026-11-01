// 북한 장마당 물가 (아시아프레스 매주 조사)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nkMarketMetrics, parsePriceTable, weeklyChange } from "../src/core/collectors/nkmarket.js";
import { evaluate, INDICATOR_BY_ID } from "../src/core/indicators.js";
import { assessWarRisk } from "../src/core/warrisk.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";

const html = readFileSync(new URL("./fixtures/asiapress_prices_20261101.html", import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 1, 3);

describe("아시아프레스 물가표", () => {
  it("날짜 뒤 설명이 붙은 칸도 읽고, 날짜순으로 정렬한다", () => {
    const w = parsePriceTable(html);
    expect(w.length).toBeGreaterThan(25);
    expect(w.at(-1)).toMatchObject({ d: "2026-10-23", gas: 130000, diesel: 120000, rice: 54000, usd: 72000 });
  });
  it("실측 2026-10-23: 휘발유 직전 8주 대비 약 +88% (2017년 이후 최대 급등) → '이상'", () => {
    const w = parsePriceTable(html);
    const f = weeklyChange(w, "gas")!;
    expect(f.pct).toBeGreaterThan(80);
    const m = nkMarketMetrics(w);
    const fuel = m.find((x) => x.indicator === "nk.fuel_price_change_pct")!;
    expect(evaluate(INDICATOR_BY_ID[fuel.indicator], fuel.value, NOW, undefined).state).toBe("anomalous");
    const rice = m.find((x) => x.indicator === "nk.rice_price_change_pct")!;
    expect(rice.value).toBeGreaterThan(20);
  });
  it("10배 오타(10/9 위안 125,000원)는 걸러낸다", () => {
    const w = parsePriceTable(html);
    expect(w.find((x) => x.d === "2026-10-09")!.cny).toBe(125000);
    const c = weeklyChange(w, "cny")!;
    expect(c.value).toBe(13500); // 마지막 값은 정상, 오타가 평소값을 끌어올리지 않음
    expect(c.usual).toBeLessThan(20000);
  });
  it("판정: 연료·쌀이 함께 '이상'이어도 북한 쪽 영역은 1점(주의)까지만", () => {
    const board: BoardRow[] = INDICATORS.map((d) => {
      const state = d.id === "nk.fuel_price_change_pct" || d.id === "nk.rice_price_change_pct" ? ("anomalous" as const) : ("normal" as const);
      const reading = { indicator: d.id, at: NOW, n: 20, value: state === "anomalous" ? 90 : 0, state };
      return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[state], history: [] };
    });
    const w = assessWarRisk({ now: NOW, board, briefs: [], patterns: [] });
    const nk = w.domains.find((d) => d.id === "nkwords")!;
    expect(nk.label).toBe("북한의 말·내부 사정");
    expect(nk.level).toBe(1);
    expect(nk.drivers.join(" ")).toMatch(/1점만/);
  });
});
