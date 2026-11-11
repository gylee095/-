#!/usr/bin/env node
// 조사 도우미 — 위키백과(공식 API)와 열리는 언론사 기사를 글자만 받아 저장하고, 필요한 문단만 찾아 준다.
//   node scripts/research-wiki.mjs search "<검색어>" [en|ko]          → 문서 제목 후보
//   node scripts/research-wiki.mjs get "<제목>" [en|ko]               → 본문을 저장하고 절 목록(글자 수)을 보여 준다
//   node scripts/research-wiki.mjs grep "<제목>" "<정규식>" [en|ko]   → 정규식에 맞는 문단만 (절 이름과 함께, 최대 40개)
//   node scripts/research-wiki.mjs sec "<제목>" "<절 이름 일부>" [en|ko] → 그 절 전체
//   node scripts/research-wiki.mjs refs "<제목>" "<정규식>" [en|ko]   → 그 문서의 외부 출처 링크 중 맞는 것
//   node scripts/research-wiki.mjs url "<https://...>" "<정규식>"      → 기사 본문(태그 제거)에서 맞는 문단만
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "research");
mkdirSync(DIR, { recursive: true });
const [cmd, a, b, c] = process.argv.slice(2);
const curl = (u) => execFileSync("curl", ["-sS", "-L", "-m", "40", "--compressed", "-A", "kew-research/1.0 (precursor casebook; contact via repo)", u], { maxBuffer: 64 << 20 }).toString();
const api = (lang, q) => JSON.parse(curl(`https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&${q}`));
const slug = (s) => s.replace(/[^\w가-힣.-]+/g, "_").slice(0, 120);
const pageUrl = (lang, t, sec) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}${sec ? "#" + encodeURIComponent(sec.replace(/ /g, "_")) : ""}`;
function load(title, lang) {
  const f = join(DIR, `${lang}_${slug(title)}.txt`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const r = api(lang, `action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(title)}`);
  const p = r.query?.pages?.[0];
  if (!p || p.missing || !p.extract) { console.log(`없는 문서: ${title} — search 로 제목을 먼저 찾으세요`); process.exit(1); }
  const doc = { title: p.title, lang, text: p.extract };
  writeFileSync(f, JSON.stringify(doc));
  return doc;
}
function sections(doc) {
  const out = []; let cur = { name: "(머리말)", lines: [] };
  for (const line of doc.text.split("\n")) {
    const m = line.match(/^(=+)\s*(.+?)\s*=+$/);
    if (m) { out.push(cur); cur = { name: m[2], lines: [] }; } else if (line.trim()) cur.lines.push(line.trim());
  }
  out.push(cur);
  return out.filter((s) => s.lines.length);
}
if (cmd === "search") {
  const lang = b || "en";
  for (const h of api(lang, `action=query&list=search&srlimit=10&srsearch=${encodeURIComponent(a)}`).query.search) console.log(`${h.title}  — ${h.snippet.replace(/<[^>]+>/g, "").slice(0, 110)}`);
} else if (cmd === "get") {
  const doc = load(a, b || "en");
  console.log(`${doc.title} (${doc.text.length}자) ${pageUrl(doc.lang, doc.title)}`);
  for (const s of sections(doc)) console.log(`  ${s.name}  (${s.lines.join(" ").length}자)`);
} else if (cmd === "grep" || cmd === "sec") {
  const doc = load(a, c || "en"); const re = new RegExp(b, "i"); let n = 0;
  for (const s of sections(doc)) {
    if (cmd === "sec") { if (re.test(s.name)) console.log(`## ${s.name}  [${pageUrl(doc.lang, doc.title, s.name)}]\n${s.lines.join("\n")}\n`); continue; }
    for (const l of s.lines) if (re.test(l) && n++ < 40) console.log(`[${s.name}] ${l.slice(0, 900)}\n   ↳ ${pageUrl(doc.lang, doc.title, s.name === "(머리말)" ? "" : s.name)}\n`);
  }
  if (cmd === "grep") console.log(`(${n}개 문단)`);
} else if (cmd === "refs") {
  const lang = c || "en"; const re = new RegExp(b || ".", "i");
  const r = api(lang, `action=parse&prop=externallinks&redirects=1&page=${encodeURIComponent(a)}`);
  const links = (r.parse?.externallinks ?? []).filter((u) => re.test(u));
  console.log(links.slice(0, 60).join("\n") || "(없음)");
} else if (cmd === "url") {
  const f = join(DIR, `url_${slug(a)}.txt`);
  let text;
  if (existsSync(f)) text = readFileSync(f, "utf8");
  else {
    const html = curl(a);
    text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ").replace(/<\/(p|div|h\d|li|br)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/[ \t]+/g, " ");
    writeFileSync(f, text);
  }
  const re = new RegExp(b || ".", "i"); let n = 0;
  for (const l of text.split("\n").map((x) => x.trim()).filter((x) => x.length > 60)) if (re.test(l) && n++ < 30) console.log(l.slice(0, 900) + "\n");
  console.log(`(${n}개 문단, 전체 ${text.length}자)`);
} else console.log("사용법: 파일 머리의 주석 참고");
