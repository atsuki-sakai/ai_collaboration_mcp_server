/**
 * Parallel Strategy - 並列実行戦略
 * T008: 複数のAIプロバイダーを同時実行して結果を集約
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest, 
  AIResponse, 
  AIProvider,
  CollaborationResult,
  Timestamp,
  BaseMetadata
} from '../types/index.js';
import { IProviderManager } from '../core/provider-manager.js';
import { TYPES } from '../core/types.js';

export interface ParallelStrategyConfig {
  providers: AIProvider[];
  timeout?: number;
  failureThreshold?: number; // 何個まで失敗を許容するか (0-1の比率)
  aggregationMethod?: 'concatenate' | 'vote' | 'best' | 'all';
}

export interface ParallelExecutionResult {
  successful: Array<{
    provider: AIProvider;
    response: AIResponse;
    executionTime: number;
  }>;
  failed: Array<{
    provider: AIProvider;
    error: string;
    executionTime: number;
  }>;
  aggregatedResponse?: AIResponse;
  totalExecutionTime: number;
}

@injectable()
export class ParallelStrategy {
  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {}

  async execute(
    request: AIRequest,
    config: ParallelStrategyConfig
  ): Promise<CollaborationResult> {
    const startTime = Date.now();
    // const executionId = `parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 並列実行の準備
    const providers = this.validateProviders(config.providers);
    const timeout = config.timeout || 60000;
    
    try {
      const result = await this.executeProviders(request, providers, timeout);
      
      // 失敗閾値のチェック
      const failureRate = result.failed.length / providers.length;
      const maxFailureRate = config.failureThreshold || 0.5;
      
      if (failureRate > maxFailureRate) {
        throw new Error(`Too many providers failed: ${result.failed.length}/${providers.length}`);
      }

      // 結果の集約
      const aggregatedResponse = this.aggregateResponses(
        result.successful,
        config.aggregationMethod || 'best',
        request
      );

      const collaborationResult: CollaborationResult = {
        success: true,
        strategy: 'parallel',
        responses: result.successful.map(r => r.response),
        final_result: aggregatedResponse,
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          providers_used: providers,
          successful_providers: result.successful.map(r => r.provider),
          failed_providers: result.failed.map(r => r.provider),
          failure_rate: failureRate,
          aggregation_method: config.aggregationMethod || 'best'
        }
      };

      return collaborationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        strategy: 'parallel',
        responses: [],
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          providers_used: providers,
          error: errorMessage
        }
      };
    }
  }

  private validateProviders(providers: AIProvider[]): AIProvider[] {
    if (!providers || providers.length === 0) {
      throw new Error('At least one provider must be specified');
    }

    const availableProviders = this.providerManager.getAvailableProviders();
    const validProviders = providers.filter(provider => 
      availableProviders.includes(provider)
    );

    if (validProviders.length === 0) {
      throw new Error('No available providers found');
    }

    if (validProviders.length < providers.length) {
      console.warn(`Some providers are not available: ${
        providers.filter(p => !validProviders.includes(p)).join(', ')
      }`);
    }

    return validProviders;
  }

  private async executeProviders(
    request: AIRequest,
    providers: AIProvider[],
    timeout: number
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    
    // 各プロバイダーの実行Promiseを作成
    const executionPromises = providers.map(async (provider) => {
      const providerStartTime = Date.now();
      
      try {
        const response = await Promise.race([
          this.providerManager.executeRequest(provider, request),
          this.createTimeoutPromise(timeout)
        ]);
        
        return {
          success: true as const,
          provider,
          response,
          executionTime: Date.now() - providerStartTime
        };
      } catch (error) {
        return {
          success: false as const,
          provider,
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - providerStartTime
        };
      }
    });

    // 全ての実行を待機
    const results = await Promise.all(executionPromises);
    
    // 成功と失敗を分類
    const successful = results
      .filter((r): r is typeof r & { success: true } => r.success)
      .map(r => ({
        provider: r.provider,
        response: r.response,
        executionTime: r.executionTime
      }));

    const failed = results
      .filter((r): r is typeof r & { success: false } => !r.success)
      .map(r => ({
        provider: r.provider,
        error: r.error,
        executionTime: r.executionTime
      }));

    return {
      successful,
      failed,
      totalExecutionTime: Date.now() - startTime
    };
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Provider execution timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private aggregateResponses(
    successfulResults: Array<{
      provider: AIProvider;
      response: AIResponse;
      executionTime: number;
    }>,
    method: 'concatenate' | 'vote' | 'best' | 'all',
    originalRequest: AIRequest
  ): AIResponse {
    if (successfulResults.length === 0) {
      throw new Error('No successful responses to aggregate');
    }

    const aggregatedId = `aggregated-${Date.now()}`;
    const baseMetadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      aggregation_method: method,
      source_providers: successfulResults.map(r => r.provider)
    };

    switch (method) {
      case 'best':
        return this.selectBestResponse(successfulResults, aggregatedId, baseMetadata);
      
      case 'concatenate':
        return this.concatenateResponses(successfulResults, aggregatedId, baseMetadata);
      
      case 'vote':
        return this.voteForBestResponse(successfulResults, aggregatedId, baseMetadata);
      
      case 'all':
        return this.combineAllResponses(successfulResults, aggregatedId, baseMetadata);
      
      default:
        return this.selectBestResponse(successfulResults, aggregatedId, baseMetadata);
    }
  }

  private selectBestResponse(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>,
    aggregatedId: string,
    baseMetadata: BaseMetadata
  ): AIResponse {
    // 品質スコアに基づいて最良の応答を選択
    const scoredResults = results.map(result => ({
      ...result,
      score: this.calculateResponseQuality(result.response, result.executionTime)
    }));

    const bestResult = scoredResults.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return {
      ...bestResult.response,
      id: aggregatedId,
      metadata: {
        ...baseMetadata,
        selected_provider: bestResult.provider,
        quality_score: bestResult.score,
        all_scores: scoredResults.map(r => ({
          provider: r.provider,
          score: r.score
        }))
      }
    };
  }

  private concatenateResponses(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>,
    aggregatedId: string,
    baseMetadata: BaseMetadata
  ): AIResponse {
    const sortedResults = results.sort((a, b) => 
      this.calculateResponseQuality(b.response, b.executionTime) - 
      this.calculateResponseQuality(a.response, a.executionTime)
    );

    const combinedContent = sortedResults
      .map(result => `**${result.provider}:**\n${result.response.content}`)
      .join('\n\n---\n\n');

    const totalUsage = results.reduce(
      (acc, result) => ({
        prompt_tokens: acc.prompt_tokens + result.response.usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + result.response.usage.completion_tokens,
        total_tokens: acc.total_tokens + result.response.usage.total_tokens
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    return {
      id: aggregatedId,
      provider: 'parallel_aggregated' as AIProvider,
      model: 'parallel_aggregation',
      content: combinedContent,
      usage: totalUsage,
      latency: Math.max(...results.map(r => r.response.latency)),
      finish_reason: 'stop',
      metadata: {
        ...baseMetadata,
        provider_responses: results.map(r => ({
          provider: r.provider,
          model: r.response.model,
          tokens: r.response.usage.total_tokens
        }))
      }
    };
  }

  private voteForBestResponse(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>,
    aggregatedId: string,
    baseMetadata: BaseMetadata
  ): AIResponse {
    // 簡易的な投票システム：内容の類似性に基づく
    const scores = new Map<number, number>();
    
    results.forEach((result, index) => {
      scores.set(index, 0);
      
      // 他の応答との類似性をスコア化
      results.forEach((otherResult, otherIndex) => {
        if (index !== otherIndex) {
          const similarity = this.calculateSimilarity(
            result.response.content,
            otherResult.response.content
          );
          scores.set(index, (scores.get(index) || 0) + similarity);
        }
      });
    });

    // 最高スコアの応答を選択
    let bestIndex = 0;
    let bestScore = scores.get(0) || 0;
    
    scores.forEach((score, index) => {
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const winnerResult = results[bestIndex];
    
    return {
      ...winnerResult.response,
      id: aggregatedId,
      metadata: {
        ...baseMetadata,
        vote_winner: winnerResult.provider,
        vote_scores: Array.from(scores.entries()).map(([index, score]) => ({
          provider: results[index].provider,
          score
        }))
      }
    };
  }

  private combineAllResponses(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>,
    aggregatedId: string,
    baseMetadata: BaseMetadata
  ): AIResponse {
    // 全ての応答を構造化して組み合わせ
    const structuredContent = {
      summary: "Combined responses from multiple AI providers:",
      responses: results.map(result => ({
        provider: result.provider,
        model: result.response.model,
        content: result.response.content,
        executionTime: result.executionTime,
        usage: result.response.usage
      })),
      analysis: this.analyzeResponseVariations(results)
    };

    const totalUsage = results.reduce(
      (acc, result) => ({
        prompt_tokens: acc.prompt_tokens + result.response.usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + result.response.usage.completion_tokens,
        total_tokens: acc.total_tokens + result.response.usage.total_tokens
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    return {
      id: aggregatedId,
      provider: 'parallel_combined' as AIProvider,
      model: 'parallel_combination',
      content: JSON.stringify(structuredContent, null, 2),
      usage: totalUsage,
      latency: Math.max(...results.map(r => r.response.latency)),
      finish_reason: 'stop',
      metadata: {
        ...baseMetadata,
        response_count: results.length,
        providers_breakdown: results.map(r => ({
          provider: r.provider,
          latency: r.response.latency,
          tokens: r.response.usage.total_tokens
        }))
      }
    };
  }

  private calculateResponseQuality(response: AIResponse, executionTime: number): number {
    let score = 0;
    
    // コンテンツの長さ（適度な長さが良い）
    const contentLength = response.content.length;
    if (contentLength > 50 && contentLength < 5000) {
      score += 0.3;
    }
    
    // 実行時間（速いほど良い、但し極端に速すぎるのは怪しい）
    if (executionTime > 500 && executionTime < 30000) {
      score += 0.2;
    }
    
    // finish_reasonが'stop'なら完全な応答
    if (response.finish_reason === 'stop') {
      score += 0.3;
    }
    
    // トークン効率
    const efficiency = response.usage.completion_tokens / response.usage.prompt_tokens;
    if (efficiency > 0.1 && efficiency < 3) {
      score += 0.2;
    }
    
    return score;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // 簡易的なJaccard類似度
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private analyzeResponseVariations(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>
  ): Record<string, unknown> {
    const lengths = results.map(r => r.response.content.length);
    const executionTimes = results.map(r => r.executionTime);
    
    return {
      contentLengthStats: {
        min: Math.min(...lengths),
        max: Math.max(...lengths),
        avg: lengths.reduce((a, b) => a + b, 0) / lengths.length
      },
      executionTimeStats: {
        min: Math.min(...executionTimes),
        max: Math.max(...executionTimes),
        avg: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      },
      consistencyScore: this.calculateConsistencyScore(results)
    };
  }

  private calculateConsistencyScore(
    results: Array<{ provider: AIProvider; response: AIResponse; executionTime: number }>
  ): number {
    if (results.length < 2) return 1.0;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        totalSimilarity += this.calculateSimilarity(
          results[i].response.content,
          results[j].response.content
        );
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }
}