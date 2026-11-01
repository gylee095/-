// 사건 요약: 여러 출처의 제목에서 '무엇을, 몇 발, 어디서, 어디로'를 뽑아 한눈에 읽히는 형태로 만든다.
// 규칙 기반 추출이므로 기사 표현이 다르면 비어 있을 수 있다 (비어 있으면 화면에 '미상'으로 표시).
import type { CrisisEvent, Signal } from "./types.js";
import type { DomainId, Level } from "./warrisk.js";
import { TRIPWIRE_BY_ID } from "./tripwires.js";

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface EventBrief {
  /** 사람이 읽는 한 줄 요약 (예: "북한, 탄도미사일 10여 발 발사 → 동해 (일본 EEZ 밖)") */
  headline: string;
  /** 북한의 실제 발사·사격·경보 사건인지 (논평·분석 기사는 false) */
  isProvocation: boolean;
  weapon?: string;
  count?: string;
  launchArea?: Place;
  impactArea?: Place & { note?: string };
  distanceKm?: number;
  apogeeKm?: number;
  /** 1 관심 · 2 주의 · 3 경계 · 4 심각 · 5 위급 */
  danger: { level: 1 | 2 | 3 | 4 | 5; label: string; reason: string };
  /** 사건 기준 시각 (발생 > 공개 > 감지) */
  at: number;
  latest?: { title: string; at: number; url?: string; source: string };
  /** 자국민·대사관 가족·미군 가족이 한국을 떠나는 움직임 (훈련·가짜·계획 제외).
   *  confirmed = 정부 발표 원문 또는 두 곳 이상 교차확인, official = 공식 인용 보도 한 곳, media = 공식 인용 없는 보도 */
  evacuation?: "confirmed" | "official" | "media";
  /** 경보 단어(군·정부 태세 변화, 북한 전시 태세 명령, 돈·사람이 빠지는 행동) — 훈련·부인 제외. 판정에서 해당 영역을 최소 그 수준으로 올린다 */
  posture?: { id: string; label: string; domain: DomainId; level: Level }[];
}

const DANGER_LABEL = ["", "관심", "주의", "경계", "심각", "위급"] as const;

// 발사 지점 (공개 지명 기준 대략 좌표)
const LAUNCH_PLACES: [RegExp, Place][] = [
  [/순안|Sunan/i, { name: "평양 순안 일대", lat: 39.2, lon: 125.67 }],
  [/평양|Pyongyang/i, { name: "평양 일대", lat: 39.03, lon: 125.75 }],
  [/동창리|서해위성발사장|Sohae|Tongchang/i, { name: "평북 동창리", lat: 39.66, lon: 124.7 }],
  [/신포|Sinpo/i, { name: "함남 신포", lat: 40.03, lon: 128.18 }],
  [/원산|갈마|Wonsan/i, { name: "강원 원산 일대", lat: 39.17, lon: 127.48 }],
  [/함흥|Hamhung/i, { name: "함남 함흥 일대", lat: 39.92, lon: 127.54 }],
  [/숙천|Sukchon/i, { name: "평남 숙천", lat: 39.41, lon: 125.63 }],
  [/문덕|Mundok/i, { name: "평남 문덕", lat: 39.6, lon: 125.5 }],
  [/강동|Kangdong/i, { name: "평양 강동", lat: 39.15, lon: 126.1 }],
  [/구성|Kusong/i, { name: "평북 구성", lat: 39.98, lon: 125.24 }],
  [/개성|Kaesong/i, { name: "개성 일대", lat: 37.97, lon: 126.55 }],
  [/강령|Kangryong/i, { name: "황남 강령", lat: 37.9, lon: 125.5 }],
  [/황해|Hwanghae/i, { name: "황해도 일대", lat: 38.3, lon: 125.6 }],
  [/풍계리|Punggye/i, { name: "함북 풍계리 핵실험장", lat: 41.28, lon: 129.08 }],
  [/평북|North Pyongan/i, { name: "평안북도 일대", lat: 40.0, lon: 125.0 }],
  [/평남|South Pyongan/i, { name: "평안남도 일대", lat: 39.4, lon: 125.9 }],
];

