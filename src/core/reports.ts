// 고객 리포트 (2026-11-05): 결제한 사람은 대시보드를 아무 때나 보지 않는다. 단계가 바뀐 순간의 판정을 '리포트'로 얼려 두고,
// 그 알림이 날짜별로 알림함에 쌓인다. 결제 직후에는 '가입 시점 리포트' 한 장을 바로 준다(빈 화면 방지).
// 이유(사용자): 아무 때나 열어 보게 하면 "별로네"가 쌓여 환불로 간다. 4,900원이 "괜찮네"로 느껴지려면 울릴 때 확실한 한 장이 낫다.
import type { Store } from "./store.js";
import { fmtRiskPct, type WarRisk } from "./warrisk.js";

export const REPORTS_KEY = "reports:list";
export const CURRENT_KEY = "reports:current";
export const MAX_REPORTS = 500;

const NAMES = ["", "평온", "긴장", "위기", "임박", "교전"] as const;

/** 단계마다 지금 할 일 — 운영자 대시보드의 '지금 할 일'과 같은 문장 */
export const PHASE_TODO: Record<number, string> = {
  1: "평소대로 지내면 됩니다.",
  2: "평소대로 지내면 됩니다. 시간이 날 때 가까운 대피소 위치만 확인해 두세요.",
  3: "비상용품(물·약·손전등·보조배터리)과 가족 연락 방법을 확인하고, 재난문자 수신을 켜 두세요.",
  4: "정부·지자체 안내를 따르고 대피소와 이동 경로를 확인하세요.",
  5: "재난문자·민방위 경보에 따라 바로 대피하세요.",
};

export interface Band { low: number; high: number; point: number }

export interface Report {
  id: string;
  at: number;
  /** change: 단계가 바뀌어 알린 것 · snapshot: 결제 시점의 현재 상황 */
  kind: "change" | "snapshot";
  phase: number;
  phaseLabel: string;
  from?: number;
  direction?: "up" | "down";
  /** 알림함 목록 한 줄 — 무엇이 바뀌었나 */
  headline: string;
  clash: Band;
  war: Band;
  usualClash: number;
  vsUsual: number;
  /** 사람이 읽는 확률 문장 (확률 표기 정본 fmtRiskPct) */
  odds: string;
  why: string[];
  domains: { label: string; levelLabel: string; drivers: string[] }[];
  watch: string[];
  restraints: string[];
  todo: string;
}

export type ReportSummary = Pick<Report, "id" | "at" | "kind" | "phase" | "phaseLabel" | "headline" | "direction">;

type RiskLike = Pick<WarRisk, "phase" | "phaseLabel" | "phaseReasons" | "clash30d" | "war30d" | "usual" | "vsUsual" | "domains" | "tripwires" | "restraints">;

const round1 = (x: number) => Math.round(x * 10) / 10;
const band = (b: Band): Band => ({ low: round1(b.low), high: round1(b.high), point: round1(b.point) });

/** "앞으로 30일 안 국지 충돌 약 15% (평소 약 2%의 8배) · 전면전 약 1% 미만" */
export function oddsText(w: Pick<RiskLike, "clash30d" | "war30d" | "usual" | "vsUsual">): string {
  const r = w.vsUsual ?? w.clash30d.point / w.usual.clash;
  const vs = r < 1.15 ? "평소 수준" : `평소 약 ${fmtRiskPct(w.usual.clash)}의 ${r < 10 ? +r.toFixed(1) : Math.round(r)}배`;
  return `앞으로 30일 안 국지 충돌 약 ${fmtRiskPct(w.clash30d.point)} (${vs}) · 전면전 약 ${fmtRiskPct(w.war30d.point)}`;
}

/** 판정 하나를 리포트로 얼린다 (나중에 규칙이 바뀌어도 그날 받은 내용은 그대로) */
export function reportFromRisk(w0: RiskLike, now: number, kind: Report["kind"], from?: number): Report {
  const w = { ...w0, war30d: w0.war30d ?? { low: 0, high: 0, point: 0 }, domains: w0.domains ?? [], tripwires: w0.tripwires ?? [], restraints: w0.restraints ?? [], phaseReasons: w0.phaseReasons ?? [], vsUsual: w0.vsUsual ?? w0.clash30d.point / w0.usual.clash };
  const direction = from !== undefined && from !== w.phase ? (w.phase > from ? "up" : "down") : undefined;
  const name = `${w.phase}단계 ${w.phaseLabel}`;
  const headline =
    kind === "snapshot"
      ? `가입 시점 상황: ${name}`
      : direction
        ? `${direction === "up" ? "⬆ 나빠짐" : "⬇ 좋아짐"}: ${from}단계 ${NAMES[from!] ?? ""} → ${name}`
        : `● 변화 없음: ${name}`;
  return {
    id: "",
    at: now,
    kind,
    phase: w.phase,
    phaseLabel: w.phaseLabel,
    from,
    direction,
    headline,
    clash: band(w.clash30d),
    war: band(w.war30d),
    usualClash: round1(w.usual.clash),
    vsUsual: Math.round(w.vsUsual * 10) / 10,
    odds: oddsText(w),
    why: w.phaseReasons.slice(0, 4),
    domains: w.domains.filter((d) => d.level > 0 && d.drivers.length).slice(0, 6).map((d) => ({ label: d.label, levelLabel: d.levelLabel, drivers: d.drivers.slice(0, 2).map((x) => x.split(" — ")[0]) })),
    watch: w.tripwires.slice(0, 3),
    restraints: w.restraints.slice(0, 3),
    todo: PHASE_TODO[w.phase] ?? PHASE_TODO[1],
  };
}

