/**
 * Strategy Manager - 実行戦略管理クラス
 * T008: 各種実行戦略の統合管理
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest, 
  CollaborationResult,
  AIProvider
} from '../types/index.js';
import { IProviderManager } from './provider-manager.js';
import { TYPES } from './types.js';
import { ParallelStrategy, ParallelStrategyConfig } from '../strategies/parallel-strategy.js';
import { SequentialStrategy, SequentialStrategyConfig } from '../strategies/sequential-strategy.js';
import { ConsensusStrategy, ConsensusStrategyConfig } from '../strategies/consensus-strategy.js';
import { IterativeStrategy, IterativeStrategyConfig } from '../strategies/iterative-strategy.js';

export type StrategyType = 'parallel' | 'sequential' | 'consensus' | 'iterative';

export type StrategyConfig = 
  | ParallelStrategyConfig
  | SequentialStrategyConfig
  | ConsensusStrategyConfig
  | IterativeStrategyConfig;

export interface StrategyExecutionRequest {
  strategy: StrategyType;
  request: AIRequest;
  config: StrategyConfig;
}

export interface IStrategyManager {
  executeStrategy(request: StrategyExecutionRequest): Promise<CollaborationResult>;
  getAvailableStrategies(): StrategyType[];
  recommendStrategy(request: AIRequest, availableProviders: AIProvider[]): {
    strategy: StrategyType;
    reason: string;
    config: StrategyConfig;
  };
  validateStrategyConfig(strategy: StrategyType, config: StrategyConfig): { valid: boolean; errors?: string[] };
}

@injectable()
export class StrategyManager implements IStrategyManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private strategies: Map<StrategyType, any>;

  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {
    // 各戦略のインスタンスを作成
    this.strategies = new Map();
    this.strategies.set('parallel', new ParallelStrategy(this.providerManager));
    this.strategies.set('sequential', new SequentialStrategy(this.providerManager));
    this.strategies.set('consensus', new ConsensusStrategy(this.providerManager));
    this.strategies.set('iterative', new IterativeStrategy(this.providerManager));
  }

  async executeStrategy(request: StrategyExecutionRequest): Promise<CollaborationResult> {
    const { strategy, request: aiRequest, config } = request;

    // 戦略の存在確認
    const strategyInstance = this.strategies.get(strategy);
    if (!strategyInstance) {
      throw new Error(`Strategy '${strategy}' is not available`);
    }

    // 設定の検証
    const validation = this.validateStrategyConfig(strategy, config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration for ${strategy}: ${validation.errors?.join(', ')}`);
    }

    try {
      // 戦略に応じた実行
      switch (strategy) {
        case 'parallel':
          return await (strategyInstance as ParallelStrategy).execute(
            aiRequest,
            config as ParallelStrategyConfig
          );
        
        case 'sequential':
          return await (strategyInstance as SequentialStrategy).execute(
            aiRequest,
            config as SequentialStrategyConfig
          );
        
        case 'consensus':
          return await (strategyInstance as ConsensusStrategy).execute(
            aiRequest,
            config as ConsensusStrategyConfig
          );
        
        case 'iterative':
          return await (strategyInstance as IterativeStrategy).execute(
            aiRequest,
            config as IterativeStrategyConfig
          );
        
        default:
          throw new Error(`Unsupported strategy: ${strategy}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // エラー時のフォールバック結果
      return {
        success: false,
        strategy,
        responses: [],
        metadata: {
          request_id: aiRequest.id,
          timestamp: new Date().toISOString(),
          execution_time: 0,
          error: errorMessage
        }
      };
    }
  }

  getAvailableStrategies(): StrategyType[] {
    return Array.from(this.strategies.keys());
  }

  recommendStrategy(
    request: AIRequest,
    availableProviders: AIProvider[]
  ): { strategy: StrategyType; reason: string; config: StrategyConfig } {
    const providerCount = availableProviders.length;
    // const promptLength = request.prompt.length;
    const complexity = this.estimateComplexity(request.prompt);

    // プロバイダー数が1つの場合
    if (providerCount === 1) {
      return {
        strategy: 'iterative',
        reason: 'Only one provider available - iterative improvement recommended',
        config: {
          primaryProvider: availableProviders[0],
          reviewProviders: [availableProviders[0]],
          maxIterations: 3
        } as IterativeStrategyConfig
      };
    }

    // 複雑度とプロバイダー数に基づく推奨
    if (complexity > 0.7) {
      // 高複雑度: 順次または反復
      if (providerCount >= 3) {
        return {
          strategy: 'sequential',
          reason: 'High complexity task - sequential processing for thorough analysis',
          config: {
            providers: availableProviders.slice(0, 3),
            maxSteps: 3,
            contextPreservation: 'full'
          } as SequentialStrategyConfig
        };
      } else {
        return {
          strategy: 'iterative',
          reason: 'High complexity with limited providers - iterative refinement',
          config: {
            primaryProvider: availableProviders[0],
            reviewProviders: availableProviders.slice(1),
            maxIterations: 4
          } as IterativeStrategyConfig
        };
      }
    }

    if (complexity > 0.4) {
      // 中複雑度: 合意形成
      return {
        strategy: 'consensus',
        reason: 'Medium complexity - consensus building for balanced perspective',
        config: {
          providers: availableProviders.slice(0, Math.min(4, providerCount)),
          consensusThreshold: 0.7,
          maxRounds: 2
        } as ConsensusStrategyConfig
      };
    }

    // 低複雑度: 並列実行
    return {
      strategy: 'parallel',
      reason: 'Straightforward task - parallel execution for speed and diversity',
      config: {
        providers: availableProviders,
        aggregationMethod: 'best',
        failureThreshold: 0.5
      } as ParallelStrategyConfig
    };
  }

  validateStrategyConfig(strategy: StrategyType, config: StrategyConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    switch (strategy) {
      case 'parallel':
        errors.push(...this.validateParallelConfig(config as ParallelStrategyConfig));
        break;
      
      case 'sequential':
        errors.push(...this.validateSequentialConfig(config as SequentialStrategyConfig));
        break;
      
      case 'consensus':
        errors.push(...this.validateConsensusConfig(config as ConsensusStrategyConfig));
        break;
      
      case 'iterative':
        errors.push(...this.validateIterativeConfig(config as IterativeStrategyConfig));
        break;
      
      default:
        errors.push(`Unknown strategy: ${strategy}`);
    }

    const result: { valid: boolean; errors?: string[] } = {
      valid: errors.length === 0
    };
    
    if (errors.length > 0) {
      result.errors = errors;
    }
    
    return result;
  }

  private validateParallelConfig(config: ParallelStrategyConfig): string[] {
    const errors: string[] = [];
    
    if (!config.providers || config.providers.length === 0) {
      errors.push('Parallel strategy requires at least one provider');
    }

    if (config.failureThreshold !== undefined && 
        (config.failureThreshold < 0 || config.failureThreshold > 1)) {
      errors.push('Failure threshold must be between 0 and 1');
    }

    if (config.timeout !== undefined && config.timeout < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    return errors;
  }

  private validateSequentialConfig(config: SequentialStrategyConfig): string[] {
    const errors: string[] = [];
    
    if (!config.providers || config.providers.length === 0) {
      errors.push('Sequential strategy requires at least one provider');
    }

    if (config.maxSteps !== undefined && config.maxSteps < 1) {
      errors.push('Max steps must be at least 1');
    }

    if (config.stopConditions?.maxTokens !== undefined && 
        config.stopConditions.maxTokens < 100) {
      errors.push('Max tokens must be at least 100');
    }

    return errors;
  }

  private validateConsensusConfig(config: ConsensusStrategyConfig): string[] {
    const errors: string[] = [];
    
    if (!config.providers || config.providers.length < 2) {
      errors.push('Consensus strategy requires at least 2 providers');
    }

    if (config.consensusThreshold !== undefined && 
        (config.consensusThreshold < 0 || config.consensusThreshold > 1)) {
      errors.push('Consensus threshold must be between 0 and 1');
    }

    if (config.maxRounds !== undefined && config.maxRounds < 1) {
      errors.push('Max rounds must be at least 1');
    }

    if (config.expertProvider && 
        (!config.providers || !config.providers.includes(config.expertProvider))) {
      errors.push('Expert provider must be included in the providers list');
    }

    return errors;
  }

  private validateIterativeConfig(config: IterativeStrategyConfig): string[] {
    const errors: string[] = [];
    
    if (!config.primaryProvider) {
      errors.push('Iterative strategy requires a primary provider');
    }

    if (!config.reviewProviders || config.reviewProviders.length === 0) {
      errors.push('Iterative strategy requires at least one review provider');
    }

    if (config.maxIterations !== undefined && config.maxIterations < 1) {
      errors.push('Max iterations must be at least 1');
    }

    if (config.improvementThreshold !== undefined && 
        (config.improvementThreshold < 0 || config.improvementThreshold > 1)) {
      errors.push('Improvement threshold must be between 0 and 1');
    }

    return errors;
  }

  private estimateComplexity(prompt: string): number {
    let complexity = 0;

    // 文字数による基本複雑度
    complexity += Math.min(prompt.length / 1000, 0.3);

    // 技術的キーワード
    const technicalKeywords = [
      'algorithm', 'implement', 'code', 'function', 'class', 'method',
      'analyze', 'calculate', 'optimize', 'design', 'architecture'
    ];
    const technicalCount = technicalKeywords.filter(keyword => 
      prompt.toLowerCase().includes(keyword)
    ).length;
    complexity += Math.min(technicalCount * 0.1, 0.3);

    // 複雑な思考を要求するキーワード
    const complexThinkingKeywords = [
      'compare', 'contrast', 'evaluate', 'synthesize', 'critique',
      'justify', 'reasoning', 'logic', 'proof', 'theorem'
    ];
    const thinkingCount = complexThinkingKeywords.filter(keyword => 
      prompt.toLowerCase().includes(keyword)
    ).length;
    complexity += Math.min(thinkingCount * 0.15, 0.4);

    // 複数の要求
    const questionMarks = (prompt.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      complexity += 0.2;
    }

    // リスト要求
    if (prompt.toLowerCase().includes('list') || prompt.includes('1.') || prompt.includes('a)')) {
      complexity += 0.1;
    }

    return Math.min(complexity, 1);
  }

  // ユーティリティメソッド
  getStrategyInfo(strategy: StrategyType): {
    name: string;
    description: string;
    bestFor: string[];
    requirements: {
      minProviders: number;
      maxProviders?: number;
      complexity: 'low' | 'medium' | 'high' | 'any';
    };
  } {
    const strategyInfo = {
      parallel: {
        name: 'Parallel Strategy',
        description: 'Execute multiple providers simultaneously and aggregate results',
        bestFor: ['Fast responses', 'Diverse perspectives', 'Simple tasks'],
        requirements: { minProviders: 1, complexity: 'low' as const }
      },
      sequential: {
        name: 'Sequential Strategy',
        description: 'Execute providers in sequence, building upon previous results',
        bestFor: ['Complex analysis', 'Step-by-step reasoning', 'Iterative refinement'],
        requirements: { minProviders: 2, complexity: 'medium' as const }
      },
      consensus: {
        name: 'Consensus Strategy',
        description: 'Build consensus among multiple providers through voting',
        bestFor: ['Controversial topics', 'Decision making', 'Balanced perspectives'],
        requirements: { minProviders: 2, maxProviders: 5, complexity: 'medium' as const }
      },
      iterative: {
        name: 'Iterative Strategy',
        description: 'Iteratively improve responses through review and refinement',
        bestFor: ['High quality output', 'Complex problems', 'Detailed analysis'],
        requirements: { minProviders: 1, complexity: 'high' as const }
      }
    };

    return strategyInfo[strategy];
  }

  async getStrategyPerformanceMetrics(): Promise<Record<StrategyType, {
    averageExecutionTime: number;
    successRate: number;
    avgQualityScore: number;
    usageCount: number;
  }>> {
    // 実際のシステムでは、メトリクス収集システムから取得
    // ここでは仮の値を返す
    return {
      parallel: {
        averageExecutionTime: 5000,
        successRate: 0.95,
        avgQualityScore: 0.75,
        usageCount: 0
      },
      sequential: {
        averageExecutionTime: 15000,
        successRate: 0.90,
        avgQualityScore: 0.85,
        usageCount: 0
      },
      consensus: {
        averageExecutionTime: 12000,
        successRate: 0.88,
        avgQualityScore: 0.82,
        usageCount: 0
      },
      iterative: {
        averageExecutionTime: 25000,
        successRate: 0.92,
        avgQualityScore: 0.90,
        usageCount: 0
      }
    };
  }
}