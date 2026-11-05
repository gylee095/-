// 운영자 알림의 '그때 화면' (2026-11-06 사용자 결정): 운영자 알림을 누르면 실시간 대시보드가 아니라, 알림을 보낸 그 순간에 얼린
// 대시보드 전체가 열린다 — 손님 리포트와 같은 방식. 실시간은 /ops 로 직접 들어갈 때만.
// 링크는 /ops/r/<id>?s=<서명>. 서명은 운영자 비밀값으로만 만들 수 있어 남이 번호를 바꿔 다른 화면을 열 수 없다.
import { saveFull } from "./reports.js";

type KvStore = { getKv(k: string): Promise<string | undefined>; setKv(k: string, v: string): Promise<void> };
/** 그 순간의 대시보드 전체를 만드는 함수 — Worker 가 등록한다(buildState → freezeState). 등록이 없으면(로컬 MCP 등) 실시간 링크 그대로 */
export type OpsSnapshotMaker = (store: unknown, env: unknown) => Promise<Record<string, unknown>>;
let maker: OpsSnapshotMaker | undefined;
export function setOpsSnapshotMaker(fn: OpsSnapshotMaker | undefined): void {
  maker = fn;
}

export const OPSNAP_PREFIX = "opsnap:";

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
  return `${env.DASHBOARD_URL}/ops/r/${id}?s=${await snapSig(env.KEW_SECRET, id)}`;
}

/** 운영자 알림 메시지의 실시간 링크(…/ops, …/ops#사건)를 그때 화면 링크로 바꾼다. 본문 속 링크도 같이 */
export function pointToSnapshot<T extends { url?: string; body: string }>(msg: T, base: string, snap: string): T {
  const old = msg.url ?? "";
  const hash = old.includes("#") ? old.slice(old.indexOf("#")) : "";
  const url = snap + hash;
  const MARK = "\u0000";
  let body = msg.body;
  if (old) body = body.split(old).join(MARK);
  body = body.split(`${base}/ops`).join(MARK).split(MARK).join(url).replace(`대시보드 : ${url}`, `그때 화면 : ${url}`);
  return { ...msg, url, body };
}
