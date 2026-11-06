# 외국 전쟁 사례집 — 성적표 (규칙 1.0)

> 자동 생성: `npx tsx scripts/score-cases.ts`. 손으로 고치지 않는다. 자료 받은 날: 2026-11-06.
> 자료: `data/cases/<사례>.json` (출처 포함) · 규칙: `src/core/casereplay.ts` 가 운영 판정 함수 `assessWarRisk` 를 그대로 호출한다.

## 한눈에

- 공격이 있었던 사례 5건 중 **미리 잡은 것 3건** ('잡음' = 공격 전 30일 안에 3단계 이상).
- 평시 구간 421일 중 **헛경보 31일** (3단계 이상).
- 채점한 571일 동안 단계가 바뀐 횟수 40번.

| 사례 | 결과 | 판정 | 3단계 첫날 | 4단계 첫날 | 전날 단계 | 평시 헛경보 | 단계 변화 |
|---|---|---|---|---|---|---|---|
| 러시아 → 우크라이나 침공 | 2022-02-24 | 잡음 (30일 전) | 2022-01-25 | 2022-01-25 | 4단계(임박) | 2/60일 | 8번 |
| 러시아 병력 집결 2021년 봄 (전쟁 안 남) | 전쟁 안 남 | 헛경보 없음 | — | — | — | 0/121일 | 4번 |
| 하마스 기습 | 2023-10-07 | 못 잡음 | — | — | 1단계(평온) | 0/60일 | 8번 |
| 이란 → 이스라엘 공격 (2024년 4월) | 2024-04-13 | 잡음 (1일 전) | 2024-04-12 | — | 3단계(위기) | 0/60일 | 4번 |
| 이란 → 이스라엘 공격 (2024년 10월) | 2024-10-01 | 잡음 (30일 전) | 2024-09-01 | — | 3단계(위기) | 29/60일 | 8번 |
| 이스라엘 ↔ 이란 12일 전쟁 | 2025-06-13 | 못 잡음 | — | — | 2단계(긴장) | 0/60일 | 8번 |

## 전쟁 직전 대비 점수 (화면에 나가는 숫자)

0 = 한반도 평소(평온 단계 기준점), 100 = 우크라이나 침공 전날의 판정(4단계(임박)). 판정 규칙의 온도계 눈금(단계 + 단계 안 위치)을 이 두 점 사이에 놓은 것이다. 각 사례의 전날 점수:

| 사례 | 전날 | 전날 단계 | 점수 | 미리 잡았나 |
|---|---|---|---|---|
| 러시아 → 우크라이나 침공 | 2022-02-23 | 4단계(임박) | 100 | 잡음 |
| 하마스 기습 | 2023-10-06 | 1단계(평온) | 0 | 못 잡음 |
| 이란 → 이스라엘 공격 (2024년 4월) | 2024-04-12 | 3단계(위기) | 69 | 잡음 |
| 이란 → 이스라엘 공격 (2024년 10월) | 2024-09-30 | 3단계(위기) | 69 | 잡음 |
| 이스라엘 ↔ 이란 12일 전쟁 | 2025-06-12 | 2단계(긴장) | 37 | 못 잡음 |

평시로 보는 421일의 점수: 중앙값 0, 상위 10% 37, 최고 100.

## 이 성적표로 말할 수 없는 것

- **표본이 6건이다.** 규칙이 낫다·못하다의 방향은 볼 수 있어도 확률을 맞출 만큼은 아니다.
- **측정한 신호가 일부다** (아래 표). 군사 영역은 항공사 운항 중단·영공 폐쇄 외에는 재생하지 못했다. 그래서 군사 쪽 근거로 올라가는 경로는 시험되지 않았다.
- **사건 보도 판정을 쓰지 않았다.** 운영에서는 도발 보도가 군사 영역을 올린다. 사례에서는 그 제목들을 재현하지 못해 빠져 있다 — 실제 운영보다 군사 판정이 낮게 나올 수 있다.
- **다른 나라를 재는 잣대다.** 운영 문턱은 한국 시장 기준이다. 러시아·이스라엘 시장의 평소 변동 폭은 다르다.
- 정부 경보는 **안보 사유만** 센다. 코로나 사유 경보는 제외했다 (운영 규칙은 사유를 구분하지 못한다 — 아래 '발견').

## 측정 범위 (영역별 측정 / 전체 지표)

