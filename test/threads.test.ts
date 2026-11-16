import { describe, expect, it } from "vitest";
import { correlate } from "../src/core/correlate.js";
import { MemoryStore } from "../src/core/store.js";
import {
  INTRO_TEXTS, NEWS_TEXTS, PROMO_IMAGES, SIGNAL_COUNT, THREADS_GAP_MS, THREADS_MAX_CHARS, THREADS_STATE_KEY, THREADS_TOKEN_KEY,
  maybePostThreads, maybePostThreadsSearch, newsLine, postable, refreshThreadsToken, threadsText, type ThreadsState,
} from "../src/core/threads.js";
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

function fakeApi(fail: string[] = []) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url, body });
    const tag = url.endsWith("threads_publish") ? "publish" : body.get("media_type") ?? "";
    if (fail.some((p) => tag === p || url.includes(p))) return new Response(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }), { status: 400 });
    if (url.includes("refresh_access_token")) return new Response(JSON.stringify({ access_token: "NEW", expires_in: 5183944 }));
    return new Response(JSON.stringify({ id: tag === "publish" ? "post1" : `box${++n}` }));
  }) as unknown as typeof fetch;
  return { f, calls };
}
const env = { THREADS_ACCESS_TOKEN: "TOK", PUBLIC_URL: "https://koreasiren.com", BARK_KEY: "k" } as any;
const report = (e: CrisisEvent, sent = true, kind = "new") => ({ alerts: [{ eventId: e.id, kind, sent }], events: [e] });
const nv = (value: number, dataDate = "2026-11-15") => [{ indicator: "psych.naver_war_search", value, state: value >= 200 ? "elevated" : "normal", meta: { dataDate, worstGroup: "전쟁 불안" } }];
const noSleep = async () => {};
const posts = (calls: { url: string; body: URLSearchParams }[]) => calls.filter((c) => c.url.includes("/me/threads") && !c.url.endsWith("publish"));

describe("글 (11/16 사용자: 담백하게, 판정은 넣지 않는다)", () => {
  const all = [...INTRO_TEXTS.map((_, i) => threadsText("intro", i, "koreasiren.com").text), ...NEWS_TEXTS.map((_, i) => threadsText("news", i, "koreasiren.com", "북한, 탄도미사일 2 발 발사 → 동해").text)];
  it("모든 글이 500자 안이고 주소가 들어가며 같은 글이 없다", () => {
    for (const t of all) {
      expect(t.length).toBeLessThanOrEqual(THREADS_MAX_CHARS);
      expect(t).toContain("koreasiren.com");
      expect(t).not.toMatch(/undefined|\n{3}/);
    }
    expect(new Set(all).size).toBe(all.length);
  });
  it("우리 판정(단계 숫자·%·어제 대비·검색 배율)은 넣지 않는다 — 결제한 손님이 받는 정보", () => {
    for (const t of all) expect(t).not.toMatch(/\d단계|\d+(\.\d+)?%|어제와|배였|평소의 \d/);
  });
  it("후기·장담·공포 문구가 없고, 신호 수는 웹사이트와 같다", async () => {
    const { readFileSync } = await import("node:fs");
    for (const t of all) expect(t).not.toMatch(/써\s*봤|대박|후기|안전합니다|100%|적중|큰일|지금 당장|🚨/);
    expect(readFileSync(new URL("../src/worker/landing.ts", import.meta.url), "utf8")).toContain(`${SIGNAL_COUNT}가지 신호`);
    expect(readFileSync(new URL("../src/core/threads.ts", import.meta.url), "utf8")).not.toMatch(/audience: "all"/);
  });
  it("문장을 번갈아 쓴다 (소개 I1→I4→I1, 뉴스 N1→N3→N1)", () => {
    expect(INTRO_TEXTS.map((_, i) => threadsText("intro", i, "x").style)).toEqual(["I1", "I2", "I3", "I4"]);
    expect(threadsText("intro", 4, "x").style).toBe("I1");
    expect(threadsText("news", 3, "x", "a").style).toBe("N1");
  });
  it("확인 전 속보는 그렇다고 적고, 긴 사건 줄은 줄인다", () => {
    expect(newsLine("북한, 미사일 발사", true)).toBe("북한, 미사일 발사 (속보, 아직 확인 중)");
    expect(newsLine("북한, 탄도미사일 2 발 발사 → 동해", false)).toBe("북한, 탄도미사일 2발 발사 → 동해");
    expect(threadsText("news", 0, "koreasiren.com", "가".repeat(600)).text.length).toBeLessThanOrEqual(THREADS_MAX_CHARS);
  });
});

