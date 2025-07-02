/**
 * Collaborate Tool - 協調ツール実装
 * T009: 複数のAIプロバイダーとの協調作業を提供するMCPツール
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest,
  CollaborationResult,
  AIProvider,
  Timestamp
} from '../types/index.js';
import { IStrategyManager, StrategyType, StrategyConfig } from '../core/strategy-manager.js';
import { IProviderManager } from '../core/provider-manager.js';
import { TYPES } from '../core/types.js';

export interface CollaborateParams {
  prompt: string;
  strategy?: StrategyType;
  providers?: AIProvider[];
  config?: Record<string, unknown>;
  context?: {
    previous_results?: CollaborationResult[];
    domain?: string;
    urgency?: 'low' | 'medium' | 'high';
    quality_preference?: 'speed' | 'accuracy' | 'creativity';
  };
}

export interface CollaborateResult {
  success: boolean;
  collaboration_id: string;
  strategy_used: StrategyType;
  providers_used: AIProvider[];
  final_answer: string;
  confidence_score: number;
  execution_time: number;
  token_usage: {
    total_tokens: number;
    cost_estimate?: number;
  };
  intermediate_results?: Array<{
    step: number;
    provider: AIProvider;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  recommendations?: {
    follow_up_questions?: string[];
    related_topics?: string[];
    improvement_suggestions?: string[];
  };
  error?: string;
}

@injectable()
export class CollaborateTool {
  constructor(
    @inject(TYPES.StrategyManager) private strategyManager: IStrategyManager,
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {}

  async execute(params: CollaborateParams): Promise<CollaborateResult> {
    const startTime = Date.now();
    const collaborationId = `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 1. パラメータの検証と準備
      const validatedParams = this.validateAndPrepareParams(params);
      
      // 2. 戦略の決定
      const { strategy, config } = this.determineStrategy(validatedParams);
      
      // 3. 協調実行
      const collaborationResult = await this.executeCollaboration(
        validatedParams,
        strategy,
        config
      );

      // 4. 結果の後処理
      const processedResult = this.postProcessResult(
        collaborationResult,
        validatedParams
      );

      const intermediateResults = this.extractIntermediateResults(collaborationResult);
      const recommendations = this.generateRecommendations(collaborationResult, validatedParams);
      
      return {
        success: true,
        collaboration_id: collaborationId,
        strategy_used: strategy,
        providers_used: this.extractProvidersUsed(collaborationResult),
        final_answer: processedResult.final_answer,
        confidence_score: this.calculateConfidenceScore(collaborationResult),
        execution_time: Date.now() - startTime,
        token_usage: this.calculateTokenUsage(collaborationResult),
        ...(intermediateResults ? { intermediate_results: intermediateResults } : {}),
        ...(recommendations ? { recommendations } : {})
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        collaboration_id: collaborationId,
        strategy_used: params.strategy || 'parallel',
        providers_used: params.providers || [],
        final_answer: '',
        confidence_score: 0,
        execution_time: Date.now() - startTime,
        token_usage: { total_tokens: 0 },
        error: errorMessage
      };
    }
  }

  private validateAndPrepareParams(params: CollaborateParams): CollaborateParams {
    if (!params.prompt || params.prompt.trim().length === 0) {
      throw new Error('Prompt is required and cannot be empty');
    }

    if (params.prompt.length > 10000) {
      throw new Error('Prompt is too long (max 10,000 characters)');
    }

    const availableProviders = this.providerManager.getAvailableProviders();
    
    if (params.providers) {
      const invalidProviders = params.providers.filter(p => 
        !availableProviders.includes(p)
      );
      if (invalidProviders.length > 0) {
        throw new Error(`Invalid providers: ${invalidProviders.join(', ')}`);
      }
    }

    // デフォルト値の設定
    return {
      ...params,
      providers: params.providers || availableProviders,
      context: {
        urgency: 'medium',
        quality_preference: 'accuracy',
        ...params.context
      }
    };
  }

  private determineStrategy(params: CollaborateParams): {
    strategy: StrategyType;
    config: StrategyConfig;
  } {
    // ユーザーが戦略を指定した場合
    if (params.strategy) {
      const config = this.buildStrategyConfig(params.strategy, params);
      return { strategy: params.strategy, config };
    }

    // 自動戦略選択
    const request: AIRequest = {
      id: `strategy-selection-${Date.now()}`,
      prompt: params.prompt
    };

    const recommendation = this.strategyManager.recommendStrategy(
      request,
      params.providers || []
    );

    // コンテキストに基づく調整
    const adjustedStrategy = this.adjustStrategyByContext(
      recommendation.strategy,
      params.context
    );

    const config = this.buildStrategyConfig(adjustedStrategy, params);
    
    return { strategy: adjustedStrategy, config };
  }

  private adjustStrategyByContext(
    baseStrategy: StrategyType,
    context?: CollaborateParams['context']
  ): StrategyType {
    if (!context) return baseStrategy;

    // 緊急度による調整
    if (context.urgency === 'high') {
      return 'parallel'; // 速度重視
    }

    // 品質優先設定による調整
    if (context.quality_preference === 'accuracy') {
      if (baseStrategy === 'parallel') {
        return 'consensus'; // より正確性を重視
      }
    } else if (context.quality_preference === 'creativity') {
      return 'iterative'; // 創造性を重視
    } else if (context.quality_preference === 'speed') {
      return 'parallel'; // 速度重視
    }

    return baseStrategy;
  }

  private buildStrategyConfig(
    strategy: StrategyType,
    params: CollaborateParams
  ): StrategyConfig {
    const providers = params.providers || [];
    const customConfig = params.config || {};

    switch (strategy) {
      case 'parallel':
        return {
          providers,
          aggregationMethod: 'best',
          failureThreshold: 0.5,
          timeout: params.context?.urgency === 'high' ? 30000 : 60000,
          ...customConfig
        };

      case 'sequential':
        return {
          providers: providers.slice(0, 3), // 最大3ステップ
          maxSteps: 3,
          contextPreservation: 'full',
          ...customConfig
        };

      case 'consensus':
        return {
          providers,
          consensusThreshold: 0.7,
          maxRounds: 2,
          votingMethod: 'weighted',
          ...customConfig
        };

      case 'iterative':
        return {
          primaryProvider: providers[0],
          reviewProviders: providers.slice(1) || [providers[0]],
          maxIterations: params.context?.quality_preference === 'accuracy' ? 4 : 3,
          convergenceCriteria: {
            qualityScore: 0.8,
            stabilityRounds: 2
          },
          ...customConfig
        };

      default:
        throw new Error(`Unsupported strategy: ${strategy}`);
    }
  }

  private async executeCollaboration(
    params: CollaborateParams,
    strategy: StrategyType,
    config: StrategyConfig
  ): Promise<CollaborationResult> {
    const request: AIRequest = {
      id: `collaboration-${Date.now()}`,
      prompt: this.enhancePromptWithContext(params.prompt, params.context),
      metadata: {
        request_id: `collaboration-${Date.now()}`,
        timestamp: new Date().toISOString() as Timestamp,
        context: params.context
      }
    };

    return await this.strategyManager.executeStrategy({
      strategy,
      request,
      config
    });
  }

  private enhancePromptWithContext(
    originalPrompt: string,
    context?: CollaborateParams['context']
  ): string {
    if (!context) return originalPrompt;

    let enhancedPrompt = originalPrompt;

    // ドメイン情報の追加
    if (context.domain) {
      enhancedPrompt = `Context: This question is in the domain of ${context.domain}.\n\n${enhancedPrompt}`;
    }

    // 前回の結果の参照
    if (context.previous_results && context.previous_results.length > 0) {
      const previousContext = context.previous_results
        .slice(-2) // 最新2件
        .map(result => `Previous result: ${result.final_result?.content || 'No content'}`)
        .join('\n');
      
      enhancedPrompt = `${enhancedPrompt}\n\nPrevious context:\n${previousContext}`;
    }

    // 品質優先設定の指示
    if (context.quality_preference) {
      const qualityInstructions = {
        speed: 'Please provide a quick, concise answer.',
        accuracy: 'Please provide a thorough, well-researched, and accurate answer.',
        creativity: 'Please provide a creative, innovative, and original perspective.'
      };
      
      enhancedPrompt = `${enhancedPrompt}\n\nInstruction: ${qualityInstructions[context.quality_preference]}`;
    }

    return enhancedPrompt;
  }

  private postProcessResult(
    collaborationResult: CollaborationResult,
    params: CollaborateParams
  ): { final_answer: string } {
    if (!collaborationResult.final_result) {
      return { final_answer: 'No result generated from collaboration.' };
    }

    let finalAnswer = collaborationResult.final_result.content;

    // 緊急度が高い場合は要約
    if (params.context?.urgency === 'high' && finalAnswer.length > 500) {
      finalAnswer = this.summarizeResponse(finalAnswer);
    }

    // ドメイン特有の後処理
    if (params.context?.domain) {
      finalAnswer = this.applyDomainSpecificFormatting(
        finalAnswer,
        params.context.domain
      );
    }

    return { final_answer: finalAnswer };
  }

  private summarizeResponse(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 3) {
      return content;
    }

    // 最初と最後の文、そして中間の重要な文を選択
    const summary = [
      sentences[0],
      sentences[Math.floor(sentences.length / 2)],
      sentences[sentences.length - 1]
    ].join('. ') + '.';

    return `${summary}\n\n[Summary provided due to high urgency setting]`;
  }

  private applyDomainSpecificFormatting(content: string, domain: string): string {
    switch (domain.toLowerCase()) {
      case 'technical':
      case 'programming':
        return this.formatTechnicalContent(content);
      
      case 'academic':
      case 'research':
        return this.formatAcademicContent(content);
      
      case 'business':
        return this.formatBusinessContent(content);
      
      default:
        return content;
    }
  }

  private formatTechnicalContent(content: string): string {
    // コードブロックの整理、技術用語の強調など
    return content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `\`\`\`${lang || ''}\n${code.trim()}\n\`\`\``;
    });
  }

  private formatAcademicContent(content: string): string {
    // 参考文献形式の整理、構造化など
    if (!content.includes('References:') && !content.includes('Bibliography:')) {
      return `${content}\n\n*Note: This is a collaborative AI analysis. Please verify with primary sources.*`;
    }
    return content;
  }

  private formatBusinessContent(content: string): string {
    // エグゼクティブサマリーの追加など
    const lines = content.split('\n');
    const firstParagraph = lines.slice(0, 3).join('\n');
    
    return `**Executive Summary**: ${firstParagraph}\n\n**Detailed Analysis**:\n${content}`;
  }

  private extractProvidersUsed(result: CollaborationResult): AIProvider[] {
    if (result.metadata?.providers_used) {
      return result.metadata.providers_used as AIProvider[];
    }
    
    const providers = new Set<AIProvider>();
    result.responses.forEach(response => {
      providers.add(response.provider);
    });
    
    return Array.from(providers);
  }

  private calculateConfidenceScore(result: CollaborationResult): number {
    if (!result.success || !result.final_result) {
      return 0;
    }

    let confidence = 0.5; // ベース信頼度

    // 戦略による調整
    switch (result.strategy) {
      case 'consensus':
        confidence += 0.2; // 合意形成は信頼度が高い
        break;
      case 'iterative':
        confidence += 0.15; // 反復改善も信頼度が高い
        break;
      case 'sequential':
        confidence += 0.1;
        break;
      case 'parallel':
        confidence += 0.05;
        break;
    }

    // プロバイダー数による調整
    const providerCount = this.extractProvidersUsed(result).length;
    confidence += Math.min(providerCount * 0.05, 0.2);

    // 完了状態による調整
    if (result.final_result.finish_reason === 'stop') {
      confidence += 0.1;
    }

    // メタデータからの追加情報
    if (result.metadata?.final_agreement) {
      confidence += (result.metadata.final_agreement as number) * 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateTokenUsage(result: CollaborationResult): {
    total_tokens: number;
    cost_estimate?: number;
  } {
    const totalTokens = result.responses.reduce(
      (sum, response) => sum + response.usage.total_tokens,
      0
    );

    // 簡易的なコスト見積もり（実際のレートは設定可能にする）
    const costEstimate = totalTokens * 0.002; // $0.002 per 1K tokens

    return {
      total_tokens: totalTokens,
      cost_estimate: costEstimate
    };
  }

  private extractIntermediateResults(result: CollaborationResult): CollaborateResult['intermediate_results'] {
    if (result.strategy === 'parallel') {
      return result.responses.map((response, index) => ({
        step: index + 1,
        provider: response.provider,
        content: response.content,
        metadata: {
          latency: response.latency,
          tokens: response.usage.total_tokens,
          finish_reason: response.finish_reason
        }
      }));
    }

    // その他の戦略では順序を考慮
    return result.responses.map((response, index) => ({
      step: index + 1,
      provider: response.provider,
      content: response.content.substring(0, 200) + '...', // 要約版
      metadata: {
        latency: response.latency,
        tokens: response.usage.total_tokens,
        finish_reason: response.finish_reason
      }
    }));
  }

  private generateRecommendations(
    result: CollaborationResult,
    params: CollaborateParams
  ): CollaborateResult['recommendations'] {
    const recommendations: CollaborateResult['recommendations'] = {};

    // フォローアップ質問の生成
    recommendations.follow_up_questions = this.generateFollowUpQuestions(
      params.prompt,
      result.final_result?.content || ''
    );

    // 関連トピック
    recommendations.related_topics = this.identifyRelatedTopics(
      params.prompt,
      params.context?.domain
    );

    // 改善提案
    recommendations.improvement_suggestions = this.generateImprovementSuggestions(
      result,
      params
    );

    return recommendations;
  }

  private generateFollowUpQuestions(prompt: string, answer: string): string[] {
    // 簡易的なフォローアップ質問生成
    const questions: string[] = [];

    if (answer.includes('however') || answer.includes('but')) {
      questions.push('Can you elaborate on the limitations or exceptions mentioned?');
    }

    if (answer.includes('example') || answer.includes('for instance')) {
      questions.push('Can you provide more examples or case studies?');
    }

    if (prompt.toLowerCase().includes('how')) {
      questions.push('What are the potential challenges in implementing this?');
    }

    if (prompt.toLowerCase().includes('what')) {
      questions.push('How does this compare to alternative approaches?');
    }

    questions.push('What are the next steps or practical applications?');

    return questions.slice(0, 3); // 最大3つ
  }

  private identifyRelatedTopics(prompt: string, domain?: string): string[] {
    const topics: string[] = [];

    // ドメインベースの関連トピック
    if (domain) {
      const domainTopics = {
        technical: ['Architecture', 'Performance', 'Security', 'Testing'],
        business: ['Strategy', 'Market Analysis', 'ROI', 'Risk Management'],
        academic: ['Methodology', 'Literature Review', 'Data Analysis', 'Peer Review'],
        programming: ['Best Practices', 'Code Review', 'Documentation', 'Debugging']
      };

      topics.push(...(domainTopics[domain.toLowerCase() as keyof typeof domainTopics] || []));
    }

    // プロンプトからキーワード抽出
    const keywords = prompt.toLowerCase().split(/\s+/).filter(word => word.length > 4);
    topics.push(...keywords.slice(0, 3));

    return [...new Set(topics)].slice(0, 5);
  }

  private generateImprovementSuggestions(
    result: CollaborationResult,
    params: CollaborateParams
  ): string[] {
    const suggestions: string[] = [];

    // 戦略に基づく提案
    if (result.strategy === 'parallel' && this.extractProvidersUsed(result).length > 1) {
      suggestions.push('Consider using consensus strategy for more coherent results');
    }

    if (result.metadata?.execution_time && (result.metadata.execution_time as number) > 30000) {
      suggestions.push('For faster results, try parallel strategy with fewer providers');
    }

    // 信頼度に基づく提案
    const confidence = this.calculateConfidenceScore(result);
    if (confidence < 0.7) {
      suggestions.push('Consider using iterative strategy for higher quality results');
    }

    // コンテキストに基づく提案
    if (params.context?.quality_preference === 'speed' && result.strategy !== 'parallel') {
      suggestions.push('For speed optimization, consider using parallel strategy');
    }

    return suggestions.slice(0, 3);
  }

  // ユーティリティメソッド
  getToolInfo(): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    examples: Array<{ input: CollaborateParams; description: string }>;
  } {
    return {
      name: 'collaborate',
      description: 'Collaborate with multiple AI providers to solve complex problems',
      parameters: {
        prompt: { type: 'string', required: true, description: 'The question or task to collaborate on' },
        strategy: { type: 'string', enum: ['parallel', 'sequential', 'consensus', 'iterative'], description: 'Collaboration strategy' },
        providers: { type: 'array', items: { type: 'string' }, description: 'Specific providers to use' },
        config: { type: 'object', description: 'Strategy-specific configuration' },
        context: { type: 'object', description: 'Additional context for collaboration' }
      },
      examples: [
        {
          input: {
            prompt: 'Explain quantum computing and its applications',
            strategy: 'consensus'
          },
          description: 'Get a balanced explanation using consensus strategy'
        },
        {
          input: {
            prompt: 'Review this code for bugs and improvements',
            strategy: 'iterative',
            context: { domain: 'programming', quality_preference: 'accuracy' }
          },
          description: 'Thorough code review using iterative improvement'
        }
      ]
    };
  }
}