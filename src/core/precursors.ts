// 전조 모델 (규칙 3.0, 2026-11-11) — 실제 전쟁·공격 직전에 공개적으로 보였던 전조를 사례집에서 세어, 지금 한반도의 신호 조합이
// '평소' · '전쟁 안 나는 위기' · '국지 충돌 직전' · '전쟁 직전' 중 어디에 가까운지 계산한다.
//
// 왜 이렇게 하나 (11/6 채점 결과): 규칙 1.0·2.0 은 외국 전쟁 10건 중 3건만 미리 잡았고(정부 여행경보 자료가 있던 사례뿐),
// 한반도 10년 재생에서는 큰 도발을 미리 내다본 적이 없었다. 시장·검색·위키만으로는 0건 — 신호를 '몇 개 켜졌나'로 더하는 방식의 한계.
// 그래서 신호마다 "전쟁 사례 몇 건 중 몇 건에서 보였나 ÷ 전쟁 안 난 위기 몇 건 중 몇 건에서 보였나"를 가중치로 쓴다(우도비).
//
// 계산 (나이브 베이즈 + 세 가지 보정):
//   상태 X ∈ {위기(C) · 국지 충돌 직전(K) · 전쟁 직전(W)} 마다, 신호 k 가 켜졌을 때 λ = P(k|X) / P(k|평소), 꺼졌을 때 (1−P(k|X)) / (1−P(k|평소)).
//   ① 기습: 전쟁·충돌의 일부(사례집에서 센 비율 s)는 공개 전조 없이 온다 — 그 몫은 신호가 조용해도 줄지 않는 바닥으로 남는다.
//   ② 겹침: 같은 묶음(정부·군사·돈·말·계기) 안의 신호는 서로 따라 움직이므로 가장 센 것 1, 다음 0.5, 0.25 … 로 깎아 더한다.
//   ③ 한 신호의 힘에 상한(CAP)을 두고, 3단계 이상은 두 묶음 이상이 켜져야 한다(신호 하나로 '위기'가 되지 않게 — CLAUDE.md).
//   P(k|평소) 는 한반도에서 매일 쌓이는 기록으로 갱신된다(쌓일수록 정확): 평소에도 자주 켜지는 신호는 저절로 힘이 빠진다.
// 근거·성적표: docs/PRECURSORS.md (자동 생성), 자료: data/precursors/

export type ClusterId = "G" | "M" | "F" | "I" | "T";
export const CLUSTER_LABEL: Record<ClusterId, string> = { G: "정부·외교", M: "군사 준비", F: "돈", I: "말·여론", T: "계기" };
export const CLUSTERS: ClusterId[] = ["G", "M", "F", "I", "T"];

export interface HypDef {
  id: string;
  cluster: ClusterId;
  ko: string;
}

export interface CaseSignal {
  h: string;
  status: "yes" | "no" | "unknown";
  first?: string | null;
  /** 개시일까지 남은 날 수 (전쟁 안 난 사례는 null) */
  lead?: number | null;
  /** 개시 전에 공개적으로 알 수 있었나 */
  public_then?: boolean;
  what?: string;
  source?: string;
  confidence?: string;
}

export interface CaseRecord {
  id: string;
  name: string;
  outcome: "war" | "attack" | "no_war" | "unverified";
  onset: string | null;
  window?: [string, string];
  kind?: string;
  surprise?: boolean;
  summary?: string;
  signals: CaseSignal[];
  missed?: string;
}

/** 사례의 분류: W = 전쟁·대규모 공격 · K = 한반도 국지 충돌 · N = 전쟁 안 난 위기 · X = 계산에서 뺌(내전·미확인) */
export type CaseClass = "W" | "K" | "N" | "X";
export function classOf(c: Pick<CaseRecord, "outcome" | "kind">): CaseClass {
  if (c.outcome === "no_war") return "N";
  if (c.outcome !== "war" && c.outcome !== "attack") return "X";
  if (c.kind === "intrastate") return "X";
  return c.kind === "korean_clash" ? "K" : "W";
}

