// 전쟁 위험 모델 — "미사일이 언제 오나"가 아니라 "전쟁으로 번질 위험이 평소보다 얼마나 높은가".
//
// 1) 다섯 영역(정부의 행동·돈의 움직임·군사 동향·북한의 말·사람들의 불안)을 각각 평소/주의/경계/심각으로 판정한다.
// 2) 영역 조합으로 국면을 5단계(평온·긴장·위기·임박·교전)로 매긴다. 북한의 말처럼 공짜로 낼 수 있는 신호만으로는
//    '위기'가 되지 않는다 — 비공개 정보를 가진 쪽(정부)이나 돈을 건 쪽(시장)이 반응하거나, 실제 포격·핵실험이 있어야 한다.
// 3) 단계마다 정해 둔 30일 확률 범위(국지 충돌·전면전) 안에서 영역 압력만큼 위치를 잡는다.
//    범위는 통계 적합값이 아니라 근거를 밝힌 판단값이다 — docs/INDICATORS.md '전쟁 위험 모델' 참고.
// 4) '누가 먼저 움직였나'로 해석한다: 정부·돈이 조용히 움직이면 진짜 신호, 대중만 불안하면 언론발 공포.
import type { BoardRow } from "./state.js";
import type { EventBrief } from "./brief.js";
import type { Pattern } from "./patterns.js";

export type DomainId = "gov" | "money" | "military" | "nkwords" | "public";
export type Level = 0 | 1 | 2 | 3;
export type Phase = 1 | 2 | 3 | 4 | 5;

export const LEVEL_LABEL: Record<Level, string> = { 0: "평소", 1: "주의", 2: "경계", 3: "심각" };
export const PHASE_LABEL: Record<Phase, string> = { 1: "평온", 2: "긴장", 3: "위기", 4: "임박", 5: "교전" };

export const DOMAINS: { id: DomainId; label: string; indicators: string[]; why: string }[] = [
  {
    id: "gov", label: "정부의 행동",
    indicators: ["official.us_travel_level_kr", "official.uk_advice_security_flag", "official.ca_level_kr", "official.de_warning_kr", "official.jp_risk_level_kr", "official.jp_embassy_alert"],
    why: "정부는 비공개 정보를 갖고 있다. 자국민 경보·철수는 전쟁 위험을 행동으로 인정한 것이라 가장 무겁게 본다.",
  },
  {
    id: "money", label: "돈의 움직임",
    indicators: ["market.usdkrw_change_pct", "market.kr_equity_rel_pct", "market.defense_rel_pct", "market.pm_war_prob"],
    why: "돈을 건 사람들은 대중보다 먼저 움직인다. 단 세계 증시·국내 정치로도 움직이므로 다른 영역과 함께 볼 때만 의미가 있다.",
  },
  {
    id: "military", label: "군사 동향",
    indicators: ["air.mil_airborne", "air.isr_airborne", "air.civil_airborne", "navwarn.launch_notice_active", "navwarn.korea_active", "seismic.nk_events_24h", "thermal.launch_site_hotspots", "gnss.bad_ratio_korea", "gnss.bad_ratio_westsea", "gnss.bad_ratio_north", "sea.gfw_cn_change_pct", "official.mnd_provocation_24h"],
    why: "실제 도발·전개·교란. 북한은 해마다 수십 번 쏘므로 도발 한 번은 '긴장'이지 '위기'가 아니다.",
  },
  {
    id: "nkwords", label: "북한의 말",
    indicators: ["rhetoric.nk_statements_24h", "rhetoric.nk_hostile_24h", "internet.kp_outage_alerts_24h"],
    why: "담화는 비용 없이 낼 수 있어 단독으로는 약한 신호다. 말이 구체적 시한·대상을 갖고 행동과 겹칠 때 무게가 실린다.",
  },
  {
    id: "public", label: "사람들의 불안",
    indicators: ["psych.naver_war_search", "psych.wiki_korea_attention", "media.war_talk_24h", "media.breaking_nk_1h", "social.alarm_posts_1h"],
    why: "대중의 불안은 보통 가장 늦게 움직이고 언론에 크게 흔들린다. 정부·돈이 조용한데 이것만 오르면 언론발 공포다.",
  },
];

/** 30일 확률 범위(%) — 단계별 판단값. 근거는 docs/INDICATORS.md */
export const BANDS: Record<Phase, { clash: [number, number]; war: [number, number] }> = {
  1: { clash: [1, 3], war: [0.05, 0.15] },
  2: { clash: [2, 4], war: [0.08, 0.2] },
  3: { clash: [8, 25], war: [0.3, 2] },
  4: { clash: [25, 60], war: [3, 20] },
  5: { clash: [100, 100], war: [10, 40] },
};

