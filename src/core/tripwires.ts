// 경보 단어(트립와이어) — 기사 제목에 나오면 그 자체가 '한 단계 위'라는 뜻인 공식 태세 변화·발 빼기 행동 (2026-11-01).
// 북한은 위협하는 말을 늘 하므로 '말'이 아니라 군·정부의 태세 명령, 돈과 사람이 실제로 빠지는 행동만 고른다.
// 각 단어는 전쟁 위험 판정의 한 영역을 최소 그 수준까지 올린다(7일). 훈련·부인·다른 나라 이야기는 걸러낸다.
// 근거·과거 사례: docs/INDICATORS.md 0.4
import type { DomainId, Level } from "./warrisk.js";

export interface Tripwire {
  id: string;
  /** 사람이 읽는 이름 */
  label: string;
  /** 판정에서 올리는 영역과 최소 수준 */
  domain: DomainId;
  level: Level;
  /** 제목에서 찾는 표현 */
  re: RegExp;
  /** 왜 보는가 (과거 사례) */
  why: string;
}

const KR = /한국|한반도|북한|北|南|남북|한미|대북|대남|평양|서울|인천|김포|부산|강원|경기|주한|합참|국방부|국정원|軍|군|korea|seoul|incheon|busan|peninsula|pyongyang/i;
/** 그 자체가 한국 군·정부 용어라 지역 확인이 필요 없는 경보 단어 */
const KOREAN_TERMS = new Set(["defcon_up", "watchcon_up", "defense_situation_a", "defense_situation", "cyber_alert", "kr_mobilization"]);

export const TRIPWIRES: Tripwire[] = [
  // ── 한국·미국 군과 정부의 태세 (정보를 가진 쪽의 행동) ──
  { id: "defcon_up", label: "데프콘 격상", domain: "gov", level: 3, re: /데프콘\s*\d?\s*(으로|로)?\s*(격상|상향|발령)|DEFCON\s*\d?\s*(raised|upgraded)/i,
    why: "한미연합 방어준비태세. 평시 4단계에서 3단계로 올린 것은 1976년 판문점 도끼만행, 1983년 아웅산 테러 때뿐이다." },
  { id: "watchcon_up", label: "워치콘 격상", domain: "gov", level: 2, re: /워치콘\s*\d?\s*(으로|로)?\s*(격상|상향|발령)|WATCHCON\s*\d?\s*(raised|upgraded)/i,
    why: "대북 정보감시태세. 핵실험·천안함 같은 큰 도발 뒤 2단계로 올려 왔다 — 정보기관이 위험을 높게 본다는 공식 신호." },
  { id: "defense_situation_a", label: "통합방위사태 갑종 선포", domain: "gov", level: 3, re: /통합방위사태\s*갑종|갑종\s*사태/,
    why: "적의 대규모 침투·국지 도발이 아닌 전면 공격에 해당하는 최고 단계." },
  { id: "defense_situation", label: "통합방위사태·진돗개 하나 발령", domain: "military", level: 2, re: /통합방위사태\s*(을종|병종)?\s*(선포|발령)|진돗개\s*(하나|1)\s*(발령|발동|하달)?/,
    why: "무장공비·침투에 대비한 군경 비상. 1996년 강릉 잠수함, 2015년 8월 포격전 때 발령됐다." },
  { id: "cyber_alert", label: "국가 사이버위기 경보 격상", domain: "gov", level: 1, re: /사이버\s*(위기\s*)?경보.{0,12}(경계|심각).{0,6}(격상|상향|발령)/,
    why: "2022년 1월 13~14일 우크라이나 정부 전산망 파괴 공격(침공 약 40일 전)처럼 사이버 공격은 침공 전에 온다." },
  { id: "kr_mobilization", label: "한국 동원령·전시 선포", domain: "gov", level: 3, re: /(국가\s*)?동원령\s*(선포|발령|하달)|전시\s*(상태|사태)\s*선포(?!.*북)|예비군\s*(동원|소집)\s*(령|명령)/,
    why: "한국 정부가 전시 체제로 들어가는 조치." },
  // ── 북한의 태세 명령 (말이 아니라 부대에 내린 명령) ──
  { id: "nk_war_posture", label: "북한 전시 태세 명령", domain: "military", level: 2,
    re: /준전시\s*상태|전시\s*상태\s*(선포|돌입|진입)|전시\s*상황\s*(돌입|진입)|1호\s*전투근무태세|전투근무\s*태세|(완전\s*)?사격\s*(대기|준비)\s*태세|최고사령부\s*(성명|보도|명령|중대)|정전\s*협정\s*(백지화|무효|파기)/,
    why: "2013년 3월 26일 '1호 전투근무태세', 2015년 8월 '준전시상태', 2024년 10월 13일 포병 8개 여단 '완전사격준비태세'. 세 번 모두 전쟁으로 번지지는 않았지만 위기 단계의 공식 표지였다." },
  { id: "nk_border_evacuation", label: "북한 접경 주민 소개(疏開)", domain: "military", level: 3, re: /(북한|北).{0,20}(접경|전선|최전방|국경).{0,12}(주민|민간인).{0,10}(소개|이주|대피|철수)/,
    why: "1950년 6월 북한은 침공 전 38선 부근 주민을 뒤로 물렸다. 대포를 쏘기 전에 자기 주민부터 빼는 것은 숨기기 어려운 준비다." },
  { id: "pyongyang_embassies_leave", label: "평양 주재 외국 공관 철수", domain: "gov", level: 3,
    re: /(평양|북한|北).{0,20}(주재|소재)?.{0,10}(중국|러시아|외국|각국)?\s*(대사관|공관|외교관).{0,15}(철수|대피|귀국|떠나|출국)|(중국|러시아).{0,10}(대사관|외교관).{0,10}평양.{0,10}(철수|대피|떠나)/,
    why: "2022년 2월 침공 직전 러시아 외교관들이 키이우를 떠났다. 북한 안에 있는 중국·러시아 공관이 사람을 빼면 북한 쪽 사정을 아는 쪽의 행동이다." },
  // ── 돈과 사람이 실제로 빠지는 행동 ──
  { id: "airlines_suspend", label: "외국 항공사 한국 운항 중단", domain: "money", level: 2,
    re: /(항공사|항공|에어라인|airlines?).{0,25}(인천|김포|서울|한국|korea|seoul|incheon).{0,20}(운항|노선|취항|flights?).{0,10}(중단|중지|취소|suspend|cancel|halt)|(인천|김포|서울|한국|korea|seoul).{0,10}(행|노선|flights?).{0,15}(운항\s*)?(중단|중지|suspend|halt)/i,
    why: "2022년 2월 12일, 침공 12일 전 KLM 이 우크라이나 운항을 중단했다. 보험사가 전쟁 위험을 받지 않으면 항공사가 먼저 빠진다." },
  { id: "war_insurance", label: "한국 해역 선박 전쟁보험 위험지역 지정", domain: "money", level: 2,
    re: /(전쟁\s*(위험\s*)?보험|war[- ]risk|Joint War Committee|JWC|listed area).{0,30}(한국|한반도|부산|서해|동해|korea|busan|yellow sea)|(한국|한반도|부산|korea|busan).{0,30}(전쟁\s*(위험\s*)?보험|war[- ]risk|listed area)/i,
    why: "선박 보험시장(로이즈 JWC)이 '전쟁 위험 해역'으로 지정하면 해운이 비싸지고 끊긴다 — 돈을 건 쪽의 판단." },
  { id: "firms_evacuate", label: "외국 기업 한국 직원 철수", domain: "elite", level: 2,
    re: /(외국계?|글로벌|다국적|미국|일본|유럽)\s*(기업|회사|은행|금융사|투자은행).{0,20}(한국|서울|주한).{0,15}(직원|주재원|인력).{0,10}(철수|귀국|대피|출국)|(주재원|외국인\s*직원).{0,10}(한국|서울).{0,10}(철수|대피|출국)/,
    why: "정보와 돈을 가진 쪽이 사람부터 뺀다. 2022년 침공 전 서방 기업들이 우크라이나 주재원을 철수시켰다." },
];

