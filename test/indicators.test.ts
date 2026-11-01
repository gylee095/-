import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluate, updateBaseline, slotKey, INDICATOR_BY_ID, INDICATORS, type Baseline } from "../src/core/indicators.js";
import { detectPatterns, inChineseMoratorium, inExerciseSeason } from "../src/core/patterns.js";
import { processMetrics, runCycle } from "../src/core/pipeline.js";
import { MemoryStore } from "../src/core/store.js";
import type { CollectResult, Reading } from "../src/core/types.js";
import { airMetrics, describeIsr, filterNeAsia, normalize } from "../src/core/collectors/adsb.js";
import { parseUsAdvisory, parseUkAdvice, travelSignals } from "../src/core/collectors/travel.js";
import { parseMndList, mndSignals } from "../src/core/collectors/koreakr.js";
import { parseYahooChart } from "../src/core/collectors/markets.js";
import { parseGpsjamCsv, gpsjamSignals } from "../src/core/collectors/gpsjam.js";
import { inNorthKorea, parseFirmsCsv, thermalMetrics } from "../src/core/collectors/firms.js";
import { ingest, vesselMetrics, flagOf, type VesselSample } from "../src/core/collectors/ais.js";
import { parseIodaAlerts, iodaSignals } from "../src/core/collectors/ioda.js";
import { parseSearch, alarmMetric } from "../src/core/collectors/bluesky.js";
import { newsMetrics } from "../src/core/collectors/news.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const json = (n: string) => JSON.parse(fx(n));
const NOW = Date.UTC(2026, 9, 30, 6, 0); // 15:00 KST

describe("기준선 통계", () => {
  it("표본이 적을 때는 빠르게 수렴하고, 분산이 작아도 z 가 폭발하지 않는다", () => {
    let b: Baseline | undefined;
    for (const v of [30, 32, 31, 29, 30, 31, 30, 32, 31, 30, 30, 31]) b = updateBaseline(b, v, 0.03);
    expect(b!.n).toBe(12);
    expect(b!.mean).toBeGreaterThan(29);
    expect(b!.mean).toBeLessThan(32);
    const def = INDICATOR_BY_ID["air.civil_airborne"];
    expect(evaluate(def, 30, NOW, b).state).toBe("normal");
    expect(evaluate(def, 8, NOW, b).state).toBe("anomalous"); // 급감
    expect(evaluate(def, 60, NOW, b).state).toBe("normal"); // 증가는 나쁜 방향이 아님
  });
  it("표본 부족은 학습 중, 절대 임계값 지표는 기준선 없이도 판정", () => {
    expect(evaluate(INDICATOR_BY_ID["air.civil_airborne"], 30, NOW, { mean: 30, var: 1, n: 3 }).state).toBe("learning");
    expect(evaluate(INDICATOR_BY_ID["official.us_travel_level_kr"], 3, NOW, undefined).state).toBe("anomalous");
    expect(evaluate(INDICATOR_BY_ID["official.us_travel_level_kr"], 1, NOW, undefined).state).toBe("normal");
    expect(evaluate(INDICATOR_BY_ID["gnss.bad_ratio_korea"], 0.01, NOW, undefined).state).toBe("normal");
    expect(evaluate(INDICATOR_BY_ID["gnss.bad_ratio_korea"], 7, NOW, undefined).state).toBe("anomalous");
  });
  it("시간대 구간 키", () => {
    expect(slotKey(INDICATOR_BY_ID["air.civil_airborne"], NOW)).toBe("h15");
    expect(slotKey(INDICATOR_BY_ID["air.mil_airborne"], NOW)).toBe("q2");
    expect(slotKey(INDICATOR_BY_ID["rhetoric.nk_hostile_24h"], NOW)).toBe("d");
  });
  it("카탈로그 id 중복 없음", () => {
    expect(new Set(INDICATORS.map((d) => d.id)).size).toBe(INDICATORS.length);
  });
});

