// NGA MSI Broadcast Warnings (HYDROPAC 등). 발사 예고·사격 구역·GPS 교란 항행경보는 '선행 신호'다.
import type { CollectResult, Metric, Signal } from "../types.js";
import { classifyText } from "../classify.js";
import { fetchJson, parseDtg } from "../util.js";

export async function fetchNgaWarnings(): Promise<any[]> {
  const data = await fetchJson<any>("https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A");
  return data["broadcast-warn"] ?? [];
}

/** 지표용 '한반도 주변' 판정은 신호용(isKoreaRelevant)보다 좁다 — 일본 열도 일반 경보는 제외 */
const KOREA_WATERS_RE = /KOREA|DPRK|YELLOW SEA|SEA OF JAPAN|EAST SEA|TSUSHIMA|KOREA STRAIT|PYONGYANG/i;

/** 한반도 관련 유효 경보 수와 발사 예고 경보 수 */
export function navwarnMetrics(rows: any[]): Metric[] {
  const korea = rows.filter((r) => KOREA_WATERS_RE.test(String(r.text ?? "")));
  const launch = korea.filter((r) => /ROCKET|MISSILE|SATELLITE LAUNCH|SPACE DEBRIS/i.test(String(r.text ?? "").replace(/CANCEL THIS MSG[^\n]*/gi, "")));
  return [
    { indicator: "navwarn.korea_active", value: korea.length, meta: { refs: korea.slice(0, 8).map((r) => `${r.navArea}-${r.msgNumber}/${r.msgYear}`) } },
    { indicator: "navwarn.launch_notice_active", value: launch.length, meta: { refs: launch.map((r) => ({ ref: `${r.navArea}-${r.msgNumber}/${r.msgYear}`, authority: r.authority, head: String(r.text ?? "").split("\n").slice(0, 4).join(" ").slice(0, 160) })) } },
  ];
}

export async function collectNga(now = Date.now()): Promise<CollectResult> {
  const rows = await fetchNgaWarnings();
  return { source: "nga_msi", ok: true, fetchedAt: now, rawCount: rows.length, signals: parseNga(rows, now), metrics: navwarnMetrics(rows) };
}

/** 경보문에서 첫 번째 좌표("38-12.00N 124-30.00E")를 추출 */
function firstCoord(text: string): { lat: number; lon: number } | undefined {
  const m = /(\d{1,2})-(\d{2}(?:\.\d+)?)([NS])\s+(\d{1,3})-(\d{2}(?:\.\d+)?)([EW])/.exec(text);
  if (!m) return undefined;
  const lat = (+m[1] + +m[2] / 60) * (m[3] === "S" ? -1 : 1);
  const lon = (+m[4] + +m[5] / 60) * (m[6] === "W" ? -1 : 1);
  return { lat, lon };
}

/** 지역 + 핵심 문장(로켓·사격·GPS 등)으로 제목 구성 */
function headline(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const region = lines.filter((l) => /^[A-Z .]+\.$/.test(l)).map((l) => l.replace(/\.$/, "")).join("/");
  const key = lines.find((l) => /ROCKET|MISSILE|GUNNERY|FIRING|GPS|GNSS|SPACE DEBRIS|HAZARDOUS/i.test(l)) ?? lines[0] ?? "";
  return `${region ? region + " — " : ""}${key.replace(/^\d+\.\s*/, "")}`.slice(0, 100);
}

export function parseNga(rows: any[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const r of rows) {
    const text: string = r.text ?? "";
    // 영문 항행경보는 한반도 주변 지역명이 있을 때만 (중동·대서양 경보 제외)
    // 'CANCEL THIS MSG <DTG>'는 모든 항행경보의 자동 만료 문구이므로 정정으로 보지 않는다
    const cls = classifyText(text.replace(/CANCEL THIS MSG[^\n]*/gi, ""), { requireRegion: true });
    if (!cls) continue;
    // 항행경보 맥락에서 'MISSILE'은 발사 예고이므로 launch_notice 로 정규화
    const category = cls.category === "missile" ? "launch_notice" : cls.category;
    if (!["launch_notice", "gps_interference", "nuclear_test", "artillery"].includes(category)) continue;
    let severity = cls.category === "missile" ? 55 : cls.severity;
    // 북한이 직접 통보한 발사 예고 구역은 별도로 가중
    if (category === "launch_notice" && /NORTH KOREA|DPRK/i.test(text) && severity >= 55) severity = 65;
    const issued = parseDtg(String(r.issueDate ?? ""));
    const c = firstCoord(text);
    const ref = `${r.navArea}-${r.msgYear}-${r.msgNumber}`;
    out.push({
      id: `nga_msi:${ref}`,
      source: "nga_msi",
      sourceKind: "official",
      category,
      title: `항행경보 ${r.navArea === "P" ? "HYDROPAC" : `NAVAREA ${r.navArea}`} ${r.msgNumber}/${String(r.msgYear).slice(-2)}: ${headline(text)}`,
      summary: text.replace(/\s+/g, " ").slice(0, 300),
      url: "https://msi.nga.mil/NavWarnings",
      lat: c?.lat,
      lon: c?.lon,
      // 항행경보의 '사건 시각'은 예고된 미래 구간인 경우가 많아 발행 시각만 기록
      eventTime: undefined,
      publishedTime: issued,
      detectedTime: now,
      severity,
      drill: false,
      retraction: cls.retraction,
      raw: { ref, authority: r.authority },
    });
  }
  return out;
}
