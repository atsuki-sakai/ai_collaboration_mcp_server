/**
 * MCP Server - メインサーバークラス
 * T011: Model Context Protocol サーバーの実装
 */

import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { IProviderManager } from '../core/provider-manager.js';
import { IToolManager } from '../core/tool-manager.js';
// Cache service interface available if needed
// import { ICacheService } from '../services/cache-service.js';
import { IMetricsCollector } from '../types/interfaces.js';
import { ISynthesisService } from '../services/synthesis-service.js';
import { ISearchService } from '../services/search-service.js';
import { AIProvider } from '../types/common.js';
import { TYPES } from '../core/types.js';

export interface MCPServerConfig {
  name: string;
  version: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  server?: {
    host?: string;
    port?: number;
    protocol?: 'stdio' | 'sse' | 'websocket';
  };
  providers?: {
    enabled: AIProvider[];
    default?: AIProvider;
  };
  features?: {
    collaboration?: boolean;
    caching?: boolean;
    metrics?: boolean;
    search?: boolean;
    synthesis?: boolean;
  };
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
  };
}

export interface ServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPCapabilities;
}

@injectable()
export class MCPServer {
  private isRunning = false;
  private clients = new Map<string, any>();
  private requestHandlers = new Map<string, (params: any) => Promise<any>>();
  private protocolVersion = '2024-11-05';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager,
    @inject(TYPES.ToolManager) private toolManager: IToolManager,
    // Cache service available if needed
    // @inject(TYPES.CacheManager) private _cacheService: ICacheService,
    @inject(TYPES.MetricsCollector) private metricsCollector: IMetricsCollector,
    @inject(TYPES.SynthesisService) private synthesisService: ISynthesisService,
    @inject(TYPES.SearchService) private searchService: ISearchService,
    private config: MCPServerConfig
  ) {
    this.initializeHandlers();
    this.logger.info('MCPServer initialized', { name: config.name, version: config.version });
  }

  /**
   * サーバーを開始
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        throw new Error('Server is already running');
      }

      // メトリクス記録開始
      this.metricsCollector.increment('server_starts_total');
      const startTime = Date.now();

      // プロバイダーの初期化
      await this.initializeProviders();

      // ツールの初期化
      await this.initializeTools();

      // サーバー固有の初期化
      await this.initializeServer();

      this.isRunning = true;
      const initTime = Date.now() - startTime;
      
      this.metricsCollector.timing('server_init_duration_ms', initTime);
      this.logger.info('MCP Server started successfully', {
        protocol: this.config.server?.protocol || 'stdio',
        initTime
      });

    } catch (error) {
      this.metricsCollector.increment('server_start_errors_total');
      this.logger.error('Failed to start MCP Server', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * サーバーを停止
   */
  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Server is not running');
        return;
      }

      this.metricsCollector.increment('server_stops_total');

      // 全クライアントに停止通知
      for (const [clientId, _client] of this.clients.entries()) {
        try {
          await this.disconnectClient(clientId);
        } catch (error) {
          this.logger.warn('Error disconnecting client', { clientId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      // リソースのクリーンアップ
      await this.cleanup();

      this.isRunning = false;
      this.logger.info('MCP Server stopped successfully');

    } catch (error) {
      this.metricsCollector.increment('server_stop_errors_total');
      this.logger.error('Error stopping MCP Server', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * MCPリクエストを処理
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const startTime = Date.now();
    this.metricsCollector.increment('requests_total', { method: request.method });

    try {
      this.logger.debug('Handling MCP request', { method: request.method, id: request.id });

      // リクエストの検証
      this.validateRequest(request);

      // ハンドラーの実行
      const handler = this.requestHandlers.get(request.method);
      if (!handler) {
        throw new Error(`Unknown method: ${request.method}`);
      }

      const result = await handler(request.params || {});
      const duration = Date.now() - startTime;

      this.metricsCollector.timing('request_duration_ms', duration, { method: request.method });
      this.metricsCollector.increment('requests_success_total', { method: request.method });

      return {
        jsonrpc: '2.0',
        ...(request.id !== undefined ? { id: request.id } : {}),
        result
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.metricsCollector.timing('request_duration_ms', duration, { method: request.method, status: 'error' });
      this.metricsCollector.increment('requests_error_total', { method: request.method });

      this.logger.error('Request handling failed', error instanceof Error ? error : new Error(String(error)), {
        method: request.method,
        id: request.id
      });

      return {
        jsonrpc: '2.0',
        ...(request.id !== undefined ? { id: request.id } : {}),
        error: {
          code: -32603,
          message: errorMessage
        }
      };
    }
  }

  /**
   * 通知を送信
   */
  async sendNotification(notification: MCPNotification): Promise<void> {
    try {
      this.logger.debug('Sending notification', { method: notification.method });
      
      // 実際の実装では、適切なトランスポート層に送信
      // stdio, SSE, WebSocket など
      
      this.metricsCollector.increment('notifications_sent_total', { method: notification.method });
      
    } catch (error) {
      this.metricsCollector.increment('notifications_error_total', { method: notification.method });
      this.logger.error('Failed to send notification', error instanceof Error ? error : new Error(String(error)), {
        method: notification.method
      });
    }
  }

  /**
   * サーバー情報を取得
   */
  getServerInfo(): ServerInfo {
    return {
      name: this.config.name,
      version: this.config.version,
      protocolVersion: this.protocolVersion,
      capabilities: this.buildCapabilities()
    };
  }

  /**
   * 利用可能なツールのリストを取得
   */
  async getTools(): Promise<MCPToolDefinition[]> {
    try {
      const tools = this.toolManager.getAvailableTools();
      const toolsInfo = this.toolManager.getAllToolsInfo();
      return tools.map(toolName => ({
        name: toolName,
        description: toolsInfo[toolName]?.description || `${toolName} tool`,
        inputSchema: {
          type: 'object' as const,
          properties: toolsInfo[toolName]?.parameters || {},
          required: []
        }
      }));
    } catch (error) {
      this.logger.error('Failed to get tools', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * 利用可能なリソースのリストを取得
   */
  async getResources(): Promise<MCPResourceDefinition[]> {
    return [
      {
        uri: 'collaboration://history',
        name: 'Collaboration History',
        description: 'Access to collaboration session history',
        mimeType: 'application/json'
      },
      {
        uri: 'metrics://performance',
        name: 'Performance Metrics',
        description: 'Server performance and usage metrics',
        mimeType: 'application/json'
      },
      {
        uri: 'search://index',
        name: 'Search Index',
        description: 'Full-text search capabilities',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * ツールを実行
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      this.metricsCollector.increment('tool_executions_total', { tool: name });
      const startTime = Date.now();

      if (!['collaborate', 'review', 'compare', 'refine'].includes(name)) {
        throw new Error(`Unknown tool: ${name}`);
      }
      const result = await this.toolManager.executeTool(name as any, params as any);
      
      const duration = Date.now() - startTime;
      this.metricsCollector.timing('tool_execution_duration_ms', duration, { tool: name });
      this.metricsCollector.increment('tool_executions_success_total', { tool: name });

      return result;

    } catch (error) {
      this.metricsCollector.increment('tool_executions_error_total', { tool: name });
      this.logger.error('Tool execution failed', error instanceof Error ? error : new Error(String(error)), { tool: name });
      throw error;
    }
  }

  /**
   * リソースを読み取り
   */
  async readResource(uri: string): Promise<unknown> {
    try {
      this.metricsCollector.increment('resource_reads_total', { uri });

      if (uri.startsWith('collaboration://')) {
        return await this.handleCollaborationResource(uri);
      } else if (uri.startsWith('metrics://')) {
        return await this.handleMetricsResource(uri);
      } else if (uri.startsWith('search://')) {
        return await this.handleSearchResource(uri);
      } else {
        throw new Error(`Unsupported resource URI: ${uri}`);
      }

    } catch (error) {
      this.metricsCollector.increment('resource_read_errors_total', { uri });
      this.logger.error('Resource read failed', error instanceof Error ? error : new Error(String(error)), { uri });
      throw error;
    }
  }

  // プライベートメソッド

  private initializeHandlers(): void {
    // 標準MCPハンドラー
    this.requestHandlers.set('initialize', this.handleInitialize.bind(this));
    this.requestHandlers.set('ping', this.handlePing.bind(this));
    this.requestHandlers.set('tools/list', this.handleToolsList.bind(this));
    this.requestHandlers.set('tools/call', this.handleToolsCall.bind(this));
    this.requestHandlers.set('resources/list', this.handleResourcesList.bind(this));
    this.requestHandlers.set('resources/read', this.handleResourcesRead.bind(this));
    this.requestHandlers.set('prompts/list', this.handlePromptsList.bind(this));
    this.requestHandlers.set('prompts/get', this.handlePromptsGet.bind(this));
    this.requestHandlers.set('logging/setLevel', this.handleLoggingSetLevel.bind(this));

    // カスタムハンドラー
    this.requestHandlers.set('collaboration/execute', this.handleCollaborationExecute.bind(this));
    this.requestHandlers.set('synthesis/create', this.handleSynthesisCreate.bind(this));
    this.requestHandlers.set('search/query', this.handleSearchQuery.bind(this));
    this.requestHandlers.set('metrics/get', this.handleMetricsGet.bind(this));
  }

  private async initializeProviders(): Promise<void> {
    const enabledProviders = this.config.providers?.enabled || [];
    for (const provider of enabledProviders) {
      try {
        // Initialize provider with basic config
        await this.providerManager.initializeProvider(provider, {
          apiKey: process.env[`${provider.toUpperCase()}_API_KEY`] || '',
          baseURL: process.env[`${provider.toUpperCase()}_BASE_URL`] || ''
        });
        this.logger.debug('Provider initialized', { provider });
      } catch (error) {
        this.logger.warn('Failed to initialize provider', { provider, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async initializeTools(): Promise<void> {
    if (this.config.capabilities.tools) {
      // Tools are initialized automatically in constructor
      this.logger.debug('Tools initialized');
    }
  }

  private async initializeServer(): Promise<void> {
    const protocol = this.config.server?.protocol || 'stdio';
    
    switch (protocol) {
      case 'stdio':
        await this.initializeStdioServer();
        break;
      case 'sse':
        await this.initializeSSEServer();
        break;
      case 'websocket':
        await this.initializeWebSocketServer();
        break;
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  private async initializeStdioServer(): Promise<void> {
    // stdio トランスポートの実装
    this.logger.debug('Initialized stdio transport');
  }

  private async initializeSSEServer(): Promise<void> {
    // SSE トランスポートの実装
    const port = this.config.server?.port || 3000;
    this.logger.debug('Initialized SSE transport', { port });
  }

  private async initializeWebSocketServer(): Promise<void> {
    // WebSocket トランスポートの実装
    const port = this.config.server?.port || 8080;
    this.logger.debug('Initialized WebSocket transport', { port });
  }

  private buildCapabilities(): MCPCapabilities {
    const capabilities: MCPCapabilities = {};

    if (this.config.capabilities.tools) {
      capabilities.tools = { listChanged: true };
    }

    if (this.config.capabilities.resources) {
      capabilities.resources = { 
        subscribe: true,
        listChanged: true 
      };
    }

    if (this.config.capabilities.prompts) {
      capabilities.prompts = { listChanged: true };
    }

    if (this.config.capabilities.logging) {
      capabilities.logging = { level: 'info' };
    }

    return capabilities;
  }

  private validateRequest(request: MCPRequest): void {
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC version');
    }

    if (!request.method) {
      throw new Error('Missing method');
    }

    if (typeof request.method !== 'string') {
      throw new Error('Method must be a string');
    }
  }

  private async disconnectClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.logger.debug('Client disconnected', { clientId });
    }
  }

  private async cleanup(): Promise<void> {
    // リソースのクリーンアップ
    this.clients.clear();
    this.requestHandlers.clear();
  }

  // MCPハンドラーメソッド

  private async handleInitialize(params: any): Promise<any> {
    this.logger.debug('Handling initialize request', { params });
    return {
      protocolVersion: this.protocolVersion,
      capabilities: this.buildCapabilities(),
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };
  }

  private async handlePing(_params: any): Promise<any> {
    return { status: 'ok', timestamp: Date.now() };
  }

  private async handleToolsList(_params: any): Promise<any> {
    const tools = await this.getTools();
    return { tools };
  }

  private async handleToolsCall(params: any): Promise<any> {
    const { name, arguments: args } = params;
    const result = await this.executeTool(name, args || {});
    return { result };
  }

  private async handleResourcesList(_params: any): Promise<any> {
    const resources = await this.getResources();
    return { resources };
  }

  private async handleResourcesRead(params: any): Promise<any> {
    const { uri } = params;
    const content = await this.readResource(uri);
    return { content };
  }

  private async handlePromptsList(_params: any): Promise<any> {
    return { prompts: [] }; // プロンプト機能は将来実装
  }

  private async handlePromptsGet(_params: any): Promise<any> {
    throw new Error('Prompts not implemented yet');
  }

  private async handleLoggingSetLevel(params: any): Promise<any> {
    const { level } = params;
    this.logger.info('Log level changed', { level });
    return { success: true };
  }

  // カスタムハンドラーメソッド

  private async handleCollaborationExecute(params: any): Promise<any> {
    const { strategy, providers, request } = params;
    
    // プロバイダーマネージャーを使用してコラボレーションを実行
    const result = await this.providerManager.executeCollaboration({
      strategy: strategy || 'parallel',
      providers: providers || this.config.providers?.enabled || [],
      request
    });

    return result;
  }

  private async handleSynthesisCreate(params: any): Promise<any> {
    const result = await this.synthesisService.synthesize(params);
    return result;
  }

  private async handleSearchQuery(params: any): Promise<any> {
    const result = await this.searchService.search(params);
    return result;
  }

  private async handleMetricsGet(_params: any): Promise<any> {
    // メトリクスサービスから統計を取得
    if ('generateReport' in this.metricsCollector && typeof this.metricsCollector.generateReport === 'function') {
      return await (this.metricsCollector as any).generateReport();
    } else {
      return { message: 'Metrics not available' };
    }
  }

  // リソースハンドラーメソッド

  private async handleCollaborationResource(uri: string): Promise<unknown> {
    // collaboration:// リソースの処理
    if (uri === 'collaboration://history') {
      // 検索サービスから履歴を取得
      return await this.searchService.search({ pageSize: 100 });
    }
    throw new Error(`Unknown collaboration resource: ${uri}`);
  }

  private async handleMetricsResource(uri: string): Promise<unknown> {
    // metrics:// リソースの処理
    if (uri === 'metrics://performance') {
      return await this.handleMetricsGet({});
    }
    throw new Error(`Unknown metrics resource: ${uri}`);
  }

  private async handleSearchResource(uri: string): Promise<unknown> {
    // search:// リソースの処理
    if (uri === 'search://index') {
      return await this.searchService.getSearchStats();
    }
    throw new Error(`Unknown search resource: ${uri}`);
  }
}