describe("processMetrics: 기준선 갱신과 오염 방지", () => {
  it("이상치는 표본이 충분할 때 기준선에 반영하지 않는다", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 12; i++) await processMetrics(store, [{ indicator: "air.civil_airborne", value: 30 + (i % 3) }], NOW + i * 60_000);
    const before = JSON.parse((await store.getKv("baselines"))!)["air.civil_airborne|h15"];
    const [r] = await processMetrics(store, [{ indicator: "air.civil_airborne", value: 5 }], NOW + 13 * 60_000);
    expect(r.state).toBe("anomalous");
    const after = JSON.parse((await store.getKv("baselines"))!)["air.civil_airborne|h15"];
    expect(after.mean).toBeCloseTo(before.mean, 5);
    // 시계열 표에는 15분 간격(0분)과 상태가 바뀐 순간(10분 '학습 중→정상', 13분 '이상')만 남는다 — D1 무료 쓰기 한도 절약 (2026-11-01)
    expect((await store.getMetricHistory("air.civil_airborne", 0)).map((p) => (p.at - NOW) / 60_000)).toEqual([0, 10, 13]);
  });
});

describe("수집기 파서: 실데이터 픽스처", () => {
  it("ADS-B: 동북아 군용기·ISR 분류", () => {
    const ac = json("adsb_mil.json").ac.map(normalize);
    const ne = filterNeAsia(ac);
    expect(ne.length).toBe(3);
    const isr = describeIsr(ne);
    expect(isr.map((x) => x.type).sort()).toEqual(["C135", "P8", "R135"]);
    expect(isr.find((x) => x.type === "R135")!.what).toContain("RC-135");
    const m = airMetrics([], ne);
    expect(m.find((x) => x.indicator === "air.isr_airborne")!.value).toBe(3);
  });
  it("여행경보: 미 국무부 1단계, 영국 일상 갱신 → 신호 없음 / 3단계 → 공식 신호", () => {
    const us = parseUsAdvisory(fx("travel_state.xml"))!;
    expect(us.level).toBe(1);
    expect(us.title).toContain("South Korea");
    const uk = parseUkAdvice('<feed><entry><updated>2026-05-14T11:06:39+01:00</updated><summary type="xhtml"><div><p>Updated information about submitting e-Arrivals cards</p></div></summary></entry></feed>');
    expect(uk.securityFlag).toBe(false);
    expect(travelSignals(us, 1, uk, NOW)).toHaveLength(0);
    const s = travelSignals({ ...us, level: 3 }, 1, uk, NOW);
    expect(s).toHaveLength(1);
    expect(s[0].sourceKind).toBe("official");
    expect(s[0].severity).toBeGreaterThanOrEqual(75);
    expect(travelSignals({ ...us, level: 2 }, 1, uk, NOW)[0].title).toContain("1→2단계");
  });
  it("국방부 보도자료: 목록·날짜 파싱, 훈련·회담 제목은 신호 아님", () => {
    const items = parseMndList(fx("koreakr_mnd.html"));
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].title).toContain("아세안");
    expect(items[0].dept).toBe("국방부");
    expect(new Date(items[0].date! + 9 * 3600_000).toISOString().slice(0, 10)).toBe("2026-10-29");
    const { signals, metrics } = mndSignals(items, Date.UTC(2026, 9, 29, 12));
    expect(signals).toHaveLength(0);
    expect(metrics.find((m) => m.indicator === "official.mnd_releases_24h")!.value).toBeGreaterThan(0);
    const fake = mndSignals([{ newsId: "1", title: "북한 탄도미사일 발사 관련 국방부 입장", date: NOW - 3600_000, url: "u" }], NOW);
    expect(fake.signals[0].sourceKind).toBe("official");
    expect(fake.signals[0].category).toBe("missile");
  });
  it("환율: 변동률 계산", () => {
    const q = parseYahooChart(json("yahoo_krw.json"));
    expect(q.price).toBeGreaterThan(1000);
    expect(Math.abs(q.changePct)).toBeLessThan(3);
  });
  it("GPSJam: 한반도 셀 집계와 임계값", () => {
    const s = parseGpsjamCsv(fx("gpsjam.csv"), "2026-10-29");
    expect(s.regions.korea.cells).toBeGreaterThan(10);
    expect(s.regions.korea.badRatioPct).toBeLessThan(5);
    const { signals, metrics } = gpsjamSignals(s, NOW);
    expect(signals).toHaveLength(0);
    expect(metrics.map((m) => m.indicator)).toContain("gnss.bad_ratio_westsea");
    const bad = { ...s, regions: { ...s.regions, westsea: { good: 800, bad: 200, cells: 20, badRatioPct: 20 } } };
    expect(gpsjamSignals(bad, NOW).signals[0].category).toBe("gps_interference");
  });
  it("FIRMS: 열점 파싱과 시설 인접 판정", () => {
    const hot = parseFirmsCsv(fx("firms_nk.csv"));
    expect(hot.length).toBeGreaterThan(10);
    expect(hot[0].acqTime).toBeGreaterThan(Date.UTC(2026, 9, 28));
    const m = thermalMetrics(hot);
    expect(m[0].indicator).toBe("thermal.nk_fires_24h");
    // 상자 안 열점 중 북한 경계 안만 센다 (중국 동북부·한국 수도권 제외)
    expect(m[0].value).toBe(hot.filter((h) => inNorthKorea(h.lat, h.lon)).length);
    expect(m[0].value).toBeLessThan(hot.length);
    expect((m[0].meta as any).boxTotal).toBe(hot.length);
    const near = parseFirmsCsv("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n39.68,124.72,340,0.4,0.4,2026-10-29,1700,N,nominal,2.0NRT,290,12.5,N\n");
    expect(near[0].nearSite?.name).toContain("동창리");
  });
  it("FIRMS: 북한 경계 판정 — 평양·신의주·개성·라선 안, 단둥·훈춘·연길·서울·철원·속초 밖", () => {
    const inside: [number, number][] = [[39.03, 125.75], [40.08, 124.42], [37.97, 126.55], [42.25, 130.3], [41.8, 129.78], [41.39, 128.18], [38.04, 125.72]];
    const outside: [number, number][] = [[40.13, 124.38], [42.87, 130.37], [42.89, 129.51], [37.57, 126.98], [38.15, 127.31], [38.2, 128.59], [37.75, 128.9]];
    for (const [lat, lon] of inside) expect(inNorthKorea(lat, lon)).toBe(true);
    for (const [lat, lon] of outside) expect(inNorthKorea(lat, lon)).toBe(false);
  });
  it("AIS: 국적 판별과 집계", () => {
    expect(flagOf(412345678)).toBe("CN");
    expect(flagOf("440123456")).toBe("KR");
    expect(flagOf(445000001)).toBe("KP");
    const sample: VesselSample = { vessels: new Map(), messages: 0 };
    ingest(sample, { MetaData: { MMSI: 412345678, latitude: 36.1, longitude: 124.2 }, Message: { PositionReport: { UserID: 412345678, Latitude: 36.1, Longitude: 124.2 } } });
    ingest(sample, { MetaData: { MMSI: 412345678 }, Message: { PositionReport: { Latitude: 36.2, Longitude: 124.3 } } });
    ingest(sample, { MetaData: { MMSI: 440999999 }, Message: { ShipStaticData: { UserID: 440999999, Type: 30 } } });
    const m = vesselMetrics(sample);
    expect(m.find((x) => x.indicator === "sea.ys_vessels_total")!.value).toBe(2);
    expect(m.find((x) => x.indicator === "sea.ys_china_vessels")!.value).toBe(1); // 표본 도우미는 국적별 값을 그대로 낸다(수집기는 총수만 사용)
  });
  it("IODA·Bluesky 응답 파싱", () => {
    const alerts = parseIodaAlerts({ data: [{ time: 1793300000, datasource: "bgp", level: "critical" }, { time: 1793301000, datasource: "ping-slash24", level: "critical" }] });
    const { signals, metrics } = iodaSignals(alerts, 1793302000 * 1000);
    expect(metrics[0].value).toBe(2);
    expect(signals).toHaveLength(1);
    const posts = parseSearch({ posts: [{ uri: "at://1", record: { text: "사이렌 울린다", createdAt: new Date(NOW - 10 * 60_000).toISOString() }, author: { handle: "a.bsky.social" } }, { uri: "at://2", record: { text: "옛날 글", createdAt: new Date(NOW - 5 * 3600_000).toISOString() }, author: { handle: "b" } }] });
    expect(alarmMetric(posts, NOW).value).toBe(1);
  });
  it("뉴스 템포·북한 수사 지표", () => {
    const items = [
      { title: "[속보] 합참 \"북한, 동해상으로 탄도미사일 발사\"", pubDate: NOW - 10 * 60_000 },
      { title: "김여정 담화 \"한국은 적대국…핵무력으로 응징\"", pubDate: NOW - 5 * 3600_000 },
      { title: "北 외무성 대변인, 한미훈련 비난 성명", pubDate: NOW - 20 * 3600_000 },
      { title: "오늘의 날씨", pubDate: NOW - 60_000 },
    ];
    const m = Object.fromEntries(newsMetrics(items, NOW, "rss_breaking").map((x) => [x.indicator, x.value]));
    expect(m["media.breaking_nk_1h"]).toBe(1);
    expect(m["rhetoric.nk_statements_24h"]).toBe(2);
    expect(m["rhetoric.nk_hostile_24h"]).toBe(1);
    expect(newsMetrics(items, NOW, "rss_news")).toHaveLength(0);
  });
});

