# 인수인계 — Korea Early Warning (한반도 조기경보) · 2026-11-06 (오후 갱신)

이 문서 하나로 지금 상태를 파악하고 바로 일을 이어받을 수 있게 정리했다. **작업 규칙의 정본은 `CLAUDE.md`** 이고(어떤 에이전트든 따른다), 이 문서는 그 규칙의 배경·지금 상태·남은 일·함정을 모은다. 다음 작업 계획은 `docs/ROADMAP.md`.

---

## 1. 무엇을 하는 서비스인가

- 공개 정보(정부 여행경보·항공기 위치·위성 열점·항행경보·시장·검색량·북한 매체 등 39가지 신호)를 **5분마다** 읽어 **한반도 전쟁 위험을 5단계**(평온·긴장·위기·임박·교전)로 판정하고, **단계가 바뀔 때만** 유료 고객 폰에 알림을 보낸다.
- 상품: **4,900원 1회 결제 · 평생 알림**(웹 푸시, 앱스토어 설치 없음). 결제사 페이앱. 결제 직후 '가입 시점' 리포트 1장, 이후 단계가 바뀔 때마다 그 순간의 **대시보드 전체를 얼린 리포트**가 알림함에 쌓인다.
- 운영자(사용자 1명)는 실시간 대시보드·운영자 알림·AI 분석관 기록을 본다.
- 판정 모델 설명·근거·변경 이력: `docs/INDICATORS.md` (0.x 절이 최신순 변경 기록).

## 2. 주소와 서버

| 이름 | 주소 | 무엇 |
|---|---|---|
| 본 서버 | https://koreasiren.com | 손님이 쓰는 서비스. 데이터베이스 `kew`(Cloudflare D1). 수집·판정·알림·결제가 돈다 |
| 시험 서버 | https://staging.koreasiren.com | **실험실.** 본 서버 데이터를 **읽기만** 하고(쓰기는 코드가 버림) 새 규칙을 돌려 본 서버 판정과 나란히 보여 준다. 수집·알림·결제 없음 |
| 예전 주소 | korea-early-warning.gylee-30d.workers.dev | 손님 화면은 koreasiren.com 으로 301. API·결제 통보·MCP·/ops 는 그대로 동작(진행 중 결제·분석관 연결용) |

화면 주소: `/` 상품 소개 · `/me` 알림함(손님: 결제 코드 / 운영자: 운영자 열쇠) · `/ops` 실시간 대시보드(운영자) · `/ops/app` 운영자 로그인·알림 목록 · `/r/<id>?code=` 손님 리포트 · `/ops/r/<id>?s=` 운영자 '그때 화면' · `/terms` 약관·환불.

## 3. 배포 — 반드시 이 순서

1. 작업 브랜치 **`claude/korea-early-warning`** 에 커밋·푸시 → GitHub Actions(`.github/workflows/deploy.yml`)가 **시험 서버에만** 배포한다.
2. 사용자가 시험 서버를 보고 **"본섭에 올려"** 라고 하면 그때만 `git push origin HEAD:main` → 본 서버 배포.
3. 배포 전 항상: `npm run typecheck` · `npm test` (지금 504개, 기존 실패 2개는 D1 SQL 환경 문제) · 화면 문구를 바꿨으면 `npm run check:ui <상태.json>` (상태 파일 = `/api/state` 응답에서 `setup` 을 지운 것).
4. 배포 확인은 실제 주소를 curl 로 찍어 새 문구·새 경로가 나오는지 본다(Actions 완료만 믿지 않는다 — 몇 분 걸린다).
5. 시험 서버는 마이그레이션을 하지 않는다. 새 표가 필요한 실험은 본 서버에 표만 먼저 더하는 것을 사용자에게 묻는다.

## 4. 비밀값 (값은 어디에도 쓰지 않는다 — 이름만)

GitHub Secrets → 배포 때 Worker 로 올라간다(`deploy.yml` 의 목록). 이 대화형 환경(Claude Code 클라우드)에는 `KEW_SECRET` 이 환경 변수로 있다.

