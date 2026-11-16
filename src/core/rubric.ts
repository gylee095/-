// 위기 판정 (2026-11-11 사용자: "배점이 정답인지 모른다 — 신빙성이 없다", "기습은 돈·엘리트의 움직임 같은 다른 신호로 잡아야 한다")
//
// 배점을 없앴다. 계기판은 둘이고, 둘 다 '몇 개가 켜졌나'를 센다:
//   ① 전쟁 전 징조 — 조사한 예고된 전쟁 16건 중 절반 이상에서 전쟁 전에 공개적으로 나타난 징조 9개(SIGNS). 고른 기준은 '절반 이상'이라는 규칙이고
//      scripts/build-precursors.ts 가 자료와 맞는지 확인한다. 과거 기록: 5개 이상 켜졌던 17건 중 13건이 전쟁, 4개 이하 16건 중 3건 (docs/PRECURSORS.md).
//   ② 조용한 움직임 — 뉴스와 무관하게 직접 재는 것(사람·돈·군이 평소를 벗어났나). 기습은 공개 징조가 없으므로 이쪽으로만 잡을 수 있다.
//      과거 검증은 없다(욤키푸르 1973·한국전쟁 1950 때 공격 측이 자기 사람을 뺀 기록이 근거의 전부) — 기록이 쌓이면 '평소에 몇 개가 우연히 같이 켜지나'부터 알 수 있다.
// 배경(한반도의 구조적 긴장·세계 정세)은 전쟁 전 징조가 아니므로 세지 않고 따로 보여 준다. 다만 배경이 여러 개 켜져 있으면 '평온'이라 부르지 않는다.
import type { Obs, SignalNow } from "./precursors.js";

export type LayerId = "signs" | "moves" | "context" | "other";
export interface RubricItem { id: string; pts: number; ko: string }
export interface RubricGroup { id: string; label: string; max: number; items: RubricItem[] }
export interface RubricLayer { id: LayerId; label: string; max: number; why: string; groups: RubricGroup[] }

export const RUBRIC_VERSION = 3;
/** 전쟁 전 공통 징조 9개 — 예고된 전쟁의 절반 이상에서 나타난 것 (자료가 바뀌어 목록이 달라지면 build-precursors 가 실패한다) */
export const SIGNS = ["i_leader_threat", "i_pretext", "m_buildup", "m_border_fire", "g_ultimatum", "g_talks_collapse", "t_trigger", "g_intel_warning", "m_strategic_assets"];
/** 단계가 시작되는 켜진 비율 %: 10 긴장 · 25 위기 · 50 임박 (교전은 실제 교전 보도) */
export const PCT_AT: Record<number, number> = { 2: 10, 3: 25, 4: 50 };
/** 실제 징조가 나타났다고 보는 수 (알림·기습 판단용): 징조 3개 */
export const SIGNS_AT: Record<number, number> = { 2: 3, 3: 5, 4: 7 };
/** 조용한 움직임이 이만큼 함께 켜지면: 3개 → 최소 긴장(기습 주의), 5개 → 최소 위기 */
export const MOVES_AT = { watch: 3, crisis: 5 };
/** 배경 항목이 이만큼 켜져 있으면 '평온'이라 부르지 않는다 (최소 긴장) */
export const CONTEXT_TENSE = 4;

const g = (id: string, label: string, items: [string, string][]): RubricGroup => ({ id, label, max: items.length, items: items.map(([i, ko]) => ({ id: i, pts: 1, ko })) });

