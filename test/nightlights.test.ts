// 평양 밤 불빛 (NASA VIIRS 야간 밴드 일일 영상) — PNG 해독, 밝기 환산, '최근 5일 밝은 밤' 판정, 실제 전쟁·위기 사례 검증
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "../src/core/png.js";
import { collectNightLights, lightsChange, nightMetric, nightUrl, readNightPng, seedHistory, type NightHistory } from "../src/core/collectors/nightlights.js";
import { MemoryStore } from "../src/core/store.js";
import { assessWarRisk } from "../src/core/warrisk.js";
import { GROUP_LABEL, INDICATORS, INDICATOR_BY_ID, STATE_LABEL, evaluate } from "../src/core/indicators.js";
import type { BoardRow } from "../src/core/state.js";

const fx = (n: string) => new URL(`./fixtures/${n}`, import.meta.url);
const png = (n: string) => new Uint8Array(readFileSync(fx(n)));
const PY = png("gibs_wms_n20_20261030_pyongyang.png");
const DD = png("gibs_wms_n20_20261030_dandong.png");
const UNPUBLISHED = png("gibs_wms_n20_20261031_unpublished.png");
/** 가짜 NASA: 평양·단둥 창에 맞는 영상을 돌려준다 */
const nasa = (calls: string[] = []) => async (u: string) => (calls.push(u), u.includes("BBOX=38.96") ? PY : DD);
const CASES = JSON.parse(readFileSync(fx("nightlights_cases.json"), "utf8")).cases as Record<string, { event: [string, string]; days: [string, number | null][] }>;
const DEF = INDICATOR_BY_ID["nk.pyongyang_lights_pct"];

