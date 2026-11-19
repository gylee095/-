import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aliveOf, bumpOpens, opensSummary, ALIVE_STALE_MS } from "../src/core/inboxstats.js";

const NOW = Date.parse("2026-11-18T10:00:00+09:00");

describe("손님 알림함: 초록 불과 열람 횟수 (11/18)", () => {
  it("열람은 날짜별 횟수만 센다 — 누가 열었는지는 남기지 않고 60일만 둔다", () => {
    let raw = JSON.stringify(bumpOpens(undefined, NOW));
    raw = JSON.stringify(bumpOpens(raw, NOW + 60_000));
    raw = JSON.stringify(bumpOpens(raw, NOW + 86400_000));
    expect(JSON.parse(raw)).toEqual({ "2026-11-18": 2, "2026-11-19": 1 });
    expect(opensSummary(raw, NOW + 86400_000)).toMatchObject({ today: 1, last7: 3 });
    expect(Object.keys(bumpOpens(JSON.stringify({ "2026-08-01": 9 }), NOW))).toEqual(["2026-11-18"]);
    expect(bumpOpens("깨진 값", NOW)).toEqual({ "2026-11-18": 1 });
  });
  it("초록 불은 마지막 확인 시각만 — 20분 넘게 확인이 없으면 늦어진다고 한다", () => {
    expect(aliveOf(JSON.stringify({ at: NOW - 3 * 60_000 }), NOW)).toEqual({ at: NOW - 3 * 60_000, ok: true });
    expect(aliveOf(JSON.stringify({ at: NOW - ALIVE_STALE_MS - 1 }), NOW)!.ok).toBe(false);
    expect(aliveOf(undefined, NOW)).toBeUndefined();
    expect(aliveOf("x", NOW)).toBeUndefined();
  });
  it("코드: 손님에게는 숫자·단계를 새로 내보내지 않는다 (마지막 확인 시각만) — 무료 현재 상황을 다시 여는 것이 아니다", () => {
    const idx = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const i = idx.indexOf('url.pathname === "/api/me"'), block = idx.slice(i, idx.indexOf('url.pathname === "/api/report"', i));
    expect(block).toMatch(/alive/);
    expect(block).not.toMatch(/warRisk|proximity|phase|index/);
    const me = readFileSync(new URL("../src/worker/me.ts", import.meta.url), "utf8");
    expect(me).toMatch(/정상 작동 중/);
  });
});
