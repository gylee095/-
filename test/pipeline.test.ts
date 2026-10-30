import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseUsgs, parseEmsc } from "../src/core/collectors/seismic.js";
import { parseSafetyData } from "../src/core/collectors/safetydata.js";
import { parseNga } from "../src/core/collectors/nga.js";
import { parseRss } from "../src/core/collectors/news.js";
import { airspaceAnomaly, parseOpenSky } from "../src/core/collectors/opensky.js";
import { classifyText } from "../src/core/classify.js";
import { correlate } from "../src/core/correlate.js";
import { decideAlerts, posture } from "../src/core/policy.js";
import { runCycle, latencyMetrics } from "../src/core/pipeline.js";
import { MemoryStore } from "../src/core/store.js";
import type { CollectResult, Signal } from "../src/core/types.js";
import { collectRss } from "../src/core/collectors/news.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const json = (n: string) => JSON.parse(fx(n));

const T_MISSILE_ALERT = Date.UTC(2026, 10, 2, 10, 41, 10); // 19:41:10 KST
const T_QUAKE = Date.UTC(2026, 10, 3, 10, 0, 0);

function result(source: string, signals: Signal[]): CollectResult {
  return { source, ok: true, signals, fetchedAt: Date.now(), rawCount: signals.length };
}

/** 푸시 호출을 기록하는 가짜 fetch */
function fakeFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const env = { NTFY_TOPIC: "kew-test", DASHBOARD_URL: "https://kew.example.workers.dev" };

describe("분류기 (오탐 억제)", () => {
  it("공습/경계경보를 최우선 분류", () => {
    expect(classifyText("[행정안전부] 경계경보 발령 대피할 준비")?.category).toBe("air_raid_alert");
    expect(classifyText("공습경보 발령")?.severity).toBe(95);
  });
  it("훈련 문자는 drill 로 표시하고 심각도를 낮춤", () => {
    const c = classifyText("지금은 민방위 훈련 상황입니다. 공습경보 발령")!;
    expect(c.drill).toBe(true);
    expect(c.severity).toBeLessThan(30);
  });
  it("오발령 정정은 retraction", () => {
    expect(classifyText("경계경보는 오발령 사항임을 알려드림")?.retraction).toBe(true);
  });
  it("군사와 무관한 재난문자는 무시", () => {
    expect(classifyText("서울 호우주의보 발효")).toBeNull();
  });
});

describe("수집기 파서", () => {
  it("USGS: 풍계리 얕은 M5.1만 핵실험 의심, 심발·소규모 지진은 제외", () => {
    const s = parseUsgs(json("usgs.json"), T_QUAKE + 20 * 60_000);
    expect(s).toHaveLength(1);
    expect(s[0].category).toBe("nuclear_test");
    expect(s[0].eventTime).toBe(T_QUAKE);
    expect(s[0].publishedTime).toBeUndefined(); // 원천이 공개 시각을 주지 않음을 명시
  });
  it("재난문자: 지역별 중복 발송 2건 + 호우(무시) + 훈련", () => {
    const s = parseSafetyData(json("safetydata.json"), T_MISSILE_ALERT + 60_000);
    expect(s).toHaveLength(3);
    expect(s[0].eventTime).toBe(T_MISSILE_ALERT);
    expect(s.find((x) => x.drill)).toBeTruthy();
  });
  it("NGA: 한반도 주변 경보만, 북한 발사 예고는 가중", () => {
    const s = parseNga(json("nga.json")["broadcast-warn"], Date.UTC(2026, 10, 2, 12));
    expect(s.map((x) => x.category).sort()).toEqual(["gps_interference", "launch_notice", "launch_notice"]);
    const launch = s.find((x) => x.raw && (x.raw as any).authority === "DPRK")!;
    expect(launch.severity).toBe(65);
    expect(launch.lat).toBeCloseTo(37.1667, 3);
    expect(launch.publishedTime).toBe(Date.UTC(2026, 10, 2, 10, 3));
  });
  it("RSS: 관련 없는 기사 제외", () => {
    expect(parseRss(fx("news.xml"))).toHaveLength(3);
  });
  it("OpenSky: 비상 스쿼크 감지, 지상 항공기 무시", () => {
    const st = [
      ["71c123", "KAL123 ", "Republic of Korea", 0, 1793700000, 127.1, 37.4, 9000, false, 230, 0, 0, null, 9100, "7700", false, 0],
      ["71c124", "AAR1", "Republic of Korea", 0, 1793700000, 126.4, 37.4, 0, true, 0, 0, 0, null, 0, "7700", false, 0],
    ];
    expect(parseOpenSky(st, 1793700000000, 1793700010000)).toHaveLength(1);
  });
  it("공역 이상: 기준선 대비 급감만 감지, 기준선 부족 시 무시", () => {
    expect(airspaceAnomaly(10, 80, Date.now())).not.toBeNull();
    expect(airspaceAnomaly(60, 80, Date.now())).toBeNull();
    expect(airspaceAnomaly(1, 10, Date.now())).toBeNull();
  });
});

