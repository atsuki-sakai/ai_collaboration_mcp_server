/**
 * DI Container - 依存性注入コンテナ
 * InversifyJSベースのDIコンテナ設定
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import winston from 'winston';
import { ILogger, IMetricsCollector, ICache, IConfigManager, IRetryHandler, IRateLimiter, IBaseProvider } from '../types/index.js';
import { Logger, LoggerConfig } from './logger.js';
import { MetricsCollector } from './metrics-collector.js';
import { MemoryCache } from './memory-cache.js';
import { ConfigManager } from './config.js';
import { RetryHandler } from './retry-handler.js';
import { RateLimiter } from './rate-limiter.js';
import { ProviderManager, IProviderManager } from './provider-manager.js';
import { StrategyManager, IStrategyManager } from './strategy-manager.js';
import { ToolManager, IToolManager } from './tool-manager.js';
import { DeepSeekProvider } from '../providers/deepseek-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { O3Provider } from '../providers/o3-provider.js';
import { LLMStudioProvider } from '../providers/llmstudio-provider.js';

import { TYPES } from './types.js';

// Re-export TYPES for convenience
export { TYPES };

// コンテナ設定
export interface ContainerConfig {
  logLevel?: string;
  cacheType?: string;
  metricsEnabled?: boolean;
  [key: string]: unknown;
}

/**
 * 新しいDIコンテナを作成
 */
export function createContainer(): Container {
  const container = new Container({
    defaultScope: 'Singleton',
    autoBindInjectable: true,
  });

  return container;
}

/**
 * 依存関係をコンテナにバインド
 */
export function bindDependencies(
  container: Container,
  config: ContainerConfig = {}
): void {
  // Logger サービス（MCPモードでは標準エラー出力のみ）
  container.bind<ILogger>(TYPES.Logger)
    .toDynamicValue(() => {
      const isMCPMode = process.env.MCP_PROTOCOL === 'stdio';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // MCPモードでは標準エラー出力にJSON形式で出力
      if (isMCPMode) {
        const transports = [
          new winston.transports.Console({
            stderrLevels: ['debug', 'info', 'warn', 'error', 'fatal'],
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            )
          })
        ];
        return new Logger({
          level: config.logLevel as any || 'info',
          transports
        });
      }
      
      // スタンドアロンモードでは読みやすい形式で出力
      const consoleFormat = winston.format.printf((info: any) => {
        const { timestamp, level, message, ...metadata } = info;
        const colorMap: Record<string, string> = {
          info: '\x1b[36m',     // Cyan
          warn: '\x1b[33m',     // Yellow
          error: '\x1b[31m',    // Red
          debug: '\x1b[90m',    // Gray
        };
        const color = colorMap[level] || '\x1b[0m';
        
        const reset = '\x1b[0m';
        
        // タイムスタンプを短縮形式に
        const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        let output = `${color}[${time}]${reset} ${message}`;
        
        // エラー詳細は簡潔に
        if (metadata.error && level === 'warn' && typeof metadata.error === 'string') {
          const errorMsg = metadata.error.split(':')[0];
          output += ` - ${errorMsg}`;
        }
        
        return output;
      });
      
      const transports = [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            consoleFormat
          )
        })
      ];
      
      // ファイルローテーションも追加（本番環境のみ）
      if (isProduction && config.enableRotation !== false) {
        transports.push(
          new winston.transports.File({
            filename: 'logs/application.log',
            format: winston.format.json()
          }) as any
        );
      }
      
      return new Logger({
        level: config.logLevel as any || 'info',
        transports
      });
    })
    .inSingletonScope();

  // Metrics Collector サービス
  if (!container.isBound(TYPES.MetricsCollector)) {
    container.bind<IMetricsCollector>(TYPES.MetricsCollector)
      .to(MetricsCollector)
      .inSingletonScope()
      .whenTargetIsDefault();
  }

  // Cache Manager サービス
  if (!container.isBound(TYPES.CacheManager)) {
    container.bind<ICache>(TYPES.CacheManager)
      .to(MemoryCache)
      .inSingletonScope()
      .whenTargetIsDefault();
  }

  // Config Manager サービス
  if (!container.isBound(TYPES.ConfigManager)) {
    container.bind<IConfigManager>(TYPES.ConfigManager)
      .to(ConfigManager)
      .inSingletonScope()
      .whenTargetIsDefault();
  }

  // Retry Handler サービス
  if (!container.isBound(TYPES.RetryHandler)) {
    container.bind<IRetryHandler>(TYPES.RetryHandler)
      .to(RetryHandler)
      .inSingletonScope()
      .whenTargetIsDefault();
  }

  // Rate Limiter サービス
  if (!container.isBound(TYPES.RateLimiter)) {
    container.bind<IRateLimiter>(TYPES.RateLimiter)
      .to(RateLimiter)
      .inSingletonScope()
      .whenTargetIsDefault();
  }

  // AI Providers
  if (!container.isBound(TYPES.DeepSeekProvider)) {
    container.bind<IBaseProvider>(TYPES.DeepSeekProvider)
      .to(DeepSeekProvider)
      .inSingletonScope();
  }

  if (!container.isBound(TYPES.OpenAIProvider)) {
    container.bind<IBaseProvider>(TYPES.OpenAIProvider)
      .to(OpenAIProvider)
      .inSingletonScope();
  }

  if (!container.isBound(TYPES.AnthropicProvider)) {
    container.bind<IBaseProvider>(TYPES.AnthropicProvider)
      .to(AnthropicProvider)
      .inSingletonScope();
  }

  if (!container.isBound(TYPES.O3Provider)) {
    container.bind<IBaseProvider>(TYPES.O3Provider)
      .to(O3Provider)
      .inSingletonScope();
  }

  if (!container.isBound(TYPES.LLMStudioProvider)) {
    container.bind<IBaseProvider>(TYPES.LLMStudioProvider)
      .to(LLMStudioProvider)
      .inSingletonScope();
  }

  // Provider Manager
  if (!container.isBound(TYPES.ProviderManager)) {
    container.bind<IProviderManager>(TYPES.ProviderManager)
      .to(ProviderManager)
      .inSingletonScope();
  }

  // Strategy Manager
  if (!container.isBound(TYPES.StrategyManager)) {
    container.bind<IStrategyManager>(TYPES.StrategyManager)
      .to(StrategyManager)
      .inSingletonScope();
  }

  // Tool Manager
  if (!container.isBound(TYPES.ToolManager)) {
    container.bind<IToolManager>(TYPES.ToolManager)
      .to(ToolManager)
      .inSingletonScope();
  }

  // Services の動的登録 (後で遅延実行)
  // これらのサービスは実際に使用されるときにロードされる

  // 設定を定数としてバインド（必要に応じて）
  container.bind<ContainerConfig>('Config').toConstantValue(config);
}

