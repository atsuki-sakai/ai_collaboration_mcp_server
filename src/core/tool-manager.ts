/**
 * Tool Manager - ツール管理クラス
 * T009: MCPツールの管理と統合アクセスを提供
 */

import { injectable, inject } from 'inversify';
import { IProviderManager } from './provider-manager.js';
import { IStrategyManager } from './strategy-manager.js';
import { TYPES } from './types.js';
import { 
  CollaborateTool, 
  CollaborateParams, 
  CollaborateResult 
} from '../tools/collaborate-tool.js';
import { 
  ReviewTool, 
  ReviewParams, 
  ReviewResult 
} from '../tools/review-tool.js';
import { 
  CompareTool, 
  CompareParams, 
  CompareResult 
} from '../tools/compare-tool.js';
import { 
  RefineTool, 
  RefineParams, 
  RefineResult 
} from '../tools/refine-tool.js';

export type ToolName = 'collaborate' | 'review' | 'compare' | 'refine';

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  examples: Array<{ input: unknown; description: string }>;
}

export interface ToolExecutionResult {
  success: boolean;
  tool: ToolName;
  execution_time: number;
  result: CollaborateResult | ReviewResult | CompareResult | RefineResult;
  error?: string;
}

export interface IToolManager {
  /**
   * 利用可能なツール一覧を取得
   */
  getAvailableTools(): ToolName[];

  /**
   * ツール情報を取得
   */
  getToolInfo(toolName: ToolName): ToolInfo;

  /**
   * 全ツールの情報を取得
   */
  getAllToolsInfo(): Record<ToolName, ToolInfo>;

  /**
   * Collaborate ツールを実行
   */
  executeCollaborate(params: CollaborateParams): Promise<ToolExecutionResult>;

  /**
   * Review ツールを実行
   */
  executeReview(params: ReviewParams): Promise<ToolExecutionResult>;

  /**
   * Compare ツールを実行
   */
  executeCompare(params: CompareParams): Promise<ToolExecutionResult>;

  /**
   * Refine ツールを実行
   */
  executeRefine(params: RefineParams): Promise<ToolExecutionResult>;

  /**
   * ツール名による動的実行
   */
  executeTool(
    toolName: ToolName, 
    params: CollaborateParams | ReviewParams | CompareParams | RefineParams
  ): Promise<ToolExecutionResult>;

  /**
   * ツールのヘルスチェック
   */
  healthCheck(): Promise<Record<ToolName, boolean>>;

  /**
   * ツールの使用統計
   */
  getUsageStatistics(): Record<ToolName, {
    total_executions: number;
    success_rate: number;
    average_execution_time: number;
    last_used: string | null;
  }>;
}

@injectable()
export class ToolManager implements IToolManager {
  private collaborateTool: CollaborateTool;
  private reviewTool: ReviewTool;
  private compareTool: CompareTool;
  private refineTool: RefineTool;
  private usageStats: Map<ToolName, {
    executions: number;
    successes: number;
    total_time: number;
    last_used: Date | null;
  }>;

