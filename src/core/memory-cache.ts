/**
 * Memory Cache Service - インメモリキャッシュシステム
 * 高速なメモリベースキャッシュ実装
 */

import { injectable } from 'inversify';
import { ICache, CacheOptions, CacheStats } from '../types/index.js';

interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  tags?: string[];
}

@injectable()
export class MemoryCache implements ICache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      ...(options?.tags && { tags: options.tags }),
    };

    if (options?.ttl) {
      entry.expiresAt = Date.now() + (options.ttl * 1000);
    }

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.evictions += size;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      return false;
    }

    return true;
  }

  async getStats(): Promise<CacheStats> {
    const size = this.cache.size;
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: size,
      evictions: this.stats.evictions,
      hit_rate: hitRate,
    };
  }

  // Utility method to clean up expired entries
  cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        evicted++;
      }
    }

    this.stats.evictions += evicted;
  }
}