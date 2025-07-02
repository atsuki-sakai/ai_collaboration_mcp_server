/**
 * OpenAI Provider - OpenAI APIプロバイダー実装
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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  response_format?: {
    type: 'text' | 'json_object';
  };
}

interface OpenAIResponse {
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
  system_fingerprint?: string;
}

@injectable()
export class OpenAIProvider extends BaseProvider {
  readonly name: AIProvider = 'openai';
  readonly capabilities: ProviderCapabilities = {
    models: [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ],
    max_tokens: 128000, // GPT-4 Turbo
    supports_streaming: true,
    supports_functions: true,
    supports_vision: true,
    supports_web_search: false,
    languages: ['en', 'ja', 'zh', 'es', 'fr', 'de', 'ko']
  };

  private baseUrl = 'https://api.openai.com/v1';

  protected override async callProvider(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // リクエストの変換
    const openAIRequest: OpenAIRequest = {
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
      openAIRequest.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      openAIRequest.max_tokens = request.max_tokens;
    }
    if (request.top_p !== undefined) {
      openAIRequest.top_p = request.top_p;
    }
    if (request.frequency_penalty !== undefined) {
      openAIRequest.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      openAIRequest.presence_penalty = request.presence_penalty;
    }
    if (request.stop !== undefined) {
      openAIRequest.stop = request.stop;
    }

    try {
      const response = await this.makeHttpRequest(openAIRequest);
      const latency = Date.now() - startTime;

      return this.mapResponse(request, response, latency);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }
  }

  private async makeHttpRequest(request: OpenAIRequest): Promise<OpenAIResponse> {
    const url = `${this.config.baseUrl || this.baseUrl}/chat/completions`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'User-Agent': 'claude-code-ai-collab-mcp/1.0.0'
    };

    // OpenAI組織IDの設定（オプション）
    if (this.config.organizationId && typeof this.config.organizationId === 'string') {
      (headers as Record<string, string>)['OpenAI-Organization'] = this.config.organizationId;
    }

    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: this.createTimeoutSignal()
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      
      // OpenAI特有のエラー処理
      if (fetchResponse.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorText}`);
      } else if (fetchResponse.status === 401) {
        throw new Error(`Authentication failed: ${errorText}`);
      } else if (fetchResponse.status >= 500) {
        throw new Error(`OpenAI server error: ${errorText}`);
      }
      
      throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const data = await fetchResponse.json() as OpenAIResponse;
    return data;
  }

  private mapResponse(
    originalRequest: AIRequest, 
    openAIResponse: OpenAIResponse, 
    latency: number
  ): AIResponse {
    const choice = openAIResponse.choices[0];
    
    if (!choice) {
      throw new Error('No response choices returned from OpenAI API');
    }

    const metadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      model_version: openAIResponse.model,
      response_id: openAIResponse.id,
      created_at: new Date(openAIResponse.created * 1000).toISOString(),
      system_fingerprint: openAIResponse.system_fingerprint
    };

    return {
      id: originalRequest.id,
      provider: this.name,
      model: openAIResponse.model,
      content: choice.message.content,
      usage: {
        prompt_tokens: openAIResponse.usage.prompt_tokens,
        completion_tokens: openAIResponse.usage.completion_tokens,
        total_tokens: openAIResponse.usage.total_tokens
      },
      latency,
      finish_reason: choice.finish_reason,
      metadata
    };
  }

  private createTimeoutSignal(): AbortSignal {
    const timeout = this.config.timeout || 60000; // OpenAIは長めのタイムアウト
    const controller = new AbortController();
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });

    return controller.signal;
  }

  protected override async performHealthCheck(): Promise<void> {
    // OpenAI APIの簡易ヘルスチェック
    try {
      const testRequest: OpenAIRequest = {
        model: this.capabilities.models[this.capabilities.models.length - 1], // 最も軽いモデル使用
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeHttpRequest(testRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI health check failed: ${errorMessage}`);
    }
  }

  protected override async initializeProvider(): Promise<void> {
    // OpenAI固有の初期化処理
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // API接続テスト
    await this.performHealthCheck();
  }

  protected override async disposeProvider(): Promise<void> {
    // OpenAI固有のクリーンアップ処理
    // 現在は特に必要な処理はなし
  }

  // OpenAI特有のメソッド
  public async estimateTokens(text: string): Promise<number> {
    // 簡易的なトークン数推定（実際のTokenizerを使用することを推奨）
    // 1トークン ≈ 4文字（英語）、1トークン ≈ 1.5文字（日本語）の概算
    const englishChars = text.match(/[a-zA-Z0-9\s]/g)?.length || 0;
    const otherChars = text.length - englishChars;
    
    return Math.ceil(englishChars / 4 + otherChars / 1.5);
  }

  public async validateModel(model: string): Promise<boolean> {
    return this.capabilities.models.includes(model);
  }

  public getMaxTokensForModel(model: string): number {
    // モデル別の最大トークン数
    const modelLimits: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-4-turbo': 128000,
      'gpt-4-turbo-preview': 128000,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384
    };

    return modelLimits[model] || this.capabilities.max_tokens;
  }
}