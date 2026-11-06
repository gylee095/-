// 사례집 한국 재생 (2017~2026) — 지금 판정 규칙(assessWarRisk)을 한반도 과거 자료로 하루씩 돌려 '한국에서의 성적'을 낸다.
// 외국 사례가 정부 경보만 시험한 한계(11/6 제3자 검토)를 메우는 주 시험: 시장·위키·네이버 검색·도발 사건(군사 영역)을 운영과 같은 측정으로 넣는다.
// 정답: 큰 도발 날(MAJOR_DAYS — CSIS 위험도 4 이상, forecast.ts 와 같은 정답) + 조사로 확인한 실제 교전 날(.cache/cases/gt-korea.json → data/korea/truth.json).
//
// 실행: npx tsx scripts/korea-replay.ts   (네이버 과거 검색량은 서버의 /api/history-source 로 받는다 — KEW_SECRET 필요, 읽기 전용)
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { avgOn, cached, carryForward, pctOf, y } from "./fetch-cases.js";
import { WIKI_BASKET, parseWikiSeries, wikiUrl, WIKI_UA } from "../src/core/collectors/wiki.js";
import { NAVER_GROUPS } from "../src/core/collectors/naver.js";
import { dangerOf, parseCsis } from "../src/core/provdanger.js";
import { naverDaily, wikiDaily, type CaseDay, type CaseEvent, type CaseFile } from "../src/core/casereplay.js";

export const KOREA = { id: "korea-2017-2026", start: "2017-01-01", end: "2026-10-31" };
const OUT = new URL("../data/korea/", import.meta.url);
const CACHE = new URL("../.cache/korea/", import.meta.url);
const DAY = 86400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const round = (x: number) => +x.toFixed(3);
const FROM = iso(ms(KOREA.start) - 60 * DAY);
const BASE = process.env.KEW_BASE ?? "https://korea-early-warning.gylee-30d.workers.dev";
const secret = () => process.env.KEW_SECRET ?? (existsSync(`${process.env.HOME}/.config/kew/secret`) ? readFileSync(`${process.env.HOME}/.config/kew/secret`, "utf8").trim() : "");

async function local<T>(name: string, get: () => Promise<T>): Promise<T> {
  const f = new URL(name, CACHE);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const v = await get();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(f, JSON.stringify(v));
  return v;
}

/** 네이버 불안 묶음(북한 도발 묶음 제외) — 운영 naverMetrics 처럼 어제 ÷ 직전 28일 중앙값 중 가장 큰 값 ×100 */
async function naverSeries(): Promise<Map<string, number>> {
  const groups = NAVER_GROUPS.map((g, i) => ({ g, i })).filter(({ g }) => g.groupName !== "북한 도발");
  const all: { name: string; series: Map<string, number> }[] = [];
  for (const { g, i } of groups) {
    const j = await local(`naver_${i}_${FROM}_${KOREA.end}.json`, async () => {
      const r = await fetch(`${BASE}/api/history-source?kind=naver&group=${i}&from=${FROM}&to=${KOREA.end}`, { headers: { authorization: `Bearer ${secret()}` } });
      const x = (await r.json()) as any;
      if (!Array.isArray(x?.data)) throw new Error(`네이버 과거 검색량을 못 받음 (${g.groupName})`);
      return x;
    });
    all.push({ name: g.groupName, series: new Map((j.data as [string, number][]).map(([d, v]) => [d, v])) });
  }
  return naverDaily(all, FROM, KOREA.end);
}

async function wikiSeries(): Promise<Map<string, number>> {
  const all: { name: string; series: Map<string, number> }[] = [];
  for (const [p, a] of WIKI_BASKET) {
    const text = await cached(`wiki_${p}_${encodeURIComponent(a).replace(/[^A-Za-z0-9]+/g, "_")}_${FROM}_${KOREA.end}.json`, wikiUrl(p, a, ms(FROM), ms(KOREA.end)), { "User-Agent": WIKI_UA }, (j) => Array.isArray(j?.items));
    if (!text) continue;
    const raw = parseWikiSeries(JSON.parse(text));
    all.push({ name: `${p}:${a}`, series: new Map([...raw].map(([k, v]) => [`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`, v])) });
  }
  return wikiDaily(all, FROM, KOREA.end);
}