// 낙하·사격 방향 (구체적인 표현을 먼저 검사)
const IMPACT_PLACES: [RegExp, Place & { note?: string }][] = [
  [/일본\s*상공|over Japan/i, { name: "일본 상공 통과 → 태평양", lat: 39.5, lon: 146.0, note: "일본 열도 통과" }],
  [/EEZ\s*(안|내)|inside .{0,20}EEZ|within .{0,20}EEZ/i, { name: "동해 · 일본 EEZ 안", lat: 41.0, lon: 137.5, note: "일본 배타적경제수역 안 낙하" }],
  [/EEZ\s*밖|outside .{0,20}EEZ/i, { name: "동해 · 일본 EEZ 밖", lat: 40.3, lon: 133.6, note: "일본 배타적경제수역 밖 낙하" }],
  [/연평|Yeonpyeong/i, { name: "서해 연평도 인근", lat: 37.67, lon: 125.7 }],
  [/백령|Baengnyeong/i, { name: "서해 백령도 인근", lat: 37.97, lon: 124.7 }],
  [/NLL|북방한계선/i, { name: "서해 NLL 인근", lat: 37.75, lon: 125.2 }],
  [/동해|East Sea|Sea of Japan/i, { name: "동해상", lat: 39.6, lon: 131.0 }],
  [/서해|황해상|Yellow Sea|West Sea/i, { name: "서해상", lat: 37.9, lon: 124.2 }],
];

