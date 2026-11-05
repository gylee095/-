// 저장소 추상화: Cloudflare D1(운영) / JSON 파일(로컬·에이전트) / 메모리(테스트)
import type { AlertRecord, CollectResult, CrisisEvent, Reading, Signal } from "./types.js";
import type { RiskDay, RiskSnapshot } from "./history.js";

export interface SourceHealth {
  source: string;
  ok: boolean;
  error?: string;
  skipped?: string;
  fetchedAt: number;
  rawCount: number;
  signalCount: number;
  /** 마지막으로 성공한 수집 시각 — 실패가 이어질 때 '언제부터 못 받나'를 보여 주려고 (2026-11-02) */
  lastOkAt?: number;
  /** 연속 실패 횟수 (성공하면 0) */
  failCount?: number;
}

export interface AgentNote {
  at: number;
  author: string;
  text: string;
  eventIds?: string[];
  /** assessment: 구조화된 분석(data 에 JSON) · deep_request/deep_report: 심층 분석 요청·보고서 · usage: 사용량 기록 */
  kind?: "note" | "assessment" | "deep_request" | "deep_report" | "usage";
  data?: unknown;
}

export interface MetricPoint {
  at: number;
  value: number;
}

/** 지표 하루 요약 (영구 보관, 2026-11-06) — 원자료는 30일 뒤 지우므로 그 전에 한국 날짜별로 묶어 둔다 */
export interface MetricDay {
  day: string;
  indicator: string;
  n: number;
  avg: number;
  min: number;
  max: number;
  /** 그날 가장 큰 z (평소 대비 얼마나 튀었나) */
  zmax?: number;
}

const DAY = 86400_000;
const KST = 9 * 3600_000;
/** 한국 날짜 'YYYY-MM-DD' */
export const kstDay = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
/** 그 시각이 속한 한국 날짜의 00시 — 지우는 경계를 날짜에 맞춰 하루 요약이 반쪽이 되지 않게 */
export const kstMidnight = (ms: number) => Math.floor((ms + KST) / DAY) * DAY - KST;

export interface Store {
  getSignals(sinceMs: number): Promise<Signal[]>;
  /** 지정한 신호만 (사건 근거 보충용) */
  getSignalsByIds(ids: string[]): Promise<Signal[]>;
  putSignals(signals: Signal[]): Promise<number>; // 새로 추가된 개수
  putEvents(events: CrisisEvent[]): Promise<void>;
  getEvents(sinceMs: number): Promise<CrisisEvent[]>;
  logAlert(a: AlertRecord): Promise<void>;
  getAlerts(sinceMs: number): Promise<AlertRecord[]>;
  putHealth(h: SourceHealth[]): Promise<void>;
  getHealth(): Promise<SourceHealth[]>;
  getKv(k: string): Promise<string | undefined>;
  setKv(k: string, v: string): Promise<void>;
  addNote(n: AgentNote): Promise<void>;
  getNotes(sinceMs: number): Promise<AgentNote[]>;
  putMetrics(readings: Reading[]): Promise<void>;
  getMetricHistory(indicator: string, sinceMs: number): Promise<MetricPoint[]>;
  /** 모든 지표의 시간별 평균 (스파크라인용) */
  getMetricHourly(sinceMs: number): Promise<{ indicator: string; hour: number; avg: number }[]>;
  /** 판정 기록 (영구 보관) — 하루 요약과 시간별 순간 */
  getRiskDay(day: string): Promise<RiskDay | undefined>;
  putRiskDay(d: RiskDay): Promise<void>;
  getRiskDays(sinceDay: string): Promise<RiskDay[]>;
  putRiskHourly(s: RiskSnapshot): Promise<void>;
  getRiskHourly(sinceMs: number): Promise<RiskSnapshot[]>;
  /** 지표 하루 요약 · 지난 사건 (영구 보관, 30일이 지난 것) */
  getMetricDays(indicator: string, sinceDay: string): Promise<MetricDay[]>;
  getArchivedEvents(sinceMs: number, untilMs: number): Promise<CrisisEvent[]>;
}

export function healthOf(r: CollectResult): SourceHealth {
  return { source: r.source, ok: r.ok, error: r.error, skipped: r.skipped, fetchedAt: r.fetchedAt, rawCount: r.rawCount, signalCount: r.signals.length, ...(r.ok ? { lastOkAt: r.fetchedAt } : {}) };
}

interface State {
  signals: Record<string, Signal>;
  events: Record<string, CrisisEvent>;
  alerts: AlertRecord[];
  health: Record<string, SourceHealth>;
  kv: Record<string, string>;
  notes: AgentNote[];
  metrics: Reading[];
  riskDaily: Record<string, RiskDay>;
  riskHourly: Record<string, RiskSnapshot>;
  metricsDaily?: Record<string, MetricDay>;
  eventsArchive?: Record<string, CrisisEvent>;
}

const emptyState = (): State => ({ signals: {}, events: {}, alerts: [], health: {}, kv: {}, notes: [], metrics: [], riskDaily: {}, riskHourly: {} });

