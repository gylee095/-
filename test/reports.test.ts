// 고객 리포트 (2026-11-05): 단계가 바뀐 순간의 판정을 얼려 알림함에 쌓는다. 결제 직후 '가입 시점' 한 장.
// 고객은 결제 뒤에 생긴 변화 리포트와 자기 가입 시점 리포트만 본다.
import { describe, expect, it } from "vitest";
import { CURRENT_KEY, FULL_PREFIX, PHASE_TODO, addChangeReport, freezeState, loadFull, loadReports, oddsText, reportFromRisk, saveCurrent, snapshotForPurchase, summarize, visibleReports } from "../src/core/reports.js";
import { fmtRiskPct } from "../src/core/warrisk.js";
import { MemoryStore } from "../src/core/store.js";

const T = Date.UTC(2026, 10, 5, 3, 0);
const risk = (phase: number, clash = 3.8, over: Record<string, unknown> = {}) =>
  ({
    phase,
    phaseLabel: ["", "평온", "긴장", "위기", "임박", "교전"][phase],
    phaseReasons: phase >= 3 ? ["미국·일본이 동시에 여행경보를 올렸습니다", "북한 담화 수위가 높아졌습니다"] : ["북한 탄도미사일 발사가 이어졌습니다"],
    clash30d: { low: clash * 0.6, high: clash * 1.5, point: clash },
    war30d: { low: 0.1, high: 0.6, point: 0.3 },
    usual: { clash: 1.8, war: 0.2 },
    vsUsual: clash / 1.8,
    domains: [
      { id: "mil", label: "군사", level: 2, levelLabel: "주의", drivers: ["탄도미사일 2회", "항행경보"], measured: 5, total: 6 },
      { id: "gov", label: "정부", level: 0, levelLabel: "평소", drivers: [], measured: 4, total: 4 },
    ],
    tripwires: ["주한미군 가족 출국 권고", "국가안전보장회의 긴급 소집"],
    restraints: ["남북 군 통신선 정상 작동"],
    ...over,
  }) as any;

describe("리포트 내용", () => {
  it("단계 변화: 첫 줄은 무엇이 바뀌었나, 확률 문장은 확률 표기 정본(fmtRiskPct)으로", () => {
    const r = reportFromRisk(risk(3, 15), T, "change", 2);
    expect(r.headline).toBe("⬆ 나빠짐: 2단계 긴장 → 3단계 위기");
    expect(r.direction).toBe("up");
    expect(r.odds).toBe(`앞으로 30일 안 국지 충돌 약 ${fmtRiskPct(15)} (평소 약 ${fmtRiskPct(1.8)}의 8.3배) · 전면전 약 ${fmtRiskPct(0.3)}`);
    expect(r.todo).toBe(PHASE_TODO[3]);
    expect(r.domains).toEqual([{ label: "군사", levelLabel: "주의", drivers: ["탄도미사일 2회", "항행경보"] }]); // 평소인 영역은 뺀다
    expect(reportFromRisk(risk(2), T, "change", 3).headline).toBe("⬇ 좋아짐: 3단계 위기 → 2단계 긴장");
    expect(reportFromRisk(risk(2), T, "snapshot").headline).toBe("가입 시점 상황: 2단계 긴장");
  });
  it("평소와 비슷하면 '몇 배'가 아니라 '평소 수준'", () => {
    expect(oddsText(risk(2, 1.9))).toMatch(/\(평소 수준\)/);
  });
});

