// 전쟁 근접도 (규칙 3.0) — 한반도의 지금 상태를 전조 가설 33개에 대어 보고(precursors.ts), 단계·확률·근접도를 정한다.
//  ① 자동: 이미 모으는 징후(징후판)와 보도(경보 단어·철수 보도)에서 켜짐/꺼짐을 읽는다.
//  ② 분석관: 자동으로 못 보는 것(협상 결렬·병참 이동·명분 만들기 등)은 AI 분석관이 하루 두 번 확인해 짧은 부호로 남긴다.
//  ③ 쌓기: 하루 한 줄(가설 33글자 + 숫자 넷)만 남긴다 — 그 기록으로 '한반도 평소 빈도'를 고쳐 가므로 쌓일수록 정확해지고,
//     어제·지난주·과거 위기와 같은 눈금으로 견줄 수 있다. 근거: docs/INDICATORS.md 0.22, docs/PRECURSORS.md
import type { BoardRow } from "./state.js";
import type { EventBrief } from "./brief.js";
import { kstDay } from "./store.js";
import { PRECURSOR_DATA } from "./precursor_data.js";
import { MODEL, evaluate, type Obs, type Proximity, type SignalNow } from "./precursors.js";
import { BASE_SEED, RUBRIC, clashOf, scoreRubric, type RubricScore } from "./rubric.js";
import { BANDS, PHASE_LABEL, eventFloors, fmtRiskPct, type Band, type Phase, type WarRisk } from "./warrisk.js";

export const PROX_HIST_KEY = "prox:hist";
export const PROX_CHECKS_KEY = "prox:checks";
/** 분석관 확인이 유효한 시간 — 하루 두 번(8시·20시) 도니 한 번 빠져도 이어지게 */
export const CHECK_TTL = 36 * 3600_000;
export const HIST_DAYS = 400;

/** 분석관이 남기는 확인: 가설 id → 1(켜짐)·0.5(약함·미확인)·0(없음) 과 근거 한 줄 */
export interface AnalystChecks {
  at: number;
  items: Record<string, { v: 0 | 0.5 | 1; ev?: string }>;
}

/** 하루 한 줄. s = 가설 순서대로 2(켜짐)·1(약함)·0(꺼짐)·?(못 봄) */
export interface ProxDay { d: string; s: string; i: number; c: number; w: number; ph: number }
export interface ProxHist {
  v: 1;
  days: ProxDay[];
  /** 한반도 평소 빈도의 재료: 가설 id → [켜진 날, 본 날] (3단계 이상이던 날은 '평소'가 아니라 세지 않는다) */
  base: Record<string, [number, number]>;
  /** base 에 반영한 마지막 날 */
  baseUpTo?: string;
}
export const emptyHist = (): ProxHist => ({ v: 1, days: [], base: {} });

const HYP_IDS = PRECURSOR_DATA.table.hyps.map((h) => h.id);
/** 채점표의 모든 항목 (바탕 6 + 신호) */
export const ALL_IDS = RUBRIC.flatMap((l) => l.groups.flatMap((g) => g.items.map((i) => i.id)));
/** 바탕 항목의 분석관 확인이 유효한 시간 */
export const BASE_TTL = 45 * 86400_000;
const DAY = 86400_000;

/** 자동으로 볼 수 있는 가설 — 나머지는 분석관만 확인할 수 있다 */
export const AUTO_IDS = new Set([
  "g_evac_order", "g_leave_now", "g_staff_restrict", "g_intel_warning", "m_buildup", "m_mobilization", "m_strategic_assets", "m_civil_defense", "m_airspace",
  "m_gps_ew", "m_cyber", "m_border_fire", "m_alert_level", "f_fx", "f_equity", "f_safe_haven", "f_prediction", "f_capital_flight", "i_news_surge", "i_public_anxiety", "t_trigger", "t_provocation", "t_major_test", "a_fleet", "a_launch_prep", "a_nk_dark",
]);

