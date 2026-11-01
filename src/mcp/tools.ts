// MCP 도구 정의 — 원격 커넥터(Worker /mcp)와 로컬 stdio 서버가 공유한다.
// 에이전트가 상황에 맞게 골라 쓰도록 소스별·파라미터별로 도구를 나눈다.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../core/types.js";
import type { Store } from "../core/store.js";
import { listSources } from "../core/sources.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { sendPush } from "../core/notify.js";
import { classifyText, isKoreaRelevant } from "../core/classify.js";
import { fmtKst, haversineKm, parseDtg, parseKst, parseCompactUtc } from "../core/util.js";
import { fetchQuakes, quakeToSignal, PUNGGYE_RI, type Quake } from "../core/collectors/seismic.js";
import { fetchSafetyMessages } from "../core/collectors/safetydata.js";
import { fetchNgaWarnings } from "../core/collectors/nga.js";
import { fetchAircraft, AIR_REGIONS } from "../core/collectors/adsb.js";
import { registerIndicatorTools, describeReading } from "./tools_indicators.js";
import { registerDeepTools } from "./tools_deep.js";
import { searchGdelt, searchFeeds } from "../core/collectors/news.js";

export interface ToolContext {
  env: Env;
  store: Store;
}

const out = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ ...out({ ok: false, error: String((e as Error)?.message ?? e) }), isError: true });

