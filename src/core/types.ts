// 공통 데이터 모델. 모든 시각은 epoch milliseconds(UTC)로 저장한다.

/** 출처의 성격. 공식(정부·국제기구 발령) / 센서(계측·관측 데이터) / 언론 */
export type SourceKind = "official" | "sensor" | "media";

export type Category =
  | "air_raid_alert" // 공습·경계경보 (민방위 경보)
  | "missile" // 탄도미사일·발사체
  | "artillery" // 포격·사격 도발
  | "nuclear_test" // 핵실험 의심 지진파
  | "seismic_anomaly" // 북한 지역 얕은 지진 (자연지진 가능성 포함)
  | "launch_notice" // 로켓·위성 발사 항행경보, 사격구역 설정
  | "gps_interference" // GPS/GNSS 전파 교란
  | "airspace_anomaly" // 항공 교통량 급감 등 공역 이상
  | "aviation_emergency" // 비상 스쿼크(7500/7600/7700)
  | "civil_alert_other"; // 기타 군사 관련 정부 안내

export interface Signal {
  /** 출처 고유 ID 기반 지문(중복 제거 키) */
  id: string;
  source: string; // sources.ts 의 SourceId
  sourceKind: SourceKind;
  category: Category;
  title: string;
  summary: string;
  url?: string;
  lat?: number;
  lon?: number;
  /** 사건 발생 시각(원천 데이터가 제공할 때만). 없으면 undefined */
  eventTime?: number;
  /** 원천 데이터 공개 시각. 원천이 제공하지 않으면 undefined (감지 시각이 상한) */
  publishedTime?: number;
  /** 이 시스템이 처음 수집한 시각 */
  detectedTime: number;
  /** 0-100. 카테고리 기본값 + 규칙 보정 */
  severity: number;
  /** 훈련·시험 발령으로 판단됨 */
  drill?: boolean;
  /** 오발령 정정·해제 메시지 */
  retraction?: boolean;
  /** 언론 신호가 공식 발표(합참·국방부·日방위성 등)를 인용함 */
  citesOfficial?: boolean;
  /** 속보(Breaking/Flash) 제목 */
  breaking?: boolean;
  raw?: unknown;
}

export type EventStatus = "CONFIRMED" | "CORROBORATED" | "UNVERIFIED";

export interface CrisisEvent {
  id: string;
  group: string;
  categories: Category[];
  status: EventStatus;
  severity: number;
  title: string;
  signalIds: string[];
  sources: string[];
  /** 가장 이른 사건 발생 시각 */
  eventTime?: number;
  /** 가장 이른 원천 공개 시각 */
  firstPublishedTime?: number;
  /** 시스템이 첫 신호를 감지한 시각 */
  firstDetectedTime: number;
  /** 같은 사건에 대한 첫 언론 보도 시각 (성능 측정용) */
  firstMediaTime?: number;
  /** 알림 발송 시각 (최초) */
  alertedTime?: number;
  drill: boolean;
  retracted: boolean;
  /** 판정 근거: 1차 원천(공식·센서) / 공식발표를 인용한 복수 언론 / 언론만 */
  basis: "primary" | "official_quote" | "media";
  /** 공식발표를 인용한 [속보]가 포함됨 (단일 출처 즉시 알림 대상) */
  breaking: boolean;
  lat?: number;
  lon?: number;
}

export interface AlertRecord {
  eventId: string;
  sentAt: number;
  status: EventStatus;
  severity: number;
  title: string;
  body: string;
  channel: string;
  ok: boolean;
  error?: string;
}

/** 수치형 징후 관측값 (indicators.ts 카탈로그의 id 사용) */
export interface Metric {
  indicator: string;
  value: number;
  meta?: Record<string, unknown>;
}

export type IndicatorState = "normal" | "elevated" | "anomalous" | "learning" | "unavailable";

/** 기준선과 비교된 관측값 */
export interface Reading {
  indicator: string;
  value: number;
  at: number;
  baseline?: number;
  sd?: number;
  z?: number;
  /** 이 시간대 기준선에 반영된 표본 수 */
  n: number;
  state: IndicatorState;
  meta?: Record<string, unknown>;
}

export interface CollectResult {
  source: string;
  ok: boolean;
  signals: Signal[];
  error?: string;
  skipped?: string;
  fetchedAt: number;
  /** 원천에서 받은 항목 수(필터 전) */
  rawCount: number;
  /** 소스별 부가 측정값 (예: opensky airborne 대수) */
  meta?: Record<string, number>;
  /** 징후판에 올라가는 수치 관측값 */
  metrics?: Metric[];
}

export interface Env {
  SAFETYDATA_API_KEY?: string;
  OPENSKY_CLIENT_ID?: string;
  OPENSKY_CLIENT_SECRET?: string;
  NTFY_TOPIC?: string;
  NTFY_SERVER?: string;
  NTFY_TOKEN?: string;
  PUSHOVER_TOKEN?: string;
  PUSHOVER_USER?: string;
  DASHBOARD_URL?: string;
  /** 쉼표로 구분된 비활성화 소스 목록 */
  DISABLED_SOURCES?: string;
  /** aisstream.io 무료 키 — 서해 선박(AIS) 관측 */
  AISSTREAM_API_KEY?: string;
  /** NASA FIRMS 무료 MAP_KEY — 위성 열 이상(화재·연소) 관측 */
  FIRMS_MAP_KEY?: string;
}
