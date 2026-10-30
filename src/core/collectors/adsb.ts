// adsb.lol ADS-B (무료·무인증, ODbL). OpenSky가 클라우드 서버 접속을 차단해 주 항공 소스로 사용.
// 한반도 수신기 커버리지가 제한적이므로 이 소스 단독 신호는 항상 미확인(UNVERIFIED)이다.
import type { CollectResult, Signal } from "../types.js";
import { fetchJson } from "../util.js";

export interface Circle {
  lat: number;
  lon: number;
  /** 해리(nm), adsb.lol 최대 250 */
  radiusNm: number;
}

export const AIR_REGIONS: Record<string, Circle> = {
  korea: { lat: 36.8, lon: 127.6, radiusNm: 250 },
  seoul_metro: { lat: 37.5, lon: 127.0, radiusNm: 60 },
  dmz: { lat: 38.1, lon: 127.2, radiusNm: 80 },
  yellow_sea_nll: { lat: 37.7, lon: 125.3, radiusNm: 60 },
  east_sea: { lat: 38.5, lon: 130.5, radiusNm: 150 },
  north_korea: { lat: 40.0, lon: 127.0, radiusNm: 200 },
};

export interface Aircraft {
  icao24: string;
  callsign: string;
  registration?: string;
  type?: string;
  lat?: number;
  lon?: number;
  altitudeFt?: number;
  onGround: boolean;
  squawk?: string;
  emergency?: string;
  military: boolean;
}

export async function fetchAircraft(c: Circle): Promise<{ now: number; aircraft: Aircraft[] }> {
  const d = await fetchJson<any>(`https://api.adsb.lol/v2/point/${c.lat}/${c.lon}/${c.radiusNm}`, {}, 20000);
  return { now: d.now ?? Date.now(), aircraft: (d.ac ?? []).map(normalize) };
}

export function normalize(a: any): Aircraft {
  return {
    icao24: a.hex,
    callsign: String(a.flight ?? "").trim(),
    registration: a.r,
    type: a.t,
    lat: a.lat,
    lon: a.lon,
    altitudeFt: typeof a.alt_baro === "number" ? a.alt_baro : undefined,
    onGround: a.alt_baro === "ground",
    squawk: a.squawk,
    emergency: a.emergency && a.emergency !== "none" ? a.emergency : undefined,
    // readsb dbFlags 1비트 = 군용기
    military: ((a.dbFlags ?? 0) & 1) === 1,
  };
}

const SQUAWK: Record<string, { label: string; severity: number }> = {
  "7500": { label: "불법 납치(7500)", severity: 60 },
  "7600": { label: "통신 두절(7600)", severity: 25 },
  "7700": { label: "비상(7700)", severity: 35 },
};

export function emergencySignals(aircraft: Aircraft[], dataTime: number, now: number): Signal[] {
  const out: Signal[] = [];
  for (const a of aircraft) {
    const sq = a.squawk ? SQUAWK[a.squawk] : undefined;
    if (!sq || a.onGround) continue;
    out.push({
      id: `adsb_lol:${a.icao24}:${a.squawk}:${Math.floor(dataTime / 3600_000)}`,
      source: "adsb_lol",
      sourceKind: "sensor",
      category: "aviation_emergency",
      title: `항공기 ${a.callsign || a.registration || a.icao24} 비상 스쿼크 ${sq.label}`,
      summary: `기종=${a.type ?? "?"} 고도=${a.altitudeFt ?? "?"}ft${a.military ? " · 군용기" : ""}`,
      url: `https://adsb.lol/?icao=${a.icao24}`,
      lat: a.lat,
      lon: a.lon,
      eventTime: dataTime,
      publishedTime: dataTime,
      detectedTime: now,
      severity: sq.severity,
    });
  }
  return out;
}

export async function collectAdsb(now = Date.now()): Promise<CollectResult> {
  const { now: dataTime, aircraft } = await fetchAircraft(AIR_REGIONS.korea);
  const airborne = aircraft.filter((a) => !a.onGround);
  return {
    source: "adsb_lol",
    ok: true,
    fetchedAt: now,
    rawCount: aircraft.length,
    signals: emergencySignals(aircraft, dataTime, now),
    meta: { airborne: airborne.length, military: airborne.filter((a) => a.military).length },
  };
}
