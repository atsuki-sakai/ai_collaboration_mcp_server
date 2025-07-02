#!/usr/bin/env node
/**
 * MCP Server Entry Point - エントリーポイント
 * T011: Claude Code AI Collaboration MCP Server のメインエントリーポイント
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { fileURLToPath } from 'url';
import { MCPServer, MCPServerConfig } from './server/mcp-server.js';
import { Logger } from './core/logger.js';
import { AppConfig } from './core/config.js';
import { TYPES } from './core/types.js';

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'claude-code-ai-collab-mcp',
  version: '1.0.0',
  capabilities: {
    tools: true,
    resources: true,
    prompts: false,
    logging: true
  },
  server: {
    protocol: 'stdio'
  },
  providers: {
    enabled: ['deepseek', 'openai', 'anthropic'],
    default: 'deepseek'
  },
  features: {
    collaboration: true,
    caching: true,
    metrics: true,
    search: true,
    synthesis: true
  }
};

/**
 * 環境変数からの設定読み込み
 */
function loadConfigFromEnv(): Partial<MCPServerConfig> {
  const config: Partial<MCPServerConfig> = {};

  // サーバー設定
  if (process.env.MCP_PROTOCOL) {
    config.server = {
      ...config.server,
      protocol: process.env.MCP_PROTOCOL as 'stdio' | 'sse' | 'websocket'
    };
  }

  if (process.env.MCP_PORT) {
    config.server = {
      ...config.server,
      port: parseInt(process.env.MCP_PORT, 10)
    };
  }

  if (process.env.MCP_HOST) {
    config.server = {
      ...config.server,
      host: process.env.MCP_HOST
    };
  }

  // プロバイダー設定
  if (process.env.MCP_PROVIDERS) {
    const providers = process.env.MCP_PROVIDERS.split(',').map(p => p.trim());
    config.providers = {
      enabled: providers as any[],
      ...(config.providers?.default ? { default: config.providers.default } : {})
    };
  }

  if (process.env.MCP_DEFAULT_PROVIDER) {
    config.providers = {
      enabled: config.providers?.enabled || DEFAULT_CONFIG.providers?.enabled || ['deepseek'],
      default: process.env.MCP_DEFAULT_PROVIDER as any
    };
  }

  // 機能設定
  if (process.env.MCP_DISABLE_CACHING === 'true') {
    config.features = {
      ...config.features,
      caching: false
    };
  }

  if (process.env.MCP_DISABLE_METRICS === 'true') {
    config.features = {
      ...config.features,
      metrics: false
    };
  }

  return config;
}

/**
 * コマンドライン引数の解析
 */
function parseCommandLine(): Partial<MCPServerConfig> {
  const args = process.argv.slice(2);
  const config: Partial<MCPServerConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--protocol':
        if (i + 1 < args.length) {
          config.server = {
            ...config.server,
            protocol: args[++i] as 'stdio' | 'sse' | 'websocket'
          };
        }
        break;

      case '--port':
        if (i + 1 < args.length) {
          config.server = {
            ...config.server,
            port: parseInt(args[++i], 10)
          };
        }
        break;

      case '--host':
        if (i + 1 < args.length) {
          config.server = {
            ...config.server,
            host: args[++i]
          };
        }
        break;

      case '--providers':
        if (i + 1 < args.length) {
          const providers = args[++i].split(',').map(p => p.trim());
          config.providers = {
            enabled: providers as any[],
            ...(config.providers?.default ? { default: config.providers.default } : {})
          };
        }
        break;

      case '--default-provider':
        if (i + 1 < args.length) {
          config.providers = {
            enabled: config.providers?.enabled || DEFAULT_CONFIG.providers?.enabled || ['deepseek'],
            default: args[++i] as any
          };
        }
        break;

      case '--no-cache':
        config.features = {
          ...config.features,
          caching: false
        };
        break;

      case '--no-metrics':
        config.features = {
          ...config.features,
          metrics: false
        };
        break;

      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;

      case '--version':
      case '-v':
        console.log(DEFAULT_CONFIG.version);
        process.exit(0);
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          showHelp();
          process.exit(1);
        }
        break;
    }
  }

  return config;
}

/**
 * ヘルプメッセージの表示
 */
