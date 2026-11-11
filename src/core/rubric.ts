// 위기 지수 채점표 (2026-11-11 사용자: "20점인 게 주관적인 게 마음에 안 든다 — 기준을 정해라", "보이는 현상만 채점하지 말고 우리가 재는 신호로 봐라")
//
// 0점 = 모든 항목이 꺼진 상태. 기준 시점은 2018년 가을(평양 정상회담·9·19 군사합의 직후) — 같은 표로 매기면 5점.
// 100점 = 모든 항목이 켜진 상태. 우크라이나 2022 침공 전날을 같은 표로 매기면 80점 안팎.
// 네 층으로 나눈다:
//   ① 한반도 바탕 15 — 오래 이어지는 구조적 긴장 (대화 단절·합의 파기 등). 천천히 변한다. '요즘 평균'과 비교하면 사라지는 부분.
//   ② 세계 정세 15 — 미국이 다른 전쟁에 묶였나, 주한미군 전력이 빠졌나, 북한의 후원국이 전쟁 중인가.
//   ③ 보이는 것 25 — 말·선언·사건. 비용 없이 낼 수 있어 배점을 낮게 둔다.
//   ④ 실제 행동 45 — 사람이 빠지고, 돈이 빠지고, 군이 움직인 것. 비용이 드는 행동이라 가장 무겁게 둔다. 대부분 우리가 직접 재는 숫자다.
// 점수는 판단값이다 — 사례 42건 채점으로는 가중치를 데이터로 정하지 못했다(docs/PRECURSORS.md). 대신 표를 공개하고 과거 한반도의 날들로 검산한다.
import type { Obs, SignalNow } from "./precursors.js";

export type LayerId = "base" | "world" | "seen" | "action";
export interface RubricItem { id: string; pts: number; ko: string }
export interface RubricGroup { id: string; label: string; max: number; items: RubricItem[] }
export interface RubricLayer { id: LayerId; label: string; max: number; why: string; groups: RubricGroup[] }

export const RUBRIC_VERSION = 2;
/** 단계가 시작되는 점수: 20 긴장 · 35 위기 · 60 임박 */
export const INDEX_AT: Record<number, number> = { 2: 20, 3: 35, 4: 60 };
/** 임박(60점 이상)에 필요한 행동 신호 — 둘 이상 확인돼야 한다 */
export const ACTION_KEYS = ["g_evac_order", "g_leave_now", "g_regional_drawdown", "g_attacker_evac", "m_logistics", "m_mobilization", "m_buildup"];

