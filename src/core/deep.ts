// 심층 분석 — '특이한 날'에만 Claude Code 예약 작업(API 트리거)을 깨워 깊게 조사하게 한다.
//
// 1) 5분마다 지금 상태에서 '특이한 이유'를 뽑는다: 전쟁 위험 3단계 이상, 새로 '경계' 이상이 된 영역,
//    위험도 4 이상 도발, 보통 이상 패턴.
// 2) 이미 조사한 이유(24시간 안)는 다시 깨우지 않는다. 하루 최대 횟수·최소 간격·한 달 사용량 상한을 지킨다.
// 3) 깨울 때 무엇이 이상한지 요약을 함께 보낸다. 깨어난 세션은 조사 후 record_deep_report 로 보고서와
//    자기 사용량(토큰·API 요금 환산)을 남긴다 → 대시보드 '클로드 심층 분석'·'사용량'.
//
// 사용량은 Claude 구독 한도에서 차감된다(별도 결제 아님 — 조직에 추가 사용 크레딧이 켜져 있으면 초과분만 과금).
// 금액은 API 요금으로 환산한 참고치다.
import type { Store } from "./store.js";
import type { WarRisk } from "./warrisk.js";
import type { EventBrief } from "./brief.js";
import type { Pattern } from "./patterns.js";

export interface DeepEnv {
  CLAUDE_ROUTINE_URL?: string;
  CLAUDE_ROUTINE_TOKEN?: string;
  /** 하루(한국 날짜) 최대 자동 실행 수 — 기본 2 */
  DEEP_DAILY_MAX?: string;
  /** 한 달 심층 분석 사용량 상한(API 요금 환산 달러) — 기본 30 */
  DEEP_MONTHLY_BUDGET_USD?: string;
}

export interface DeepReason {
  /** 중복 판단 키 (예: domain:public:2, phase:3, event:<id>) */
  key: string;
  text: string;
}

export interface Usage {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  /** API 요금 환산 (참고치) */
  cost_usd?: number;
}

export interface UsageTotals {
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
}

export interface MonthUsage {
  month: string;
  deep: UsageTotals;
  scheduled: UsageTotals;
}

const H = 3600_000;
const DAY = 24 * H;
const kstDay = (ms: number) => new Date(ms + 9 * H).toISOString().slice(0, 10);
const kstMonth = (ms: number) => new Date(ms + 9 * H).toISOString().slice(0, 7);
const emptyTotals = (): UsageTotals => ({ runs: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0 });

/** 지금 상태에서 '깊게 볼 이유'를 뽑는다 */
export function deepReasons(w: WarRisk, briefs: EventBrief[], patterns: Pattern[], now: number): DeepReason[] {
  const out: DeepReason[] = [];
  if (w.phase >= 3) out.push({ key: `phase:${w.phase}`, text: `전쟁 위험 ${w.phase}단계(${w.phaseLabel})` });
  for (const d of w.domains) if (d.level >= 2) out.push({ key: `domain:${d.id}:${d.level}`, text: `${d.label} '${d.levelLabel}' — ${d.drivers.slice(0, 2).join(" · ") || "근거 확인 필요"}` });
  for (const b of briefs) {
    if (b.danger.level >= 4 && now - b.at < 24 * H && now - b.at >= -H) out.push({ key: `event:${b.at}:${b.headline.slice(0, 40)}`, text: `위험도 ${b.danger.label} 사건: ${b.headline}` });
  }
  for (const p of patterns) if (p.confidence !== "low") out.push({ key: `pattern:${p.id}`, text: `징후 조합: ${p.name} (${p.confidence === "high" ? "높음" : "보통"})` });
  return out;
}

/** 깨울 때 함께 보내는 요약 (세션에서는 '신뢰하지 않는 자료'로 감싸져 전달된다 — 세부는 MCP 로 다시 확인) */
export function deepPayload(id: string, reasons: DeepReason[], w: WarRisk, dashboardUrl?: string): string {
  return [
    `[KEW 심층 분석 요청 ${id}]`,
    `왜 깨웠나:`,
    ...reasons.map((r) => `- ${r.text}`),
    ``,
    `자동 판정: ${w.headline}`,
    `누가 먼저 움직였나: ${w.firstMover.text}`,
    `영역: ${w.domains.map((d) => `${d.label} ${d.levelLabel}`).join(" / ")}`,
    dashboardUrl ? `대시보드: ${dashboardUrl}` : "",
    `세부 자료는 korea-early-warning MCP 의 get_deep_request · get_war_risk · get_situation 으로 확인할 것.`,
  ].filter((x) => x !== "").join("\n");
}

