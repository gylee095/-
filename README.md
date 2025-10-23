# N8N Custom Skills API

Anthropic Claude의 Custom Skills를 API로 제공하여 n8n에서 HTTP Request로 사용할 수 있도록 하는 서버입니다.

## 기능

- ✅ Custom Skills 관리 및 실행
- ✅ Anthropic API 통합
- ✅ n8n HTTP Request 노드와 완벽 호환
- ✅ RESTful API 인터페이스
- ✅ 대화 히스토리 지원
- ✅ nanobanana-prompt 스킬 포함

## 시작하기

### 1. 환경 설정

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

`.env` 파일을 편집하여 Anthropic API 키를 설정하세요:

```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5678,https://your-n8n-instance.com
```

### 2. 서버 실행

```bash
# 프로덕션 모드
npm start

# 개발 모드 (nodemon 사용)
npm run dev
```

서버가 실행되면 `http://localhost:3000`에서 접근할 수 있습니다.

## API 엔드포인트

### 1. Health Check

서버 상태를 확인합니다.

```http
GET /health
```

**응답 예제:**
```json
{
  "status": "ok",
  "message": "N8N Custom Skills API is running"
}
```

### 2. 스킬 목록 조회

사용 가능한 모든 스킬을 조회합니다.

```http
GET /api/skills
```

**응답 예제:**
```json
{
  "success": true,
  "count": 1,
  "skills": [
    {
      "name": "nanobanana-prompt",
      "description": "A skill that enables Claude to generate direct command-style design prompts by combining Intent, Theme, and Style with layout reference images and asset-agnostic placement patterns.",
      "path": "nanobanana-prompt"
    }
  ]
}
```

### 3. 특정 스킬 상세 조회

특정 스킬의 내용을 조회합니다.

```http
GET /api/skills/:skillName
```

**응답 예제:**
```json
{
  "success": true,
  "skill": "nanobanana-prompt",
  "content": "---\nname: nanobanana-prompt\n..."
}
```

### 4. 스킬 실행 (단일 메시지)

스킬을 실행합니다.

```http
POST /api/execute
```

**요청 Body:**
```json
{
  "skillName": "nanobanana-prompt",
  "userMessage": "Generate a design prompt for a Christmas coupon with vintage style.",
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096,
  "temperature": 1.0
}
```

