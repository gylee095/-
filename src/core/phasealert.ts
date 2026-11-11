// 손님 알림 (2026-11-12 사용자: 너무 자주도 너무 드물게도 안 된다) — 세 가지뿐:
//   ① 단계가 바뀔 때  ② 같은 긴장 단계 안에서 실제 징조·조용한 움직임이 나타날 때  ③ 주간 요약(월요일 오전 9시)
// 아래는 11/3 에 '단계가 바뀔 때만'으로 정한 이유 — 지금도 유효하다:
// 알림은 '전쟁 위험 단계가 실제로 바뀌었을 때'만 (2026-11-03)
// 그동안 휴대폰으로 간 것은 거의 심층 분석 보고서였다(10/31~11/3 다섯 번, 모두 '2단계·국지 충돌 4~5%'로 같은 결론) —
// '사람들의 불안 경계'처럼 오래 이어지는 상태가 24시간마다 심층 분석을 다시 깨웠고, 실행마다 알림을 보냈다.
// 확률 숫자(약 4%)는 영역 압력에 따라 하루에도 3.4 → 3.6 → 3.8 처럼 조금씩 흔들리고, 반올림 경계(3.5%)에서 3%↔4%로 깜빡이므로 알림 기준으로 쓰지 않는다.
// 단계는 드물게 바뀌고 바뀌면 범위가 크게 뛴다(2단계 2~4% → 3단계 8~25%).
// 실제 사건(발사 속보·민방위 경보·철수 권고)은 단계와 상관없이 지금처럼 바로 알린다 (policy.ts).
import { MOVES_AT, RUBRIC_VERSION, SIGNS_AT } from "./rubric.js";
import { addChangeReport, addTestReport } from "./reports.js";
import type { Phase, WarRisk } from "./warrisk.js";
import { fmtRiskPct } from "./warrisk.js";
import type { Store } from "./store.js";
import { sendPush, type PushEnv } from "./notify.js";
import { pushBody, situationFromRecords } from "./pushtext.js";

/** 올라간 단계는 이만큼 이어져야 알린다 (5분 주기 두 번 — 한 번 튄 값으로 울리지 않게). 사건 자체는 사건 알림이 바로 간다 */
export const UP_CONFIRM_CHECKS = 2;
/** 내려간 단계는 이만큼 이어져야 알린다 (오르내림 반복 방지) */
export const DOWN_HOLD_MS = 6 * 3600_000;
/** 하루 최대 알림 수 (안전장치) — 위기(3단계) 이상으로 오르는 알림은 이 한도와 상관없이 보낸다 */
export const PHASE_ALERTS_PER_DAY = 3;
/** '긴장 안에서 실제 징조가 나타남' 알림은 이만큼 간격을 둔다 (켜졌다 꺼졌다 할 때 되풀이하지 않게) */
export const SUB_GAP_MS = 12 * 3600_000;
/** 주간 요약: 월요일 오전 9시(한국 시간). 변화가 없어도 '살아 있다'는 것과 지난주 대비를 알린다. 직전 24시간 안에 다른 알림이 갔으면 건너뛴다 */
export const DIGEST_DOW = 1, DIGEST_HOUR = 9;

export interface PhaseNotifyState {
  /** 마지막으로 알린(또는 처음 본) 단계 */
  phase: Phase;
  at: number;
  /** 바뀐 것으로 보이지만 아직 확인 중인 단계 */
  pending?: { phase: Phase; since: number; seen: number };
  /** 한국 날짜 → 그날 보낸 단계 알림 수 */
  sent?: Record<string, number>;
  /** 2단계(긴장) 안에서 '실제 징조·움직임이 나타났다'고 이미 알렸나 (배경만으로 긴장일 때와 구분 — 11/12) */
  sub?: boolean;
  subSeen?: number;
  subAt?: number;
  /** 마지막으로 손님에게 알림을 보낸 시각 · 주간 요약을 보낸 주(그 주 월요일 날짜) */
  lastSentAt?: number;
  digest?: string;
}

type Judged = Pick<WarRisk, "phase" | "phaseLabel" | "clash30d" | "usual" | "phaseReasons" | "tripwires"> & { vsUsual?: number; proximity?: WarRisk["proximity"] };
/** 긴장(2단계)이 배경 때문만이 아니라 실제 징조(3개 이상)나 조용한 움직임(3개 이상) 때문인가 */
export const realSigns = (w: Judged) => { const r = w.proximity?.rubric; return !!r && (r.signs >= SIGNS_AT[2] || r.moves >= MOVES_AT.watch); };

