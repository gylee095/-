// OpenSky Network ADS-B: 비상 스쿼크 + 한반도 상공 항공기 수 급감(공역 통제 의심)
// 한반도는 OpenSky 수신기 커버리지가 희박하므로 이 소스 단독 신호는 항상 미확인(UNVERIFIED)이다.
import type { CollectResult, Signal } from "../types.js";
import { fetchJson, fetchText } from "../util.js";

export const KOREA_AIR_BOX = { lamin: 33.0, lomin: 124.0, lamax: 39.5, lomax: 131.0 };

const SQUAWK: Record<string, { label: string; severity: number }> = {
  "7500": { label: "불법 납치(7500)", severity: 60 },
  "7600": { label: "통신 두절(7600)", severity: 25 },
  "7700": { label: "비상(7700)", severity: 35 },
};

async function getToken(id: string, secret: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret });
  const txt = await fetchText(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return JSON.parse(txt).access_token;
}

export async function collectOpenSky(
  creds: { id?: string; secret?: string },
  now = Date.now(),
): Promise<CollectResult> {
  const headers: Record<string, string> = {};
  if (creds.id && creds.secret) headers.Authorization = `Bearer ${await getToken(creds.id, creds.secret)}`;
  const b = KOREA_AIR_BOX;
  const data = await fetchJson<any>(
    `https://opensky-network.org/api/states/all?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`,
    { headers },
  );
  const states: any[] = data.states ?? [];
  return {
    source: "opensky",
    ok: true,
    fetchedAt: now,
    rawCount: states.length,
    signals: parseOpenSky(states, (data.time ?? now / 1000) * 1000, now),
    meta: { airborne: states.filter((s) => s[8] === false).length },
  };
}

export function parseOpenSky(states: any[], dataTime: number, now: number): Signal[] {
  const out: Signal[] = [];
  for (const s of states) {
    const sq = SQUAWK[s[14]];
    if (!sq || s[8] === true) continue;
    const callsign = String(s[1] ?? "").trim() || s[0];
    out.push({
      // 같은 항공기·같은 스쿼크는 1시간 버킷 안에서 하나의 신호
      id: `opensky:${s[0]}:${s[14]}:${Math.floor(dataTime / 3600_000)}`,
      source: "opensky",
      sourceKind: "sensor",
      category: "aviation_emergency",
      title: `항공기 ${callsign} 비상 스쿼크 ${sq.label}`,
      summary: `ICAO24=${s[0]} 국적=${s[2]} 고도=${s[7] ?? "?"}m`,
      url: `https://globe.adsbexchange.com/?icao=${s[0]}`,
      lat: s[6],
      lon: s[5],
      eventTime: (s[4] ?? dataTime / 1000) * 1000,
      publishedTime: dataTime,
      detectedTime: now,
      severity: sq.severity,
    });
  }
  return out;
}

/**
 * 시간대별 기준선(EWMA) 대비 항공기 수 급감 감지.
 * 기준선이 충분히 크고(≥ minBaseline) 현재 수가 ratio 미만일 때만 신호를 만든다.
 */
export function airspaceAnomaly(
  airborne: number,
  baseline: number | undefined,
  now: number,
  opts = { ratio: 0.4, minBaseline: 25 },
): Signal | null {
  if (baseline === undefined || baseline < opts.minBaseline) return null;
  if (airborne >= baseline * opts.ratio) return null;
  const bucket = Math.floor(now / (30 * 60_000));
  return {
    id: `opensky:airspace:${bucket}`,
    source: "opensky",
    sourceKind: "sensor",
    category: "airspace_anomaly",
    title: `한반도 상공 항공기 급감: ${airborne}대 (평소 ${baseline.toFixed(0)}대)`,
    summary: "공역 통제 가능성. 단, 수신기 장애·커버리지 결측일 수 있음",
    url: "https://opensky-network.org/network/explorer",
    lat: 37.5,
    lon: 127.5,
    eventTime: undefined,
    publishedTime: now,
    detectedTime: now,
    severity: airborne < baseline * 0.15 ? 60 : 45,
  };
}

export function updateBaseline(prev: number | undefined, value: number, alpha = 0.2): number {
  return prev === undefined ? value : prev * (1 - alpha) + value * alpha;
}