**응답 예제:**
```json
{
  "success": true,
  "skill": "nanobanana-prompt",
  "model": "claude-3-5-sonnet-20241022",
  "response": "Transform the imported layout into a Christmas Coupon...",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

### 5. 스킬 실행 (대화 히스토리)

대화 히스토리를 포함하여 스킬을 실행합니다.

```http
POST /api/execute/conversation
```

**요청 Body:**
```json
{
  "skillName": "nanobanana-prompt",
  "messages": [
    {
      "role": "user",
      "content": "I need a design prompt for a Christmas coupon."
    },
    {
      "role": "assistant",
      "content": "I'd be happy to help! Could you provide more details about the style?"
    },
    {
      "role": "user",
      "content": "Use vintage 90s hip-hop aesthetic with burnt colors."
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096
}
```

### 6. Nanobanana Prompt 전용 엔드포인트

nanobanana-prompt 스킬을 더 편리하게 사용할 수 있는 전용 엔드포인트입니다.

```http
POST /api/nanobanana
```

**요청 Body:**
```json
{
  "intent": "Coupon Promo",
  "theme": "Christmas",
  "style": "Vintage 90s hip-hop aesthetic with burnt monochrome color scheme",
  "referenceImageUrl": "https://example.com/template.jpg",
  "additionalInstructions": "Focus on readability and avoid too many decorations",
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 8192
}
```

**응답 예제:**
```json
{
  "success": true,
  "skill": "nanobanana-prompt",
  "parameters": {
    "intent": "Coupon Promo",
    "theme": "Christmas",
    "style": "Vintage 90s hip-hop aesthetic with burnt monochrome color scheme"
  },
  "prompt": "Transform the imported layout into a Christmas Coupon Promo...",
  "usage": {
    "input_tokens": 2345,
    "output_tokens": 1234
  }
}
```

## n8n 통합 방법

### 방법 1: HTTP Request 노드 사용

1. **HTTP Request 노드 추가**
2. **설정:**
   - Method: `POST`
   - URL: `http://localhost:3000/api/nanobanana`
   - Authentication: None
   - Body Content Type: `JSON`
   - Specify Body: `Using Fields Below`

3. **Body Parameters 설정:**
```json
{
  "intent": "{{ $json.intent }}",
  "theme": "{{ $json.theme }}",
  "style": "{{ $json.style }}",
  "referenceImageUrl": "{{ $json.imageUrl }}",
  "additionalInstructions": "{{ $json.instructions }}"
}
```

4. **응답 처리:**
   - 응답의 `prompt` 필드에 생성된 디자인 프롬프트가 포함됩니다.
   - `{{ $json.prompt }}`로 접근 가능

### 방법 2: n8n Webhook 트리거와 함께 사용

```
Webhook Trigger → Set Node (파라미터 설정) → HTTP Request (API 호출) → Response Node
```

## Custom Skills 추가 방법

새로운 스킬을 추가하려면:

1. `skills/` 디렉토리에 새 폴더 생성
2. 해당 폴더에 `SKILL.md` 파일 생성
3. SKILL.md 파일 형식:

```markdown
---
name: your-skill-name
description: Your skill description here
license: MIT
---

# Your Skill Title

## Overview
Skill overview and instructions...

## Usage
How to use this skill...
```

4. 서버 재시작 후 `/api/skills`에서 확인 가능

## 예제

### cURL 예제

```bash
# 스킬 목록 조회
curl http://localhost:3000/api/skills

# nanobanana-prompt 실행
curl -X POST http://localhost:3000/api/nanobanana \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "Coupon Promo",
    "theme": "Christmas",
    "style": "Vintage 90s aesthetic"
  }'
```

### JavaScript 예제

```javascript
const response = await fetch('http://localhost:3000/api/nanobanana', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    intent: 'Coupon Promo',
    theme: 'Christmas',
    style: 'Vintage 90s hip-hop aesthetic with burnt colors'
  })
});

const result = await response.json();
console.log(result.prompt);
```

## 프로젝트 구조

```
.
├── server.js              # 메인 서버 파일
├── package.json           # 의존성 정의
├── .env                   # 환경 변수 (git에서 제외)
├── .env.example           # 환경 변수 예제
├── README.md              # 프로젝트 문서
├── N8N_INTEGRATION.md     # n8n 통합 가이드
└── skills/                # 스킬 디렉토리
    └── nanobanana-prompt/
        └── SKILL.md       # 스킬 정의 파일
```

## 기술 스택

- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **@anthropic-ai/sdk** - Anthropic API 클라이언트
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리

## 보안

- API 키는 환경 변수로 관리
- CORS 설정으로 허용된 origin만 접근 가능
- 요청 크기 제한 (10MB)

## 문제 해결

### API 키 오류

```
Error: ANTHROPIC_API_KEY is required
```

→ `.env` 파일에 `ANTHROPIC_API_KEY`를 설정하세요.

### 스킬을 찾을 수 없음

```
Skill 'xxx' not found
```

→ `skills/` 디렉토리에 해당 스킬 폴더와 `SKILL.md` 파일이 있는지 확인하세요.

### CORS 오류

→ `.env`의 `ALLOWED_ORIGINS`에 n8n 인스턴스 URL을 추가하세요.

## 라이선스

MIT

## 기여

기여는 언제나 환영합니다! Pull Request를 보내주세요.

## 지원

문제가 있으시면 GitHub Issues를 이용해주세요.
