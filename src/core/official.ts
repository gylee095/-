// 오늘의 판정 (2026-11-06 사용자): 대시보드를 열 때마다 3.8% ↔ 4.0% 가 오가면 아무것도 알 수 없다.
// 원인: 단계 범위(2단계 2~4%) 안의 위치가 영역 수준 합으로 정해져, 영역 하나가 평소↔주의를 오가면(예: 코스피 출렁임) 같이 흔들렸다.
// 그래서 사람에게 보이는 숫자는 **하루 한 번(오전 8시) 정하는 공식 판정**으로 고정한다. 단계가 실제로 바뀌면(알림과 같은 확인 규칙) 바로 바꾼다.
// 5분마다 하는 계산은 그대로 돌고(live), 단계 알림·심층 분석 판단은 live 로 한다 — 놓치는 것은 없다.
// 하루하루는 어제의 공식 판정과 비교해 "무엇이 바뀌었나"와 "의미 있는 변화인가(단계가 바뀌었나)"를 같이 적는다.
import { fmtRiskPct, type WarRisk } from "./warrisk.js";
import { kstDay, kstMidnight } from "./store.js";
import { readinessScore, type ReadinessScale } from "./casereplay.js";
import { CASEBOOK } from "./casebook_data.js";

export const OFFICIAL_KEY = "risk:official";
export const OFFICIAL_PREV_KEY = "risk:official:prev";
/** 공식 판정을 정하는 시각 (한국 시간) — AI 분석관(8시 9분)이 같은 숫자를 보게 그 전에 */
export const OFFICIAL_HOUR = 8;

export interface Official {
  day: string;
  at: number;
  reason: "daily" | "phase" | "first";
  phase: WarRisk["phase"];
  phaseLabel: string;
  clash30d: WarRisk["clash30d"];
  war30d: WarRisk["war30d"];
  gauge: WarRisk["gauge"];
  vsUsual: number;
  levels: { label: string; level: number; levelLabel: string }[];
  why: string[];
  /** 정할 때의 징조·움직임·배경 세기 (화면의 % 와 개수) — 대시보드를 열 때마다 15% ↔ 17% 로 흔들리지 않게 (11/12) */
  proximity?: WarRisk["proximity"];
  /** 정할 때 함께 정한 전쟁 직전 대비 점수 — 하루 중 배포로 눈금이 바뀌어도 그날 숫자는 그대로 (11/6 검토) */
  readiness?: Readiness;
}

export interface OfficialView {
  at: number;
  reason: Official["reason"];
  note: string;
  /** 어제 공식 판정과 비교 */
  change: { meaningful: boolean; text: string; moved: string[] } | null;
  /** 이 숫자가 무엇이고 무엇이 아닌가 */
  basis: string;
  /** 오늘 아침 판정 때의 켜진 비율·개수 (실시간 값과 견주는 기준) */
  morning?: { index: number; signs: number; moves: number; context: number };
  // readiness 는 내부 계산용으로 Official 에 남지만 화면(OfficialView)에는 내보내지 않는다 (11/6 사용자: 새 정보 말고 기존 %의 정확도를 올려라)
}

export interface Readiness {
  /** 0 = 한반도 평소, 100 = 우크라이나 침공 전날 */
  score: number;
  /** 사례들의 전쟁 전날 점수 (눈금 옆에 놓을 기준점) */
  anchors: { name: string; eve: string; phase: number; score: number; caught: boolean }[];
  /** 외국 사례 평시 날들 중 이 점수 이상이었던 비율 % */
  quietAtOrAbovePct: number;
  quietDays: number;
  text: string;
}

/** 단계마다 나올 수 있는 점수 범위 — 온도계 눈금이 단계 칸의 40%~100% 자리이므로 */
function phaseRange(p: 1 | 2 | 3 | 4 | 5, s: ReadinessScale): [number, number] {
  if (p === 1) return [0, readinessScore(1 / 5, s)];
  if (p === 5) return [100, 100];
  return [readinessScore((p - 1 + 0.4) / 5, s), readinessScore(p / 5, s)];
}

