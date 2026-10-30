// 해석 엔진: 징후판의 숫자를 사람 말로 풀고, 징후끼리 조합해 '힌트'를 만든다.
// 규칙 기반이라 5분마다 비용 없이 돌며, 클로드 분석관(하루 2회)은 이 결과 위에서 더 깊은 추론을 보탠다.
// 원칙: 숫자 → 뜻 → 조합 → 근거 → 반대 해석 → 지금 확인할 것. 단정하지 않고 '힌트'라고 부른다.
import type { BoardRow } from "./state.js";
import type { Pattern } from "./patterns.js";
import type { EventBrief } from "./brief.js";
import { inChineseMoratorium, inExerciseSeason } from "./patterns.js";

export interface Hint {
  /** warning: 위험 쪽 힌트 · reassuring: 안심 쪽 힌트 · caveat: 해석 주의 · gap: 사각지대 */
  kind: "warning" | "reassuring" | "caveat" | "gap";
  title: string;
  reasoning: string;
  /** 이 힌트를 뒤집을 수 있는 반대 해석 */
  counter?: string;
  /** 지금 확인하면 좋은 것 */
  check?: string;
  indicators: string[];
}

export interface Interpretation {
  /** 한 줄 결론 */
  headline: string;
  /** 상황을 설명하는 문단들 (순서대로 읽으면 하나의 이야기) */
  narrative: string[];
  hints: Hint[];
  /** 징후별 한 줄 뜻풀이 */
  perIndicator: Record<string, string>;
  /** 해석에 반영한 맥락 (심야·훈련철·휴어기 등) */
  context: string[];
  abnormalCount: number;
  learningCount: number;
  unavailableCount: number;
}

export interface InterpretInput {
  now: number;
  threat: { level: number; label: string; summary: string; lastProvocation: { headline: string; at: number } | null };
  board: BoardRow[];
  patterns: Pattern[];
  /** 최근 사건 요약 (최신순) */
  briefs: EventBrief[];
}

const H = 3600_000;

function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 2 ? `${d}일 ${h % 24}시간 전` : `${d}일 전`;
}

