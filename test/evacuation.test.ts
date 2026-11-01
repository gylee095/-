// 한국을 떠나는 움직임 — 미 국무부 철수·출국 문구, 언론의 철수·후송 보도 (훈련·가짜·계획은 걸러낸다)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyEvacuation, classifyText } from "../src/core/classify.js";
import { departureOf, parseUsAdvisory, travelSignals } from "../src/core/collectors/travel.js";
import { collectRss } from "../src/core/collectors/news.js";
import { runCycle } from "../src/core/pipeline.js";
import { MemoryStore } from "../src/core/store.js";
import { assessWarRisk } from "../src/core/warrisk.js";
import { GROUP_LABEL, INDICATORS, STATE_LABEL } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";
import type { EventBrief } from "../src/core/brief.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 2, 3, 0);

describe("철수·후송 보도 분류", () => {
  const cases: [string, "go" | "plan" | "drill" | "hoax" | null][] = [
    ["美 국무부, 주한 대사관 직원 가족 철수 명령", "go"],
    ["[속보] 주한미군 가족 비전투원 대피 시작…수송기로 일본行", "go"],
    ["한국 체류 미국인들, 군 수송기로 일본 대피 시작", "go"],
    ["U.S. orders departure of embassy families from South Korea", "go"],
    ["日, 한반도 유사시 자국민 대피 계획 점검", "plan"],
    ["주한미군, 가족 비전투원 후송훈련 실시", "drill"],
    ["USFK holds Courageous Channel evacuation exercise for families in Korea", "drill"],
    ["주한미군 '가족 대피' 가짜 문자 주의", "hoax"],
    ["USFK warns of fake evacuation messages sent to families in Korea", "hoax"],
    // 아닌 것: 주한미군 감축 논쟁, 외국인 투자자 이탈, 다른 나라에서의 교민 철수
    ["트럼프, 주한미군 철수 검토…방위비 압박", null],
    ["외국인 투자자, 한국 증시 탈출…코스피 급락", null],
    ["레바논 교민 철수 작전…공군 수송기 투입", null],
    ["美, 이스라엘 체류 자국민에 출국 권고", null],
  ];
  it.each(cases)("%s → %s", (title, want) => {
    const c = classifyEvacuation(title);
    if (want === null) return expect(c).toBeNull();
    expect(c?.category).toBe("evacuation");
    if (want === "go") expect(c!.severity).toBeGreaterThanOrEqual(85);
    if (want === "plan") expect(c!.severity).toBeLessThan(85);
    if (want === "drill") expect(c!.drill).toBe(true);
    if (want === "hoax") expect(c!.retraction).toBe(true);
  });
  it("미사일 기사 분류는 그대로 (철수 문구가 없으면 철수로 보지 않는다)", () => {
    expect(classifyText("[속보] 합참 \"북한, 동해상으로 탄도미사일 발사\"")?.category).toBe("missile");
  });
});

describe("미 국무부 경보 본문의 철수·출국 문구", () => {
  it("평소 경보(1단계)에는 없다", () => {
    const us = parseUsAdvisory(fx("travel_state.xml"))!;
    expect(us).toMatchObject({ level: 1, departure: 0 });
    expect(travelSignals(us, 1, { summary: "", securityFlag: false }, NOW).some((s) => s.category === "evacuation")).toBe(false);
  });
  it("2022-01-23 우크라이나 문구를 옮긴 가상 사례: 즉시 출국 권고까지 → 3, 공식 신호(심각도 95)", () => {
    const us = parseUsAdvisory(fx("travel_state_kr_departure_synthetic.xml"))!;
    expect(us.level).toBe(4);
    expect(us.departure).toBe(3);
    const sig = travelSignals(us, 1, { summary: "", securityFlag: false }, NOW).find((s) => s.category === "evacuation")!;
    expect(sig).toMatchObject({ sourceKind: "official", severity: 95 });
    expect(sig.title).toMatch(/즉시 출국 권고/);
  });
  it("문구 단계: 자발적 출국 허용 1 · 철수 명령 2 · 즉시 출국 3", () => {
    expect(departureOf("The Department of State authorized the voluntary departure of non-emergency employees.").departure).toBe(1);
    expect(departureOf("On January 23, 2022, the Department ordered the departure of eligible family members from Embassy Kyiv.").departure).toBe(2);
    expect(departureOf("U.S. citizens should depart immediately via commercial means.").departure).toBe(3);
    expect(departureOf("Exercise normal precautions. Large-scale demonstrations may occur.").departure).toBe(0);
  });
});

