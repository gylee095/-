# 데이터 소스 검증표

> 조사일: 2026-10-30. 접근 조건·약관은 바뀔 수 있으므로 운영 전 각 원문을 재확인할 것.
> **검증 상태** 범례: ✅ 구현·픽스처 테스트 완료 / 🟡 구현했으나 실데이터 미검증(필드명 확인 필요) / ⏳ 2단계 / ❌ 사용 불가·부적합
>
> ⚠ 개발 컨테이너의 네트워크 정책이 아래 호스트를 차단해 **실제 응답으로는 아직 확인하지 못했다.** 파서는 공개 명세 기준으로 작성하고 픽스처로 검증했다. 배포 후 `fetch_source` 도구나 `npm run scan:dry`로 소스별 실응답을 반드시 한 번 확인할 것.

## 0. 실데이터 검증 결과 (2026-10-30, 배포된 Cloudflare Worker 에서 실측)

| 소스 | 결과 | 비고 |
|---|---|---|
| USGS / EMSC 지진 | ✅ 정상 | EMSC 는 결과가 없으면 HTTP 204 빈 응답 → 처리 추가 |
| NGA 항행경보 | ✅ 정상 (유효 386건) | **한반도 관련 경보는 1건(2024년)뿐** → 북한 발사 예고는 일본 해상보안청 NAVAREA XI 가 필요 |
| 일본 해상보안청 NAVAREA XI (2026-11-01) | ✅ 키 없이 정상 — 유효 경보 14건(목록 XML) + 본문(영문 전문) | `TUHO/keiho/cgi/warnings.cgi` 에 POST(YEAR·TYPE=NAVAREA11·LANG=JP) → 목록, `disp_warnings.cgi?TANA=` → 본문. 옛 주소는 404. 30분마다 목록, 본문은 새 경보만 |
| 국립해양조사원 국내 항행경보 (2026-11-01) | ✅ 키 없이 정상 — 합참·해군·해경 해상사격훈련 주간 계획, '북한 동해상 미상 발사체 발사 알림'(10/29) 등 | `iframe/warning/list.do` 목록 표(번호·제목·시작일·종료일). 30분마다 |
| adsb.lol 항공기 | ✅ 정상 (한반도 반경 250해리 40여 대) | 군용기 플래그 제공. 주 항공 소스로 채택 |
| 연합뉴스·NK News·BBC RSS | ✅ 정상 (557건) | 2026-10-29 북한 탄도미사일 일제 발사 보도를 2개 언론사 교차확인으로 정확히 묶음 |
| OpenSky | ❌ Cloudflare 에서 무응답(시간초과) | 클라우드 IP 차단 추정 → 비활성화 |
| Google News RSS | ❌ Cloudflare 에서 503 차단 | 언론사 RSS 직접 구독으로 대체 |
| GDELT | ❌ Cloudflare 공유 IP 에서 429 (5초당 1회 제한) | 자동 수집 제외, `search_news(include_gdelt)` 에서만 선택 사용 |
| 일본 방위성 / 합참 웹사이트 | ❌ 자동 접근 차단(403 / 해외 접속 거부) | 우회하지 않음. 대신 **공식발표를 인용한 복수 언론 속보**로 교차확인 |
| 행안부 긴급재난문자 | ✅ 2026-11-01 키 없이 해결 — 국민재난안전포털 `safekorea-kor/ctim/cmsg/calamitySms.do` 목록(전국 최신 10건: 재해구분·문자·발송일시·긴급단계·송출지역) | 옛 주소(idsiSFK)는 새 사이트로 이동. 키(본인인증)가 생기면 API 를 먼저 쓴다 |
| 미 국무부 여행경보 RSS / 영국 FCDO Atom | ✅ 정상 (한국 1단계) | 1시간 주기. 주한미대사관·주한미군 사이트는 403 |
| 정책브리핑 국방부 보도자료(HTML) | ✅ 정상 (20건) | 합참·국방부 사이트는 해외 차단, korea.kr 만 가능 |
| Yahoo Finance KRW=X | ✅ 정상 | KOSPI(^KS11)는 429 |
| adsb.lol /v2/mil (군용기) | ✅ 정상 | 동북아 야간 1~3대 수준 |
| GPSJam 일간 CSV | ✅ 정상 (한반도 276셀, 교란 0.01%) | 전일 데이터 |
| NASA FIRMS 지역 CSV(키 없음) | ✅ 접근 가능하나 1.5MB → Worker CPU 한도 초과 | 키 기반 영역 API 사용(FIRMS_MAP_KEY) |
| IODA(북한 인터넷) | ✅ Worker 에서 정상 | 개발 환경에서는 접속 불가 |
| Bluesky 공개 검색 | ❌ Worker·개발 환경 모두 403 (2026-11-01 재확인) | 수집 일정에서 뺌, SNS 칸 삭제 → 재난문자로 대체 |
| KCNA Watch RSS / 38 North RSS | ❌ HTML 리다이렉트 / 403 | 연합뉴스 북한 섹션으로 대체 |
| Reddit JSON / X / 텔레그램 | ❌ 403 / 유료 / 약관 | 제외 |
| aisstream.io (2026-10-31 실측, 키 등록 후) | ⚠ 키 정상(전 세계 8초 542척)이나 한반도 25초 7척, 중국 연안 0척 | 2026-11-01 수집 일정·징후판에서 뺌(사실상 못 봄). 분석관 도구 `check_yellow_sea_vessels` 로만 남김. 서해 선박은 위성 AIS(GFW) |
| adsb.fi 공개 군용기 목록 (2026-11-01) | ✅ 키 없이 정상 (전 세계 97대) | adsb.lol 과 수신자 망이 달라 합쳐서 센다(같은 기체 1번). airplanes.live 는 403 |
| NASA FIRMS 영역 API (키 등록 후) | ✅ 정상. 단 2026-11-01 Suomi NPP 하루 자료 없음 | 사각형(124~131.5°E, 37.5~43.5°N) 열점의 대부분은 중국 동북부·한국 — 북한 경계 다각형 안만 센다(10/31: 1,237건 중 1건). '1일'은 UTC 날짜라 2일 받아 최근 24시간으로 자르고, NOAA-20 먼저·없으면 NPP. 둘 다 0건이면 측정 불가 |
| Global Fishing Watch 4Wings (위성 AIS, 토큰 등록 후 실측) | ✅ 첫 호출 성공 — 18일치 1,668행, 최신 데이터 10/27(4일 지연) | 서해 한가운데 상자 국적별 일간 체류시간. 하루 1회(11:41 KST). 국적은 MMSI 앞자리 기준이라 기타·불명 국적 비중이 큼. 화면에 "Powered by Global Fishing Watch" 표시 의무 |
| 캐나다·독일 정부 여행경보 오픈데이터 (2026-10-31) | ✅ 둘 다 한국 경보 없음 | 키 불필요 JSON |
| 일본 외무성 해외안전정보 오픈데이터 (한국 0082L.xml) | ✅ 레벨 0. 주한 공관 영사 메일 — 10/29 미사일 1보 12:51(연합뉴스 속보 3분 뒤), 10/23 태풍 30호 안내 | 문서가 약 0.9MB → 최신 메일이 앞에 오므로 앞 96KB 만 읽는다 |
| Polymarket gamma 공개 API + CLOB 가격 이력 | ✅ '2027년 전 북한의 한국 침공' 4.35% (거래액 약 46만 달러), 10월 평소 2.83% | 전체 검색 응답은 600KB → 좁은 검색어 4개(각 수~수십 KB)로 나눔. 일별 가격 이력(약 9KB)으로 30일 대비 배율 |
| Wikimedia 조회수 API | ✅ 10/17~20 한반도 문서들이 함께 2~3배(김정은 문서 64배) | 연락처가 든 User-Agent 필수. 빠른 연속 요청 시 일부 실패 |
| 네이버 검색어 트렌드 (NAVER API HUB) | ✅ 10/30 '생존 준비' 평소의 89배, '전쟁' 25배 (10/26부터 급증) | 2026년 키 발급이 NAVER API HUB 로 옮겨 감 — 예전 openapi.naver.com 주소는 새 키로 401. naverapihub.apigw.ntruss.com/search-trend/v1/search + X-NCP-APIGW-API-KEY-ID/KEY 헤더 |
| 한국은행 경제통계 ECOS (802Y001 주식시장(일)) | ✅ 견본 키로 형식 확인 — 외국인 코스피 순매수 10/29 +6,600억, 10/30 −1조6,256억 | 2003년부터 일별. 실사용은 무료 인증키 필요. CDS·외평채 가산금리 표는 ECOS 에 없음 |
| NASA GIBS 밤 불빛 (VIIRS 야간 밴드 일일 영상, 2026-11-01) | ✅ 키 없이 정상 — 평양 32×32 칸 영상 약 1.7KB, 512×512 타일과 같은 값. 최신은 이틀 전 밤(10/30), 공개 전인 날은 투명 영상 | WMS 작은 영상으로 받아 Worker CPU 절약. 매시간 빈 날짜를 위성 두 대 × 최대 2일씩 채움 |
| Metaculus API | ❌ 계정 API 토큰 필수(없으면 403 "only available to authenticated users") | 제외 (2026-11-01 결정) — 한반도 질문이 '2050년까지 남북 전쟁'·'2045년 통일' 같은 장기 질문뿐이라 30일 판정의 비교 기준으로 약함. 단기 군중 확률은 Polymarket '2027년 전 북한의 한국 침공'으로 본다 |
| ntfy.sh (Worker 발신) | ❌ 10회 중 10회 429, 이후 522 | Cloudflare 공유 IP 제한. **Bark 로 대체(테스트 성공)** |
| Bark (api.day.app) | ✅ 테스트 푸시 성공 | iOS 앱, 계정 불필요, 긴급 알림 지원 |

