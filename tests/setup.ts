/**
 * Jest test setup file
 * Global test configuration and utilities
 */

// ES moduleのため、reflect-metadataを最初にインポート
import 'reflect-metadata';

// グローバルテストタイムアウトの設定
jest.setTimeout(30000);

// テスト環境の設定
process.env.NODE_ENV = 'test';

// fetch polyfill for Node.js testing
if (!global.fetch) {
  global.fetch = jest.fn();
}

// console.logをテスト中に抑制（必要に応じて）
if (process.env.SUPPRESS_LOGS === 'true') {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}

// グローバルなモック設定
beforeEach(() => {
  // 各テストの前に実行される処理
  jest.clearAllMocks();
  
  // fetch モックのリセット（存在する場合）
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockClear();
  }
});

afterEach(() => {
  // 各テストの後に実行される処理
  jest.restoreAllMocks();
});