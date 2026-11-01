// 항행경보 — 미국 NGA MSI(HYDROPAC 등) + 일본 해상보안청 NAVAREA XI. 발사 예고·사격 구역·GPS 교란 항행경보는 '선행 신호'다.
// 북한은 위성 발사 며칠 전 낙하 예상 구역을 NAVAREA XI 조정국(일본 해상보안청)에 통보해 왔다(2023년 5·8·11월: 서해 남서쪽 2곳 + 루손섬 동쪽 1곳).
// NGA 재배포 자료에는 2024년 이후 일본 경보가 들어오지 않아(2026-10-31 점검) 해상보안청 원문을 직접 읽는다 (2026-11-01).
import type { CollectResult, Metric, Signal } from "../types.js";
import type { CollectorKv } from "./index.js";
import { classifyText } from "../classify.js";
import { USER_AGENT, fetchJson, parseDtg } from "../util.js";

export async function fetchNgaWarnings(): Promise<any[]> {
  const data = await fetchJson<any>("https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A");
  return data["broadcast-warn"] ?? [];
}

/** 지표용 '한반도 주변' 판정은 신호용(isKoreaRelevant)보다 좁다 — 일본 열도 일반 경보는 제외 */
const KOREA_WATERS_RE = /KOREA|DPRK|YELLOW SEA|SEA OF JAPAN|EAST SEA|TSUSHIMA|KOREA STRAIT|PYONGYANG/i;

/** 한반도 관련 유효 경보 수와 발사 예고 경보 수 — 180일 넘은 경보는 뺀다(취소되지 않은 채 '유효'로 남은 2021~2024년 경보가 있다) */
export function navwarnMetrics(rows: any[], now = Date.now()): Metric[] {
  const fresh = rows.filter((r) => {
    const t = r.issued ?? parseDtg(String(r.issueDate ?? ""));
    return t === undefined || now - t < 180 * 86400_000;
  });
  // 해상보안청·NGA 경보 모두 같은 판정: 한반도 주변 바다인가(지역명·좌표), 발사 경보인가, 북한 발사로 볼 만한가(북한 이름·낙하 구역)
  const rated = fresh.map((r) => ({ r, a: (r.jcg as JcgAssessment | undefined) ?? assessText(String(r.text ?? ""), String(r.title ?? "")) }));
  const korea = rated.filter((x) => x.a.korea);
  // 중국이 서해(산둥 앞바다)에서 쏘는 로켓도 '서해 발사 경보'로 나온다 — 북한으로 볼 만한 것만 '발사 예고'로 센다
  const nk = korea.filter((x) => x.a.nkLikely);
  const otherLaunch = korea.filter((x) => x.a.launch && !x.a.nkLikely);
  const ref = (r: any) => `${r.navArea === "P" ? "HYDROPAC" : `NAVAREA ${r.navArea}`} ${r.msgNumber}/${String(r.msgYear).slice(-2)}`;
  const head = (r: any) => (r.title ?? String(r.text ?? "").split("\n").slice(0, 4).join(" ")).slice(0, 160);
  return [
    { indicator: "navwarn.korea_warnings", value: korea.length, meta: { refs: korea.slice(0, 8).map((x) => (x.r.title ? `${ref(x.r)} ${x.r.title}` : ref(x.r))) } },
    {
      indicator: "navwarn.launch_notice_active",
      value: nk.length,
      meta: {
        refs: nk.map((x) => ({ ref: ref(x.r), authority: x.r.authority, head: head(x.r) })),
        otherLaunches: otherLaunch.map((x) => ({ ref: ref(x.r), authority: x.r.authority, head: head(x.r) })),
      },
    },
  ];
}

// ── 일본 해상보안청 NAVAREA XI ──
const JCG_CGI = "https://www1.kaiho.mlit.go.jp/TUHO/keiho/cgi";
export const jcgBodyUrl = (tana: string) => `${JCG_CGI}/disp_warnings.cgi?TYPE=NAVAREA11&TANA=${tana}&LANG=JP`;

export interface JcgItem {
  tana: string;
  number: string;
  category: string;
  title: string;
}
export interface JcgWarning extends JcgItem {
  /** 영문 전문 (NAVAREA XI 형식) */
  text: string;
  /** 해상보안청 사이트 게재 시각 (JST → epoch ms) */
  issued?: number;
}