- `KEW_SECRET` — 운영자 열쇠. 대시보드 로그인·운영자 API(`Authorization: Bearer`)·MCP 주소(`/mcp/<KEW_SECRET>`)·ntfy 토픽 유도. **채팅·로그·커밋에 절대 쓰지 않는다**(사용자가 알려 달라고 해도 채팅에 쓰지 않는다 — 11/6 사용자가 잊어버렸을 때도 링크·클립보드 방식으로 처리).
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — 배포용.
- 페이앱: `PAYAPP_USERID`(공개 가능) · `PAYAPP_LINKKEY` · `PAYAPP_LINKVAL` · `PAYAPP_REQUESTKEY`.
- 알림 채널(운영자): `BARK_KEY`, `NTFY_TOPIC`/`NTFY_TOKEN`, `TELEGRAM_*`, `DISCORD_WEBHOOK_URL`, `PUSHOVER_*`.
- 수집 API: `SAFETYDATA_API_KEY`, `FIRMS_MAP_KEY`, `GFW_API_TOKEN`, `NAVER_CLIENT_ID/SECRET`, `ECOS_API_KEY`, `AISSTREAM_API_KEY`, `OPENSKY_*`.
- 심층 분석 루틴 호출: `CLAUDE_ROUTINE_URL`, `CLAUDE_ROUTINE_TOKEN`.
- 시험 서버에는 알림 채널·결제·루틴 비밀값을 올리지 않는다(`deploy.yml` 의 `notStaging`).

## 5. 코드 지도

| 영역 | 파일 | 메모 |
|---|---|---|
| 수집 | `src/core/collectors/*.ts`, 시간표 정본 `src/core/sources.ts` 의 `SCHEDULE` | 크론은 `wrangler.toml` 과 같아야 한다(테스트) |
| 징후 정의 | `src/core/indicators.ts` | 바꾸면 `npm run docs:indicators` |
| 파이프라인 | `src/core/pipeline.ts` | 수집 → 신호 → 사건 → 사건 알림(운영자) |
| 전쟁 위험 판정 | `src/core/warrisk.ts` (`assessWarRisk`) | 다섯 영역 → 단계 → 30일 확률 범위. 확률 표기 정본 `fmtRiskPct` |
| 오늘의 판정 | `src/core/official.ts` | **화면 숫자는 하루 한 번(오전 8시)**, 확인된 단계가 바뀌면 바로. 알림·심층 분석은 `warRisk.live` (11/6, 시험 서버까지만 배포됨 — 아래 7절) |
| 외국 전쟁 사례집·한국 재생 | `src/core/casereplay.ts`, `scripts/korea-replay.ts`(한국 2017~2026, `data/korea/`), `src/core/provdanger.ts`(도발 위험도 정본 — 온도계와 공용),(재생·채점, 운영 `assessWarRisk` 그대로 호출), `scripts/fetch-cases.ts`·`score-cases.ts`, `data/cases/`(자료·`events.json` 정부 사건), `docs/CASEBOOK.md`·`src/core/casebook_data.ts`(자동 생성) | 전쟁 직전 대비 점수 = `official.ts` 의 `makeReadiness` (11/6, 시험 서버까지) |
| 대시보드 상태 | `src/core/state.ts` (`buildState`) | 화면·MCP·리포트가 모두 이걸 쓴다 |
| 단계 알림 | `src/core/phasealert.ts` | 손님에게 가는 유일한 알림(`audience:"all"`) |
| 리포트(손님) | `src/core/reports.ts` | `report:full:<id>` 에 대시보드 전체를 얼림(`freezeState`) |
| 운영자 그때 화면 | `src/core/opsnap.ts` + `src/core/notify.ts` | 운영자 알림을 보낼 때 자동으로 얼리고 링크를 알림 목록으로 |
| 판정 기록 | `src/core/history.ts` | 하루 요약·시간별 영구 보관 |
| 영구 보관 | `src/worker/d1store.ts` `prune` | 30일 지난 원자료를 지우기 전에 `metrics_daily`·`events_archive` 로 |
| 10년 긴장 온도계 | `src/core/tension.ts`, `tension_history.ts`(자동 생성) | 재구성 `scripts/build-tension-history.ts` (원자료 캐시 `.cache/tension/`, 저장소 밖) |
| 30일 큰 도발 예측 | `src/core/forecast.ts` | 정답: CSIS 도발 일지 + 시스템이 기록한 큰 도발 날 |
| 결제 | `src/core/billing.ts`, `src/worker/buy.ts` | 결제 확정은 페이앱 결제통보로만 |
| 웹 푸시 | `src/core/webpush.ts`, `src/worker/pwa.ts` | VAPID 직접 구현 |
| Worker 진입점 | `src/worker/index.ts` | 모든 경로·크론 |
| 화면 | `dashboard.ts`(대시보드), `me.ts`(알림함), `buy.ts`+`landing.ts`(상품 소개, 움직이는 한반도), `readonly.ts`(시험 서버 읽기 전용) | |
| MCP 도구 | `src/mcp/*.ts` | AI 분석관이 쓰는 도구 |
| 분석관 지침 | `.claude/commands/kew-scan.md`(정기), `kew-deep.md`(심층) | |