describe("쌓기", () => {
  it("같은 변화를 다시 보내도(보내기 실패 → 다음 주기 재시도) 리포트는 한 장", async () => {
    const store = new MemoryStore();
    const a = await addChangeReport(store, risk(3, 15), 2, T);
    const b = await addChangeReport(store, risk(3, 15), 2, T + 5 * 60_000);
    expect(b.id).toBe(a.id);
    const c = await addChangeReport(store, risk(2), 3, T + 7 * 3600_000); // 다른 변화는 새 장
    expect(c.id).not.toBe(a.id);
    expect((await loadReports(store)).map((r) => r.headline)).toEqual(["⬆ 나빠짐: 2단계 긴장 → 3단계 위기", "⬇ 좋아짐: 3단계 위기 → 2단계 긴장"]);
  });

  it("결제 순간의 첫 리포트: 5분마다 덮어 둔 현재 상황에서 꺼낸다. 아직 없으면 undefined, 결제마다 그 시각의 장을 따로 (11/5: 22:14 결제에 21:43 화면이 붙었다)", async () => {
    const store = new MemoryStore();
    expect(await snapshotForPurchase(store, T)).toBeUndefined();
    await saveCurrent(store, risk(2), T - 60_000);
    const s1 = await snapshotForPurchase(store, T);
    expect(s1).toMatchObject({ kind: "snapshot", at: T, headline: "가입 시점 상황: 2단계 긴장" });
    const s2 = await snapshotForPurchase(store, T + 3600_000);
    expect(s2!.id).not.toBe(s1!.id);
    expect(s2!.at).toBe(T + 3600_000); // 내용이 같아도 그 사람의 결제 시각
    await saveCurrent(store, risk(3, 15), T + 2 * 3600_000);
    const s3 = await snapshotForPurchase(store, T + 2 * 3600_000);
    expect(s3!.id).not.toBe(s1!.id);
    expect(JSON.parse((await store.getKv(CURRENT_KEY))!).phase).toBe(3);
  });
});

describe("고객이 보는 것", () => {
  it("자기 가입 시점 리포트 + 결제 뒤 변화 리포트만, 최신이 위 — 결제 전 변화·남의 가입 리포트는 안 보인다", async () => {
    const store = new MemoryStore();
    const before = await addChangeReport(store, risk(3, 15), 2, T - 86400_000);
    await saveCurrent(store, risk(3, 15), T - 60_000);
    const mine = (await snapshotForPurchase(store, T))!;
    await saveCurrent(store, risk(2), T + 3600_000);
    const others = (await snapshotForPurchase(store, T + 3600_000))!;
    const after = await addChangeReport(store, risk(2), 3, T + 2 * 3600_000);
    const seen = visibleReports(await loadReports(store), T, mine.id).map((r) => r.id);
    expect(seen).toEqual([after.id, mine.id]);
    expect(seen).not.toContain(before.id);
    expect(seen).not.toContain(others.id);
    expect(Object.keys(summarize(after)).sort()).toEqual(["at", "direction", "headline", "id", "kind", "phase", "phaseLabel"]); // 목록에는 본문이 없다
  });
});

