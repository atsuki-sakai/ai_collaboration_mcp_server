/**
 * Cache Service - キャッシュサービス実装
 * T010: メモリキャッシュとRedis対応の高機能キャッシュサービス
 */

import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { TYPES } from '../core/types.js';

export interface CacheConfig {
  provider: 'memory' | 'redis';
  maxSize?: number;
  defaultTTL?: number; // seconds
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  compression?: boolean;
  serialization?: 'json' | 'msgpack';
}

export interface CacheItem<T = any> {
  data: T;
  ttl: number;
  created: number;
  accessed: number;
  hits: number;
  size: number;
}

export interface CacheStats {
  totalKeys: number;
  memoryUsage: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  averageKeySize: number;
}

export interface ICacheService {
  // 基本操作
  set<T>(key: string, value: T, ttl?: number): Promise<boolean>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  
  // 拡張操作
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean>;
  mdelete(keys: string[]): Promise<number>;
  
  // パターン操作
  keys(pattern: string): Promise<string[]>;
  deletePattern(pattern: string): Promise<number>;
  
  // TTL操作
  getTTL(key: string): Promise<number>;
  setTTL(key: string, ttl: number): Promise<boolean>;
  
  // 統計
  getStats(): Promise<CacheStats>;
  getInfo(key: string): Promise<CacheItem | null>;
  
  // 管理
  cleanup(): Promise<number>;
  optimize(): Promise<void>;
}

