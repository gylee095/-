import { describe, expect, it } from "vitest";
import { interpret, meaningOf } from "../src/core/interpret.js";
import { INDICATORS, GROUP_LABEL, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { Reading } from "../src/core/types.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 9, 30, 6, 0); // 15:00 KST, 10월(훈련철·휴어기 아님)

function row(id: string, reading?: Partial<Reading> & { value: number }, history: { hour: number; avg: number }[] = []): BoardRow {
  const d = INDICATORS.find((x) => x.id === id)!;
  const r: Reading | undefined = reading ? { indicator: id, at: NOW, n: 20, state: "normal", ...reading } : undefined;
  return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading: r, stateLabel: r ? STATE_LABEL[r.state] : STATE_LABEL.unavailable, history };
}
const quietBoard = (): BoardRow[] => [
  row("air.civil_airborne", { value: 22, baseline: 23, z: -0.2 }),
  row("air.mil_airborne", { value: 1, baseline: 1.5, z: -0.3 }),
  row("air.isr_airborne", { value: 0, meta: { aircraft: [] } }),
  row("navwarn.launch_notice_active", { value: 0 }),
  row("navwarn.korea_active", { value: 1, baseline: 1, z: 0 }),
  row("rhetoric.nk_statements_24h", { value: 2, baseline: 2.5, z: -0.3 }),
  row("rhetoric.nk_hostile_24h", { value: 0, baseline: 0.5, z: -0.5 }),
  row("media.breaking_nk_1h", { value: 0 }),
  row("official.us_travel_level_kr", { value: 1 }),
  row("official.uk_advice_security_flag", { value: 0 }),
  row("seismic.nk_events_24h", { value: 0 }),
  row("market.usdkrw_change_pct", { value: 0.3, meta: { signedPct: -0.3, price: 1334 } }),
  row("internet.kp_outage_alerts_24h", { value: 0 }),
  row("sea.gfw_cn_change_pct"),
  row("thermal.launch_site_hotspots"),
];
const threat = { level: 1, label: "평시", summary: "없음", lastProvocation: null };
const prov = (hoursAgo: number, headline = "북한, 탄도미사일 약 10 발 발사 → 동해"): EventBrief => ({ headline, isProvocation: true, danger: { level: 3, label: "경계", reason: "탄도미사일 발사" }, at: NOW - hoursAgo * 3600_000 });

