// 긴장 온도계 과거 10년 재구성 → src/core/tension_history.ts 생성.
// 실행: KEW_SECRET=... NODE_USE_ENV_PROXY=1 npx tsx scripts/build-tension-history.ts [끝 날짜 YYYY-MM-DD]
//  - 키가 필요한 출처(네이버)·이 컨테이너에서 막힌 출처(위키미디어)·한국은행은 서버의 /api/history-source, /api/ecos-series 로 받는다.
//  - 야후 일봉과 CSIS Beyond Parallel 도발 데이터베이스는 직접 받는다. 받은 자료는 .cache/tension/ 에 둔다(다시 쓰면 재사용).
// 계산은 src/core/tension.ts 의 함수를 그대로 쓴다(지금 값과 같은 잣대). 근거·검증: docs/INDICATORS.md 0.2
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { summarizeFlow, type DayValue } from "../src/core/collectors/ecos.js";
import { MILITARY_UNITS, tensionRaw, type TensionInputs, type TensionKey, type Thresholds } from "../src/core/tension.js";

const BASE = process.env.KEW_BASE ?? "https://korea-early-warning.gylee-30d.workers.dev";
const CACHE = new URL("../.cache/tension/", import.meta.url);
const FROM = "2016-02-01";
const TO = process.argv[2] ?? new Date(Date.now() - 86400_000 + 9 * 3600_000).toISOString().slice(0, 10);
const WARM = "2015-12-01";