/** 징후판·보도에서 자동으로 읽은 한반도 상태 */
export function autoStatus(board: BoardRow[], briefs: EventBrief[], now: number): Record<string, SignalNow> {
  const by = Object.fromEntries(board.map((b) => [b.id, b])) as Record<string, BoardRow | undefined>;
  const ok = (id: string) => !!by[id]?.reading && by[id]!.stateLabel !== "측정 불가" && !by[id]!.failing;
  const lvl = (id: string) => (!ok(id) ? -1 : by[id]!.reading!.state === "anomalous" ? 2 : by[id]!.reading!.state === "elevated" ? 1 : 0);
  const recent = briefs.filter((b) => now - b.at < 7 * DAY && now - b.at >= -3600_000);
  const wire = (...ids: string[]) => recent.find((b) => b.posture?.some((p) => ids.includes(p.id)));
  const out: Record<string, SignalNow> = {};
  const set = (id: string, s: Obs, w = 1, ev?: string) => { out[id] = { s, ...(s === "on" && w < 1 ? { w } : {}), ...(ev ? { ev: ev.slice(0, 90) } : {}), by: "auto" }; };
  /** 지표 여러 개 중 가장 높은 수준으로: 이상 → 켜짐, 상승 → 약함, 모두 평소 → 꺼짐, 하나도 못 재면 못 봄 */
  const fromIndicators = (id: string, inds: string[], headline?: EventBrief) => {
    const ls = inds.map((x) => ({ x, l: lvl(x) })).filter((r) => r.l >= 0);
    const top = ls.reduce((m, r) => (r.l > m.l ? r : m), { x: "", l: -1 });
    if (headline) return set(id, "on", 1, headline.headline);
    if (top.l === 2) return set(id, "on", 1, `${by[top.x]!.label} 이상`);
    if (top.l === 1) return set(id, "on", 0.5, `${by[top.x]!.label} 상승`);
    set(id, ls.length ? "off" : "unk");
  };
  // ── 정부·외교 ──
  const evac = recent.filter((b) => b.evacuation);
  if (lvl("official.us_departure_kr") === 2 || evac.some((b) => b.evacuation === "confirmed")) set("g_evac_order", "on", 1, evac[0]?.headline ?? "미 국무부 주한 대사관 철수·출국 권고");
  else if (evac.some((b) => b.evacuation === "official")) set("g_evac_order", "on", 0.5, evac[0].headline);
  else set("g_evac_order", ok("official.us_departure_kr") ? "off" : "unk");
  const adv = ["official.us_travel_level_kr", "official.ca_level_kr", "official.jp_risk_level_kr", "official.de_warning_kr"];
  const advHot = adv.filter((x) => lvl(x) === 2), advUp = adv.filter((x) => lvl(x) >= 1);
  if (advHot.length) set("g_leave_now", "on", 1, `${by[advHot[0]]!.label} 최고 수준`);
  else if (advUp.length >= 2) set("g_leave_now", "on", 0.5, `여행경보 상향 ${advUp.length}개국`);
  else set("g_leave_now", adv.some(ok) ? "off" : "unk");
  fromIndicators("g_staff_restrict", ["official.jp_embassy_alert"]);
  fromIndicators("g_intel_warning", [], wire("us_intel_warning"));
  if (!out.g_intel_warning || out.g_intel_warning.s === "unk") set("g_intel_warning", "off");
  // ── 군사 ──
  const wired = (id: string, ...ids: string[]) => { const b = wire(...ids); set(id, b ? "on" : "off", 1, b?.headline); };
  wired("m_buildup", "nk_forward_deploy");
  wired("m_mobilization", "kr_mobilization");
  wired("m_cyber", "cyber_alert");
  wired("m_alert_level", "defcon_up", "watchcon_up", "defense_situation_a", "defense_situation", "nk_war_posture");
  fromIndicators("m_strategic_assets", ["air.isr_airborne", "air.mil_airborne"]);
  if (out.m_strategic_assets.s === "on") out.m_strategic_assets.w = 0.5; // 군용기 수만으로는 '전략자산 집결'의 약한 근거
  fromIndicators("m_civil_defense", ["official.civil_defense_alerts_6h"], wire("nk_border_evacuation"));
  fromIndicators("m_airspace", ["air.civil_airborne"], wire("airlines_suspend", "war_insurance"));
  if (out.m_airspace.s === "on" && !wire("airlines_suspend", "war_insurance")) out.m_airspace.w = 0.5;
  fromIndicators("m_gps_ew", ["gnss.bad_ratio_korea", "gnss.bad_ratio_westsea", "gnss.bad_ratio_north"]);
  fromIndicators("m_border_fire", ["border.incidents_72h", "official.mnd_provocation_24h"]);
  // ── 돈 ──
  fromIndicators("f_fx", ["market.usdkrw_change_pct"]);
  fromIndicators("f_equity", ["market.kr_equity_rel_pct"]);
  // 방산주가 같이 빠진 '한국만 하락'은 업종·세계 증시 요인일 가능성이 커서 약하게만 (warrisk.ts 와 같은 이유)
  if (out.f_equity.s === "on" && lvl("market.defense_rel_pct") <= 0 && lvl("market.pm_war_prob") <= 0) out.f_equity.w = 0.5;
  fromIndicators("f_safe_haven", ["market.defense_rel_pct"]);
  fromIndicators("f_prediction", ["market.pm_war_prob"]);
  const fn = lvl("elite.foreign_net_kospi"), bj = lvl("elite.kr_bizjets"), firms = wire("firms_evacuate");
  if (firms) set("f_capital_flight", "on", 1, firms.headline);
  else if (fn >= 1 && bj >= 1) set("f_capital_flight", "on", 1, "외국인 대량 매도와 기업 제트기 출국이 함께");
  else if (fn === 2 || bj === 2) set("f_capital_flight", "on", 0.5, fn === 2 ? "외국인 대량 매도" : "기업 제트기 출국 급증");
  else set("f_capital_flight", fn >= 0 || bj >= 0 ? "off" : "unk");
  // ── 말·여론 ──
  fromIndicators("i_news_surge", ["media.war_talk_24h", "psych.wiki_korea_attention"]);
  fromIndicators("i_public_anxiety", ["psych.naver_war_search"]);
  // ── 계기 ──
  const trigger = briefs.find((b) => now - b.at < 14 * DAY && !b.evacuation && !b.posture && b.danger.level >= 5);
  set("t_trigger", trigger ? "on" : "off", 1, trigger?.headline);
  // 채점표의 사건 항목: 최근 7일 도발 · 최근 30일 핵실험/ICBM급 (우리가 가진 사건 기록 안에서)
  // 실제 발사·포격만 센다 (인터넷 장애 같은 위험도 높은 다른 사건이 '도발'로 적히던 문제 — 11/12)
  const prov = eventFloors(briefs, now).prov7.filter((b) => b.isProvocation && b.danger.level >= 2); // 위험도 '관심'(1)은 발사·포격이 아니다 — 북한 인터넷 장애 경보가 여기 걸렸다
  set("t_provocation", prov.length ? "on" : "off", 1, prov.length ? `최근 7일 도발 ${prov.length}건 — ${[...prov].sort((a, b) => b.at - a.at)[0].headline}` : undefined);
  const big = briefs.find((b) => now - b.at < 30 * DAY && !b.evacuation && !b.posture && /ICBM|대륙간탄도|핵실험|nuclear test/i.test(`${b.headline} ${b.weapon ?? ""}`));
  set("t_major_test", big ? "on" : "off", 1, big?.headline);
  // 실제 행동 측정값 중 가설 33개에 없던 것
  fromIndicators("a_fleet", ["sea.gfw_cn_change_pct"]);
  fromIndicators("a_launch_prep", ["navwarn.launch_notice_active", "thermal.launch_site_hotspots"]);
  fromIndicators("a_nk_dark", ["internet.kp_outage_alerts_24h", "nk.pyongyang_lights_pct"]);
  return out;
}

