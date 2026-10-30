# Korea Early Warning — 에이전트 작업 지침

- 이 저장소는 공개 정보 기반 한반도 위기 조기감지 시스템이다. 구조와 운영은 README.md, docs/ 참고.
- 정기 감시는 `/kew-scan` 커맨드(.claude/commands/kew-scan.md)를 따른다. 도구는 원격 MCP 서버 `korea-early-warning`(Worker /mcp/<KEW_SECRET>)이 제공하며, 저장소의 `.mcp.json` 이 환경 변수 `KEW_SECRET` 으로 연결한다(회사 계정이라 claude.ai 커넥터 대신 사용). 로컬 개발 시에는 `claude mcp add kew-local -- npx tsx src/mcp/server.ts`.
- 세션 시작 시 `node_modules`가 없으면 `npm ci`를 먼저 실행한다.
- 코드 변경 시 `npm test`와 `npm run typecheck`를 통과시킨다. 탐지 규칙을 바꾸면 test/fixtures 에 사례를 추가한다.
- 비밀값(API 키, 푸시 토픽, 토큰)을 코드·커밋·로그·노트에 쓰지 않는다.
- 징후·패턴 규칙을 바꿀 때는 docs/INDICATORS.md 의 근거(왜 보는가·대안 설명)도 함께 갱신한다. 패턴은 단일 징후로 'high' 가 되면 안 된다.
