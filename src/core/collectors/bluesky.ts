// Bluesky 공개 검색(인증 불필요) — 사이렌·경보·포격 목격담 등 군중 신호.
// 한국 주요 SNS(X·네이버)는 공개 API 가 없으므로 표본이 작다. 단독 근거로 쓰지 않는다.
import type { CollectResult, Metric } from "../types.js";
import { fetchJson } from "../util.js";

export const ALARM_QUERIES = ["공습경보", "경계경보 사이렌", "북한 포격", "북한 미사일 발사", "전투기 굉음 사이렌"];

export interface Post {
  text: string;
  createdAt: number;
  uri: string;
  author: string;
}

export function parseSearch(data: any): Post[] {
  return (data?.posts ?? []).map((p: any) => ({
    text: String(p.record?.text ?? "").slice(0, 300),
    createdAt: Date.parse(p.record?.createdAt ?? p.indexedAt ?? 0),
    uri: p.uri,
    author: p.author?.handle ?? "",
  }));
}

export async function searchPosts(query: string, limit = 50): Promise<Post[]> {
  const data = await fetchJson<any>(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&sort=latest&limit=${limit}`, {}, 20000);
  return parseSearch(data);
}

export function alarmMetric(posts: Post[], now: number, windowMin = 60): Metric {
  const recent = posts.filter((p) => now - p.createdAt < windowMin * 60_000);
  const uniq = new Map(recent.map((p) => [p.uri, p]));
  const sample = [...uniq.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((p) => ({ at: p.createdAt, author: p.author, text: p.text.slice(0, 140) }));
  return { indicator: "social.alarm_posts_1h", value: uniq.size, meta: { sample, queries: ALARM_QUERIES.length } };
}

export async function collectBluesky(now = Date.now()): Promise<CollectResult> {
  const results = await Promise.allSettled(ALARM_QUERIES.map((q) => searchPosts(q, 30)));
  const posts = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length === results.length) throw new Error(String((failed[0] as PromiseRejectedResult).reason).slice(0, 120));
  return { source: "bluesky", ok: true, error: failed.length ? `${failed.length}/${results.length} 질의 실패` : undefined, fetchedAt: now, rawCount: posts.length, signals: [], metrics: [alarmMetric(posts, now)] };
}
