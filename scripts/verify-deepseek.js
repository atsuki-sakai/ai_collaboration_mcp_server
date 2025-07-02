#!/usr/bin/env node

/**
 * DeepSeek API キー検証スクリプト
 * 提供されたAPIキーでMCPサーバーが正常に動作するかテストします
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// APIキー設定
const DEEPSEEK_API_KEY = 'sk-4376c8ea1e3b44be8639cc0fe0015373';

// テストケース
const TEST_CASES = [
  {
    name: 'Simple Text Generation',
    request: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'collaborate',
        arguments: {
          providers: ['deepseek'],
          strategy: 'parallel',
          prompt: 'Hello, please respond with "DeepSeek is working!"'
        }
      }
    }
  },
  {
    name: 'Code Generation',
    request: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'collaborate',
        arguments: {
          providers: ['deepseek'],
          strategy: 'sequential',
          prompt: 'Write a simple JavaScript function that adds two numbers'
        }
      }
    }
  },
  {
    name: 'Review Tool Test',
    request: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'review',
        arguments: {
          content: 'function add(a, b) { return a + b; }',
          criteria: ['correctness', 'readability']
        }
      }
    }
  }
];

class DeepSeekVerifier {
  constructor() {
    this.serverProcess = null;
    this.results = [];
  }

  async verify() {
    console.log('🚀 DeepSeek MCP Server Verification Starting...\n');

    try {
      // ビルド実行
      console.log('📦 Building project...');
      await this.buildProject();
      console.log('✅ Build completed\n');

      // サーバー起動
      console.log('🔄 Starting MCP server...');
      await this.startServer();
      console.log('✅ Server started\n');

      // テスト実行
      console.log('🧪 Running verification tests...\n');
      await this.runTests();

      // 結果表示
      this.displayResults();

    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async buildProject() {
    return new Promise((resolve, reject) => {
      const build = spawn('pnpm', ['run', 'build'], {
        cwd: projectRoot,
        stdio: 'pipe',
        env: { ...process.env, DEEPSEEK_API_KEY }
      });

      let stderr = '';
      build.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      build.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed: ${stderr}`));
        }
      });
    });
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', ['dist/index.js'], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          DEEPSEEK_API_KEY,
          NODE_ENV: 'test',
          MCP_DEFAULT_PROVIDER: 'deepseek'
        }
      });

      let serverReady = false;
      let startupTimeout;

      // サーバー出力を監視
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Server:', output.trim());
        
        if (output.includes('MCP server listening') || output.includes('Server started')) {
          if (!serverReady) {
            serverReady = true;
            clearTimeout(startupTimeout);
            resolve();
          }
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString().trim());
      });

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      this.serverProcess.on('exit', (code) => {
        if (!serverReady) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // タイムアウト設定
      startupTimeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 10000);
    });
  }

  async runTests() {
    for (const testCase of TEST_CASES) {
      console.log(`🔍 Running: ${testCase.name}`);
      
      try {
        const result = await this.sendRequest(testCase.request);
        
        if (result.error) {
          this.results.push({
            name: testCase.name,
            status: 'FAILED',
            error: result.error
          });
          console.log(`❌ ${testCase.name}: ${result.error.message}\n`);
        } else {
          this.results.push({
            name: testCase.name,
            status: 'PASSED',
            result: result.result
          });
          console.log(`✅ ${testCase.name}: SUCCESS\n`);
        }
      } catch (error) {
        this.results.push({
          name: testCase.name,
          status: 'ERROR',
          error: error.message
        });
        console.log(`💥 ${testCase.name}: ${error.message}\n`);
      }
    }
  }

  async sendRequest(request) {
    return new Promise((resolve, reject) => {
      if (!this.serverProcess) {
        reject(new Error('Server not running'));
        return;
      }

      const requestStr = JSON.stringify(request) + '\n';
      let responseData = '';
      let timeout;

      const onData = (data) => {
        responseData += data.toString();
        
        // JSON RPC レスポンスの完了を検出
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed.id === request.id) {
              clearTimeout(timeout);
              this.serverProcess.stdout.removeListener('data', onData);
              resolve(parsed);
              return;
            }
          }
        } catch (e) {
          // JSONパースエラーは無視（まだ完全なレスポンスを受信していない可能性）
        }
      };

      this.serverProcess.stdout.on('data', onData);

      // タイムアウト設定
      timeout = setTimeout(() => {
        this.serverProcess.stdout.removeListener('data', onData);
        reject(new Error('Request timeout'));
      }, 30000);

      // リクエスト送信
      this.serverProcess.stdin.write(requestStr);
    });
  }

  displayResults() {
    console.log('\n📊 Verification Results');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`💥 Errors: ${errors}\n`);

    if (passed === this.results.length) {
      console.log('🎉 All tests passed! DeepSeek integration is working correctly.');
      console.log(`✨ Your API key (${DEEPSEEK_API_KEY.substring(0, 8)}...) is valid and functional.`);
    } else {
      console.log('⚠️  Some tests failed. Check the details above.');
      
      // 失敗したテストの詳細表示
      this.results.filter(r => r.status !== 'PASSED').forEach(result => {
        console.log(`\n${result.name}:`);
        if (result.error) {
          console.log(`  Error: ${typeof result.error === 'string' ? result.error : JSON.stringify(result.error, null, 2)}`);
        }
      });
    }

    console.log('\n' + '='.repeat(50));
  }

  async cleanup() {
    if (this.serverProcess) {
      console.log('\n🛑 Stopping server...');
      this.serverProcess.kill('SIGTERM');
      
      // サーバーの終了を待つ
      await new Promise((resolve) => {
        this.serverProcess.on('exit', resolve);
        setTimeout(resolve, 5000); // 最大5秒待機
      });
    }
  }
}

// メイン実行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verifier = new DeepSeekVerifier();
  verifier.verify().catch(console.error);
}

export default DeepSeekVerifier;