/** warnings.cgi 응답(XML) → 목록. '유효 일람·삭제 일람' 같은 안내문은 뺀다 */
export function parseJcgList(xml: string): JcgItem[] {
  const out: JcgItem[] = [];
  for (const m of xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)) {
    const tag = (k: string) => (new RegExp(`<${k}>([\\s\\S]*?)<\\/${k}>`).exec(m[1])?.[1] ?? "").trim();
    const item = { tana: tag("tana"), number: tag("number"), category: tag("categoly").replace(/[\s　]/g, ""), title: tag("title") };
    if (!item.tana || /有効一覧|削除一覧/.test(item.title)) continue;
    out.push(item);
  }
  return out;
}

/** 본문 HTML → 영문 전문 + 게재 시각 ("発表日時：2026年10月28日 21時", 일본 시간) */
export function parseJcgBody(html: string): { text: string; issued?: number } {
  const plain = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t　]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const d = /発表日時[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時/.exec(plain);
  const issued = d ? Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4] - 9) : undefined;
  const start = plain.indexOf("NAVAREA XI");
  return { text: (start >= 0 ? plain.slice(start) : plain).replace(/発表日時[：:][^\n]*/, "").trim(), issued };
}

/** 본문을 받아 볼 만한 경보만 (한반도 주변 바다·발사·사격) — 나머지(동남아 등대 소등 등)는 제목만으로 거른다 */
const JCG_RELEVANT_TITLE = /黄海|日本海|東シナ海|朝鮮|韓国|対馬|済州|ロケット|ミサイル|打上げ|人工衛星|射撃|危険区域|ＧＰＳ|GPS/;

/** 경보문의 모든 좌표 (해상보안청 "35-27-10N 124-26-30E", NGA "38-12.00N 124-30.00E" 둘 다) */
export function coordsOf(text: string): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  const re = /(\d{1,2})-(\d{2}(?:\.\d+)?)(?:-(\d{2}(?:\.\d+)?))?([NS])\s+(\d{1,3})-(\d{2}(?:\.\d+)?)(?:-(\d{2}(?:\.\d+)?))?([EW])/g;
  for (const m of text.matchAll(re)) {
    const lat = (+m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0)) * (m[4] === "S" ? -1 : 1);
    const lon = (+m[5] + +m[6] / 60 + (m[7] ? +m[7] / 3600 : 0)) * (m[8] === "W" ? -1 : 1);
    out.push({ lat, lon });
  }
  return out;
}

/** 한반도 주변 바다 (서해·남해·동해·대한해협, 위도 33~43.5, 경도 123.5~132) */
const inKoreaSeas = (p: { lat: number; lon: number }) => p.lat >= 33 && p.lat <= 43.5 && p.lon >= 123.5 && p.lon <= 132;
/** 북한 발사의 낙하 구역이 나올 만한 곳: 서해 한국 쪽(북한 서해위성발사장 남쪽) 또는 북한 동쪽 동해 */
const inNkDropZone = (p: { lat: number; lon: number }) => (p.lat >= 33 && p.lat <= 39.5 && p.lon >= 123.5 && p.lon <= 126.5) || (p.lat >= 38 && p.lat <= 43 && p.lon >= 128 && p.lon <= 134);
const LAUNCH_RE = /ROCKET|MISSILE|SATELLITE|SPACE DEBRIS|ロケット|ミサイル|人工衛星/i;
const NK_NAME_RE = /NORTH KOREA|DPRK|D\.P\.R\.K|朝鮮民主主義人民共和国|北朝鮮/i;

export interface JcgAssessment {
  korea: boolean;
  launch: boolean;
  /** 북한 이름이 나오거나 낙하 구역이 북한 발사 경로에 있음 */
  nkLikely: boolean;
}

export function assessText(text: string, title = ""): JcgAssessment {
  const body = text.replace(/CANCEL THIS MSG[^\n]*/gi, "");
  const pts = coordsOf(body);
  const korea = KOREA_WATERS_RE.test(body) || /黄海|日本海|朝鮮|韓国|対馬|済州/.test(title) || pts.some(inKoreaSeas);
  const launch = LAUNCH_RE.test(body) || LAUNCH_RE.test(title);
  const nkLikely = launch && (NK_NAME_RE.test(body) || NK_NAME_RE.test(title) || pts.some(inNkDropZone));
  return { korea, launch, nkLikely };
}

export const assessJcg = (w: JcgWarning): JcgAssessment => assessText(w.text, w.title);