export const RUBRIC: RubricLayer[] = [
  {
    id: "signs", label: "전쟁 전 징조", max: 9, why: "예고된 전쟁 16건 중 절반 이상에서 전쟁 전에 공개적으로 나타난 징조 — 몇 개가 켜졌는지만 센다",
    groups: [g("S9", "공통 징조 9개", [
      ["i_leader_threat", "최고지도자의 명시적 위협·명분 연설"],
      ["i_pretext", "명분 만들기 ('도발·학살' 주장, 자작극 의혹)"],
      ["m_buildup", "국경·전선에 병력·장비 집결"],
      ["m_border_fire", "전선 교전·포격 급증"],
      ["g_ultimatum", "최후통첩·무력사용 공식 승인·단교"],
      ["g_talks_collapse", "협상 결렬"],
      ["t_trigger", "사상자가 난 계기 사건과 보복 다짐"],
      ["g_intel_warning", "정보당국의 '공격 임박' 공개 경고"],
      ["m_strategic_assets", "항모·폭격기·정찰기 등 전략자산 집결"],
    ])],
  },
  {
    id: "moves", label: "조용한 움직임", max: 18, why: "뉴스와 무관하게 직접 재는 것 — 사람·돈·군이 평소를 벗어났나. 기습은 이쪽으로만 잡을 수 있다",
    groups: [
      g("P", "사람이 빠진다", [
        ["g_evac_order", "제3국 대사관 철수 명령"],
        ["g_leave_now", "자국민 '즉시 출국' 권고 (각국 여행경보)"],
        ["g_staff_restrict", "대사관 직원 이동 제한·영사 경고"],
        ["g_attacker_evac", "공격할 수 있는 쪽이 자기 사람을 뺌"],
        ["g_regional_drawdown", "이웃 나라·역내 인력 감축"],
        ["f_capital_flight", "부자·기업의 이탈 (기업 제트기 출국·외국인 대량 매도·주재원 철수)"],
        ["m_airspace", "민항기 급감·항공사 운항 중단·영공 폐쇄"],
        ["m_civil_defense", "민방위 조치·주민 소개"],
        ["a_fleet", "서해 중국 어선이 빠짐"],
      ]),
      g("F", "돈이 빠진다", [
        ["f_fx", "원화 급락"],
        ["f_equity", "한국 증시만 급락"],
        ["f_prediction", "예측시장 전쟁 가격 급등"],
        ["f_safe_haven", "방산주·금 급등"],
      ]),
      g("W", "군이 움직인다", [
        ["m_logistics", "야전병원·혈액·연료·탄약의 전방 이동"],
        ["m_mobilization", "예비군 동원·휴가 중단"],
        ["m_gps_ew", "GPS 교란·전자전 급증"],
        ["a_launch_prep", "발사 준비 정황 (발사 예고 항행경보·발사장 열점)"],
        ["a_nk_dark", "북한이 어두워짐 (인터넷 장애·평양 밤 불빛 감소)"],
      ]),
    ],
  },
  {
    id: "context", label: "배경", max: 16, why: "전쟁 전 징조는 아니지만 위험의 바탕 — 세지 않고 따로 보여 준다. 한 달에 한 번쯤 점검",
    groups: [
      g("X", "세계 정세", [
        ["w_us_war", "미국이 다른 지역에서 전쟁·대규모 군사작전 중"],
        ["w_us_assets_out", "주한미군·인도태평양 전력이 다른 곳으로 빠짐 (사드·패트리엇·항모·탄약)"],
        ["w_patron_war", "북한의 후원국(러시아·중국)이 전쟁 중이거나 북한이 파병"],
        ["w_taiwan", "대만해협·동중국해의 군사 위기"],
        ["w_nuclear", "강대국의 핵 위협·핵실험 재개·군비통제 붕괴"],
        ["w_markets", "세계 금융의 전쟁 공포 (금·유가·변동성 급등)"],
        // 11/14 사용자: 세계 정세를 더 넓게 — 전쟁은 서로 이어져 있다
        ["w_infra", "미국·동맹국의 기반시설이 전국 규모로 마비되거나 공격받음 (최근 7일)"],
        ["w_new_war", "새 전쟁·대규모 공격이 시작됨 (최근 30일)"],
        ["w_power_clash", "강대국 사이의 직접 충돌 (격추·함정 충돌·교전)"],
        ["w_us_commit", "미국의 동맹 방위 공약이 약해지는 신호 (주한미군 감축 발표·방위비 갈등으로 철수 거론)"],
      ]),
      g("S", "한반도의 구조적 긴장", [
        ["s_talks", "남북·북미 대화 채널이 모두 끊김"],
        ["s_agreement", "충돌 방지 합의(9·19 군사합의·정전협정)가 파기·효력 정지"],
        ["s_doctrine", "북한이 한국을 '적대국'으로 규정하거나 핵 선제사용을 법·헌법에 명시"],
        ["s_friction", "접경의 상시 마찰 (확성기·전단·풍선·GPS 교란이 몇 달째)"],
        ["s_tests", "최근 12개월 안에 핵실험 또는 ICBM급 발사"],
        ["s_casualty", "최근 5년 안에 사상자가 난 남북 무력 충돌"],
      ]),
    ],
  },
  {
    id: "other", label: "참고 신호", max: 11, why: "전쟁 사례의 절반에 못 미쳐 9개에 들지 못한 것 — 판정에는 쓰지 않고 참고로만",
    groups: [g("O", "참고", [
      ["m_alert_level", "군 경계태세 공식 격상"],
      ["m_exercise_cover", "'훈련' 병력이 남거나 훈련 연장"],
      ["m_leadership", "지도부의 이례적 동선"],
      ["m_cyber", "정부·기반시설 사이버 공격"],
      ["f_sovereign", "국채·CDS 급등"],
      ["i_state_mobilization", "관영매체의 전시 동원 서사"],
      ["i_news_surge", "전쟁 관련 보도량 급증"],
      ["i_public_anxiety", "대중 불안 — 검색·사재기"],
      ["t_deadline", "명시적 시한 임박"],
      ["t_major_test", "최근 30일 안에 핵실험 또는 ICBM급 발사"],
      ["t_provocation", "최근 7일 안에 미사일 발사 등 도발"],
    ])],
  },
];

