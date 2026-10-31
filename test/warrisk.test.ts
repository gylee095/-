import { describe, expect, it } from "vitest";
import { assessWarRisk, BANDS } from "../src/core/warrisk.js";
import { INDICATORS, GROUP_LABEL, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { IndicatorState } from "../src/core/types.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 9, 31, 6, 0);
const H = 3600_000;

/** 모든 징후를 '정상'으로 채운 판 — over 로 일부만 바꾼다 */
function board(over: Record<string, { value: number; state: IndicatorState; meta?: Record<string, unknown> }> = {}): BoardRow[] {
  return INDICATORS.map((d) => {
    const o = over[d.id];
    const reading = { indicator: d.id, at: NOW, n: 20, value: o?.value ?? 0, state: o?.state ?? ("normal" as IndicatorState), meta: o?.meta };
    return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[reading.state], history: [] };
  });
}
const brief = (hoursAgo: number, level: 1 | 2 | 3 | 4 | 5, headline: string, reason = ""): EventBrief => ({
  headline, isProvocation: true, danger: { level, label: ["", "관심", "주의", "경계", "심각", "위급"][level], reason }, at: NOW - hoursAgo * H,
});
const run = (b: BoardRow[], briefs: EventBrief[] = []) => assessWarRisk({ now: NOW, board: b, briefs, patterns: [] });

describe("전쟁 위험 모델", () => {
  it("조용한 날: 1단계(평온), 평소 확률, '모두 평소대로'", () => {
    const w = run(board());
    expect(w.phase).toBe(1);
    expect(w.clash30d.point).toBeCloseTo(1.8, 1);
    expect(w.war30d.point).toBeLessThan(0.1);
    expect(w.firstMover.kind).toBe("reassuring");
    expect(w.headline).toMatch(/1단계\(평온\).*평소 수준/);
    expect(w.domains.every((d) => d.level === 0)).toBe(true);
  });

  it("미사일 이틀 뒤: 2단계(긴장)일 뿐 위기가 아니다 — 정부·돈이 조용하면 무력시위로 읽는다", () => {
    const w = run(board(), [brief(48, 3, "북한, 탄도미사일 10여 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(2);
    expect(w.domains.find((d) => d.id === "military")!.level).toBeGreaterThanOrEqual(1);
    expect(w.firstMover.kind).toBe("neutral");
    expect(w.firstMover.text).toMatch(/정부와 돈은 평소대로/);
    expect(w.clash30d.point).toBeLessThanOrEqual(BANDS[2].clash[1]);
  });

  it("북한의 말만 거칠어도(단일 영역 '심각') 위기로 올리지 않는다", () => {
    const w = run(board({ "rhetoric.nk_statements_24h": { value: 12, state: "anomalous" }, "rhetoric.nk_hostile_24h": { value: 8, state: "anomalous" } }));
    expect(w.domains.find((d) => d.id === "nkwords")!.level).toBe(3);
    expect(w.phase).toBe(2);
  });

  it("두 나라 정부가 경보를 올리면 3단계(위기) — 대중이 조용하면 '정부가 먼저'", () => {
    const w = run(board({ "official.us_travel_level_kr": { value: 2, state: "elevated" }, "official.ca_level_kr": { value: 1, state: "elevated" } }));
    expect(w.domains.find((d) => d.id === "gov")!.level).toBe(2);
    expect(w.phase).toBe(3);
    expect(w.firstMover.kind).toBe("warning");
    expect(w.firstMover.text).toMatch(/정부가 먼저/);
  });

  it("일본 공관 출국 권고(이상) → 4단계(임박)", () => {
    const w = run(board({ "official.jp_embassy_alert": { value: 2, state: "anomalous", meta: { titles: ["朝鮮半島情勢を踏まえた早期の出国の検討について"] } } }));
    expect(w.domains.find((d) => d.id === "gov")!.level).toBe(3);
    expect(w.phase).toBe(4);
    expect(w.war30d.point).toBeGreaterThanOrEqual(BANDS[4].war[0]);
  });

  it("대중만 불안(검색·조회수 급증) → 언론발 불안으로 읽는다", () => {
    const w = run(board({ "psych.naver_war_search": { value: 320, state: "elevated" }, "psych.wiki_korea_attention": { value: 180, state: "elevated" } }));
    expect(w.domains.find((d) => d.id === "public")!.level).toBe(2);
    expect(w.phase).toBe(2);
    expect(w.firstMover.kind).toBe("reassuring");
    expect(w.firstMover.text).toMatch(/언론발/);
  });

  it("돈만 움직이면 다른 이유(세계 증시·국내 정치)를 먼저 의심한다", () => {
    const w = run(board({ "market.kr_equity_rel_pct": { value: -4.5, state: "anomalous" }, "market.usdkrw_change_pct": { value: 2, state: "elevated" } }));
    expect(w.domains.find((d) => d.id === "money")!.level).toBe(2);
    expect(w.phase).toBe(2);
    expect(w.firstMover.kind).toBe("caveat");
    expect(w.firstMover.text).toMatch(/돈만 움직였다/);
  });

  it("실측 10/30: 코스피만 더 빠졌어도 방산주가 같이 빠지면 '전쟁 가격 아님'으로 읽는다", () => {
    const w = run(board({
      "market.kr_equity_rel_pct": { value: -2.23, state: "elevated", meta: { kospiPct: -4.69, peersPct: -2.46 } },
      "market.defense_rel_pct": { value: -0.07, state: "normal" },
    }), [brief(40, 3, "북한, 탄도미사일 약 10 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(2);
    expect(w.firstMover.text).toMatch(/방산주도 같이 빠졌고.*전쟁 위험을 가격에 넣는 모습은 아니다/);
    expect(w.firstMover.text).toMatch(/코스피 -4.69%, 일본·대만 -2.46%/);
  });

  it("ICBM + 시장 반응 → 3단계(위기)", () => {
    const w = run(board({ "market.kr_equity_rel_pct": { value: -4.5, state: "anomalous" }, "market.pm_war_prob": { value: 9, state: "elevated", meta: { question: "Will North Korea invade South Korea before 2027?", daysLeft: 61, diplomacy: [{ question: "Will Trump meet with Kim Jong Un in 2026?", pct: 15 }] } } }), [brief(5, 4, "북한, ICBM 발사 → 동해", "장거리·일본 상공/EEZ 관련 발사")]);
    expect(w.phase).toBe(3);
    expect(w.phaseReasons.join(" ")).toMatch(/돈·정부가 반응/);
    expect(w.market?.pct).toBe(9);
    expect(w.restraints[0]).toMatch(/Trump meet with Kim Jong Un in 2026 15%/);
  });

  it("영토 포격 + 교전 보도 → 5단계(교전)", () => {
    const w = run(board(), [brief(3, 5, "연평도 포격 — 우리 군 대응 사격, 교전", "우리 영토 인근 포격")]);
    expect(w.phase).toBe(5);
    expect(w.headline).toMatch(/진행 중/);
  });

  it("측정 못 하는 영역은 사각지대로 말한다", () => {
    const b = board().map((r) => (r.id === "psych.naver_war_search" ? { ...r, reading: undefined, stateLabel: STATE_LABEL.unavailable } : r));
    const w = run(b);
    expect(w.blindSpots.join(" ")).toMatch(/사람들의 불안: .*네이버/);
  });
});