describe("패턴 탐지", () => {
  const rd = (indicator: string, value: number, state: Reading["state"], baseline?: number, meta?: any): Reading => ({ indicator, value, at: NOW, n: 20, state, baseline, z: state === "anomalous" ? 3.5 : state === "elevated" ? 2.3 : 0, meta });
  it("단일 징후만으로는 high 가 되지 않는다", () => {
    const p = detectPatterns({ "air.civil_airborne": rd("air.civil_airborne", 5, "anomalous", 30) }, [], NOW);
    const ar = p.find((x) => x.id === "airspace_restriction")!;
    expect(ar).toBeTruthy();
    expect(ar.confidence).toBe("low");
    expect(ar.alternatives.join(" ")).toMatch(/기상|수신기/);
  });
  it("발사 예고 + 정찰기 급증 + 적대 수사 → 발사 준비 패턴 high (10월, 훈련철 아님)", () => {
    expect(inExerciseSeason(NOW)).toBe(false);
    const p = detectPatterns({
      "navwarn.launch_notice_active": rd("navwarn.launch_notice_active", 1, "anomalous"),
      "air.isr_airborne": rd("air.isr_airborne", 6, "anomalous", 1),
      "rhetoric.nk_hostile_24h": rd("rhetoric.nk_hostile_24h", 9, "anomalous", 2),
    }, [], NOW);
    const lp = p.find((x) => x.id === "launch_prep")!;
    expect(lp.confidence).toBe("high");
    expect(lp.checks.some((c) => c.includes("check_military_aircraft"))).toBe(true);
    expect(p.find((x) => x.id === "multi_domain")).toBeTruthy(); // 3개 영역 동시 이상
  });
  it("중국 휴어기에는 중국 어선 감소 가중치가 줄어든다", () => {
    const june = Date.UTC(2026, 5, 15, 3);
    expect(inChineseMoratorium(june)).toBe(true);
    expect(inChineseMoratorium(NOW)).toBe(false);
    const mk = (now: number) => detectPatterns({ "sea.gfw_cn_change_pct": { ...rd("sea.gfw_cn_change_pct", -60, "anomalous"), at: now } }, [], now).find((x) => x.id === "west_sea_clash");
    expect(mk(NOW)!.score).toBeGreaterThan(mk(june)?.score ?? 0);
  });
  it("미 여행경보 3단계는 단독으로도 medium 이상 점수", () => {
    const p = detectPatterns({ "official.us_travel_level_kr": rd("official.us_travel_level_kr", 3, "anomalous") }, [], NOW);
    const w = p.find((x) => x.id === "western_posture")!;
    expect(w.score).toBeGreaterThanOrEqual(70);
  });
});

