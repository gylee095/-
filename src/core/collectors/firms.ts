// NASA FIRMS 위성 열 이상(VIIRS 375m, 약 3시간 지연) — 무료 MAP_KEY 필요.
// 북한 영역 열점 수와 '알려진 미사일·핵 시설 반경 12km 이내' 열점을 센다.
import type { CollectResult, Metric } from "../types.js";
import { fetchText, haversineKm } from "../util.js";

export const NK_BBOX = "124,37.5,131.5,43.5"; // west,south,east,north

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
    let best: { name: string; km: number } | undefined;
    for (const s of NK_SITES) {
      const km = haversineKm(lat, lon, s.lat, s.lon);
      if (km <= 12 && (!best || km < best.km)) best = { name: s.name, km: +km.toFixed(1) };
    }
    if (best) h.nearSite = best;
    out.push(h);
  }
  return out;
}

export async function fetchNkHotspots(mapKey: string, days = 1): Promise<Hotspot[]> {
  const csv = await fetchText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/${NK_BBOX}/${days}`, {}, 30000);
  if (/invalid|error/i.test(csv.slice(0, 200)) && !csv.startsWith("latitude")) throw new Error(`FIRMS: ${csv.slice(0, 120)}`);
  return parseFirmsCsv(csv);
}

export function thermalMetrics(hot: Hotspot[]): Metric[] {
  const near = hot.filter((h) => h.nearSite);
  return [
    { indicator: "thermal.nk_hotspots_24h", value: hot.length, meta: { night: hot.filter((h) => h.daynight === "N").length, highConfidence: hot.filter((h) => /h|high|nominal/i.test(h.confidence)).length } },
    { indicator: "thermal.launch_site_hotspots", value: near.length, meta: { points: near.slice(0, 10).map((h) => ({ site: h.nearSite!.name, km: h.nearSite!.km, at: h.acqTime, frp: h.frp, night: h.daynight === "N" })) } },
  ];
}

export async function collectFirms(mapKey: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!mapKey) return { source: "firms", ok: true, skipped: "FIRMS_MAP_KEY 미설정 (NASA FIRMS 무료 키)", signals: [], fetchedAt: now, rawCount: 0 };
  const hot = await fetchNkHotspots(mapKey);
  return { source: "firms", ok: true, fetchedAt: now, rawCount: hot.length, signals: [], metrics: thermalMetrics(hot) };
}
