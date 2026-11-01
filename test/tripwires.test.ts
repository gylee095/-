// 경보 단어 — 군·정부 태세 변화, 북한 전시 태세 명령, 돈·사람이 빠지는 행동
import { describe, expect, it } from "vitest";
import { matchTripwire } from "../src/core/tripwires.js";
import { classifyText } from "../src/core/classify.js";
import { collectRss } from "../src/core/collectors/news.js";
import { runCycle } from "../src/core/pipeline.js";
import { MemoryStore } from "../src/core/store.js";

const NOW = Date.UTC(2026, 10, 2, 3, 0);

describe("경보 단어 찾기", () => {
  const hits: [string, string, string, number][] = [
    ["軍, 대북 정보감시태세 워치콘 2로 격상", "watchcon_up", "gov", 2],
    ["한미, 방어준비태세 데프콘 3으로 격상", "defcon_up", "gov", 3],
    ["강원 일대 진돗개 하나 발령…무장공비 침투 가능성", "defense_situation", "military", 2],
    ["국정원, 국가 사이버위기 경보 '경계'로 격상", "cyber_alert", "gov", 1],
    ["北, 전방부대에 '완전사격준비태세' 지시", "nk_war_posture", "military", 2],
    ["北, 2015년 이후 처음 '준전시상태' 선포", "nk_war_posture", "military", 2],
    ["북한, 접경지역 주민 후방으로 소개", "nk_border_evacuation", "military", 3],
    ["평양 주재 중국 대사관 직원 가족 철수", "pyongyang_embassies_leave", "gov", 3],
    ["루프트한자, 인천 노선 운항 중단", "airlines_suspend", "money", 2],
    ["로이즈 JWC, 한국 해역 전쟁위험 지역 지정", "war_insurance", "money", 2],
    ["외국계 은행, 서울 주재원 철수 시작", "firms_evacuate", "elite", 2],
  ];
  it.each(hits)("%s → %s (%s %d)", (title, id, domain, level) => {
    const h = matchTripwire(title)!;
    expect(h.tripwire).toMatchObject({ id, domain, level });
    expect(h.drill).toBe(false);
    expect(h.denied).toBe(false);
  });
  it("훈련·부인은 표시만 (알림 없음), 다른 나라·회고 기사·관련 없는 기사는 버린다", () => {
    expect(matchTripwire("을지훈련 중 워치콘 격상 상황 가정")!.drill).toBe(true);
    expect(matchTripwire("합참 \"워치콘 격상 없다\"")!.denied).toBe(true);
    expect(matchTripwire("이스라엘 노선 운항 중단…대한항공 인천 출발편도 취소")).toBeNull();
    expect(matchTripwire("1950년 6월 북한 접경 주민 소개 당시를 회고")).toBeNull();
    expect(matchTripwire("北, 서해상 사격훈련 실시")).toBeNull();
    expect(matchTripwire("데프콘, 새 앨범 발표")).toBeNull();
    expect(matchTripwire("北, 포병 사격대기태세 지시…'훈련 아냐'")!.drill).toBe(false);
  });
  it("분류: 경보 단어는 '태세' 분류, 훈련이면 심각도를 낮춘다", () => {
    expect(classifyText("軍, 대북 정보감시태세 워치콘 2로 격상")).toMatchObject({ category: "posture", severity: 88, tripwire: "watchcon_up" });
    expect(classifyText("을지훈련 중 워치콘 격상 상황 가정")).toMatchObject({ category: "posture", severity: 15, drill: true });
  });
});

describe("경보 단어 → 알림과 전쟁 판정", () => {
  // buildState 는 실제 현재 시각을 쓰므로 사건도 지금 기준으로 만든다
  const NOW = Date.now();
  async function cycleWith(titles: string[]) {
    const xml = `<rss><channel>${titles.map((t, i) => `<item><title><![CDATA[${t}]]></title><link>https://news.test/${i}</link><pubDate>${new Date(NOW - 60_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(xml)) as typeof fetch;
    try {
      const res = await collectRss(["https://feed.test/rss"], NOW, "rss_breaking");
      const fake = (async () => new Response("ok")) as unknown as typeof fetch;
      const store = new MemoryStore();
      const r = await runCycle({ NTFY_TOPIC: "t" }, store, { now: NOW, fetchImpl: fake, collect: async () => [res] });
      return { r, store };
    } finally {
      globalThis.fetch = orig;
    }
  }
  it("워치콘 격상 기사 한 건 → 바로 알림, 판정은 정부 '경계' → 3단계", async () => {
    const { r, store } = await cycleWith(["軍, 대북 정보감시태세 워치콘 2로 격상"]);
    expect(r.alerts).toHaveLength(1);
    const { buildState } = await import("../src/core/state.js");
    const st = await buildState(store, NOW - 72 * 3600_000);
    const gov = st.warRisk.domains.find((d) => d.id === "gov")!;
    expect(gov.level).toBe(2);
    expect(gov.drivers[0]).toMatch(/경보 단어 '워치콘 격상'/);
    expect(st.warRisk.phase).toBe(3);
    expect(st.threat.lastProvocation).toBeNull(); // 북한 도발로 세지 않는다
  });
  it("외국 항공사 운항 중단 → 돈 '경계', 북한 전시 태세 → 군사 '경계'", async () => {
    const { store } = await cycleWith(["루프트한자, 인천 노선 운항 중단", "北, 전방부대에 '완전사격준비태세' 지시"]);
    const { buildState } = await import("../src/core/state.js");
    const st = await buildState(store, NOW - 72 * 3600_000);
    expect(st.warRisk.domains.find((d) => d.id === "money")!.level).toBe(2);
    expect(st.warRisk.domains.find((d) => d.id === "military")!.level).toBe(2);
  });
  it("훈련 기사는 알리지 않고 판정도 바꾸지 않는다", async () => {
    const { r, store } = await cycleWith(["을지훈련 중 워치콘 격상 상황 가정"]);
    expect(r.alerts).toHaveLength(0);
    const { buildState } = await import("../src/core/state.js");
    const st = await buildState(store, NOW - 72 * 3600_000);
    expect(st.warRisk.domains.find((d) => d.id === "gov")!.level).toBe(0);
  });
});

describe("경보 단어 추가분: 병력 집결 포착·정보당국 경고", () => {
  it("한국·미국 군이 '포착'한 전방 집결만 센다 (북한의 공언은 아님)", () => {
    expect(matchTripwire("합참 \"北 전방 장사정포 전진 배치 포착\"")!.tripwire.id).toBe("nk_forward_deploy");
    expect(matchTripwire("北 김여정 \"전술타격수단 남부 국경 증강할 것\"")).toBeNull();
  });
  it("미국 정보당국의 '남침' 경고만 (대만·우크라이나 이야기는 아님)", () => {
    expect(matchTripwire("美 정보당국 \"北, 남침 결정한 듯\"")!.tripwire).toMatchObject({ id: "us_intel_warning", domain: "gov", level: 2 });
    expect(matchTripwire("美 정보당국 \"中 대만 침공 땐 北 도발 가능성\"")).toBeNull();
    expect(matchTripwire("美 국방부 \"北, 우크라이나 침공 러시아에 포탄 지원\"")).toBeNull();
  });
});