describe("해석 엔진", () => {
  it("조용한 날: 안심 힌트(대형 발사 선행 징후 없음)와 사각지대를 말한다", () => {
    const it_ = interpret({ now: NOW, threat, board: quietBoard(), patterns: [], briefs: [] });
    expect(it_.headline).toBe("평소와 다른 징후 없음");
    expect(it_.hints.some((h) => h.kind === "reassuring" && h.title.includes("임박 징후는 없음"))).toBe(true);
    expect(it_.hints.find((h) => h.kind === "gap")!.reasoning).toMatch(/서해 중국 어선.*위성 열점/);
    expect(it_.narrative.join(" ")).toMatch(/평소와 다른 것이 없다/);
    expect(it_.perIndicator["navwarn.launch_notice_active"]).toMatch(/단거리 미사일은 예고 없이/);
    expect(it_.abnormalCount).toBe(0);
  });
  it("민항기만 급감 + 뉴스 조용 → '기상·수신기' 쪽 주의 힌트 (위험 아님)", () => {
    const b = quietBoard().map((r) => (r.id === "air.civil_airborne" ? row("air.civil_airborne", { value: 7, baseline: 23, z: -4, state: "anomalous", meta: { total: 9 } }, [{ hour: 1, avg: 8 }, { hour: 0, avg: 22 }]) : r));
    const it_ = interpret({ now: NOW, threat, board: b, patterns: [], briefs: [] });
    const h = it_.hints.find((x) => x.title.includes("민항기"))!;
    expect(h.kind).toBe("caveat");
    expect(h.reasoning).toMatch(/기상|수신기/);
    expect(h.reasoning).toMatch(/전체 수신 대수도 함께 줄어/);
    expect(it_.perIndicator["air.civil_airborne"]).toMatch(/평소의 30%/);
    expect(it_.perIndicator["air.civil_airborne"]).toMatch(/1시간째/);
  });
  it("민항기 급감 + 속보 몰림 + 군용기 증가 → 위험 쪽 힌트", () => {
    const b = quietBoard().map((r) =>
      r.id === "air.civil_airborne" ? row("air.civil_airborne", { value: 7, baseline: 23, z: -4, state: "anomalous" }) :
      r.id === "media.breaking_nk_1h" ? row("media.breaking_nk_1h", { value: 5, state: "anomalous" }) :
      r.id === "air.mil_airborne" ? row("air.mil_airborne", { value: 9, baseline: 1.5, z: 4, state: "anomalous" }) : r);
    const it_ = interpret({ now: NOW, threat, board: b, patterns: [], briefs: [] });
    const h = it_.hints.find((x) => x.title.includes("민항기"))!;
    expect(h.kind).toBe("warning");
    expect(h.reasoning).toMatch(/공역 통제/);
    expect(it_.headline).toMatch(/주목할 힌트/);
  });
  it("발사 예고 + 정찰기 → 준비 경고, 10월엔 훈련철 감점 없음", () => {
    const b = quietBoard().map((r) =>
      r.id === "navwarn.launch_notice_active" ? row("navwarn.launch_notice_active", { value: 1, state: "anomalous" }) :
      r.id === "air.isr_airborne" ? row("air.isr_airborne", { value: 3, state: "elevated", meta: { aircraft: [{ type: "R135", what: "RC-135 정찰기(코브라볼/리벳조인트 계열)", lat: 39, lon: 130.5 }] } }) : r);
    const it_ = interpret({ now: NOW, threat, board: b, patterns: [], briefs: [] });
    expect(it_.hints.some((h) => h.kind === "reassuring")).toBe(false);
    const w = it_.hints.find((h) => h.title.includes("발사 예고 구역"))!;
    expect(w.reasoning).toMatch(/정찰·급유기 3대/);
    expect(it_.perIndicator["air.isr_airborne"]).toMatch(/동해 상공/);
  });
  it("72시간 내 도발 2건 → 연쇄 국면 힌트, 48시간 내 1건 → 주시 구간", () => {
    const two = interpret({ now: NOW, threat: { ...threat, lastProvocation: { headline: "x", at: NOW - 3600_000 } }, board: quietBoard(), patterns: [], briefs: [prov(5), prov(30, "북한, 600㎜ 초대형 방사포 여러 발 발사")] });
    expect(two.hints.find((h) => h.title.includes("연쇄"))).toBeTruthy();
    const one = interpret({ now: NOW, threat, board: quietBoard(), patterns: [], briefs: [prov(20)] });
    expect(one.hints.find((h) => h.title.includes("주시 구간"))!.reasoning).toMatch(/조용하다/);
    expect(one.headline).toMatch(/도발 후 .*경과/);
  });
  it("미 여행경보 2단계 → 서방 경보 힌트", () => {
    const b = quietBoard().map((r) => (r.id === "official.us_travel_level_kr" ? row("official.us_travel_level_kr", { value: 2, state: "elevated" }) : r));
    const it_ = interpret({ now: NOW, threat, board: b, patterns: [], briefs: [] });
    expect(it_.hints.find((h) => h.title.includes("서방 정부"))!.reasoning).toMatch(/피자 지수/);
  });
  it("측정 불가·학습 중 뜻풀이", () => {
    expect(meaningOf(row("sea.gfw_cn_change_pct"), { night: false, exercise: false, moratorium: false })).toMatch(/Global Fishing Watch 토큰/);
    expect(meaningOf(row("thermal.launch_site_hotspots"), { night: false, exercise: false, moratorium: false })).toMatch(/키가 없어/);
    expect(meaningOf(row("air.civil_airborne", { value: 20, baseline: 21, n: 3, state: "learning" }), { night: true, exercise: false, moratorium: false })).toMatch(/학습 중 3\/10/);
  });
  it("서해 중국 선박: 중국만 감소 → 위험 쪽 힌트, 한국도 같이 감소 → 기상 귀항 해석", () => {
    const series = (cnDrop: boolean, krDrop: boolean) => Array.from({ length: 21 }, (_, i) => ({ date: `2026-10-${String(5 + i).padStart(2, "0")}`, CHN: i >= 18 && cnDrop ? 1000 : 2400, KOR: i >= 18 && krDrop ? 250 : 600, other: 80 }));
    const mk = (krDrop: boolean) => quietBoard().map((r) => (r.id === "sea.gfw_cn_change_pct" ? row("sea.gfw_cn_change_pct", { value: -58, state: "anomalous", meta: { recentDates: ["2026-10-23", "2026-10-24", "2026-10-25"], delayDays: 6, recentCnHoursPerDay: 1000, priorCnHoursPerDay: 2400, series: series(true, krDrop) } }) : r));
    const china = interpret({ now: NOW, threat, board: mk(false), patterns: [], briefs: [] }).hints.find((h) => h.title.includes("중국 선박"))!;
    expect(china.kind).toBe("warning");
    expect(china.reasoning).toMatch(/한국 선박은 그대로인데 중국 선박만/);
    const storm = interpret({ now: NOW, threat, board: mk(true), patterns: [], briefs: [] }).hints.find((h) => h.title.includes("중국 선박"))!;
    expect(storm.kind).toBe("caveat");
    expect(storm.reasoning).toMatch(/태풍·풍랑 귀항/);
    expect(meaningOf(mk(false).find((r) => r.id === "sea.gfw_cn_change_pct")!, { night: false, exercise: false, moratorium: false })).toMatch(/중국 배만 58% 빠짐.*약 6일 지연/);
  });
  it("서해: 모든 배가 함께 줄면 뜻풀이가 기상·처리 지연 쪽으로 읽는다", () => {
    const r = row("sea.gfw_cn_change_pct", { value: -2, meta: { cnChangePct: -50, otherChangePct: -49, recentDates: ["2026-10-25", "2026-10-26", "2026-10-27"], delayDays: 4 } });
    const t = meaningOf(r, { night: false, exercise: false, moratorium: false });
    expect(t).toMatch(/중국 선박 -50%, 다른 배 -49%/);
    expect(t).toMatch(/모든 배가 함께 줄어.*철수 징후 아님/);
  });
});

describe("요약 문장의 값 표기", () => {
  it("'평소 대비' 배율·변화율 징후는 카드와 같은 모양 (예전: '5187.00%(평소의 59%)')", () => {
    const naver = row("psych.naver_war_search", { value: 5187, baseline: 8862, state: "anomalous" });
    naver.absolute = INDICATORS.find((d) => d.id === "psych.naver_war_search")!.absolute;
    const fuel = row("nk.fuel_price_change_pct", { value: 88.4, state: "anomalous" });
    fuel.absolute = INDICATORS.find((d) => d.id === "nk.fuel_price_change_pct")!.absolute;
    const it_ = interpret({ now: NOW, threat, board: [...quietBoard(), naver, fuel], patterns: [], briefs: [] });
    const text = it_.narrative.join(" ");
    expect(text).toMatch(/한국 사람들의 전쟁 불안 평소의 52배/);
    expect(text).toMatch(/북한 장마당 휘발유값 \+88%/);
    expect(text).not.toMatch(/5187|평소의 59%|88\.40%/);
  });
});