/** 내용이 같은지 (같은 상황을 두 장 만들지 않으려고) — 시각·번호를 뺀 핵심 */
const contentKey = (r: Report) => JSON.stringify([r.kind, r.phase, r.from, r.clash.point, r.why]);

const newId = (now: number) => `r_${now.toString(36)}_${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

export async function loadReports(store: Pick<Store, "getKv">): Promise<Report[]> {
  const raw = await store.getKv(REPORTS_KEY);
  return raw ? (JSON.parse(raw) as Report[]) : [];
}

async function appendReport(store: Pick<Store, "getKv" | "setKv">, r: Report): Promise<Report> {
  const list = await loadReports(store);
  const saved = { ...r, id: newId(r.at) };
  list.push(saved);
  await store.setKv(REPORTS_KEY, JSON.stringify(list.slice(-MAX_REPORTS)));
  return saved;
}

// ── 대시보드 전체를 얼린다 (11/5): 리포트 목록 한 줄(요약)과 별개로, 그 순간의 대시보드 상태 전체를 따로 저장한다.
//    고객은 리포트를 열면 처음부터 보던 대시보드를 그 시각 그대로 본다. 운영자 전용(알림 기록·사용량·저장소·알림 상태)은 뺀다.
export const FULL_PREFIX = "report:full:";
const OPERATOR_ONLY = ["alerts", "usage", "storage", "phaseNotify", "setup", "deepBudget"];

/** buildState 결과에서 운영자 전용을 뺀 사본 */
export function freezeState(st: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st)) if (!OPERATOR_ONLY.includes(k)) out[k] = v;
  return out;
}

export async function saveFull(store: Pick<Store, "setKv">, id: string, full: Record<string, unknown>): Promise<void> {
  await store.setKv(FULL_PREFIX + id, JSON.stringify(full));
}

export async function loadFull(store: Pick<Store, "getKv">, id: string): Promise<Record<string, unknown> | undefined> {
  const raw = await store.getKv(FULL_PREFIX + id);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
}

/** 5분마다: 지금 판정을 '현재 상황'으로 덮어 둔다 (결제 순간 첫 리포트를 무거운 계산 없이 꺼내려고) */
export async function saveCurrent(store: Pick<Store, "setKv">, w: RiskLike, now: number): Promise<void> {
  await store.setKv(CURRENT_KEY, JSON.stringify(reportFromRisk(w, now, "snapshot")));
}

/**
 * 단계 알림을 보낼 때: 그 순간의 리포트를 남긴다. 보내기가 실패해 다음 주기에 다시 보내도(최대 세 번) 같은 변화는 한 장만.
 */
export async function addChangeReport(store: Pick<Store, "getKv" | "setKv">, w: RiskLike, from: number, now: number, full?: Record<string, unknown>): Promise<Report> {
  const list = await loadReports(store);
  const last = [...list].reverse().find((r) => r.kind === "change");
  if (last && last.from === from && last.phase === w.phase && now - last.at < 60 * 60_000) return last;
  const r = await appendReport(store, reportFromRisk(w, now, "change", from));
  if (full) await saveFull(store, r.id, full);
  return r;
}

/**
 * 결제 순간의 첫 리포트: 5분마다 덮어 둔 현재 상황을 한 장으로 남긴다. 직전 가입 리포트와 내용이 같으면 그것을 같이 쓴다.
 * 현재 상황이 아직 없으면(배포 직후 몇 분) undefined — 알림함은 "곧 첫 리포트가 들어옵니다"를 보여 준다.
 */
export async function snapshotForPurchase(store: Pick<Store, "getKv" | "setKv">, now: number, full?: Record<string, unknown>): Promise<Report | undefined> {
  const raw = await store.getKv(CURRENT_KEY);
  if (!raw) return undefined;
  const cur = { ...(JSON.parse(raw) as Report), at: now };
  const list = await loadReports(store);
  const last = [...list].reverse().find((r) => r.kind === "snapshot");
  // 같은 내용의 가입 리포트를 함께 쓰려면 그 장에 대시보드 전체가 있어야 한다 (없으면 새로 한 장)
  if (last && contentKey(last) === contentKey(cur) && now - last.at < 24 * 3600_000 && (!full || (await store.getKv(FULL_PREFIX + last.id)))) return last;
  const r = await appendReport(store, cur);
  if (full) await saveFull(store, r.id, full);
  return r;
}

/** 이 구매자가 볼 수 있는 리포트: 결제 시점 리포트 + 결제 뒤에 생긴 단계 변화 리포트 (최신이 위) */
export function visibleReports(all: Report[], paidAt: number, startReportId?: string): Report[] {
  return all.filter((r) => r.id === startReportId || (r.kind === "change" && r.at >= paidAt)).sort((a, b) => b.at - a.at);
}

export const summarize = (r: Report): ReportSummary => ({ id: r.id, at: r.at, kind: r.kind, phase: r.phase, phaseLabel: r.phaseLabel, headline: r.headline, direction: r.direction });
