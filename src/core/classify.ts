// 텍스트(한/영) 기반 규칙 분류기. 오탐 억제를 위해 '관련 지역' + '위협 키워드'가 동시에 있어야 한다.
import type { Category } from "./types.js";
import { matchTripwire } from "./tripwires.js";

export interface Classification {
  category: Category;
  severity: number;
  drill: boolean;
  retraction: boolean;
  matched: string;
  /** 경보 단어 id (category = posture) */
  tripwire?: string;
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
  posture: 88,
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
  const tw = matchTripwire(text);
  if (tw) {
    const quiet = tw.drill || tw.denied;
    return { category: "posture", severity: quiet ? 15 : BASE_SEVERITY.posture, drill: tw.drill, retraction: tw.denied, matched: tw.matched, tripwire: tw.tripwire.id };
  }
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

// ── 발사 기사 제목 읽기 (2026-11-02) ──
// 같은 '北 … 발사' 라도 ① 지금 막 쏜 속보 ② 북한 매체가 다음 날 스스로 밝힌 시험 ③ 지난 발사를 두고 하는 후속·해설·반응 기사는 전혀 다르다.
// 2026-11-02 합참 "北발사체 모두 공지하진 않아…보안 등 고려 군사적 판단" (10/31 발사를 왜 알리지 않았느냐는 물음에 대한 답)이
// 새 '미상 발사체 발사'로 잡혀 화면 맨 위가 '주의'가 됐고, 정작 10/31 발사를 북한 매체가 밝힌 '北, 전술탄도미사일 집속탄두 위력시험'은
// 제목에 '발사'가 없어 발사로 세지 않았다. 근거와 사례: docs/INDICATORS.md 0.10

/** 공식 기관 발표를 인용한 제목 (예: "[속보] 합참 …", "日방위성 …", "…: JCS", "… ROK military") */
export const OFFICIAL_QUOTE_RE =
  /합참|합동참모본부|국방부|日\s*방위성|일본\s*방위성|방위성|대통령실|행안부|\bJCS\b|Joint Chiefs|Defense Ministry|Ministry of Defense|ROK military|South Korean military|:\s*(Seoul|Tokyo|JCS)\s*$/i;

/** 북한이 무언가를 쐈다는 문장 */
export const PROVOCATION_RE =
  /(북한|北|North Korea|DPRK|Pyongyang).{0,60}(발사|쐈|쏴|사격|포격|fires?|fired|launch(es|ed)?|test-fire|shell|conduct(s|ed)? .{0,30}(missile|rocket|weapons?) (test|launch))|(발사|fires?|launch(es|ed)?).{0,40}(북한|北|North Korea)|경계\s*경보|공습\s*경보|핵\s*실험|nuclear test/i;

/** 논평·분석 투 (언론 단독 보도에만 적용: 공식 속보에도 '…제원 분석 중' 같은 꼬리가 붙는다) */
export const COMMENTARY_RE =
  /accus|mock|museum|분석|논평|가능성\s*(주시|제기|있|배제|커)|주시|침묵|대응방안|비판|규탄|협의|위반|연설|공개|탑재|South Korea tests|우리\s*군.*(시험|훈련)/i;

/** 새 발사가 아니라 지난(또는 아직 없는) 발사를 두고 하는 이야기 — 공식 인용이어도 새 발사로 세지 않는다 */
export const META_LAUNCH_RE = new RegExp(
  [
    // 알렸느냐·공개했느냐
    "공지|미공개|비공개|공개\\s*(하지|안\\s*(해|했|한)|않|여부)|발표\\s*(하지|안\\s*(해|했|한)|않|여부)|알리지\\s*않|함구|은폐|늑장|축소\\s*발표",
    // 반응·외교
    "규탄|항의|유감|비판|협의|논의|회동|대응\\s*방안|공조|통화|안보리|제재|촉구|성토",
    // 해설·되짚기
    "분석|의도|노림수|배경|이유|왜|평가|해설|전문가|일지|올해\\s*(들어\\s*)?\\d+\\s*(번|차례|회)(?!째)|\\d+\\s*월\\s*(에만|들어)|누적|그간|당시|지난\\s*(달|주|해)|지난\\s*\\d{1,2}\\s*일",
    // 아직 쏘지 않은 것 (준비·징후·가능성)
    "징후|임박|준비\\s*(동향|정황|중)|가능성|대비\\s*태세|감시\\s*강화|전망|예상|우려",
    "\\b(why|analysis|explainer|condemn\\w*|protest\\w*|talks|discuss\\w*|sanction\\w*|preparing|imminent|could|may|possible|likely|signs? of|undisclosed)\\b|(didn'?t|did not|not) (announce|disclose)",
  ].join("|"),
  "i",
);

/** 북한 관영매체가 스스로 밝힌 시험·사격 (보통 다음 날 아침 조선중앙통신 → 연합뉴스 '北, … 위력시험' 제목) */
export const SELF_REPORT_RE =
  /위력\s*시험|시험\s*발사|시험\s*사격|검수\s*사격|전투\s*사격|시위\s*사격|발사\s*훈련|사격\s*훈련|성능\s*시험|시험\s*성공|조선중앙통신|노동신문|조선중앙TV|北\s*매체|북한\s*매체|관영\s*매체|김정은\s*(참관|지도|["“'‘])|state media|\bKCNA\b|says (it |its )?.{0,30}(tested|test-fired|launched|fired|flew)|claims? .{0,40}(test|launch)|tested .{0,40}(missile|rocket)|missile flew/i;
const SELF_VERB_RE = /위력\s*시험|성능\s*시험|시험\s*성공|발사|사격|포격|tested|test-fir|launch|fired|firing|flew|(missile|weapons?) test/i;
const NK_SUBJECT_RE = /북한|北|North Korea|DPRK|Pyongyang|Kim Jong Un|김정은/i;
/** 우리 쪽(한국·미국·일본)이 주어인 문장 — 대응 사격·훈련·협의는 북한 도발 보도가 아니다 (문장 맨 앞만 본다: '北, 한미훈련 반발 … 발사'는 북한 이야기) */
const OWN_SIDE_SUBJECT_RE = /^(?:\[[^\]]*\]\s*)*["“'‘]?\s*(우리\s*군|한국군|국군|아군|한미|미군|주한미군|자위대|日\s*자위대|South Korea|U\.?S\.?\s|Japan(ese)? (forces|military|SDF))/i;
const PAST_DATE_RE = /지난\s*(달|주|해)|지난\s*\d{1,2}\s*일|어제|전날|작년|당시|\d+\s*월\s*(에만|들어)|올해\s*(들어\s*)?\d+\s*(번|차례|회)(?!째)|누적/;
const STILL_NEW_RE = /만에|이후|이어|또\s|또다시|재차|다시|연이어|잇따라|연속/;
const FRESH_KO_END_RE = /(발사|쐈|쏴|사격|포격)(했다|해|함)?\s*["”'’」]?\s*(\((종합|\d보)[^)]*\))?\s*$/;
const FRESH_EN_RE = /^(?:\[[^\]]*\]\s*)?(?:BREAKING:?\s*)?(North Korea|N\.?\s?Korea|DPRK|Pyongyang)\s+(fires|launches|test-fires|shoots|fired|launched)\b/i;

/** 제목의 첫 마디 ('…', '...', ' - 매체명' 앞) — 한국 기사 제목은 본문 요지를 앞에 두고 꼬리(반응·해설)를 뒤에 붙인다 */
const mainClause = (title: string) => title.split(/…|\.\.\.|\s-\s/)[0].trim();

/** 속보형 제목인가: 첫 마디가 '북한 … 발사(했다)'로 끝난다. 뒤에 붙은 꼬리('…추가 도발 징후 주시')가 있어도 새 발사다 */
export function isFreshLaunchTitle(title: string): boolean {
  if (FRESH_EN_RE.test(title)) return true;
  const main = mainClause(title);
  if (!FRESH_KO_END_RE.test(main) || !NK_SUBJECT_RE.test(main) || OWN_SIDE_SUBJECT_RE.test(main)) return false;
  // '北, 지난 31일 전술탄도미사일 발사'·'北, 10월에만 4차례 발사'는 되짚기다. 단 '지난달 31일 이후 이틀 만에 또 발사'는 새 발사
  return !PAST_DATE_RE.test(main) || STILL_NEW_RE.test(main);
}

/**
 * 발사 관련 기사 제목 한 줄의 성격
 * - report: 북한이 쐈다는 보도 (기사 시각을 사건 시각으로 본다)
 * - self: 북한 매체가 스스로 밝힌 시험·사격 (보통 전날 일 — 날짜만 안다)
 * - commentary: 논평·분석 투 (공식 인용 속보에 섞인 것만 인정)
 * - meta: 지난 발사를 두고 하는 이야기(공지 여부·반응·해설) 또는 아직 쏘지 않은 것(준비·징후) — 새 발사가 아니다
 * - none: 발사 이야기가 아니다
 */
export type LaunchTitleKind = "report" | "self" | "commentary" | "meta" | "none";

export function launchTitleKind(title: string): LaunchTitleKind {
  const main = mainClause(title);
  // 북한 매체 발표: 첫 마디가 북한의 주장이어야 한다 (뒤 꼬리의 합참 반박 '…합참 "기만 가능성"'은 상관없다). 날짜('지난 31일')는 해설로 보지 않는다
  const selfClaim =
    NK_SUBJECT_RE.test(title) && SELF_REPORT_RE.test(title) && SELF_VERB_RE.test(title) && !OFFICIAL_QUOTE_RE.test(main) && !OWN_SIDE_SUBJECT_RE.test(main);
  if (!PROVOCATION_RE.test(title) && !selfClaim) return "none";
  if (selfClaim && !META_LAUNCH_RE.test(main.replace(/지난\s*(달\s*)?\d{1,2}\s*일/g, ""))) return "self";
  const fresh = isFreshLaunchTitle(title);
  if (!fresh && META_LAUNCH_RE.test(title)) return "meta";
  if (fresh) return "report";
  if (OWN_SIDE_SUBJECT_RE.test(main)) return "commentary";
  return COMMENTARY_RE.test(title) ? "commentary" : "report";
}

const KST_MS = 9 * 3600_000;
const DAY_MS = 86400_000;
/** 한국 시각으로 그날 0시 (UTC ms) */
export const kstDayStart = (ms: number) => Math.floor((ms + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
const WEEKDAY: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** 북한 매체 보도가 말하는 시험 날짜 (한국 시각 0시). 조선중앙통신은 보통 다음 날 아침 6시에 전날 시험을 보도한다 */
export function selfReportDay(title: string, publishedMs: number): number {
  const today = kstDayStart(publishedMs);
  if (/오늘|금일|\btoday\b|this morning/i.test(title)) return today;
  if (/어제|전날|\byesterday\b/i.test(title)) return today - DAY_MS;
  // '지난(달) 31일' — 보도한 날보다 뒤의 날짜면 지난달
  const d = /지난\s*(달\s*)?(\d{1,2})\s*일/.exec(title);
  if (d) {
    const n = Number(d[2]);
    const pub = new Date(today + KST_MS);
    const sameMonth = !d[1] && n <= pub.getUTCDate();
    const t = Date.UTC(pub.getUTCFullYear(), pub.getUTCMonth() - (sameMonth ? 0 : 1), n) - KST_MS;
    if (t <= today && today - t <= 45 * DAY_MS) return t;
  }
  const m = /\bon (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(title);
  if (m) {
    let d = today;
    for (let i = 0; i < 7 && new Date(d + KST_MS).getUTCDay() !== WEEKDAY[m[1].toLowerCase()]; i++) d -= DAY_MS;
    return d;
  }
  // 저녁(18시 이후) 보도는 같은 날 일로 본다
  return new Date(publishedMs + KST_MS).getUTCHours() < 18 ? today - DAY_MS : today;
}
