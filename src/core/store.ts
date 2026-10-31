// 저장소 추상화: Cloudflare D1(운영) / JSON 파일(로컬·에이전트) / 메모리(테스트)
import type { AlertRecord, CollectResult, CrisisEvent, Reading, Signal } from "./types.js";

export interface SourceHealth {
  source: string;
  ok: boolean;
  error?: string;
  skipped?: string;
  fetchedAt: number;
  rawCount: number;
  signalCount: number;
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

export interface Store {
  getSignals(sinceMs: number): Promise<Signal[]>;
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
}

export function healthOf(r: CollectResult): SourceHealth {
  return { source: r.source, ok: r.ok, error: r.error, skipped: r.skipped, fetchedAt: r.fetchedAt, rawCount: r.rawCount, signalCount: r.signals.length };
}

interface State {
  signals: Record<string, Signal>;
  events: Record<string, CrisisEvent>;
  alerts: AlertRecord[];
  health: Record<string, SourceHealth>;
  kv: Record<string, string>;
  notes: AgentNote[];
  metrics: Reading[];
}

const emptyState = (): State => ({ signals: {}, events: {}, alerts: [], health: {}, kv: {}, notes: [], metrics: [] });

export class MemoryStore implements Store {
  protected s: State;
  constructor(initial?: State) {
    this.s = initial ?? emptyState();
  }
  protected async save(): Promise<void> {}
  async getSignals(since: number) {
    return Object.values(this.s.signals).filter((x) => x.detectedTime >= since || (x.eventTime ?? 0) >= since);
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
  /** 보존 기간이 지난 데이터 정리 */
  prune(olderThan: number) {
    for (const [k, v] of Object.entries(this.s.signals)) if (v.detectedTime < olderThan) delete this.s.signals[k];
    for (const [k, v] of Object.entries(this.s.events)) if (v.firstDetectedTime < olderThan) delete this.s.events[k];
    this.s.metrics = this.s.metrics.filter((m) => m.at >= olderThan);
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
