// 2026-11-18: 채점표에서 며칠씩 '미확인'으로 비어 있던 칸을 숫자로 채우는 신호 넷 — 실제로 받은 자료(test/fixtures)로 확인한다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cyberMetric, easaMetric, parseEasa, parseKisaLevel } from "../src/core/collectors/advisories.js";
import { parseChart20, worldFearMetric, FEAR_AT } from "../src/core/collectors/markets.js";
import { isKimActivity, kimSeenAt } from "../src/core/collectors/news.js";
import { INDICATOR_BY_ID } from "../src/core/indicators.js";
import { autoStatus } from "../src/core/proximity.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-18T10:00:00+09:00");
const row = (id: string, value: number, state: string) => ({ id, label: INDICATOR_BY_ID[id].label, group: "g", groupLabel: "g", unit: "", direction: "high", why: "", latency: "", caveats: "", stateLabel: "x", history: [], reading: { indicator: id, value, state, at: NOW } }) as any;

describe("항공 분쟁지역 고시 (EASA)", () => {
  const rows = parseEasa(fx("easa_czib_20261118.html"));
  it("실제 목록을 읽는다 — 2026-11-18: 유효 16건, 한반도 관련 유효 고시는 없다(평양 비행정보구역 고시는 2018년 철회)", () => {
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter((r) => r.status === "Active")).toHaveLength(16);
    expect(rows.find((r) => /Pyongyang/.test(r.title))).toMatchObject({ status: "Withdrawn", number: "CZIB-2017-06R2" });
    expect(easaMetric(rows)).toMatchObject({ indicator: "air.easa_czib_korea", value: 0, meta: { activeTotal: 16 } });
  });
  it("북한 고시만 유효하면 1, 한국이 들어가면 2. 표를 못 읽으면 값을 내지 않는다", () => {
    expect(easaMetric([{ title: "Airspace of North Korea – Pyongyang Flight Information Region", number: "x", status: "Active" }])!.value).toBe(1);
    expect(easaMetric([{ title: "Airspace of the Republic of Korea – Incheon Flight Information Region", number: "x", status: "Active" }])!.value).toBe(2);
    expect(easaMetric([{ title: "Airspace of the Democratic People's Republic of Korea", number: "x", status: "Active" }])!.value).toBe(1);
    expect(easaMetric(parseEasa("<html>점검 중</html>"))).toBeUndefined();
  });
});

describe("사이버 위기 경보 단계 (KISA)", () => {
  it("실제 첫 화면에서 단계를 읽는다 — 2026-11-18 '주의'(2)", () => {
    expect(parseKisaLevel(fx("kisa_alert_20261118.html"))).toBe(2);
    expect(cyberMetric(2)).toMatchObject({ indicator: "official.cyber_alert_level", value: 2 });
    expect(parseKisaLevel('<span>인터넷침해사고 경보단계</span><dl class="step s04">')).toBe(4);
    expect(parseKisaLevel('<span>인터넷침해사고 경보단계</span><dl class="step">')).toBe(0);
    expect(parseKisaLevel("<html>바뀐 화면</html>")).toBeUndefined();
    expect(cyberMetric(undefined)).toBeUndefined();
  });
  it("'주의'는 켜지 않고, '경계'는 약하게, '심각'은 온전히 켠다", () => {
    expect(INDICATOR_BY_ID["official.cyber_alert_level"].absolute).toEqual({ elevated: 3, anomalous: 4 });
    expect(autoStatus([row("official.cyber_alert_level", 2, "normal")], [], NOW).m_cyber.s).toBe("off");
    expect(autoStatus([row("official.cyber_alert_level", 3, "elevated")], [], NOW).m_cyber).toMatchObject({ s: "on", w: 0.5 });
    expect(autoStatus([row("official.cyber_alert_level", 4, "anomalous")], [], NOW).m_cyber).toMatchObject({ s: "on" });
    expect(autoStatus([], [], NOW).m_cyber.s).toBe("off");
  });
});

