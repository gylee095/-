// 데이터 소스 검증표. docs/SOURCES.md 와 MCP list_sources 도구가 이 정보를 공유한다.
import type { SourceKind } from "./types.js";

export type SourceId =
  | "safetydata"
  | "usgs"
  | "emsc"
  | "nga_msi"
  | "adsb_lol"
  | "opensky"
  | "gdelt"
  | "rss_news";

export interface SourceMeta {
  id: SourceId;
  name: string;
  kind: SourceKind;
  access: string;
  cost: string;
  refresh: string;
  /** 사건 발생 → 데이터 공개까지 예상 지연 */
  latency: string;
  realtime: "near-realtime" | "minutes" | "delayed" | "precursor";
  terms: string;
  hosts: string[];
  notes: string;
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  safetydata: {
    id: "safetydata",
    name: "행정안전부 긴급재난문자 API (safetydata.go.kr)",
    kind: "official",
    access: "무료 인증키 (재난안전데이터공유플랫폼 회원가입 후 활용신청)",
    cost: "무료",
    refresh: "발령 즉시 적재, 폴링 1~5분 권장",
    latency: "발령 후 수 분 이내 (휴대폰 CBS 수신과 거의 동시 또는 약간 늦음)",
    realtime: "near-realtime",
    terms: "공공누리 / 공공데이터 이용약관, 출처 표시",
    hosts: ["www.safetydata.go.kr"],
    notes:
      "공습·경계경보(민방위 경보), 미사일·포격 관련 대피 안내가 가장 빠른 공식 신호. 2023-05-31 서울 경계경보 오발령 사례처럼 정정 문자도 함께 추적해야 함.",
  },
  usgs: {
    id: "usgs",
    name: "USGS FDSN Event API (지진)",
    kind: "sensor",
    access: "키 불필요",
    cost: "무료",
    refresh: "1분 단위 피드 갱신",
    latency: "해외 원거리 이벤트는 통상 10~30분 (자동 해석 후 공개)",
    realtime: "minutes",
    terms: "미국 정부 퍼블릭 도메인",
    hosts: ["earthquake.usgs.gov"],
    notes:
      "풍계리 인근 얕은 진원(≤10km) M3.5+ 이벤트를 핵실험 의심 신호로 분류. 'explosion' 유형 태깅은 수 시간 뒤 사후 검토에서 붙는 경우가 많음.",
  },
  emsc: {
    id: "emsc",
    name: "EMSC SeismicPortal FDSN (지진, 교차검증용)",
    kind: "sensor",
    access: "키 불필요",
    cost: "무료",
    refresh: "수 분",
    latency: "통상 10~30분",
    realtime: "minutes",
    terms: "CC BY 4.0 (출처 표시)",
    hosts: ["www.seismicportal.eu"],
    notes: "USGS와 독립된 지진 네트워크. 두 기관이 동시에 잡으면 CORROBORATED.",
  },
  nga_msi: {
    id: "nga_msi",
    name: "NGA MSI 항행경보 (HYDROPAC 등 Broadcast Warnings)",
    kind: "official",
    access: "키 불필요",
    cost: "무료",
    refresh: "수 시간~일 단위 발행",
    latency: "사건 '이전'에 공개되는 선행 신호 (발사 예고 구역·기간) / 사후 공개는 수 시간",
    realtime: "precursor",
    terms: "미국 정부 퍼블릭 도메인",
    hosts: ["msi.nga.mil"],
    notes:
      "북한·중국·한국의 로켓 발사, 사격훈련, GPS 교란 항행경보가 영문 텍스트로 게재됨. 일본 NAVAREA XI(해상보안청) 원문은 2단계에서 추가.",
  },
  adsb_lol: {
    id: "adsb_lol",
    name: "adsb.lol ADS-B (항공기 위치, 군용기 표시)",
    kind: "sensor",
    access: "키 불필요",
    cost: "무료",
    refresh: "수 초",
    latency: "수 초~수십 초. 한반도 수신기 커버리지 제한적 → 결측 가능",
    realtime: "near-realtime",
    terms: "ODbL (출처 표시, 동일조건 공유)",
    hosts: ["api.adsb.lol"],
    notes: "비상 스쿼크·항공기 수 급감(공역 통제 의심)·군용기 수를 감지. 단독으로는 항상 '미확인'. OpenSky가 클라우드 서버를 차단해 주 소스로 사용.",
  },
  opensky: {
    id: "opensky",
    name: "OpenSky Network REST API (ADS-B)",
    kind: "sensor",
    access: "익명(낮은 한도) 또는 OAuth2 client credentials (2026-03부터 basic auth 폐지)",
    cost: "무료 (비상업 연구 목적), 일일 크레딧 제한",
    refresh: "5~10초 (익명은 10초 해상도)",
    latency: "수 초~수십 초. 단, 한반도 수신기 커버리지가 희박해 결측 가능성 큼",
    realtime: "near-realtime",
    terms: "비상업적 이용, 연구 목적 약관 (상업 이용 시 별도 계약)",
    hosts: ["opensky-network.org", "auth.opensky-network.org"],
    notes:
      "Cloudflare 서버에서 접속 시 응답 없음(2026-10-30 확인) → 기본 비활성화(DISABLED_SOURCES). adsb.lol 대체.",
  },
  gdelt: {
    id: "gdelt",
    name: "GDELT DOC 2.0 API (전 세계 뉴스)",
    kind: "media",
    access: "키 불필요",
    cost: "무료",
    refresh: "15분",
    latency: "언론 보도 후 15~30분",
    realtime: "delayed",
    terms: "자유 이용, 출처 표시 권장",
    hosts: ["api.gdeltproject.org"],
    notes: "알림 트리거로는 쓰지 않음. 교차검증과 '뉴스보다 빨랐는가' 측정 기준선.",
  },
  rss_news: {
    id: "rss_news",
    name: "언론 RSS (연합뉴스 속보·북한, NK News, BBC 아시아)",
    kind: "media",
    access: "키 불필요",
    cost: "무료",
    refresh: "수 분",
    latency: "보도 직후~수 분",
    realtime: "minutes",
    terms: "각 언론사 저작권. 제목·링크만 저장, 본문 미저장",
    hosts: ["www.yna.co.kr", "www.nknews.org", "feeds.bbci.co.uk"],
    notes: "속보 시각을 기록하여 리드타임(알림 시각 - 첫 보도 시각) 계산에 사용.",
  },
};

export function listSources(): SourceMeta[] {
  return Object.values(SOURCES);
}