async function events(): Promise<CaseEvent[]> {
  const html = await local("csis.html.json", async () => (await fetch("https://beyondparallel.csis.org/database-north-korean-provocations/", { headers: { "User-Agent": "Mozilla/5.0 (research)" } })).text());
  const best = new Map<string, CaseEvent>();
  for (const p of parseCsis(html)) {
    if (p.date < FROM || p.date > KOREA.end) continue;
    const level = dangerOf(p) as CaseEvent["level"];
    const cur = best.get(p.date);
    if (!cur || level > cur.level) best.set(p.date, { date: p.date, level, headline: `북한 ${p.event}` });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function buildKorea(): Promise<CaseFile & { truth: { date: string; what: string; kind: string; source: string }[] }> {
  const krw = await pctOf(y("KRW=X"), FROM, KOREA.end);
  const ks = await pctOf(y("^KS11"), FROM, KOREA.end);
  const peers = await Promise.all(["^N225", "^TWII"].map((s) => pctOf(y(s), FROM, KOREA.end)));
  const def = await Promise.all(["012450.KS", "079550.KS", "064350.KS"].map((s) => pctOf(y(s), FROM, KOREA.end)));
  const wiki = await wikiSeries();
  const naver = await naverSeries();
  const ev = await events();

  const days: CaseDay[] = [];
  const st: Record<"fxPct" | "equityRel" | "defenseRel", { v?: number; age: number }> = { fxPct: { age: 0 }, equityRel: { age: 0 }, defenseRel: { age: 0 } };
  for (let t = ms(FROM); t <= ms(KOREA.end); t += DAY) {
    const date = iso(t);
    const k = ks.get(date), pr = avgOn(date, peers), d = avgOn(date, def);
    st.fxPct = carryForward(st.fxPct, krw.has(date) ? round(krw.get(date)!) : undefined);
    st.equityRel = carryForward(st.equityRel, typeof k === "number" && typeof pr === "number" ? round(k - pr) : undefined);
    st.defenseRel = carryForward(st.defenseRel, typeof d === "number" && typeof k === "number" ? round(d - k) : undefined);
    if (date < KOREA.start) continue;
    days.push({ date, fxPct: st.fxPct.v, equityRel: st.equityRel.v, defenseRel: st.defenseRel.v, wikiPct: wiki.get(date), naverPct: naver.get(date) });
  }
  const { MAJOR_DAYS } = await import("../src/core/tension_history.js");
  const gt = existsSync(new URL("../.cache/cases/gt-korea.json", import.meta.url)) ? JSON.parse(readFileSync(new URL("../.cache/cases/gt-korea.json", import.meta.url), "utf8")) : undefined;
  const clashes = ((gt?.clashes ?? []) as any[]).filter((c) => c.date && c.confidence !== "not_found" && c.kind !== "warning_shots");
  const truth = [
    ...MAJOR_DAYS.filter((d) => d >= KOREA.start && d <= KOREA.end).map((d) => ({ date: d, what: "큰 도발 날 (CSIS 위험도 4 이상·시스템 기록)", kind: "major", source: "src/core/tension_history.ts MAJOR_DAYS" })),
    ...clashes.map((c) => ({ date: c.date, what: c.what, kind: c.kind, source: (c.sources ?? [])[0] ?? "" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return {
    id: KOREA.id, name: "한반도 2017~2026 (지금 규칙으로 하루씩)", outcome: "no_war", start: KOREA.start, end: KOREA.end,
    preroll: [], days, gov: [], airspace: [], events: ev, truth,
    sources: [
      "환율 KRW=X · 코스피 ^KS11 − 닛케이·대만 평균 · 방산 3종(한화에어로스페이스·LIG넥스원·현대로템) − 코스피: Yahoo 일봉(거래소 현지 날짜)",
      `위키백과 조회수: 운영과 같은 문서 ${WIKI_BASKET.length}개 (Wikimedia)`,
      "네이버 검색: 운영과 같은 불안 묶음 3개 (서버 /api/history-source)",
      "도발: CSIS Beyond Parallel 'Database: North Korean Provocations' → provdanger.ts 위험도",
      "정부 경보: 2017~2026 한국 대상 안보 사유 상향 없음으로 둠 (조사: .cache/cases/gt-korea.json advisories)",
      "보도량·항공·GPS·항행경보·엘리트·북한 내부: 과거 자료 없음 → 측정 불가",
    ],
    retrieved: iso(Date.now()),
  };
}

async function main() {
  const out = await buildKorea();
  const n = (k: keyof CaseDay) => out.days.filter((d) => typeof d[k] === "number").length;
  if (!n("fxPct") || !n("wikiPct") || !n("naverPct") || !(out.events ?? []).length) throw new Error("핵심 자료가 비어 저장하지 않음");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(`${out.id}.json`, OUT), JSON.stringify(out) + "\n");
  console.log(`${out.days.length}일 · 환율 ${n("fxPct")} 증시 ${n("equityRel")} 방산 ${n("defenseRel")} 위키 ${n("wikiPct")} 네이버 ${n("naverPct")} · 도발 ${out.events!.length}일 · 정답 ${out.truth.length}`);
}

const self = (p: string) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) await main();
