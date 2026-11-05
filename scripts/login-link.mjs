// 운영자 로그인 링크 만들기 (15분짜리, 링크에 비밀값 없음): KEW_SECRET=… node scripts/login-link.mjs [https://staging.koreasiren.com]
import { createHmac } from "node:crypto";
const secret = process.env.KEW_SECRET;
if (!secret) throw new Error("KEW_SECRET 이 필요합니다");
const base = (process.argv[2] ?? "https://koreasiren.com").replace(/\/$/, "");
const exp = Date.now() + 10 * 60_000;
const sig = createHmac("sha256", secret).update(`login:${exp}`).digest("hex");
console.log(`${base}/ops?login=${exp}.${sig}`);