export function makeReadiness(gauge: number, actualPhase: 1 | 2 | 3 | 4 | 5): Readiness {
  const { scale, anchors, quietScores } = CASEBOOK;
  const score = readinessScore(gauge, scale);
  const above = quietScores.filter((s) => s >= score).length;
  const quietAtOrAbovePct = quietScores.length ? Math.round((above / quietScores.length) * 100) : 0;
  // 평시 비율은 화면 문장에 쓰지 않는다: 외국 사례는 잰 신호가 한반도보다 훨씬 적어 평시 점수가 낮게 나온다 — 한국 점수와 바로 비교하면 겁을 준다 (11/6)
  // 단계는 점수에서 거꾸로 추정하지 않고 실제 판정 단계를 쓴다 (4단계 상한이 100 으로 잘려 5단계가 '4단계'로 나오던 문제 — 11/6 검토)
  const phase = actualPhase;
  const [lo, hi] = phaseRange(phase, scale);
  const same = anchors.filter((a) => a.id !== "ukraine-2022" && a.phase === phase);
  const next = phase < 4 ? phaseRange((phase + 1) as 2 | 3 | 4, scale)[0] : undefined;
  const text =
    phase === 5
      ? `전쟁 직전 대비 100점 — 교전 단계예요 (우크라이나 침공 전날 = 100을 넘어선 상황).`
      : score === 0
      ? `전쟁 직전 대비 0점 — 한반도 평소 수준이에요.`
      : `전쟁 직전 대비 ${score}점 (우크라이나 침공 전날 = 100). ${phase}단계의 범위(${lo}~${hi}점) 안이에요.` +
        (same.length ? ` 같은 ${phase}단계였던 사례: ${same.map((a) => `${a.name} 전날 ${a.score}점${a.caught ? "" : "(규칙이 미리 못 잡음)"}`).join(", ")}.` : "") +
        (next !== undefined ? ` ${phase + 1}단계가 되면 ${next}점 이상이에요.` : "");
  return { score, anchors: anchors.map(({ name, eve, phase, score, caught }) => ({ name, eve, phase, score, caught })), quietAtOrAbovePct, quietDays: quietScores.length, text };
}

export type WithOfficial = WarRisk & { live: WarRisk; official?: OfficialView };

export function makeOfficial(w: WarRisk, now: number, reason: Official["reason"]): Official {
  return {
    day: kstDay(now),
    at: now,
    reason,
    phase: w.phase,
    phaseLabel: w.phaseLabel,
    clash30d: w.clash30d,
    war30d: w.war30d,
    gauge: w.gauge,
    vsUsual: w.vsUsual,
    levels: w.domains.map((d) => ({ label: d.label, level: d.level, levelLabel: d.levelLabel })),
    why: w.phaseReasons.slice(0, 4),
    readiness: makeReadiness(w.gauge.now, w.phase),
    // 그래프·과거 목록은 화면에서 지금 것으로 다시 붙인다 (저장 크기를 줄이려고 뺀다)
    ...(w.proximity ? { proximity: { ...w.proximity, series: [], anchors: [], record: [] } } : {}),
  };
}

/** 새 공식 판정을 정할 때인가: 처음 · 확인된 단계가 바뀜 · 새 날 오전 8시가 지남 */
export function officialDue(cur: Official | undefined, w: WarRisk, confirmedPhase: number | undefined, now: number): Official["reason"] | undefined {
  if (!cur) return "first";
  if (confirmedPhase !== undefined && confirmedPhase !== cur.phase && w.phase === confirmedPhase) return "phase";
  if (cur.day !== kstDay(now) && now >= kstMidnight(now) + OFFICIAL_HOUR * 3600_000) return "daily";
  return undefined;
}

const T = CASEBOOK.totals;
const K = CASEBOOK.korea as { from: string; to: string; phaseShare: Record<string, number>; cal: { byPhase: Record<string, { pct: number }> } } | undefined;
const k1 = K?.cal.byPhase["1"]?.pct, k2 = K?.cal.byPhase["2"]?.pct, kShare = K?.phaseShare["2"];
const BASIS =
  `충돌 빈도 기반 판단값 — 외국 전쟁 ${T.warCases}건 중 ${T.caught}건 감지, 한반도 큰 도발 예측은 아직 못 함.`;

