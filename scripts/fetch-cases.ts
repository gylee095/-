// 외국 전쟁 사례 자료 받기 — 시세·위키백과 조회수·보도량을 하루 단위로 받아 data/cases/<사례>.json 에 고정한다.
// 원자료는 .cache/cases/ (저장소 밖)에 두고 다시 받지 않는다. 받지 못한 값은 비워 둔다(채점에서 '측정 불가').
// 정부·영공 사건은 data/cases/events.json (출처 확인한 것만, 사람이 정리)에서 합친다.
//
// 실행: npx tsx scripts/fetch-cases.ts [사례 id]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWikiSeries, wikiUrl, WIKI_UA } from "../src/core/collectors/wiki.js";
import { wikiDaily, type CaseDay, type CaseFile, type CaseOutcome } from "../src/core/casereplay.js";

const CACHE = new URL("../.cache/cases/", import.meta.url);
const OUT = new URL("../data/cases/", import.meta.url);
const DAY = 86400_000;
const PRE_DAYS = 45;

export interface Quote { kind: "yahoo" | "moex"; symbol: string }
export const y = (symbol: string): Quote => ({ kind: "yahoo", symbol });
const moex: Quote = { kind: "moex", symbol: "IMOEX" };

interface CaseConfig {
  id: string;
  name: string;
  outcome: CaseOutcome;
  truthDate?: string;
  start: string;
  end: string;
  /** 통화 — 여럿이면 그날 가장 약세인 값 */
  fx: string[];
  equity: Quote;
  peers: string[];
  defense: Quote[];
  defenseBase: Quote[];
  /** 전쟁 전에 이미 있던 문서만 (전쟁 뒤 만들어진 문서는 미래 정보다) */
  wiki: [string, string][];
  gdelt: string;
}

const WIKI_RU: [string, string][] = [["en", "Ukraine"], ["en", "Russo-Ukrainian_War"], ["en", "Russia–Ukraine_relations"], ["en", "Armed_Forces_of_Ukraine"], ["en", "War_in_Donbas"], ["en", "Donbas"], ["ru", "Украина"], ["uk", "Збройні_сили_України"], ["de", "Ukraine"]];
const WIKI_IL: [string, string][] = [["en", "Israel"], ["en", "Hamas"], ["en", "Gaza_Strip"], ["en", "Israel_Defense_Forces"], ["en", "Hezbollah"], ["en", "Iran–Israel_proxy_conflict"], ["en", "Islamic_Revolutionary_Guard_Corps"], ["he", "צבא_הגנה_לישראל"], ["fa", "ایران"]];
const WIKI_AZ_AM: [string, string][] = [["en", "Azerbaijan"], ["en", "Armenia"], ["en", "Nagorno-Karabakh"], ["en", "2020_Nagorno-Karabakh_war"], ["en", "Nagorno-Karabakh_conflict"], ["ru", "Нагорный_Карабах"]];
const WIKI_IN_PK: [string, string][] = [["en", "India"], ["en", "Pakistan"], ["en", "2019_India–Pakistan_standoff"], ["en", "Indian_Air_Force"], ["en", "Kashmir"]];
const WIKI_IN_CN: [string, string][] = [["en", "India"], ["en", "China"], ["en", "Galwan_Valley"], ["en", "Sino-Indian_border_dispute"], ["en", "Line_of_Actual_Control"]];
const WIKI_TW: [string, string][] = [["en", "Taiwan"], ["en", "China"], ["en", "Taiwan_Strait"], ["en", "Cross-Strait_relations"], ["en", "Republic_of_China_Armed_Forces"]];
const WIKI_US_IR: [string, string][] = [["en", "Iran"], ["en", "United_States"], ["en", "Assassination_of_Qasem_Soleimani"], ["en", "Iran–United_States_relations"], ["en", "Islamic_Revolutionary_Guard_Corps"]];
const WIKI_NK: [string, string][] = [["en", "North_Korea"], ["en", "North_Korea_and_weapons_of_mass_destruction"], ["en", "Korean_Peninsula"], ["en", "Korean_Demilitarized_Zone"]];
const WIKI_IL_HZ: [string, string][] = [["en", "Israel"], ["en", "Hezbollah"], ["en", "Lebanon"], ["en", "Israel_Defense_Forces"], ["en", "2024_Israel–Hezbollah_conflict"]];
const WIKI_SA_YE: [string, string][] = [["en", "Yemen"], ["en", "Saudi_Arabia"], ["en", "Houthi_movement"], ["en", "Saudi-led_intervention_in_Yemen"], ["en", "Yemeni_Civil_War_(2014–present)"]];
const WIKI_TR_SY: [string, string][] = [["en", "Turkey"], ["en", "Syria"], ["en", "Turkish_involvement_in_the_Syrian_civil_war"], ["en", "Operation_Olive_Branch"], ["en", "Afrin_District"]];
const RU = { fx: ["RUB=X", "UAH=X"], equity: moex, peers: ["EEM", "^STOXX50E"], defense: [y("RHM.DE"), y("BA.L"), y("LMT")], defenseBase: [y("^STOXX50E"), y("^GSPC")], wiki: WIKI_RU };
const IL = { fx: ["ILS=X"], equity: y("TA35.TA"), peers: ["EEM", "^STOXX50E"], defense: [y("ESLT.TA")], defenseBase: [y("TA35.TA")], wiki: WIKI_IL };

