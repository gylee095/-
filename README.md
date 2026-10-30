# Korea Early Warning — 한반도 위기 조기감지 시스템

공개 정보(OSINT)만으로 한반도의 군사적 위기 신호를 감지하고, **중요한 새 사건만** 아이폰으로 알리는 개인용 시스템.

- 공식 확인(재난문자·항행경보)과 미확인 신호(센서·단일 출처)를 구분해 표시
- 사건마다 **발생 / 원천 공개 / 감지 / 알림 / 첫 언론 보도** 시각 기록 → "뉴스보다 빠른가"를 측정값으로 검증
- 단일 이상징후로 전쟁 임박을 판단하지 않음 (종합 수준은 '동시에 이상이 관측된 영역 수'일 뿐)

> 대피 등 실제 행동은 반드시 정부 공식 안내(긴급재난문자, 국민재난안전포털)를 따르세요.

## 구조: 빠른 센서 + 에이전트 분석가

```
                ┌──────────── Cloudflare Worker (5분 크론, 무료) ────────────┐
 공개 소스 ───▶ │ 수집기 → 중복제거 → 교차검증 → 알림정책 → ntfy/Pushover │──▶ 📱 iPhone
 재난문자·지진   │                   │ D1 (사건·신호·알림 이력)              │
 항행경보·ADS-B  │  /  모바일 대시보드   /api/state  /api/run  /api/notify     │
 언론(기준선)    └──────────────────────────▲─────────────────────────────────┘
                                            │ HTTPS (AGENT_TOKEN)
          ┌─────────────── Claude Code 예약 작업 (매시간) ───────────────┐
          │ /kew-scan  →  MCP 서버 korea-early-warning                    │
          │   run_cycle · get_state · fetch_source · add_note · send_alert │
          │   여러 영역 사건의 '조합'을 해석해 노트·추가 알림              │
          └───────────────────────────────────────────────────────────────┘
```

- **왜 둘로 나눴나**: Claude 예약 작업은 최소 간격이 1시간이라 그것만으로는 뉴스보다 빠를 수 없다. 탐지·알림은 5분 크론 Worker가 결정론적으로 하고, Claude 에이전트는 매시간 MCP 도구로 상태를 읽어 **교차 해석·감시 공백 점검·요약**을 맡는다.
- Worker 없이도 동작: `KEW_API_URL`이 없으면 MCP 서버가 로컬 JSON 파일에 상태를 저장하고 직접 수집·알림한다.

## MVP 범위 (v0.1)

| 구분 | 포함 |
|---|---|
| 소스 | 행안부 긴급재난문자, USGS, EMSC, NGA 항행경보, OpenSky, GDELT, 언론 RSS ([검증표](docs/SOURCES.md)) |
| 탐지 | 공습·경계경보, 미사일, 포격, 핵실험 의심 지진, 발사 예고 항행경보, GPS 교란 경보, 비상 스쿼크, 공역 교통량 급감 |
| 검증 | 출처 ID 기반 중복 제거 + 내용 지문 중복 제거, 그룹·시간창·거리 기반 클러스터링, CONFIRMED/CORROBORATED/UNVERIFIED 판정 |
| 오탐 억제 | 지역 필터, 심발·소규모 지진 제외, 훈련 문자 감쇠, 오발령 정정 추적, 언론 단독 사건 알림 금지, 단일 미확인은 심각도 85+만 |
| 알림 | 신규/상태 상향/심각도 +15/정정만 발송, 시간당 5건 한도, 실패 시 3회 재시도 |
| 화면 | 모바일 대시보드(다크모드), 사건별 출처·시각, 소스 상태·지연, 뉴스 대비 리드타임, 에이전트 노트 |
| 제외 | NAVAREA XI·일본 방위성·합참 웹 변경 감지, NOTAM, GPSJam 일간 분석 → 2단계 |

## 빠른 시작 (로컬)

```bash
npm ci
npm test                     # 픽스처로 탐지·알림·오탐 억제 검증 (20개 테스트)
npm run typecheck

# 데모 데이터로 대시보드 미리보기
KEW_DATA=data/demo.json npx tsx scripts/seed-demo.ts
KEW_DATA=data/demo.json npx tsx src/cli.ts preview   # → data/preview.html

# 실데이터 1회 감시 (푸시 없이)
npm run scan:dry
```

Claude Code에서 이 저장소를 열면 `.mcp.json`의 `korea-early-warning` MCP 서버가 연결되고 `/kew-scan`으로 감시 절차를 실행할 수 있다.

## 문서
- [docs/SOURCES.md](docs/SOURCES.md) — 데이터 소스 검증표, MCP 서버 조사, 지연 표기 원칙
- [docs/DEPLOY.md](docs/DEPLOY.md) — 배포(Cloudflare/Cloud Run), 비밀값, 아이폰 푸시, Claude 예약 작업, 운영·장애 대응

## 디렉터리
```
src/core/        수집기·분류기·상관분석·알림정책·저장소 (Worker/Node 공용)
src/worker/      Cloudflare Worker (크론, D1, 대시보드, API)
src/mcp/         MCP 서버 (에이전트용 도구)
src/cli.ts       로컬/서버 실행 CLI
test/            vitest + fixtures
.claude/commands/kew-scan.md   에이전트 정기 감시 절차
```
