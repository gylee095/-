import { describe, expect, it } from "vitest";
import { isBorderIncident, newsMetrics } from "../src/core/collectors/news.js";
import { navwarnMetrics } from "../src/core/collectors/nga.js";
import { meaningOf } from "../src/core/interpret.js";
import { INDICATORS, GROUP_LABEL, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";

const NOW = Date.UTC(2026, 9, 31, 9);
const H = 3600_000;

describe("0 점검 (2026-10-31): 진짜 0인지, 못 잡는 것인지", () => {
  it("접경 사건: 10/29 '아침부터 北확성기 소리' 기사를 잡고, 종합보는 한 번만 센다", () => {
    expect(isBorderIncident("접경지 주민들 \"아침부터 北확성기 소리\"…軍은 \"가동 미확인\"(종합2보)")).toBe(true);
    expect(isBorderIncident("합참 \"北군인 10여명 군사분계선 침범…경고사격에 북상\"")).toBe(true);
    expect(isBorderIncident("DMZ 평화누리길 걷기 축제 개막")).toBe(false);
    expect(isBorderIncident("6·25 전사자 유해발굴 비무장지대서 진행")).toBe(false);
    const items = [
      { title: "접경지 주민들 \"아침부터 北확성기 소리\"…軍은 \"가동 미확인\"", pubDate: NOW - 40 * H },
      { title: "접경지 주민들 \"아침부터 北확성기 소리\"…軍은 \"가동 미확인\"(종합2보)", pubDate: NOW - 38 * H },
      { title: "北, 대북제재감시팀 비난", pubDate: NOW - 2 * H },
    ];
    const m = newsMetrics(items, NOW, "rss_breaking").find((x) => x.indicator === "border.incidents_72h")!;
    expect(m.value).toBe(1);
  });
  it("항행경보: 취소되지 않고 남은 2024년 경보는 '유효'로 세지 않는다", () => {
    const rows = [
      { issueDate: "011545Z MAY 2024", text: "SEA OF JAPAN. DISTRESS SIGNAL", navArea: "P", msgNumber: 1433, msgYear: 2024 },
      { issueDate: "301200Z OCT 2026", text: "YELLOW SEA. GUNNERY EXERCISES", navArea: "P", msgNumber: 3001, msgYear: 2026 },
    ];
    expect(navwarnMetrics(rows, NOW).find((m) => m.indicator === "navwarn.korea_warnings")!.value).toBe(1);
  });
  it("범위가 좁은 지표 목록 — 발사 예고는 해상보안청 원문을 읽어 더 이상 '범위 제한'이 아니다", () => {
    const d = INDICATORS.find((x) => x.id === "navwarn.launch_notice_active")!;
    const row: BoardRow = { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, coverage: d.coverage, reading: { indicator: d.id, value: 0, at: NOW, n: 20, state: "normal" }, stateLabel: STATE_LABEL.normal, history: [] };
    // 2026-11-01: 해상보안청 원문을 직접 읽어 발사 예고 칸은 더 이상 '범위 제한'이 아니다
    expect(meaningOf(row, { night: false, exercise: false, moratorium: false })).not.toMatch(/범위 제한/);
    expect(INDICATORS.filter((x) => x.coverage).map((x) => x.id).sort()).toEqual(["air.isr_airborne", "gnss.bad_ratio_north", "sea.ys_vessels_total"]);
  });
});