describe("교차검증과 사건 상태", () => {
  it("USGS+EMSC 동시 탐지 → CORROBORATED 단일 사건", () => {
    const now = T_QUAKE + 20 * 60_000;
    const ev = correlate([...parseUsgs(json("usgs.json"), now), ...parseEmsc(json("emsc.json"), now)]);
    expect(ev).toHaveLength(1);
    expect(ev[0].status).toBe("CORROBORATED");
    expect(ev[0].sources.sort()).toEqual(["emsc", "usgs"]);
  });
  it("재난문자(공식) → CONFIRMED, 지역별 중복은 한 사건", () => {
    const sigs = parseSafetyData(json("safetydata.json").slice(0, 2), T_MISSILE_ALERT + 60_000);
    const ev = correlate(sigs);
    expect(ev).toHaveLength(1);
    expect(ev[0].status).toBe("CONFIRMED");
  });
  it("언론 보도만 있는 사건은 UNVERIFIED 이고 알림 대상 아님", () => {
    const now = Date.UTC(2026, 10, 2, 11);
    const media: Signal[] = parseRss(fx("news.xml")).map((it, i) => ({
      id: `m${i}`, source: "rss_news", sourceKind: "media", category: "missile", title: it.title, summary: "",
      publishedTime: it.pubDate, detectedTime: now, severity: 20,
    }));
    const ev = correlate(media.slice(0, 1));
    expect(ev[0].status).toBe("UNVERIFIED");
    expect(decideAlerts(ev, [], now).send).toHaveLength(0);
  });
});

