// 패턴 탐지: 서로 독립된 징후가 동시에 이상을 보일 때 '의심 패턴'으로 묶는다.
// 각 규칙은 왜 그 조합이 의미 있는지, 다른 설명(대안 가설)은 무엇인지, 다음에 무엇을 확인해야 하는지를 함께 낸다.
// 점수는 설명 가능한 가중 합이며 확률이 아니다. 단일 징후로는 어떤 패턴도 'high' 가 되지 않는다.
import type { CrisisEvent, Reading } from "./types.js";
import { INDICATOR_BY_ID } from "./indicators.js";

export type Confidence = "low" | "medium" | "high";

export interface Pattern {
  id: string;
  name: string;
  score: number;
  confidence: Confidence;
  /** 점수에 기여한 징후 */
  evidence: { indicator: string; label: string; value: number; state: string; points: number; note?: string }[];
  summary: string;
  /** 같은 관측을 설명할 수 있는 무해한 이유 */
  alternatives: string[];
  /** 분석 에이전트가 다음에 확인할 것 */
  checks: string[];
}

type R = Record<string, Reading>;

const FRESH_MS = 6 * 3600_000;

function reading(r: R, id: string, now: number): Reading | undefined {
  const x = r[id];
  if (!x || now - x.at > Math.max(FRESH_MS, INDICATOR_BY_ID[id]?.slots === 1 ? 30 * 3600_000 : FRESH_MS)) return undefined;
  return x;
}

function add(p: Pattern, r: R, id: string, now: number, points: { anomalous?: number; elevated?: number; any?: (x: Reading) => number }, note?: string) {
  const x = reading(r, id, now);
  if (!x) return;
  let pts = 0;
  if (points.any) pts = points.any(x);
  else if (x.state === "anomalous") pts = points.anomalous ?? 0;
  else if (x.state === "elevated") pts = points.elevated ?? 0;
  if (pts <= 0) return;
  p.score += pts;
  p.evidence.push({ indicator: id, label: INDICATOR_BY_ID[id]?.label ?? id, value: x.value, state: x.state, points: pts, note });
}

function isLow(x: Reading) {
  return x.baseline !== undefined && x.value < x.baseline;
}

/** 중국 서해 휴어기 (5/1~8/16, KST) — 이 기간 중국 어선 감소는 정상 */
export function inChineseMoratorium(now: number): boolean {
  const d = new Date(now + 9 * 3600_000);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return (m >= 5 && m <= 7) || (m === 8 && day <= 16);
}

/** 한미 대규모 연합훈련 철(3월 Freedom Shield, 8월 Ulchi Freedom Shield) — ISR·군용기 증가가 정상인 시기 */
export function inExerciseSeason(now: number): boolean {
  const m = new Date(now + 9 * 3600_000).getUTCMonth() + 1;
  return m === 3 || m === 8;
}

function recentEvents(events: CrisisEvent[], now: number, hours: number, cats: string[]) {
  return events.filter((e) => !e.drill && !e.retracted && e.status !== "UNVERIFIED" && now - (e.eventTime ?? e.firstPublishedTime ?? e.firstDetectedTime) < hours * 3600_000 && e.categories.some((c) => cats.includes(c)));
}

function finalize(p: Pattern): Pattern | null {
  if (p.score < 25 || p.evidence.length === 0) return null;
  // 단일 징후만으로는 medium 을 넘지 않는다
  const distinct = new Set(p.evidence.map((e) => e.indicator)).size;
  p.confidence = p.score >= 75 && distinct >= 2 ? "high" : p.score >= 45 && distinct >= 2 ? "medium" : p.score >= 45 ? "low" : "low";
  p.score = Math.min(100, Math.round(p.score));
  return p;
}

const fmt = (e: Pattern["evidence"][number]) => `${e.label} ${e.value}${INDICATOR_BY_ID[e.indicator]?.unit ?? ""}(${e.state})`;

