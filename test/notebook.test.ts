// 분석관 노트 (11/19): 기억은 남기되 크기는 고정 — 몇 달이 지나도 분석관이 읽는 양이 늘지 않게
import { describe, expect, it } from "vitest";
import { NOTEBOOK_MAX_LINES, checkNotebook } from "../src/core/notebook.js";

describe("분석관 노트", () => {
  const ok = "[평소]\n- 11/18 북한 인터넷 장애 경보: 한 달 2~3번, 대개 정전\n[교훈]\n- 11/18 해설 기사 제목의 missile 을 발사로 오인\n[흐름]\n- 2/28부터 미-이란 전쟁";
  it("세 칸 노트를 받는다 — 머리줄은 줄 수에 넣지 않는다", () => {
    expect(checkNotebook(ok)).toMatchObject({ ok: true, lines: 3 });
  });
  it(`${NOTEBOOK_MAX_LINES}줄을 넘으면 저장하지 않고 지우라고 돌려보낸다`, () => {
    const many = Array.from({ length: NOTEBOOK_MAX_LINES + 1 }, (_, i) => `- 줄 ${i}`).join("\n");
    const r = checkNotebook(many);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/지우고/);
    expect(checkNotebook(Array.from({ length: NOTEBOOK_MAX_LINES }, (_, i) => `- 줄 ${i}`).join("\n")).ok).toBe(true);
  });
  it("너무 긴 줄·빈 노트·비밀값은 거절한다", () => {
    expect(checkNotebook("- " + "가".repeat(200)).ok).toBe(false);
    expect(checkNotebook("[평소]\n\n").ok).toBe(false);
    expect(checkNotebook("- 키 sk-ant-oat01-abcdef").ok).toBe(false);
  });
});
