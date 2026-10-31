// 외국인 순매도 백테스트 — "북한 사건 전에 외국인이 미리 팔았는가?"
// 결과와 해석은 docs/INDICATORS.md '0.1 백테스트'에 있다. 운영 지표와 같은 함수(summarizeFlow)로 매일의 z 를 다시 계산한다.
//
// 실행: KEW_SECRET=... npx tsx scripts/backtest-foreign-flows.ts
//   - 자료는 서버의 /api/ecos-series 로 받는다(한국은행 키는 서버에만 있다). 받은 자료는 .cache/ 에 저장해 다시 쓴다.
//   - KEW_BASE 로 서버 주소를 바꿀 수 있다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { summarizeFlow, type DayValue } from "../src/core/collectors/ecos.js";

const BASE = process.env.KEW_BASE ?? "https://korea-early-warning.gylee-30d.workers.dev";
const CACHE = new URL("../.cache/", import.meta.url);

/** 사건 날짜(KST). afterClose = 장 마감 뒤 → 다음 거래일이 첫 반응일. control = 북한과 무관한 대조군 */
export const EVENTS: { date: string; name: string; afterClose?: boolean; control?: boolean }[] = [
  { date: "2006-07-05", name: "대포동2호 등 미사일 7발" },
  { date: "2006-10-09", name: "1차 핵실험" },
  { date: "2009-04-06", name: "은하2호 발사(4/5 일요일)" },
  { date: "2009-05-25", name: "2차 핵실험" },
  { date: "2010-03-26", name: "천안함 피격(밤 9시)", afterClose: true },
  { date: "2010-05-20", name: "천안함 조사 결과 발표 → 5·24 조치" },
  { date: "2010-11-23", name: "연평도 포격(오후 2시 34분)" },
  { date: "2011-12-19", name: "김정일 사망 발표(정오)" },
  { date: "2012-12-12", name: "은하3호 발사" },
  { date: "2013-02-12", name: "3차 핵실험" },
  { date: "2013-04-01", name: "'전시상태' 선포(3/30) → 개성공단 차단·철수" },
  { date: "2014-03-31", name: "서해 NLL 포격 훈련·대응 사격" },
  { date: "2015-08-10", name: "DMZ 목함지뢰 발표 → 확성기 재개" },
  { date: "2015-08-20", name: "서부전선 포격(장 마감 뒤) → 준전시상태", afterClose: true },
  { date: "2016-01-06", name: "4차 핵실험" },
  { date: "2016-02-11", name: "광명성4호(2/7) → 개성공단 전면 중단(연휴 뒤 첫 거래일)" },
  { date: "2016-09-09", name: "5차 핵실험" },
  { date: "2017-04-11", name: "'4월 위기설'(항모 전개·선제타격설)" },
  { date: "2017-07-04", name: "화성-14 첫 ICBM" },
  { date: "2017-07-31", name: "화성-14 2차(7/28 밤)" },
  { date: "2017-08-09", name: "'화염과 분노'·괌 포위사격 위협" },
  { date: "2017-08-29", name: "화성-12 일본 상공 통과" },
  { date: "2017-09-04", name: "6차 핵실험(9/3 일요일)" },
  { date: "2017-09-15", name: "화성-12 일본 상공 2차" },
  { date: "2017-09-22", name: "김정은 '초강경 대응' 성명" },
  { date: "2017-11-29", name: "화성-15 ICBM" },
  { date: "2020-06-16", name: "남북공동연락사무소 폭파" },
  { date: "2022-10-04", name: "IRBM 일본 상공 통과" },
  { date: "2022-11-02", name: "미사일 20여 발·울릉도 공습경보" },
  { date: "2023-11-22", name: "정찰위성 발사 → 9·19 합의 효력 정지" },
  { date: "2024-01-05", name: "연평도 북방 해안포 200여 발·주민 대피" },
  { date: "2024-01-16", name: "'제1적대국' 헌법 명기 지시" },
  { date: "2024-10-14", name: "평양 무인기 주장(10/11 밤) → 연결도로 폭파" },
  { date: "2026-10-29", name: "단거리 탄도미사일 10여 발·확성기 시험방송" },
  { date: "2008-10-06", name: "리먼 사태 후 세계 금융위기", control: true },
  { date: "2011-08-05", name: "미국 신용등급 강등(8/5 밤)", afterClose: true, control: true },
  { date: "2015-08-24", name: "중국발 '검은 월요일'", control: true },
  { date: "2020-03-09", name: "코로나19 세계 폭락", control: true },
  { date: "2024-12-03", name: "비상계엄(밤 10시 27분)", afterClose: true, control: true },
];

