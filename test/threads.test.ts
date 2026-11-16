import { describe, expect, it } from "vitest";
import { correlate } from "../src/core/correlate.js";
import { MemoryStore } from "../src/core/store.js";
import {
  INTRO_TEXTS, NEWS_TEXTS, PROMO_IMAGES, THREADS_TOPIC, SIGNAL_COUNT, THREADS_GAP_MS, THREADS_MAX_CHARS, THREADS_STATE_KEY, THREADS_TOKEN_KEY,
  maybePostThreads, maybePostThreadsRise, postThreadsManual, riseOf, RISE_HOLD_MS, newsLine, postable, refreshThreadsToken, threadsText, type ThreadsState,
} from "../src/core/threads.js";
import type { CrisisEvent, Signal } from "../src/core/types.js";
import { OFFICIAL_KEY } from "../src/core/official.js";

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
  it("모든 글에 '전쟁'이 들어간다 (검색 최신 탭에 뜨게)", () => {
    for (const t of all) expect(t).toContain("전쟁");
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

// 채점표 모양만 흉내 낸 근접도: index(%)와 켜진 징조·움직임·배경 항목
const prox = (index: number, on: string[], ctx: string[] = []) => ({
  index,
  rubric: { index, layers: [
    { id: "signs", groups: [{ items: ["i_leader_threat", "i_pretext"].map((id) => ({ id, ko: id, got: on.includes(id) ? 1 : 0 })) }] },
    { id: "moves", groups: [{ items: ["m_airspace", "a_nk_dark", "m_gps_ew"].map((id) => ({ id, ko: id, got: on.includes(id) ? 1 : 0 })) }] },
    { id: "context", groups: [{ items: ["w_us_war", "p_search"].map((id) => ({ id, ko: id, got: ctx.includes(id) ? 1 : 0 })) }] },
  ] },
});
async function withMorning(p: ReturnType<typeof prox>) {
  const store = new MemoryStore();
  await store.setKv(OFFICIAL_KEY, JSON.stringify({ proximity: p }));
  return store;
}

describe("① 앱 소개 — 앱의 % 가 의미 있게 올랐을 때 (11/16 사용자)", () => {
  it("배경만 늘거나, 잡음 항목(북한 인터넷 장애)만 켜지거나, 5%p 미만이면 오른 게 아니다", () => {
    const m = prox(17, [], ["w_us_war"]);
    expect(riseOf(prox(19, [], ["w_us_war", "p_search"]), m).up).toBe(false); // 배경만 +1
    expect(riseOf(prox(25, [], ["w_us_war", "p_search"]), m).up).toBe(false); // 배경만으로 크게 올라도
    expect(riseOf(prox(20, ["a_nk_dark"], ["w_us_war"]), m).up).toBe(false); // 인터넷 장애 하나
    expect(riseOf(prox(25, ["a_nk_dark"], ["w_us_war", "p_search"]), m).up).toBe(false); // 인터넷 장애 + 배경
    expect(riseOf(prox(20, ["m_airspace"], ["w_us_war"]), m).up).toBe(false); // 진짜 움직임이지만 +3%p
    expect(riseOf(prox(23, ["m_airspace", "a_nk_dark"], ["w_us_war"]), m)).toMatchObject({ up: true, pts: 6, added: ["m_airspace"] });
    expect(riseOf(prox(23, ["m_airspace"]), undefined).up).toBe(false); // 아침 판정 없음
  });
  it("30분 이어져야 올리고, 예시 화면 2장을 넘겨 보기로 붙이며, 하루 한 번", async () => {
    const store = await withMorning(prox(17, []));
    const { f, calls } = fakeApi();
    const live = { proximity: prox(23, ["m_airspace", "i_pretext"]) };
    expect((await maybePostThreadsRise(env, store, live, T0, f, noSleep)).skipped).toMatch(/30분/);
    expect((await maybePostThreadsRise(env, store, live, T0 + 10 * 60_000, f, noSleep)).skipped).toMatch(/30분/);
    expect(calls).toHaveLength(0);
    const r = await maybePostThreadsRise(env, store, live, T0 + RISE_HOLD_MS, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, kind: "intro", style: "I1", images: 2 });
    const made = posts(calls);
    expect(made.map((c) => c.body.get("media_type"))).toEqual(["IMAGE", "IMAGE", "CAROUSEL"]);
    expect(made.slice(0, 2).map((c) => c.body.get("image_url"))).toEqual(PROMO_IMAGES.map((p) => "https://koreasiren.com" + p));
    expect(made.slice(0, 2).every((c) => c.body.get("is_carousel_item") === "true")).toBe(true);
    expect(made[2].body.get("children")).toBe("box1,box2");
    expect(r.posted!.text).not.toMatch(/%|단계\(|\d단계/);
    expect((await maybePostThreadsRise(env, store, live, T0 + 5 * 3600_000, f, noSleep)).skipped).toMatch(/오늘 이미/);
  });
  it("중간에 내려가면 처음부터 다시 잰다", async () => {
    const store = await withMorning(prox(17, []));
    const { f, calls } = fakeApi();
    const up = { proximity: prox(23, ["m_airspace", "i_pretext"]) }, down = { proximity: prox(17, []) };
    await maybePostThreadsRise(env, store, up, T0, f, noSleep);
    await maybePostThreadsRise(env, store, down, T0 + 20 * 60_000, f, noSleep);
    expect((await maybePostThreadsRise(env, store, up, T0 + 35 * 60_000, f, noSleep)).skipped).toMatch(/30분/);
    expect(calls).toHaveLength(0);
  });
  it("사진 올리기가 안 되면 글만이라도 올린다", async () => {
    const store = await withMorning(prox(17, []));
    const { f, calls } = fakeApi(["IMAGE"]);
    const live = { proximity: prox(23, ["m_airspace", "i_pretext"]) };
    await maybePostThreadsRise(env, store, live, T0, f, noSleep);
    const r = await maybePostThreadsRise(env, store, live, T0 + RISE_HOLD_MS, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, images: 0 });
    expect(posts(calls).map((c) => c.body.get("media_type"))).toEqual(["IMAGE", "TEXT"]);
  });
  it("뉴스 글과 같은 하루 한도·간격을 나눠 쓴다; 시험 서버·토큰 없음은 건너뛴다", async () => {
    const store = await withMorning(prox(17, []));
    const { f } = fakeApi();
    const live = { proximity: prox(23, ["m_airspace", "i_pretext"]) };
    await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    await maybePostThreadsRise(env, store, live, T0 + 60_000, f, noSleep);
    expect((await maybePostThreadsRise(env, store, live, T0 + 60_000 + RISE_HOLD_MS, f, noSleep)).skipped).toMatch(/2시간/);
    expect((await maybePostThreadsRise(env, store, live, T0 + THREADS_GAP_MS + 1, f, noSleep)).posted).toMatchObject({ ok: true, style: "I1" });
    expect((await maybePostThreadsRise({ ...env, STAGING: "1" }, store, live, T0, f)).skipped).toMatch(/시험 서버/);
    expect((await maybePostThreadsRise({ PUBLIC_URL: "x" } as any, store, live, T0, f)).skipped).toMatch(/토큰 없음/);
  });
});

describe("③ 개발 소식 — 사용자가 시킬 때 (11/16)", () => {
  it("받은 글을 그대로 글만으로 올리고 기록한다; 한도·간격은 보지 않는다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    const r = await postThreadsManual(env, store, "오늘 고친 것\n- 알림 화면 글씨를 키웠어요\nkoreasiren.com", T0 + 60_000, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true, kind: "dev" });
    expect(posts(calls).pop()!.body.get("text")).toBe("오늘 고친 것\n- 알림 화면 글씨를 키웠어요\nkoreasiren.com");
  });
  it("intro 를 주면 정해 둔 소개 문장 + 예시 화면 2장을 지금 올리고, 다음 자동 소개는 다음 문장", async () => {
    const store = await withMorning(prox(17, []));
    const { f, calls } = fakeApi();
    const r = await postThreadsManual(env, store, "", T0, f, noSleep, { intro: true });
    expect(r.posted).toMatchObject({ ok: true, kind: "intro", style: "I1", images: 2 });
    expect(posts(calls).map((c) => c.body.get("media_type"))).toEqual(["IMAGE", "IMAGE", "CAROUSEL"]);
    const live = { proximity: prox(23, ["m_airspace", "i_pretext"]) };
    await maybePostThreadsRise(env, store, live, T0 + THREADS_GAP_MS, f, noSleep);
    expect((await maybePostThreadsRise(env, store, live, T0 + THREADS_GAP_MS + RISE_HOLD_MS, f, noSleep)).posted).toMatchObject({ style: "I2" });
  });
  it("빈 글·500자 넘는 글·시험 서버·토큰 없음은 올리지 않는다", async () => {
    const store = new MemoryStore();
    const { f, calls } = fakeApi();
    expect((await postThreadsManual(env, store, "  ", T0, f)).skipped).toMatch(/비어/);
    expect((await postThreadsManual(env, store, "가".repeat(501), T0, f)).skipped).toMatch(/500자/);
    expect((await postThreadsManual({ ...env, STAGING: "1" }, store, "a", T0, f)).skipped).toMatch(/시험 서버/);
    expect((await postThreadsManual({ PUBLIC_URL: "x" } as any, store, "a", T0, f)).skipped).toMatch(/토큰 없음/);
    expect(calls).toHaveLength(0);
  });
});

