// 저장소(Cloudflare D1 무료) 절약 — 2026-11-01 00시(KST) 하루 읽기 한도 500만 행 초과로 감시·대시보드가 멈춘 뒤 고친 것들
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSafetyData } from "../src/core/collectors/safetydata.js";
import { addHourly, hourlySeries, processMetrics, runCycle, METRIC_WRITE_INTERVAL_MS } from "../src/core/pipeline.js";
import { MemoryStore } from "../src/core/store.js";
import { buildState } from "../src/core/state.js";
import { D1Store } from "../src/worker/d1store.js";
import type { CollectResult, Signal } from "../src/core/types.js";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));
const T = Date.UTC(2026, 10, 2, 10, 42); // 19:42 KST
const MIN = 60_000;
const env = { NTFY_TOPIC: "kew-test", DASHBOARD_URL: "https://kew.example.workers.dev" };
const ok = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
const result = (source: string, signals: Signal[], metrics: CollectResult["metrics"] = []): CollectResult => ({ source, ok: true, signals, metrics, fetchedAt: T, rawCount: signals.length });

/** 호출 횟수를 세는 메모리 저장소 */
class CountingStore extends MemoryStore {
  calls: Record<string, number> = {};
  putEventsArgs: number[] = [];
  private hit(k: string) {
    this.calls[k] = (this.calls[k] ?? 0) + 1;
  }
  async getSignals(since: number) {
    this.hit("getSignals");
    return super.getSignals(since);
  }
  async getSignalsByIds(ids: string[]) {
    this.hit("getSignalsByIds");
    return super.getSignalsByIds(ids);
  }
  async getMetricHourly(since: number) {
    this.hit("getMetricHourly");
    return super.getMetricHourly(since);
  }
  async putEvents(e: Parameters<MemoryStore["putEvents"]>[0]) {
    this.putEventsArgs.push(e.length);
    return super.putEvents(e);
  }
}

describe("1분 주기: 새 신호가 없으면 상관분석을 건너뛴다", () => {
  it("새 신호 0건 → 신호 표를 읽지 않고 '생략'으로 끝, 새 신호가 오면 전체를 돈다", async () => {
    const store = new CountingStore();
    const quiet = await runCycle(env, store, { now: T, fetchImpl: ok, quietSkip: true, collect: async () => [result("rss_breaking", [])] });
    expect(quiet.skipped).toMatch(/새 신호 없음/);
    expect(store.calls.getSignals ?? 0).toBe(0);
    const sd = fx("safetydata.json");
    const busy = await runCycle(env, store, { now: T + MIN, fetchImpl: ok, quietSkip: true, collect: async () => [result("safetydata", parseSafetyData(sd, T + MIN))] });
    expect(busy.skipped).toBeUndefined();
    expect(store.calls.getSignals).toBe(1);
    expect(busy.alerts.length).toBeGreaterThan(0); // 알림은 그대로 나간다
  });
  it("5분 주기(quietSkip 없음)는 새 신호가 없어도 전체를 돈다 — 재시도·시간당 한도 해제를 처리", async () => {
    const store = new CountingStore();
    await runCycle(env, store, { now: T, fetchImpl: ok, collect: async () => [result("usgs", [])] });
    expect(store.calls.getSignals).toBe(1);
  });
});

describe("사건은 근거 신호 사본을 갖고, 바뀐 사건만 다시 쓴다", () => {
  it("같은 신호로 다시 돌면 사건을 다시 쓰지 않는다", async () => {
    const store = new CountingStore();
    const sd = fx("safetydata.json");
    const collect = async () => [result("safetydata", parseSafetyData(sd, T))];
    const r1 = await runCycle(env, store, { now: T, fetchImpl: ok, collect });
    expect(r1.events.length).toBeGreaterThan(0);
    expect(r1.events.every((e) => (e.evidence?.length ?? 0) === e.signalIds.length)).toBe(true);
    await runCycle(env, store, { now: T + 5 * MIN, fetchImpl: ok, collect });
    await runCycle(env, store, { now: T + 10 * MIN, fetchImpl: ok, collect });
    expect(store.putEventsArgs[0]).toBe(r1.events.length);
    expect(store.putEventsArgs.at(-1)).toBe(0); // 세 번째에는 바뀐 것이 없다
  });
  it("대시보드 상태는 신호 표·시계열 표를 훑지 않는다", async () => {
    const store = new CountingStore();
    const sd = fx("safetydata.json");
    await runCycle(env, store, { now: T, fetchImpl: ok, collect: async () => [result("safetydata", parseSafetyData(sd, T))] });
    const st = await buildState(store, T - 168 * 3600_000);
    expect(store.calls.getSignals).toBe(1); // 사이클의 한 번뿐
    expect(store.calls.getSignalsByIds ?? 0).toBe(0);
    expect(store.calls.getMetricHourly ?? 0).toBe(0);
    expect(st.events.length).toBeGreaterThan(0);
    expect(st.events[0].signals.length).toBeGreaterThan(0); // 근거 기사 목록은 그대로 보인다
    expect((st.events[0] as any).evidence).toBeUndefined(); // 응답에 두 번 싣지 않는다
  });
  it("근거 사본이 없는 옛 사건은 신호를 ID로만 찾아 채우고 한 번 다시 저장한다", async () => {
    const store = new CountingStore();
    const sd = fx("safetydata.json");
    const r = await runCycle(env, store, { now: T, fetchImpl: ok, collect: async () => [result("safetydata", parseSafetyData(sd, T))] });
    // 변경 전 저장 형태 흉내: evidence 없이 다시 저장
    await store.putEvents(r.events.map(({ evidence: _e, ...e }) => e));
    store.putEventsArgs = [];
    const st1 = await buildState(store, T - 72 * 3600_000);
    expect(store.calls.getSignalsByIds).toBe(1);
    expect(store.putEventsArgs).toEqual([r.events.length]);
    expect(st1.events[0].signals.length).toBeGreaterThan(0);
    await buildState(store, T - 72 * 3600_000);
    expect(store.calls.getSignalsByIds).toBe(1); // 두 번째부터는 찾지 않는다
  });
});

