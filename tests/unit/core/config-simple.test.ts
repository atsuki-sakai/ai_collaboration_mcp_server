/**
 * 簡単なConfigManager テスト - インポート確認
 */

import 'reflect-metadata';

describe('ConfigManager 簡単なテスト', () => {
  test('ConfigManagerクラスをインポートできる', async () => {
    try {
      const { ConfigManager } = await import('@/core/config.js');
      expect(ConfigManager).toBeDefined();
      expect(typeof ConfigManager).toBe('function');
    } catch (error) {
      console.error('インポートエラー:', error);
      throw error;
    }
  });

  test('ConfigManagerインスタンスを作成できる', async () => {
    try {
      const { ConfigManager } = await import('@/core/config.js');
      const manager = new ConfigManager();
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(ConfigManager);
    } catch (error) {
      console.error('インスタンス作成エラー:', error);
      throw error;
    }
  });
});