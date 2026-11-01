// 일본 해상보안청 NAVAREA XI — 북한이 위성 발사 전 낙하 구역을 통보하는 곳 (2026-11-01부터 직접 읽는다)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessJcg, collectNga, coordsOf, jcgSignals, khoaActive, navwarnMetrics, parseJcgBody, parseJcgList, parseKhoaList, type JcgWarning } from "../src/core/collectors/nga.js";
import { MemoryStore } from "../src/core/store.js";
import { INDICATOR_BY_ID, evaluate } from "../src/core/indicators.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 1, 5);
const warning = (file: string, tana: string, title: string): JcgWarning => ({ tana, number: tana.slice(2), category: "その他", title, ...parseJcgBody(fx(file)) });

describe("해상보안청 목록·본문 읽기", () => {
  it("실제 목록(2026-11-01): 유효 경보 14건, '유효 일람·삭제 일람' 안내문은 뺀다", () => {
    const list = parseJcgList(fx("jcg_navarea11_list_20261101.xml"));
    expect(list).toHaveLength(14);
    expect(list.some((x) => /有効一覧|削除一覧/.test(x.title))).toBe(false);
    expect(list[0]).toMatchObject({ tana: "260491", number: "0491", category: "航路標識" });
  });
  it("실제 본문(0486): 영문 전문과 게재 시각(일본 시간 21시 = UTC 12시), 좌표 8개", () => {
    const b = parseJcgBody(fx("jcg_navarea11_260486_20261028.html"));
    expect(b.issued).toBe(Date.UTC(2026, 9, 28, 12));
    expect(b.text).toMatch(/^NAVAREA XI\nNO\.26-0486/);
    expect(b.text).toMatch(/ROCKET LAUNCHING/);
    const pts = coordsOf(b.text);
    expect(pts).toHaveLength(8);
    expect(pts[0].lat).toBeCloseTo(24 + 28 / 60 + 29 / 3600, 4);
    expect(pts[0].lon).toBeCloseTo(132 + 46 / 60 + 4 / 3600, 4);
  });
  it("NGA 좌표 형식(도-분.소수)도 읽는다", () => {
    expect(coordsOf("A. 38-12.00N 124-30.00E")[0]).toMatchObject({ lat: 38.2, lon: 124.5 });
  });
});

describe("북한 발사 예고인가", () => {
  it("실제 0486 (태평양 서부 로켓 발사): 한반도 바다 아님 → 발사 예고로 세지 않는다", () => {
    const a = assessJcg(warning("jcg_navarea11_260486_20261028.html", "260486", "東シナ海、北太平洋西部及び南太平洋、ロケット打上げに伴う危険区域設定"));
    expect(a).toMatchObject({ launch: true, nkLikely: false });
  });
  it("가상 사례 — 2023년 북한 위성 발사 통보와 같은 배치(서해 남서쪽 2곳 + 루손섬 동쪽): 북한 발사 예고", () => {
    const w = warning("jcg_navarea11_synthetic_nk_satellite.html", "260999", "黄海、東シナ海及びルソン島東方、ロケット打上げに伴う危険区域設定");
    expect(assessJcg(w)).toEqual({ korea: true, launch: true, nkLikely: true });
    const [sig] = jcgSignals([w], NOW);
    expect(sig).toMatchObject({ category: "launch_notice", sourceKind: "official", severity: 70 });
    expect(sig.title).toMatch(/일본 해상보안청.*북한 발사 경로의 낙하 구역/);
  });
  it("가상 사례 — 중국 산둥 앞바다 해상 발사(서해 중국 쪽): 서해 발사 경보지만 북한으로 보지 않는다", () => {
    const w = warning("jcg_navarea11_synthetic_cn_yellowsea.html", "260998", "黄海、ロケット打上げに伴う危険区域設定");
    expect(assessJcg(w)).toEqual({ korea: true, launch: true, nkLikely: false });
    expect(jcgSignals([w], NOW)[0].severity).toBe(50);
  });
  it("지표: 북한 발사 예고만 세고(→ '이상'), 중국 서해 발사는 참고로만 남긴다", () => {
    const rows = [
      warning("jcg_navarea11_synthetic_nk_satellite.html", "260999", "黄海、東シナ海及びルソン島東方、ロケット打上げに伴う危険区域設定"),
      warning("jcg_navarea11_synthetic_cn_yellowsea.html", "260998", "黄海、ロケット打上げに伴う危険区域設定"),
    ].map((w) => ({ navArea: "XI", msgNumber: w.number, msgYear: "2026", authority: "일본 해상보안청", text: w.text, title: w.title, jcg: assessJcg(w), issued: w.issued }));
    const m = navwarnMetrics(rows, NOW + 20 * 86400_000);
    const launch = m.find((x) => x.indicator === "navwarn.launch_notice_active")!;
    expect(launch.value).toBe(1);
    expect((launch.meta as any).otherLaunches).toHaveLength(1);
    expect(evaluate(INDICATOR_BY_ID["navwarn.launch_notice_active"], launch.value, NOW, undefined).state).toBe("anomalous");
    expect(m.find((x) => x.indicator === "navwarn.korea_warnings")!.value).toBe(2);
  });
});

