// docs/INDICATORS.md 의 '지금 코드에 있는 징후 전체' 표 — 코드(indicators.ts)에서 만든다 (2026-11-02)
// 손으로 쓴 표가 코드와 어긋나(지표 39개 중 18개를 지금 이름으로 찾을 수 없었다), 분석관이 옛 문서를 보고
// 이미 수집 중인 일본 해상보안청 항행경보를 '미수집'이라고 썼다. 이 표는 테스트가 코드와 같은지 확인한다 — 다르면 `npm run docs:indicators`.
import { INDICATORS, GROUP_LABEL, MIN_DAYS, type IndicatorDef } from "./indicators.js";

export const DOC_BEGIN = "<!-- INDICATORS:BEGIN 자동 생성 — 손으로 고치지 말고 npm run docs:indicators -->";
export const DOC_END = "<!-- INDICATORS:END -->";

const cell = (s: string) => s.replace(/\|/g, "／").replace(/\s+/g, " ").trim();

function judgeText(d: IndicatorDef): string {
  if (!d.absolute) return `최근 4주 같은 시간대 평소 대비 2σ 상승 · 3σ 이상 (기록 ${MIN_DAYS}일 전에는 큰 변화만)`;
  const dir = d.direction === "low" ? "−" : "";
  return `고정 문턱: ${dir}${d.absolute.elevated} 상승 · ${dir}${d.absolute.anomalous} 이상${d.unit ? ` (${d.unit})` : ""}`;
}

export function indicatorDocTable(): string {
  const rows = INDICATORS.map((d) => `| ${GROUP_LABEL[d.group]} | \`${d.id}\` | ${cell(d.label)} | ${cell(d.measure)} | ${cell(judgeText(d))} | ${cell(d.coverage ?? "—")} |`);
  return [DOC_BEGIN, "| 묶음 | id | 이름 | 무엇을 재나 | 판정 | 범위 제한 |", "|---|---|---|---|---|---|", ...rows, DOC_END].join("\n");
}

/** 문서 안의 자동 생성 표를 새로 만든 표로 바꾼다 (없으면 그대로) */
export function replaceDocTable(doc: string): string {
  const a = doc.indexOf(DOC_BEGIN);
  const b = doc.indexOf(DOC_END);
  if (a < 0 || b < 0) return doc;
  return doc.slice(0, a) + indicatorDocTable() + doc.slice(b + DOC_END.length);
}