export function detectPatterns(r: R, events: CrisisEvent[], now = Date.now()): Pattern[] {
  const out: (Pattern | null)[] = [];
  const base = (id: string, name: string, alternatives: string[], checks: string[]): Pattern => ({ id, name, score: 0, confidence: "low", evidence: [], summary: "", alternatives, checks });

  // 1. 발사 준비
  {
    const p = base("launch_prep", "미사일·위성 발사 준비 징후",
      ["한미 연합훈련 철(3월·8월)에는 정찰기 비행이 정상적으로 늘어난다", "항행경보가 중국·러시아 발사용일 수 있다(발신 당국 확인)", "정찰기는 정례 임무로도 매일 비행한다"],
      ["check_navigational_warnings(keyword=ROCKET) 로 예고 구역·기간·발신 당국 확인", "check_military_aircraft 로 정찰기 기종·콜사인·궤적 확인 (RC-135S 코브라볼이면 가중)", "search_news('발사 예고 위성 통보') 로 통보 보도 확인"]);
    add(p, r, "navwarn.launch_notice_active", now, { any: (x) => (x.value >= 1 ? 40 : 0) });
    add(p, r, "air.isr_airborne", now, { anomalous: inExerciseSeason(now) ? 15 : 30, elevated: inExerciseSeason(now) ? 8 : 15 }, inExerciseSeason(now) ? "연합훈련 철이라 감점" : undefined);
    add(p, r, "rhetoric.nk_hostile_24h", now, { anomalous: 15, elevated: 8 });
    add(p, r, "rhetoric.nk_statements_24h", now, { anomalous: 10, elevated: 5 });
    add(p, r, "thermal.launch_site_hotspots", now, { any: (x) => (x.value >= 1 ? 25 : 0) });
    if (recentEvents(events, now, 7 * 24, ["launch_notice"]).length) {
      p.score += 15;
      p.evidence.push({ indicator: "events.launch_notice", label: "최근 7일 발사 예고 사건", value: 1, state: "event", points: 15 });
    }
    out.push(finalize(p));
  }
  // 2. 핵실험 준비
  {
    const p = base("nuclear_test_prep", "핵실험 준비·탐지 징후",
      ["C-135 계열 기종 코드는 KC-135 급유기일 가능성이 더 높다", "지진은 자연지진일 수 있다(깊이·위치 확인)", "적대 수사는 핵과 무관한 이슈일 수 있다"],
      ["check_military_aircraft 로 C-135 계열의 등록번호가 WC-135(61-2667, 62-3582, 64-14836)인지 확인", "check_seismic_activity 로 풍계리 거리·깊이 확인", "search_news('풍계리 핵실험장') 로 위성 분석 보도 확인"]);
    const isr = reading(r, "air.isr_airborne", now);
    const wc = isr?.meta && Array.isArray((isr.meta as any).aircraft) ? ((isr.meta as any).aircraft as any[]).filter((a) => /^C135$/i.test(a.type)) : [];
    if (wc.length) {
      p.score += 25;
      p.evidence.push({ indicator: "air.isr_airborne", label: "C-135 계열 비행 (WC-135 가능성)", value: wc.length, state: "watch", points: 25, note: wc.map((a: any) => a.registration ?? a.callsign).join(", ") });
    }
    add(p, r, "seismic.nk_events_24h", now, { any: (x) => (x.value >= 1 ? 30 : 0) });
    add(p, r, "rhetoric.nk_hostile_24h", now, { anomalous: 15, elevated: 8 });
    const th = reading(r, "thermal.launch_site_hotspots", now);
    const pg = th?.meta && Array.isArray((th.meta as any).points) ? ((th.meta as any).points as any[]).filter((pt) => /풍계리/.test(pt.site)) : [];
    if (pg.length) {
      p.score += 30;
      p.evidence.push({ indicator: "thermal.launch_site_hotspots", label: "풍계리 인근 위성 열점", value: pg.length, state: "watch", points: 30 });
    }
    if (recentEvents(events, now, 7 * 24, ["nuclear_test"]).length) {
      p.score += 40;
      p.evidence.push({ indicator: "events.nuclear_test", label: "핵실험 의심 지진 사건", value: 1, state: "event", points: 40 });
    }
    out.push(finalize(p));
  }
  // 3. 서해 충돌 위험
  {
    const mora = inChineseMoratorium(now);
    const p = base("west_sea_clash", "서해(NLL) 충돌 위험 징후",
      ["중국 휴어기(5/1~8/16)·태풍·기상 악화로 어선이 줄 수 있다", "AIS 를 끈 어선은 보이지 않는다(수신 범위 문제)", "사격훈련 항행경보는 한국군 정례 훈련일 수 있다"],
      ["check_yellow_sea_vessels 로 국적별 선박 수와 기준선 비교", "check_navigational_warnings(keyword=GUNNERY) 로 사격 구역·당국 확인", "search_news('서해 NLL 연평 백령') 로 현장 보도 확인"]);
    add(p, r, "sea.ys_china_vessels", now, { any: (x) => (x.state === "anomalous" && isLow(x) ? (mora ? 15 : 40) : x.state === "elevated" && isLow(x) ? (mora ? 8 : 20) : 0) }, mora ? "휴어기라 감점" : undefined);
    add(p, r, "sea.ys_vessels_total", now, { any: (x) => (x.state === "anomalous" && isLow(x) ? 15 : 0) });
    add(p, r, "navwarn.korea_active", now, { anomalous: 15, elevated: 10 });
    add(p, r, "official.mnd_provocation_24h", now, { any: (x) => (x.value >= 1 ? 20 : 0) });
    add(p, r, "rhetoric.nk_statements_24h", now, { anomalous: 10, elevated: 5 });
    if (recentEvents(events, now, 48, ["artillery"]).length) {
      p.score += 30;
      p.evidence.push({ indicator: "events.artillery", label: "최근 48시간 포격 사건", value: 1, state: "event", points: 30 });
    }
    out.push(finalize(p));
  }
  // 4. 공역 통제 의심
  {
    const p = base("airspace_restriction", "공역 통제·항공 우회 의심",
      ["안개·태풍 등 기상으로 결항이 늘었을 수 있다", "ADS-B 수신기 장애(전체 수신 대수도 함께 줄었는지 확인)", "심야·명절 등 평소 교통량이 적은 시간대", "항공사 파업·공항 사고"],
      ["check_airspace(region=korea, list_aircraft=true) 로 실제 대수·기종 확인", "search_news('항공 결항 우회 공역') 로 기상·운항 보도 확인", "check_airspace(region=east_sea) 로 동해 항로 우회 여부 확인"]);
    add(p, r, "air.civil_airborne", now, { any: (x) => (x.state === "anomalous" && isLow(x) ? 50 : x.state === "elevated" && isLow(x) ? 25 : 0) });
    add(p, r, "media.breaking_nk_1h", now, { anomalous: 25, elevated: 15 });
    add(p, r, "social.alarm_posts_1h", now, { anomalous: 25, elevated: 15 });
    add(p, r, "air.mil_airborne", now, { anomalous: 15, elevated: 8 });
    out.push(finalize(p));
  }
  // 5. 미국·서방 경계 격상
  {
    const p = base("western_posture", "미국·서방 정부 경계 격상",
      ["여행경보는 치안·보건 사유로도 바뀐다(본문 확인)", "영국 권고 갱신은 입국 절차 등 일상 갱신이 대부분"],
      ["check_travel_advisories 로 단계·갱신 문구 원문 확인", "search_news('주한미군 FPCON 대사관 철수 비필수 인원') 로 보도 확인", "check_military_aircraft 로 수송기·급유기 증가 여부 확인"]);
    add(p, r, "official.us_travel_level_kr", now, { any: (x) => (x.value >= 3 ? 70 : x.value >= 2 ? 30 : 0) });
    add(p, r, "official.uk_advice_security_flag", now, { any: (x) => (x.value >= 1 ? 25 : 0) });
    add(p, r, "air.mil_airborne", now, { anomalous: 15, elevated: 8 });
    add(p, r, "air.isr_airborne", now, { anomalous: 10, elevated: 5 });
    out.push(finalize(p));
  }
  // 6. 북한 내부 이상
  {
    const p = base("nk_internal", "북한 내부 이상 징후",
      ["북한 인터넷은 평소에도 자주 끊긴다(정전·장비 장애)", "GPS 교란은 러시아·중국발일 수 있다", "담화 증가는 외교 일정에 따른 반응일 수 있다"],
      ["check_internet_outages 로 장애 시각·데이터원 확인", "search_news('북한 인터넷 마비 정전') 로 보도 확인", "check_state_media 로 담화 제목·톤 확인"]);
    add(p, r, "internet.kp_outage_alerts_24h", now, { anomalous: 40, elevated: 20 });
    add(p, r, "gnss.bad_ratio_north", now, { anomalous: 20, elevated: 10 });
    add(p, r, "rhetoric.nk_statements_24h", now, { anomalous: 15, elevated: 8 });
    out.push(finalize(p));
  }
  // 7. 정보 템포 급증
  {
    const p = base("info_tempo", "정보 템포 급증 — 무언가 진행 중",
      ["정치·경제 뉴스로 속보가 몰릴 수 있다", "시장 급변은 금리·달러 요인이 대부분", "SNS 는 가짜 뉴스·훈련에도 반응한다"],
      ["search_news(query='북한', hours=2) 로 무엇이 속보인지 확인", "check_emergency_alerts 로 공식 경보 여부 확인", "get_situation 으로 이미 사건이 잡혔는지 확인"]);
    add(p, r, "media.breaking_nk_1h", now, { anomalous: 35, elevated: 15 });
    add(p, r, "social.alarm_posts_1h", now, { anomalous: 30, elevated: 15 });
    add(p, r, "market.usdkrw_change_pct", now, { anomalous: 25, elevated: 10 });
    out.push(finalize(p));
  }
  // 8. 다영역 동시 이상
  {
    const groups = new Map<string, Reading[]>();
    for (const x of Object.values(r)) {
      if (x.state !== "anomalous" || now - x.at > FRESH_MS) continue;
      const g = INDICATOR_BY_ID[x.indicator]?.group ?? "?";
      groups.set(g, [...(groups.get(g) ?? []), x]);
    }
    if (groups.size >= 2) {
      const p = base("multi_domain", `다영역 동시 이상 (${groups.size}개 영역)`,
        ["우연의 일치(여러 지표가 각각 다른 이유로 흔들릴 수 있다)", "기준선 학습 초기의 오판"],
        ["각 영역의 check_* 도구로 개별 원인을 먼저 확인", "get_indicator_history 로 이상이 동시에 시작됐는지 시각을 대조"]);
      p.score = groups.size >= 3 ? 50 + 10 * (groups.size - 3) : 30;
      for (const [, xs] of groups) for (const x of xs) p.evidence.push({ indicator: x.indicator, label: INDICATOR_BY_ID[x.indicator]?.label ?? x.indicator, value: x.value, state: x.state, points: 0 });
      out.push(finalize(p));
    }
  }

  const patterns = out.filter((p): p is Pattern => !!p);
  for (const p of patterns) p.summary = p.evidence.map(fmt).join(" · ");
  return patterns.sort((a, b) => b.score - a.score);
}
