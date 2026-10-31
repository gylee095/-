// Global Fishing Watch 4Wings — 위성 AIS 선박 존재(presence)를 서해 한가운데 상자에서 국적별·일별로 집계한다.
// 공개 지상 수신소가 없는 서해 한가운데·북한 수역도 위성으로 보인다. 데이터는 약 5일 늦게 공개된다.
// 판정: '최근 3일 평균 중국 선박 체류시간'을 '그 직전 14일 평균'과 비교 → 급감이면 중국 어선 이탈 힌트.
// 체류시간(선박·시간)은 격자를 더해도 중복이 없어 선박 수보다 안정적인 지표다.
import type { CollectResult, Metric } from "../types.js";
import { fetchText } from "../util.js";

export const GFW_API = "https://gateway.api.globalfishingwatch.org/v3/4wings/report";

/**
 * 서해 한가운데 상자 (경도 122.9~125.6, 위도 34.0~38.6).
 * 중국·한국 항구를 빼야 '항구로 철수'가 감소로 잡힌다 — 산둥반도 끝(122.7°E)·다롄(121.6°E)·한국 서해안(126°E 부근) 제외.
 * 백령·연평 NLL 인근 수역(124.7~125.7°E)은 포함.
 */
export const YELLOW_SEA_OFFSHORE: [number, number][] = [
  [122.9, 34.0], [125.6, 34.0], [125.6, 38.6], [122.9, 38.6], [122.9, 34.0],
];

export interface GfwRow {
  date: string;
  flag: string;
  hours: number;
  vessels?: number;
}

export function gfwRequest(token: string, now: number, days = 21, polygon = YELLOW_SEA_OFFSHORE): { url: string; init: RequestInit } {
  const to = new Date(now).toISOString().slice(0, 10);
  const from = new Date(now - days * 86400_000).toISOString().slice(0, 10);
  const q = new URLSearchParams({
    "spatial-resolution": "LOW",
    "temporal-resolution": "DAILY",
    "group-by": "FLAG",
    "datasets[0]": "public-global-presence:latest",
    "date-range": `${from},${to}`,
    "spatial-aggregation": "true",
    format: "JSON",
  });
  const body = {
    geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [polygon] } }] },
  };
  return {
    url: `${GFW_API}?${q.toString()}`,
    init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) },
  };
}

/** 응답 {entries:[{"public-global-presence:v3.0":[{date, flag, hours, vesselIDs, ...}]}]} → 행 목록 (격자 단위로 와도 날짜·국적별로 합친다) */
export function parseGfwReport(json: any): GfwRow[] {
  const acc = new Map<string, GfwRow>();
  for (const entry of json?.entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    for (const rows of Object.values(entry)) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows as any[]) {
        const date = String(r.date ?? "").slice(0, 10);
        if (!date) continue;
        const flag = String(r.flag ?? "").toUpperCase() || "UNK";
        const key = `${date}|${flag}`;
        const cur = acc.get(key) ?? { date, flag, hours: 0, vessels: 0 };
        cur.hours += Number(r.hours ?? 0);
        cur.vessels = (cur.vessels ?? 0) + Number(r.vesselIDs ?? 0);
        acc.set(key, cur);
      }
    }
  }
  return [...acc.values()].sort((a, b) => a.date.localeCompare(b.date) || a.flag.localeCompare(b.flag));
}

export interface DayTotal {
  date: string;
  CHN: number;
  KOR: number;
  PRK: number;
  other: number;
  total: number;
  cnVessels: number;
}