async function series(stat: string, item: string): Promise<DayValue[]> {
  const file = new URL(`ecos_${stat}_${item}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const secret = process.env.KEW_SECRET;
  if (!secret) throw new Error("KEW_SECRET 이 필요합니다 (서버의 /api/ecos-series 인증)");
  const res = await fetch(`${BASE}/api/ecos-series?stat=${stat}&item=${item}&from=20030101`, { headers: { authorization: `Bearer ${secret}` } });
  const j = (await res.json()) as { rows?: [string, number][]; error?: string };
  if (!j.rows) throw new Error(j.error ?? `HTTP ${res.status}`);
  const days = j.rows.map(([date, value]) => ({ date, value }));
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(days));
  return days;
}

/** 야후 일봉 종가 — 거래소 현지 날짜(YYYYMMDD) → 종가 */
async function yahoo(sym: string): Promise<Map<string, number>> {
  const file = new URL(`yahoo_${sym.replace(/\W/g, "")}.json`, CACHE);
  if (!existsSync(file)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=1041379200&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
    const j = (await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).json()) as any;
    const r = j.chart.result[0];
    const off = r.meta.gmtoffset ?? 0;
    const rows: [string, number][] = [];
    (r.timestamp as number[]).forEach((t, i) => {
      const c = r.indicators.quote[0].close[i];
      if (c != null) rows.push([new Date((t + off) * 1000).toISOString().slice(0, 10).replace(/-/g, ""), c]);
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(rows));
  }
  return new Map(JSON.parse(readFileSync(file, "utf8")) as [string, number][]);
}

/** 운영 지표와 같은 방식의 z — i 일까지의 자료로 계산 (5일 합계 vs 그 앞 120거래일 분포) */
const zAt = (days: DayValue[], i: number) => (i < 0 ? undefined : summarizeFlow(days.slice(Math.max(0, i - 129), i + 1))?.z);
const t0Index = (days: DayValue[], date: string, afterClose?: boolean) => {
  const d = date.replace(/-/g, "");
  return days.findIndex((x) => (afterClose ? x.date > d : x.date >= d));
};
const pct = (a: number, b: number) => +((a / b - 1) * 100).toFixed(2);
const fmt = (x: number | undefined, w = 6) => (x === undefined || Number.isNaN(x) ? "-" : x.toFixed(2)).padStart(w);

async function main() {
  const flows = await series("802Y001", "0030000");
  const kospi = await series("802Y001", "0001000");
  const kIdx = new Map(kospi.map((d) => [d.date, d.value]));
  const n = flows.length;
  const Z = flows.map((_, i) => zAt(flows, i));
  const valid = Z.filter((z): z is number => z !== undefined);
  const rate = (thr: number) => (valid.filter((z) => z <= thr).length / valid.length) * 100;
  console.log(`자료: ${flows[0].date} ~ ${flows[n - 1].date}, ${n} 거래일 (z 계산 가능 ${valid.length}일)`);
  console.log(`아무 날이나: z≤−2 ${rate(-2).toFixed(1)}% · z≤−3 ${rate(-3).toFixed(1)}%`);
  const min10 = Z.map((_, i) => (i < 10 ? undefined : Math.min(...Z.slice(i - 10, i).map((z) => z ?? 0))));
  const m10 = min10.filter((x): x is number => x !== undefined);
  console.log(`아무 날이나 직전 10거래일 중 한 번이라도 z≤−2: ${((m10.filter((x) => x <= -2).length / m10.length) * 100).toFixed(1)}%\n`);

  console.log("반응일      | 사건                                   | 직전5일 z | 직전10일 최저 | 반응5일 z | 코스피 당일 | 5일 뒤 | 20일 뒤");
  const nk: { i0: number; pre: number; pre10: number; post: number; r0: number; r5: number; r20: number }[] = [];
  for (const e of EVENTS) {
    const i0 = t0Index(flows, e.date, e.afterClose);
    if (i0 < 130) continue;
    const pre = zAt(flows, i0 - 1)!;
    const pre10 = Math.min(...Z.slice(i0 - 10, i0).map((z) => z ?? 0));
    // 반응: 사건일~4거래일 뒤 5일 합계를, 사건 전 분포(사건 전날 기준 120거래일)와 비교
    let post = NaN;
    if (i0 + 4 < n) {
      const before = summarizeFlow(flows.slice(Math.max(0, i0 - 130), i0))!;
      const sum5 = flows.slice(i0, i0 + 5).reduce((a, d) => a + d.value, 0);
      post = (sum5 - before.mean5d) / before.sd5d;
    }
    const k = (j: number) => kIdx.get(flows[Math.min(j, n - 1)].date)!;
    const r0 = pct(k(i0), k(i0 - 1));
    const r5 = i0 + 4 < n ? pct(k(i0 + 4), k(i0 - 1)) : NaN;
    const r20 = i0 + 19 < n ? pct(k(i0 + 19), k(i0 - 1)) : NaN;
    if (!e.control) nk.push({ i0, pre, pre10, post, r0, r5, r20 });
    console.log(`${flows[i0].date} | ${(e.control ? "[대조] " : "") + e.name}`.padEnd(60) + `|${fmt(pre)} |${fmt(pre10)} |${fmt(post)} |${fmt(r0)}% |${fmt(r5)}% |${fmt(r20)}%`);
  }
  const med = (xs: number[]) => {
    const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  console.log(`\n북한 사건 ${nk.length}건`);
  console.log(`  직전 5일 z≤−2: ${nk.filter((x) => x.pre <= -2).length}건 (중앙값 ${med(nk.map((x) => x.pre)).toFixed(2)})`);
  console.log(`  직전 10일 중 한 번이라도 z≤−2: ${nk.filter((x) => x.pre10 <= -2).length}건 (${((nk.filter((x) => x.pre10 <= -2).length / nk.length) * 100).toFixed(0)}%)`);
  console.log(`  사건 뒤 5일 z≤−2: ${nk.filter((x) => x.post <= -2).length}건 (중앙값 ${med(nk.map((x) => x.post)).toFixed(2)})`);
  console.log(`  코스피 중앙값: 당일 ${med(nk.map((x) => x.r0)).toFixed(2)}% · 5일 뒤 ${med(nk.map((x) => x.r5)).toFixed(2)}% · 20일 뒤 ${med(nk.map((x) => x.r20)).toFixed(2)}%`);

  const episodes = (hit: (i: number) => boolean) => {
    const eps: number[] = [];
    let last = -999;
    for (let i = 0; i < n; i++)
      if (hit(i)) {
        if (i - last > 10) eps.push(i);
        last = i;
      }
    return eps;
  };
  const chanceArr = flows.map((_, i) => nk.some((x) => x.i0 > i && x.i0 <= i + 20)).slice(130);
  const chance = ((chanceArr.filter(Boolean).length / chanceArr.length) * 100).toFixed(0);
  const report = (label: string, eps: number[]) => {
    const followed = eps.filter((s) => nk.some((x) => x.i0 > s && x.i0 <= s + 20)).length;
    console.log(`${label}: 구간 ${eps.length}개 — 20거래일 안에 북한 사건이 뒤따름 ${followed}개 (${((followed / Math.max(1, eps.length)) * 100).toFixed(0)}%), 아무 날이나 고르면 ${chance}%`);
  };
  console.log("");
  // 거꾸로: 대량 매도 구간이 시작된 뒤 20거래일 안에 북한 사건이 왔나
  for (const thr of [-2, -3]) report(`z≤${thr} 대량 매도`, episodes((i) => Z[i] !== undefined && Z[i]! <= thr));

  // 한국만의 하락(코스피 5일 변동 − 닛케이·대만 가권 평균) — 야후 일봉. 실패하면 건너뛴다.
  try {
    const [n225, twii] = await Promise.all([yahoo("^N225"), yahoo("^TWII")]);
    const ffill = (m: Map<string, number>) => {
      let lastV: number | undefined;
      const keys = [...m.keys()].sort();
      let j = 0;
      return flows.map((d) => {
        while (j < keys.length && keys[j] <= d.date) lastV = m.get(keys[j++]);
        return lastV;
      });
    };
    const a = ffill(n225), b = ffill(twii);
    const kv = flows.map((d) => kIdx.get(d.date)!);
    const rel5 = flows.map((_, i) => (i < 5 || !a[i] || !a[i - 5] || !b[i] || !b[i - 5] ? NaN : pct(kv[i], kv[i - 5]) - (pct(a[i]!, a[i - 5]!) + pct(b[i]!, b[i - 5]!)) / 2));
    report("한국만 5일 −3%p 이하", episodes((i) => rel5[i] <= -3));
    report("외국인 z≤−2 + 한국만 5일 −2%p 이하", episodes((i) => Z[i] !== undefined && Z[i]! <= -2 && rel5[i] <= -2));
    report("외국인 z≤−3 + 한국만 5일 −3%p 이하", episodes((i) => Z[i] !== undefined && Z[i]! <= -3 && rel5[i] <= -3));
  } catch (e) {
    console.log(`(이웃 증시 비교 건너뜀: ${String((e as Error)?.message ?? e).slice(0, 120)})`);
  }

}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
