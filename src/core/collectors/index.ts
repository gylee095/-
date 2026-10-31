import type { CollectResult, Env } from "../types.js";
import type { SourceId } from "../sources.js";
import { collectEmsc, collectUsgs } from "./seismic.js";
import { collectSafetyData } from "./safetydata.js";
import { collectNga } from "./nga.js";
import { collectOpenSky } from "./opensky.js";
import { collectAdsb } from "./adsb.js";
import { BREAKING_FEEDS, SLOW_FEEDS, collectGdelt, collectRss } from "./news.js";
import { collectTravel } from "./travel.js";
import { collectKoreaKrMnd } from "./koreakr.js";
import { collectMarkets } from "./markets.js";
import { collectIoda } from "./ioda.js";
import { collectBluesky } from "./bluesky.js";
import { collectGpsjam } from "./gpsjam.js";
import { collectAis } from "./ais.js";
import { collectFirms } from "./firms.js";
import { collectGfw } from "./gfw.js";

/** 수집기가 이전 상태를 기억해야 할 때 쓰는 최소 저장소 */
export interface CollectorKv {
  getKv(k: string): Promise<string | undefined>;
  setKv(k: string, v: string): Promise<void>;
}

export type Collector = (env: Env, now: number, kv?: CollectorKv) => Promise<CollectResult>;

export const COLLECTORS: Record<SourceId, Collector> = {
  safetydata: (env, now) => collectSafetyData(env.SAFETYDATA_API_KEY, now),
  usgs: (_e, now) => collectUsgs(now),
  emsc: (_e, now) => collectEmsc(now),
  nga_msi: (_e, now) => collectNga(now),
  adsb_lol: (_e, now) => collectAdsb(now),
  opensky: (env, now) => collectOpenSky({ id: env.OPENSKY_CLIENT_ID, secret: env.OPENSKY_CLIENT_SECRET }, now),
  gdelt: (_e, now) => collectGdelt(now),
  rss_breaking: (_e, now) => collectRss(BREAKING_FEEDS, now, "rss_breaking"),
  rss_news: (_e, now) => collectRss(SLOW_FEEDS, now),
  travel: async (_e, now, kv) => {
    const prev = kv ? await kv.getKv("travel:us_level") : undefined;
    const r = await collectTravel(prev !== undefined ? Number(prev) : undefined, now);
    if (kv && r.usLevel !== undefined) await kv.setKv("travel:us_level", String(r.usLevel));
    return r;
  },
  korea_kr_mnd: (_e, now) => collectKoreaKrMnd(now),
  markets: (_e, now) => collectMarkets(now),
  ioda: (_e, now) => collectIoda(now),
  bluesky: (_e, now) => collectBluesky(now),
  gpsjam: (_e, now) => collectGpsjam(now),
  aisstream: (env, now) => collectAis(env.AISSTREAM_API_KEY, now),
  firms: (env, now) => collectFirms(env.FIRMS_MAP_KEY, now),
  gfw: (env, now) => collectGfw(env.GFW_API_TOKEN, now),
};

/** 모든 수집기를 병렬 실행. 한 소스 실패가 전체를 막지 않는다. */
export async function runCollectors(env: Env, only?: string[], now = Date.now(), kv?: CollectorKv): Promise<CollectResult[]> {
  const disabled = new Set((env.DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const ids = (Object.keys(COLLECTORS) as SourceId[]).filter((id) => (!only || only.includes(id)) && !disabled.has(id));
  return Promise.all(
    ids.map(async (id) => {
      try {
        return await COLLECTORS[id](env, now, kv);
      } catch (e) {
        return { source: id, ok: false, error: String((e as Error).message ?? e), signals: [], fetchedAt: now, rawCount: 0 };
      }
    }),
  );
}