## 6. 자동으로 도는 것

- **Worker 크론**(`wrangler.toml`): 1분(속보) · 5분(수집·판정·기록·단계 알림·오늘의 판정·심층 분석 트리거) · 15분 · 매시 · 매일.
- **AI 분석관(정기)** — Claude Code 예약 작업 `trig_01FxHaxQbPsihhhvQwZ8Q8Kt`: 매일 **08:09·20:09 KST**, **매번 새 세션**, 모델 **Opus 5.5**. 저장소를 받아 `kew-scan.md` 대로 분석하고 `record_assessment` 로 기록. (11/6 교체 — 예전 작업 `trig_01EJcsUrw9TfxpZhHw7CwdTW` 는 한 대화창을 계속 이어 쓰다 사용 한도로 멈춰서 **꺼 둠**, 지우지 않음.)
- **AI 심층 조사(특이한 날)** — 예약 작업 `trig_01KJzJhxVzbNdTTDBnG492EM`: 서버가 조건(3단계 이상·경계 영역·큰 사건·패턴)일 때 API 로 깨운다. 하루 2회·월 30회 상한.

## 7. 지금 상태 (2026-11-06 오후)

- 판정: **2단계(긴장)**, 30일 국지 충돌 약 3.8~4.0%, 전면전 약 0.2%. 긴장 온도계는 지난 10년 중 상위 약 3%(대중 불안·검색 급증 때문, 정부·시장은 평소).
- **11/6 오후 완료 — 외국 전쟁 사례집 + 한반도 10년 재생 + 규칙 2.0:**
  - 외국 전쟁 6건 사례집·엄격 채점 → `docs/CASEBOOK.md`, `data/cases/scorecard.json`
  - 한반도 2017~2026 일별 재생 → `data/korea/korea-2017-2026.json`
  - ~~전쟁 직전 대비 점수(readinessBar) 대시보드 카드~~ → **사용자 요청으로 제거** (내부 계산만 유지)
  - BASIS 문장: 결과 기반 + 한계(미리 내다본 적 없음) 정직 명시
  - **규칙 2.0 (11/6):** 2단계 진입에 정보통 뒷받침 필요 + 영역 가중치(gov 2.0, mil 1.5, public 0.5)
  - 2.0 결과: 2단계 비율 38.2%→32.5%, 단계 전환 40→13, 외국 3/5 감지 유지, 오경보 14일 유지
  - 제3자 검토(BMAD 렌즈) 3회 + 한국 재생 정직성 패스 완료
  - 시험 서버 배포 완료, 화면 문장 ↔ 성적표 수치 일치 확인됨
  - 테스트: 503개 통과(기존 실패 2개는 D1 SQL 환경 문제로 변경 무관)
- **시험 서버에만 있고 본 서버에 아직 없는 것** (사용자 승인 대기):
  1. **오늘의 판정** (`official.ts`) — 화면 숫자 하루 한 번.
  2. **외국 전쟁 사례집·한국 재생·전쟁 직전 대비 점수** — 위 전체.
  3. 운영자 비밀값 복사 페이지 `/ops/key?login=` (사용자 "안 해도 돼" — 빼도 됨).
- 본 서버에 이미 있는 최근 변경(11/6): 운영자 알림 = 그때 화면 + 운영자 알림 목록, 앱 하나에 손님·운영자(제목 5번 → `/ops/app`, '👤 손님 화면 보기'), 시험 서버 구조, 영구 보관.
- **미완성:** `/ops?login=` 로그인 링크(대시보드 쪽 스크립트가 열쇠를 저장하지 못함). 쓰는 곳 없음 — 고치거나 지울 것.
- **결제:** 11/6 00:30 본 서버에 4,900원 결제 1건(운영자 본인 테스트로 보임). 환불할지 사용자 답 대기. 예전 테스트 결제는 모두 환불 완료.
- 법적 표시: 약관에 상호(후손AI)·대표·사업자등록번호·이메일은 있음. **사업장 주소·전화·통신판매업 신고번호는 없음** — 사용자에게 받으면 `termsPage`(`src/worker/buy.ts`)에 추가.

