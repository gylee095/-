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
  /** 상승(+)·하강(-) 속도 ft/min */
  vertRate?: number;
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

/** 전 세계 군용 표시 항공기 중 동북아 범위 — adsb.lol 과 adsb.fi 는 수신자 망이 달라 합치면 더 많이 보인다(같은 기체는 한 번만) */
export const MIL_FEEDS = ["https://api.adsb.lol/v2/mil", "https://opendata.adsb.fi/api/v2/mil"];
export async function fetchMilitaryNeAsia(): Promise<{ now: number; aircraft: Aircraft[] }> {
  const res = await Promise.allSettled(MIL_FEEDS.map((u) => fetchJson<any>(u, {}, 20000)));
  const ok = res.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
  return { now: ok[0].now ?? Date.now(), aircraft: mergeAircraft(ok.map((d) => filterNeAsia((d.ac ?? d.aircraft ?? []).map(normalize)))) };
}

/** 여러 수신망의 같은 기체(hex)는 하나로 */
export function mergeAircraft(lists: Aircraft[][]): Aircraft[] {
  const by = new Map<string, Aircraft>();
  for (const list of lists) for (const a of list) if (a.icao24 && !by.has(a.icao24)) by.set(a.icao24, a);
  return [...by.values()];
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
    vertRate: typeof a.baro_rate === "number" ? a.baro_rate : typeof a.geom_rate === "number" ? a.geom_rate : undefined,
  };
}

// ── 엘리트·큰손: 한국 기업 업무용 제트기 출국 ──
// 한국 등록(HL) 업무용 제트기는 대부분 대기업 소유다. 누가 탔는지는 알 수 없고 알려고 하지도 않는다 — 하루 출국 대수만 센다.
// 기체 고유번호는 하루 안의 중복 제거용 해시로만 쓰고 이틀 뒤 지운다.
export const BIZJET_TYPES = /^(GLF[2-6]|GA[5-8]C|G280|G150|GL5T|GL6T|GL7T|GL8T|GLEX|CL30|CL35|CL60|FA7X|FA8X|FA6X|F900|F2TH|FA50|E35L|E545|E550|E55P|C680|C68A|C700|C750|C56X|LJ45|LJ60|LJ75|H25B|PC24)$/i;
/** 한국 영역 대략 (출국 상승 중인 기체만 센다) */
const KOREA_BOX = { minLat: 33, maxLat: 38.7, minLon: 124.5, maxLon: 131 };

export type JetPhase = "d" | "a" | "c";

/** 한국 등록 업무용 제트기 중 공중에 있는 것 — 상승 중이고 낮으면 출국(d), 하강 중이고 낮으면 도착(a), 나머지는 순항(c) */
export function koreanBizjets(ac: Aircraft[]): { hash: string; phase: JetPhase }[] {
  return ac
    .filter((a) => !a.onGround && /^HL/i.test(a.registration ?? "") && BIZJET_TYPES.test(a.type ?? ""))
    .map((a) => {
      const low = (a.altitudeFt ?? 99999) < 25000;
      const inKorea = a.lat !== undefined && a.lon !== undefined && a.lat >= KOREA_BOX.minLat && a.lat <= KOREA_BOX.maxLat && a.lon >= KOREA_BOX.minLon && a.lon <= KOREA_BOX.maxLon;
      const phase: JetPhase = low && inKorea && (a.vertRate ?? 0) > 300 ? "d" : low && inKorea && (a.vertRate ?? 0) < -300 ? "a" : "c";
      return { hash: hashId(a.icao24), phase };
    });
}

function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

export interface JetDay {
  /** 해시 → 그날 처음 본 상태 */
  first: Record<string, JetPhase>;
}

export interface JetHistory {
  /** 한국 날짜 → 그날 출국(d) 대수 */
  dep: Record<string, number>;
}

