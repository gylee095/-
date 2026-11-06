// 외국 전쟁 사례 채점 — data/cases/<사례>.json 을 지금 판정 규칙으로 하루씩 재생해 성적표를 만든다.
// 결과: data/cases/scorecard.json (화면·비교용), docs/CASEBOOK.md (사람이 읽는 성적표)
//
// 실행: npx tsx scripts/score-cases.ts [--no-write]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { assessWarRisk } from "../src/core/warrisk.js";
import { clusterCount, isQuietDay, phaseCalibration, readinessScore, recencyBaseline, replayCase, scoreMulti, scoreCase, FORECAST_DAYS, type CaseFile, type CaseScore, type ReplayDay } from "../src/core/casereplay.js";
import { PHASE_LABEL, type Phase } from "../src/core/warrisk.js";

const DIR = new URL("../data/cases/", import.meta.url);
const NOT_CASE = new Set(["events.json", "scorecard.json", "scorecard-v1.json"]);
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !NOT_CASE.has(f)).sort();
const cases: CaseFile[] = files.map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const ORDER = [
  "ukraine-2022", "russia-buildup-2021", "hamas-2023", "iran-israel-2024-04", "iran-israel-2024-10", "israel-iran-2025",
  "azerbaijan-armenia-2020", "india-pakistan-2019", "israel-hezbollah-2024", "turkey-syria-afrin-2018",
  "saudi-yemen-2015", "ethiopia-tigray-2020",
  "taiwan-2024", "us-iran-2020", "india-china-2020", "north-korea-2017",
];
const idx = (id: string) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };
cases.sort((a, b) => idx(a.id) - idx(b.id));

const results = cases.map((c) => {
  const replay = replayCase(c);
  return { c, replay, score: scoreCase(c, replay) };
});

const phaseName = (p?: Phase) => (p ? `${p}단계(${PHASE_LABEL[p]})` : "—");
const verdict = (s: CaseScore) => {
  if (s.outcome === "no_war") return s.falseAlarmDays ? `헛경보 ${s.falseAlarmDays}일` : "헛경보 없음";
  return s.caught ? `잡음 (${s.crisisLeadDays}일 전)` : "못 잡음";
};
const row = (xs: (string | number)[]) => `| ${xs.join(" | ")} |`;

/** 신호별 합계: 맞는 구간에서 켜졌는가 vs 평시에 얼마나 켜졌는가 */
function signalTable() {
  const m = new Map<string, { label: string; caught: number; leads: number[]; quietHot: number; quiet: number; wars: number }>();
  for (const { score: s } of results) {
    for (const x of s.signals) {
      const e = m.get(x.id) ?? { label: x.label, caught: 0, leads: [], quietHot: 0, quiet: 0, wars: 0 };
      if (x.leadDays !== undefined) { e.caught++; e.leads.push(x.leadDays); }
      e.quietHot += x.quietHotDays;
      m.set(x.id, e);
    }
  }
  const quietTotal = results.reduce((a, r) => a + r.score.quietDays, 0);
  const warTotal = results.filter((r) => r.score.outcome !== "no_war").length;
  return [...m.entries()].map(([id, e]) => {
    const leads = [...e.leads].sort((a, b) => a - b);
    return { id, label: e.label, caught: e.caught, warTotal, medianLead: leads.length ? leads[leads.length >> 1] : undefined, quietHotDays: e.quietHot, quietTotal, quietRatePct: +((e.quietHot / Math.max(1, quietTotal)) * 100).toFixed(1) };
  }).sort((a, b) => b.caught - a.caught || a.quietRatePct - b.quietRatePct);
}
const signals = signalTable();

const totals = {
  warCases: results.filter((r) => r.score.outcome !== "no_war").length,
  caught: results.filter((r) => r.score.caught).length,
  quietDays: results.reduce((a, r) => a + r.score.quietDays, 0),
  falseAlarmDays: results.reduce((a, r) => a + r.score.falseAlarmDays, 0),
  flips: results.reduce((a, r) => a + r.score.flips, 0),
  days: results.reduce((a, r) => a + r.score.days, 0),
};