export interface ScoredItem extends RubricItem { s: Obs; weak: boolean; got: number; ev?: string; by?: string; src?: { t: string; u: string }[] }
export interface ScoredGroup { id: string; label: string; max: number; pts: number; items: ScoredItem[] }
export interface ScoredLayer { id: LayerId; label: string; max: number; why: string; pts: number; groups: ScoredGroup[] }
export interface RubricScore {
  /** 전쟁 전 징조 9개 중 켜진 수 (약함·미확인은 0.5) */
  signs: number;
  /** 조용한 움직임 중 켜진 수 (상승 수준은 0.5) */
  moves: number;
  /** 배경 항목 중 켜진 수 */
  context: number;
  /** 0~100 %: 켜진 수(징조 + 조용한 움직임 + 배경) ÷ 고정 기준 39(PCT_BASE) (11/12 사용자: 단계 옆에 % 로) — 배점 없이 항목 하나를 1로 센다. 전쟁 확률이 아니다 */
  index: number;
  phase: 1 | 2 | 3 | 4;
  layers: ScoredLayer[];
  /** 단계를 정한 이유 한 줄 */
  reason: string;
  /** 뉴스는 조용한데 측정값이 함께 움직임 */
  surprise: boolean;
  /** 확인한 항목 수 / 아직 확인 못 한 항목 수 (참고 신호 제외) */
  watched: number;
  waiting: number;
}

/** 세기: 켜짐 = 1, 약함(미확인·'상승' 수준) = 0.5, 못 본 것은 0이지만 '확인 대기'로 따로 센다 */
export function scoreRubric(status: Record<string, SignalNow | undefined>): RubricScore {
  let watched = 0, waiting = 0;
  const layers: ScoredLayer[] = RUBRIC.map((L) => {
    const groups = L.groups.map((gr) => {
      const items: ScoredItem[] = gr.items.map((it) => {
        const st = status[it.id];
        const s: Obs = st?.s ?? "unk";
        const weak = s === "on" && (st?.w ?? 1) < 1;
        if (L.id !== "other") { if (s === "unk") waiting++; else watched++; }
        return { ...it, s, weak, got: s === "on" ? (weak ? 0.5 : 1) : 0, ev: st?.ev, by: st?.by, ...(st?.src?.length ? { src: st.src } : {}) };
      });
      return { id: gr.id, label: gr.label, max: gr.max, pts: items.reduce((a, x) => a + x.got, 0), items };
    });
    return { id: L.id, label: L.label, max: L.max, why: L.why, pts: groups.reduce((a, x) => a + x.pts, 0), groups };
  });
  const of = (id: LayerId) => layers.find((l) => l.id === id)!.pts;
  const signs = of("signs"), moves = of("moves"), context = of("context");
  // 단계는 켜진 비율(%)의 구간이다 (11/12 사용자: 단계마다 몇 %부터 몇 %인지 보여야 한다) — PCT_AT: 10%부터 긴장, 25%부터 위기, 50%부터 임박.
  // 구간은 과거 시점을 같은 방식으로 센 값에 맞춘 판단값이다: 2018년 평화 3% · 연평도 포격 전날 8% | 2017년 18% · 2013년 21% | 2024년 10월 28% | 인도–파키스탄 2002 59% · 우크라이나 전날 64%.
  const index = pctOn(signs, moves, context);
  const phase: 1 | 2 | 3 | 4 = index >= PCT_AT[4] ? 4 : index >= PCT_AT[3] ? 3 : index >= PCT_AT[2] ? 2 : 1;
  const surprise = moves >= MOVES_AT.watch && Math.floor(signs) < SIGNS_AT[2];
  const reason = surprise
    ? `뉴스의 징조는 ${signs}개뿐인데 조용한 움직임 ${moves}개가 함께 켜졌어요 — 기습 주의`
    : signs === 0 && moves === 0 && context > 0
    ? `전쟁 전 징조와 실제 움직임은 없고, 불안한 배경 ${context}개가 켜져 있어요`
    : `전쟁 전 징조 ${signs}개 · 조용한 움직임 ${moves}개 · 불안한 배경 ${context}개가 켜져 있어요`;
  return { signs, moves, context, index, phase, layers, reason, surprise, watched, waiting };
}