describe("엔드투엔드 사이클: 탐지 → 알림 → 중복 억제 → 정정", () => {
  it("공식 경계경보는 1회만 알림, 재실행 시 억제, 오발령 정정 시 정정 알림", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeFetch();
    const sd = json("safetydata.json");
    const t1 = T_MISSILE_ALERT + 60_000;

    const r1 = await runCycle(env, store, { now: t1, fetchImpl: f, collect: async () => [result("safetydata", parseSafetyData(sd, t1))] });
    expect(r1.alerts).toHaveLength(1);
    expect(r1.alerts[0].title).toContain("[공식확인]");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ntfy.sh/kew-test");
    expect((calls[0].init.headers as any).Priority).toBe("5");
    // 훈련 문자는 억제 사유와 함께 남는다
    expect(r1.suppressed.some((s) => s.reason === "훈련 발령")).toBe(true);

    // 같은 데이터로 재실행 → 추가 알림 없음
    const t2 = t1 + 5 * 60_000;
    const r2 = await runCycle(env, store, { now: t2, fetchImpl: f, collect: async () => [result("safetydata", parseSafetyData(sd, t2))] });
    expect(r2.alerts).toHaveLength(0);
    expect(r2.newSignals).toBe(0);
    expect(calls).toHaveLength(1);

    // 언론 보도가 나중에 붙으면 리드타임이 계산된다
    const t3 = t1 + 10 * 60_000;
    const news: Signal = {
      id: "rss_news:x", source: "rss_news", sourceKind: "media", category: "missile",
      title: '[속보] 합참 "북한, 동해상으로 탄도미사일 발사"', summary: "", publishedTime: Date.UTC(2026, 10, 2, 10, 48),
      detectedTime: t3, severity: 20,
    };
    const r3 = await runCycle(env, store, { now: t3, fetchImpl: f, collect: async () => [result("rss_news", [news])] });
    expect(r3.alerts).toHaveLength(0);
    const m = latencyMetrics(await store.getEvents(0));
    expect(m.alertedEvents).toBe(1);
    expect(m.beatMediaCount).toBe(1);
    expect(m.rows[0].leadVsMediaMin).toBeCloseTo(6, 0);

    // 오발령 정정 → 정정 알림 1회
    const t4 = t1 + 25 * 60_000;
    const rr = parseSafetyData(json("safetydata_retraction.json"), t4);
    const r4 = await runCycle(env, store, { now: t4, fetchImpl: f, collect: async () => [result("safetydata", rr)] });
    expect(r4.alerts.map((a) => a.kind)).toEqual(["correction"]);
    const r5 = await runCycle(env, store, { now: t4 + 60_000, fetchImpl: f, collect: async () => [] });
    expect(r5.alerts).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it("단일 센서 미확인 신호(심각도 75)는 알림하지 않고, 두 번째 독립 출처가 붙으면 알림", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeFetch();
    const now = T_QUAKE + 15 * 60_000;
    // 풍계리 M4.0 → 심각도 75, 단일 출처
    const usgs = parseUsgs(json("usgs.json"), now).map((s) => ({ ...s, severity: 75 }));
    const r1 = await runCycle(env, store, { now, fetchImpl: f, collect: async () => [result("usgs", usgs)] });
    expect(r1.alerts).toHaveLength(0);
    expect(r1.suppressed[0].reason).toMatch(/UNVERIFIED/);

    const later = now + 10 * 60_000;
    const r2 = await runCycle(env, store, { now: later, fetchImpl: f, collect: async () => [result("emsc", parseEmsc(json("emsc.json"), later))] });
    expect(r2.alerts).toHaveLength(1);
    expect(r2.alerts[0].title).toContain("[교차확인]");
    expect(calls).toHaveLength(1);
  });

  it("시간당 알림 한도", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeFetch();
    const now = Date.UTC(2026, 10, 2, 12);
    const many: Signal[] = Array.from({ length: 8 }, (_, i) => ({
      id: `safetydata:${i}`, source: "safetydata", sourceKind: "official", category: "artillery",
      title: `포격 ${i}`, summary: "", lat: 37 + i, lon: 125 + i,
      // 사건들이 서로 클러스터링되지 않도록 시간 간격을 4시간씩 둔다
      eventTime: now - i * 4 * 3600_000, detectedTime: now, severity: 80,
    }));
    const r = await runCycle(env, store, { now, fetchImpl: f, collect: async () => [result("safetydata", many)] });
    expect(r.alerts).toHaveLength(5);
    expect(r.suppressed.filter((s) => s.reason === "시간당 알림 한도 초과")).toHaveLength(3);
    expect(calls).toHaveLength(5);
  });

  it("수집기 실패가 사이클 전체를 멈추지 않음", async () => {
    const store = new MemoryStore();
    const r = await runCycle(env, store, {
      now: Date.now(), dryRun: true,
      collect: async () => [{ source: "usgs", ok: false, error: "HTTP 503", signals: [], fetchedAt: Date.now(), rawCount: 0 }],
    });
    expect(r.sources[0].ok).toBe(false);
    expect((await store.getHealth())[0].error).toBe("HTTP 503");
  });
});

describe("정세 수준은 단일 이상으로 전쟁 임박을 판단하지 않음", () => {
  it("단일 영역 → 2단계, 공식 공습경보 → 5단계", () => {
    const now = T_QUAKE + 20 * 60_000;
    const quake = correlate([...parseUsgs(json("usgs.json"), now), ...parseEmsc(json("emsc.json"), now)]);
    expect(posture(quake, now).level).toBe(2);
    const raid = correlate([{ id: "s", source: "safetydata", sourceKind: "official", category: "air_raid_alert", title: "공습경보", summary: "", detectedTime: now, eventTime: now, severity: 95 }]);
    expect(posture([...quake, ...raid], now).level).toBe(5);
  });
});

describe("RSS 수집기 오류 처리", () => {
  it("모든 피드가 실패하면 ok=false", async () => {
    const r = await collectRss(["http://127.0.0.1:1/none.xml"]);
    expect(r.ok).toBe(false);
  });
});

describe("발송 실패 재시도 제한", () => {
  it("푸시 채널 미설정 시 3회까지만 재시도", async () => {
    const store = new MemoryStore();
    const t = T_MISSILE_ALERT + 60_000;
    const sigs = parseSafetyData(json("safetydata.json").slice(0, 1), t);
    const kinds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await runCycle({}, store, { now: t + i * 300_000, collect: async () => [result("safetydata", sigs)] });
      kinds.push(r.alerts.length);
    }
    expect(kinds).toEqual([1, 1, 1, 0, 0]);
  });
});
