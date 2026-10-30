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
  /KOREA|DPRK|PYONGYANG|YELLOW SEA|SEA OF JAPAN|EAST SEA|EAST CHINA SEA|JAPAN|PUNGGYE|SOHAE|TONGCHANG|북한|한반도|서해|동해|연평|백령|휴전선|군사분계선|NLL|경기|서울|인천|강원|합참|합동참모본부|국방부/i;

const DRILL_RE = /훈련\s*(상황|입니다|임|중)|민방위\s*훈련|을지|모의|시험\s*발송|\bEXERCISE\b(?!.*LIVE FIRING)|\bDRILL\b|\bTEST MESSAGE\b/i;
const RETRACTION_RE = /오발령|잘못\s*발송|해제|정정|취소|CANCEL|CORRECTION|DISREGARD/i;

export function classifyText(text: string, opts: { requireRegion?: boolean } = {}): Classification | null {
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
