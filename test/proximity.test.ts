// 규칙 3.0 — 전조 모형과 한반도 적용 (proximity.ts · precursors.ts)
import { describe, expect, it } from "vitest";
import { ACTION_KEYS, MODEL, buildTable, caseEvidence, classOf, evaluate, ordinaryRate, rate, type CaseRecord, type SignalNow } from "../src/core/precursors.js";
import { PRECURSOR_DATA } from "../src/core/precursor_data.js";
import { AUTO_IDS, ANALYST_GUIDE, assessProximity, checklistText, foldProx, koreaStatus, parseChecks, withProximity } from "../src/core/proximity.js";
import { assessWarRisk } from "../src/core/warrisk.js";

const NOW = Date.parse("2026-11-11T03:00:00Z");
const T = PRECURSOR_DATA.table;
const IDS = T.hyps.map((h) => h.id);
const st = (on: string[], weak: string[] = []): Record<string, SignalNow> => Object.fromEntries(IDS.map((id) => [id, on.includes(id) ? { s: "on" as const } : weak.includes(id) ? { s: "on" as const, w: 0.5 } : { s: "off" as const }]));
const ev = (on: string[], weak: string[] = []) => evaluate(T, st(on, weak), undefined, PRECURSOR_DATA.anchorLogOdds);

describe("전조 모형", () => {
  it("조용한 날: 1단계, 근접도 0, 확률은 기습 몫의 바닥", () => {
    const p = ev([]);
    expect(p.phase).toBe(1);
    expect(p.index).toBe(0);
    expect(p.clashPct).toBeGreaterThan(0.5);
    expect(p.clashPct).toBeLessThan(MODEL.PHASE[2]);
  });
  it("신호 하나로는 위기(3단계)가 되지 않는다 — 가장 무거운 것이라도", () => {
    for (const id of IDS) expect(ev([id]).phase, id).toBeLessThan(3);
  });
  it("한 묶음 안의 신호만으로는 위기가 되지 않는다", () => {
    expect(ev(IDS.filter((x) => x.startsWith("i_"))).phase).toBeLessThan(3);
    expect(ev(IDS.filter((x) => x.startsWith("f_"))).phase).toBeLessThan(3);
  });
  it("말·태세·전략자산이 다 켜져도(2013년형) 임박(4단계)은 아니다 — 행동 신호가 둘 이상 있어야", () => {
    const p = ev(["i_leader_threat", "i_pretext", "i_state_mobilization", "m_alert_level", "m_strategic_assets", "m_cyber", "g_ultimatum"]);
    expect(p.phase).toBe(3);
    const q = ev(["i_leader_threat", "i_pretext", "m_alert_level", "m_strategic_assets", "g_ultimatum", "g_evac_order", "m_logistics", "m_buildup"]);
    expect(q.phase).toBe(4);
    expect(ACTION_KEYS.every((k) => IDS.includes(k))).toBe(true);
  });
  it("약한(미확인) 신호는 확인된 신호보다 덜 민다 · 켜질수록 근접도가 오른다", () => {
    const a = ev(["g_evac_order", "m_buildup"]), b = ev([], ["g_evac_order", "m_buildup"]);
    expect(a.index).toBeGreaterThan(b.index);
    expect(b.index).toBeGreaterThan(0);
    expect(ev(["g_evac_order", "m_buildup", "i_pretext"]).index).toBeGreaterThanOrEqual(a.index);
  });
  it("전면전 % 는 국지 충돌 % 를 넘지 않는다", () => {
    for (const on of [[], ["g_evac_order"], IDS]) { const p = ev(on); expect(p.warPct).toBeLessThanOrEqual(p.clashPct); }
  });
  it("쌓인 기록이 평소 빈도를 고친다: 평소에 자주 켜지는 신호는 힘이 빠진다", () => {
    expect(ordinaryRate("m_gps_ew", { m_gps_ew: [300, 400] })).toBeGreaterThan(ordinaryRate("m_gps_ew"));
    const base = { i_leader_threat: [350, 400] as [number, number], i_pretext: [350, 400] as [number, number] };
    const s = st(["i_leader_threat", "i_pretext", "m_alert_level"]);
    expect(evaluate(T, s, base, PRECURSOR_DATA.anchorLogOdds).index).toBeLessThan(evaluate(T, s, undefined, PRECURSOR_DATA.anchorLogOdds).index);
  });
  it("사례 집계: 모름은 절반짜리 없음, 기습·내전은 따로", () => {
    expect(rate([0, 0, 0])).toBe(0.5);
    expect(rate([4, 0, 12])).toBeLessThan(rate([4, 0, 0]));
    const c = (id: string, outcome: CaseRecord["outcome"], sig: CaseRecord["signals"], extra: Partial<CaseRecord> = {}): CaseRecord => ({ id, name: id, outcome, onset: outcome === "no_war" ? null : "2020-01-10", signals: sig, ...extra });
    const yes = (lead: number, pub = true) => ({ h: "m_buildup", status: "yes" as const, lead, public_then: pub, source: "https://x" });
    expect(classOf({ outcome: "war", kind: "intrastate" })).toBe("X");
    expect(caseEvidence(c("a", "war", [yes(5)]), 7).m_buildup).toBe("off"); // 7일 전에는 아직 안 보였다
    expect(caseEvidence(c("a", "war", [yes(5, false)])).m_buildup).toBe("off"); // 전쟁 뒤에야 알려진 것
    const t = buildTable([c("a", "war", [yes(5)]), c("b", "war", [yes(3)], { surprise: true }), c("n", "no_war", [{ h: "m_buildup", status: "unknown" }])], [{ id: "m_buildup", cluster: "M", ko: "집결" }]);
    expect(t.cases).toMatchObject({ W: 2, Wsurprise: 1, N: 1 });
    expect(t.hyps[0].w).toEqual([1, 0, 0]);
    expect(t.hyps[0].n).toEqual([0, 0, 1]);
  });
  it("사례집: 가설 33개, 봉인 사례는 들어 있지 않다", () => {
    expect(IDS).toHaveLength(33);
    expect(PRECURSOR_DATA.anchors.some((a) => ["india-pakistan-2025", "thailand-cambodia-2025", "taiwan-2022"].includes(a.id))).toBe(false);
    expect(T.cases.W + T.cases.N).toBeGreaterThan(25);
  });
});