export interface DomainState {
  id: DomainId;
  label: string;
  level: Level;
  levelLabel: string;
  /** 이 영역을 움직인 것 (사람이 읽는 짧은 문장) */
  drivers: string[];
  measured: number;
  total: number;
  why: string;
}

export interface Band {
  low: number;
  high: number;
  point: number;
}

export interface WarRisk {
  at: number;
  phase: Phase;
  phaseLabel: string;
  /** 이 단계로 판정한 이유 */
  phaseReasons: string[];
  /** 앞으로 30일 국지 충돌(교전·영토 직접 공격) 확률 % */
  clash30d: Band;
  /** 앞으로 30일 전면전 확률 % */
  war30d: Band;
  /** 평온 단계 기준값 (평소) */
  usual: { clash: number; war: number };
  domains: DomainState[];
  /** 누가 먼저 움직였나 */
  firstMover: { kind: "warning" | "caveat" | "reassuring" | "neutral"; text: string };
  /** 다음 단계로 올릴 신호 — 무엇을 지켜보면 되는가 */
  tripwires: string[];
  /** 억제·완화 요인 (대화 가능성 등) */
  restraints: string[];
  market?: { pct: number; usualPct?: number; question: string; daysLeft?: number; url?: string };
  blindSpots: string[];
  headline: string;
}

const H = 3600_000;
const DAY = 24 * H;
const pts = (r?: BoardRow) => (!r?.reading || r.stateLabel === "측정 불가" ? 0 : r.reading.state === "anomalous" ? 2 : r.reading.state === "elevated" ? 1 : 0);
const measured = (r?: BoardRow) => !!r?.reading && r.stateLabel !== "측정 불가";
const val = (r?: BoardRow) => (measured(r) ? r!.reading!.value : undefined);

function fmtPct(x: number): string {
  if (x >= 99.5) return "진행 중";
  if (x < 0.1) return "0.1% 미만";
  if (x < 1) return `${x.toFixed(1)}%`;
  return `${Math.round(x)}%`;
}
export { fmtPct as fmtRiskPct };

function driverText(r: BoardRow): string {
  const v = r.reading!.value;
  const st = r.reading!.state === "anomalous" ? "이상" : "상승";
  if (r.id.startsWith("psych.") || r.id === "market.pm_war_prob") return `${r.label.replace(/\s*\((?:[^()]*평소 대비|지난 30일 대비)\)/, "")} 평소의 ${(v / 100).toFixed(v >= 1000 ? 0 : 1)}배 (${st})`;
  const unit = r.unit === "%" || r.unit === "%p" ? r.unit : r.unit ? ` ${r.unit}` : "";
  return `${r.label} ${Number.isInteger(v) ? v : v.toFixed(1)}${unit} (${r.reading!.state === "anomalous" ? "이상" : "상승"})`;
}

export interface WarRiskInput {
  now: number;
  board: BoardRow[];
  briefs: EventBrief[];
  patterns: Pattern[];
}