const retrieved = cases.map((c) => c.retrieved).sort().pop();
// 창 전체가 이미 진행 중인 전쟁 안에 있는 사례 (events.json rules: 2023년 10월 이후 계속)
const ONGOING_WAR = new Set(["iran-israel-2024-04", "iran-israel-2024-10"]);
const quietExOngoing = results.filter((r) => !ONGOING_WAR.has(r.c.id)).reduce((a, r) => ({ quiet: a.quiet + r.score.quietDays, fa: a.fa + r.score.falseAlarmDays }), { quiet: 0, fa: 0 });

// ── 전쟁 직전 대비 점수 눈금: 우크라이나 침공 전날 판정 = 100 ──
const ukr = results.find((r) => r.c.id === "ukraine-2022");
if (!ukr || !ukr.replay.length) throw new Error("ukraine-2022 자료가 없다 — npx tsx scripts/fetch-cases.ts 먼저 (눈금의 100점 기준)");
const eveOf = (r: (typeof results)[number]) => {
  const e = r.replay.filter((d) => !r.c.truthDate || d.date < r.c.truthDate).pop();
  if (!e) throw new Error(`${r.c.id}: 정답일 전 날이 없다 — 자료를 확인할 것`);
  return e;
};
const missing = ORDER.filter((id) => !cases.some((c) => c.id === id));
const extra = cases.filter((c) => !ORDER.includes(c.id)).map((c) => c.id);
if (missing.length) console.warn(`  ORDER에 있지만 파일 없음 (건너뜀): ${missing.join(", ")}`);
if (extra.length) throw new Error(`ORDER에 없는 파일: ${extra.join(",")} (ORDER 갱신 필요)`);
// 0점 = 운영 규칙이 정한 '평소' 눈금 자리 (값을 베껴 쓰지 않고 규칙에서 읽는다)
const usualGauge = assessWarRisk({ now: Date.now(), board: [], briefs: [], patterns: [] }).gauge.usual;
const scale = { usualGauge, eveGauge: eveOf(ukr).gauge };
if (!(scale.eveGauge - scale.usualGauge >= 0.05)) throw new Error(`눈금이 퇴화했다: 우크라이나 전날 ${scale.eveGauge} ≤ 평소 ${scale.usualGauge} — 자료를 확인할 것`);
const anchors = results.filter((r) => r.c.truthDate).map((r) => {
  const e = eveOf(r);
  return { id: r.c.id, name: r.c.name, eve: e.date, phase: e.phase, score: readinessScore(e.gauge, scale), caught: r.score.caught };
});
// 평시로 보는 날들(정답 30일 전보다 앞선 날 + 전쟁 안 난 사례 전체)의 점수 — "평시에 이 점수 이상이 얼마나 흔했나"
// 평시 = 채점과 같은 정의 (isQuietDay)
const quietScores = results.flatMap((r) => r.replay.filter((d) => isQuietDay(r.c, d.date)).map((d) => readinessScore(d.gauge, scale))).sort((a, b) => a - b);
// ── 한국 재생 (주 시험, 11/6 제3자 검토 반영) ──
const KFILE = new URL("../data/korea/korea-2017-2026.json", import.meta.url);
const kc = existsSync(KFILE) ? (JSON.parse(readFileSync(KFILE, "utf8")) as CaseFile & { truth: { date: string; what: string; kind: string; source: string }[] }) : undefined;
const korea = kc && (() => {
  const replay = replayCase(kc);
  const major = kc.truth.filter((t) => t.kind === "major").map((t) => t.date);
  const clash = kc.truth.filter((t) => t.kind !== "major").map((t) => t.date);
  const s = scoreMulti(replay, kc.truth.map((t) => t.date));
  const cal = phaseCalibration(replay, major);
  const pctOf = (x: { hit: number; n: number }) => Math.round((x.hit / Math.max(1, x.n)) * 1000) / 10;
  // 입력과 정답이 같은 도발 일지에서 나온다 → 도발 기록을 뺀 재생·기록만 넣은 재생·단순 기준과 나란히 본다 (11/6 검토)
  const pair = (cc: CaseFile) => { const c2 = phaseCalibration(replayCase(cc), major); return { p1: pctOf(c2.byPhase[1]), n1: c2.byPhase[1].n, p2: pctOf(c2.byPhase[2]), n2: c2.byPhase[2].n }; };
  const noEvents = pair({ ...kc, events: [] });
  const onlyEvents = pair({ ...kc, days: kc.days.map((d) => ({ date: d.date })) });
  const inPeriod = (kc.events ?? []).filter((e) => e.date >= kc.start && e.date <= kc.end);
  const rec = (min: number) => { const b = recencyBaseline(replay, kc.events ?? [], major, min); return { min, on: pctOf(b.on), nOn: b.on.n, off: pctOf(b.off), nOff: b.off.n }; };
  const why2 = { provOnly: 0, both: 0, signalOnly: 0 };
  for (const r of replay.filter((x) => x.phase === 2)) {
    const prov = r.reasons.some((x) => x.startsWith("최근 7일 도발"));
    const sig = r.reasons.some((x) => x.startsWith("평소와 다른") || x.includes("경계 수준"));
    if (prov && sig) why2.both++; else if (prov) why2.provOnly++; else why2.signalOnly++;
  }
  const runs: { from: string; to: string; why: string }[] = [];
  replay.forEach((r, i) => {
    if (r.phase >= 3 && (i === 0 || replay[i - 1].phase < 3)) runs.push({ from: r.date, to: r.date, why: r.reasons[0] ?? "" });
    else if (r.phase >= 3) runs[runs.length - 1].to = r.date;
  });
  const years = (replay.length / 365.25);
  // 결론 문장은 숫자가 뒷받침할 때만 쓴다 — 규칙·자료가 바뀌어 맞지 않으면 다시 쓰라고 표시한다 (11/6 검토)
  const reactive = runs.every((r) => r.why.startsWith("최근 14일 중대 사건"));
  const fullGap = pctOf(cal.byPhase[2]) - pctOf(cal.byPhase[1]);
  const signalGap = noEvents.p2 - noEvents.p1, recGap = rec(4).on - rec(4).off;
  const verdict = reactive && signalGap < fullGap && recGap > fullGap
    ? `**결론: 지금 규칙은 큰 도발을 미리 내다보지 못했다.** 3단계는 모두 큰 사건 뒤의 반응이었다. 1·2단계 차이(${fullGap.toFixed(1)}%p)의 대부분은 "도발은 몰려서 일어난다"에서 나오고, 시장·위키·검색만으로는 차이가 ${signalGap.toFixed(1)}%p뿐이다. 단순 기준("최근 7일 안에 위험도 4 이상 도발")은 ${recGap.toFixed(1)}%p로 지금 규칙보다 잘 갈랐다.`
    : "**결론 문장 자동 보류: 규칙·자료가 바뀌어 이전 결론이 숫자와 맞지 않는다. 아래 표를 보고 다시 쓸 것.**";
  return {
    verdict, reactive, from: kc.start, to: kc.end, days: s.days, usableDays: cal.base.n, phaseShare: Object.fromEntries(Object.entries(cal.byPhase).map(([k, v]) => [k, Math.round((v.n / cal.base.n) * 1000) / 10])),
    noEvents, onlyEvents, recency: [rec(3), rec(4)], why2, eventDays: inPeriod.length, majorClusters: clusterCount(major), majorCount: major.length,
    crisisDays: s.crisisDays, falseAlarmDays: s.falseAlarmDays, flipsPerYear: Math.round(s.flips / years), runs,
    truths: s.truths.length, caught: s.truths.filter((t) => t.caught).length, caughtList: s.truths.filter((t) => t.caught),
    clashes: kc.truth.filter((t) => t.kind !== "major"), clashCal: clash.length ? phaseCalibration(replay, clash) : undefined,
    cal: { basePct: pctOf(cal.base), byPhase: Object.fromEntries(Object.entries(cal.byPhase).map(([k, v]) => [k, { pct: pctOf(v), n: v.n }])) },
    coverage: scoreCase(kc, replay).coverage,
  };
})();

