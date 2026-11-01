// 북한 밤 불빛 — NASA 위성(VIIRS 야간 밴드 '구름 빈틈 메움·달빛 보정' 일일 영상, NASA GIBS 공개 지도)으로 본 평양 밝기 (2026-11-01).
// 전쟁에 들어간 도시는 불이 꺼진다(등화관제·발전소 피격·연료 부족). 같은 방식으로 재 보니 키이우는 2022-02-24 침공 사흘 뒤 −26%,
// 가자는 2023-10-11 발전소가 멈춘 이틀 뒤 −37%였다. 그러나 2013년 '전시상태', 2015년 '준전시상태', 2017년, 2024년 10월 위기 때
// 평양 불빛은 평소 범위였다 — 그래서 '미리 알려 주는' 신호라기보다 '전쟁 태세에 들어갔다'를 며칠 안에 확인해 주는 신호다.
// 판정: 위성 두 대(NOAA-20, Suomi NPP) 각각 '최근 5일 중 두 번째로 밝은 밤' ÷ '직전 28일의 같은 값 중앙값' → 두 위성 평균.
// 구름·안개는 어둡게만 만들므로 밝은 밤을 보면 날씨 잡음이 줄고, 비교용으로 중국 단둥도 같이 잰다. 근거: docs/INDICATORS.md 0.8
import type { CollectResult, Metric } from "../types.js";
import type { CollectorKv } from "./index.js";
import { decodePng, type DecodedPng } from "../png.js";
import { USER_AGENT } from "../util.js";

export const NIGHT_SATS = {
  n20: "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
  snpp: "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance",
} as const;
export type NightSat = keyof typeof NIGHT_SATS;
const SATS = Object.keys(NIGHT_SATS) as NightSat[];

// GIBS 500m 격자(한 칸 0.00439453125° ≈ 400~490m)에 맞춘 창. 격자 7단계 22행 135열 타일(북위 40.5°, 동경 123.75°가 왼쪽 위)의 칸 번호로 정한다.
const CELL = 0.00439453125;
const win = (r0: number, r1: number, c0: number, c1: number) => ({
  /** WMS 1.3.0 + EPSG:4326 은 위도, 경도 순서 */
  bbox: [40.5 - r1 * CELL, 123.75 + c0 * CELL, 40.5 - r0 * CELL, 123.75 + c1 * CELL].map((x) => x.toFixed(6)).join(","),
  width: c1 - c0,
  height: r1 - r0,
});
export const NIGHT_WINDOWS = {
  /** 평양 중심 약 12×16km (북위 38.96~39.10°, 동경 125.68~125.82°) */
  pyongyang: win(318, 350, 439, 471),
  /** 비교용 중국 단둥 (북위 40.13~40.20°, 동경 124.30~124.45° — 강 건너 신의주는 뺐다) */
  dandong: win(68, 85, 125, 160),
} as const;
export type NightWindow = keyof typeof NIGHT_WINDOWS;

