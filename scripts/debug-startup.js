#!/usr/bin/env node

/**
 * Debug Startup
 * MCPサーバーの起動問題をデバッグするスクリプト
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔍 Debugging MCP server startup...');

const serverProcess = spawn('node', ['dist/index.js'], {
  cwd: projectRoot,
  stdio: 'pipe',
  env: { 
    ...process.env, 
    DEEPSEEK_API_KEY: 'sk-4376c8ea1e3b44be8639cc0fe0015373',
    NODE_ENV: 'test',
    LOG_LEVEL: 'debug'
  }
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log('STDOUT:', text.trim());
});

serverProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  console.log('STDERR:', text.trim());
});

serverProcess.on('close', (code) => {
  console.log(`\n🔚 Process exited with code ${code}`);
  
  if (code === 0) {
    console.log('✅ Server started successfully');
  } else {
    console.log('❌ Server failed to start');
    console.log('\n📋 Full error output:');
    console.log(errorOutput);
  }
});

serverProcess.on('error', (error) => {
  console.log('❌ Process error:', error.message);
});

// タイムアウト設定
setTimeout(() => {
  console.log('\n⏰ Killing server after 15 seconds');
  serverProcess.kill('SIGTERM');
}, 15000);