const card = { ruleVersion: "2.0", retrieved, forecastDays: FORECAST_DAYS, totals, scale, anchors, quietScores, cases: results.map((r) => r.score), signals, korea };

const gen = `// 자동 생성: scripts/score-cases.ts — 직접 고치지 말 것. 성적표: docs/CASEBOOK.md, 자료: data/cases/
// 외국 전쟁 사례 ${results.length}건을 지금 판정 규칙(1.0)으로 하루씩 재생한 결과에서 화면에 필요한 것만 담는다.
export const CASEBOOK = ${JSON.stringify({ ruleVersion: "2.0", retrieved, scale, anchors, quietScores, totals: { cases: results.length, ...totals }, korea: korea && { from: korea.from, to: korea.to, phaseShare: korea.phaseShare, cal: korea.cal, falseAlarmDays: korea.falseAlarmDays, crisisDays: korea.crisisDays, truths: korea.truths, caught: korea.caught, noEvents: korea.noEvents, onlyEvents: korea.onlyEvents, recency: korea.recency } })} as const;
`;

const timeline = (replay: ReplayDay[], truth?: string) => replay.filter((r) => !truth || r.date < truth).map((r) => r.phase).join("");

const md = `# 외국 전쟁 사례집 — 성적표 (규칙 1.0)

> 자동 생성: \`npx tsx scripts/score-cases.ts\`. 손으로 고치지 않는다. 자료 받은 날: ${retrieved}.
> 자료: \`data/cases/<사례>.json\` (출처 포함) · 규칙: \`src/core/casereplay.ts\` 가 운영 판정 함수 \`assessWarRisk\` 를 그대로 호출한다.

## 한눈에

- **한반도 10년 재생(주 시험):** 큰 도발을 미리 내다본 경우 없음. 아래 '한반도 10년 재생' 참고.
- **외국 사례(보조, 정부 경보 위주):** 공격이 있었던 사례 ${totals.warCases}건 중 **미리 잡은 것 ${totals.caught}건** ('잡음' = 공격 전 ${FORECAST_DAYS}일 안에 3단계 이상).
- 평시 구간 ${totals.quietDays}일 중 **헛경보 ${totals.falseAlarmDays}일** (3단계 이상).
- 헛경보를 전쟁 진행 중 기간과 나누면: 가자 전쟁이 이미 진행 중이던 창(이란 2024년 4월·10월)을 빼면 평시 ${quietExOngoing.quiet}일 중 ${quietExOngoing.fa}일이다. 대표 숫자는 빼지 않은 엄격 기준을 쓴다.
- 채점한 ${totals.days}일 동안 단계가 바뀐 횟수 ${totals.flips}번.

| 사례 | 결과 | 판정 | 3단계 첫날 | 4단계 첫날 | 전날 단계 | 평시 헛경보 | 단계 변화 |
|---|---|---|---|---|---|---|---|
${results.map(({ score: s }) => row([s.name, s.outcome === "no_war" ? "전쟁 안 남" : s.truthDate!, verdict(s), s.firstCrisis ?? "—", s.firstImminent ?? "—", phaseName(s.eveLevel), `${s.falseAlarmDays}/${s.quietDays}일`, `${s.flips}번`])).join("\n")}

${korea ? `## 한반도 10년 재생 (${korea.from} ~ ${korea.to}) — 주 시험

