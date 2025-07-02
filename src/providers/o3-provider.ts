/**
 * O3 Provider - OpenAI O3 モデルプロバイダー実装
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

interface O3Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface O3Request {
  model: string;
  messages: O3Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high';
}

interface O3Response {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens?: number;
    total_tokens: number;
  };
}

@injectable()
export class O3Provider extends BaseProvider {
  readonly name: AIProvider = 'o3';
  readonly capabilities: ProviderCapabilities = {
    models: [
      'o3-mini',
      'o3'
    ],
    max_tokens: 128000,
    supports_streaming: true,
    supports_functions: false,
    supports_vision: false,
    supports_web_search: false,
    languages: ['en', 'ja', 'zh', 'es', 'fr', 'de', 'ko']
  };

  private baseUrl = 'https://api.openai.com/v1';

  protected override async callProvider(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // リクエストの変換
    const o3Request: O3Request = {
      model: request.model || this.capabilities.models[0],
      messages: [
        {
          role: 'user',
          content: request.prompt
        }
      ],
      stream: false,
      reasoning_effort: 'medium' // デフォルトの推論レベル
    };

    // オプショナルパラメータの設定
    if (request.temperature !== undefined) {
      o3Request.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      o3Request.max_tokens = request.max_tokens;
    }
    if (request.top_p !== undefined) {
      o3Request.top_p = request.top_p;
    }
    if (request.frequency_penalty !== undefined) {
      o3Request.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      o3Request.presence_penalty = request.presence_penalty;
    }
    if (request.stop !== undefined) {
      o3Request.stop = request.stop;
    }

    try {
      const response = await this.makeHttpRequest(o3Request);
      const latency = Date.now() - startTime;

      return this.mapResponse(request, response, latency);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`O3 API error: ${errorMessage}`);
    }
  }

  private async makeHttpRequest(request: O3Request): Promise<O3Response> {
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
      
      // O3特有のエラー処理
      if (fetchResponse.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorText}`);
      } else if (fetchResponse.status === 401) {
        throw new Error(`Authentication failed: ${errorText}`);
      } else if (fetchResponse.status === 400) {
        throw new Error(`Bad request (model may not be available): ${errorText}`);
      } else if (fetchResponse.status >= 500) {
        throw new Error(`O3 server error: ${errorText}`);
      }
      
      throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
    }

    const data = await fetchResponse.json() as O3Response;
    return data;
  }

  private mapResponse(
    originalRequest: AIRequest, 
    o3Response: O3Response, 
    latency: number
  ): AIResponse {
    const choice = o3Response.choices[0];
    
    if (!choice) {
      throw new Error('No response choices returned from O3 API');
    }

    const metadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      model_version: o3Response.model,
      response_id: o3Response.id,
      created_at: new Date(o3Response.created * 1000).toISOString(),
      reasoning: choice.message.reasoning,
      reasoning_tokens: o3Response.usage.reasoning_tokens
    };

    return {
      id: originalRequest.id,
      provider: this.name,
      model: o3Response.model,
      content: choice.message.content,
      usage: {
        prompt_tokens: o3Response.usage.prompt_tokens,
        completion_tokens: o3Response.usage.completion_tokens,
        total_tokens: o3Response.usage.total_tokens
      },
      latency,
      finish_reason: choice.finish_reason,
      metadata
    };
  }

  private createTimeoutSignal(): AbortSignal {
    const timeout = this.config.timeout || 120000; // O3は推論時間が長いため2分
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
    // O3 APIの簡易ヘルスチェック
    try {
      const testRequest: O3Request = {
        model: this.capabilities.models[0], // o3-miniを使用
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        reasoning_effort: 'low' // ヘルスチェックでは軽い推論レベル
      };

      await this.makeHttpRequest(testRequest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`O3 health check failed: ${errorMessage}`);
    }
  }

  protected override async initializeProvider(): Promise<void> {
    // O3固有の初期化処理
    if (!this.config.apiKey) {
      throw new Error('O3 API key is required');
    }

    // API接続テスト
    await this.performHealthCheck();
  }

  protected override async disposeProvider(): Promise<void> {
    // O3固有のクリーンアップ処理
    // 現在は特に必要な処理はなし
  }

  // O3特有のメソッド
  public async estimateReasoningComplexity(prompt: string): Promise<'low' | 'medium' | 'high'> {
    // プロンプトの複雑さに基づいて推論レベルを推定
    const complexity = this.analyzePromptComplexity(prompt);
    
    if (complexity > 0.7) {
      return 'high';
    } else if (complexity > 0.4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private analyzePromptComplexity(prompt: string): number {
    // 簡易的な複雑さ分析
    let complexity = 0;
    
    // 文字数による重み
    complexity += Math.min(prompt.length / 1000, 0.3);
    
    // 数学的表現の検出
    if (/[∑∫∂∇∞∀∃∈∉⊂⊃∪∩]/g.test(prompt) || /\b(solve|proof|theorem|equation)\b/i.test(prompt)) {
      complexity += 0.3;
    }
    
    // コード関連の検出
    if (/```|\bfunction\b|\bclass\b|\bimport\b|\breturn\b/g.test(prompt)) {
      complexity += 0.2;
    }
    
    // 推論を要求するキーワード
    if (/\b(analyze|explain|reason|logic|because|therefore|thus|hence)\b/i.test(prompt)) {
      complexity += 0.2;
    }
    
    return Math.min(complexity, 1);
  }

  public isModelAvailable(model: string): boolean {
    // O3モデルの利用可能性チェック
    return this.capabilities.models.includes(model);
  }

  public getEstimatedCost(model: string, tokens: number): number {
    // O3モデルの概算コスト（推論トークンを考慮）
    const baseCosts: Record<string, number> = {
      'o3-mini': 0.002, // 1Kトークンあたり
      'o3': 0.02        // 1Kトークンあたり
    };
    
    const baseCost = baseCosts[model] || baseCosts['o3-mini'];
    
    // 推論コストは通常の2-5倍と想定
    const reasoningMultiplier = model === 'o3' ? 4 : 2;
    
    return (tokens / 1000) * baseCost * reasoningMultiplier;
  }

  public getRecommendedReasoningEffort(taskType: string): 'low' | 'medium' | 'high' {
    // タスクタイプに基づく推奨推論レベル
    const taskTypes: Record<string, 'low' | 'medium' | 'high'> = {
      'math': 'high',
      'coding': 'medium',
      'analysis': 'high',
      'creative': 'low',
      'chat': 'low',
      'translation': 'low',
      'reasoning': 'high',
      'problem-solving': 'high'
    };
    
    return taskTypes[taskType.toLowerCase()] || 'medium';
  }
}