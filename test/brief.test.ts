import { describe, expect, it } from "vitest";
import { briefEvent, currentThreat, extractCount, extractWeapon } from "../src/core/brief.js";
import { correlate } from "../src/core/correlate.js";
import type { Signal } from "../src/core/types.js";

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 29, 3, 48);
const media = (i: number, title: string, url: string, t: number, citesOfficial = false, breaking = false): Signal => ({
  id: `m${i}`, source: "rss_news", sourceKind: "media", category: /방사포|artillery/i.test(title) ? "artillery" : "missile",
  title, summary: "", url, publishedTime: t, detectedTime: t + 60_000, severity: citesOfficial ? 75 : 20, citesOfficial, breaking,
});

describe("수치 추출", () => {
  it("발수", () => {
    expect(extractCount("North Korea fires salvo of around 10 ballistic missiles toward sea")).toBe("약 10 발");
    expect(extractCount("北, 탄도미사일 10여발 발사")).toBe("10여 발");
    expect(extractCount("탄도미사일 두 발 발사")).toBe("2 발");
    expect(extractCount("North Korea fires multiple ballistic missiles")).toBe("여러 발");
    expect(extractCount("북한 미사일 발사")).toBeUndefined();
  });
  it("무기 종류", () => {
    expect(extractWeapon("탄도미사일 가능성 물체")).toBe("탄도미사일");
    expect(extractWeapon("600㎜ 초대형 방사포")).toBe("600㎜ 초대형 방사포");
    expect(extractWeapon("submarine-launched cruise missiles")).toBe("순항미사일");
  });
});

describe("2026-10-29 실제 사례 요약", () => {
  const sigs = [
    media(1, '[속보] 日방위성 "北, 탄도미사일 가능성 물체 발사"', "https://www.yna.co.kr/a", T0, true, true),
    media(2, "North Korea fires salvo of around 10 ballistic missiles toward sea: Seoul", "https://www.nknews.org/b", T0 + 3 * 60_000, true),
    media(3, '日방위성 "北, 탄도미사일 가능성 물체 발사…日EEZ 밖 낙하"', "https://www.yna.co.kr/c", T0 + 29 * 60_000, true),
    media(4, '中, \'北 미사일 발사\' 침묵 깼다…"당사국들 평화 노력 희망"', "https://www.yna.co.kr/d", T0 + 4 * H),
  ];
  const [e] = correlate(sigs);
  const b = briefEvent(e, sigs);
  it("한 줄 요약과 수치", () => {
    expect(b.isProvocation).toBe(true);
    expect(b.weapon).toBe("탄도미사일");
    expect(b.count).toBe("약 10 발");
    expect(b.impactArea?.name).toBe("동해 · 일본 EEZ 밖");
    expect(b.headline).toBe("북한, 탄도미사일 약 10 발 발사 → 동해 · 일본 EEZ 밖");
    expect(b.danger.label).toBe("경계");
    expect(b.latest?.title).toContain("침묵");
  });
  it("현재 위험도는 경과 시간에 따라 낮아짐", () => {
    expect(currentThreat([b], T0 + 30 * 60_000).label).toBe("경계");
    expect(currentThreat([b], T0 + 8 * H).label).toBe("주의");
    const later = currentThreat([b], T0 + 35 * H);
    expect(later.label).toBe("평시");
    expect(later.lastProvocation?.headline).toContain("탄도미사일");
  });
});

describe("논평·분석 기사는 도발로 보지 않음", () => {
  it("accuses / 우리 군 시험", () => {
    for (const title of ["North Korean missile chief accuses South of faking hypersonic weapon test", "South Korea tests hypersonic missile for first time, weeks after North"]) {
      const s = [media(9, title, "https://www.nknews.org/x", T0)];
      const b = briefEvent(correlate(s)[0], s);
      expect(b.isProvocation).toBe(false);
      expect(b.danger.level).toBe(1);
    }
  });
});

describe("같은 사건에 섞인 논평 기사의 수치는 무시", () => {
  it("ICBM 공개 기사가 섞여도 무기는 탄도미사일, 발수는 다수결", () => {
    const t = T0 + 10 * H;
    const sigs = [
      media(21, "合참은 10여발이랬는데…美 \"北 탄도미사일 2발 발사\" - 뉴시스", "https://news.google.com/1", t),
      media(22, "北, 탄도미사일 10여발 동해로 발사… 군사회담 제안 엿새만에 무더기 도발 - 동아일보", "https://news.google.com/2", t + 60_000),
      media(23, "북한, 화성-20형 ICBM에 다탄두 6기 탑재 첫 공개 - 뉴시스", "https://news.google.com/3", t + 120_000),
      media(24, "北, 단거리 탄도미사일 10여 발 동해상 발사 - 시사주간", "https://news.google.com/4", t + 180_000),
    ];
    const b = briefEvent(correlate(sigs)[0], sigs);
    expect(b.weapon).toBe("탄도미사일");
    expect(b.count).toBe("10여 발");
    expect(b.impactArea?.name).toBe("동해상");
    expect(b.danger.label).toBe("경계");
  });
});