${korea.verdict}

지금 규칙(1.0)을 한반도 과거 ${korea.days}일에 하루씩 돌렸다(뒤 30일을 다 볼 수 있는 ${korea.usableDays}일로 채점). 입력은 시장·위키·네이버 검색·북한 도발 기록(CSIS 도발 일지 ${korea.eventDays}일)뿐이고, 정답 '큰 도발'은 같은 일지에서 규칙이 위험도 4 이상으로 매긴 날(핵실험·ICBM·위성 발사·일본 상공 통과·포격·지뢰 등 ${korea.majorCount}일, 30일로 묶으면 ${korea.majorClusters}개 국면)이다. **입력과 정답이 같은 자료에서 나온다.**

| 단계 | 날 비율 | 그 단계였던 날 뒤 30일 안에 큰 도발 | 날 수 |
|---|---|---|---|
${[1, 2].filter((p) => korea.cal.byPhase[p]).map((p) => row([`${phaseName(p as Phase)}`, `${korea.phaseShare[p]}%`, `${korea.cal.byPhase[p].pct}%`, korea.cal.byPhase[p].n])).join("\n")}
| 3단계(위기) | ${korea.phaseShare[3]}% | 2구간 중 1구간 (비율로 쓰기엔 표본이 없다) | ${korea.cal.byPhase[3]?.n ?? 0} |
| 전체 | 100% | ${korea.cal.basePct}% | ${korea.usableDays} |

### 이 차이가 규칙의 실력인가 — 나란히 비교

