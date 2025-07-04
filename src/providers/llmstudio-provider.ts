/**
 * LLM Studio Provider - LLM Studio ローカルサーバープロバイダー実装
 * OpenAI互換APIを使用したローカルLLMサーバーとの連携
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

interface LLMStudioMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMStudioRequest {
  model: string;
  messages: LLMStudioMessage[];
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

interface LLMStudioResponse {
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

// 追加: モデル一覧取得時のレスポンス型
interface LLMStudioModelsListResponse {
  data?: Array<{
    id?: string;
    name?: string;
  }>;
}

@injectable()
export class LLMStudioProvider extends BaseProvider {
  readonly name: AIProvider = 'llmstudio';
  readonly capabilities: ProviderCapabilities = {
    models: [
      'qwen/qwen2.5-coder-32b',  // サンプルで使用されていたモデル
      'llama3.2-3b',            // よく使用されるモデル例
      'phi-3.5',                // よく使用されるモデル例
      'codellama',               // コード生成用モデル例
      'mistral-7b',              // 一般的なモデル例
    ],
    max_tokens: 32768,  // Qwen2.5-coder-32Bの一般的な制限
    supports_streaming: true,
    supports_functions: false,  // LLM Studioの標準設定では一般的にfalse
    supports_vision: false,     // ローカルLLMでは一般的にfalse
    supports_web_search: false,
    languages: ['ja', 'en', 'zh', 'ko', 'es', 'fr', 'de']  // 多言語対応
  };

  // デフォルトのローカルサーバーURL
  private defaultBaseUrl = 'http://localhost:1234/v1';

  protected override async callProvider(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // リクエストの変換
    const llmStudioRequest: LLMStudioRequest = {
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
      llmStudioRequest.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      // -1の場合は最大値を設定
      llmStudioRequest.max_tokens = request.max_tokens === -1 ? 
        this.capabilities.max_tokens : 
        Math.min(request.max_tokens, this.capabilities.max_tokens);
    }
    if (request.top_p !== undefined) {
      llmStudioRequest.top_p = request.top_p;
    }
    if (request.frequency_penalty !== undefined) {
      llmStudioRequest.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      llmStudioRequest.presence_penalty = request.presence_penalty;
    }
    if (request.stop !== undefined) {
      llmStudioRequest.stop = request.stop;
    }

    try {
      const response = await this.makeHttpRequest(llmStudioRequest);
      const latency = Date.now() - startTime;

      return this.mapResponse(request, response, latency);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // ローカルサーバー特有のエラーメッセージを処理
      if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error('LLM Studio server is not running on localhost:1234. Please start the server first.');
      } else if (errorMessage.includes('404')) {
        throw new Error('LLM Studio API endpoint not found. Check if the server is running properly.');
      }
      
      throw new Error(`LLM Studio API error: ${errorMessage}`);
    }
  }

  private async makeHttpRequest(request: LLMStudioRequest): Promise<LLMStudioResponse> {
    // 設定されたbaseUrlまたはデフォルトを使用
    const baseUrl = this.config.baseUrl || this.defaultBaseUrl;
    const url = `${baseUrl}/chat/completions`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code-ai-collab-mcp/1.0.0'
    };

    // API keyが設定されている場合は追加（一部のローカルサーバーで必要な場合がある）
    if (this.config.apiKey && this.config.apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: this.createTimeoutSignal()
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      
      // ローカルサーバー特有のエラー処理
      if (fetchResponse.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorText}`);
      } else if (fetchResponse.status === 404) {
        throw new Error(`Endpoint not found: Check if LLM Studio is running on ${baseUrl}`);
      } else if (fetchResponse.status >= 500) {
        throw new Error(`LLM Studio server error (${fetchResponse.status}): ${errorText}`);
      } else if (fetchResponse.status === 422) {
        throw new Error(`Invalid request parameters: ${errorText}`);
      }
      
      throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const data = await fetchResponse.json() as LLMStudioResponse;
    return data;
  }

  private mapResponse(
    originalRequest: AIRequest, 
    llmStudioResponse: LLMStudioResponse, 
    latency: number
  ): AIResponse {
    const choice = llmStudioResponse.choices[0];
    
    if (!choice) {
      throw new Error('No response choices returned from LLM Studio API');
    }

    const metadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      model_version: llmStudioResponse.model,
      response_id: llmStudioResponse.id,
      created_at: new Date(llmStudioResponse.created * 1000).toISOString(),
      system_fingerprint: llmStudioResponse.system_fingerprint,
      server_url: this.config.baseUrl || this.defaultBaseUrl
    };

    return {
      id: originalRequest.id,
      provider: this.name,
      model: llmStudioResponse.model,
      content: choice.message.content,
      usage: {
        prompt_tokens: llmStudioResponse.usage.prompt_tokens,
        completion_tokens: llmStudioResponse.usage.completion_tokens,
        total_tokens: llmStudioResponse.usage.total_tokens
      },
      latency,
      finish_reason: choice.finish_reason,
      metadata
    };
  }

  private createTimeoutSignal(): AbortSignal {
    // ローカルサーバーは通常高速なので短めのタイムアウト
    const timeout = this.config.timeout || 30000; // 30秒
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
    // ローカルサーバーの簡易ヘルスチェック
    try {
      const testRequest: LLMStudioRequest = {
        model: this.capabilities.models[0],
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0
      };

      await this.makeHttpRequest(testRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('ECONNREFUSED')) {
        throw new Error('LLM Studio server is not running. Please start the server at localhost:1234');
      }
      
      throw new Error(`LLM Studio health check failed: ${errorMessage}`);
    }
  }

  protected override async initializeProvider(): Promise<void> {
    // LLM Studio固有の初期化処理
    // APIキーは必須ではない（ローカルサーバーのため）
    
    // サーバー接続テスト
    try {
      await this.performHealthCheck();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 警告として記録するが、初期化は続行（サーバーが後で起動する可能性がある）
      console.warn(`LLM Studio initialization warning: ${errorMessage}`);
    }
  }

  protected override async disposeProvider(): Promise<void> {
    // LLM Studio固有のクリーンアップ処理
    // 現在は特に必要な処理はなし
  }

  // LLM Studio特有のメソッド
  public async estimateTokens(text: string): Promise<number> {
    // 簡易的なトークン数推定
    // 各言語に応じた推定（文字数ベース）
    const japaneseChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)?.length || 0;
    const englishChars = text.match(/[a-zA-Z0-9\s]/g)?.length || 0;
    const otherChars = text.length - japaneseChars - englishChars;
    
    // 日本語: 1文字≈1トークン、英語: 4文字≈1トークン
    return Math.ceil(japaneseChars + englishChars / 4 + otherChars / 2);
  }

  public async validateModel(model: string): Promise<boolean> {
    return this.capabilities.models.includes(model);
  }

  public getMaxTokensForModel(model: string): number {
    // ほとんどのローカルモデルで共通の制限を使用
    const modelLimits: Record<string, number> = {
      'qwen/qwen2.5-coder-32b': 32768,
      'llama3.2-3b': 8192,
      'phi-3.5': 4096,
      'codellama': 16384,
      'mistral-7b': 8192
    };

    return modelLimits[model] || this.capabilities.max_tokens;
  }

  // ローカルサーバー固有のユーティリティメソッド
  public async checkServerAvailability(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl || this.defaultBaseUrl;
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        signal: this.createTimeoutSignal()
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async getAvailableModels(): Promise<string[]> {
    try {
      const baseUrl = this.config.baseUrl || this.defaultBaseUrl;
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        signal: this.createTimeoutSignal()
      });
      
      if (response.ok) {
        // レスポンスがunknownと推定されるため明示的に型アサーションを行う
        const data = await response.json() as LLMStudioModelsListResponse;

        // 型安全に配列か確認
        if (Array.isArray(data?.data)) {
          // 各モデルのidまたはnameを抽出し、undefinedを除外
          return data.data
            .map(model => model?.id ?? model?.name)
            .filter((v): v is string => Boolean(v));
        }
      }
    } catch {
      // エラーの場合はデフォルトモデル一覧を返す
    }
    
    return this.capabilities.models;
  }
}