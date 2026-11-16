// 손님 알림 (2026-11-12 사용자: 너무 자주도 너무 드물게도 안 된다 · 11/17 넷으로 넓힘: "지금 기준은 몇 년에 한 번만 울린다 — 그 전에는 못 받는다"):
//   ① 단계가 바뀔 때  ② 같은 긴장 단계 안에서 실제 징조·조용한 움직임이 나타날 때
//   ③ 큰 사건(북한 발사·포격·핵실험)이 확인됐을 때 — 단계가 그대로여도 '그대로'라고 알린다 (하루 한 번)
//   ④ 앱의 % 가 아침 판정보다 눈에 띄게 올라 30분 이어질 때 (배경만 늘어난 것은 제외 — 스레드 홍보와 같은 기준)
//   마무리 원칙 (11/17 사용자: "올라갔다고 알렸으면 내려갔을 때도 알려야 한다 — 안 알려 주면 계속 불안해야 한다"):
//   ①·②·④ 는 가라앉아 6시간 이어지면 '가라앉았어요'를 조용한 알림으로 한 번 보낸다(하루 한도와 상관없이). ③ 은 그 순간에 끝나는 일이라 알림 안에 '단계는 그대로'를 넣는다.
//   (주간 요약은 넣었다가 같은 날 껐다 — DIGEST_ON)
// 아래는 11/3 에 '단계가 바뀔 때만'으로 정한 이유 — 지금도 유효하다:
// 알림은 '전쟁 위험 단계가 실제로 바뀌었을 때'만 (2026-11-03)
// 그동안 휴대폰으로 간 것은 거의 심층 분석 보고서였다(10/31~11/3 다섯 번, 모두 '2단계·국지 충돌 4~5%'로 같은 결론) —
// '사람들의 불안 경계'처럼 오래 이어지는 상태가 24시간마다 심층 분석을 다시 깨웠고, 실행마다 알림을 보냈다.
// 확률 숫자(약 4%)는 영역 압력에 따라 하루에도 3.4 → 3.6 → 3.8 처럼 조금씩 흔들리고, 반올림 경계(3.5%)에서 3%↔4%로 깜빡이므로 알림 기준으로 쓰지 않는다.
// 단계는 드물게 바뀌고 바뀌면 범위가 크게 뛴다(2단계 2~4% → 3단계 8~25%).
// 실제 사건(발사 속보·민방위 경보·철수 권고)은 단계와 상관없이 지금처럼 바로 알린다 (policy.ts).
import { MOVES_AT, RUBRIC_VERSION, SIGNS_AT } from "./rubric.js";
import { addChangeReport, addNoteReport, addTestReport } from "./reports.js";
import { OFFICIAL_KEY } from "./official.js";
import { postable, riseOf, RISE_HOLD_MS } from "./threads.js";
import type { CrisisEvent } from "./types.js";
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
/** 주간 요약은 꺼 둔다 (11/12 사용자: 엄청 정확한 것도 아닌데 매주 알림이 오면 귀찮고 신빙성만 떨어져 환불하고 싶어질 수 있다) — 코드는 남겨 두고 이 값으로만 켠다 */
export const DIGEST_ON = false;
/** 주간 요약(꺼져 있음): 월요일 오전 9시(한국 시간). 변화가 없어도 '살아 있다'는 것과 지난주 대비를 알린다. 직전 24시간 안에 다른 알림이 갔으면 건너뛴다 */
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
  /** ② 를 알린 뒤 징조가 사라진 것을 처음 본 시각 — 6시간 이어지면 '가라앉았어요' */
  subOff?: number;
  /** ④ 눈에 띄는 상승: 오른 것을 처음 본 시각 · 알린 뒤에는 그때의 기준(아침 %)과 시각 · 가라앉은 것을 처음 본 시각 */
  riseSeen?: number;
  rise?: { base: number; at: number };
  riseOff?: number;
  /** ③ 큰 사건: 알린 날(한국 날짜)과 알린 사건 id */
  evDay?: string;
  evIds?: string[];
}
/** ④ 를 알린 뒤 이만큼 지나도 가라앉지 않으면 그 수준을 새 평소로 보고 기억을 지운다 (다음 상승을 다시 알릴 수 있게) */
export const RISE_FORGET_MS = 7 * 86400_000;
/** ④ 의 '가라앉음': 알릴 때의 기준(아침 %)에서 이 안으로 돌아오면 */
export const RISE_BACK_PTS = 2;
/** ③ 큰 사건 알림은 하루에 이만큼 */
export const EVENT_ALERTS_PER_DAY = 1;