| 사례 | 정부의 행동 | 엘리트·큰손 | 돈의 움직임 | 군사 동향 | 북한의 말·내부 사정 | 사람들의 불안 |
|---|---|---|---|---|---|---|
| 러시아 → 우크라이나 침공 | 6/7 | 0/2 | 3/4 | 1/13 | 0/6 | 2/4 |
| 러시아 병력 집결 2021년 봄 (전쟁 안 남) | 1/7 | 0/2 | 3/4 | 1/13 | 0/6 | 2/4 |
| 하마스 기습 | 0/7 | 0/2 | 3/4 | 0/13 | 0/6 | 2/4 |
| 이란 → 이스라엘 공격 (2024년 4월) | 2/7 | 0/2 | 3/4 | 0/13 | 0/6 | 2/4 |
| 이란 → 이스라엘 공격 (2024년 10월) | 3/7 | 0/2 | 3/4 | 0/13 | 0/6 | 2/4 |
| 이스라엘 ↔ 이란 12일 전쟁 | 0/7 | 0/2 | 3/4 | 0/13 | 0/6 | 2/4 |

## 신호별 성적

'잡은 사례' = 공격 전 30일 안에 켜진 사례 수. '평시 켜진 비율'이 높을수록 헛것을 많이 낸 신호다.

| 신호 | 잡은 사례 | 중앙 선행일 | 평시 켜진 비율 |
|---|---|---|---|
| 한반도 '전쟁' 언급 보도 (24h) | 5/5 | 23일 | 18.3% (77/421일) |
| 캐나다 정부 한국 여행경보 단계 | 3/5 | 30일 | 9.3% (39/421일) |
| 영국 외무부 한국 여행권고 안보 경고 | 3/5 | 13일 | 15.7% (66/421일) |
| 한국 증시만의 움직임 (일본·대만 대비 %p) | 2/5 | 22일 | 2.1% (9/421일) |
| 일본 외무성 한국 위험 레벨 | 2/5 | 30일 | 6.2% (26/421일) |
| 세계의 한반도 관심 (위키백과 조회수, 평소 대비) | 2/5 | 30일 | 10.2% (43/421일) |
| 독일 외무부 한국 경고 | 1/5 | 12일 | 0% (0/421일) |
| 미 국무부 한국 여행경보 단계 | 1/5 | 30일 | 0.5% (2/421일) |
| 미 국무부 주한 대사관 철수·출국 권고 | 1/5 | 30일 | 0.5% (2/421일) |
| 방산주만의 움직임 (코스피 대비 %p) | 1/5 | 24일 | 0.5% (2/421일) |
| 한반도 상공 항공기 수 | 1/5 | 12일 | 1.7% (7/421일) |
| 원·달러 환율 변동 (전일 대비 %) | 1/5 | 30일 | 2.9% (12/421일) |

## 사례별 하루 단계

숫자 한 칸이 하루(1~5단계), 왼쪽이 창 시작, 오른쪽이 정답일이다.

- **러시아 → 우크라이나 침공** (2021-11-26 ~ 2022-02-24)
  `1111122111222221121111111111111111111111111111112222222222444444444444444444444444444444444`
- **러시아 병력 집결 2021년 봄 (전쟁 안 남)** (2021-01-15 ~ 2021-05-15)
  `1111111111111111111111111111111111111111111111111111111111111111111111111111222222222222222211122222221111111111111111111`
- **하마스 기습** (2023-07-09 ~ 2023-10-07)
  `1111111111111111111111111111111111111111111111111111111111111111111111211212121111111111112`
- **이란 → 이스라엘 공격 (2024년 4월)** (2024-01-14 ~ 2024-04-14)
  `11111111111111111111111111111111111111111111111111111111111111111111111111111122222222122333`
- **이란 → 이스라엘 공격 (2024년 10월)** (2024-07-03 ~ 2024-10-01)
  `1111111111111111122112121222222333333333333333333333333333333333333333333333333333333333333`
- **이스라엘 ↔ 이란 12일 전쟁** (2025-03-15 ~ 2025-06-13)
  `2222221121111111111111111111111112111111111111111111111111111111111211111111111111111111122`

## 출처

### 러시아 → 우크라이나 침공

