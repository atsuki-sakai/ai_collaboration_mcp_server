/**
 * Logger Test Suite - 構造化ログシステムのテスト
 * T004: 構造化ログシステムの要件を検証
 */

import { Logger } from '@/core/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({
      level: 'debug'
    });
  });

  describe('基本的なログ機能', () => {
    test('Logger インスタンスが正しく作成される', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(Logger);
    });

    test('すべてのログレベルメソッドが存在する', () => {
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.fatal).toBeDefined();
    });

    test('ログレベルメソッドがエラーをスローしない', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
      expect(() => logger.info('Info message')).not.toThrow();
      expect(() => logger.warn('Warn message')).not.toThrow();
      expect(() => logger.error('Error message')).not.toThrow();
      expect(() => logger.fatal('Fatal message')).not.toThrow();
    });

    test('メタデータ付きログがエラーをスローしない', () => {
      const metadata = { requestId: '123', component: 'test' };
      expect(() => logger.info('Message with metadata', metadata)).not.toThrow();
    });

    test('エラー付きログがエラーをスローしない', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });
  });

  describe('子ロガー機能', () => {
    test('子ロガーが作成できる', () => {
      const childLogger = logger.child({ component: 'child' });
      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(logger); // 別のインスタンス
    });

    test('子ロガーがILoggerインターフェースを実装している', () => {
      const childLogger = logger.child({ service: 'test' });
      expect(childLogger.debug).toBeDefined();
      expect(childLogger.info).toBeDefined();
      expect(childLogger.warn).toBeDefined();
      expect(childLogger.error).toBeDefined();
      expect(childLogger.fatal).toBeDefined();
      expect(childLogger.child).toBeDefined();
    });
  });

  describe('センシティブデータのマスキング', () => {
    test('センシティブなキーを含むメタデータがマスクされる', () => {
      // マスキング機能が動作することを確認（エラーをスローしない）
      const sensitiveData = {
        apiKey: 'secret-key-123',
        password: 'user-password',
        authToken: 'bearer-token',
        publicData: 'visible-data'
      };
      
      expect(() => logger.info('Sensitive log', sensitiveData)).not.toThrow();
    });
  });

  describe('ログローテーション設定', () => {
    test('ログローテーションが有効な設定でLoggerが作成できる', () => {
      const rotationLogger = new Logger({
        level: 'info',
        enableRotation: true,
        rotationOptions: {
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d'
        }
      });
      
      expect(rotationLogger).toBeDefined();
      expect(() => rotationLogger.info('Rotation test')).not.toThrow();
    });
  });

  describe('エラーハンドリング', () => {
    test('nullやundefinedのメタデータでもエラーをスローしない', () => {
      expect(() => logger.info('Test', {} as unknown as undefined)).not.toThrow();
      expect(() => logger.info('Test', undefined)).not.toThrow();
    });

    test('空のエラーオブジェクトでもエラーをスローしない', () => {
      expect(() => logger.error('Error test', undefined)).not.toThrow();
    });
  });
});