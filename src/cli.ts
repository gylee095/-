// 로컬/서버 실행용 CLI
//   tsx src/cli.ts scan [--dry-run] [--only usgs,emsc]   감시 사이클 1회
//   tsx src/cli.ts state [--hours 24]                    저장된 상태 출력
//   tsx src/cli.ts preview [--hours 72]                  대시보드 정적 미리보기 HTML 생성
//   tsx src/cli.ts test-push                             아이폰 푸시 연결 테스트
import { writeFile, mkdir } from "node:fs/promises";
import { runCycle } from "./core/pipeline.js";
import { buildState } from "./core/state.js";
import { openFileStore } from "./core/store.js";
import { sendPush } from "./core/notify.js";
import { envFromProcess } from "./core/nodeenv.js";
import { fmtKst } from "./core/util.js";
import { DASHBOARD_HTML } from "./worker/dashboard.js";

const args = process.argv.slice(2);
const cmd = args[0] ?? "scan";
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const env = envFromProcess();
const dataPath = process.env.KEW_DATA ?? "data/state.json";
const store = await openFileStore(dataPath);

if (cmd === "scan") {
  const r = await runCycle(env, store, { dryRun: flag("dry-run"), only: opt("only")?.split(",") });
  console.log(`# 감시 사이클 ${fmtKst(r.at)}  (신규 신호 ${r.newSignals})`);
  for (const s of r.sources) console.log(`  ${s.ok ? "✓" : "✗"} ${s.source.padEnd(11)} raw=${s.raw} signals=${s.signals} ${s.skipped ?? s.error ?? ""}`);
  console.log(`# 관측 수준 ${r.posture.level} ${r.posture.label}`);
  for (const a of r.alerts) console.log(`  🔔 ${a.sent ? "발송" : "미발송"} ${a.kind} ${a.title} (${a.reason})`);
  for (const s of r.suppressed.slice(0, 10)) console.log(`  · 억제: ${s.title} — ${s.reason}`);
  console.log(`# 징후판 (${r.readings.length}개 관측)`);
  for (const x of r.readings) console.log(`  ${x.state === "anomalous" ? "‼" : x.state === "elevated" ? "↑" : x.state === "learning" ? "…" : "·"} ${x.indicator.padEnd(34)} ${String(x.value).padStart(8)}  ${x.baseline !== undefined ? `평소 ${x.baseline.toFixed(1)} z=${x.z?.toFixed(1)}` : ""}`);
  for (const p of r.patterns) console.log(`  ◆ 패턴 ${p.name} (${p.confidence}, ${p.score}점): ${p.summary}`);
} else if (cmd === "state") {
  console.log(JSON.stringify(await buildState(store, Date.now() - Number(opt("hours") ?? 24) * 3600_000), null, 2));
} else if (cmd === "preview") {
  const st = await buildState(store, Date.now() - Number(opt("hours") ?? 72) * 3600_000);
  const html = DASHBOARD_HTML.replace("<script>", `<script>window.__KEW_STATE__=${JSON.stringify(st).replace(/</g, "\\u003c")};</script><script>`);
  await mkdir("data", { recursive: true });
  await writeFile("data/preview.html", html);
  console.log("data/preview.html 생성");
} else if (cmd === "test-push") {
  console.log(await sendPush(env, { title: "[테스트] Korea Early Warning", body: "푸시 연결 테스트입니다.", priority: 3, url: env.DASHBOARD_URL }));
} else {
  console.error(`알 수 없는 명령: ${cmd}`);
  process.exit(1);
}
