// 경량 유틸리티: HTTP, 해시, 거리, 시각 파싱. Workers와 Node 양쪽에서 동작해야 한다.

export const USER_AGENT = "KoreaEarlyWarning/0.1 (personal OSINT; contact via repo)";

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string>) },
      signal: ctrl.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split("?")[0]}: ${body.slice(0, 200)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T = any>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  return JSON.parse(await fetchText(url, init, timeoutMs)) as T;
}

/** FNV-1a 32bit — 지문용 (보안 목적 아님) */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** 군사/항행 DTG 형식 "301234Z OCT 2026" → epoch ms */
export function parseDtg(dtg: string): number | undefined {
  const m = /(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{2,4})/.exec(dtg.toUpperCase());
  if (!m) return undefined;
  const mon = MONTHS.indexOf(m[4]);
  if (mon < 0) return undefined;
  const year = m[5].length === 2 ? 2000 + Number(m[5]) : Number(m[5]);
  return Date.UTC(year, mon, Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "2026/10/30 21:05:11" 같은 한국 표준시(KST) 문자열 → epoch ms */
export function parseKst(s: string): number | undefined {
  const m = /(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})?/.exec(s);
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +(m[6] ?? 0));
}

/** GDELT seendate "20261030T120000Z" */
export function parseCompactUtc(s: string): number | undefined {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(s);
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export function fmtKst(ms?: number): string {
  if (ms === undefined) return "-";
  const d = new Date(ms + 9 * 3600_000);
  return d.toISOString().replace("T", " ").slice(0, 19) + " KST";
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}