/** 평양·단둥 부분만 작은 PNG 로 받는다 (512×512 타일을 통째로 풀면 무료 플랜 CPU 를 넘길 수 있다) */
export const nightUrl = (sat: NightSat, day: string, w: NightWindow) => {
  const x = NIGHT_WINDOWS[w];
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${NIGHT_SATS[sat]}&STYLES=&CRS=EPSG:4326&BBOX=${x.bbox}&WIDTH=${x.width}&HEIGHT=${x.height}&FORMAT=image/png&TIME=${day}`;
};

// GIBS 색상표(VIIRS_DayNightBand_At_Sensor_Radiance v1.3): 1~180번 칸의 회색 값과 밝기 하한(0.1 nW/cm²·sr 단위). 투명 = 자료 없음.
// 원본 91번 칸 상한이 "100.0"으로 잘못 적혀 있어 하한만 쓰고, 칸 값은 다음 칸 하한까지의 가운데로 본다 (180번 = 38.2 이상 → 39.1).
const GRAYS =
  "7,13,19,24,29,33,37,41,45,48,52,55,58,61,64,67,69,72,74,77,79,81,83,85,87,89,91,93,95,96,98,100,101,103,105,106,108,109,111,112,113,115,116,117,118,120,121,122,123,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255";
const LO_TENTHS =
  "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,70,71,72,73,74,76,77,78,79,81,82,83,85,86,88,89,90,92,93,95,96,98,100,101,103,104,106,108,110,111,113,115,117,118,120,122,124,126,128,130,132,134,136,139,141,143,145,147,150,152,154,157,159,162,164,167,169,172,175,177,180,183,186,188,191,194,197,200,203,207,210,213,216,219,223,226,230,233,237,240,244,248,251,255,259,263,267,271,275,279,283,288,292,296,301,305,310,315,319,324,329,334,339,344,349,355,360,365,371,376,382";
/** 회색 값 → 밝기 (색상표에 없는 회색은 NaN) */
const RADIANCE_BY_GRAY = (() => {
  const lo = LO_TENTHS.split(",").map((x) => Number(x) / 10);
  lo.push(40);
  const r = new Float64Array(256).fill(NaN);
  GRAYS.split(",").forEach((g, i) => (r[Number(g)] = (lo[i] + lo[i + 1]) / 2));
  return r;
})();

/** 작은 영상의 평균 밝기 (nW/cm²·sr). 절반 넘게 투명(자료 없음 — 아직 공개 전인 날 포함)이면 undefined.
 *  색상표에 없는 색이 섞이면(NASA 가 색을 바꿈) 값이 조용히 틀어지지 않게 오류를 낸다 */
export function meanRadiance(img: DecodedPng): number | undefined {
  if (img.colorType !== 6) throw new Error(`NASA 영상 형식이 예상과 다름 (색 형식 ${img.colorType})`);
  let sum = 0, n = 0, odd = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const v = RADIANCE_BY_GRAY[d[i]];
    if (d[i] !== d[i + 1] || d[i] !== d[i + 2] || v !== v) odd++;
    else {
      sum += v;
      n++;
    }
  }
  if (odd > Math.max(2, (n + odd) * 0.05)) throw new Error("NASA 영상 색상표가 예상과 다름 — 밝기 환산표를 다시 확인해야 함");
  return n > (img.width * img.height) / 2 ? Math.round((sum / n) * 1000) / 1000 : undefined;
}

export async function readNightPng(png: Uint8Array): Promise<number | undefined> {
  return meanRadiance(await decodePng(png));
}

// ── 판정 ──
const DAY = 86400_000;
const shift = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export const ENVELOPE_DAYS = 5;
export const BASE_DAYS = 28;

/** d 까지 5일 중 두 번째로 밝은 밤 (값이 3개 이상일 때) — 구름 낀 밤·튀는 밤 하나에 흔들리지 않는다 */
function envelope(vals: Map<string, number>, d: string): number | undefined {
  const xs: number[] = [];
  for (let k = 0; k < ENVELOPE_DAYS; k++) {
    const v = vals.get(shift(d, -k));
    if (v !== undefined) xs.push(v);
  }
  if (xs.length < 3) return undefined;
  xs.sort((a, b) => b - a);
  return xs[1];
}

/** 최근 5일의 밝은 밤이 직전 28일 평소보다 몇 % 달라졌나 */
export function lightsChange(vals: Map<string, number>, d: string): { pct: number; now: number; usual: number } | undefined {
  const now = envelope(vals, d);
  if (now === undefined) return undefined;
  const base: number[] = [];
  for (let k = 1; k <= BASE_DAYS; k++) {
    const e = envelope(vals, shift(d, -k));
    if (e !== undefined) base.push(e);
  }
  if (base.length < BASE_DAYS / 2) return undefined;
  const usual = median(base);
  if (!(usual > 0)) return undefined;
  return { pct: Math.round((now / usual - 1) * 1000) / 10, now: Math.round(now * 100) / 100, usual: Math.round(usual * 100) / 100 };
}

/** 날짜별 [평양, 단둥] 밝기 */
export type NightDay = Partial<Record<NightSat, [number, number | null]>>;
export interface NightHistory {
  days: Record<string, NightDay>;
  /** "위성:날짜" → 마지막 시도 시각 (아직 공개 전인 날을 매시간 다시 받지 않게) */
  tried: Record<string, number>;
}

/** 첫 배포 때 28일 기준선이 없어 한 달을 기다리지 않도록 넣어 둔 최근 기록 (2026-11-01 같은 방식으로 계산: [날짜, NOAA-20 평양, 단둥, NPP 평양, 단둥]) */
const SEED: [string, number | null, number | null, number | null, number | null][] = [
  ["2026-09-18", 9.14, 6.63, 9.54, 7.19], ["2026-09-19", 8.77, 6.41, 7.67, 7.35], ["2026-09-20", 8.95, 6.37, 9.49, 7.5], ["2026-09-21", 6.4, 6.14, 7.5, 7.13],
  ["2026-09-22", 7.24, 6.22, 9.36, 7.16], ["2026-09-23", 8.56, 6.37, 9.48, 7.55], ["2026-09-24", 9.02, 6.71, 9.18, 7.83], ["2026-09-25", 6.81, 5.95, 8.53, 7.1],
  ["2026-09-26", 6.72, 5.91, 7.51, 7.79], ["2026-09-27", 8.61, 5.31, 9.37, 5.82], ["2026-09-28", 6.8, 6.49, 8.36, 6.53], ["2026-09-29", 8.74, 5.33, 9.36, 5.64],
  ["2026-09-30", 7.38, 6.1, 7.44, 7.27], ["2026-10-01", 7.04, 6.17, 7.61, 7.03], ["2026-10-02", 6.85, 6.3, 7.91, 7.19], ["2026-10-03", 7.08, 6.71, 9.26, 7.83],
  ["2026-10-04", 8.46, 6.27, 8.47, 7.07], ["2026-10-05", 8.1, 6.47, 7.73, 7.3], ["2026-10-06", 7.16, 6.1, 7.79, 6.94], ["2026-10-07", 6.02, 6.67, 7.67, 7.71],
  ["2026-10-08", 6.63, 6.81, 10.18, 7.37], ["2026-10-09", 7.98, 4.76, 9.79, 4.59], ["2026-10-10", 8.83, 6.18, 9.66, 6.75], ["2026-10-11", 7.2, 6.32, 7.5, 7.26],
  ["2026-10-12", 8.51, 6.75, 9.8, 7.9], ["2026-10-13", 6.05, 6.71, null, null], ["2026-10-14", 8.13, 7.0, 9.0, 7.9], ["2026-10-15", 7.91, 5.91, 8.03, 7.06],
  ["2026-10-16", 7.19, 6.53, 6.83, 6.91], ["2026-10-17", 8.39, 6.79, 9.64, 7.74], ["2026-10-18", 5.99, 6.54, 7.25, 7.56], ["2026-10-19", 7.48, 6.08, 8.55, 6.83],
  ["2026-10-20", 8.3, 5.48, 9.45, 7.89], ["2026-10-21", 7.42, 6.28, 6.98, 6.95], ["2026-10-22", 8.28, 6.63, 9.39, 7.78], ["2026-10-23", 8.27, 6.52, 9.39, 7.05],
  ["2026-10-24", 6.53, 6.35, 8.53, 6.27], ["2026-10-25", 7.09, 6.0, 8.11, 7.84], ["2026-10-26", 7.68, 5.8, 6.95, 7.15], ["2026-10-27", 6.97, 6.11, 7.35, 7.45],
  ["2026-10-28", 8.27, 6.76, 9.39, 7.85], ["2026-10-29", 7.11, 6.71, 7.01, 7.57], ["2026-10-30", 6.91, 6.96, 8.07, 7.33],
];

export function seedHistory(): NightHistory {
  const days: Record<string, NightDay> = {};
  for (const [d, a, b, c, e] of SEED) {
    const x: NightDay = {};
    if (a !== null) x.n20 = [a, b];
    if (c !== null) x.snpp = [c, e];
    days[d] = x;
  }
  return { days, tried: {} };
}

const KV_KEY = "nightlights:v1";
const KEEP_DAYS = 70;
/** 위성 처리 지연: 보통 이틀 전 밤까지 나온다. 9일 넘게 비면 포기 */
const LOOKBACK = 9;
const RETRY_MS = 3 * 3600_000;
/** 한 번 실행에 받는 (위성, 날짜) 수 — 하나에 작은 영상 두 장(평양·단둥). 매시간 돌아 하루 48개까지 채운다 */
const MAX_TILES_PER_RUN = 2;
/** 자료가 이보다 오래되면 판정을 내지 않는다 (징후판에 '측정 불가') */
const STALE_DAYS = 6;

export function nightMetric(h: NightHistory, now: number): Metric | undefined {
  const dates = Object.keys(h.days).sort();
  const series = (s: NightSat, i: 0 | 1) => {
    const m = new Map<string, number>();
    for (const d of dates) {
      const v = h.days[d][s]?.[i];
      if (typeof v === "number") m.set(d, v);
    }
    return m;
  };
  const py = { n20: series("n20", 0), snpp: series("snpp", 0) };
  const dd = { n20: series("n20", 1), snpp: series("snpp", 1) };
  // 가장 최근 밤부터: 사이 날짜를 아직 못 받아 5일 창이 비면(3일 미만) 그 전날로 판정한다
  for (const last of dates.filter((d) => SATS.some((s) => h.days[d][s])).reverse().slice(0, 4)) {
    if (Date.parse(`${last}T00:00:00Z`) < now - STALE_DAYS * DAY) return undefined;
    const per: Partial<Record<NightSat, { pct: number; now: number; usual: number }>> = {};
    const ctl: number[] = [];
    for (const s of SATS) {
      const c = lightsChange(py[s], last);
      if (c) per[s] = c;
      const cc = lightsChange(dd[s], last);
      if (cc) ctl.push(cc.pct);
    }
    const m = nightReading(h, dates, last, per, ctl);
    if (m) return m;
  }
  return undefined;
}

function nightReading(h: NightHistory, dates: string[], last: string, per: Partial<Record<NightSat, { pct: number; now: number; usual: number }>>, ctl: number[]): Metric | undefined {
  const pcts = Object.values(per).map((c) => c!.pct);
  if (!pcts.length) return undefined;
  const value = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
  const lastNight = h.days[last].n20?.[0] ?? h.days[last].snpp?.[0];
  const recent = dates.filter((d) => d <= last).slice(-7).map((d) => ({ d: d.slice(5), n20: h.days[d].n20?.[0], snpp: h.days[d].snpp?.[0] }));
  return {
    indicator: "nk.pyongyang_lights_pct",
    value,
    meta: {
      dataDate: last,
      sats: Object.fromEntries(Object.entries(per).map(([k, c]) => [k, c!.pct])),
      brightNight: per.n20?.now ?? per.snpp?.now,
      usual: per.n20?.usual ?? per.snpp?.usual,
      lastNight,
      controlPct: ctl.length ? Math.round((ctl.reduce((a, b) => a + b, 0) / ctl.length) * 10) / 10 : undefined,
      recent,
      note: "평양 중심 밤 밝기 — 최근 5일 중 두 번째로 밝은 밤 ÷ 직전 28일 평소 (NASA VIIRS 위성 두 대 평균, 단위 nW/cm²·sr)",
    },
  };
}

export async function loadNightHistory(kv?: CollectorKv): Promise<NightHistory> {
  const saved = kv ? ((await kv.getKv(KV_KEY).catch(() => undefined)) ?? undefined) : undefined;
  const seed = seedHistory();
  if (!saved) return seed;
  const h = JSON.parse(saved) as NightHistory;
  for (const [d, x] of Object.entries(seed.days)) h.days[d] = { ...x, ...h.days[d] };
  h.tried ??= {};
  return h;
}

/** 아직 없는 (위성, 날짜) — 최근 날짜부터, 3시간 안에 시도한 것은 건너뛴다 */
export function pendingTiles(h: NightHistory, now: number): { sat: NightSat; day: string }[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const out: { sat: NightSat; day: string }[] = [];
  for (let k = 1; k <= LOOKBACK; k++) {
    const day = shift(today, -k);
    for (const sat of SATS) {
      if (h.days[day]?.[sat]) continue;
      if (now - (h.tried[`${sat}:${day}`] ?? 0) < RETRY_MS) continue;
      out.push({ sat, day });
    }
  }
  return out;
}

/** 영상 받기 — 아직 공개 전인 날은 투명 영상(또는 404 → null) */
async function fetchPng(url: string, timeoutMs = 20000): Promise<Uint8Array | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const b = new Uint8Array(await res.arrayBuffer());
    // WMS 는 오류를 200 + XML 로 돌려주기도 한다
    if (b[0] !== 0x89) throw new Error(`PNG 아님: ${new TextDecoder().decode(b.subarray(0, 120)).replace(/\s+/g, " ")}`);
    return b;
  } finally {
    clearTimeout(t);
  }
}

export async function collectNightLights(now = Date.now(), kv?: CollectorKv, get: (url: string) => Promise<Uint8Array | null> = fetchPng): Promise<CollectResult> {
  const h = await loadNightHistory(kv);
  const todo = pendingTiles(h, now).slice(0, MAX_TILES_PER_RUN);
  const errors: string[] = [];
  let got = 0;
  for (const { sat, day } of todo) {
    h.tried[`${sat}:${day}`] = now;
    try {
      // 아직 공개 전인 날(보통 어제 밤)은 투명 영상 → 3시간 뒤 다시. 그때는 단둥은 받지 않는다
      const pyPng = await get(nightUrl(sat, day, "pyongyang"));
      const py = pyPng ? await readNightPng(pyPng) : undefined;
      if (py === undefined) continue;
      const ddPng = await get(nightUrl(sat, day, "dandong")).catch(() => null);
      const dd = ddPng ? await readNightPng(ddPng).catch(() => undefined) : undefined;
      (h.days[day] ??= {})[sat] = [py, dd ?? null];
      got++;
    } catch (e) {
      errors.push(`${sat} ${day}: ${String((e as Error).message ?? e).slice(0, 80)}`);
    }
  }
  if (kv && todo.length) {
    const keep = shift(new Date(now).toISOString().slice(0, 10), -KEEP_DAYS);
    for (const d of Object.keys(h.days)) if (d < keep) delete h.days[d];
    for (const [k, t] of Object.entries(h.tried)) if (now - t > LOOKBACK * DAY) delete h.tried[k];
    await kv.setKv(KV_KEY, JSON.stringify(h)).catch(() => undefined);
  }
  const m = nightMetric(h, now);
  const last = Object.keys(h.days).sort().pop();
  return {
    source: "nightlights",
    ok: !!m,
    // 판정은 냈지만 일부 타일을 못 받은 경우도 적어 둔다 (대시보드 '정상' 옆에 작게 표시)
    error: m ? (errors.length ? errors.join("; ") : undefined) : [`최근 ${STALE_DAYS}일 위성 자료 없음 (마지막 ${last ?? "-"})`, ...errors].join("; "),
    fetchedAt: now,
    rawCount: got,
    signals: [],
    metrics: m ? [m] : [],
  };
}