export class MemoryStore implements Store {
  protected s: State;
  constructor(initial?: State) {
    this.s = initial ?? emptyState();
  }
  protected async save(): Promise<void> {}
  async getSignals(since: number) {
    return Object.values(this.s.signals).filter((x) => x.detectedTime >= since || (x.eventTime ?? 0) >= since);
  }
  async getSignalsByIds(ids: string[]) {
    return ids.map((id) => this.s.signals[id]).filter((x): x is Signal => !!x);
  }
  async putSignals(signals: Signal[]) {
    let n = 0;
    for (const sig of signals) if (!this.s.signals[sig.id]) {
      // raw 는 용량 절약을 위해 저장하지 않는다
      const { raw: _raw, ...rest } = sig;
      this.s.signals[sig.id] = rest;
      n++;
    }
    await this.save();
    return n;
  }
  async putEvents(events: CrisisEvent[]) {
    for (const e of events) {
      // 최초 알림 시각은 보존
      const prev = this.s.events[e.id];
      this.s.events[e.id] = { ...e, alertedTime: e.alertedTime ?? prev?.alertedTime };
    }
    await this.save();
  }
  async getEvents(since: number) {
    return Object.values(this.s.events).filter((e) => e.firstDetectedTime >= since).sort((a, b) => b.firstDetectedTime - a.firstDetectedTime);
  }
  async logAlert(a: AlertRecord) {
    this.s.alerts.push(a);
    await this.save();
  }
  async getAlerts(since: number) {
    return this.s.alerts.filter((a) => a.sentAt >= since);
  }
  async putHealth(h: SourceHealth[]) {
    for (const x of h) this.s.health[x.source] = x;
    await this.save();
  }
  async getHealth() {
    return Object.values(this.s.health);
  }
  async getKv(k: string) {
    return this.s.kv[k];
  }
  async setKv(k: string, v: string) {
    this.s.kv[k] = v;
    await this.save();
  }
  async addNote(n: AgentNote) {
    this.s.notes.push(n);
    await this.save();
  }
  async getNotes(since: number) {
    return this.s.notes.filter((n) => n.at >= since);
  }
  async putMetrics(readings: Reading[]) {
    this.s.metrics.push(...readings);
    await this.save();
  }
  async getMetricHistory(indicator: string, since: number) {
    return this.s.metrics.filter((m) => m.indicator === indicator && m.at >= since).map((m) => ({ at: m.at, value: m.value }));
  }
  async getMetricHourly(since: number) {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const m of this.s.metrics) {
      if (m.at < since) continue;
      const hour = Math.floor(m.at / 3600_000);
      const k = `${m.indicator}|${hour}`;
      const a = acc.get(k) ?? { sum: 0, n: 0 };
      a.sum += m.value;
      a.n++;
      acc.set(k, a);
    }
    return [...acc.entries()].map(([k, a]) => ({ indicator: k.split("|")[0], hour: Number(k.split("|")[1]), avg: a.sum / a.n }));
  }
  async getRiskDay(day: string) {
    return this.s.riskDaily[day];
  }
  async putRiskDay(d: RiskDay) {
    this.s.riskDaily[d.day] = d;
    await this.save();
  }
  async getRiskDays(sinceDay: string) {
    return Object.values(this.s.riskDaily).filter((d) => d.day >= sinceDay).sort((a, b) => a.day.localeCompare(b.day));
  }
  async putRiskHourly(x: RiskSnapshot) {
    this.s.riskHourly[String(Math.floor(x.at / 3600_000))] = x;
    await this.save();
  }
  async getRiskHourly(since: number) {
    return Object.values(this.s.riskHourly).filter((x) => x.at >= since).sort((a, b) => a.at - b.at);
  }
  async getMetricDays(indicator: string, sinceDay: string) {
    return Object.values(this.s.metricsDaily ?? {}).filter((d) => d.indicator === indicator && d.day >= sinceDay).sort((a, b) => a.day.localeCompare(b.day));
  }
  async getArchivedEvents(since: number, until: number) {
    return Object.values(this.s.eventsArchive ?? {}).filter((e) => e.firstDetectedTime >= since && e.firstDetectedTime < until).sort((a, b) => a.firstDetectedTime - b.firstDetectedTime);
  }
  /** 보존 기간이 지난 데이터 정리 (판정 기록은 지우지 않는다). 지우기 전에 지표 하루 요약과 사건을 영구 기록으로 옮긴다 */
  prune(olderThan: number) {
    const cut = kstMidnight(olderThan);
    const daily = (this.s.metricsDaily ??= {});
    const groups = new Map<string, Reading[]>();
    for (const m of this.s.metrics) if (m.at < cut) { const k = `${kstDay(m.at)}|${m.indicator}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(m); }
    for (const [k, rs] of groups) {
      const [day, indicator] = k.split("|");
      const vs = rs.map((r) => r.value), zs = rs.map((r) => r.z).filter((z): z is number => typeof z === "number");
      daily[k] = { day, indicator, n: vs.length, avg: vs.reduce((a, b) => a + b, 0) / vs.length, min: Math.min(...vs), max: Math.max(...vs), ...(zs.length ? { zmax: Math.max(...zs) } : {}) };
    }
    const arch = (this.s.eventsArchive ??= {});
    for (const [k, v] of Object.entries(this.s.events)) if (v.firstDetectedTime < cut) { arch[k] = v; delete this.s.events[k]; }
    for (const [k, v] of Object.entries(this.s.signals)) if (v.detectedTime < cut) delete this.s.signals[k];
    this.s.metrics = this.s.metrics.filter((m) => m.at >= cut);
  }
}

/** Node 전용 파일 저장소. MCP 서버/CLI가 사용한다. */
export async function openFileStore(path: string): Promise<Store> {
  const fs = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  let state = emptyState();
  try {
    state = { ...emptyState(), ...JSON.parse(await fs.readFile(path, "utf8")) };
  } catch {
    /* 첫 실행 */
  }
  class FileStore extends MemoryStore {
    protected async save() {
      this.prune(Date.now() - 30 * 86400_000);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, JSON.stringify(this.s));
    }
  }
  return new FileStore(state);
}
