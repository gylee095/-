// 징후(indicator) 카탈로그와 기준선 통계.
// 정보기관의 '징후·경보(Indicators & Warning)' 기법을 공개 데이터에 적용한다:
// 각 징후를 시간대별 평소 값과 비교해 정상/상승/이상으로 판정하고, 여러 징후의 동시 이상을 patterns.ts 에서 조합한다.
import type { IndicatorState, Reading } from "./types.js";

export type IndicatorGroup = "air" | "sea" | "seismic" | "navwarn" | "official" | "rhetoric" | "media" | "social" | "market" | "internet" | "gnss" | "thermal" | "psych" | "elite" | "border" | "nkinside";

export interface IndicatorDef {
  id: string;
  label: string;
  group: IndicatorGroup;
  unit: string;
  /** 어느 방향의 변화가 '나쁜' 신호인가 */
  direction: "high" | "low" | "both";
  /** 왜 이 징후가 의미 있는가 (역사적 근거) */
  why: string;
  /** 어떻게 측정하는가 */
  measure: string;
  latency: string;
  caveats: string;
  /** 기준선 구간: 시간대(24) / 6시간 블록(4) / 하루(1) */
  slots: 24 | 4 | 1;
  /** 희소한 건수형 징후는 기준선 대신 절대 임계값으로 판정 */
  absolute?: { elevated: number; anomalous: number };
  /** 기준선을 신뢰하기까지 필요한 표본 수 */
  minN?: number;
  /** z 계산의 표준편차 바닥값 (잡음이 큰 지표가 작은 흔들림에 '이상'이 되지 않게) */
  sdFloor?: number;
  /** 수집 범위가 좁아 0이 '없음'을 뜻하지 않는 경우 그 이유 (화면에 '범위 제한' 표시) */
  coverage?: string;
}

