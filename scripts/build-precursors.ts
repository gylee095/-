// 전조 사례집 → 가중치 표 + 성적표 (규칙 3.0)
// 실행: npx tsx scripts/build-precursors.ts [--holdout]
//  1) data/precursors/raw/<사례>.json (조사 결과) 을 검사해 data/precursors/cases.json 으로 묶는다.
//  2) 가설별 집계표를 만들어 src/core/precursor_data.ts 에 쓴다 (운영 코드가 읽는 것).
//  3) 사례를 하나씩 빼고(leave-one-out) 그 사례를 채점해 docs/PRECURSORS.md 성적표를 쓴다.
//  --holdout: 봉인 사례(data/precursors/holdout/*.json)를 채점에만 쓴다 — 표에는 넣지 않는다. 규칙을 고정한 뒤 한 번만.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { CLUSTER_LABEL, MODEL, buildTable, caseEvidence, caseLogOdds, classOf, discrimination, warLikeness, type CaseRecord, type HypDef, type PrecursorTable } from "../src/core/precursors.js";

const ROOT = new URL("../", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
const codebook = read("data/precursors/codebook.json") as { version: number; hypotheses: (HypDef & { def: string })[]; holdout_do_not_research: string[] };
const HYPS: HypDef[] = codebook.hypotheses.map(({ id, cluster, ko }) => ({ id, cluster, ko }));
const IDS = new Set(HYPS.map((h) => h.id));
const withHoldout = process.argv.includes("--holdout");

// ── 1. 읽기·검사 ──
const problems: string[] = [];
function load(dir: string): CaseRecord[] {
  const d = new URL(dir, ROOT);
  if (!existsSync(d)) return [];
  const out: CaseRecord[] = [];
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json") && !x.startsWith("_")).sort()) {
    const c = JSON.parse(readFileSync(new URL(f, d), "utf8")) as CaseRecord;
    const tag = `${dir}${f}`;
    if (!c.id || !Array.isArray(c.signals)) { problems.push(`${tag}: id·signals 없음`); continue; }
    if (!["war", "attack", "no_war", "unverified"].includes(c.outcome)) problems.push(`${tag}: outcome ${c.outcome}`);
    if ((c.outcome === "war" || c.outcome === "attack") && !/^\d{4}-\d{2}-\d{2}$/.test(c.onset ?? "")) problems.push(`${tag}: 개시일 없음`);
    const seen = new Set<string>();
    c.signals = c.signals.filter((s) => {
      if (!IDS.has(s.h)) { problems.push(`${tag}: 모르는 가설 ${s.h}`); return false; }
      if (seen.has(s.h)) { problems.push(`${tag}: 가설 중복 ${s.h}`); return false; }
      seen.add(s.h);
      if (!["yes", "no", "unknown"].includes(s.status)) { problems.push(`${tag}: ${s.h} status ${s.status}`); s.status = "unknown"; }
      // 출처 없는 yes/no 는 근거로 쓰지 않는다
      if (s.status !== "unknown" && !/^https?:\/\//.test(s.source ?? "")) { problems.push(`${tag}: ${s.h} ${s.status} 인데 출처 없음 → unknown 으로`); s.status = "unknown"; }
      if (s.status === "yes" && c.onset && s.first && /^\d{4}-\d{2}-\d{2}$/.test(s.first)) {
        const lead = Math.round((Date.parse(c.onset) - Date.parse(s.first)) / 86400_000);
        if (lead <= 0) { problems.push(`${tag}: ${s.h} 첫 날짜가 개시일 이후(${s.first}) → no 로`); s.status = "no"; }
        else if (typeof s.lead !== "number" || Math.abs(s.lead - lead) > 1) s.lead = lead; // 날짜에서 다시 계산한 값을 쓴다
      }
      return true;
    });
    for (const h of HYPS) if (!seen.has(h.id)) { problems.push(`${tag}: ${h.id} 빠짐 → unknown`); c.signals.push({ h: h.id, status: "unknown" }); }
    out.push(c);
  }
  return out;
}
const all = load("data/precursors/raw/");
const sealed = new Set(codebook.holdout_do_not_research);
const leaked = all.filter((c) => sealed.has(c.id));
if (leaked.length) throw new Error(`봉인 사례가 개발용에 들어 있다: ${leaked.map((c) => c.id).join(", ")}`);
// 조사가 덜 된 사례(근거 있는 예·아니오가 6개 미만)는 계산에 넣지 않는다 — 빈 사례가 '전조 없음'으로 세어지지 않게
const known = (c: CaseRecord) => c.signals.filter((s) => s.status !== "unknown").length;
const thin = all.filter((c) => classOf(c) !== "X" && known(c) < 6);
const cases = all.filter((c) => classOf(c) !== "X" && known(c) >= 6);
const excluded = all.filter((c) => classOf(c) === "X");
const holdout = withHoldout ? load("data/precursors/holdout/") : [];
const today = new Date().toISOString().slice(0, 10);

// ── 2. 표 ──
const table = buildTable(cases, HYPS, today);
const W = cases.filter((c) => classOf(c) === "W"), K = cases.filter((c) => classOf(c) === "K"), N = cases.filter((c) => classOf(c) === "N");

// ── 3. 하나씩 빼고 채점 ──
interface Scored { c: CaseRecord; cls: string; score: number; byDay: Record<number, number>; on: number; known: number }
const DAYS = [30, 14, 7, 3, 1];
function scoreWith(tb: PrecursorTable, c: CaseRecord): Scored {
  const ev = caseEvidence(c, 1);
  const byDay: Record<number, number> = {};
  if (c.onset) for (const d of DAYS) byDay[d] = +warLikeness(tb, caseEvidence(c, d)).toFixed(2);
  const vals = Object.values(ev);
  return { c, cls: classOf(c), score: +warLikeness(tb, ev).toFixed(2), byDay, on: vals.filter((v) => v === "on").length, known: vals.filter((v) => v !== "unk").length };
}
const loo = cases.map((c) => scoreWith(buildTable(cases.filter((x) => x.id !== c.id), HYPS, today), c));
const held = holdout.map((c) => scoreWith(table, c));
const auc = (pos: number[], neg: number[]) => {
  if (!pos.length || !neg.length) return NaN;
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
};
const posScores = loo.filter((x) => x.cls === "W").map((x) => x.score), negScores = loo.filter((x) => x.cls === "N").map((x) => x.score);
const AUC = auc(posScores, negScores);
const caught = loo.filter((x) => x.cls === "W" && x.score > 0), falseAlarm = loo.filter((x) => x.cls === "N" && x.score > 0);
const telegraphed = loo.filter((x) => x.cls === "W" && !x.c.surprise);

// ── 한반도 눈금: 기준점 ──
const logOdds = cases.map((c) => ({ c, lo: caseLogOdds(table, c, 1) }));
const anchor = Math.max(...logOdds.filter((x) => classOf(x.c) === "W").map((x) => x.lo));
const quietLo = caseLogOdds(table, { id: "quiet", name: "", outcome: "no_war", onset: null, signals: HYPS.map((h) => ({ h: h.id, status: "no", source: "x" })) }, 1);
const idx = (lo: number) => Math.round(Math.min(100, Math.max(0, ((lo - quietLo) / (anchor - quietLo)) * 100)));
const anchors = logOdds.map((x) => ({ id: x.c.id, name: x.c.name, cls: classOf(x.c), when: x.c.onset ?? x.c.window?.[1] ?? "", index: idx(x.lo), surprise: !!x.c.surprise })).sort((a, b) => b.index - a.index);

// ── 쓰기 ──
writeFileSync(new URL("data/precursors/cases.json", ROOT), JSON.stringify({ codebook: codebook.version, built: today, cases: all }, null, 1) + "\n");
const data = { table, anchorLogOdds: +anchor.toFixed(3), anchors: anchors.map(({ id, name, cls, when, index, surprise }) => ({ id, name, cls, when, index, surprise })),
  score: { auc: +AUC.toFixed(3), caught: caught.length, wars: posScores.length, falseAlarms: falseAlarm.length, crises: negScores.length, surprise: loo.filter((x) => x.cls === "W" && x.c.surprise).length } };
writeFileSync(new URL("src/core/precursor_data.ts", ROOT),
  `// 자동 생성: scripts/build-precursors.ts — 직접 고치지 말 것. 근거: data/precursors/cases.json, 성적표: docs/PRECURSORS.md\n` +
  `import type { PrecursorTable } from "./precursors.js";\n` +
  `export const PRECURSOR_DATA: { table: PrecursorTable; anchorLogOdds: number; anchors: { id: string; name: string; cls: string; when: string; index: number; surprise: boolean }[]; score: { auc: number; caught: number; wars: number; falseAlarms: number; crises: number; surprise: number } } = ${JSON.stringify(data)};\n`);

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const frac = ([y, n, u]: [number, number, number]) => `${y}/${y + n}${u ? ` (모름 ${u})` : ""}`;
const md: string[] = [];
md.push(`# 전쟁 전조 사례집 — 가중치와 성적표 (규칙 3.0)`, ``,
  `> 자동 생성: \`npx tsx scripts/build-precursors.ts\`. 손으로 고치지 않는다. 만든 날 ${today}.`,
  `> 자료: \`data/precursors/raw/<사례>.json\` (가설 33개 × 사례, 출처 포함) · 정의: \`data/precursors/codebook.json\` · 계산: \`src/core/precursors.ts\``, ``,
  `## 한눈에`, ``,
  `- 사례 ${cases.length}건: 전쟁·대규모 공격 ${W.length}건(그중 공개 전조 없이 온 기습 ${table.cases.Wsurprise}건) · 한반도 국지 충돌 ${K.length}건(기습 ${table.cases.Ksurprise}건) · 전쟁 안 난 위기 ${N.length}건.${excluded.length ? ` 계산에서 뺀 것 ${excluded.length}건(${excluded.map((c) => `${c.name}: ${c.outcome === "unverified" ? "사실 확인 안 됨" : "내전"}`).join(", ")}).` : ""}`,
  `- **하나씩 빼고 채점**(그 사례를 뺀 나머지로 가중치를 만든 뒤 그 사례의 전날 신호를 채점): 전쟁 ${posScores.length}건 중 **${caught.length}건**을 '전쟁 쪽'으로, 전쟁 안 난 위기 ${negScores.length}건 중 **${falseAlarm.length}건**을 잘못 '전쟁 쪽'으로 판정. 구분 능력(AUC) **${f1(AUC)}** (0.5 = 동전 던지기, 1.0 = 완벽).`,
  `- 예고된 전쟁 ${telegraphed.length}건만 보면 ${telegraphed.filter((x) => x.score > 0).length}건을 잡았다. 기습 ${table.cases.Wsurprise}건은 정의상 공개 전조가 없어 이 방식으로 잡을 수 없다 — 그 몫은 확률의 바닥으로 남긴다.`,
  `- 비교: 규칙 1.0·2.0 은 외국 공격 10건 중 3건을 잡았다(\`docs/CASEBOOK.md\`). 단 그쪽은 하루 단위 시장·검색 자료를 재생한 것이고 이쪽은 사건 기록을 코딩한 것이라 **같은 시험이 아니다** — 아래 '말할 수 없는 것'.`, ``);

md.push(`## 가설별 가중치`, ``,
  `'전쟁'·'안 난 위기'·'한반도 충돌' 칸은 **보인 사례 수 / 근거가 확인된 사례 수**(기습 사례는 뺀다. '모름' = 찾지 못함은 절반짜리 '없음'으로 계산에 넣는다). '배수'는 전쟁 사례에서 보인 비율 ÷ 안 난 위기에서 보인 비율(둘 다 0.5건을 더해 0으로 나누지 않게) — 1보다 클수록 '전쟁 직전'을 가리키는 신호, 1 근처면 위기 때마다 켜지는 값싼 신호다.`, ``,
  `| 묶음 | 전조 | 전쟁 | 안 난 위기 | 한반도 충돌 | 배수 | 보통 며칠 전 |`, `|---|---|---|---|---|---|---|`);
for (const h of [...table.hyps].sort((a, b) => discrimination(b) - discrimination(a)))
  md.push(`| ${CLUSTER_LABEL[h.cluster]} | ${h.ko} | ${frac(h.w)} | ${frac(h.n)} | ${frac(h.k)} | ×${discrimination(h)} | ${h.lead ?? "—"} |`);

md.push(``, `## 사례별 채점 (하나씩 빼고)`, ``,
  `'점수'는 전날 신호가 '전쟁 직전'과 '전쟁 안 나는 위기' 중 어느 쪽에 가까운지의 로그 배수 — 0보다 크면 전쟁 쪽. '켜진 전조'는 켜진 수 / 확인된 수. 뒤 칸은 개시 30·14·7·3·1일 전 시점까지 공개된 신호만으로 매긴 점수(언제부터 잡혔나).`, ``,
  `| 사례 | 분류 | 결과 | 켜진 전조 | 점수 | 30일 전 | 14일 전 | 7일 전 | 3일 전 | 전날 | 한반도 눈금 |`, `|---|---|---|---|---|---|---|---|---|---|---|`);
const row = (x: Scored, heldOut = false) => {
  const a = anchors.find((y) => y.id === x.c.id);
  const kind = x.cls === "N" ? "전쟁 안 남" : x.cls === "K" ? "한반도 충돌" : x.c.outcome === "war" ? "전쟁" : "공격";
  const verdict = x.cls === "N" ? (x.score > 0 ? "✗ 헛경보" : "✓ 조용") : x.c.surprise ? (x.score > 0 ? "✓ 잡음(기습)" : "— 기습(못 잡음)") : x.score > 0 ? "✓ 잡음" : "✗ 놓침";
  return `| ${x.c.name}${heldOut ? " **(봉인)**" : ""} | ${kind} | ${verdict} | ${x.on}/${x.known} | ${x.score} | ${DAYS.map((d) => (x.c.onset ? x.byDay[d] : "—")).join(" | ")} | ${heldOut ? "—" : a?.index ?? "—"} |`;
};
for (const x of [...loo].sort((a, b) => (a.cls === b.cls ? b.score - a.score : a.cls.localeCompare(b.cls) * -1))) md.push(row(x));
if (held.length) {
  md.push(``, `### 봉인 사례 (규칙을 고정한 뒤 한 번만 연 시험)`, ``, `| 사례 | 분류 | 결과 | 켜진 전조 | 점수 | 30일 전 | 14일 전 | 7일 전 | 3일 전 | 전날 | 한반도 눈금 |`, `|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const x of held) md.push(row(x, true));
}

md.push(``, `## 언제부터 잡혔나`, ``, `예고된 전쟁·공격 ${telegraphed.length}건 가운데, 그 시점까지 공개된 신호만으로 점수가 0보다 컸던 사례 수:`, ``,
  `| 시점 | 잡은 수 |`, `|---|---|`, ...DAYS.map((d) => `| ${d}일 전 | ${telegraphed.filter((x) => (x.byDay[d] ?? -1) > 0).length}/${telegraphed.length} |`));

md.push(``, `## 한반도 눈금의 기준점 (전쟁 근접도 0~100)`, ``,
  `0 = 지켜보는 전조가 모두 꺼진 조용한 날, 100 = 사례집에서 전날 신호가 가장 뚜렷했던 전쟁(${anchors[0]?.name ?? ""}). 각 사례의 전날(전쟁 안 난 위기는 창 전체) 신호를 지금 한반도 계산에 그대로 넣은 값이다.`, ``,
  `| 사례 | 분류 | 근접도 |`, `|---|---|---|`, ...anchors.map((a) => `| ${a.name}${a.surprise ? " (기습)" : ""} | ${a.cls === "N" ? "전쟁 안 남" : a.cls === "K" ? "한반도 충돌" : "전쟁·공격"} | ${a.index} |`));

md.push(``, `## 고정값 (사례를 보기 전에 정한 것)`, ``,
  `- 한 신호의 최대 배수 ${MODEL.CAP} · 같은 묶음 안 두 번째 신호부터 ${MODEL.DAMP}배씩 깎음 · 3단계 이상은 두 묶음 이상, 4단계는 정부·군사 묶음의 확인된 신호가 있어야 함`,
  `- 기저율: 30일 국지 충돌 ${MODEL.P_CLASH * 100}% · 전면전 ${MODEL.P_WAR * 100}% · 한반도가 '전쟁 안 나는 위기'인 날 ${MODEL.P_CRISIS * 100}%`,
  `- 단계 문턱(30일 국지 충돌 %): 2단계 ${MODEL.PHASE[2]} · 3단계 ${MODEL.PHASE[3]} · 4단계 ${MODEL.PHASE[4]}`,
  `- 평소 빈도 사전값은 \`src/core/precursors.ts\` 의 \`BASE_HINT\` — 판단값이고, 매일 쌓이는 한반도 기록이 덮어 쓴다(사전값 무게 = ${MODEL.BASE_PRIOR_DAYS}일 치).`, ``,
  `## 말할 수 없는 것`, ``,
  `- **뒤돌아보고 코딩한 자료다.** 결과를 아는 채로 조사하면 전쟁이 난 사례에서 전조를 더 열심히 찾게 된다. 그래서 '개시 전에 공개됐던 것'만 세고, 출처 없는 예·아니오는 '모름'으로 돌렸다. 그래도 치우침이 남는다 — 점수는 실제보다 좋게 나왔을 수 있다.`,
  `- **사례가 적다.** 가설 하나에 확인된 사례가 10건 안팎이라 배수의 오차가 크다. 순서(어느 신호가 더 무거운가)는 볼 만하지만 숫자를 소수점까지 믿을 것은 아니다.`,
  `- **사례를 골랐다.** 전쟁이 난 사례가 실제 비율보다 많이 들어 있다. 배수(조건부 비율의 비)는 이 영향을 덜 받지만, 30일 확률의 절대값은 한반도 기저율(판단값)에 달려 있다.`,
  `- **전날 신호로 채점했다.** 실제 운영은 매일 그날까지의 신호로 판단한다 — '언제부터 잡혔나' 표가 그 차이를 보여 준다.`,
  `- **한반도에서 못 재는 신호가 있다.** 북한 안의 병참·동원은 공개 자료로 직접 볼 수 없어 보도와 분석관 확인에 기댄다. 사례에서 강했던 신호가 한반도에서는 늦게 잡힐 수 있다.`,
  `- **한반도 국지 충돌은 따로다.** 과거 충돌 ${K.length}건은 외국 전쟁 같은 전조(대사관 철수·동원) 없이 왔다. 그래서 '국지 충돌 %'는 대부분 기저율이고, 전조 모형이 주로 움직이는 것은 '전쟁·대규모 공격' 쪽이다.`,
  ...(held.length ? [] : [`- **봉인 사례 3건(${codebook.holdout_do_not_research.join(", ")})은 아직 열지 않았다.**`]), ``);

if (thin.length) md.push(`## 조사가 덜 돼 계산에서 뺀 사례 (${thin.length}건)`, ``, thin.map((c) => c.name).join(" · "), ``);
if (problems.length) md.push(`## 자료 검사에서 고친 것 (${problems.length}건)`, ``, ...problems.map((p) => `- ${p}`), ``);
writeFileSync(new URL("docs/PRECURSORS.md", ROOT), md.join("\n"));
console.log(`사례 ${cases.length} (W ${W.length} · K ${K.length} · N ${N.length}), 제외 ${excluded.length}, 문제 ${problems.length}`);
console.log(`LOO: 전쟁 ${caught.length}/${posScores.length} 잡음, 헛경보 ${falseAlarm.length}/${negScores.length}, AUC ${f1(AUC)}`);
if (held.length) console.log(`봉인: ${held.map((x) => `${x.c.id} ${x.score}`).join(" · ")}`);