describe("철수·후송 보도 → 알림과 전쟁 판정", () => {
  async function cycleWith(titles: string[], now: number, store = new MemoryStore()) {
    const xml = `<rss><channel>${titles.map((t, i) => `<item><title><![CDATA[${t}]]></title><link>https://news.test/${i}</link><pubDate>${new Date(now - 60_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
    const orig = globalThis.fetch;
    const sent: string[] = [];
    globalThis.fetch = (async () => new Response(xml)) as typeof fetch;
    try {
      const res = await collectRss(["https://feed.test/rss"], now, "rss_breaking");
      const fake = (async (_u: string, init: RequestInit) => {
        sent.push(String(init.body));
        return new Response("ok");
      }) as unknown as typeof fetch;
      const r = await runCycle({ NTFY_TOPIC: "t" }, store, { now, fetchImpl: fake, collect: async () => [res] });
      return { r, sent };
    } finally {
      globalThis.fetch = orig;
    }
  }
  it("공식 인용 없는 보도 한 건이라도 바로 알린다 ('미확인' 표기)", async () => {
    const { r } = await cycleWith(["한국 체류 미국인들, 군 수송기로 일본 대피 시작"], NOW);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].sent).toBe(true);
  });
  it("훈련·가짜·'유사시 계획' 보도는 알리지 않는다", async () => {
    const { r } = await cycleWith(["주한미군, 가족 비전투원 후송훈련 실시", "주한미군 '가족 대피' 가짜 문자 주의", "日, 한반도 유사시 자국민 대피 계획 점검"], NOW);
    expect(r.alerts).toHaveLength(0);
  });

  const board = (): BoardRow[] =>
    INDICATORS.map((d) => {
      const reading = { indicator: d.id, at: NOW, n: 20, value: 0, state: "normal" as const };
      return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL.normal, history: [] };
    });
  const evac = (evacuation: EventBrief["evacuation"]): EventBrief => ({ headline: "美 국무부, 주한 대사관 직원 가족 철수 명령", isProvocation: false, danger: { level: evacuation === "confirmed" ? 5 : 4, label: "", reason: "" }, at: NOW - 3600_000, evacuation });
  it("전쟁 판정: 보도만 → 정부 '주의', 공식 인용 한 곳 → '경계'(3단계), 확인 → '심각'(4단계 임박). 북한 도발로 세지 않는다", () => {
    const w1 = assessWarRisk({ now: NOW, board: board(), briefs: [evac("media")], patterns: [] });
    expect(w1.domains.find((d) => d.id === "gov")!.level).toBe(1);
    expect(w1.domains.find((d) => d.id === "military")!.level).toBe(0);
    const w2 = assessWarRisk({ now: NOW, board: board(), briefs: [evac("official")], patterns: [] });
    expect(w2.domains.find((d) => d.id === "gov")!.level).toBe(2);
    expect(w2.phase).toBe(3);
    const w3 = assessWarRisk({ now: NOW, board: board(), briefs: [evac("confirmed")], patterns: [] });
    expect(w3.domains.find((d) => d.id === "gov")!.level).toBe(3);
    expect(w3.phase).toBe(4);
    expect(w3.domains.find((d) => d.id === "gov")!.drivers[0]).toMatch(/한국을 떠나라는 움직임/);
  });
  it("국무부 경보 본문에 철수 문구가 생기면(징후판 '이상') 정부 '심각' → 4단계", () => {
    const b = board().map((r) => (r.id === "official.us_departure_kr" ? { ...r, reading: { ...r.reading!, value: 2, state: "anomalous" as const } } : r));
    const w = assessWarRisk({ now: NOW, board: b, briefs: [], patterns: [] });
    expect(w.domains.find((d) => d.id === "gov")!.level).toBe(3);
    expect(w.phase).toBe(4);
  });
});