export const RUBRIC: RubricLayer[] = [
  {
    id: "base", label: "한반도 바탕", max: 15, why: "한반도에 오래 이어지는 구조적 긴장 — 한 달에 한 번쯤 점검",
    groups: [{
      id: "S", label: "구조적 긴장", max: 15,
      items: [
        { id: "s_talks", pts: 3, ko: "남북·북미 대화 채널이 모두 끊김" },
        { id: "s_agreement", pts: 3, ko: "충돌 방지 합의(9·19 군사합의·정전협정)가 파기·효력 정지" },
        { id: "s_doctrine", pts: 3, ko: "북한이 한국을 '적대국'으로 규정하거나 핵 선제사용을 법·헌법에 명시" },
        { id: "s_friction", pts: 2, ko: "접경의 상시 마찰 (확성기·전단·풍선·GPS 교란이 몇 달째)" },
        { id: "s_tests", pts: 2, ko: "최근 12개월 안에 핵실험 또는 ICBM급 발사" },
        { id: "s_casualty", pts: 2, ko: "최근 5년 안에 사상자가 난 남북 무력 충돌" },
      ],
    }],
  },
  {
    // 11/11 사용자: "전 세계가 3차 대전을 말하는 긴장 상황인데 평온이 나오면 안 된다" — 한반도 안쪽만 보던 것이 원인이었다.
    // 미국이 다른 전쟁에 묶이고 주한미군 전력이 빠지면 억지력이 약해지고, 북한의 후원국이 전쟁 중이면 북한의 계산이 달라진다.
    id: "world", label: "세계 정세", max: 15, why: "한반도 밖의 전쟁이 한반도의 억지력과 북한의 계산을 바꾼다 — 한 달에 한 번쯤 점검",
    groups: [{
      id: "X", label: "세계 정세", max: 15,
      items: [
        { id: "w_us_war", pts: 4, ko: "미국이 다른 지역에서 전쟁·대규모 군사작전 중" },
        { id: "w_us_assets_out", pts: 3, ko: "주한미군·인도태평양 전력이 다른 곳으로 빠짐 (사드·패트리엇·항모·탄약)" },
        { id: "w_patron_war", pts: 3, ko: "북한의 후원국(러시아·중국)이 전쟁 중이거나 북한이 파병" },
        { id: "w_taiwan", pts: 2, ko: "대만해협·동중국해의 군사 위기" },
        { id: "w_nuclear", pts: 2, ko: "강대국의 핵 위협·핵실험 재개·군비통제 붕괴" },
        { id: "w_markets", pts: 1, ko: "세계 금융의 전쟁 공포 (금·유가·변동성 급등)" },
      ],
    }],
  },
  {
    id: "seen", label: "보이는 것", max: 25, why: "말·선언·사건 — 누구나 볼 수 있고 비용 없이 낼 수 있다",
    groups: [
      { id: "T", label: "사건·계기", max: 10, items: [
        { id: "t_trigger", pts: 8, ko: "사상자가 난 계기 사건과 보복 다짐" },
        { id: "t_major_test", pts: 5, ko: "최근 30일 안에 핵실험 또는 ICBM급 발사" },
        { id: "t_deadline", pts: 4, ko: "명시적 시한 임박" },
        { id: "t_provocation", pts: 2, ko: "최근 7일 안에 미사일 발사 등 도발" },
      ] },
      { id: "D", label: "선언·태세", max: 8, items: [
        { id: "g_ultimatum", pts: 4, ko: "최후통첩·무력사용 공식 승인·단교" },
        { id: "g_intel_warning", pts: 4, ko: "정보당국의 '공격 임박' 공개 경고" },
        { id: "m_alert_level", pts: 3, ko: "군 경계태세 공식 격상" },
        { id: "g_talks_collapse", pts: 3, ko: "협상 결렬" },
        { id: "m_exercise_cover", pts: 2, ko: "'훈련' 병력이 남거나 훈련 연장" },
        { id: "m_leadership", pts: 2, ko: "지도부의 이례적 동선" },
      ] },
      { id: "I", label: "말·여론", max: 7, items: [
        { id: "i_state_mobilization", pts: 3, ko: "관영매체의 전시 동원 서사" },
        { id: "i_leader_threat", pts: 2, ko: "최고지도자의 명시적 위협·명분 연설" },
        { id: "i_pretext", pts: 2, ko: "명분 만들기" },
        { id: "i_news_surge", pts: 1, ko: "전쟁 관련 보도량 급증" },
        { id: "i_public_anxiety", pts: 1, ko: "대중 불안 — 검색·사재기" },
      ] },
    ],
  },
  {
    id: "action", label: "실제 행동", max: 45, why: "사람·돈·군이 실제로 움직인 것 — 비용이 드는 행동이라 가장 무겁게",
    groups: [
      { id: "P", label: "사람이 빠진다", max: 18, items: [
        { id: "g_evac_order", pts: 10, ko: "제3국 대사관 철수 명령" },
        { id: "g_leave_now", pts: 8, ko: "자국민 '즉시 출국' 권고" },
        { id: "g_attacker_evac", pts: 8, ko: "공격하는 쪽이 자기 사람을 뺌" },
        { id: "g_regional_drawdown", pts: 6, ko: "이웃 나라·역내 인력 감축" },
        { id: "f_capital_flight", pts: 5, ko: "부자·기업의 이탈 (기업 제트기 출국·주재원 철수)" },
        { id: "m_airspace", pts: 5, ko: "항공사 운항 중단·영공 폐쇄·민항기 급감" },
        { id: "g_staff_restrict", pts: 4, ko: "대사관 직원 이동 제한·대피 지시" },
        { id: "m_civil_defense", pts: 4, ko: "민방위 조치·주민 소개" },
        { id: "a_fleet", pts: 2, ko: "서해 중국 어선이 빠짐" },
      ] },
      { id: "W", label: "군이 움직인다", max: 16, items: [
        { id: "m_logistics", pts: 8, ko: "야전병원·혈액·연료·탄약의 전방 이동" },
        { id: "m_mobilization", pts: 7, ko: "예비군 동원·휴가 중단" },
        { id: "m_buildup", pts: 7, ko: "국경·전선에 병력·장비 집결" },
        { id: "m_border_fire", pts: 4, ko: "전선 교전·포격 급증" },
        { id: "m_strategic_assets", pts: 3, ko: "정찰기·폭격기·항모 등 전략자산 집결" },
        { id: "m_gps_ew", pts: 3, ko: "GPS 교란·전자전 급증" },
        { id: "a_launch_prep", pts: 2, ko: "발사 준비 정황 (발사 예고 항행경보·발사장 열점)" },
        { id: "m_cyber", pts: 2, ko: "정부·기반시설 사이버 공격" },
      ] },
      { id: "F", label: "돈이 빠진다", max: 11, items: [
        { id: "f_fx", pts: 3, ko: "원화 급락" },
        { id: "f_sovereign", pts: 3, ko: "국채·CDS 급등" },
        { id: "f_prediction", pts: 3, ko: "예측시장 전쟁 가격 급등" },
        { id: "f_equity", pts: 2, ko: "한국 증시만 급락" },
        { id: "f_safe_haven", pts: 2, ko: "방산주·금 급등" },
      ] },
    ],
  },
];

