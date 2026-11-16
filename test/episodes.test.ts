import { describe, expect, it } from "vitest";
import { foldEpisodes, episodesBy, detailOf, EPISODE_KEEP, parseEpisodes } from "../src/core/episodes.js";

const T0 = Date.parse("2026-11-16T03:10:00+09:00"), MIN = 60_000;
const row = (id: string, value: number, state: string, extra: Record<string, unknown> = {}) => ({ id, label: id, group: "g", groupLabel: "g", unit: "대", direction: "high", why: "", latency: "", caveats: "", stateLabel: state === "normal" ? "평소" : "이상", history: [], reading: { indicator: id, value, state, at: 0, baseline: 1, meta: { types: { C17: value } } }, ...extra }) as any;

describe("신호의 이상 구간 (11/16)", () => {
  it("10분만 4대였다가 사라져도 언제부터 언제까지·최고 몇 대·그때 기종이 남는다", () => {
    let log = foldEpisodes(undefined, [row("air.mil_airborne", 1, "normal")], T0 - 5 * MIN);
    expect(log.list).toEqual([]);
    log = foldEpisodes(log, [row("air.mil_airborne", 3, "elevated")], T0);
    log = foldEpisodes(log, [row("air.mil_airborne", 4, "anomalous")], T0 + 5 * MIN);
    expect(log.list[0]).toMatchObject({ id: "air.mil_airborne", from: T0, peak: 4, level: "anomalous", detail: "C17 4대", baseline: 1 });
    expect(log.list[0].to).toBeUndefined();
    log = foldEpisodes(log, [row("air.mil_airborne", 1, "normal")], T0 + 10 * MIN);
    expect(log.list[0]).toMatchObject({ from: T0, to: T0 + 10 * MIN, peak: 4, detail: "C17 4대" });
    expect(episodesBy(log, T0 + 6 * 3600_000)["air.mil_airborne"]).toHaveLength(1);
  });
  it("깜빡임은 한 구간으로 잇고, 한참 뒤에 다시 뜨면 새 구간이다", () => {
    let log = foldEpisodes(undefined, [row("a.b", 4, "anomalous")], T0);
    log = foldEpisodes(log, [row("a.b", 1, "normal")], T0 + 5 * MIN);
    log = foldEpisodes(log, [row("a.b", 5, "anomalous")], T0 + 15 * MIN); // 10분 만에 다시 → 같은 구간
    expect(log.list).toHaveLength(1);
    expect(log.list[0]).toMatchObject({ from: T0, peak: 5 });
    expect(log.list[0].to).toBeUndefined();
    log = foldEpisodes(log, [row("a.b", 1, "normal")], T0 + 20 * MIN);
    log = foldEpisodes(log, [row("a.b", 4, "anomalous")], T0 + 3 * 3600_000);
    expect(log.list).toHaveLength(2);
  });
  it("값을 못 받는 동안에는 구간을 닫지 않고, 낮을수록 나쁜 신호는 가장 낮은 값을 남긴다. 72시간이 지나면 버린다", () => {
    let log = foldEpisodes(undefined, [row("x.y", 20, "anomalous", { direction: "low" })], T0);
    log = foldEpisodes(log, [row("x.y", 12, "anomalous", { direction: "low" })], T0 + 5 * MIN);
    log = foldEpisodes(log, [row("x.y", 30, "normal", { failing: { source: "s", since: 0 } })], T0 + 10 * MIN);
    expect(log.list[0]).toMatchObject({ peak: 12 });
    expect(log.list[0].to).toBeUndefined();
    log = foldEpisodes(log, [row("x.y", 30, "normal", { direction: "low" })], T0 + 15 * MIN);
    expect(log.list[0].to).toBe(T0 + 15 * MIN);
    expect(foldEpisodes(log, [], T0 + 15 * MIN + EPISODE_KEEP + 1).list).toEqual([]);
    expect(parseEpisodes("깨진 값")).toBeUndefined();
    expect(detailOf({ titles: ["기사 제목"] })).toBe("기사 제목");
  });
  it("코드: 5분 주기가 구간을 기록하고, 분석관 도구가 지난 24시간 구간을 보여 주며 그 신호의 설명을 받는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
    expect(src("worker/index.ts")).toMatch(/foldEpisodes\(parseEpisodes\(epRaw\), st\.board, report\.at\)/);
    expect(src("mcp/tools_indicators.ts")).toMatch(/episodes_24h/);
    expect(src("mcp/tools_indicators.ts")).toMatch(/hadEpisode\.includes\(id\)/);
    expect(readFileSync(new URL("../.claude/commands/kew-scan.md", import.meta.url), "utf8")).toMatch(/episodes_24h/);
  });
});
