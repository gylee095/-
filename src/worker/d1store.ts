import type { AlertRecord, CrisisEvent, Reading, Signal } from "../core/types.js";
import type { AgentNote, MetricPoint, SourceHealth, Store } from "../core/store.js";
import type { RiskDay, RiskSnapshot } from "../core/history.js";

/** Cloudflare D1 무료 요금제 하루 한도 (UTC 자정에 초기화) */
export const D1_FREE_LIMITS = { read: 5_000_000, written: 100_000 } as const;

export interface D1Usage {
  date: string;
  read: number;
  written: number;
  calls: number;
}

type Meta = { rows_read?: number; rows_written?: number };

export const d1DayKey = (now: number) => `d1:${new Date(now).toISOString().slice(0, 10)}`;

/** D1 '행 읽기' 는 반환한 행이 아니라 훑은 행을 센다 — 인덱스를 타지 않는 조건(OR 등)은 표 전체를 읽는다. */
export class D1Store implements Store {
  /** 이번 호출(크론 1회·요청 1회)에서 쓴 양 — 끝날 때 flushUsage 로 오늘 합계에 더한다 */
  usage = { read: 0, written: 0, queries: 0 };
  constructor(private db: D1Database) {}

  private track(meta: Meta | undefined) {
    this.usage.queries++;
    this.usage.read += meta?.rows_read ?? 0;
    this.usage.written += meta?.rows_written ?? 0;
  }
  private async all<T>(stmt: D1PreparedStatement): Promise<T[]> {
    const r = await stmt.all<T>();
    this.track(r.meta as Meta);
    return r.results;
  }
  private async run(stmt: D1PreparedStatement): Promise<D1Result> {
    const r = await stmt.run();
    this.track(r.meta as Meta);
    return r;
  }
  private async batch(stmts: D1PreparedStatement[]): Promise<D1Result[]> {
    const res = await this.db.batch(stmts);
    for (const r of res) this.track(r.meta as Meta);
    return res;
  }

  async getSignals(since: number): Promise<Signal[]> {
    // 'detected_at >= ? OR event_at >= ?' 는 인덱스를 못 타 표 전체를 읽는다 → 두 인덱스 범위로 나눈다.
    // 둘째 줄은 미리 감지된 미래 시각 신호(예: 발사 예고 항행경보의 시작 시각)를 위한 것이다.
    const rows = await this.all<{ doc: string }>(
      this.db
        .prepare("SELECT doc FROM signals WHERE detected_at >= ?1 UNION ALL SELECT doc FROM signals WHERE event_at >= ?1 AND detected_at < ?1")
        .bind(since),
    );
    return rows.map((x) => JSON.parse(x.doc));
  }

