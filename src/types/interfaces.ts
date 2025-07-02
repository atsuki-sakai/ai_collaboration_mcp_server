/**
 * Interfaces - インターフェース定義
 * システム全体で使用されるインターフェースを定義
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  AIProvider,
  ErrorDetail,
  TokenUsage,
  Timestamp,
  UUID,
  LanguageCode,
  CacheOptions,
  BaseMetadata,
  RateLimit,
} from './common';

// プロバイダー機能
export interface ProviderCapabilities {
  models: string[];
  max_tokens: number;
  supports_streaming?: boolean;
  supports_functions?: boolean;
  supports_vision?: boolean;
  supports_web_search?: boolean;
  languages: LanguageCode[];
}

// ヘルスステータス
export interface HealthStatus {
  healthy: boolean;
  latency?: number;
  rate_limit?: RateLimit;
  last_error?: ErrorDetail;
  uptime?: number;
}

// AI リクエスト
export interface AIRequest {
  id: UUID;
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  metadata?: BaseMetadata;
}

// 検索結果サマリー
export interface SearchResultSummary {
  query: string;
  results: Array<{
    title: string;
    url?: string;
    snippet: string;
    score?: number;
  }>;
  total_results?: number;
}

// AI レスポンス
export interface AIResponse {
  id: UUID;
  provider: AIProvider;
  model: string;
  content: string;
  usage: TokenUsage;
  latency: number;
  finish_reason?: string;
  metadata?: BaseMetadata & {
    cached?: boolean;
    search_performed?: boolean;
    search_results?: SearchResultSummary[];
  };
  error?: ErrorDetail;
}

// バリデーション結果
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    code: string;
    expected?: unknown;
    actual?: unknown;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
    suggestion?: string;
  }>;
}

// プロバイダー設定の型定義
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultModel?: string;
  [key: string]: unknown;
}

// AIプロバイダーインターフェース
export interface IAIProvider {
  readonly name: AIProvider;
  readonly capabilities: ProviderCapabilities;
  
  initialize(config: ProviderConfig): Promise<void>;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  validateRequest(request: AIRequest): ValidationResult;
  getHealthStatus(): Promise<HealthStatus>;
  dispose(): Promise<void>;
}

// ツール設定の型定義
export interface ToolConfig {
  timeout?: number;
  maxRetries?: number;
  cacheEnabled?: boolean;
  [key: string]: unknown;
}

// ツール実行コンテキスト
export interface ToolContext {
  request_id: UUID;
  user_id?: string;
  session_id?: string;
  environment?: Record<string, string>;
  config?: ToolConfig;
}

// ツール結果データの型定義
export type ToolResultData = Record<string, unknown> | string | number | boolean | null;

// ツール結果
export interface ToolResult {
  success: boolean;
  data?: ToolResultData;
  error?: ErrorDetail;
  metadata?: {
    request_id: UUID;
    timestamp: Timestamp;
    execution_time: number;
    providers_used?: AIProvider[];
    tokens_used?: number;
    cache_hit?: boolean;
    [key: string]: unknown;
  };
}

// JSONスキーマの型定義（簡易版）
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

// ツール入力の型定義
export type ToolInput = Record<string, unknown>;

// ツールインターフェース
export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: JSONSchema;
  
  execute(input: ToolInput, context: ToolContext): Promise<ToolResult>;
  validate(input: unknown): ValidationResult;
}

// 戦略実行コンテキスト
export interface StrategyContext {
  request_id: UUID;
  strategy_type: string;
  timeout?: number;
  [key: string]: unknown;
}

// 戦略実行結果
export interface StrategyResult {
  success: boolean;
  responses: AIResponse[];
  consensus?: string;
  metadata?: Record<string, unknown>;
}

// 戦略インターフェース
export interface IStrategy {
  readonly name: string;
  readonly description: string;
  
  execute(
    providers: IAIProvider[],
    request: AIRequest,
    context: StrategyContext
  ): Promise<StrategyResult>;
}

// ロガーメタデータ型
export type LoggerMetadata = Record<string, unknown>;

// ロガーインターフェース
export interface ILogger {
  debug(message: string, metadata?: LoggerMetadata): void;
  info(message: string, metadata?: LoggerMetadata): void;
  warn(message: string, metadata?: LoggerMetadata): void;
  error(message: string, error?: Error, metadata?: LoggerMetadata): void;
  fatal(message: string, error?: Error, metadata?: LoggerMetadata): void;
  child(metadata: LoggerMetadata): ILogger;
}

// キャッシュ統計
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
  hit_rate: number;
}

// キャッシュインターフェース
export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  getStats(): Promise<CacheStats>;
}

// メトリクスコレクターインターフェース
export interface IMetricsCollector {
  increment(metric: string, tags?: Record<string, string>): void;
  decrement(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, duration: number, tags?: Record<string, string>): void;
}

// イベントデータの型定義
export type EventData = Record<string, unknown>;

// イベントハンドラー
export type EventHandler = (event: EventData) => void | Promise<void>;

// イベントエミッターインターフェース
export interface IEventEmitter {
  emit(event: string, data: EventData): void;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  once(event: string, handler: EventHandler): void;
}

// バリデーターインターフェース
export interface IValidator<T> {
  validate(data: unknown): ValidationResult;
  isValid(data: unknown): data is T;
  sanitize(data: unknown): T;
}

// レート制限結果
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: Timestamp;
  retry_after?: number;
}

// レート制限インターフェース
export interface IRateLimiter {
  checkLimit(key: string): Promise<RateLimitResult>;
  consumeToken(key: string, tokens?: number): Promise<boolean>;
  getRemainingTokens(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

// 設定管理バリデーションエラー
export interface ConfigValidationError {
  field: string;
  message: string;
  code: string;
  expected?: unknown;
  actual?: unknown;
}

// 設定管理オプション
export interface ConfigManagerOptions {
  configDir?: string;
  environment?: string;
  enableHotReload?: boolean;
  interpolateEnvVars?: boolean;
}

// 設定管理インターフェース
export interface IConfigManager {
  load(): Promise<void>;
  reload(): Promise<void>;
  get(key?: string): unknown;
  set(key: string, value: unknown): void;
  validate(): Promise<boolean>;
  getValidationErrors(): ConfigValidationError[];
  has(key: string): boolean;
  toJSON(): Record<string, unknown>;
}

// リトライ設定
export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: Error) => boolean;
}

// リトライ結果
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

// リトライハンドラーインターフェース
export interface IRetryHandler {
  executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T>;
  
  getRetryDelay(attempt: number, baseDelay: number, maxDelay: number, backoffFactor: number): number;
}

// プロバイダー統計
export interface ProviderStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryCount: number;
  rateLimitHits: number;
  averageLatency: number;
  lastRequestTime?: Timestamp;
  lastErrorTime?: Timestamp;
}

// プロバイダーインターフェース拡張
export interface IBaseProvider extends IAIProvider {
  readonly stats: ProviderStats;
  
  // 統計とメトリクス
  getStats(): ProviderStats;
  resetStats(): void;
  
  // ヘルスチェック
  isHealthy(): boolean;
  
  // プロバイダー固有の設定更新
  updateConfig(config: Partial<ProviderConfig>): Promise<void>;
}