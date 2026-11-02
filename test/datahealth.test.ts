// 데이터를 제대로 받고 있나 (2026-11-02): 11/2 14:50 국민재난안전포털·14:11 정책브리핑이 HTTP 522 로 응답하지 않았는데
// 재난문자 카드는 '0건 · 정상'으로 남아 있었다.
import { describe, expect, it } from "vitest";
import { dataHealthOf, isFailing, markFailing, shortSourceName, FAIL_AFTER_MS } from "../src/core/datahealth.js";
import { runCycle } from "../src/core/pipeline.js";
import { MemoryStore, type SourceHealth } from "../src/core/store.js";
import type { CollectResult } from "../src/core/types.js";

const NOW = Date.UTC(2026, 10, 2, 6, 0);
const MIN = 60_000;
const h = (source: string, ok: boolean, fetchedAt: number, lastOkAt?: number, error?: string): SourceHealth => ({ source, ok, fetchedAt, rawCount: 0, signalCount: 0, ...(lastOkAt ? { lastOkAt } : {}), ...(error ? { error } : {}) });

describe("못 받는 중인가 — 소스마다 받는 주기를 본다", () => {
  const fail = (source: string, fetchedAt: number, lastOkAt: number | undefined, failCount: number) => ({ ...h(source, false, fetchedAt, lastOkAt), failCount });
  it("5분 주기(재난문자): 두 번 넘게 실패하고 마지막 성공이 30분 넘으면 못 받는 중", () => {
    expect(isFailing(fail("safetydata", NOW, NOW - 10 * MIN, 2), NOW)).toBe(false);
    expect(isFailing(fail("safetydata", NOW, NOW - FAIL_AFTER_MS - MIN, 7), NOW)).toBe(true);
    expect(isFailing(h("safetydata", true, NOW), NOW)).toBe(false);
  });
  it("1시간 주기(국방부 보도자료): 한 번 실패는 아직 아니고(11/2 HTTP 522 깜빡임), 두 번 연속이면 못 받는 중", () => {
    expect(isFailing(fail("korea_kr_mnd", NOW, NOW - 65 * MIN, 1), NOW)).toBe(false);
    expect(isFailing(fail("korea_kr_mnd", NOW, NOW - 125 * MIN, 2), NOW)).toBe(true);
  });
  it("하루 한 번(위성 AIS): 한 번만 실패해도 하루가 비므로 바로", () => {
    expect(isFailing(fail("gfw", NOW, NOW - 24 * 3600_000 - 10 * MIN, 1), NOW)).toBe(true);
  });
  it("성공 시각을 모르는 연속 실패는 못 받는 중으로 본다 (배포 전부터 실패하던 소스)", () => {
    expect(isFailing(fail("korea_kr_mnd", NOW - 5 * MIN, undefined, 2), NOW)).toBe(true);
  });
  it("기록이 끊김: 5분 주기는 30분, 1시간 주기는 3시간, 하루 주기는 26시간", () => {
    expect(isFailing(h("usgs", true, NOW - 31 * MIN), NOW)).toBe(true);
    expect(isFailing(h("travel", true, NOW - 2 * 3600_000), NOW)).toBe(false);
    expect(isFailing(h("travel", true, NOW - 3 * 3600_000 - MIN), NOW)).toBe(true);
    expect(isFailing(h("gfw", true, NOW - 25 * 3600_000), NOW)).toBe(false);
    expect(isFailing(h("gfw", true, NOW - 27 * 3600_000), NOW)).toBe(true);
  });
  it("짧은 이름", () => {
    expect(shortSourceName("행정안전부 긴급재난문자 API (safetydata.go.kr)")).toBe("행정안전부 긴급재난문자");
  });
});

