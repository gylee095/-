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
  it("맨 위 온도계는 이전 값(비교 기준 시각)도 찍고, 왜 바뀌었는지를 숫자 바로 아래 둔다 (2026-11-04 저녁)", () => {
    // 브라우저 없이 함수만 꺼낸다: 맨 끝의 load()·이벤트 등록 전까지만 실행하고 window·document 는 빈 객체
    const body = script.slice(0, script.lastIndexOf("load();setInterval"));
    const fn = new Function("window", "document", "navigator", "localStorage", body + "\nreturn {gauge:gauge,whyChanged:whyChanged,whyPct:whyPct,gpos:gpos}");
    const { gauge, whyChanged, whyPct, gpos } = fn({}, {}, {}, { getItem: () => null, setItem: () => {} });
    const w = { phase: 2, phaseLabel: "긴장", clash30d: { point: 4 }, war30d: { point: 0.2 }, usual: { clash: 1.8, war: 0.09 }, gauge: { now: gpos(2, 4), usual: 0.08 }, vsUsual: 2.2, domains: [{ label: "군사 동향", level: 2, levelLabel: "경계" }, { label: "정부의 행동", level: 0, levelLabel: "평소" }] };
    const c = { ago: { phase: 2, clash: 3.6, war: 0.18 }, agoAt: Date.UTC(2026, 10, 3, 11, 10), agoLabel: "어제 이맘때", verdict: "worse", basis: "same-time", headline: "", changes: [{ text: "30일 국지 충돌 3.6% → 4%", dir: 1 }, { text: "군사 동향 주의 → 경계", dir: 1 }], movers: [], newEvents: [{ at: Date.UTC(2026, 10, 4, 0, 53), headline: "북한, 미상 발사체 발사 → 동해상", level: 2 }] };
    const g = gauge(w, c);
    expect(g).toContain("어제 이맘때 · 11/3 20:10");
    expect(g).toMatch(/<b>3\.6%<\/b>.*→.*<b style="[^"]*">4\.0%<\/b>/s);
    expect(g).toContain("▲ +0.4%p 나빠짐");
    expect(g).toContain('class="gago"'); // 이전 자리의 속 빈 점
    expect(g).toContain("이전 3.6%");
    const why = whyChanged(w, c);
    expect(why).toContain("▲ 어제 이맘때(11/3 20:10)보다 나빠짐 — 3.6% → 4.0% (+0.4%p)");
    expect(why).toContain("군사 동향 주의 → 경계");
    expect(why).toContain("새 사건 11/4 09:53 북한, 미상 발사체 발사 → 동해상");
    expect(why).not.toContain("30일 국지 충돌 3.6% → 4%"); // 머리글에 이미 있는 숫자는 되풀이하지 않는다
    expect(whyPct(w)).toContain("왜 4.0%인가: 2단계(긴장)의 범위 2~4% 안에서 평소와 다른 영역 1개(군사 동향 경계)가 밀어 올려 위쪽 끝");
    // 비교 기록이 없을 때
    expect(whyChanged(w, { verdict: "unknown", headline: "", changes: [], movers: [], newEvents: [] })).toContain("비교할 이전 기록이 아직 없습니다");
    // 변화가 없을 때도 '몇 % → 몇 % (같음)'
    const same = whyChanged(w, { ...c, ago: { phase: 2, clash: 4, war: 0.2 }, verdict: "same", changes: [], newEvents: [] });
    expect(same).toContain("● 어제 이맘때(11/3 20:10)과 비슷 — 4.0% → 4.0% (같음)");
    expect(gauge(w, { ...c, ago: { phase: 2, clash: 4, war: 0.2 } })).toContain("지금 4.0% (이전과 같음)");
  });
});
