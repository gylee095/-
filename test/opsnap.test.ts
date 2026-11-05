// 운영자 알림 = 그때 화면 (2026-11-06): 알림을 누르면 실시간이 아니라 보낸 순간에 얼린 대시보드. 실시간은 /ops 로만
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/store.js";
import { loadFull } from "../src/core/reports.js";
import { sendPush } from "../src/core/notify.js";
import { OPSNAP_PREFIX, pointToSnapshot, setOpsSnapshotMaker, snapSig } from "../src/core/opsnap.js";

const BASE = "https://koreasiren.com";
const env = { KEW_SECRET: "test-secret-0123456789abcdef", DASHBOARD_URL: BASE, NTFY_TOPIC: "kew-t", NTFY_SERVER: "https://ntfy.example" } as any;
afterEach(() => setOpsSnapshotMaker(undefined));

function capture() {
  const sent: any[] = [];
  const f = (async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response("ok"); }) as unknown as typeof fetch;
  return { sent, f };
}

describe("운영자 알림 링크 = 그때 화면", () => {
  it("운영자 알림을 보내면 그 순간의 대시보드를 얼리고, 링크·본문이 그 화면을 가리킨다 (사건 위치 #… 유지)", async () => {
    setOpsSnapshotMaker(async () => ({ warRisk: { phase: 2 }, board: [] }));
    const store = new MemoryStore();
    const { sent, f } = capture();
    await sendPush(env, { title: "주의 · 북한 발사", body: `지금 한반도 상황 : 2단계\n대시보드 : ${BASE}/ops`, priority: 4, url: `${BASE}/ops#ev1` }, f, store);
    const click: string = sent[0].click;
    const m = /^https:\/\/koreasiren\.com\/ops\/r\/(o_[a-z0-9]+_[0-9a-f]{8})\?s=([0-9a-f]{32})#ev1$/.exec(click);
    expect(m, click).toBeTruthy();
    expect(m![2]).toBe(await snapSig(env.KEW_SECRET, m![1]));
    expect(sent[0].message).toContain(`그때 화면 : ${click}`);
    expect(await loadFull(store, m![1])).toEqual({ warRisk: { phase: 2 }, board: [] });
    expect(JSON.parse((await store.getKv(OPSNAP_PREFIX + m![1]))!).title).toBe("주의 · 북한 발사");
  });

  it("손님 단계 알림(audience all)·/ops 가 아닌 링크·화면을 못 만들 때는 그대로", async () => {
    setOpsSnapshotMaker(async () => ({}));
    const store = new MemoryStore();
    const { sent, f } = capture();
    await sendPush(env, { audience: "all", title: "단계", body: "b", priority: 4, url: `${BASE}/me?r=r1` }, f, store);
    expect(sent[0].click).toBe(`${BASE}/me?r=r1`);
    setOpsSnapshotMaker(async () => { throw new Error("CPU"); });
    await sendPush(env, { title: "t", body: "b", priority: 3, url: `${BASE}/ops` }, f, store);
    expect(sent[1].click).toBe(`${BASE}/ops`); // 얼리기 실패해도 알림은 간다
  });

  it("본문 속 실시간 링크를 모두 바꾸고, 바꾼 링크를 다시 망가뜨리지 않는다", () => {
    const snap = `${BASE}/ops/r/o_x_1?s=ab`;
    const out = pointToSnapshot({ url: `${BASE}/ops`, body: `대시보드 : ${BASE}/ops\n또 ${BASE}/ops` }, BASE, snap);
    expect(out.url).toBe(snap);
    expect(out.body).toBe(`그때 화면 : ${snap}\n또 ${snap}`);
  });

  it("서명은 비밀값·번호마다 다르다 — 번호를 바꿔 다른 화면을 열 수 없다", async () => {
    expect(await snapSig("a-secret-value-000000000000", "o_1")).not.toBe(await snapSig("a-secret-value-000000000000", "o_2"));
    expect(await snapSig("a-secret-value-000000000000", "o_1")).not.toBe(await snapSig("b-secret-value-000000000000", "o_1"));
  });

  it("화면 코드: /ops/r/ 는 서명을 확인하고 시계를 그 시각에 고정, 운영자 폰의 단계 알림은 그때 화면으로", async () => {
    const { readFileSync } = await import("node:fs");
    const idx = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
    const route = idx.slice(idx.indexOf('url.pathname.startsWith("/ops/r/")'), idx.indexOf('url.pathname.startsWith("/r/") && req.method'));
    expect(route).toMatch(/safeEq\(sig, await snapSig\(env\.KEW_SECRET, id\)\)/);
    expect(route).toMatch(/Date\.now=\(function\(t\)\{return function\(\)\{return t\}\}\)\(\$\{meta\.at\}\)/);
    expect(readFileSync(new URL("../src/worker/me.ts", import.meta.url), "utf8")).toMatch(/\/api\/ops\/report-link\?id=/);
    expect(readFileSync(new URL("../src/worker/dashboard.ts", import.meta.url), "utf8")).toMatch(/알림 때의 화면 — <b>고정된 화면이에요 \(실시간 아님\)<\/b>/);
  });
});