export function registerTools(server: McpServer, ctx: ToolContext) {
  const { env, store } = ctx;

  server.registerTool(
    "get_situation",
    {
      title: "현재 상황판",
      description:
        "시스템이 지금까지 감지·교차검증한 사건 목록(공식확인/교차확인/미확인, 심각도, 발생·공개·감지·알림·첫보도 시각, 출처), " +
        "종합 관측 수준, 소스 상태, 최근 알림과 분석 노트, 그리고 전쟁 위험 자동 판정(국면·30일 확률·영역별 수준·누가 먼저 움직였나)을 반환한다. 상황 파악을 시작할 때 가장 먼저 호출한다.",
      inputSchema: { hours: z.number().int().min(1).max(720).default(24).describe("조회 기간(시간)") },
    },
    async ({ hours }) => {
      try {
        const st = await buildState(store, Date.now() - hours * 3600_000, env.DISABLED_SOURCES);
        const w = st.warRisk;
        return out({
          now: fmtKst(st.now),
          // 핵심 질문: 전쟁으로 번질 위험이 평소보다 얼마나 높은가 — 분석관의 판단 출발점 (지침 파일이 옛것이어도 여기서 전달된다)
          warRisk: {
            headline: w.headline, phase: w.phase, phaseLabel: w.phaseLabel, reasons: w.phaseReasons,
            clash30dPct: w.clash30d, war30dPct: w.war30d, usualPct: w.usual,
            domains: w.domains.map((d) => ({ domain: d.label, level: d.levelLabel, drivers: d.drivers, measured: `${d.measured}/${d.total}` })),
            firstMover: w.firstMover.text, tripwires: w.tripwires, restraints: w.restraints, blindSpots: w.blindSpots,
          },
          analystDuty:
            "record_assessment 에 war_phase(1~5)·p_clash_30d·p_war_30d(숫자 %)·war_reasoning(일반인 말로, 자동 판정과 같거나 다른 이유)·tripwires 를 반드시 채운다. " +
            "정부나 돈의 반응 없이 3단계 이상 금지. 움직인 영역은 원인(정부 경보 사유·세계 증시·인물 뉴스 등)을 확인한다. 자세한 근거는 get_war_risk. " +
            "도구 목록에 get_war_risk 나 war_* 칸이 안 보이면(세션이 옛 목록을 쓰는 경우) overall 첫 문장에 '전쟁 위험 N단계, 30일 국지 충돌 약 X%, 전면전 Y%'를 적는다. " +
            "사용량 기록은 '해당 항목 도구만' 규칙의 예외로 매번 한다(사용자 요청): 끝나기 직전 get_session(세션 ID 생략)이 있으면 그 usage 와 ccr.id 를, 없으면 Bash 로 " +
            "python3 -c \"import json,glob,os;f=max(glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')),key=os.path.getmtime);u={};s=set()\n" +
            "for l in open(f):\n try:e=json.loads(l)\n except Exception:continue\n m=e.get('message') if isinstance(e.get('message'),dict) else {}\n" +
            " if e.get('type')!='assistant' or 'usage' not in m or m.get('id') in s:continue\n s.add(m.get('id'));x=m['usage']\n" +
            " for k,v in (('input_tokens','input_tokens'),('output_tokens','output_tokens'),('cache_read_tokens','cache_read_input_tokens'),('cache_write_tokens','cache_creation_input_tokens')):u[k]=u.get(k,0)+x.get(v,0)\n" +
            "print(json.dumps(u),os.path.basename(f))\" 로 자기 대화 기록을 합산해 record_usage(kind=scheduled, usage, session_id=파일 이름)로 남긴다. 누적값이어도 서버가 증가분만 더한다.",
          threat: st.threat,
          interpretation: { headline: st.interpretation.headline, narrative: st.interpretation.narrative, hints: st.interpretation.hints.map((h) => ({ kind: h.kind, title: h.title, reasoning: h.reasoning, counter: h.counter, check: h.check })), context: st.interpretation.context },
          posture: st.posture,
          patterns: st.patterns.map((p) => ({ name: p.name, confidence: p.confidence, score: p.score, summary: p.summary, alternatives: p.alternatives, checks: p.checks })),
          abnormalIndicators: st.board.filter((b) => b.reading && (b.reading.state === "elevated" || b.reading.state === "anomalous")).map((b) => describeReading(b.reading, b.id)),
          learningIndicators: st.board.filter((b) => b.reading?.state === "learning").length,
          unavailableIndicators: st.board.filter((b) => !b.reading || b.stateLabel === "측정 불가").map((b) => b.id),
          lastAssessment: st.assessment ? { at: fmtKst(st.assessment.at), text: st.assessment.text } : null,
          // 토큰 절약: 중요한 사건 최대 8건만 상세, 나머지는 한 줄
          events: st.events.filter((e) => e.brief.isProvocation || e.brief.danger.level >= 2).slice(0, 8).map((e) => ({
            id: e.id, status: e.status, severity: e.severity, title: e.title,
            brief: { ...e.brief, at: fmtKst(e.brief.at), latest: e.brief.latest && { ...e.brief.latest, at: fmtKst(e.brief.latest.at) } }, categories: e.categories, sources: e.sources,
            drill: e.drill, retracted: e.retracted,
            times: { event: fmtKst(e.eventTime), published: fmtKst(e.firstPublishedTime), detected: fmtKst(e.firstDetectedTime), alerted: fmtKst(e.alertedTime), firstMedia: fmtKst(e.firstMediaTime) },
            evidence: e.signals.slice(0, 3).map((s: any) => ({ source: s.source, kind: s.sourceKind, title: s.title, url: s.url })),
            moreEvidence: Math.max(0, e.signals.length - 3),
          })),
          otherEvents: st.events.filter((e) => !(e.brief.isProvocation || e.brief.danger.level >= 2)).slice(0, 10).map((e) => `${e.brief.headline} (${e.sources.join(",")})`),
          health: st.health.map((h) => ({ ...h, fetchedAt: fmtKst(h.fetchedAt) })),
          recentAlerts: st.alerts.slice(0, 10).map((a) => ({ at: fmtKst(a.sentAt), title: a.title, ok: a.ok })),
          notes: st.notes.slice(0, 5).map((n) => ({ at: fmtKst(n.at), text: n.text })),
          metrics: st.metrics,
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_emergency_alerts",
    {
      title: "긴급재난문자 조회 (행정안전부, 공식)",
      description:
        "행정안전부 긴급재난문자 원문을 조회한다. 공습·경계경보, 미사일·포격 대피 안내, 오발령 정정 확인에 쓴다. 지연: 발령 후 수 분. " +
        "only_military=true면 군사 관련 문자만, region을 주면 수신지역에 그 문자열이 포함된 것만 반환한다.",
      inputSchema: {
        days: z.number().int().min(1).max(7).default(1),
        only_military: z.boolean().default(true),
        region: z.string().optional().describe("예: 서울, 인천, 강원"),
      },
    },
    async ({ days, only_military, region }) => {
      if (!env.SAFETYDATA_API_KEY) return out({ ok: false, error: "SAFETYDATA_API_KEY 미설정 — 재난안전데이터공유플랫폼 인증키 필요" });
      try {
        const rows = await fetchSafetyMessages(env.SAFETYDATA_API_KEY, Date.now(), days);
        const msgs = rows
          .map((r) => {
            const text = String(r.MSG_CN ?? "");
            const cls = classifyText(text);
            return {
              sentAt: fmtKst(parseKst(String(r.CRT_DT ?? ""))), level: r.EMRG_STEP_NM, type: r.DST_SE_NM, region: r.RCPTN_RGN_NM, text,
              classification: cls ? { category: cls.category, severity: cls.severity, drill: cls.drill, retraction: cls.retraction } : null,
            };
          })
          .filter((m) => (!only_military || m.classification) && (!region || String(m.region ?? "").includes(region)));
        return out({ ok: true, total: rows.length, returned: msgs.length, latency: "발령 후 수 분", messages: msgs.slice(0, 60) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_seismic_activity",
    {
      title: "북한 지역 지진 조회 (USGS + EMSC)",
      description:
        "USGS와 EMSC 두 독립 지진망에서 북한 영역 지진을 조회하고, 풍계리 핵실험장과의 거리·깊이·규모로 핵실험 의심 여부를 평가한다. " +
        "두 기관이 모두 잡으면 교차확인. 지연: 사건 후 10~30분. 원천은 최초 공개 시각을 제공하지 않는다.",
      inputSchema: {
        hours: z.number().int().min(1).max(720).default(24),
        min_magnitude: z.number().min(0).max(9).default(2.5),
      },
    },
    async ({ hours, min_magnitude }) => {
      const now = Date.now();
      const r = await fetchQuakes(now, hours, min_magnitude);
      const fmt = (q: Quake, src: "usgs" | "emsc") => {
        const sig = quakeToSignal(q, src, now);
        return {
          time: fmtKst(q.time), mag: q.mag, depthKm: q.depthKm, place: q.place, type: q.type, url: q.url,
          kmFromPunggyeRi: Math.round(haversineKm(q.lat, q.lon, PUNGGYE_RI.lat, PUNGGYE_RI.lon)),
          assessment: sig ? sig.category : "자연지진 추정(조건 미충족)",
        };
      };
      return out({
        usgs: { ok: r.usgs.ok, error: (r.usgs as any).error, quakes: r.usgs.quakes.map((q) => fmt(q, "usgs")) },
        emsc: { ok: r.emsc.ok, error: (r.emsc as any).error, quakes: r.emsc.quakes.map((q) => fmt(q, "emsc")) },
        criteria: "핵실험 의심 = explosion 태그 또는 (풍계리 50km 이내 & 깊이 10km 이하 & M3.5 이상)",
      });
    },
  );

  server.registerTool(
    "check_navigational_warnings",
    {
      title: "항행경보 조회 (NGA HYDROPAC 등, 공식)",
      description:
        "현재 유효한 항행경보 중 한반도 주변(서해·동해·동중국해·일본 근해) 경보를 반환한다. " +
        "북한 로켓·위성 발사 예고 구역, 사격 훈련 구역, GPS 교란 경보처럼 사건 '이전'에 공개되는 선행 신호를 찾을 때 쓴다.",
      inputSchema: {
        keyword: z.string().optional().describe("본문 필터 (예: ROCKET, GPS, GUNNERY)"),
        korea_only: z.boolean().default(true),
      },
    },
    async ({ keyword, korea_only }) => {
      try {
        const rows = await fetchNgaWarnings();
        const list = rows
          .filter((r) => (!korea_only || isKoreaRelevant(r.text ?? "")) && (!keyword || new RegExp(keyword, "i").test(r.text ?? "")))
          .map((r) => {
            const cls = classifyText(String(r.text ?? "").replace(/CANCEL THIS MSG[^\n]*/gi, ""));
            return {
              ref: `${r.navArea === "P" ? "HYDROPAC" : "NAVAREA " + r.navArea} ${r.msgNumber}/${r.msgYear}`,
              issued: fmtKst(parseDtg(String(r.issueDate ?? ""))), authority: r.authority,
              category: cls?.category ?? null, text: String(r.text ?? "").slice(0, 700),
            };
          });
        return out({ ok: true, activeTotal: rows.length, returned: list.length, warnings: list.slice(0, 40) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_airspace",
    {
      title: "항공기 현황 (adsb.lol ADS-B)",
      description:
        "지정 영역의 실시간 항공기 위치(ADS-B)를 조회해 공중 대수, 군용기, 비상 스쿼크(7500/7600/7700)를 반환한다. " +
        "공역 통제(평소 대비 급감), 군용기 활동, 비상 상황 확인에 쓴다. 한반도는 수신기 커버리지가 제한적이라 단독 근거로 쓰지 말 것. " +
        "region: korea(반경 250해리), seoul_metro, dmz, yellow_sea_nll, east_sea, north_korea",
      inputSchema: {
        region: z.enum(["korea", "seoul_metro", "dmz", "yellow_sea_nll", "east_sea", "north_korea"]).default("korea"),
        list_aircraft: z.boolean().default(false).describe("true면 공중 항공기 목록(최대 60)도 반환"),
      },
    },
    async ({ region, list_aircraft }) => {
      try {
        const { now, aircraft } = await fetchAircraft(AIR_REGIONS[region]);
        const airborne = aircraft.filter((a) => !a.onGround);
        const hourKey = `adsb_lol:baseline:h${new Date(Date.now() + 9 * 3600_000).getUTCHours()}`;
        const baseline = region === "korea" ? await store.getKv(hourKey) : undefined;
        return out({
          ok: true, region, dataTime: fmtKst(now), airborne: airborne.length, onGround: aircraft.length - airborne.length,
          baselineThisHour: baseline ? Math.round(Number(baseline)) : "기준선 없음(korea 영역만 누적)",
          military: airborne.filter((a) => a.military),
          emergencies: aircraft.filter((a) => ["7500", "7600", "7700"].includes(a.squawk ?? "") || a.emergency),
          aircraft: list_aircraft ? airborne.slice(0, 60) : undefined,
          caveat: "ADS-B 공개 수신망 기준. 군용기 다수는 트랜스폰더를 끄므로 '보이지 않음'이 '없음'을 뜻하지 않는다.",
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "search_news",
    {
      title: "뉴스 검색 (연합뉴스·NK News·BBC + GDELT)",
      description:
        "최근 뉴스에서 질의어가 제목에 포함된 기사를 찾는다. 공식·센서 신호를 언론이 보도했는지, 언제 처음 보도했는지 확인할 때 쓴다. " +
        "질의어는 공백으로 구분하며 하나라도 포함되면 일치(예: '미사일 탄도 missile'). 언론 보도는 알림 근거로 단독 사용하지 말 것. " +
        "include_gdelt=true면 전 세계 뉴스(GDELT)도 검색하지만 느리고 자주 제한된다.",
      inputSchema: {
        query: z.string().min(2),
        hours: z.number().int().min(1).max(72).default(6),
        include_gdelt: z.boolean().default(false),
      },
    },
    async ({ query, hours, include_gdelt }) => {
      const since = Date.now() - hours * 3600_000;
      const [feeds, g] = await Promise.all([
        searchFeeds(query, since),
        include_gdelt ? searchGdelt(query, `${hours}h`, 30).then((a) => ({ ok: true as const, a }), (e) => ({ ok: false as const, e: String(e) })) : undefined,
      ]);
      const items = [
        ...feeds.hits.map((i) => ({ via: i.feed, title: i.title, url: i.link, published: i.pubDate })),
        ...(g?.ok ? g.a.map((a) => ({ via: "gdelt:" + a.domain, title: a.title, url: a.url, published: parseCompactUtc(a.seendate ?? "") })) : []),
      ].sort((a, b) => (b.published ?? 0) - (a.published ?? 0));
      const times = items.map((i) => i.published).filter((x): x is number => x !== undefined);
      return out({
        feedErrors: feeds.errors,
        gdelt: g ? (g.ok ? "ok" : g.e) : "미사용",
        earliest: times.length ? fmtKst(Math.min(...times)) : "-",
        articles: items.slice(0, 40).map((i) => ({ ...i, published: fmtKst(i.published) })),
      });
    },
  );

  server.registerTool(
    "run_monitoring_cycle",
    {
      title: "감시 사이클 실행",
      description:
        "전 소스 수집 → 중복 제거 → 다중 출처 교차검증 → 알림 정책 판단 → 아이폰 푸시(dry_run=false일 때)를 한 번 실행한다. " +
        "5분 자동 크론과 같은 로직이며, 발송/억제된 알림과 사유를 반환한다.",
      inputSchema: { dry_run: z.boolean().default(true).describe("true면 판단만 하고 푸시는 보내지 않음") },
    },
    async ({ dry_run }) => {
      try {
        const r = await runCycle(env, store, { dryRun: dry_run });
        return out({ ...r, events: r.events.map((e) => ({ id: e.id, status: e.status, severity: e.severity, title: e.title })) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "send_iphone_alert",
    {
      title: "아이폰 푸시 발송",
      description:
        "에이전트 판단으로 아이폰에 푸시를 보낸다. 여러 출처를 종합해 '새롭고 중요한' 상황일 때만 사용한다. " +
        "제목 앞에 [공식확인]/[교차확인]/[미확인]을 붙이고, 본문에 근거 출처와 시각을 적는다. 같은 dedupe_key는 한 번만 발송된다.",
      inputSchema: {
        title: z.string().max(120),
        body: z.string().max(1000),
        priority: z.number().int().min(1).max(5).default(3).describe("5=긴급(공습경보급), 4=높음, 3=보통"),
        dedupe_key: z.string().min(3).describe("관련 사건 ID 등 재발송 방지 키"),
      },
    },
    async ({ title, body, priority, dedupe_key }) => {
      const key = `agent_push:${dedupe_key}`;
      if (await store.getKv(key)) return out({ ok: true, suppressed: "이미 같은 dedupe_key로 발송됨" });
      const res = await sendPush(env, { title, body, priority, url: env.DASHBOARD_URL });
      const ok = res.some((r) => r.ok);
      if (ok) await store.setKv(key, String(Date.now()));
      await store.logAlert({ eventId: `agent:${dedupe_key}`, sentAt: Date.now(), status: "UNVERIFIED", severity: priority * 20, title, body, channel: res.map((r) => r.channel).join(","), ok });
      return out({ ok, results: res });
    },
  );

  server.registerTool(
    "add_analysis_note",
    {
      title: "분석 노트 기록",
      description: "분석 요약을 대시보드에 남긴다. '[사실] …'(출처로 확인된 것)과 '[해석] …'을 구분해 5줄 이내로 쓴다.",
      inputSchema: { text: z.string().min(1).max(4000), event_ids: z.array(z.string()).optional() },
    },
    async ({ text, event_ids }) => {
      await store.addNote({ at: Date.now(), author: "claude-agent", text, eventIds: event_ids });
      return out({ ok: true });
    },
  );

  server.registerTool(
    "list_data_sources",
    {
      title: "데이터 소스 검증표",
      description: "각 소스의 성격(공식/센서/언론), 접근 권한, 비용, 갱신 주기, 지연 시간, 약관과 최근 수집 상태를 반환한다.",
      inputSchema: {},
    },
    async () => out({ sources: listSources(), disabled: env.DISABLED_SOURCES, health: (await store.getHealth()).filter((h) => !(env.DISABLED_SOURCES ?? "").split(",").includes(h.source)), configured: { safetydata: !!env.SAFETYDATA_API_KEY, push: !!(env.NTFY_TOPIC || env.PUSHOVER_TOKEN) } }),
  );

  registerIndicatorTools(server, ctx);
  registerDeepTools(server, ctx);
}
