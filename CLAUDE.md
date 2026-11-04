# Korea Early Warning — 에이전트 작업 지침

- 이 저장소는 공개 정보 기반 한반도 위기 조기감지 시스템이다. 구조와 운영은 README.md, docs/ 참고.
- 정기 감시는 `/kew-scan` 커맨드(.claude/commands/kew-scan.md)를 따른다. 도구는 원격 MCP 서버 `korea-early-warning`(Worker /mcp/<KEW_SECRET>)이 제공하며, 저장소의 `.mcp.json` 이 환경 변수 `KEW_SECRET` 으로 연결한다(회사 계정이라 claude.ai 커넥터 대신 사용). 로컬 개발 시에는 `claude mcp add kew-local -- npx tsx src/mcp/server.ts`.
- 세션 시작 시 `node_modules`가 없으면 `npm ci`를 먼저 실행한다.
- 코드 변경 시 `npm test`와 `npm run typecheck`를 통과시킨다. 탐지 규칙을 바꾸면 test/fixtures 에 사례를 추가한다.
- 비밀값(API 키, 푸시 토픽, 토큰)을 코드·커밋·로그·노트에 쓰지 않는다.
- 징후·패턴 규칙을 바꿀 때는 docs/INDICATORS.md 의 근거(왜 보는가·대안 설명)도 함께 갱신한다. 패턴은 단일 징후로 'high' 가 되면 안 된다.
- 같은 실수를 막는 정본 (2026-11-02 대시보드 점검 13건의 원인 — 같은 것을 여러 곳에 따로 적어 두고 일부만 고쳤다):
  - 수집원 추가·은퇴는 `src/core/sources.ts` 의 `SCHEDULE` 한 곳만 고친다. Worker 크론 묶음·화면 '지금 쓰는 소스'·실패 판정 주기가 여기서 나온다. wrangler.toml crons 는 같아야 한다(테스트가 확인).
  - 지역 범위와 '어디 상공' 이름은 `src/core/geo.ts`, '한반도 이야기인가'는 `classify.ts` 의 `isKoreaContext`, 확률 표기는 `fmtRiskPct`(화면 `pct()` 와 같아야 함 — 테스트), '학습 중' 설명은 `LEARNING_RULE` 하나만 쓴다.
  - 징후 정의(이름·측정·문턱)를 바꾸면 `npm run docs:indicators` 로 docs/INDICATORS.md 의 자동 생성 표를 갱신한다(다르면 테스트 실패).
  - 대시보드·화면 문구를 바꾸면 `npm run check:ui <상태.json>` 을 통과시킨다 (390px 밝은·어두운 화면, 모두 펼침: 가로 밀림·스크립트 오류·'?대'·undefined·영어 상태어 없음). 상태 파일은 /api/state 를 받아 setup 을 지운 것.
  - 화면의 출처·판정 표시는 저장된 값이 아니라 지금 규칙으로 다시 계산한 요약(brief)에서 가져온다.
- 실제 서버로 테스트 푸시(`/api/test-push`)를 보내기 전에 사용자에게 **먼저 물어보고 답을 받은 뒤** 보낸다. '확인해 봐'·'연결 점검' 같은 말은 테스트 푸시를 보내라는 뜻이 아니다 — 2026-11-04 새 세션이 확인 작업 중 묻지 않고 보냈다. 보낸 뒤 알리는 것은 규칙 위반이다 — 2026-11-04 테스트 알림을 실제 악화로 오해한 뒤로. 그리고 알림은 "테스트인지 실제인지"와 "무엇이 이전보다 나빠졌는지"가 잠금화면에서 2초 안에 읽혀야 한다(아직 미해결, docs/INDICATORS.md 0.14).
- 푸시 메시지는 `audience` 를 갖는다(기본 owner). 공개 구독자에게 가는 `audience: "all"` 은 실제 알림 세 경로(사건 pipeline.ts·단계 phasealert.ts·심층 분석 tools_deep.ts)에만 쓴다 — 테스트·시스템 경고·분석관 수동 알림은 절대 사람들에게 가지 않는다(테스트가 코드로 확인).