describe("사이클: 관측값 → 징후판 → 패턴 알림 (6시간 1회)", () => {
  it("패턴 medium 이상이면 푸시 1회, 반복 사이클에서는 억제", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(String((init.headers as any)?.Title ?? url));
      return new Response("ok");
    }) as unknown as typeof fetch;
    const collect = async (): Promise<CollectResult[]> => [
      { source: "nga_msi", ok: true, fetchedAt: NOW, rawCount: 1, signals: [], metrics: [{ indicator: "navwarn.launch_notice_active", value: 1 }] },
      { source: "adsb_lol", ok: true, fetchedAt: NOW, rawCount: 1, signals: [], metrics: [{ indicator: "air.isr_airborne", value: 6, meta: { aircraft: [] } }] },
    ];
    const r1 = await runCycle({ NTFY_TOPIC: "t" }, store, { now: NOW, collect, fetchImpl: f });
    expect(r1.patterns.find((p) => p.id === "launch_prep")!.confidence).toMatch(/medium|high/);
    expect(r1.alerts.filter((a) => a.kind === "pattern")).toHaveLength(1);
    const r2 = await runCycle({ NTFY_TOPIC: "t" }, store, { now: NOW + 5 * 60_000, collect, fetchImpl: f });
    expect(r2.alerts.filter((a) => a.kind === "pattern")).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});
