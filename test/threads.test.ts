import { describe, expect, it } from "vitest";
import { correlate } from "../src/core/correlate.js";
import { MemoryStore } from "../src/core/store.js";
import { OFFICIAL_KEY, OFFICIAL_PREV_KEY } from "../src/core/official.js";
import { STYLES, THREADS_GAP_MS, THREADS_MAX_CHARS, THREADS_STATE_KEY, THREADS_TOKEN_KEY, maybePostThreads, postable, refreshThreadsToken, threadsText, verdictOf, type ThreadsState } from "../src/core/threads.js";
import type { CrisisEvent, Signal } from "../src/core/types.js";

const T0 = Date.UTC(2026, 10, 12, 3, 0);
const media = (i: number, title: string, t: number, citesOfficial = true, breaking = false): Signal => ({
  id: `m${i}`, source: i % 2 ? "rss_news" : "yonhap", sourceKind: "media", category: "missile",
  title, summary: "", url: `https://news.example/${i}`, publishedTime: t, detectedTime: t + 60_000, severity: 75, citesOfficial, breaking,
});
function launch(t = T0, tag = 0): CrisisEvent {
  const sigs = [media(tag * 10 + 1, '[속보] 합참 "北, 동해상으로 탄도미사일 발사"', t, true, true), media(tag * 10 + 2, '합참 "북한, 동해상으로 탄도미사일 2발 발사"', t + 120_000)];
  const e = correlate(sigs)[0];
  e.evidence = sigs;
  return e;
}
const off = (phase: number, label: string, clash: number) => ({ day: "2026-11-12", at: T0, reason: "daily", phase, phaseLabel: label, clash30d: { point: clash }, war30d: { point: 0.2 } }) as any;

function fakeApi(fail: string[] = []) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
    if (fail.some((p) => url.includes(p))) return new Response(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }), { status: 400 });
    if (url.includes("refresh_access_token")) return new Response(JSON.stringify({ access_token: "NEW", expires_in: 5183944 }));
    return new Response(JSON.stringify({ id: url.endsWith("threads_publish") ? "post1" : "box1" }));
  }) as unknown as typeof fetch;
  return { f, calls };
}
const env = { THREADS_ACCESS_TOKEN: "TOK", PUBLIC_URL: "https://koreasiren.com", BARK_KEY: "k" } as any;
const report = (e: CrisisEvent, sent = true, kind = "new") => ({ alerts: [{ eventId: e.id, kind, sent }], events: [e] });
const noSleep = async () => {};