// ── 사례 선정 규칙 (지시서 001, 2026-11-06) ──
// 1. 2015년 이후 국가 간 군사 위기 (위키피디아 조회수 API가 2015-07부터)
// 2. outcome war/attack: 실제 공습·포격·침공 발생. no_war: 전면 교전 없이 종료
// 3. 숨긴 사례 3건(인도↔파키스탄 2025, 태국↔캄보디아 2025, 대만 2022) 제외
// 4. 무료 자료(Yahoo Finance, Wikipedia pageviews, GDELT)로 채울 수 있는 것만
// 5. 빠진 영역(정부 경보 등)은 사례별로 표시
export const CASES: CaseConfig[] = [
  // ── 기존 사례 (6건) ──
  { id: "ukraine-2022", name: "러시아 → 우크라이나 침공", outcome: "war", truthDate: "2022-02-24", start: "2021-11-26", end: "2022-02-24", ...RU, gdelt: "Ukraine (war OR invasion OR troops)" },
  { id: "russia-buildup-2021", name: "러시아 병력 집결 2021년 봄 (전쟁 안 남)", outcome: "no_war", start: "2021-01-15", end: "2021-05-15", ...RU, gdelt: "Ukraine (war OR invasion OR troops)" },
  { id: "hamas-2023", name: "하마스 기습", outcome: "attack", truthDate: "2023-10-07", start: "2023-07-09", end: "2023-10-07", ...IL, gdelt: "Israel Gaza (war OR attack OR rockets)" },
  { id: "iran-israel-2024-04", name: "이란 → 이스라엘 공격 (2024년 4월)", outcome: "attack", truthDate: "2024-04-13", start: "2024-01-14", end: "2024-04-14", ...IL, gdelt: "Iran Israel (war OR attack OR strike)" },
  { id: "iran-israel-2024-10", name: "이란 → 이스라엘 공격 (2024년 10월)", outcome: "attack", truthDate: "2024-10-01", start: "2024-07-03", end: "2024-10-01", ...IL, gdelt: "Iran Israel (war OR attack OR strike)" },
  { id: "israel-iran-2025", name: "이스라엘 ↔ 이란 12일 전쟁", outcome: "war", truthDate: "2025-06-13", start: "2025-03-15", end: "2025-06-13", ...IL, gdelt: "Iran Israel (war OR attack OR strike)" },
  // ── 개발용 추가 사례 (10건, 지시서 001) ──
  // 전쟁/공격 (6건)
  { id: "azerbaijan-armenia-2020", name: "제2차 나고르노카라바흐 전쟁", outcome: "war", truthDate: "2020-09-27", start: "2020-06-29", end: "2020-09-27",
    fx: ["TRY=X"], equity: y("XU100.IS"), peers: ["EEM"], defense: [y("LMT"), y("BA.L")], defenseBase: [y("^GSPC")], wiki: WIKI_AZ_AM, gdelt: "Nagorno-Karabakh (war OR attack OR conflict)" },
  { id: "india-pakistan-2019", name: "인도 → 파키스탄 발라코트 공습", outcome: "attack", truthDate: "2019-02-26", start: "2018-11-28", end: "2019-02-27",
    fx: ["INR=X", "PKR=X"], equity: y("^BSESN"), peers: ["EEM"], defense: [y("BEL.NS"), y("HAL.NS")], defenseBase: [y("^BSESN")], wiki: WIKI_IN_PK, gdelt: "India Pakistan (war OR attack OR strike OR Kashmir)" },
  { id: "israel-hezbollah-2024", name: "이스라엘 → 레바논 (북부 화살 작전)", outcome: "war", truthDate: "2024-09-23", start: "2024-06-25", end: "2024-09-23",
    fx: ["ILS=X"], equity: y("TA35.TA"), peers: ["EEM"], defense: [y("ESLT.TA")], defenseBase: [y("TA35.TA")], wiki: WIKI_IL_HZ, gdelt: "Israel Hezbollah Lebanon (war OR attack OR strike)" },
  { id: "turkey-syria-afrin-2018", name: "터키 → 시리아 아프린 작전", outcome: "attack", truthDate: "2018-01-20", start: "2017-10-22", end: "2018-01-20",
    fx: ["TRY=X"], equity: y("XU100.IS"), peers: ["EEM"], defense: [y("LMT")], defenseBase: [y("^GSPC")], wiki: WIKI_TR_SY, gdelt: "Turkey Syria Afrin (war OR attack OR operation)" },
  { id: "saudi-yemen-2015", name: "사우디 → 예멘 결정적 폭풍 작전", outcome: "war", truthDate: "2015-03-26", start: "2014-12-26", end: "2015-03-26",
    fx: ["SAR=X"], equity: y("^TASI.SR"), peers: ["EEM"], defense: [y("LMT")], defenseBase: [y("^GSPC")], wiki: WIKI_SA_YE, gdelt: "Saudi Yemen (war OR attack OR airstrikes)" },
  { id: "ethiopia-tigray-2020", name: "에티오피아 → 티그라이 내전", outcome: "war", truthDate: "2020-11-04", start: "2020-08-06", end: "2020-11-04",
    fx: ["ETB=X"], equity: y("^GSPC"), peers: ["EEM"], defense: [y("LMT")], defenseBase: [y("^GSPC")], wiki: [["en", "Tigray_War"], ["en", "Ethiopia"], ["en", "Tigray_Region"], ["en", "Tigray_People%27s_Liberation_Front"]], gdelt: "Ethiopia Tigray (war OR attack OR conflict)" },
  // 안 터진 위기 (4건)
  { id: "taiwan-2024", name: "대만 2024 (라이칭더 취임 뒤 중국 훈련, 전쟁 안 남)", outcome: "no_war", start: "2024-02-20", end: "2024-05-27",
    fx: ["TWD=X"], equity: y("^TWII"), peers: ["EEM"], defense: [y("LMT")], defenseBase: [y("^GSPC")], wiki: WIKI_TW, gdelt: "Taiwan China (war OR invasion OR military)" },
  { id: "us-iran-2020", name: "솔레이마니 피살 뒤 미↔이란 위기 (전쟁 안 남)", outcome: "no_war", start: "2019-10-03", end: "2020-01-08",
    fx: ["IRR=X"], equity: y("^GSPC"), peers: ["EEM"], defense: [y("LMT"), y("RTX")], defenseBase: [y("^GSPC")], wiki: WIKI_US_IR, gdelt: "Iran United States (war OR attack OR strike OR Soleimani)" },
  { id: "india-china-2020", name: "갈완 계곡 충돌 (전쟁 안 남)", outcome: "no_war", start: "2020-03-15", end: "2020-06-15",
    fx: ["INR=X", "CNY=X"], equity: y("^BSESN"), peers: ["EEM"], defense: [y("BEL.NS"), y("HAL.NS")], defenseBase: [y("^BSESN")], wiki: WIKI_IN_CN, gdelt: "India China (border OR clash OR Galwan)" },
  { id: "north-korea-2017", name: "화염과 분노 (전쟁 안 남)", outcome: "no_war", start: "2017-05-08", end: "2017-09-15",
    fx: ["KRW=X"], equity: y("^KS11"), peers: ["EEM"], defense: [y("LMT")], defenseBase: [y("^GSPC")], wiki: WIKI_NK, gdelt: "North Korea (war OR nuclear OR missile OR ICBM)" },
];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const wait = (t: number) => new Promise((r) => setTimeout(r, t));
const round = (x: number) => +x.toFixed(3);

