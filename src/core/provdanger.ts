// 북한 도발 → 위험도(1~5) — 운영 사건 판정(brief.ts)과 같은 눈금. CSIS Beyond Parallel 'Database: North Korean Provocations' 한 줄을 판정한다.
// 10년 긴장 온도계(scripts/build-tension-history.ts)와 사례집 한국 재생(scripts/korea-replay.ts)이 함께 쓴다 — 규칙을 두 곳에 적지 않는다.
export interface Prov { date: string; type: string; event: string; desc: string }
export function dangerOf(r: Prov): number {
  const e = r.event.toLowerCase();
  const x = `${r.event} ${r.desc}`.toLowerCase();
  if (r.type === "Nuclear Provocation" && e.includes("nuclear test")) return 5;
  if (e.includes("nuclear detonation")) return x.includes("ballistic") ? 3 : 2;
  if (e.includes("artillery")) {
    if (/yeonpyeong|baengnyeong|evacuat/.test(x)) return 5;
    if (/rocket|mlrs|multiple.{0,10}launch/.test(x)) return 2;
    return 4;
  }
  if (e.includes("explosion") || e.includes("liaison")) return 4;
  if (e.includes("land mine")) return 4;
  if (e.includes("drone")) return /intru|cross|incursion|over .*seoul|airspace/.test(x) ? 4 : 2;
  if (/dmz en(ro|cro)achment/.test(e)) return 3;
  if (e.includes("intercontinental") || e.includes("satellite")) return 4;
  if (e.includes("ballistic") || e.includes("mirv")) return /over japan|over hokkaido|flew over|j-alert|overflew/.test(x) ? 4 : 3;
  if (e.includes("short-range missile") || /mlrs|multiple lan/.test(e)) return 3;
  if (/cruise|anti-aircraft|surface-to-air|tactical guided|anti-ship/.test(e)) return 2;
  if (/balloon|loudspeaker|gps|exercise|posturing|engine|rocket experiment|underwater|launcher deployment|mixed tactical/.test(e)) return 2;
  return 1;
}

/** CSIS 표 HTML → 도발 목록 */
export function parseCsis(html: string): Prov[] {
  const provs: Prov[] = [];
  const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
  const unesc = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  for (const tr of body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => unesc(m[1]));
    if (tds.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(tds[0])) provs.push({ date: tds[0], type: tds[1], event: tds[2], desc: tds[3].slice(0, 400) });
  }
  return provs;
}
