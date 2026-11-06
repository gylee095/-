// 외국 전쟁 사례 채점 — data/cases/<사례>.json 을 지금 판정 규칙으로 하루씩 재생해 성적표를 만든다.
// 결과: data/cases/scorecard.json (화면·비교용), docs/CASEBOOK.md (사람이 읽는 성적표)
//
// 실행: npx tsx scripts/score-cases.ts [--no-write]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { assessWarRisk } from "../src/core/warrisk.js";
import { isQuietDay, phaseCalibration, readinessScore, replayCase, scoreMulti, scoreCase, FORECAST_DAYS, type CaseFile, type CaseScore, type ReplayDay } from "../src/core/casereplay.js";
import { PHASE_LABEL, type Phase } from "../src/core/warrisk.js";

const DIR = new URL("../data/cases/", import.meta.url);
const NOT_CASE = new Set(["events.json", "scorecard.json"]);
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !NOT_CASE.has(f)).sort();
const cases: CaseFile[] = files.map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const ORDER = ["ukraine-2022", "russia-buildup-2021", "hamas-2023", "iran-israel-2024-04", "iran-israel-2024-10", "israel-iran-2025"];
cases.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

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
if (missing.length || extra.length) throw new Error(`사례 파일이 정해진 목록과 다르다 — 빠짐: ${missing.join(",") || "없음"}, 모르는 것: ${extra.join(",") || "없음"} (ORDER 갱신 또는 fetch-cases)`);
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
  const runs: { from: string; to: string; why: string }[] = [];
  replay.forEach((r, i) => {
    if (r.phase >= 3 && (i === 0 || replay[i - 1].phase < 3)) runs.push({ from: r.date, to: r.date, why: r.reasons[0] ?? "" });
    else if (r.phase >= 3) runs[runs.length - 1].to = r.date;
  });
  const years = (replay.length / 365.25);
  return {
    from: kc.start, to: kc.end, days: s.days, phaseShare: Object.fromEntries(Object.entries(s.phaseDays).map(([k, v]) => [k, Math.round((v / s.days) * 1000) / 10])),
    crisisDays: s.crisisDays, falseAlarmDays: s.falseAlarmDays, flipsPerYear: Math.round(s.flips / years), runs,
    truths: s.truths.length, caught: s.truths.filter((t) => t.caught).length, caughtList: s.truths.filter((t) => t.caught),
    clashes: kc.truth.filter((t) => t.kind !== "major"), clashCal: clash.length ? phaseCalibration(replay, clash) : undefined,
    cal: { basePct: pctOf(cal.base), byPhase: Object.fromEntries(Object.entries(cal.byPhase).map(([k, v]) => [k, { pct: pctOf(v), n: v.n }])) },
    coverage: scoreCase(kc, replay).coverage,
  };
})();

const card = { ruleVersion: "1.0", retrieved, forecastDays: FORECAST_DAYS, totals, scale, anchors, quietScores, cases: results.map((r) => r.score), signals, korea };

const gen = `// 자동 생성: scripts/score-cases.ts — 직접 고치지 말 것. 성적표: docs/CASEBOOK.md, 자료: data/cases/
// 외국 전쟁 사례 ${results.length}건을 지금 판정 규칙(1.0)으로 하루씩 재생한 결과에서 화면에 필요한 것만 담는다.
export const CASEBOOK = ${JSON.stringify({ ruleVersion: "1.0", retrieved, scale, anchors, quietScores, totals: { cases: results.length, ...totals }, korea: korea && { from: korea.from, to: korea.to, phaseShare: korea.phaseShare, cal: korea.cal, falseAlarmDays: korea.falseAlarmDays, crisisDays: korea.crisisDays, truths: korea.truths, caught: korea.caught } })} as const;
`;

const timeline = (replay: ReplayDay[], truth?: string) => replay.filter((r) => !truth || r.date < truth).map((r) => r.phase).join("");

const md = `# 외국 전쟁 사례집 — 성적표 (규칙 1.0)

> 자동 생성: \`npx tsx scripts/score-cases.ts\`. 손으로 고치지 않는다. 자료 받은 날: ${retrieved}.
> 자료: \`data/cases/<사례>.json\` (출처 포함) · 규칙: \`src/core/casereplay.ts\` 가 운영 판정 함수 \`assessWarRisk\` 를 그대로 호출한다.

## 한눈에

- 공격이 있었던 사례 ${totals.warCases}건 중 **미리 잡은 것 ${totals.caught}건** ('잡음' = 공격 전 ${FORECAST_DAYS}일 안에 3단계 이상).
- 평시 구간 ${totals.quietDays}일 중 **헛경보 ${totals.falseAlarmDays}일** (3단계 이상).
- 채점한 ${totals.days}일 동안 단계가 바뀐 횟수 ${totals.flips}번.

| 사례 | 결과 | 판정 | 3단계 첫날 | 4단계 첫날 | 전날 단계 | 평시 헛경보 | 단계 변화 |
|---|---|---|---|---|---|---|---|
${results.map(({ score: s }) => row([s.name, s.outcome === "no_war" ? "전쟁 안 남" : s.truthDate!, verdict(s), s.firstCrisis ?? "—", s.firstImminent ?? "—", phaseName(s.eveLevel), `${s.falseAlarmDays}/${s.quietDays}일`, `${s.flips}번`])).join("\n")}

${korea ? `## 한반도 10년 재생 (${korea.from} ~ ${korea.to}) — 주 시험

