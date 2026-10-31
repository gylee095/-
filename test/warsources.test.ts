import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { advisoryMetrics, parseCanada, parseGermany, parseJapan, summarizeJpMails } from "../src/core/collectors/advisories.js";
import { parsePmHistory, parsePmSearch, pmMetrics, summarizePm } from "../src/core/collectors/polymarket.js";
import { articleRatio, parseWikiSeries, summarizeWiki, wikiMetrics } from "../src/core/collectors/wiki.js";
import { naverMetrics, naverRatios, naverRequest } from "../src/core/collectors/naver.js";
import { equityMetrics, parseSpark } from "../src/core/collectors/markets.js";
import { isWarTalk, newsMetrics } from "../src/core/collectors/news.js";
import { evaluate, INDICATOR_BY_ID } from "../src/core/indicators.js";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 9, 31, 1, 0);

describe("각국 정부 여행경보 (실측 2026-10-31)", () => {
  it("캐나다·독일·일본 모두 한국에 경보 없음", () => {
    const ca = parseCanada(JSON.parse(fx("advisory_ca_20261031.json")))!;
    const de = parseGermany(JSON.parse(fx("advisory_de_20261031.json")))!;
    const jp = parseJapan(fx("advisory_jp_kr_20261031.xml"));
    expect(ca).toMatchObject({ level: 0, text: "Exercise normal security precautions" });
    expect(de).toMatchObject({ level: 0, flags: [] });
    expect(jp.riskLevel).toBe(0);
    const ms = advisoryMetrics(ca, de, jp, NOW);
    expect(ms.map((m) => [m.indicator, m.value])).toEqual([
      ["official.ca_level_kr", 0], ["official.de_warning_kr", 0], ["official.jp_risk_level_kr", 0], ["official.jp_embassy_alert", 0],
    ]);
  });
  it("일본 공관 메일: 10/29 발사 1·2보는 공관이 여럿이어도 하루로 묶고, 태풍 안내는 북한 메일로 세지 않는다", () => {
    const jp = parseJapan(fx("advisory_jp_kr_20261031.xml"));
    expect(jp.mails[0].title).toMatch(/北朝鮮によるミサイル発射/);
    // 공관 여러 곳의 메일은 시간순이 아니다 — 가장 이른 1보가 12:51:27(연합뉴스 속보 12:48:39 의 3분 뒤)
    const oct29 = jp.mails.filter((m) => /ミサイル発射/.test(m.title) && new Date(m.at + 9 * 3600_000).toISOString().startsWith("2026-10-29"));
    const first = Math.min(...oct29.map((m) => m.at));
    expect(new Date(first).toISOString()).toBe("2026-10-29T03:51:27.000Z");
    const s = summarizeJpMails(jp.mails, NOW);
    expect(s.launchDays7d).toBe(1); // 10/12 발사는 7일 밖
    expect(s.alertLevel).toBe(0);
  });
  it("정세 경고·출국 권고 문구는 단계를 올린다 (태풍 '避難'은 제외)", () => {
    const at = NOW - 3600_000;
    expect(summarizeJpMails([{ at, title: "朝鮮半島情勢に関する注意喚起" }], NOW).alertLevel).toBe(1);
    expect(summarizeJpMails([{ at, title: "朝鮮半島情勢を踏まえた早期の出国の検討について" }], NOW).alertLevel).toBe(2);
    expect(summarizeJpMails([{ at, title: "台風の接近に伴う避難の勧告" }], NOW).alertLevel).toBe(0);
  });
});

