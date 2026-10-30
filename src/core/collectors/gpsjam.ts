// GPSJam 일간 데이터 — 항공기 ADS-B 항법 정확도 저하로 본 GPS 교란 지도 (H3 해상도 4 셀, 전일 기준, 약 1일 지연)
import type { CollectResult, Metric, Signal } from "../types.js";
import { fetchText } from "../util.js";
import { H3_CELLS } from "../h3cells.js";

export interface GpsjamSummary {
  date: string;
  regions: Record<"korea" | "north" | "south" | "westsea", { good: number; bad: number; cells: number; badRatioPct: number }>;
}

export function parseGpsjamCsv(csv: string, date: string): GpsjamSummary {
  const regions = {} as GpsjamSummary["regions"];
  for (const k of ["korea", "north", "south", "westsea"] as const) regions[k] = { good: 0, bad: 0, cells: 0, badRatioPct: 0 };
  for (const line of csv.split("\n")) {
    const c1 = line.indexOf(",");
    if (c1 < 0) continue;
    const hex = line.slice(0, c1);
    if (hex === "hex") continue;
    const c2 = line.indexOf(",", c1 + 1);
    const good = Number(line.slice(c1 + 1, c2));
    const bad = Number(line.slice(c2 + 1));
    if (!Number.isFinite(good) || !Number.isFinite(bad)) continue;
    for (const k of ["korea", "north", "south", "westsea"] as const) {
      if (!H3_CELLS[k].has(hex)) continue;
      regions[k].good += good;
      regions[k].bad += bad;
      regions[k].cells++;
    }
  }
  for (const r of Object.values(regions)) r.badRatioPct = r.good + r.bad ? +((r.bad / (r.good + r.bad)) * 100).toFixed(2) : 0;
  return { date, regions };
}

/** 전일(UTC) 날짜 문자열 */
export function yesterdayUtc(now: number): string {
  return new Date(now - 86400_000).toISOString().slice(0, 10);
}

export async function fetchGpsjam(date: string): Promise<string> {
  // 서버가 gzip 으로 보내며 fetch 가 자동 해제한다
  return fetchText(`https://gpsjam.org/data/${date}-h3_4.csv`, {}, 30000);
}

export function gpsjamSignals(s: GpsjamSummary, now: number): { signals: Signal[]; metrics: Metric[] } {
  const metrics: Metric[] = (["korea", "westsea", "north"] as const).map((k) => ({
    indicator: `gnss.bad_ratio_${k}`,
    value: s.regions[k].badRatioPct,
    meta: { date: s.date, good: s.regions[k].good, bad: s.regions[k].bad, cells: s.regions[k].cells, note: "전일 데이터(약 1일 지연)" },
  }));
  const signals: Signal[] = [];
  const worst = (["westsea", "south", "north"] as const).map((k) => [k, s.regions[k].badRatioPct] as const).sort((a, b) => b[1] - a[1])[0];
  if (worst[1] >= 5 && s.regions[worst[0]].good + s.regions[worst[0]].bad >= 200) {
    const label = { westsea: "서해", south: "남한", north: "북한 상공" }[worst[0]];
    signals.push({
      id: `gpsjam:${s.date}:${worst[0]}`,
      source: "gpsjam",
      sourceKind: "sensor",
      category: "gps_interference",
      title: `${label} GPS 교란 비율 ${worst[1]}% (${s.date}, 전일 집계)`,
      summary: `항공기 항법 정확도 저하 ${s.regions[worst[0]].bad}건 / 정상 ${s.regions[worst[0]].good}건 · 약 1일 지연 데이터`,
      url: `https://gpsjam.org/?date=${s.date}&lat=37.5&lon=126.5&z=5`,
      eventTime: Date.parse(`${s.date}T12:00:00Z`),
      publishedTime: Date.parse(`${s.date}T23:59:59Z`) + 3600_000,
      detectedTime: now,
      severity: worst[1] >= 15 ? 50 : 40,
    });
  }
  return { signals, metrics };
}

export async function collectGpsjam(now = Date.now()): Promise<CollectResult> {
  const date = yesterdayUtc(now);
  const csv = await fetchGpsjam(date);
  const s = parseGpsjamCsv(csv, date);
  const { signals, metrics } = gpsjamSignals(s, now);
  return { source: "gpsjam", ok: true, fetchedAt: now, rawCount: s.regions.korea.cells, signals, metrics };
}