- 통화: Yahoo Finance 일봉 RUB=X, UAH=X (여럿이면 그날 가장 약세)
- 증시: 모스크바 거래소 ISS IMOEX − EEM·^STOXX50E 평균
- 방산: RHM.DE·BA.L·LMT − ^STOXX50E·^GSPC
- 위키백과 조회수(Wikimedia): en:Ukraine, en:Russo-Ukrainian_War, en:Russia–Ukraine_relations, en:Armed_Forces_of_Ukraine, en:War_in_Donbas, en:Donbas, ru:Украина, uk:Збройні_сили_України, de:Ukraine
- 보도량: GDELT DOC 2.0 "Ukraine (war OR invasion OR troops)"
- 정부·영공: 미·영·캐·독·일 공식 권고(웨이백 스냅샷)와 보도 — 위 항목별 주소. 정리 2026-11-06
- 2022-01-15 official.ca_level_kr=1: 캐나다: 우크라이나 전역 '높은 주의' → '불필요한 여행 자제' (한 단계 상향) — https://www.ctvnews.ca/politics/canada-urges-avoiding-non-essential-travel-to-ukraine-due-to-russian-aggression-1.5742023
- 2022-01-23 official.us_travel_level_kr=4: 미국: 4단계(원래 코로나 사유)에 러시아 군사행동 위협을 사유로 추가 — 안보 사유 4단계가 된 날 — https://web.archive.org/web/20220210233741/https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/ukraine-travel-advisory.html
- 2022-01-23 official.us_departure_kr=2: 미국: 키이우 대사관 가족 철수 명령, 직원 자발적 출국 허용 (출처에 따라 1/24 표기 — 늦은 날로 써도 결과 같음) — https://web.archive.org/web/20220210233741/https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/ukraine-travel-advisory.html
- 2022-02-08 official.ca_level_kr=2: 캐나다: '모든 여행 자제' (출처가 2/1·2/8 로 엇갈려 늦은 날) — https://www.wingsmagazine.com/ottawa-increases-warnings-about-ukraine-urges-canadians-to-leave-over-russia-threat/
- 2022-02-11 official.uk_advice_security_flag=1: 영국: 우크라이나 전역 여행 금지 권고, 즉시 출국 권고 — https://gov.uk/government/news/british-nationals-advised-to-leave-ukraine-immediately
- 2022-02-11 official.jp_risk_level_kr=4: 일본: 우크라이나 전역 레벨4(대피 권고) — https://www.mofa.go.jp/mofaj/press/release/press4_009268.html
- 2022-02-12 official.de_warning_kr=2: 독일: 전역 여행경고와 출국 촉구 — https://www.t-online.de/nachrichten/deutschland/aussenpolitik/id_91654760/ukraine-krise-bundesregierung-empfiehlt-deutsche-sollen-ukraine-verlassen.html
- 2022-02-12 영공·항공: KLM 우크라이나 노선 중단·영공 미사용, 보험사 48시간 내 보험 중단 통보 — https://www.businessinsurance.com/insurers-withdraw-cover-for-ukrainian-airline-carriers-skyup-klm/

### 러시아 병력 집결 2021년 봄 (전쟁 안 남)

- 통화: Yahoo Finance 일봉 RUB=X, UAH=X (여럿이면 그날 가장 약세)
- 증시: 모스크바 거래소 ISS IMOEX − EEM·^STOXX50E 평균
- 방산: RHM.DE·BA.L·LMT − ^STOXX50E·^GSPC
- 위키백과 조회수(Wikimedia): en:Ukraine, en:Russo-Ukrainian_War, en:Russia–Ukraine_relations, en:Armed_Forces_of_Ukraine, en:War_in_Donbas, en:Donbas, ru:Украина, uk:Збройні_сили_України, de:Ukraine
- 보도량: GDELT DOC 2.0 "Ukraine (war OR invasion OR troops)"
- 정부: 미국 2021-01-16·05-01, 영국 01-10·04-29, 캐나다 2020-11-12·2021-05-06 스냅샷을 비교 — 안보 사유 단계 변경 없음. 미국 4/20 4단계는 코로나 사유라 넣지 않음. 독일·일본은 비교본 부족(변경 없음 미확정). 캐나다 '러시아 군 주둔' 문구는 4/29 판에서 삭제(추가일 미확인).
- 미국 대사관 철수: 두 스냅샷에 출국 허용·명령 문구 없음(5/1~15 미열람).
- 2021-04-15 official.uk_advice_security_flag=1: 영국: 단계는 그대로, 본문에 'Since 30 March ... Russian military build-up' 문구 (그 문구가 든 판의 갱신일 4/15 — 실제 삽입일은 더 이를 수 있음) — https://web.archive.org/web/20210429183014/https://www.gov.uk/foreign-travel-advice/ukraine
- 2021-04-20 영공·항공: 러시아 NOTAM: 크림 남부 인접 해역·흑해 일부 민간 비행 제한(4/20~24). 항공사 운항 중단은 아님 — 헛경보 시험이라 엄하게 넣는다 — https://tass.com/politics/1280469

### 하마스 기습

- 통화: Yahoo Finance 일봉 ILS=X (여럿이면 그날 가장 약세)
- 증시: Yahoo Finance TA35.TA − EEM·^STOXX50E 평균
- 방산: ESLT.TA − TA35.TA
- 위키백과 조회수(Wikimedia): en:Israel, en:Hamas, en:Gaza_Strip, en:Israel_Defense_Forces, en:Hezbollah, en:Iran–Israel_proxy_conflict, en:Islamic_Revolutionary_Guard_Corps, he:צבא_הגנה_לישראל, fa:ایران
- 보도량: GDELT DOC 2.0 "Israel Gaza (war OR attack OR rockets)"
- 정부: 미국 7/13 재발행(2단계 유지), 10/3 직원 이동 제한 완화 — 창 안에서 안보 사유 상향 없음. 영국·캐나다·독일 첫 상향은 10/7 당일 이후. 일본 7~10월 스냅샷 없음(변경 없음 미확정). 항공사 운항 중단은 10/7 당일부터.