async function cached<T>(name: string, get: () => Promise<T>): Promise<T> {
  const f = new URL(name, CACHE);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const v = await get();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(f, JSON.stringify(v));
  return v;
}
async function server(path: string): Promise<any> {
  const secret = process.env.KEW_SECRET;
  if (!secret) throw new Error("KEW_SECRET 이 필요합니다");
  const r = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${secret}` } });
  const j = (await r.json()) as any;
  if (j?.error) throw new Error(`${path}: ${j.error}`);
  return j;
}

// ── 날짜 도우미 ──
const DAY = 86400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const days: string[] = [];
for (let t = toMs(WARM); t <= toMs(TO); t += DAY) days.push(toDay(t));
const idx = new Map(days.map((d, i) => [d, i]));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** 하루 값 ÷ 직전 28일 중앙값 (pandas rolling(28, min_periods=21).median().shift(1) 과 같게). 중앙값이 floor 이하면 NaN */
function ratioSeries(v: number[], floor: (u: number) => boolean): number[] {
  return v.map((x, i) => {
    const prior = v.slice(Math.max(0, i - 28), i);
    if (prior.length < 21) return NaN;
    const u = median(prior);
    return floor(u) ? x / u : NaN;
  });
}
/** pandas Series.quantile 과 같은 선형 보간 */
function quantile(xs: number[], q: number): number {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}
/** 거래일 값 → 달력일 (휴장일은 최대 4일까지 앞 값) */
function ffill(byDate: Map<string, number>, limit = 4): number[] {
  let last = NaN, age = 99;
  return days.map((d) => {
    const v = byDate.get(d);
    if (v !== undefined && Number.isFinite(v)) {
      last = v;
      age = 0;
      return v;
    }
    age++;
    return age <= limit ? last : NaN;
  });
}

// ── 야후 일봉: 거래소 현지 날짜 → 직전 거래일 대비 % ──
async function yahooPct(sym: string): Promise<Map<string, number>> {
  const j = await cached(`yahoo_${sym.replace(/\W/g, "")}.json`, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${Math.floor(toMs("2015-06-01") / 1000)}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
    return (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
  });
  const r = (j as any).chart.result[0];
  const off = r.meta.gmtoffset ?? 0;
  const rows: [string, number][] = [];
  (r.timestamp as number[]).forEach((t, i) => {
    const c = r.indicators.quote[0].close[i];
    if (c != null) rows.push([toDay((t + off) * 1000), c]);
  });
  const dedup = new Map(rows); // 같은 날 두 봉이면 뒤의 것
  const sorted = [...dedup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) out.set(sorted[i][0], (sorted[i][1] / sorted[i - 1][1] - 1) * 100);
  return out;
}
const meanOf = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

// ── CSIS Beyond Parallel 도발 데이터베이스 → 날짜별 최고 위험도 ──
interface Prov { date: string; type: string; event: string; desc: string }
export function dangerOf(r: Prov): number {
  const e = r.event.toLowerCase();
  const x = `${r.event} ${r.desc}`.toLowerCase();
  if (r.type === "Nuclear Provocation" && e.includes("nuclear test")) return 5;
  if (e.includes("nuclear detonation")) return x.includes("ballistic") ? 3 : 2;
  if (e.includes("artillery")) {
    if (/yeonpyeong|baengnyeong|evacuat/.test(x)) return 5;
    if (/rocket|mlrs|multiple.{0,10}launch/.test(x)) return 2;
    return 4;
  }
  if (e.includes("explosion") || e.includes("liaison")) return 4;
  if (e.includes("land mine")) return 4;
  if (e.includes("drone")) return /intru|cross|incursion|over .*seoul|airspace/.test(x) ? 4 : 2;
  if (/dmz en(ro|cro)achment/.test(e)) return 3;
  if (e.includes("intercontinental") || e.includes("satellite")) return 4;
  if (e.includes("ballistic") || e.includes("mirv")) return /over japan|over hokkaido|flew over|j-alert|overflew/.test(x) ? 4 : 3;
  if (e.includes("short-range missile") || /mlrs|multiple lan/.test(e)) return 3;
  if (/cruise|anti-aircraft|surface-to-air|tactical guided|anti-ship/.test(e)) return 2;
  if (/balloon|loudspeaker|gps|exercise|posturing|engine|rocket experiment|underwater|launcher deployment|mixed tactical/.test(e)) return 2;
  return 1;
}
const KO: [RegExp, string][] = [
  [/nuclear test/i, "핵실험"], [/intercontinental/i, "ICBM"], [/satellite/i, "위성 발사"], [/liaison/i, "남북공동연락사무소 폭파"], [/land mine/i, "DMZ 지뢰 폭발"],
  [/^explosion/i, "남북 연결도로 폭파"], [/artillery/i, "포 사격"], [/drones/i, "무인기"], [/intermediate-range/i, "중거리 탄도미사일"], [/medium-range/i, "준중거리 탄도미사일"],
  [/submarine launched ballistic/i, "잠수함 탄도미사일"], [/short-range ballistic|short-range missile/i, "단거리 탄도미사일"], [/ballistic/i, "탄도미사일"], [/cruise/i, "순항미사일"],
  [/balloon/i, "오물풍선"], [/dmz en/i, "군사분계선 침범"], [/loudspeaker/i, "확성기"], [/independently|mirv/i, "다탄두 시험"], [/mlrs|multiple/i, "방사포"],
  [/military posturing/i, "무력시위"], [/airplane exercise/i, "공군 훈련"], [/military exercise/i, "군사훈련"], [/rocket engine/i, "엔진 시험"], [/mixed tactical/i, "전술무기 시험"],
  [/underwater/i, "수중 핵무인정"], [/destroyer/i, "구축함 진수"], [/nuclear-powered/i, "핵잠수함 공개"], [/uranium/i, "우라늄 시설 공개"], [/gps/i, "GPS 교란"],
  [/cyber/i, "사이버 공격"], [/launcher deployment/i, "발사대 배치"], [/anti-aircraft|surface-to-air/i, "대공미사일"], [/rocket experiment/i, "로켓 시험"], [/nuclear detonation/i, "핵 기폭장치"],
];
const ko = (event: string) => KO.find(([re]) => re.test(event))?.[1] ?? event;
/** 도발 일지에 없는 큰 날 — 확인된 배경만 적는다 */
const CONTEXT: Record<string, string> = {
  "2017-04-10": "'4월 위기설' (미 항모 전개·선제타격설)",
  "2017-08-09": "'화염과 분노'·괌 포위사격 위협",
  "2018-04-27": "남북정상회담 (긴장이 아니라 큰 뉴스 — 이 지수의 한계)",
  "2018-06-12": "북미정상회담 (긴장이 아니라 큰 뉴스 — 이 지수의 한계)",
  "2020-04-26": "김정은 건강 이상설",
  "2026-03-04": "미국-이란 전쟁 — 코스피 사상 최대 폭락·방산주 급등 (한반도 밖 원인, 이 지수의 한계)",
  "2016-02-07": "광명성 위성 발사 → 개성공단 전면 중단",
  "2022-11-02": "미사일 20여 발·울릉도 공습경보 → ICBM",
  "2023-05-31": "정찰위성 발사 (서울 경계경보 오발령)",
  "2024-01-05": "연평도 북방 해안포 200여 발·주민 대피",
};
/** 큰 날 이름: 확인된 배경(±3일)이 있으면 그것, 없으면 그 주의 도발 */
const contextFor = (d: string) => {
  for (let k = 0; k <= 3; k++) for (const s of k ? [-k, k] : [0]) {
    const c = CONTEXT[toDay(toMs(d) + s * DAY)];
    if (c) return c;
  }
  return undefined;
};

async function main() {
  // 1) 네이버 묶음 (0 전쟁 불안, 3 북한 도발)
  const naver = async (g: number) => {
    const j = await cached(`naver_${g}.json`, () => server(`/api/history-source?kind=naver&group=${g}&from=2016-01-01&to=${TO}`));
    const m = new Map<string, number>((j.data as [string, number][]).map(([d, v]) => [d, Number(v)]));
    return ratioSeries(days.map((d) => m.get(d) ?? 0), (u) => u > 0);
  };
  const war = await naver(0);
  const nk = await naver(3);
  // 2) 위키 9개 문서 배율의 중앙값 (평소 5회 미만 문서 제외, 4개 이상일 때만)
  const wikiR: number[][] = [];
  for (let i = 0; i < 9; i++) {
    const j = await cached(`wiki_${i}.json`, () => server(`/api/history-source?kind=wiki&i=${i}&from=20150701&to=${TO.replace(/-/g, "")}`));
    const m = new Map<string, number>((j.data as [string, number][]).map(([d, v]) => [`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, Number(v)]));
    // 28일 창을 위해 WARM 이전 4주도 포함해 계산한 뒤 잘라낸다
    const pre: string[] = [];
    for (let t = toMs(WARM) - 40 * DAY; t < toMs(WARM); t += DAY) pre.push(toDay(t));
    const all = [...pre, ...days].map((d) => m.get(d) ?? 0);
    wikiR.push(ratioSeries(all, (u) => u >= 5).slice(pre.length));
  }
  const wiki = days.map((_, i) => {
    const v = wikiR.map((s) => s[i]).filter(Number.isFinite);
    return v.length >= 4 ? median(v) : NaN;
  });
  // 3) 시장
  const [ks, n2, tw, h1, h2, h3, krw, jpy, twd] = await Promise.all(["^KS11", "^N225", "^TWII", "012450.KS", "079550.KS", "064350.KS", "KRW=X", "JPY=X", "TWD=X"].map(yahooPct));
  const kospiRel = new Map<string, number>(), defRel = new Map<string, number>(), krwRel = new Map<string, number>();
  for (const [d, k] of ks) {
    const p = meanOf([n2.get(d), tw.get(d)]);
    if (p !== undefined) kospiRel.set(d, k - p);
    const df = meanOf([h1.get(d), h2.get(d), h3.get(d)]);
    if (df !== undefined) defRel.set(d, df - k);
  }
  for (const [d, k] of krw) {
    const p = meanOf([jpy.get(d), twd.get(d)]);
    if (p !== undefined) krwRel.set(d, k - p);
  }
  // 4) 외국인 순매수 z (운영 지표와 같은 함수)
  const ecos = await cached("ecos_fnet.json", () => server(`/api/ecos-series?stat=802Y001&item=0030000&from=20140101&to=${TO.replace(/-/g, "")}`));
  const flows: DayValue[] = (ecos.rows as [string, number][]).map(([date, value]) => ({ date, value }));
  const fz = new Map<string, number>();
  flows.forEach((f, i) => {
    const s = summarizeFlow(flows.slice(Math.max(0, i - 129), i + 1));
    if (s) fz.set(`${f.date.slice(0, 4)}-${f.date.slice(4, 6)}-${f.date.slice(6, 8)}`, s.z);
  });
  const kospiRelD = ffill(kospiRel), defRelD = ffill(defRel), krwRelD = ffill(krwRel), fzD = ffill(fz);
  // 5) 도발 일지
  const html = await cached("bp.json", async () => (await fetch("https://beyondparallel.csis.org/database-north-korean-provocations/", { headers: { "User-Agent": "Mozilla/5.0 (research)" } })).text());
  const provs: Prov[] = [];
  const body = (html as string).slice((html as string).indexOf("<tbody>"), (html as string).indexOf("</tbody>"));
  const unesc = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  for (const tr of body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => unesc(m[1]));
    if (tds.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(tds[0])) provs.push({ date: tds[0], type: tds[1], event: tds[2], desc: tds[3].slice(0, 400) });
  }
  const lv = new Array(days.length).fill(0);
  const names = new Map<string, Set<string>>();
  for (const p of provs) {
    const i = idx.get(p.date);
    if (i === undefined) continue;
    lv[i] = Math.max(lv[i], dangerOf(p));
    if (!names.has(p.date)) names.set(p.date, new Set());
    names.get(p.date)!.add(ko(p.event));
  }
  // 6) 문턱 (기준 기간의 분포)
  const base = (s: number[]) => s.filter((_, i) => days[i] >= FROM && days[i] <= TO);
  const stress: Record<TensionKey, number[]> = {
    nk, war, wiki,
    kospiDrop: kospiRelD.map((x) => -x), defenseUp: defRelD, krwWeak: krwRelD, foreignSell: fzD.map((x) => -x),
  };
  const Q = Object.fromEntries(Object.entries(stress).map(([k, s]) => [k, [0.9, 0.975, 0.995, 0.999].map((q) => +quantile(base(s), q).toFixed(4))])) as Thresholds;
  // 7) 하루 원점수
  const out: { d: string; raw: number; mil: number; pub: number; mon: number }[] = [];
  const debug: Record<string, unknown>[] = [];
  days.forEach((d, i) => {
    if (d < FROM) return;
    const win = lv.slice(Math.max(0, i - 6), i + 1);
    const x: TensionInputs = {
      nk: nk[i], war: war[i], wiki: wiki[i], kospiRelPct: kospiRelD[i], defenseRelPct: defRelD[i], krwRelPct: krwRelD[i], foreignZ: fzD[i],
      maxDanger7: Math.max(...win), provDays7: win.filter((v) => v >= 3).length,
    };
    const r = tensionRaw(x, Q);
    out.push({ d, raw: r.raw, mil: r.parts.military, pub: r.parts.public, mon: r.parts.money });
    debug.push({ d, x, u: r.units });
  });
  // 8) 가장 긴장됐던 날들 (10일 안 중복은 하나로) + 이름
  const top: { d: string; raw: number; mil: number; pub: number; mon: number; label: string }[] = [];
  for (const r of [...out].sort((a, b) => b.raw - a.raw)) {
    if (top.some((t) => Math.abs(toMs(t.d) - toMs(r.d)) < 10 * DAY)) continue;
    const near: string[] = [];
    for (let t = toMs(r.d) - 6 * DAY; t <= toMs(r.d) + DAY; t += DAY) for (const n of names.get(toDay(t)) ?? []) if (!near.includes(n)) near.push(n);
    const strong = near.filter((n) => !/오물풍선|확성기|순항|방사포/.test(n));
    const label = contextFor(r.d) ?? (strong.length ? strong.slice(0, 3).join("·") : near.length ? near.slice(0, 2).join("·") : `배경 확인 필요 (사람 ${r.pub}·돈 ${r.mon})`);
    top.push({ ...r, label });
    if (top.length >= 30) break;
  }
  const lines = [
    "// 자동 생성: scripts/build-tension-history.ts — 직접 고치지 말 것. 근거·검증: docs/INDICATORS.md 0.2",
    "// 자료: CSIS Beyond Parallel 'Database: North Korean Provocations', 네이버 데이터랩, Wikimedia 조회수, Yahoo 일봉, 한국은행 ECOS",
    `export const TENSION_FROM = "${FROM}";`,
    `export const TENSION_TO = "${TO}";`,
    `export const TENSION_Q = ${JSON.stringify(Q)} as const satisfies Record<string, readonly [number, number, number, number]> as unknown as Record<"nk" | "war" | "wiki" | "kospiDrop" | "defenseUp" | "krwWeak" | "foreignSell", [number, number, number, number]>;`,
    `/** ${FROM} 부터 하루 하나씩, 원점수 (0~9) */`,
    `export const TENSION_DAILY = "${out.map((r) => r.raw).join(",")}";`,
    `export const TENSION_TOP: { d: string; raw: number; mil: number; pub: number; mon: number; label: string }[] = ${JSON.stringify(top)};`,
    "",
  ];
  writeFileSync(new URL("../src/core/tension_history.ts", import.meta.url), lines.join("\n"));
  writeFileSync(new URL("components.json", CACHE), JSON.stringify(debug)); // 검증용 (커밋하지 않음)
  console.log(`${out.length}일 (${FROM} ~ ${TO}), 도발 ${provs.length}건, 원점수=0 인 날 ${((out.filter((r) => r.raw === 0).length / out.length) * 100).toFixed(1)}%`);
  console.log("문턱", JSON.stringify(Q));
  for (const t of top.slice(0, 12)) console.log(t.d, t.raw, `(군 ${t.mil} 사람 ${t.pub} 돈 ${t.mon})`, t.label);
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exit(1);
});