### 실제 사례로 본 지연 (2026-10-29 북한 탄도미사일 약 10발)
- 연합뉴스 `[속보] 日방위성 "北, 탄도미사일 가능성 물체 발사"` — 12:48:39 KST
- NK News `… toward sea: Seoul` — 12:51:53 KST
- 이 시스템(RSS 5분 주기) 기준 예상 알림: 두 번째 보도 후 최대 5분 → 약 12:52~12:57 KST
- 개선(속보 우선 모드): 연합뉴스 속보 RSS 를 **1분마다** 확인하고, 합참·日방위성 발표를 인용한 `[속보]` 는 교차확인 전이라도 즉시 알림 → 이 사례 기준 **12:49~12:50 KST 알림** (첫 공개 발표 후 약 1~2분)
- 결론: 미사일 발사는 **공개 정보만으로는 언론 속보보다 빠를 수 없다**(군 레이더 정보가 비공개). 이 시스템의 가치는 '속보를 놓치지 않고, 교차확인된 것만, 출처와 시각을 붙여 즉시 알리는 것'이다.

## 1. MVP 구현 소스

| 소스 | 성격 | 접근 권한 | 비용 | 갱신 주기 | 사건→공개 지연 | 이용약관 | 상태 |
|---|---|---|---|---|---|---|---|
| 행안부 긴급재난문자 API (safetydata.go.kr `DSSP-IF-00247`) | 공식 | 무료 인증키 (회원가입·활용신청) | 무료 | 발령 즉시 적재 | **수 분 이내** (근실시간) | 공공데이터 이용약관, 출처 표시 | 🟡 필드명(SN, CRT_DT, MSG_CN, RCPTN_RGN_NM, EMRG_STEP_NM, DST_SE_NM)은 승인 후 미리보기로 확인 |
| USGS FDSN Event API | 센서 | 키 불필요 | 무료 | 1분 | **10~30분** (해외 원거리 자동해석) | 퍼블릭 도메인 | ✅ |
| EMSC SeismicPortal FDSN | 센서 | 키 불필요 | 무료 | 수 분 | **10~30분** | CC BY 4.0 | ✅ |
| NGA MSI Broadcast Warnings (HYDROPAC 등) | 공식 | 키 불필요 | 무료 | 수 시간~일 | **선행 신호**: 발사 예고는 사건 *수일 전* 공개 / 사후 경보는 수 시간 | 퍼블릭 도메인 | ✅ |
| OpenSky Network REST (ADS-B) | 센서 | 익명(저한도) 또는 OAuth2 client credentials (2026-03 basic auth 폐지) | 무료(비상업), 일일 크레딧 제한 | 5~10초 | **수 초~수십 초**, 단 한반도 수신기 희박 → 결측 잦음 | 비상업·연구 목적 | 🟡 커버리지 실측 필요 |
| GDELT DOC 2.0 | 언론 | 키 불필요 | 무료 | 15분 | 보도 후 15~30분 (**지연**) | 자유 이용 | ✅ (알림 트리거 아님, 리드타임 기준선) |
| 언론 RSS (Google News 검색, 연합뉴스) | 언론 | 키 불필요 | 무료 | 수 분 | 보도 직후 | 각 언론사 저작권 — 제목·링크만 저장 | ✅ (기준선) |

