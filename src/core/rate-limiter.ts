/**
 * Rate Limiter - レート制限実装
 * メモリベースのトークンバケット方式
 */

import { injectable } from 'inversify';
import { IRateLimiter, RateLimitResult, Timestamp } from '../types/index.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // トークン/秒
}

@injectable()
export class RateLimiter implements IRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private defaultCapacity = 100; // デフォルト容量
  private defaultRefillRate = 10; // 10トークン/秒

  async checkLimit(key: string): Promise<RateLimitResult> {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);

    const allowed = bucket.tokens >= 1;
    const resetAt = new Date(Date.now() + (bucket.capacity / bucket.refillRate) * 1000);

    const result: RateLimitResult = {
      allowed,
      remaining: Math.floor(bucket.tokens),
      reset_at: resetAt.toISOString() as Timestamp
    };

    if (!allowed) {
      result.retry_after = Math.ceil((1 - bucket.tokens) / bucket.refillRate * 1000);
    }

    return result;
  }

  async consumeToken(key: string, tokens = 1): Promise<boolean> {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  async getRemainingTokens(key: string): Promise<number> {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);
    return Math.floor(bucket.tokens);
  }

  async reset(key: string): Promise<void> {
    const bucket = this.getBucket(key);
    bucket.tokens = bucket.capacity;
    bucket.lastRefill = Date.now();
  }

  private getBucket(key: string): TokenBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        tokens: this.defaultCapacity,
        lastRefill: Date.now(),
        capacity: this.defaultCapacity,
        refillRate: this.defaultRefillRate
      });
    }
    return this.buckets.get(key)!;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000; // 秒
    const tokensToAdd = timePassed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
}