describe("주제 태그 (11/16 사용자)", () => {
  it("글만·사진 묶음·개발 소식 모두 '전쟁' 태그를 단다 (사진 한 장씩 담는 것에는 달지 않는다)", async () => {
    expect(THREADS_TOPIC).toBe("전쟁");
    const store = await withMorning(prox(17, []));
    const { f, calls } = fakeApi();
    await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    await postThreadsManual(env, store, "", T0 + 60_000, f, noSleep, { intro: true });
    await postThreadsManual(env, store, "11.16\n\n- 고침", T0 + 120_000, f, noSleep);
    const made = posts(calls);
    expect(made.map((c) => [c.body.get("media_type"), c.body.get("topic_tag")])).toEqual([
      ["TEXT", "전쟁"], ["IMAGE", null], ["IMAGE", null], ["CAROUSEL", "전쟁"], ["TEXT", "전쟁"],
    ]);
  });
  it("태그 때문에 거절되면 태그 없이 다시 담아 올린다", async () => {
    const store = new MemoryStore();
    const calls: URLSearchParams[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      calls.push(body);
      if (body.get("topic_tag")) return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100 } }), { status: 400 });
      return new Response(JSON.stringify({ id: url.endsWith("threads_publish") ? "post1" : "box1" }));
    }) as unknown as typeof fetch;
    const r = await maybePostThreads(env, store, report(launch()), T0, f, noSleep);
    expect(r.posted).toMatchObject({ ok: true });
    expect(calls.map((b) => b.get("topic_tag"))).toEqual(["전쟁", null, null]);
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