/** 자동 + 분석관. 분석관의 '켜짐'은 그대로, 자동이 켠 것을 분석관이 '없음'이라 하면 약함으로만 낮춘다(사실 자료를 말로 끄지 않게) */
export function koreaStatus(board: BoardRow[], briefs: EventBrief[], now: number, checks?: AnalystChecks): Record<string, SignalNow> {
  const st = autoStatus(board, briefs, now);
  const age = checks ? now - checks.at : Infinity;
  for (const id of ALL_IDS) {
    const isBase = id.startsWith("s_") || id.startsWith("w_");
    // 분석관 확인: 날마다 변하는 신호는 36시간, 천천히 변하는 바탕 항목은 45일 유효. 바탕은 확인이 없으면 코드에 적어 둔 값(BASE_SEED)
    const c = checks && age < (isBase ? BASE_TTL : CHECK_TTL) ? checks.items[id] : undefined, a = st[id];
    if (!c) {
      const seed = isBase ? BASE_SEED.items[id] : undefined;
      if (seed) st[id] = { s: seed.v ? "on" : "off", ...(seed.v === 0.5 ? { w: 0.5 } : {}), ev: seed.ev.slice(0, 120), by: "analyst" };
      else if (!a) st[id] = { s: "unk" };
      continue;
    }
    const ev = c.ev?.slice(0, 90);
    if (c.v > 0) {
      if (a?.s === "on" && (a.w ?? 1) >= c.v) continue;
      st[id] = { s: "on", ...(c.v < 1 ? { w: c.v } : {}), ev: ev ?? a?.ev, by: "analyst" };
    } else if (a?.s === "on") st[id] = { ...a, w: 0.5, ev: `${a.ev ?? ""}${ev ? ` — 분석관: ${ev}` : ""}`.slice(0, 120) };
    else st[id] = { s: "off", by: "analyst", ...(ev ? { ev } : {}) };
  }
  // 대화 채널이 아예 없으면 '협상 결렬'은 일어날 수 없다 — 꺼짐으로 둔다 (코드북: 협상 자체가 없었으면 '없음')
  if (st.g_talks_collapse?.s === "unk" && st.s_talks?.s === "on" && (st.s_talks.w ?? 1) >= 1) st.g_talks_collapse = { s: "off", by: "auto", ev: "진행 중인 협상이 없음" };
  return st;
}