describe("지표 기록: 스파크라인은 KV 집계, 시계열 표는 15분에 한 번", () => {
  const m = (v: number) => [{ indicator: "media.breaking_nk_1h", value: v }];
  it("시간별 평균을 KV 한 줄에 쌓고, 26시간 지난 것은 버린다", () => {
    const agg = addHourly({}, [{ indicator: "x", value: 2, at: T, n: 1, state: "normal" }, { indicator: "x", value: 4, at: T + MIN, n: 1, state: "normal" }], T);
    expect(hourlySeries(agg, "x", T - 3600_000)).toEqual([{ hour: Math.floor(T / 3600_000), avg: 3 }]);
    const later = addHourly(agg, [{ indicator: "x", value: 1, at: T + 30 * 3600_000, n: 1, state: "normal" }], T + 30 * 3600_000);
    expect(Object.keys(later.x)).toEqual([String(Math.floor((T + 30 * 3600_000) / 3600_000))]);
  });
  it("1분마다 들어와도 시계열 표에는 15분 간격으로만 쓴다 (상태가 바뀌면 바로)", async () => {
    const store = new MemoryStore();
    const writes: number[] = [];
    const orig = store.putMetrics.bind(store);
    store.putMetrics = async (r) => {
      writes.push(r.length);
      return orig(r);
    };
    for (let i = 0; i < 16; i++) await processMetrics(store, m(1), T + i * MIN);
    expect(writes.map((n, i) => (n ? i : -1)).filter((i) => i >= 0)).toEqual([0, 15]);
    expect(METRIC_WRITE_INTERVAL_MS).toBeLessThan(15 * MIN);
    // 속보가 몰려 상태가 바뀐 순간은 기다리지 않고 바로 남긴다
    await processMetrics(store, m(5), T + 16 * MIN);
    expect(writes.at(-1)).toBe(1);
    const hourly = JSON.parse((await store.getKv("hourly"))!);
    const total = Object.values(hourly["media.breaking_nk_1h"] as Record<string, [number, number]>).reduce((a, [sum, n]) => [a[0] + sum, a[1] + n], [0, 0]);
    expect(total).toEqual([16 + 5, 17]); // 집계는 매번
  });
});

describe("D1 사용량 계량", () => {
  /** D1 흉내: 쿼리마다 rows_read 를 돌려준다 */
  function fakeD1(perQueryRead = 10) {
    const seen: string[] = [];
    const kv = new Map<string, string>();
    const stmt = (sql: string, args: unknown[] = []) => ({
      sql,
      args,
      bind: (...a: unknown[]) => stmt(sql, a),
      all: async () => {
        seen.push(sql);
        if (sql.includes("RETURNING v")) {
          const prev = kv.get(String(args[0]));
          const p = prev ? JSON.parse(prev) : { read: 0, written: 0, calls: 0 };
          const next = { read: p.read + Number(args[1]), written: p.written + Number(args[2]), calls: p.calls + 1 };
          kv.set(String(args[0]), JSON.stringify(next));
          return { results: [{ v: JSON.stringify(next) }], meta: {} };
        }
        return { results: [], meta: { rows_read: perQueryRead, rows_written: 0 } };
      },
      run: async () => ({ results: [], meta: { rows_read: 1, rows_written: 2, changes: 1 } }),
    });
    const db = { prepare: (sql: string) => stmt(sql), batch: async (s: any[]) => Promise.all(s.map((x) => x.run())) };
    return { db: db as unknown as D1Database, seen };
  }
  it("읽은 행·쓴 행을 모아 오늘 합계에 더한다", async () => {
    const { db, seen } = fakeD1(10);
    const s = new D1Store(db);
    await s.getKv("readings");
    await s.getSignals(T);
    await s.setKv("a", "b");
    expect(s.usage).toEqual({ read: 21, written: 2, queries: 3 });
    expect(seen.some((q) => /UNION ALL/.test(q) && !/ OR /.test(q))).toBe(true); // OR 조건(표 전체 읽기)을 쓰지 않는다
    const u1 = await s.flushUsage(T);
    expect(u1).toMatchObject({ date: "2026-11-02", read: 22, written: 3, calls: 1 });
    await s.getKv("x");
    const u2 = await s.flushUsage(T);
    expect(u2).toMatchObject({ read: 22 + 11, written: 4, calls: 2 });
    expect(s.usage.queries).toBe(0);
  });
});