const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 이번 표본을 오늘 기록에 더한다 (같은 기체는 그날 처음 본 상태로만 센다) */
export function updateJetDay(day: JetDay, seen: { hash: string; phase: JetPhase }[]): JetDay {
  const first = { ...day.first };
  for (const s of seen) if (!(s.hash in first)) first[s.hash] = s.phase;
  return { first };
}

export function jetMetric(hist: JetHistory, now: number): Metric | undefined {
  const today = kstDate(now);
  const yesterday = kstDate(now - 86400_000);
  const past = Object.entries(hist.dep).filter(([d]) => d < yesterday).sort(([a], [b]) => a.localeCompare(b)).slice(-28);
  // 1주일은 쌓여야 평소를 안다 — 그 전에는 '측정 불가'가 아니라 '학습 중 (n/7일)'로 보여 준다
  if (past.length < 7 || hist.dep[yesterday] === undefined)
    return { indicator: "elite.kr_bizjets", value: 0, meta: { learning: true, learningDays: past.length + (hist.dep[yesterday] !== undefined ? 1 : 0), need: 8, departures: hist.dep[yesterday], todaySoFar: hist.dep[today] ?? 0, note: "평소를 알려면 8일치(어제 + 이전 7일)가 필요 — 기록 쌓는 중 (개인 식별 없음)" } };
  const sorted = past.map(([, n]) => n).sort((a, b) => a - b);
  const usual = Math.max(1, sorted[Math.floor(sorted.length / 2)]);
  const dep = hist.dep[yesterday];
  let ratio = Math.round((dep / usual) * 100);
  if (dep < 4) ratio = Math.min(ratio, 199); // 몇 대 차이로는 판단하지 않는다
  return {
    indicator: "elite.kr_bizjets",
    value: ratio,
    meta: { date: yesterday, departures: dep, usual, todaySoFar: hist.dep[today] ?? 0, days: past.length, note: "한국 등록 업무용 제트기 하루 출국 대수 ÷ 지난 4주 중앙값 (개인 식별 없음)" },
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

/** 오늘 본 한국 기업 제트기를 KV 에 쌓고, 하루 출국 대수 이력으로 지표를 만든다 */
export async function trackBizjets(kv: { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> }, ac: Aircraft[], now: number): Promise<Metric | undefined> {
  const today = kstDate(now);
  const saved = JSON.parse((await kv.getKv("bizjet:today")) ?? "null") as { date: string; first: Record<string, JetPhase> } | null;
  const day = updateJetDay({ first: saved && saved.date === today ? saved.first : {} }, koreanBizjets(ac));
  await kv.setKv("bizjet:today", JSON.stringify({ date: today, first: day.first }));
  const hist = JSON.parse((await kv.getKv("bizjet:hist")) ?? '{"dep":{}}') as JetHistory;
  hist.dep[today] = Object.values(day.first).filter((p) => p === "d").length;
  for (const d of Object.keys(hist.dep)) if (d < kstDate(now - 60 * 86400_000)) delete hist.dep[d];
  await kv.setKv("bizjet:hist", JSON.stringify(hist));
  return jetMetric(hist, now);
}

export async function collectAdsb(now = Date.now(), kv?: { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> }): Promise<CollectResult> {
  const [korea, mil] = await Promise.allSettled([fetchAircraft(AIR_REGIONS.korea), fetchMilitaryNeAsia()]);
  if (korea.status === "rejected") throw korea.reason;
  const k = korea.value;
  const m = mil.status === "fulfilled" ? mil.value.aircraft : [];
  const metrics = airMetrics(k.aircraft, m);
  if (kv) {
    const jet = await trackBizjets(kv, k.aircraft, now).catch(() => undefined);
    if (jet) metrics.push(jet);
  }
  return {
    source: "adsb_lol",
    ok: true,
    error: mil.status === "rejected" ? `군용기 목록 실패: ${String(mil.reason).slice(0, 80)}` : undefined,
    fetchedAt: now,
    rawCount: k.aircraft.length + m.length,
    signals: emergencySignals([...k.aircraft, ...m], k.now, now),
    metrics,
  };
}
