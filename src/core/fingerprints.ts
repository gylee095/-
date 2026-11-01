// 전쟁 직전의 지문 — 다른 전쟁이 시작되기 전 30일·7일·1일 사이에 '공개적으로' 보였던 것들 (2026-11-01).
// 한반도 전면전은 1953년 이후 없어 통계로 배울 수 없으므로, 실제 전쟁 직전에 남이 볼 수 있었던 준비를 목록으로 만들어
// 지금 그중 몇 개가 켜졌는지 매일 본다. 1950년 한국전쟁·2023년 10·7 하마스 기습처럼 지문 없이 오는 경우도 있다는 점을 함께 적는다.
// 근거: docs/INDICATORS.md 0.5
import type { BoardRow } from "./state.js";
import type { EventBrief } from "./brief.js";
import type { WarRisk } from "./warrisk.js";

export interface Fingerprint {
  id: string;
  label: string;
  /** 과거 사례와 시작 며칠 전에 보였는지 */
  precedent: string;
  /** auto = 시스템이 자동으로 본다 · analyst = 분석관이 확인 · blind = 공개 자료로 볼 수 없다 */
  watch: "auto" | "analyst" | "blind";
}

export const FINGERPRINTS: Fingerprint[] = [
  { id: "evacuation", label: "외국 정부의 자국민 철수·출국 권고", watch: "auto",
    precedent: "우크라이나 2022: 미국 대사관 가족 철수 명령(침공 32일 전), '지금 떠나라' 4단계(12일 전)" },
  { id: "intel_warning", label: "정보당국의 공개 경고", watch: "auto",
    precedent: "우크라이나 2022: 미국이 기밀을 풀어 수개월 경고, '푸틴이 결정했다'(6일 전)" },
  { id: "airlines", label: "외국 항공사 운항 중단", watch: "auto", precedent: "우크라이나 2022: KLM 운항 중단(12일 전)" },
  { id: "cyber", label: "파괴형 사이버 공격·사이버위기 경보 격상", watch: "auto", precedent: "우크라이나 2022: 정부 전산망 파괴 공격(약 40일 전), 조지아 2008: 디도스(수 주 전)" },
  { id: "forward_deploy", label: "접경 병력·포병 집결 포착", watch: "auto", precedent: "걸프 1990: 이라크군 쿠웨이트 국경 집결 보도(약 9일 전), 우크라이나 2022: 위성사진으로 수개월 공개" },
  { id: "pretext", label: "명분 쌓기 — 상대의 '도발' 주장과 거친 말", watch: "auto",
    precedent: "걸프 1990: 쿠웨이트가 석유를 훔친다는 주장(16일 전), 우크라이나 2022: '돈바스 학살' 주장·분리지역 승인(3일 전), 북한 2024: 평양 무인기 주장" },
  { id: "war_posture", label: "전시 태세 선포·동원", watch: "auto", precedent: "북한 2013 '1호 전투근무태세', 2015 '준전시상태'(포격전 직후), 2024 '완전사격준비태세'" },
  { id: "defender_posture", label: "방어하는 쪽의 태세 격상 (워치콘·데프콘·진돗개)", watch: "auto", precedent: "한국 1976·1983 데프콘 3, 큰 도발 뒤 워치콘 2" },
  { id: "border_evacuation", label: "접경 주민 소개(疏開)", watch: "auto", precedent: "한국 1950: 북한이 침공 전 38선 부근 주민을 뒤로 물림" },
  { id: "embassies_out", label: "상대국에 있던 우호국 외교관 철수", watch: "auto", precedent: "우크라이나 2022: 러시아 외교관 키이우 철수(1일 전)" },
  { id: "money_out", label: "돈이 빠짐 — 통화·채권 급락, 보험·기업 철수", watch: "auto", precedent: "우크라이나 2022: 흐리우냐·국채 급락(1~2월)" },
  { id: "peace_offensive", label: "갑작스러운 대화·평화 제의 (기만)", watch: "analyst", precedent: "한국 1950: 6월 평화통일 제의 직후 남침 — 위기 속 갑작스러운 유화 제스처는 거꾸로 읽을 수도 있다" },
  { id: "medical", label: "야전병원·혈액 비축", watch: "blind", precedent: "우크라이나 2022: 러시아 혈액·야전병원 접경 이동 보도(약 4주 전) — 북한은 공개 자료로 볼 수 없다" },
];

