/**
 * DeepSeek Provider - DeepSeek AIプロバイダー実装
 * T007: 具体的なAIプロバイダーの実装
 */

import { injectable } from 'inversify';
import { BaseProvider } from './base-provider.js';
import { 
  AIRequest, 
  AIResponse, 
  ProviderCapabilities,
  AIProvider,
  BaseMetadata,
  Timestamp
} from '../types/index.js';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@injectable()
export class DeepSeekProvider extends BaseProvider {
  readonly name: AIProvider = 'deepseek';
  readonly capabilities: ProviderCapabilities = {
    models: [
      'deepseek-chat',
      'deepseek-coder',
      'deepseek-v2-chat',
      'deepseek-v2-coder'
    ],
    max_tokens: 32768,
    supports_streaming: true,
    supports_functions: false,
    supports_vision: false,
    supports_web_search: false,
    languages: ['en', 'ja', 'zh', 'es', 'fr', 'de', 'ko']
  };

  private baseUrl = 'https://api.deepseek.com/v1';

  protected async callProvider(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // リクエストの変換
    const deepSeekRequest: DeepSeekRequest = {
      model: request.model || this.capabilities.models[0],
      messages: [
        {
          role: 'user',
          content: request.prompt
        }
      ],
      stream: false
    };

    // オプショナルパラメータの設定
    if (request.temperature !== undefined) {
      deepSeekRequest.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      deepSeekRequest.max_tokens = request.max_tokens;
    }
    if (request.top_p !== undefined) {
      deepSeekRequest.top_p = request.top_p;
    }
    if (request.frequency_penalty !== undefined) {
      deepSeekRequest.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      deepSeekRequest.presence_penalty = request.presence_penalty;
    }
    if (request.stop !== undefined) {
      deepSeekRequest.stop = request.stop;
    }

    try {
      const response = await this.makeHttpRequest(deepSeekRequest);
      const latency = Date.now() - startTime;

      return this.mapResponse(request, response, latency);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`DeepSeek API error: ${errorMessage}`);
    }
  }

  private async makeHttpRequest(request: DeepSeekRequest): Promise<DeepSeekResponse> {
    const url = `${this.config.baseUrl || this.baseUrl}/chat/completions`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'User-Agent': 'claude-code-ai-collab-mcp/1.0.0'
    };

    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: this.createTimeoutSignal()
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const data = await fetchResponse.json() as DeepSeekResponse;
    return data;
  }

  private mapResponse(
    originalRequest: AIRequest, 
    deepSeekResponse: DeepSeekResponse, 
    latency: number
  ): AIResponse {
    const choice = deepSeekResponse.choices[0];
    
    if (!choice) {
      throw new Error('No response choices returned from DeepSeek API');
    }

    const metadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      model_version: deepSeekResponse.model,
      response_id: deepSeekResponse.id,
      created_at: new Date(deepSeekResponse.created * 1000).toISOString()
    };

    return {
      id: originalRequest.id,
      provider: this.name,
      model: deepSeekResponse.model,
      content: choice.message.content,
      usage: {
        prompt_tokens: deepSeekResponse.usage.prompt_tokens,
        completion_tokens: deepSeekResponse.usage.completion_tokens,
        total_tokens: deepSeekResponse.usage.total_tokens
      },
      latency,
      finish_reason: choice.finish_reason,
      metadata
    };
  }

  private createTimeoutSignal(): AbortSignal {
    const timeout = this.config.timeout || 30000;
    const controller = new AbortController();
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    // クリーンアップのため
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });

    return controller.signal;
  }

  protected override async performHealthCheck(): Promise<void> {
    // DeepSeek APIの簡易ヘルスチェック
    try {
      const testRequest: DeepSeekRequest = {
        model: this.capabilities.models[0],
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeHttpRequest(testRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`DeepSeek health check failed: ${errorMessage}`);
    }
  }

  protected override async initializeProvider(): Promise<void> {
    // DeepSeek固有の初期化処理
    if (!this.config.apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    // API接続テスト
    await this.performHealthCheck();
  }

  protected override async disposeProvider(): Promise<void> {
    // DeepSeek固有のクリーンアップ処理
    // 現在は特に必要な処理はなし
  }
}