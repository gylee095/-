// H3 해상도 4 셀 목록 생성 (src/core/h3cells.ts). 실행: node scripts/gen-h3cells.mjs
import { polygonToCells } from "h3-js";
import { writeFileSync } from "node:fs";
const polys = {
  korea: [[33, 124], [33, 131.5], [43.5, 131.5], [43.5, 124]],
  north: [[37.7, 124], [37.7, 131], [43.5, 131], [43.5, 124]],
  south: [[33, 124.5], [33, 130], [38.5, 130], [38.5, 124.5]],
  westsea: [[36, 123.5], [36, 126.5], [39.5, 126.5], [39.5, 123.5]],
};
const body = Object.entries(polys).map(([k, p]) => `  ${k}: new Set(${JSON.stringify(polygonToCells(p, 4))}),`).join("\n");
writeFileSync("src/core/h3cells.ts", `// GPSJam 일간 CSV(H3 해상도 4)에서 한반도 주변 셀만 고르기 위한 셀 목록. scripts/gen-h3cells.mjs 로 생성.\nexport const H3_CELLS: Record<"korea" | "north" | "south" | "westsea", ReadonlySet<string>> = {\n${body}\n};\n`);