describe("② 큰 뉴스 — 발사·포격 사건 알림이 나가면", () => {
  it("사건 한 줄 + 짧은 소개를 글만으로 한 번 올린다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    const e = launch();
    const r = await maybePostThreads(env, store, report(e), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, postId: "post1", style: "N1", kind: "news", images: 0, eventId: e.id });
    expect(calls.map((c) => c.url)).toEqual(["https://graph.threads.com/v1.0/me/threads", "https://graph.threads.com/v1.0/me/threads_publish"]);
    expect(calls[0].body.get("media_type")).toBe("TEXT");
    expect(calls[0].body.get("text")).toMatch(/^북한, 탄도미사일/);
    expect(calls[0].body.get("text")).not.toMatch(/\d 발/);
    expect(calls[0].body.get("text")).toContain("koreasiren.com");
    expect(calls[0].url).not.toContain("TOK");
    expect((await maybePostThreads(env, store, report(e, true, "upgrade"), T0 + 3 * 3600_000, f, noSleep)).skipped).toMatch(/올릴 만한 사건 없음/);
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
  it("훈련·정정·확인 안 된 단일 보도는 올리지 않는다", () => {
    expect(postable(launch()).ok).toBe(true);
    expect(postable({ ...launch(), drill: true }).ok).toBe(false);
    expect(postable({ ...launch(), retracted: true }).ok).toBe(false);
    expect(postable({ ...launch(), status: "UNVERIFIED", basis: "media", breaking: false }).ok).toBe(false);
    expect(postable({ ...launch(), status: "UNVERIFIED", basis: "official_quote", breaking: true })).toMatchObject({ ok: true, unconfirmed: true });
  });
  it("2시간 간격·하루 3번 한도, 문장은 N1→N2→N3", async () => {
    const store = new MemoryStore();
    const { f } = fakeApi();
    const styles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const at = T0 + i * (THREADS_GAP_MS + 60_000);
      if (i === 1) expect((await maybePostThreads(env, store, report(launch(at - 3600_000, 9)), at - 3600_000, f, noSleep)).skipped).toMatch(/2시간/);
      styles.push((await maybePostThreads(env, store, report(launch(at, i + 1)), at, f, noSleep)).posted!.style);
    }
    expect(styles).toEqual(["N1", "N2", "N3"]);
    const at = T0 + 3 * (THREADS_GAP_MS + 60_000);
    expect((await maybePostThreads(env, store, report(launch(at, 5)), at, f, noSleep)).skipped).toMatch(/하루 3번/);
  });
  it("올리지 못하면 기록하고 운영자에게 하루 한 번만 알린다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi(["TEXT"]);
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

describe("① 앱 소개 — 네이버 전쟁 불안 검색이 오른 날", () => {
  it("평소의 1.5배 이상이면 예시 화면 2장을 넘겨 보기로 붙여 한 번 올린다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    expect((await maybePostThreadsSearch(env, store, nv(149), T0, f, noSleep)).skipped).toMatch(/문턱 150%/);
    expect(calls).toHaveLength(0);
    const r = await maybePostThreadsSearch(env, store, nv(206), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, kind: "intro", style: "I1", images: 2, eventId: "search:2026-11-15" });
    const made = posts(calls);
    expect(made.map((c) => c.body.get("media_type"))).toEqual(["IMAGE", "IMAGE", "CAROUSEL"]);
    expect(made.slice(0, 2).map((c) => c.body.get("image_url"))).toEqual(PROMO_IMAGES.map((p) => "https://koreasiren.com" + p));
    expect(made.slice(0, 2).every((c) => c.body.get("is_carousel_item") === "true")).toBe(true);
    expect(made[2].body.get("children")).toBe("box1,box2");
    expect(made[2].body.get("text")).toBe(r.posted!.text);
    expect(r.posted!.text).not.toMatch(/배|%/);
    expect((await maybePostThreadsSearch(env, store, nv(206), T0 + 5 * 3600_000, f, noSleep)).skipped).toMatch(/이미 올림/);
  });
  it("사진 올리기가 안 되면 글만이라도 올린다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi(["IMAGE"]);
    const r = await maybePostThreadsSearch(env, store, nv(300), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, images: 0 });
    expect(posts(calls).map((c) => c.body.get("media_type"))).toEqual(["IMAGE", "TEXT"]);
  });
  it("뉴스 글과 같은 하루 한도·간격을 나눠 쓰고, 문장 차례는 따로 센다", async () => {
    const store = new MemoryStore();
    const { f } = fakeApi();
    await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    expect((await maybePostThreadsSearch(env, store, nv(300), T0 + 3600_000, f, noSleep)).skipped).toMatch(/2시간/);
    expect((await maybePostThreadsSearch(env, store, nv(300), T0 + THREADS_GAP_MS + 1, f, noSleep)).posted).toMatchObject({ ok: true, style: "I1" });
  });
  it("문턱은 THREADS_SEARCH_MIN, 시험 서버·토큰 없음·자료 없음은 건너뛴다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    expect((await maybePostThreadsSearch({ ...env, THREADS_SEARCH_MIN: "300" }, store, nv(250), T0, f)).skipped).toMatch(/문턱 300%/);
    expect((await maybePostThreadsSearch({ ...env, STAGING: "1" }, store, nv(500), T0, f)).skipped).toMatch(/시험 서버/);
    expect((await maybePostThreadsSearch({ PUBLIC_URL: "x" } as any, store, nv(500), T0, f)).skipped).toMatch(/토큰 없음/);
    expect((await maybePostThreadsSearch(env, store, [], T0, f)).skipped).toMatch(/검색량 없음/);
    expect(calls).toHaveLength(0);
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

describe("예시 화면", () => {
  it("서버가 두 장을 JPEG 로 내준다", async () => {
    const { PROMO_JPG_BASE64 } = await import("../src/worker/promo.js");
    for (const p of PROMO_IMAGES) {
      const bytes = Uint8Array.from(atob(PROMO_JPG_BASE64[p]), (c) => c.charCodeAt(0));
      expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    }
  });
});
