# n8n 통합 가이드

이 가이드는 N8N Custom Skills API를 n8n 워크플로우와 통합하는 방법을 설명합니다.

## 목차

1. [기본 설정](#기본-설정)
2. [워크플로우 예제](#워크플로우-예제)
3. [실전 사용 사례](#실전-사용-사례)
4. [문제 해결](#문제-해결)

## 기본 설정

### 1. API 서버 실행

먼저 API 서버가 실행 중인지 확인하세요:

```bash
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 2. n8n에서 접근 가능한지 확인

n8n이 로컬에서 실행 중이라면 `localhost:3000`으로 접근 가능합니다.
n8n이 다른 서버나 클라우드에서 실행 중이라면:

- API 서버를 공개적으로 접근 가능하게 설정하거나
- Reverse proxy (nginx, Cloudflare Tunnel 등) 사용
- 같은 네트워크 내에 배포

## 워크플로우 예제

### 예제 1: 단순 디자인 프롬프트 생성

가장 기본적인 워크플로우입니다.

**노드 구성:**
1. Manual Trigger / Webhook
2. HTTP Request (API 호출)
3. Set Node (결과 포맷팅)

**HTTP Request 노드 설정:**

```
Method: POST
URL: http://localhost:3000/api/nanobanana
Authentication: None
Send Body: Yes
Body Content Type: JSON
```

**Body (JSON):**
```json
{
  "intent": "Coupon Promo",
  "theme": "Christmas",
  "style": "Vintage 90s hip-hop aesthetic with burnt monochrome color scheme"
}
```

**Set 노드 설정:**
```
designPrompt: {{ $json.prompt }}
usage: {{ $json.usage }}
```

### 예제 2: 동적 파라미터 입력

사용자 입력을 받아 동적으로 프롬프트를 생성합니다.

**노드 구성:**
1. Webhook Trigger
2. Set Node (파라미터 추출)
3. HTTP Request (API 호출)
4. Respond to Webhook

**Webhook Trigger:**
- HTTP Method: POST
- Path: `/generate-prompt`

**예제 요청:**
```bash
curl -X POST http://your-n8n-instance:5678/webhook/generate-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "Social Countdown",
    "theme": "Black Friday",
    "style": "Modern neon aesthetic"
  }'
```

**Set Node (파라미터 준비):**
```javascript
{
  "intent": "{{ $json.body.intent }}",
  "theme": "{{ $json.body.theme }}",
  "style": "{{ $json.body.style }}",
  "referenceImageUrl": "{{ $json.body.imageUrl }}",
  "additionalInstructions": "{{ $json.body.instructions }}"
}
```

**HTTP Request Node:**
```
URL: http://localhost:3000/api/nanobanana
Method: POST
Body: {{ $json }}
```

**Respond to Webhook:**
```json
{
  "success": true,
  "prompt": "{{ $json.prompt }}",
  "parameters": {
    "intent": "{{ $('Set').item.json.intent }}",
    "theme": "{{ $('Set').item.json.theme }}",
    "style": "{{ $('Set').item.json.style }}"
  }
}
```

### 예제 3: 이미지 생성 파이프라인

프롬프트 생성 후 DALL-E나 Midjourney로 이미지를 생성하는 완전한 파이프라인입니다.

**노드 구성:**
1. Webhook Trigger
2. HTTP Request (Custom Skills API - 프롬프트 생성)
3. Set Node (프롬프트 포맷팅)
4. HTTP Request (이미지 생성 API)
5. Respond to Webhook

**노드 3 (Set - 프롬프트 포맷팅):**
```javascript
{
  "designPrompt": "{{ $json.prompt }}",
  "imageGenPrompt": "{{ $json.prompt.substring(0, 1000) }}", // 길이 제한
  "metadata": {
    "intent": "{{ $('HTTP Request').item.json.parameters.intent }}",
    "theme": "{{ $('HTTP Request').item.json.parameters.theme }}",
    "timestamp": "{{ $now }}"
  }
}
```

### 예제 4: 배치 처리

여러 디자인 변형을 한 번에 생성합니다.

**노드 구성:**
1. Webhook Trigger
2. Item Lists Node (테마 배열 생성)
3. Split In Batches
4. HTTP Request (API 호출)
5. Merge Node
6. Respond to Webhook

**Item Lists Node:**
```json
[
  {
    "intent": "Coupon Promo",
    "theme": "Christmas",
    "style": "Vintage"
  },
  {
    "intent": "Coupon Promo",
    "theme": "New Year",
    "style": "Modern neon"
  },
  {
    "intent": "Coupon Promo",
    "theme": "Valentine",
    "style": "Romantic pastel"
  }
]
```

**HTTP Request (반복 실행):**
```
URL: http://localhost:3000/api/nanobanana
Body: {{ $json }}
```

### 예제 5: 오류 처리 및 재시도

API 오류를 처리하고 재시도하는 robust한 워크플로우입니다.

**노드 구성:**
1. Webhook Trigger
2. HTTP Request (try)
3. Error Trigger (catch)
4. Set Node (오류 로깅)
5. Wait Node (재시도 대기)
6. HTTP Request (재시도)

**HTTP Request 설정:**
```
Retry On Fail: Yes
Max Tries: 3
Wait Between Tries (ms): 2000
```

**Error Trigger:**
```javascript
{
  "error": "{{ $json.error }}",
  "timestamp": "{{ $now }}",
  "originalRequest": "{{ $('HTTP Request').item.json }}"
}
```

## 실전 사용 사례

### 사례 1: 이메일 마케팅 자동화

시나리오: 매주 새로운 테마로 쿠폰 디자인을 생성하고 이메일로 발송

**워크플로우:**
```
Cron Trigger (매주 월요일)
  ↓
Code Node (이번 주 테마 결정)
  ↓
HTTP Request (프롬프트 생성)
  ↓
HTTP Request (이미지 생성)
  ↓
Gmail Node (디자인 팀에게 이메일 발송)
```

**Code Node (테마 결정):**
```javascript
const themes = {
  0: { theme: "Christmas", style: "Festive retro" },
  1: { theme: "New Year", style: "Modern neon" },
  2: { theme: "Valentine", style: "Romantic pastel" },
  3: { theme: "Spring Sale", style: "Fresh minimalist" }
};

const weekOfMonth = Math.floor((new Date().getDate() - 1) / 7);
const selected = themes[weekOfMonth] || themes[0];

return [{
  json: {
    intent: "Coupon Promo",
    theme: selected.theme,
    style: selected.style
  }
}];
```

### 사례 2: Slack 봇 통합

시나리오: Slack에서 명령어로 디자인 프롬프트 생성

**워크플로우:**
```
Slack Trigger (slash command: /design)
  ↓
Function Node (파라미터 파싱)
  ↓
HTTP Request (API 호출)
  ↓
Slack Node (응답 전송)
```

**Slack Command 예제:**
```
/design intent:"Coupon Promo" theme:"Black Friday" style:"Bold modern"
```

**Function Node (파라미터 파싱):**
```javascript
const text = $input.item.json.text;
const params = {};

// 간단한 파싱
const intentMatch = text.match(/intent:"([^"]+)"/);
const themeMatch = text.match(/theme:"([^"]+)"/);
const styleMatch = text.match(/style:"([^"]+)"/);

