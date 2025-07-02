/**
 * Sequential Strategy - 順次実行戦略
 * T008: AIプロバイダーを順次実行し、前の結果を次に引き継ぐ
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

export interface SequentialStrategyConfig {
  providers: AIProvider[];
  continuationPrompt?: string;
  maxSteps?: number;
  stopConditions?: {
    maxTokens?: number;
    keywords?: string[];
    confidence?: number;
  };
  contextPreservation?: 'full' | 'summary' | 'last_only';
}

export interface SequentialStep {
  stepNumber: number;
  provider: AIProvider;
  request: AIRequest;
  response: AIResponse;
  executionTime: number;
  context: string;
}

@injectable()
export class SequentialStrategy {
  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {}

  async execute(
    request: AIRequest,
    config: SequentialStrategyConfig
  ): Promise<CollaborationResult> {
    const startTime = Date.now();

    try {
      const providers = this.validateProviders(config.providers);
      const maxSteps = config.maxSteps || providers.length;
      
      const steps = await this.executeSequentialSteps(request, config, providers, maxSteps);
      
      // 最終結果の構築
      const finalResponse = this.buildFinalResponse(steps, request);
      
      const collaborationResult: CollaborationResult = {
        success: true,
        strategy: 'sequential',
        responses: steps.map(step => step.response),
        final_result: finalResponse,
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          providers_used: steps.map(step => step.provider),
          step_count: steps.length,
          context_preservation: config.contextPreservation || 'full',
          steps_summary: steps.map(step => ({
            step: step.stepNumber,
            provider: step.provider,
            tokens: step.response.usage.total_tokens,
            execution_time: step.executionTime
          }))
        }
      };

      return collaborationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        strategy: 'sequential',
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

    return validProviders;
  }

  private async executeSequentialSteps(
    initialRequest: AIRequest,
    config: SequentialStrategyConfig,
    providers: AIProvider[],
    maxSteps: number
  ): Promise<SequentialStep[]> {
    const steps: SequentialStep[] = [];
    let currentContext = '';
    let currentRequest = { ...initialRequest };

    for (let stepNumber = 1; stepNumber <= maxSteps && stepNumber <= providers.length; stepNumber++) {
      const provider = providers[stepNumber - 1];
      const stepStartTime = Date.now();

      try {
        // コンテキストを保持したリクエストの作成
        if (stepNumber > 1) {
          currentRequest = this.buildContextualRequest(
            initialRequest,
            currentContext,
            config,
            stepNumber
          );
        }

        // プロバイダーの実行
        const response = await this.providerManager.executeRequest(provider, currentRequest);
        const executionTime = Date.now() - stepStartTime;

        // ステップの記録
        const step: SequentialStep = {
          stepNumber,
          provider,
          request: currentRequest,
          response,
          executionTime,
          context: currentContext
        };

        steps.push(step);

        // コンテキストの更新
        currentContext = this.updateContext(
          currentContext,
          response,
          config.contextPreservation || 'full'
        );

        // 停止条件のチェック
        if (this.shouldStop(response, config.stopConditions, currentContext)) {
          break;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Step ${stepNumber} with provider ${provider} failed: ${errorMessage}`);
        
        // エラーが発生しても続行（設定により調整可能）
        continue;
      }
    }

    if (steps.length === 0) {
      throw new Error('No steps were successfully executed');
    }

    return steps;
  }

  private buildContextualRequest(
    originalRequest: AIRequest,
    context: string,
    config: SequentialStrategyConfig,
    stepNumber: number
  ): AIRequest {
    const continuationPrompt = config.continuationPrompt || 
      'Based on the previous response, please continue and improve upon the answer:';

    let contextualPrompt: string;

    if (stepNumber === 2) {
      // 最初の継続
      contextualPrompt = `${originalRequest.prompt}\n\n${continuationPrompt}\n\nPrevious context:\n${context}`;
    } else {
      // 複数回の継続
      contextualPrompt = `${continuationPrompt}\n\nContext so far:\n${context}\n\nPlease provide the next iteration or improvement.`;
    }

    return {
      ...originalRequest,
      id: `${originalRequest.id}-step-${stepNumber}`,
      prompt: contextualPrompt
    };
  }

  private updateContext(
    currentContext: string,
    newResponse: AIResponse,
    preservationMode: 'full' | 'summary' | 'last_only'
  ): string {
    switch (preservationMode) {
      case 'full':
        return currentContext 
          ? `${currentContext}\n\n--- Next Response (${newResponse.provider}) ---\n${newResponse.content}`
          : `Response from ${newResponse.provider}:\n${newResponse.content}`;
      
      case 'summary':
        const summary = this.summarizeResponse(newResponse);
        return currentContext
          ? `${currentContext}\n\n--- Summary from ${newResponse.provider} ---\n${summary}`
          : `Summary from ${newResponse.provider}:\n${summary}`;
      
      case 'last_only':
        return `Latest response from ${newResponse.provider}:\n${newResponse.content}`;
      
      default:
        return this.updateContext(currentContext, newResponse, 'full');
    }
  }

  private summarizeResponse(response: AIResponse): string {
    const content = response.content;
    
    // 簡易的な要約：最初の段落と最後の段落を取る
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    
    if (paragraphs.length <= 2) {
      return content;
    }
    
    const firstParagraph = paragraphs[0];
    const lastParagraph = paragraphs[paragraphs.length - 1];
    
    return `${firstParagraph}\n\n[...summary of ${paragraphs.length - 2} paragraphs...]\n\n${lastParagraph}`;
  }

  private shouldStop(
    response: AIResponse,
    stopConditions?: SequentialStrategyConfig['stopConditions'],
    context?: string
  ): boolean {
    if (!stopConditions) {
      return false;
    }

    // 最大トークン数チェック
    if (stopConditions.maxTokens) {
      const totalTokens = (context?.length || 0) + response.content.length;
      // 大雑把な見積もり：4文字 = 1トークン
      const estimatedTokens = totalTokens / 4;
      if (estimatedTokens > stopConditions.maxTokens) {
        return true;
      }
    }

    // キーワードチェック
    if (stopConditions.keywords && stopConditions.keywords.length > 0) {
      const content = response.content.toLowerCase();
      const hasStopKeyword = stopConditions.keywords.some(keyword => 
        content.includes(keyword.toLowerCase())
      );
      if (hasStopKeyword) {
        return true;
      }
    }

    // 信頼度チェック（finish_reasonベース）
    if (stopConditions.confidence !== undefined) {
      const confidence = this.calculateResponseConfidence(response);
      if (confidence >= stopConditions.confidence) {
        return true;
      }
    }

    return false;
  }

  private calculateResponseConfidence(response: AIResponse): number {
    let confidence = 0.5; // ベース信頼度

    // finish_reasonによる調整
    if (response.finish_reason === 'stop') {
      confidence += 0.3;
    } else if (response.finish_reason === 'length') {
      confidence += 0.1;
    }

    // コンテンツの品質による調整
    const content = response.content;
    
    // 確信を示す表現があるかチェック
    const confidenceKeywords = [
      'definitely', 'certainly', 'clearly', 'obviously',
      'precisely', 'exactly', 'conclusively', 'undoubtedly'
    ];
    
    const uncertaintyKeywords = [
      'maybe', 'perhaps', 'possibly', 'might', 'could',
      'uncertain', 'unsure', 'unclear', 'ambiguous'
    ];

    const confidenceMatches = confidenceKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    ).length;
    
    const uncertaintyMatches = uncertaintyKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    ).length;

    confidence += (confidenceMatches * 0.05) - (uncertaintyMatches * 0.1);

    // 0-1の範囲に正規化
    return Math.max(0, Math.min(1, confidence));
  }

  private buildFinalResponse(steps: SequentialStep[], originalRequest: AIRequest): AIResponse {
    const lastStep = steps[steps.length - 1];
    const finalId = `sequential-final-${Date.now()}`;

    // 全ステップの要約を含む最終レスポンス
    const evolutionSummary = this.buildEvolutionSummary(steps);
    
    const combinedContent = `${lastStep.response.content}\n\n--- Evolution Summary ---\n${evolutionSummary}`;

    const totalUsage = steps.reduce(
      (acc, step) => ({
        prompt_tokens: acc.prompt_tokens + step.response.usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + step.response.usage.completion_tokens,
        total_tokens: acc.total_tokens + step.response.usage.total_tokens
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    const baseMetadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      sequential_steps: steps.length,
      providers_sequence: steps.map(step => step.provider),
      total_execution_time: steps.reduce((sum, step) => sum + step.executionTime, 0)
    };

    return {
      id: finalId,
      provider: 'sequential_final' as AIProvider,
      model: 'sequential_collaboration',
      content: combinedContent,
      usage: totalUsage,
      latency: steps.reduce((sum, step) => sum + step.executionTime, 0),
      finish_reason: lastStep.response.finish_reason || 'stop',
      metadata: {
        ...baseMetadata,
        steps_detail: steps.map(step => ({
          step: step.stepNumber,
          provider: step.provider,
          model: step.response.model,
          tokens: step.response.usage.total_tokens,
          execution_time: step.executionTime,
          finish_reason: step.response.finish_reason
        }))
      }
    };
  }

  private buildEvolutionSummary(steps: SequentialStep[]): string {
    const summary = steps.map((step, index) => {
      const improvement = index > 0 ? this.analyzeImprovement(steps[index - 1], step) : null;
      
      return `Step ${step.stepNumber} (${step.provider}):
- Tokens: ${step.response.usage.total_tokens}
- Time: ${step.executionTime}ms
- Content length: ${step.response.content.length} chars${improvement ? `
- Improvement: ${improvement}` : ''}`;
    }).join('\n\n');

    const finalAnalysis = `\nFinal Analysis:
- Total steps: ${steps.length}
- Total tokens: ${steps.reduce((sum, step) => sum + step.response.usage.total_tokens, 0)}
- Total time: ${steps.reduce((sum, step) => sum + step.executionTime, 0)}ms
- Provider diversity: ${new Set(steps.map(step => step.provider)).size} unique providers`;

    return summary + finalAnalysis;
  }

  private analyzeImprovement(previousStep: SequentialStep, currentStep: SequentialStep): string {
    const prevContent = previousStep.response.content;
    const currentContent = currentStep.response.content;
    
    const improvements = [];
    
    // 長さの変化
    if (currentContent.length > prevContent.length * 1.2) {
      improvements.push('expanded content');
    } else if (currentContent.length < prevContent.length * 0.8) {
      improvements.push('condensed content');
    }
    
    // 新しい情報の追加検出
    const newWords = this.findNewInformation(prevContent, currentContent);
    if (newWords.length > 0) {
      improvements.push(`added new concepts: ${newWords.slice(0, 3).join(', ')}`);
    }
    
    // 実行時間の改善
    if (currentStep.executionTime < previousStep.executionTime * 0.8) {
      improvements.push('faster execution');
    }
    
    return improvements.length > 0 ? improvements.join(', ') : 'refined approach';
  }

  private findNewInformation(previousContent: string, currentContent: string): string[] {
    const previousWords = new Set(
      previousContent.toLowerCase().split(/\s+/).filter(word => word.length > 3)
    );
    
    const currentWords = currentContent.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !previousWords.has(word));
    
    return [...new Set(currentWords)].slice(0, 10); // 最大10個の新しいワード
  }
}