describe("화면 표시", () => {
  const sources = [{ id: "safetydata", name: "행정안전부 긴급재난문자 API (safetydata.go.kr)" }, { id: "usgs", name: "USGS 지진" }];
  const health = [{ ...h("safetydata", false, NOW - MIN, NOW - 50 * MIN, "국민재난안전포털 HTTP 522"), failCount: 9 }, h("usgs", true, NOW - MIN, NOW - MIN), h("aisstream", true, NOW - 40 * 3600_000)];

  it("맨 위 한 줄: 지금 쓰는 소스만 세고, 못 받는 것은 이름과 마지막 성공 시각", () => {
    const d = dataHealthOf(health, sources, [{ reading: { state: "learning" } }, { reading: { state: "normal" } }], NOW);
    expect(d).toEqual({ total: 2, ok: 1, failing: [{ source: "safetydata", name: "행정안전부 긴급재난문자", since: NOW - 50 * MIN, error: "국민재난안전포털 HTTP 522" }], learning: 1 });
  });

  it("그 소스의 카드는 '수집 실패' (값은 마지막 값 그대로)", () => {
    const board = [
      { id: "official.civil_defense_alerts_6h", stateLabel: "정상", reading: { source: "safetydata", at: NOW - 55 * MIN, value: 0 } },
      { id: "seismic.nk_events_24h", stateLabel: "정상", reading: { source: "usgs", at: NOW - MIN, value: 0 } },
    ] as any[];
    markFailing(board, health, NOW);
    expect(board[0].stateLabel).toBe("수집 실패");
    expect(board[0].failing).toEqual({ source: "safetydata", since: NOW - 50 * MIN, error: "국민재난안전포털 HTTP 522" });
    expect(board[0].reading.value).toBe(0);
    expect(board[1].stateLabel).toBe("정상");
    expect(board[1].failing).toBeUndefined();
  });
});

describe("파이프라인: 소스 이름과 마지막 성공 시각을 남긴다", () => {
  const result = (ok: boolean, at: number): CollectResult => ({
    source: "safetydata", ok, fetchedAt: at, rawCount: ok ? 10 : 0, signals: [],
    ...(ok ? { metrics: [{ indicator: "official.civil_defense_alerts_6h", value: 0 }] } : { error: "국민재난안전포털 HTTP 522" }),
  });
  it("성공 → 실패 → 실패: 마지막 성공 시각이 이어지고, 관측값에는 소스가 붙는다", async () => {
    const store = new MemoryStore();
    await runCycle({} as any, store, { now: NOW, collect: async () => [result(true, NOW)] });
    expect(JSON.parse((await store.getKv("readings"))!)["official.civil_defense_alerts_6h"].source).toBe("safetydata");
    await runCycle({} as any, store, { now: NOW + 5 * MIN, collect: async () => [result(false, NOW + 5 * MIN)] });
    await runCycle({} as any, store, { now: NOW + 40 * MIN, collect: async () => [result(false, NOW + 40 * MIN)] });
    const [hh] = await store.getHealth();
    expect(hh.ok).toBe(false);
    expect(hh.lastOkAt).toBe(NOW);
    expect(hh.failCount).toBe(2);
    expect(isFailing(hh, NOW + 40 * MIN)).toBe(true);
    await runCycle({} as any, store, { now: NOW + 45 * MIN, collect: async () => [result(true, NOW + 45 * MIN)] });
    const back = (await store.getHealth())[0];
    expect(back.lastOkAt).toBe(NOW + 45 * MIN);
    expect(back.failCount).toBeUndefined();
  });
});

describe("잠깐 끊긴 것은 한 번 더 받는다", () => {
  it("HTTP 522 다음 성공 → 성공, 404 는 다시 하지 않는다", async () => {
    const { withRetry } = await import("../src/core/util.js");
    let n = 0;
    expect(await withRetry(async () => { if (n++ === 0) throw new Error("HTTP 522 https://www.korea.kr/x"); return "ok"; }, 1, 1)).toBe("ok");
    let m = 0;
    await expect(withRetry(async () => { m++; throw new Error("HTTP 404 x"); }, 1, 1)).rejects.toThrow(/404/);
    expect(m).toBe(1);
  });
});

describe("수집 시간표가 정본이다 (크론·목록·주기가 어긋나지 않게)", () => {
  it("wrangler.toml 크론 = 시간표 열쇠, 시간표의 소스는 모두 수집기와 검증표에 있고 한 번씩만", async () => {
    const { readFileSync } = await import("node:fs");
    const { SCHEDULE, CRON_MINUTES, listSources, activeSources } = await import("../src/core/sources.js");
    const { COLLECTORS } = await import("../src/core/collectors/index.js");
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    const crons = JSON.parse(/crons\s*=\s*(\[[^\]]*\])/.exec(toml)![1]);
    expect([...crons].sort()).toEqual(Object.keys(SCHEDULE).sort());
    expect(Object.keys(CRON_MINUTES).sort()).toEqual(Object.keys(SCHEDULE).sort());
    const ids = Object.values(SCHEDULE).flat();
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(listSources().map((x) => x.id));
    for (const id of ids) {
      expect(known.has(id), id).toBe(true);
      expect(id in COLLECTORS, id).toBe(true);
    }
    // 11/1 크론에서 뺀 소스는 '지금 쓰는 소스'에 없다
    expect(activeSources().map((x) => x.id)).not.toContain("aisstream");
    expect(activeSources().map((x) => x.id)).not.toContain("bluesky");
  });
});