function showHelp(): void {
  console.log(`
Claude Code AI Collaboration MCP Server v${DEFAULT_CONFIG.version}

Usage: claude-code-ai-collab-mcp [options]

Options:
  --protocol <type>         Transport protocol (stdio|sse|websocket) [default: stdio]
  --port <number>           Port for sse/websocket protocols [default: 3000/8080]
  --host <string>           Host for sse/websocket protocols [default: localhost]
  --providers <list>        Comma-separated list of AI providers [default: deepseek,openai,anthropic]
  --default-provider <name> Default AI provider [default: deepseek]
  --no-cache               Disable caching
  --no-metrics             Disable metrics collection
  -h, --help               Show this help message
  -v, --version            Show version

Environment Variables:
  MCP_PROTOCOL             Transport protocol
  MCP_PORT                 Server port
  MCP_HOST                 Server host
  MCP_PROVIDERS            Comma-separated list of providers
  MCP_DEFAULT_PROVIDER     Default provider
  MCP_DISABLE_CACHING      Set to 'true' to disable caching
  MCP_DISABLE_METRICS      Set to 'true' to disable metrics

Examples:
  claude-code-ai-collab-mcp                                    # Start with default stdio transport
  claude-code-ai-collab-mcp --protocol sse --port 3000        # Start SSE server on port 3000
  claude-code-ai-collab-mcp --providers deepseek,openai       # Use only DeepSeek and OpenAI
  claude-code-ai-collab-mcp --no-cache --no-metrics          # Disable caching and metrics
`);
}

/**
 * 設定のマージ
 */
function mergeConfigs(...configs: Array<Partial<MCPServerConfig>>): MCPServerConfig {
  let merged = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    merged = {
      ...merged,
      ...config,
      capabilities: { ...merged.capabilities, ...config.capabilities },
      server: { ...merged.server, ...config.server },
      providers: {
        enabled: config.providers?.enabled || merged.providers?.enabled || DEFAULT_CONFIG.providers?.enabled || ['deepseek'],
        ...(config.providers?.default ? { default: config.providers.default } : merged.providers?.default ? { default: merged.providers.default } : {})
      },
      features: { ...merged.features, ...config.features }
    };
  }

  return merged;
}

/**
 * 設定の検証
 */
function validateConfig(config: MCPServerConfig): void {
  if (!config.name || !config.version) {
    throw new Error('Server name and version are required');
  }

  if (config.server?.protocol && !['stdio', 'sse', 'websocket'].includes(config.server.protocol)) {
    throw new Error('Invalid protocol. Must be stdio, sse, or websocket');
  }

  if (config.server?.port && (config.server.port < 1 || config.server.port > 65535)) {
    throw new Error('Invalid port number. Must be between 1 and 65535');
  }

  if (config.providers?.enabled && config.providers.enabled.length === 0) {
    throw new Error('At least one provider must be enabled');
  }
}

/**
 * シグナルハンドラーの設定
 */
function setupSignalHandlers(server: MCPServer, logger: Logger): void {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await server.stop();
      logger.info('Server stopped gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Windows対応
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
  }

  // 未処理のPromise拒否をキャッチ
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // 未処理の例外をキャッチ
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });
}

/**
 * MCPコンテナのセットアップ
 */
