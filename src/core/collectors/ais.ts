// aisstream.io 선박 위치(AIS) — 무료 키 필요. 서해(한·중 어장, NLL) 선박 수와 국적 구성을 25초간 표본 수집한다.
// ⚠ 키 없이는 실측 검증을 하지 못했다 (메시지 파싱만 픽스처로 검증). 운영 전 fetch_source 로 한 번 확인할 것.
import type { CollectResult, Metric } from "../types.js";

export const YELLOW_SEA_BOX: [[number, number], [number, number]] = [[34, 122], [39.5, 126.5]];

/** MMSI 앞 3자리(MID) → 국가 */
export function flagOf(mmsi: number | string): "CN" | "KR" | "KP" | "other" {
  const mid = String(mmsi).slice(0, 3);
  if (["412", "413", "414"].includes(mid)) return "CN";
  if (["440", "441"].includes(mid)) return "KR";
  if (mid === "445") return "KP";
  return "other";
}

export interface VesselSample {
  vessels: Map<string, { flag: string; lat?: number; lon?: number; type?: number }>;
  messages: number;
}

/** aisstream 메시지 한 건을 표본에 반영 */
export function ingest(sample: VesselSample, msg: any) {
  const mmsi = msg?.MetaData?.MMSI ?? msg?.Message?.PositionReport?.UserID ?? msg?.Message?.ShipStaticData?.UserID;
  if (!mmsi) return;
  sample.messages++;
  const key = String(mmsi);
  const v = sample.vessels.get(key) ?? { flag: flagOf(mmsi) };
  const pr = msg.Message?.PositionReport;
  if (pr) {
    v.lat = pr.Latitude ?? msg.MetaData?.latitude;
    v.lon = pr.Longitude ?? msg.MetaData?.longitude;
  }
  const st = msg.Message?.ShipStaticData;
  if (st?.Type !== undefined) v.type = st.Type;
  sample.vessels.set(key, v);
}

export function vesselMetrics(sample: VesselSample): Metric[] {
  const all = [...sample.vessels.values()];
  const count = (f: string) => all.filter((v) => v.flag === f).length;
  const fishing = all.filter((v) => v.type !== undefined && v.type >= 30 && v.type <= 30).length;
  return [
    { indicator: "sea.ys_vessels_total", value: all.length, meta: { messages: sample.messages, KR: count("KR"), CN: count("CN"), KP: count("KP"), other: count("other"), fishingKnown: fishing } },
    { indicator: "sea.ys_china_vessels", value: count("CN") },
    { indicator: "sea.nk_flag_vessels", value: count("KP") },
  ];
}

/** 웹소켓으로 지정 시간 동안 메시지를 모은다. Node 22+ 와 Cloudflare Workers 양쪽 지원. */
export async function sampleAis(apiKey: string, box = YELLOW_SEA_BOX, ms = 25000): Promise<VesselSample> {
  const sample: VesselSample = { vessels: new Map(), messages: 0 };
  const subscribe = JSON.stringify({ APIKey: apiKey, BoundingBoxes: [box], FilterMessageTypes: ["PositionReport", "ShipStaticData"] });
  const ws = await openSocket("wss://stream.aisstream.io/v0/stream");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, ms);
    ws.addEventListener("message", (ev: any) => {
      try {
        const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const msg = JSON.parse(text);
        if (msg.error) {
          clearTimeout(timer);
          reject(new Error(`aisstream: ${msg.error}`));
          return;
        }
        ingest(sample, msg);
      } catch {
        /* 비정상 프레임 무시 */
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("aisstream 웹소켓 오류"));
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.send(subscribe);
  });
  return sample;
}

async function openSocket(url: string): Promise<any> {
  const g = globalThis as any;
  if (typeof g.WebSocket === "function") {
    const ws = new g.WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("웹소켓 연결 실패")), { once: true });
    });
    return ws;
  }
  // Cloudflare Workers: fetch + Upgrade
  const res = await fetch(url.replace(/^wss:/, "https:"), { headers: { Upgrade: "websocket" } });
  const ws = (res as any).webSocket;
  if (!ws) throw new Error(`웹소켓 업그레이드 실패 HTTP ${res.status}`);
  ws.accept();
  return ws;
}

export async function collectAis(apiKey: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!apiKey) return { source: "aisstream", ok: true, skipped: "AISSTREAM_API_KEY 미설정 (aisstream.io 무료 키)", signals: [], fetchedAt: now, rawCount: 0 };
  const sample = await sampleAis(apiKey);
  return { source: "aisstream", ok: true, fetchedAt: now, rawCount: sample.vessels.size, signals: [], metrics: vesselMetrics(sample) };
}
