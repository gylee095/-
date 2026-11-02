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

/** 판정 방식이 바뀐 때 (새 징후 추가·수신망 변경 등) — 이 사이의 변화는 세상이 아니라 '재는 방법'이 바뀐 것일 수 있다.
 *  시각은 그 변경이 실제 판정에 처음 반영된 때(배포 뒤 첫 수집). 새로 바꿀 때마다 여기에 한 줄 더한다. */
export const MODEL_CHANGES: { at: number; domains: DomainId[]; what: string }[] = [
  { at: Date.parse("2026-11-01T11:57:00Z"), domains: ["nkwords"], what: "북한 장마당 물가를 판정에 넣음(휘발유 +88% → '주의')" },
  { at: Date.parse("2026-11-01T14:31:00Z"), domains: ["military"], what: "항행경보에 일본 해상보안청·국립해양조사원 원문 추가" },
  { at: Date.parse("2026-11-01T14:39:00Z"), domains: ["military"], what: "군용기 수신망(adsb.fi) 추가 — 다음 날 0시까지 옛 기준선 탓에 가짜 '상승'" },
  { at: Date.parse("2026-11-02T00:20:00Z"), domains: ["military"], what: "군용기 기준선을 새로 배우기 시작(가짜 '상승' 제거)" },
];

/** 클로드 분석관·심층 분석이 남긴 판단 (자동 판정 기록이 시작되기 전 며칠도 메운다) */
export interface Judgment {
  at: number;
  phase: number;
  clash: number;
  war?: number;
  source: "분석관" | "심층 분석";
}