/** 같은 주소를 다시 받지 않는다 */
export async function cached(name: string, url: string, headers: Record<string, string>, ok: (j: any) => boolean = () => true): Promise<string | undefined> {
  const file = new URL(name, CACHE);
  // 깨지거나 오류 본문인 캐시는 버리고 다시 받는다 (11/6 검토: 일시 오류가 영구 '측정 불가'로 굳지 않게)
  const valid = (text: string) => { try { return ok(JSON.parse(text)); } catch { return false; } };
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    if (valid(text)) return text;
  }
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = await res.text();
        if (valid(text)) {
          writeFileSync(file, text);
          return text;
        }
      }
    } catch { /* 다시 시도 */ }
    await wait(20000);
  }
  console.warn(`  못 받음: ${url}`);
  return undefined;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_");
export const localDate = (msUtc: number, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(msUtc));

/** 날짜 → 종가 */
export async function closes(q: Quote, from: string, to: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (q.kind === "moex") {
    for (let start = 0; ; start += 100) {
      const url = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${q.symbol}.json?from=${from}&till=${to}&start=${start}&iss.meta=off&history.columns=TRADEDATE,CLOSE`;
      const text = await cached(`moex_${q.symbol}_${from}_${start}.json`, url, { "User-Agent": WIKI_UA }, (j) => Array.isArray(j?.history?.data) && (start > 0 || j.history.data.length > 0));
      const rows: [string, number][] = text ? JSON.parse(text)?.history?.data ?? [] : [];
      for (const [d, c] of rows) if (typeof c === "number") m.set(d, c);
      if (rows.length < 100) break;
    }
    return m;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.symbol)}?period1=${ms(from) / 1000}&period2=${ms(to) / 1000 + DAY / 1000}&interval=1d`;
  const text = await cached(`yahoo_${safe(q.symbol)}_${from}.json`, url, { "User-Agent": "Mozilla/5.0" }, (j) => (j?.chart?.result?.[0]?.timestamp?.length ?? 0) > 0);
  const r = text ? JSON.parse(text).chart?.result?.[0] : undefined;
  const ts: number[] = r?.timestamp ?? [];
  const cs: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  // 날짜는 거래소 현지 날짜로 (11/6 검토: 런던 기준 환율 일봉은 여름에 23:00 UTC 라 UTC 날짜로 붙이면 하루 앞 날짜가 되어 미래 정보가 섞였다)
  const tz: string | undefined = r?.meta?.exchangeTimezoneName;
  if (!tz) { console.warn(`  ${q.symbol}: 거래소 시간대가 없어 비움 (날짜를 확정할 수 없음)`); return m; }
  ts.forEach((t, i) => { const c = cs[i]; if (typeof c === "number") m.set(localDate(t * 1000, tz), c); });
  return m;
}

/** 날짜 → 전 거래일 대비 %. 자료가 5일 넘게 끊긴 뒤의 첫날은 여러 날 변화라 만들지 않는다 (11/6 검토) */
export function pct(series: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const ds = [...series.keys()].sort();
  for (let i = 1; i < ds.length; i++) {
    const prev = series.get(ds[i - 1])!;
    if (prev <= 0 || (ms(ds[i]) - ms(ds[i - 1])) / DAY > 5) continue;
    out.set(ds[i], (series.get(ds[i])! / prev - 1) * 100);
  }
  return out;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const pctOf = async (q: Quote, from: string, to: string) => pct(await closes(q, from, to));
/** 구성 종목이 모두 있는 날만 평균한다 (휴장일이 달라 날마다 구성이 바뀌면 가짜 차이가 생긴다 — 11/6 검토) */
export const avgOn = (date: string, ms_: Map<string, number>[]) => {
  const v = ms_.map((m) => m.get(date));
  return v.every((x): x is number => typeof x === "number") ? mean(v as number[]) : undefined;
};
/** 휴장일 이어 쓰기는 이만큼까지만 (연휴 감안). 그보다 오래 끊기면 '측정 불가' */
export const CARRY_DAYS = 4;
/** 오늘 값이 있으면 그 값, 없으면 CARRY_DAYS 일까지 지난 값 — 나이를 함께 돌려준다 */
export function carryForward(prev: { v?: number; age: number }, today: number | undefined): { v?: number; age: number } {
  if (typeof today === "number") return { v: today, age: 0 };
  const age = prev.age + 1;
  return age > CARRY_DAYS ? { age } : { v: prev.v, age };
}

/** 날짜 → 그 전날까지 28일 중앙값 대비 배율의 중앙값 ×100 (계산은 casereplay.ts 의 wikiDaily — 하루 늦춤을 테스트한다) */
async function wikiSeries(articles: [string, string][], from: string, to: string): Promise<Map<string, number>> {
  const all: { series: Map<string, number>; name: string }[] = [];
  for (const [p, a] of articles) {
    const text = await cached(`wiki_${p}_${safe(encodeURIComponent(a))}_${from}.json`, wikiUrl(p, a, ms(from), ms(to)), { "User-Agent": WIKI_UA }, (j) => Array.isArray(j?.items));
    if (!text) continue;
    const raw = parseWikiSeries(JSON.parse(text));
    all.push({ name: `${p}:${a}`, series: new Map([...raw].map(([k, v]) => [`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`, v])) });
  }
  return wikiDaily(all, from, to);
}

async function gdelt(q: string, from: string, to: string): Promise<Map<string, number>> {
  const f = from.replace(/-/g, ""), t = to.replace(/-/g, "");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=timelinevolraw&format=json&startdatetime=${f}000000&enddatetime=${t}235959`;
  const name = `gdelt_${safe(q)}_${f}.json`;
  const fresh = !existsSync(new URL(name, CACHE));
  const text = await cached(name, url, { "User-Agent": WIKI_UA }, (j) => Array.isArray(j?.timeline?.[0]?.data));
  if (fresh) await wait(6000); // GDELT 는 5초에 한 번
  const out = new Map<string, number>();
  if (!text) return out;
  for (const p of JSON.parse(text).timeline?.[0]?.data ?? []) {
    const d = String(p.date);
    const key = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.set(key, (out.get(key) ?? 0) + Number(p.value ?? 0));
  }
  return out;
}

interface EventFile {
  retrieved: string;
  cases: Record<string, { gov: CaseFile["gov"]; airspace: CaseFile["airspace"]; sources?: string[] }>;
}

async function build(c: CaseConfig): Promise<CaseFile> {
  const from = iso(ms(c.start) - PRE_DAYS * DAY);
  console.log(`${c.id}: ${from} ~ ${c.end}`);
  const fxs = await Promise.all(c.fx.map((s) => pctOf(y(s), from, c.end)));
  const equity = await pctOf(c.equity, from, c.end);
  const peers = await Promise.all(c.peers.map((s) => pctOf(y(s), from, c.end)));
  const def = await Promise.all(c.defense.map((q) => pctOf(q, from, c.end)));
  const base = await Promise.all(c.defenseBase.map((q) => pctOf(q, from, c.end)));
  const wiki = await wikiSeries(c.wiki, from, c.end);
  const media = await gdelt(c.gdelt, from, c.end);

  const days: CaseDay[] = [];
  const preroll: CaseFile["preroll"] = [];
  const carry: Partial<CaseDay> = {}; // 휴장일에는 전 거래일 값을 쓴다 (운영 지표와 같다), 단 CARRY_DAYS 까지만
  const st: Record<"fxPct" | "equityRel" | "defenseRel", { v?: number; age: number }> = { fxPct: { age: 0 }, equityRel: { age: 0 }, defenseRel: { age: 0 } };
  const put = (k: "fxPct" | "equityRel" | "defenseRel", v: number | undefined) => {
    st[k] = carryForward(st[k], typeof v === "number" ? round(v) : undefined);
    if (typeof st[k].v === "number") carry[k] = st[k].v; else delete carry[k];
  };
  for (let t = ms(from); t <= ms(c.end); t += DAY) {
    const date = iso(t);
    // 통화가 여럿이면 모두 있는 날만 가장 약한 값 (구성이 날마다 바뀌지 않게 — 11/6 검토)
    const fxNow = fxs.map((m) => m.get(date));
    put("fxPct", fxNow.every((x): x is number => typeof x === "number") ? Math.max(...(fxNow as number[])) : undefined);
    const eq = equity.get(date), pr = avgOn(date, peers);
    put("equityRel", typeof eq === "number" && typeof pr === "number" ? eq - pr : undefined);
    const d = avgOn(date, def), b = avgOn(date, base);
    put("defenseRel", typeof d === "number" && typeof b === "number" ? d - b : undefined);
    if (date < c.start) {
      if (media.has(date)) preroll.push({ date, media: media.get(date) });
      continue;
    }
    days.push({ date, ...carry, wikiPct: wiki.get(date), media: media.get(date) });
  }
  const evFile = new URL("events.json", OUT);
  const events: EventFile | undefined = existsSync(evFile) ? JSON.parse(readFileSync(evFile, "utf8")) : undefined;
  const ev = events?.cases[c.id];
  return {
    id: c.id, name: c.name, outcome: c.outcome, truthDate: c.truthDate, start: c.start, end: c.end,
    preroll, days, gov: ev?.gov ?? [], airspace: ev?.airspace ?? [],
    sources: [
      `통화: Yahoo Finance 일봉 ${c.fx.join(", ")} (여럿이면 그날 가장 약세)`,
      `증시: ${c.equity.kind === "moex" ? "모스크바 거래소 ISS IMOEX" : `Yahoo Finance ${c.equity.symbol}`} − ${c.peers.join("·")} 평균`,
      `방산: ${c.defense.map((q) => q.symbol).join("·")} − ${c.defenseBase.map((q) => q.symbol).join("·")}`,
      `위키백과 조회수(Wikimedia): ${c.wiki.map(([p, a]) => `${p}:${a}`).join(", ")}`,
      `보도량: GDELT DOC 2.0 "${c.gdelt}"`,
      ...(ev?.sources ?? []),
    ],
    retrieved: iso(Date.now()),
  };
}

async function main() {
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const todo = CASES.filter((x) => !only || x.id === only);
  if (!todo.length) throw new Error(`사례 id 를 모릅니다: ${only} (있는 것: ${CASES.map((x) => x.id).join(", ")})`);
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const c of todo) {
  const out = await build(c);
  // 받기 실패로 핵심 시계열이 통째로 비면 기존 파일을 덮어쓰지 않는다 (11/6 검토)
  const empty = (["fxPct", "equityRel", "defenseRel", "wikiPct", "media"] as const).filter((k) => !out.days.some((d) => typeof d[k] === "number"));
  // 부분 실패도 막는다: 기존 파일보다 측정 날이 줄어든 계열이 있으면 덮어쓰지 않는다
  const prevFile = new URL(`${c.id}.json`, OUT);
  const prev: CaseFile | undefined = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, "utf8")) : undefined;
  const cnt = (f: CaseFile, k: keyof CaseDay) => f.days.filter((d) => typeof d[k] === "number").length;
  const shrank = prev && prev.start === out.start && prev.end === out.end ? (["fxPct", "equityRel", "defenseRel", "wikiPct", "media"] as const).filter((k) => cnt(out, k) < cnt(prev, k)) : [];
  if (shrank.length && !process.argv.includes("--force")) {
    console.error(`  ${c.id}: ${shrank.join(", ")} 측정 날이 기존보다 줄어 저장하지 않음 (의도한 것이면 --force)`);
    process.exitCode = 1;
    continue;
  }
  if (empty.length) {
    console.error(`  ${c.id}: ${empty.join(", ")} 자료가 통째로 비어 저장하지 않음 — 나중에 다시 실행`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(new URL(`${c.id}.json`, OUT), JSON.stringify(out, null, 1) + "\n");
  const n = (k: keyof CaseDay) => out.days.filter((d) => typeof d[k] === "number").length;
  console.log(`  ${out.days.length}일 · 통화 ${n("fxPct")} 증시 ${n("equityRel")} 방산 ${n("defenseRel")} 위키 ${n("wikiPct")} 보도 ${n("media")} · 정부 ${out.gov.length} 영공 ${out.airspace.length}`);
}
}

// 직접 실행했을 때만 받기 시작 (테스트가 가져올 때는 실행하지 않는다). 심볼릭 링크 경로도 같게 본다
const self = (p: string) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) await main();