@injectable()
export class CacheService implements ICacheService {
  private memoryCache = new Map<string, CacheItem>();
  private stats = {
    hits: 0,
    misses: 0,
    totalMemoryUsage: 0
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    private config: CacheConfig
  ) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      if (this.config.provider === 'redis') {
        await this.initializeRedis();
      }
      this.logger.info('CacheService initialized', { provider: this.config.provider });
    } catch (error) {
      this.logger.error('Failed to initialize CacheService', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async initializeRedis(): Promise<void> {
    // Redis初期化（実際の実装では適切なRedisクライアントを使用）
    this.logger.warn('Redis support not implemented yet, falling back to memory cache');
    this.config.provider = 'memory';
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const now = Date.now();
      const actualTTL = ttl || this.config.defaultTTL || 3600;
      const serializedData = this.serialize(value);
      const size = this.calculateSize(serializedData);

      if (this.config.provider === 'memory') {
        // メモリ容量チェック
        if (this.config.maxSize && this.stats.totalMemoryUsage + size > this.config.maxSize) {
          await this.evictLRU();
        }

        this.memoryCache.set(key, {
          data: value,
          ttl: now + (actualTTL * 1000),
          created: now,
          accessed: now,
          hits: 0,
          size
        });

        this.stats.totalMemoryUsage += size;
      }

      this.logger.debug('Cache set', { key, ttl: actualTTL, size });
      return true;
    } catch (error) {
      this.logger.error('Cache set failed', error instanceof Error ? error : new Error(String(error)), { key });
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.config.provider === 'memory') {
        const item = this.memoryCache.get(key);
        
        if (!item) {
          this.stats.misses++;
          return null;
        }

        const now = Date.now();
        
        // TTL チェック
        if (item.ttl < now) {
          this.memoryCache.delete(key);
          this.stats.totalMemoryUsage -= item.size;
          this.stats.misses++;
          return null;
        }

        // アクセス情報更新
        item.accessed = now;
        item.hits++;
        this.stats.hits++;

        this.logger.debug('Cache hit', { key, hits: item.hits });
        return item.data as T;
      }

      return null;
    } catch (error) {
      this.logger.error('Cache get failed', error instanceof Error ? error : new Error(String(error)), { key });
      this.stats.misses++;
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (this.config.provider === 'memory') {
        const item = this.memoryCache.get(key);
        if (item) {
          this.stats.totalMemoryUsage -= item.size;
          this.memoryCache.delete(key);
          this.logger.debug('Cache deleted', { key });
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error('Cache delete failed', error instanceof Error ? error : new Error(String(error)), { key });
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      if (this.config.provider === 'memory') {
        this.memoryCache.clear();
        this.stats.totalMemoryUsage = 0;
      }
      this.logger.info('Cache cleared');
      return true;
    } catch (error) {
      this.logger.error('Cache clear failed', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (this.config.provider === 'memory') {
        const item = this.memoryCache.get(key);
        if (item && item.ttl >= Date.now()) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error('Cache exists check failed', error instanceof Error ? error : new Error(String(error)), { key });
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = [];
    for (const key of keys) {
      results.push(await this.get<T>(key));
    }
    return results;
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    try {
      for (const item of items) {
        await this.set(item.key, item.value, item.ttl);
      }
      return true;
    } catch (error) {
      this.logger.error('Cache mset failed', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async mdelete(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.config.provider === 'memory') {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(this.memoryCache.keys()).filter(key => regex.test(key));
    }
    return [];
  }

  async deletePattern(pattern: string): Promise<number> {
    const matchingKeys = await this.keys(pattern);
    return await this.mdelete(matchingKeys);
  }

  async getTTL(key: string): Promise<number> {
    if (this.config.provider === 'memory') {
      const item = this.memoryCache.get(key);
      if (item) {
        const remaining = Math.max(0, item.ttl - Date.now());
        return Math.floor(remaining / 1000);
      }
    }
    return -1;
  }

  async setTTL(key: string, ttl: number): Promise<boolean> {
    if (this.config.provider === 'memory') {
      const item = this.memoryCache.get(key);
      if (item) {
        item.ttl = Date.now() + (ttl * 1000);
        return true;
      }
    }
    return false;
  }

  async getStats(): Promise<CacheStats> {
    const totalHits = this.stats.hits;
    const totalMisses = this.stats.misses;
    const totalRequests = totalHits + totalMisses;
    
    return {
      totalKeys: this.memoryCache.size,
      memoryUsage: this.stats.totalMemoryUsage,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      totalHits,
      totalMisses,
      averageKeySize: this.memoryCache.size > 0 ? this.stats.totalMemoryUsage / this.memoryCache.size : 0
    };
  }

  async getInfo(key: string): Promise<CacheItem | null> {
    if (this.config.provider === 'memory') {
      const item = this.memoryCache.get(key);
      return item || null;
    }
    return null;
  }

  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    if (this.config.provider === 'memory') {
      for (const [key, item] of this.memoryCache.entries()) {
        if (item.ttl < now) {
          this.memoryCache.delete(key);
          this.stats.totalMemoryUsage -= item.size;
          cleaned++;
        }
      }
    }

    this.logger.debug('Cache cleanup completed', { cleaned });
    return cleaned;
  }

  async optimize(): Promise<void> {
    // 期限切れキーの削除
    await this.cleanup();

    // メモリ使用量が上限を超えている場合のLRU削除
    if (this.config.maxSize && this.stats.totalMemoryUsage > this.config.maxSize) {
      await this.evictLRU();
    }

    this.logger.debug('Cache optimization completed');
  }

  private async evictLRU(): Promise<void> {
    if (this.config.provider === 'memory') {
      // LRU (Least Recently Used) 戦略でキーを削除
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].accessed - b[1].accessed);

      const targetSize = this.config.maxSize! * 0.8; // 80%まで削減
      while (this.stats.totalMemoryUsage > targetSize && entries.length > 0) {
        const [key, item] = entries.shift()!;
        this.memoryCache.delete(key);
        this.stats.totalMemoryUsage -= item.size;
      }
    }
  }

  private serialize<T>(data: T): string {
    if (this.config.serialization === 'msgpack') {
      // MessagePack実装（実際の実装では適切なライブラリを使用）
      return JSON.stringify(data);
    }
    return JSON.stringify(data);
  }

  private calculateSize(data: string): number {
    // UTF-8文字列のバイト数を概算
    return new Blob([data]).size;
  }

  // ICache インターフェース実装（後方互換性のため）
  async has(key: string): Promise<boolean> {
    return this.exists(key);
  }

  // Redis specific methods (将来の実装用)
}

// ファクトリー関数
export function createCacheService(config: CacheConfig, logger: Logger): ICacheService {
  return new CacheService(logger, config);
}

// 設定のバリデーション
export function validateCacheConfig(config: CacheConfig): string[] {
  const errors: string[] = [];

  if (!['memory', 'redis'].includes(config.provider)) {
    errors.push('Invalid cache provider. Must be "memory" or "redis"');
  }

  if (config.maxSize && config.maxSize <= 0) {
    errors.push('maxSize must be greater than 0');
  }

  if (config.defaultTTL && config.defaultTTL <= 0) {
    errors.push('defaultTTL must be greater than 0');
  }

  if (config.provider === 'redis' && config.redis) {
    if (!config.redis.host) {
      errors.push('Redis host is required');
    }
    if (!config.redis.port || config.redis.port <= 0) {
      errors.push('Valid Redis port is required');
    }
  }

  return errors;
}