function changeText(prev: Official | undefined, off: Official): OfficialView["change"] {
  if (!prev) return null;
  const moved = off.levels
    .map((d) => ({ d, p: prev.levels.find((x) => x.label === d.label) }))
    .filter((x) => x.p && x.p.level !== x.d.level)
    .map((x) => `${x.d.label} ${x.p!.levelLabel}→${x.d.levelLabel}`);
  const a = fmtRiskPct(prev.clash30d.point), b = fmtRiskPct(off.clash30d.point);
  if (prev.phase !== off.phase)
    return { meaningful: true, moved, text: `${prev.phase}단계 ${prev.phaseLabel} → ${off.phase}단계 ${off.phaseLabel}: 의미 있는 변화예요 (국지 충돌 ${a} → ${b}).` };
  if (a === b && !moved.length) return { meaningful: false, moved, text: `직전 판정과 같아요 — ${off.phase}단계 ${off.phaseLabel}, 국지 충돌 ${b}.` };
  return {
    meaningful: false,
    moved,
    text: `직전 판정과 같은 ${off.phase}단계예요. ${a === b ? "숫자는 그대로" : `${a} → ${b}`}${moved.length ? ` (바뀐 영역: ${moved.join(", ")})` : ""} — 단계 안의 작은 움직임이라 위험이 달라졌다고 보지 않아요.`,
  };
}

/** 사람에게 보이는 판정 = 공식 판정. live 는 그대로 붙여 둔다(알림·심층 분석 판단용) */
export function applyOfficial(w: WarRisk, off: Official | undefined, prev: Official | undefined): WithOfficial {
  if (!off) return { ...w, live: w };
  const samePhase = off.phase === w.phase;
  const when = new Date(off.at + 9 * 3600_000);
  const hm = `${when.getUTCMonth() + 1}/${when.getUTCDate()} ${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}`;
  const note =
    off.reason === "phase"
      ? `오늘의 판정 · ${hm} 단계가 바뀌어 새로 정했어요. 숫자는 하루 한 번(오전 ${OFFICIAL_HOUR}시) 정하고, 단계가 바뀔 때만 바로 바뀌어요.`
      : `오늘의 판정 · ${hm} 기준. 숫자는 하루 한 번(오전 ${OFFICIAL_HOUR}시) 정하고, 단계가 바뀔 때만 바로 바뀌어요.`;
  return {
    ...w,
    phase: off.phase,
    phaseLabel: off.phaseLabel,
    phaseReasons: samePhase ? w.phaseReasons : off.why,
    clash30d: off.clash30d,
    war30d: off.war30d,
    gauge: off.gauge,
    vsUsual: off.vsUsual,
    headline: `전쟁 위험 ${off.phase}단계(${off.phaseLabel}) — 앞으로 30일 국지 충돌 약 ${fmtRiskPct(off.clash30d.point)}, 전면전 ${fmtRiskPct(off.war30d.point)}`,
    live: w,
    official: { at: off.at, reason: off.reason, note, change: changeText(prev, off), basis: BASIS,
      // 운영자 대시보드의 개수·% 는 실시간으로 두고(11/12 사용자), 오늘 아침 값은 견줄 기준으로만 붙인다
      ...(off.proximity?.rubric && "signs" in off.proximity.rubric ? { morning: { index: off.proximity.index, signs: off.proximity.rubric.signs, moves: off.proximity.rubric.moves, context: off.proximity.rubric.context } } : {}) },
  };
}

type Kv = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };

/** 5분 주기에서: 정할 때가 되면 새 공식 판정을 저장하고 직전 것을 '어제'로 남긴다 */
export async function updateOfficial(store: Kv, live: WarRisk, now: number): Promise<Official["reason"] | undefined> {
  const raw = await store.getKv(OFFICIAL_KEY);
  const cur = raw ? (JSON.parse(raw) as Official) : undefined;
  const pn = await store.getKv("risk:phase_notify");
  const confirmed = pn ? (JSON.parse(pn) as { phase?: number }).phase : undefined;
  const reason = officialDue(cur, live, confirmed, now);
  if (!reason) return undefined;
  if (cur) await store.setKv(OFFICIAL_PREV_KEY, JSON.stringify(cur));
  await store.setKv(OFFICIAL_KEY, JSON.stringify(makeOfficial(live, now, reason)));
  return reason;
}
