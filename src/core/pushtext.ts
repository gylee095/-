// 휴대폰 알림 본문 — 모든 알림이 같은 모양 (2026-11-04)
//   ⬆ 나빠짐: 30일 국지 충돌 3.6%(어제 이맘때) → 3.8%(지금)
//   북한, 미상 발사체 발사 → 동해상
//   지금 한반도 상황 : 주의 (나빠짐 : 30일 국지 충돌 3.6% → 3.8%)
//   대시보드 : https://…
// 11/4 발사 속보 알림에 대시보드 주소가 없었다 — 주소를 Bark 의 '눌렀을 때 열 주소'로만 넘겨서 본문에는 보이지 않았다.
// 11/4 저녁: "원래 몇 %였는지 알림에 없으면 전에도 4%였는지, 오른 건지 내린 건지 헷갈린다" — 변화가 없을 때도 이전 값과 그 시각을 쓴다.
import type { Store } from "./store.js";
import { fmtRiskPct } from "./warrisk.js";
import { loadSeries, type RiskPoint } from "./history.js";
import { pickReference } from "./compare.js";

export interface Situation {
  /** 지금 상황 이름 — 사건 위험도('주의')가 있으면 그것, 없으면 단계 이름('긴장') */
  label: string;
  /** 지금 30일 국지 충돌 % */
  clash: number;
  /** 어제 이맘때(또는 가장 가까운 기록) 국지 충돌 % */
  clashAgo?: number;
  /** 비교한 기록의 시각과 이름 ('어제 이맘때', '11/3 14시 (30시간 전)') — 알림에 '언제의 몇 %'인지 적는다 */
  agoAt?: number;
  agoLabel?: string;
  /** 지금 단계 */
  phase?: number;
  phaseAgo?: number;
}

/** 나빠짐·좋아짐·비슷 — 단계가 바뀌었으면 단계로, 아니면 확률 0.05%p 넘는 변화로 */
export function trendOf(s: Situation): "나빠짐" | "좋아짐" | "비슷" {
  if (s.phase !== undefined && s.phaseAgo !== undefined && s.phase !== s.phaseAgo) return s.phase > s.phaseAgo ? "나빠짐" : "좋아짐";
  if (s.clashAgo === undefined) return "비슷";
  const d = s.clash - s.clashAgo;
  return d > 0.05 ? "나빠짐" : d < -0.05 ? "좋아짐" : "비슷";
}

const pct1 = (x: number) => (x >= 10 ? Math.round(x) : +x.toFixed(1)) + "%";

/** 첫 줄: '지금 한반도 상황 : 주의 (나빠짐 : 30일 국지 충돌 3.6% → 3.8%)' */
export function situationLine(s: Situation): string {
  const t = trendOf(s);
  const cmp = s.clashAgo === undefined ? `30일 국지 충돌 약 ${fmtRiskPct(s.clash)}` : `30일 국지 충돌 ${pct1(s.clashAgo)} → ${pct1(s.clash)}`;
  return `지금 한반도 상황 : ${s.label} (${t} : ${cmp})`;
}

const NAMES = ["", "평온", "긴장", "위기", "임박", "교전"] as const;

/** '30일 국지 충돌 3.6%(어제 이맘때) → 3.8%(지금)' — 이전 값에는 늘 '언제'를 붙인다. 비교 기록이 없으면 undefined */
export function beforeAfter(s: Situation): string | undefined {
  if (s.clashAgo === undefined) return undefined;
  return `30일 국지 충돌 ${pct1(s.clashAgo)}(${s.agoLabel ?? "이전"}) → ${pct1(s.clash)}(지금)`;
}

/** 첫 줄: 바뀐 것 하나만. 단계가 바뀌었으면 단계, 아니면 확률. 변화가 없어도 '몇 %에서 몇 %'를 적는다 — 전에도 같았는지 알 수 있게 */
export function changeLine(s: Situation): string {
  const t = trendOf(s);
  const ba = beforeAfter(s);
  if (s.phase !== undefined && s.phaseAgo !== undefined && s.phase !== s.phaseAgo)
    return `${t === "나빠짐" ? "⬆" : "⬇"} ${t}: ${s.phaseAgo}단계 ${NAMES[s.phaseAgo] ?? ""} → ${s.phase}단계 ${NAMES[s.phase] ?? ""}${ba ? ` · ${ba}` : ""}`;
  if (ba && t !== "비슷") return `${t === "나빠짐" ? "⬆" : "⬇"} ${t}: ${ba}`;
  if (ba) return `● 변화 없음: ${ba} · ${s.label}`;
  return `● ${s.label} · 30일 국지 충돌 약 ${fmtRiskPct(s.clash)} — 비교할 이전 기록 없음`;
}

/** 알림 본문: 바뀐 것 · 무슨 일 · 지금 상황 · 대시보드 주소 — 잠금화면에서 첫 줄만 보여도 무엇이 달라졌는지 읽히게 */
export function pushBody(s: Situation, what: string, dashboardUrl?: string, extra: string[] = []): string {
  return [changeLine(s), what, situationLine(s), ...extra, dashboardUrl ? `대시보드 : ${dashboardUrl}` : ""].filter(Boolean).join("\n");
}

/** 기록된 판정에서 지금·어제 값을 읽는다 (파이프라인은 전쟁 위험을 계산하지 않으므로 5분마다 남긴 기록을 쓴다).
 *  비교 기준은 대시보드와 같은 규칙(compare.pickReference): 어제 이맘때 → 없으면 6시간 넘게 지난 기록 중 24시간 전에 가장 가까운 것 */
export async function situationFromRecords(store: Store, now: number, label: string): Promise<Situation | undefined> {
  const series: RiskPoint[] = await loadSeries(store as Store, now).catch(() => []);
  const latest = series.length ? series[series.length - 1] : undefined;
  if (!latest) return undefined;
  const clash = latest.c;
  const phase = latest.ph;
  const ref = pickReference(series, [], now);
  return { label, clash, phase, ...(ref ? { clashAgo: ref.point.c, phaseAgo: ref.point.ph, agoAt: ref.point.t, agoLabel: ref.label } : {}) };
}