/** 켜진 비율 %: (징조 + 조용한 움직임 + 배경) ÷ 39 */
export const TOTAL_ITEMS = RUBRIC.filter((l) => l.id !== "other").reduce((a, l) => a + l.max, 0);
/**
 * %의 기준은 고정한다 (11/14 사용자: "자가 바뀌어도 %는 유지돼야 한다 — 앞으로도 항목은 계속 늘 텐데 그때마다 숫자가 바뀌면 혼란스럽다").
 * 지켜보는 항목을 늘려도 세상이 달라진 게 아니므로 %는 그대로이고, 새 항목이 실제로 켜질 때만 오른다. 이 값을 바꾸지 않는다 — 단계 구간(PCT_AT)도 이 기준에 맞춰져 있다.
 */
export const PCT_BASE = 39;
export const pctOn = (signs: number, moves: number, context: number) => Math.min(100, Math.round(((signs + moves + context) / PCT_BASE) * 100));

/** 30일 국지 충돌 % (판단값 — 알림 문구용): 징조 수에 따라, 단계가 다른 이유로 올랐으면 그 단계의 최소값 */
export function clashOf(signs: number, phase: number, quietPct: number): number {
  const byN = [quietPct, 1.5, 2, 3, 5, 8, 12, 20, 25, 25];
  const floor = phase >= 4 ? 20 : phase === 3 ? 8 : phase === 2 ? 3 : 0;
  return +Math.max(byN[Math.min(9, Math.floor(signs))], floor).toFixed(1);
}

/**
 * 배경 항목의 지금 상태 — 천천히 변하므로 코드에 날짜·근거와 함께 적어 두고, 분석관이 확인하면 그 값이 덮어 쓴다(record_precursor_checks, 45일 유효).
 * 확인하지 못한 항목은 세지 않고 화면에 '확인 대기'로 나온다 — 추측으로 켜지 않는다.
 */