export const INDICATORS: IndicatorDef[] = [
  {
    id: "air.civil_airborne", label: "한반도 상공 항공기 수", group: "air", unit: "대", direction: "low", slots: 24,
    why: "공역 통제·항공사 우회는 민간이 가장 먼저 볼 수 있는 위기 징후다. 2017년 북한 미사일 시험 때 여러 항공사가 동해 항로를 우회했고, 전쟁 임박 시 NOTAM 발행과 운항 중단이 선행한다.",
    measure: "adsb.lol 공개 ADS-B 수신망에서 한반도 반경 250해리 안의 공중 항공기 수 (5분마다)",
    latency: "수 초~수십 초", caveats: "심야에는 원래 적다(시간대 기준선으로 보정). 안개·태풍, 수신기 장애, 명절에도 줄어든다.",
  },
  {
    id: "air.mil_airborne", label: "동북아 군용기 수 (ADS-B 노출)", group: "air", unit: "대", direction: "high", slots: 4,
    why: "증원 전력 전개·장거리 폭격기 비행·대규모 공중 급유는 작전 준비의 가시적 징후다.",
    measure: "adsb.lol /v2/mil 에서 위도 28~47°, 경도 117~147° 안의 군용 표시 항공기 수",
    latency: "수 초~수십 초", caveats: "군용기 다수는 트랜스폰더를 끈다. 보이는 건 '공개하기로 한 것'뿐이며, 한미 연합훈련(3월·8월) 기간엔 정상적으로 늘어난다.",
  },
  {
    id: "air.isr_airborne", label: "정찰·감시·급유기 수", group: "air", unit: "대", direction: "high", slots: 4, absolute: { elevated: 3, anomalous: 5 },
    coverage: "공개 신호(ADS-B, adsb.lol·adsb.fi 두 수신망)에 보이는 기체만 센다 — 정찰기는 흔히 신호를 끄고 비행한다",
    why: "RC-135S 코브라볼(미사일 추적), RC-135V/W, E-8, P-8, U-2, RQ-4 의 한반도 주변 집중 비행은 미사일 발사 임박 징후로 반복 보도됐다. WC-135(방사능 탐지)는 핵실험 전후에 전개된다.",
    measure: "군용기 중 기종 코드가 정찰·조기경보·해상초계·급유기인 것의 수와 목록",
    latency: "수 초~수십 초", caveats: "기종 코드만으로 RC-135와 WC-135, KC-135를 완전히 구분하지 못한다(목록의 등록번호·콜사인 확인 필요).",
  },
  {
    id: "sea.gfw_cn_change_pct", label: "서해 중국 선박 증감 (위성 AIS, 중국만의 변화)", group: "sea", unit: "%", direction: "low", slots: 1, absolute: { elevated: 30, anomalous: 50 },
    why: "'위기 직전 중국 어선이 먼저 빠진다'는 것은 OSINT 에서 자주 거론되는 가설이다(검증된 통계는 없다). 중국 당국이 자국 어선을 항구로 불러들이면 무언가를 미리 알았다는 간접 증거일 수 있다. 많은 것은 평소(가을 성어기), 갑자기 줄어드는 것이 신호다.",
    measure: "Global Fishing Watch 위성 AIS 선박 존재 데이터에서 서해 한가운데(경도 122.9~125.6°, 위도 34~38.6°, 양국 항구 제외)의 중국 국적 선박 체류시간 — 최근 3일 평균을 직전 14일 평균과 비교. 값은 '직전 2주 대비 변화'와 '다른 국적 선박 대비 변화' 중 감소폭이 작은 쪽(중국 배가 실제로 줄고 다른 배보다도 더 줄어야 음수가 커짐) (토큰 필요)",
    latency: "약 4~6일 (위성 자료 처리 4일 안팎 + 최근 3일 평균)", caveats: "태풍·강풍 귀항이나 위성 처리 지연은 모든 배를 함께 줄이므로 값에서 대부분 지워진다. 한국 어선이 더 많이 줄었으면 기상·조업 사정을 먼저 의심. 중국 휴어기(5/1~9/1)에는 원래 적다. AIS 를 끈 배, 식별번호를 규정대로 안 쓰는 배(국적 불명으로 잡힘)는 중국 수치에서 빠지고 '다른 배'에 섞인다 — 그래서 중국 어선이 국적 불명 배까지 한꺼번에 빠지면 '중국만의 변화'가 작게 보일 수 있어, 한국 배 변화와 함께 본다. 실시간이 아니라 추세용.",
  },
  {
    id: "seismic.nk_events_24h", label: "북한 지역 지진 (24시간)", group: "seismic", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "핵실험은 규모 4~6의 얕은 인공지진으로 나타난다(2006~2017년 6회 모두 USGS·기상청이 수 분 내 탐지).",
    measure: "USGS·EMSC 에서 북한 영역 규모 2.5 이상 지진 수", latency: "10~30분", caveats: "자연지진도 있다. 깊이·위치(풍계리 거리)로 구분한다.",
  },
  {
    id: "navwarn.korea_warnings", label: "한반도 주변 항행경보 수 (한·일·미)", group: "navwarn", unit: "건", direction: "high", slots: 1,
    why: "로켓 발사·사격훈련·GPS 교란 항행경보는 사건 '이전'에 공개되는 몇 안 되는 선행 신호다.",
    measure: "국립해양조사원 국내 항행경보 중 오늘 유효한 것(합참·해군·해경 해상사격훈련, 북한 발사 알림 등) + 일본 해상보안청 NAVAREA XI·미국 NGA 의 한반도 주변 유효 경보 수 (2026-11-01부터 세 곳 모두)",
    latency: "선행(수일 전)~수 시간", caveats: "매주 정례 해상사격훈련이 있어 평소에도 몇 건씩 있다 — 평소 대비로 본다. 경보 한 건에 사격장 수십 곳이 들어 있기도 하다.",
  },
  {
    id: "navwarn.launch_notice_active", label: "북한 발사 예고 항행경보", group: "navwarn", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 1 },
    why: "북한은 위성·로켓 발사 며칠 전 일본 해상보안청(NAVAREA XI 조정국)에 낙하 예상 구역을 통보해 왔다(2023년 5·8·11월: 서해 남서쪽 2곳 + 루손섬 동쪽 1곳). 공개 정보 중 '며칠 전'에 알 수 있는 드문 신호다.",
    measure: "일본 해상보안청 NAVAREA XI 원문(2026-11-01부터 직접) + 미국 NGA 경보 중, 로켓·미사일·위성 발사 경보이면서 북한 이름이 있거나 낙하 구역이 서해 한국 쪽(북위 33~39.5°, 동경 123.5~126.5°)·북한 동쪽 동해에 있는 것",
    latency: "사건 수일 전",
    caveats: "중국이 산둥 앞바다(서해 중국 쪽)에서 쏘는 해상 발사도 서해 경보로 뜬다 — 낙하 구역이 중국 쪽이면 '참고'로만 남긴다. 단거리 탄도미사일은 예고 없이 쏜다. 해상보안청 사이트가 막히면 시스템 상태에 '일부 출처 실패'가 뜬다.",
  },
  {
    id: "official.us_travel_level_kr", label: "미 국무부 한국 여행경보 단계", group: "official", unit: "단계", direction: "high", slots: 1, absolute: { elevated: 2, anomalous: 3 },
    why: "'펜타곤 피자 지수'의 공식 버전이다. 미국 정부가 자국민에게 위험을 알리는 가장 빠른 공개 채널이며, 3단계(재고) 이상이나 대사관 직원 철수 명령은 전쟁 위험을 정부가 인정했다는 뜻이다.",
    measure: "travel.state.gov RSS 의 South Korea 항목 Threat-Level (1~4)", latency: "발표 즉시~1시간", caveats: "평시 1단계. 변화 자체가 신호이므로 단계가 바뀌면 즉시 알린다.",
  },
  {
    id: "official.us_departure_kr", label: "미 국무부 주한 대사관 철수·출국 권고", group: "official", unit: "", direction: "high", slots: 1, absolute: { elevated: 0.5, anomalous: 1 },
    why: "정부가 자기 직원·가족과 자국민을 빼내는 것은 비공개 정보로 위험을 인정한 가장 무거운 행동이다. 2022년 1월 23일 미 국무부가 주우크라이나 대사관 가족 철수를 명령했고 한 달 뒤 침공이 시작됐다.",
    measure: "미 국무부 한국 여행경보 본문의 '자발적 출국 허용(authorized/voluntary departure)'·'철수 명령(ordered departure)'·'즉시 출국(depart immediately)' 문구 — 0 없음, 1 출국 허용, 2 철수 명령, 3 즉시 출국. 하나라도 있으면 '이상'(정부 영역 심각)",
    latency: "~1시간", caveats: "단계 숫자와 별개로 본문을 읽는다(2023년 10월 이스라엘처럼 단계는 그대로인데 출국만 허용한 경우 대비). 주한미군 가족 후송 '훈련'(해마다 봄·가을)은 여기에 나오지 않는다.",
  },
  {
    id: "official.uk_advice_security_flag", label: "영국 외무부 한국 여행권고 안보 경고", group: "official", unit: "", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 1 },
    why: "영국 FCDO 는 안보 상황 변화 시 'Warnings' 섹션을 갱신한다. 미국과 독립된 두 번째 서방 정부 판단이다.",
    measure: "gov.uk South Korea 여행권고 Atom 의 최신 갱신 요약에 북한·군사·긴장·출국 관련 문구 포함 여부", latency: "발표 즉시~1시간", caveats: "입국 절차 등 일상 갱신이 대부분이다.",
  },
  {
    id: "official.ca_level_kr", label: "캐나다 정부 한국 여행경보 단계", group: "official", unit: "단계", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "미국과 별개로 판단하는 서방 정부. 0(평소 주의)에서 올리는 것은 정부가 비공개 정보로 위험을 인정했다는 뜻이다.",
    measure: "캐나다 외교부 오픈데이터 advisory-state (0 평소 주의 · 1 높은 주의 · 2 불필요한 여행 자제 · 3 모든 여행 자제)", latency: "발령 후 1시간 안", caveats: "치안·재난 사유로도 오른다. 갱신 문구를 확인한다.",
  },
  {
    id: "official.de_warning_kr", label: "독일 외무부 한국 경고", group: "official", unit: "", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "독일은 여행 '경고'(Reisewarnung)를 매우 아껴 쓴다. 한국에 경고가 붙는 것 자체가 이례적이다.",
    measure: "독일 외무부 오픈데이터 — 0 없음 · 1 부분·상황 부분 경고 · 2 전면·상황 경고", latency: "발령 후 1시간 안", caveats: "재난(지진·태풍) 경고일 수도 있다.",
  },
  {
    id: "official.jp_risk_level_kr", label: "일본 외무성 한국 위험 레벨", group: "official", unit: "단계", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "한국에 자국민이 가장 많이 머무는 나라 중 하나. 한반도 유사시 대피 계획을 가진 일본 정부가 레벨을 매기면 강한 신호다.",
    measure: "외무성 해외안전정보 오픈데이터 — 한국 내 지역에 걸린 가장 높은 위험 레벨 (0 없음 ~ 4 대피 권고)", latency: "발령 후 1시간 안", caveats: "평시에는 0. 감염증 레벨은 따로다.",
  },
  {
    id: "official.jp_embassy_alert", label: "주한 일본 공관 영사 메일 (정세 경고)", group: "official", unit: "단계", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "주한 일본대사관은 북한 미사일 발사 몇 분 뒤 자국민에게 메일을 보낸다(2026-10-29: 연합뉴스 속보 3분 뒤). 발사 보고가 아니라 '정세 주의'나 '출국 권고'가 나오면 정부가 상황 자체를 위험하게 본다는 뜻이다.",
    measure: "최근 7일 영사 메일 제목 — 0 발사 보고뿐/없음 · 1 한반도 정세 주의 환기 · 2 출국·대피 권고", latency: "수 분", caveats: "태풍·지진 안내도 같은 메일로 나간다(북한·정세 문구가 있을 때만 센다).",
  },
  {
    id: "official.civil_defense_alerts_6h", label: "정부 재난문자: 민방공·북한 관련 (6h)", group: "official", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "경계·공습경보와 북한 관련 재난문자는 정부가 국민 휴대폰으로 직접 보내는 가장 빠른 공식 경보다(2023-05-31 서울 경계경보, 2024년 북한 오물풍선 문자).",
    measure: "국민재난안전포털 재난문자(전국, 5분마다 최신 10건, 키 불필요) 중 경계·공습경보, 민방공·민방위 경보, 북한·미사일·발사체·대남 풍선 관련 문자 수 — 최근 6시간, 같은 문구는 1건, 훈련 문자 제외",
    latency: "수 분",
    caveats: "오발령도 있었다(2023-05-31 서울 경계경보 → 행정안전부 '오발령' 정정). 전국에 한꺼번에 수백 건이 나가면 5분 사이 최신 10건만 보이지만 같은 문구라 판단에는 지장 없다. 전쟁 판정의 정부 영역에는 넣지 않고(같은 사건을 두 번 세지 않게) 사건 경보로 바로 알린다.",
  },
  {
    id: "official.mnd_provocation_24h", label: "국방부 보도자료: 북한 도발 관련 (24h)", group: "official", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "정부 공식 발표는 가장 신뢰도 높은 확인이다. 다만 합참 기자단 문자보다 수 시간 늦다.",
    measure: "정책브리핑(korea.kr) 국방부 보도자료 제목 중 미사일·포격·경보 관련 건수", latency: "수 시간", caveats: "훈련·방산 보도자료가 대부분. 분류기로 거른다.",
  },
  {
    id: "border.incidents_72h", label: "접경 사건 보도 (72h)", group: "border", unit: "건", direction: "high", slots: 1, absolute: { elevated: 2, anomalous: 4 },
    why: "국지 충돌은 접경에서 시작된다 — 2015년 8월 지뢰 폭발 → 확성기 재개 → 북한의 확성기 포격 → 포격전, 2014년 10월 대북전단 고사총 사격. 확성기·경고사격·군사분계선 침범이 잦아지면 우발 충돌 위험이 오른다.",
    measure: "연합뉴스 제목 중 확성기·경고사격·군사분계선 침범·지뢰·오물풍선·전단·GP 총격 보도 (북한·접경 문맥, 같은 기사의 종합·후속보는 한 번만)", latency: "수 분",
    caveats: "보도 건수라 언론의 관심에 흔들린다. 관광·축제·6·25 유해발굴 기사는 뺀다. 군이 '미확인'이라고 한 보도도 센다(제목을 확인할 것).",
  },
  {
    id: "rhetoric.nk_statements_24h", label: "북한 담화·성명 보도 (24h)", group: "rhetoric", unit: "건", direction: "high", slots: 1,
    why: "김여정·국방성·외무성 담화의 빈도 증가는 도발 전 '명분 쌓기' 단계에서 반복 관찰됐다(2022~2024년 발사 전 담화 집중).",
    measure: "연합뉴스 북한 섹션 제목 중 담화·성명·대변인·경고·위협·비난 포함 기사 수(24시간, 같은 기사의 여러 판은 한 번)", latency: "보도 후 수 분", caveats: "국제 행사·한미훈련 시기에 자연 증가.",
  },
  {
    id: "rhetoric.nk_hostile_24h", label: "북한 적대 수사 강도 (24h)", group: "rhetoric", unit: "건", direction: "high", slots: 1,
    why: "'핵·선제·초토화·보복·전쟁' 같은 단어의 급증은 위협 수위 상승의 정량 지표다.",
    measure: "연합뉴스 북한 섹션 + NK News 제목에서 적대 핵심어가 포함된 기사 수(24시간, 같은 기사의 여러 판은 한 번)", latency: "보도 후 수 분", caveats: "분석 기사·외신 해설도 포함될 수 있다.",
  },
  {
    id: "media.breaking_nk_1h", label: "북한 관련 속보 건수 (1h)", group: "media", unit: "건", direction: "high", slots: 24, absolute: { elevated: 2, anomalous: 4 },
    why: "속보가 몰리는 것은 '무언가 진행 중'이라는 가장 단순하고 빠른 신호다.",
    measure: "연합뉴스 [속보]·[1보] 중 북한·군사 관련 건수(최근 60분)", latency: "1분", caveats: "정치 뉴스에도 속보가 몰린다. 내용 분류와 함께 본다.",
  },
  {
    id: "media.war_talk_24h", label: "한반도 '전쟁' 언급 보도 (24h)", group: "media", unit: "건", direction: "high", slots: 1,
    why: "언론이 한반도 상황을 '전쟁·교전·확전'으로 부르기 시작하면 국면이 바뀐 것이다. 다만 언론은 공포를 키우기도 한다.",
    measure: "연합뉴스 제목 중 전쟁·전면전·확전·교전·동원령·대피령 + 북한·남북·한반도 문맥 (6·25 기념·다른 나라 전쟁·무역전쟁 제외)", latency: "수 분", caveats: "북한 담화를 인용한 제목('전쟁 불사')도 잡힌다. 정부·돈의 움직임과 함께 볼 때만 의미가 있다.",
  },
  {
    id: "psych.wiki_korea_attention", label: "세계의 한반도 관심 (위키백과 조회수, 평소 대비)", group: "psych", unit: "%", direction: "high", slots: 1, absolute: { elevated: 160, anomalous: 250 },
    why: "사람들이 '한국전쟁·DMZ·조선인민군'을 찾아보기 시작하면 위기를 체감한다는 뜻이다. 대중은 보통 정부·돈보다 늦게 움직인다.",
    measure: "영어·일본어·한국어 위키백과 한반도 문서 9개의 어제 조회수 ÷ 직전 28일 중앙값 — 그 배율들의 중앙값 (여러 문서가 함께 늘어야 커진다)", latency: "약 1일", caveats: "인물 뉴스(김정은 동정)·영화·기념일에도 는다. 한 문서만 튀면 무시한다.",
  },
  {
    id: "psych.naver_war_search", label: "한국 사람들의 전쟁 불안 (네이버 검색, 평소 대비)", group: "psych", unit: "%", direction: "high", slots: 1, absolute: { elevated: 200, anomalous: 400 },
    why: "2023-05-31 서울 경계경보 오발령 때 '대피소' 검색이 순식간에 몰렸다. 한국 사람들의 불안은 검색량에 가장 먼저, 가장 크게 드러난다.",
    measure: "네이버 데이터랩 '전쟁 불안·대피·생존 준비' 검색어 묶음의 어제 검색량 ÷ 직전 28일 중앙값 중 가장 큰 값", latency: "약 1일", caveats: "언론발 공포·영화·게임에도 움직인다. 정부·돈이 조용한데 이것만 오르면 '언론발 불안'으로 읽는다. 키 필요.",
  },
  {
    id: "market.usdkrw_change_pct", label: "원·달러 환율 변동 (전일 대비 %)", group: "market", unit: "%", direction: "high", slots: 1, absolute: { elevated: 1.5, anomalous: 3 },
    why: "지정학 위험은 원화 약세로 즉시 반영된다. 뉴스 없는 시간대의 급변은 시장이 무언가를 먼저 알았다는 신호일 수 있다.",
    measure: "Yahoo Finance KRW=X 현재가의 전일 종가 대비 변동률(절대값)", latency: "수 분", caveats: "금리·달러 강세 등 경제 요인이 대부분. 다른 징후와 겹칠 때만 의미 있다.",
  },
  {
    id: "nk.fuel_price_change_pct", label: "북한 장마당 휘발유값 (직전 8주 대비 %)", group: "nkinside", unit: "%", direction: "high", slots: 1, absolute: { elevated: 50, anomalous: 70 },
    why: "전쟁을 준비하면 군이 연료를 비축해 장마당 연료값이 뛸 것이라는 논리다. 북한 안쪽을 공개적으로 볼 수 있는 거의 유일한 창이다. 직접적인 전쟁 전례는 없다.",
    measure: "아시아프레스 매주 조사 휘발유 kg당 값 ÷ 직전 8주 중앙값 (2017~2026 분포: 상위 2.5% 약 +59%, 1% 약 +73% → +50% 상승, +70% 이상)", latency: "약 1주",
    caveats: "제재(2017)·국경 봉쇄(2020)·국제 유가(2026-03 미국-이란 전쟁 +75%)·밀수 단속(2026-09)으로도 크게 뛴다. 판정에는 북한 쪽 영역에 최대 1점만 준다.",
  },
  {
    id: "nk.rice_price_change_pct", label: "북한 장마당 쌀값 (직전 8주 대비 %)", group: "nkinside", unit: "%", direction: "high", slots: 1, absolute: { elevated: 30, anomalous: 45 },
    why: "주민이 불안하면 쌀을 사재기한다. 다만 북한 쌀값은 수확철·작황·환율로 늘 크게 움직인다.",
    measure: "아시아프레스 매주 조사 쌀 kg당 값 ÷ 직전 8주 중앙값 (2017~2026: 상위 2.5% 약 +34%, 1% 약 +47%)", latency: "약 1주",
    caveats: "2025년 10월 +111%(최대)처럼 식량 사정만으로도 뛴다. 판정에는 연료와 합쳐 최대 1점.",
  },
  {
    id: "nk.usd_rate_change_pct", label: "북한 장마당 달러값 (직전 8주 대비 %)", group: "nkinside", unit: "%", direction: "high", slots: 1, absolute: { elevated: 37, anomalous: 45 },
    why: "북한 돈이 갑자기 약해지면 체제 불안·외화 통제 신호다. 참고용 (판정에 넣지 않음).",
    measure: "아시아프레스 매주 조사 1달러 값(북한 원) ÷ 직전 8주 중앙값", latency: "약 1주", caveats: "2024~2026년 북한 원화가 계속 약해져 큰 폭 상승이 잦다.",
  },
  {
    id: "nk.pyongyang_lights_pct", label: "평양 밤 불빛 (위성, 평소 대비 %)", group: "nkinside", unit: "%", direction: "low", slots: 1, absolute: { elevated: 25, anomalous: 40 },
    why: "전쟁에 들어간 도시는 불이 꺼진다(등화관제·발전소 피격·연료 부족). 같은 방식으로 재면 키이우는 2022년 침공 사흘 뒤 −26%, 가자는 2023년 발전소가 멈춘 이틀 뒤 −37%였다. 반면 2013년 '전시상태'·2015년 '준전시상태'·2017년·2024년 10월 북한 위기 때 평양 불빛은 평소 범위였다 — 미리 알려 주기보다 '전쟁 태세에 들어갔다'를 며칠 안에 확인해 주는 신호.",
    measure: "NASA 위성 두 대(VIIRS 야간 밴드, 구름 빈틈 메움·달빛 보정 일일 영상)로 평양 중심 약 12×15km 평균 밝기를 재고, 위성마다 '최근 5일 중 두 번째로 밝은 밤' ÷ '직전 28일의 같은 값 중앙값' → 평균 (2024-11~2026-10 두 위성 평균: 가장 크게 줄어든 날 −20%, 한 위성만으로는 2017년 12월 −28%)",
    latency: "1~3일 (위성 처리 약 2일 + 5일 창)",
    caveats: "겨울 전력난·눈·짙은 안개로도 줄고, 명절(당 창건일 등)엔 밝아진다. 비교용 중국 단둥이 같이 줄면 위성·날씨 탓일 가능성. 판정에는 북한 쪽 영역에 최대 1점.",
  },
  {
    id: "elite.foreign_net_kospi", label: "외국인 투자자 코스피 순매수 (5거래일, 평소 대비)", group: "elite", unit: "z", direction: "low", slots: 1, absolute: { elevated: 2, anomalous: 3 },
    why: "글로벌 기관 투자자는 자체 정보망을 갖고 돈을 건다는 가정으로 넣었다. 2003~2026년 자료로 검증한 결과 외국인은 북한 사건을 미리 알고 팔지 않았다(사건 34건 중 직전 5일 대량 매도 2건, 아무 날이나 고른 비율과 같음). 사건 뒤 5일 대량 매도는 평소의 약 2.5배로 잦아, 시장이 사건을 얼마나 무겁게 받아들이는지 보는 '반응' 지표로 쓴다.",
    measure: "한국은행 경제통계(802Y001)의 외국인 코스피 순매수 — 최근 5거래일 합계를 직전 120거래일의 5일 합계 분포와 비교한 z (−2 이하 상승, −3 이하 이상)", latency: "약 1일 (전 거래일까지)", caveats: "z −2 이하 매도는 해마다 2~3번, −3 이하는 1번꼴로 오고 대부분 세계 증시·반도체·미국 금리 때문이다(2007 서브프라임, 2013 긴축 발작, 2020 코로나, 2025 미국 관세). 그래서 전쟁 모델에서 혼자서는 '주의'까지만 준다. 키 필요.",
  },
  {
    id: "elite.kr_bizjets", label: "한국 기업 제트기 출국 (어제, 평소 대비)", group: "elite", unit: "%", direction: "high", slots: 1, absolute: { elevated: 250, anomalous: 400 },
    why: "재벌·고위층은 정보를 먼저 듣는다. 2022년 2월 러시아 침공 열흘쯤 전 우크라이나 부유층·정치인들이 전세기·개인 제트기로 키이우를 떠났다는 현지 보도가 있었다.",
    measure: "공개 항공기 위치 신호(ADS-B)에서 한국 등록(HL) 업무용 제트기가 한국 상공에서 낮은 고도로 상승 중인 것을 '출국'으로 세어, 어제 대수를 지난 4주 중앙값과 비교 (누가 탔는지는 알 수 없고 대수만 센다)", latency: "약 1일",
    caveats: "출장·정비 비행이 대부분이다. 4대 미만 차이는 판단하지 않는다. 수신기가 닿지 않는 공항 근처 이륙은 놓칠 수 있다. 1주일은 쌓여야 평소를 안다.",
  },
  {
    id: "market.kr_equity_rel_pct", label: "한국 증시만의 움직임 (일본·대만 대비 %p)", group: "market", unit: "%p", direction: "low", slots: 1, absolute: { elevated: 2, anomalous: 4 },
    why: "전쟁 위험은 돈이 먼저 안다. 세계 증시 전체가 빠진 날이 아니라 '한국만' 빠진 날이 신호다. 이웃 증시와 비교해야 세계 증시 하락과 한반도 위험을 가를 수 있다.",
    measure: "코스피 일간 변동률 − 닛케이·대만 가권 평균 변동률. 음수 = 한국만 더 빠짐", latency: "장중 수 분 (휴장일엔 전 거래일 값)", caveats: "반도체 업황·환율·국내 정치(2024년 12월 비상계엄 직후에도 하락)로도 빠진다. 북한 뉴스와 시점을 대조한다.",
  },
  {
    id: "market.defense_rel_pct", label: "방산주만의 움직임 (코스피 대비 %p)", group: "market", unit: "%p", direction: "high", slots: 1, absolute: { elevated: 4, anomalous: 8 },
    why: "투자자가 무력 충돌 가능성을 가격에 넣으면 방산주가 시장보다 먼저 오른다.",
    measure: "한화에어로스페이스·LIG넥스원·현대로템 평균 일간 변동률 − 코스피", latency: "장중 수 분", caveats: "수출 계약·실적 발표로 더 자주 오른다. 북한 관련 뉴스와 같이 움직일 때만 의미가 있다.",
  },
  {
    id: "market.pm_war_prob", label: "예측시장: 북한의 한국 침공 가격 (지난 30일 대비)", group: "market", unit: "%", direction: "high", slots: 1, absolute: { elevated: 150, anomalous: 250 },
    why: "돈을 건 사람들이 매기는 전쟁 가능성. 가격이 한 달 평소보다 크게 오르면 사람들이 새 정보·사건을 가격에 넣고 있다는 뜻이다(2026-10: 2.4% → 5.1%). 만기가 가까울수록 원래 떨어져야 하는 가격이라 오름은 더 무겁다.",
    measure: "Polymarket 한반도 침공·전쟁 시장 중 거래가 가장 많은 것(만기 2주 이상)의 최근 3개 일별 가격의 가운데 값 ÷ 지난 30일 중앙값 (100 = 평소). 큰 거래 한 건에 뒤집히지 않게 가운데 값을 쓴다(10/31 1시간 만에 5.1% → 1.4%)", latency: "실시간", caveats: "수 % 대 가격은 실제보다 높게 매겨지는 경향(롱샷 편향·자금 묶임 비용). 거래가 얇으면 소수가 가격을 흔든다. 절대값보다 변화를 본다.",
  },
  {
    id: "internet.kp_outage_alerts_24h", label: "북한 인터넷 장애 경보 (24h)", group: "internet", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 3 },
    why: "북한 외부망 단절은 사이버 공격·내부 통제 강화·정전과 연관돼 왔다(2022년 1월 연쇄 장애 등). 내부 이상의 간접 지표다.",
    measure: "IODA(조지아공대 인터넷 장애 탐지) 국가 KP 경보 수(24시간)", latency: "수 분~1시간", caveats: "북한 인터넷은 원래 불안정하다.",
  },
  {
    id: "gnss.bad_ratio_korea", label: "GPS 교란 비율 · 한반도 전체 (전일)", group: "gnss", unit: "%", direction: "high", slots: 1, absolute: { elevated: 2, anomalous: 5 },
    why: "북한은 2010년대부터 수도권·서북도서에 GPS 교란을 반복했고, 교란 강화는 긴장 고조와 함께 나타났다.",
    measure: "GPSJam 일간 데이터(항공기 ADS-B 항법 정확도 저하 비율)를 한반도 H3 셀로 집계", latency: "약 1일 (전일 데이터)", caveats: "하루 지연. 러시아·중국발 교란과 구분되지 않는다.",
  },
  {
    id: "gnss.bad_ratio_westsea", label: "GPS 교란 비율 · 서해 (전일)", group: "gnss", unit: "%", direction: "high", slots: 1, absolute: { elevated: 2, anomalous: 5 },
    why: "서해 5도·인천공항 접근로는 북한 GPS 교란의 주 표적이었다(2024년 5~6월 연속 교란).", measure: "GPSJam 서해 셀 집계", latency: "약 1일", caveats: "항공기 통과가 적은 셀은 표본이 작다.",
  },
  {
    id: "gnss.bad_ratio_north", label: "GPS 교란 비율 · 북한 상공 (전일)", group: "gnss", unit: "%", direction: "high", slots: 1, absolute: { elevated: 2, anomalous: 5 },
    coverage: "북한 상공은 지나는 비행기가 적어 표본이 적다(2026-10-30: 706건, 한반도 전체 2만7천 건)",
    why: "북한 상공을 지나는 항공기가 교란을 겪으면 북한 내부에서 전자전 장비가 가동 중이라는 뜻이다.", measure: "GPSJam 북한 셀 집계", latency: "약 1일", caveats: "북한 상공 통과 항공기가 매우 적다.",
  },
  {
    id: "thermal.nk_fires_24h", label: "북한 땅 위성 열점 (24h)", group: "thermal", unit: "건", direction: "high", slots: 1, sdFloor: 10,
    why: "NASA 위성(VIIRS)은 화재·연소·대형 엔진 시험의 열을 3시간 이내에 공개한다. 발사장·엔진시험장 인근 열점은 준비 활동의 단서다.",
    measure: "NASA FIRMS 열점 중 북한 경계 안(압록강·두만강·군사분계선) 최근 24시간 건수 (NOAA-20, 없으면 Suomi NPP, 키 필요)", latency: "3시간 안팎",
    caveats: "봄가을 농업 소각·산불이 대부분이다. 위치(발사장 거리)로 걸러야 한다. 2026-11-01 전에는 같은 사각형의 중국 동북부·한국 수도권 열점까지 세어 값이 수십 배 컸다(10/31 상자 1,237건 중 북한 땅 1건).",
  },
  {
    id: "thermal.launch_site_hotspots", label: "발사장·시험장 인근 열점", group: "thermal", unit: "건", direction: "high", slots: 1, absolute: { elevated: 1, anomalous: 2 },
    why: "동창리·신포·풍계리·마군포 엔진시험장 등 알려진 시설 12km 이내의 열점은 일반 화재보다 의미가 크다.",
    measure: "FIRMS 열점 중 알려진 미사일·핵 시설 반경 12km 이내 건수", latency: "3시간 안팎", caveats: "주변 농경지 소각일 수 있다. 38 North 등 위성 분석과 대조한다.",
  },
];

