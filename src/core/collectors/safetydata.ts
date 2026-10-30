// 행정안전부 긴급재난문자 API (safetydata.go.kr DSSP-IF-00247)
// 응답 필드명은 공개 명세 기준(SN, CRT_DT, MSG_CN, RCPTN_RGN_NM, EMRG_STEP_NM, DST_SE_NM).
// 인증키 승인 후 '미리보기'로 실제 필드명을 한 번 확인할 것.
import type { CollectResult, Signal } from "../types.js";
import { classifyText } from "../classify.js";
import { fetchJson, parseKst } from "../util.js";

export async function collectSafetyData(apiKey: string | undefined, now = Date.now()): Promise<CollectResult> {
  if (!apiKey) return { source: "safetydata", ok: true, skipped: "SAFETYDATA_API_KEY 미설정", signals: [], fetchedAt: now, rawCount: 0 };
  const kstDate = new Date(now + 9 * 3600_000 - 24 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const url =
    `https://www.safetydata.go.kr/V2/api/DSSP-IF-00247?serviceKey=${encodeURIComponent(apiKey)}` +
    `&returnType=json&pageNo=1&numOfRows=100&crtDt=${kstDate}`;
  const data = await fetchJson<any>(url);
  const rows: any[] = Array.isArray(data.body) ? data.body : (data.body?.items ?? data.items ?? []);
  return { source: "safetydata", ok: true, fetchedAt: now, rawCount: rows.length, signals: parseSafetyData(rows, now) };
}

export function parseSafetyData(rows: any[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const r of rows) {
    const text: string = r.MSG_CN ?? r.msgCn ?? "";
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
      url: "https://www.safekorea.go.kr/idsiSFK/neo/sfk/cs/sfc/dis/disasterMsgList.jsp?menuSeq=679",
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
