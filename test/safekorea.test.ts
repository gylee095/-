// 재난문자 — 키 없이 국민재난안전포털 목록으로 읽는다 (2026-11-01). 홍수·화재 문자의 '대피'를 공습 경보로 착각하지 않는다.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { civilDefenseMetric, collectSafetyData, parseSafekoreaList, parseSafetyData } from "../src/core/collectors/safetydata.js";
import { MemoryStore } from "../src/core/store.js";
import { INDICATOR_BY_ID, evaluate } from "../src/core/indicators.js";

const html = readFileSync(new URL("./fixtures/safekorea_sms_list_20261101.html", import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 1, 13, 30); // 22:30 KST
const row = (SN: string, MSG_CN: string, at = "2026/11/01 22:00:00", DST_SE_NM = "기타", RCPTN_RGN_NM = "서울특별시 전체") => ({ SN, CRT_DT: at, MSG_CN, RCPTN_RGN_NM, EMRG_STEP_NM: "긴급재난", DST_SE_NM });

describe("국민재난안전포털 재난문자 목록", () => {
  it("실제 목록(2026-11-01 밤): 10건 — 재해구분·문자·발송일시·긴급단계·송출지역", () => {
    const rows = parseSafekoreaList(html);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ SN: "269905", DST_SE_NM: "호우", CRT_DT: "2026/11/01 22:22:05", EMRG_STEP_NM: "안전안내", RCPTN_RGN_NM: "부산광역시 금정구" });
    expect(rows[0].MSG_CN).toMatch(/^\[금정구\] 오늘 22:20부 온천천/);
  });
  it("실제 목록의 호우·화재·교통 문자는 전쟁 신호가 아니다", () => {
    expect(parseSafetyData(parseSafekoreaList(html), NOW)).toHaveLength(0);
  });
});

describe("전쟁·북한 관련 재난문자만 고른다", () => {
  const seoul2023 = row("1", "[서울특별시] 오늘 6시 32분 서울지역에 경계경보 발령. 국민 여러분께서는 대피할 준비를 하시고, 어린이와 노약자가 우선 대피할 수 있도록 해 주시기 바랍니다.", "2026/11/01 21:32:00", "민방공");
  const flood = row("2", "[○○군] 하천 수위 상승으로 저지대 주민은 인근 대피소로 대피하시기 바랍니다.", "2026/11/01 21:40:00", "호우");
  const balloon = row("3", "[인천광역시] 북한 대남 오물풍선 식별. 낙하물 발견 시 접촉하지 말고 군부대나 경찰에 신고 바랍니다.", "2026/11/01 21:50:00", "기타", "인천광역시 전체");
  const drill = row("4", "[행정안전부] 민방위 훈련 공습경보 발령 중입니다(훈련 상황). 가까운 대피소로 이동하십시오.", "2026/11/01 21:55:00", "민방공");
  it("2023-05-31 서울 '경계경보 발령' 문구 → 민방위 경보 신호, 홍수 '대피' 문자 → 무시", () => {
    const sig = parseSafetyData([seoul2023, flood], NOW);
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ category: "air_raid_alert", sourceKind: "official" });
  });
  it("지표: 최근 6시간 북한·민방공 문자 수(같은 문구는 지역이 달라도 1건, 훈련 제외) → 2건이면 '이상'", async () => {
    const kv = new MemoryStore();
    const copies = [row("5", seoul2023.MSG_CN.replace("[서울특별시]", "[경기도]"), "2026/11/01 21:33:00", "민방공", "경기도 전체")];
    const m = await civilDefenseMetric(kv, [seoul2023, ...copies, flood, balloon, drill], NOW);
    expect(m.value).toBe(2); // 경계경보(서울·경기 같은 문구) 1 + 오물풍선 1
    expect((m.meta as any).drills).toBe(1);
    expect(evaluate(INDICATOR_BY_ID["official.civil_defense_alerts_6h"], m.value, NOW, undefined).state).toBe("anomalous");
    // 5분 뒤 목록에서 사라져도 쌓아 둔 기록으로 계속 센다 (포털은 최신 10건만 보여 준다)
    expect((await civilDefenseMetric(kv, [], NOW + 5 * 60_000)).value).toBe(2);
    // 6시간이 지나면 빠진다
    expect((await civilDefenseMetric(kv, [], NOW + 7 * 3600_000)).value).toBe(0);
  });
  it("키가 없으면 포털 목록으로 수집하고, 목록을 못 읽으면 '0'이 아니라 실패로 알린다", async () => {
    const ok = await collectSafetyData(undefined, NOW, new MemoryStore(), (async () => new Response(html)) as unknown as typeof fetch);
    expect(ok).toMatchObject({ ok: true, rawCount: 10 });
    expect(ok.metrics![0]).toMatchObject({ indicator: "official.civil_defense_alerts_6h", value: 0 });
    await expect(collectSafetyData(undefined, NOW, new MemoryStore(), (async () => new Response("<html>점검 중</html>")) as unknown as typeof fetch)).rejects.toThrow(/읽지 못함/);
  });
});
