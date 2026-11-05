// 한반도 고도 격자 만들기 (상품 소개 화면용, 2026-11-05): node scripts/gen-landing-dem.cjs <받은 파일 폴더> <출력.json>
// 필요한 파일: dem.csv = https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude[(32.5):3:(43.5)][(123.5):3:(131.5)] , countries-10m.json = https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json
// 출력을 src/worker/landing_dem.ts 의 KOREA_DEM 에 넣는다. 남·북한 땅 1..31, 다른 나라 땅 33..63, 바다 0
const fs = require("fs"), G = process.argv[2];
const rows = fs.readFileSync(G + "/dem.csv", "utf8").trim().split("\n").slice(2).map((l) => l.split(",").map(Number));
const lats = [...new Set(rows.map((r) => +r[0].toFixed(3)))].sort((a, b) => b - a); // 북 → 남
const lons = [...new Set(rows.map((r) => +r[1].toFixed(3)))].sort((a, b) => a - b);
const alt = new Map(rows.map((r) => [r[0].toFixed(3) + "," + r[1].toFixed(3), r[2]]));

// 남·북한 국경 다각형 (world-atlas 10m, TopoJSON 직접 해독)
const t = JSON.parse(fs.readFileSync(G + "/countries-10m.json"));
const { scale: [sx, sy], translate: [tx, ty] } = t.transform;
const arcs = t.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const arcPts = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
const ringOf = (ids) => { const out = []; ids.forEach((i, k) => { const p = arcPts(i); out.push(...(k ? p.slice(1) : p)); }); return out; };
const kRings = [];
for (const g of t.objects.countries.geometries) {
  if (![410, 408].includes(+g.id)) continue;
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const p of polys) kRings.push(ringOf(p[0]));
}
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
const isKorea = (lon, lat) => kRings.some((r) => inRing(lon, lat, r));

const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
let s = "", kor = 0, max = 0;
for (const la of lats) for (const lo of lons) {
  const h = alt.get(la.toFixed(3) + "," + lo.toFixed(3)) ?? -1;
  let v = 0;
  if (h > 0) {
    max = Math.max(max, h);
    const lvl = 1 + Math.min(30, Math.round(Math.sqrt(h / 2750) * 30));
    v = isKorea(lo, la) ? (kor++, lvl) : 32 + lvl;
  }
  s += A[v];
}
fs.writeFileSync(process.argv[3], JSON.stringify({ cols: lons.length, rows: lats.length, w: lons[0], e: lons.at(-1), n: lats[0], s: lats.at(-1), d: s }));
console.log(lons.length, lats.length, s.length, "korea pts", kor, "max", max);
