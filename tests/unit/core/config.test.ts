/**
 * Config Test Suite - 設定管理システムのテスト
 * T005: 設定管理システムの要件を検証
 */

import 'reflect-metadata';
import { ConfigManager } from '@/core/config.js';
import path from 'path';
import fs from 'fs/promises';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const testConfigDir = path.join(process.cwd(), 'tests', 'fixtures', 'config');

  beforeEach(() => {
    // 環境変数をリセット
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    // 環境変数をクリーンアップ
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.DEEPSEEK_API_KEY;
  });

  describe('基本機能', () => {
    test('ConfigManagerインスタンスが作成できる', () => {
      configManager = new ConfigManager();
      expect(configManager).toBeDefined();
      expect(configManager).toBeInstanceOf(ConfigManager);
    });

    test('デフォルト設定が読み込まれる', async () => {
      configManager = new ConfigManager();
      await configManager.load();
      
      const config = configManager.get() as Record<string, any>;
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.server.name).toBe('claude-code-ai-collab-mcp');
    });
  });

  describe('環境変数の処理', () => {
    test('環境変数が設定値を上書きする', async () => {
      process.env.LOG_LEVEL = 'debug';
      
      configManager = new ConfigManager();
      await configManager.load();
      
      const logLevel = configManager.get('server.log_level');
      expect(logLevel).toBe('debug');
    });

    test('環境変数プレースホルダーが展開される', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-api-key-123';
      
      configManager = new ConfigManager();
      await configManager.load();
      
      const providers = configManager.get('providers') as Array<any>;
      const deepseekProvider = providers?.find((p: any) => p.name === 'deepseek');
      expect(deepseekProvider?.api_key).toBe('test-api-key-123');
    });
  });

  describe('設定の取得', () => {
    beforeEach(async () => {
      configManager = new ConfigManager();
      await configManager.load();
    });

    test('ドット記法で階層的な値を取得できる', () => {
      const serverName = configManager.get('server.name');
      expect(serverName).toBe('claude-code-ai-collab-mcp');
      
      const version = configManager.get('server.version');
      expect(version).toBe('1.0.0');
    });

    test('存在しないキーはundefinedを返す', () => {
      const value = configManager.get('non.existent.key');
      expect(value).toBeUndefined();
    });

    test('ルート設定全体を取得できる', () => {
      const config = configManager.get();
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('providers');
    });
  });

  describe('設定の設定', () => {
    beforeEach(async () => {
      configManager = new ConfigManager();
      await configManager.load();
    });

    test('ドット記法で値を設定できる', () => {
      configManager.set('server.log_level', 'error');
      const logLevel = configManager.get('server.log_level');
      expect(logLevel).toBe('error');
    });

    test('新しいキーを追加できる', () => {
      configManager.set('custom.setting', 'value');
      const value = configManager.get('custom.setting');
      expect(value).toBe('value');
    });

    test('オブジェクト全体を設定できる', () => {
      const newConfig = {
        server: {
          name: 'updated-name',
          version: '2.0.0'
        }
      };
      
      configManager.set('', newConfig);
      expect(configManager.get('server.name')).toBe('updated-name');
      expect(configManager.get('server.version')).toBe('2.0.0');
    });
  });

  describe('バリデーション', () => {
    test('有効な設定はバリデーションを通過する', async () => {
      configManager = new ConfigManager();
      await configManager.load();
      
      const isValid = await configManager.validate();
      expect(isValid).toBe(true);
    });

    test('無効な設定はバリデーションエラーを返す', async () => {
      configManager = new ConfigManager();
      await configManager.load();
      
      // 無効な値を設定
      configManager.set('server.log_level', 'invalid-level');
      
      const isValid = await configManager.validate();
      expect(isValid).toBe(false);
      
      const errors = configManager.getValidationErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toHaveProperty('field', 'server.log_level');
    });

    test('必須フィールドの欠如を検出する', async () => {
      configManager = new ConfigManager();
      await configManager.load();
      
      // 必須フィールドを削除（server全体を削除）
      configManager.set('server', { version: '1.0.0' }); // nameフィールドを意図的に省略
      
      const isValid = await configManager.validate();
      expect(isValid).toBe(false);
      
      const errors = configManager.getValidationErrors();
      expect(errors.length).toBeGreaterThan(0);
      // name フィールドが必須であることを確認
      expect(errors.some(e => e.message?.includes('name') || e.field.includes('name'))).toBe(true);
    });
  });

  describe('設定のリロード', () => {
    test('設定をリロードできる', async () => {
      configManager = new ConfigManager();
      await configManager.load();
      
      // 値を変更
      configManager.set('server.log_level', 'debug');
      expect(configManager.get('server.log_level')).toBe('debug');
      
      // リロード
      await configManager.reload();
      expect(configManager.get('server.log_level')).toBe('info'); // デフォルト値に戻る
    });
  });

  describe('カスタム設定ディレクトリ', () => {
    test('カスタムディレクトリから設定を読み込める', async () => {
      // テスト用の設定ファイルを作成
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(
        path.join(testConfigDir, 'default.json'),
        JSON.stringify({
          server: {
            name: 'test-server',
            version: '0.0.1'
          }
        })
      );
      
      configManager = new ConfigManager({ configDir: testConfigDir });
      await configManager.load();
      
      expect(configManager.get('server.name')).toBe('test-server');
      
      // クリーンアップ
      await fs.rm(testConfigDir, { recursive: true, force: true });
    });
  });

  describe('設定のマージ', () => {
    test('テスト環境設定がデフォルト設定にマージされる', async () => {
      process.env.NODE_ENV = 'test';
      
      configManager = new ConfigManager();
      await configManager.load();
      
      // test.yamlの設定がdefault.yamlをオーバーライドする
      const logLevel = configManager.get('server.log_level');
      expect(logLevel).toBe('debug'); // testでは'debug'を期待
    });
  });
});