params.intent = intentMatch ? intentMatch[1] : 'Coupon Promo';
params.theme = themeMatch ? themeMatch[1] : 'General';
params.style = styleMatch ? styleMatch[1] : 'Modern';

return [{json: params}];
```

### 사례 3: Google Sheets 연동

시나리오: Google Sheets에 디자인 요청을 입력하면 자동으로 프롬프트 생성

**워크플로우:**
```
Google Sheets Trigger (새 행 추가 시)
  ↓
HTTP Request (프롬프트 생성)
  ↓
Google Sheets (결과를 같은 행에 업데이트)
  ↓
Google Drive (프롬프트를 문서로 저장)
```

**Google Sheets 구조:**
| Intent | Theme | Style | Generated Prompt | Status | Created At |
|--------|-------|-------|------------------|--------|------------|
| Coupon Promo | Christmas | Vintage | ... | Complete | 2024-01-01 |

## 고급 기능

### 대화 히스토리 유지

여러 단계의 디자인 개선을 위해 대화 히스토리를 유지합니다.

**노드 구성:**
1. Webhook Trigger
2. Function Node (히스토리 로드)
3. HTTP Request (`/api/execute/conversation`)
4. Function Node (히스토리 저장)
5. Respond to Webhook

**Function Node (히스토리 관리):**
```javascript
// Redis, Database, 또는 n8n의 Static Data 사용
const conversationId = $json.body.conversationId;
const message = $json.body.message;

