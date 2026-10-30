import type { CollectResult, Env } from "../types.js";
import type { SourceId } from "../sources.js";
import { collectEmsc, collectUsgs } from "./seismic.js";
import { collectSafetyData } from "./safetydata.js";
import { collectNga } from "./nga.js";
import { collectOpenSky } from "./opensky.js";
import { collectAdsb } from "./adsb.js";
import { BREAKING_FEEDS, SLOW_FEEDS, collectGdelt, collectRss } from "./news.js";

export const COLLECTORS: Record<SourceId, (env: Env, now: number) => Promise<CollectResult>> = {
  safetydata: (env, now) => collectSafetyData(env.SAFETYDATA_API_KEY, now),
  usgs: (_e, now) => collectUsgs(now),
  emsc: (_e, now) => collectEmsc(now),
  nga_msi: (_e, now) => collectNga(now),
  adsb_lol: (_e, now) => collectAdsb(now),
  opensky: (env, now) => collectOpenSky({ id: env.OPENSKY_CLIENT_ID, secret: env.OPENSKY_CLIENT_SECRET }, now),
  gdelt: (_e, now) => collectGdelt(now),
  rss_breaking: (_e, now) => collectRss(BREAKING_FEEDS, now, "rss_breaking"),
  rss_news: (_e, now) => collectRss(SLOW_FEEDS, now),
};

/** 모든 수집기를 병렬 실행. 한 소스 실패가 전체를 막지 않는다. */
export async function runCollectors(env: Env, only?: string[], now = Date.now()): Promise<CollectResult[]> {
  const disabled = new Set((env.DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const ids = (Object.keys(COLLECTORS) as SourceId[]).filter((id) => (!only || only.includes(id)) && !disabled.has(id));
  return Promise.all(
    ids.map(async (id) => {
      try {
        return await COLLECTORS[id](env, now);
      } catch (e) {
        return { source: id, ok: false, error: String((e as Error).message ?? e), signals: [], fetchedAt: now, rawCount: 0 };
      }
    }),
  );
}