describe("스레드 글", () => {
  const facts = { headline: "북한, 탄도미사일 2 발 발사 → 동해", label: "공식확인", ...verdictOf(off(2, "긴장", 3.8), off(2, "긴장", 3.6)), url: "https://koreasiren.com" };
  it("네 틀 모두 500자 안, 주소·사건·판정이 들어가고 undefined 가 없다", () => {
    for (const s of STYLES) {
      const t = threadsText(s, facts);
      expect(t.length, s).toBeLessThanOrEqual(THREADS_MAX_CHARS);
      expect(t, s).toContain("https://koreasiren.com");
      expect(t, s).toContain("탄도미사일");
      expect(t, s).toContain("2단계(긴장)");
      expect(t, s).toContain("약 4%");
      expect(t, s).not.toMatch(/undefined|false|\n{3}/);
    }
  });
  it("판정 기록이 없으면 판정 줄을 빼고, 긴 제목은 줄인다", () => {
    for (const s of STYLES) {
      const t = threadsText(s, { headline: "가".repeat(600), label: "교차확인", url: "https://koreasiren.com" });
      expect(t.length).toBeLessThanOrEqual(THREADS_MAX_CHARS);
      expect(t).toContain("https://koreasiren.com");
      expect(t).not.toMatch(/단계\(|undefined/);
    }
  });
  it("어제와 단계가 다르면 그 말을 쓴다", () => {
    expect(verdictOf(off(3, "위기", 12), off(2, "긴장", 3.8)).change).toBe("어제 2단계에서 올라감");
    expect(verdictOf(off(2, "긴장", 3.8), off(2, "긴장", 3.8)).change).toBe("어제와 같은 단계");
  });
  it("손님인 척하는 후기·장담 문구가 없다 (코드 검사)", async () => {
    const { readFileSync } = await import("node:fs");
    const all = STYLES.map((s) => threadsText(s, facts)).join("\n");
    expect(all).not.toMatch(/써\s*봤|대박|후기|안전합니다|100%|적중/);
    // 고객에게 가는 알림은 phasealert.ts 한 곳뿐 — 실패 알림은 운영자에게만
    expect(readFileSync(new URL("../src/core/threads.ts", import.meta.url), "utf8")).not.toMatch(/audience: "all"/);
  });
});

describe("언제 올리나", () => {
  it("운영자 알림이 나간 발사 사건을 한 번 올린다 (담기 → 공개, 토큰은 본문으로)", async () => {
    const store = new MemoryStore();
    await store.setKv(OFFICIAL_KEY, JSON.stringify(off(2, "긴장", 3.8)));
    await store.setKv(OFFICIAL_PREV_KEY, JSON.stringify(off(2, "긴장", 3.6)));
    const { f, calls } = fakeApi();
    const e = launch();
    const r = await maybePostThreads(env, store, report(e), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, postId: "post1", style: "A", eventId: e.id });
    expect(calls.map((c) => c.url)).toEqual(["https://graph.threads.com/v1.0/me/threads", "https://graph.threads.com/v1.0/me/threads_publish"]);
    expect(calls[0].body.get("media_type")).toBe("TEXT");
    expect(calls[0].body.get("text")).toContain("2단계(긴장)");
    expect(calls[0].url).not.toContain("TOK");
    expect(calls[1].body.get("creation_id")).toBe("box1");
    // 같은 사건은 다시 올리지 않는다 (상향 알림이 와도)
    expect((await maybePostThreads(env, store, report(e, true, "upgrade"), T0 + 3 * 3600_000, f, noSleep)).skipped).toMatch(/올릴 만한 사건 없음/);
    expect(calls).toHaveLength(2);
  });
  it("토큰 없음·시험 서버·알림이 안 나간 사건·정정 알림은 올리지 않는다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    const e = launch();
    expect((await maybePostThreads({ PUBLIC_URL: "x" } as any, store, report(e), T0, f)).skipped).toMatch(/토큰 없음/);
    expect((await maybePostThreads({ ...env, STAGING: "1" }, store, report(e), T0, f)).skipped).toMatch(/시험 서버/);
    expect((await maybePostThreads(env, store, report(e, false), T0, f)).skipped).toMatch(/알림 없음/);
    expect((await maybePostThreads(env, store, report(e, true, "correction"), T0, f)).skipped).toMatch(/알림 없음/);
    expect(calls).toHaveLength(0);
  });
  it("훈련·정정·확인 안 된 단일 보도는 공개로 올리지 않는다", () => {
    expect(postable(launch()).ok).toBe(true);
    expect(postable({ ...launch(), drill: true }).ok).toBe(false);
    expect(postable({ ...launch(), retracted: true }).ok).toBe(false);
    expect(postable({ ...launch(), status: "UNVERIFIED", basis: "media", breaking: false }).ok).toBe(false);
    expect(postable({ ...launch(), status: "UNVERIFIED", basis: "official_quote", breaking: true })).toMatchObject({ ok: true, label: "속보·공식발표 인용" });
  });
  it("2시간 간격·하루 3번 한도, 틀은 A→B→C 로 번갈아", async () => {
    const store = new MemoryStore();
    const { f } = fakeApi();
    const styles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const at = T0 + i * (THREADS_GAP_MS + 60_000);
      if (i === 1) expect((await maybePostThreads(env, store, report(launch(at - 3600_000, 9)), at - 3600_000, f, noSleep)).skipped).toMatch(/2시간/);
      styles.push((await maybePostThreads(env, store, report(launch(at, i + 1)), at, f, noSleep)).posted!.style);
    }
    expect(styles).toEqual(["A", "B", "C"]);
    const at = T0 + 3 * (THREADS_GAP_MS + 60_000);
    expect((await maybePostThreads(env, store, report(launch(at, 5)), at, f, noSleep)).skipped).toMatch(/하루 3번/);
  });
  it("올리지 못하면 기록하고 운영자에게 하루 한 번만 알린다 — 다음 사건은 다시 시도한다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi(["/me/threads"]);
    const r = await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: false });
    expect(r.posted!.error).toMatch(/190/);
    expect(r.posted!.error).not.toContain("TOK");
    const pushes = () => calls.filter((c) => c.url.includes("api.day.app")).length;
    expect(pushes()).toBe(1);
    await maybePostThreads(env, store, report(launch(T0 + 600_000, 2)), T0 + 600_000, f, noSleep);
    expect(pushes()).toBe(1);
    const st = JSON.parse((await store.getKv(THREADS_STATE_KEY))!) as ThreadsState;
    expect(st.log).toHaveLength(2);
    expect(Object.keys(st.posted)).toHaveLength(0);
  });
});

describe("토큰 새로 받기", () => {
  it("일주일에 한 번 새로 받아 쓰고, 비밀값을 바꿔 넣으면 예전 것은 버린다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    expect(await refreshThreadsToken(env, store, T0, f)).toBe("refreshed");
    expect(await refreshThreadsToken(env, store, T0 + 86400_000, f)).toBe("skipped");
    await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    expect(calls[calls.length - 1].body.get("access_token")).toBe("NEW");
    const env2 = { ...env, THREADS_ACCESS_TOKEN: "TOK2" };
    await maybePostThreads(env2, store, report(launch(T0, 3)), T0 + THREADS_GAP_MS + 1, f, noSleep);
    expect(calls[calls.length - 1].body.get("access_token")).toBe("TOK2");
    expect(JSON.parse((await store.getKv(THREADS_TOKEN_KEY))!).token).toBe("NEW");
    expect(await refreshThreadsToken({ ...env, STAGING: "1" }, store, T0 + 30 * 86400_000, f)).toBe("skipped");
  });
});
