// 지역 정의와 '어디 상공인가' 이름 — 한 곳에서만 정한다 (2026-11-02)
// 예전에는 범위 상자가 수집기마다 따로 있었고, 위치 이름은 경도만 보고 '128.5°보다 동쪽 = 동해'로 붙였다.
// 그래서 도쿄 근처(139.7°E)를 나는 호주 공군 P-8·급유기가 '동해 상공'으로 보였다.

export interface Box {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export const inBox = (p: { lat?: number; lon?: number }, b: Box) =>
  p.lat !== undefined && p.lon !== undefined && p.lat >= b.minLat && p.lat <= b.maxLat && p.lon >= b.minLon && p.lon <= b.maxLon;

export const AREAS = {
  /** 수신망에서 군용기를 가져오는 범위 (동북아 전체) */
  neAsia: { minLat: 28, maxLat: 47, minLon: 117, maxLon: 147 },
  /** 한반도와 주변 바다 — 군용기 '수'를 세는 범위 */
  koreaTheater: { minLat: 32.5, maxLat: 43.5, minLon: 123, maxLon: 132.5 },
  /** 정찰·급유기를 세는 범위: 한반도·서해·동해(일본 서해안까지). RC-135S 등은 동해 위에서 북한을 본다. 도쿄·간토(139°E~)는 뺀다 */
  isrWatch: { minLat: 30, maxLat: 45, minLon: 119, maxLon: 137.5 },
  /** 한국 땅 대략 (기업 제트기 출국 판정) */
  southKorea: { minLat: 33, maxLat: 38.7, minLon: 124.5, maxLon: 131 },
} satisfies Record<string, Box>;

/**
 * 사람이 읽는 위치 이름 — 한반도 주변이면 서해·한반도·동해, 밖이면 어느 쪽인지.
 * 경도만 보던 예전 방식은 일본 상공도 '동해'라고 불렀다.
 */
export function placeName(lat?: number, lon?: number): string {
  if (lat === undefined || lon === undefined) return "위치 모름";
  const p = { lat, lon };
  if (inBox(p, AREAS.koreaTheater)) return lon < 125.5 ? "서해 상공" : lon > 129.3 ? "동해 상공" : "한반도 상공";
  if (lon > AREAS.koreaTheater.maxLon) return lat > 41.5 && lon < 141 ? "동해 북쪽 먼바다" : "일본 쪽 상공";
  if (lon < AREAS.koreaTheater.minLon) return "중국 쪽 상공";
  if (lat < AREAS.koreaTheater.minLat) return "남쪽 바다(동중국해) 상공";
  return "러시아·중국 국경 쪽 상공";
}
