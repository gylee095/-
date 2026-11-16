import { describe, expect, it } from "vitest";
import { parseSignalNotes, mergeSignalNotes, liveNotes, NOTE_TTL } from "../src/core/signalnotes.js";
import { INDICATORS } from "../src/core/indicators.js";

const NOW = Date.parse("2026-11-16T09:00:00+09:00");
const IDS = INDICATORS.map((d) => d.id);

describe("신호별 '왜 이런가' 한 줄 (11/16)", () => {
  it("분석관이 줄마다 적은 설명을 신호 id 로 읽는다 — 주소는 출처로 떼고, 모르는 id 는 버린다", () => {
    expect(IDS).toContain("air.mil_airborne");
    const n = parseSignalNotes("air.mil_airborne: 4대 중 3대는 미 공군 수송기 정례 운항 — 위협 신호 아님 https://www.yna.co.kr/view/A1\n- nope.unknown: 버려짐\nair.civil_airborne:   ", IDS, NOW);
    expect(Object.keys(n)).toEqual(["air.mil_airborne"]);
    expect(n["air.mil_airborne"]).toEqual({ text: "4대 중 3대는 미 공군 수송기 정례 운항 — 위협 신호 아님", at: NOW, src: [{ t: "yna.co.kr", u: "https://www.yna.co.kr/view/A1" }] });
  });
  it("같은 신호는 새 설명으로 바뀌고, 36시간이 지난 설명은 사라진다", () => {
    const old = { "air.mil_airborne": { text: "옛 설명", at: NOW - NOTE_TTL - 1 }, "air.civil_airborne": { text: "어제 설명", at: NOW - 3600_000 } };
    const m = mergeSignalNotes(old, parseSignalNotes("air.civil_airborne: 새 설명", IDS, NOW), NOW);
    expect(m).toEqual({ "air.civil_airborne": { text: "새 설명", at: NOW } });
    expect(liveNotes(JSON.stringify(old), NOW)).toEqual({ "air.civil_airborne": old["air.civil_airborne"] });
    expect(liveNotes("깨진 값", NOW)).toEqual({});
  });
  it("분석관 지침과 도구가 함께 있다 — 매번 평소와 다른 신호마다 적는다", async () => {
    const { readFileSync } = await import("node:fs");
    const scan = readFileSync(new URL("../.claude/commands/kew-scan.md", import.meta.url), "utf8");
    expect(scan).toMatch(/record_signal_notes/);
    expect(readFileSync(new URL("../src/mcp/tools_indicators.ts", import.meta.url), "utf8")).toMatch(/"record_signal_notes"/);
  });
  it("정상 범위인 신호에는 설명을 받지도 보이지도 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const tool = readFileSync(new URL("../src/mcp/tools_indicators.ts", import.meta.url), "utf8");
    expect(tool).toMatch(/parseSignalNotes\(notes, abnormal, now\)/);
    const dash = readFileSync(new URL("../src/worker/dashboard.ts", import.meta.url), "utf8");
    expect(dash).toMatch(/if\(!ab&&!recent\)return "";/); // 지금 이상이거나 지난 24시간 안에 이상 구간이 있었던 신호에만
    expect(parseSignalNotes("air.mil_airborne: 설명", [], NOW)).toEqual({}); // 지금 이상인 신호 목록에 없으면 저장되지 않는다
  });
});