export interface GfwSummary {
  days: DayTotal[];
  recentDates: string[];
  recentCnHours: number;
  priorCnHours: number;
  /** 음수 = 감소 */
  changePct: number;
  recentShareCn: number;
  priorShareCn: number;
  latestDate?: string;
  /** 처리 미완료로 보고 뺀 날짜 */
  droppedIncomplete: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function summarizeGfw(rows: GfwRow[]): GfwSummary | undefined {
  const byDate = new Map<string, DayTotal>();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { date: r.date, CHN: 0, KOR: 0, PRK: 0, other: 0, total: 0, cnVessels: 0 };
    if (r.flag === "CHN") {
      d.CHN += r.hours;
      d.cnVessels += r.vessels ?? 0;
    } else if (r.flag === "KOR") d.KOR += r.hours;
    else if (r.flag === "PRK") d.PRK += r.hours;
    else d.other += r.hours;
    d.total += r.hours;
    byDate.set(r.date, d);
  }
  let days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 6) return undefined;
  // 가장 최근 날짜들은 처리가 덜 끝났을 수 있다: 전체(모든 국적) 체류시간이 직전 중앙값의 40% 미만이면 미완료로 본다.
  // 중국만 줄어든 경우는 다른 국적이 그대로라 이 조건에 걸리지 않는다.
  const dropped: string[] = [];
  while (days.length > 6) {
    const last = days[days.length - 1];
    const ref = median(days.slice(-15, -1).map((d) => d.total));
    if (ref > 0 && last.total < ref * 0.4) {
      dropped.push(last.date);
      days = days.slice(0, -1);
    } else break;
  }
  const recent = days.slice(-3);
  const prior = days.slice(-17, -3);
  if (prior.length < 3) return undefined;
  const recentCn = mean(recent.map((d) => d.CHN));
  const priorCn = mean(prior.map((d) => d.CHN));
  const share = (ds: DayTotal[]) => {
    const t = ds.reduce((a, d) => a + d.total, 0);
    return t ? ds.reduce((a, d) => a + d.CHN, 0) / t : 0;
  };
  return {
    days,
    recentDates: recent.map((d) => d.date),
    recentCnHours: recentCn,
    priorCnHours: priorCn,
    changePct: priorCn > 0 ? ((recentCn - priorCn) / priorCn) * 100 : 0,
    recentShareCn: share(recent),
    priorShareCn: share(prior),
    latestDate: days[days.length - 1]?.date,
    droppedIncomplete: dropped,
  };
}

export function gfwMetrics(s: GfwSummary, now: number): Metric[] {
  const delayDays = s.latestDate ? Math.round((now - Date.parse(`${s.latestDate}T12:00:00Z`)) / 86400_000) : undefined;
  return [
    {
      indicator: "sea.gfw_cn_change_pct",
      value: +s.changePct.toFixed(1),
      meta: {
        recentDates: s.recentDates,
        recentCnHoursPerDay: Math.round(s.recentCnHours),
        priorCnHoursPerDay: Math.round(s.priorCnHours),
        recentCnVesselsPerDay: Math.round(mean(s.days.slice(-3).map((d) => d.cnVessels))),
        recentShareCnPct: Math.round(s.recentShareCn * 100),
        priorShareCnPct: Math.round(s.priorShareCn * 100),
        latestDataDate: s.latestDate,
        delayDays,
        droppedIncomplete: s.droppedIncomplete,
        series: s.days.slice(-21).map((d) => ({ date: d.date, CHN: Math.round(d.CHN), KOR: Math.round(d.KOR), other: Math.round(d.other + d.PRK) })),
        note: `위성 AIS · 약 ${delayDays ?? 5}일 지연 · 서해 한가운데(항구 제외) 중국 선박 체류시간`,
      },
    },
  ];
}

export async function fetchGfwPresence(token: string, now: number, days = 21): Promise<GfwRow[]> {
  const { url, init } = gfwRequest(token, now, days);
  const txt = await fetchText(url, init, 45000);
  return parseGfwReport(JSON.parse(txt));
}

export async function collectGfw(token: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!token) return { source: "gfw", ok: true, skipped: "GFW_API_TOKEN 미설정 (Global Fishing Watch 무료 토큰)", signals: [], fetchedAt: now, rawCount: 0 };
  const rows = await fetchGfwPresence(token, now);
  const s = summarizeGfw(rows);
  if (!s) return { source: "gfw", ok: false, error: `일별 데이터 부족 (${new Set(rows.map((r) => r.date)).size}일)`, fetchedAt: now, rawCount: rows.length, signals: [] };
  return { source: "gfw", ok: true, fetchedAt: now, rawCount: rows.length, signals: [], metrics: gfwMetrics(s, now) };
}
