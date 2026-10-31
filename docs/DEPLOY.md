# 배포·운영 가이드

## 0. 비용 요약

| 구성 | 권장 | 월 비용 |
|---|---|---|
| 수집·알림 | Cloudflare Workers + Cron(5분) + D1 | 무료 플랜 범위 내 (요청 ~300/일, D1 쓰기 ~수만/일). 무료 플랜 CPU 10ms/호출 한도에 걸리면 Workers Paid **$5** |
| 아이폰 푸시 | ntfy.sh (무료, iOS 앱) | 무료 / Pushover는 iOS 앱 1회 **$5** (Critical Alert로 무음모드 돌파 가능) |
| 에이전트 분석 | Claude Code 예약 작업(매시간) | 사용 중인 Claude 플랜 사용량에서 차감 |
| 대안 | Google Cloud Run Job + Cloud Scheduler + Secret Manager | 무료 구간 내 가능, Scheduler 작업 3개까지 무료 |

## 1. 휴대폰만으로 배포하기 (권장)

배포는 GitHub Actions(`.github/workflows/deploy.yml`)가 한다. 사람이 할 일은 계정·비밀값 등록뿐이다.

1. **Cloudflare 가입** → 대시보드에서 *Workers & Pages* 메뉴를 한 번 열어 workers.dev 서브도메인을 만든다.
2. **API 토큰**: 내 프로필 → API 토큰 → 토큰 생성 → 템플릿 *Cloudflare Workers 편집* →
   *권한 추가*: 계정 · **D1** · 편집 → 토큰 생성 → 복사.
3. **GitHub Secrets** (저장소 → Settings → Secrets and variables → Actions → New repository secret):
   - `CLOUDFLARE_API_TOKEN` = 2번 토큰
   - `KEW_SECRET` = 20자 이상 무작위 문자열 (커넥터 URL·대시보드 로그인·ntfy 토픽이 모두 여기서 유도됨)
   - 선택: `SAFETYDATA_API_KEY`(재난문자), `AISSTREAM_API_KEY`(한반도 해역 선박), `FIRMS_MAP_KEY`(위성 열점), `GFW_API_TOKEN`(서해 중국 어선 — 위성 AIS), `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`(한국 사람들의 전쟁 불안 — 네이버 검색 추이), `PUSHOVER_TOKEN`/`PUSHOVER_USER`
4. **배포 실행**: Actions 탭 → *Deploy Worker* → 실패한 실행이 있으면 *Re-run jobs*, 없으면 *Run workflow*.
   D1 생성·마이그레이션·배포·비밀값 등록·헬스체크까지 자동. 요약(Summary)에 대시보드 주소가 나온다.
5. **대시보드**: 아이폰 Safari로 주소 열기 → KEW_SECRET 입력 → 공유 → 홈 화면에 추가.
6. **아이폰 푸시**: App Store에서 *ntfy* 설치 → 대시보드 *연결 설정*의 "토픽 주소 복사" → ntfy 앱에서 구독 → "테스트 푸시".
7. **Claude 커넥터**: 대시보드 "커넥터 URL 복사" → claude.ai → 설정 → 커넥터 → *사용자 지정 커넥터 추가* → 이름 `korea-early-warning`, URL 붙여넣기.

### 알림 채널 — ntfy 만으로는 부족하다
ntfy.sh 는 **발신 IP 단위**로 요청을 제한한다. Cloudflare Workers 는 수많은 사용자가 IP 를 공유하므로 실제 운영에서 `HTTP 429` 로 발송이 막히는 일이 있었다(2026-10-30 실측). 아래 중 하나를 **꼭 추가**한다.

| 채널 | 비용 | 설정 (휴대폰 5분) | Secret |
|---|---|---|---|
| **Bark (아이폰 권장)** | 무료, 계정 불필요 | 앱스토어에서 *Bark* 설치 → 첫 화면에 보이는 주소 `https://api.day.app/XXXX/` 의 `XXXX` 가 키. 앱 알림 허용 | `BARK_KEY` |
| Telegram | 무료 | ① 텔레그램에서 `@BotFather` → `/newbot` → 토큰 복사 ② 새 봇과 대화창을 열고 아무 메시지 전송 ③ `https://api.telegram.org/bot<토큰>/getUpdates` 를 브라우저로 열어 `"chat":{"id":숫자}` 확인 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Discord | 무료 | 서버 → 채널 설정 → 연동 → 웹후크 만들기 → URL 복사. 휴대폰 Discord 앱 알림 켜기 | `DISCORD_WEBHOOK_URL` |
| ntfy 계정 토큰 | 무료(제한 완화) | ntfy.sh 가입 → Account → Access tokens | `NTFY_TOKEN` (토픽은 기존 유지) |
| Pushover | 1회 $5 | 앱 구매 → Application 생성 | `PUSHOVER_TOKEN`, `PUSHOVER_USER` |

Secret 등록 후 Actions 에서 **Deploy Worker** 재실행 → 대시보드 '알림 설정'에서 채널 목록 확인 → '테스트 푸시'.

커넥터 URL에 비밀값이 들어 있으므로 다른 사람과 공유하지 말 것. 유출 시 `KEW_SECRET`을 바꾸고 워크플로를 다시 실행하면 이전 URL·토픽은 무효가 된다.