describe("예측시장 (실측 2026-10-31)", () => {
  it("한반도 침공 시장을 고르고, 대화·체제 시장은 맥락으로 붙인다", () => {
    const s = summarizePm(parsePmSearch(JSON.parse(fx("polymarket_search_20261031.json"))), NOW);
    expect(s.war?.question).toBe("Will North Korea invade South Korea before 2027?");
    expect(s.war?.yesToken).toMatch(/^1458561818/);
    const [m] = pmMetrics(s);
    expect((m.meta as any).question).toBe("2027년 전 북한의 한국 침공");
    expect((m.meta as any).diplomacy.map((d: any) => d.question)).toEqual(["연말까지 트럼프 방북", "2026년 트럼프 방북", "연말까지 남북 직접 대화", "2026년 말까지 남북 외교 접촉(직·간접)"]);
    expect(m.indicator).toBe("market.pm_war_prob");
    expect(m.value).toBe(100); // 가격 이력 없이는 평소와 같다고 본다
    const meta = m.meta as any;
    expect(meta.pricePct).toBeCloseTo(4.35, 2);
    expect(meta.noHistory).toBe(true);
    expect(meta.daysLeft).toBe(62);
    expect(meta.regimeChangePct).toBeCloseTo(3.65, 2);
    expect(meta.testsThisMonthPct).toBeCloseTo(85, 0);
    expect(meta.diplomacy.length).toBeGreaterThan(0);
    expect(meta.url).toMatch(/^https:\/\/polymarket\.com\/event\//);
  });
  it("가격 이력: 10월 한 달 평소 2.83% → 최근 3일 가운데 값 4.05% = 평소의 1.43배 → 아직 '정상'(1.5배부터 상승)", () => {
    const s = summarizePm(parsePmSearch(JSON.parse(fx("polymarket_search_20261031.json"))), NOW);
    const hist = parsePmHistory(JSON.parse(fx("polymarket_history_665459_20261031.json")), NOW)!;
    expect(hist.usualPct).toBeCloseTo(2.83, 2);
    expect(hist.series.at(-1)).toEqual({ date: "10-30", pct: 5.1 });
    expect(hist.recentPct).toBe(4.05); // 10/28 4.05 · 10/29 3.7 · 10/30 5.1 의 가운데 값
    const [m] = pmMetrics(s, hist);
    expect(m.value).toBe(143);
    expect(evaluate(INDICATOR_BY_ID["market.pm_war_prob"], m.value, NOW, undefined).state).toBe("normal");
    // 큰 거래 한 건(5.1% → 1.4%)이 와도 가운데 값이라 지표가 뒤집히지 않는다
    const crash = parsePmHistory({ history: [...JSON.parse(fx("polymarket_history_665459_20261031.json")).history, { t: 1793412000, p: 0.014 }] }, Date.UTC(2026, 9, 31, 3))!;
    expect(crash.recentPct).toBe(3.7);
  });
  it("전쟁 시장이 없으면 지표를 만들지 않는다", () => {
    expect(pmMetrics(summarizePm([{ id: "1", question: "Will Bitcoin kimchi premium hit 8%?", yes: 0.1, volume: 9999 }], NOW))).toEqual([]);
  });
});

describe("위키백과 관심 (실측 9/22~10/20)", () => {
  const raw = JSON.parse(fx("wiki_pageviews_20261020.json")) as Record<string, any>;
  const ratiosAt = (lastDay: string) =>
    Object.entries(raw).map(([k, v]) => {
      const s = parseWikiSeries(v);
      for (const d of [...s.keys()]) if (d > lastDay) s.delete(d);
      return articleRatio(k, s);
    }).filter((x): x is NonNullable<typeof x> => !!x);
  it("10/20: 여러 문서가 함께 늘어 '이상' (김정은 문서 64배)", () => {
    const s = summarizeWiki("20261020", ratiosAt("20261020"))!;
    expect(s.articles[0].article).toBe("en:Kim_Jong_Un");
    expect(s.articles[0].ratio).toBeGreaterThan(50);
    const [m] = wikiMetrics(s);
    expect(m.value).toBeGreaterThanOrEqual(250);
    expect(evaluate(INDICATOR_BY_ID["psych.wiki_korea_attention"], m.value, NOW, undefined).state).toBe("anomalous");
  });
  it("10/14: 평소 수준", () => {
    const [m] = wikiMetrics(summarizeWiki("20261014", ratiosAt("20261014"))!);
    expect(m.value).toBeLessThan(130);
    expect(evaluate(INDICATOR_BY_ID["psych.wiki_korea_attention"], m.value, NOW, undefined).state).toBe("normal");
  });
});

describe("네이버 검색 불안 (요청 형식 — 공식 문서 기준)", () => {
  it("요청: NAVER API HUB 주소·헤더(공식 문서 2026-09), 어제까지 36일, 일 단위, 4개 묶음", () => {
    const { url, init } = naverRequest("id", "sec", NOW);
    expect(url).toBe("https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
    expect((init.headers as any)["X-NCP-APIGW-API-KEY-ID"]).toBe("id");
    expect((init.headers as any)["X-NCP-APIGW-API-KEY"]).toBe("sec");
    const classic = naverRequest("id", "sec", NOW, "classic");
    expect(classic.url).toBe("https://openapi.naver.com/v1/datalab/search");
    expect((classic.init.headers as any)["X-Naver-Client-Id"]).toBe("id");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ timeUnit: "date", endDate: "2026-10-30" });
    expect(body.keywordGroups.length).toBe(4);
  });
  it("'대피' 묶음이 평소의 5배 → 불안 지표 '이상', 북한 도발 묶음은 불안 값에서 뺀다", () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const series = (base: number, last: number) => days.map((d, i) => ({ period: d, ratio: i === days.length - 1 ? last : base }));
    const json = { results: [
      { title: "전쟁 불안", data: series(10, 12) }, { title: "대피", data: series(4, 20) }, { title: "생존 준비", data: series(2, 2) }, { title: "북한 도발", data: series(5, 100) },
    ] };
    const [m] = naverMetrics(naverRatios(json));
    expect(m.value).toBe(500);
    expect((m.meta as any).worstGroup).toBe("대피");
    expect(evaluate(INDICATOR_BY_ID["psych.naver_war_search"], m.value, NOW, undefined).state).toBe("anomalous");
  });
});