/** 해상보안청 목록·본문 받기 — 본문은 새 경보만 받고 나머지는 저장해 둔 것을 쓴다 (사이트 부담·하위 요청 절약) */
export async function fetchJcgWarnings(now: number, kv?: CollectorKv, fetchImpl: typeof fetch = fetch): Promise<JcgWarning[]> {
  const get = async (url: string, init?: RequestInit) => {
    const res = await fetchImpl(url, { ...init, headers: { "User-Agent": USER_AGENT, ...(init?.headers as Record<string, string>) } });
    if (!res.ok) throw new Error(`해상보안청 HTTP ${res.status}`);
    return res.text();
  };
  const year = new Date(now + 9 * 3600_000).getUTCFullYear();
  const items: JcgItem[] = [];
  // 경보는 발행 연도별로 나뉘어 있고, 지난해 발행분도 아직 유효할 수 있다
  for (const y of [year, year - 1]) {
    const xml = await get(`${JCG_CGI}/warnings.cgi`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `YEAR=${y}&TYPE=NAVAREA11&LANG=JP` });
    items.push(...parseJcgList(xml));
  }
  const cache: Record<string, { text: string; issued?: number }> = kv ? JSON.parse((await kv.getKv("jcg:bodies").catch(() => undefined)) ?? "{}") : {};
  const out: JcgWarning[] = [];
  let fetched = 0;
  for (const it of items) {
    if (!JCG_RELEVANT_TITLE.test(it.title)) {
      out.push({ ...it, text: "" });
      continue;
    }
    let b = cache[it.tana];
    if (!b && fetched < 8) {
      b = parseJcgBody(await get(jcgBodyUrl(it.tana)));
      cache[it.tana] = b;
      fetched++;
    }
    out.push({ ...it, text: b?.text ?? "", issued: b?.issued });
  }
  if (kv && fetched) {
    const keep = Object.fromEntries(Object.entries(cache).filter(([t]) => items.some((i) => i.tana === t)));
    await kv.setKv("jcg:bodies", JSON.stringify(keep)).catch(() => undefined);
  }
  return out;
}

/** 해상보안청 경보 → 지표용 행 (NGA 행과 같은 모양) */
function jcgAsRows(ws: JcgWarning[]): any[] {
  return ws
    .filter((w) => w.text)
    .map((w) => ({ navArea: "XI", msgNumber: w.number, msgYear: `20${w.tana.slice(0, 2)}`, authority: "일본 해상보안청", text: w.text, title: w.title, jcg: assessJcg(w), issued: w.issued, tana: w.tana }));
}

/** 해상보안청 발사 예고(한반도 주변) → 신호 */
export function jcgSignals(ws: JcgWarning[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const w of ws) {
    if (!w.text) continue;
    const a = assessJcg(w);
    if (!a.launch || !a.korea) continue;
    const head = w.text.split("\n").filter((l) => /^[A-Z ,.()-]+\.$/.test(l)).slice(0, 2).join(" ").slice(0, 90);
    const c = coordsOf(w.text)[0];
    out.push({
      id: `jcg_navarea:${w.tana}`,
      source: "nga_msi",
      sourceKind: "official",
      category: "launch_notice",
      title: `항행경보 NAVAREA XI ${w.number}/${w.tana.slice(0, 2)} (일본 해상보안청): ${w.title}${a.nkLikely ? " — 북한 발사 경로의 낙하 구역" : ""}`,
      summary: `${head} ${w.text.replace(/\s+/g, " ").slice(0, 260)}`.trim(),
      url: jcgBodyUrl(w.tana),
      lat: c?.lat,
      lon: c?.lon,
      eventTime: undefined,
      publishedTime: w.issued,
      detectedTime: now,
      // 북한 발사 경로의 낙하 구역이면 위성·장거리 발사 예고로 본다 (2023년 세 번 모두 이 모양)
      severity: a.nkLikely ? 70 : 50,
      drill: false,
      retraction: false,
      raw: { ref: `NAVAREA XI ${w.number}/${w.tana.slice(0, 2)}`, authority: "일본 해상보안청", nkLikely: a.nkLikely },
    });
  }
  return out;
}

// ── 한국 국립해양조사원 국내 항행경보 (합참·해군·해경 해상사격훈련, 북한 발사 알림 등) ──
export const KHOA_LIST = "https://www.khoa.go.kr/iframe/warning/list.do?sgrp=A01&cmsCd=CM1250&pnum=4&cnum=9";

