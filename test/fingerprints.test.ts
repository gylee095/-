// 전쟁 직전의 지문 — 다른 전쟁 직전에 공개적으로 보였던 것 중 지금 켜진 것
import { describe, expect, it } from "vitest";
import { checkFingerprints, FINGERPRINTS } from "../src/core/fingerprints.js";
import { assessWarRisk } from "../src/core/warrisk.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 10, 2, 3, 0);
const board = (over: Record<string, { value: number; state: "normal" | "elevated" | "anomalous" }> = {}): BoardRow[] =>
  INDICATORS.map((d) => {
    const o = over[d.id];
    const reading = { indicator: d.id, at: NOW, n: 20, value: o?.value ?? 0, state: o?.state ?? ("normal" as const) };
    return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[reading.state], history: [] };
  });
const posture = (id: string, domain: any, level: any, headline: string): EventBrief => ({ headline, isProvocation: false, danger: { level: 3, label: "", reason: "" }, at: NOW - 3600_000, posture: [{ id, label: id, domain, level }] });

describe("전쟁 직전 지문", () => {
  it("조용한 날: 자동으로 보는 지문 11개 모두 꺼짐, 분석관 확인·공개 자료 없음은 '확인 필요'", () => {
    const b = board();
    const r = checkFingerprints(assessWarRisk({ now: NOW, board: b, briefs: [], patterns: [] }), b, [], NOW);
    expect(r.watched).toBe(11);
    expect(r.on).toBe(0);
    expect(r.checks.filter((c) => c.status === "unknown").map((c) => c.id)).toEqual(["peace_offensive", "medical"]);
    expect(FINGERPRINTS.every((f) => f.precedent.length > 10)).toBe(true);
  });
  it("항공사 운항 중단·북한 전시 태세·국무부 철수 문구가 켜지면 근거와 함께 보인다", () => {
    const b = board({ "official.us_departure_kr": { value: 2, state: "anomalous" } });
    const briefs = [posture("airlines_suspend", "money", 2, "루프트한자, 인천 노선 운항 중단"), posture("nk_war_posture", "military", 2, "北, 전방부대에 '완전사격준비태세' 지시")];
    const w = assessWarRisk({ now: NOW, board: b, briefs, patterns: [] });
    const r = checkFingerprints(w, b, briefs, NOW);
    const on = Object.fromEntries(r.checks.filter((c) => c.status === "on").map((c) => [c.id, c.evidence]));
    expect(on).toMatchObject({ evacuation: "미 국무부 경보 본문에 철수·출국 문구", airlines: "루프트한자, 인천 노선 운항 중단", war_posture: "北, 전방부대에 '완전사격준비태세' 지시" });
    expect(on.money_out).toBeDefined(); // 돈의 움직임 '경계' (항공사 운항 중단이 돈 영역을 올림)
    expect(r.on).toBe(4);
  });
  it("7일 지난 경보 단어는 끈다", () => {
    const b = board();
    const old = { ...posture("airlines_suspend", "money", 2, "옛 기사"), at: NOW - 8 * 86400_000 };
    const r = checkFingerprints(assessWarRisk({ now: NOW, board: b, briefs: [old], patterns: [] }), b, [old], NOW);
    expect(r.on).toBe(0);
  });
});