const NUM_KO: Record<string, string> = { 한: "1", 두: "2", 세: "3", 네: "4", 다섯: "5" };
const NUM_EN: Record<string, string> = { a: "1", an: "1", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", eight: "8", ten: "10" };

export function extractCount(text: string): string | undefined {
  let m = /(\d+)\s*(여)?\s*발/.exec(text);
  if (m) return `${m[1]}${m[2] ? "여" : ""} 발`;
  m = /(한|두|세|네|다섯)\s*발/.exec(text);
  if (m) return `${NUM_KO[m[1]]} 발`;
  if (/여러\s*발|수\s*발|다수/.test(text)) return "여러 발";
  m = /(around|about|some|at least|up to)?\s*\b(\d+|two|three|four|five|six|eight|ten)\b\s+(?:[a-z-]+\s+){0,3}(missiles|rockets|shells|rounds)/i.exec(text);
  if (m) {
    const n = NUM_EN[m[2].toLowerCase()] ?? m[2];
    return `${m[1] ? "약 " : ""}${n} 발`;
  }
  if (/multiple|several|salvo|barrage/i.test(text)) return "여러 발";
  return undefined;
}

export function extractWeapon(text: string): string | undefined {
  const rules: [RegExp, string][] = [
    [/ICBM|대륙간/i, "대륙간탄도미사일(ICBM)"],
    [/SLBM|잠수함\s*발사/i, "잠수함발사탄도미사일(SLBM)"],
    [/극초음속|hypersonic/i, "극초음속 미사일"],
    [/순항\s*미사일|cruise missile/i, "순항미사일"],
    [/600\s*(㎜|mm)|초대형\s*방사포/i, "600㎜ 초대형 방사포"],
    [/방사포|rocket launcher|MLRS/i, "방사포"],
    [/탄도|ballistic/i, "탄도미사일"],
    [/해안포|coastal artillery/i, "해안포"],
    [/포격|포탄|artillery|shell/i, "포병 사격"],
    [/미사일|missile/i, "미사일(종류 미상)"],
    [/발사체|projectile/i, "미상 발사체"],
  ];
  for (const [re, name] of rules) if (re.test(text)) return name;
  return undefined;
}

function km(text: string, re: RegExp): number | undefined {
  const m = re.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

const PROVOCATION_RE =
  /(북한|北|North Korea|DPRK|Pyongyang).{0,60}(발사|쐈|쏴|사격|포격|fires?|fired|launch(es|ed)?|test-fire|shell)|(발사|fires?|launch(es|ed)?).{0,40}(북한|北|North Korea)|경계\s*경보|공습\s*경보|핵\s*실험|nuclear test/i;
const COMMENTARY_RE =
  /accus|mock|museum|분석|논평|가능성\s*(주시|제기|있|배제|커)|주시|침묵|대응방안|비판|규탄|협의|위반|연설|공개|탑재|says it tested|South Korea tests|우리\s*군.*(시험|훈련)/i;

/** 여러 기사에서 뽑은 값 중 가장 많이 나온 것 (동률이면 먼저 나온 것) */
function vote<T>(values: (T | undefined)[], key: (v: T) => string = String): T | undefined {
  const counts = new Map<string, { v: T; n: number; first: number }>();
  values.forEach((v, i) => {
    if (v === undefined) return;
    const k = key(v);
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { v, n: 1, first: i });
  });
  return [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0]?.v;
}

function placeIn<T extends Place>(text: string, table: [RegExp, T][]): T | undefined {
  for (const [re, p] of table) if (re.test(text)) return p;
  return undefined;
}

/** 사건 하나를 사람이 읽기 쉬운 요약으로 변환 */
export function briefEvent(e: CrisisEvent, signals: Signal[]): EventBrief {
  const sorted = [...signals].sort((a, b) => (a.publishedTime ?? a.detectedTime) - (b.publishedTime ?? b.detectedTime));
  const texts = sorted.map((s) => `${s.title} ${s.summary ?? ""}`);
  const all = texts.join(" \n ");
  const at = e.eventTime ?? e.firstPublishedTime ?? e.firstDetectedTime;
  const latestSig = sorted[sorted.length - 1];
  const latest = latestSig ? { title: latestSig.title, at: latestSig.publishedTime ?? latestSig.detectedTime, url: latestSig.url, source: latestSig.source } : undefined;

  const cats = new Set(e.categories);
  const strikeLike = cats.has("missile") || cats.has("artillery") || cats.has("air_raid_alert");
  const evacOnly = cats.has("evacuation") && cats.size === 1;
  const postureOnly = cats.has("posture") && cats.size === 1;
  // 경보 단어: 이 사건을 이룬 신호들이 걸린 단어 (훈련·부인 신호는 뺀다)
  const posture = postureOnly && !e.drill && !e.retracted
    ? [...new Map(signals.filter((s) => s.tripwire && !s.drill && !s.retraction && TRIPWIRE_BY_ID[s.tripwire]).map((s) => {
        const t = TRIPWIRE_BY_ID[s.tripwire!];
        return [t.id, { id: t.id, label: t.label, domain: t.domain, level: t.level }] as const;
      })).values()]
    : [];
  const isProvocation =
    !evacOnly && !postureOnly && !e.drill && !e.retracted &&
    (e.basis !== "media" || texts.some((t) => PROVOCATION_RE.test(t) && !COMMENTARY_RE.test(t))) &&
    (e.basis === "primary" || texts.some((t) => PROVOCATION_RE.test(t)));

  // 실제 발사를 보도한 문장만으로 수치를 뽑고, 기사마다 다르면 다수결 (논평·분석 기사의 숫자 혼입 방지)
  const launchTexts = texts.filter((t) => PROVOCATION_RE.test(t) && !COMMENTARY_RE.test(t));
  const factTexts = launchTexts.length ? launchTexts : texts.filter((t) => !COMMENTARY_RE.test(t));
  const facts = factTexts.join(" \n ") || all;
  const weapon = strikeLike || cats.has("launch_notice") ? vote(factTexts.map(extractWeapon)) : undefined;
  const count = strikeLike ? vote(factTexts.map(extractCount)) : undefined;
  const launchArea =
    vote(factTexts.map((t) => placeIn(t, LAUNCH_PLACES)), (p) => p.name) ??
    (cats.has("nuclear_test") && e.lat ? { name: "함북 풍계리 인근", lat: e.lat, lon: e.lon! } : undefined);
  // 낙하 지점은 더 구체적인 표현(EEZ 등)이 하나라도 있으면 우선
  const impacts = strikeLike ? factTexts.map((t) => placeIn(t, IMPACT_PLACES)).filter((p): p is NonNullable<typeof p> => !!p) : [];
  const impactArea = impacts.length ? impacts.sort((a, b) => IMPACT_PLACES.findIndex(([, p]) => p === a) - IMPACT_PLACES.findIndex(([, p]) => p === b))[0] : undefined;
  const distanceKm = km(facts, /(\d[\d,]*)\s*(?:km|㎞|킬로)/i);
  const apogeeKm = km(facts, /(?:고도|정점고도|apogee|altitude of)\s*(?:약\s*)?(\d[\d,]*)\s*(?:km|㎞)?/i);

  // 위험도 판정
  let level: 1 | 2 | 3 | 4 | 5 = 1;
  let reason = "관련 보도·분석";
  // 한국을 떠나는 움직임: 훈련·가짜·'유사시 계획'(심각도 85 미만)은 관심 수준으로만
  const evacLive = evacOnly && !e.drill && !e.retracted && e.severity >= 85;
  const evacuation: EventBrief["evacuation"] = evacLive ? (e.status !== "UNVERIFIED" ? "confirmed" : e.basis === "media" ? "media" : "official") : undefined;
  const pTop = posture.reduce((m, p) => Math.max(m, p.level), 0);
  if (postureOnly && posture.length) [level, reason] = [(pTop >= 3 ? 4 : pTop === 2 ? 3 : 2) as 2 | 3 | 4, `경보 단어: ${posture.map((p) => p.label).join("·")}`];
  else if (postureOnly) reason = e.drill ? "경보 단어 (훈련)" : "경보 단어 (부인·오보)";
  else if (evacOnly && e.drill) reason = "대피·후송 훈련";
  else if (evacOnly && e.retracted) reason = "가짜·허위로 확인된 대피 안내";
  else if (evacuation) [level, reason] = evacuation === "confirmed" ? [5, "외국 정부·주한미군의 철수·출국 권고 (확인)"] : [4, `한국을 떠나라는 보도${evacuation === "media" ? " (공식 인용 없음, 확인 중)" : " (공식 인용, 교차확인 전)"}`];
  else if (evacOnly) reason = "대피 계획·검토 보도";
  else if (e.drill) reason = "훈련 상황";
  else if (e.retracted) reason = "오발령·해제됨";
  else if (cats.has("air_raid_alert") && e.status === "CONFIRMED") [level, reason] = [5, "정부 민방위 경보 발령"];
  else if (cats.has("nuclear_test") && e.status !== "UNVERIFIED") [level, reason] = [5, "핵실험 의심 지진 교차확인"];
  else if (isProvocation && cats.has("artillery") && /연평|백령|우리\s*(영토|측)|피격|South Korean (island|territory)/i.test(facts)) [level, reason] = [5, "우리 영토 인근 포격"];
  else if (isProvocation && /ICBM|대륙간|일본\s*상공|over Japan|EEZ\s*(안|내)/i.test(facts)) [level, reason] = [4, "장거리·일본 상공/EEZ 관련 발사"];
  else if (isProvocation && cats.has("artillery") && /포격|해안포|artillery|shell/i.test(facts)) [level, reason] = [4, "포병 사격"];
  else if (isProvocation && weapon && /탄도|ICBM|SLBM|극초음속/.test(weapon)) [level, reason] = [3, "탄도미사일 발사"];
  else if (isProvocation && strikeLike) [level, reason] = [2, "미사일·방사포 발사"];
  else if (cats.has("launch_notice") && e.status !== "UNVERIFIED" && e.severity >= 55) [level, reason] = [2, "발사 예고 항행경보"];
  else if (cats.has("nuclear_test") || cats.has("seismic_anomaly")) [level, reason] = [2, "북한 지역 지진 (원인 확인 중)"];
  else if (cats.has("airspace_anomaly") || cats.has("gps_interference")) [level, reason] = [cats.has("airspace_anomaly") ? 2 : 1, cats.has("airspace_anomaly") ? "항공기 급감" : "GPS 교란 정보"];

  let headline: string;
  if (isProvocation && strikeLike && cats.has("air_raid_alert")) headline = "정부 민방위 경보 발령";
  else if (isProvocation && strikeLike) {
    const verb = weapon && /포|사격/.test(weapon) && !/방사포/.test(weapon) ? "사격" : "발사";
    headline = `북한, ${weapon ?? "발사체"}${count ? ` ${count}` : ""} ${verb}${impactArea ? ` → ${impactArea.name}` : ""}`;
  } else if (cats.has("nuclear_test")) headline = `북한 풍계리 인근 얕은 지진${e.status !== "UNVERIFIED" ? " (핵실험 의심)" : ""}`;
  else headline = e.title;

  return {
    headline,
    isProvocation,
    weapon,
    count,
    launchArea,
    impactArea,
    distanceKm,
    apogeeKm,
    danger: { level, label: DANGER_LABEL[level], reason },
    at,
    latest,
    ...(evacuation ? { evacuation } : {}),
    ...(posture.length ? { posture } : {}),
  };
}

/** 화면 맨 위 '지금 상황' — 가장 최근 도발의 경과 시간에 따라 위험도를 낮춘다 */
export function currentThreat(briefs: EventBrief[], now = Date.now()) {
  const provocations = briefs.filter((b) => !b.evacuation && !b.posture && (b.isProvocation || b.danger.level >= 3)).sort((a, b) => b.at - a.at);
  const last = provocations[0];
  const active = briefs.filter((b) => now - b.at < 24 * 3600_000);
  const top = active.reduce<EventBrief | undefined>((m, b) => (!m || b.danger.level > m.danger.level ? b : m), undefined);
  let level = top?.danger.level ?? 1;
  // 6시간이 지나면 한 단계 낮춘다 (진행 중인 상황이 아님)
  if (top && now - top.at > 6 * 3600_000 && level > 1) level = (level - 1) as typeof level;
  const label = level <= 1 ? "평시" : DANGER_LABEL[level];
  return {
    level,
    label,
    summary: top && level > 1 ? top.headline : "최근 24시간 동안 확인된 북한의 발사·포격 없음",
    lastProvocation: last ? { headline: last.headline, at: last.at } : null,
  };
}
