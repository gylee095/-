// 사례 자료 받기의 순수 계산 (11/6 self-verify): 날짜·평균·이어 쓰기가 미래 정보·가짜 값을 만들지 않는가
import { describe, expect, it } from "vitest";
import { avgOn, carryForward, localDate, pct, CARRY_DAYS } from "../scripts/fetch-cases.js";

describe("사례 자료 받기", () => {
  it("일봉 날짜는 거래소 현지 날짜 — 런던 여름 23:00 UTC 는 다음 날", () => {
    expect(localDate(Date.parse("2021-07-01T23:00:00Z"), "Europe/London")).toBe("2021-07-02");
    expect(localDate(Date.parse("2021-07-01T23:00:00Z"), "UTC")).toBe("2021-07-01");
    expect(localDate(Date.parse("2022-01-10T00:00:00Z"), "Europe/London")).toBe("2022-01-10");
  });
  it("구성 종목이 하나라도 빠진 날은 평균하지 않는다", () => {
    const a = new Map([["2022-01-03", 1], ["2022-01-04", 2]]), b = new Map([["2022-01-03", 3]]);
    expect(avgOn("2022-01-03", [a, b])).toBe(2);
    expect(avgOn("2022-01-04", [a, b])).toBeUndefined();
  });
  it("휴장 이어 쓰기는 4일까지, 5일째는 측정 불가", () => {
    let s = carryForward({ age: 0 }, 1.5);
    for (let i = 1; i <= CARRY_DAYS; i++) { s = carryForward(s, undefined); expect(s.v).toBe(1.5); }
    s = carryForward(s, undefined);
    expect(s.v).toBeUndefined();
  });
  it("자료가 5일 넘게 끊긴 뒤의 첫날은 하루 변화율로 치지 않는다", () => {
    const r = pct(new Map([["2022-01-03", 100], ["2022-01-04", 110], ["2022-01-12", 150]]));
    expect(r.get("2022-01-04")).toBeCloseTo(10);
    expect(r.has("2022-01-12")).toBe(false);
  });
});
