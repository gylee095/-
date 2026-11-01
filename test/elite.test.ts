import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { flowMetrics, parseEcos, summarizeFlow } from "../src/core/collectors/ecos.js";
import { jetMetric, koreanBizjets, updateJetDay, type Aircraft } from "../src/core/collectors/adsb.js";
import { evaluate, INDICATOR_BY_ID, INDICATORS, GROUP_LABEL, STATE_LABEL } from "../src/core/indicators.js";
import { assessWarRisk } from "../src/core/warrisk.js";
import type { BoardRow } from "../src/core/state.js";

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
    // 1주일이 안 되면 판정하지 않고 '학습 중 (n/8일)'로 낸다 (예전엔 아예 '측정 불가')
    const early = jetMetric({ dep: { ...dep(5), "2026-10-30": 9 } }, NOW)!;
    expect(early.meta).toMatchObject({ learning: true, learningDays: 6, need: 8, departures: 9 });
    const big = jetMetric({ dep: { ...dep(14), "2026-10-30": 9, "2026-10-31": 1 } }, NOW)!;
    expect(big).toMatchObject({ indicator: "elite.kr_bizjets", value: 450 });
    expect((big.meta as any).todaySoFar).toBe(1);
    expect(evaluate(INDICATOR_BY_ID["elite.kr_bizjets"], big.value, NOW, undefined).state).toBe("anomalous");
    const small = jetMetric({ dep: { ...dep(14), "2026-10-30": 3 } }, NOW)!;
    expect(small.value).toBeLessThanOrEqual(199);
  });
});

describe("ECOS 인증키는 오류 문구에 남지 않는다", () => {
  it("주소 경로에 든 키를 가린다 (원문·URL 인코딩 모두)", async () => {
    const { redactKey } = await import("../src/core/collectors/ecos.js");
    const key = "ABC/DEF+123";
    const msg = `HTTP 500 https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/400/802Y001: x ${key}`;
    const r = redactKey(msg, key);
    expect(r).not.toContain(key);
    expect(r).not.toContain(encodeURIComponent(key));
    expect(r).toContain("StatisticSearch/***/json");
  });
  it("수집 실패 오류에도 키가 없다", async () => {
    const { collectEcos } = await import("../src/core/collectors/ecos.js");
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response("server error", { status: 500 })) as unknown as typeof fetch;
    try {
      await expect(collectEcos("SECRETKEY123", NOW)).rejects.toThrow(/StatisticSearch\/\*\*\*\/json/);
      await collectEcos("SECRETKEY123", NOW).catch((e) => expect(String(e.message)).not.toContain("SECRETKEY123"));
    } finally {
      globalThis.fetch = real;
    }
  });
  it("긴 기간 자료는 1만 행씩 나눠 받아 합친다", async () => {
    const { ecosSeries } = await import("../src/core/collectors/ecos.js");
    const real = globalThis.fetch;
    const seen: string[] = [];
    const mk = (n0: number, n: number, total: number) => ({ StatisticSearch: { list_total_count: total, row: Array.from({ length: n }, (_, i) => ({ TIME: String(20030101 + n0 + i), DATA_VALUE: String(i) })) } });
    globalThis.fetch = (async (u: string) => {
      seen.push(u.replace(/StatisticSearch\/[^/]+\//, "StatisticSearch/K/"));
      return new Response(JSON.stringify(u.includes("/1/10000/") ? mk(0, 10000, 10005) : mk(10000, 5, 10005)), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const rows = await ecosSeries("K", "802Y001", "0030000", "20030101", "20261031");
      expect(rows.length).toBe(10005);
      expect(seen).toEqual([
        "https://ecos.bok.or.kr/api/StatisticSearch/K/json/kr/1/10000/802Y001/D/20030101/20261031/0030000",
        "https://ecos.bok.or.kr/api/StatisticSearch/K/json/kr/10001/20000/802Y001/D/20030101/20261031/0030000",
      ]);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("백테스트 실측 사례 (2003~2026 한국은행 자료, docs/INDICATORS.md 0.1)", () => {
  const load = (f: string) => parseEcos(JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`, import.meta.url), "utf8")));
  const boardWith = (id: string, value: number, at: number): BoardRow[] =>
    INDICATORS.map((d) => {
      const state = d.id === id ? evaluate(INDICATOR_BY_ID[id], value, at, undefined).state : "normal";
      const reading = { indicator: d.id, at, n: 20, value: d.id === id ? value : 0, state, meta: {} };
      return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[state], history: [] };
    });
  it("운영 함수가 백테스트 표와 같은 값을 낸다: 2017-07-28(화성-14 2차 시험 직전) 5일 −1조6,307억, z −3.74", () => {
    const s = summarizeFlow(load("ecos_foreign_net_kospi_2017jul"))!;
    expect(s.date).toBe("20170728");
    expect(s.net5d).toBe(-16307);
    expect(s.z).toBe(-3.74);
  });
  it("2020-03-19 코로나 폭락기 매도(z −3.18, '이상') + 같은 달 북한 단거리 미사일 → 엘리트 '주의', 2단계 — 위기로 오판하지 않는다", () => {
    const s = summarizeFlow(load("ecos_foreign_net_kospi_2020q1"))!;
    expect(s.z).toBeLessThan(-3);
    const at = Date.UTC(2020, 2, 19, 7);
    const w = assessWarRisk({
      now: at,
      board: boardWith("elite.foreign_net_kospi", s.z, at),
      briefs: [{ headline: "북한, 단거리 탄도미사일 발사 → 동해", isProvocation: true, danger: { level: 3, label: "경계", reason: "탄도미사일 발사" }, at: at - 3 * 86400_000 }],
      patterns: [],
    });
    expect(w.domains.find((d) => d.id === "elite")!.level).toBe(1);
    expect(w.phase).toBe(2);
  });
});

describe("군용기 두 수신망 합치기", () => {
  it("같은 기체(hex)는 한 번만 센다", async () => {
    const { mergeAircraft } = await import("../src/core/collectors/adsb.js");
    const a = { icao24: "ae1234", type: "RC135" } as any;
    const b = { icao24: "ae5678", type: "KC135" } as any;
    expect(mergeAircraft([[a], [a, b]]).map((x) => x.icao24)).toEqual(["ae1234", "ae5678"]);
  });
});
