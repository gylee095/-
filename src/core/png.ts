// 아주 작은 PNG 해독기 — 8비트 PNG(회색·RGB·색상표·회색+투명·RGBA)만 읽는다 (NASA GIBS 밤 불빛 영상용, 2026-11-01).
// Worker 에는 이미지 라이브러리가 없어 직접 푼다: 조각(chunk) 읽기 → zlib 풀기(DecompressionStream, 내장) → 줄 필터 되돌리기.
// 무료 플랜 CPU(실행당 10ms)를 아끼려고 작은 영상(평양 32×32칸)만 받아 푼다.

export interface DecodedPng {
  width: number;
  height: number;
  /** 한 칸의 바이트 수: 회색 1 · 회색+투명 2 · RGB 3 · RGBA 4 · 색상표 1(번호) */
  channels: number;
  /** PNG 색 형식 (0 회색, 2 RGB, 3 색상표, 4 회색+투명, 6 RGBA) */
  colorType: number;
  /** 색상표 RGB 3바이트씩 (색 형식 3) */
  palette: Uint8Array;
  /** 줄 단위 칸 값 (height × width × channels) */
  data: Uint8Array;
}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodePng(buf: Uint8Array): Promise<DecodedPng> {
  if (buf.length < 33 || SIG.some((b, i) => buf[i] !== b)) throw new Error("PNG 파일이 아님");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
  let palette: Uint8Array = new Uint8Array(0);
  const idat: Uint8Array[] = [];
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    if (type === "IHDR") {
      width = dv.getUint32(p + 8);
      height = dv.getUint32(p + 12);
      depth = buf[p + 16];
      colorType = buf[p + 17];
      interlace = buf[p + 20];
    } else if (type === "PLTE") palette = buf.subarray(p + 8, p + 8 + len);
    else if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len));
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const ch = CHANNELS[colorType];
  if (depth !== 8 || !ch || interlace !== 0 || width * height > 4_000_000) throw new Error(`지원하지 않는 PNG (비트 ${depth}, 색 형식 ${colorType}, 인터레이스 ${interlace}, ${width}×${height})`);
  const z = new Uint8Array(idat.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of idat) {
    z.set(c, o);
    o += c.length;
  }
  const raw = await inflate(z);
  const line = width * ch;
  if (raw.length < height * (line + 1)) throw new Error("PNG 데이터가 짧음");
  const px = new Uint8Array(height * line);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (line + 1)];
    const s = y * (line + 1) + 1;
    const d = y * line;
    const u = d - line;
    // a = 왼쪽 칸(같은 색 채널), b = 위 칸, c = 왼쪽 위 칸
    for (let x = 0; x < line; x++) {
      const a = x >= ch ? px[d + x - ch] : 0;
      const b = y ? px[u + x] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const c = x >= ch && y ? px[u + x - ch] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`PNG 필터 ${f}`);
      px[d + x] = raw[s + x] + pred;
    }
  }
  return { width, height, channels: ch, colorType, palette, data: px };
}
