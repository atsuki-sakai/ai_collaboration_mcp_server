/**
 * CacheService Unit Tests
 * T010: Cache service implementation tests
 */

import 'reflect-metadata';
import { CacheService, ICacheService, CacheOptions } from '@/services/cache-service';
import { Logger } from '@/core/logger';

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  fatal = jest.fn();
}

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockLogger: MockLogger;
  let options: CacheOptions;

  beforeEach(() => {
    mockLogger = new MockLogger();
    options = {
      maxSize: 100,
      defaultTTL: 3600,
      cleanupInterval: 60000,
      enableStats: true,
      memoryProvider: {
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        evictionPolicy: 'lru'
      }
    };

    cacheService = new CacheService(mockLogger as any, options);
  });

  afterEach(async () => {
    await cacheService.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      await cacheService.set('test-key', 'test-value');
      const result = await cacheService.get('test-key');
      expect(result).toBe('test-value');
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await cacheService.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle has operation', async () => {
      await cacheService.set('test-key', 'test-value');
      expect(await cacheService.has('test-key')).toBe(true);
      expect(await cacheService.has('non-existent')).toBe(false);
    });

    it('should delete keys', async () => {
      await cacheService.set('test-key', 'test-value');
      expect(await cacheService.has('test-key')).toBe(true);
      
      await cacheService.delete('test-key');
      expect(await cacheService.has('test-key')).toBe(false);
    });

    it('should clear all entries', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      
      expect(await cacheService.has('key1')).toBe(true);
      expect(await cacheService.has('key2')).toBe(true);
      
      await cacheService.clear();
      
      expect(await cacheService.has('key1')).toBe(false);
      expect(await cacheService.has('key2')).toBe(false);
    });
  });

  describe('TTL Handling', () => {
    it('should respect custom TTL', async () => {
      const shortTTL = 100; // 100ms
      await cacheService.set('test-key', 'test-value', shortTTL);
      
      expect(await cacheService.get('test-key')).toBe('test-value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(await cacheService.get('test-key')).toBeUndefined();
    });

    it('should use default TTL when not specified', async () => {
      await cacheService.set('test-key', 'test-value');
      const ttl = await cacheService.getTTL('test-key');
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(options.defaultTTL! * 1000);
    });

    it('should update TTL', async () => {
      await cacheService.set('test-key', 'test-value', 1000);
      const originalTTL = await cacheService.getTTL('test-key');
      
      await cacheService.expire('test-key', 2000);
      const newTTL = await cacheService.getTTL('test-key');
      
      expect(newTTL).toBeGreaterThan(originalTTL);
    });

    it('should handle getTTL for non-existent keys', async () => {
      const ttl = await cacheService.getTTL('non-existent');
      expect(ttl).toBe(-1);
    });
  });

  describe('Data Types', () => {
    it('should handle string values', async () => {
      await cacheService.set('string-key', 'string-value');
      expect(await cacheService.get('string-key')).toBe('string-value');
    });

    it('should handle number values', async () => {
      await cacheService.set('number-key', 42);
      expect(await cacheService.get('number-key')).toBe(42);
    });

    it('should handle object values', async () => {
      const obj = { name: 'test', value: 123, nested: { prop: 'nested-value' } };
      await cacheService.set('object-key', obj);
      expect(await cacheService.get('object-key')).toEqual(obj);
    });

    it('should handle array values', async () => {
      const arr = [1, 2, 3, { nested: 'object' }];
      await cacheService.set('array-key', arr);
      expect(await cacheService.get('array-key')).toEqual(arr);
    });

    it('should handle null and undefined values', async () => {
      await cacheService.set('null-key', null);
      await cacheService.set('undefined-key', undefined);
      
      expect(await cacheService.get('null-key')).toBe(null);
      expect(await cacheService.get('undefined-key')).toBe(undefined);
    });
  });

  describe('Pattern Operations', () => {
    beforeEach(async () => {
      await cacheService.set('user:1:profile', { name: 'John' });
      await cacheService.set('user:1:settings', { theme: 'dark' });
      await cacheService.set('user:2:profile', { name: 'Jane' });
      await cacheService.set('session:abc123', { userId: 1 });
      await cacheService.set('session:def456', { userId: 2 });
    });

    it('should find keys by pattern', async () => {
      const userKeys = await cacheService.keys('user:*');
      expect(userKeys).toHaveLength(3);
      expect(userKeys).toContain('user:1:profile');
      expect(userKeys).toContain('user:1:settings');
      expect(userKeys).toContain('user:2:profile');
    });

    it('should find keys by specific pattern', async () => {
      const user1Keys = await cacheService.keys('user:1:*');
      expect(user1Keys).toHaveLength(2);
      expect(user1Keys).toContain('user:1:profile');
      expect(user1Keys).toContain('user:1:settings');
    });

    it('should delete keys by pattern', async () => {
      await cacheService.deletePattern('user:1:*');
      
      expect(await cacheService.has('user:1:profile')).toBe(false);
      expect(await cacheService.has('user:1:settings')).toBe(false);
      expect(await cacheService.has('user:2:profile')).toBe(true);
    });

    it('should handle patterns with no matches', async () => {
      const keys = await cacheService.keys('nonexistent:*');
      expect(keys).toHaveLength(0);
      
      await cacheService.deletePattern('nonexistent:*');
      // Should not throw error
    });
  });

  describe('Statistics', () => {
    it('should track cache statistics', async () => {
      // Generate some cache activity
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      await cacheService.get('key1'); // hit
      await cacheService.get('key1'); // hit
      await cacheService.get('nonexistent'); // miss
      
      const stats = await cacheService.getStats();
      
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(0);
      expect(stats.size).toBe(2);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });

    it('should reset statistics', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.get('key1');
      
      let stats = await cacheService.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      
      await cacheService.resetStats();
      
      stats = await cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
    });
  });

  describe('Memory Management', () => {
    it('should handle size limits', async () => {
      const smallCacheService = new CacheService(mockLogger as any, {
        maxSize: 2,
        defaultTTL: 3600,
        enableStats: true
      });

      // Add more items than the limit
      await smallCacheService.set('key1', 'value1');
      await smallCacheService.set('key2', 'value2');
      await smallCacheService.set('key3', 'value3'); // Should evict oldest

      const stats = await smallCacheService.getStats();
      expect(stats.size).toBeLessThanOrEqual(2);
    });

    it('should perform cleanup of expired items', async () => {
      // Set items with very short TTL
      await cacheService.set('key1', 'value1', 50); // 50ms
      await cacheService.set('key2', 'value2', 50);
      
      expect(await cacheService.has('key1')).toBe(true);
      expect(await cacheService.has('key2')).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force cleanup
      await (cacheService as any).cleanup();
      
      expect(await cacheService.has('key1')).toBe(false);
      expect(await cacheService.has('key2')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle serialization errors gracefully', async () => {
      // Create circular reference
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // Should not throw, but log error
      await cacheService.set('circular', circularObj);
      
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle invalid key types', async () => {
      // Should handle non-string keys gracefully
      await cacheService.set(null as any, 'value');
      await cacheService.set(undefined as any, 'value');
      
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle negative TTL values', async () => {
      await cacheService.set('key', 'value', -100);
      
      // Should either reject immediately or use default TTL
      const hasKey = await cacheService.has('key');
      expect(typeof hasKey).toBe('boolean');
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent operations', async () => {
      const promises = [];
      
      // Concurrent sets
      for (let i = 0; i < 10; i++) {
        promises.push(cacheService.set(`key${i}`, `value${i}`));
      }
      
      await Promise.all(promises);
      
      // Verify all values were set
      for (let i = 0; i < 10; i++) {
        expect(await cacheService.get(`key${i}`)).toBe(`value${i}`);
      }
    });

    it('should handle concurrent get/set on same key', async () => {
      const key = 'concurrent-key';
      const promises = [];
      
      // Mix of gets and sets
      promises.push(cacheService.set(key, 'value1'));
      promises.push(cacheService.get(key));
      promises.push(cacheService.set(key, 'value2'));
      promises.push(cacheService.get(key));
      
      const results = await Promise.all(promises);
      
      // Should not throw errors
      expect(results).toHaveLength(4);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', async () => {
      const health = await cacheService.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toEqual(
        expect.objectContaining({
          provider: 'memory',
          connected: true,
          stats: expect.any(Object)
        })
      );
    });

    it('should include performance metrics in health check', async () => {
      // Add some data first
      await cacheService.set('test', 'value');
      await cacheService.get('test');
      
      const health = await cacheService.healthCheck();
      
      expect(health.details.stats).toEqual(
        expect.objectContaining({
          size: expect.any(Number),
          hits: expect.any(Number),
          hitRate: expect.any(Number)
        })
      );
    });
  });
});