type Judged = Pick<WarRisk, "phase" | "phaseLabel" | "clash30d" | "usual" | "phaseReasons" | "tripwires"> & { vsUsual?: number; proximity?: WarRisk["proximity"] };
/** 긴장(2단계)이 배경 때문만이 아니라 실제 징조(3개 이상)나 조용한 움직임(3개 이상) 때문인가 */
export const realSigns = (w: Judged) => { const r = w.proximity?.rubric; return !!r && (r.signs >= SIGNS_AT[2] || r.moves >= MOVES_AT.watch); };

export interface PhaseMessage {
  title: string;
  body: string;
  priority: number;
  direction: "up" | "down";
  /** 단계가 바뀐 것이 아닌 알림(②③④와 마무리)은 리포트 목록에 이 제목 그대로 남긴다 */
  note?: boolean;
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
    // 마무리: ② 를 알린 뒤 징조가 사라져 6시간 이어지면 한 번 알린다 (하루 한도와 상관없이 — 안심시키는 소식이 막히면 안 된다)
    if (w.phase === 2 && prev.sub && !sub) {
      const since = prev.subOff ?? now;
      if (now - since < DOWN_HOLD_MS) return { state: { ...rest, subOff: since, subSeen: undefined } };
      return { state: { ...rest, sub: false, subOff: undefined, subSeen: undefined }, message: calmMessage(w, "실제 징조가 가라앉았어요", "앞서 알려 드린 징조·움직임이 6시간 넘게 보이지 않아요.", opts) };
    }
    return { state: { ...rest, sub: w.phase === 2 ? !!prev.sub && sub : sub, subSeen: undefined, subOff: undefined } };
  }
  const up = w.phase > prev.phase;
  const pending = prev.pending && prev.pending.phase === w.phase ? { ...prev.pending, seen: prev.pending.seen + 1 } : { phase: w.phase, since: now, seen: 1 };
  const confirmed = up ? pending.seen >= UP_CONFIRM_CHECKS : now - pending.since >= DOWN_HOLD_MS;
  if (!confirmed) return { state: { ...base, pending } };
  const day = kstDay(now);
  const sentToday = base.sent![day] ?? 0;
  // 단계는 바꿔 기억하되, 하루 한도를 넘으면 알림은 보내지 않는다
  const state: PhaseNotifyState = { phase: w.phase, at: now, sub, subAt: prev.subAt, lastSentAt: prev.lastSentAt, digest: prev.digest, rise: prev.rise, evDay: prev.evDay, evIds: prev.evIds, sent: { ...Object.fromEntries(Object.entries(base.sent!).filter(([d]) => d >= kstDay(now - 7 * 86400_000))), [day]: sentToday + 1 } };
  if (sentToday >= PHASE_ALERTS_PER_DAY && !(up && w.phase >= 3)) return { state: { ...state, sent: { ...state.sent, [day]: sentToday } } };
  return { state, message: phaseMessage(prev.phase, w, up, opts) };
}

const counts = (w: Judged) => { const r = w.proximity?.rubric; return r ? `전쟁 전 징조 9개 중 ${r.signs}개 · 조용한 움직임 ${r.moves}개 · 불안한 배경 ${r.context}개` : `30일 안 국지 충돌 약 ${fmtRiskPct(w.clash30d.point)}`; };
const pctOf = (w: Judged) => (w.proximity ? ` ${w.proximity.index}%` : "");

