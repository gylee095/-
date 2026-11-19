// 2026-11-18 사용자: "앱에 '북한, 미사일(종류 미상) 발사'가 떴는데 인터넷에는 그런 소식이 없다 — 무슨 근거냐"
// 실제 원인: 북한 인터넷 장애 경보(IODA, 센서)와 '미사일'이 들어간 분석 기사 한 건이 3시간 안에 있어 한 사건으로 묶였고,
// '1차 원천 + 언론 = 교차확인된 발사'로 읽혔다. 발사는 없었다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { briefEvent } from "../src/core/brief.js";
import { correlate } from "../src/core/correlate.js";
import type { CrisisEvent, Signal } from "../src/core/types.js";

const saved = JSON.parse(readFileSync(new URL("./fixtures/false_launch_20261118.json", import.meta.url), "utf8")) as CrisisEvent & { signals: Signal[] };

describe("배경 관측이 미사일 기사와 묶여도 발사가 되지 않는다 (11/18)", () => {
  it("그날 저장된 사건 그대로: 발사로 적지 않고, 도발로 세지 않는다", () => {
    const b = briefEvent(saved, saved.signals);
    expect(b.isProvocation).toBe(false);
    expect(b.headline).not.toMatch(/발사$/);
    expect(b.danger.level).toBe(1);
  });
  it("같은 신호를 다시 묶으면 인터넷 장애 경보와 미사일 기사는 서로 다른 사건이 된다", () => {
    const evs = correlate(saved.signals);
    const withIoda = evs.filter((e) => e.sources.includes("ioda"));
    expect(withIoda).toHaveLength(1);
    expect(withIoda[0].categories).toEqual(["civil_alert_other"]);
    expect(evs.find((e) => e.categories.includes("missile"))!.basis).toBe("media");
  });
  it("진짜 1차 원천(정부 재난문자)이 있는 발사는 그대로 발사다", () => {
    const now = Date.UTC(2026, 10, 18, 4);
    const alert: Signal = { id: "sd:1", source: "safetydata", sourceKind: "official", category: "missile", title: "[합참] 북한이 동해상으로 탄도미사일을 발사했습니다", summary: "", detectedTime: now, publishedTime: now, severity: 60 };
    const ioda: Signal = { ...saved.signals.find((s) => s.source === "ioda")!, detectedTime: now, publishedTime: now, eventTime: now };
    const evs = correlate([alert, ioda]);
    expect(evs).toHaveLength(2);
    const strike = evs.find((e) => e.categories.includes("missile"))!;
    expect(strike.sources).not.toContain("ioda");
    expect(briefEvent(strike, [alert]).isProvocation).toBe(true);
  });
});
