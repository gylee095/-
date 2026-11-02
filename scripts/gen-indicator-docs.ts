// docs/INDICATORS.md 의 자동 생성 표를 코드에서 다시 만든다: npm run docs:indicators
import { readFileSync, writeFileSync } from "node:fs";
import { replaceDocTable } from "../src/core/indicatordocs.js";
const p = new URL("../docs/INDICATORS.md", import.meta.url);
const before = readFileSync(p, "utf8");
const after = replaceDocTable(before);
writeFileSync(p, after);
console.log(before === after ? "변경 없음" : "docs/INDICATORS.md 징후 표를 갱신함");