export type Obs = "on" | "off" | "unk";

/**
 * 사례에서 개시 d일 전(d=1 은 전날) 시점에 '공개적으로' 보였던 신호.
 * 전쟁 뒤에야 밝혀진 것(public_then=false)과 아직 나타나지 않은 것은 off — 공개 정보로 잡을 수 있었던 것만 센다.
 */
export function caseEvidence(c: CaseRecord, daysBefore = 1): Record<string, Obs> {
  const out: Record<string, Obs> = {};
  for (const s of c.signals) {
    if (s.status === "unknown") { out[s.h] = "unk"; continue; }
    if (s.status === "no") { out[s.h] = "off"; continue; }
    if (s.public_then === false) { out[s.h] = "off"; continue; }
    out[s.h] = c.onset && typeof s.lead === "number" && s.lead < daysBefore ? "off" : "on";
  }
  return out;
}

export interface HypStat {
  id: string;
  cluster: ClusterId;
  ko: string;
  /** 전쟁·대규모 공격(예고된 것) 사례: 보인 수 / 확인된 수 */
  w: [number, number];
  /** 전쟁 안 난 위기: 보인 수 / 확인된 수 */
  n: [number, number];
  /** 한반도 국지 충돌(예고된 것): 보인 수 / 확인된 수 */
  k: [number, number];
  /** 전쟁 사례에서 처음 보인 날의 중앙값 (개시 며칠 전) */
  lead: number | null;
  /** 화면에 보일 대표 사례 (최대 3) */
  ex: string[];
}

