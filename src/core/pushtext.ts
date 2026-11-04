// 휴대폰 알림 본문 — 모든 알림이 같은 모양 (2026-11-04)
//   지금 한반도 상황 : 주의 (나빠짐 : 30일 국지 충돌 3.6% → 3.8%)
//   북한, 미상 발사체 발사 → 동해상
//   대시보드 : https://…
// 11/4 발사 속보 알림에 대시보드 주소가 없었다 — 주소를 Bark 의 '눌렀을 때 열 주소'로만 넘겨서 본문에는 보이지 않았다.
import type { Store } from "./store.js";
import { fmtRiskPct } from "./warrisk.js";
import { loadSeries, type RiskPoint } from "./history.js";
import { pointNear } from "./compare.js";

export interface Situation {
  /** 지금 상황 이름 — 사건 위험도('주의')가 있으면 그것, 없으면 단계 이름('긴장') */
  label: string;
  /** 지금 30일 국지 충돌 % */
  clash: number;
  /** 어제 이맘때(또는 가장 가까운 기록) 국지 충돌 % */
  clashAgo?: number;
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

/** 첫 줄: 바뀐 것 하나만. 단계가 바뀌었으면 단계, 아니면 확률, 그것도 없으면 '변화 없음' */
export function changeLine(s: Situation): string {
  const t = trendOf(s);
  if (s.phase !== undefined && s.phaseAgo !== undefined && s.phase !== s.phaseAgo)
    return `${t === "나빠짐" ? "⬆" : "⬇"} ${t}: ${s.phaseAgo}단계 ${NAMES[s.phaseAgo] ?? ""} → ${s.phase}단계 ${NAMES[s.phase] ?? ""}`;
  if (s.clashAgo !== undefined && t !== "비슷") return `${t === "나빠짐" ? "⬆" : "⬇"} ${t}: 30일 국지 충돌 ${pct1(s.clashAgo)} → ${pct1(s.clash)}`;
  return `● 단계 변화 없음 (${s.label}, 30일 국지 충돌 약 ${fmtRiskPct(s.clash)})`;
}

/** 알림 본문: 바뀐 것 · 무슨 일 · 지금 상황 · 대시보드 주소 — 잠금화면에서 첫 줄만 보여도 무엇이 달라졌는지 읽히게 */
export function pushBody(s: Situation, what: string, dashboardUrl?: string, extra: string[] = []): string {
  return [changeLine(s), what, situationLine(s), ...extra, dashboardUrl ? `대시보드 : ${dashboardUrl}` : ""].filter(Boolean).join("\n");
}

/** 기록된 판정에서 지금·어제 값을 읽는다 (파이프라인은 전쟁 위험을 계산하지 않으므로 5분마다 남긴 기록을 쓴다) */
export async function situationFromRecords(store: Store, now: number, label: string): Promise<Situation | undefined> {
  const series: RiskPoint[] = await loadSeries(store as Store, now).catch(() => []);
  const latest = series.length ? series[series.length - 1] : undefined;
  if (!latest) return undefined;
  const clash = latest.c;
  const phase = latest.ph;
  const ago = pointNear(series, now - 24 * 3600_000) ?? [...series].reverse().find((p) => now - p.t >= 6 * 3600_000);
  return { label, clash, phase, clashAgo: ago?.c, phaseAgo: ago?.ph };
}
