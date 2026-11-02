// 발사 기사 제목 읽기 — 새 발사 / 북한 매체 발표 / 지난 발사 이야기 (2026-11-02)
// 사례: 합참이 공지하지 않은 10/31 전술탄도미사일. 11/1 아침 북한 매체가 밝혔고(연합뉴스 '北, 전술탄도미사일 집속탄두 위력시험'),
// 11/2 합참 "北발사체 모두 공지하진 않아…" 기사가 새 '미상 발사체 발사'로 잘못 잡혔다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { briefEvent, currentThreat, mergeFollowUps } from "../src/core/brief.js";
import { launchTitleKind, selfReportDay, type LaunchTitleKind } from "../src/core/classify.js";
import { parseGdelt } from "../src/core/collectors/news.js";
import { buildEvent, correlate } from "../src/core/correlate.js";
import { decideAlerts } from "../src/core/policy.js";
import type { CrisisEvent, Signal } from "../src/core/types.js";

const json = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));
const TITLES: { cases: { src: string; kind: LaunchTitleKind; title: string }[] } = json("launch_titles_20261102.json");
const REAL: Record<string, Signal[]> = json("launch_reports_20261102.json");
const H = 3600_000;
const kday = (ms: number) => new Date(ms + 9 * H).toISOString().slice(0, 10);
const kst = (ms: number) => new Date(ms + 9 * H).toISOString().slice(0, 16).replace("T", " ");

/** 저장된 사건처럼: 신호 묶음 → 사건 → 요약 */
const briefed = (sigs: Signal[]) => {
  const events = correlate(sigs);
  return events.map((e) => ({ ...e, signals: sigs.filter((s) => e.signalIds.includes(s.id)), brief: briefEvent(e, sigs.filter((s) => e.signalIds.includes(s.id))) }));
};

describe("제목 한 줄의 성격", () => {
  for (const c of TITLES.cases) {
    it(`${c.kind} (${c.src}) — ${c.title}`, () => expect(launchTitleKind(c.title)).toBe(c.kind));
  }
});

describe("북한 매체가 말하는 시험 날짜", () => {
  it("아침 보도는 전날 일 (조선중앙통신 06시 보도)", () => {
    expect(kday(selfReportDay("北, 전술탄도미사일 집속탄두 위력시험", Date.UTC(2026, 9, 31, 21, 34)))).toBe("2026-10-31");
  });
  it("'on Sunday' 는 그 요일", () => {
    expect(kday(selfReportDay("North Korea tested ‘new’ hypersonic missile on Sunday: State media", Date.UTC(2026, 8, 21, 22, 43)))).toBe("2026-09-20");
  });
  it("'어제'·'오늘'·'지난달 31일'·저녁 보도", () => {
    const pub = Date.UTC(2026, 10, 2, 2, 0); // 11/2 11:00 KST
    expect(kday(selfReportDay('北 "어제 전략순항미사일 발사훈련"', pub))).toBe("2026-11-01");
    expect(kday(selfReportDay('北 "오늘 새벽 순항미사일 발사훈련"', pub))).toBe("2026-11-02");
    expect(kday(selfReportDay("北, 지난달 31일 위력시험 공개", pub))).toBe("2026-10-31");
    expect(kday(selfReportDay("北, 지난 1일 순항미사일 시험사격", pub))).toBe("2026-11-01");
    expect(kday(selfReportDay("北, 순항미사일 시험사격", Date.UTC(2026, 10, 2, 10, 0)))).toBe("2026-11-02");
  });
});