/**
 * 設定済みのコンテナを作成
 */
export function createConfiguredContainer(config: ContainerConfig = {}): Container {
  const container = createContainer();
  bindDependencies(container, config);
  return container;
}

/**
 * サービスファクトリー関数
 */
export const ServiceFactory = {
  createLogger: (config?: LoggerConfig): Logger => new Logger(config),
  createMetricsCollector: (): MetricsCollector => new MetricsCollector(),
  createMemoryCache: (): MemoryCache => new MemoryCache(),
  createConfigManager: (): ConfigManager => new ConfigManager(),
  createRetryHandler: (): RetryHandler => new RetryHandler(),
  createRateLimiter: (): RateLimiter => new RateLimiter(),
  createDeepSeekProvider: (): DeepSeekProvider => new DeepSeekProvider(),
  createOpenAIProvider: (): OpenAIProvider => new OpenAIProvider(),
  createAnthropicProvider: (): AnthropicProvider => new AnthropicProvider(),
  createO3Provider: (): O3Provider => new O3Provider(),
  createLLMStudioProvider: (): LLMStudioProvider => new LLMStudioProvider(),
  createProviderManager: (
    deepSeek: DeepSeekProvider,
    openAI: OpenAIProvider,
    anthropic: AnthropicProvider,
    o3: O3Provider,
    llmstudio?: LLMStudioProvider
  ): ProviderManager => new ProviderManager(deepSeek, openAI, anthropic, o3, llmstudio ?? new LLMStudioProvider()),
  createStrategyManager: (providerManager: ProviderManager): StrategyManager => 
    new StrategyManager(providerManager),
  createToolManager: (strategyManager: StrategyManager, providerManager: ProviderManager): ToolManager =>
    new ToolManager(strategyManager, providerManager),
};

/**
 * コンテナからサービスを安全に取得するヘルパー
 */
