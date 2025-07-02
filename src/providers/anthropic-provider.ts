/**
 * Anthropic Provider - Anthropic Claude APIプロバイダー実装
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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

@injectable()
export class AnthropicProvider extends BaseProvider {
  readonly name: AIProvider = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ],
    max_tokens: 200000, // Claude 3.5 Sonnet
    supports_streaming: true,
    supports_functions: false,
    supports_vision: true,
    supports_web_search: false,
    languages: ['en', 'ja', 'zh', 'es', 'fr', 'de', 'ko']
  };

  private baseUrl = 'https://api.anthropic.com/v1';
  private anthropicVersion = '2023-06-01';

  protected override async callProvider(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // リクエストの変換
    const anthropicRequest: AnthropicRequest = {
      model: request.model || this.capabilities.models[0],
      max_tokens: request.max_tokens || 4096,
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
      anthropicRequest.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      anthropicRequest.top_p = request.top_p;
    }
    if (request.stop !== undefined) {
      anthropicRequest.stop_sequences = request.stop;
    }

    try {
      const response = await this.makeHttpRequest(anthropicRequest);
      const latency = Date.now() - startTime;

      return this.mapResponse(request, response, latency);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic API error: ${errorMessage}`);
    }
  }

  private async makeHttpRequest(request: AnthropicRequest): Promise<AnthropicResponse> {
    const url = `${this.config.baseUrl || this.baseUrl}/messages`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'anthropic-version': this.anthropicVersion,
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
      
      // Anthropic特有のエラー処理
      if (fetchResponse.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorText}`);
      } else if (fetchResponse.status === 401) {
        throw new Error(`Authentication failed: ${errorText}`);
      } else if (fetchResponse.status === 400) {
        throw new Error(`Bad request: ${errorText}`);
      } else if (fetchResponse.status >= 500) {
        throw new Error(`Anthropic server error: ${errorText}`);
      }
      
      throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const data = await fetchResponse.json() as AnthropicResponse;
    return data;
  }

  private mapResponse(
    originalRequest: AIRequest, 
    anthropicResponse: AnthropicResponse, 
    latency: number
  ): AIResponse {
    const textContent = anthropicResponse.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');
    
    if (!textContent) {
      throw new Error('No text content returned from Anthropic API');
    }

    const metadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      model_version: anthropicResponse.model,
      response_id: anthropicResponse.id,
      stop_sequence: anthropicResponse.stop_sequence
    };

    return {
      id: originalRequest.id,
      provider: this.name,
      model: anthropicResponse.model,
      content: textContent,
      usage: {
        prompt_tokens: anthropicResponse.usage.input_tokens,
        completion_tokens: anthropicResponse.usage.output_tokens,
        total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
      },
      latency,
      finish_reason: anthropicResponse.stop_reason,
      metadata
    };
  }

  private createTimeoutSignal(): AbortSignal {
    const timeout = this.config.timeout || 60000; // Anthropicは長めのタイムアウト
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
    // Anthropic APIの簡易ヘルスチェック
    try {
      const testRequest: AnthropicRequest = {
        model: this.capabilities.models[this.capabilities.models.length - 1], // 最も軽いモデル使用
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      };

      await this.makeHttpRequest(testRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic health check failed: ${errorMessage}`);
    }
  }

  protected override async initializeProvider(): Promise<void> {
    // Anthropic固有の初期化処理
    if (!this.config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    // API接続テスト
    await this.performHealthCheck();
  }

  protected override async disposeProvider(): Promise<void> {
    // Anthropic固有のクリーンアップ処理
    // 現在は特に必要な処理はなし
  }

  // Anthropic特有のメソッド
  public async countTokens(text: string): Promise<number> {
    // Claude用の簡易的なトークン数推定
    // 1トークン ≈ 3.5文字（英語）、1トークン ≈ 2文字（日本語）の概算
    const englishChars = text.match(/[a-zA-Z0-9\s]/g)?.length || 0;
    const otherChars = text.length - englishChars;
    
    return Math.ceil(englishChars / 3.5 + otherChars / 2);
  }

  public getContextWindow(model: string): number {
    // モデル別のコンテキストウィンドウ
    const contextWindows: Record<string, number> = {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-haiku-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000
    };

    return contextWindows[model] || this.capabilities.max_tokens;
  }

  public supportsVision(model: string): boolean {
    // Claude 3シリーズはビジョンをサポート
    return model.startsWith('claude-3');
  }

  public getRecommendedMaxTokens(model: string): number {
    // モデル別の推奨最大トークン数
    const recommendations: Record<string, number> = {
      'claude-3-5-sonnet-20241022': 8192,
      'claude-3-5-haiku-20241022': 4096,
      'claude-3-opus-20240229': 8192,
      'claude-3-sonnet-20240229': 4096,
      'claude-3-haiku-20240307': 4096
    };

    return recommendations[model] || 4096;
  }
}