export const INDICATOR_BY_ID: Record<string, IndicatorDef> = Object.fromEntries(INDICATORS.map((d) => [d.id, d]));

export const GROUP_LABEL: Record<IndicatorGroup, string> = {
  air: "항공", sea: "해상", seismic: "지진", navwarn: "항행경보", official: "정부 공식", rhetoric: "북한 수사", media: "언론 템포", social: "SNS", market: "시장", internet: "인터넷", gnss: "GPS 교란", thermal: "위성 열점", psych: "사람들의 관심", elite: "엘리트·큰손", border: "접경 사건", nkinside: "북한 내부 (장마당·불빛)",
};

export interface Baseline {
  mean: number;
  /** 분산 */
  var: number;
  n: number;
}

/** 기준선 구간 키 (한국시간 기준) */
export function slotKey(def: IndicatorDef, at: number): string {
  const kstHour = new Date(at + 9 * 3600_000).getUTCHours();
  if (def.slots === 24) return `h${kstHour}`;
  if (def.slots === 4) return `q${Math.floor(kstHour / 6)}`;
  return "d";
}

export const DEFAULT_MIN_N = 10;

/** 지수가중 평균·분산 갱신. 표본이 적을 때는 단순 평균처럼 빨리 수렴한다. */
export function updateBaseline(prev: Baseline | undefined, value: number, alpha = 0.1): Baseline {
  if (!prev) return { mean: value, var: 0, n: 1 };
  const a = Math.max(alpha, 1 / (prev.n + 1));
  const diff = value - prev.mean;
  const mean = prev.mean + a * diff;
  const v = (1 - a) * (prev.var + a * diff * diff);
  return { mean, var: v, n: prev.n + 1 };
}