describe("세계 금융의 전쟁 공포", () => {
  const y = JSON.parse(fx("yahoo_world_fear_20261118.json"));
  it("실제 시세에서 20거래일 평균 대비를 낸다 — 2026-11-18: 셋 다 문턱 아래(0개)", () => {
    const q = { gold: parseChart20(y["GC=F"]), oil: parseChart20(y["CL=F"]), vix: parseChart20(y["^VIX"]) };
    expect(q.gold!.pct).toBeLessThan(FEAR_AT.goldPct);
    expect(q.vix!.last).toBeLessThan(FEAR_AT.vix);
    const m = worldFearMetric(q)!;
    expect(m).toMatchObject({ indicator: "market.world_fear", value: 0 });
    expect(String(m.meta!.note)).toMatch(/금 .*20일 평균 대비.*유가.*변동성 지수/);
  });
  it("금 +5%·유가 +15%·변동성 30 이상 가운데 넘은 수 — 둘 이상이면 '세계 금융의 전쟁 공포'를 온전히 켠다", () => {
    const m = worldFearMetric({ gold: { last: 4300, avg20: 4000, pct: 7.5 }, oil: { last: 90, avg20: 88, pct: 2.3 }, vix: { last: 34, avg20: 20, pct: 70 } })!;
    expect(m.value).toBe(2);
    expect(m.meta!.hit).toEqual(["금", "변동성"]);
    expect(worldFearMetric({})).toBeUndefined();
    expect(autoStatus([row("market.world_fear", 0, "normal")], [], NOW).w_markets.s).toBe("off");
    expect(autoStatus([row("market.world_fear", 1, "elevated")], [], NOW).w_markets).toMatchObject({ s: "on", w: 0.5 });
    expect(autoStatus([row("market.world_fear", 2, "anomalous")], [], NOW).w_markets).toMatchObject({ s: "on" });
    expect(autoStatus([], [], NOW).w_markets.s).toBe("unk"); // 못 받으면 '꺼짐'이 아니라 '못 봄'
  });
});

describe("김정은 공개활동 공백", () => {
  it("직접 나타난 활동 보도만 센다 (2026-11-17 실제 제목 포함) — 축전·남이 언급한 기사·측근의 활동은 아니다", () => {
    for (const t of ["김정은, 동해안 해군기지 건설현장 시찰…\"정해진 기간내 완결\"", "北김정은, 신형 구축함 진수식 참석", "[속보] 김정은, 당 중앙군사위 확대회의 주재"]) expect(isKimActivity(t), t).toBe(true);
    for (const t of ["[북한단신] 김정은, 캄보디아 국왕에 독립 73주년 축전", "트럼프 \"중국서 김정은 만날 수도…김정은 방중 시진핑에 달려\"", "北김정은 최측근 조용원 당비서, 대표단 이끌고 러시아행", "'김정은 최측근' 조용원 방러…北 \"동맹관계 날로 고도화\"(종합)", "北, 어머니날 헌신 부각…\"김정은, 여성지위 최상경지로\" 선전"]) expect(isKimActivity(t), t).toBe(false);
    expect(kimSeenAt([{ title: "김정은, 동해안 해군기지 건설현장 시찰", pubDate: NOW - 5 * 86400_000 }, { title: "김정은, 평양종합병원 방문", pubDate: NOW - 2 * 86400_000 }, { title: "오늘의 날씨", pubDate: NOW }])).toBe(NOW - 2 * 86400_000);
    expect(kimSeenAt([{ title: "오늘의 날씨", pubDate: NOW }])).toBeUndefined();
  });
  it("3주 넘게 비면 참고 신호 '지도부의 이례적 동선'을 약하게 — 단계·% 에는 들어가지 않는다", () => {
    expect(INDICATOR_BY_ID["nk.kim_absence_days"].absolute).toEqual({ elevated: 21, anomalous: 35 });
    expect(autoStatus([row("nk.kim_absence_days", 4, "normal")], [], NOW).m_leadership.s).toBe("off");
    expect(autoStatus([row("nk.kim_absence_days", 25, "elevated")], [], NOW).m_leadership).toMatchObject({ s: "on", w: 0.5 });
  });
});

describe("항공당국 고시에 한국이 들어가면 '항공편 중단·영공 폐쇄'를 온전히 켠다", () => {
  it("북한 고시만으로는 약하게, 한국 포함이면 온전히", () => {
    expect(autoStatus([row("air.easa_czib_korea", 1, "elevated")], [], NOW).m_airspace).toMatchObject({ s: "on", w: 0.5 });
    const full = autoStatus([row("air.easa_czib_korea", 2, "anomalous")], [], NOW).m_airspace;
    expect(full.s).toBe("on");
    expect(full.w ?? 1).toBe(1);
  });
});
