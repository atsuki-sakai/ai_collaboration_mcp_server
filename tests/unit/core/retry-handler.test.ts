/**
 * RetryHandler Test Suite - リトライハンドラーのテスト
 * T006: ベースプロバイダークラスの要件を検証
 */

import { RetryHandler } from '@/core/retry-handler';

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    retryHandler = new RetryHandler();
  });

  describe('基本機能', () => {
    test('RetryHandlerインスタンスが作成できる', () => {
      expect(retryHandler).toBeDefined();
      expect(retryHandler).toBeInstanceOf(RetryHandler);
    });

    test('IRetryHandlerインターフェースを実装している', () => {
      expect(retryHandler.executeWithRetry).toBeDefined();
      expect(retryHandler.getRetryDelay).toBeDefined();
    });
  });

  describe('成功ケースのリトライ', () => {
    test('初回成功時はリトライしない', async () => {
      let callCount = 0;
      const operation = jest.fn(async () => {
        callCount++;
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(operation);
      
      expect(result).toBe('success');
      expect(callCount).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('リトライロジック', () => {
    test('一時的な失敗後に成功する', async () => {
      let callCount = 0;
      const operation = jest.fn(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(operation, {
        maxRetries: 3,
        baseDelay: 10
      });
      
      expect(result).toBe('success');
      expect(callCount).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('最大リトライ回数に達したら例外をスロー', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Temporary error'); // リトライ可能なエラー
      });

      await expect(
        retryHandler.executeWithRetry(operation, {
          maxRetries: 2,
          baseDelay: 10
        })
      ).rejects.toThrow('Temporary error');
      
      expect(operation).toHaveBeenCalledTimes(3); // 初回 + 2回リトライ
    });

    test('リトライ条件が false の場合はリトライしない', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Non-retryable error');
      });

      await expect(
        retryHandler.executeWithRetry(operation, {
          maxRetries: 3,
          baseDelay: 10,
          retryCondition: (error) => error.message !== 'Non-retryable error'
        })
      ).rejects.toThrow('Non-retryable error');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('リトライ条件が true の場合はリトライする', async () => {
      let callCount = 0;
      const operation = jest.fn(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Retryable error');
        }
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(operation, {
        maxRetries: 3,
        baseDelay: 10,
        retryCondition: (error) => error.message.includes('Retryable')
      });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('遅延計算', () => {
    test('指数バックオフが正しく計算される', () => {
      const baseDelay = 100;
      const maxDelay = 5000;
      const backoffFactor = 2;

      expect(retryHandler.getRetryDelay(1, baseDelay, maxDelay, backoffFactor)).toBe(100);
      expect(retryHandler.getRetryDelay(2, baseDelay, maxDelay, backoffFactor)).toBe(200);
      expect(retryHandler.getRetryDelay(3, baseDelay, maxDelay, backoffFactor)).toBe(400);
      expect(retryHandler.getRetryDelay(4, baseDelay, maxDelay, backoffFactor)).toBe(800);
    });

    test('最大遅延時間を超えない', () => {
      const baseDelay = 100;
      const maxDelay = 500;
      const backoffFactor = 2;

      expect(retryHandler.getRetryDelay(10, baseDelay, maxDelay, backoffFactor)).toBe(500);
    });

    test('最小遅延時間を下回らない', () => {
      const baseDelay = 100;
      const maxDelay = 5000;
      const backoffFactor = 0.5; // 縮小ファクター

      expect(retryHandler.getRetryDelay(1, baseDelay, maxDelay, backoffFactor)).toBe(100);
    });
  });

  describe('デフォルト設定', () => {
    test('デフォルト設定でリトライが動作する', async () => {
      let callCount = 0;
      const operation = jest.fn(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(operation);
      
      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });
  });

  describe('タイムアウト処理', () => {
    test('操作がタイムアウトした場合の処理', async () => {
      const operation = jest.fn(async () => {
        // 長時間の処理をシミュレート
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Timeout error');
      });

      const startTime = Date.now();
      
      await expect(
        retryHandler.executeWithRetry(operation, {
          maxRetries: 2,
          baseDelay: 50
        })
      ).rejects.toThrow('Timeout error');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(150); // 最低限の遅延時間
    });
  });
});