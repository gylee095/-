// 언론(GDELT, RSS) — 알림 트리거가 아니라 교차검증과 '뉴스 대비 리드타임' 측정용
import type { CollectResult, Metric, Signal } from "../types.js";
import { REL_WEIGHT, koreaRelevance } from "../relevance.js";
import { BASE_SEVERITY, OFFICIAL_QUOTE_RE, classifyText, isKoreaContext, isKoreaRelevant, launchTitleKind, securityNews, splitOutlet, worldEvent, worldNews, worldNewsEn } from "../classify.js";
import { fetchJson, fetchText, hash, parseCompactUtc } from "../util.js";

const GDELT_QUERY =
  '("North Korea" OR DPRK OR 북한) (missile OR artillery OR "nuclear test" OR shelling OR 미사일 OR 포격 OR 경계경보)';

export async function searchGdelt(query: string, timespan = "3h", max = 75): Promise<any[]> {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&timespan=${timespan}&maxrecords=${max}&sort=datedesc`;
  // GDELT 는 IP당 5초에 1회 제한, 응답이 느림
  const txt = await fetchText(url, {}, 25000);
  // GDELT는 결과가 없거나 쿼리 오류면 JSON이 아닌 본문을 반환한다
  if (!txt.trim().startsWith("{")) {
    if (txt.trim()) throw new Error(`GDELT: ${txt.trim().slice(0, 200)}`);
    return [];
  }
  return JSON.parse(txt).articles ?? [];
}

export function googleNewsUrl(query: string, lang: "ko" | "en" = "ko") {
  return lang === "ko"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function collectGdelt(now = Date.now()): Promise<CollectResult> {
  const arts = await searchGdelt(GDELT_QUERY);
  return { source: "gdelt", ok: true, fetchedAt: now, rawCount: arts.length, signals: parseGdelt(arts, now) };
}

export function parseGdelt(arts: any[], now: number): Signal[] {
  return arts.flatMap((a) => mediaSignal("gdelt", a.url, a.title, parseCompactUtc(a.seendate ?? ""), now, a.domain));
}

// Google News RSS 는 Cloudflare 서버 접속을 차단(503)하므로 사용하지 않는다
/** 1분마다 확인하는 속보 피드 (연합뉴스: 합참·日방위성 발표를 가장 먼저 [속보]로 전하는 국내 매체) */
export const BREAKING_FEEDS = ["https://www.yna.co.kr/rss/news.xml", "https://www.yna.co.kr/rss/northkorea.xml"];
/**
 * 사건만 받는 목록 (2026-11-17): 군·외교 기사는 연합뉴스 '정치' 목록(외교·국방 포함)에 실리는데 '전체' 목록에서는 몇 시간 만에 밀려난다 —
 * 11/17 "러 군용기 여러 대 새벽 KADIZ 진입"이 오후에는 정치 목록에만 남아 있었다. 여기서 받은 제목은 사건(신호)으로만 쓰고
 * 보도량·수사 지표에는 넣지 않는다(평소 값이 '전체+북한' 두 목록으로 쌓여 있어, 목록을 늘리면 지표가 까닭 없이 오른다).
 */
/**
 * 미국·세계 매체 (2026-11-18 사용자: "CNN·CNBC 같은 미국 매체, 아니면 여러 매체를 모아 주는 곳에서 받아라").
 * 구글 뉴스는 뉴욕타임스·워싱턴포스트·AP·로이터·CNN·BBC 등의 머리기사를 한 목록으로 모아 준다(미국판 종합·세계). NPR·알자지라는 직접.
 * 사건으로만 받고(한반도 보도량 지표에는 넣지 않는다), 여기서 센 '세계의 무력·마비 속보 수'는 배경의 약한 신호 하나로만 쓴다.
 * 15분에 한 번만 받는다 — 5분마다 부를 까닭이 없고 상대 서버에 부담을 주지 않으려고.
 */
export const WORLD_FEEDS = [
  "https://feeds.npr.org/1001/rss.xml",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.cbsnews.com/latest/rss/main",
  "https://abcnews.go.com/abcnews/topstories",
];
export const worldFeedsDue = (now: number) => Math.floor(now / 60_000) % 15 < 5;
export const EVENT_ONLY_FEEDS = ["https://www.yna.co.kr/rss/politics.xml", "https://www.yna.co.kr/rss/international.xml"]; // 국제 목록: 11/18 미 안보국 통신망 마비·이란의 미군기지 공격을 놓쳤다 — 전체 목록에서는 금세 밀려난다
/** 5분마다 확인하는 교차확인용 피드 */
export const SLOW_FEEDS = ["https://www.nknews.org/feed/", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://beyondparallel.csis.org/feed/"];
export const DEFAULT_FEEDS = [...BREAKING_FEEDS, ...SLOW_FEEDS];

/** 기본 피드들의 기사 중 질의어가 하나라도 제목에 포함된 것 */
export async function searchFeeds(query: string, sinceMs: number, feeds = DEFAULT_FEEDS) {
  const terms = query.split(/\s+|,|OR/i).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
  const results = await Promise.allSettled(feeds.map((f) => fetchText(f).then((x) => parseRss(x).map((i) => ({ ...i, feed: new URL(f).hostname })))));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results.flatMap((r, i) => (r.status === "rejected" ? [`${new URL(feeds[i]).hostname}: ${String(r.reason).slice(0, 80)}`] : []));
  const hits = items.filter((i) => (i.pubDate ?? Date.now()) >= sinceMs && terms.some((t) => i.title.toLowerCase().includes(t)));
  return { hits, errors };
}

// 북한 담화·성명류 보도 / 적대 수사 핵심어 (연합뉴스 북한 섹션 제목 기준)
const NK_STATEMENT_RE = /담화|성명|대변인|경고|위협|비난|규탄|맹비난|反발|반발/;
const NK_HOSTILE_RE = /핵\s?(무력|공격|타격|전쟁|보복|사용)|선제|초토화|보복|섬멸|파멸|궤멸|불바다|전면전|전쟁\s?(불사|준비|상태)|적대국|주적|응징|격멸|전술핵|핵탄두/;
const NK_RE = /북한|北|김정은|김여정|평양|조선중앙|노동신문|North Korea|DPRK|Kim Jong/i;
// 한반도 전쟁을 입에 올리는 보도 (역사 기념·다른 나라 전쟁·무역전쟁은 뺀다)
export const WAR_TALK_RE = /전쟁|전면전|확전|선전포고|전시\s?상태|준전시|동원령|대피령|교전|무력\s?충돌/;
const NOT_WAR_TALK_RE = /6[·.]25|한국\s?전쟁\s?(기념|참전|유해|\d+주년)|참전|전쟁기념|정전\s?협정|우크라|러시아|이스라엘|이란|가자|중동|무역\s?전쟁|관세|게임|영화|드라마|웹툰/;
export const isWarTalk = (t: string) => WAR_TALK_RE.test(t) && isKoreaContext(t) && !NOT_WAR_TALK_RE.test(t);
// 접경 사건: 확성기·경고사격·군사분계선 침범·지뢰·풍선·전단·감시초소(GP) 총격 (2026-10-29 '접경지 주민들 아침부터 北확성기 소리'를 놓친 뒤 추가)
export const BORDER_RE = /확성기|경고\s?사격|경고\s?방송|군사분계선|MDL|지뢰|오물\s?풍선|쓰레기\s?풍선|대북\s?전단|전단\s?살포|GP\s?(총격|사격)|총격|월선|침범|포탄\s?(낙하|발견)/;
const NOT_BORDER_RE = /6[·.]25|유해|관광|축제|생태|평화누리|둘레길|다큐|영화|전시회|마라톤|영공\s?침범.*(중국|러시아)|사이버/;
export const isBorderIncident = (t: string) => BORDER_RE.test(t) && isKoreaContext(t) && !NOT_BORDER_RE.test(t);
/** (종합)·(2보) 같은 꼬리표를 떼고 앞부분으로 같은 기사를 한 번만 센다 */
const storyKey = (t: string) => t.replace(/\((종합|\d보)[^)]*\)|\[[^\]]*\]/g, "").replace(/\s+/g, "").slice(0, 18);
/** 같은 기사가 여러 피드(전체·북한 섹션)와 (종합)·N보로 거듭 실린다 — 이야기 하나로 한 번만 센다.
 *  2026-11-01: '北, 전술탄도미사일 집속탄두 위력시험…"13㏊ 초토화"' 한 건이 4건으로 세어져 '적대 수사 이상' → 자동 판정 3단계 오판 */
export function uniqStories<T extends { title: string; pubDate?: number }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) {
    const k = storyKey(i.title);
    const prev = seen.get(k);
    if (!prev || (i.pubDate ?? 0) > (prev.pubDate ?? 0)) seen.set(k, i);
  }
  return [...seen.values()].sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0));
}

/** 최근 기사 제목들에서 언론 템포·북한 수사 지표를 계산한다 */
export function newsMetrics(items: { title: string; pubDate?: number }[], now: number, source: string): Metric[] {
  const day = uniqStories(items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 24 * 3600_000 && NK_RE.test(i.title)));
  const metrics: Metric[] = [];
  if (source === "rss_breaking") {
    const hour = uniqStories(items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 3600_000 && /\[속보\]|\[1보\]/.test(i.title) && NK_RE.test(i.title) && classifyText(i.title)));
    metrics.push({ indicator: "media.breaking_nk_1h", value: hour.length, meta: { titles: hour.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    const statements = day.filter((i) => NK_STATEMENT_RE.test(i.title));
    const hostile = day.filter((i) => NK_HOSTILE_RE.test(i.title));
    metrics.push({ indicator: "rhetoric.nk_statements_24h", value: statements.length, meta: { titles: statements.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    metrics.push({ indicator: "rhetoric.nk_hostile_24h", value: hostile.length, meta: { titles: hostile.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    const warTalk = uniqStories(items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 24 * 3600_000 && isWarTalk(i.title)));
    metrics.push({ indicator: "media.war_talk_24h", value: warTalk.length, meta: { titles: warTalk.slice(0, 5).map((i) => i.title.slice(0, 80)) } });
    const b = uniqStories(items.filter((i) => i.pubDate !== undefined && now - i.pubDate < 72 * 3600_000 && isBorderIncident(i.title)));
    metrics.push({ indicator: "border.incidents_72h", value: b.length, meta: { titles: b.slice(0, 6).map((i) => i.title.slice(0, 80)) } });
  }
  return metrics;
}

/**
 * 김정은의 공개활동 보도인가 (2026-11-18): 지도부가 지하로 들어가는 것은 공개 정보로 알 수 없지만, 며칠째 공개 석상에 안 나왔는지는 보도로 셀 수 있다.
 * 직접 나타난 활동(시찰·참석·참관·연설·접견·회담·주재)만 — 축전·서한·담화처럼 글로만 나온 것과 남이 김정은을 언급한 기사는 아니다.
 */
export const KIM_ACTIVITY_RE = /^(?:\[[^\]]*\]\s*)?(?:北\s?)?김정은,\s?[^"“]{0,60}?(시찰|참석|참관|연설|접견|회담|주재|관람|현지\s?지도|방문|시험\s?지도|기념사진)/;
export const isKimActivity = (title: string) => KIM_ACTIVITY_RE.test(title) && !/축전|서한|친서|조전|위문전문/.test(title);
/** 목록에서 가장 최근의 김정은 공개활동 보도 시각 */
export const kimSeenAt = (items: { title: string; pubDate?: number }[]): number | undefined => items.filter((i) => i.pubDate !== undefined && isKimActivity(i.title)).reduce<number | undefined>((m, i) => (m === undefined || i.pubDate! > m ? i.pubDate : m), undefined);

export async function collectRss(feeds = DEFAULT_FEEDS, now = Date.now(), source = "rss_news", eventOnly: string[] = [], world: string[] = []): Promise<CollectResult & { kimSeenAt?: number }> {
  const signals: Signal[] = [];
  const all: { title: string; pubDate?: number }[] = [];
  let rawCount = 0;
  const errors: string[] = [];
  for (const f of feeds) {
    try {
      const items = parseRss(await fetchText(f));
      rawCount += items.length;
      all.push(...items);
      for (const it of items) signals.push(...mediaSignal(source, it.link, it.title, it.pubDate, now));
    } catch (e) {
      errors.push(String(e));
    }
  }
  // 사건만 받는 목록: 같은 기사(주소)는 한 번만. 실패해도 수집 전체를 실패로 보지 않는다
  const seen = new Set(signals.map((x) => x.id));
  for (const f of eventOnly) {
    try {
      const items = parseRss(await fetchText(f));
      rawCount += items.length;
      for (const it of items) for (const sg of mediaSignal(source, it.link, it.title, it.pubDate, now)) if (!seen.has(sg.id)) { seen.add(sg.id); signals.push(sg); }
    } catch {
      /* 덤으로 받는 목록 */
    }
  }
  const metrics = newsMetrics(all, now, source);
  // 세계의 무력·마비 속보 수 (24시간, 같은 이야기는 한 번): 세계 매체 목록을 받은 바퀴에만 낸다
  if (world.length) {
    const seenStory = new Set<string>(), stories: { t: string; rel: number }[] = [];
    let got = 0;
    const failed: string[] = [];
    for (const f of world) {
      try {
        const items = parseRss(await fetchText(f));
        got++;
        rawCount += items.length;
        for (const it of items) {
          const sigs = mediaSignal(source, it.link, it.title, it.pubDate, now);
          for (const sg of sigs) if (!seen.has(sg.id)) { seen.add(sg.id); signals.push(sg); }
          if (sigs.length && it.pubDate !== undefined && now - it.pubDate < 24 * 3600_000 && (sigs[0].category === "security_news" || sigs[0].category === "world_event")) {
            const k = sigs[0].title.toLowerCase().replace(/[^a-z0-9가-힣]/g, "").slice(0, 24);
            // 한반도 연관도로 무게를 단다 (11/18 사용자: "한반도에 영향을 많이 주는 속보가 많을수록 신호에 더 영향") — 무관(0)은 세지 않는다
            const rel = koreaRelevance(sigs[0].title, [sigs[0].category]);
            if (rel > 0 && !seenStory.has(k)) { seenStory.add(k); stories.push({ t: sigs[0].title.slice(0, 90), rel }); }
          }
        }
      } catch (e) {
        failed.push(`${new URL(f).hostname} ${String((e as Error)?.message ?? e).slice(0, 40)}`); // 어느 매체가 왜 안 받아졌는지 남긴다 (서버 망에서만 막히는 곳이 있다)
      }
    }
    if (got) metrics.push({ indicator: "media.world_alarm_24h", value: stories.reduce((a, x) => a + REL_WEIGHT[x.rel as 1 | 2 | 3], 0), meta: { n: stories.length, near: stories.filter((x) => x.rel >= 2).length, titles: [...stories].sort((a, b) => b.rel - a.rel).slice(0, 8).map((x) => x.t), feeds: got, ...(failed.length ? { failed } : {}) } });
  }
  return { source, ok: errors.length < feeds.length, error: errors.join("; ") || undefined, fetchedAt: now, rawCount, signals, metrics, kimSeenAt: kimSeenAt(all) };
}

export function parseRss(xml: string): { title: string; link: string; pubDate?: number }[] {
  const items: { title: string; link: string; pubDate?: number }[] = [];
  const decode = (s: string) =>
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'").trim();
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "");
    const link = decode(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? "");
    const pd = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1];
    items.push({ title, link, pubDate: pd ? Date.parse(pd.trim()) : undefined });
  }
  return items;
}

function outletOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

// 철수·후송 보도에서 공식 발표로 보는 출처 (미·일 정부, 주한미군, 대사관, 외교부)
const EVAC_OFFICIAL_RE = /국무부|대사관|주한미군|외무성|외교부|백악관|USFK|State Department|Embassy|White House|Pentagon/i;

function mediaSignal(source: string, url: string, title: string, published: number | undefined, now: number, domain?: string): Signal[] {
  if (!title) return [];
  // 영어권 세계 속보 (11/18): 기반시설 마비는 세계 정세 사건으로, 무력 사건은 '분류 전' 소식으로 — 한반도와의 관계는 분석관이 판단한다
  const en = worldNewsEn(title);
  if (en) {
    const sp = splitOutlet(title), out = sp.outlet ?? domain ?? outletOf(url, source);
    return [{ id: `${source}:${hash(url || title)}`, source, sourceKind: "media", category: en === "infra" ? "world_event" : "security_news", title: sp.title.slice(0, 140), summary: `${out} · 세계${en === "infra" ? " 정세" : " · 분류 전"}`, url, eventTime: undefined, publishedTime: published, detectedTime: now, severity: en === "infra" ? BASE_SEVERITY.world_event : 20 }];
  }
  // 세계 정세 사건은 한반도 거름망과 따로 잡는다 — 참고로만 (알림 없음, 심각도 낮게)
  if (worldEvent(title))
    return [{ id: `${source}:${hash(url || title)}`, source, sourceKind: "media", category: "world_event", title: title.slice(0, 120), summary: `${domain ?? outletOf(url, source)} · 세계 정세`, url, eventTime: undefined, publishedTime: published, detectedTime: now, severity: BASE_SEVERITY.world_event }];
  const cls = classifyText(title);
  if (!cls || cls.category === "civil_alert_other") {
    // 정해 둔 종류에 없는 군사·안보 소식: 버리지 않고 받아 둔다 — 중요한지는 AI 분석관이 판단한다 (11/17). 군 당국 발표를 인용한 것은 조금 더 무겁게
    const sec = securityNews(title);
    // 세계의 무력 사건: 분류 전 소식으로 받아 두고 분석관이 한반도와의 관계를 판단한다 (11/18)
    if (!sec && worldNews(title))
      return [{ id: `${source}:${hash(url || title)}`, source, sourceKind: "media", category: "security_news", title: title.slice(0, 120), summary: `${domain ?? outletOf(url, source)} · 세계 · 분류 전`, url, eventTime: undefined, publishedTime: published, detectedTime: now, severity: 20 }];
    if (!sec) return [];
    return [{ id: `${source}:${hash(url || title)}`, source, sourceKind: "media", category: "security_news", title: title.slice(0, 120), summary: `${domain ?? outletOf(url, source)}${sec.official ? " · 공식발표 인용" : ""} · 분류 전`, url, eventTime: undefined, publishedTime: published, detectedTime: now, severity: sec.official ? 40 : BASE_SEVERITY.security_news }];
  }
  // 철수·후송·경보 단어는 분류기가 한국 맥락을 이미 확인했다 (제목에 '북한'이 없어도 된다)
  if (cls.category !== "evacuation" && cls.category !== "posture" && cls.category !== "air_incursion" && !isKoreaRelevant(title)) return []; // KADIZ 규칙은 한국 것임을 이미 확인한다
  // 경보 단어 중 군·정부의 태세 변화는 그 자체가 공식 조치다 (돈·사람이 빠지는 행동은 기업 발표라 언론 단독으로 둔다)
  const officialPosture = cls.category === "posture" && !/airlines_suspend|war_insurance|firms_evacuate/.test(cls.tripwire ?? "");
  // 지난 발사를 두고 하는 후속·해설·반응 기사(합참 "北발사체 모두 공지하진 않아…")는 합참을 인용해도 '공식 발사 발표'가 아니다 —
  // 그대로 두면 [속보] 꼬리표 하나로 '발사' 푸시가 나갈 수 있다 (2026-11-02)
  const meta = (cls.category === "missile" || cls.category === "artillery") && launchTitleKind(title) === "meta";
  const citesOfficial = !meta && (OFFICIAL_QUOTE_RE.test(title) || (cls.category === "evacuation" && EVAC_OFFICIAL_RE.test(title)) || officialPosture);
  const breaking = /\[속보\]|\[1보\]|BREAKING|FLASH/i.test(title);
  const outlet = domain ?? outletOf(url, source);
  return [
    {
      id: `${source}:${hash(url || title)}`,
      source,
      sourceKind: "media",
      category: cls.category,
      title: title.slice(0, 120),
      summary: `${outlet}${citesOfficial ? " · 공식발표 인용" : meta ? " · 후속·해설" : ""}`,
      url,
      eventTime: undefined,
      publishedTime: published,
      detectedTime: now,
      // 공식발표 인용 보도만 사건 심각도에 반영한다 (그 외 언론은 교차검증·리드타임 측정용)
      // 철수·후송 보도는 공식 인용이 없어도 알린다('미확인' 표기) — 놓치는 쪽이 더 비싸다. 단 전쟁 판정은 '주의'까지만 올린다(warrisk)
      severity: citesOfficial ? cls.severity : cls.category === "evacuation" || cls.category === "posture" ? Math.min(cls.severity, 85) : Math.min(cls.severity, 20),
      ...(cls.tripwire ? { tripwire: cls.tripwire } : {}),
      citesOfficial,
      breaking,
      drill: cls.drill,
      retraction: cls.retraction,
    },
  ];
}