export interface ScoredItem extends RubricItem { s: Obs; weak: boolean; got: number; ev?: string; by?: string }
export interface ScoredGroup { id: string; label: string; max: number; pts: number; items: ScoredItem[] }
export interface ScoredLayer { id: LayerId; label: string; max: number; why: string; pts: number; groups: ScoredGroup[] }
export interface RubricScore {
  index: number;
  phase: 1 | 2 | 3 | 4;
  layers: ScoredLayer[];
  /** 말과 행동이 어긋나는가 — 화면 한 줄 */
  divergence?: { kind: "talk" | "quiet_move" | "both"; text: string };
  /** 켜진 항목 수 / 확인한 항목 수 / 아직 확인 못 한 항목 수 */
  on: number;
  watched: number;
  waiting: number;
  /** 왜 더 오르지 않았나 (제한 규칙이 걸렸을 때) */
  capped?: string;
}

/** 채점: 켜짐 = 배점 전부, 약함(미확인·'상승' 수준) = 절반, 못 본 것은 0점이지만 '확인 대기'로 따로 센다. 묶음·층마다 상한 */
export function scoreRubric(status: Record<string, SignalNow | undefined>): RubricScore {
  let on = 0, watched = 0, waiting = 0;
  const layers: ScoredLayer[] = RUBRIC.map((L) => {
    const groups = L.groups.map((g) => {
      const items: ScoredItem[] = g.items.map((it) => {
        const st = status[it.id];
        const s: Obs = st?.s ?? "unk";
        const weak = s === "on" && (st?.w ?? 1) < 1;
        if (s === "unk") waiting++; else watched++;
        if (s === "on") on++;
        return { ...it, s, weak, got: s === "on" ? it.pts * (st?.w ?? 1) : 0, ev: st?.ev, by: st?.by };
      });
      return { id: g.id, label: g.label, max: g.max, pts: Math.min(g.max, items.reduce((a, x) => a + x.got, 0)), items };
    });
    return { id: L.id, label: L.label, max: L.max, why: L.why, pts: Math.min(L.max, groups.reduce((a, g) => a + g.pts, 0)), groups };
  });
  const of = (id: LayerId) => layers.find((l) => l.id === id)!;
  const moving = [...of("seen").groups, ...of("action").groups].filter((g) => g.pts > 0).length;
  const actions = of("action").groups.flatMap((g) => g.items).filter((x) => x.s === "on" && !x.weak && ACTION_KEYS.includes(x.id)).length;
  let total = layers.reduce((a, l) => a + l.pts, 0), capped: string | undefined;
  // 신호 하나·한 묶음만으로는 '위기'가 되지 않는다. '임박'은 행동 신호가 둘 이상 확인돼야 한다
  if (moving < 2 && total >= INDEX_AT[3]) { total = INDEX_AT[3] - 1; capped = "한 묶음의 신호뿐이라 위기(35점)로 올리지 않아요"; }
  if (actions < 2 && total >= INDEX_AT[4]) { total = INDEX_AT[4] - 1; capped = "철수·병참·동원 같은 실제 행동이 둘 이상 확인되지 않아 임박(60점)으로 올리지 않아요"; }
  const index = Math.round(Math.min(100, total));
  const seen = of("seen").pts, act = of("action").pts;
  const divergence: RubricScore["divergence"] =
    seen >= 12 && act < 5 ? { kind: "talk", text: "말과 사건은 시끄러운데 사람·돈·군은 거의 움직이지 않았어요." }
    : act >= 10 && seen < 8 ? { kind: "quiet_move", text: "겉은 조용한데 사람·돈·군이 움직이고 있어요 — 가장 주의해서 볼 모양이에요." }
    : act >= 10 && seen >= 12 ? { kind: "both", text: "말·사건과 실제 행동이 함께 움직이고 있어요." }
    : undefined;
  return { index, phase: index >= INDEX_AT[4] ? 4 : index >= INDEX_AT[3] ? 3 : index >= INDEX_AT[2] ? 2 : 1, layers, divergence, on, watched, waiting, capped };
}

