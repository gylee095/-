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
  | "firms"
  | "gfw"
  | "advisories"
  | "polymarket"
  | "wiki"
  | "naver_datalab"
  | "ecos"
  | "nk_market";

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
  gfw: {
    id: "gfw",
    name: "Global Fishing Watch 위성 AIS (서해 중국 선박)",
    kind: "sensor",
    access: "무료 토큰 (비상업, globalfishingwatch.org/our-apis/tokens)",
    cost: "무료",
    refresh: "하루 1회",
    latency: "약 5일 (위성 데이터 처리 지연)",
    realtime: "delayed",
    terms: "비상업 이용, 출처 표시 (Global Fishing Watch)",
    hosts: ["gateway.api.globalfishingwatch.org"],
    notes: "지상 수신소가 없는 서해 한가운데·NLL 인근도 위성으로 보인다. 중국 선박 체류시간을 직전 2주와 비교해 '중국 어선 이탈'을 추세로 본다.",
  },
  advisories: {
    id: "advisories",
    name: "캐나다·독일·일본 정부 여행경보 (한국)",
    kind: "official",
    access: "키 불필요 (각국 정부 오픈데이터)",
    cost: "무료",
    refresh: "1시간",
    latency: "정부 발령 후 수 분~수 시간",
    realtime: "minutes",
    terms: "각국 정부 공공데이터 (출처 표시)",
    hosts: ["data.international.gc.ca", "www.auswaertiges-amt.de", "www.ezairyu.mofa.go.jp"],
    notes: "비공개 정보를 가진 정부가 자국민에게 내는 경보. 여러 나라가 함께 올리면 전쟁 위험의 가장 강한 공개 신호. 일본은 주한 공관 영사 메일(미사일 발사 1보가 속보 3분 뒤)도 본다.",
  },
  polymarket: {
    id: "polymarket",
    name: "예측시장 Polymarket (한반도 전쟁·대화 가격)",
    kind: "media",
    access: "키 불필요 공개 API (gamma-api)",
    cost: "무료",
    refresh: "1시간",
    latency: "실시간 가격",
    realtime: "near-realtime",
    terms: "공개 API, 읽기 전용",
    hosts: ["gamma-api.polymarket.com"],
    notes: "돈을 건 사람들이 매기는 '북한의 한국 침공' 가격. 수 % 대 가격은 실제보다 높게 매겨지는 경향이 있어 변화를 본다.",
  },
  wiki: {
    id: "wiki",
    name: "위키백과 조회수 (한반도 관련 문서)",
    kind: "media",
    access: "키 불필요 (Wikimedia REST API, 연락처 있는 User-Agent 필수)",
    cost: "무료",
    refresh: "하루 1회",
    latency: "약 1일",
    realtime: "delayed",
    terms: "Wikimedia API 이용 정책",
    hosts: ["wikimedia.org"],
    notes: "세계(영어·일본어·한국어) 사람들의 한반도 관심. 여러 문서가 함께 늘 때만 의미를 둔다.",
  },
  naver_datalab: {
    id: "naver_datalab",
    name: "네이버 데이터랩 검색어 트렌드 (NAVER API HUB)",
    kind: "media",
    access: "무료 키 (NAVER API HUB 이용 신청 → 애플리케이션 등록, 예전 개발자센터 키도 가능)",
    cost: "무료 (월 3만 건까지 0원, 하루 1회 사용)",
    refresh: "하루 1회",
    latency: "약 1일",
    realtime: "delayed",
    terms: "네이버 오픈API 이용약관",
    hosts: ["naverapihub.apigw.ntruss.com", "openapi.naver.com"],
    notes: "한국 사람들의 불안: '전쟁', '대피소', '생존배낭' 검색량을 평소와 비교.",
  },
  ecos: {
    id: "ecos",
    name: "한국은행 경제통계 — 외국인 코스피·코스닥 순매수",
    kind: "official",
    access: "무료 인증키 (ecos.bok.or.kr/api)",
    cost: "무료",
    refresh: "하루 1회 (전 거래일까지)",
    latency: "약 1일",
    realtime: "delayed",
    terms: "한국은행 Open API 이용약관 (출처 표시)",
    hosts: ["ecos.bok.or.kr"],
    notes: "엘리트·큰손의 돈: 글로벌 기관 자금이 평소보다 많이 빠져나가는지. 2003년부터 일별 자료가 있어 과거 위기와 비교할 수 있다.",
  },
  nk_market: {
    id: "nk_market",
    name: "아시아프레스 북한 장마당 물가 (휘발유·경유·쌀·옥수수·위안·달러)",
    kind: "media",
    access: "공개 웹 페이지 (키 불필요)",
    cost: "무료",
    refresh: "주 1회 조사, 하루 1회 확인",
    latency: "약 1주 (북한 안 협력자 조사 → 공개)",
    realtime: "delayed",
    terms: "아시아프레스 (출처 표시, 값만 사용)",
    hosts: ["www.asiapress.org"],
    notes: "북한 안쪽을 보는 거의 유일한 공개 창. 군의 연료 비축·주민 사재기 힌트지만 제재·밀수 단속·국제 유가로도 뛴다.",
  },
};

export function listSources(): SourceMeta[] {
  return Object.values(SOURCES);
}