export interface ProximityView extends Proximity {
  /** 어제·7일 전·30일 전과의 차이 (근접도 점수) */
  vs: { d1?: number; d7?: number; d30?: number; days: number };
  /** 주식 차트처럼: 하루 한 점 (오래된 → 최근) */
  series: { d: string; i: number; c: number }[];
  /** 과거 사례를 같은 눈금에 놓은 기준점 */
  anchors: { name: string; when: string; index: number; cls: string; signs: number; moves: number; context: number }[];
  /** 쌓인 기록으로 평소 빈도를 고친 날 수 */
  learnedDays: number;
  /** 분석관 확인 시각 (없거나 오래됐으면 undefined) */
  checkedAt?: number;
  /** 분석관만 볼 수 있는데 아직 확인이 없는 가설 수 */
  waiting: number;
  /** 채점표 결과 — 화면의 점수·층·항목은 모두 여기서 나온다 */
  rubric: RubricScore;
  /** 과거 기록: 징조 수 구간별 사례 수와 그중 전쟁으로 간 수 */
  record: typeof PRECURSOR_DATA.record;
  score: typeof PRECURSOR_DATA.score;
  cases: typeof PRECURSOR_DATA.table.cases;
  text: string;
}

/** 지금 징조 수가 속한 과거 기록 구간 */
export const recordFor = (signs: number) => PRECURSOR_DATA.record.find((b) => Math.floor(signs) >= b.lo && Math.floor(signs) <= b.hi);

const dayAgo = (now: number, n: number) => kstDay(now - n * DAY);

