// 징후·경보(I&W) 분석용 MCP 도구. tools.ts 의 registerTools 끝에서 호출된다.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env, Reading } from "../core/types.js";
import type { Store } from "../core/store.js";
import { INDICATORS, INDICATOR_BY_ID, GROUP_LABEL, STATE_LABEL } from "../core/indicators.js";
import { detectPatterns, inChineseMoratorium, inExerciseSeason } from "../core/patterns.js";
import { fetchAircraft, fetchMilitaryNeAsia, describeIsr, AIR_REGIONS } from "../core/collectors/adsb.js";
import { fetchUsdKrw } from "../core/collectors/markets.js";
import { fetchText, fmtKst } from "../core/util.js";
import { parseUsAdvisory, parseUkAdvice, US_TRAVEL_RSS, UK_TRAVEL_ATOM } from "../core/collectors/travel.js";
import { fetchKpOutages } from "../core/collectors/ioda.js";
import { searchPosts, ALARM_QUERIES } from "../core/collectors/bluesky.js";
import { fetchNkHotspots, NK_SITES } from "../core/collectors/firms.js";
import { sampleAis, vesselMetrics, YELLOW_SEA_BOX } from "../core/collectors/ais.js";
import { parseRss, BREAKING_FEEDS } from "../core/collectors/news.js";
import { parseMndList, MND_LIST_URL } from "../core/collectors/koreakr.js";

const out = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ ...out({ ok: false, error: String((e as Error)?.message ?? e) }), isError: true });

export function describeReading(r: Reading | undefined, id: string) {
  const d = INDICATOR_BY_ID[id];
  if (!r) return { id, label: d?.label, state: "측정 전", value: null };
  return {
    id,
    label: d?.label,
    group: d ? GROUP_LABEL[d.group] : undefined,
    value: r.value,
    unit: d?.unit,
    baseline: r.baseline !== undefined ? +r.baseline.toFixed(1) : null,
    z: r.z !== undefined ? +r.z.toFixed(1) : null,
    samples: r.n,
    state: STATE_LABEL[r.state],
    stateCode: r.state,
    at: fmtKst(r.at),
    latency: d?.latency,
    meta: r.meta,
  };
}