### 이란 → 이스라엘 공격 (2024년 4월)

- 통화: Yahoo Finance 일봉 ILS=X (여럿이면 그날 가장 약세)
- 증시: Yahoo Finance TA35.TA − EEM·^STOXX50E 평균
- 방산: ESLT.TA − TA35.TA
- 위키백과 조회수(Wikimedia): en:Israel, en:Hamas, en:Gaza_Strip, en:Israel_Defense_Forces, en:Hezbollah, en:Iran–Israel_proxy_conflict, en:Islamic_Revolutionary_Guard_Corps, he:צבא_הגנה_לישראל, fa:ایران
- 보도량: GDELT DOC 2.0 "Iran Israel (war OR attack OR strike)"
- 정부: 창 시작 때 미국 3단계·영국 필수 외 자제·캐나다 불필요한 여행 자제·독일 전역 경고 — 2023년 10월부터 계속된 것이라 평소로 봄. 미 대사관 4/11 직원 이동 제한은 해당 지표 없음. 영공 폐쇄는 4/13 당일.
- 2024-04-11 official.uk_advice_security_flag=1: 영국: 단계는 그대로, '이란의 이스라엘 공격 가능성' 경고 추가 — https://www.gov.uk/api/content/foreign-travel-advice/israel
- 2024-04-12 official.ca_level_kr=1: 캐나다: 이스라엘 '불필요한 여행 자제' → '모든 여행 자제' (한 단계 상향, 16:55 ET) — https://travel.gc.ca/destinations/israel-the-west-bank-and-the-gaza-strip

### 이란 → 이스라엘 공격 (2024년 10월)

- 통화: Yahoo Finance 일봉 ILS=X (여럿이면 그날 가장 약세)
- 증시: Yahoo Finance TA35.TA − EEM·^STOXX50E 평균
- 방산: ESLT.TA − TA35.TA
- 위키백과 조회수(Wikimedia): en:Israel, en:Hamas, en:Gaza_Strip, en:Israel_Defense_Forces, en:Hezbollah, en:Iran–Israel_proxy_conflict, en:Islamic_Revolutionary_Guard_Corps, he:צבא_הגנה_לישראל, fa:ایران
- 보도량: GDELT DOC 2.0 "Iran Israel (war OR attack OR strike)"
- 정부: 미 대사관 7/31 북부 이동 제한은 해당 지표 없음. 독일 8/6·8/25·9/28 갱신은 단계 유지. 영공 폐쇄는 10/1 당일.
- 2024-07-28 official.uk_advice_security_flag=1: 영국: '모든 여행 자제' 지역 갱신(북부 국경 쪽, 단계 자체는 그대로) — https://www.gov.uk/api/content/foreign-travel-advice/israel
- 2024-08-03 official.ca_level_kr=1: 캐나다: 이스라엘 '모든 여행 자제'로 상향 — https://travel.gc.ca/destinations/israel-the-west-bank-and-the-gaza-strip
- 2024-08-06 official.jp_risk_level_kr=1: 일본: 이스라엘 '그 외 지역' 레벨2 → 3 (한 단계 상향) — https://www.anzen.mofa.go.jp/

### 이스라엘 ↔ 이란 12일 전쟁

- 통화: Yahoo Finance 일봉 ILS=X (여럿이면 그날 가장 약세)
- 증시: Yahoo Finance TA35.TA − EEM·^STOXX50E 평균
- 방산: ESLT.TA − TA35.TA
- 위키백과 조회수(Wikimedia): en:Israel, en:Hamas, en:Gaza_Strip, en:Israel_Defense_Forces, en:Hezbollah, en:Iran–Israel_proxy_conflict, en:Islamic_Revolutionary_Guard_Corps, he:צבא_הגנה_לישראל, fa:ایران
- 보도량: GDELT DOC 2.0 "Iran Israel (war OR attack OR strike)"
- 정부: 이스라엘 대상 상향(영국·캐나다·일본·독일)은 모두 6/13 당일, 미국 4단계는 6/16. 그 전 신호는 이웃 나라에서 나왔다 — 6/11 주이라크 미 대사관 비필수 인력 철수 명령, 6/11 중동 미군 가족 자발적 출국 승인, 6/12 주이스라엘 미 대사관 직원 이동 제한(보도). 우리 지표에 해당 항목이 없어 넣지 않음.

