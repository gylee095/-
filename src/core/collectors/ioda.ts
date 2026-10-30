// IODA (Georgia Tech Internet Intelligence Lab) — 국가 단위 인터넷 장애 경보. 키 불필요.
// 북한(KP) 외부망 단절은 내부 통제·사이버 공격·정전의 간접 지표다.
import type { CollectResult, Metric, Signal } from "../types.js";
import { fetchJson } from "../util.js";

export interface OutageAlert {
  time: number;
  datasource: string;
  level: string;
  value?: number;
  historyValue?: number;
}

export function parseIodaAlerts(data: any): OutageAlert[] {
  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.[0]) ? data.data[0] : [];
  return rows.map((a) => ({
    time: (a.time ?? 0) * 1000,
    datasource: a.datasource ?? a.fqid ?? "?",
    level: a.level ?? "?",
    value: a.value,
    historyValue: a.historyValue,
  }));
}

export async function fetchKpOutages(now: number, hours = 24): Promise<OutageAlert[]> {
  const from = Math.floor((now - hours * 3600_000) / 1000);
  const until = Math.floor(now / 1000);
  const data = await fetchJson<any>(`https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?entityType=country&entityCode=KP&from=${from}&until=${until}`, {}, 25000);
  return parseIodaAlerts(data);
}

export function iodaSignals(alerts: OutageAlert[], now: number): { signals: Signal[]; metrics: Metric[] } {
  const critical = alerts.filter((a) => /critical/i.test(a.level));
  const latest = [...alerts].sort((a, b) => b.time - a.time)[0];
  const signals: Signal[] = [];
  if (critical.length >= 2) {
    const bucket = Math.floor(now / (6 * 3600_000));
    signals.push({
      id: `ioda:kp:${bucket}`,
      source: "ioda",
      sourceKind: "sensor",
      category: "civil_alert_other",
      title: `북한 인터넷 외부망 장애 경보 ${critical.length}건 (24시간)`,
      summary: `IODA 데이터원: ${[...new Set(alerts.map((a) => a.datasource))].join(", ")}`,
      url: "https://ioda.inetintel.cc.gatech.edu/country/KP",
      eventTime: latest?.time,
      publishedTime: latest?.time,
      detectedTime: now,
      severity: 30,
    });
  }
  return {
    signals,
    metrics: [{ indicator: "internet.kp_outage_alerts_24h", value: alerts.length, meta: { critical: critical.length, latest: latest ? { time: latest.time, datasource: latest.datasource, level: latest.level } : null } }],
  };
}

export async function collectIoda(now = Date.now()): Promise<CollectResult> {
  const alerts = await fetchKpOutages(now);
  const { signals, metrics } = iodaSignals(alerts, now);
  return { source: "ioda", ok: true, fetchedAt: now, rawCount: alerts.length, signals, metrics };
}