export interface KhoaItem {
  no: string;
  title: string;
  /** YYYY-MM-DD (한국 날짜) */
  start?: string;
  end?: string;
  boardNo?: string;
}

const khoaDate = (s: string) => {
  const m = /(\d{4})\.(\d{2})\.(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
};

/** 목록 표: 번호 · 경보제목(goView 의 게시물 번호) · 시작일 · 종료일 */
export function parseKhoaList(html: string): KhoaItem[] {
  const out: KhoaItem[] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const text = (c: string) => c.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const no = text(cells[0]);
    if (!/^\d{2}-\d+/.test(no)) continue;
    out.push({ no, title: text(cells[1]), start: khoaDate(cells[2]), end: khoaDate(cells[3]), boardNo: /goView\('\d+',\s*'(\d+)'\)/.exec(cells[1])?.[1] });
  }
  return out;
}

/** 오늘(한국 날짜) 유효한 경보 — 기간 안이거나, 종료일 없는 알림은 시작 후 3일까지 */
export function khoaActive(items: KhoaItem[], now: number): KhoaItem[] {
  const today = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  const minus3 = new Date(now + 9 * 3600_000 - 3 * 86400_000).toISOString().slice(0, 10);
  return items.filter((i) => i.start && i.start <= today && (i.end ? i.end >= today : i.start >= minus3));
}

const JCG_EVERY_MS = 30 * 60_000;

/** 30분에 한 번만 받고 그 사이엔 저장해 둔 결과를 쓴다 (해상보안청·국립해양조사원 사이트는 1시간 단위 갱신) */
async function cached<T>(kv: CollectorKv | undefined, key: string, now: number, load: () => Promise<T>): Promise<T> {
  const saved = kv ? JSON.parse((await kv.getKv(key).catch(() => undefined)) ?? "null") : null;
  if (saved && now - saved.at < JCG_EVERY_MS) return saved.list as T;
  const list = await load();
  if (kv) await kv.setKv(key, JSON.stringify({ at: now, list })).catch(() => undefined);
  return list;
}

export async function collectNga(now = Date.now(), kv?: CollectorKv, fetchImpl: typeof fetch = fetch): Promise<CollectResult> {
  // 두 출처를 따로 받는다 — 한쪽이 막혀도 다른 쪽으로 지표를 낸다
  const [nga, jcg, khoa] = await Promise.allSettled([
    fetchNgaWarnings(),
    cached(kv, "jcg:warnings", now, () => fetchJcgWarnings(now, kv, fetchImpl)),
    cached(kv, "khoa:warnings", now, async () => {
      const res = await fetchImpl(KHOA_LIST, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`국립해양조사원 HTTP ${res.status}`);
      return parseKhoaList(await res.text());
    }),
  ]);
  const why = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason).slice(0, 60) : "");
  if (nga.status === "rejected" && jcg.status === "rejected" && khoa.status === "rejected") throw new Error(`NGA: ${why(nga)} / 해상보안청: ${why(jcg)} / 국립해양조사원: ${why(khoa)}`);
  const ngaRows = nga.status === "fulfilled" ? nga.value : [];
  const jcgList = jcg.status === "fulfilled" ? jcg.value : [];
  const khoaNow = khoa.status === "fulfilled" ? khoaActive(khoa.value, now) : [];
  // NGA 가 NAVAREA XI 를 다시 실어 보내는 경우 같은 경보를 두 번 세지 않는다
  const jcgKeys = new Set(jcgList.map((w) => `XI-${w.number}-${w.tana.slice(0, 2)}`));
  const ngaOnly = ngaRows.filter((r) => !(String(r.navArea).toUpperCase() === "XI" && jcgKeys.has(`XI-${String(r.msgNumber).padStart(4, "0")}-${String(r.msgYear).slice(-2)}`)));
  const metrics = navwarnMetrics([...ngaOnly, ...jcgAsRows(jcgList)], now);
  // 국립해양조사원 국내 경보는 모두 우리 바다 — 오늘 유효한 것을 '한반도 주변 항행경보'에 더한다 (사격훈련 주간 계획 등)
  const ka = metrics.find((m) => m.indicator === "navwarn.korea_warnings")!;
  ka.value += khoaNow.length;
  ka.meta = { ...ka.meta, khoa: khoaNow.slice(0, 10).map((i) => `${i.no} ${i.title}`) };
  const status = {
    nga: nga.status === "fulfilled" ? `${ngaRows.length}건` : `실패: ${why(nga)}`,
    jcg: jcg.status === "fulfilled" ? `${jcgList.length}건` : `실패: ${why(jcg)}`,
    khoa: khoa.status === "fulfilled" ? `오늘 유효 ${khoaNow.length}건` : `실패: ${why(khoa)}`,
  };
  for (const m of metrics) m.meta = { ...m.meta, sources: status };
  const partial = nga.status === "rejected" || jcg.status === "rejected" || khoa.status === "rejected";
  return {
    source: "nga_msi",
    ok: true,
    error: partial ? `일부 출처 실패 — NGA ${status.nga}, 해상보안청 ${status.jcg}, 국립해양조사원 ${status.khoa}` : undefined,
    fetchedAt: now,
    rawCount: ngaRows.length + jcgList.length + khoaNow.length,
    signals: [...parseNga(ngaOnly, now), ...jcgSignals(jcgList, now)],
    metrics,
  };
}

