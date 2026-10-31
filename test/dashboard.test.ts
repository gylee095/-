import { describe, expect, it } from "vitest";
import { DASHBOARD_HTML } from "../src/worker/dashboard.js";

const script = DASHBOARD_HTML.split("<script>")[1].split("</script>")[0];

describe("대시보드 클라이언트 코드", () => {
  it("문법 오류가 없다", () => {
    expect(() => new Function(script)).not.toThrow();
  });
  it("같은 이름의 함수가 두 번 정의되지 않는다 (2026-10-31: 새 tok() 가 로그인 키 함수를 덮어써 화면이 비었음)", () => {
    const names = [...script.matchAll(/(?:^|[;}\n])\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dup).toEqual([]);
    expect(names).toContain("tok");
  });
});
