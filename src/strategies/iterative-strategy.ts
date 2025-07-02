/**
 * Iterative Strategy - 反復改善戦略
 * T008: AIプロバイダーを使って反復的に結果を改善
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

export interface IterativeStrategyConfig {
  primaryProvider: AIProvider;
  reviewProviders: AIProvider[];
  maxIterations?: number;
  improvementThreshold?: number; // 改善の最小閾値
  convergenceCriteria?: {
    qualityScore?: number;
    stabilityRounds?: number; // 安定と判断するラウンド数
    maxTokens?: number;
  };
  feedbackPrompts?: {
    review?: string;
    improve?: string;
    finalize?: string;
  };
}

export interface IterationCycle {
  iteration: number;
  primaryResponse: AIResponse;
  reviews: Array<{
    provider: AIProvider;
    response: AIResponse;
    feedback: string;
    suggestions: string[];
  }>;
  improvedResponse?: AIResponse;
  qualityScore: number;
  improvements: string[];
  convergenceMetrics: {
    stability: number;
    improvement: number;
    totalTokens: number;
  };
}

@injectable()
export class IterativeStrategy {
  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {}

  async execute(
    request: AIRequest,
    config: IterativeStrategyConfig
  ): Promise<CollaborationResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config);
      
      const cycles = await this.executeIterativeCycles(request, config);
      const finalResult = this.buildFinalResult(cycles, request);

      const collaborationResult: CollaborationResult = {
        success: true,
        strategy: 'iterative',
        responses: this.extractAllResponses(cycles),
        final_result: finalResult,
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          providers_used: [config.primaryProvider, ...config.reviewProviders],
          iterations_completed: cycles.length,
          final_quality_score: cycles[cycles.length - 1]?.qualityScore || 0,
          convergence_achieved: this.hasConverged(cycles, config),
          improvement_trajectory: cycles.map(c => c.qualityScore)
        }
      };

      return collaborationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        strategy: 'iterative',
        responses: [],
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          error: errorMessage
        }
      };
    }
  }

  private validateConfig(config: IterativeStrategyConfig): void {
    if (!config.primaryProvider) {
      throw new Error('Primary provider must be specified');
    }

    if (!config.reviewProviders || config.reviewProviders.length === 0) {
      throw new Error('At least one review provider must be specified');
    }

    const availableProviders = this.providerManager.getAvailableProviders();
    
    if (!availableProviders.includes(config.primaryProvider)) {
      throw new Error(`Primary provider ${config.primaryProvider} is not available`);
    }

    const availableReviewers = config.reviewProviders.filter(provider => 
      availableProviders.includes(provider)
    );

    if (availableReviewers.length === 0) {
      throw new Error('No review providers are available');
    }
  }

  private async executeIterativeCycles(
    request: AIRequest,
    config: IterativeStrategyConfig
  ): Promise<IterationCycle[]> {
    const cycles: IterationCycle[] = [];
    const maxIterations = config.maxIterations || 5;
    let currentRequest = request;
    let previousQualityScore = 0;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const cycle = await this.executeSingleCycle(
        currentRequest,
        config,
        iteration,
        cycles
      );

      cycles.push(cycle);

      // 収束チェック
      if (this.shouldStopIterating(cycle, cycles, config, previousQualityScore)) {
        break;
      }

      // 次のイテレーション用のリクエスト準備
      if (cycle.improvedResponse) {
        currentRequest = this.prepareNextIterationRequest(
          request,
          cycle,
          iteration + 1
        );
      }

      previousQualityScore = cycle.qualityScore;
    }

    return cycles;
  }

  private async executeSingleCycle(
    request: AIRequest,
    config: IterativeStrategyConfig,
    iteration: number,
    previousCycles: IterationCycle[]
  ): Promise<IterationCycle> {
    // 1. プライマリプロバイダーからの初期応答
    const primaryResponse = await this.providerManager.executeRequest(
      config.primaryProvider,
      {
        ...request,
        id: `${request.id}-iter-${iteration}-primary`
      }
    );

    // 2. レビューアーからのフィードバック収集
    const reviews = await this.collectReviews(
      primaryResponse,
      config.reviewProviders,
      request,
      iteration
    );

    // 3. フィードバックに基づく改善
    const improvedResponse = await this.generateImprovement(
      primaryResponse,
      reviews,
      config,
      request,
      iteration
    );

    // 4. 品質評価
    const qualityScore = this.calculateQualityScore(
      improvedResponse || primaryResponse,
      reviews,
      iteration
    );

    // 5. 改善点の特定
    const improvements = this.identifyImprovements(
      primaryResponse,
      improvedResponse,
      reviews
    );

    // 6. 収束メトリクスの計算
    const convergenceMetrics = this.calculateConvergenceMetrics(
      primaryResponse,
      improvedResponse,
      previousCycles
    );

    return {
      iteration,
      primaryResponse,
      reviews,
      ...(improvedResponse ? { improvedResponse } : {}),
      qualityScore,
      improvements,
      convergenceMetrics
    };
  }

  private async collectReviews(
    primaryResponse: AIResponse,
    reviewProviders: AIProvider[],
    originalRequest: AIRequest,
    iteration: number
  ): Promise<IterationCycle['reviews']> {
    const reviews: IterationCycle['reviews'] = [];

    const reviewPrompt = `Please review the following response to the original question and provide constructive feedback:

Original Question: ${originalRequest.prompt}

Response to Review:
${primaryResponse.content}

Please provide:
1. Overall assessment of the response quality
2. Specific areas for improvement
3. Concrete suggestions for enhancement
4. Any missing information or perspectives

Focus on being constructive and specific in your feedback.`;

    for (const provider of reviewProviders) {
      try {
        const reviewResponse = await this.providerManager.executeRequest(provider, {
          id: `${originalRequest.id}-iter-${iteration}-review-${provider}`,
          prompt: reviewPrompt
        });

        const parsedReview = this.parseReviewResponse(reviewResponse.content);

        reviews.push({
          provider,
          response: reviewResponse,
          feedback: parsedReview.feedback,
          suggestions: parsedReview.suggestions
        });

      } catch (error) {
        console.warn(`Review from ${provider} failed in iteration ${iteration}:`, error);
      }
    }

    return reviews;
  }

  private parseReviewResponse(reviewContent: string): { feedback: string; suggestions: string[] } {
    // 簡易的なレビューパース
    const lines = reviewContent.split('\n').filter(line => line.trim().length > 0);
    
    let feedback = '';
    const suggestions: string[] = [];
    let inSuggestions = false;

    for (const line of lines) {
      if (line.toLowerCase().includes('suggestion') || line.includes('•') || line.includes('-')) {
        inSuggestions = true;
        suggestions.push(line.replace(/^[•\-\d\.\s]+/, '').trim());
      } else if (!inSuggestions) {
        feedback += line + ' ';
      }
    }

    return {
      feedback: feedback.trim() || reviewContent.substring(0, 300),
      suggestions: suggestions.length > 0 ? suggestions : [reviewContent.substring(0, 150)]
    };
  }

  private async generateImprovement(
    primaryResponse: AIResponse,
    reviews: IterationCycle['reviews'],
    config: IterativeStrategyConfig,
    originalRequest: AIRequest,
    iteration: number
  ): Promise<AIResponse | undefined> {
    if (reviews.length === 0) {
      return undefined;
    }

    const improvementPrompt = this.buildImprovementPrompt(
      originalRequest,
      primaryResponse,
      reviews,
      config.feedbackPrompts?.improve
    );

    try {
      const improvedResponse = await this.providerManager.executeRequest(
        config.primaryProvider,
        {
          id: `${originalRequest.id}-iter-${iteration}-improved`,
          prompt: improvementPrompt
        }
      );

      return improvedResponse;
    } catch (error) {
      console.warn(`Improvement generation failed in iteration ${iteration}:`, error);
      return undefined;
    }
  }

  private buildImprovementPrompt(
    originalRequest: AIRequest,
    primaryResponse: AIResponse,
    reviews: IterationCycle['reviews'],
    customPrompt?: string
  ): string {
    const basePrompt = customPrompt || 
      'Please improve the following response based on the feedback provided:';

    const reviewSummary = reviews.map((review, index) => 
      `Reviewer ${index + 1} (${review.provider}):
Feedback: ${review.feedback}
Suggestions: ${review.suggestions.join('; ')}`
    ).join('\n\n');

    return `${basePrompt}

Original Question: ${originalRequest.prompt}

Your Previous Response:
${primaryResponse.content}

Feedback from Reviewers:
${reviewSummary}

Please provide an improved response that addresses the feedback while maintaining the strengths of your original answer.`;
  }

  private calculateQualityScore(
    response: AIResponse,
    reviews: IterationCycle['reviews'],
    iteration: number
  ): number {
    let score = 0;

    // 基本品質指標
    score += this.calculateBasicQuality(response) * 0.4;

    // レビューアーの評価
    score += this.calculateReviewerAssessment(reviews) * 0.3;

    // 改善の一貫性
    score += this.calculateImprovementConsistency(iteration) * 0.2;

    // 完全性指標
    score += this.calculateCompleteness(response) * 0.1;

    return Math.min(1, Math.max(0, score));
  }

  private calculateBasicQuality(response: AIResponse): number {
    let quality = 0;

    // コンテンツの長さ（適度な詳細さ）
    const contentLength = response.content.length;
    if (contentLength > 200 && contentLength < 2000) {
      quality += 0.3;
    } else if (contentLength >= 2000 && contentLength < 4000) {
      quality += 0.2;
    }

    // 完了状態
    if (response.finish_reason === 'stop') {
      quality += 0.3;
    }

    // 効率性
    const tokenEfficiency = response.usage.completion_tokens / response.usage.prompt_tokens;
    if (tokenEfficiency > 0.2 && tokenEfficiency < 1.5) {
      quality += 0.2;
    }

    // レスポンス時間
    if (response.latency < 15000) { // 15秒未満
      quality += 0.2;
    }

    return quality;
  }

  private calculateReviewerAssessment(reviews: IterationCycle['reviews']): number {
    if (reviews.length === 0) return 0.5;

    // レビューの肯定性を分析
    let positiveAssessment = 0;
    
    for (const review of reviews) {
      const feedback = review.feedback.toLowerCase();
      const positiveWords = ['good', 'excellent', 'well', 'accurate', 'comprehensive', 'clear'];
      const negativeWords = ['poor', 'lacking', 'unclear', 'incomplete', 'wrong', 'confusing'];
      
      const positiveCount = positiveWords.filter(word => feedback.includes(word)).length;
      const negativeCount = negativeWords.filter(word => feedback.includes(word)).length;
      
      const reviewScore = Math.max(0, (positiveCount - negativeCount + 2) / 4);
      positiveAssessment += reviewScore;
    }

    return positiveAssessment / reviews.length;
  }

  private calculateImprovementConsistency(iteration: number): number {
    // 初期のイテレーションは低め、後期は高めにスコア
    return Math.min(1, iteration * 0.2);
  }

  private calculateCompleteness(response: AIResponse): number {
    const content = response.content;
    
    // 構造的要素の存在をチェック
    let completeness = 0;
    
    if (content.includes('conclusion') || content.includes('summary')) {
      completeness += 0.3;
    }
    
    if (content.includes('example') || content.includes('instance')) {
      completeness += 0.3;
    }
    
    if (content.split('\n').length > 3) { // 複数の段落
      completeness += 0.4;
    }

    return completeness;
  }

  private identifyImprovements(
    primaryResponse: AIResponse,
    improvedResponse: AIResponse | undefined,
    reviews: IterationCycle['reviews']
  ): string[] {
    const improvements: string[] = [];

    if (!improvedResponse) {
      return ['No improvement generated'];
    }

    // 長さの変化
    const lengthChange = improvedResponse.content.length - primaryResponse.content.length;
    if (lengthChange > 100) {
      improvements.push('Expanded content with more details');
    } else if (lengthChange < -100) {
      improvements.push('Condensed content for clarity');
    }

    // 新しい情報の追加
    const newConcepts = this.findNewConcepts(
      primaryResponse.content,
      improvedResponse.content
    );
    if (newConcepts.length > 0) {
      improvements.push(`Added new concepts: ${newConcepts.slice(0, 3).join(', ')}`);
    }

    // レビューの提案への対応
    const addressedSuggestions = this.findAddressedSuggestions(
      reviews,
      improvedResponse.content
    );
    if (addressedSuggestions.length > 0) {
      improvements.push(`Addressed reviewer suggestions: ${addressedSuggestions.length} items`);
    }

    return improvements.length > 0 ? improvements : ['General refinement'];
  }

  private findNewConcepts(original: string, improved: string): string[] {
    const originalWords = new Set(
      original.toLowerCase().split(/\s+/).filter(word => word.length > 4)
    );
    
    const newWords = improved.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 4 && !originalWords.has(word));
    
    return [...new Set(newWords)].slice(0, 5);
  }

  private findAddressedSuggestions(
    reviews: IterationCycle['reviews'],
    improvedContent: string
  ): string[] {
    const addressed: string[] = [];
    const improvedLower = improvedContent.toLowerCase();

    for (const review of reviews) {
      for (const suggestion of review.suggestions) {
        const suggestionKeywords = suggestion.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3);
        
        const matchCount = suggestionKeywords.filter(keyword => 
          improvedLower.includes(keyword)
        ).length;

        if (matchCount > suggestionKeywords.length * 0.3) {
          addressed.push(suggestion.substring(0, 50));
        }
      }
    }

    return addressed;
  }

  private calculateConvergenceMetrics(
    primaryResponse: AIResponse,
    improvedResponse: AIResponse | undefined,
    previousCycles: IterationCycle[]
  ): IterationCycle['convergenceMetrics'] {
    const stability = this.calculateStability(previousCycles);
    const improvement = this.calculateImprovement(primaryResponse, improvedResponse);
    const totalTokens = primaryResponse.usage.total_tokens + 
      (improvedResponse?.usage.total_tokens || 0);

    return {
      stability,
      improvement,
      totalTokens
    };
  }

  private calculateStability(previousCycles: IterationCycle[]): number {
    if (previousCycles.length < 2) return 0;

    const recentScores = previousCycles
      .slice(-3)
      .map(cycle => cycle.qualityScore);

    const variance = this.calculateVariance(recentScores);
    return Math.max(0, 1 - variance); // 低い分散は高い安定性
  }

  private calculateVariance(scores: number[]): number {
    if (scores.length < 2) return 0;

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    
    return variance;
  }

  private calculateImprovement(
    primaryResponse: AIResponse,
    improvedResponse: AIResponse | undefined
  ): number {
    if (!improvedResponse) return 0;

    // 簡易的な改善メトリック
    const primaryQuality = this.calculateBasicQuality(primaryResponse);
    const improvedQuality = this.calculateBasicQuality(improvedResponse);
    
    return Math.max(0, improvedQuality - primaryQuality);
  }

  private shouldStopIterating(
    currentCycle: IterationCycle,
    allCycles: IterationCycle[],
    config: IterativeStrategyConfig,
    previousQualityScore: number
  ): boolean {
    const criteria = config.convergenceCriteria;

    if (!criteria) {
      return false;
    }

    // 品質スコアが閾値に達した
    if (criteria.qualityScore && currentCycle.qualityScore >= criteria.qualityScore) {
      return true;
    }

    // 安定性チェック
    if (criteria.stabilityRounds && allCycles.length >= criteria.stabilityRounds) {
      const recentCycles = allCycles.slice(-criteria.stabilityRounds);
      const stability = this.calculateStability(recentCycles);
      if (stability > 0.9) { // 高い安定性
        return true;
      }
    }

    // トークン制限
    if (criteria.maxTokens) {
      const totalTokens = allCycles.reduce((sum, cycle) => 
        sum + cycle.convergenceMetrics.totalTokens, 0
      );
      if (totalTokens > criteria.maxTokens) {
        return true;
      }
    }

    // 改善が停滞している
    const improvementThreshold = config.improvementThreshold || 0.01;
    if (Math.abs(currentCycle.qualityScore - previousQualityScore) < improvementThreshold) {
      return true;
    }

    return false;
  }

  private hasConverged(cycles: IterationCycle[], config: IterativeStrategyConfig): boolean {
    if (cycles.length < 2) return false;

    const lastCycle = cycles[cycles.length - 1];
    const criteria = config.convergenceCriteria;

    if (criteria?.qualityScore && lastCycle.qualityScore >= criteria.qualityScore) {
      return true;
    }

    const stability = lastCycle.convergenceMetrics.stability;
    return stability > 0.8; // 安定性が高い場合は収束とみなす
  }

  private prepareNextIterationRequest(
    originalRequest: AIRequest,
    currentCycle: IterationCycle,
    nextIteration: number
  ): AIRequest {
    const context = currentCycle.improvedResponse || currentCycle.primaryResponse;
    const suggestions = currentCycle.reviews.flatMap(r => r.suggestions).slice(0, 3);

    const iterativePrompt = `${originalRequest.prompt}

Previous iteration context:
${context.content.substring(0, 500)}...

Key areas for further improvement:
${suggestions.join('\n')}

Please provide an enhanced response that builds upon the previous work while addressing the remaining improvement areas.`;

    return {
      ...originalRequest,
      id: `${originalRequest.id}-iter-${nextIteration}`,
      prompt: iterativePrompt
    };
  }

  private extractAllResponses(cycles: IterationCycle[]): AIResponse[] {
    const responses: AIResponse[] = [];
    
    for (const cycle of cycles) {
      responses.push(cycle.primaryResponse);
      responses.push(...cycle.reviews.map(r => r.response));
      if (cycle.improvedResponse) {
        responses.push(cycle.improvedResponse);
      }
    }

    return responses;
  }

  private buildFinalResult(cycles: IterationCycle[], originalRequest: AIRequest): AIResponse {
    const finalCycle = cycles[cycles.length - 1];
    const finalResponse = finalCycle.improvedResponse || finalCycle.primaryResponse;
    const finalId = `iterative-final-${Date.now()}`;

    // 反復プロセスの要約
    const iterationSummary = this.buildIterationSummary(cycles);
    
    const enhancedContent = `${finalResponse.content}

--- Iterative Improvement Summary ---
${iterationSummary}`;

    const totalUsage = cycles.reduce(
      (acc, cycle) => {
        const cycleUsage = cycle.reviews.reduce(
          (reviewAcc, review) => ({
            prompt_tokens: reviewAcc.prompt_tokens + review.response.usage.prompt_tokens,
            completion_tokens: reviewAcc.completion_tokens + review.response.usage.completion_tokens,
            total_tokens: reviewAcc.total_tokens + review.response.usage.total_tokens
          }),
          cycle.primaryResponse.usage
        );

        if (cycle.improvedResponse) {
          cycleUsage.prompt_tokens += cycle.improvedResponse.usage.prompt_tokens;
          cycleUsage.completion_tokens += cycle.improvedResponse.usage.completion_tokens;
          cycleUsage.total_tokens += cycle.improvedResponse.usage.total_tokens;
        }

        return {
          prompt_tokens: acc.prompt_tokens + cycleUsage.prompt_tokens,
          completion_tokens: acc.completion_tokens + cycleUsage.completion_tokens,
          total_tokens: acc.total_tokens + cycleUsage.total_tokens
        };
      },
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    const baseMetadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      iterative_cycles: cycles.length,
      final_quality_score: finalCycle.qualityScore,
      improvement_path: cycles.map(c => c.qualityScore),
      total_improvements: cycles.flatMap(c => c.improvements).length
    };

    return {
      id: finalId,
      provider: 'iterative_final' as AIProvider,
      model: 'iterative_collaboration',
      content: enhancedContent,
      usage: totalUsage,
      latency: cycles.reduce((sum, cycle) => {
        const cycleLatency = cycle.primaryResponse.latency +
          cycle.reviews.reduce((reviewSum, review) => reviewSum + review.response.latency, 0) +
          (cycle.improvedResponse?.latency || 0);
        return sum + cycleLatency;
      }, 0),
      finish_reason: 'stop',
      metadata: {
        ...baseMetadata,
        cycles_detail: cycles.map(cycle => ({
          iteration: cycle.iteration,
          quality_score: cycle.qualityScore,
          improvements: cycle.improvements,
          review_count: cycle.reviews.length,
          had_improvement: !!cycle.improvedResponse
        }))
      }
    };
  }

  private buildIterationSummary(cycles: IterationCycle[]): string {
    const summary = cycles.map(cycle => 
      `Iteration ${cycle.iteration}: Quality ${(cycle.qualityScore * 100).toFixed(1)}%
  - Improvements: ${cycle.improvements.join(', ')}
  - Reviews: ${cycle.reviews.length} reviewers
  - Stability: ${(cycle.convergenceMetrics.stability * 100).toFixed(1)}%`
    ).join('\n\n');

    const overallImprovement = cycles.length > 1 ? 
      cycles[cycles.length - 1].qualityScore - cycles[0].qualityScore : 0;

    const finalSummary = `\nOverall Process:
- Total iterations: ${cycles.length}
- Quality improvement: ${(overallImprovement * 100).toFixed(1)}%
- Final stability: ${(cycles[cycles.length - 1].convergenceMetrics.stability * 100).toFixed(1)}%
- Total tokens used: ${cycles.reduce((sum, c) => sum + c.convergenceMetrics.totalTokens, 0)}`;

    return summary + finalSummary;
  }
}