export interface FingerprintCheck {
  id: string;
  label: string;
  precedent: string;
  watch: Fingerprint["watch"];
  /** 켜짐 · 꺼짐 · 못 봄(분석관 확인 또는 공개 자료 없음) */
  status: "on" | "off" | "unknown";
  evidence?: string;
}

const pts = (r?: BoardRow) => (!r?.reading ? 0 : r.reading.state === "anomalous" ? 2 : r.reading.state === "elevated" ? 1 : 0);

export function checkFingerprints(w: WarRisk, board: BoardRow[], briefs: EventBrief[], now: number): { checks: FingerprintCheck[]; on: number; watched: number } {
  const by = Object.fromEntries(board.map((b) => [b.id, b])) as Record<string, BoardRow>;
  const week = briefs.filter((b) => now - b.at < 7 * 86400_000 && now - b.at >= -3600_000);
  const posture = (ids: string[]) => week.find((b) => b.posture?.some((p) => ids.includes(p.id)));
  const lvl = (id: string) => w.domains.find((d) => d.id === id)?.level ?? 0;
  const result = (f: Fingerprint, hit: EventBrief | string | undefined | false): FingerprintCheck => ({
    id: f.id, label: f.label, precedent: f.precedent, watch: f.watch,
    status: f.watch !== "auto" ? "unknown" : hit ? "on" : "off",
    evidence: typeof hit === "string" ? hit : hit ? hit.headline : undefined,
  });
  const evac = week.find((b) => b.evacuation === "confirmed" || b.evacuation === "official");
  const govEvac = pts(by["official.us_departure_kr"]) > 0 ? "미 국무부 경보 본문에 철수·출국 문구" : (by["official.us_travel_level_kr"]?.reading?.value ?? 0) >= 3 ? `미 국무부 여행경보 ${by["official.us_travel_level_kr"].reading!.value}단계` : pts(by["official.jp_embassy_alert"]) === 2 ? "주한 일본대사관 퇴피·출국 안내" : undefined;
  const checks = FINGERPRINTS.map((f) => {
    switch (f.id) {
      case "evacuation": return result(f, govEvac ?? evac);
      case "intel_warning": return result(f, posture(["us_intel_warning"]));
      case "airlines": return result(f, posture(["airlines_suspend"]));
      case "cyber": return result(f, posture(["cyber_alert"]));
      case "forward_deploy": return result(f, posture(["nk_forward_deploy"]));
      case "pretext": return result(f, lvl("nkwords") >= 2 ? `북한의 말 '${w.domains.find((d) => d.id === "nkwords")!.levelLabel}'` : undefined);
      case "war_posture": return result(f, posture(["nk_war_posture", "kr_mobilization"]));
      case "defender_posture": return result(f, posture(["watchcon_up", "defcon_up", "defense_situation", "defense_situation_a"]));
      case "border_evacuation": return result(f, posture(["nk_border_evacuation"]));
      case "embassies_out": return result(f, posture(["pyongyang_embassies_leave"]));
      case "money_out": return result(f, posture(["war_insurance", "firms_evacuate"]) ?? (lvl("money") >= 2 ? "돈의 움직임 '경계' 이상" : lvl("elite") >= 2 ? "엘리트·큰손 '경계' 이상" : undefined));
      default: return result(f, undefined);
    }
  });
  return { checks, on: checks.filter((c) => c.status === "on").length, watched: checks.filter((c) => c.watch === "auto").length };
}
