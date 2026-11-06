// 오늘의 판정 (2026-11-06 사용자): 대시보드를 열 때마다 3.8% ↔ 4.0% 가 오가면 아무것도 알 수 없다.
// 원인: 단계 범위(2단계 2~4%) 안의 위치가 영역 수준 합으로 정해져, 영역 하나가 평소↔주의를 오가면(예: 코스피 출렁임) 같이 흔들렸다.
// 그래서 사람에게 보이는 숫자는 **하루 한 번(오전 8시) 정하는 공식 판정**으로 고정한다. 단계가 실제로 바뀌면(알림과 같은 확인 규칙) 바로 바꾼다.
// 5분마다 하는 계산은 그대로 돌고(live), 단계 알림·심층 분석 판단은 live 로 한다 — 놓치는 것은 없다.
// 하루하루는 어제의 공식 판정과 비교해 "무엇이 바뀌었나"와 "의미 있는 변화인가(단계가 바뀌었나)"를 같이 적는다.
import { fmtRiskPct, type WarRisk } from "./warrisk.js";
import { kstDay, kstMidnight } from "./store.js";

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
}

export interface OfficialView {
  at: number;
  reason: Official["reason"];
  note: string;
  /** 어제 공식 판정과 비교 */
  change: { meaningful: boolean; text: string; moved: string[] } | null;
  /** 이 숫자가 무엇이고 무엇이 아닌가 */
  basis: string;
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
  };
}

/** 새 공식 판정을 정할 때인가: 처음 · 확인된 단계가 바뀜 · 새 날 오전 8시가 지남 */
export function officialDue(cur: Official | undefined, w: WarRisk, confirmedPhase: number | undefined, now: number): Official["reason"] | undefined {
  if (!cur) return "first";
  if (confirmedPhase !== undefined && confirmedPhase !== cur.phase && w.phase === confirmedPhase) return "phase";
  if (cur.day !== kstDay(now) && now >= kstMidnight(now) + OFFICIAL_HOUR * 3600_000) return "daily";
  return undefined;
}

const BASIS =
  "이 %는 1999~2026년 남북 충돌 8번의 빈도로 정한 단계별 범위 안의 판단값이에요. 실제 결과로 채점해 맞춘 숫자는 아직 아니에요(외국 전쟁 사례로 채점표를 만드는 중).";

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
    official: { at: off.at, reason: off.reason, note, change: changeText(prev, off), basis: BASIS },
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
