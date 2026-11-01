// 텍스트(한/영) 기반 규칙 분류기. 오탐 억제를 위해 '관련 지역' + '위협 키워드'가 동시에 있어야 한다.
import type { Category } from "./types.js";

export interface Classification {
  category: Category;
  severity: number;
  drill: boolean;
  retraction: boolean;
  matched: string;
}

export const BASE_SEVERITY: Record<Category, number> = {
  air_raid_alert: 95,
  nuclear_test: 90,
  artillery: 80,
  missile: 75,
  seismic_anomaly: 55,
  launch_notice: 55,
  airspace_anomaly: 45,
  gps_interference: 40,
  aviation_emergency: 35,
  civil_alert_other: 30,
  evacuation: 90,
};

interface Rule {
  category: Category;
  re: RegExp;
  severity?: number;
}

// 순서가 우선순위다. 먼저 맞는 규칙을 채택한다.
const RULES: Rule[] = [
  { category: "air_raid_alert", re: /공습\s*경보|air[- ]raid (alert|warning)/i, severity: 95 },
  { category: "air_raid_alert", re: /경계\s*경보|민방위\s*경보|대피\s*(하|준비)/, severity: 85 },
  { category: "nuclear_test", re: /핵\s*실험|nuclear (test|explosion|detonation)/i },
  { category: "artillery", re: /포격|포탄|해안포|방사포|artillery|shelling/i },
  { category: "missile", re: /탄도\s*미사일|미사일|발사체|ballistic missile|\bmissile\b|\bICBM\b|\bSLBM\b/i },
  { category: "launch_notice", re: /ROCKET (LAUNCH|OPERATIONS)|SPACE DEBRIS|SATELLITE LAUNCH|MISSILE (FIRING|LAUNCH)|위성\s*발사|발사\s*예고/i },
  { category: "launch_notice", re: /GUNNERY|FIRING EXERCISE|LIVE FIRING|HAZARDOUS OPERATIONS|사격\s*(훈련|구역)/i, severity: 35 },
  { category: "gps_interference", re: /\bGPS\b|\bGNSS\b|전파\s*교란|위성항법/i },
  { category: "civil_alert_other", re: /북한|North Korea|DPRK|군사분계선|NLL|무인기|오물\s*풍선|대남\s*풍선/i },
];

/** 한반도 관련성: 영문 항행경보·외신은 지역명이 있어야만 통과 */
const REGION_RE =
  /KOREA|DPRK|PYONGYANG|YELLOW SEA|SEA OF JAPAN|EAST SEA|EAST CHINA SEA|JAPAN|PUNGGYE|SOHAE|TONGCHANG|북한|北|한반도|서해|동해|연평|백령|휴전선|군사분계선|NLL|경기|서울|인천|강원|합참|합동참모본부|국방부/i;

const DRILL_RE = /훈련\s*(상황|입니다|임|중)|민방위\s*훈련|을지|모의|시험\s*발송|\bEXERCISE\b(?!.*LIVE FIRING)|\bDRILL\b|\bTEST MESSAGE\b/i;
const RETRACTION_RE = /오발령|잘못\s*발송|해제|정정|취소|CANCEL|CORRECTION|DISREGARD/i;