/** 테스트용 PNG 만들기: 8비트, 색 형식(3 색상표 · 6 RGBA), 줄마다 지정한 필터로 부호화. rows 는 줄마다 바이트 배열 */
function makePng(rows: number[][], filters: number[], colorType = 3): Uint8Array {
  const ch = colorType === 6 ? 4 : 1;
  const w = rows[0].length / ch;
  const paeth = (a: number, b: number, c: number) => {
    const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw: number[] = [];
  rows.forEach((r, y) => {
    const f = filters[y];
    raw.push(f);
    r.forEach((p, x) => {
      const a = x >= ch ? r[x - ch] : 0, b = y ? rows[y - 1][x] : 0, c = x >= ch && y ? rows[y - 1][x - ch] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      raw.push((p - pred) & 255);
    });
  });
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out; // CRC 는 해독기가 보지 않는다
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, rows.length);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...(colorType === 3 ? [chunk("PLTE", new Uint8Array(768))] : []), chunk("IDAT", new Uint8Array(deflateSync(Buffer.from(raw)))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
/** RGBA 회색 칸들 (g 가 null 이면 투명) */
const grayRow = (gs: (number | null)[]) => gs.flatMap((g) => (g === null ? [0, 0, 0, 0] : [g, g, g, 255]));

describe("PNG 해독", () => {
  it("다섯 가지 줄 필터(없음·왼쪽·위·평균·Paeth)를 모두 되돌린다 — 색상표·RGBA", async () => {
    const rows = [
      [1, 2, 3, 250, 7],
      [5, 6, 200, 8, 9],
      [9, 10, 11, 255, 0],
      [3, 180, 2, 1, 4],
      [77, 78, 79, 80, 81],
    ];
    expect([...(await decodePng(makePng(rows, [0, 1, 2, 3, 4]))).data]).toEqual(rows.flat());
    const rgba = rows.map((r) => grayRow(r));
    rgba[2][7] = 0; // 투명 칸 하나
    const img = await decodePng(makePng(rgba, [4, 3, 2, 1, 0], 6));
    expect(img).toMatchObject({ width: 5, height: 5, channels: 4, colorType: 6 });
    expect([...img.data]).toEqual(rgba.flat());
  });
  it("PNG 아닌 파일·16비트 PNG 는 거절", async () => {
    await expect(decodePng(new Uint8Array(100))).rejects.toThrow(/PNG 파일이 아님/);
    const p = makePng([[1, 2]], [0]);
    p[8 + 8 + 8] = 16; // IHDR 비트 깊이 8 → 16
    await expect(decodePng(p)).rejects.toThrow(/지원하지 않는 PNG/);
  });
});

describe("NASA 영상 → 평양·단둥 밝기", () => {
  it("2026-10-30 NOAA-20 실제 영상: 평양 약 6.91, 단둥 약 6.96 nW/cm²·sr (512×512 타일로 잰 값과 같다)", async () => {
    expect(await readNightPng(PY)).toBeCloseTo(6.91, 2);
    expect(await readNightPng(DD)).toBeCloseTo(6.963, 2);
  });
  it("창 좌표는 GIBS 500m 격자에 맞춘다 (평양 32×32, 단둥 35×17)", () => {
    expect(nightUrl("n20", "2026-10-30", "pyongyang")).toContain("BBOX=38.961914,125.679199,39.102539,125.819824&WIDTH=32&HEIGHT=32");
    expect(nightUrl("snpp", "2026-10-30", "dandong")).toMatch(/LAYERS=VIIRS_SNPP_GapFilled.*BBOX=40\.126465,124\.299316,40\.201172,124\.453125&WIDTH=35&HEIGHT=17.*TIME=2026-10-30$/);
  });
  it("아직 공개 전인 날은 투명 영상 → 값 없음", async () => {
    expect(await readNightPng(UNPUBLISHED)).toBeUndefined();
  });
  it("색상표에 없는 색이 섞이면(NASA 가 색을 바꿈) 조용히 틀리지 않고 오류", async () => {
    const colored = Array.from({ length: 4 }, () => [200, 7, 7, 255, 13, 13, 13, 255, 99, 0, 0, 255, 19, 19, 19, 255]);
    await expect(readNightPng(makePng(colored, [0, 0, 0, 0], 6))).rejects.toThrow(/색상표/);
    const gray = Array.from({ length: 4 }, () => grayRow([7, 13, 19, null]));
    expect(await readNightPng(makePng(gray, [0, 0, 0, 0], 6))).toBeCloseTo((0.05 + 0.15 + 0.25) / 3, 3);
  });
});

/** 날짜 → 값 맵 */
const series = (days: [string, number | null][]) => new Map(days.filter((d): d is [string, number] => d[1] !== null));
const flat = (n: number, v: number, start = "2026-01-01") =>
  Array.from({ length: n }, (_, i) => [new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400_000).toISOString().slice(0, 10), v] as [string, number]);

describe("판정: 최근 5일 중 두 번째로 밝은 밤 ÷ 직전 28일 평소", () => {
  it("평소 그대로면 0%, 마지막 5일이 절반으로 줄면 −50% → '이상'", () => {
    const days = flat(40, 8);
    expect(lightsChange(series(days), days[39][0])!.pct).toBe(0);
    const dark = days.map(([d, v], i) => [d, i >= 35 ? 4 : v] as [string, number]);
    const c = lightsChange(series(dark), dark[39][0])!;
    expect(c.pct).toBe(-50);
    expect(evaluate(DEF, c.pct, 0, undefined).state).toBe("anomalous");
  });
  it("구름 낀(어두운) 밤 하루·이틀은 흔들지 않는다", () => {
    const days = flat(40, 8).map(([d, v], i) => [d, i === 39 || i === 37 ? 3 : v] as [string, number]);
    expect(lightsChange(series(days), days[39][0])!.pct).toBe(0);
  });
  it("자료가 모자라면 판정하지 않는다 (5일 중 3일 미만, 기준선 14일 미만)", () => {
    const days = flat(40, 8);
    expect(lightsChange(series(days.slice(0, 12)), days[11][0])).toBeUndefined();
    const gappy = days.filter((_, i) => i < 36 || i === 39);
    expect(lightsChange(series(gappy), days[39][0])).toBeUndefined();
  });
});

describe("실제 사례 (같은 방식으로 재 본 과거)", () => {
  const changes = (k: string) => {
    const s = series(CASES[k].days);
    return CASES[k].days.map(([d]) => ({ d, c: lightsChange(s, d)?.pct }));
  };
  it("키이우 2022: 침공 전엔 평소 범위, 침공(2/24) 사흘 뒤 −25% 넘게 어두워짐 → '상승'", () => {
    const ch = changes("kyiv_2022");
    for (const x of ch.filter((x) => x.d >= "2022-02-05" && x.d <= "2022-02-23")) expect(x.c!).toBeGreaterThan(-25);
    const first = ch.find((x) => x.d >= "2022-02-24" && (x.c ?? 0) <= -25)!;
    expect(first.d <= "2022-02-28").toBe(true);
    expect(evaluate(DEF, first.c!, 0, undefined).state).toBe("elevated");
  });
  it("가자 2023: 발전소 중단(10/11) 뒤 닷새 안에 −40% 넘게 → '이상'", () => {
    const ch = changes("gaza_2023");
    for (const x of ch.filter((x) => x.d >= "2023-10-01" && x.d <= "2023-10-10")) expect(x.c!).toBeGreaterThan(-25);
    const first = ch.find((x) => x.d >= "2023-10-11" && (x.c ?? 0) <= -40)!;
    expect(first.d <= "2023-10-16").toBe(true);
  });
  it.each([
    ["pyongyang_2013", "2013-03-20", "2013-04-10"],
    ["pyongyang_2015", "2015-08-15", "2015-08-29"],
  ])("%s: 북한이 '전시상태'·'준전시상태'를 선포한 위기 때도 평양 불빛은 평소 범위", (k, from, to) => {
    const ch = changes(k).filter((x) => x.d >= from && x.d <= to);
    expect(ch.length).toBeGreaterThan(10);
    for (const x of ch) expect(x.c!).toBeGreaterThan(-25);
  });
});

describe("수집기: 매시간 빈 날짜 채우기", () => {
  const NOW = Date.UTC(2026, 10, 1, 3, 11);
  it("첫 배포 직후: 넣어 둔 최근 기록으로 바로 판정하고, 아직 공개 전인 어제 밤(404)은 3시간 뒤 다시", async () => {
    const kv = new MemoryStore();
    const urls: string[] = [];
    const r = await collectNightLights(NOW, kv, async (u) => (urls.push(u), UNPUBLISHED));
    expect(r.ok).toBe(true);
    // 위성 두 대의 어제 밤 평양 영상만 (투명이라 단둥은 받지 않음)
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/NOAA20.*BBOX=38\.96.*TIME=2026-10-31$/);
    expect(urls[1]).toMatch(/SNPP.*BBOX=38\.96.*TIME=2026-10-31$/);
    const m = r.metrics![0];
    expect(m.indicator).toBe("nk.pyongyang_lights_pct");
    expect(m.meta).toMatchObject({ dataDate: "2026-10-30" });
    expect(Math.abs(m.value)).toBeLessThan(25);
    // 한 시간 뒤: 어제 밤은 건너뛰고(3시간 대기) 더 받을 것이 없다
    const urls2: string[] = [];
    await collectNightLights(NOW + 3600_000, kv, async (u) => (urls2.push(u), null));
    expect(urls2).toHaveLength(0);
    // 3시간 뒤: 다시 시도 (404 여도 오류로 치지 않는다)
    const r3 = await collectNightLights(NOW + 3 * 3600_000 + 60_000, kv, async () => null);
    expect(r3).toMatchObject({ ok: true, error: undefined });
  });
  it("새 타일을 받으면 기록에 쌓고 한 번에 두 장까지만 받는다 (사이 날짜가 비면 그 전날로 판정)", async () => {
    const kv = new MemoryStore();
    const later = Date.UTC(2026, 10, 4, 3, 11);
    const calls: string[] = [];
    const r = await collectNightLights(later, kv, nasa(calls));
    expect(r.rawCount).toBe(2);
    expect(calls).toHaveLength(4); // (위성 2) × (평양·단둥)
    const h = JSON.parse((await kv.getKv("nightlights:v1"))!) as NightHistory;
    expect(h.days["2026-11-03"].n20![0]).toBeCloseTo(6.91, 2);
    expect(h.days["2026-11-03"].n20![1]).toBeCloseTo(6.963, 2);
    expect(h.days["2026-11-03"].snpp![0]).toBeCloseTo(6.91, 2);
    // 10/31~11/2 를 아직 못 받아 11/3 의 5일 창에 밤이 둘뿐 → 10/30 기준으로 판정
    expect(r.metrics![0].meta).toMatchObject({ dataDate: "2026-10-30" });
    await collectNightLights(later + 3600_000, kv, nasa());
    const r3 = await collectNightLights(later + 2 * 3600_000, kv, nasa());
    expect(r3.metrics![0].meta).toMatchObject({ dataDate: "2026-11-03" });
  });
  it("위성 자료가 6일 넘게 끊기면 판정을 내지 않고 오류로 알린다", async () => {
    const r = await collectNightLights(Date.UTC(2026, 10, 9, 3), new MemoryStore(), async () => null);
    expect(r.ok).toBe(false);
    expect(r.metrics).toHaveLength(0);
    expect(r.error).toMatch(/위성 자료 없음.*2026-10-30/);
  });
  it("오늘(2026-11-01) 넣어 둔 기록 기준 평양 불빛은 평소 범위", () => {
    const m = nightMetric(seedHistory(), NOW)!;
    expect(evaluate(DEF, m.value, NOW, undefined).state).toBe("normal");
  });
});