### 2026-11-11 규칙 3.0 (시험 서버)
- 전조 가설 33개 × 사례 42건 조사 → 채점 결과 공개 전조로는 전쟁과 전쟁 안 난 위기를 가르지 못함(AUC 0.61). 그래서 전조는 '심각한 위기인가'까지만 판정, 충돌·전면전 전환은 고정 기저율. 자세히: docs/INDICATORS.md 0.22, docs/PRECURSORS.md.
- 코드: `src/core/precursors.ts`(모형) · `proximity.ts`(한반도 적용·하루 한 줄 기록·분석관 부호) · `precursor_data.ts`(자동 생성) · 화면 '전쟁 근접도' 카드 · MCP `get_precursor_checklist`/`record_precursor_checks`.
- 본 서버에 올릴 때: 단계가 규칙 변경으로 달라질 수 있으니 `risk:phase_notify` 를 새 단계로 조용히 맞춘 뒤 올린다(손님에게 규칙 변경 알림이 가지 않게). 분석관 예약 작업은 main 의 kew-scan.md 를 읽으므로 올린 뒤부터 전조 점검이 시작된다.
- 안 한 것: 새 수집원(API) 추가, 봉인 사례 채점, 사례의 '모름' 줄이기(검색 도구 한도 때문에 위키백과 중심).

## 8. 사용자에 대해 (일하는 방식)

- **한국어만.** 대부분 휴대폰으로 본다 — 답은 짧게, 표·목록으로, 전문 용어 대신 쉬운 말.
- 결정은 사용자가 한다: 본 서버 배포, 돈이 오가는 일(환불), 테스트 푸시(**보내기 전에 반드시 묻는다**, `CLAUDE.md`).
- 크롬 브라우저에서 해야 하는 일은 사용자가 'claude-chrome' 에 붙여 넣을 **프롬프트를 써 준다**. 비밀값 입력은 사용자가 직접(프롬프트에 "키 값은 대화에 출력하지 말고 복사·붙여넣기만" 명시).
- 사용량은 토큰으로 보고한다.
- 손님 경험을 매우 중시한다: 코드를 타이핑하게 하지 않기, 아이폰·갤럭시 모두 '결제 먼저 → 홈 화면에 추가 → 알림 켜기', 헛경보로 신뢰를 잃지 않기(환불로 이어진다).
- 디자인: 블랙 + 레드(포인트). 앱 아이콘은 검정 바탕 빨간 레이더.

## 9. 함정 (겪은 것들)

- **Cloudflare 무료 플랜:** 요청당 CPU 10ms. 무거운 계산(과거 재생·백테스트)은 Worker 안에서 하지 말고 밖(GitHub Actions·로컬)에서 하고 결과만 올린다. D1 무료 한도 하루 읽기 500만·쓰기 10만 행 — 지금 쓰기 약 2.7만/일.
- **아이폰 홈 화면 앱은 사파리와 저장 공간이 따로**다. 사파리에서 로그인·결제한 정보가 앱에 없다. 아이폰은 SVG 아이콘을 안 써서 PNG(`/icon-180.png`)가 필요하다. 아이폰 사파리는 '설치' 버튼을 띄울 수 없다.
- **페이앱:** 결제 전 결제요청번호(mul_no)가 바뀔 수 있다. 같은 탭에서 결제창(`setTarget("_self")`) + `redirecturl`·`redirect=self`. 문자 발송 `smsuse=y`(번호는 페이앱 화면에서 입력 — 신뢰).
- **테스트 푸시를 실제 알림으로 오해**한 적 있음 → 테스트는 제목에 "🧪 테스트 — 실제 상황 아님", 반드시 먼저 묻기.
- **같은 것을 여러 곳에 적고 일부만 고친** 사고(11/2 대시보드 13건) → `CLAUDE.md` 의 '정본' 목록을 따른다.
- 시험 서버 배포 완료 확인 시 응답에 우연히 같은 단어가 있을 수 있다 — 새 필드/경로로 확인할 것.
- 자동 판정의 '돈의 움직임'은 세계 증시(예: 11/6 미국 선거 뒤 반도체 폭락)에도 흔들린다. 숫자가 흔들려도 단계가 같으면 의미 있는 변화가 아니다.

## 10. 다음 일

`docs/ROADMAP.md` — 1순위(사례집·채점표) **완료**, 다음: ① BANDS 보정 여부(사용자 결정) ② 규칙 2.0 시험(합격 기준·숨긴 사례 고정됨) ③ 헛경보 줄이기 ④ 신호 가중치 ⑤ 새 신호 ⑥ 분석관 반론 ⑦ 확률 보정.
