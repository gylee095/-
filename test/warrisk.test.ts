import { describe, expect, it } from "vitest";
import { assessWarRisk, BANDS } from "../src/core/warrisk.js";
import { INDICATORS, GROUP_LABEL, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { IndicatorState } from "../src/core/types.js";
import type { EventBrief } from "../src/core/brief.js";

const NOW = Date.UTC(2026, 9, 31, 6, 0);
const H = 3600_000;

/** 모든 징후를 '정상'으로 채운 판 — over 로 일부만 바꾼다 */
function board(over: Record<string, { value: number; state: IndicatorState; meta?: Record<string, unknown> }> = {}): BoardRow[] {
  return INDICATORS.map((d) => {
    const o = over[d.id];
    const reading = { indicator: d.id, at: NOW, n: 20, value: o?.value ?? 0, state: o?.state ?? ("normal" as IndicatorState), meta: o?.meta };
    return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[reading.state], history: [] };
  });
}
const brief = (hoursAgo: number, level: 1 | 2 | 3 | 4 | 5, headline: string, reason = ""): EventBrief => ({
  headline, isProvocation: true, danger: { level, label: ["", "관심", "주의", "경계", "심각", "위급"][level], reason }, at: NOW - hoursAgo * H,
});
const run = (b: BoardRow[], briefs: EventBrief[] = []) => assessWarRisk({ now: NOW, board: b, briefs, patterns: [] });

