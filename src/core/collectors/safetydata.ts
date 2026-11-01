// 긴급재난문자 — 키가 있으면 행정안전부 API(safetydata.go.kr DSSP-IF-00247), 없으면 국민재난안전포털 재난문자 목록(키 불필요, 최신 10건).
// 응답 필드명은 공개 명세 기준(SN, CRT_DT, MSG_CN, RCPTN_RGN_NM, EMRG_STEP_NM, DST_SE_NM) — 포털 목록도 같은 이름으로 바꿔 쓴다.
// 2026-11-01: 키(본인인증 필요)가 없어 그동안 이 출처를 아예 못 보고 있었다 → 포털 목록으로 키 없이 읽는다.
import type { CollectResult, Metric, Signal } from "../types.js";
import type { CollectorKv } from "./index.js";
import { classifyText } from "../classify.js";
import { USER_AGENT, fetchJson, parseKst } from "../util.js";

export const SAFEKOREA_LIST = "https://www.safekorea.go.kr/safekorea-kor/ctim/cmsg/calamitySms.do?menuSn=34&firstYn=Y";

/** 포털 재난문자 목록 표 → API 와 같은 필드 (재해구분 · 문자 · 발송일시 · 긴급단계 · 송출지역) */
export function parseSafekoreaList(html: string): any[] {
  const out: any[] = [];
  const clean = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const sn = /onSubmit\('(\d+)'\)/.exec(cells[1])?.[1];
    const msg = /<a[^>]*>([\s\S]*?)<\/a>/.exec(cells[1])?.[1];
    if (!sn || msg === undefined) continue;
    const info = clean(cells[1].slice(cells[1].indexOf("</a>")));
    const pick = (k: string) => new RegExp(`${k}\\s*:\\s*(.+?)(?=\\s*ㆍ|$)`).exec(info)?.[1]?.trim();
    out.push({ SN: sn, CRT_DT: pick("발송일시"), MSG_CN: clean(msg), RCPTN_RGN_NM: pick("송출지역"), EMRG_STEP_NM: pick("긴급단계"), DST_SE_NM: clean(cells[0]) });
  }
  return out;
}

export async function fetchSafekoreaMessages(fetchImpl: typeof fetch = fetch): Promise<any[]> {
  const res = await fetchImpl(SAFEKOREA_LIST, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`국민재난안전포털 HTTP ${res.status}`);
  const rows = parseSafekoreaList(await res.text());
  if (!rows.length) throw new Error("국민재난안전포털 재난문자 목록을 읽지 못함 (화면 구조가 바뀌었을 수 있음)");
  return rows;
}

/** 전쟁·북한과 관련된 재난문자인가 — 홍수·화재 문자에도 '대피하시기 바랍니다'가 흔해, 이 문맥이 없으면 공습 경보로 보지 않는다 */
export const WAR_CONTEXT_RE = /경계\s*경보|공습\s*경보|민방공|민방위\s*(경보|사태)|북한|北|미사일|포격|발사체|무력\s*도발|전쟁|적\s*(기|군|의\s*공격)|대남\s*(전단|풍선)|오물\s*풍선|미상\s*(물체|비행체|항적)/;
const WAR_TYPE_RE = /민방공|민방위|비상사태/;

