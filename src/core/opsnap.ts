// 운영자 알림의 '그때 화면' (2026-11-06 사용자 결정): 운영자도 손님과 똑같이 — 알림을 누르면 알림 목록(/me)을 거쳐 그 알림을 보낸
// 순간에 얼린 대시보드 전체(/ops/r/<id>?s=<서명>)가 열리고, 거기서 '← 알림 목록으로'. 실시간 대시보드는 알림 목록의 운영자 전용 버튼으로만.
// 서명은 운영자 비밀값으로만 만들 수 있어 남이 번호를 바꿔 다른 화면을 열 수 없다.
import { saveFull } from "./reports.js";

type KvStore = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };
/** 그 순간의 대시보드 전체를 만드는 함수 — Worker 가 등록한다(buildState → freezeState). 등록이 없으면(로컬 MCP 등) 실시간 링크 그대로 */
export type OpsSnapshotMaker = (store: unknown, env: unknown) => Promise<Record<string, unknown>>;
let maker: OpsSnapshotMaker | undefined;
export function setOpsSnapshotMaker(fn: OpsSnapshotMaker | undefined): void {
  maker = fn;
}

export const OPSNAP_PREFIX = "opsnap:";
export const OPSNAP_LIST = "opsnap:list";
export interface OpsSnapItem { id: string; at: number; title: string }

export async function snapSig(secret: string, id: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`snap:${id}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 지금 화면을 얼려 저장하고 그 화면의 링크를 돌려준다 */
export async function makeOpsSnapshot(store: KvStore, env: { KEW_SECRET?: string; DASHBOARD_URL?: string }, title: string, now: number): Promise<string | undefined> {
  if (!maker || !env.KEW_SECRET || !env.DASHBOARD_URL) return undefined;
  const full = await maker(store, env);
  const id = `o_${now.toString(36)}_${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  await saveFull(store, id, full);
  await store.setKv(OPSNAP_PREFIX + id, JSON.stringify({ at: now, title }));
  const list = await loadOpsSnaps(store);
  list.push({ id, at: now, title });
  await store.setKv(OPSNAP_LIST, JSON.stringify(list.slice(-300)));
  return `${env.DASHBOARD_URL}/me?r=${id}&s=${await snapSig(env.KEW_SECRET, id)}`;
}

export async function loadOpsSnaps(store: KvStore): Promise<OpsSnapItem[]> {
  const raw = await store.getKv(OPSNAP_LIST);
  return raw ? (JSON.parse(raw) as OpsSnapItem[]) : [];
}

/** 운영자 알림 메시지의 실시간 링크(…/ops, …/ops#사건)를 그때 화면 링크로 바꾼다. 본문 속 링크도 같이 */
export function pointToSnapshot<T extends { url?: string; body: string }>(msg: T, base: string, snap: string): T {
  const old = msg.url ?? "";
  const url = snap;
  const MARK = "\u0000";
  let body = msg.body;
  if (old) body = body.split(old).join(MARK);
  body = body.split(`${base}/ops`).join(MARK).split(MARK).join(url).replace(`대시보드 : ${url}`, `알림 보기 : ${url}`);
  return { ...msg, url, body };
}