export function assessProximity(board: BoardRow[], briefs: EventBrief[], now: number, hist?: ProxHist, checks?: AnalystChecks): ProximityView {
  const status = koreaStatus(board, briefs, now, checks);
  // 사례집 통계(가설별 '전쟁 몇 건 중 몇 건')는 항목 설명용으로만 쓴다. 점수·단계·확률은 채점표(rubric.ts)가 정한다
  const p0 = evaluate(PRECURSOR_DATA.table, status, hist?.base, PRECURSOR_DATA.anchorLogOdds);
  const r = scoreRubric(status);
  const clashPct = clashOf(r.signs, r.phase, p0.quiet.clashPct);
  const warPct = +Math.min(clashPct, p0.quiet.warPct + Math.max(0, clashPct - p0.quiet.clashPct) * (MODEL.Q_WAR / MODEL.Q_CLASH)).toFixed(clashPct < 5 ? 2 : 1);
  const p = { ...p0, index: r.index, phase: r.phase, clashPct, warPct, on: Math.ceil(r.signs + r.moves), watched: r.watched, parts: r.layers.map((l) => ({ cluster: "G" as const, label: l.label, pts: l.pts })) };
  const days = hist?.days ?? [];
  const at = (n: number) => days.find((x) => x.d === dayAgo(now, n));
  const diff = (n: number) => { const x = at(n); return x ? p.index - x.i : undefined; };
  const today = kstDay(now);
  const series = [...days.filter((x) => x.d !== today).map((x) => ({ d: x.d, i: x.i, c: x.c })), { d: today, i: p.index, c: p.clashPct }].slice(-120);
  const d1 = diff(1);
  const rec = recordFor(r.signs);
  const text =
    `전쟁 전 징조 9개 중 ${r.signs}개 · 조용한 움직임 ${r.moves}개 · 배경 ${r.context}개. ${r.reason}.` +
    (rec ? ` 과거 기록: 징조가 ${rec.label} 켜졌던 ${rec.cases}건 중 ${rec.wars}건이 전쟁으로 갔다${rec.surprise ? ` — 그 ${rec.surprise}건은 공개 징조 없이 온 기습` : ""} (조사한 사례 안에서 — 확률이 아니다).` : "") +
    (d1 === undefined ? "" : d1 === 0 ? " 어제와 같아요." : ` 어제보다 징조가 ${d1 > 0 ? "늘었어요" : "줄었어요"}.`);
  return {
    ...p,
    vs: { d1, d7: diff(7), d30: diff(30), days: days.length },
    series,
    anchors: PRECURSOR_DATA.anchors.map(({ name, when, index, cls, signs, moves, context }) => ({ name, when, index, cls, signs, moves, context })),
    learnedDays: days.length,
    checkedAt: checks && now - checks.at < CHECK_TTL ? checks.at : undefined,
    waiting: r.waiting,
    rubric: r,
    record: PRECURSOR_DATA.record,
    score: PRECURSOR_DATA.score,
    cases: PRECURSOR_DATA.table.cases,
    text,
  };
}


/**
 * 판정: 단계·확률은 위기 지수(채점표) 하나에서 나온다. 교전(5단계)만 이전 규칙의 사건 판정을 그대로 쓴다 — 그때 지수는 100.
 * 영역 수준 같은 옛 설명은 그대로 남겨 두지만 화면에는 쓰지 않는다.
 */
export function withProximity(legacy: WarRisk, prox: ProximityView, _briefs: EventBrief[] = [], _now = 0): WarRisk & { proximity: ProximityView } {
  if (legacy.phase === 5) return { ...legacy, proximity: { ...prox, index: 100 } };
  const phase = prox.phase as Phase, clash = prox.clashPct, war = prox.warPct;
  const r = prox.rubric;
  const pos = Math.min(0.95, Math.max(0.05, (r.signs % 2) / 2 + 0.25));
  const band = (a: number, b: number, point: number): Band => ({ low: +Math.min(a, point).toFixed(2), high: +Math.max(b, point).toFixed(2), point: +point.toFixed(2) });
  const onOf = (id: string) => r.layers.find((l) => l.id === id)!.groups.flatMap((x) => x.items).filter((x) => x.got > 0).map((x) => `${x.ko.split(" (")[0]}${x.weak ? "(약함)" : ""}`);
  const reasons = [
    r.reason,
    ...(onOf("signs").length ? [`켜진 징조: ${onOf("signs").join(", ")}`] : []),
    ...(onOf("moves").length ? [`조용한 움직임: ${onOf("moves").slice(0, 4).join(", ")}`] : ["사람·돈·군의 움직임은 평소대로"]),
    ...(onOf("context").length ? [`배경: ${onOf("context").slice(0, 4).join(", ")}${onOf("context").length > 4 ? " 등" : ""}`] : []),
  ];
  return {
    ...legacy,
    phase,
    phaseLabel: PHASE_LABEL[phase],
    phaseReasons: reasons,
    clash30d: band(BANDS[phase].clash[0], BANDS[phase].clash[1], clash),
    war30d: band(BANDS[phase].war[0], BANDS[phase].war[1], war),
    usual: { clash: prox.quiet.clashPct, war: prox.quiet.warPct },
    gauge: { now: +((phase - 1 + pos) / 5).toFixed(3), usual: 0.01 },
    vsUsual: +(clash / Math.max(0.1, prox.quiet.clashPct)).toFixed(2),
    headline: `전쟁 전 징조 9개 중 ${r.signs}개 · ${phase}단계(${PHASE_LABEL[phase]}) — 앞으로 30일 국지 충돌 약 ${fmtRiskPct(clash)}, 전면전 ${fmtRiskPct(war)}`,
    proximity: prox,
  };
}