  constructor(
    @inject(TYPES.StrategyManager) private strategyManager: IStrategyManager,
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {
    // ツールの初期化
    this.collaborateTool = new CollaborateTool(this.strategyManager, this.providerManager);
    this.reviewTool = new ReviewTool(this.providerManager);
    this.compareTool = new CompareTool(this.providerManager);
    this.refineTool = new RefineTool(this.providerManager);

    // 統計情報の初期化
    this.usageStats = new Map();
    this.initializeStats();
  }

  private initializeStats(): void {
    const tools: ToolName[] = ['collaborate', 'review', 'compare', 'refine'];
    tools.forEach(tool => {
      this.usageStats.set(tool, {
        executions: 0,
        successes: 0,
        total_time: 0,
        last_used: null
      });
    });
  }

  getAvailableTools(): ToolName[] {
    return ['collaborate', 'review', 'compare', 'refine'];
  }

  getToolInfo(toolName: ToolName): ToolInfo {
    switch (toolName) {
      case 'collaborate':
        return this.collaborateTool.getToolInfo();
      case 'review':
        return this.reviewTool.getToolInfo();
      case 'compare':
        return this.compareTool.getToolInfo();
      case 'refine':
        return this.refineTool.getToolInfo();
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  getAllToolsInfo(): Record<ToolName, ToolInfo> {
    const tools = this.getAvailableTools();
    const toolsInfo: Record<ToolName, ToolInfo> = {} as Record<ToolName, ToolInfo>;
    
    tools.forEach(tool => {
      toolsInfo[tool] = this.getToolInfo(tool);
    });
    
    return toolsInfo;
  }

  async executeCollaborate(params: CollaborateParams): Promise<ToolExecutionResult> {
    return this.executeWithStats('collaborate', async () => {
      return await this.collaborateTool.execute(params);
    });
  }

  async executeReview(params: ReviewParams): Promise<ToolExecutionResult> {
    return this.executeWithStats('review', async () => {
      return await this.reviewTool.execute(params);
    });
  }

  async executeCompare(params: CompareParams): Promise<ToolExecutionResult> {
    return this.executeWithStats('compare', async () => {
      return await this.compareTool.execute(params);
    });
  }

  async executeRefine(params: RefineParams): Promise<ToolExecutionResult> {
    return this.executeWithStats('refine', async () => {
      return await this.refineTool.execute(params);
    });
  }

  async executeTool(
    toolName: ToolName,
    params: CollaborateParams | ReviewParams | CompareParams | RefineParams
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'collaborate':
        return this.executeCollaborate(params as CollaborateParams);
      case 'review':
        return this.executeReview(params as ReviewParams);
      case 'compare':
        return this.executeCompare(params as CompareParams);
      case 'refine':
        return this.executeRefine(params as RefineParams);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async executeWithStats<T extends { success: boolean }>(
    toolName: ToolName,
    executor: () => Promise<T>
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const stats = this.usageStats.get(toolName)!;

    try {
      const result = await executor();
      const executionTime = Date.now() - startTime;

      // 統計の更新
      stats.executions++;
      stats.total_time += executionTime;
      stats.last_used = new Date();
      
      if (result.success) {
        stats.successes++;
      }

      const executionResult: ToolExecutionResult = {
        success: result.success,
        tool: toolName,
        execution_time: executionTime,
        result: result as unknown as CollaborateResult | ReviewResult | CompareResult | RefineResult
      };

      const errorField = (result as unknown as { error?: string }).error;
      if (errorField) {
        executionResult.error = errorField;
      }

      return executionResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 統計の更新（失敗）
      stats.executions++;
      stats.total_time += executionTime;
      stats.last_used = new Date();

      return {
        success: false,
        tool: toolName,
        execution_time: executionTime,
        result: this.createErrorResult(toolName, errorMessage),
        error: errorMessage
      };
    }
  }

  private createErrorResult(toolName: ToolName, errorMessage: string): CollaborateResult | ReviewResult | CompareResult | RefineResult {
    const baseErrorResult = {
      success: false,
      error: errorMessage
    };

    switch (toolName) {
      case 'collaborate':
        return {
          ...baseErrorResult,
          collaboration_id: `error-${Date.now()}`,
          strategy_used: 'parallel' as const,
          providers_used: [],
          final_answer: '',
          confidence_score: 0,
          execution_time: 0,
          token_usage: { total_tokens: 0 }
        };

      case 'review':
        return {
          ...baseErrorResult,
          review_id: `error-${Date.now()}`,
          content_analyzed: {
            word_count: 0,
            estimated_reading_time: 0,
            content_type: 'unknown',
            complexity_score: 0
          },
          overall_assessment: {
            overall_score: 0,
            overall_rating: 'poor' as const,
            summary: 'Review failed due to error',
            key_strengths: [],
            key_weaknesses: []
          },
          detailed_reviews: [],
          aggregated_metrics: {
            clarity: 0,
            accuracy: 0,
            completeness: 0,
            coherence: 0,
            engagement: 0,
            bias_score: 100,
            readability: 0
          },
          recommendations: {
            priority_actions: [],
            optional_improvements: []
          }
        };

      case 'compare':
        return {
          ...baseErrorResult,
          comparison_id: `error-${Date.now()}`,
          items_compared: [],
          comparison_summary: {
            top_performers: [],
            key_differentiators: [],
            consensus_level: 0,
            overall_insights: []
          },
          detailed_analysis: {
            dimension_scores: {}
          },
          individual_assessments: [],
          recommendations: {}
        };

      case 'refine':
        return {
          ...baseErrorResult,
          refinement_id: `error-${Date.now()}`,
          original_analysis: {
            word_count: 0,
            readability_score: 0,
            complexity_score: 0,
            quality_assessment: {},
            identified_issues: []
          },
          refinement_process: {
            iterations_completed: 0,
            convergence_achieved: false,
            total_processing_time: 0,
            improvement_trajectory: []
          },
          final_content: '',
          improvements_made: {
            summary: 'Refinement failed due to error',
            detailed_changes: [],
            quality_improvements: {}
          },
          recommendations: {
            further_improvements: [],
            maintenance_suggestions: [],
            usage_guidelines: []
          }
        };

      default:
        throw new Error(`Unknown tool for error result creation: ${toolName}`);
    }
  }

  async healthCheck(): Promise<Record<ToolName, boolean>> {
    const tools = this.getAvailableTools();
    const healthStatus: Record<ToolName, boolean> = {} as Record<ToolName, boolean>;

    for (const tool of tools) {
      try {
        // 簡単なパラメータでテスト実行
        await this.performHealthCheckForTool(tool);
        healthStatus[tool] = true;
      } catch (error) {
        healthStatus[tool] = false;
      }
    }

    return healthStatus;
  }

  private async performHealthCheckForTool(toolName: ToolName): Promise<void> {
    // 各ツールの基本的な検証を実行
    switch (toolName) {
      case 'collaborate':
        // 依存関係の確認
        if (!this.strategyManager || !this.providerManager) {
          throw new Error('Missing dependencies for collaborate tool');
        }
        break;

      case 'review':
      case 'compare':
      case 'refine':
        // ProviderManagerの確認
        if (!this.providerManager) {
          throw new Error(`Missing ProviderManager for ${toolName} tool`);
        }
        break;

      default:
        throw new Error(`Unknown tool for health check: ${toolName}`);
    }
  }

  getUsageStatistics(): Record<ToolName, {
    total_executions: number;
    success_rate: number;
    average_execution_time: number;
    last_used: string | null;
  }> {
    const statistics: Record<ToolName, {
      total_executions: number;
      success_rate: number;
      average_execution_time: number;
      last_used: string | null;
    }> = {} as Record<ToolName, {
      total_executions: number;
      success_rate: number;
      average_execution_time: number;
      last_used: string | null;
    }>;

    this.usageStats.forEach((stats, toolName) => {
      statistics[toolName] = {
        total_executions: stats.executions,
        success_rate: stats.executions > 0 ? stats.successes / stats.executions : 0,
        average_execution_time: stats.executions > 0 ? stats.total_time / stats.executions : 0,
        last_used: stats.last_used ? stats.last_used.toISOString() : null
      };
    });

    return statistics;
  }

  /**
   * 統計情報をリセット
   */
  resetStatistics(): void {
    this.initializeStats();
  }

  /**
   * 特定のツールの統計情報をリセット
   */
  resetToolStatistics(toolName: ToolName): void {
    if (this.usageStats.has(toolName)) {
      this.usageStats.set(toolName, {
        executions: 0,
        successes: 0,
        total_time: 0,
        last_used: null
      });
    }
  }

  /**
   * ツールの詳細情報を文字列で取得（デバッグ用）
   */
  getDebugInfo(): string {
    const tools = this.getAvailableTools();
    const stats = this.getUsageStatistics();
    
    let debugInfo = 'Tool Manager Debug Info:\n';
    debugInfo += `Available tools: ${tools.join(', ')}\n\n`;
    
    tools.forEach(tool => {
      const toolStats = stats[tool];
      debugInfo += `${tool}:\n`;
      debugInfo += `  Executions: ${toolStats.total_executions}\n`;
      debugInfo += `  Success rate: ${(toolStats.success_rate * 100).toFixed(1)}%\n`;
      debugInfo += `  Avg execution time: ${toolStats.average_execution_time.toFixed(0)}ms\n`;
      debugInfo += `  Last used: ${toolStats.last_used || 'Never'}\n\n`;
    });
    
    return debugInfo;
  }
}