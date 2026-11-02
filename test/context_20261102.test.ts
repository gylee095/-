// '한반도 이야기인가' — 일반어(접경·국경·총격·무력 충돌)만으로는 아니다 (2026-11-02)
// 실제 사례: '키르기스, 무력충돌 벌였던 타지크 접경 327㎞ 철조망벽 완공'(연합뉴스 11/2)이 한반도 '전쟁' 언급 보도로 세어졌다.
import { describe, expect, it } from "vitest";
import { isKoreaContext } from "../src/core/classify.js";
import { isBorderIncident, isWarTalk } from "../src/core/collectors/news.js";

describe("다른 나라 국경·전쟁 기사는 한반도 기사가 아니다", () => {
  const foreign = [
    "키르기스, 무력충돌 벌였던 타지크 접경 327㎞ 철조망벽 완공", // 실제 (11/2)
    "태국-캄보디아 접경서 또 교전…주민 수천명 대피",
    "인도·파키스탄 국경 총격전…양측 사상자",
    "이스라엘-레바논 접경 무력 충돌 확전 우려",
    "아르메니아·아제르바이잔 국경 침범 공방",
  ];
  for (const t of foreign) it(t, () => {
    expect(isKoreaContext(t)).toBe(false);
    expect(isWarTalk(t)).toBe(false);
    expect(isBorderIncident(t)).toBe(false);
  });
});

describe("한반도 기사는 그대로 잡는다", () => {
  it("접경 사건", () => {
    expect(isBorderIncident("접경지 주민들 아침부터 北확성기 소리")).toBe(true); // 실제 (10/29)
    expect(isBorderIncident("북한군, 군사분계선 침범…軍 경고사격")).toBe(true);
    expect(isBorderIncident("연천 접경지역에 포탄 낙하…주민 대피")).toBe(true);
    expect(isBorderIncident("백령도 인근 해상서 총격")).toBe(true);
  });
  it("전쟁 언급", () => {
    expect(isWarTalk("김여정 \"전쟁 불사\"…남북 긴장 고조")).toBe(true);
    expect(isWarTalk("北, 한미 '아이언메이스' 연습 비난하며 \"핵전쟁 억제력 강화\"")).toBe(true);
    expect(isWarTalk("한반도 무력 충돌 가능성 커져")).toBe(true);
  });
  it("'강화'·'고성' 같은 일반어는 한반도 지명으로 보지 않는다", () => {
    expect(isKoreaContext("관세 전쟁 강화…무역 갈등")).toBe(false);
    expect(isKoreaContext("강화도 교동도 주민 대피 훈련")).toBe(true);
  });
});