export function registerIndicatorTools(server: McpServer, ctx: { env: Env; store: Store }) {
  const { env, store } = ctx;
  const latestReadings = async (): Promise<Record<string, Reading>> => {
    const raw = await store.getKv("readings");
    return raw ? JSON.parse(raw) : {};
  };

  server.registerTool(
    "get_indicator_board",
    {
      title: "징후판 (모든 징후의 현재 상태)",
      description:
        "항공·해상·지진·항행경보·정부공식·북한수사·언론템포·SNS·시장·인터넷·GPS·위성열점 징후를 평소(시간대 기준선)와 비교한 상태를 반환한다. " +
        "각 항목에는 '왜 의미 있는가'와 '주의점'이 붙어 있다. 상태가 '상승/이상'인 항목과 자동 탐지된 패턴을 먼저 본다. " +
        "'학습 중'은 기준선 표본이 아직 부족하다는 뜻이다.",
      inputSchema: { only_abnormal: z.boolean().default(false).describe("true면 상승·이상 상태만") },
    },
    async ({ only_abnormal }) => {
      try {
        const readings = await latestReadings();
        const now = Date.now();
        const rows = INDICATORS.map((d) => ({ ...describeReading(readings[d.id], d.id), why: d.why, caveats: d.caveats, direction: d.direction }))
          .filter((r) => !only_abnormal || r.stateCode === "elevated" || r.stateCode === "anomalous");
        const events = await store.getEvents(now - 7 * 86400_000);
        const patterns = detectPatterns(readings, events, now);
        return out({
          now: fmtKst(now),
          context: { chineseFishingMoratorium: inChineseMoratorium(now), usRokExerciseSeason: inExerciseSeason(now) },
          patterns,
          indicators: rows,
          reading_guide: "state: 정상=기준선 ±2σ 이내, 상승=2~3σ, 이상=3σ 초과 또는 절대 임계값 초과. direction 은 어느 방향이 나쁜 신호인지.",
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_indicator_history",
    {
      title: "징후 시계열",
      description: "특정 징후의 최근 관측값 시계열을 반환한다. 이상이 '언제 시작됐는지', 다른 징후와 '동시에' 움직였는지 대조할 때 쓴다.",
      inputSchema: { indicator: z.string().describe("징후 id (예: air.civil_airborne)"), hours: z.number().int().min(1).max(168).default(24) },
    },
    async ({ indicator, hours }) => {
      const d = INDICATOR_BY_ID[indicator];
      if (!d) return out({ ok: false, error: "알 수 없는 징후 id", available: INDICATORS.map((x) => x.id) });
      const pts = await store.getMetricHistory(indicator, Date.now() - hours * 3600_000);
      // 300개 이하로 다운샘플
      const step = Math.max(1, Math.ceil(pts.length / 300));
      return out({ indicator, label: d.label, unit: d.unit, points: pts.filter((_, i) => i % step === 0).map((p) => ({ at: fmtKst(p.at), value: p.value })) });
    },
  );

  server.registerTool(
    "check_military_aircraft",
    {
      title: "군용기·정찰기 현황 (ADS-B 노출분)",
      description:
        "동북아(위도 28~47°, 경도 117~147°) 상공에서 ADS-B 로 보이는 군용기 목록과, 그중 정찰·조기경보·해상초계·급유기(ISR)를 기종 설명과 함께 반환한다. " +
        "RC-135S 코브라볼·WC-135 등 특정 기체 여부는 등록번호(registration)로 판단한다. 보이지 않는 기체가 훨씬 많다는 점을 잊지 말 것.",
      inputSchema: { isr_only: z.boolean().default(false) },
    },
    async ({ isr_only }) => {
      try {
        const { aircraft } = await fetchMilitaryNeAsia();
        const air = aircraft.filter((a) => !a.onGround);
        const isr = describeIsr(air);
        return out({
          milAirborne: air.length,
          isr,
          all: isr_only ? undefined : air.map((a) => ({ type: a.type, callsign: a.callsign || undefined, registration: a.registration, lat: a.lat && +a.lat.toFixed(2), lon: a.lon && +a.lon.toFixed(2), altitudeFt: a.altitudeFt })),
          knownSpecial: { "WC-135 방사능탐지": ["61-2667", "62-3582", "64-14836"], "RC-135S 코브라볼": ["61-2662", "61-2663", "62-4128"] },
          caveat: "공개 ADS-B 기준. 전술기·대부분의 군용기는 보이지 않는다. 연합훈련 철(3월·8월)에는 평소보다 많다.",
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_travel_advisories",
    {
      title: "미·영 정부 한국 여행경보 원문",
      description: "미 국무부 South Korea 여행경보 단계·제목·날짜와 영국 FCDO 최신 갱신 요약을 반환한다. 단계 변경이나 안보 문구는 '서방 정부가 위험을 인정했다'는 강한 신호다.",
      inputSchema: {},
    },
    async () => {
      const [us, uk] = await Promise.allSettled([fetchText(US_TRAVEL_RSS, {}, 25000).then(parseUsAdvisory), fetchText(UK_TRAVEL_ATOM).then(parseUkAdvice)]);
      return out({
        us: us.status === "fulfilled" ? us.value && { ...us.value, pubDate: fmtKst(us.value.pubDate) } : { error: String(us.reason) },
        uk: uk.status === "fulfilled" ? { ...uk.value, updated: fmtKst(uk.value.updated) } : { error: String(uk.reason) },
        note: "주한미대사관 경보(kr.usembassy.gov)·주한미군 FPCON 은 자동 접근이 차단돼 수집하지 않는다. 필요하면 search_news 로 보도를 찾는다.",
      });
    },
  );

  server.registerTool(
    "check_markets",
    {
      title: "원·달러 환율",
      description: "원·달러 현재가, 전일 종가 대비 변동률, 당일 고·저를 반환한다. 뉴스 없는 시간대의 급변은 시장이 먼저 반응했다는 신호일 수 있다.",
      inputSchema: {},
    },
    async () => {
      try {
        const fx = await fetchUsdKrw();
        return out({ ...fx, changePct: +fx.changePct.toFixed(2), at: fmtKst(fx.at), caveat: "금리·달러 요인이 대부분. 다른 징후와 함께 볼 것." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_internet_outages",
    {
      title: "북한 인터넷 장애 (IODA)",
      description: "최근 북한(KP) 국가 단위 인터넷 장애 경보 목록(시각·데이터원·수준)을 반환한다.",
      inputSchema: { hours: z.number().int().min(1).max(168).default(48) },
    },
    async ({ hours }) => {
      try {
        const alerts = await fetchKpOutages(Date.now(), hours);
        return out({ count: alerts.length, alerts: alerts.slice(0, 30).map((a) => ({ ...a, time: fmtKst(a.time) })), caveat: "북한 인터넷은 평소에도 불안정하다." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_social_pulse",
    {
      title: "SNS 목격담 검색 (Bluesky)",
      description: "임의 질의로 Bluesky 최신 게시물을 검색한다. 사이렌·폭발음·전투기 소음 같은 현장 목격담을 찾을 때 쓴다. 표본이 작고 가짜 뉴스가 섞이므로 단독 근거로 쓰지 말 것.",
      inputSchema: { query: z.string().min(2).optional().describe("비우면 기본 경보 키워드 묶음"), hours: z.number().int().min(1).max(48).default(3) },
    },
    async ({ query, hours }) => {
      try {
        const qs = query ? [query] : ALARM_QUERIES;
        const results = await Promise.allSettled(qs.map((q) => searchPosts(q, 30)));
        const since = Date.now() - hours * 3600_000;
        const posts = results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((p) => p.createdAt >= since);
        const uniq = [...new Map(posts.map((p) => [p.uri, p])).values()].sort((a, b) => b.createdAt - a.createdAt);
        return out({ queries: qs, count: uniq.length, posts: uniq.slice(0, 25).map((p) => ({ at: fmtKst(p.createdAt), author: p.author, text: p.text })), failed: results.filter((r) => r.status === "rejected").length });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_state_media",
    {
      title: "북한 담화·관영매체 보도 (연합뉴스 북한 섹션)",
      description: "최근 북한 담화·성명·관영매체 보도 제목을 시간순으로 반환하고 적대 수사 핵심어를 표시한다. 도발 전 '명분 쌓기' 단계인지 판단할 때 쓴다.",
      inputSchema: { hours: z.number().int().min(1).max(168).default(48) },
    },
    async ({ hours }) => {
      try {
        const xml = await fetchText(BREAKING_FEEDS[1]);
        const since = Date.now() - hours * 3600_000;
        const items = parseRss(xml).filter((i) => (i.pubDate ?? 0) >= since);
        const re = /담화|성명|대변인|경고|위협|비난|규탄|핵|선제|보복|초토화|전쟁|적대|응징|격멸/;
        return out({
          count: items.length,
          items: items.map((i) => ({ at: fmtKst(i.pubDate), title: i.title, hostileTerms: i.title.match(re) ? [...new Set(i.title.match(new RegExp(re.source, "g")) ?? [])] : [], url: i.link })),
          caveat: "조선중앙통신 원문은 접근 불가. 연합뉴스 북한 섹션 보도 기준.",
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_mnd_press",
    {
      title: "국방부 보도자료 목록 (정책브리핑)",
      description: "korea.kr 에 게재된 국방부 보도자료 제목·날짜 목록(최신 20건). 정부 공식 확인·훈련 일정·북한 도발 관련 발표를 찾을 때 쓴다.",
      inputSchema: {},
    },
    async () => {
      try {
        const items = parseMndList(await fetchText(MND_LIST_URL, {}, 25000));
        return out({ count: items.length, items: items.map((i) => ({ date: i.date ? fmtKst(i.date).slice(0, 10) : "-", dept: i.dept, title: i.title, url: i.url })) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_thermal_anomalies",
    {
      title: "위성 열 이상 (NASA FIRMS, 북한 영역)",
      description: "최근 24~72시간 북한 영역 위성 열점과 알려진 발사장·시험장 12km 이내 열점을 반환한다. FIRMS_MAP_KEY 가 있어야 동작한다.",
      inputSchema: { days: z.number().int().min(1).max(3).default(1) },
    },
    async ({ days }) => {
      if (!env.FIRMS_MAP_KEY) return out({ ok: false, error: "FIRMS_MAP_KEY 미설정 — https://firms.modaps.eosdis.nasa.gov/api/map_key/ 에서 무료 발급 후 GitHub Secrets 에 등록", sites: NK_SITES });
      try {
        const hot = await fetchNkHotspots(env.FIRMS_MAP_KEY, days);
        const near = hot.filter((h) => h.nearSite);
        return out({ total: hot.length, nearSites: near.map((h) => ({ site: h.nearSite!.name, km: h.nearSite!.km, at: fmtKst(h.acqTime), frp: h.frp, night: h.daynight === "N", confidence: h.confidence })), caveat: "농업 소각·산불이 대부분. 야간(night) 고출력(frp) 열점이 더 의미 있다." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_yellow_sea_vessels",
    {
      title: "서해 선박 현황 (AIS)",
      description: "서해(위도 34~39.5°, 경도 122~126.5°) AIS 선박을 25초간 표본 수집해 국적별(중국·한국·북한·기타) 수를 반환한다. AISSTREAM_API_KEY 필요. 중국 휴어기(5/1~8/16) 여부도 함께 준다.",
      inputSchema: {},
    },
    async () => {
      if (!env.AISSTREAM_API_KEY) return out({ ok: false, error: "AISSTREAM_API_KEY 미설정 — https://aisstream.io 무료 가입 후 GitHub Secrets 에 등록" });
      try {
        const sample = await sampleAis(env.AISSTREAM_API_KEY, YELLOW_SEA_BOX);
        const readings = await latestReadings();
        return out({ metrics: vesselMetrics(sample), baseline: describeReading(readings["sea.ys_china_vessels"], "sea.ys_china_vessels"), chineseMoratorium: inChineseMoratorium(Date.now()) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_airspace_detail",
    {
      title: "특정 영역 항공기 상세",
      description: "지정 영역의 공중 항공기 목록(기종·콜사인·고도)을 반환한다. 민항기 급감이 진짜인지(수신기 장애·기상)와 군용기 비중을 확인할 때 쓴다. region: korea, seoul_metro, dmz, yellow_sea_nll, east_sea, north_korea",
      inputSchema: { region: z.enum(["korea", "seoul_metro", "dmz", "yellow_sea_nll", "east_sea", "north_korea"]).default("korea") },
    },
    async ({ region }) => {
      try {
        const { now, aircraft } = await fetchAircraft(AIR_REGIONS[region]);
        const air = aircraft.filter((a) => !a.onGround);
        return out({ region, dataTime: fmtKst(now), airborne: air.length, military: air.filter((a) => a.military).length, aircraft: air.slice(0, 80).map((a) => ({ type: a.type, callsign: a.callsign || undefined, registration: a.registration, altitudeFt: a.altitudeFt, military: a.military || undefined, squawk: a.squawk })) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "record_assessment",
    {
      title: "구조화된 분석 기록 (대시보드 '클로드 분석')",
      description:
        "경쟁가설분석(ACH) 형식으로 판단을 기록한다. 대시보드에 그대로 표시되므로 사실과 해석을 구분하고, 각 가설에 찬성·반대 근거와 다음 확인 사항을 적는다. " +
        "overall_level: 1 평시, 2 주의, 3 경계, 4 심각, 5 위급. 단일 징후로 3 이상을 주지 말 것.",
      inputSchema: {
        overall_level: z.number().int().min(1).max(5),
        overall: z.string().max(300).describe("한 줄 종합 판단"),
        hypotheses: z.array(z.object({
          hypothesis: z.string().max(200),
          likelihood: z.enum(["low", "medium", "high"]),
          evidence_for: z.array(z.string().max(200)).max(6),
          evidence_against: z.array(z.string().max(200)).max(6),
          next_checks: z.array(z.string().max(200)).max(4),
        })).max(5),
        anomalies: z.array(z.string().max(200)).max(8).describe("이번에 새로 눈에 띈 이상·조합"),
        gaps: z.array(z.string().max(200)).max(6).describe("감시 공백·측정 불가 소스"),
      },
    },
    async (a) => {
      const text = [
        `[종합] ${a.overall_level}단계 — ${a.overall}`,
        ...a.hypotheses.map((h) => `[가설·${h.likelihood}] ${h.hypothesis}\n  찬성: ${h.evidence_for.join(" / ") || "-"}\n  반대: ${h.evidence_against.join(" / ") || "-"}\n  확인: ${h.next_checks.join(" / ") || "-"}`),
        a.anomalies.length ? `[이상] ${a.anomalies.join(" / ")}` : "",
        a.gaps.length ? `[감시 공백] ${a.gaps.join(" / ")}` : "",
      ].filter(Boolean).join("\n");
      await store.addNote({ at: Date.now(), author: "claude-agent", text, kind: "assessment", data: a });
      return out({ ok: true });
    },
  );
}
