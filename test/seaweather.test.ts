// 바다 날씨 사후 확인 — '중국 배가 준 날이 풍랑 때문이었나'를 날짜별 파고로 확인 (2026-11-01)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fetchSeaWeather, parseOpenMeteoDaily, verdictOf } from "../src/core/seaweather.js";

const marine = JSON.parse(readFileSync(new URL("./fixtures/openmeteo_marine_yellowsea_202610.json", import.meta.url), "utf8"));

describe("바다 날씨", () => {
  it("기상청 풍랑주의보 기준(파고 3m·풍속 14m/s)에 맞춘 판정", () => {
    expect(verdictOf(3.2)).toBe("풍랑주의보급");
    expect(verdictOf(1.5, 15)).toBe("풍랑주의보급");
    expect(verdictOf(2.4)).toBe("높은 편");
    expect(verdictOf(0.8, 6)).toBe("잔잔");
    expect(verdictOf()).toBe("자료 없음");
  });
  it("실제 자료(2026-10): 중국 배가 가장 크게 줄었던 10/18 서해 중부 파고 3.22m(풍랑주의보급), 10/26 1.88m", () => {
    const [central, nll] = parseOpenMeteoDaily(marine, "wave_height_max");
    expect(central["2026-10-18"]).toBeCloseTo(3.22, 2);
    expect(verdictOf(central["2026-10-18"])).toBe("풍랑주의보급");
    expect(verdictOf(central["2026-10-26"])).toBe("잔잔");
    expect(nll["2026-10-18"]).toBeCloseTo(3.2, 2);
  });
  it("풍속 자료가 막혀도(일일 한도) 파고만으로 답한다", async () => {
    const fake = (async (u: string) => (String(u).includes("marine-api") ? new Response(JSON.stringify(marine)) : new Response('{"error":true}', { status: 429 }))) as unknown as typeof fetch;
    const pts = await fetchSeaWeather("yellow_sea", "2026-10-10", "2026-10-31", fake);
    expect(pts[0].windNote).toMatch(/풍속 자료 실패/);
    expect(pts[0].days.find((d) => d.date === "2026-10-18")).toMatchObject({ waveMaxM: 3.22, verdict: "풍랑주의보급" });
  });
});