describe("전쟁 판정: 평양 불빛은 북한 쪽 영역에 최대 1점", () => {
  const NOW = Date.UTC(2026, 10, 1, 3);
  const board = (value: number): BoardRow[] =>
    INDICATORS.map((d) => {
      const reading = d.id === "nk.pyongyang_lights_pct" ? evaluate(d, value, NOW, undefined) : { indicator: d.id, at: NOW, n: 20, value: 0, state: "normal" as const };
      return { id: d.id, label: d.label, group: d.group, groupLabel: GROUP_LABEL[d.group], unit: d.unit, direction: d.direction, why: d.why, latency: d.latency, caveats: d.caveats, reading, stateLabel: STATE_LABEL[reading.state], history: [] };
    });
  it("−45%(이상)여도 '주의'까지, 말이 아니라 내부 사정이라고 설명", () => {
    const w = assessWarRisk({ now: NOW, board: board(-45), briefs: [], patterns: [] });
    const nk = w.domains.find((d) => d.id === "nkwords")!;
    expect(nk.level).toBe(1);
    expect(nk.drivers.join(" ")).toMatch(/평양 밤 불빛.*1점만/);
    expect(w.phase).toBeLessThanOrEqual(2);
    expect(w.firstMover?.text ?? "").toMatch(/북한 내부 사정이 평소와 다르다\(평양 밤 불빛 -45%\)/);
    expect(w.firstMover?.text ?? "").not.toMatch(/북한의 말이 거칠어졌다/);
  });
  it("평소 범위(−10%)면 0점", () => {
    const w = assessWarRisk({ now: NOW, board: board(-10), briefs: [], patterns: [] });
    expect(w.domains.find((d) => d.id === "nkwords")!.level).toBe(0);
  });
});