export interface PrecursorTable {
  version: number;
  built: string;
  /** 사례 수: 전쟁·공격 / 그중 기습 / 한반도 충돌 / 그중 기습 / 전쟁 안 난 위기 */
  cases: { W: number; Wsurprise: number; K: number; Ksurprise: number; N: number };
  hyps: HypStat[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

/** 사례집 → 가설별 집계표. 기습 사례는 '예고된' 집계에서 빼고 기습 비율로만 센다 */
export function buildTable(cases: CaseRecord[], hyps: HypDef[], built = new Date().toISOString().slice(0, 10)): PrecursorTable {
  const cls = cases.map((c) => ({ c, k: classOf(c), ev: caseEvidence(c, 1) }));
  const of = (k: CaseClass, surprise?: boolean) => cls.filter((x) => x.k === k && (surprise === undefined || !!x.c.surprise === surprise));
  const count = (set: typeof cls, h: string): [number, number] => {
    let on = 0, known = 0;
    for (const x of set) { const o = x.ev[h]; if (o === "on") { on++; known++; } else if (o === "off") known++; }
    return [on, known];
  };
  const Wt = of("W", false), Kt = of("K", false), N = of("N");
  return {
    version: 1,
    built,
    cases: { W: of("W").length, Wsurprise: of("W", true).length, K: of("K").length, Ksurprise: of("K", true).length, N: N.length },
    hyps: hyps.map((h) => {
      const leads = Wt.map((x) => x.c.signals.find((s) => s.h === h.id)).filter((s) => s && s.status === "yes" && s.public_then !== false && typeof s.lead === "number").map((s) => s!.lead as number);
      const ex = Wt.filter((x) => x.ev[h.id] === "on")
        .map((x) => ({ name: x.c.name, lead: x.c.signals.find((s) => s.h === h.id)?.lead }))
        .slice(0, 3)
        .map((e) => (typeof e.lead === "number" ? `${e.name} (${e.lead}일 전)` : e.name));
      return { id: h.id, cluster: h.cluster, ko: h.ko, w: count(Wt, h.id), n: count(N, h.id), k: count(Kt, h.id), lead: median(leads), ex };
    }),
  };
}

// ── 모형의 고정값 (사례를 보기 전에 정했다 — 사례에 맞춰 고치지 않는다. docs/PRECURSORS.md '고정값') ──
export const MODEL = {
  /** 한 신호가 낼 수 있는 가장 큰 배수 */
  CAP: 12,
  /** 같은 묶음 안에서 두 번째 신호부터 깎는 비율 (1, 0.5, 0.25 …) */
  DAMP: 0.5,
  /** 30일 안 국지 충돌(교전·영토 공격) 기저율: 1999~2026년 8번 → 연 0.3번 → 30일 약 2% */
  P_CLASH: 0.02,
  /** 30일 안 전면전·대규모 공격 기저율: 1953년 이후 0번, 구조적 위험을 연 1% 안팎으로 본 판단값 (docs/INDICATORS.md 0) */
  P_WAR: 0.001,
  /** 한반도가 '전쟁 안 나는 위기' 상태인 날의 비율 (1994·2010·2013·2015·2017·2020·2024 위기 기간 ÷ 전체, 약 5%) */
  P_CRISIS: 0.05,
  /** 평소 빈도 사전값의 무게 (며칠 치 기록과 같게 치나) */
  BASE_PRIOR_DAYS: 200,
  /** 단계 문턱: 30일 국지 충돌 % */
  PHASE: { 2: 3, 3: 8, 4: 25 } as Record<number, number>,
} as const;

/**
 * 한반도 '평소'에 이 신호가 켜져 있는 날의 비율 — 사전값(1000일 중 며칠). 근거는 과거 30년의 위기 기록에 대한 판단이고,
 * 매일 쌓이는 실제 기록(base)이 이 값을 덮어 쓴다. 사전값이 틀려도 기록이 200일쯤 쌓이면 절반은 실제 값이 된다.
 */
export const BASE_HINT: Record<string, number> = {
  g_evac_order: 1, g_leave_now: 1, g_staff_restrict: 5, g_regional_drawdown: 1, g_attacker_evac: 1, g_intel_warning: 2, g_ultimatum: 5, g_talks_collapse: 20,
  m_buildup: 5, m_logistics: 2, m_mobilization: 2, m_exercise_cover: 10, m_strategic_assets: 150, m_civil_defense: 10, m_airspace: 3, m_gps_ew: 60, m_cyber: 20,
  m_border_fire: 80, m_alert_level: 40, m_leadership: 20,
  f_fx: 50, f_equity: 50, f_sovereign: 20, f_safe_haven: 50, f_prediction: 30, f_capital_flight: 10,
  i_leader_threat: 150, i_pretext: 100, i_state_mobilization: 30, i_news_surge: 100, i_public_anxiety: 100,
  t_trigger: 10, t_deadline: 10,
};

const jeff = ([x, n]: [number, number]) => (x + 0.5) / (n + 1);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 한반도 평소 빈도: 사전값 + 쌓인 기록 [켜진 날, 본 날] */
export function ordinaryRate(id: string, base?: Record<string, [number, number]>): number {
  const hint = (BASE_HINT[id] ?? 20) / 1000;
  const [on, obs] = base?.[id] ?? [0, 0];
  return clamp((hint * MODEL.BASE_PRIOR_DAYS + on) / (MODEL.BASE_PRIOR_DAYS + obs), 0.002, 0.6);
}

export interface SignalNow {
  s: Obs;
  /** 0~1: 1 = 확인됨, 0.5 = 약함(제목만·미확인) */
  w?: number;
  /** 근거 한 줄 */
  ev?: string;
}

export interface SignalView {
  id: string;
  cluster: ClusterId;
  ko: string;
  s: Obs;
  weak: boolean;
  ev?: string;
  /** 켜졌을 때 '전쟁 직전' 쪽으로 미는 배수 (위기 대비) — 화면 "×N" */
  lr: number;
  w: [number, number];
  n: [number, number];
  lead: number | null;
  ex: string[];
}

export interface Proximity {
  /** 30일 안 무력 충돌(국지 충돌 이상) % · 전면전·대규모 공격 % */
  clashPct: number;
  warPct: number;
  /** 지금 신호 조합이 각 상태일 가능성 % (합 100) */
  mix: { ordinary: number; crisis: number; clash: number; war: number };
  /** 조용한 날(지켜보는 신호가 모두 꺼짐)의 값 — '평소' */
  quiet: { clashPct: number; warPct: number };
  /** 모형 단계 (사건 규칙 적용 전) */
  phase: 1 | 2 | 3 | 4;
  /** 켜진 묶음 수 */
  clustersOn: number;
  signals: SignalView[];
  on: number;
  watched: number;
  /** 0~100: 조용한 날 0, 사례집에서 가장 뚜렷했던 전쟁 전날 100 (로그 눈금) */
  index: number;
}

interface Weights { c: number; k: number; w: number }

function logLambda(stat: HypStat, obs: SignalNow, o: number): Weights {
  const lam = (x: number) => {
    const raw = obs.s === "on" ? x / o : (1 - x) / (1 - o);
    return Math.log(clamp(raw, 1 / MODEL.CAP, MODEL.CAP)) * (obs.s === "on" ? obs.w ?? 1 : 1);
  };
  return { c: lam(jeff(stat.n)), k: lam(jeff(stat.k)), w: lam(jeff(stat.w)) };
}

/** 같은 묶음 안의 로그 배수를 크기 순으로 1, DAMP, DAMP² … 로 깎아 더한다 */
function damped(xs: number[]): number {
  const a = [...xs].sort((x, y) => Math.abs(y) - Math.abs(x));
  let f = 1, sum = 0;
  for (const x of a) { sum += x * f; f *= MODEL.DAMP; }
  return sum;
}

function posterior(table: PrecursorTable, status: Record<string, SignalNow>, base?: Record<string, [number, number]>) {
  const sW = (table.cases.Wsurprise + 0.5) / (table.cases.W + 1);
  const sK = (table.cases.Ksurprise + 0.5) / (table.cases.K + 1);
  const logs: Record<ClusterId, { c: number[]; k: number[]; w: number[] }> = { G: { c: [], k: [], w: [] }, M: { c: [], k: [], w: [] }, F: { c: [], k: [], w: [] }, I: { c: [], k: [], w: [] }, T: { c: [], k: [], w: [] } };
  for (const h of table.hyps) {
    const st = status[h.id];
    if (!st || st.s === "unk") continue;
    const l = logLambda(h, st, ordinaryRate(h.id, base));
    logs[h.cluster].c.push(l.c); logs[h.cluster].k.push(l.k); logs[h.cluster].w.push(l.w);
  }
  const L = (key: keyof Weights) => Math.exp(CLUSTERS.reduce((a, c) => a + damped(logs[c][key]), 0));
  const piW = MODEL.P_WAR * (1 - sW), piK = MODEL.P_CLASH * (1 - sK), piC = MODEL.P_CRISIS;
  const surpriseW = MODEL.P_WAR * sW, surpriseK = MODEL.P_CLASH * sK;
  const piO = 1 - MODEL.P_WAR - MODEL.P_CLASH - piC;
  const tW = piW * L("w"), tK = piK * L("k"), tC = piC * L("c");
  const Z = piO + surpriseW + surpriseK + tC + tK + tW;
  const war = (tW + surpriseW) / Z;
  const clash = war + (tK + surpriseK) / Z;
  return { war, clash, mix: { ordinary: (piO + surpriseW + surpriseK) / Z, crisis: tC / Z, clash: tK / Z, war: tW / Z }, logOddsW: Math.log(tW / Z / (1 - tW / Z)) };
}

const pct = (x: number) => +(x * 100).toFixed(x < 0.01 ? 2 : 1);

/** 화면의 "×N": 켜졌을 때 '전쟁 직전'을 '위기'보다 얼마나 더 밀어 주나 (전쟁 사례 비율 ÷ 안 난 위기 비율) */
export const discrimination = (h: HypStat) => +clamp(jeff(h.w) / jeff(h.n), 1 / MODEL.CAP, MODEL.CAP).toFixed(1);

export function evaluate(table: PrecursorTable, status: Record<string, SignalNow>, base?: Record<string, [number, number]>, anchorLogOdds?: number): Proximity {
  const now = posterior(table, status, base);
  // 조용한 날: 지금 지켜보는 신호가 모두 꺼졌다고 놓은 값
  const quietStatus: Record<string, SignalNow> = {};
  for (const h of table.hyps) if (status[h.id] && status[h.id].s !== "unk") quietStatus[h.id] = { s: "off" };
  const quiet = posterior(table, quietStatus, base);
  const signals: SignalView[] = table.hyps.map((h) => {
    const st = status[h.id] ?? { s: "unk" as Obs };
    return { id: h.id, cluster: h.cluster, ko: h.ko, s: st.s, weak: st.s === "on" && (st.w ?? 1) < 1, ev: st.ev, lr: discrimination(h), w: h.w, n: h.n, lead: h.lead, ex: h.ex };
  });
  const onSignals = signals.filter((s) => s.s === "on");
  const clustersOn = new Set(onSignals.map((s) => s.cluster)).size;
  let clashPct = pct(now.clash), warPct = pct(now.war);
  // 신호 하나·한 묶음만으로는 '위기'가 되지 않는다. '임박'은 정부나 군사 묶음의 확인된 신호가 있어야 한다
  const strong = onSignals.some((s) => (s.cluster === "G" || s.cluster === "M") && !s.weak && s.lr >= 2);
  if (clustersOn < 2) clashPct = Math.min(clashPct, MODEL.PHASE[3] - 0.1);
  if (!strong) clashPct = Math.min(clashPct, MODEL.PHASE[4] - 0.1);
  warPct = Math.min(warPct, clashPct);
  const phase = clashPct >= MODEL.PHASE[4] ? 4 : clashPct >= MODEL.PHASE[3] ? 3 : clashPct >= MODEL.PHASE[2] ? 2 : 1;
  const span = (anchorLogOdds ?? 0) - quiet.logOddsW;
  const index = anchorLogOdds === undefined || span <= 0 ? 0 : Math.round(clamp(((now.logOddsW - quiet.logOddsW) / span) * 100, 0, 100));
  return {
    clashPct, warPct,
    mix: { ordinary: Math.round(now.mix.ordinary * 100), crisis: Math.round(now.mix.crisis * 100), clash: Math.round(now.mix.clash * 100), war: Math.round(now.mix.war * 100) },
    quiet: { clashPct: pct(quiet.clash), warPct: pct(quiet.war) },
    phase, clustersOn, signals, on: onSignals.length, watched: signals.filter((s) => s.s !== "unk").length, index,
  };
}

/** 사례의 전날 신호를 한반도 눈금에 올렸을 때의 로그 승산 — 지수의 100점 기준과 과거 위기 기준점에 쓴다 */
export function caseLogOdds(table: PrecursorTable, c: CaseRecord, daysBefore = 1): number {
  const ev = caseEvidence(c, daysBefore);
  const status: Record<string, SignalNow> = {};
  for (const [h, o] of Object.entries(ev)) status[h] = { s: o };
  return posterior(table, status).logOddsW;
}

/** 사례 안에서만 본 판별 점수: 전날 신호가 '전쟁 직전'과 '전쟁 안 나는 위기' 중 어느 쪽에 가까운가 (로그 배수, 0보다 크면 전쟁 쪽) */
export function warLikeness(table: PrecursorTable, ev: Record<string, Obs>): number {
  const logs: Record<ClusterId, number[]> = { G: [], M: [], F: [], I: [], T: [] };
  for (const h of table.hyps) {
    const o = ev[h.id];
    if (!o || o === "unk") continue;
    const p = jeff(h.w), q = jeff(h.n);
    logs[h.cluster].push(Math.log(clamp(o === "on" ? p / q : (1 - p) / (1 - q), 1 / MODEL.CAP, MODEL.CAP)));
  }
  return CLUSTERS.reduce((a, c) => a + damped(logs[c]), 0);
}
