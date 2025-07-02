/**
 * Base Provider - AIプロバイダーの基底クラス
 * 共通機能（リトライ、レート制限、統計、エラーハンドリング）を提供
 */

import { injectable, inject } from 'inversify';
import { 
  IBaseProvider, 
  IRetryHandler, 
  IRateLimiter,
  AIRequest, 
  AIResponse, 
  ProviderCapabilities,
  AIProvider,
  HealthStatus,
  ValidationResult,
  ProviderConfig,
  ProviderStats,
  Timestamp
} from '../types/index.js';

@injectable()
export abstract class BaseProvider implements IBaseProvider {
  // 抽象プロパティ - 継承クラスで実装必須
  abstract readonly name: AIProvider;
  abstract readonly capabilities: ProviderCapabilities;

  // 依存性注入
  @inject(Symbol.for('IRetryHandler')) protected retryHandler!: IRetryHandler;
  @inject(Symbol.for('IRateLimiter')) protected rateLimiter!: IRateLimiter;

  // 内部状態
  protected config: ProviderConfig = {};
  protected initialized = false;
  private _stats: ProviderStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retryCount: 0,
    rateLimitHits: 0,
    averageLatency: 0
  };

  // 統計情報の読み取り専用アクセス
  get stats(): ProviderStats {
    return { ...this._stats };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.validateConfig(config);
    this.config = { ...config };
    
    try {
      await this.initializeProvider();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize ${this.name} provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} is not initialized`);
    }

    const validation = this.validateRequest(request);
    if (!validation.valid) {
      const errorMessage = validation.errors?.map(e => e.message).join(', ') || 'Invalid request';
      throw new Error(`Request validation failed: ${errorMessage}`);
    }

    const startTime = Date.now();
    this._stats.totalRequests++;

    try {
      // レート制限チェック
      const rateLimitResult = await this.rateLimiter.checkLimit(this.name);
      if (!rateLimitResult.allowed) {
        this._stats.rateLimitHits++;
        throw new Error(`Rate limit exceeded for ${this.name}. Retry after: ${rateLimitResult.retry_after}ms`);
      }

      // リトライ付きでプロバイダーを呼び出し
      const response = await this.retryHandler.executeWithRetry(
        () => this.callProvider(request),
        {
          maxRetries: this.config.maxRetries || 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffFactor: 2,
          retryCondition: (error) => this.isRetryableError(error)
        }
      );

      // 成功時の統計更新
      const latency = Date.now() - startTime;
      this.updateSuccessStats(latency);

      return response;

    } catch (error) {
      // 失敗時の統計更新
      this.updateFailureStats();
      throw error;
    }
  }

  validateRequest(request: AIRequest): ValidationResult {
    const errors: Array<{
      field: string;
      message: string;
      code: string;
      expected?: unknown;
      actual?: unknown;
    }> = [];

    // 基本バリデーション
    if (!request.id || request.id.trim() === '') {
      errors.push({
        field: 'id',
        message: 'Request ID is required',
        code: 'REQUIRED_FIELD',
        expected: 'non-empty string',
        actual: request.id
      });
    }

    if (!request.prompt || request.prompt.trim() === '') {
      errors.push({
        field: 'prompt',
        message: 'Prompt is required',
        code: 'REQUIRED_FIELD',
        expected: 'non-empty string',
        actual: request.prompt
      });
    }

    // モデル検証
    if (request.model && !this.capabilities.models.includes(request.model)) {
      errors.push({
        field: 'model',
        message: `Model '${request.model}' is not supported by ${this.name}`,
        code: 'INVALID_MODEL',
        expected: this.capabilities.models,
        actual: request.model
      });
    }

    // トークン数検証
    if (request.max_tokens && request.max_tokens > this.capabilities.max_tokens) {
      errors.push({
        field: 'max_tokens',
        message: `Max tokens ${request.max_tokens} exceeds limit of ${this.capabilities.max_tokens}`,
        code: 'EXCEEDS_LIMIT',
        expected: `<= ${this.capabilities.max_tokens}`,
        actual: request.max_tokens
      });
    }

    if (errors.length === 0) {
      return { valid: true };
    }
    
    return {
      valid: false,
      errors
    };
  }

  async getHealthStatus(): Promise<HealthStatus> {
    if (!this.initialized) {
      return {
        healthy: false,
        last_error: {
          code: 'NOT_INITIALIZED',
          message: `Provider ${this.name} is not initialized`,
          timestamp: new Date().toISOString(),
          stack: ''
        }
      };
    }

    try {
      const startTime = Date.now();
      await this.performHealthCheck();
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        uptime: this.getUptime()
      };
    } catch (error) {
      return {
        healthy: false,
        last_error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          stack: error instanceof Error ? (error.stack || '') : ''
        }
      };
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.disposeProvider();
    } finally {
      this.initialized = false;
      this.resetStats();
    }
  }

  // 統計メソッド
  getStats(): ProviderStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retryCount: 0,
      rateLimitHits: 0,
      averageLatency: 0
    };
  }

  isHealthy(): boolean {
    return this.initialized;
  }

  async updateConfig(config: Partial<ProviderConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    if (this.initialized) {
      await this.reinitializeWithNewConfig();
    }
  }

  // 抽象メソッド - 継承クラスで実装必須
  protected abstract callProvider(request: AIRequest): Promise<AIResponse>;

  // オーバーライド可能なメソッド
  protected async initializeProvider(): Promise<void> {
    // デフォルト実装は何もしない
    // 継承クラスで必要に応じてオーバーライド
  }

  protected async disposeProvider(): Promise<void> {
    // デフォルト実装は何もしない
    // 継承クラスで必要に応じてオーバーライド
  }

  protected async performHealthCheck(): Promise<void> {
    // デフォルト実装は何もしない（成功とみなす）
    // 継承クラスで実際のヘルスチェックロジックを実装
  }

  protected async reinitializeWithNewConfig(): Promise<void> {
    // デフォルト実装は何もしない
    // 継承クラスで設定変更時の再初期化ロジックを実装
  }

  // プライベートメソッド
  private validateConfig(config: ProviderConfig): void {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    if (config.timeout && config.timeout < 1000) {
      throw new Error('Timeout must be at least 1000ms');
    }

    if (config.maxRetries && config.maxRetries < 0) {
      throw new Error('Max retries must be non-negative');
    }
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /rate.?limit/i,
      /temporarily/i,
      /5\d\d/, // 5xx HTTP errors
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ETIMEDOUT/
    ];

    return retryablePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private updateSuccessStats(latency: number): void {
    this._stats.successfulRequests++;
    this._stats.lastRequestTime = new Date().toISOString() as Timestamp;
    
    // 移動平均でレイテンシを計算
    const totalSuccessful = this._stats.successfulRequests;
    this._stats.averageLatency = 
      (this._stats.averageLatency * (totalSuccessful - 1) + latency) / totalSuccessful;
  }

  private updateFailureStats(): void {
    this._stats.failedRequests++;
    this._stats.lastErrorTime = new Date().toISOString() as Timestamp;
  }

  private getUptime(): number {
    // 実装では初期化からの経過時間を返す
    // 簡易実装として現在時刻を返す
    return Date.now();
  }
}