## 2. 조사했으나 MVP에서 제외한 소스

| 소스 | 이유 | 지연 | 다음 단계 |
|---|---|---|---|
| 일본 해상보안청 NAVAREA XI 항행경보 | 북한은 발사 예고를 NAVAREA XI 조정국(일본)에 통보 → 가장 직접적인 선행 신호. 구조화 API 없음(XML 목록 + HTML 본문) | 사건 수일 전 | ✅ 2026-11-01 수집 시작 |
| 일본 방위성 발표 / J-Alert | 미사일 발사 발표가 한국 합참보다 빠른 사례가 많음. 공식 RSS 미확인, X 계정은 API 유료 | 수 분 | ⏳ 웹페이지 변경 감지 |
| 합참·국방부 보도자료 | 공식 확인의 최종 기준이나 API·RSS 없음, 기자단 문자 공지가 먼저 나감 | 수 분~수십 분 | ⏳ 웹페이지 변경 감지 |
| FAA NOTAM API / ICAO NOTAM | 공역 통제(사격·발사 NOTAM) 직접 신호. FAA NMS API는 **수동 승인 필요**, ICAO iSTARS는 유료 구간 | 사건 전~직후 | ⏳ 키 발급 후 |
| GPSJam (ADS-B 기반 GPS 교란 지도) | 공식 API 없음, **일 단위(전일) 데이터** → 실시간 탐지 불가 | **24시간+** | ⏳ 일간 리포트용 |
| Stanford GNSS Interference Monitor | JSON 일간 파일, 연구용 | 24시간+ | ⏳ |
| 국립해양조사원 항행경보 | 한국 해역 사격·GPS 교란 항행경보. 공식 Open API 존재 여부 미확인 | 수 시간 | ⏳ 공공데이터포털 확인 |
| adsb.lol / ADS-B Exchange | adsb.lol은 무료 API·ODbL, ADSBx는 유료 API. OpenSky보다 동아시아 커버리지가 나을 수 있음 | 수 초 | ⏳ OpenSky 실측 후 비교 |
| 군 레이더·위성 영상·통신 감청 | **비공개 — 사용하지 않음** | - | ❌ |
| X(트위터)·텔레그램 OSINT 계정 | 빠르지만 오보 多, X API 유료, 약관 이슈 | 수 초~분 | ❌ (MVP 제외) |

