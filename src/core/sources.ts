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
  | "rss_breaking"
  | "rss_news"
  | "travel"
  | "korea_kr_mnd"
  | "markets"
  | "ioda"
  | "bluesky"
  | "gpsjam"
  | "aisstream"
  | "firms";

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
  rss_breaking: {
    id: "rss_breaking",
    name: "연합뉴스 속보 RSS (1분 주기)",
    kind: "media",
    access: "키 불필요",
    cost: "무료",
    refresh: "1분",
    latency: "합참·日방위성 발표 후 1~3분에 [속보] 게재 → 이 시스템 감지까지 최대 1분 추가",
    realtime: "minutes",
    terms: "언론사 저작권. 제목·링크만 저장, 본문 미저장",
    hosts: ["www.yna.co.kr"],
    notes: "미사일·포격처럼 군 레이더로만 처음 잡히는 사건의 가장 빠른 공개 경로. 공식발표를 인용한 [속보]는 단일 출처라도 즉시 알림.",
  },
  rss_news: {
    id: "rss_news",
    name: "언론 RSS (NK News, BBC 아시아, CSIS Beyond Parallel — 교차확인용)",
    kind: "media",
    access: "키 불필요",
    cost: "무료",
    refresh: "5분",
    latency: "보도 직후~수 분",
    realtime: "minutes",
    terms: "각 언론사 저작권. 제목·링크만 저장, 본문 미저장",
    hosts: ["www.nknews.org", "feeds.bbci.co.uk"],
    notes: "연합뉴스 속보와 독립된 두 번째 언론사로 교차확인. 리드타임 측정에도 사용.",
  },
  travel: {
    id: "travel",
    name: "미 국무부·영국 외무부 한국 여행경보",
    kind: "official",
    access: "키 불필요",
    cost: "무료",
    refresh: "1시간",
    latency: "발표 즉시~1시간",
    realtime: "minutes",
    terms: "미국 정부 퍼블릭 도메인 / 영국 Open Government Licence",
    hosts: ["travel.state.gov", "www.gov.uk"],
    notes: "'펜타곤 피자 지수'의 공식판. 단계 변경·안보 문구 갱신 시 신호. 주한미대사관 경보(kr.usembassy.gov)와 주한미군(usfk.mil)은 자동 접근을 차단해 제외.",
  },
  korea_kr_mnd: {
    id: "korea_kr_mnd",
    name: "정책브리핑 국방부 보도자료 (korea.kr)",
    kind: "official",
    access: "키 불필요 (HTML)",
    cost: "무료",
    refresh: "1시간",
    latency: "사건 후 수 시간 (합참 기자단 문자보다 늦음)",
    realtime: "delayed",
    terms: "공공누리 출처표시",
    hosts: ["www.korea.kr"],
    notes: "자동 접근 가능한 유일한 국방부 공식 채널. 합참(jcs.mil.kr)·국방부(mnd.go.kr) 사이트는 해외 접속을 차단.",
  },
  markets: {
    id: "markets",
    name: "원·달러 환율 (Yahoo Finance)",
    kind: "sensor",
    access: "키 불필요 (비공식 API, 간헐적 429)",
    cost: "무료",
    refresh: "15분",
    latency: "수 분",
    realtime: "minutes",
    terms: "개인 비상업 참고용",
    hosts: ["query1.finance.yahoo.com"],
    notes: "확인 지표. 뉴스 없는 시간대의 급변만 의미. KOSPI 는 요청 제한으로 제외.",
  },
  ioda: {
    id: "ioda",
    name: "IODA 북한 인터넷 장애 경보 (Georgia Tech)",
    kind: "sensor",
    access: "키 불필요",
    cost: "무료",
    refresh: "1시간",
    latency: "수 분~1시간",
    realtime: "minutes",
    terms: "학술 공개 API",
    hosts: ["api.ioda.inetintel.cc.gatech.edu"],
    notes: "북한 외부망 단절 탐지. 개발 환경에서는 접속 불가로 배포 후 검증.",
  },
  bluesky: {
    id: "bluesky",
    name: "Bluesky 공개 검색 (사이렌·경보 목격담)",
    kind: "media",
    access: "키 불필요",
    cost: "무료",
    refresh: "15분",
    latency: "수 분",
    realtime: "minutes",
    terms: "AT Protocol 공개 API",
    hosts: ["public.api.bsky.app"],
    notes: "X·네이버는 API 없음. 표본이 작아 보조 지표. 개발 환경에서 403 → 배포 후 검증.",
  },
  gpsjam: {
    id: "gpsjam",
    name: "GPSJam 일간 GPS 교란 지도",
    kind: "sensor",
    access: "키 불필요 (일간 CSV)",
    cost: "무료",
    refresh: "하루 1회",
    latency: "약 1일 (전일 데이터)",
    realtime: "delayed",
    terms: "ADS-B Exchange 기반 파생 데이터, 비상업 참고",
    hosts: ["gpsjam.org"],
    notes: "한반도·서해·북한 상공 셀만 집계. 실시간 아님을 화면에 명시.",
  },
  aisstream: {
    id: "aisstream",
    name: "aisstream.io 서해 선박 AIS",
    kind: "sensor",
    access: "무료 키 (aisstream.io 가입)",
    cost: "무료",
    refresh: "1시간 (25초 표본)",
    latency: "수 초~수 분",
    realtime: "near-realtime",
    terms: "aisstream.io 이용약관 (비상업)",
    hosts: ["stream.aisstream.io"],
    notes: "중국·한국·북한 국적 선박 수. 키 없이는 미검증. 휴어기(5/1~8/16)·기상 영향 큼.",
  },
  firms: {
    id: "firms",
    name: "NASA FIRMS 위성 열 이상 (VIIRS)",
    kind: "sensor",
    access: "무료 MAP_KEY (이메일 등록 즉시 발급)",
    cost: "무료",
    refresh: "1시간",
    latency: "약 3시간",
    realtime: "delayed",
    terms: "NASA 공개 데이터, 출처 표시",
    hosts: ["firms.modaps.eosdis.nasa.gov"],
    notes: "북한 영역 열점과 발사장·시험장 12km 이내 열점. 농업 소각·산불이 대부분.",
  },
};

export function listSources(): SourceMeta[] {
  return Object.values(SOURCES);
}