export interface PhaseMessage {
  title: string;
  body: string;
  priority: number;
  direction: "up" | "down";
}

const NAMES = ["", "평온", "긴장", "위기", "임박", "교전"] as const;
const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 지금 단계를 보고 알릴지 정한다 — 상태를 바꾼 새 값과(있으면) 보낼 알림을 돌려준다 */
export function decidePhaseAlert(prev: PhaseNotifyState | undefined, w: Judged, now: number, opts?: { dashboardUrl?: string; clashAgo?: number; agoAt?: number; agoLabel?: string }): { state: PhaseNotifyState; message?: PhaseMessage } {
  // 처음: 지금 단계를 기억만 한다 (배포하자마자 '바뀜' 알림이 나가지 않게)
  if (!prev) return { state: { phase: w.phase, at: now } };
  const base: PhaseNotifyState = { ...prev, sent: { ...(prev.sent ?? {}) } };
  const sub = realSigns(w);
  if (w.phase === prev.phase) {
    const { pending: _p, ...rest } = base;
    // 같은 2단계 안에서: 배경만으로 긴장이다가 실제 징조·움직임이 나타나면 한 번 알린다 (두 번 확인, 12시간 간격)
    if (w.phase === 2 && sub && !prev.sub) {
      const seen = (prev.subSeen ?? 0) + 1;
      if (seen < UP_CONFIRM_CHECKS || (prev.subAt !== undefined && now - prev.subAt < SUB_GAP_MS)) return { state: { ...rest, subSeen: seen } };
      const day = kstDay(now), sentToday = rest.sent![day] ?? 0;
      const state: PhaseNotifyState = { ...rest, sub: true, subSeen: undefined, subAt: now };
      if (sentToday >= PHASE_ALERTS_PER_DAY) return { state };
      return { state: { ...state, sent: { ...rest.sent, [day]: sentToday + 1 } }, message: subMessage(w, opts) };
    }
    return { state: { ...rest, sub: w.phase === 2 ? !!prev.sub && sub : sub, subSeen: undefined } };
  }
  const up = w.phase > prev.phase;
  const pending = prev.pending && prev.pending.phase === w.phase ? { ...prev.pending, seen: prev.pending.seen + 1 } : { phase: w.phase, since: now, seen: 1 };
  const confirmed = up ? pending.seen >= UP_CONFIRM_CHECKS : now - pending.since >= DOWN_HOLD_MS;
  if (!confirmed) return { state: { ...base, pending } };
  const day = kstDay(now);
  const sentToday = base.sent![day] ?? 0;
  // 단계는 바꿔 기억하되, 하루 한도를 넘으면 알림은 보내지 않는다
  const state: PhaseNotifyState = { phase: w.phase, at: now, sub, subAt: prev.subAt, lastSentAt: prev.lastSentAt, digest: prev.digest, sent: { ...Object.fromEntries(Object.entries(base.sent!).filter(([d]) => d >= kstDay(now - 7 * 86400_000))), [day]: sentToday + 1 } };
  if (sentToday >= PHASE_ALERTS_PER_DAY && !(up && w.phase >= 3)) return { state: { ...state, sent: { ...state.sent, [day]: sentToday } } };
  return { state, message: phaseMessage(prev.phase, w, up, opts) };
}

const counts = (w: Judged) => { const r = w.proximity?.rubric; return r ? `전쟁 전 징조 9개 중 ${r.signs}개 · 조용한 움직임 ${r.moves}개 · 불안한 배경 ${r.context}개` : `30일 안 국지 충돌 약 ${fmtRiskPct(w.clash30d.point)}`; };
const pctOf = (w: Judged) => (w.proximity ? ` ${w.proximity.index}%` : "");