const code = (s?: SignalNow) => (!s || s.s === "unk" ? "?" : s.s === "off" ? "0" : (s.w ?? 1) < 1 ? "1" : "2");
const worse = (a: string, b: string) => { const r = "?012"; return r.indexOf(a) >= r.indexOf(b) ? a : b; };

/** 오늘 줄을 고친다(그날 가장 높았던 상태). 날이 바뀌면 지난 날들을 '평소 빈도' 재료에 더한다. 바뀐 것이 없으면 changed=false */
export function foldProx(hist: ProxHist | undefined, prox: Proximity, phase: number, now: number): { hist: ProxHist; changed: boolean } {
  const h: ProxHist = hist ? { ...hist, days: [...hist.days], base: { ...hist.base } } : emptyHist();
  const d = kstDay(now);
  const s = HYP_IDS.map((id) => code(prox.signals.find((x) => x.id === id) as SignalNow | undefined)).join("");
  let changed = false;
  // 지난 날을 평소 빈도에 반영 (하루에 한 번)
  for (const day of h.days) {
    if (day.d >= d || (h.baseUpTo && day.d <= h.baseUpTo)) continue;
    if (day.ph <= 2) HYP_IDS.forEach((id, k) => {
      const ch = day.s[k];
      if (!ch || ch === "?") return;
      const [on, obs] = h.base[id] ?? [0, 0];
      h.base[id] = [on + (ch === "2" ? 1 : ch === "1" ? 0.5 : 0), obs + 1];
    });
    h.baseUpTo = day.d;
    changed = true;
  }
  const i = h.days.findIndex((x) => x.d === d);
  const cur = i >= 0 ? h.days[i] : undefined;
  const next: ProxDay = cur
    ? { d, s: s.split("").map((ch, k) => worse(ch, cur.s[k] ?? "?")).join(""), i: Math.max(cur.i, prox.index), c: Math.max(cur.c, prox.clashPct), w: Math.max(cur.w, prox.warPct), ph: Math.max(cur.ph, phase) }
    : { d, s, i: prox.index, c: prox.clashPct, w: prox.warPct, ph: phase };
  if (!cur || JSON.stringify(cur) !== JSON.stringify(next)) changed = true;
  if (i >= 0) h.days[i] = next; else h.days.push(next);
  if (h.days.length > HIST_DAYS) h.days = h.days.slice(-HIST_DAYS);
  return { hist: h, changed };
}

type Kv = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };
export async function loadProx(store: Kv): Promise<{ hist?: ProxHist; checks?: AnalystChecks }> {
  const [h, c] = await Promise.all([store.getKv(PROX_HIST_KEY), store.getKv(PROX_CHECKS_KEY)]);
  return { hist: h ? (JSON.parse(h) as ProxHist) : undefined, checks: c ? (JSON.parse(c) as AnalystChecks) : undefined };
}
/** 5분 주기에서: 오늘 줄이 달라졌을 때만 쓴다 */
export async function recordProx(store: Kv, prox: Proximity, phase: number, now: number, hist?: ProxHist): Promise<boolean> {
  const r = foldProx(hist, prox, phase, now);
  if (r.changed) await store.setKv(PROX_HIST_KEY, JSON.stringify(r.hist));
  return r.changed;
}

/** 분석관 부호 한 줄을 읽는다: "g_ultimatum=0 g_talks_collapse=1:북미 실무회담 결렬 선언(11/9) m_logistics=0.5:…" — 근거는 다음 id= 앞까지 */
export function parseChecks(text: string, now: number): AnalystChecks {
  const items: AnalystChecks["items"] = {};
  const re = /([a-z]_[a-z_]+)\s*=\s*(1|0\.5|0)(?![\d.])(?::([^\n]*?))?(?=\s+[a-z]_[a-z_]+\s*=|\s*$)/gm;
  for (const m of text.matchAll(re)) {
    if (!ALL_IDS.includes(m[1])) continue;
    const ev = m[3]?.trim();
    items[m[1]] = { v: Number(m[2]) as 0 | 0.5 | 1, ...(ev ? { ev: ev.slice(0, 90) } : {}) };
  }
  return { at: now, items };
}