export const BASE_SEED: { asOf: string; items: Record<string, { v: 0 | 0.5 | 1; ev: string; src?: [string, string][] }> } = {
  asOf: "2026-11-11",
  items: {
    s_talks: { v: 1, ev: "11/10 김여정, 유엔 사무총장의 대화 촉구에 '한국 편향' 유감 표명 — 남북·북미 대화 없음", src: [["\"남부국경사태 時, 구테흐스 책임도\" 위협… (연합뉴스 계열)", "https://www.koreancenter.or.kr/news/articleView.html?idxno=1437388"], ["Pyongyang slams UN chief (The Star, 11/11)", "https://www.thestar.com.my/aseanplus/aseanplus-news/2026/11/11/pyongyang-slams-un-chief"], ["North Korea accuses UN chief of siding with South Korea over border tensions (Daily Maverick, 11/10)", "https://www.dailymaverick.co.za/article/2026-11-10-north-korea-accuses-un-chief-of-siding-with-south-korea-over-border-tensions/"]] },
    s_doctrine: { v: 1, ev: "11/11 북한, 헌법 전문 공개 — '두 국가' 반영 공식화 (연합뉴스)", src: [["내나라, 2년 8개월 만에 헌법 재공개…정부 입수본과 대체로 일치", "https://www.koreancenter.or.kr/news/articleView.html?idxno=1437807"], ["North Korea unveils revised constitution reflecting 'two hostile states' policy (Korea JoongAng Daily)", "https://koreajoongangdaily.com/korea/north-korea-unveils-revised-constitution-reflecting-two-hostile-states-policy/12967144"]] },
    s_agreement: { v: 0.5, ev: "9·19 군사합의는 2024년 6월 전면 효력정지 — 2026년 5월까지 '일부 복원 검토' 단계 (그 뒤는 미확인)", src: [["선제적 9·19 군사합의 일부 복원 가시화 (뉴스토마토)", "https://newstomato.com/ReadNews.aspx?no=1291765"], ["안보실장 “9·19 군사합의 복원 이 대통령 지침…” (2026.1.14)", "https://www.twig24.com/news/2026/01/14/20260114500125"]] },
    s_friction: { v: 0.5, ev: "확성기는 2025년 6월 양쪽 모두 중단. 2026년 10월 김여정이 대남 확성기 재개 예고 — 군은 가동 미확인", src: [["남북, 작년 6월부터 중단…北김여정, 이달 대남확성기 재개 예고", "https://www.koreancenter.or.kr/news/articleView.html?idxno=1427878"], ["접경지역 긴장 고조 피하려는 듯…\"공사 지연 막기 위한 엄포용 카드\"", "https://www.koreancenter.or.kr/news/articleView.html?idxno=1432858"]] },
    s_tests: { v: 0, ev: "최근 12개월 ICBM 발사·핵실험 보도 없음 (2026년 3월 고체연료 엔진 시험만)" },
    s_casualty: { v: 0, ev: "최근 5년 사상자가 난 남북 충돌 없음" },
    w_us_war: { v: 1, ev: "미국·이스라엘의 대이란 전쟁 (2026년 2월 28일 시작) — 11월 초 협상 중, 종결 미확인", src: [["Mediators continue US-Iran negotiations amid war rhetoric: What we know (Al Jazeera, 11/1)", "https://aljazeera.com/news/2026/11/1/mediators-continue-us-iran-negotiations-amid-war-rhetoric-what-we-know"], ["Iran says contacts over ending war continue after talks finish with no breakthrough (gCaptain/Reuters)", "https://gcaptain.com/iran-says-contacts-over-ending-war-continue-after-talks-finish-with-no-breakthrough/"], ["Trump says new attacks on Iran ‘highly unlikely’ as Middle East remains on edge (Saudi Gazette)", "https://saudigazette.com.sa/article/666111/world/trump-says-new-attacks-on-iran-highly-unlikely-as-middle-east-remains-on-edge"]] },
    w_us_assets_out: { v: 1, ev: "2026년 3~8월 주한미군 사드 일부·패트리엇·탄약이 중동으로 이동 (복귀 여부 미확인)", src: [["미국, 주한미군 사드 일부 중동 이동…이란 보복 대비 방공망 재배치 (헤럴드경제)", "https://www.heraldk.com/article/2026030921544730774"], ["사드 기지에 있던 발사대 6대 모두 떠나 (YTN)", "https://www.ytn.co.kr/_ln/0101_202603111347125413"], ["“주한미군 사드, 이미 중동으로 이동” 美 언론 확인…한국 입장은?", "https://v.daum.net/v/20260310135900347"]] },
    w_patron_war: { v: 1, ev: "러시아–우크라이나 전쟁 계속 (11월 기준 종전 합의 없음)", src: [["Russia, Ukraine meet for US-backed talks after Trump says broad deal possible (Al-Monitor, 11월)", "https://www.al-monitor.com/originals/2026/11/russia-ukraine-meet-us-backed-talks-after-trump-says-broad-deal-possible"], ["Russia and Ukraine agree on large-scale prisoner exchange as trilateral talks with US conclude in Abu Dhabi (11/11)", "https://newsonair.gov.in/russia-and-ukraine-agree-on-large-scale-prisoner-exchange-as-trilateral-talks-with-us-conclude-in-abu-dhabi/"]] },
    w_taiwan: { v: 0, ev: "긴장은 높지만 침공·봉쇄 같은 군사 위기는 없음" },
  },
};
