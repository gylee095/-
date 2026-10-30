// adsb.lol ADS-B (무료·무인증, ODbL). OpenSky가 클라우드 서버 접속을 차단해 주 항공 소스로 사용.
// 한반도 수신기 커버리지가 제한적이므로 이 소스 단독 신호는 항상 미확인(UNVERIFIED)이다.
//  - 민항기 수(공역 통제 징후), 동북아 군용기 수, 정찰·급유기(ISR) 목록, 비상 스쿼크를 관측한다.
import type { CollectResult, Metric, Signal } from "../types.js";
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

/** 군용기 집계 범위: 한반도·일본 서부·중국 동북부·동해·서해 */
export const NE_ASIA_BOX = { minLat: 28, maxLat: 47, minLon: 117, maxLon: 147 };

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

/**
 * 정찰·감시·조기경보·해상초계·급유·전자전 기종 (ICAO 기종 코드).
 * C135 는 KC-135 뿐 아니라 WC-135(방사능 탐지)·RC-135 일부도 쓰므로 등록번호로 확인해야 한다.
 */
export const ISR_TYPES = /^(R135|RC135|C135|K35R|K35E|KC46|K46A|E8|E3TF|E3CF|E6|E737|E7|P8|P3|P1|U2|Q4|RQ4|MQ9|MQ4|GLF5|F2TH|A400|E2|E767|KC30|A332|A50)$/i;

const ISR_LABEL: Record<string, string> = {
  R135: "RC-135 정찰기(코브라볼/리벳조인트 계열)", RC135: "RC-135 정찰기", C135: "C-135 계열(KC-135 급유기 또는 WC-135 방사능 탐지기 — 등록번호 확인)",
  K35R: "KC-135R 급유기", K35E: "KC-135E 급유기", KC46: "KC-46 급유기", K46A: "KC-46 급유기", E8: "E-8 JSTARS 지상감시기", E3TF: "E-3 조기경보기", E3CF: "E-3 조기경보기", E6: "E-6 핵지휘통신기",
  E737: "E-737 피스아이 조기경보기", E7: "E-7 조기경보기", P8: "P-8 해상초계기", P3: "P-3 해상초계기", P1: "P-1 해상초계기(일본)", U2: "U-2 고고도 정찰기", Q4: "RQ-4 글로벌호크", RQ4: "RQ-4 글로벌호크",
  MQ9: "MQ-9 리퍼", MQ4: "MQ-4 트라이튼", GLF5: "걸프스트림 특수임무기", F2TH: "팰컨 2000 (한국 백두 정찰기 계열)", A400: "A400M 수송기", E2: "E-2 호크아이", E767: "E-767 조기경보기(일본)", KC30: "KC-30 급유기", A332: "A330 MRTT 급유기", A50: "A-50 조기경보기(러시아)",
};

export async function fetchAircraft(c: Circle): Promise<{ now: number; aircraft: Aircraft[] }> {
  const d = await fetchJson<any>(`https://api.adsb.lol/v2/point/${c.lat}/${c.lon}/${c.radiusNm}`, {}, 20000);
  return { now: d.now ?? Date.now(), aircraft: (d.ac ?? []).map(normalize) };
}

/** 전 세계 군용 표시 항공기 중 동북아 범위 */
export async function fetchMilitaryNeAsia(): Promise<{ now: number; aircraft: Aircraft[] }> {
  const d = await fetchJson<any>("https://api.adsb.lol/v2/mil", {}, 20000);
  return { now: d.now ?? Date.now(), aircraft: filterNeAsia((d.ac ?? []).map(normalize)) };
}

export function filterNeAsia(ac: Aircraft[]): Aircraft[] {
  const b = NE_ASIA_BOX;
  return ac.filter((a) => a.lat !== undefined && a.lon !== undefined && a.lat >= b.minLat && a.lat <= b.maxLat && a.lon >= b.minLon && a.lon <= b.maxLon);
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

export function describeIsr(ac: Aircraft[]) {
  return ac
    .filter((a) => a.type && ISR_TYPES.test(a.type))
    .map((a) => ({
      type: a.type!,
      what: ISR_LABEL[a.type!.toUpperCase()] ?? a.type!,
      callsign: a.callsign || undefined,
      registration: a.registration,
      lat: a.lat !== undefined ? +a.lat.toFixed(2) : undefined,
      lon: a.lon !== undefined ? +a.lon.toFixed(2) : undefined,
      altitudeFt: a.altitudeFt,
      url: `https://adsb.lol/?icao=${a.icao24}`,
    }));
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

/** 민항기·군용기·ISR 관측값 (테스트 가능하도록 분리) */
export function airMetrics(korea: Aircraft[], neAsiaMil: Aircraft[]): Metric[] {
  const airborne = korea.filter((a) => !a.onGround);
  const civil = airborne.filter((a) => !a.military);
  const milAir = neAsiaMil.filter((a) => !a.onGround);
  const isr = describeIsr(milAir);
  return [
    { indicator: "air.civil_airborne", value: civil.length, meta: { total: airborne.length } },
    { indicator: "air.mil_airborne", value: milAir.length, meta: { types: countBy(milAir.map((a) => a.type ?? "?")) } },
    { indicator: "air.isr_airborne", value: isr.length, meta: { aircraft: isr.slice(0, 20) } },
  ];
}

function countBy(xs: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
}

export async function collectAdsb(now = Date.now()): Promise<CollectResult> {
  const [korea, mil] = await Promise.allSettled([fetchAircraft(AIR_REGIONS.korea), fetchMilitaryNeAsia()]);
  if (korea.status === "rejected") throw korea.reason;
  const k = korea.value;
  const m = mil.status === "fulfilled" ? mil.value.aircraft : [];
  return {
    source: "adsb_lol",
    ok: true,
    error: mil.status === "rejected" ? `군용기 목록 실패: ${String(mil.reason).slice(0, 80)}` : undefined,
    fetchedAt: now,
    rawCount: k.aircraft.length + m.length,
    signals: emergencySignals([...k.aircraft, ...m], k.now, now),
    metrics: airMetrics(k.aircraft, m),
  };
}