지금 규칙(1.0)을 한반도 과거 ${korea.days}일에 하루씩 돌렸다. 시장·위키·네이버 검색·북한 도발(CSIS 도발 일지 → 운영과 같은 위험도)을 넣었고, 보도량·항공·정부 경보 등은 과거 자료가 없어 뺐다(아래 측정 범위).

| 단계 | 날 비율 | 그 단계였던 날 뒤 30일 안에 큰 도발 | 날 수 |
|---|---|---|---|
${[1, 2, 3, 4, 5].filter((p) => korea.cal.byPhase[p]).map((p) => row([`${phaseName(p as Phase)}`, `${korea.phaseShare[p]}%`, `${korea.cal.byPhase[p].pct}%`, korea.cal.byPhase[p].n])).join("\n")}
| 전체 | 100% | ${korea.cal.basePct}% | — |

- **3단계 이상은 ${korea.crisisDays}일**뿐이고 모두 큰 사건 **뒤의 반응**이었다: ${korea.runs.map((r) => `${r.from}~${r.to} (${r.why.slice(0, 40)})`).join(", ")}. 이 중 뒤 30일 안에 큰 도발이 없었던 날(헛경보) ${korea.falseAlarmDays}일.
- 큰 도발·교전 ${korea.truths}번 중 30일 안에 3단계 이상이었던 것 ${korea.caught}번 — ${korea.caughtList.map((t) => t.date).join(", ") || "없음"} (앞선 큰 사건의 14일 경보가 이어진 경우). **미리 내다본 경우는 사실상 없다.**
- 단계가 바뀐 횟수: 한 해 평균 ${korea.flipsPerYear}번 (하루 단위 원값, 대부분 1↔2단계).
- 해석: 2단계(긴장)는 10년 중 ${korea.phaseShare[2]}%의 날에 나온 흔한 상태다. 2단계였던 날 뒤 30일 안에 큰 도발이 난 비율(${korea.cal.byPhase[2]?.pct}%)은 1단계(${korea.cal.byPhase[1]?.pct}%)보다 높아 단계가 정보를 조금 갖고 있다. 다만 '전쟁'이 아니라 '큰 도발'로 맞춘 값이다.
${korea.clashCal ? `- 실제 교전·직접 공격 ${korea.clashes.length}번(조사): ${korea.clashes.map((c) => `${c.date} ${c.what.slice(0, 30)}`).join(" · ")}. 그 단계였던 날 뒤 30일 안에 교전: ${Object.entries(korea.clashCal.byPhase).map(([p, v]) => `${p}단계 ${Math.round((v.hit / Math.max(1, v.n)) * 1000) / 10}%`).join(", ")}.` : ""}

측정 범위 (영역별 측정 / 전체 지표, 군사 동향은 지표 대신 도발 사건 ${kc!.events?.length ?? 0}일로 들어감): ${korea.coverage.map((d) => `${d.label} ${d.measured}/${d.total}`).join(" · ")}
` : ""}
## 전쟁 직전 대비 점수 (화면에 나가는 숫자)

0 = 한반도 평소(평온 단계 기준점), 100 = 우크라이나 침공 전날의 판정(${phaseName(eveOf(ukr).phase)}). 판정 규칙의 온도계 눈금(단계 + 단계 안 위치)을 이 두 점 사이에 놓은 것이다. 각 사례의 전날 점수:

| 사례 | 전날 | 전날 단계 | 점수 | 미리 잡았나 |
|---|---|---|---|---|
${anchors.map((a) => row([a.name, a.eve, phaseName(a.phase), a.score, a.caught ? "잡음" : "못 잡음"])).join("\n")}

평시로 보는 ${quietScores.length}일의 점수: 중앙값 ${quietScores[quietScores.length >> 1]}, 상위 10% ${quietScores[Math.floor(quietScores.length * 0.9)]}, 최고 ${quietScores[quietScores.length - 1]}.

## 이 성적표로 말할 수 없는 것

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