export interface Compare {
  /** 비교한 과거 시점 (없으면 아직 기록 부족) */
  agoAt?: number;
  /** 무엇과 비교했나: 어제 같은 시각 · 가장 가까운 과거 자동 판정 · 분석관 판단 */
  basis?: "same-time" | "nearest" | "judgment";
  /** 화면에 쓰는 비교 기준 이름 (예: '어제 이맘때', '11/1 18시', '11/1 20시 분석관 판단') */
  agoLabel?: string;
  verdict: "worse" | "better" | "same" | "unknown";
  /** 한 줄 요약 */
  headline: string;
  now: { phase: number; clash: number; war: number; tensionPct?: number };
  ago?: { phase: number; clash: number; war: number; tensionPct?: number };
  /** 무엇이 바뀌었나 (위험 쪽 +1, 나은 쪽 −1, 판정 방식이 바뀐 탓일 수 있는 것은 0) */
  changes: { text: string; dir: 1 | -1 | 0 }[];
  /** 비교 기간 사이에 판정 방식이 바뀐 것 */
  modelChanges?: string[];
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

const kstLabel = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}시`;
};

/** 비교 기준 고르기 — 꼭 같은 시각일 필요는 없다: ① 어제 이맘때(앞뒤 3시간) ② 6시간 이상 지난 자동 판정 중 24시간 전에 가장 가까운 것 ③ 그것도 없으면 분석관 판단 */
export function pickReference(series: RiskPoint[], judgments: Judgment[], now: number): { point: RiskPoint; basis: NonNullable<Compare["basis"]>; label: string } | undefined {
  const same = pointNear(series, now - 24 * H);
  if (same) return { point: same, basis: "same-time", label: "어제 이맘때" };
  const older = series.filter((p) => p.t <= now - 6 * H);
  if (older.length) {
    const p = older.reduce((a, b) => (Math.abs(b.t - (now - 24 * H)) < Math.abs(a.t - (now - 24 * H)) ? b : a));
    return { point: p, basis: "nearest", label: `${kstLabel(p.t)} (${Math.round((now - p.t) / H)}시간 전)` };
  }
  const js = judgments.filter((j) => j.at <= now - 6 * H);
  if (js.length) {
    const j = js.reduce((a, b) => (Math.abs(b.at - (now - 24 * H)) < Math.abs(a.at - (now - 24 * H)) ? b : a));
    return { point: { t: j.at, ph: j.phase as RiskPoint["ph"], c: j.clash, w: j.war ?? 0, lv: "" }, basis: "judgment", label: `${kstLabel(j.at)} ${j.source} 판단` };
  }
  return undefined;
}

export function compareWithYesterday(series: RiskPoint[], w: WarRisk, board: BoardRow[], briefs: EventBrief[], now: number, tensionPct?: number, judgments: Judgment[] = []): Compare {
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

  const ref = pickReference(series, judgments, now);
  if (!ref) {
    return { verdict: "unknown", headline: "비교할 과거 기록이 아직 없습니다", now: nowVals, changes: [], newEvents, movers: movers.slice(0, 5) };
  }
  const ago = ref.point;
  const agoVals = { phase: ago.ph, clash: ago.c, war: ago.w, ...(ago.tp !== undefined ? { tensionPct: ago.tp } : {}) };
  const changes: Compare["changes"] = [];
  const between = MODEL_CHANGES.filter((m) => m.at > ago.t && m.at <= now);
  const touched = (id: DomainId) => between.find((m) => m.domains.includes(id));
  let systemShift = false;
  const phaseD = w.phase - ago.ph;
  if (phaseD) changes.push({ text: `전쟁 위험 ${ago.ph}단계 → ${w.phase}단계`, dir: phaseD > 0 ? 1 : -1 });
  let clashD = nowVals.clash - ago.c;
  let domSum = 0;
  DOMAIN_ORDER.forEach((id: DomainId, i) => {
    // 분석관 판단에는 영역별 수준이 없다
    if (!ago.lv) return;
    const before = Number(ago.lv[i] ?? 0) as Level;
    const d = w.domains.find((x) => x.id === id);
    if (!d || d.level === before) return;
    const m = touched(id);
    if (m) {
      // 이 영역은 그 사이 재는 방법이 바뀌었다 — 판정(나아짐·악화)에 넣지 않는다
      systemShift = true;
      changes.push({ text: `${d.label} ${LEVEL_LABEL[before]} → ${LEVEL_LABEL[d.level]} (그 사이 측정 변경: ${m.what})`, dir: 0 });
      return;
    }
    domSum += d.level - before;
    changes.push({ text: `${d.label} ${LEVEL_LABEL[before]} → ${LEVEL_LABEL[d.level]}`, dir: d.level > before ? 1 : -1 });
  });
  // 확률은 영역 수준에서 나오므로, 측정 변경으로 바뀐 영역이 있으면 확률 변화도 판정에 넣지 않는다
  if (Math.abs(clashD) >= 0.05) changes.unshift({ text: `30일 국지 충돌 ${fmt(ago.c)} → ${fmt(nowVals.clash)}${systemShift ? " (측정 변경 영향 포함)" : ""}`, dir: systemShift ? 0 : clashD > 0 ? 1 : -1 });
  if (systemShift) clashD = 0;
  if (Math.abs(nowVals.war - ago.w) >= 0.05) changes.push({ text: `30일 전면전 ${fmt(ago.w)} → ${fmt(nowVals.war)}`, dir: systemShift ? 0 : nowVals.war > ago.w ? 1 : -1 });
  if (tensionPct !== undefined && ago.tp !== undefined && Math.abs(tensionPct - ago.tp) >= 3)
    changes.push({ text: `긴장 온도계 ${topText(ago.tp)} → ${topText(tensionPct)}`, dir: tensionPct > ago.tp ? 1 : -1 });
  // 판정: 단계가 가장 무겁고, 그다음 국지 충돌 확률(0.3%p 이상), 그다음 영역 수준 합
  const score = Math.sign(phaseD) * 3 + (clashD >= 0.3 ? 2 : clashD <= -0.3 ? -2 : 0) + Math.sign(domSum);
  const verdict: Compare["verdict"] = score > 0 ? "worse" : score < 0 ? "better" : "same";
  const lead = verdict === "worse" ? `${ref.label} 대비 위기 쪽으로 움직였다` : verdict === "better" ? `${ref.label} 대비 나아졌다` : `${ref.label} 대비 비슷하다`;
  const why = changes.find((c) => (verdict === "worse" ? c.dir > 0 : verdict === "better" ? c.dir < 0 : false))?.text ?? (systemShift ? "측정 방식이 바뀐 것을 빼면 큰 변화 없음" : `국지 충돌 ${fmt(nowVals.clash)} 그대로`);
  return { agoAt: ago.t, basis: ref.basis, agoLabel: ref.label, verdict, headline: `${lead} — ${why}`, now: nowVals, ago: agoVals, changes, newEvents, movers: movers.slice(0, 5), ...(between.length ? { modelChanges: between.map((m) => m.what) } : {}) };
}

function fmt(x: number): string {
  return x < 0.1 ? "0.1% 미만" : x < 1 ? `${x.toFixed(1)}%` : `${(Math.round(x * 10) / 10).toString()}%`;
}
function topText(p: number): string {
  const t = 100 - p;
  return t < 1 ? "상위 1% 안" : t >= 50 ? "평소 수준" : `상위 ${Math.round(t)}%`;
}

/** 메모에서 판단 꺼내기 — 심층 분석은 숫자 칸, 정기 분석관은 문장('국지 충돌 약 4%·전면전 0.2%')에서 읽는다 */
export function judgmentsFromNotes(notes: { at: number; kind?: string; data?: unknown }[]): Judgment[] {
  const out: Judgment[] = [];
  for (const n of notes) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (n.kind === "deep_report" && typeof d.p_clash_30d === "number" && typeof d.war_phase === "number") {
      out.push({ at: n.at, phase: d.war_phase, clash: d.p_clash_30d, war: typeof d.p_war_30d === "number" ? d.p_war_30d : undefined, source: "심층 분석" });
    } else if (n.kind === "assessment") {
      const text = String(d.overall ?? "");
      const c = /국지\s*충돌[^0-9%]{0,8}([\d.]+)\s*%/.exec(text);
      const wv = /전면전[^0-9%]{0,8}([\d.]+)\s*%/.exec(text);
      const ph = typeof d.war_phase === "number" ? d.war_phase : typeof d.overall_level === "number" ? d.overall_level : undefined;
      if (c && ph !== undefined) out.push({ at: n.at, phase: ph, clash: Number(c[1]), war: wv ? Number(wv[1]) : undefined, source: "분석관" });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