/** 분석관만 확인할 수 있는 가설의 확인 방법 한 줄 (자동으로는 못 본다) */
export const ANALYST_GUIDE: Record<string, string> = {
  g_regional_drawdown: "주일미군 가족·주변국 공관 인력 감축, 평양 주재 공관 철수 권고",
  g_attacker_evac: "북한·중국·러시아가 한국·개성·접경에서 자기 사람을 뺌",
  g_ultimatum: "시한 달린 최후통첩, 무력사용 공식 승인, 단교·대사 소환",
  g_talks_collapse: "진행 중이던 남북·북미 대화 채널이 공식 결렬·중단 선언",
  m_logistics: "야전병원·혈액·연료·탄약의 전방 이동 보도 (병력 수만은 아님)",
  m_exercise_cover: "훈련 병력이 끝난 뒤에도 전방에 남거나 예고 없는 훈련 연장",
  m_leadership: "지도부의 벙커·전시지휘소 이동, 잠적, 비상 안보회의 연속",
  f_sovereign: "한국 CDS·국채 금리가 전쟁 위험을 이유로 급등",
  i_leader_threat: "김정은 본인의 명시적 위협·명분 연설 (대변인 담화는 아님)",
  i_pretext: "'도발·학살' 주장, 자작극 의혹, '우리 국민 보호' 서사가 평소보다 격해짐",
  i_state_mobilization: "북한 관영매체의 전시 동원 서사 (입대 탄원 군중대회, 준전시 선포 보도)",
  t_deadline: "공개된 시한·날짜 조건의 만료가 임박",
  w_us_war: "(세계·한 달에 한 번) 미국이 한반도 밖에서 전쟁·대규모 군사작전을 하고 있나",
  w_us_assets_out: "(세계) 주한미군·인도태평양 전력(사드·패트리엇·항모·탄약)이 다른 곳으로 빠져 있나",
  w_patron_war: "(세계) 러시아·중국이 전쟁 중이거나 북한이 파병했나",
  w_taiwan: "(세계) 대만해협·동중국해에 봉쇄·대규모 포위 훈련 같은 군사 위기가 있나",
  w_nuclear: "(세계) 강대국의 핵 위협, 핵실험 재개, 군비통제 조약 붕괴가 있나",
  w_markets: "(세계) 금·유가·변동성 지수가 전쟁 공포로 급등했나",
  s_talks: "(바탕·한 달에 한 번) 남북·북미 사이에 열려 있는 대화 채널이 하나도 없나",
  s_agreement: "(바탕) 9·19 군사합의 등 충돌 방지 합의가 파기·효력 정지 상태인가",
  s_doctrine: "(바탕) 북한이 한국을 적대국으로 규정했거나 핵 선제사용을 법에 명시했나",
  s_friction: "(바탕) 확성기·전단·풍선·GPS 교란 같은 접경 마찰이 몇 달째 이어지나",
  s_tests: "(바탕) 최근 12개월 안에 핵실험이나 ICBM급 발사가 있었나",
  s_casualty: "(바탕) 최근 5년 안에 사상자가 난 남북 충돌이 있었나",
};

/** 분석관에게 주는 점검표 — 짧은 줄로 (토큰 절약) */
export function checklistText(p: ProximityView): string {
  const mark = (x: { s: Obs; weak: boolean }) => (x.s === "on" ? (x.weak ? "약함" : "켜짐") : x.s === "off" ? "꺼짐" : "미확인");
  const lines = p.rubric.layers.flatMap((l) => l.groups.flatMap((gr) => gr.items.map((x) => {
    const guide = ANALYST_GUIDE[x.id];
    return `${x.id} | ${l.label}·${gr.label} | ${x.ko} | ${mark(x)}${x.by === "analyst" ? "(분석관)" : ""}${x.ev ? ` | ${x.ev}` : ""}${guide ? ` | 확인: ${guide}` : ""}`;
  })));
  return [
    `전쟁 전 징조 9개 중 ${p.rubric.signs}개 · 조용한 움직임 ${p.rubric.moves}개 · 배경 ${p.rubric.context}개 · ${p.phase}단계 · 확인 대기 ${p.waiting}개`,
    "id | 구분 | 항목 | 지금 | 근거 | 확인 방법(분석관 전용 항목)",
    ...lines,
  ].join("\n");
}
