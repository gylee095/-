// Korea Early Warning MCP 서버 (stdio).
// Claude Code 같은 에이전트가 수집·교차검증·알림을 '도구'로 호출한다.
//  - KEW_API_URL + KEW_AGENT_TOKEN 이 있으면 배포된 Worker(D1 상태 공유)를 사용
//  - 없으면 로컬 JSON 파일(KEW_DATA, 기본 data/state.json)에 상태 저장
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { COLLECTORS } from "../core/collectors/index.js";
import { listSources, type SourceId } from "../core/sources.js";
import { runCycle } from "../core/pipeline.js";
import { buildState } from "../core/state.js";
import { openFileStore } from "../core/store.js";
import { sendPush } from "../core/notify.js";
import { envFromProcess } from "../core/nodeenv.js";

const env = envFromProcess();
const API = process.env.KEW_API_URL?.replace(/\/$/, "");
const TOKEN = process.env.KEW_AGENT_TOKEN;
const store = API ? null : await openFileStore(process.env.KEW_DATA ?? "data/state.json");

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });

const server = new McpServer({ name: "korea-early-warning", version: "0.1.0" });

server.registerTool(
  "list_sources",
  { description: "데이터 소스 검증표(접근권한·비용·갱신주기·지연시간·약관)와 최근 수집 상태를 반환한다." },
  async () => {
    const health = API ? (await api("/api/state?hours=1")).health : await store!.getHealth();
    return text({ sources: listSources(), health });
  },
);

server.registerTool(
  "fetch_source",
  {
    description:
      "단일 공개 데이터 소스를 지금 직접 조회해 정규화된 신호를 반환한다(저장·알림 없음). 원천 확인·디버깅용. " +
      "source: safetydata(재난문자) | usgs | emsc(지진) | nga_msi(항행경보) | opensky(ADS-B) | gdelt | rss_news",
    inputSchema: { source: z.enum(Object.keys(COLLECTORS) as [SourceId, ...SourceId[]]) },
  },
  async ({ source }) => {
    try {
      const r = await COLLECTORS[source](env, Date.now());
      return text({ ...r, signals: r.signals.map(({ raw: _raw, ...s }) => s) });
    } catch (e) {
      return text({ source, ok: false, error: String(e) });
    }
  },
);

server.registerTool(
  "run_cycle",
  {
    description:
      "감시 사이클 1회 실행: 전 소스 수집 → 중복 제거 → 다중 출처 교차검증 → 알림 정책 판단 → (dry_run이 아니면) 아이폰 푸시. " +
      "결과에 신규 사건, 발송/억제된 알림과 사유, 종합 관측 수준을 포함한다.",
    inputSchema: {
      dry_run: z.boolean().default(false).describe("true면 푸시를 보내지 않고 판단 결과만 반환"),
      sources: z.array(z.string()).optional().describe("특정 소스만 실행"),
    },
  },
  async ({ dry_run, sources }) => {
    if (API) return text(await api("/api/run", { method: "POST", body: JSON.stringify({ dryRun: dry_run, only: sources }) }));
    return text(await runCycle(env, store!, { dryRun: dry_run, only: sources }));
  },
);

server.registerTool(
  "get_state",
  {
    description: "저장된 사건(상태·심각도·출처·4종 시각), 소스 상태, 알림 이력, 에이전트 노트, 뉴스 대비 리드타임 지표를 조회한다.",
    inputSchema: { hours: z.number().int().min(1).max(720).default(24) },
  },
  async ({ hours }) => {
    const st = API ? await api(`/api/state?hours=${hours}`) : await buildState(store!, Date.now() - hours * 3600_000);
    // 에이전트 컨텍스트 절약: 소스 메타는 list_sources 로 분리
    const { sources: _s, ...rest } = st;
    return text(rest);
  },
);

server.registerTool(
  "add_note",
  {
    description: "에이전트의 분석 요약을 대시보드에 기록한다. 사실(출처 확인)과 해석을 구분해서 쓸 것.",
    inputSchema: { text: z.string().min(1).max(4000), event_ids: z.array(z.string()).optional() },
  },
  async ({ text: t, event_ids }) => {
    if (API) return text(await api("/api/notes", { method: "POST", body: JSON.stringify({ text: t, eventIds: event_ids, author: "claude-agent" }) }));
    await store!.addNote({ at: Date.now(), author: "claude-agent", text: t, eventIds: event_ids });
    return text({ ok: true });
  },
);

server.registerTool(
  "send_alert",
  {
    description:
      "에이전트 판단으로 아이폰에 직접 푸시를 보낸다. run_cycle 의 자동 알림과 별개이며, 같은 dedupe_key 로는 한 번만 발송된다. " +
      "여러 출처를 종합해 새로 중요하다고 판단한 경우에만 사용하고, 미확인 정보는 제목에 [미확인]을 붙일 것.",
    inputSchema: {
      title: z.string().max(120),
      body: z.string().max(1000),
      priority: z.number().int().min(1).max(5).default(3),
      dedupe_key: z.string().min(3).describe("사건 ID 등 재발송 방지 키"),
    },
  },
  async ({ title, body, priority, dedupe_key }) => {
    if (API) return text(await api("/api/notify", { method: "POST", body: JSON.stringify({ title, body, priority, dedupeKey: dedupe_key }) }));
    const key = `agent_push:${dedupe_key}`;
    if (await store!.getKv(key)) return text({ ok: true, suppressed: "이미 같은 dedupe_key로 발송됨" });
    const res = await sendPush(env, { title, body, priority, url: env.DASHBOARD_URL });
    if (res.some((r) => r.ok)) await store!.setKv(key, String(Date.now()));
    return text({ ok: res.some((r) => r.ok), results: res });
  },
);

await server.connect(new StdioServerTransport());
