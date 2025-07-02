#!/usr/bin/env node

/**
 * Simple DeepSeek API Test
 * プロバイダーのAPIキーが有効かどうかを直接テストするスクリプト
 */

import axios from 'axios';

const DEEPSEEK_API_KEY = 'sk-4376c8ea1e3b44be8639cc0fe0015373';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

console.log('🧪 Testing DeepSeek API directly...\n');

async function testDeepSeekAPI() {
  const testRequest = {
    model: 'deepseek-chat',
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with "DeepSeek API is working!" to confirm the API is functional.'
      }
    ],
    max_tokens: 50,
    temperature: 0.1
  };

  try {
    console.log('📤 Sending request to DeepSeek API...');
    console.log(`API URL: ${DEEPSEEK_API_URL}`);
    console.log(`API Key: ${DEEPSEEK_API_KEY.substring(0, 8)}...`);
    console.log(`Request: ${JSON.stringify(testRequest, null, 2)}\n`);

    const response = await axios.post(DEEPSEEK_API_URL, testRequest, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ DeepSeek API Response Received:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));

    if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      const aiResponse = response.data.choices[0].message.content;
      console.log('\n🤖 AI Response:');
      console.log(`"${aiResponse}"`);
      
      if (aiResponse.includes('DeepSeek API is working!')) {
        console.log('\n🎉 SUCCESS: DeepSeek API is functioning correctly!');
        console.log('✅ Your API key is valid and the service is available.');
      } else {
        console.log('\n⚠️  PARTIAL SUCCESS: API responded but with unexpected content.');
      }
    } else {
      console.log('\n❓ UNEXPECTED: API responded but without expected message structure.');
    }

    // トークン使用量の表示
    if (response.data.usage) {
      console.log('\n📊 Token Usage:');
      console.log(`- Prompt tokens: ${response.data.usage.prompt_tokens}`);
      console.log(`- Completion tokens: ${response.data.usage.completion_tokens}`);
      console.log(`- Total tokens: ${response.data.usage.total_tokens}`);
    }

  } catch (error) {
    console.log('❌ FAILED: DeepSeek API Test Failed');
    
    if (error.response) {
      console.log('\n📋 Error Response:');
      console.log('Status:', error.response.status);
      console.log('Status Text:', error.response.statusText);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.log('\n🔑 API Key Error: Your API key may be invalid or expired.');
      } else if (error.response.status === 429) {
        console.log('\n⏱️  Rate Limit: You may have exceeded the API rate limit.');
      } else if (error.response.status >= 500) {
        console.log('\n🔧 Server Error: DeepSeek API service may be experiencing issues.');
      }
    } else if (error.request) {
      console.log('\n📡 Network Error: Failed to reach DeepSeek API');
      console.log('Details:', error.message);
    } else {
      console.log('\n💥 Unexpected Error:', error.message);
    }
  }
}

// メイン実行
testDeepSeekAPI().catch(console.error);