describe("한반도 적용", () => {
  it("자동으로 못 보는 가설은 모두 분석관 확인 방법이 있다", () => {
    for (const id of IDS) expect(AUTO_IDS.has(id) || !!ANALYST_GUIDE[id], id).toBe(true);
  });
  it("자료가 없으면 못 봄(?) — 꺼짐으로 세지 않는다. 분석관 확인이 채운다", () => {
    const s = koreaStatus([], [], NOW);
    expect(s.f_fx.s).toBe("unk");
    expect(s.i_pretext.s).toBe("unk");
    const c = parseChecks("i_pretext=1:담화에서 '무인기 침투' 주장 반복 g_talks_collapse=0 m_logistics=0.5:전방 유류 이동 보도(미확인)", NOW);
    expect(Object.keys(c.items)).toEqual(["i_pretext", "g_talks_collapse", "m_logistics"]);
    expect(c.items.i_pretext.ev).toMatch(/무인기/);
    const s2 = koreaStatus([], [], NOW, c);
    expect(s2.i_pretext).toMatchObject({ s: "on", by: "analyst" });
    expect(s2.g_talks_collapse.s).toBe("off");
    expect(s2.m_logistics.w).toBe(0.5);
    // 36시간이 지난 확인은 쓰지 않는다
    expect(koreaStatus([], [], NOW + 37 * 3600_000, c).i_pretext.s).toBe("unk");
  });
  it("모르는 id·형식은 버린다", () => {
    expect(Object.keys(parseChecks("x_fake=1 hello g_ultimatum=2 t_deadline=0", NOW).items)).toEqual(["t_deadline"]);
  });
  it("판정: 모형 단계에 사건 바닥을 더한다 · 교전(5단계)은 이전 규칙 그대로", () => {
    const legacy = assessWarRisk({ now: NOW, board: [], briefs: [], patterns: [] });
    const p = assessProximity([], [], NOW);
    const w = withProximity(legacy, p, [], NOW);
    expect(w.phase).toBe(1);
    expect(w.headline).toMatch(/1단계/);
    expect(w.proximity.waiting).toBeGreaterThan(0);
    expect(withProximity({ ...legacy, phase: 5 }, p, [], NOW).phase).toBe(5);
    expect(checklistText(p).split("\n").length).toBe(35);
  });
  it("하루 한 줄: 그날 가장 높았던 상태를 남기고, 날이 바뀌면 평소 빈도에 더한다 (3단계 이상이던 날은 빼고)", () => {
    const quiet = assessProximity([], [], NOW, undefined, parseChecks(IDS.map((i) => `${i}=0`).join(" "), NOW));
    const hot = assessProximity([], [], NOW, undefined, parseChecks(IDS.map((i) => `${i}=${i === "i_pretext" ? 1 : 0}`).join(" "), NOW));
    let r = foldProx(undefined, hot, 2, NOW);
    expect(r.changed).toBe(true);
    expect(r.hist.days[0].s).toHaveLength(33);
    const again = foldProx(r.hist, quiet, 1, NOW + 600_000);
    expect(again.changed).toBe(false); // 낮아진 것은 그날 기록을 바꾸지 않는다
    r = foldProx(r.hist, quiet, 1, NOW + 86400_000);
    expect(r.hist.days).toHaveLength(2);
    expect(r.hist.base.i_pretext).toEqual([1, 1]);
    expect(r.hist.base.g_ultimatum).toEqual([0, 1]);
    const crisis = foldProx(foldProx(undefined, hot, 3, NOW).hist, quiet, 1, NOW + 86400_000);
    expect(crisis.hist.base.i_pretext).toBeUndefined();
    const v = assessProximity([], [], NOW + 86400_000, r.hist, parseChecks(IDS.map((i) => `${i}=0`).join(" "), NOW + 86400_000));
    expect(v.vs.d1).toBeLessThan(0);
    expect(v.series).toHaveLength(2);
  });
});