/** 같은 긴장 단계 안에서 실제 징조·움직임이 나타났을 때 */
export function subMessage(w: Judged, opts?: { dashboardUrl?: string }): PhaseMessage {
  const r = w.proximity!.rubric;
  const what = r.surprise ? `뉴스의 징조는 적은데 사람·돈·군의 측정값 ${r.moves}개가 함께 움직였어요 (기습 주의).` : `전쟁 전 징조가 9개 중 ${r.signs}개로 늘었어요.`;
  return { title: `2단계 긴장${pctOf(w)} · 실제 징조가 나타남`, body: [what, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 3, direction: "up", note: true };
}

/** 마무리 알림: 조용하게(우선순위 2) — 무엇이 가라앉았는지와 지금 숫자 */
export function calmMessage(w: Judged, what: string, why: string, opts?: { dashboardUrl?: string }): PhaseMessage {
  return { title: `${w.phase}단계 ${w.phaseLabel}${pctOf(w)} · ${what}`, body: [why, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 2, direction: "down", note: true };
}

type Prox = NonNullable<WarRisk["proximity"]>;
/**
 * ④ 눈에 띄는 상승과 그 마무리. 단계 알림·징조 알림이 이번에 나가지 않을 때만 부른다.
 * 오름: 지금 % 가 아침 판정보다 5%p 넘게 높고 징조·움직임이 새로 켜져(잡음 제외) 30분 이어짐. 가라앉음: 알릴 때의 기준 + 2%p 안으로 돌아와 6시간 이어짐.
 */
export function decideRise(prev: PhaseNotifyState, w: Judged, morning: Prox | undefined, now: number, opts?: { dashboardUrl?: string }): { state: PhaseNotifyState; message?: PhaseMessage } {
  const idx = w.proximity?.index;
  if (idx === undefined) return { state: prev };
  if (prev.rise) {
    if (now - prev.rise.at > RISE_FORGET_MS) return { state: { ...prev, rise: undefined, riseOff: undefined } };
    if (idx > prev.rise.base + RISE_BACK_PTS) return { state: { ...prev, riseOff: undefined } };
    const since = prev.riseOff ?? now;
    if (now - since < DOWN_HOLD_MS) return { state: { ...prev, riseOff: since } };
    return { state: { ...prev, rise: undefined, riseOff: undefined, riseSeen: undefined }, message: calmMessage(w, "평소 수준으로 돌아왔어요", `앞서 올랐다고 알려 드린 숫자가 ${idx}%로 내려와 6시간 넘게 이어졌어요.`, opts) };
  }
  const r = riseOf(w.proximity, morning);
  if (!r.up) return { state: prev.riseSeen === undefined ? prev : { ...prev, riseSeen: undefined } };
  const since = prev.riseSeen ?? now;
  if (now - since < RISE_HOLD_MS) return { state: { ...prev, riseSeen: since } };
  // 방금(6시간 안) 다른 알림이 갔으면 같은 일을 두 번 알리지 않는다 — 기억도 하지 않아, 마무리 알림만 따로 가는 일이 없게 한다
  if (prev.lastSentAt !== undefined && now - prev.lastSentAt < DOWN_HOLD_MS) return { state: { ...prev, riseSeen: since } };
  const day = kstDay(now), sentToday = prev.sent?.[day] ?? 0;
  if (sentToday >= PHASE_ALERTS_PER_DAY) return { state: { ...prev, riseSeen: since } };
  const base = morning!.rubric?.index ?? morning!.index;
  const names = r.added.slice(0, 2).map((k) => `'${k.split(" (")[0]}'`).join(", ") + (r.added.length > 2 ? ` 등 ${r.added.length}개` : "");
  const message: PhaseMessage = { title: `${w.phase}단계 ${w.phaseLabel} ${idx}% · 오늘 아침 ${base}%에서 올랐어요`, body: [`${names} 항목이 새로 켜졌어요. 단계는 그대로 ${w.phase}단계예요.`, counts(w), "가라앉으면 다시 알려 드려요.", opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 3, direction: "up", note: true };
  return { state: { ...prev, rise: { base, at: now }, riseSeen: undefined, riseOff: undefined, sent: { ...(prev.sent ?? {}), [day]: sentToday + 1 } }, message };
}

/** ③ 큰 사건: 이번 바퀴에 운영자 사건 알림이 나간 북한 발사·포격·핵실험 가운데 하나 (훈련·정정·미확인 제외 — 스레드에 올리는 것과 같은 기준). 하루 한 번 */
export function decideEvent(prev: PhaseNotifyState, w: Judged, report: { alerts: { eventId: string; kind: string; sent: boolean }[]; events: CrisisEvent[] }, now: number, opts?: { dashboardUrl?: string }): { state: PhaseNotifyState; message?: PhaseMessage; eventId?: string } {
  const sentIds = new Set(report.alerts.filter((a) => a.sent && (a.kind === "new" || a.kind === "upgrade")).map((a) => a.eventId));
  const day = kstDay(now), done = prev.evDay === day ? prev.evIds ?? [] : [];
  if (!sentIds.size || done.length >= EVENT_ALERTS_PER_DAY) return { state: prev };
  const pick = report.events.filter((e) => sentIds.has(e.id) && !done.includes(e.id)).map((e) => ({ e, p: postable(e) })).filter((x) => x.p.ok).sort((a, b) => b.e.severity - a.e.severity)[0];
  if (!pick) return { state: prev };
  // 단계가 막 오르는 중이면(확인 대기) 단계 알림이 곧 따로 간다 — 여기서는 '지금은 N단계'라고만 적는다
  const rising = !!prev.pending && prev.pending.phase > prev.phase;
  const line = rising ? `전쟁 위험 단계를 다시 확인하는 중이에요 — 바뀌면 바로 알려 드려요.` : `전쟁 위험 단계는 그대로 ${w.phase}단계 ${w.phaseLabel}예요.`;
  const message: PhaseMessage = {
    title: `${pick.p.headline}${pick.p.unconfirmed ? " (속보·확인 중)" : ""} · ${rising ? "단계 확인 중" : `단계는 그대로 ${w.phase}단계`}`,
    body: [line, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"),
    priority: 3, direction: "up", note: true,
  };
  return { state: { ...prev, evDay: day, evIds: [...done, pick.e.id] }, message, eventId: pick.e.id };
}

/** 주간 요약: 변화가 없어도 한 번 */
export function digestMessage(w: Judged, opts?: { dashboardUrl?: string }): PhaseMessage {
  const d7 = w.proximity?.vs.d7;
  const vs = d7 === undefined ? "지난주 기록은 아직 없어요." : d7 === 0 ? "지난주와 같아요." : `지난주보다 ${Math.abs(d7)}%p ${d7 > 0 ? "높아졌어요" : "낮아졌어요"}.`;
  return { title: `주간 요약 · ${w.phase}단계 ${w.phaseLabel}${pctOf(w)}`, body: [vs, counts(w), opts?.dashboardUrl ? `대시보드 : ${opts.dashboardUrl}` : ""].filter(Boolean).join("\n"), priority: 2, direction: "down" };
}

/** 이번 주 월요일(한국 날짜) — 주간 요약을 보낼 때가 됐으면 그 날짜 */
export function digestDue(state: PhaseNotifyState, now: number, on: boolean = DIGEST_ON): string | undefined {
  if (!on) return undefined;
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
  // ④ 눈에 띄는 상승과 그 마무리 — 단계·징조 알림이 이번에 없고, 단계가 확인 대기 중이 아닐 때만
  if (!message && !state.pending) {
    const offRaw = await store.getKv(OFFICIAL_KEY).catch(() => null);
    const morning = offRaw ? (JSON.parse(offRaw) as { proximity?: Prox }).proximity : undefined;
    const r = decideRise(state, w, morning, now, { dashboardUrl: env.DASHBOARD_URL });
    state = r.state;
    message = r.message;
  }
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
  const report = await (message.note ? addNoteReport(store, w, now, message.title, message.direction, full) : addChangeReport(store, w, prev?.phase ?? w.phase, now, full)).catch(() => undefined);
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

/** ③ 큰 사건을 손님에게: 감시 한 바퀴 뒤, 단계 알림 다음에 부른다. 보내기에 실패하면 그 사건은 다시 보내지 않는다(속보는 늦게 다시 가면 혼란스럽다) */
export async function notifyCustomerEvent(
  store: Store,
  env: PushEnv & { DASHBOARD_URL?: string },
  w: WarRisk,
  report: { alerts: { eventId: string; kind: string; sent: boolean }[]; events: CrisisEvent[] },
  now: number,
  fetchImpl: typeof fetch = fetch,
  full?: Record<string, unknown>,
): Promise<{ sent?: PhaseMessage; ok?: boolean }> {
  if (!report.alerts.some((a) => a.sent)) return {};
  const raw = await store.getKv(PHASE_STATE_KEY);
  if (!raw) return {};
  const prev = JSON.parse(raw) as PhaseNotifyState & { rule?: number };
  // 방금 단계 알림이 갔으면(10분 안) 같은 일로 두 번 울리지 않는다
  if (prev.lastSentAt !== undefined && now - prev.lastSentAt < 10 * 60_000) return {};
  const d = decideEvent(prev, w, report, now, { dashboardUrl: env.DASHBOARD_URL });
  if (!d.message) return {};
  const rep = await addNoteReport(store, w, now, d.message.title, "up", full).catch(() => undefined);
  const url = env.DASHBOARD_URL ? (rep ? `${env.DASHBOARD_URL}/me?r=${rep.id}` : `${env.DASHBOARD_URL}/me`) : undefined;
  const body = url && env.DASHBOARD_URL ? d.message.body.replace(`대시보드 : ${env.DASHBOARD_URL}`, `리포트 : ${url}`) : d.message.body;
  const res = await sendPush(env, { audience: "all", title: d.message.title, body, priority: d.message.priority, url }, fetchImpl, store);
  const ok = res.some((r) => r.ok);
  await store.logAlert({ eventId: `cust:${d.eventId}`, sentAt: now, status: "CONFIRMED", severity: w.phase * 20, title: d.message.title, body: d.message.body, channel: res.map((r) => r.channel).join(","), ok });
  await store.setKv(PHASE_STATE_KEY, JSON.stringify({ ...d.state, lastSentAt: ok ? now : d.state.lastSentAt, rule: prev.rule }));
  return { sent: d.message, ok };
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