export function assessWarRisk({ now, board, briefs, patterns }: WarRiskInput): WarRisk {
  const by = Object.fromEntries(board.map((b) => [b.id, b])) as Record<string, BoardRow>;
  const recent = (ms: number) => briefs.filter((b) => now - b.at < ms && now - b.at >= -H);
  const prov7 = recent(7 * DAY).filter((b) => b.isProvocation || b.danger.level >= 3);
  const maxDanger7 = prov7.reduce((m, b) => Math.max(m, b.danger.level), 0);
  const serious14 = recent(14 * DAY).filter((b) => b.danger.level >= 5);
  const CLASH_RE = /교전|사상자|전사|사망|부상|대응\s?사격|맞대응|exchange of fire|casualt|killed/i;
  const clashNow = recent(2 * DAY).filter((b) => b.danger.level >= 5 && CLASH_RE.test(`${b.headline} ${b.latest?.title ?? ""}`));

  const domains: DomainState[] = DOMAINS.map((d) => {
    const rows = d.indicators.map((id) => by[id]).filter(Boolean);
    const hot = rows.filter((r) => pts(r) > 0);
    let score = hot.reduce((a, r) => a + pts(r), 0);
    const drivers = hot.map(driverText);
    let level: Level;
    if (d.id === "gov") {
      // 영국 문구 플래그는 거칠어서 '주의' 근거로만 쓴다. 나머지 정부 지표의 '이상'(철수·여행 자제급)은 곧바로 심각.
      const severe = hot.some((r) => r.id !== "official.uk_advice_security_flag" && pts(r) === 2);
      level = severe ? 3 : hot.length >= 2 ? 2 : hot.length === 1 ? 1 : 0;
    } else if (d.id === "military") {
      // 실제 도발은 지표보다 확실한 근거 — 위험도에 따라 가산
      const bonus = maxDanger7 >= 5 ? 4 : maxDanger7 === 4 ? 3 : maxDanger7 === 3 ? 2 : maxDanger7 >= 2 ? 1 : 0;
      if (bonus) {
        const top = prov7.reduce((m, b) => (b.danger.level > m.danger.level ? b : m));
        drivers.unshift(`최근 7일 도발: ${top.headline} (${top.danger.label})`);
      }
      const pat = patterns.filter((p) => p.confidence !== "low");
      for (const p of pat) drivers.push(`패턴: ${p.name}`);
      score += bonus + pat.reduce((a, p) => a + (p.confidence === "high" ? 2 : 1), 0);
      level = score >= 6 ? 3 : score >= 3 ? 2 : score >= 1 ? 1 : 0;
    } else if (d.id === "money") {
      // 2026년 코스피는 반도체 때문에 하루 5~10%씩 움직인 날이 잦았다(7/28 −10.8%). 방산주가 시장보다 오르지 않고 예측시장 전쟁 가격도
      // 조용한 '한국만 하락'은 업종·세계 증시 요인일 가능성이 커서 1점까지만 준다.
      const eq = by["market.kr_equity_rel_pct"];
      if (pts(eq) === 2 && (val(by["market.defense_rel_pct"]) ?? 0) < 1 && pts(by["market.pm_war_prob"]) === 0) {
        score -= 1;
        const i = drivers.findIndex((t) => t.startsWith(eq.label));
        if (i >= 0) drivers[i] += " — 방산주 동반 약세라 1점만";
      }
      level = score >= 5 ? 3 : score >= 3 ? 2 : score >= 1 ? 1 : 0;
    } else if (d.id === "nkwords") {
      level = score >= 4 ? 3 : score >= 2 ? 2 : score >= 1 ? 1 : 0;
    } else {
      level = score >= 5 ? 3 : score >= 2 ? 2 : score >= 1 ? 1 : 0;
    }
    return { id: d.id, label: d.label, level, levelLabel: LEVEL_LABEL[level], drivers: drivers.slice(0, 4), measured: rows.filter(measured).length, total: d.indicators.length, why: d.why };
  });
  const L = Object.fromEntries(domains.map((d) => [d.id, d.level])) as Record<DomainId, Level>;
  const elevated = domains.filter((d) => d.level >= 1).length;
  const high = domains.filter((d) => d.level >= 2).length;

  // ── 국면 판정 ──
  let phase: Phase = 1;
  const reasons: string[] = [];
  if (clashNow.length) {
    phase = 5;
    reasons.push(`교전·사상 보도: ${clashNow[0].headline}`);
  } else if (L.gov === 3 || (L.gov >= 2 && L.military >= 2)) {
    phase = 4;
    reasons.push(L.gov === 3 ? "정부가 철수·여행 자제급 조치를 냈다" : "여러 정부의 경보와 군사 움직임이 겹쳤다");
  } else if (serious14.length || L.gov >= 2 || (L.military >= 2 && (L.money >= 2 || L.gov >= 1)) || high >= 3) {
    phase = 3;
    if (serious14.length) reasons.push(`최근 14일 중대 사건: ${serious14[0].headline} (${serious14[0].danger.reason})`);
    if (L.gov >= 2) reasons.push("두 나라 이상 정부가 경보를 올렸다");
    if (L.military >= 2 && (L.money >= 2 || L.gov >= 1)) reasons.push("군사 움직임에 돈·정부가 반응했다");
    if (high >= 3) reasons.push(`세 영역 이상이 동시에 경계 이상 (${domains.filter((d) => d.level >= 2).map((d) => d.label).join(", ")})`);
  } else if (prov7.length || elevated >= 2 || high >= 1) {
    phase = 2;
    if (prov7.length) reasons.push(`최근 7일 도발 ${prov7.length}건 (가장 최근: ${[...prov7].sort((a, b) => b.at - a.at)[0].headline})`);
    if (elevated >= 2) reasons.push(`평소와 다른 영역 ${elevated}개 (${domains.filter((d) => d.level >= 1).map((d) => d.label).join(", ")})`);
    else if (high >= 1) reasons.push(`${domains.find((d) => d.level >= 2)!.label} 영역이 경계 수준`);
  } else {
    reasons.push("최근 7일 도발 없음, 모든 영역이 평소 범위");
  }

  // ── 확률: 단계 범위 안에서 영역 압력만큼 ──
  const sumLevels = domains.reduce((a, d) => a + d.level, 0);
  const pos = Math.min(1, 0.4 + sumLevels / 10);
  const band = (b: [number, number]): Band => ({ low: b[0], high: b[1], point: +(b[0] + (b[1] - b[0]) * pos).toFixed(2) });
  const clash30d = band(BANDS[phase].clash);
  const war30d = band(BANDS[phase].war);
  const usual = { clash: +(BANDS[1].clash[0] + (BANDS[1].clash[1] - BANDS[1].clash[0]) * 0.4).toFixed(2), war: +(BANDS[1].war[0] + (BANDS[1].war[1] - BANDS[1].war[0]) * 0.4).toFixed(2) };

  // ── 누가 먼저 움직였나 ──
  // 한국 증시만 빠졌어도 방산주가 함께 빠지고 환율·예측시장이 조용하면, 돈이 '전쟁'을 가격에 넣은 것이 아니다(업종·세계 증시 요인)
  const equityOnly = pts(by["market.kr_equity_rel_pct"]) > 0 && (val(by["market.defense_rel_pct"]) ?? 0) < 1 && pts(by["market.pm_war_prob"]) === 0 && pts(by["market.usdkrw_change_pct"]) === 0 && pts(by["market.defense_rel_pct"]) === 0;
  let firstMover: WarRisk["firstMover"];
  if (L.gov >= 1 && L.money >= 1) firstMover = { kind: "warning", text: "정부와 돈이 함께 움직였다 — 비공개 정보를 가진 쪽과 돈을 건 쪽이 동시에 반응한, 가장 무거운 조합이다." };
  else if (L.gov >= 1 && L.public === 0) firstMover = { kind: "warning", text: "정부가 먼저 움직였고 대중은 아직 조용하다 — 정보를 가진 쪽이 먼저 반응한 모양이라 가장 무게를 둘 신호다. 경보 사유가 치안·재난인지 먼저 확인한다." };
  else if (L.gov >= 1) firstMover = { kind: "caveat", text: "정부 경보가 올랐다 — 사유(안보·치안·재난)를 확인해야 한다." };
  else if (elevated === 0) firstMover = { kind: "reassuring", text: "정부·돈·군사·북한의 말·사람들 모두 평소대로다." };
  else if (L.money >= 1 && L.military === 0 && L.nkwords === 0 && L.public === 0 && !equityOnly)
    firstMover = { kind: "caveat", text: "돈만 움직였다 — 북한 쪽 신호가 없으니 세계 증시·환율·국내 정치 같은 다른 이유를 먼저 의심한다. 뉴스 없이 계속 빠지면 시장이 먼저 안 것일 수 있다." };
  else {
    // 정부는 조용한데 다른 영역이 움직였다 — 무엇이 움직였는지 이어서 말하고, 정보를 가진 쪽(정부)이 조용하다는 점으로 맺는다
    const parts: string[] = [];
    if (L.public >= 1) {
      const nv = by["psych.naver_war_search"];
      const wk = by["psych.wiki_korea_attention"];
      const detail = [
        pts(nv) > 0 ? `네이버 '${(nv.reading!.meta as any)?.worstGroup ?? "전쟁"}' 검색 평소의 ${Math.round(nv.reading!.value / 100)}배` : "",
        pts(wk) > 0 ? `위키백과 한반도 문서 평소의 ${(wk.reading!.value / 100).toFixed(1)}배` : "",
      ].filter(Boolean).join(", ");
      parts.push(`사람들의 불안이 ${L.public >= 2 ? "크게 " : ""}커졌다${detail ? `(${detail})` : ""}`);
    }
    if (L.money >= 1) {
      if (equityOnly) {
        const m = (by["market.kr_equity_rel_pct"].reading?.meta ?? {}) as any;
        parts.push(`한국 증시가 이웃 증시보다 더 빠졌지만${m.kospiPct !== undefined ? `(코스피 ${m.kospiPct}%, 일본·대만 ${m.peersPct}%)` : ""} 방산주도 같이 빠졌고 환율·예측시장 전쟁 가격은 그대로다 — 돈이 전쟁 위험을 가격에 넣는 모습은 아니다(세계 증시·업종 요인 쪽)`);
      } else if (pts(by["market.pm_war_prob"]) > 0) {
        const m = (by["market.pm_war_prob"].reading!.meta ?? {}) as any;
        parts.push(`예측시장 전쟁 가격이 한 달 평소의 ${(by["market.pm_war_prob"].reading!.value / 100).toFixed(1)}배로 올랐다${m.usualPct !== undefined ? `(${m.usualPct}% → 최근 ${m.recentPct ?? m.pricePct}%)` : ""}`);
      } else parts.push("돈도 움직였다");
    }
    if (L.military >= 1) parts.push("군사 움직임(도발)이 있었다");
    if (L.nkwords >= 1) parts.push("북한의 말이 거칠어졌다");
    const calm = L.money === 0 || equityOnly ? "하지만 정부와 돈은 평소대로다" : "하지만 비공개 정보를 가진 정부들은 평소대로다";
    let close: string;
    if (L.public >= 1 && (L.money === 0 || equityOnly) && L.military === 0) close = "언론·소문발 불안일 가능성이 크다. 무엇이 불을 붙였는지 확인한다.";
    else if (L.public >= 1) close = "대중과 일반 투자자가 같은 사건·담화에 반응한 모양이라, 정보를 가진 쪽이 먼저 움직인 신호는 아니다. 무엇이 불을 붙였는지(담화·소문·사건) 확인하고, 정부 경보가 따라붙는지 지켜본다.";
    else if (L.military >= 1) close = "무력시위·훈련 성격으로 보인다. 정부 경보나 시장 반응이 따라붙는지 지켜본다.";
    else if (L.nkwords >= 1) close = "말에 행동이 따르는지 지켜본다 — 명분 쌓기이거나 내부 결속용일 수 있다.";
    else close = "정부 경보나 시장의 전쟁 가격이 따라붙는지가 다음 관건이다.";
    firstMover = {
      kind: L.public >= 2 || (L.money >= 1 && !equityOnly) ? "caveat" : L.public === 1 && L.military === 0 ? "reassuring" : "neutral",
      text: `${parts.join(". ")}. ${calm} — ${close}`,
    };
  }

  // ── 다음 단계로 올릴 신호 ──
  const tripwires: string[] = [];
  if (phase <= 2) {
    tripwires.push("두 나라 이상 정부가 한국 여행경보를 올리면 → 위기");
    tripwires.push("한국 영토·NLL 인근 포격, 핵실험, 민방위 경보 → 위기");
    tripwires.push("도발과 함께 한국 증시만 급락하거나 예측시장 전쟁 가격이 급등하면 → 위기");
  }
  if (phase <= 3) tripwires.push("미국 3단계 이상, 일본 출국 권고, 캐나다 여행 자제 → 임박");
  if (phase === 4) tripwires.push("교전·사상자 보도 → 교전");
  if (phase >= 3) tripwires.push("내려가는 신호: 정부 경보 해제, 남북·북미 대화 재개, 시장 회복");

  // ── 억제 요인·시장 ──
  const restraints: string[] = [];
  const pm = by["market.pm_war_prob"];
  let market: WarRisk["market"];
  if (measured(pm)) {
    const m = (pm.reading!.meta ?? {}) as any;
    market = { pct: m.pricePct ?? pm.reading!.value, usualPct: m.usualPct, question: m.question ?? "", daysLeft: m.daysLeft, url: m.url };
    for (const d of (m.diplomacy ?? []) as { question: string; pct: number }[]) restraints.push(`예측시장이 보는 대화 가능성: ${d.question.replace(/\?$/, "")} ${d.pct}%`);
  }
  if (!restraints.length) restraints.push("대화·외교 일정 정보 없음 (예측시장 미수집)");

  // ── 사각지대 ──
  const blindSpots = domains.filter((d) => d.measured < d.total).map((d) => {
    const miss = DOMAINS.find((x) => x.id === d.id)!.indicators.filter((id) => !measured(by[id])).map((id) => by[id]?.label ?? id);
    return `${d.label}: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? ` 외 ${miss.length - 3}개` : ""} 측정 불가`;
  });

  const tone = phase === 1 ? "평소 수준" : phase === 2 ? "평소보다 약간 높음" : phase === 3 ? "높음" : phase === 4 ? "매우 높음" : "교전 중";
  const headline = `전쟁 위험 ${phase}단계(${PHASE_LABEL[phase]}) — 앞으로 30일 국지 충돌 약 ${fmtPct(clash30d.point)}, 전면전 ${fmtPct(war30d.point)} (${tone})`;

  return { at: now, phase, phaseLabel: PHASE_LABEL[phase], phaseReasons: reasons, clash30d, war30d, usual, domains, firstMover, tripwires, restraints, market, blindSpots, headline };
}
