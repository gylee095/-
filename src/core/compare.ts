// 어제와 비교 — "어제 이맘때보다 위기 쪽인가, 나아졌나, 무엇이 바뀌었나" (2026-11-02).
// 시간별 판정 기록(차트 점)에서 24시간 전 점을 찾아 단계·국지 충돌 확률·영역 수준을 견주고,
// 그 사이 새로 생긴 사건과 상태가 바뀐 징후를 덧붙인다. 판단 근거를 숫자로 보여 주는 것이 목적이다.
import type { BoardRow } from "./state.js";
import type { EventBrief } from "./brief.js";
import type { DomainId, Level, WarRisk } from "./warrisk.js";
import { DOMAIN_ORDER, type RiskPoint } from "./history.js";
import { INDICATOR_BY_ID, STATE_LABEL, evaluate } from "./indicators.js";

const H = 3600_000;
const LEVEL_LABEL = ["평소", "주의", "경계", "심각"];

export interface Compare {
  /** 비교한 과거 시점 (없으면 아직 기록 부족) */
  agoAt?: number;
  verdict: "worse" | "better" | "same" | "unknown";
  /** 한 줄 요약 */
  headline: string;
  now: { phase: number; clash: number; war: number; tensionPct?: number };
  ago?: { phase: number; clash: number; war: number; tensionPct?: number };
  /** 무엇이 바뀌었나 (위험 쪽 +1, 나은 쪽 −1) */
  changes: { text: string; dir: 1 | -1 | 0 }[];
  /** 지난 24시간 새 사건 */
  newEvents: { at: number; headline: string; level: number }[];
  /** 지난 24시간 상태가 바뀐 징후 */
  movers: { id: string; label: string; from: string; to: string; dir: 1 | -1 }[];
}

const RANK: Record<string, number> = { normal: 0, elevated: 1, anomalous: 2 };

/** 24시간 전에 가장 가까운 점 (앞뒤 3시간 안) */
export function pointNear(series: RiskPoint[], at: number, within = 3 * H): RiskPoint | undefined {
  let best: RiskPoint | undefined;
  for (const p of series) if (Math.abs(p.t - at) <= within && (!best || Math.abs(p.t - at) < Math.abs(best.t - at))) best = p;
  return best;
}

/** 징후의 24시간 전 값(시간별 평균)으로 그때 상태를 다시 판정한다 — 고정 문턱 징후는 정확, 기준선 징후는 지금 기준선으로 어림 */
function pastState(row: BoardRow, now: number): string | undefined {
  const def = INDICATOR_BY_ID[row.id];
  const r = row.reading;
  if (!def || !r || r.state === "learning" || row.stateLabel === STATE_LABEL.unavailable) return undefined;
  const target = Math.floor((now - 24 * H) / H);
  const h = row.history.filter((x) => Math.abs(x.hour - target) <= 2).sort((a, b) => Math.abs(a.hour - target) - Math.abs(b.hour - target))[0];
  if (!h) return undefined;
  const base = r.baseline !== undefined && r.sd !== undefined ? { mean: r.baseline, var: r.sd * r.sd, n: r.n } : undefined;
  return evaluate(def, h.avg, now - 24 * H, base).state;
}

