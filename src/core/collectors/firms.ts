// NASA FIRMS 위성 열 이상(VIIRS 375m, 약 3시간 지연) — 무료 MAP_KEY 필요.
// 북한 땅의 열점 수와 '알려진 미사일·핵 시설 반경 12km 이내' 열점을 센다.
// 2026-11-01 고침: ① '1일'은 UTC 오늘(한국 오전 9시부터)만이라 매일 아침 0건으로 떨어졌다 → 2일 받아 최근 24시간만 센다.
// ② Suomi NPP 하나만 써서 그 위성이 멈춘 날(11/1) 하루 종일 0건이었다 → NOAA-20 먼저, 없으면 NPP.
// ③ 사각형 범위에 중국 동북부·한국 수도권이 들어가 '북한' 열점의 99%가 실제로는 중국·한국이었다(10/31: 상자 1,237건 중 북한 땅 1건) → 북한 경계 안만 센다.
import type { CollectResult, Metric } from "../types.js";
import { fetchText, haversineKm } from "../util.js";

export const NK_BBOX = "124,37.5,131.5,43.5"; // west,south,east,north
/** NOAA-20 이 가장 안정적이고, Suomi NPP 는 노후로 가끔 멈춘다 */
export const FIRMS_SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT"] as const;

/** 북한 대략 경계 (경도, 위도) — 압록강·두만강·군사분계선·해안선. 단둥·훈춘·연길·서울·철원·속초는 밖 (테스트로 확인) */
export const NK_POLYGON: [number, number][] = [
  [124.2, 39.85], [124.4, 40.08], [124.95, 40.45], [125.6, 40.8], [126.3, 41.15], [126.6, 41.45], [126.9, 41.78], [127.3, 41.47], [127.85, 41.42], [128.18, 41.4],
  [128.08, 42.0], [128.6, 42.03], [129.2, 42.23], [129.75, 42.43], [129.85, 43.0], [130.1, 42.95], [130.3, 42.75], [130.7, 42.3],
  [130.4, 42.15], [129.8, 41.78], [129.2, 40.67], [128.9, 40.45], [128.18, 40.03], [127.6, 39.8], [127.45, 39.15], [127.85, 38.95], [128.36, 38.61],
  [128.1, 38.32], [127.7, 38.31], [127.3, 38.32], [127.05, 38.25], [126.85, 38.05], [126.68, 37.96], [126.66, 37.8], [126.5, 37.73], [125.8, 37.7],
  [125.1, 37.85], [124.73, 38.12], [125.1, 38.6], [125.38, 38.73], [125.1, 39.1], [124.7, 39.55],
];