/** 관측값을 기준선과 비교해 상태를 판정한다 */
export function evaluate(def: IndicatorDef, value: number, at: number, baseline: Baseline | undefined, meta?: Record<string, unknown>): Reading {
  const minN = def.minN ?? DEFAULT_MIN_N;
  const reading: Reading = { indicator: def.id, value, at, n: baseline?.n ?? 0, state: "learning", meta };
  if (baseline) {
    // 분산이 0에 가까울 때 z 가 폭발하지 않도록 바닥값을 둔다
    const sd = Math.max(Math.sqrt(baseline.var), Math.abs(baseline.mean) * 0.15, def.sdFloor ?? (def.unit === "%" ? 0.2 : 1));
    reading.baseline = baseline.mean;
    reading.sd = sd;
    reading.z = (value - baseline.mean) / sd;
  }
  if (def.absolute) {
    // 절대 임계값은 '나쁜 방향' 크기로 본다: low 면 감소폭(음수의 크기), high 면 값 그대로, both 면 절대값
    const v = def.direction === "low" ? -value : def.direction === "high" ? value : Math.abs(value);
    if (v >= def.absolute.anomalous) reading.state = "anomalous";
    else if (v >= def.absolute.elevated) reading.state = "elevated";
    else reading.state = "normal";
    return reading;
  }
  if (!baseline || baseline.n < minN) return reading; // learning
  const z = reading.z!;
  const bad = def.direction === "high" ? z : def.direction === "low" ? -z : Math.abs(z);
  reading.state = bad >= 3 ? "anomalous" : bad >= 2 ? "elevated" : "normal";
  return reading;
}

export const STATE_LABEL: Record<IndicatorState, string> = {
  normal: "정상", elevated: "상승", anomalous: "이상", learning: "학습 중", unavailable: "측정 불가",
};