export interface DeepDecision {
  fire: boolean;
  /** 이번에 새로 깊게 볼 이유 */
  fresh: DeepReason[];
  /** 모든 이유 (이미 조사한 것 포함) */
  reasons: DeepReason[];
  skipped?: string;
}

export interface DeepState {
  /** 이유 키 → 마지막으로 조사를 요청한 시각 */
  handled: Record<string, number>;
  lastFiredAt?: number;
  /** 한국 날짜 → 그날 자동 실행 수 */
  daily: Record<string, number>;
}

export function decideDeep(reasons: DeepReason[], st: DeepState, monthCostUsd: number, env: DeepEnv, now: number, opts: { force?: boolean; external?: boolean } = {}): DeepDecision {
  const fresh = reasons.filter((r) => !(st.handled[r.key] && now - st.handled[r.key] < DAY));
  if (!opts.force && !fresh.length) return { fire: false, fresh, reasons, skipped: reasons.length ? "이미 24시간 안에 조사한 이유뿐" : "특이 사항 없음" };
  if (!opts.external && (!env.CLAUDE_ROUTINE_URL || !env.CLAUDE_ROUTINE_TOKEN)) return { fire: false, fresh, reasons, skipped: "CLAUDE_ROUTINE_URL/TOKEN 미설정" };
  const dailyMax = Number(env.DEEP_DAILY_MAX ?? 2);
  const budget = Number(env.DEEP_MONTHLY_BUDGET_USD ?? 30);
  if (!opts.force) {
    if ((st.daily[kstDay(now)] ?? 0) >= dailyMax) return { fire: false, fresh, reasons, skipped: `오늘 자동 실행 ${dailyMax}회 다 씀` };
    if (st.lastFiredAt && now - st.lastFiredAt < 3 * H) return { fire: false, fresh, reasons, skipped: "직전 실행 후 3시간 안" };
  }
  if (monthCostUsd >= budget) return { fire: false, fresh, reasons, skipped: "이번 달 심층 분석 사용량 상한 도달" };
  return { fire: true, fresh, reasons };
}

export async function loadDeepState(store: Store): Promise<DeepState> {
  const raw = await store.getKv("deep:state");
  const st = raw ? (JSON.parse(raw) as DeepState) : { handled: {}, daily: {} };
  st.handled ??= {};
  st.daily ??= {};
  return st;
}

export async function loadMonthUsage(store: Store, now: number): Promise<MonthUsage> {
  const month = kstMonth(now);
  const raw = await store.getKv(`usage:${month}`);
  return raw ? (JSON.parse(raw) as MonthUsage) : { month, deep: emptyTotals(), scheduled: emptyTotals() };
}

/**
 * 실행 1회의 사용량을 이번 달 합계에 더한다.
 * get_session 의 사용량은 세션이 생긴 뒤 누적값이다 — 같은 세션을 계속 쓰는 정기 분석관이 매번 누적값을 넣으면 이중으로 센다.
 * 그래서 sessionId 가 있으면 지난번 기록한 누적값을 빼고 '이번에 늘어난 만큼'만 더한다.
 */
export async function addUsage(store: Store, kind: "deep" | "scheduled", raw: Usage, now: number, sessionId?: string, countRun = true): Promise<MonthUsage> {
  let u = raw;
  if (sessionId) {
    const key = `usage:session:${sessionId}`;
    const prev = JSON.parse((await store.getKv(key)) ?? "null") as Usage | null;
    await store.setKv(key, JSON.stringify(raw));
    if (prev) {
      const d = (k: keyof Usage) => Math.max(0, Number(raw[k] ?? 0) - Number(prev[k] ?? 0));
      u = { model: raw.model, input_tokens: d("input_tokens"), output_tokens: d("output_tokens"), cache_read_tokens: d("cache_read_tokens"), cache_write_tokens: d("cache_write_tokens"), cost_usd: +d("cost_usd").toFixed(4) };
    }
  }
  const m = await loadMonthUsage(store, now);
  const t = m[kind];
  if (countRun) t.runs += 1;
  t.input_tokens += u.input_tokens ?? 0;
  t.output_tokens += u.output_tokens ?? 0;
  t.cache_read_tokens += u.cache_read_tokens ?? 0;
  t.cache_write_tokens += u.cache_write_tokens ?? 0;
  t.cost_usd = +(t.cost_usd + (u.cost_usd ?? 0)).toFixed(4);
  await store.setKv(`usage:${m.month}`, JSON.stringify(m));
  return m;
}