export function inNorthKorea(lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = NK_POLYGON.length - 1; i < NK_POLYGON.length; j = i++) {
    const [x1, y1] = NK_POLYGON[i];
    const [x2, y2] = NK_POLYGON[j];
    if (y1 > lat !== y2 > lat && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export const NK_SITES: { name: string; lat: number; lon: number; what: string }[] = [
  { name: "동창리(서해위성발사장)", lat: 39.66, lon: 124.7, what: "위성·장거리 로켓 발사장, 엔진시험대" },
  { name: "순안 공항", lat: 39.2, lon: 125.67, what: "ICBM 발사 장소로 반복 사용" },
  { name: "신포 조선소", lat: 40.03, lon: 128.18, what: "SLBM·잠수함" },
  { name: "풍계리 핵실험장", lat: 41.28, lon: 129.08, what: "핵실험 갱도" },
  { name: "마군포 엔진시험장", lat: 39.92, lon: 127.54, what: "고체연료 엔진 지상시험" },
  { name: "원산 갈마", lat: 39.17, lon: 127.48, what: "미사일 발사 반복 지점" },
  { name: "구성", lat: 39.98, lon: 125.24, what: "고체연료 미사일 시험" },
  { name: "강동", lat: 39.15, lon: 126.1, what: "미사일 기지·발사 지점" },
  { name: "산음동 미사일 공장", lat: 39.1, lon: 125.65, what: "ICBM 조립 공장" },
  { name: "영변 핵시설", lat: 39.8, lon: 125.75, what: "원자로·재처리·농축" },
];

export interface Hotspot {
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  acqTime: number;
  confidence: string;
  daynight: string;
  /** 북한 경계 안 */
  inNk?: boolean;
  nearSite?: { name: string; km: number };
}

export function parseFirmsCsv(csv: string): Hotspot[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = (k: string) => header.indexOf(k);
  const [iLat, iLon, iBt, iFrp, iDate, iTime, iConf, iDn] = ["latitude", "longitude", "bright_ti4", "frp", "acq_date", "acq_time", "confidence", "daynight"].map(idx);
  const out: Hotspot[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < header.length) continue;
    const lat = +c[iLat];
    const lon = +c[iLon];
    const t = String(c[iTime]).padStart(4, "0");
    const h: Hotspot = {
      lat, lon, brightness: +c[iBt], frp: +c[iFrp], confidence: c[iConf], daynight: c[iDn],
      acqTime: Date.parse(`${c[iDate]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`),
    };
    // 시설 거리는 북한 땅 열점만 잰다 (상자 안 중국·한국 열점 수천 건에 거리 계산을 하지 않게)
    if (inNorthKorea(lat, lon)) {
      h.inNk = true;
      let best: { name: string; km: number } | undefined;
      for (const s of NK_SITES) {
        const km = haversineKm(lat, lon, s.lat, s.lon);
        if (km <= 12 && (!best || km < best.km)) best = { name: s.name, km: +km.toFixed(1) };
      }
      if (best) h.nearSite = best;
    }
    out.push(h);
  }
  return out;
}

/** 최근 hours 시간 열점 — 위성 하나씩 시도해 상자 안에 하나라도 있는 첫 위성을 쓴다 (모두 0건이면 처리 지연·고장으로 본다).
 *  FIRMS 의 '일 수'는 UTC 날짜 단위라 하루를 더 받아 시각으로 자른다 */
export async function fetchNkHotspots(mapKey: string, now = Date.now(), hours = 24): Promise<{ source: string; hot: Hotspot[] } | undefined> {
  const dayRange = Math.min(5, Math.ceil(hours / 24) + 1);
  for (const src of FIRMS_SOURCES) {
    const csv = await fetchText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${src}/${NK_BBOX}/${dayRange}`, {}, 30000);
    if (/invalid|error/i.test(csv.slice(0, 200)) && !csv.startsWith("latitude")) throw new Error(`FIRMS: ${csv.slice(0, 120)}`);
    const hot = parseFirmsCsv(csv).filter((h) => h.acqTime > now - hours * 3600_000 && h.acqTime <= now + 3600_000);
    if (hot.length) return { source: src, hot };
  }
  return undefined;
}

export function thermalMetrics(all: Hotspot[], source = "VIIRS_NOAA20_NRT"): Metric[] {
  const hot = all.filter((h) => h.inNk);
  const near = hot.filter((h) => h.nearSite);
  const sat = source.includes("NOAA20") ? "NOAA-20" : source.includes("SNPP") ? "Suomi NPP" : source;
  return [
    {
      indicator: "thermal.nk_fires_24h",
      value: hot.length,
      meta: {
        night: hot.filter((h) => h.daynight === "N").length,
        day: hot.filter((h) => h.daynight === "D").length,
        confidence: { high: hot.filter((h) => /^h/i.test(h.confidence)).length, nominal: hot.filter((h) => /^n/i.test(h.confidence)).length, low: hot.filter((h) => /^l/i.test(h.confidence)).length },
        boxTotal: all.length,
        satellite: sat,
        note: `북한 땅만 (같은 사각형의 중국·한국 포함 ${all.length}건) · ${sat}`,
      },
    },
    { indicator: "thermal.launch_site_hotspots", value: near.length, meta: { satellite: sat, points: near.slice(0, 10).map((h) => ({ site: h.nearSite!.name, km: h.nearSite!.km, at: h.acqTime, frp: h.frp, night: h.daynight === "N" })) } },
  ];
}

export async function collectFirms(mapKey: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!mapKey) return { source: "firms", ok: true, skipped: "FIRMS_MAP_KEY 미설정 (NASA FIRMS 무료 키)", signals: [], fetchedAt: now, rawCount: 0 };
  const r = await fetchNkHotspots(mapKey, now);
  // 위성 두 대 모두 한반도 북부 상자(중국 동북부 포함)에 24시간 0건 → 실제 0이 아니라 NASA 처리 지연·위성 고장
  if (!r) return { source: "firms", ok: false, error: "NOAA-20·Suomi NPP 모두 최근 24시간 자료 없음 (NASA 처리 지연)", signals: [], fetchedAt: now, rawCount: 0 };
  return { source: "firms", ok: true, fetchedAt: now, rawCount: r.hot.length, signals: [], metrics: thermalMetrics(r.hot, r.source) };
}