/** 지수 → 30일 국지 충돌 % (판단값): 0 = 평소 바닥 · 20 = 3% · 35 = 8% · 60 = 20% · 100 = 바닥 + 25% */
export function clashOfIndex(index: number, quietPct: number): number {
  const k: [number, number][] = [[0, quietPct], [INDEX_AT[2], 3], [INDEX_AT[3], 8], [INDEX_AT[4], 20], [100, 25 + quietPct]];
  for (let i = 0; i < 4; i++) if (index <= k[i + 1][0]) return +(k[i][1] + ((index - k[i][0]) / (k[i + 1][0] - k[i][0])) * (k[i + 1][1] - k[i][1])).toFixed(1);
  return +(25 + quietPct).toFixed(1);
}

/**
 * 바탕 항목의 지금 상태 — 천천히 변하므로 코드에 날짜·근거와 함께 적어 두고, 분석관이 확인하면 그 값이 덮어 쓴다(record_precursor_checks, 45일 유효).
 * 확인하지 못한 항목은 0점이고 화면에 '확인 대기'로 나온다 — 추측으로 켜지 않는다.
 */
export const BASE_SEED: { asOf: string; items: Record<string, { v: 0 | 0.5 | 1; ev: string }> } = {
  asOf: "2026-11-11",
  items: {
    s_talks: { v: 1, ev: "11/10 김여정, 유엔 사무총장의 대화 촉구에 '한국 편향' 유감 표명 — 남북·북미 대화 없음" },
    s_doctrine: { v: 1, ev: "11/11 북한, 헌법 전문 공개 — '두 국가' 반영 공식화 (연합뉴스)" },
    s_agreement: { v: 0.5, ev: "9·19 군사합의는 2024년 6월 전면 효력정지 — 2026년 5월까지 '일부 복원 검토' 단계 (그 뒤는 미확인)" },
    s_friction: { v: 0.5, ev: "확성기는 2025년 6월 양쪽 모두 중단. 2026년 10월 김여정이 대남 확성기 재개 예고 — 군은 가동 미확인" },
    s_tests: { v: 0, ev: "최근 12개월 ICBM 발사·핵실험 보도 없음 (2026년 3월 고체연료 엔진 시험만)" },
    s_casualty: { v: 0, ev: "최근 5년 사상자가 난 남북 충돌 없음" },
    w_us_war: { v: 1, ev: "미국·이스라엘의 대이란 전쟁 (2026년 2월 28일 시작) — 11월 초 협상 중, 종결 미확인" },
    w_us_assets_out: { v: 1, ev: "2026년 3~8월 주한미군 사드 일부·패트리엇·탄약이 중동으로 이동 (복귀 여부 미확인)" },
    w_patron_war: { v: 1, ev: "러시아–우크라이나 전쟁 계속 (11월 기준 종전 합의 없음)" },
    w_taiwan: { v: 0, ev: "긴장은 높지만 침공·봉쇄 같은 군사 위기는 없음" },
  },
};
