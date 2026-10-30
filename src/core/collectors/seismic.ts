// USGS / EMSC 지진 이벤트 → 핵실험 의심·북한 지역 얕은 지진 신호
import type { CollectResult, Signal } from "../types.js";
import { fetchText, haversineKm } from "../util.js";

/** FDSN 서비스는 결과가 없으면 HTTP 204 + 빈 본문을 반환한다 */
async function fetchFdsn(url: string): Promise<any> {
  const txt = await fetchText(url);
  return txt.trim() ? JSON.parse(txt) : { features: [] };
}

export const NK_BOX = { minLat: 37.6, maxLat: 43.1, minLon: 124.1, maxLon: 130.8 };
export const PUNGGYE_RI = { lat: 41.28, lon: 129.08 };

export interface Quake {
  nativeId: string;
  time: number;
  updated?: number;
  lat: number;
  lon: number;
  depthKm: number;
  mag: number;
  place: string;
  type: string;
  url?: string;
}

/** 오탐 억제: 북한 영역 밖, 깊은 진원, 소규모 지진은 신호를 만들지 않는다 */
export function quakeToSignal(q: Quake, source: "usgs" | "emsc", now: number): Signal | null {
  const inNk =
    q.lat >= NK_BOX.minLat && q.lat <= NK_BOX.maxLat && q.lon >= NK_BOX.minLon && q.lon <= NK_BOX.maxLon;
  if (!inNk) return null;
  const distTest = haversineKm(q.lat, q.lon, PUNGGYE_RI.lat, PUNGGYE_RI.lon);
  const explosionTag = /explosion/i.test(q.type);
  const shallow = q.depthKm <= 10;
  let category: Signal["category"];
  let severity: number;
  if (explosionTag || (distTest <= 50 && shallow && q.mag >= 3.5)) {
    category = "nuclear_test";
    severity = explosionTag ? 92 : q.mag >= 4.5 ? 90 : 75;
  } else if (shallow && q.mag >= 4.0) {
    category = "seismic_anomaly";
    severity = 50;
  } else {
    return null;
  }
  return {
    id: `${source}:${q.nativeId}`,
    source,
    sourceKind: "sensor",
    category,
    title: `${category === "nuclear_test" ? "핵실험 의심 지진" : "북한 지역 얕은 지진"} M${q.mag.toFixed(1)} (${q.place})`,
    summary: `깊이 ${q.depthKm.toFixed(1)}km, 풍계리에서 ${distTest.toFixed(0)}km, 유형=${q.type}`,
    url: q.url,
    lat: q.lat,
    lon: q.lon,
    eventTime: q.time,
    // USGS/EMSC는 최초 공개 시각을 제공하지 않는다 → 감지 시각이 상한
    publishedTime: undefined,
    detectedTime: now,
    severity,
  };
}

function usgsUrl(now: number, lookbackH: number, minMag: number) {
  const start = new Date(now - lookbackH * 3600_000).toISOString();
  return (
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&minmagnitude=${minMag}` +
    `&starttime=${start}&minlatitude=${NK_BOX.minLat}&maxlatitude=${NK_BOX.maxLat}` +
    `&minlongitude=${NK_BOX.minLon}&maxlongitude=${NK_BOX.maxLon}`
  );
}

function emscUrl(now: number, lookbackH: number, minMag: number) {
  const start = new Date(now - lookbackH * 3600_000).toISOString().slice(0, 19);
  return (
    `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100&minmag=${minMag}&start=${start}` +
    `&minlat=${NK_BOX.minLat}&maxlat=${NK_BOX.maxLat}&minlon=${NK_BOX.minLon}&maxlon=${NK_BOX.maxLon}`
  );
}

export function usgsToQuakes(data: any): Quake[] {
  return (data.features ?? []).map((f: any) => {
    const [lon, lat, depth] = f.geometry.coordinates;
    return {
      nativeId: f.id, time: f.properties.time, updated: f.properties.updated, lat, lon, depthKm: depth,
      mag: f.properties.mag, place: f.properties.place ?? "", type: f.properties.type ?? "earthquake", url: f.properties.url,
    };
  });
}

export function emscToQuakes(data: any): Quake[] {
  return (data.features ?? []).map((f: any) => {
    const p = f.properties;
    return {
      nativeId: p.unid ?? f.id, time: Date.parse(p.time), lat: p.lat, lon: p.lon, depthKm: p.depth, mag: p.mag,
      place: p.flynn_region ?? "", type: p.evtype === "ex" ? "explosion" : "earthquake",
      url: `https://www.seismicportal.eu/eventdetails.html?unid=${p.unid}`,
    };
  });
}

/** 에이전트 도구용: 두 지진 네트워크의 북한 영역 지진 전체(필터 전) */
export async function fetchQuakes(now: number, lookbackH: number, minMag: number) {
  const [usgs, emsc] = await Promise.allSettled([
    fetchFdsn(usgsUrl(now, lookbackH, minMag)).then(usgsToQuakes),
    fetchFdsn(emscUrl(now, lookbackH, minMag)).then(emscToQuakes),
  ]);
  const pick = (r: PromiseSettledResult<Quake[]>) => (r.status === "fulfilled" ? { ok: true, quakes: r.value } : { ok: false, error: String(r.reason), quakes: [] as Quake[] });
  return { usgs: pick(usgs), emsc: pick(emsc) };
}

export async function collectUsgs(now = Date.now(), lookbackH = 24): Promise<CollectResult> {
  const data = await fetchFdsn(usgsUrl(now, lookbackH, 2.5));
  const quakes = usgsToQuakes(data);
  const metrics = [{ indicator: "seismic.nk_events_24h", value: quakes.filter((q) => now - q.time < 24 * 3600_000).length, meta: { quakes: quakes.slice(0, 5).map((q) => ({ time: q.time, mag: q.mag, depthKm: q.depthKm, place: q.place })) } }];
  return { source: "usgs", ok: true, fetchedAt: now, rawCount: data.features?.length ?? 0, signals: parseUsgs(data, now), metrics };
}

export function parseUsgs(data: any, now: number): Signal[] {
  return usgsToQuakes(data).flatMap((q) => quakeToSignal(q, "usgs", now) ?? []);
}

export async function collectEmsc(now = Date.now(), lookbackH = 6): Promise<CollectResult> {
  const data = await fetchFdsn(emscUrl(now, lookbackH, 2.5));
  return { source: "emsc", ok: true, fetchedAt: now, rawCount: data.features?.length ?? 0, signals: parseEmsc(data, now) };
}

export function parseEmsc(data: any, now: number): Signal[] {
  return emscToQuakes(data).flatMap((q) => quakeToSignal(q, "emsc", now) ?? []);
}
