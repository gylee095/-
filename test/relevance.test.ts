// 한반도 연관도 (11/18 사용자: "아무 속보나 뜨면 안 된다 — 한반도 전쟁과 가장 가까운 속보가 떠야 한다")
import { describe, expect, it } from "vitest";
import { REL_WEIGHT, koreaRelevance } from "../src/core/relevance.js";
import { deepReasons } from "../src/core/deep.js";

const wide = ["security_news"];
describe("한반도 연관도 — 낱말로 매기는 임시 점수", () => {
  it("규칙이 종류를 정한 한반도 사건과 한반도 이야기는 3", () => {
    expect(koreaRelevance("[속보] 러 군용기 여러대 새벽 KADIZ 진입…軍, 전투기 투입 대응", ["air_incursion"])).toBe(3);
    expect(koreaRelevance("주한미군 패트리엇 포대 추가 이동", wide)).toBe(3);
  });
  it("한 다리 건너는 2 — 핵, 대만해협, 미국 본토, 전국 마비, 강대국 직접 충돌", () => {
    for (const t of [
      'Trump says "we\'re looking into" report that Iran may use dirty bomb on D.C.',
      "Trump says US taking 'very seriously' any Iranian plot against Washington",
      "China launches blockade drills around Taiwan",
      "Classified N.S.A. Network Goes Down, Causing Work Disruptions",
      "US Navy jet shot down by Chinese missile over South China Sea",
      "中 군함, 대만해협 봉쇄 훈련 돌입",
    ]) expect(koreaRelevance(t, wide), t).toBe(2);
  });
  it("이미 진행 중인 다른 지역 전쟁의 전황은 1", () => {
    for (const t of [
      "Iran launches a third round of strikes on Bahrain, host of U.S. Navy's 5th Fleet",
      "Ukraine Attacks Kerch Bridge Linking Russia to Occupied Crimea",
      "이란, 또 중동 미군기지 공격…협상 교착 속 긴장 고조",
    ]) expect(koreaRelevance(t, wide), t).toBe(1);
  });
  it("재판·수사·사건 사고·영상 묶음은 0", () => {
    for (const t of [
      "Man convicted in Iran-backed plot to kill Trump is sentenced",
      "Man with ax destroys $60M U.S. military plane, prosecutors say",
      "American soldier accused of spying in U.S. custody after U.K. arrest",
      "WATCH:  Trump blames Biden administration for FAA ground stop & other stories",
    ]) expect(koreaRelevance(t, wide), t).toBe(0);
  });
  it("무게: 먼 전황 여럿보다 가까운 속보 몇 건이 크다", () => {
    expect(REL_WEIGHT[0]).toBe(0);
    expect(REL_WEIGHT[2] * 4).toBeGreaterThan(REL_WEIGHT[1] * 10);
  });
});

describe("분석관은 손님 알림이 나갈 때만 추가로 깨운다 (11/18)", () => {
  const calm = { phase: 2, phaseLabel: "긴장", domains: [] } as never;
  it("속보가 아무리 쌓여도 깨울 이유가 되지 않는다", () => {
    const briefs = Array.from({ length: 30 }, (_, i) => ({ headline: `Iran strikes ${i}`, at: 1_000_000 - i, danger: { level: 1, label: "관심", reason: "" }, isProvocation: false, rel: 2 })) as never;
    expect(deepReasons(calm, briefs, [], 1_000_000)).toEqual([]);
  });
  it("손님 알림이 나간 바퀴에는 한 가지 이유가 생기고, 같은 날 같은 알림은 같은 열쇠다", () => {
    const a = deepReasons(calm, [], [], Date.UTC(2026, 10, 18, 1), "⚠️ 긴장 → 위기");
    expect(a).toHaveLength(1);
    expect(a[0].key).toBe(deepReasons(calm, [], [], Date.UTC(2026, 10, 18, 3), "⚠️ 긴장 → 위기")[0].key);
    expect(a[0].text).toContain("손님 알림");
  });
});

// 11/21 사용자: "러시아가 쐈는데 왜 % 가 안 올라가?" — 러시아 미사일이 나토 회원국 폴란드에 떨어진 보도가 1점으로 묻히고, '강대국 직접 충돌' 칸은 비어 0이었다
describe("강대국 직접 충돌 — 러시아·중국이 나토·미국·일본 쪽을 쳤다는 제목", async () => {
  const { powerClash } = await import("../src/core/relevance.js");
  const { autoStatus } = await import("../src/core/proximity.js");
  it("그날 실제 제목: 폴란드 피격은 잡고 2점", () => {
    for (const t of [
      "Poland hit by at least one Russian missile, says Polish govt",
      "Russian missiles hit Poland: What happened, and could NATO respond?",
      "Russia missiles pummel Ukraine and hit NATO soil in Poland",
      "Russian drones shot down over Romania, NATO says",
      "Chinese warship rams Philippine vessel near Second Thomas Shoal",
      "러시아 미사일, 나토 회원국 폴란드 영토에 떨어져",
      "중국 군함, 필리핀 보급선 들이받아",
    ]) { expect(powerClash(t), t).toBe(true); expect(koreaRelevance(t, ["security_news"]), t).toBe(2); }
  });
  it("누가 쐈는지 모르거나, 우크라이나 안의 전황이거나, 재판은 아니다", () => {
    for (const t of [
      "Russia says Kaliningrad-bound ship struck by drones in Gulf of Finland",
      "Russian attacks on Ukraine's energy grid intensify ahead of winter",
      "Three Kyiv bridges hit during major Russian missile attack",
      "Russia and China hold joint naval drills near Japan",
      "Man charged with spying for Russia at NATO base in Germany",
    ]) expect(powerClash(t), t).toBe(false);
  });
  it("그런 사건이 사흘 안에 있으면 '강대국 직접 충돌'이 반 개 켜진다 — 없으면 꺼짐", () => {
    const now = Date.UTC(2026, 10, 21, 3);
    const b = (headline: string) => ({ headline, at: now - 3600_000, isProvocation: false, danger: { level: 1, label: "관심", reason: "" } }) as never;
    expect(autoStatus([], [b("Poland hit by at least one Russian missile, says Polish govt")], now).w_power_clash).toMatchObject({ s: "on", w: 0.5 });
    expect(autoStatus([], [b("Russian attacks on Ukraine's energy grid intensify ahead of winter")], now).w_power_clash.s).toBe("off");
  });
});