async function setupMCPContainer(container: Container): Promise<void> {
  // 基本的なサービスの設定
  const { Logger } = await import('./core/logger.js');
  const { MemoryCache } = await import('./core/memory-cache.js');
  const { MetricsCollector } = await import('./core/metrics-collector.js');
  const { RetryHandler } = await import('./core/retry-handler.js');
  const { RateLimiter } = await import('./core/rate-limiter.js');
  const { StrategyManager } = await import('./core/strategy-manager.js');
  const { ProviderManager } = await import('./core/provider-manager.js');
  const { ToolManager } = await import('./core/tool-manager.js');
  
  // プロバイダーのインポート
  const { DeepSeekProvider } = await import('./providers/deepseek-provider.js');
  const { OpenAIProvider } = await import('./providers/openai-provider.js');
  const { AnthropicProvider } = await import('./providers/anthropic-provider.js');
  const { O3Provider } = await import('./providers/o3-provider.js');
  
  // サービスのインポート
  const { CacheService } = await import('./services/cache-service.js');
  const { SearchService } = await import('./services/search-service.js');
  const { SynthesisService } = await import('./services/synthesis-service.js');
  
  // MCPサーバーのインポート
  const { MCPServer } = await import('./server/mcp-server.js');

  // コアサービスのバインド
  container.bind(TYPES.Logger).to(Logger).inSingletonScope();
  container.bind(TYPES.Cache).to(MemoryCache).inSingletonScope();
  container.bind(TYPES.MetricsCollector).to(MetricsCollector).inSingletonScope();
  container.bind(TYPES.RetryHandler).to(RetryHandler).inSingletonScope();
  container.bind(TYPES.RateLimiter).to(RateLimiter).inSingletonScope();
  
  // マネージャーのバインド
  container.bind(TYPES.StrategyManager).to(StrategyManager).inSingletonScope();
  container.bind(TYPES.ProviderManager).to(ProviderManager).inSingletonScope();
  container.bind(TYPES.ToolManager).to(ToolManager).inSingletonScope();
  
  // サービスのバインド
  container.bind(TYPES.CacheManager).to(CacheService).inSingletonScope();
  container.bind(TYPES.SearchService).to(SearchService).inSingletonScope();
  container.bind(TYPES.SynthesisService).to(SynthesisService).inSingletonScope();
  
  // MCPサーバーのバインド
  container.bind(MCPServer).toSelf().inSingletonScope();

  // プロバイダーのバインド
  container.bind(TYPES.DeepSeekProvider).to(DeepSeekProvider).inSingletonScope();
  container.bind(TYPES.OpenAIProvider).to(OpenAIProvider).inSingletonScope();
  container.bind(TYPES.AnthropicProvider).to(AnthropicProvider).inSingletonScope();
  container.bind(TYPES.O3Provider).to(O3Provider).inSingletonScope();
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  try {
    // 設定の読み込みとマージ
    const envConfig = loadConfigFromEnv();
    const cmdConfig = parseCommandLine();
    const finalConfig = mergeConfigs(DEFAULT_CONFIG, envConfig, cmdConfig);

    // 設定の検証
    validateConfig(finalConfig);

    // DIコンテナの設定
    const container = new Container();
    await setupMCPContainer(container);

    // アプリケーション設定をコンテナに追加
    const appConfig: AppConfig = {
      server: {
        name: finalConfig.name,
        version: finalConfig.version,
        environment: process.env.NODE_ENV || 'production'
      },
      providers: {
        deepseek: {
          apiKey: process.env.DEEPSEEK_API_KEY || '',
          baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
        },
        o3: {
          apiKey: process.env.O3_API_KEY || '',
          baseURL: process.env.O3_BASE_URL || 'https://api.o3.com'
        }
      },
      cache: {
        provider: 'memory',
        maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100000000', 10), // 100MB
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600', 10) // 1 hour
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        enableConsole: process.env.LOG_CONSOLE !== 'false',
        enableFile: process.env.LOG_FILE === 'true',
        fileOptions: {
          filename: process.env.LOG_FILENAME || 'mcp-server.log',
          maxSize: parseInt(process.env.LOG_MAX_SIZE || '10485760', 10), // 10MB
          maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10)
        }
      }
    };

    container.bind<AppConfig>(TYPES.Config).toConstantValue(appConfig);
    container.bind<MCPServerConfig>('MCPServerConfig').toConstantValue(finalConfig);

    // ロガーの取得
    const logger = container.get<Logger>(TYPES.Logger);

    // MCPサーバーの作成と開始
    const server = container.get<MCPServer>(MCPServer);

    // シグナルハンドラーの設定
    setupSignalHandlers(server, logger);

    // サーバー開始
    logger.info('Starting Claude Code AI Collaboration MCP Server...', {
      config: {
        protocol: finalConfig.server?.protocol,
        port: finalConfig.server?.port,
        providers: finalConfig.providers?.enabled,
        features: finalConfig.features
      }
    });

    await server.start();

    // stdio プロトコルの場合は標準入出力を処理
    if (finalConfig.server?.protocol === 'stdio') {
      await handleStdioProtocol(server, logger);
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Stdio プロトコルの処理
 */
async function handleStdioProtocol(server: MCPServer, logger: Logger): Promise<void> {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  logger.debug('Stdio transport ready, waiting for JSON-RPC requests...');

  rl.on('line', async (line: string) => {
    try {
      const trimmed = line.trim();
      if (!trimmed) return;

      const request = JSON.parse(trimmed);
      const response = await server.handleRequest(request);
      
      console.log(JSON.stringify(response));
    } catch (error) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    logger.info('Stdio input closed, shutting down...');
    process.exit(0);
  });
}

// メイン関数の実行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// 後方互換性のためのエクスポート
export const version = DEFAULT_CONFIG.version;
export const name = DEFAULT_CONFIG.name;
export { main };
export default { main, version, name };