| 방식 | 낮은 쪽 | 높은 쪽 |
|---|---|---|
| 지금 규칙 전체 (1단계 / 2단계) | ${korea.cal.byPhase[1]?.pct}% | ${korea.cal.byPhase[2]?.pct}% |
| 도발 기록을 뺀 규칙 — 시장·위키·검색만 (1단계 / 2단계) | ${korea.noEvents.p1}% | ${korea.noEvents.p2}% |
| 도발 기록만 넣은 규칙 (1단계 / 2단계) | ${korea.onlyEvents.p1}% | ${korea.onlyEvents.p2}% |
${korea.recency.map((r) => `| 단순 기준: 최근 7일 안에 위험도 ${r.min} 이상 (없음 / 있음, ${r.nOn}일) | ${r.off}% | ${r.on}% |`).join("\n")}

- 시장·위키·검색만으로는 평균(${korea.cal.basePct}%)과 거의 차이가 없다. 이 신호들은 큰 도발을 미리 알려 주지 못했다.
- 2단계의 이유: 도발 기록만 ${korea.why2.provOnly}일 · 도발+다른 신호 ${korea.why2.both}일 · 다른 신호만 ${korea.why2.signalOnly}일. 2단계(긴장)는 ${korea.phaseShare[2]}%의 날에 나오는 흔한 상태이고, 대부분 '최근 도발이 있었다'는 뜻이다.
- **3단계는 ${korea.crisisDays}일(독립 구간 ${korea.runs.length}개)${korea.reactive ? "뿐이고 모두 큰 사건 뒤의 반응이다" : ""}**: ${korea.runs.map((r) => `${r.from}~${r.to}`).join(", ")}. 그중 뒤 30일 안에 큰 도발이 없었던 날(헛경보) ${korea.falseAlarmDays}일.
- 큰 도발·교전 ${korea.truths}번 중 30일 전부터 3단계였던 것 ${korea.caught}번 — ${korea.caughtList.map((t) => t.date).join(", ") || "없음"}. ${korea.reactive ? "모두 앞선 큰 사건의 14일 경보가 이어진 경우로, **미리 내다본 경우는 없다.**" : ""}
- 4·5단계는 나올 수 없다: 과거 정부 경보·교전 보도를 입력하지 못했다. 예측시장도 없어 규칙의 '돈' 경로가 운영보다 막혀 있다(시장 신호 감점이 항상 걸린다). '3단계가 드물다'는 규칙이 신중해서가 아니라 입력이 빠진 영향이 섞여 있다.
- 정답 자료의 마지막 날: ${kc.truth[kc.truth.length - 1]?.date ?? "없음"}. 도발 일지가 늦게 갱신되면 최근 구간의 큰 도발이 덜 세어질 수 있다.
- 단계가 바뀐 횟수: 한 해 평균 ${korea.flipsPerYear}번 (하루 단위 원값. 손님 알림은 확인 규칙을 거치므로 이보다 적다, 대부분 1↔2단계).
${korea.clashes.length ? `- 실제 교전: 조사로 확인한 것은 ${korea.clashes.length}번뿐이다(${korea.clashes.map((c) => c.date).join(", ")}). 화면의 '30일 국지 충돌 %'를 결과로 맞추기에는 표본이 없다. 조사가 놓친 사건이 있을 수 있다.` : ""}
- 같은 자료로 규칙을 만들었을 가능성: 규칙 일부(엘리트 영역 등)는 이 기간을 포함한 백테스트로 정해졌다. 독립 검증이 아니다.

