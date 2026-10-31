import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { flowMetrics, parseEcos, summarizeFlow } from "../src/core/collectors/ecos.js";
import { jetMetric, koreanBizjets, updateJetDay, type Aircraft } from "../src/core/collectors/adsb.js";
import { evaluate, INDICATOR_BY_ID } from "../src/core/indicators.js";

const NOW = Date.UTC(2026, 9, 31, 3);
const fx = JSON.parse(readFileSync(new URL("./fixtures/ecos_foreign_net_kospi.json", import.meta.url), "utf8"));

describe("외국인 순매수 (한국은행 ECOS 802Y001)", () => {
  it("응답 형식: 날짜순 정렬, 억원 단위 숫자", () => {
    const days = parseEcos(fx);
    expect(days.at(-1)).toEqual({ date: "20261030", value: -16256 });
    expect(days.at(-2)).toEqual({ date: "20261029", value: 6600 }); // 미사일 발사 당일엔 순매수
    expect(days[0].date < days.at(-1)!.date).toBe(true);
  });
  it("데이터 없음 응답은 오류로 알린다", () => {
    expect(() => parseEcos({ RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } })).toThrow(/INFO-200/);
  });
  it("최근 5거래일 합계를 직전 120거래일 분포와 비교 — 실측 10/26~30 합계 −2,802억 은 평소 범위", () => {
    const s = summarizeFlow(parseEcos(fx))!;
    expect(s.net5d).toBe(-6526 + 5599 + 7781 + 6600 - 16256);
    expect(s.z).toBeGreaterThan(-2);
    const [m] = flowMetrics(s, parseEcos(fx));
    expect(m.indicator).toBe("elite.foreign_net_kospi");
    expect(evaluate(INDICATOR_BY_ID["elite.foreign_net_kospi"], m.value, NOW, undefined).state).toBe("normal");
  });
  it("5일 동안 매일 2조씩 팔면 '이상'", () => {
    const days = parseEcos(fx).slice(0, -5).concat(["20261026", "20261027", "20261028", "20261029", "20261030"].map((date) => ({ date, value: -20000 })));
    const s = summarizeFlow(days)!;
    expect(s.z).toBeLessThan(-3);
    expect(s.rankPct).toBe(0);
    expect(evaluate(INDICATOR_BY_ID["elite.foreign_net_kospi"], s.z, NOW, undefined).state).toBe("anomalous");
  });
});

describe("한국 기업 제트기 출국 (대수만, 개인 식별 없음)", () => {
  const ac = (o: Partial<Aircraft>): Aircraft => ({ icao24: "71c001", callsign: "", onGround: false, military: false, registration: "HL8001", type: "GLEX", lat: 37.5, lon: 126.8, altitudeFt: 8000, vertRate: 2000, ...o });
  it("한국 등록 업무용 제트기만: 낮게 상승 중이면 출국, 하강 중이면 도착, 높이 떠 있으면 순항", () => {
    const r = koreanBizjets([
      ac({ icao24: "a" }),
      ac({ icao24: "b", vertRate: -1500 }),
      ac({ icao24: "c", altitudeFt: 41000, vertRate: 0 }),
      ac({ icao24: "d", registration: "JA001G" }), // 일본 등록 — 제외
      ac({ icao24: "e", type: "A321" }), // 여객기 — 제외
      ac({ icao24: "f", onGround: true }), // 지상 — 제외
    ]);
    expect(r.map((x) => x.phase)).toEqual(["d", "a", "c"]);
    expect(r[0].hash).not.toBe("a"); // 기체 번호를 그대로 저장하지 않는다(해시)
  });
  it("같은 기체는 그날 처음 본 상태로 한 번만 센다", () => {
    let day = updateJetDay({ first: {} }, [{ hash: "x", phase: "d" }]);
    day = updateJetDay(day, [{ hash: "x", phase: "c" }, { hash: "y", phase: "a" }]);
    expect(day.first).toEqual({ x: "d", y: "a" });
  });
  it("1주일 이상 쌓여야 판단하고, 4대 미만 차이는 '상승'으로 보지 않는다", () => {
    const dep = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(10 + i).padStart(2, "0")}`, 2]));
    expect(jetMetric({ dep: { ...dep(5), "2026-10-30": 9 } }, NOW)).toBeUndefined();
    const big = jetMetric({ dep: { ...dep(14), "2026-10-30": 9, "2026-10-31": 1 } }, NOW)!;
    expect(big).toMatchObject({ indicator: "elite.kr_bizjets", value: 450 });
    expect((big.meta as any).todaySoFar).toBe(1);
    expect(evaluate(INDICATOR_BY_ID["elite.kr_bizjets"], big.value, NOW, undefined).state).toBe("anomalous");
    const small = jetMetric({ dep: { ...dep(14), "2026-10-30": 3 } }, NOW)!;
    expect(small.value).toBeLessThanOrEqual(199);
  });
});
