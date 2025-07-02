#!/usr/bin/env node

/**
 * Basic Startup Test
 * MCPサーバーが基本的に起動できるかをテストするシンプルなスクリプト
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Testing basic MCP server startup...');

// サーバーを起動
const serverProcess = spawn('node', ['dist/index.js', '--help'], {
  cwd: projectRoot,
  stdio: 'pipe',
  env: { 
    ...process.env, 
    DEEPSEEK_API_KEY: 'sk-4376c8ea1e3b44be8639cc0fe0015373',
    NODE_ENV: 'test'
  }
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  output += data.toString();
});

serverProcess.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

serverProcess.on('close', (code) => {
  console.log(`\n📋 Server output:`);
  console.log(output);
  
  if (errorOutput) {
    console.log(`\n❌ Error output:`);
    console.log(errorOutput);
  }
  
  console.log(`\n🔚 Process exited with code ${code}`);
  
  if (code === 0) {
    console.log('✅ Basic startup test PASSED');
  } else {
    console.log('❌ Basic startup test FAILED');
  }
});

// タイムアウト設定
setTimeout(() => {
  serverProcess.kill('SIGTERM');
  console.log('\n⏰ Test timed out after 10 seconds');
}, 10000);