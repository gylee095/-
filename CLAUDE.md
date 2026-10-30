# Korea Early Warning — 에이전트 작업 지침

- 이 저장소는 공개 정보 기반 한반도 위기 조기감지 시스템이다. 구조와 운영은 README.md, docs/ 참고.
- 정기 감시는 `/kew-scan` 커맨드(.claude/commands/kew-scan.md)를 따른다. 도구는 claude.ai 에 등록한 원격 커넥터 `korea-early-warning`(Worker /mcp/<KEW_SECRET>)이 제공한다. 로컬 개발 시에는 `claude mcp add kew-local -- npx tsx src/mcp/server.ts`.
- 세션 시작 시 `node_modules`가 없으면 `npm ci`를 먼저 실행한다.
- 코드 변경 시 `npm test`와 `npm run typecheck`를 통과시킨다. 탐지 규칙을 바꾸면 test/fixtures 에 사례를 추가한다.
- 비밀값(API 키, 푸시 토픽, 토큰)을 코드·커밋·로그·노트에 쓰지 않는다.