describe("실제 사례: 합참이 공지하지 않은 10/31 발사", () => {
  it("11/2 '왜 공지하지 않았나' 기사는 새 발사가 아니다 (저장된 옛 신호 그대로여도)", () => {
    const [e] = briefed(REAL.retrospective_20261102);
    expect(e.basis).toBe("official_quote"); // 옛 신호는 '공식발표 인용'으로 저장돼 있다
    expect(e.brief.isProvocation).toBe(false);
    expect(e.brief.danger.level).toBe(1);
    expect(e.brief.headline).toContain("공지하진 않아");
    expect(currentThreat([e.brief], Date.UTC(2026, 10, 2, 3, 0)).label).toBe("평시");
  });

  it("같은 기사를 지금 수집하면 공식발표 인용이 아니고, [속보]가 붙어도 푸시하지 않는다", () => {
    const t = Date.UTC(2026, 10, 2, 2, 29);
    for (const title of ['합참 "北발사체 모두 공지하진 않아…보안 등 고려 군사적 판단"', '[속보] 합참 "北발사체 모두 공지하진 않아"']) {
      const [s] = parseGdelt([{ url: "https://www.yna.co.kr/view/AKR20261102000000001", title, seendate: "20261102T022900Z", domain: "yna.co.kr" }], t);
      expect(s.citesOfficial).toBe(false);
      expect(s.severity).toBeLessThanOrEqual(20);
      expect(s.summary).toContain("후속·해설");
      const ev = correlate([s]);
      expect(decideAlerts(ev, [], t + 60_000).send).toHaveLength(0);
    }
  });

  it("진짜 속보는 그대로 공식발표 인용·푸시 대상이다", () => {
    const t = Date.UTC(2026, 10, 2, 2, 29);
    const [s] = parseGdelt([{ url: "https://www.yna.co.kr/view/AKR20261102000000002", title: '[속보] 합참 "北, 동해상으로 미상 탄도미사일 발사"', seendate: "20261102T022900Z", domain: "yna.co.kr" }], t);
    expect(s.citesOfficial).toBe(true);
    expect(decideAlerts(correlate([s]), [], t + 60_000).send).toHaveLength(1);
  });

  it("11/1 북한 매체 보도는 10/31(날짜만)의 탄도미사일 발사로 센다", () => {
    const [e] = briefed(REAL.kcna_20261101);
    const b = e.brief;
    expect(b.isProvocation).toBe(true);
    expect(b.danger.level).toBe(3);
    expect(b.danger.reason).toContain("북한 매체 발표");
    expect(b.headline).toBe("북한, 탄도미사일 발사 (북한 매체 발표)");
    expect(kday(b.selfReport!.day)).toBe("2026-10-31");
    expect(kst(b.at)).toBe("2026-10-31 12:00");
    expect(kst(b.selfReport!.reportedAt)).toBe("2026-11-01 06:34");
    expect(b.note).toContain("우리 군·일본 발표 없이");
  });

  it("두 기사를 함께 보면: 지금은 평시, 마지막 도발은 10/31 북한 매체 발표 발사", () => {
    const events = [...briefed(REAL.retrospective_20261102), ...briefed(REAL.kcna_20261101)].sort((a, b) => b.brief.at - a.brief.at);
    mergeFollowUps(events);
    const th = currentThreat(events.map((e) => e.brief), Date.UTC(2026, 10, 2, 3, 0));
    expect(th.label).toBe("평시");
    expect(th.lastProvocation?.headline).toBe("북한, 탄도미사일 발사 (북한 매체 발표)");
    expect(kday(th.lastProvocation!.dateOnly!)).toBe("2026-10-31");
    // 북한 매체 보도를 처음 본 11/1 아침에는 '주의'(전날 발사, 6시간 넘게 지남)
    expect(currentThreat(events.map((e) => e.brief), Date.UTC(2026, 9, 31, 22, 0)).label).toBe("주의");
  });
});

describe("북한 매체의 다음 날 보도는 이미 잡힌 발사에 합친다 (같은 발사를 두 번 세지 않는다)", () => {
  const pairs: [string, string, string][] = [
    ["jcs_20261029", "kcna_20261030", "합참 '탄도미사일' = 북한 '600㎜ 방사포' (이름이 달라도)"],
    ["jcs_20260920", "kcna_20260922", "'on Sunday: State media'"],
    ["media_20261003", "kcna_20261004", "외신 단독 보도 + 다음 날 북한 주장"],
  ];
  for (const [first, next, why] of pairs) {
    it(why, () => {
      // 실제로는 시간 사슬로 한 묶음이 되기도 하지만, 따로 묶인 경우를 일부러 만든다
      const events = [...briefed(REAL[first]), ...briefed(REAL[next])].sort((a, b) => b.brief.at - a.brief.at);
      expect(events.length).toBeGreaterThanOrEqual(2);
      mergeFollowUps(events);
      const provs = events.filter((e) => e.brief.isProvocation);
      expect(provs).toHaveLength(1);
      expect(provs[0].brief.selfReport).toBeUndefined();
      expect(provs[0].signals.some((s) => REAL[next].some((x) => x.id === s.id))).toBe(true);
    });
  }
});

describe("발사 예고 항행경보는 '도발'이 아니다 (발사 전 신호 — 징후판에서 따로 센다)", () => {
  it("공식 원천 항행경보 사건: 위험도 '주의'는 유지, 마지막 도발 목록에는 넣지 않음", () => {
    const t = Date.UTC(2026, 10, 2, 0, 0);
    const notice: Signal = {
      id: "jcg:1", source: "nga_msi", sourceKind: "official", category: "launch_notice", title: "NAVAREA XI 0500/26 — DPRK SATELLITE LAUNCH", summary: "ROCKET LAUNCH 2026-11-05~11-12",
      publishedTime: t, detectedTime: t + 60_000, severity: 70, lat: 34.5, lon: 124.5,
    };
    const second: Signal = { ...notice, id: "khoa:1", source: "khoa", title: "북한 위성 발사 예고 항행경보" };
    const e: CrisisEvent = buildEvent("launch", [notice, second]);
    const b = briefEvent(e, [notice, second]);
    expect(b.isProvocation).toBe(false);
    expect(b.danger.level).toBe(2);
    expect(currentThreat([b], t + H).lastProvocation).toBeNull();
  });
});