describe("수집기: NGA + 해상보안청", () => {
  const listXml = fx("jcg_navarea11_list_20261101.xml");
  const body = fx("jcg_navarea11_260486_20261028.html");
  const fakeFetch = (calls: string[], jcgDown = false) =>
    (async (u: string) => {
      calls.push(String(u));
      if (String(u).includes("kaiho")) {
        if (jcgDown) return new Response("forbidden", { status: 403 });
        return new Response(String(u).includes("/warnings.cgi") ? listXml : body);
      }
      return new Response("{}");
    }) as unknown as typeof fetch;

  it("해상보안청 본문은 새 경보만 받고, 30분 안에는 목록도 다시 받지 않는다", async () => {
    const kv = new MemoryStore();
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ "broadcast-warn": [] }))) as typeof fetch;
    try {
      const calls: string[] = [];
      const r = await collectNga(NOW, kv, fakeFetch(calls));
      expect(r.ok).toBe(true);
      // 목록 2번(올해·지난해) + 제목이 관련 있는 본문만 (0486 로켓, 0485 日本海 射撃, 0484 射撃)
      expect(calls.filter((c) => c.includes("/warnings.cgi"))).toHaveLength(2);
      expect(calls.filter((c) => c.includes("disp_warnings"))).toHaveLength(3);
      const calls2: string[] = [];
      await collectNga(NOW + 10 * 60_000, kv, fakeFetch(calls2));
      expect(calls2).toHaveLength(0);
      const calls3: string[] = [];
      await collectNga(NOW + 31 * 60_000, kv, fakeFetch(calls3));
      expect(calls3.filter((c) => c.includes("disp_warnings"))).toHaveLength(0);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("해상보안청이 막혀도 NGA 로 지표를 내고 '일부 출처 실패'를 적는다", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ "broadcast-warn": [] }))) as typeof fetch;
    try {
      const r = await collectNga(NOW, new MemoryStore(), fakeFetch([], true));
      expect(r.ok).toBe(true);
      expect(r.error).toMatch(/해상보안청 실패/);
      expect(r.metrics!.find((m) => m.indicator === "navwarn.launch_notice_active")).toBeDefined();
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("국립해양조사원 국내 항행경보", () => {
  const items = parseKhoaList(fx("khoa_warning_list_20261101.html"));
  it("실제 목록(2026-11-01): 10건 — 합참 해상사격훈련 주간 계획, 북한 발사 알림 등", () => {
    expect(items).toHaveLength(10);
    expect(items.find((i) => i.no === "26-375")).toMatchObject({ title: "북한 동해상 미상 발사체 발사 알림", start: "2026-10-29", end: undefined, boardNo: "8653" });
    expect(items.find((i) => i.no === "26-371")).toMatchObject({ start: "2026-11-02", end: "2026-11-08" });
  });
  it("오늘 유효한 것만 센다: 11/1 은 2건(종료일 없는 알림), 11/2 월요일엔 주간 사격훈련이 더해진다", () => {
    expect(khoaActive(items, Date.UTC(2026, 10, 1, 5)).map((i) => i.no).sort()).toEqual(["26-375", "26-379"]);
    const mon = khoaActive(items, Date.UTC(2026, 10, 2, 3)).map((i) => i.no);
    expect(mon).toEqual(expect.arrayContaining(["26-371", "26-376", "26-377"]));
    expect(mon).not.toContain("26-375"); // 종료일 없는 알림은 3일까지
  });
});
