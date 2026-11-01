// 바다 날씨 — 사후 확인용 (2026-11-01). 서해 중국 배가 줄었을 때처럼 '평범한 이유(풍랑)로 설명되는가'를 분석관(Claude)이 날짜별로 확인한다.
// Open-Meteo 해양 모델(키 불필요)의 하루 최대 파고 + 기상 모델 최대 풍속. 기상청 풍랑주의보 기준은 파고 3m·풍속 14m/s 이상.
// 공식 특보 이력(기상청)은 키가 필요해 여기선 모델 값만 쓴다 — 분석관이 필요하면 웹 검색으로 '기상청 풍랑주의보 날짜'를 확인한다.
import { USER_AGENT } from "./util.js";

export const SEA_POINTS = {
  yellow_sea: [
    { name: "서해 북부(NLL 부근)", lat: 37.5, lon: 125.0 },
    { name: "서해 중부", lat: 36.0, lon: 124.0 },
    { name: "서해 남부", lat: 34.5, lon: 124.5 },
  ],
  east_sea: [
    { name: "동해 중부", lat: 38.0, lon: 129.5 },
    { name: "동해 남부", lat: 36.5, lon: 130.0 },
  ],
  korea_strait: [{ name: "대한해협", lat: 34.5, lon: 129.0 }],
} as const;
export type SeaArea = keyof typeof SEA_POINTS;

export interface SeaDay {
  date: string;
  waveMaxM?: number;
  windMaxMs?: number;
  /** 풍랑주의보급(파고 3m·풍속 14m/s 이상) · 높은 편(2m·10m/s) · 잔잔 */
  verdict: "풍랑주의보급" | "높은 편" | "잔잔" | "자료 없음";
}

export function verdictOf(wave?: number, wind?: number): SeaDay["verdict"] {
  if (wave === undefined && wind === undefined) return "자료 없음";
  if ((wave ?? 0) >= 3 || (wind ?? 0) >= 14) return "풍랑주의보급";
  if ((wave ?? 0) >= 2 || (wind ?? 0) >= 10) return "높은 편";
  return "잔잔";
}

/** Open-Meteo 응답(여러 지점이면 배열) → 지점별 날짜 값 */
export function parseOpenMeteoDaily(json: unknown, key: string): Record<string, number | undefined>[] {
  const arr = Array.isArray(json) ? json : [json];
  return arr.map((x: any) => {
    const t: string[] = x?.daily?.time ?? [];
    const v: (number | null)[] = x?.daily?.[key] ?? [];
    return Object.fromEntries(t.map((d, i) => [d, typeof v[i] === "number" ? (v[i] as number) : undefined]));
  });
}

export async function fetchSeaWeather(area: SeaArea, from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<{ name: string; lat: number; lon: number; days: SeaDay[]; windNote?: string }[]> {
  const pts = SEA_POINTS[area];
  const lat = pts.map((p) => p.lat).join(",");
  const lon = pts.map((p) => p.lon).join(",");
  const q = `latitude=${lat}&longitude=${lon}&start_date=${from}&end_date=${to}&timezone=Asia%2FSeoul`;
  const get = async (url: string) => {
    const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    return res.json();
  };
  const [waves, wind] = await Promise.allSettled([
    get(`https://marine-api.open-meteo.com/v1/marine?${q}&daily=wave_height_max`),
    get(`https://api.open-meteo.com/v1/forecast?${q}&daily=wind_speed_10m_max&wind_speed_unit=ms`),
  ]);
  if (waves.status === "rejected" && wind.status === "rejected") throw waves.reason;
  const none = (): Record<string, number | undefined> => ({});
  const w = waves.status === "fulfilled" ? parseOpenMeteoDaily(waves.value, "wave_height_max") : pts.map(none);
  const s = wind.status === "fulfilled" ? parseOpenMeteoDaily(wind.value, "wind_speed_10m_max") : pts.map(none);
  return pts.map((p, i) => {
    const dates = [...new Set([...Object.keys(w[i] ?? {}), ...Object.keys(s[i] ?? {})])].sort();
    return {
      ...p,
      days: dates.map((date) => {
        const wave = w[i]?.[date];
        const ws = s[i]?.[date];
        return { date, waveMaxM: wave, windMaxMs: ws === undefined ? undefined : Math.round(ws * 10) / 10, verdict: verdictOf(wave, ws) };
      }),
      windNote: wind.status === "rejected" ? `풍속 자료 실패(${String((wind.reason as Error)?.message ?? wind.reason).slice(0, 40)}) — 파고만` : undefined,
    };
  });
}
