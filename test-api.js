/**
 * API 테스트 스크립트
 *
 * 실행 방법:
 * 1. API 서버를 먼저 실행: npm start
 * 2. 다른 터미널에서: node test-api.js
 */

const API_BASE_URL = 'http://localhost:3000';

// 테스트 헬퍼 함수
async function testEndpoint(name, method, endpoint, body = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Endpoint: ${method} ${endpoint}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
      console.log('Request Body:', JSON.stringify(body, null, 2));
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    console.log('\nResponse Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Test PASSED');
    } else {
      console.log('❌ Test FAILED');
    }

    return { success: response.ok, data };
  } catch (error) {
    console.log('❌ Test ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

// 메인 테스트 실행
async function runTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         N8N Custom Skills API - Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {
    passed: 0,
    failed: 0,
    errors: 0
  };

  // Test 1: Health Check
  const test1 = await testEndpoint(
    'Health Check',
    'GET',
    '/health'
  );
  if (test1.success) results.passed++; else results.failed++;

  // Test 2: List Skills
  const test2 = await testEndpoint(
    'List Available Skills',
    'GET',
    '/api/skills'
  );
  if (test2.success) results.passed++; else results.failed++;

  // Test 3: Get Specific Skill
  const test3 = await testEndpoint(
    'Get Nanobanana Skill Details',
    'GET',
    '/api/skills/nanobanana-prompt'
  );
  if (test3.success) results.passed++; else results.failed++;

  // Test 4: Execute Skill (간단한 테스트)
  const test4 = await testEndpoint(
    'Execute Nanobanana Skill (Simple)',
    'POST',
    '/api/execute',
    {
      skillName: 'nanobanana-prompt',
      userMessage: 'Generate a brief design prompt for a Christmas coupon with vintage style.',
      maxTokens: 2000
    }
  );
  if (test4.success) results.passed++; else results.failed++;

  // Test 5: Nanobanana Convenience Endpoint
  const test5 = await testEndpoint(
    'Nanobanana Convenience Endpoint',
    'POST',
    '/api/nanobanana',
    {
      intent: 'Coupon Promo',
      theme: 'Christmas',
      style: 'Vintage 90s hip-hop aesthetic with burnt monochrome color scheme',
      additionalInstructions: 'Keep it concise'
    }
  );
  if (test5.success) results.passed++; else results.failed++;

  // Test 6: Execute with Conversation History
  const test6 = await testEndpoint(
    'Execute with Conversation History',
    'POST',
    '/api/execute/conversation',
    {
      skillName: 'nanobanana-prompt',
      messages: [
        {
          role: 'user',
          content: 'I need a design prompt for a summer sale poster.'
        },
        {
          role: 'assistant',
          content: 'I can help with that. What style would you prefer?'
        },
        {
          role: 'user',
          content: 'Modern minimalist with bright colors.'
        }
      ],
      maxTokens: 2000
    }
  );
  if (test6.success) results.passed++; else results.failed++;

  // Test 7: Error Handling - Invalid Skill
  const test7 = await testEndpoint(
    'Error Handling - Invalid Skill',
    'POST',
    '/api/execute',
    {
      skillName: 'non-existent-skill',
      userMessage: 'Test message'
    }
  );
  // 이 경우 실패가 예상되므로 성공 여부를 반대로 카운트
  if (!test7.success && test7.data?.error) {
    console.log('✅ Error handling working correctly');
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 8: Error Handling - Missing Parameters
  const test8 = await testEndpoint(
    'Error Handling - Missing Required Parameters',
    'POST',
    '/api/nanobanana',
    {
      intent: 'Coupon Promo'
      // theme and style are missing
    }
  );
  if (!test8.success && test8.data?.error) {
    console.log('✅ Parameter validation working correctly');
    results.passed++;
  } else {
    results.failed++;
  }

  // 결과 요약
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Results                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`\nTotal Tests: ${results.passed + results.failed}`);
  console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%\n`);

  if (results.failed === 0) {
    console.log('🎉 All tests passed! API is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Please check the API server and configuration.\n');
  }
}

// 스크립트 실행
console.log('Starting API tests...');
console.log('Make sure the API server is running on http://localhost:3000\n');

// 서버 연결 확인
fetch(`${API_BASE_URL}/health`)
  .then(response => {
    if (response.ok) {
      console.log('✅ API server is reachable\n');
      runTests();
    } else {
      console.log('❌ API server returned an error');
      process.exit(1);
    }
  })
  .catch(error => {
    console.log('❌ Cannot connect to API server');
    console.log('Error:', error.message);
    console.log('\nPlease make sure:');
    console.log('1. The API server is running (npm start)');
    console.log('2. The server is accessible at http://localhost:3000');
    console.log('3. Your .env file is properly configured\n');
    process.exit(1);
  });
