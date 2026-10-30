import type { AlertRecord, CrisisEvent, Reading, Signal } from "../core/types.js";
import type { AgentNote, MetricPoint, SourceHealth, Store } from "../core/store.js";

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async getSignals(since: number): Promise<Signal[]> {
    const r = await this.db
      .prepare("SELECT doc FROM signals WHERE detected_at >= ?1 OR event_at >= ?1")
      .bind(since)
      .all<{ doc: string }>();
    return r.results.map((x) => JSON.parse(x.doc));
  }

  async putSignals(signals: Signal[]): Promise<number> {
    if (!signals.length) return 0;
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO signals (id, source, detected_at, event_at, doc) VALUES (?, ?, ?, ?, ?)",
    );
    const res = await this.db.batch(
      signals.map(({ raw: _raw, ...s }) => stmt.bind(s.id, s.source, s.detectedTime, s.eventTime ?? null, JSON.stringify(s))),
    );
    return res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }

  async putEvents(events: CrisisEvent[]): Promise<void> {
    if (!events.length) return;
    // 최초 알림 시각은 덮어쓰지 않는다
    const stmt = this.db.prepare(
      `INSERT INTO events (id, first_detected_at, alerted_at, doc) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         alerted_at = COALESCE(events.alerted_at, excluded.alerted_at),
         doc = json_set(excluded.doc, '$.alertedTime', COALESCE(events.alerted_at, excluded.alerted_at))`,
    );
    await this.db.batch(events.map((e) => stmt.bind(e.id, e.firstDetectedTime, e.alertedTime ?? null, JSON.stringify(e))));
  }

  async getEvents(since: number): Promise<CrisisEvent[]> {
    const r = await this.db
      .prepare("SELECT doc FROM events WHERE first_detected_at >= ? ORDER BY first_detected_at DESC LIMIT 500")
      .bind(since)
      .all<{ doc: string }>();
    return r.results.map((x) => JSON.parse(x.doc));
  }

  async logAlert(a: AlertRecord): Promise<void> {
    await this.db.prepare("INSERT INTO alerts (event_id, sent_at, doc) VALUES (?, ?, ?)").bind(a.eventId, a.sentAt, JSON.stringify(a)).run();
  }

  async getAlerts(since: number): Promise<AlertRecord[]> {
    const r = await this.db.prepare("SELECT doc FROM alerts WHERE sent_at >= ? ORDER BY sent_at").bind(since).all<{ doc: string }>();
    return r.results.map((x) => JSON.parse(x.doc));
  }

  async putHealth(h: SourceHealth[]): Promise<void> {
    if (!h.length) return;
    const stmt = this.db.prepare("INSERT OR REPLACE INTO health (source, doc) VALUES (?, ?)");
    await this.db.batch(h.map((x) => stmt.bind(x.source, JSON.stringify(x))));
  }

  async getHealth(): Promise<SourceHealth[]> {
    const r = await this.db.prepare("SELECT doc FROM health").all<{ doc: string }>();
    return r.results.map((x) => JSON.parse(x.doc));
  }

  async getKv(k: string): Promise<string | undefined> {
    const r = await this.db.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first<{ v: string }>();
    return r?.v;
  }

  async setKv(k: string, v: string): Promise<void> {
    await this.db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").bind(k, v).run();
  }

  async addNote(n: AgentNote): Promise<void> {
    await this.db.prepare("INSERT INTO notes (at, doc) VALUES (?, ?)").bind(n.at, JSON.stringify(n)).run();
  }

  async getNotes(since: number): Promise<AgentNote[]> {
    const r = await this.db.prepare("SELECT doc FROM notes WHERE at >= ? ORDER BY at DESC LIMIT 50").bind(since).all<{ doc: string }>();
    return r.results.map((x) => JSON.parse(x.doc));
  }

  async putMetrics(readings: Reading[]): Promise<void> {
    if (!readings.length) return;
    const stmt = this.db.prepare("INSERT OR REPLACE INTO metrics (indicator, at, value, z, state, doc) VALUES (?, ?, ?, ?, ?, ?)");
    await this.db.batch(readings.map((r) => stmt.bind(r.indicator, r.at, r.value, r.z ?? null, r.state, JSON.stringify(r))));
  }

  async getMetricHistory(indicator: string, since: number): Promise<MetricPoint[]> {
    const r = await this.db.prepare("SELECT at, value FROM metrics WHERE indicator = ? AND at >= ? ORDER BY at").bind(indicator, since).all<{ at: number; value: number }>();
    return r.results;
  }

  async getMetricHourly(since: number) {
    const r = await this.db
      .prepare("SELECT indicator, (at / 3600000) AS hour, AVG(value) AS avg FROM metrics WHERE at >= ? GROUP BY indicator, hour ORDER BY hour")
      .bind(since)
      .all<{ indicator: string; hour: number; avg: number }>();
    return r.results.map((x) => ({ ...x, hour: Math.floor(x.hour) }));
  }

  async prune(olderThan: number): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM signals WHERE detected_at < ?").bind(olderThan),
      this.db.prepare("DELETE FROM events WHERE first_detected_at < ?").bind(olderThan),
      this.db.prepare("DELETE FROM metrics WHERE at < ?").bind(olderThan),
    ]);
  }
}