  async getSignalsByIds(ids: string[]): Promise<Signal[]> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return [];
    const stmts: D1PreparedStatement[] = [];
    // D1 은 한 쿼리에 바인딩 100개까지
    for (let i = 0; i < uniq.length; i += 90) {
      const chunk = uniq.slice(i, i + 90);
      stmts.push(this.db.prepare(`SELECT doc FROM signals WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk));
    }
    const res = await this.batch(stmts);
    return res.flatMap((r) => (r.results as { doc: string }[]).map((x) => JSON.parse(x.doc)));
  }

  async putSignals(signals: Signal[]): Promise<number> {
    if (!signals.length) return 0;
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO signals (id, source, detected_at, event_at, doc) VALUES (?, ?, ?, ?, ?)",
    );
    const res = await this.batch(
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
    await this.batch(events.map((e) => stmt.bind(e.id, e.firstDetectedTime, e.alertedTime ?? null, JSON.stringify(e))));
  }

  async getEvents(since: number): Promise<CrisisEvent[]> {
    const rows = await this.all<{ doc: string }>(
      this.db.prepare("SELECT doc FROM events WHERE first_detected_at >= ? ORDER BY first_detected_at DESC LIMIT 500").bind(since),
    );
    return rows.map((x) => JSON.parse(x.doc));
  }

  async logAlert(a: AlertRecord): Promise<void> {
    await this.run(this.db.prepare("INSERT INTO alerts (event_id, sent_at, doc) VALUES (?, ?, ?)").bind(a.eventId, a.sentAt, JSON.stringify(a)));
  }

  async getAlerts(since: number): Promise<AlertRecord[]> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM alerts WHERE sent_at >= ? ORDER BY sent_at").bind(since));
    return rows.map((x) => JSON.parse(x.doc));
  }

  async putHealth(h: SourceHealth[]): Promise<void> {
    if (!h.length) return;
    const stmt = this.db.prepare("INSERT OR REPLACE INTO health (source, doc) VALUES (?, ?)");
    await this.batch(h.map((x) => stmt.bind(x.source, JSON.stringify(x))));
  }

  async getHealth(): Promise<SourceHealth[]> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM health"));
    return rows.map((x) => JSON.parse(x.doc));
  }

  async getKv(k: string): Promise<string | undefined> {
    const rows = await this.all<{ v: string }>(this.db.prepare("SELECT v FROM kv WHERE k = ?").bind(k));
    return rows[0]?.v;
  }

  async setKv(k: string, v: string): Promise<void> {
    await this.run(this.db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").bind(k, v));
  }

  async addNote(n: AgentNote): Promise<void> {
    await this.run(this.db.prepare("INSERT INTO notes (at, doc) VALUES (?, ?)").bind(n.at, JSON.stringify(n)));
  }

  async getNotes(since: number): Promise<AgentNote[]> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM notes WHERE at >= ? ORDER BY at DESC LIMIT 50").bind(since));
    return rows.map((x) => JSON.parse(x.doc));
  }

  async putMetrics(readings: Reading[]): Promise<void> {
    if (!readings.length) return;
    const stmt = this.db.prepare("INSERT OR REPLACE INTO metrics (indicator, at, value, z, state, doc) VALUES (?, ?, ?, ?, ?, ?)");
    await this.batch(readings.map((r) => stmt.bind(r.indicator, r.at, r.value, r.z ?? null, r.state, JSON.stringify(r))));
  }

  async getMetricHistory(indicator: string, since: number): Promise<MetricPoint[]> {
    return this.all<{ at: number; value: number }>(this.db.prepare("SELECT at, value FROM metrics WHERE indicator = ? AND at >= ? ORDER BY at").bind(indicator, since));
  }

  async getMetricHourly(since: number) {
    const rows = await this.all<{ indicator: string; hour: number; avg: number }>(
      this.db
        .prepare("SELECT indicator, (at / 3600000) AS hour, AVG(value) AS avg FROM metrics WHERE at >= ? GROUP BY indicator, hour ORDER BY hour")
        .bind(since),
    );
    return rows.map((x) => ({ ...x, hour: Math.floor(x.hour) }));
  }

  /** 이번 호출의 사용량을 오늘(UTC) 합계에 더하고, 더한 뒤의 합계를 돌려준다 (한 문장 = 1행 읽기·1행 쓰기) */
  async flushUsage(now = Date.now()): Promise<D1Usage | undefined> {
    const { read, written } = this.usage;
    const key = d1DayKey(now);
    const r = await this.db
      .prepare(
        `INSERT INTO kv (k, v) VALUES (?1, json_object('read', ?2, 'written', ?3, 'calls', 1))
         ON CONFLICT(k) DO UPDATE SET v = json_object(
           'read', json_extract(kv.v, '$.read') + ?2,
           'written', json_extract(kv.v, '$.written') + ?3,
           'calls', json_extract(kv.v, '$.calls') + 1)
         RETURNING v`,
      )
      .bind(key, read + 1, written + 1)
      .all<{ v: string }>();
    this.usage = { read: 0, written: 0, queries: 0 };
    const v = r.results[0]?.v;
    return v ? { date: key.slice(3), ...(JSON.parse(v) as Omit<D1Usage, "date">) } : undefined;
  }

  async getRiskDay(day: string): Promise<RiskDay | undefined> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM risk_daily WHERE day = ?").bind(day));
    return rows[0] ? JSON.parse(rows[0].doc) : undefined;
  }
  async putRiskDay(d: RiskDay): Promise<void> {
    await this.run(this.db.prepare("INSERT OR REPLACE INTO risk_daily (day, doc) VALUES (?, ?)").bind(d.day, JSON.stringify(d)));
  }
  async getRiskDays(sinceDay: string): Promise<RiskDay[]> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM risk_daily WHERE day >= ? ORDER BY day").bind(sinceDay));
    return rows.map((x) => JSON.parse(x.doc));
  }
  async putRiskHourly(s: RiskSnapshot): Promise<void> {
    await this.run(this.db.prepare("INSERT OR REPLACE INTO risk_hourly (at, doc) VALUES (?, ?)").bind(Math.floor(s.at / 3600_000) * 3600_000, JSON.stringify(s)));
  }
  async getRiskHourly(since: number): Promise<RiskSnapshot[]> {
    const rows = await this.all<{ doc: string }>(this.db.prepare("SELECT doc FROM risk_hourly WHERE at >= ? ORDER BY at").bind(since));
    return rows.map((x) => JSON.parse(x.doc));
  }

  /** migrations/0003·0004 와 같은 인덱스·표 — 배포 때 마이그레이션이 실패했어도(한도 초과 등) Worker 가 스스로 만든다 (멱등) */
  async ensureSchema(): Promise<boolean> {
    if (await this.getKv("schema:0004")) return false;
    await this.batch([
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_signals_event ON signals(event_at)"),
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_notes_at ON notes(at)"),
      this.db.prepare("CREATE TABLE IF NOT EXISTS risk_daily (day TEXT PRIMARY KEY, doc TEXT NOT NULL)"),
      this.db.prepare("CREATE TABLE IF NOT EXISTS risk_hourly (at INTEGER PRIMARY KEY, doc TEXT NOT NULL)"),
    ]);
    await this.setKv("schema:0004", String(Date.now()));
    return true;
  }

  async prune(olderThan: number): Promise<void> {
    await this.batch([
      this.db.prepare("DELETE FROM signals WHERE detected_at < ?").bind(olderThan),
      this.db.prepare("DELETE FROM events WHERE first_detected_at < ?").bind(olderThan),
      this.db.prepare("DELETE FROM metrics WHERE at < ?").bind(olderThan),
      // 지난 사용량 기록은 40일만 둔다
      this.db.prepare("DELETE FROM kv WHERE k LIKE 'd1:%' AND k < ?").bind(d1DayKey(olderThan - 10 * 86400_000)),
    ]);
  }
}