// 히스토리 로드 (예: Redis)
let history = getConversationHistory(conversationId) || [];

// 새 메시지 추가
history.push({
  role: "user",
  content: message
});

return [{
  json: {
    skillName: "nanobanana-prompt",
    messages: history,
    conversationId: conversationId
  }
}];
```

### 조건부 스타일 선택

시간, 날씨, 이벤트에 따라 자동으로 스타일을 선택합니다.

**Code Node:**
```javascript
const hour = new Date().getHours();
const season = getSeason(); // 사용자 정의 함수

let style;
if (hour < 12) {
  style = "Bright and energetic morning vibe";
} else if (hour < 18) {
  style = "Professional afternoon aesthetic";
} else {
  style = "Warm evening ambiance";
}

return [{
  json: {
    intent: $json.intent,
    theme: season,
    style: style
  }
}];
```

## n8n 노드 설정 템플릿

### HTTP Request 노드 (nanobanana 엔드포인트)

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://localhost:3000/api/nanobanana",
    "authentication": "none",
    "sendBody": true,
    "contentType": "application/json",
    "bodyParameters": {
      "parameters": [
        {
          "name": "intent",
          "value": "={{ $json.intent }}"
        },
        {
          "name": "theme",
          "value": "={{ $json.theme }}"
        },
        {
          "name": "style",
          "value": "={{ $json.style }}"
        }
      ]
    },
    "options": {
      "timeout": 30000,
      "retry": {
        "enabled": true,
        "maxRetries": 2,
        "waitBetween": 2000
      }
    }
  }
}
```

### HTTP Request 노드 (일반 execute 엔드포인트)

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://localhost:3000/api/execute",
    "sendBody": true,
    "contentType": "application/json",
    "bodyParameters": {
      "parameters": [
        {
          "name": "skillName",
          "value": "nanobanana-prompt"
        },
        {
          "name": "userMessage",
          "value": "={{ $json.message }}"
        },
        {
          "name": "maxTokens",
          "value": 8192
        }
      ]
    }
  }
}
```

## 문제 해결

### 연결 오류

**증상:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**해결:**
1. API 서버가 실행 중인지 확인
2. 방화벽 설정 확인
3. n8n과 API 서버가 같은 네트워크에 있는지 확인

### 타임아웃 오류

**증상:**
```
Error: Request timeout
```

**해결:**
1. HTTP Request 노드의 timeout 설정 증가 (기본: 5000ms → 30000ms)
2. `maxTokens` 값을 줄여서 응답 시간 단축
3. API 서버의 성능 확인

### CORS 오류

**증상:**
```
Access to fetch at 'http://localhost:3000' from origin 'http://n8n-host' has been blocked by CORS policy
```

**해결:**
`.env` 파일에 n8n origin 추가:
```env
ALLOWED_ORIGINS=http://localhost:5678,http://your-n8n-host
```

### 잘못된 응답 형식

**증상:**
```
Error: Cannot read property 'prompt' of undefined
```

**해결:**
1. API 응답 확인: HTTP Request 노드의 "Always Output Data" 옵션 활성화
2. 응답 구조 확인을 위해 일시적으로 디버깅 출력 추가
3. Set 노드에서 안전하게 접근: `{{ $json.prompt || 'No prompt generated' }}`

## 모범 사례

1. **환경 변수 사용**: API URL을 n8n의 환경 변수로 관리
2. **에러 핸들링**: 모든 HTTP Request에 Error Trigger 연결
3. **로깅**: 중요한 단계마다 로그 저장
4. **재시도 로직**: 네트워크 오류에 대비한 재시도 설정
5. **타임아웃 설정**: 적절한 타임아웃 값 설정 (30초 권장)
6. **응답 캐싱**: 동일한 요청에 대해 결과 캐싱 고려

## 다음 단계

- [README.md](README.md)에서 API 상세 문서 확인
- 직접 워크플로우 생성해보기
- 새로운 custom skills 추가하기