export function compareWithYesterday(series: RiskPoint[], w: WarRisk, board: BoardRow[], briefs: EventBrief[], now: number, tensionPct?: number): Compare {
  const nowVals = { phase: w.phase, clash: +w.clash30d.point.toFixed(2), war: +w.war30d.point.toFixed(2), ...(tensionPct !== undefined ? { tensionPct } : {}) };
  const newEvents = briefs
    .filter((b) => now - b.at < 24 * H && b.at <= now + H && (b.evacuation || b.posture || (b.isProvocation && b.danger.level >= 3) || b.danger.level >= 4))
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((b) => ({ at: b.at, headline: b.headline, level: b.danger.level }));
  const movers: Compare["movers"] = [];
  for (const row of board) {
    const before = pastState(row, now);
    const after = row.reading?.state;
    if (!before || !after || !(before in RANK) || !(after in RANK) || before === after) continue;
    movers.push({ id: row.id, label: row.label, from: STATE_LABEL[before as keyof typeof STATE_LABEL], to: STATE_LABEL[after as keyof typeof STATE_LABEL], dir: RANK[after] > RANK[before] ? 1 : -1 });
  }
  movers.sort((a, b) => b.dir - a.dir);

  const ago = pointNear(series, now - 24 * H);
  if (!ago) {
    return { verdict: "unknown", headline: "어제 같은 시각 기록이 아직 없어, 비교는 기록이 하루 쌓인 뒤부터 보여 줍니다", now: nowVals, changes: [], newEvents, movers: movers.slice(0, 5) };
  }
  const agoVals = { phase: ago.ph, clash: ago.c, war: ago.w, ...(ago.tp !== undefined ? { tensionPct: ago.tp } : {}) };
  const changes: Compare["changes"] = [];
  const phaseD = w.phase - ago.ph;
  if (phaseD) changes.push({ text: `전쟁 위험 ${ago.ph}단계 → ${w.phase}단계`, dir: phaseD > 0 ? 1 : -1 });
  const clashD = nowVals.clash - ago.c;
  if (Math.abs(clashD) >= 0.05) changes.push({ text: `30일 국지 충돌 ${fmt(ago.c)} → ${fmt(nowVals.clash)}`, dir: clashD > 0 ? 1 : -1 });
  if (Math.abs(nowVals.war - ago.w) >= 0.05) changes.push({ text: `30일 전면전 ${fmt(ago.w)} → ${fmt(nowVals.war)}`, dir: nowVals.war > ago.w ? 1 : -1 });
  let domSum = 0;
  DOMAIN_ORDER.forEach((id: DomainId, i) => {
    const before = Number(ago.lv[i] ?? 0) as Level;
    const d = w.domains.find((x) => x.id === id);
    if (!d || d.level === before) return;
    domSum += d.level - before;
    changes.push({ text: `${d.label} ${LEVEL_LABEL[before]} → ${LEVEL_LABEL[d.level]}`, dir: d.level > before ? 1 : -1 });
  });
  if (tensionPct !== undefined && ago.tp !== undefined && Math.abs(tensionPct - ago.tp) >= 3)
    changes.push({ text: `긴장 온도계 ${topText(ago.tp)} → ${topText(tensionPct)}`, dir: tensionPct > ago.tp ? 1 : -1 });
  // 판정: 단계가 가장 무겁고, 그다음 국지 충돌 확률(0.3%p 이상), 그다음 영역 수준 합
  const score = Math.sign(phaseD) * 3 + (clashD >= 0.3 ? 2 : clashD <= -0.3 ? -2 : 0) + Math.sign(domSum);
  const verdict: Compare["verdict"] = score > 0 ? "worse" : score < 0 ? "better" : "same";
  const lead = verdict === "worse" ? "어제 이맘때보다 위기 쪽으로 움직였다" : verdict === "better" ? "어제 이맘때보다 나아졌다" : "어제 이맘때와 비슷하다";
  const why = changes.find((c) => (verdict === "worse" ? c.dir > 0 : verdict === "better" ? c.dir < 0 : false))?.text ?? `국지 충돌 ${fmt(nowVals.clash)} 그대로`;
  return { agoAt: ago.t, verdict, headline: `${lead} — ${why}`, now: nowVals, ago: agoVals, changes, newEvents, movers: movers.slice(0, 5) };
}

function fmt(x: number): string {
  return x < 0.1 ? "0.1% 미만" : x < 1 ? `${x.toFixed(1)}%` : `${(Math.round(x * 10) / 10).toString()}%`;
}
function topText(p: number): string {
  const t = 100 - p;
  return t < 1 ? "상위 1% 안" : t >= 50 ? "평소 수준" : `상위 ${Math.round(t)}%`;
}
