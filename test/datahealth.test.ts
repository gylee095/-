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

describe("못 받는 중인가", () => {
  it("실패가 30분 넘게 이어지면 못 받는 중, 한두 번 실패는 아직 아님", () => {
    expect(isFailing(h("safetydata", false, NOW, NOW - 10 * MIN), NOW)).toBe(false);
    expect(isFailing(h("safetydata", false, NOW, NOW - FAIL_AFTER_MS - MIN), NOW)).toBe(true);
    expect(isFailing(h("safetydata", true, NOW), NOW)).toBe(false);
  });
  it("성공 시각을 모르는 실패는 못 받는 중으로 본다 (배포 전부터 실패하던 소스)", () => {
    expect(isFailing(h("korea_kr_mnd", false, NOW - 5 * MIN), NOW)).toBe(true);
  });
  it("하루 넘게 수집 기록이 없으면 성공이었어도 멈춘 것", () => {
    expect(isFailing(h("gfw", true, NOW - 27 * 3600_000), NOW)).toBe(true);
  });
  it("짧은 이름", () => {
    expect(shortSourceName("행정안전부 긴급재난문자 API (safetydata.go.kr)")).toBe("행정안전부 긴급재난문자");
  });
});

describe("화면 표시", () => {
  const sources = [{ id: "safetydata", name: "행정안전부 긴급재난문자 API (safetydata.go.kr)" }, { id: "usgs", name: "USGS 지진" }];
  const health = [h("safetydata", false, NOW - MIN, NOW - 50 * MIN, "국민재난안전포털 HTTP 522"), h("usgs", true, NOW - MIN, NOW - MIN), h("aisstream", true, NOW - 40 * 3600_000)];

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
    expect(isFailing(hh, NOW + 40 * MIN)).toBe(true);
    await runCycle({} as any, store, { now: NOW + 45 * MIN, collect: async () => [result(true, NOW + 45 * MIN)] });
    expect((await store.getHealth())[0].lastOkAt).toBe(NOW + 45 * MIN);
  });
});
