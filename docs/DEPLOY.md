# 배포·운영 가이드

## 0. 비용 요약

| 구성 | 권장 | 월 비용 |
|---|---|---|
| 수집·알림 | Cloudflare Workers + Cron(5분) + D1 | 무료 플랜 범위 내 (요청 ~300/일, D1 쓰기 ~수만/일). 무료 플랜 CPU 10ms/호출 한도에 걸리면 Workers Paid **$5** |
| 아이폰 푸시 | ntfy.sh (무료, iOS 앱) | 무료 / Pushover는 iOS 앱 1회 **$5** (Critical Alert로 무음모드 돌파 가능) |
| 에이전트 분석 | Claude Code 예약 작업(매시간) | 사용 중인 Claude 플랜 사용량에서 차감 |
| 대안 | Google Cloud Run Job + Cloud Scheduler + Secret Manager | 무료 구간 내 가능, Scheduler 작업 3개까지 무료 |

## 1. 사전 준비 — 키 발급

1. **재난문자 API**: [safetydata.go.kr](https://www.safetydata.go.kr/disaster-data/view?dataSn=228) 가입 → 긴급재난문자 API 활용신청 → 인증키. 승인 후 미리보기로 응답 필드명이 `SN, CRT_DT, MSG_CN, RCPTN_RGN_NM, EMRG_STEP_NM, DST_SE_NM`인지 확인 (다르면 `src/core/collectors/safetydata.ts` 수정).
2. **OpenSky (선택)**: 계정 페이지에서 API client 생성 → client id/secret.
3. **ntfy**: 아이폰에 ntfy 앱 설치 → 추측 불가능한 토픽 이름 구독 (예: `kew-` + 무작위 20자). 토픽 이름 자체가 비밀번호 역할이다.
   더 안전하게 하려면 ntfy 계정 + 접근 토큰(`NTFY_TOKEN`)으로 보호된 토픽을 사용.
4. **토큰 생성**: `openssl rand -hex 24` 로 `DASHBOARD_TOKEN`(보기 전용), `AGENT_TOKEN`(에이전트 실행용) 2개.

## 2. Cloudflare Workers 배포 (권장)

```bash
npm ci
npx wrangler login
npx wrangler d1 create kew                 # 출력된 database_id 를 wrangler.toml 에 입력
npx wrangler d1 migrations apply kew --remote

# 비밀값은 Cloudflare Secrets 에 저장 (코드·git 에 남지 않음)
for k in SAFETYDATA_API_KEY NTFY_TOPIC DASHBOARD_TOKEN AGENT_TOKEN; do npx wrangler secret put $k; done
# 선택: NTFY_TOKEN PUSHOVER_TOKEN PUSHOVER_USER OPENSKY_CLIENT_ID OPENSKY_CLIENT_SECRET

# wrangler.toml 의 DASHBOARD_URL 을 실제 workers.dev 주소로 수정 후
npx wrangler deploy
```

확인:
```bash
URL=https://korea-early-warning.<subdomain>.workers.dev
curl -X POST $URL/api/run -H "authorization: Bearer $AGENT_TOKEN" -d '{"dryRun":true}' | jq '.sources'
curl -X POST $URL/api/notify -H "authorization: Bearer $AGENT_TOKEN" \
  -d '{"title":"[테스트] KEW","body":"푸시 테스트","dedupeKey":"test-1"}'
```

아이폰 대시보드: Safari에서 `$URL/?key=<DASHBOARD_TOKEN>` 한 번 열기(토큰은 기기에 저장되고 주소창에서 지워짐) → 공유 → **홈 화면에 추가**.

## 3. Claude Code 에이전트 (매시간)

에이전트는 이 저장소의 `.mcp.json`(MCP 서버)과 `.claude/commands/kew-scan.md`(절차)를 사용한다.

### 3-1. 클라우드 환경 설정 (claude.ai/code)
세션 상단의 클라우드 환경 메뉴 → Edit:
- **환경 변수**: `KEW_API_URL=https://korea-early-warning.<subdomain>.workers.dev`, `KEW_AGENT_TOKEN=<AGENT_TOKEN>`
  (Worker를 쓰면 데이터 소스 키는 Worker에만 있으면 된다. Worker 없이 쓰려면 `SAFETYDATA_API_KEY`, `NTFY_TOPIC` 등도 여기에 추가)
- **네트워크 접근**: Limited 수준이면 Allowed domains에 추가
  - Worker 사용 시: `<subdomain>.workers.dev` 만으로 충분 (`fetch_source` 직접 조회까지 쓰려면 아래도)
  - Worker 미사용 시: `www.safetydata.go.kr, earthquake.usgs.gov, www.seismicportal.eu, msi.nga.mil, opensky-network.org, auth.opensky-network.org, api.gdeltproject.org, news.google.com, www.yna.co.kr, ntfy.sh, api.pushover.net`
- 네트워크 설정 방법: https://code.claude.com/docs/en/cloud-environments#network-access

### 3-2. 예약 작업 생성
Claude Code에서 "이 저장소로 매시간 `/kew-scan` 을 실행하는 예약 작업을 만들어줘"라고 요청하면 된다 (각 실행마다 새 세션, 이 저장소 체크아웃).
수동으로 만들 때 프롬프트 예시:
```
/kew-scan
```
- 예약 작업 최소 간격은 보통 1시간 → **실시간 탐지는 Worker가 담당**하고, 에이전트는 해석·요약·감시 공백 점검을 담당한다.
- 로컬 Claude Code에서만 돌릴 경우 `/loop 1h /kew-scan` 도 가능하지만 세션이 열려 있어야 하고 7일 후 만료된다.

## 4. 대안: Google Cloud Run

Worker 대신 Cloud Run Job으로 `npm run scan`을 실행할 수 있다 (상태는 GCS 볼륨의 JSON 파일).
```bash
gcloud secrets create safetydata-key --data-file=-     # 값은 stdin 으로
gcloud secrets create ntfy-topic --data-file=-
gcloud run jobs deploy kew-scan --source . --region asia-northeast3 \
  --command npx --args tsx,src/cli.ts,scan \
  --set-env-vars KEW_DATA=/data/state.json \
  --set-secrets SAFETYDATA_API_KEY=safetydata-key:latest,NTFY_TOPIC=ntfy-topic:latest \
  --add-volume name=data,type=cloud-storage,bucket=<BUCKET> --add-volume-mount volume=data,mount-path=/data
gcloud scheduler jobs create http kew-every-5m --location asia-northeast3 --schedule "*/5 * * * *" \
  --uri "https://run.googleapis.com/v2/projects/<PROJECT>/locations/asia-northeast3/jobs/kew-scan:run" \
  --http-method POST --oauth-service-account-email <SA>@<PROJECT>.iam.gserviceaccount.com
```
대시보드가 필요하면 `npx tsx src/cli.ts preview` 결과를 비공개 버킷에 올리거나 Worker 구성을 권장.

## 5. 운영

### 일상 점검
- 대시보드 **소스 상태**에서 오류·미실행 확인. 에이전트 노트의 `[감시 공백]` 확인.
- 매주: `뉴스 대비 성능`(알림 건수, 언론보다 빠른 건수, 중앙 리드타임) 기록.
- 매월: 재난문자 전국 훈련(을지·민방위) 기간에 훈련 문자 오탐이 없었는지 확인.

### 튜닝 포인트
| 파일 | 내용 |
|---|---|
| `src/core/policy.ts` | 상태별 알림 임계값, 시간당 한도, 재발송 기준 |
| `src/core/classify.ts` | 키워드·훈련/정정 패턴, 카테고리 기본 심각도 |
| `src/core/correlate.ts` | 그룹별 시간창·반경 |
| `src/core/collectors/seismic.ts` | 핵실험 의심 기준(거리·깊이·규모) |

규칙을 바꾸면 `test/fixtures`에 실제 사례를 추가하고 `npm test` 통과 후 배포.

### 장애 대응
| 증상 | 조치 |
|---|---|
| 특정 소스 연속 오류 | `fetch_source` 도구 또는 `/api/run {"only":["usgs"],"dryRun":true}` 로 원인 확인. 영구 장애면 `DISABLED_SOURCES`에 추가 |
| 알림 미수신 | `/api/notify` 테스트, ntfy 앱 알림 권한·집중 모드 확인. 3회 실패한 사건은 대시보드 억제 사유에 "발송 3회 실패" |
| Worker CPU 한도 초과 | Workers Paid 전환 또는 GDELT/RSS 비활성화 |
| 오탐 알림 | 대시보드 사건의 출처 확인 → 픽스처 추가 → 규칙 수정 |

### 보안
- 비밀값은 Cloudflare Secrets / GCP Secret Manager / 클라우드 환경 변수에만. `.dev.vars`, `.env`는 gitignore.
- `/api/state`는 DASHBOARD_TOKEN, 실행·알림 API는 AGENT_TOKEN 필요 (상수 시간 비교).
- 언론 기사는 제목·링크만 저장.