## 3. 활용 가능한 MCP 서버 조사

| MCP 서버 | 내용 | 판단 |
|---|---|---|
| `flight-tracker-mcp` (GenAICPA, PyPI) | OpenSky 기반 항공기 조회 8개 도구, MIT | 참고. 우리 MCP의 `fetch_source(opensky)`로 대체 (기준선·스쿼크 로직 포함) |
| `adsb.lol-mcp` (x86ed) | adsb.lol + 정부기 추적 | 비활성 상태로 표시됨 → 미채택 |
| NOTAM / 재난문자 / 항행경보 MCP | 찾지 못함 | 직접 구현 (`src/mcp/server.ts`) |

**결론:** 기존 MCP 서버는 범용 항공 조회 수준이라, 이 프로젝트 전용 MCP 서버(`korea-early-warning`)를 만들어 수집·교차검증·알림을 도구로 노출했다.

## 4. 지연 시간 표기 원칙

- 모든 사건에 4개 시각을 저장: **사건 발생**(원천 제공 시) / **원천 공개**(원천 제공 시, 없으면 "원천 미제공") / **시스템 감지** / **알림 발송**. 추가로 **첫 언론 보도** 시각을 붙여 리드타임을 측정.
- USGS·EMSC는 최초 공개 시각을 주지 않으므로 공개 시각은 비워두고 감지 시각을 상한으로 본다.
- 항행경보는 미래 구간을 예고하므로 사건 발생 시각을 비워두고 발행 시각만 기록한다.
- "뉴스보다 빠름"은 주장하지 않고 대시보드 `뉴스 대비 성능`에서 측정값으로만 보여준다.