describe("전쟁 위험 모델", () => {
  it("조용한 날: 1단계(평온), 평소 확률, '모두 평소대로'", () => {
    const w = run(board());
    expect(w.phase).toBe(1);
    expect(w.clash30d.point).toBeCloseTo(1.8, 1);
    expect(w.war30d.point).toBeLessThan(0.1);
    expect(w.firstMover.kind).toBe("reassuring");
    expect(w.headline).toMatch(/1단계\(평온\).*평소 수준/);
    expect(w.domains.every((d) => d.level === 0)).toBe(true);
  });

  it("미사일 이틀 뒤: 2단계(긴장)일 뿐 위기가 아니다 — 정부·돈이 조용하면 무력시위로 읽는다", () => {
    const w = run(board(), [brief(48, 3, "북한, 탄도미사일 10여 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(2);
    expect(w.domains.find((d) => d.id === "military")!.level).toBeGreaterThanOrEqual(1);
    expect(w.firstMover.kind).toBe("neutral");
    expect(w.firstMover.text).toMatch(/정부와 돈은 평소대로/);
    expect(w.clash30d.point).toBeLessThanOrEqual(BANDS[2].clash[1]);
  });

  it("북한의 말만 거칠어도(단일 영역 '심각') 위기로 올리지 않는다", () => {
    const w = run(board({ "rhetoric.nk_statements_24h": { value: 12, state: "anomalous" }, "rhetoric.nk_hostile_24h": { value: 8, state: "anomalous" } }));
    expect(w.domains.find((d) => d.id === "nkwords")!.level).toBe(3);
    expect(w.phase).toBe(2);
  });

  it("두 나라 정부가 경보를 올리면 3단계(위기) — 대중이 조용하면 '정부가 먼저'", () => {
    const w = run(board({ "official.us_travel_level_kr": { value: 2, state: "elevated" }, "official.ca_level_kr": { value: 1, state: "elevated" } }));
    expect(w.domains.find((d) => d.id === "gov")!.level).toBe(2);
    expect(w.phase).toBe(3);
    expect(w.firstMover.kind).toBe("warning");
    expect(w.firstMover.text).toMatch(/정부가 먼저/);
  });

  it("일본 공관 출국 권고(이상) → 4단계(임박)", () => {
    const w = run(board({ "official.jp_embassy_alert": { value: 2, state: "anomalous", meta: { titles: ["朝鮮半島情勢を踏まえた早期の出国の検討について"] } } }));
    expect(w.domains.find((d) => d.id === "gov")!.level).toBe(3);
    expect(w.phase).toBe(4);
    expect(w.war30d.point).toBeGreaterThanOrEqual(BANDS[4].war[0]);
  });

  it("대중만 불안(검색·조회수 급증) → 언론발 불안으로 읽는다", () => {
    const w = run(board({ "psych.naver_war_search": { value: 320, state: "elevated" }, "psych.wiki_korea_attention": { value: 180, state: "elevated" } }));
    expect(w.domains.find((d) => d.id === "public")!.level).toBe(2);
    expect(w.phase).toBe(2);
    expect(w.firstMover.kind).toBe("caveat");
    expect(w.firstMover.text).toMatch(/하지만 정부와 돈은 평소대로다 — 언론·소문발 불안/);
  });

  it("돈만 움직이면 다른 이유(세계 증시·국내 정치)를 먼저 의심한다", () => {
    const w = run(board({ "market.kr_equity_rel_pct": { value: -4.5, state: "anomalous" }, "market.usdkrw_change_pct": { value: 2, state: "elevated" } }));
    // 방산주가 오르지 않고 예측시장도 조용 → 증시 하락은 1점만, 환율 1점 → 주의
    expect(w.domains.find((d) => d.id === "money")!.level).toBe(1);
    expect(w.phase).toBe(1);
    expect(w.firstMover.kind).toBe("caveat");
    expect(w.firstMover.text).toMatch(/돈만 움직였다/);
  });

  it("실측 10/30: 코스피만 더 빠졌어도 방산주가 같이 빠지면 '전쟁 가격 아님'으로 읽는다", () => {
    const w = run(board({
      "market.kr_equity_rel_pct": { value: -2.23, state: "elevated", meta: { kospiPct: -4.69, peersPct: -2.46 } },
      "market.defense_rel_pct": { value: -0.07, state: "normal" },
    }), [brief(40, 3, "북한, 탄도미사일 약 10 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(2);
    expect(w.firstMover.text).toMatch(/방산주도 같이 빠졌고.*전쟁 위험을 가격에 넣는 모습은 아니다/);
    expect(w.firstMover.text).toMatch(/코스피 -4.69%, 일본·대만 -2.46%/);
  });

  it("반도체 급락장: 한국만 −5%p 빠져도 방산주가 안 오르면 '돈' 영역은 주의까지만 — ICBM 이 겹쳐도 위기로 올리지 않는다", () => {
    const w = run(board({
      "market.kr_equity_rel_pct": { value: -5, state: "anomalous", meta: { kospiPct: -8, peersPct: -3 } },
      "market.defense_rel_pct": { value: -1, state: "normal" },
    }), [brief(5, 4, "북한, ICBM 발사 → 동해", "장거리·일본 상공/EEZ 관련 발사")]);
    expect(w.domains.find((d) => d.id === "money")!.level).toBe(1);
    expect(w.domains.find((d) => d.id === "money")!.drivers[0]).toMatch(/방산주 동반 약세라 1점만/);
    expect(w.phase).toBe(2);
  });

  it("실측 10/31 전체: 사람들의 불안 급증 + 예측시장 상승 + 미사일, 정부는 조용 → 2단계, '대중과 일반 투자자가 반응' 으로 읽는다", () => {
    const w = run(board({
      "psych.naver_war_search": { value: 8862, state: "anomalous", meta: { worstGroup: "생존 준비" } },
      "market.pm_war_prob": { value: 154, state: "elevated", meta: { pricePct: 4.35, recentPct: 4.35, usualPct: 2.83 } },
      "market.kr_equity_rel_pct": { value: -2.23, state: "elevated", meta: { kospiPct: -4.69, peersPct: -2.46 } },
      "market.defense_rel_pct": { value: -0.07, state: "normal" },
    }), [brief(40, 3, "북한, 탄도미사일 약 10 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(2);
    expect(w.firstMover.kind).toBe("caveat");
    expect(w.firstMover.text).toMatch(/사람들의 불안이 크게 커졌다\(네이버 '생존 준비' 검색 평소의 89배\)/);
    expect(w.firstMover.text).toMatch(/예측시장 전쟁 가격이 한 달 평소의 1.5배로 올랐다\(2.83% → 최근 4.35%\)/);
    expect(w.firstMover.text).toMatch(/비공개 정보를 가진 정부들은 평소대로다 — 대중과 일반 투자자가 같은 사건·담화에 반응/);
    expect(w.domains.find((d) => d.id === "public")!.drivers[0]).toMatch(/평소의 89배 \(이상\)/);
  });

  it("실측 10/31 고친 뒤: 돈은 조용 → '도발·담화에 대중이 반응' 으로 맺는다", () => {
    const w = run(board({ "psych.naver_war_search": { value: 8862, state: "anomalous", meta: { worstGroup: "생존 준비" } } }), [brief(40, 3, "북한, 탄도미사일 약 10 발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.firstMover.text).toMatch(/하지만 정부와 돈은 평소대로다 — 도발·담화에 대중이 반응한 모양/);
    expect(w.firstMover.text).not.toMatch(/일반 투자자/);
  });

  it("ICBM + 시장 반응 → 3단계(위기)", () => {
    const w = run(board({ "market.kr_equity_rel_pct": { value: -4.5, state: "anomalous" }, "market.pm_war_prob": { value: 320, state: "anomalous", meta: { pricePct: 9, usualPct: 2.8, question: "2027년 전 북한의 한국 침공", daysLeft: 61, diplomacy: [{ question: "Will Trump meet with Kim Jong Un in 2026?", pct: 15 }] } } }), [brief(5, 4, "북한, ICBM 발사 → 동해", "장거리·일본 상공/EEZ 관련 발사")]);
    expect(w.phase).toBe(3);
    expect(w.phaseReasons.join(" ")).toMatch(/돈·정부가 반응/);
    expect(w.market?.pct).toBe(9);
    expect(w.market?.usualPct).toBe(2.8);
    expect(w.restraints[0]).toMatch(/대화 가능성: Will Trump meet with Kim Jong Un in 2026 15%/);
  });

  it("영토 포격 + 교전 보도 → 5단계(교전)", () => {
    const w = run(board(), [brief(3, 5, "연평도 포격 — 우리 군 대응 사격, 교전", "우리 영토 인근 포격")]);
    expect(w.phase).toBe(5);
    expect(w.headline).toMatch(/진행 중/);
  });

  it("측정 못 하는 영역은 사각지대로 말한다", () => {
    const b = board().map((r) => (r.id === "psych.naver_war_search" ? { ...r, reading: undefined, stateLabel: STATE_LABEL.unavailable } : r));
    const w = run(b);
    expect(w.blindSpots.join(" ")).toMatch(/사람들의 불안: .*네이버/);
  });
});

describe("전쟁 위험 모델: 엘리트·큰손", () => {
  it("외국인 대량 순매도만 → 엘리트 '주의'까지(백테스트: 미리 판 적 없음), 단계는 그대로", () => {
    const w = run(board({ "elite.foreign_net_kospi": { value: -3.4, state: "anomalous", meta: { net5dEok: -82000 } } }));
    const elite = w.domains.find((d) => d.id === "elite")!;
    expect(elite.level).toBe(1);
    expect(elite.drivers[0]).toMatch(/북한 사건의 예고가 못 돼 1점만/);
    expect(w.phase).toBe(1);
    expect(w.firstMover.kind).toBe("caveat");
    expect(w.firstMover.text).toMatch(/엘리트·큰손이 움직였다\(외국인 5일 순매도 8.2조 원/);
    expect(w.firstMover.text).toMatch(/북한 사건을 미리 알려 주지 못했다/);
    expect(w.firstMover.text).not.toMatch(/정보를 가진 쪽이 먼저 움직였을 수 있다/);
  });
  it("외국인 대량 순매도 + 북한 미사일 → 2단계(긴장)까지. 매도 하나로 위기가 되지 않는다", () => {
    const w = run(board({ "elite.foreign_net_kospi": { value: -3.2, state: "anomalous", meta: { net5dEok: -39779 } } }), [brief(30, 3, "북한, 단거리 탄도미사일 2발 발사 → 동해", "탄도미사일 발사")]);
    expect(w.domains.find((d) => d.id === "elite")!.level).toBe(1);
    expect(w.phase).toBe(2);
    expect(w.firstMover.kind).not.toBe("warning");
  });
  it("기업 제트기 출국 급증 하나만으로도 '주의'까지", () => {
    const w = run(board({ "elite.kr_bizjets": { value: 420, state: "anomalous", meta: { departures: 13, usual: 3 } } }), [brief(20, 3, "북한, 탄도미사일 발사 → 동해", "탄도미사일 발사")]);
    const elite = w.domains.find((d) => d.id === "elite")!;
    expect(elite.level).toBe(1);
    expect(elite.drivers.join(" ")).toMatch(/혼자서는 '주의'까지/);
    expect(w.phase).toBe(2);
  });
  it("외국인 대량 순매도 + 기업 제트기 출국 급증 + 북한 도발 → 3단계(위기), 위험 쪽", () => {
    const w = run(board({
      "elite.foreign_net_kospi": { value: -3.4, state: "anomalous", meta: { net5dEok: -82000 } },
      "elite.kr_bizjets": { value: 420, state: "anomalous", meta: { departures: 13, usual: 3 } },
    }), [brief(20, 3, "북한, 탄도미사일 발사 → 동해", "탄도미사일 발사")]);
    expect(w.phase).toBe(3);
    expect(w.phaseReasons.join(" ")).toMatch(/엘리트·큰손이 크게 움직이는데 북한 쪽 움직임이 겹쳤다/);
    expect(w.firstMover.kind).toBe("warning");
    expect(w.firstMover.text).toMatch(/한국 기업 제트기 출국 평소의 4.2배/);
  });
});