const DRILL_RE = /훈련(?!\s*(아니|아냐|아님))|연습|모의|가상|시뮬레이션|exercise|drill|simulation/i;
const DENY_RE = /사실무근|오보|가짜|허위|없다|아니다|부인|일축|가능성\s*(낮|희박)|검토\s*(안|않)|fake|denies|no plans/i;
const ELSEWHERE_RE = /이스라엘|레바논|이란|우크라|러시아\s*(본토|군)|가자|중동|대만\s*해협|홍해|예멘|israel|iran|ukraine|gaza|middle east|red sea|taiwan strait/i;
// 회고·기념 기사 (연도만 나온 기사는 걸러내지 않는다: "2015년 이후 처음 준전시상태" 는 지금 일이다)
const PAST_RE = /당시|회고|기념식|\d+\s*주년|history of|anniversary/i;

export interface TripwireHit {
  tripwire: Tripwire;
  matched: string;
  drill: boolean;
  denied: boolean;
}

/** 제목에서 경보 단어를 찾는다. 훈련·부인은 표시만 하고(알림 없음), 다른 나라·과거 회고 기사는 버린다 */
export function matchTripwire(title: string): TripwireHit | null {
  for (const t of TRIPWIRES) {
    const m = t.re.exec(title);
    if (!m) continue;
    if (!KOREAN_TERMS.has(t.id) && !KR.test(title)) continue;
    if (ELSEWHERE_RE.test(title) && !/주한|한국에서|한국\s*내|서울|인천|부산/.test(title)) continue;
    if (PAST_RE.test(title)) continue;
    return { tripwire: t, matched: m[0], drill: DRILL_RE.test(title), denied: DENY_RE.test(title) };
  }
  return null;
}

export const TRIPWIRE_BY_ID: Record<string, Tripwire> = Object.fromEntries(TRIPWIRES.map((t) => [t.id, t]));
