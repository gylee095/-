// 정책브리핑(korea.kr) 국방부 보도자료 — 자동 접근이 가능한 유일한 국방부 공식 채널.
// 합참 기자단 문자보다 수 시간 늦지만 '정부 공식 확인'으로 쓴다.
import type { CollectResult, Metric, Signal } from "../types.js";
import { classifyText } from "../classify.js";
import { fetchText } from "../util.js";

export const MND_LIST_URL = "https://www.korea.kr/briefing/pressReleaseList.do?repCodeType=&repCode=A00005&pageIndex=1";

export interface PressRelease {
  newsId: string;
  title: string;
  date?: number; // KST 자정 기준 epoch
  dept?: string;
  url: string;
}

export function parseMndList(html: string): PressRelease[] {
  const out: PressRelease[] = [];
  const re = /<a href="\/briefing\/pressReleaseView\.do\?newsId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, "\n").split("\n").map((s) => decode(s.trim())).filter(Boolean);
    if (!text.length) continue;
    // 첫 줄이 제목, 그 뒤는 본문 요약
    const title = text[0];
    // 날짜·부처는 같은 <a> 안의 <span class="source"> 에 요소 텍스트로 들어 있다 (링크 파라미터의 startDate 와 혼동하지 않도록 >…< 형태만 본다)
    const inner = m[2];
    const d = />\s*(\d{4})-(\d{2})-(\d{2})\s*</.exec(inner);
    const dept = text.find((t) => /^(국방부|합동참모본부|방위사업청|병무청)$/.test(t));
    if (out.some((x) => x.newsId === m![1])) continue;
    out.push({
      newsId: m[1],
      title,
      date: d ? Date.UTC(+d[1], +d[2] - 1, +d[3]) - 9 * 3600_000 : undefined,
      dept,
      url: `https://www.korea.kr/briefing/pressReleaseView.do?newsId=${m[1]}`,
    });
  }
  return out;
}

function decode(s: string): string {
  return s.replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x3147;/g, "ㅇ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
}

export function mndSignals(items: PressRelease[], now: number): { signals: Signal[]; metrics: Metric[] } {
  const signals: Signal[] = [];
  let recent = 0;
  let provocation = 0;
  for (const it of items) {
    const within24h = it.date !== undefined && now - it.date < 36 * 3600_000; // 날짜만 있으므로 여유를 둔다
    if (within24h) recent++;
    const cls = classifyText(it.title);
    if (!cls || cls.category === "civil_alert_other") continue;
    if (within24h) provocation++;
    signals.push({
      id: `korea_kr_mnd:${it.newsId}`,
      source: "korea_kr_mnd",
      sourceKind: "official",
      category: cls.category,
      title: `[국방부 보도자료] ${it.title.slice(0, 90)}`,
      summary: `${it.dept ?? "국방부"} · 정책브리핑 게재 · 키워드='${cls.matched}'`,
      url: it.url,
      eventTime: undefined,
      // 날짜만 제공되므로 공개 시각은 해당일 자정(KST)으로 두고 감지 시각을 상한으로 본다
      publishedTime: it.date,
      detectedTime: now,
      severity: Math.min(cls.severity, 80),
      drill: cls.drill,
      retraction: cls.retraction,
    });
  }
  return {
    signals,
    metrics: [
      { indicator: "official.mnd_releases_24h", value: recent },
      { indicator: "official.mnd_provocation_24h", value: provocation },
    ],
  };
}

export async function collectKoreaKrMnd(now = Date.now()): Promise<CollectResult> {
  const html = await fetchText(MND_LIST_URL, {}, 25000);
  const items = parseMndList(html);
  const { signals, metrics } = mndSignals(items, now);
  return { source: "korea_kr_mnd", ok: items.length > 0, error: items.length ? undefined : "목록 파싱 실패(페이지 구조 변경?)", fetchedAt: now, rawCount: items.length, signals, metrics };
}