describe("경로 규칙 (코드 검사)", () => {
  it("고객 알림은 단계 변화만; 무료 현재 상황 API 없음; 알림을 누르면 그 리포트", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
    expect(src("core/phasealert.ts")).toMatch(/audience: "all"/);
    expect(src("core/phasealert.ts")).toMatch(/addChangeReport\(/);
    expect(src("core/phasealert.ts")).toMatch(/\/me\?r=\$\{report\.id\}/);
    for (const p of ["core/pipeline.ts", "mcp/tools_deep.ts", "worker/index.ts", "mcp/tools.ts"]) expect(src(p), p).not.toMatch(/audience: "all"/);
    const idx = src("worker/index.ts");
    expect(idx).not.toMatch(/\/api\/public-state/);
    expect(src("worker/buy.ts")).not.toMatch(/public-state/);
    expect(idx).toMatch(/paidOrderByCode\(store/); // 알림함·리포트는 결제된 코드만
    expect(idx).toMatch(/snapshotForPurchase\(store/); // 결제완료 → 첫 리포트
  });
});

describe("리포트 = 그 순간의 대시보드 전체 (11/5: 요약은 정보량이 너무 적다)", () => {
  const state = { warRisk: risk(3, 15), board: [{ id: "x" }], events: [], notes: [{ text: "분석" }], alerts: [{ title: "운영자 알림 기록" }], usage: { tokens: 1 }, storage: { read: 1 }, phaseNotify: { phase: 3 } };

  it("운영자 전용(알림 기록·사용량·저장소·알림 상태)은 빼고 나머지는 그대로", () => {
    const f = freezeState(state as any);
    expect(Object.keys(f).sort()).toEqual(["board", "events", "notes", "warRisk"]);
  });
  it("단계 변화 리포트와 가입 리포트에 대시보드 전체가 함께 저장된다; 같은 변화를 다시 보내도 한 장", async () => {
    const store = new MemoryStore();
    const full = freezeState(state as any);
    const a = await addChangeReport(store, risk(3, 15), 2, T, full);
    expect(await loadFull(store, a.id)).toEqual(full);
    const again = await addChangeReport(store, risk(3, 15), 2, T + 60_000, full);
    expect(again.id).toBe(a.id);
    await saveCurrent(store, risk(3, 15), T);
    const s = (await snapshotForPurchase(store, T + 1000, full))!;
    expect(await loadFull(store, s.id)).toEqual(full);
    expect((await store.getKv(FULL_PREFIX + s.id))!.length).toBeGreaterThan(50);
  });
  it("결제마다 가입 리포트와 대시보드 전체가 따로 생긴다", async () => {
    const store = new MemoryStore();
    await saveCurrent(store, risk(2), T);
    const old = (await snapshotForPurchase(store, T))!; // 대시보드 전체 없이
    const now = (await snapshotForPurchase(store, T + 1000, freezeState(state as any)))!;
    expect(now.id).not.toBe(old.id);
    expect(await loadFull(store, now.id)).toBeTruthy();
  });
  it("리포트 화면: 결제된 코드 + 그 사람이 볼 수 있는 리포트만, 시계는 그 시각에 고정, 운영자 부분은 숨김 (코드 검사)", async () => {
    const { readFileSync } = await import("node:fs");
    const idx = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const route = idx.slice(idx.indexOf('url.pathname.startsWith("/r/")'), idx.indexOf('url.pathname === "/api/me"'));
    expect(route).toMatch(/paidOrderByCode\(store/);
    expect(route).toMatch(/visibleReports\(/);
    expect(route).toMatch(/Date\.now=\(function\(t\)\{return function\(\)\{return t\}\}\)\(\$\{r\.kind === "demo" \? Date\.now\(\) : r\.at\}\)/); // 실제 리포트는 그 시각, 예시는 만든 때
    expect(route).toMatch(/replace\(\/<\/g, "\\\\u003c"\)/); // 저장된 글에 </script> 가 있어도 화면이 깨지지 않게
    const dash = readFileSync(new URL("../src/worker/dashboard.ts", import.meta.url), "utf8");
    expect(dash).toMatch(/if\(!window\.__KEW_REPORT__\)sy\+='<div class=\"card sum\">'\+pushCard\(\)/); // 알림 받기 카드는 '시스템' 묶음 안, 리포트에서는 숨김 (11/11 화면 정리)
    expect(dash).toMatch(/← 알림 목록/);
  });
});


describe("예시 리포트 (운영자 화면 확인용, 11/5)", () => {
  it("붙인 주문에서만 보이고, 다른 구매자에게는 안 보인다", async () => {
    const { addDemoReports } = await import("../src/core/reports.js");
    const store = new MemoryStore();
    const full = freezeState({ warRisk: risk(2) } as any);
    const demos = await addDemoReports(store, risk(2), full, 3, T);
    expect(demos.map((d) => d.kind)).toEqual(["demo", "demo", "demo"]);
    expect(demos[0].headline).toMatch(/^🧪 예시 알림 1/);
    expect(await loadFull(store, demos[2].id)).toEqual(full);
    const all = await loadReports(store);
    const mine = visibleReports(all, T, undefined, demos.map((d) => d.id));
    expect(mine).toHaveLength(3);
    expect(visibleReports(all, T - 7 * 86400_000)).toHaveLength(0); // 다른 구매자(예시를 안 붙인 주문)
  });
});