## 출처
- [data.go.kr 행정안전부_긴급재난문자](https://www.data.go.kr/data/15134001/openapi.do)
- [OpenSky API README (OAuth2 전환)](https://raw.githubusercontent.com/openskynetwork/opensky-api/master/README.md)
- [FAA NOTAM Management Service FAQ](https://www.faa.gov/about/initiatives/notam/faqs)
- [ICAO iSTARS Get NOTAM Data](https://www2023.icao.int/safety/iStars/Pages/Get-NOTAM-Data.aspx)
- [flight-tracker-mcp (PyPI)](https://pypi.org/project/flight-tracker-mcp/) · [adsb.lol MCP (Glama)](https://glama.ai/mcp/servers/x86ed/adsb.lol-mcp/tree)
- [rfi-fileparser (Stanford GNSS 간섭 데이터)](https://pypi.org/project/rfi-fileparser/)
- 긴장 온도계(과거 10년 재구성, docs/INDICATORS.md 0.2): [CSIS Beyond Parallel — Database: North Korean Provocations](https://beyondparallel.csis.org/database-north-korean-provocations/) (1958~ 도발 일지, 날짜·종류만 사용) · 네이버 데이터랩 검색어 트렌드(2016~, 서버 키로 1회 내려받음) · [Wikimedia Pageviews API](https://wikimedia.org/api/rest_v1/) · Yahoo 일봉 · 한국은행 ECOS 802Y001
- 2026-03-03~04 코스피 급락·방산주 급등의 배경(미국-이란 전쟁): [Al Jazeera](https://aljazeera.com/economy/2026/3/4/south-koreas-stock-market-in-meltdown-amid-us-iran-war) · [Bloomberg](https://bloomberg.com/news/articles/2026-03-04/korean-stock-gauge-poised-for-correction-on-iran-war-selloff) · [파이낸셜뉴스](https://www.fnnews.com/news/202603030939317459)
- 철수·후송 신호(docs/INDICATORS.md 0.3): [Stars and Stripes — 주한미군 가짜 대피 메시지 경고(2017)](https://www.stripes.com/news/pacific/us-forces-korea-warns-of-fake-evacuation-messages-1.488792) · [Military Times(2017-09-21)](https://www.militarytimes.com/news/2017/09/21/us-forces-korea-evacuation-message-is-fake/) · [주한미군 '커레이저스 채널' 보도자료](https://www.usfk.mil/Media/Press-Products/Press-Releases/Article/1343189/usfk-to-conduct-annual-courageous-channel-exercise-courageous-channel/) · [2016년 일본 이송 훈련 보도](https://www.sidae.com/article/2016110808518089589)
- 평양 밤 불빛(docs/INDICATORS.md 0.8): [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) — `VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance`, `VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance` (WMS GetMap, 키 불필요) · 색상표 [VIIRS_DayNightBand_At_Sensor_Radiance v1.3](https://gibs.earthdata.nasa.gov/colormaps/v1.3/VIIRS_DayNightBand_At_Sensor_Radiance.xml) · 방식: [NASA Black Marble](https://blackmarble.gsfc.nasa.gov/)
- 북한 장마당 물가(docs/INDICATORS.md 0.7): [아시아프레스 Latest Market Price Index Inside N.Korea](https://www.asiapress.org/rimjin-gang/north-k-korea-prices/) · 배경: [Daily NK — 2026년 연료값과 이란 전쟁](https://www.dailynk.com/english/north-korea-fuel-prices-surge-20-as-iran-war-squeezes-oil-supply/) · [Daily NK — 쌀값 첫 5만 원(2026-10-30)](https://www.dailynk.com/english/wp-json/wp/v2/posts/326134)