export interface FireResult {
  ok: boolean;
  /** 서버가 아니라 다른 경로(예: Claude 세션의 fire_trigger)로 깨운 경우 */
  external?: boolean;
  status?: number;
  sessionId?: string;
  sessionUrl?: string;
  error?: string;
}

export async function fireRoutine(env: DeepEnv, text: string, fetchImpl: typeof fetch = fetch): Promise<FireResult> {
  try {
    const res = await fetchImpl(env.CLAUDE_ROUTINE_URL!, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CLAUDE_ROUTINE_TOKEN}`, "anthropic-version": "2026-10-21", "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 60000) }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: `${res.status} ${body.slice(0, 200)}${res.headers.get("retry-after") ? ` (retry-after ${res.headers.get("retry-after")})` : ""}` };
    const j = JSON.parse(body) as { claude_code_session_id?: string; claude_code_session_url?: string };
    return { ok: true, status: res.status, sessionId: j.claude_code_session_id, sessionUrl: j.claude_code_session_url };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

export interface DeepRequestNote {
  id: string;
  at: number;
  reasons: DeepReason[];
  fresh: DeepReason[];
  payload: string;
  fire: FireResult;
  manual?: boolean;
}

/** 5분 주기에서 호출: 필요하면 깨우고 기록한다 */
export async function maybeFireDeep(
  store: Store,
  env: DeepEnv,
  input: { warRisk: WarRisk; briefs: EventBrief[]; patterns: Pattern[]; now: number; dashboardUrl?: string },
  opts: { force?: boolean; dryRun?: boolean; manual?: boolean; external?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<{ decision: DeepDecision; request?: DeepRequestNote }> {
  const { warRisk, briefs, patterns, now } = input;
  const reasons = deepReasons(warRisk, briefs, patterns, now);
  const st = await loadDeepState(store);
  const usage = await loadMonthUsage(store, now);
  const decision = decideDeep(reasons, st, usage.deep.cost_usd, env, now, opts);
  if (!decision.fire || opts.dryRun) return { decision };
  const id = `deep-${kstDay(now).replace(/-/g, "")}-${new Date(now + 9 * H).toISOString().slice(11, 16).replace(":", "")}`;
  const why = decision.fresh.length ? decision.fresh : decision.reasons.length ? decision.reasons : [{ key: "manual", text: "수동 요청 — 지금 상황 전반 점검" }];
  const payload = deepPayload(id, why, warRisk, input.dashboardUrl);
  // external: 깨우기는 호출한 쪽이 직접 한다(요청 기록과 '조사함' 표시만)
  const fire: FireResult = opts.external ? { ok: true, external: true } : await fireRoutine(env, payload, opts.fetchImpl);
  const request: DeepRequestNote = { id, at: now, reasons: decision.reasons, fresh: why, payload, fire, manual: opts.manual };
  if (fire.ok) {
    for (const r of decision.reasons) st.handled[r.key] = now;
    st.lastFiredAt = now;
    if (!opts.manual) st.daily[kstDay(now)] = (st.daily[kstDay(now)] ?? 0) + 1;
    // 오래된 기록 정리
    for (const [k, t] of Object.entries(st.handled)) if (now - t > 7 * DAY) delete st.handled[k];
    for (const d of Object.keys(st.daily)) if (d < kstDay(now - 7 * DAY)) delete st.daily[d];
    await store.setKv("deep:state", JSON.stringify(st));
  }
  await store.addNote({ at: now, author: "system", kind: "deep_request", text: `${id} ${fire.ok ? "요청함" : `실패: ${fire.error}`} — ${why.map((r) => r.text).join(" / ")}`, data: request });
  return { decision, request };
}