/** 같은 긴장 단계 안에서 실제 징조·움직임이 나타났을 때 */
export function subMessage(w: Judged, opts?: { dashboardUrl?: string }): PhaseMessage {
  const r = w.proximity!.rubric;
  const what = r.surprise ? `뉴스의 징조는 적은데 사람·돈·군의 측정값 ${r.moves}개가 함께 움직였어요 (기습 주의).` : `전쟁 전 징조가 9개 중 ${r.signs}개로 늘었어요.`;
  return { title: `2단계 긴장${pctOf(w)} · 실제 징조가 나타남`, body: [what, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 3, direction: "up" };
}

/** 주간 요약: 변화가 없어도 한 번 */
export function digestMessage(w: Judged, opts?: { dashboardUrl?: string }): PhaseMessage {
  const d7 = w.proximity?.vs.d7;
  const vs = d7 === undefined ? "지난주 기록은 아직 없어요." : d7 === 0 ? "지난주와 같아요." : `지난주보다 ${Math.abs(d7)}%p ${d7 > 0 ? "높아졌어요" : "낮아졌어요"}.`;
  return { title: `주간 요약 · ${w.phase}단계 ${w.phaseLabel}${pctOf(w)}`, body: [vs, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 2, direction: "down" };
}

/** 이번 주 월요일(한국 날짜) — 주간 요약을 보낼 때가 됐으면 그 날짜 */
export function digestDue(state: PhaseNotifyState, now: number): string | undefined {
  const k = new Date(now + 9 * 3600_000);
  if (k.getUTCDay() !== DIGEST_DOW || k.getUTCHours() < DIGEST_HOUR) return undefined;
  const monday = k.toISOString().slice(0, 10);
  return state.digest === monday ? undefined : monday;
}

export function phaseMessage(from: Phase, w: Judged, up: boolean, opts?: { dashboardUrl?: string; clashAgo?: number; agoAt?: number; agoLabel?: string }): PhaseMessage {
  const ratio = w.vsUsual ?? w.clash30d.point / w.usual.clash;
  const times = ratio < 1.15 ? "평소 수준" : `평소의 ${ratio < 10 ? (Math.abs(ratio - Math.round(ratio)) < 0.05 ? Math.round(ratio) : ratio.toFixed(1)) : Math.round(ratio)}배`;
  // 제목은 중요한 것부터: 지금 단계 · 이전 → 지금 확률 · 방향 (예: "3단계 위기 (3.8% → 15%) 나빠짐 · 2단계 긴장에서")
  const pct1 = (x: number) => (x >= 10 ? Math.round(x) : +x.toFixed(1)) + "%";
  const nums = opts?.clashAgo !== undefined ? `${pct1(opts.clashAgo)} → ${pct1(w.clash30d.point)}` : `약 ${fmtRiskPct(w.clash30d.point)}`;
  const title = `${w.phase}단계 ${w.phaseLabel} (${nums}) ${up ? "나빠짐" : "좋아짐"} · ${from}단계 ${NAMES[from]}에서`;
  const what = w.phaseReasons.length ? w.phaseReasons[0] : up ? "전쟁 위험 단계가 올라갔습니다." : "6시간 넘게 낮은 단계가 이어졌습니다.";
  const extra = [
    `평소 약 ${fmtRiskPct(w.usual.clash)}의 ${times.replace("평소의 ", "")}`,
    up && w.tripwires.length ? `다음에 볼 것: ${w.tripwires[0]}` : "",
  ];
  const body = pushBody({ label: `${w.phase}단계 ${w.phaseLabel}`, clash: w.clash30d.point, clashAgo: opts?.clashAgo, agoAt: opts?.agoAt, agoLabel: opts?.agoLabel, phase: w.phase, phaseAgo: from }, what, opts?.dashboardUrl, extra);
  return { title, body, priority: up ? (w.phase >= 4 ? 5 : w.phase >= 3 ? 4 : 3) : 2, direction: up ? "up" : "down" };
}

export const PHASE_STATE_KEY = "risk:phase_notify";

/** 5분마다: 단계가 실제로 바뀌었으면 알린다. 보내기 실패는 다음 주기에 다시 (세 번까지) */
export async function notifyPhaseChange(
  store: Store,
  env: PushEnv & { DASHBOARD_URL?: string },
  w: WarRisk,
  now: number,
  fetchImpl: typeof fetch = fetch,
  /** 그 순간의 대시보드 전체 (고객 리포트로 얼린다) */
  full?: Record<string, unknown>,
): Promise<{ sent?: PhaseMessage; ok?: boolean; state: PhaseNotifyState }> {
  const raw = await store.getKv(PHASE_STATE_KEY);
  const prev = raw ? (JSON.parse(raw) as PhaseNotifyState & { fails?: number; rule?: number }) : undefined;
  // 판정 규칙이 바뀐 직후(11/12 규칙 3.0)에는 단계가 규칙 때문에 달라질 수 있다 — 손님에게 '상황이 바뀌었다'고 알리지 않고 새 규칙의 단계를 기억만 한다
  if (prev && prev.rule !== RUBRIC_VERSION) {
    const state = { phase: w.phase, at: now, rule: RUBRIC_VERSION } as PhaseNotifyState;
    await store.setKv(PHASE_STATE_KEY, JSON.stringify(state));
    return { state };
  }
  const ago = await situationFromRecords(store as Store, now, "").catch(() => undefined);
  const decided = decidePhaseAlert(prev, w, now, { dashboardUrl: env.DASHBOARD_URL, clashAgo: ago?.clashAgo, agoAt: ago?.agoAt, agoLabel: ago?.agoLabel });
  let { state, message } = decided;
  // 주간 요약 (11/12 사용자: 너무 자주도, 너무 드물게도 안 된다): 월요일 오전 9시에 한 번. 직전 24시간 안에 다른 알림이 갔으면 이번 주는 건너뛴다
  const monday = !message ? digestDue(state, now) : undefined;
  if (monday) {
    state = { ...state, digest: monday };
    if (!(state.lastSentAt !== undefined && now - state.lastSentAt < 24 * 3600_000)) message = digestMessage(w, { dashboardUrl: env.DASHBOARD_URL });
  }
  if (!message) {
    await store.setKv(PHASE_STATE_KEY, JSON.stringify({ ...state, rule: RUBRIC_VERSION }));
    return { state };
  }
  // 고객은 알림이 올 때만 리포트를 받는다 (11/5): 그 순간의 판정을 리포트로 얼려 두고, 알림을 누르면 알림함에서 그 리포트가 열린다
  const report = await addChangeReport(store, w, prev?.phase ?? w.phase, now, full).catch(() => undefined);
  const url = env.DASHBOARD_URL ? (report ? `${env.DASHBOARD_URL}/me?r=${report.id}` : `${env.DASHBOARD_URL}/me`) : undefined;
  const body = url && env.DASHBOARD_URL ? message.body.replace(`대시보드 : ${env.DASHBOARD_URL}`, `리포트 : ${url}`) : message.body;
  const res = await sendPush(env, { audience: "all", title: message.title, body, priority: message.priority, url }, fetchImpl, store);
  const ok = res.some((r) => r.ok);
  const error = res.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join("; ") || undefined;
  await store.logAlert({ eventId: `phase:${w.phase}`, sentAt: now, status: "CONFIRMED", severity: w.phase * 20, title: message.title, body: message.body, channel: res.map((r) => r.channel).join(","), ok, ...(error ? { error } : {}) });
  const fails = ok ? 0 : (prev?.fails ?? 0) + 1;
  // 못 보냈으면 이전 단계를 그대로 두어 다음 주기에 다시 시도한다 (세 번 실패하면 바뀐 단계로 넘어간다)
  const next = ok || fails >= 3 ? { ...state, lastSentAt: ok ? now : state.lastSentAt } : { ...(prev ?? state), fails };
  await store.setKv(PHASE_STATE_KEY, JSON.stringify({ ...next, rule: RUBRIC_VERSION }));
  return { sent: message, ok, state: next };
}

/**
 * 운영자가 직접 보내는 손님용 테스트 알림 (11/12 사용자: "지금 것을 알림 보내면서 테스트로") — 실제 알림과 같은 길(리포트를 얼리고 → 손님 푸시 → 알림함)을 탄다.
 * 제목과 본문 첫 줄부터 테스트임을 밝힌다. 단계 기억(risk:phase_notify)은 건드리지 않는다.
 */
export async function sendTestAlert(store: Store, env: PushEnv & { DASHBOARD_URL?: string }, w: WarRisk, now: number, fetchImpl: typeof fetch = fetch, full?: Record<string, unknown>) {
  const report = await addTestReport(store, w, now, full);
  const url = env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/me?r=${report.id}` : undefined;
  const body = [`🧪 테스트 알림 — 실제 변화 아님`, `지금 상황: ${w.phase}단계 ${w.phaseLabel}${pctOf(w)}`, counts(w), url ? `리포트 : ${url}` : ""].filter(Boolean).join("\n");
  const res = await sendPush(env, { audience: "all", title: `🧪 테스트 — ${w.phase}단계 ${w.phaseLabel}${pctOf(w)}`, body, priority: 2, url, tag: "kew-test" }, fetchImpl, store);
  return { reportId: report.id, sent: res.map((r) => ({ channel: r.channel, ok: r.ok, error: r.error })) };
}