describe("증시: 전 거래일 종가 고르기 (일봉이 늦게 들어와도 이틀 치 변동이 되지 않게)", () => {
  const day = (d: number, h = 6) => Date.UTC(2026, 9, d, h) / 1000; // 15:00 KST 무렵
  const resp = (ts: number[], closes: number[], price: number, at: number) => ({ symbol: "^KS11", response: [{ meta: { regularMarketPrice: price, regularMarketTime: at, gmtoffset: 32400 }, timestamp: ts, indicators: { quote: [{ close: closes }] } }] });
  it("당일 봉이 있으면 그 전날 종가와 비교", () => {
    const [m] = parseSpark({ spark: { result: [resp([day(28), day(29), day(30)], [100, 104, 100.4], 100.4, day(30))] } });
    expect(m.changePct).toBeCloseTo(-3.46, 1);
  });
  it("당일 봉이 아직 없어도 마지막 시세 날짜보다 앞선 마지막 봉(전날)과 비교", () => {
    const [m] = parseSpark({ spark: { result: [resp([day(28), day(29)], [100, 104], 100.4, day(30))] } });
    expect(m.changePct).toBeCloseTo(-3.46, 1); // 뒤에서 두 번째(28일)와 비교했다면 +0.4% 로 틀렸을 것
  });
});

describe("증시: 한국만의 하락·방산주 (형식 예시 — 배포 후 실측 확인)", () => {
  const spark = (sym: string, prev: number, last: number) => ({ symbol: sym, response: [{ meta: { regularMarketPrice: last, regularMarketTime: 1793400000 }, indicators: { quote: [{ close: [prev * 0.99, prev, last] }] } }] });
  it("코스피 −4%, 일본·대만 −0.5% → 한국만 −3.5%p (상승), 방산 +6% → 방산 상대 +10%p (이상)", () => {
    const moves = parseSpark({ spark: { result: [spark("^KS11", 100, 96), spark("^N225", 100, 99.5), spark("^TWII", 100, 99.5), spark("012450.KS", 100, 106), spark("079550.KS", 100, 106), spark("064350.KS", 100, 106), spark("EWY", 100, 95)] } });
    const ms = equityMetrics(moves);
    const rel = ms.find((m) => m.indicator === "market.kr_equity_rel_pct")!;
    const def = ms.find((m) => m.indicator === "market.defense_rel_pct")!;
    expect(rel.value).toBeCloseTo(-3.5, 1);
    expect(def.value).toBeCloseTo(10, 1);
    expect(evaluate(INDICATOR_BY_ID["market.kr_equity_rel_pct"], rel.value, NOW, undefined).state).toBe("elevated");
    expect(evaluate(INDICATOR_BY_ID["market.defense_rel_pct"], def.value, NOW, undefined).state).toBe("anomalous");
  });
});

describe("한반도 '전쟁' 언급 보도", () => {
  it("한반도 문맥의 전쟁·교전만 세고, 6·25 기념·다른 나라 전쟁·무역전쟁은 뺀다", () => {
    expect(isWarTalk("北 김여정 \"전쟁 불사\"…남북 긴장 고조")).toBe(true);
    expect(isWarTalk("서해 NLL 인근 남북 교전 가능성 제기")).toBe(true);
    expect(isWarTalk("6·25전쟁 참전용사 유해 귀환")).toBe(false);
    expect(isWarTalk("러시아 파병 북한군, 우크라 전쟁 투입")).toBe(false);
    expect(isWarTalk("미중 무역전쟁 격화")).toBe(false);
    const ms = newsMetrics([{ title: "北 김여정 \"전쟁 불사\"…남북 긴장 고조", pubDate: NOW - 3600_000 }, { title: "6·25전쟁 참전용사 유해 귀환", pubDate: NOW - 3600_000 }], NOW, "rss_breaking");
    expect(ms.find((m) => m.indicator === "media.war_talk_24h")!.value).toBe(1);
  });
});
