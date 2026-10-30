// aisstream.io 선박 위치(AIS) — 무료 키 필요. 한반도 해역 선박 수를 25초간 표본 수집한다.
// 실측(2026-10-31, Worker): 한반도 전 해역 25초 7척(전부 한국 선박), 중국 동부 연안·발해만 25초 0척, 도쿄만 10초 9척, 전 세계 8초 542척.
// → aisstream 은 자원봉사 지상 수신기 기반이라 중국 연안·서해 수신소가 없다. 중국·북한 국적 선박 지표는 내지 않는다(0 이 기준선이 되면 오해를 부른다).
//   서해 중국 어선은 위성 AIS 기반 Global Fishing Watch(3~5일 지연)로만 볼 수 있다.
import type { CollectResult, Metric } from "../types.js";

export const YELLOW_SEA_BOX: [[number, number], [number, number]] = [[34, 122], [39.5, 126.5]];
/** 수집기 기본 범위: 한반도 전 해역 (서해만으로는 수신 0척) */
export const KOREA_WATERS_BOX: [[number, number], [number, number]] = [[33, 123], [43, 132]];

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
  /** 연결 진단 (키·구독·수신 범위 문제를 구분하기 위해) */
  diag?: { frames: number; parseErrors: number; dataTypes: string[]; firstFrame?: string; closeCode?: number; closeReason?: string };
}

/** 프레임 데이터를 문자열로 (문자열·ArrayBuffer·Uint8Array·Blob 모두 처리) */
async function frameText(data: any): Promise<string> {
  if (typeof data === "string") return data;
  if (data && typeof data.text === "function") return data.text(); // Blob
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new TextDecoder().decode(data as ArrayBuffer);
  return String(data);
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
  const diag: NonNullable<VesselSample["diag"]> = { frames: 0, parseErrors: 0, dataTypes: [] };
  const sample: VesselSample = { vessels: new Map(), messages: 0, diag };
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
    ws.addEventListener("message", async (ev: any) => {
      diag.frames++;
      const t = ev.data?.constructor?.name ?? typeof ev.data;
      if (!diag.dataTypes.includes(t)) diag.dataTypes.push(t);
      try {
        const text = await frameText(ev.data);
        if (!diag.firstFrame) diag.firstFrame = text.slice(0, 240);
        const msg = JSON.parse(text);
        if (msg.error) {
          clearTimeout(timer);
          reject(new Error(`aisstream: ${msg.error}`));
          return;
        }
        ingest(sample, msg);
      } catch {
        diag.parseErrors++;
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("aisstream 웹소켓 오류"));
    });
    ws.addEventListener("close", (ev: any) => {
      diag.closeCode = ev?.code;
      diag.closeReason = ev?.reason;
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
  const sample = await sampleAis(apiKey, KOREA_WATERS_BOX);
  const d = sample.diag;
  // 메시지가 0건이면 기준선을 오염시키지 않도록 관측값을 내지 않고 사유를 남긴다
  if (sample.messages === 0) {
    return { source: "aisstream", ok: false, error: `25초 동안 선박 메시지 0건 (프레임 ${d?.frames ?? 0}, 파싱오류 ${d?.parseErrors ?? 0}${d?.closeCode ? `, 종료코드 ${d.closeCode} ${d.closeReason ?? ""}` : ""})`, fetchedAt: now, rawCount: 0, signals: [] };
  }
  // 수신 범위가 한국 연안 일부뿐이므로 총 선박 수만 참고 지표로 낸다
  return { source: "aisstream", ok: true, fetchedAt: now, rawCount: sample.vessels.size, signals: [], metrics: vesselMetrics(sample).filter((m) => m.indicator === "sea.ys_vessels_total") };
}
