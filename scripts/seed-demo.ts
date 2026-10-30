// 테스트 픽스처로 데모 상태(data/demo.json)를 만든다. 대시보드 미리보기·리허설용.
//   KEW_DATA=data/demo.json tsx scripts/seed-demo.ts && KEW_DATA=data/demo.json tsx src/cli.ts preview
import { readFileSync } from "node:fs";
import { openFileStore } from "../src/core/store.js";
import { runCycle } from "../src/core/pipeline.js";
import { parseUsgs, parseEmsc } from "../src/core/collectors/seismic.js";
import { parseSafetyData } from "../src/core/collectors/safetydata.js";
import { parseNga } from "../src/core/collectors/nga.js";
import type { CollectResult, Signal } from "../src/core/types.js";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), "utf8"));
const store = await openFileStore(process.env.KEW_DATA ?? "data/demo.json");
// 픽스처 시각을 '지금' 기준으로 옮긴다
const now = Date.now();
const shift = (sigs: Signal[], anchor: number, offset: number) =>
  sigs.map((s) => ({ ...s, eventTime: s.eventTime && s.eventTime - anchor + now - offset, publishedTime: s.publishedTime && s.publishedTime - anchor + now - offset, detectedTime: now - offset + 60_000 }));
const r = (source: string, signals: Signal[]): CollectResult => ({ source, ok: true, signals, fetchedAt: now, rawCount: signals.length });
const tA = Date.UTC(2026, 10, 2, 10, 41, 10);
const tQ = Date.UTC(2026, 10, 3, 10, 0, 0);
const media: Signal = { id: "rss_news:demo1", source: "rss_news", sourceKind: "media", category: "missile", title: '[속보] 합참 "북한, 동해상으로 탄도미사일 발사"', summary: "언론 보도", url: "https://news.example.kr/a1", publishedTime: now - 3 * 3600_000 + 7 * 60_000, detectedTime: now - 3 * 3600_000 + 8 * 60_000, severity: 20 };
const steps: [number, CollectResult[]][] = [
  [now - 3 * 3600_000 + 60_000, [r("safetydata", shift(parseSafetyData(fx("safetydata.json"), 0), tA, 3 * 3600_000)), r("nga_msi", shift(parseNga(fx("nga.json")["broadcast-warn"], 0), Date.UTC(2026, 10, 2, 10, 3), 20 * 3600_000))]],
  [now - 3 * 3600_000 + 8 * 60_000, [r("rss_news", [media])]],
  [now - 40 * 60_000, [r("usgs", shift(parseUsgs(fx("usgs.json"), 0), tQ, 60 * 60_000)), r("emsc", shift(parseEmsc(fx("emsc.json"), 0), tQ, 60 * 60_000))]],
];
for (const [t, res] of steps) {
  const rep = await runCycle({ NTFY_TOPIC: "demo", DASHBOARD_URL: "https://kew.example.workers.dev" }, store, { now: t, dryRun: false, collect: async () => res, fetchImpl: (async () => new Response("ok")) as any });
  console.log(new Date(t).toISOString(), "alerts:", rep.alerts.map((a) => a.title));
}
await store.addNote({ at: now, author: "claude-agent", text: "[사실] 행안부 경계경보(공식) 1건, USGS·EMSC 동시 탐지 풍계리 M5.0~5.1 얕은 지진(교차확인).\n[해석] 두 영역이 동시 이상이나 이는 관측 요약이며 전쟁 임박 판단 근거가 아님. 정부 공식 발표 확인 필요." });