/** 경보문에서 첫 번째 좌표("38-12.00N 124-30.00E")를 추출 */
function firstCoord(text: string): { lat: number; lon: number } | undefined {
  const m = /(\d{1,2})-(\d{2}(?:\.\d+)?)([NS])\s+(\d{1,3})-(\d{2}(?:\.\d+)?)([EW])/.exec(text);
  if (!m) return undefined;
  const lat = (+m[1] + +m[2] / 60) * (m[3] === "S" ? -1 : 1);
  const lon = (+m[4] + +m[5] / 60) * (m[6] === "W" ? -1 : 1);
  return { lat, lon };
}

/** 지역 + 핵심 문장(로켓·사격·GPS 등)으로 제목 구성 */
function headline(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const region = lines.filter((l) => /^[A-Z .]+\.$/.test(l)).map((l) => l.replace(/\.$/, "")).join("/");
  const key = lines.find((l) => /ROCKET|MISSILE|GUNNERY|FIRING|GPS|GNSS|SPACE DEBRIS|HAZARDOUS/i.test(l)) ?? lines[0] ?? "";
  return `${region ? region + " — " : ""}${key.replace(/^\d+\.\s*/, "")}`.slice(0, 100);
}

export function parseNga(rows: any[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const r of rows) {
    const text: string = r.text ?? "";
    // 영문 항행경보는 한반도 주변 지역명이 있을 때만 (중동·대서양 경보 제외)
    // 'CANCEL THIS MSG <DTG>'는 모든 항행경보의 자동 만료 문구이므로 정정으로 보지 않는다
    const cls = classifyText(text.replace(/CANCEL THIS MSG[^\n]*/gi, ""), { requireRegion: true });
    if (!cls) continue;
    // 항행경보 맥락에서 'MISSILE'은 발사 예고이므로 launch_notice 로 정규화
    const category = cls.category === "missile" ? "launch_notice" : cls.category;
    if (!["launch_notice", "gps_interference", "nuclear_test", "artillery"].includes(category)) continue;
    let severity = cls.category === "missile" ? 55 : cls.severity;
    // 북한이 직접 통보한 발사 예고 구역은 별도로 가중
    if (category === "launch_notice" && /NORTH KOREA|DPRK/i.test(text) && severity >= 55) severity = 65;
    const issued = parseDtg(String(r.issueDate ?? ""));
    const c = firstCoord(text);
    const ref = `${r.navArea}-${r.msgYear}-${r.msgNumber}`;
    out.push({
      id: `nga_msi:${ref}`,
      source: "nga_msi",
      sourceKind: "official",
      category,
      title: `항행경보 ${r.navArea === "P" ? "HYDROPAC" : `NAVAREA ${r.navArea}`} ${r.msgNumber}/${String(r.msgYear).slice(-2)}: ${headline(text)}`,
      summary: text.replace(/\s+/g, " ").slice(0, 300),
      url: "https://msi.nga.mil/NavWarnings",
      lat: c?.lat,
      lon: c?.lon,
      // 항행경보의 '사건 시각'은 예고된 미래 구간인 경우가 많아 발행 시각만 기록
      eventTime: undefined,
      publishedTime: issued,
      detectedTime: now,
      severity,
      drill: false,
      retraction: cls.retraction,
      raw: { ref, authority: r.authority },
    });
  }
  return out;
}
