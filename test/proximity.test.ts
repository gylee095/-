// 규칙 3.0 — 전조 모형과 한반도 적용 (proximity.ts · precursors.ts)
import { describe, expect, it } from "vitest";
import { clashOf, scoreRubric, RUBRIC, BASE_SEED, SIGNS, PCT_AT } from "../src/core/rubric.js";
import { ACTION_KEYS, INDEX_AT, MODEL, clashOfIndex as clashOfIndexOld, buildTable, caseEvidence, classOf, evaluate, ordinaryRate, rate, type CaseRecord, type SignalNow } from "../src/core/precursors.js";
import { PRECURSOR_DATA } from "../src/core/precursor_data.js";
import { ALL_IDS, AUTO_IDS, ANALYST_GUIDE, BASE_TTL, HOTSPOT, autoStatus, assessProximity, checklistText, foldProx, koreaStatus, parseChecks, withProximity } from "../src/core/proximity.js";
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
    // 우크라이나 2022년형: 넓게 켜지고(지수 70 이상) 행동 신호도 둘 이상
    const q = ev(["g_evac_order", "g_leave_now", "g_attacker_evac", "g_intel_warning", "g_ultimatum", "m_buildup", "m_logistics", "m_exercise_cover", "m_civil_defense", "m_cyber", "m_border_fire", "f_equity", "i_leader_threat", "i_pretext"]);
    expect(q.phase).toBe(4);
    expect(ACTION_KEYS.every((k) => IDS.includes(k))).toBe(true);
  });
  it("약한(미확인) 신호는 확인된 신호보다 덜 민다 · 켜질수록 근접도가 오른다", () => {
    const a = ev(["g_evac_order", "m_buildup"]), b = ev([], ["g_evac_order", "m_buildup"]);
    expect(a.index).toBeGreaterThan(b.index);
    expect(b.index).toBeGreaterThan(0);
    expect(ev(["g_evac_order", "m_buildup", "i_pretext"]).index).toBeGreaterThanOrEqual(a.index);
  });
  it("위기 지수 하나에서 단계·확률이 나온다: 구간과 단계가 일치하고, 다섯 묶음의 몫을 더하면 지수", () => {
    for (const on of [[], ["g_evac_order"], ["i_pretext", "f_fx", "m_gps_ew"], ["i_leader_threat", "i_pretext", "m_alert_level", "m_strategic_assets", "g_ultimatum"], IDS]) {
      const p = ev(on);
      expect(p.phase).toBe(p.index >= INDEX_AT[4] ? 4 : p.index >= INDEX_AT[3] ? 3 : p.index >= INDEX_AT[2] ? 2 : 1);
      expect(p.parts.reduce((a, x) => a + x.pts, 0)).toBe(p.index);
      expect(p.clashPct).toBe(clashOfIndexOld(p.index, p.quiet.clashPct));
    }
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
    for (const id of ALL_IDS) expect(AUTO_IDS.has(id) || !!ANALYST_GUIDE[id], id).toBe(true);
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
  it("발사장 인근 열점: 멀거나 약한 것은 세지 않고, 시설 5km 안의 5MW 이상만 약한 신호로 센다", () => {
    const row = (points: { site: string; km: number; frp: number }[]) => [{ id: "thermal.launch_site_hotspots", label: "발사장·시험장 인근 열점", stateLabel: "상승", reading: { value: points.length, state: "elevated", at: NOW, meta: { points } } }] as any;
    expect(autoStatus(row([{ site: "원산 갈마", km: 11.1, frp: 0.25 }]), [], NOW).a_launch_prep.s).toBe("off"); // 11/12 실제 사례
    expect(autoStatus(row([{ site: "동창리", km: 3, frp: 1 }]), [], NOW).a_launch_prep.s).toBe("off");
    expect(autoStatus(row([{ site: "동창리", km: 3, frp: 40 }]), [], NOW).a_launch_prep).toMatchObject({ s: "on", w: 0.5 });
    expect(HOTSPOT).toEqual({ km: 5, frp: 5 });
  });
  it("모르는 id·형식은 버린다", () => {
    expect(Object.keys(parseChecks("x_fake=1 hello g_ultimatum=2 t_deadline=0", NOW).items)).toEqual(["t_deadline"]);
  });
  it("판정: 단계는 징조 세기에서 나온다 · 교전(5단계)은 이전 규칙 그대로", () => {
    const legacy = assessWarRisk({ now: NOW, board: [], briefs: [], patterns: [] });
    const p = assessProximity([], [], NOW);
    const w = withProximity(legacy, p);
    expect(w.phase).toBe(p.rubric.phase);
    expect(w.headline).toMatch(/전쟁 전 징조 9개 중 0개/);
    expect(w.clash30d.point).toBe(clashOf(p.rubric.signs, p.rubric.phase, p.quiet.clashPct));
    expect(w.proximity.waiting).toBeGreaterThan(0);
    expect(withProximity({ ...legacy, phase: 5 }, p).phase).toBe(5);
    // 최근 도발은 '참고 신호'라 판정을 바꾸지 않는다 (북한은 해마다 수십 번 쏜다)
    const prov = [{ at: NOW - 3600_000, headline: "북한, 탄도미사일 발사", isProvocation: true, danger: { level: 3, label: "", reason: "" } }] as any;
    const p2 = assessProximity([], prov, NOW);
    expect(p2.rubric.signs).toBe(p.rubric.signs);
    expect(p2.rubric.layers.find((l) => l.id === "other")!.pts).toBe(1);
    expect(checklistText(p).split("\n").length).toBe(2 + ALL_IDS.length);
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

describe("판정: 전쟁 전 징조 세기 · 조용한 움직임 · 배경 (rubric.ts)", () => {
  const all = (v: "on" | "off") => Object.fromEntries(ALL_IDS.map((id) => [id, { s: v }]));
  const on = (...ids: string[]) => ({ ...all("off"), ...Object.fromEntries(ids.map((k) => [k, { s: "on" as const }])) });
  it("배점이 없다: 모든 항목은 1개로 세고, 징조는 9개, 항목은 겹치지 않는다", () => {
    expect(SIGNS).toHaveLength(9);
    expect(RUBRIC.flatMap((l) => l.groups.flatMap((g) => g.items)).every((i) => i.pts === 1)).toBe(true);
    expect(RUBRIC.find((l) => l.id === "signs")!.groups[0].items.map((i) => i.id).sort()).toEqual([...SIGNS].sort());
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    for (const id of IDS) expect(ALL_IDS, id).toContain(id); // 조사한 가설 33개는 모두 어딘가에 있다
    expect(scoreRubric(all("off"))).toMatchObject({ signs: 0, moves: 0, context: 0, phase: 1, index: 0, waiting: 0 });
  });
  it("단계는 켜진 비율(%)의 구간: 10%부터 긴장 · 25%부터 위기 · 50%부터 임박", () => {
    expect(PCT_AT).toEqual({ 2: 10, 3: 25, 4: 50 });
    const some = (n: number) => on(...ALL_IDS.filter((i) => !RUBRIC.find((l) => l.id === "other")!.groups[0].items.some((x) => x.id === i)).slice(0, n));
    expect(scoreRubric(some(3))).toMatchObject({ index: 8, phase: 1 });
    expect(scoreRubric(some(4))).toMatchObject({ index: 10, phase: 2 });
    expect(scoreRubric(some(9))).toMatchObject({ index: 23, phase: 2 });
    expect(scoreRubric(some(10))).toMatchObject({ index: 26, phase: 3 });
    expect(scoreRubric(some(20))).toMatchObject({ index: 51, phase: 4 });
    expect(scoreRubric(some(39))).toMatchObject({ index: 100, phase: 4 });
    for (let n = 0; n <= 39; n++) { const r = scoreRubric(some(n)); expect(r.phase).toBe(r.index >= 50 ? 4 : r.index >= 25 ? 3 : r.index >= 10 ? 2 : 1); }
  });
  it("약함·미확인은 반 개, 못 본 것은 세지 않고 '확인 대기'", () => {
    const r = scoreRubric({ ...all("off"), i_pretext: { s: "on", w: 0.5 }, m_buildup: { s: "on" }, g_ultimatum: undefined });
    expect(r.signs).toBe(1.5);
    expect(r.waiting).toBe(1);
    expect(scoreRubric({}).waiting).toBe(ALL_IDS.length - RUBRIC.find((l) => l.id === "other")!.max);
  });
  it("기습 감지: 뉴스의 징조는 없는데 측정값 셋이 함께 움직이면 '기습 주의'로 표시한다 (알림은 phasealert 가 보낸다)", () => {
    const three = scoreRubric(on("f_capital_flight", "m_airspace", "f_fx"));
    expect(three).toMatchObject({ signs: 0, moves: 3, surprise: true });
    expect(three.reason).toMatch(/기습 주의/);
    expect(scoreRubric(on("f_capital_flight", "m_airspace")).surprise).toBe(false);
    expect(scoreRubric(on("f_capital_flight", "m_airspace", "f_fx", ...SIGNS.slice(0, 3))).surprise).toBe(false);
  });
  it("배경만 켜져 있어도 비율에 들어간다 — 지금(배경 6개)은 15%로 긴장", () => {
    const ctx = ALL_IDS.filter((i) => i.startsWith("s_") || i.startsWith("w_"));
    const r = scoreRubric(on(...ctx.slice(0, 6)));
    expect(r).toMatchObject({ signs: 0, context: 6, index: 15, phase: 2 });
    expect(r.reason).toMatch(/징조와 실제 움직임은 없고, 불안한 배경 6개/);
  });
  it("참고 신호(9개에 못 든 것)는 판정을 바꾸지 않는다", () => {
    const other = RUBRIC.find((l) => l.id === "other")!.groups[0].items.map((i) => i.id);
    expect(scoreRubric(on(...other))).toMatchObject({ signs: 0, moves: 0, phase: 1 });
  });
  it("배경 항목: 확인이 없으면 코드에 적어 둔 값, 분석관 확인은 45일 유효(다른 신호는 36시간)", () => {
    const s0 = koreaStatus([], [], NOW);
    expect(s0.s_talks.s).toBe(BASE_SEED.items.s_talks.v ? "on" : "off");
    expect(s0.w_us_war.s).toBe(BASE_SEED.items.w_us_war.v ? "on" : "off");
    const c = parseChecks("s_talks=0:남북 연락채널 복원 s_tests=1:ICBM 발사 i_pretext=1:주장 반복 w_us_war=0:종전", NOW);
    const later = koreaStatus([], [], NOW + 40 * 86400_000, c);
    expect(later.s_talks.s).toBe("off");
    expect(later.s_tests.s).toBe("on");
    expect(later.w_us_war.s).toBe("off");
    expect(later.i_pretext.s).toBe("unk");
    expect(BASE_TTL).toBeGreaterThan(30 * 86400_000);
  });
  it("과거 기록과 검산: 징조가 많을수록 전쟁이 많았고, 적게 켜지고 난 전쟁은 모두 기습, 우크라이나 전날은 임박", () => {
    const rec = PRECURSOR_DATA.record;
    const share = (b: { cases: number; wars: number }) => b.wars / b.cases;
    expect(share(rec[2])).toBeGreaterThan(share(rec[1]));
    expect(rec[0].wars).toBe(rec[0].surprise);
    expect(rec.reduce((a, b) => a + b.cases, 0)).toBe(T.cases.W + T.cases.N);
    const a = Object.fromEntries(PRECURSOR_DATA.anchors.map((x) => [x.id, x]));
    expect(a["kr-2018-autumn"].signs).toBe(0);
    expect(a["ukraine-2022"]).toMatchObject({ phase: 4 });
    expect(a["ukraine-2022"].signs).toBeGreaterThanOrEqual(7);
    expect(a["kr-2013-04"].signs).toBeLessThan(5);
    expect(clashOf(0, 1, 1.3)).toBe(1.3);
    expect(clashOf(0, 2, 1.3)).toBe(3);
    expect(clashOf(5, 3, 1.3)).toBe(8);
  });
});
