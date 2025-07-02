/**
 * DI Container Types - 依存性注入の型定義
 * 循環インポートを避けるために分離
 */

// 依存性識別子
export const TYPES = {
  Logger: Symbol.for('ILogger'),
  MetricsCollector: Symbol.for('IMetricsCollector'),
  Cache: Symbol.for('ICache'),
  CacheManager: Symbol.for('ICacheManager'),
  ConfigManager: Symbol.for('IConfigManager'),
  RetryHandler: Symbol.for('IRetryHandler'),
  RateLimiter: Symbol.for('IRateLimiter'),
  // Providers
  DeepSeekProvider: Symbol.for('DeepSeekProvider'),
  OpenAIProvider: Symbol.for('OpenAIProvider'),
  AnthropicProvider: Symbol.for('AnthropicProvider'),
  O3Provider: Symbol.for('O3Provider'),
  // Managers
  ProviderManager: Symbol.for('ProviderManager'),
  StrategyManager: Symbol.for('StrategyManager'),
  ToolManager: Symbol.for('ToolManager'),
  // Services
  SynthesisService: Symbol.for('ISynthesisService'),
  SearchService: Symbol.for('ISearchService'),
  // Config
  Config: Symbol.for('Config'),
  // Server
  MCPServer: Symbol.for('MCPServer'),
} as const;