export function getService<T>(container: Container, serviceType: symbol): T {
  try {
    return container.get<T>(serviceType);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resolve service ${serviceType.toString()}: ${errorMessage}`);
  }
}

/**
 * コンテナの状態を検証
 */
export function validateContainer(container: Container): boolean {
  const requiredServices = [
    TYPES.Logger,
    TYPES.MetricsCollector,
    TYPES.CacheManager,
    TYPES.ConfigManager,
    TYPES.RetryHandler,
    TYPES.RateLimiter,
    TYPES.DeepSeekProvider,
    TYPES.OpenAIProvider,
    TYPES.AnthropicProvider,
    TYPES.O3Provider,
    TYPES.LLMStudioProvider,
    TYPES.ProviderManager,
    TYPES.StrategyManager,
    TYPES.ToolManager,
  ];

  return requiredServices.every(serviceType => {
    try {
      container.get(serviceType);
      return true;
    } catch {
      return false;
    }
  });
}

// デフォルトのコンテナインスタンス
export const container = createConfiguredContainer();

// setupContainer エイリアス（後方互換性）
export async function setupContainer(config?: ContainerConfig): Promise<Container> {
  const newContainer = createConfiguredContainer(config);
  
  // MCPサーバーと追加サービスをバインド
  const { MetricsService } = await import('../services/metrics-service.js');
  const { CacheService } = await import('../services/cache-service.js');
  const { SearchService } = await import('../services/search-service.js');
  const { SynthesisService } = await import('../services/synthesis-service.js');
  const { MCPServer } = await import('../server/mcp-server.js');
  
  type CacheConfig = any;
  type MCPServerConfig = any;
  
  // MCPサーバー設定
  const mcpConfig: MCPServerConfig = {
    name: 'claude-code-ai-collab-mcp',
    version: '1.0.0',
    capabilities: {
      tools: true,
      resources: true,
      prompts: false,
      logging: true
    },
    server: {
      protocol: (process.env.MCP_PROTOCOL as 'stdio' | 'sse' | 'websocket') || 'stdio'
    },
    providers: {
      enabled: ['deepseek', 'openai', 'anthropic', 'o3'] as any[],
      default: (process.env.MCP_DEFAULT_PROVIDER as any) || 'deepseek'
    },
    features: {
      collaboration: true,
      caching: true,
      metrics: true,
      search: true,
      synthesis: true
    }
  };
  
  // キャッシュ設定
  const cacheConfig: CacheConfig = {
    provider: 'memory',
    maxSize: 100 * 1024 * 1024, // 100MB
    defaultTTL: 3600,
    compression: false,
    serialization: 'json'
  };
  
  newContainer.bind('MCPServerConfig').toConstantValue(mcpConfig);
  newContainer.bind(TYPES.MetricsService).to(MetricsService).inSingletonScope();
  
  // CacheServiceはファクトリーで作成
  newContainer.bind(TYPES.CacheService).toDynamicValue((context) => {
    const logger = context.container.get<Logger>(TYPES.Logger);
    return new CacheService(logger, cacheConfig);
  }).inSingletonScope();
  
  newContainer.bind(TYPES.SearchService).to(SearchService).inSingletonScope();
  newContainer.bind(TYPES.SynthesisService).to(SynthesisService).inSingletonScope();
  newContainer.bind(TYPES.MCPServer).to(MCPServer).inSingletonScope();
  
  return newContainer;
}

/**
 * コンテナのクリーンアップ
 */
export async function disposeContainer(container: Container): Promise<void> {
  try {
    // 各サービスの dispose メソッドを呼び出し（存在する場合）
    const serviceTypes = [TYPES.Logger, TYPES.MetricsCollector, TYPES.CacheManager, TYPES.ConfigManager, TYPES.RetryHandler, TYPES.RateLimiter];
    
    for (const serviceType of serviceTypes) {
      if (container.isBound(serviceType)) {
        try {
          const service = container.get(serviceType) as unknown;
          if (service && typeof service === 'object' && 'dispose' in service && typeof (service as { dispose: unknown }).dispose === 'function') {
            await (service as { dispose: () => Promise<void> }).dispose();
          }
        } catch (error) {
          // サービス取得エラーは無視（既に削除されている可能性）
        }
      }
    }

    // コンテナをクリア
    container.unbindAll();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during container disposal:', error);
    throw error;
  }
}