/** 최근 lookbackDays 일 이후 발송된 재난문자 원문 (군사 무관 문자 포함) */
export async function fetchSafetyMessages(apiKey: string, now: number, lookbackDays = 1): Promise<any[]> {
  const kstDate = new Date(now + 9 * 3600_000 - lookbackDays * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const url =
    `https://www.safetydata.go.kr/V2/api/DSSP-IF-00247?serviceKey=${encodeURIComponent(apiKey)}` +
    `&returnType=json&pageNo=1&numOfRows=100&crtDt=${kstDate}`;
  const data = await fetchJson<any>(url);
  return Array.isArray(data.body) ? data.body : (data.body?.items ?? data.items ?? []);
}

/** 북한·민방공 관련 재난문자를 하루치 쌓아 '최근 6시간 몇 건(같은 문구는 1건)'을 낸다 — 포털은 최신 10건만 보여 줘서 5분마다 받아 모은다 */
export async function civilDefenseMetric(kv: CollectorKv | undefined, rows: any[], now: number): Promise<Metric> {
  type Seen = { sn: string; at: number; text: string; region?: string; step?: string; drill: boolean };
  const seen: Seen[] = kv ? JSON.parse((await kv.getKv("cd:alerts").catch(() => undefined)) ?? "[]") : [];
  const have = new Set(seen.map((x) => x.sn));
  for (const r of rows) {
    const text: string = r.MSG_CN ?? r.msgCn ?? "";
    if (!(WAR_CONTEXT_RE.test(text) || WAR_TYPE_RE.test(String(r.DST_SE_NM ?? "")))) continue;
    const sn = String(r.SN ?? r.sn);
    if (have.has(sn)) continue;
    have.add(sn);
    seen.push({ sn, at: parseKst(String(r.CRT_DT ?? r.crtDt ?? "")) ?? now, text: text.slice(0, 160), region: r.RCPTN_RGN_NM, step: r.EMRG_STEP_NM, drill: !!classifyText(text)?.drill || /훈련/.test(text) });
  }
  const keep = seen.filter((x) => now - x.at < 24 * 3600_000).slice(-200);
  if (kv) await kv.setKv("cd:alerts", JSON.stringify(keep)).catch(() => undefined);
  const recent = keep.filter((x) => now - x.at < 6 * 3600_000 && !x.drill);
  const distinct = new Map<string, Seen>();
  for (const x of recent) distinct.set(x.text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, ""), x);
  const latest = [...distinct.values()].sort((a, b) => b.at - a.at);
  return {
    indicator: "official.civil_defense_alerts_6h",
    value: distinct.size,
    meta: {
      checked: rows.length,
      newestAt: rows.map((r) => parseKst(String(r.CRT_DT ?? ""))).filter((x): x is number => !!x).sort((a, b) => b - a)[0],
      latest: latest.slice(0, 3).map((x) => ({ at: x.at, region: x.region, step: x.step, text: x.text })),
      drills: keep.filter((x) => x.drill && now - x.at < 6 * 3600_000).length,
      note: "국민재난안전포털 재난문자 중 경계·공습경보, 민방공, 북한·미사일·발사체·대남 풍선 관련 (같은 문구는 1건)",
    },
  };
}

export async function collectSafetyData(apiKey: string | undefined, now = Date.now(), kv?: CollectorKv, fetchImpl: typeof fetch = fetch): Promise<CollectResult> {
  const rows = apiKey ? await fetchSafetyMessages(apiKey, now) : await fetchSafekoreaMessages(fetchImpl);
  return { source: "safetydata", ok: true, fetchedAt: now, rawCount: rows.length, signals: parseSafetyData(rows, now), metrics: [await civilDefenseMetric(kv, rows, now)] };
}

export function parseSafetyData(rows: any[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const r of rows) {
    const text: string = r.MSG_CN ?? r.msgCn ?? "";
    // 홍수·화재·교통 문자는 버린다 — '대피하시기 바랍니다'만으로 공습 경보가 되지 않게 전쟁·북한 문맥이 있어야 한다
    if (!(WAR_CONTEXT_RE.test(text) || WAR_TYPE_RE.test(String(r.DST_SE_NM ?? "")))) continue;
    const cls = classifyText(text);
    // 기상·감염병 등 군사 무관 문자는 버린다 (오탐 억제)
    if (!cls) continue;
    const created = parseKst(String(r.CRT_DT ?? r.crtDt ?? ""));
    const region = r.RCPTN_RGN_NM ?? r.rcptnRgnNm ?? "";
    out.push({
      id: `safetydata:${r.SN ?? r.sn}`,
      source: "safetydata",
      sourceKind: "official",
      category: cls.category,
      title: `[${r.EMRG_STEP_NM ?? "재난문자"}] ${text.slice(0, 60)}`,
      summary: `${region} · 분류=${r.DST_SE_NM ?? "-"} · 키워드='${cls.matched}'`,
      url: `https://www.safekorea.go.kr/safekorea-kor/ctim/cmsg/calamitySmsView.do?menuSn=34&smsTrsmSn=${r.SN ?? r.sn}`,
      eventTime: created,
      publishedTime: created,
      detectedTime: now,
      severity: cls.severity,
      drill: cls.drill,
      retraction: cls.retraction,
      raw: { region, step: r.EMRG_STEP_NM, type: r.DST_SE_NM, text },
    });
  }
  return out;
}