// ── 한국을 떠나는 움직임 (2026-11-01 추가) ──
// 미국·일본 등이 자국민·대사관 가족·미군 가족을 한국 밖으로 빼내면, 비공개 정보로 위험을 인정한 가장 무거운 신호다(2022-01-23 주우크라이나
// 미 대사관 가족 철수 명령 → 한 달 뒤 침공). 다만 주한미군은 해마다 봄·가을 가족 후송 훈련을 하고(2016년 가을엔 실제로 C-130 으로 주일미군
// 기지까지 이송), 2017-09-21 엔 가짜 '실제 대피' 문자가 돌았다. 그래서 훈련·가짜·'유사시 계획'은 기록만 하고 알리지 않는다.
// '주한미군 철수(감축)' 논쟁, 외국인 투자자 이탈, 다른 나라에서의 교민 철수는 여기에 해당하지 않는다.
const EVAC_WHO_RE = /가족|민간인|비전투원|자국민|미국인|일본인|중국인|미\s*시민|미국\s*시민|대사관\s*(직원|인력)|외교관|\bNEO\b|dependents|families|citizens|nationals|non-?combatant|embassy (staff|personnel)|diplomats/i;
const EVAC_ACT_RE = /대피|후송|피신|소개\s*(작전|명령)|출국\s*(권고|명령|권유|준비|시작)|철수\s*(명령|시작|개시|권고|착수|작전)|떠나(라|도록|야)|evacuat|ordered departure|authorized departure|voluntary departure|order(s|ed)? (the )?departure|departure of|(leave|depart|flee) (south )?korea|\bNEO\b/i;
const EVAC_FROM_KR_RE = /주한|한국\s*(에서|내|체류|거주|을|를|떠)|in (south )?korea|from (south )?korea|(leave|depart|flee) (south )?korea|서울|한반도|seoul|korean peninsula/i;
const EVAC_ELSEWHERE_RE = /이스라엘|레바논|우크라|러시아|수단|아프간|가자|이란|시리아|미얀마|아이티|니제르|리비아|예멘|홍콩|israel|lebanon|ukraine|sudan|gaza|iran|syria/i;
const EVAC_NOT_RE = /투자자|증시|주식|자금|코스피|매도|펀드|관광객|investor|stocks?|funds?/i;
const EVAC_DRILL_RE = /훈련|연습|모의|exercise|drill|courageous channel|커레이저스|커리져스/i;
const EVAC_HOAX_RE = /가짜|허위|사실무근|오보|해프닝|fake|hoax|false/i;
const EVAC_PLAN_RE = /유사시|계획|검토|대비|시나리오|방안|점검|논의|매뉴얼|가능성|contingency|\bplans?\b/i;
const EVAC_GO_RE = /명령|개시|시작|착수|권고|권유|촉구|떠나라|즉시|실시|orders?|ordered|authoriz|begins?|began|underway|urged|told to leave|leave now|depart immediately/i;

export function classifyEvacuation(text: string): Classification | null {
  if (!EVAC_WHO_RE.test(text) || !EVAC_ACT_RE.test(text) || !EVAC_FROM_KR_RE.test(text) || EVAC_NOT_RE.test(text)) return null;
  if (EVAC_ELSEWHERE_RE.test(text) && !/주한|한국에서|한국\s*내|in (south )?korea/i.test(text)) return null;
  const matched = EVAC_ACT_RE.exec(text)![0];
  if (EVAC_HOAX_RE.test(text)) return { category: "evacuation", severity: 30, drill: false, retraction: true, matched };
  if (EVAC_DRILL_RE.test(text)) return { category: "evacuation", severity: 18, drill: true, retraction: false, matched };
  if (EVAC_PLAN_RE.test(text) && !EVAC_GO_RE.test(text.replace(EVAC_PLAN_RE, ""))) return { category: "evacuation", severity: 40, drill: false, retraction: false, matched };
  return { category: "evacuation", severity: BASE_SEVERITY.evacuation, drill: false, retraction: false, matched };
}

export function classifyText(text: string, opts: { requireRegion?: boolean } = {}): Classification | null {
  const evac = classifyEvacuation(text);
  if (evac) return evac;
  if (opts.requireRegion && !REGION_RE.test(text)) return null;
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (!m) continue;
    // '북한' 언급만 있는 기타 안내는 지역 키워드가 곧 매칭이므로 별도 필터 불필요
    const drill = DRILL_RE.test(text);
    const retraction = RETRACTION_RE.test(text);
    let severity = r.severity ?? BASE_SEVERITY[r.category];
    if (drill) severity = Math.round(severity * 0.2);
    if (retraction) severity = Math.min(severity, 50);
    return { category: r.category, severity, drill, retraction, matched: m[0] };
  }
  return null;
}

export function isKoreaRelevant(text: string): boolean {
  return REGION_RE.test(text);
}