측정 범위 (영역별 측정 / 전체 지표, 군사 동향은 지표 대신 도발 기록으로 들어감): ${korea.coverage.map((d) => `${d.label} ${d.measured}/${d.total}`).join(" · ")}
` : ""}
## 전쟁 직전 대비 점수 (화면에 나가는 숫자)

0 = 한반도 평소(평온 단계 기준점), 100 = 우크라이나 침공 전날의 판정(${phaseName(eveOf(ukr).phase)}). 판정 규칙의 온도계 눈금(단계 + 단계 안 위치)을 이 두 점 사이에 놓은 것이다. 각 사례의 전날 점수:

| 사례 | 전날 | 전날 단계 | 점수 | 미리 잡았나 |
|---|---|---|---|---|
${anchors.map((a) => row([a.name, a.eve, phaseName(a.phase), a.score, a.caught ? "잡음" : "못 잡음"])).join("\n")}

평시로 보는 ${quietScores.length}일의 점수: 중앙값 ${quietScores[quietScores.length >> 1]}, 상위 10% ${quietScores[Math.floor(quietScores.length * 0.9)]}, 최고 ${quietScores[quietScores.length - 1]}.

## 외국 사례로 말할 수 없는 것

- **표본이 ${results.length}건이다.** 규칙이 낫다·못하다의 방향은 볼 수 있어도 확률을 맞출 만큼은 아니다.
- **측정한 신호가 일부다** (아래 표). 군사 영역은 항공사 운항 중단·영공 폐쇄 외에는 재생하지 못했다. 그래서 군사 쪽 근거로 올라가는 경로는 시험되지 않았다.
- **사건 보도 판정을 쓰지 않았다.** 운영에서는 도발 보도가 군사 영역을 올린다. 사례에서는 그 제목들을 재현하지 못해 빠져 있다 — 실제 운영보다 군사 판정이 낮게 나올 수 있다.
- **이스라엘 증시는 일~목 거래(2023~2025)라** 월~금 비교 증시와 겹치는 날은 월~목뿐이다. 나머지 날은 4일까지 이어 쓴 값이라 이스라엘 사례의 증시 신호는 운영보다 둔하다.
- **보도량 기준선이 운영보다 민감하다.** 운영은 하루에 여러 번 재서 하루 안 흔들림이 기준선에 들어가지만, 사례는 하루 한 값이라 그 몫이 0이다 — 보도량 신호가 운영보다 쉽게 켜진다.
- **다른 나라를 재는 잣대다.** 운영 문턱은 한국 시장 기준이다. 러시아·이스라엘 시장의 평소 변동 폭은 다르다.
- 정부 경보는 **안보 사유만** 센다. 코로나 사유 경보는 제외했다 (운영 규칙은 사유를 구분하지 못한다 — 아래 '발견').

## 측정 범위 (영역별 측정 / 전체 지표)

| 사례 | ${results[0].score.coverage.map((d) => d.label).join(" | ")} |
|---|${results[0].score.coverage.map(() => "---").join("|")}|
${results.map(({ score: s }) => row([s.name, ...s.coverage.map((d) => `${d.measured}/${d.total}`)])).join("\n")}

## 신호별 성적

'잡은 사례' = 공격 전 ${FORECAST_DAYS}일 안에 켜진 사례 수. '평시 켜진 비율'이 높을수록 헛것을 많이 낸 신호다.

| 신호 | 잡은 사례 | 중앙 선행일 | 평시 켜진 비율 |
|---|---|---|---|
${signals.map((x) => row([x.label, `${x.caught}/${x.warTotal}`, x.medianLead !== undefined ? `${x.medianLead}일` : "—", `${x.quietRatePct}% (${x.quietHotDays}/${x.quietTotal}일)`])).join("\n")}

## 사례별 하루 단계

숫자 한 칸이 하루(1~5단계), 왼쪽이 창 시작, 오른쪽 끝이 정답일 전날이다.

${results.map(({ c, replay }) => `- **${c.name}** (${c.start} ~ ${c.end})\n  \`${timeline(replay, c.truthDate)}\``).join("\n")}

## 출처

${results.map(({ c }) => `### ${c.name}\n\n${c.sources.map((s) => `- ${s}`).join("\n")}\n${c.gov.map((g) => `- ${g.date} ${g.indicator}=${g.value}: ${g.what} — ${g.source}`).join("\n")}${c.airspace.length ? "\n" : ""}${c.airspace.map((a) => `- ${a.date} 영공·항공: ${a.what} — ${a.source}`).join("\n")}`).join("\n\n")}
`;

if (!process.argv.includes("--no-write")) {
  writeFileSync(new URL("scorecard.json", DIR), JSON.stringify(card, null, 1) + "\n");
  writeFileSync(new URL("../docs/CASEBOOK.md", import.meta.url), md);
  writeFileSync(new URL("../src/core/casebook_data.ts", import.meta.url), gen);
}
for (const { c, replay, score: s } of results) {
  console.log(`${s.name}\n  ${verdict(s)} · 전날 ${phaseName(s.eveLevel)} 압력 ${s.evePressure ?? "-"} · 평시 헛경보 ${s.falseAlarmDays}/${s.quietDays} · 변화 ${s.flips}\n  ${timeline(replay, c.truthDate)}`);
}
console.log(JSON.stringify(totals));
console.table(signals.map((x) => ({ id: x.id, caught: `${x.caught}/${x.warTotal}`, lead: x.medianLead, quietPct: x.quietRatePct })));
