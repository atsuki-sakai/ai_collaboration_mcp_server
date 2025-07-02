/**
 * Refine Tool - 改良ツール実装
 * T009: コンテンツの反復的改善を提供するMCPツール
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest,
  AIResponse,
  AIProvider
} from '../types/index.js';
import { IProviderManager } from '../core/provider-manager.js';
import { TYPES } from '../core/types.js';

export interface RefineParams {
  content: string;
  refinement_goals?: {
    primary_goal?: 'clarity' | 'accuracy' | 'engagement' | 'completeness' | 'conciseness' | 'persuasiveness';
    secondary_goals?: string[];
    target_audience?: string;
    desired_tone?: 'formal' | 'casual' | 'professional' | 'academic' | 'friendly';
    content_type?: 'article' | 'essay' | 'report' | 'email' | 'proposal' | 'documentation';
  };
  refinement_scope?: {
    focus_areas?: string[];
    preserve_areas?: string[];
    maximum_changes?: 'minimal' | 'moderate' | 'extensive';
    length_preference?: 'shorter' | 'maintain' | 'longer';
  };
  refinement_process?: {
    iterations?: number;
    use_multiple_refiners?: boolean;
    require_consensus?: boolean;
    refiners?: AIProvider[];
    feedback_incorporation?: 'automatic' | 'selective' | 'manual_review';
  };
  quality_criteria?: {
    minimum_improvement?: number; // 0-100
    convergence_threshold?: number;
    quality_metrics?: string[];
  };
}

export interface RefineResult {
  success: boolean;
  refinement_id: string;
  original_analysis: {
    word_count: number;
    readability_score: number;
    complexity_score: number;
    quality_assessment: Record<string, number>;
    identified_issues: string[];
  };
  refinement_process: {
    iterations_completed: number;
    convergence_achieved: boolean;
    total_processing_time: number;
    improvement_trajectory: Array<{
      iteration: number;
      quality_score: number;
      changes_made: string[];
      refiner: AIProvider;
    }>;
  };
  final_content: string;
  improvements_made: {
    summary: string;
    detailed_changes: Array<{
      category: string;
      description: string;
      before_excerpt?: string;
      after_excerpt?: string;
      impact_score: number;
    }>;
    quality_improvements: Record<string, {
      before: number;
      after: number;
      improvement: number;
    }>;
  };
  alternative_versions?: Array<{
    version_id: string;
    content: string;
    focus: string;
    quality_score: number;
    description: string;
  }>;
  recommendations: {
    further_improvements?: string[];
    maintenance_suggestions?: string[];
    usage_guidelines?: string[];
  };
  error?: string;
}

@injectable()
export class RefineTool {
  private refinementPrompts: Record<string, string>;

  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {
    this.refinementPrompts = this.initializeRefinementPrompts();
  }

  async execute(params: RefineParams): Promise<RefineResult> {
    const refinementId = `refine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // 1. パラメータの検証と設定
      this.validateParams(params);
      const config = this.setupRefinementConfig(params);

      // 2. 原文の分析
      const originalAnalysis = await this.analyzeOriginalContent(params.content);

      // 3. 改良戦略の決定
      const refinementStrategy = this.determineRefinementStrategy(
        originalAnalysis,
        config
      );

      // 4. 反復的改良プロセス
      const refinementProcess = await this.executeRefinementProcess(
        params.content,
        originalAnalysis,
        refinementStrategy,
        config
      );

      // 5. 最終結果の分析
      const improvementAnalysis = await this.analyzeImprovements(
        params.content,
        refinementProcess.finalContent,
        refinementProcess.improvement_trajectory
      );

      // 6. 代替バージョンの生成（オプション）
      const alternativeVersions = await this.generateAlternativeVersions(
        refinementProcess.finalContent,
        config,
        refinementStrategy
      );

      // 7. 推奨事項の生成
      const recommendations = this.generateRecommendations(
        improvementAnalysis,
        refinementProcess,
        config
      );

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        refinement_id: refinementId,
        original_analysis: originalAnalysis,
        refinement_process: {
          ...refinementProcess,
          total_processing_time: totalTime
        },
        final_content: refinementProcess.finalContent,
        improvements_made: improvementAnalysis,
        ...(alternativeVersions && alternativeVersions.length > 0 ? { alternative_versions: alternativeVersions } : {}),
        recommendations
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        refinement_id: refinementId,
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
          total_processing_time: Date.now() - startTime,
          improvement_trajectory: []
        },
        final_content: params.content,
        improvements_made: {
          summary: 'Refinement failed due to error',
          detailed_changes: [],
          quality_improvements: {}
        },
        recommendations: {
          further_improvements: [],
          maintenance_suggestions: [],
          usage_guidelines: []
        },
        error: errorMessage
      };
    }
  }

  private validateParams(params: RefineParams): void {
    if (!params.content || params.content.trim().length === 0) {
      throw new Error('Content to refine is required and cannot be empty');
    }

    if (params.content.length > 50000) {
      throw new Error('Content is too long (max 50,000 characters)');
    }

    if (params.refinement_process?.refiners) {
      const availableProviders = this.providerManager.getAvailableProviders();
      const invalidProviders = params.refinement_process.refiners.filter(p => 
        !availableProviders.includes(p)
      );
      if (invalidProviders.length > 0) {
        throw new Error(`Invalid refiners: ${invalidProviders.join(', ')}`);
      }
    }

    if (params.quality_criteria?.minimum_improvement && 
        (params.quality_criteria.minimum_improvement < 0 || params.quality_criteria.minimum_improvement > 100)) {
      throw new Error('Minimum improvement must be between 0 and 100');
    }
  }

  private setupRefinementConfig(params: RefineParams) {
    return {
      primaryGoal: params.refinement_goals?.primary_goal || 'clarity',
      secondaryGoals: params.refinement_goals?.secondary_goals || [],
      targetAudience: params.refinement_goals?.target_audience || 'general',
      desiredTone: params.refinement_goals?.desired_tone || 'professional',
      contentType: params.refinement_goals?.content_type || 'article',
      focusAreas: params.refinement_scope?.focus_areas || [],
      preserveAreas: params.refinement_scope?.preserve_areas || [],
      maximumChanges: params.refinement_scope?.maximum_changes || 'moderate',
      lengthPreference: params.refinement_scope?.length_preference || 'maintain',
      maxIterations: params.refinement_process?.iterations || 3,
      useMultipleRefiners: params.refinement_process?.use_multiple_refiners ?? true,
      requireConsensus: params.refinement_process?.require_consensus ?? false,
      refiners: params.refinement_process?.refiners || this.providerManager.getAvailableProviders(),
      feedbackIncorporation: params.refinement_process?.feedback_incorporation || 'automatic',
      minimumImprovement: params.quality_criteria?.minimum_improvement || 10,
      convergenceThreshold: params.quality_criteria?.convergence_threshold || 0.85,
      qualityMetrics: params.quality_criteria?.quality_metrics || ['clarity', 'accuracy', 'engagement']
    };
  }

  private async analyzeOriginalContent(content: string): Promise<RefineResult['original_analysis']> {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;

    // 基本的な分析
    const readabilityScore = this.calculateReadabilityScore(content, words);
    const complexityScore = this.calculateComplexityScore(content, words);

    // 品質評価
    const qualityAssessment = await this.performQualityAssessment(content);

    // 問題の特定
    const identifiedIssues = this.identifyIssues(content, words);

    return {
      word_count: wordCount,
      readability_score: readabilityScore,
      complexity_score: complexityScore,
      quality_assessment: qualityAssessment,
      identified_issues: identifiedIssues
    };
  }

  private calculateReadabilityScore(content: string, words: string[]): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length;

    // 簡易Flesch Reading Ease計算
    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    return Math.max(0, Math.min(100, fleschScore));
  }

  private countSyllables(word: string): number {
    const vowels = word.toLowerCase().match(/[aeiouy]+/g);
    return vowels ? vowels.length : 1;
  }

  private calculateComplexityScore(content: string, words: string[]): number {
    let complexity = 0;

    // 語彙の複雑さ
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    complexity += Math.min(avgWordLength / 10, 0.4);

    // 技術用語の密度
    const technicalWords = words.filter(word => 
      word.length > 8 || /[A-Z]{2,}/.test(word) || /\d+/.test(word)
    ).length;
    complexity += Math.min(technicalWords / words.length, 0.3);

    // 文構造の複雑さ
    const commaCount = (content.match(/,/g) || []).length;
    const semicolonCount = (content.match(/;/g) || []).length;
    complexity += Math.min((commaCount + semicolonCount * 2) / words.length * 10, 0.3);

    return Math.min(complexity, 1);
  }

  private async performQualityAssessment(content: string): Promise<Record<string, number>> {
    // 簡易的な品質評価（実際の実装ではAIプロバイダーを使用）
    const assessment: Record<string, number> = {};
    
    // 基本指標の計算
    assessment.clarity = this.assessClarity(content);
    assessment.accuracy = this.assessAccuracy(content);
    assessment.engagement = this.assessEngagement(content);
    assessment.completeness = this.assessCompleteness(content);
    assessment.conciseness = this.assessConciseness(content);

    return assessment;
  }

  private assessClarity(content: string): number {
    // 明確性の簡易評価
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = content.split(/\s+/).length / sentences.length;
    
    let score = 80; // ベーススコア
    
    if (avgSentenceLength > 25) score -= 15; // 長すぎる文
    if (avgSentenceLength < 8) score -= 10; // 短すぎる文
    
    // 受動態の多用をチェック
    const passiveCount = (content.match(/\b(is|was|were|are|been|being)\s+\w+ed\b/gi) || []).length;
    const passiveRatio = passiveCount / sentences.length;
    if (passiveRatio > 0.3) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  private assessAccuracy(content: string): number {
    // 正確性の簡易評価
    let score = 85; // ベーススコア

    // 曖昧な表現をチェック
    const vagueWords = content.toLowerCase().match(/\b(maybe|perhaps|probably|might|could|some|many|few)\b/g) || [];
    const vagueRatio = vagueWords.length / content.split(/\s+/).length;
    if (vagueRatio > 0.05) score -= 15;

    // 数値や統計の存在をチェック（正確性の指標）
    const hasNumbers = /\d+/.test(content);
    if (hasNumbers) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private assessEngagement(content: string): number {
    let score = 70; // ベーススコア

    // 質問の存在
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount > 0) score += 10;

    // 感嘆符の存在
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 0 && exclamationCount < 5) score += 5;

    // 具体例の存在
    if (content.toLowerCase().includes('for example') || content.toLowerCase().includes('such as')) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private assessCompleteness(content: string): number {
    let score = 75; // ベーススコア

    const wordCount = content.split(/\s+/).length;
    
    if (wordCount < 100) score -= 20; // 短すぎる
    if (wordCount > 2000) score += 10; // 十分な長さ

    // 構造的要素の存在
    if (content.includes('\n') || content.includes('1.') || content.includes('•')) {
      score += 10; // 構造化されている
    }

    return Math.max(0, Math.min(100, score));
  }

  private assessConciseness(content: string): number {
    let score = 80; // ベーススコア

    const words = content.split(/\s+/);
    
    // 冗長な表現をチェック
    const redundantPhrases = [
      'in order to', 'due to the fact that', 'it is important to note that',
      'at this point in time', 'for the purpose of'
    ];
    
    let redundancyCount = 0;
    redundantPhrases.forEach(phrase => {
      redundancyCount += (content.toLowerCase().match(new RegExp(phrase, 'g')) || []).length;
    });
    
    if (redundancyCount > 0) score -= redundancyCount * 5;

    // 文の平均長
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = words.length / sentences.length;
    if (avgWordsPerSentence > 20) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  private identifyIssues(content: string, words: string[]): string[] {
    const issues: string[] = [];

    // 長すぎる文
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const longSentences = sentences.filter(s => s.split(/\s+/).length > 30);
    if (longSentences.length > 0) {
      issues.push(`${longSentences.length} sentence(s) are too long (>30 words)`);
    }

    // 受動態の多用
    const passiveCount = (content.match(/\b(is|was|were|are|been|being)\s+\w+ed\b/gi) || []).length;
    const passiveRatio = passiveCount / sentences.length;
    if (passiveRatio > 0.4) {
      issues.push('Excessive use of passive voice');
    }

    // 語彙の反復
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      const normalized = word.toLowerCase();
      if (normalized.length > 3) {
        wordFreq.set(normalized, (wordFreq.get(normalized) || 0) + 1);
      }
    });

    const repeatedWords = Array.from(wordFreq.entries())
      .filter(([_, count]) => count > words.length * 0.02 && count > 3)
      .map(([word]) => word);
    
    if (repeatedWords.length > 0) {
      issues.push(`Repeated words detected: ${repeatedWords.slice(0, 3).join(', ')}`);
    }

    // 段落の長さ
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const longParagraphs = paragraphs.filter(p => p.split(/\s+/).length > 150);
    if (longParagraphs.length > 0) {
      issues.push(`${longParagraphs.length} paragraph(s) are too long (>150 words)`);
    }

    return issues;
  }

  private determineRefinementStrategy(
    originalAnalysis: RefineResult['original_analysis'],
    config: ReturnType<typeof this.setupRefinementConfig>
  ) {
    const strategy = {
      approach: 'balanced' as 'conservative' | 'balanced' | 'aggressive',
      focus_areas: [] as string[],
      iterations_planned: config.maxIterations,
      providers_to_use: [] as AIProvider[]
    };

    // 品質スコアに基づく戦略調整
    const avgQuality = Object.values(originalAnalysis.quality_assessment).reduce((sum, score) => sum + score, 0) / Object.keys(originalAnalysis.quality_assessment).length;
    
    if (avgQuality < 60) {
      strategy.approach = 'aggressive';
      strategy.iterations_planned = Math.max(config.maxIterations, 4);
    } else if (avgQuality > 80) {
      strategy.approach = 'conservative';
      strategy.iterations_planned = Math.min(config.maxIterations, 2);
    }

    // フォーカスエリアの決定
    strategy.focus_areas = config.focusAreas.length > 0 ? config.focusAreas : this.determineFocusFromAnalysis(originalAnalysis);

    // プロバイダーの選択
    strategy.providers_to_use = config.useMultipleRefiners ? 
      config.refiners.slice(0, 2) : 
      [config.refiners[0]];

    return strategy;
  }

  private determineFocusFromAnalysis(analysis: RefineResult['original_analysis']): string[] {
    const focus: string[] = [];
    
    // 低スコアの品質指標をフォーカスエリアに追加
    Object.entries(analysis.quality_assessment).forEach(([metric, score]) => {
      if (score < 70) {
        focus.push(metric);
      }
    });

    // 読みやすさが低い場合
    if (analysis.readability_score < 60) {
      focus.push('readability');
    }

    // 複雑度が高い場合
    if (analysis.complexity_score > 0.7) {
      focus.push('simplification');
    }

    return focus.length > 0 ? focus : ['clarity', 'engagement'];
  }

  private async executeRefinementProcess(
    originalContent: string,
    originalAnalysis: RefineResult['original_analysis'],
    strategy: ReturnType<typeof this.determineRefinementStrategy>,
    config: ReturnType<typeof this.setupRefinementConfig>
  ) {
    let currentContent = originalContent;
    const trajectory: RefineResult['refinement_process']['improvement_trajectory'] = [];
    let convergenceAchieved = false;

    for (let iteration = 1; iteration <= strategy.iterations_planned; iteration++) {
      // const iterationStart = Date.now();

      for (const provider of strategy.providers_to_use) {
        try {
          const refinementPrompt = this.buildRefinementPrompt(
            currentContent,
            originalAnalysis,
            strategy,
            config,
            iteration
          );

          const request: AIRequest = {
            id: `refine-${iteration}-${provider}-${Date.now()}`,
            prompt: refinementPrompt
          };

          const response = await this.providerManager.executeRequest(provider, request);
          const refinedContent = this.extractRefinedContent(response);

          if (refinedContent && refinedContent !== currentContent) {
            const qualityScore = await this.assessIterationQuality(refinedContent, originalAnalysis);
            const changesMade = this.identifyChanges(currentContent, refinedContent);

            trajectory.push({
              iteration,
              quality_score: qualityScore,
              changes_made: changesMade,
              refiner: provider
            });

            currentContent = refinedContent;

            // 収束チェック
            if (qualityScore >= config.convergenceThreshold * 100) {
              convergenceAchieved = true;
              break;
            }
          }
        } catch (error) {
          console.warn(`Refinement failed for ${provider} at iteration ${iteration}:`, error);
        }
      }

      if (convergenceAchieved) break;
    }

    return {
      finalContent: currentContent,
      improvement_trajectory: trajectory,
      iterations_completed: trajectory.length,
      convergence_achieved: convergenceAchieved
    };
  }

  private buildRefinementPrompt(
    content: string,
    originalAnalysis: RefineResult['original_analysis'],
    strategy: ReturnType<typeof this.determineRefinementStrategy>,
    config: ReturnType<typeof this.setupRefinementConfig>,
    iteration: number
  ): string {
    const basePrompt = this.refinementPrompts[config.primaryGoal] || this.refinementPrompts.clarity;
    
    let prompt = `${basePrompt}\n\nContent to refine:\n${content}\n\n`;

    // 改良目標の明確化
    prompt += `Refinement Goals:\n`;
    prompt += `- Primary goal: ${config.primaryGoal}\n`;
    if (config.secondaryGoals.length > 0) {
      prompt += `- Secondary goals: ${config.secondaryGoals.join(', ')}\n`;
    }
    prompt += `- Target audience: ${config.targetAudience}\n`;
    prompt += `- Desired tone: ${config.desiredTone}\n`;
    prompt += `- Content type: ${config.contentType}\n\n`;

    // フォーカスエリア
    if (strategy.focus_areas.length > 0) {
      prompt += `Focus specifically on improving: ${strategy.focus_areas.join(', ')}\n\n`;
    }

    // 制約条件
    prompt += `Constraints:\n`;
    prompt += `- Maximum changes: ${config.maximumChanges}\n`;
    prompt += `- Length preference: ${config.lengthPreference}\n`;
    if (config.preserveAreas.length > 0) {
      prompt += `- Preserve these areas: ${config.preserveAreas.join(', ')}\n`;
    }

    // 問題の指摘
    if (originalAnalysis.identified_issues.length > 0) {
      prompt += `\nIdentified issues to address:\n`;
      originalAnalysis.identified_issues.forEach(issue => {
        prompt += `- ${issue}\n`;
      });
    }

    // 反復情報
    if (iteration > 1) {
      prompt += `\nThis is iteration ${iteration}. Build upon previous improvements while addressing remaining issues.\n`;
    }

    prompt += `\nPlease provide the refined content maintaining the original meaning while improving the specified aspects.`;

    return prompt;
  }

  private extractRefinedContent(response: AIResponse): string {
    // レスポンスから改良されたコンテンツを抽出
    let content = response.content;

    // 説明文や前置きを除去して、実際のコンテンツのみを抽出
    const patterns = [
      /Here\s+is\s+the\s+refined\s+content:?\s*\n([\s\S]*)/i,
      /Refined\s+content:?\s*\n([\s\S]*)/i,
      /Improved\s+version:?\s*\n([\s\S]*)/i,
      /^[\s\S]*?\n\n([\s\S]*)$/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        content = match[1].trim();
        break;
      }
    }

    return content.trim();
  }

  private async assessIterationQuality(content: string, originalAnalysis: RefineResult['original_analysis']): Promise<number> {
    // 反復の品質を評価
    const newAnalysis = await this.analyzeOriginalContent(content);
    
    const qualityMetrics = ['clarity', 'accuracy', 'engagement', 'completeness', 'conciseness'];
    let totalImprovement = 0;
    let metricCount = 0;

    qualityMetrics.forEach(metric => {
      const originalScore = originalAnalysis.quality_assessment[metric] || 70;
      const newScore = newAnalysis.quality_assessment[metric] || 70;
      
      if (originalScore > 0) {
        totalImprovement += newScore;
        metricCount++;
      }
    });

    return metricCount > 0 ? totalImprovement / metricCount : 70;
  }

  private identifyChanges(before: string, after: string): string[] {
    const changes: string[] = [];

    // 語数の変化
    const beforeWords = before.split(/\s+/).length;
    const afterWords = after.split(/\s+/).length;
    const wordDiff = afterWords - beforeWords;
    
    if (Math.abs(wordDiff) > beforeWords * 0.1) {
      changes.push(wordDiff > 0 ? 'Expanded content' : 'Condensed content');
    }

    // 文の数の変化
    const beforeSentences = before.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const afterSentences = after.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const sentenceDiff = afterSentences - beforeSentences;
    
    if (Math.abs(sentenceDiff) > beforeSentences * 0.2) {
      changes.push(sentenceDiff > 0 ? 'Added sentences' : 'Merged sentences');
    }

    // 段落構造の変化
    const beforeParagraphs = before.split(/\n\s*\n/).length;
    const afterParagraphs = after.split(/\n\s*\n/).length;
    
    if (afterParagraphs !== beforeParagraphs) {
      changes.push('Restructured paragraphs');
    }

    // 語彙の変化（簡易チェック）
    const beforeUniqueWords = new Set(before.toLowerCase().split(/\s+/));
    const afterUniqueWords = new Set(after.toLowerCase().split(/\s+/));
    const vocabulary_change = (afterUniqueWords.size - beforeUniqueWords.size) / beforeUniqueWords.size;
    
    if (Math.abs(vocabulary_change) > 0.15) {
      changes.push(vocabulary_change > 0 ? 'Enhanced vocabulary' : 'Simplified vocabulary');
    }

    return changes.length > 0 ? changes : ['Minor refinements'];
  }

  private async analyzeImprovements(
    original: string,
    refined: string,
    _trajectory: RefineResult['refinement_process']['improvement_trajectory']
  ): Promise<RefineResult['improvements_made']> {
    const originalAnalysis = await this.analyzeOriginalContent(original);
    const refinedAnalysis = await this.analyzeOriginalContent(refined);

    // 品質改善の計算
    const qualityImprovements: Record<string, { before: number; after: number; improvement: number }> = {};
    
    Object.keys(originalAnalysis.quality_assessment).forEach(metric => {
      const before = originalAnalysis.quality_assessment[metric] || 0;
      const after = refinedAnalysis.quality_assessment[metric] || 0;
      const improvement = after - before;
      
      qualityImprovements[metric] = { before, after, improvement };
    });

    // 詳細な変更の分析
    const detailedChanges = this.analyzeDetailedChanges(original, refined);

    // サマリーの生成
    const summary = this.generateImprovementSummary(qualityImprovements, detailedChanges);

    return {
      summary,
      detailed_changes: detailedChanges,
      quality_improvements: qualityImprovements
    };
  }

  private analyzeDetailedChanges(original: string, refined: string): RefineResult['improvements_made']['detailed_changes'] {
    const changes: RefineResult['improvements_made']['detailed_changes'] = [];

    // 文の長さの改善
    const originalSentences = original.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const refinedSentences = refined.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    const originalAvgLength = originalSentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / originalSentences.length;
    const refinedAvgLength = refinedSentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / refinedSentences.length;
    
    if (Math.abs(originalAvgLength - refinedAvgLength) > 2) {
      changes.push({
        category: 'Sentence Structure',
        description: originalAvgLength > refinedAvgLength ? 'Shortened sentences for better readability' : 'Expanded sentences for more detail',
        impact_score: Math.min(Math.abs(originalAvgLength - refinedAvgLength) * 2, 10)
      });
    }

    // 語彙の改善
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const refinedWords = new Set(refined.toLowerCase().split(/\s+/));
    const newWords = new Set([...refinedWords].filter(word => !originalWords.has(word)));
    
    if (newWords.size > originalWords.size * 0.1) {
      changes.push({
        category: 'Vocabulary',
        description: 'Enhanced vocabulary with more precise terms',
        impact_score: Math.min(newWords.size / originalWords.size * 50, 10)
      });
    }

    // 構造の改善
    const originalParagraphs = original.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const refinedParagraphs = refined.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (refinedParagraphs.length !== originalParagraphs.length) {
      changes.push({
        category: 'Structure',
        description: 'Improved content organization and flow',
        impact_score: 8
      });
    }

    return changes;
  }

  private generateImprovementSummary(
    qualityImprovements: Record<string, { before: number; after: number; improvement: number }>,
    detailedChanges: RefineResult['improvements_made']['detailed_changes']
  ): string {
    const totalImprovement = Object.values(qualityImprovements).reduce((sum, imp) => sum + imp.improvement, 0);
    const avgImprovement = totalImprovement / Object.keys(qualityImprovements).length;
    
    let summary = `Content refined with an average quality improvement of ${avgImprovement.toFixed(1)} points. `;
    
    const majorImprovements = Object.entries(qualityImprovements)
      .filter(([_, imp]) => imp.improvement > 5)
      .map(([metric]) => metric);
    
    if (majorImprovements.length > 0) {
      summary += `Significant improvements in: ${majorImprovements.join(', ')}. `;
    }
    
    const changeCategories = [...new Set(detailedChanges.map(change => change.category))];
    if (changeCategories.length > 0) {
      summary += `Key changes: ${changeCategories.join(', ')}.`;
    }
    
    return summary;
  }

  private async generateAlternativeVersions(
    refinedContent: string,
    config: ReturnType<typeof this.setupRefinementConfig>,
    strategy: ReturnType<typeof this.determineRefinementStrategy>
  ): Promise<RefineResult['alternative_versions']> {
    if (!config.useMultipleRefiners || strategy.providers_to_use.length < 2) {
      return undefined;
    }

    const alternatives: RefineResult['alternative_versions'] = [];
    const focusAreas = ['engagement', 'conciseness', 'formality'];

    for (let i = 0; i < Math.min(2, focusAreas.length); i++) {
      try {
        const focus = focusAreas[i];
        const prompt = `Please create an alternative version of the following content with a focus on ${focus}:\n\n${refinedContent}\n\nProvide only the alternative version without explanations.`;
        
        const request: AIRequest = {
          id: `alternative-${focus}-${Date.now()}`,
          prompt
        };

        const provider = strategy.providers_to_use[i % strategy.providers_to_use.length];
        const response = await this.providerManager.executeRequest(provider, request);
        const altContent = this.extractRefinedContent(response);
        
        if (altContent && altContent !== refinedContent) {
          const qualityScore = await this.assessIterationQuality(altContent, await this.analyzeOriginalContent(refinedContent));
          
          alternatives.push({
            version_id: `alt-${focus}-${Date.now()}`,
            content: altContent,
            focus,
            quality_score: qualityScore,
            description: `Alternative version optimized for ${focus}`
          });
        }
      } catch (error) {
        console.warn(`Failed to generate alternative version for ${focusAreas[i]}:`, error);
      }
    }

    return alternatives.length > 0 ? alternatives : undefined;
  }

  private generateRecommendations(
    improvementAnalysis: RefineResult['improvements_made'],
    refinementProcess: Awaited<ReturnType<typeof this.executeRefinementProcess>>,
    config: ReturnType<typeof this.setupRefinementConfig>
  ): RefineResult['recommendations'] {
    const recommendations: RefineResult['recommendations'] = {
      further_improvements: [],
      maintenance_suggestions: [],
      usage_guidelines: []
    };

    // さらなる改善提案
    const avgImprovement = Object.values(improvementAnalysis.quality_improvements)
      .reduce((sum, imp) => sum + imp.improvement, 0) / Object.keys(improvementAnalysis.quality_improvements).length;
    
    if (avgImprovement < config.minimumImprovement) {
      recommendations.further_improvements?.push('Consider more iterations with different focus areas');
    }

    // 低いスコアの指標への提案
    Object.entries(improvementAnalysis.quality_improvements).forEach(([metric, imp]) => {
      if (imp.after < 75) {
        recommendations.further_improvements?.push(`Focus on improving ${metric} (current score: ${imp.after.toFixed(1)})`);
      }
    });

    // メンテナンス提案
    recommendations.maintenance_suggestions?.push('Review content periodically for relevance and accuracy');
    recommendations.maintenance_suggestions?.push('Consider reader feedback for continuous improvement');
    
    if (refinementProcess.iterations_completed > 2) {
      recommendations.maintenance_suggestions?.push('Monitor for over-optimization in future refinements');
    }

    // 使用ガイドライン
    recommendations.usage_guidelines?.push('This refined content is optimized for the specified audience and goals');
    recommendations.usage_guidelines?.push('Consider the context and platform when using this content');
    
    if (improvementAnalysis.detailed_changes.some(change => change.category === 'Vocabulary')) {
      recommendations.usage_guidelines?.push('Verify that enhanced vocabulary aligns with your audience\'s expertise level');
    }

    return recommendations;
  }

  private initializeRefinementPrompts(): Record<string, string> {
    return {
      clarity: `Please refine the following content to improve clarity and readability. Make the text clearer, more direct, and easier to understand while maintaining the original meaning and intent.`,
      
      accuracy: `Please refine the following content to improve factual accuracy and precision. Enhance the reliability of information, eliminate ambiguities, and ensure logical consistency throughout.`,
      
      engagement: `Please refine the following content to make it more engaging and compelling. Enhance reader interest through improved flow, vivid language, and stronger connections with the audience.`,
      
      completeness: `Please refine the following content to improve completeness and thoroughness. Fill in gaps, add necessary details, and ensure all important aspects are adequately covered.`,
      
      conciseness: `Please refine the following content to improve conciseness and efficiency. Remove redundancy, eliminate unnecessary words, and make the text more direct while preserving all important information.`,
      
      persuasiveness: `Please refine the following content to improve persuasiveness and impact. Strengthen arguments, enhance credibility, and make the content more compelling and convincing.`
    };
  }

  // ユーティリティメソッド
  getToolInfo(): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    examples: Array<{ input: RefineParams; description: string }>;
  } {
    return {
      name: 'refine',
      description: 'Iteratively refine and improve content through AI-powered analysis and enhancement',
      parameters: {
        content: { type: 'string', required: true, description: 'Content to refine' },
        refinement_goals: { type: 'object', description: 'Goals and objectives for refinement' },
        refinement_scope: { type: 'object', description: 'Scope and constraints for changes' },
        refinement_process: { type: 'object', description: 'Process configuration and preferences' },
        quality_criteria: { type: 'object', description: 'Quality thresholds and metrics' }
      },
      examples: [
        {
          input: {
            content: 'Draft article about sustainable technology...',
            refinement_goals: {
              primary_goal: 'engagement',
              target_audience: 'general public',
              desired_tone: 'friendly'
            },
            refinement_process: {
              iterations: 3,
              use_multiple_refiners: true
            }
          },
          description: 'Refine article for better engagement with general audience'
        },
        {
          input: {
            content: 'Technical documentation for API...',
            refinement_goals: {
              primary_goal: 'clarity',
              content_type: 'documentation'
            },
            refinement_scope: {
              focus_areas: ['readability', 'completeness'],
              maximum_changes: 'moderate'
            }
          },
          description: 'Improve technical documentation clarity and completeness'
        }
      ]
    };
  }
}