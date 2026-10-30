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
| adsb.lol 항공기 | ✅ 정상 (한반도 반경 250해리 40여 대) | 군용기 플래그 제공. 주 항공 소스로 채택 |
| 연합뉴스·NK News·BBC RSS | ✅ 정상 (557건) | 2026-10-29 북한 탄도미사일 일제 발사 보도를 2개 언론사 교차확인으로 정확히 묶음 |
| OpenSky | ❌ Cloudflare 에서 무응답(시간초과) | 클라우드 IP 차단 추정 → 비활성화 |
| Google News RSS | ❌ Cloudflare 에서 503 차단 | 언론사 RSS 직접 구독으로 대체 |
| GDELT | ❌ Cloudflare 공유 IP 에서 429 (5초당 1회 제한) | 자동 수집 제외, `search_news(include_gdelt)` 에서만 선택 사용 |
| 일본 방위성 / 합참 웹사이트 | ❌ 자동 접근 차단(403 / 해외 접속 거부) | 우회하지 않음. 대신 **공식발표를 인용한 복수 언론 속보**로 교차확인 |
| 행안부 긴급재난문자 | ⏳ 인증키 대기 | 본인인증 필요 |

### 실제 사례로 본 지연 (2026-10-29 북한 탄도미사일 약 10발)
- 연합뉴스 `[속보] 日방위성 "北, 탄도미사일 가능성 물체 발사"` — 12:48:39 KST
- NK News `… toward sea: Seoul` — 12:51:53 KST
- 이 시스템(RSS 5분 주기) 기준 예상 알림: 두 번째 보도 후 최대 5분 → 약 12:52~12:57 KST
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
| 일본 해상보안청 NAVAREA XI 항행경보 | 북한은 발사 예고를 NAVAREA XI 조정국(일본)에 통보 → 가장 직접적인 선행 신호. 구조화 API 없음(HTML/텍스트) | 사건 수일 전 | ⏳ HTML 파서 추가 |
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
