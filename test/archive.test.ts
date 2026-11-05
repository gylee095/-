// 영구 기록 (2026-11-06): 원자료는 30일 뒤 지우되, 지우기 전에 지표 하루 요약과 사건을 옮겨 둔다 — "지금까지에 비해 어느 정도인가" 비교의 재료
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { MemoryStore, kstDay, kstMidnight } from "../src/core/store.js";
import { D1Store } from "../src/worker/d1store.js";
import type { CrisisEvent, Reading } from "../src/core/types.js";

const DAY = 86400_000;
const NOW = Date.UTC(2026, 11, 6, 15, 1); // 12/7 00:01 KST — 매일 정리하는 시각
const CUT = NOW - 30 * DAY;
const day0 = kstMidnight(CUT) - DAY; // 지울 날 (한국 날짜 하루 전체)
const ev = (id: string, at: number) => ({ id, firstDetectedTime: at, title: id, severity: 4 }) as unknown as CrisisEvent;
const readings = (at0: number): Reading[] => [
  { indicator: "air.mil_airborne", value: 3, at: at0 + 3600_000, z: 0.5, n: 10, state: "normal" },
  { indicator: "air.mil_airborne", value: 9, at: at0 + 7200_000, z: 3.1, n: 10, state: "elevated" },
  { indicator: "seismic.nk_events_24h", value: 0, at: at0 + 7200_000, n: 10, state: "normal" },
];

/** 실제 SQL(SQLite)로 D1 흉내 — 쿼리가 진짜로 맞게 도는지 본다 */
function sqliteD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_init", "0002_metrics", "0004_risk_history", "0005_archive"]) db.exec(readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8"));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])), meta: {} }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { results: [], meta: { changes: Number(r.changes) } }; },
  });
  return { db, d1: { prepare: (sql: string) => stmt(sql), batch: async (s: any[]) => { const out = []; for (const x of s) out.push(await x.run()); return out; } } as unknown as D1Database };
}

describe("30일 지난 원자료 → 영구 기록", () => {
  it("메모리 저장소: 지표는 한국 날짜별 요약으로, 사건은 보관함으로 옮기고 원자료는 지운다", async () => {
    const s = new MemoryStore();
    await s.putMetrics([...readings(day0), { indicator: "air.mil_airborne", value: 5, at: kstMidnight(CUT) + 60_000, n: 10 } as never]);
    await s.putEvents([ev("old", day0 + 3600_000), ev("new", NOW - DAY)]);
    s.prune(CUT);
    expect(await s.getMetricDays("air.mil_airborne", "2000-01-01")).toEqual([{ day: kstDay(day0), indicator: "air.mil_airborne", n: 2, avg: 6, min: 3, max: 9, zmax: 3.1 }]);
    expect((await s.getArchivedEvents(0, NOW)).map((e) => e.id)).toEqual(["old"]);
    expect((await s.getEvents(0)).map((e) => e.id)).toEqual(["new"]);
    expect((await s.getMetricHistory("air.mil_airborne", 0)).length).toBe(1); // 지우는 경계 뒤(그 날 00:01)는 남는다 — 하루가 반쪽으로 요약되지 않게
  });

  it("D1 저장소(실제 SQL): 같은 결과, 다시 돌려도 중복 없음", async () => {
    const { db, d1 } = sqliteD1();
    const s = new D1Store(d1);
    await s.putMetrics(readings(day0) as never);
    await s.putEvents([ev("old", day0 + 3600_000), ev("new", NOW - DAY)]);
    await s.prune(CUT);
    await s.prune(CUT);
    expect(await s.getMetricDays("air.mil_airborne", "2000-01-01")).toEqual([{ day: kstDay(day0), indicator: "air.mil_airborne", n: 2, avg: 6, min: 3, max: 9, zmax: 3.1 }]);
    expect((await s.getMetricDays("seismic.nk_events_24h", "2000-01-01"))[0]).toMatchObject({ n: 1, max: 0, zmax: null });
    expect((await s.getArchivedEvents(0, NOW)).map((e) => e.id)).toEqual(["old"]);
    expect((db.prepare("SELECT count(*) AS c FROM metrics").get() as { c: number }).c).toBe(0);
    expect((db.prepare("SELECT count(*) AS c FROM events").get() as { c: number }).c).toBe(1);
  });
});
