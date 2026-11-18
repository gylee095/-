// 한반도 연관도 (2026-11-18 사용자: "우리 앱은 한반도 전쟁이다 — 아무 속보나 뜨면 안 되고, 한반도 전쟁과 가장 가까운 속보가 떠야 한다.
// 그런 속보가 많을수록 신호에 더 영향을 준다")
// 속보마다 0~3: 3 한반도 직접 · 2 한 다리 건너(한반도의 억지력·주변 강대국·핵·미국 본토) · 1 먼 배경(다른 곳의 전쟁 전황) · 0 무관(재판·사건 사고·해설).
// 여기의 값은 낱말로 매긴 '임시' 점수다 — 들어온 순간 바로 붙고, 분석관이 읽은 뒤 고쳐 매긴다(newsjudge.ts). 새 '종류'를 만드는 것이 아니라 가까움만 잰다.
import { isKoreaContext, worldEvent } from "./classify.js";

export type Rel = 0 | 1 | 2 | 3;
export const REL_LABEL = ["한반도와 무관", "먼 배경", "한 다리 건너", "한반도 직접"] as const;
/** 신호에 더하는 무게: 먼 배경은 여럿이 쌓여도 조금, 가까운 것은 몇 건만으로 크게 */
export const REL_WEIGHT = [0, 1, 3, 6] as const;
/** 넓은 그물·세계 그물로 받은 소식 (규칙이 종류를 정한 한반도 사건이 아닌 것) */
export const isWideNet = (categories: string[]) => categories.length === 1 && (categories[0] === "security_news" || categories[0] === "world_event");

const KOREA_RE = /주한미군|한반도|북한|\bUSFK\b|North Korea|Korean Peninsula|KADIZ|\bNLL\b|서해 ?5도|휴전선|\bDMZ\b/i;
// 무관: 일어난 일이 아니라 재판·수사·해설·영상 묶음
const NOISE_RE = /\b(sentenced|convicted|charged|indicted|sues?|lawsuit|trial|court|pleads?|arrest(?:ed)?|accused|custody|war of words|budget|pitches|resurface\w*|man with)\b|^WATCH:|선고|기소|소송|재판|구속|체포|혐의/i;
// 한 다리 건너 ① 한반도의 억지력: 인도태평양·주일미군 전력, 대만해협
const NEAR_FORCE_RE = /Indo-?Pacific|7th Fleet|Seventh Fleet|\bGuam\b|Okinawa|Yokosuka|Taiwan Strait|인도태평양|7함대|주일미군|오키나와|\b괌\b|대만해협|대만 (?:봉쇄|포위|침공)/i;
const TAIWAN_RE = /\bTaiwan\b|대만/i;
const FORCE_RE = /\b(strikes?|struck|attack\w*|missiles?|blockade|invad\w+|invasion|shot down|shoot down|downed|clash\w*|collid\w+|fired?|drills? around|encircl\w+)\b|공격|봉쇄|침공|격추|충돌|교전|포위|발사/i;
// ② 핵
const NUCLEAR_RE = /\bnuclear (?:test|strike|attack|weapons? use|threat|detonat\w+)|dirty bomb|tactical nuclear|핵실험|핵공격|핵 ?위협|핵무기 사용|전술핵|더티밤|더티 밤/i;
// ③ 강대국끼리 직접 부딪침
const US_RE = /\b(U\.?S\.?|US|American|Pentagon|NATO)\b|미국|미군|나토/;
const POWER_RE = /\b(China|Chinese|Russia|Russian)\b|중국|러시아|중·러|러·중/;
const DIRECT_RE = /\b(shot down|shoot down|downed|collid\w+|clash\w*|fired? (?:on|at)|intercept\w+|sinks?|sunk)\b|격추|충돌|교전|침몰|나포/i;
// ④ 미국 본토가 공격받거나 전국 규모로 멈춤
const HOMELAND_RE = /\b(attack|plot|bomb|strike|explosion)\b[^.]{0,50}\b(Washington|U\.?S\. soil|homeland|White House|Pentagon|New York)\b|\b(Washington|White House|Pentagon|homeland)\b[^.]{0,50}\b(attack(?:ed)?|bomb(?:ed|ing)?|explosion)\b|미국? ?본토|워싱턴[^.]{0,20}(테러|공격)/i;
const US_PARALYSIS_RE = /\b(nationwide|classified|N\.?S\.?A\.?|Pentagon|power grid|ground stop|air traffic)\b.{0,60}\b(outages?|goes down|went down|is down|grounded|blackout|cyberattack|hacked|crippled|knocked out)\b|ground stop/i;
// ⑤ 중국·러시아와 일본의 군사 마찰 (한반도 바로 옆)
const JAPAN_RE = /\bJapan(?:ese)?\b|일본|자위대/;

/** 제목만 보고 매기는 임시 연관도. 규칙이 종류를 정한 한반도 사건(발사·포격·경보 등)은 3 */
export function koreaRelevance(title: string, categories: string[]): Rel {
  if (!isWideNet(categories) || isKoreaContext(title) || KOREA_RE.test(title)) return 3;
  if (NOISE_RE.test(title)) return 0;
  if (NUCLEAR_RE.test(title) || NEAR_FORCE_RE.test(title)) return 2;
  if (TAIWAN_RE.test(title) && FORCE_RE.test(title)) return 2;
  if (US_RE.test(title) && POWER_RE.test(title) && DIRECT_RE.test(title)) return 2;
  if (POWER_RE.test(title) && JAPAN_RE.test(title) && FORCE_RE.test(title)) return 2;
  if (HOMELAND_RE.test(title) || US_PARALYSIS_RE.test(title) || worldEvent(title) === "infra") return 2;
  return 1;
}
