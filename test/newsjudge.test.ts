// 2026-11-17 사용자: "종류를 매번 만들 수 없다 — 내가 매번 새 종류를 알려 줄 수 없으니 알아서 파악해라"
// 넓은 그물로 받아 두고(규칙은 받기만), 중요한지는 AI 분석관이 판단한다. 그물에도 안 걸린 것은 분석관이 직접 올린다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyText, securityNews } from "../src/core/classify.js";
import { briefEvent } from "../src/core/brief.js";
import { collectRss } from "../src/core/collectors/news.js";
import { addedAsEvents, applyJudgment, mergeAdded, mergeJudgments, parseAdded, parseJudgments, ADDED_KEEP } from "../src/core/newsjudge.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/security_net_titles.json", import.meta.url), "utf8")) as { catch: { t: string; official: boolean }[]; skip: { t: string }[] };
const NOW = Date.parse("2026-11-17T20:00:00+09:00");
const ev = (id: string, title: string, severity = 25) => ({ id, group: "security", categories: ["security_news"], status: "UNVERIFIED", basis: "media", severity, firstDetectedTime: NOW, lastUpdatedTime: NOW, signalIds: ["s"], sources: ["rss_breaking"], title, drill: false, retracted: false, breaking: false }) as any;
const sig = (title: string, severity = 25) => [{ id: "s", source: "rss_breaking", sourceKind: "media", category: "security_news", title, summary: "yna.co.kr · 분류 전", detectedTime: NOW, severity }] as any;

describe("넓은 그물 — 처음 보는 종류의 군사·안보 소식도 받아 둔다", () => {
  it("주체 + 움직임 + 한반도 주변이 함께 있으면 받는다 (중국 해경·군 사고·주한미군 철수·잠수함·표류 …)", () => {
    for (const { t, official } of fx.catch) {
      const c = classifyText(t);
      const taken = (c && c.category !== "civil_alert_other") || securityNews(t);
      expect(!!taken, t).toBe(true);
      if (!c || c.category === "civil_alert_other") expect(securityNews(t), t).toEqual({ official });
    }
  });
  it("행사·개발 소식·한반도 밖의 일·연예는 받지 않는다 (실제 11/17 제목 포함)", () => {
    for (const { t } of fx.skip) expect(securityNews(t), t).toBeNull();
  });
  it("수집에서 버리지 않고 '분류 전' 신호로 남긴다 — 군 당국 발표 인용은 조금 더 무겁게", async () => {
    const titles = [fx.catch[0].t, fx.catch[1].t, fx.skip[0].t];
    const rss = `<rss><channel>${titles.map((t, i) => `<item><title><![CDATA[${t}]]></title><link>https://www.yna.co.kr/view/AKR${i}</link><pubDate>${new Date(NOW - 600_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(rss)) as typeof fetch;
    try {
      const r = await collectRss(["https://www.yna.co.kr/rss/news.xml"], NOW, "rss_breaking");
      expect(r.signals.map((s) => [s.category, s.severity])).toEqual([["security_news", 25], ["security_news", 40]]);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("중요도는 AI 분석관이 정한다", () => {
  it("판단 전: 군 당국 발표 인용만 '주의'로 보이고 나머지는 참고 — 둘 다 '확인하기 전'이라고 적는다", () => {
    const a = briefEvent(ev("e1", fx.catch[1].t, 40), sig(fx.catch[1].t, 40));
    expect(a.danger).toMatchObject({ level: 2 });
    expect(a.danger.reason).toMatch(/클로드가 중요도를 확인하기 전/);
    expect(a.isProvocation).toBe(false);
    expect(briefEvent(ev("e2", fx.catch[0].t), sig(fx.catch[0].t)).danger.level).toBe(1);
    expect(applyJudgment(a, ["security_news"], undefined).pending).toBe(true);
  });
  it("판단을 적으면 그 수준과 이유로 보인다. 0 은 '중요하지 않음'. 3 까지만 줄 수 있고 모르는 id 는 버린다", () => {
    const j = parseJudgments("e1=2:중국 군함 3척이 잠정조치수역에 들어왔다 나감 — 올해 네 번째\n- e2=0:해외 기사\nevt_x=3:모르는 사건\ne1=5:안 됨", ["e1", "e2"], NOW);
    expect(j).toEqual({ e1: { level: 2, why: "중국 군함 3척이 잠정조치수역에 들어왔다 나감 — 올해 네 번째", at: NOW }, e2: { level: 0, why: "해외 기사", at: NOW } });
    const b = briefEvent(ev("e2", fx.catch[0].t), sig(fx.catch[0].t));
    expect(applyJudgment(b, ["security_news"], j.e1).danger).toEqual({ level: 2, label: "주의", reason: "클로드 판단: 중국 군함 3척이 잠정조치수역에 들어왔다 나감 — 올해 네 번째" });
    expect(applyJudgment(b, ["security_news"], j.e2).danger).toMatchObject({ level: 1, reason: "클로드 판단: 중요하지 않음 — 해외 기사" });
    // 규칙이 정한 사건(미사일 등)은 분석관 판단으로 바뀌지 않는다
    expect(applyJudgment(b, ["missile"], j.e1)).toBe(b);
    expect(Object.keys(mergeJudgments(j, {}, NOW + 15 * 86400_000))).toEqual([]);
  });
});

describe("그물에도 안 걸린 뉴스는 분석관이 직접 올린다", () => {
  it("'수준 | 제목 | 이유 | 주소' 를 사건으로 — 다른 사건과 같은 모양, 일주일 보관, 같은 제목은 한 번", () => {
    const add = parseAdded("2 | 中 항모 랴오닝함, 제주 남방 해역 통과 | 서해·남해에서 중국 해군 활동이 늘고 있음 — 항모 통과는 올해 두 번째 | https://www.yna.co.kr/view/AKR1\n9 | 수준이 틀림 | 이유 | https://a.b\n3 | 짧 | 이유", NOW);
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ level: 2, title: "中 항모 랴오닝함, 제주 남방 해역 통과", url: "https://www.yna.co.kr/view/AKR1" });
    const again = mergeAdded(add, parseAdded("3 | 中 항모 랴오닝함, 제주 남방 해역 통과 | 다시 판단 | https://x.y/z", NOW + 3600_000), NOW + 3600_000);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ level: 3, at: NOW });
    expect(mergeAdded(add, [], NOW + ADDED_KEEP + 1)).toEqual([]);
    const { events, judged } = addedAsEvents(add);
    const b = applyJudgment(briefEvent(events[0], events[0].evidence!), events[0].categories, judged[events[0].id]);
    expect(b.headline).toBe("中 항모 랴오닝함, 제주 남방 해역 통과");
    expect(b.danger).toMatchObject({ level: 2, label: "주의" });
    expect(b.danger.reason).toMatch(/^클로드 판단: 서해·남해에서/);
    expect(b.isProvocation).toBe(false);
  });
  it("코드: 분석관 도구 둘과 지침이 함께 있고, 판단할 목록이 상황판에 나온다", () => {
    const tools = readFileSync(new URL("../src/mcp/tools.ts", import.meta.url), "utf8");
    expect(tools).toMatch(/"record_news_judgments"/);
    expect(tools).toMatch(/"add_news_event"/);
    expect(tools).toMatch(/newsToJudge:/);
    const scan = readFileSync(new URL("../.claude/commands/kew-scan.md", import.meta.url), "utf8");
    expect(scan).toMatch(/record_news_judgments/);
    expect(scan).toMatch(/add_news_event/);
  });
});