function fmt(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(2)}%`;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
}

function pctOfBaseline(row: BoardRow): number | undefined {
  const r = row.reading;
  if (!r || r.baseline === undefined || r.baseline <= 0) return undefined;
  return Math.round((r.value / r.baseline) * 100);
}

/** 이상 상태가 몇 시간째 이어지는지 (시간별 평균이 기준선의 60% 미만 또는 160% 초과인 연속 구간) */
function anomalyDurationHours(row: BoardRow): number {
  const r = row.reading;
  if (!r || r.baseline === undefined || !row.history.length) return 0;
  const low = row.direction === "low";
  let n = 0;
  for (const h of [...row.history].sort((a, b) => b.hour - a.hour)) {
    const bad = low ? h.avg < r.baseline * 0.6 : h.avg > r.baseline * 1.6;
    if (!bad) break;
    n++;
  }
  return n;
}

function isAbnormal(row: BoardRow | undefined): boolean {
  return !!row?.reading && (row.reading.state === "elevated" || row.reading.state === "anomalous") && row.stateLabel !== "측정 불가";
}
function isUnavailable(row: BoardRow | undefined): boolean {
  return !row || !row.reading || row.stateLabel === "측정 불가";
}
function isLearning(row: BoardRow | undefined): boolean {
  return !!row?.reading && row.reading.state === "learning" && row.stateLabel !== "측정 불가";
}

/** 징후 하나의 숫자를 뜻으로 풀어 쓴다 */
export function meaningOf(row: BoardRow, ctx: { night: boolean; exercise: boolean; moratorium: boolean }): string {
  const r = row.reading;
  const id = row.id;
  if (isUnavailable(row)) {
    if (id.startsWith("sea.")) return "측정 불가 — 서해 선박(AIS) 키가 없어 '중국 어선이 사라졌는가' 같은 해상 힌트는 지금 볼 수 없음";
    if (id.startsWith("thermal.")) return "측정 불가 — 위성 열점(FIRMS) 키가 없어 발사장·시험장의 열 활동은 볼 수 없음";
    if (id.startsWith("social.")) return "측정 불가 — SNS 공개 검색이 서버에서 차단됨. 사이렌·폭발음 목격담은 수집 안 됨";
    return "측정 불가 — 최근 30시간 내 관측 없음(소스 오류 또는 미설정)";
  }
  const v = r!.value;
  const unit = row.unit;
  const base = r!.baseline;
  const p = pctOfBaseline(row);
  const learn = isLearning(row) ? ` (기준선 학습 중 ${r!.n}/10 — 아직 '평소'와 비교할 수 없음)` : "";
  const vs = base !== undefined && !isLearning(row) ? ` · 이 시간대 평소 ${fmt(base, unit)}` : "";

  switch (id) {
    case "air.civil_airborne": {
      if (isAbnormal(row) && p !== undefined && p < 100) {
        const dur = anomalyDurationHours(row);
        return `민항기 ${v}대 — 평소의 ${p}% 수준${dur ? `, ${dur}시간째 지속` : ""}. 공역 통제·대규모 결항이면 이렇게 보임. 단 안개·태풍·수신기 장애에도 같은 모양${ctx.night ? "이고 심야라 표본이 적음" : ""}`;
      }
      return `민항기 ${v}대${vs}${learn} → ${ctx.night ? "심야 교통량 수준, " : ""}공역 통제·우회 징후 없음`;
    }
    case "air.mil_airborne":
      if (isAbnormal(row)) return `동북아 군용기 ${v}대${vs} — 평소보다 많음. ${ctx.exercise ? "연합훈련 철이라 자연스러운 증가일 수 있음" : "증원·급유·수송 활동 가능성. 기종 목록을 봐야 함"}`;
      return `동북아에서 ADS-B 로 보이는 군용기 ${v}대${vs}${learn} → 눈에 띄는 전개 없음 (트랜스폰더를 끈 기체는 원래 안 보임)`;
    case "air.isr_airborne": {
      const ac = (r!.meta as any)?.aircraft as any[] | undefined;
      if (v === 0) return "정찰·급유기 미관측 → 미사일 발사 임박 때 흔히 보이는 RC-135 계열 전개가 지금은 보이지 않음 (임무기는 종종 송출을 끔)";
      const names = (ac ?? []).slice(0, 3).map((a) => `${a.what.split("(")[0].trim()}${a.lat !== undefined ? `(${a.lon > 128.5 ? "동해" : a.lon < 125.5 ? "서해" : "한반도"} 상공)` : ""}`).join(", ");
      return `정찰·급유기 ${v}대 관측: ${names}. ${ctx.exercise ? "연합훈련 철 정례 비행일 가능성 높음" : "RC-135S·WC-135 면 발사·핵실험 관측 임무 가능성 — 등록번호로 확인 필요"}`;
    }
    case "sea.ys_vessels_total":
      if (isAbnormal(row) && p !== undefined && p < 100) return `서해 선박 ${v}척 — 평소의 ${p}%. 해역이 비는 것은 사격·봉쇄 또는 기상 악화${ctx.moratorium ? ", 지금은 중국 휴어기라 어선이 원래 적음" : ""}`;
      return `서해 선박 ${v}척${vs}${learn} → 해역 활동 평소 수준`;
    case "sea.ys_china_vessels":
      if (isAbnormal(row) && p !== undefined && p < 100) return `중국 선박 ${v}척 — 평소의 ${p}%. '중국 어선이 사라졌다'는 위기 때 반복된 관찰${ctx.moratorium ? ". 단 지금은 휴어기(5/1~8/16)라 정상일 수 있음" : ""}`;
      return `서해 중국 선박 ${v}척${vs}${learn} → 중국 어선 철수 징후 없음`;
    case "sea.nk_flag_vessels":
      return v === 0 ? "AIS 를 켠 북한 선박 없음 (평소에도 거의 없음)" : `북한 국적 선박 ${v}척 송출 중 — 드문 일, 위치·종류 확인 가치`;
    case "seismic.nk_events_24h":
      return v === 0 ? "북한 지역 지진 없음 → 핵실험 신호 없음 (핵실험은 규모 4~6 얕은 지진으로 10~30분 내 탐지됨)" : `북한 지역 지진 ${v}건 — 깊이·풍계리 거리로 인공 여부 판정 필요`;
    case "navwarn.korea_active":
      return `한반도 주변 유효 항행경보 ${v}건${vs}${learn}${isAbnormal(row) ? " → 평소보다 많음. 사격·발사 구역이 늘었는지 내용 확인" : " → 새 통제 구역 징후 없음"}`;
    case "navwarn.launch_notice_active":
      return v === 0 ? "발사 예고 항행경보 없음 → 위성·장거리 로켓 발사 임박 징후 없음 (북한은 위성 발사 전 일본에 구역을 통보해 왔음). 단거리 미사일은 예고 없이 쏨" : `발사 예고 항행경보 ${v}건 — 발신 당국이 북한(DPRK)인지, 기간이 언제인지가 핵심`;
    case "official.us_travel_level_kr":
      return v <= 1 ? "미 국무부 한국 여행경보 1단계(일반 주의) 유지 → 미국 정부가 자국민에게 위험을 경고하지 않는 상태" : v === 2 ? "미 여행경보 2단계로 상향 — 드문 일. 사유(치안·보건·안보) 확인 필요" : `미 여행경보 ${v}단계 — 미국 정부가 한국 방문 재고·금지를 권고. 매우 강한 신호`;
    case "official.uk_advice_security_flag":
      return v === 0 ? "영국 외무부 한국 여행권고에 안보 경고 없음" : "영국 외무부가 한국 여행권고에 안보 관련 갱신 — 미국과 독립된 두 번째 서방 정부 판단";
    case "official.mnd_provocation_24h":
      return v === 0 ? "국방부 보도자료에 북한 도발 관련 발표 없음(최근 24h)" : `국방부가 북한 도발 관련 보도자료 ${v}건 발표 — 정부 공식 확인`;
    case "rhetoric.nk_statements_24h":
      return `북한 담화·성명 보도 ${v}건(24h)${vs}${learn}${isAbnormal(row) ? " → 평소보다 잦음. 도발 전 '명분 쌓기' 단계인지 톤(시한·대상 언급)을 봐야 함" : " → 평소 수준"}`;
    case "rhetoric.nk_hostile_24h":
      return v === 0 ? "적대 핵심어(핵·보복·초토화 등) 담긴 보도 없음 → 위협 수위 낮음" : `적대 핵심어 담긴 보도 ${v}건${vs}${isAbnormal(row) ? " → 위협 수위 상승" : ""}`;
    case "media.breaking_nk_1h":
      return v === 0 ? "최근 1시간 북한 관련 속보 없음 → 진행 중인 사건 없음" : `최근 1시간 북한 관련 속보 ${v}건 → 무언가 진행 중. 사건 목록 확인`;
    case "social.alarm_posts_1h":
      return v === 0 ? "SNS 에 사이렌·경보 목격담 없음" : `SNS 사이렌·경보 언급 ${v}건(1h) — 가짜 뉴스·훈련 가능성 있음, 공식 경보와 대조`;
    case "market.usdkrw_change_pct": {
      const m = r!.meta as any;
      const signed = m?.signedPct as number | undefined;
      const dir = signed === undefined ? "" : signed > 0 ? "원화 약세" : "원화 강세";
      return `원·달러 ${m?.price ? `${Math.round(m.price)}원, ` : ""}전일 대비 ${signed !== undefined ? (signed > 0 ? "+" : "") + signed : v}% (${dir})${isAbnormal(row) ? " → 큰 변동. 뉴스 없는 시간대면 시장이 먼저 반응했을 수 있음" : " → 평온"}`;
    }
    case "internet.kp_outage_alerts_24h":
      return v === 0 ? "북한 인터넷 외부망 정상 → 내부 이상 징후 없음" : `북한 인터넷 장애 경보 ${v}건(24h) — 사이버 공격·내부 통제·정전 가능성. 평소에도 불안정하긴 함`;
    case "gnss.bad_ratio_korea":
    case "gnss.bad_ratio_westsea":
    case "gnss.bad_ratio_north": {
      const where = id.endsWith("korea") ? "한반도 전체" : id.endsWith("westsea") ? "서해" : "북한 상공";
      return `${where} GPS 교란 비율 ${fmt(v, "%")} (전일) → ${isAbnormal(row) ? "평소보다 높음. 북한 전자전 가동 또는 러·중발 교란 가능성" : "교란 없음 수준"}. 하루 지연 데이터`;
    }
    case "thermal.nk_hotspots_24h":
      return `북한 영역 위성 열점 ${v}건(24h) — 대부분 농업 소각·산불. 발사장 인근 건수가 중요`;
    case "thermal.launch_site_hotspots":
      return v === 0 ? "발사장·시험장 12km 안 열점 없음 → 엔진 시험·연소 활동 징후 없음" : `발사장·시험장 인근 열점 ${v}건 — 엔진 시험 또는 인근 소각. 야간·고출력이면 가중`;
    default:
      return `${fmt(v, unit)}${vs}${learn}`;
  }
}

/** 징후를 조합해 힌트를 만든다 */
export function interpret(input: InterpretInput): Interpretation {
  const { now, threat, board, patterns, briefs } = input;
  const by = Object.fromEntries(board.map((b) => [b.id, b])) as Record<string, BoardRow>;
  const kstHour = new Date(now + 9 * H).getUTCHours();
  const night = kstHour >= 0 && kstHour < 6;
  const exercise = inExerciseSeason(now);
  const moratorium = inChineseMoratorium(now);
  const ctx = { night, exercise, moratorium };

  const context: string[] = [];
  if (night) context.push("심야(00~06시) — 항공·SNS·속보 표본이 원래 적은 시간대");
  if (exercise) context.push("한미 연합훈련 철(3월·8월) — 정찰기·군용기 증가와 북한 비난 담화는 이 시기 정상");
  if (moratorium) context.push("중국 서해 휴어기(5/1~8/16) — 중국 어선 감소는 정상");

  const perIndicator: Record<string, string> = {};
  for (const row of board) perIndicator[row.id] = meaningOf(row, ctx);

  const abnormal = board.filter(isAbnormal);
  const learning = board.filter(isLearning);
  const unavailable = board.filter(isUnavailable);
  const hints: Hint[] = [];
  const val = (id: string) => by[id]?.reading?.value;
  const ok = (id: string) => by[id] && !isUnavailable(by[id]) && !isLearning(by[id]) && !isAbnormal(by[id]);
  const lastProv = briefs.find((b) => b.isProvocation);
  const lastProvAgeH = lastProv ? (now - lastProv.at) / H : Infinity;

  // ── 조합 힌트 ────────────────────────────────────────────────
  // 1) 대형 발사 선행 징후의 '부재' — 그 자체가 정보다
  const launchQuiet = val("navwarn.launch_notice_active") === 0 && !isAbnormal(by["air.isr_airborne"]) && !isAbnormal(by["rhetoric.nk_hostile_24h"]) && !isAbnormal(by["rhetoric.nk_statements_24h"]);
  if (launchQuiet && !isUnavailable(by["navwarn.launch_notice_active"])) {
    hints.push({
      kind: "reassuring",
      title: "위성·장거리 발사 임박 징후는 없음",
      reasoning: "발사 예고 항행경보 0건, 정찰기 전개 없음, 북한 담화 평소 수준. 과거 위성 발사(2023년 5·8·11월)는 모두 사전 통보가 있었고, 장거리 시험 전에는 RC-135S 전개가 보도됐다.",
      counter: "단거리 탄도미사일·방사포는 예고 없이 쏜다. 이 힌트는 '대형 발사'에만 해당한다.",
      check: "정찰기 목록(RC-135S·WC-135)과 항행경보 신규 발행을 다음 주기에 다시 본다",
      indicators: ["navwarn.launch_notice_active", "air.isr_airborne", "rhetoric.nk_hostile_24h"],
    });
  }
  // 2) 발사 예고 + 정찰기 → 준비 중
  if ((val("navwarn.launch_notice_active") ?? 0) >= 1) {
    const isr = val("air.isr_airborne") ?? 0;
    hints.push({
      kind: "warning",
      title: "발사 예고 구역이 설정돼 있음",
      reasoning: `항행경보에 로켓·미사일 발사 구역 ${val("navwarn.launch_notice_active")}건이 유효하다${isr >= 1 ? `. 같은 시간 정찰·급유기 ${isr}대가 떠 있어 '관측 태세'와 맞물린다` : ""}. 북한이 통보한 것이면 수일 내 발사 가능성이 높다.`,
      counter: "중국·러시아·한국군 발사·사격 구역일 수 있다. 발신 당국(authority)과 좌표를 봐야 한다.",
      check: "check_navigational_warnings(keyword=ROCKET) 로 발신 당국·기간 확인",
      indicators: ["navwarn.launch_notice_active", "air.isr_airborne"],
    });
  }
  // 3) 정찰기 등장 (예고 없이)
  if (isAbnormal(by["air.isr_airborne"]) && (val("navwarn.launch_notice_active") ?? 0) === 0) {
    hints.push({
      kind: exercise ? "caveat" : "warning",
      title: `정찰·급유기 ${val("air.isr_airborne")}대 — 평소보다 많음`,
      reasoning: exercise ? "연합훈련 철이라 정찰기 증가는 정상 범위로 볼 수 있다." : "발사 예고 없이 정찰기가 늘었다. 미국이 무언가를 '보려고' 할 때 나타나는 모양이며, 단거리 발사 전에도 코브라볼이 뜬 사례가 있다.",
      counter: "정례 임무·급유 훈련일 수 있다. 기종 코드만으로는 RC-135S 와 KC-135 를 완전히 구분하지 못한다.",
      check: "check_military_aircraft 로 등록번호·궤적(동해 왕복 비행이면 관측 임무) 확인",
      indicators: ["air.isr_airborne"],
    });
  }
  // 4) 민항기 급감 — 원인 분리
  if (isAbnormal(by["air.civil_airborne"]) && (pctOfBaseline(by["air.civil_airborne"]) ?? 100) < 100) {
    const row = by["air.civil_airborne"];
    const total = (row.reading!.meta as any)?.total as number | undefined;
    const quietNews = (val("media.breaking_nk_1h") ?? 0) === 0 && !isAbnormal(by["social.alarm_posts_1h"]);
    const milUp = isAbnormal(by["air.mil_airborne"]);
    const dur = anomalyDurationHours(row);
    hints.push({
      kind: quietNews && !milUp ? "caveat" : "warning",
      title: `한반도 상공 민항기가 평소의 ${pctOfBaseline(row)}%${dur ? ` (${dur}시간째)` : ""}`,
      reasoning: quietNews && !milUp
        ? `항공기만 줄고 속보·SNS·군용기 변화는 없다. 이런 모양은 보통 기상(안개·태풍)이나 수신기 장애다${total !== undefined && total <= row.reading!.value + 2 ? ". 지상 포함 전체 수신 대수도 함께 줄어 수신 문제 가능성이 더 크다" : ""}.`
        : `항공기 감소와 함께 ${milUp ? "군용기 증가" : ""}${milUp && !quietNews ? "·" : ""}${!quietNews ? "속보/SNS 움직임" : ""}이 겹친다. 공역 통제(NOTAM)나 항공사 우회가 시작됐을 때의 모양이다.`,
      counter: quietNews && !milUp ? "그래도 공역 통제 초기일 수 있다 — 30분 뒤에도 지속되면 다시 본다." : "대형 기상 악화에 군 수송이 겹친 우연일 수 있다.",
      check: "check_airspace_detail(region=korea) 로 실제 대수·기종, search_news('결항 우회 기상')",
      indicators: ["air.civil_airborne", "air.mil_airborne", "media.breaking_nk_1h"],
    });
  }
  // 5) 담화 급증 → 명분 쌓기?
  if (isAbnormal(by["rhetoric.nk_statements_24h"]) || isAbnormal(by["rhetoric.nk_hostile_24h"])) {
    hints.push({
      kind: "warning",
      title: "북한 담화·위협 수사가 평소보다 잦음",
      reasoning: `담화·성명 ${val("rhetoric.nk_statements_24h")}건, 적대 핵심어 ${val("rhetoric.nk_hostile_24h")}건(24h). 2022~2024년 발사 전 1~3일 담화가 집중된 사례가 반복됐다. '시한'이나 '구체적 대상'이 등장하면 가중.`,
      counter: exercise ? "연합훈련 철에는 비난 담화가 원래 많다." : "유엔·외교 일정에 대한 반응일 수 있다. 수사만으로는 행동을 예측하기 어렵다.",
      check: "check_state_media 로 담화 제목의 톤·시한·대상 확인",
      indicators: ["rhetoric.nk_statements_24h", "rhetoric.nk_hostile_24h"],
    });
  }
  // 6) 서방 정부 경계
  if ((val("official.us_travel_level_kr") ?? 1) >= 2 || (val("official.uk_advice_security_flag") ?? 0) >= 1) {
    hints.push({
      kind: "warning",
      title: "서방 정부가 자국민에게 경고하기 시작함",
      reasoning: `미 여행경보 ${val("official.us_travel_level_kr")}단계${(val("official.uk_advice_security_flag") ?? 0) >= 1 ? ", 영국도 안보 관련 갱신" : ""}. 정부는 정보가 있을 때 자국민 경보를 먼저 바꾼다 — '피자 지수'의 공식 버전.`,
      counter: "치안·보건·시위 사유로도 단계가 바뀐다. 본문을 읽어야 한다.",
      check: "check_travel_advisories 원문, search_news('주한미군 FPCON 대사관 철수')",
      indicators: ["official.us_travel_level_kr", "official.uk_advice_security_flag"],
    });
  }
  // 7) 연쇄 도발 국면
  const recentProvs = briefs.filter((b) => b.isProvocation && now - b.at < 72 * H);
  if (recentProvs.length >= 2) {
    hints.push({
      kind: "warning",
      title: `72시간 안에 도발 ${recentProvs.length}건 — 연쇄 무력시위 국면`,
      reasoning: recentProvs.slice(0, 3).map((b) => `${ago(b.at, now)} ${b.headline}`).join(" / ") + ". 연속 시험 국면에서는 추가 발사 확률이 평소보다 높다.",
      counter: "대개 며칠 내 가라앉는다. 담화·정찰기·항행경보가 함께 오르지 않으면 확전 징후로 보지 않는다.",
      indicators: [],
    });
  } else if (lastProv && lastProvAgeH < 48) {
    hints.push({
      kind: "caveat",
      title: `마지막 도발 ${ago(lastProv.at, now)} — 후속 움직임 주시 구간`,
      reasoning: `${lastProv.headline}. 도발 뒤 48시간은 추가 발사·담화가 이어지기 쉬운 구간이다. 현재 선행 징후(항행경보·정찰기·담화)는 ${launchQuiet ? "조용하다" : "일부 움직임이 있다"}.`,
      indicators: [],
    });
  }
  // 8) 뉴스 없는 시장 급변
  if (isAbnormal(by["market.usdkrw_change_pct"]) && (val("media.breaking_nk_1h") ?? 0) === 0 && lastProvAgeH > 6) {
    hints.push({
      kind: "caveat",
      title: "뉴스 없이 환율이 크게 움직임",
      reasoning: `원·달러 변동 ${fmt(val("market.usdkrw_change_pct")!, "%")}인데 북한 관련 속보는 없다. 시장이 먼저 아는 경우가 드물게 있다.`,
      counter: "대부분은 미국 금리·달러 강세·국내 경제 뉴스다. 경제 뉴스를 먼저 확인.",
      check: "check_markets, search_news('환율 급등')",
      indicators: ["market.usdkrw_change_pct", "media.breaking_nk_1h"],
    });
  }
  // 9) 속보 템포 급증
  if (isAbnormal(by["media.breaking_nk_1h"])) {
    hints.push({
      kind: "warning",
      title: `북한 관련 속보가 몰리고 있음 (1시간 ${val("media.breaking_nk_1h")}건)`,
      reasoning: "속보가 짧은 시간에 몰리는 것은 '무언가 진행 중'이라는 가장 빠른 신호다. 사건 목록에 이미 잡혔는지 본다.",
      check: "search_news(query='북한', hours=2)",
      indicators: ["media.breaking_nk_1h"],
    });
  }
  // 10) 북한 내부 이상
  if (isAbnormal(by["internet.kp_outage_alerts_24h"]) || isAbnormal(by["gnss.bad_ratio_north"])) {
    hints.push({
      kind: "caveat",
      title: "북한 내부 신호에 변화",
      reasoning: `${isAbnormal(by["internet.kp_outage_alerts_24h"]) ? `인터넷 외부망 장애 ${val("internet.kp_outage_alerts_24h")}건. ` : ""}${isAbnormal(by["gnss.bad_ratio_north"]) ? `북한 상공 GPS 교란 ${fmt(val("gnss.bad_ratio_north")!, "%")}(전일). ` : ""}내부 통제 강화·전자전 가동·사이버 공격 중 하나일 수 있다.`,
      counter: "북한 인터넷은 평소에도 자주 끊기고, GPS 교란은 러·중발일 수 있다.",
      indicators: ["internet.kp_outage_alerts_24h", "gnss.bad_ratio_north"],
    });
  }
  // 11) 서해 어선 이탈
  if (isAbnormal(by["sea.ys_china_vessels"]) && (pctOfBaseline(by["sea.ys_china_vessels"]) ?? 100) < 100) {
    hints.push({
      kind: moratorium ? "caveat" : "warning",
      title: `서해 중국 선박이 평소의 ${pctOfBaseline(by["sea.ys_china_vessels"])}%`,
      reasoning: moratorium ? "휴어기라 중국 어선 감소는 정상이다." : "'중국 어선이 모두 사라졌다'는 현장 보고는 서해 긴장 때 반복됐다. 중국 당국이 어선을 철수시키면 사전 인지의 간접 증거일 수 있다.",
      counter: "태풍·기상, AIS 꺼짐, 수신 범위 문제일 수 있다.",
      check: "check_yellow_sea_vessels, check_navigational_warnings(keyword=GUNNERY)",
      indicators: ["sea.ys_china_vessels"],
    });
  }
  // 12) 패턴 엔진 결과를 힌트로 편입
  for (const p of patterns) {
    hints.push({
      kind: p.confidence === "low" ? "caveat" : "warning",
      title: `패턴 감지: ${p.name} (신뢰도 ${p.confidence === "high" ? "높음" : p.confidence === "medium" ? "보통" : "낮음"})`,
      reasoning: p.summary,
      counter: p.alternatives[0],
      check: p.checks[0],
      indicators: p.evidence.map((e) => e.indicator),
    });
  }
  // 13) 사각지대
  const blind: string[] = [];
  if (unavailable.some((u) => u.id.startsWith("sea."))) blind.push("서해 선박(AIS 키 없음) — '중국 어선 철수' 같은 해상 힌트를 못 봄");
  if (unavailable.some((u) => u.id.startsWith("thermal."))) blind.push("위성 열점(FIRMS 키 없음) — 발사장 엔진 시험 열을 못 봄");
  if (unavailable.some((u) => u.id.startsWith("social."))) blind.push("SNS 목격담(차단) — 사이렌·폭발음 현장 보고를 못 봄");
  if (blind.length) {
    hints.push({
      kind: "gap",
      title: `사각지대 ${blind.length}곳`,
      reasoning: blind.join(" · "),
      check: "docs/INDICATORS.md 6절의 무료 키를 넣으면 켜짐",
      indicators: unavailable.map((u) => u.id),
    });
  }
  if (learning.length >= 5) {
    hints.push({
      kind: "caveat",
      title: `기준선 학습 중인 징후 ${learning.length}개`,
      reasoning: "'평소'가 아직 없어서 이 징후들은 정상/이상을 가리지 못한다. 절대 임계값이 있는 항목(여행경보·발사 예고·지진 등)만 지금 판정이 유효하다.",
      indicators: learning.map((l) => l.id),
    });
  }

  // ── 이야기로 엮기 ─────────────────────────────────────────
  const order = { warning: 0, caveat: 1, reassuring: 2, gap: 3 } as const;
  hints.sort((a, b) => order[a.kind] - order[b.kind]);
  const warnings = hints.filter((h) => h.kind === "warning");

  const narrative: string[] = [];
  const lead = lastProv ? `마지막 북한 도발은 ${ago(lastProv.at, now)} ${lastProv.headline}.` : "최근 30일 안에 확인된 북한의 발사·포격은 없다.";
  narrative.push(`${threat.level <= 1 ? "현재 평시 수준이다." : `현재 ${threat.label} 수준이다.`} ${lead}`);

  if (abnormal.length === 0) {
    narrative.push(`측정 가능한 징후 ${board.length - unavailable.length - learning.length}개가 모두 평소 범위 안이다${learning.length ? ` (${learning.length}개는 아직 기준선 학습 중)` : ""}. 평소와 다른 것이 없다.`);
  } else {
    narrative.push(`평소와 다른 것 ${abnormal.length}가지: ${abnormal.map((a) => `${a.label} ${fmt(a.reading!.value, a.unit)}${pctOfBaseline(a) !== undefined ? `(평소의 ${pctOfBaseline(a)}%)` : ""}`).join(", ")}.`);
  }
  if (warnings.length) {
    narrative.push(`주목할 힌트: ${warnings.map((w) => w.title).join(" / ")}. ${warnings[0].reasoning}${warnings[0].counter ? ` 반대로 보면 — ${warnings[0].counter}` : ""}`);
  } else {
    const re = hints.find((h) => h.kind === "reassuring");
    if (re) narrative.push(`${re.title}. ${re.reasoning} ${re.counter ?? ""}`.trim());
  }
  if (blind.length) narrative.push(`다만 ${blind.map((b) => b.split("(")[0].trim()).join("·")} 쪽은 지금 보지 못한다. 그 방면은 판단을 유보한다.`);

  const headline =
    warnings.length >= 2 ? `주목할 힌트 ${warnings.length}개 — ${warnings[0].title}` :
    warnings.length === 1 ? warnings[0].title :
    abnormal.length ? `평소와 다른 징후 ${abnormal.length}개, 위험 쪽 조합은 아직 없음` :
    lastProv && lastProvAgeH < 48 ? `도발 후 ${ago(lastProv.at, now).replace(" 전", "")} 경과 — 후속 징후 없음` :
    "평소와 다른 징후 없음";

  return { headline, narrative, hints, perIndicator, context, abnormalCount: abnormal.length, learningCount: learning.length, unavailableCount: unavailable.length };
}