### 재난문자 API 키 (선택이지만 가장 중요한 공식 소스)
[safetydata.go.kr](https://www.safetydata.go.kr/disaster-data/view?dataSn=228) 가입 → 긴급재난문자 API 활용신청 → 승인 후 인증키를 `SAFETYDATA_API_KEY` Secret 으로 등록하고 워크플로 재실행.
승인 후 커넥터의 `check_emergency_alerts`로 응답 필드명(SN, CRT_DT, MSG_CN …)이 맞는지 확인할 것.

## 1.5 심층 분석 — '특이한 날'에만 Claude Code 를 자동으로 깨운다

**흐름**: 서버(5분 주기)가 특이한 이유를 찾으면 → Claude Code 예약 작업 'KEW 심층 조사'를 API 트리거로 깨움 → 새 세션이 `.claude/commands/kew-deep.md` 지침대로 조사(웹 검색·원자료·과거 사례) → `record_deep_report` 로 보고서·확률·사용량 기록 → 대시보드 '클로드 심층 분석' 카드 + 아이폰 알림 1회.

**특이한 이유**(`src/core/deep.ts`): 전쟁 위험 3단계 이상 / 어느 영역이든 '경계' 이상 / 위험도 4 이상 도발(ICBM·포격·핵실험·민방위 경보) / 보통 이상 징후 조합.

**사용량 안전장치**
- 같은 이유는 24시간에 한 번만 깨운다. 실행 사이 최소 3시간.
- 하루 최대 `DEEP_DAILY_MAX`(기본 2)회, 한 달 `DEEP_MONTHLY_BUDGET_USD`(기본 30, API 요금 환산) 에 닿으면 자동 중지 — `wrangler.toml` [vars] 에서 바꾼다.
- 세션 안에서도 도구 30회·웹 검색 6회·원자료 조회 5회 상한(지침).
- 사용량은 실행마다 기록된다: 세션이 `get_session` 의 사용량(토큰·API 요금 환산)을 `record_deep_report`/`record_usage` 로 남기고, 서버는 세션별 누적값에서 증가분만 더한다 → 대시보드 'Claude 사용량'.
- 금액은 API 요금으로 환산한 참고치다. 실제로는 Claude 구독 사용 한도에서 차감되고, 조직에 추가 사용 크레딧이 켜져 있을 때만 한도를 넘은 만큼 과금된다(claude.ai/settings/usage).

**설정 (한 번)**: claude.ai/code/routines → 'KEW 심층 조사' → 편집 → Trigger 의 + → API → Fire URL 복사, Generate token 복사(한 번만 보임) → GitHub Secrets `CLAUDE_ROUTINE_URL`, `CLAUDE_ROUTINE_TOKEN` → Deploy Worker 재실행. 같은 편집 화면에서 저장소(gylee095/-)·환경·모델(비용을 아끼려면 Sonnet)을 확인한다.

**점검**: `GET /api/deep`(요청·보고서·사용량), `POST /api/deep/fire {"dryRun":true}`(깨울지 판단만).

## 2. 수동 배포 (PC)
```bash
npm ci && npx wrangler login
npx wrangler d1 create kew            # database_id 를 wrangler.toml 에 입력
npx wrangler d1 migrations apply kew --remote
npx wrangler deploy
npx wrangler secret put KEW_SECRET    # 그 외 선택 비밀값도 동일
```

## 3. Claude 에이전트 — 커넥터 + 예약 작업

- 원격 MCP 커넥터 도구(10개): `get_situation`, `check_emergency_alerts`, `check_seismic_activity`, `check_navigational_warnings`,
  `check_airspace`, `search_news`, `run_monitoring_cycle`, `send_iphone_alert`, `add_analysis_note`, `list_data_sources`
- 커넥터를 등록하면 claude.ai 채팅·Claude Code 어디서든 "지금 한반도 상황 확인해줘"처럼 물으면 에이전트가 도구를 골라 호출한다.
- **자동 분석(하루 2회, 08:09·20:09 KST)**: Sonnet 모델의 분석관 세션에 예약 작업이 `/kew-scan` 을 보낸다. 조용한 날은 도구 3회 이내로 끝나 사용량이 작다. 주기·모델을 바꾸려면 Claude 에게 "분석 예약 작업을 ○○로 바꿔줘"라고 요청.
  
- 커넥터 호출은 Cloudflare에서 실행되므로 Claude 세션의 네트워크 허용 목록을 바꿀 필요가 없다.
- 로컬 개발용 stdio 서버: `claude mcp add kew-local -- npx tsx src/mcp/server.ts`

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
| 특정 소스 연속 오류 | 커넥터의 해당 `check_*` 도구로 원인 확인. 영구 장애면 `DISABLED_SOURCES`에 추가 |
| 알림 미수신 | 대시보드 "테스트 푸시", ntfy 앱 알림 권한·집중 모드 확인. 3회 실패한 사건은 대시보드 억제 사유에 "발송 3회 실패" |
| Worker CPU 한도 초과 | Workers Paid 전환 또는 GDELT/RSS 비활성화 |
| 오탐 알림 | 대시보드 사건의 출처 확인 → 픽스처 추가 → 규칙 수정 |

### 보안
- 비밀값은 GitHub Secrets → Cloudflare Secrets 로만 전달 (워크플로 로그에 값이 찍히지 않음). `.dev.vars`, `.env`는 gitignore.
- 커넥터 경로·`/api/*` 모두 KEW_SECRET 필요 (상수 시간 비교). 잘못된 커넥터 경로는 404.
- 언론 기사는 제목·링크만 저장.
