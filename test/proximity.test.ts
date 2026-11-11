// 규칙 3.0 — 전조 모형과 한반도 적용 (proximity.ts · precursors.ts)
import { describe, expect, it } from "vitest";
import { clashOfIndex, scoreRubric, RUBRIC, BASE_SEED, INDEX_AT as RUBRIC_AT } from "../src/core/rubric.js";
import { ACTION_KEYS, INDEX_AT, MODEL, clashOfIndex as clashOfIndexOld, buildTable, caseEvidence, classOf, evaluate, ordinaryRate, rate, type CaseRecord, type SignalNow } from "../src/core/precursors.js";
import { PRECURSOR_DATA } from "../src/core/precursor_data.js";
import { ALL_IDS, AUTO_IDS, ANALYST_GUIDE, BASE_TTL, assessProximity, checklistText, foldProx, koreaStatus, parseChecks, withProximity } from "../src/core/proximity.js";
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
  it("모르는 id·형식은 버린다", () => {
    expect(Object.keys(parseChecks("x_fake=1 hello g_ultimatum=2 t_deadline=0", NOW).items)).toEqual(["t_deadline"]);
  });
  it("판정: 단계·확률은 위기 지수(채점표)에서 나온다 · 교전(5단계)은 이전 규칙 그대로", () => {
    const legacy = assessWarRisk({ now: NOW, board: [], briefs: [], patterns: [] });
    const p = assessProximity([], [], NOW);
    const w = withProximity(legacy, p);
    expect(w.proximity.index).toBe(p.rubric.index);
    expect(w.phase).toBe(p.rubric.phase);
    expect(w.headline).toMatch(new RegExp(`위기 지수 ${p.index}점`));
    expect(w.clash30d.point).toBe(clashOfIndex(p.index, p.quiet.clashPct));
    expect(w.proximity.waiting).toBeGreaterThan(0);
    expect(withProximity({ ...legacy, phase: 5 }, p).phase).toBe(5);
    expect(withProximity({ ...legacy, phase: 5 }, p).proximity.index).toBe(100);
    // 최근 도발은 '보이는 것' 층의 2점짜리 항목으로 들어간다
    const prov = [{ at: NOW - 3600_000, headline: "북한, 탄도미사일 발사", isProvocation: true, danger: { level: 3, label: "", reason: "" } }] as any;
    const p2 = assessProximity([], prov, NOW);
    expect(p2.index).toBe(p.index + 2);
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

describe("위기 지수 채점표 (rubric.ts)", () => {
  const all = (s: "on" | "off") => Object.fromEntries(ALL_IDS.map((id) => [id, { s }]));
  it("배점: 한반도 바탕 15 + 세계 정세 15 + 보이는 것 25 + 실제 행동 45 = 100, 모두 꺼지면 0, 모두 켜지면 100", () => {
    expect(RUBRIC.map((l) => l.max)).toEqual([15, 15, 25, 45]);
    for (const l of RUBRIC) expect(l.groups.reduce((a, g) => a + g.max, 0), l.id).toBe(l.max);
    for (const g of RUBRIC.flatMap((l) => l.groups)) expect(g.items.reduce((a, i) => a + i.pts, 0), g.id).toBeGreaterThanOrEqual(g.max);
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    expect(scoreRubric(all("off"))).toMatchObject({ index: 0, phase: 1, waiting: 0 });
    expect(scoreRubric(all("on"))).toMatchObject({ index: 100, phase: 4 });
  });
  it("약한 신호는 절반, 못 본 것은 0점이고 '확인 대기'로 센다, 묶음마다 상한", () => {
    expect(scoreRubric({ ...all("off"), g_evac_order: { s: "on", w: 0.5 } }).index).toBe(5);
    const r = scoreRubric({ s_talks: { s: "on" } });
    expect(r.index).toBe(3);
    expect(r.waiting).toBe(ALL_IDS.length - 1);
    // 말·여론은 다 켜져도 7점까지
    expect(scoreRubric({ ...all("off"), i_state_mobilization: { s: "on" }, i_leader_threat: { s: "on" }, i_pretext: { s: "on" }, i_news_surge: { s: "on" }, i_public_anxiety: { s: "on" } }).index).toBe(7);
  });
  it("신호 한 묶음만으로는 위기(35)가 안 되고, 행동 신호 둘 미만이면 임박(60)이 안 된다", () => {
    const base = Object.fromEntries(ALL_IDS.filter((i) => i.startsWith("s_") || i.startsWith("w_")).map((i) => [i, { s: "on" as const }]));
    const one = scoreRubric({ ...all("off"), ...base, g_evac_order: { s: "on" }, g_leave_now: { s: "on" }, g_attacker_evac: { s: "on" } });
    expect(one.index).toBe(RUBRIC_AT[3] - 1); // 바탕 15 + 세계 15 + 사람 18 이지만 신호는 한 묶음뿐
    expect(one.capped).toMatch(/한 묶음/);
    const talk = scoreRubric({ ...all("on"), ...Object.fromEntries(ACTION_KEYS.map((k) => [k, { s: "off" as const }])) });
    expect(talk.index).toBe(RUBRIC_AT[4] - 1);
    expect(talk.capped).toMatch(/실제 행동/);
  });
  it("말과 행동이 어긋나면 한 줄로 알려 준다", () => {
    const seen = ["t_trigger", "t_deadline", "g_ultimatum", "m_alert_level", "i_leader_threat", "i_pretext"];
    expect(scoreRubric({ ...all("off"), ...Object.fromEntries(seen.map((k) => [k, { s: "on" as const }])) }).divergence?.kind).toBe("talk");
    expect(scoreRubric({ ...all("off"), g_evac_order: { s: "on" }, m_buildup: { s: "on" } }).divergence?.kind).toBe("quiet_move");
    expect(scoreRubric(all("off")).divergence).toBeUndefined();
  });
  it("지수 → 확률: 20 = 3%, 35 = 8%, 60 = 20%", () => {
    expect([20, 35, 60].map((i) => clashOfIndex(i, 1.3))).toEqual([3, 8, 20]);
    expect(clashOfIndex(0, 1.3)).toBe(1.3);
    expect(clashOfIndex(100, 1.3)).toBe(26.3);
  });
  it("바탕 항목: 확인이 없으면 코드에 적어 둔 값, 분석관 확인은 45일 유효(다른 신호는 36시간)", () => {
    const s = koreaStatus([], [], NOW);
    expect(s.s_talks.s).toBe(BASE_SEED.items.s_talks.v ? "on" : "off");
    const c = parseChecks("s_talks=0:남북 연락채널 복원 s_tests=1:ICBM 발사 i_pretext=1:주장 반복", NOW);
    const later = koreaStatus([], [], NOW + 40 * 86400_000, c);
    expect(later.s_talks.s).toBe("off");
    expect(later.s_tests.s).toBe("on");
    expect(later.i_pretext.s).toBe("unk");
    // 세계 정세 항목도 같은 방식
    expect(s.w_us_war.s).toBe(BASE_SEED.items.w_us_war.v ? "on" : "off");
    expect(koreaStatus([], [], NOW, parseChecks("w_us_war=0:종전 합의", NOW)).w_us_war.s).toBe("off");
    expect(BASE_TTL).toBeGreaterThan(30 * 86400_000);
  });
  it("과거 시점 검산: 2018년 가을은 평온, 한반도 위기 때는 '실제 행동'이 거의 없었고 우크라이나 전날은 임박", () => {
    const a = Object.fromEntries(PRECURSOR_DATA.anchors.map((x) => [x.id, x.index]));
    expect(a["kr-2018-autumn"]).toBeLessThan(10);
    expect(a["kr-2017-09"]).toBeGreaterThan(a["kr-2018-autumn"] + 15);
    expect(a["ukraine-2022"]).toBeGreaterThanOrEqual(RUBRIC_AT[4]);
    expect(a["kr-2013-04"]).toBeLessThan(RUBRIC_AT[4]);
  });
});
