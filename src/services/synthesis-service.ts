/**
 * Synthesis Service - 統合サービス実装
 * T010: 複数のAI応答を統合・要約するサービス
 */

import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { AIProvider } from '../types/common.js';
import { AIResponse } from '../types/interfaces.js';
import { IProviderManager } from '../core/provider-manager.js';
import { IMetricsCollector } from '../types/interfaces.js';
import { TYPES } from '../core/types.js';

export interface SynthesisParams {
  responses: AIResponse[];
  synthesis_method?: 'consensus' | 'weighted_merge' | 'best_of' | 'comprehensive' | 'extractive' | 'abstractive';
  quality_weights?: {
    accuracy?: number;
    completeness?: number;
    clarity?: number;
    novelty?: number;
    relevance?: number;
  };
  synthesis_criteria?: {
    preserve_original_insights?: boolean;
    highlight_disagreements?: boolean;
    include_confidence_scores?: boolean;
    max_length?: number;
    target_audience?: 'technical' | 'business' | 'general';
    output_format?: 'summary' | 'detailed' | 'structured' | 'narrative';
  };
  custom_instructions?: string;
  synthesizer_provider?: AIProvider;
}

export interface SynthesisResult {
  success: boolean;
  synthesis_id: string;
  input_analysis: {
    total_responses: number;
    response_providers: AIProvider[];
    content_lengths: { provider: AIProvider; length: number }[];
    quality_scores: { provider: AIProvider; score: number }[];
    similarity_matrix: number[][];
    key_themes: string[];
  };
  synthesis_process: {
    method_used: string;
    processing_steps: string[];
    conflicts_resolved: number;
    consensus_level: number;
    total_processing_time: number;
  };
  synthesized_content: {
    main_content: string;
    key_points: string[];
    supporting_evidence?: string[];
    areas_of_agreement?: string[];
    areas_of_disagreement?: string[];
    confidence_assessment?: {
      overall_confidence: number;
      high_confidence_points: string[];
      low_confidence_points: string[];
    };
    source_attribution?: Array<{
      point: string;
      sources: AIProvider[];
    }>;
  };
  quality_metrics: {
    coherence_score: number;
    completeness_score: number;
    novelty_score: number;
    accuracy_estimate: number;
    readability_score: number;
  };
  alternative_syntheses?: Array<{
    method: string;
    content: string;
    quality_score: number;
    characteristics: string[];
  }>;
  recommendations: {
    usage_suggestions: string[];
    further_research?: string[];
    limitations: string[];
  };
  error?: string;
}

export interface ISynthesisService {
  // 基本統合機能
  synthesize(params: SynthesisParams): Promise<SynthesisResult>;
  
  // 特化統合機能
  createConsensus(responses: AIResponse[]): Promise<SynthesisResult>;
  mergeBestElements(responses: AIResponse[], weights?: Record<string, number>): Promise<SynthesisResult>;
  generateComprehensiveSummary(responses: AIResponse[]): Promise<SynthesisResult>;
  
  // 分析機能
  analyzeResponseSimilarity(responses: AIResponse[]): Promise<number[][]>;
  identifyKeyThemes(responses: AIResponse[]): Promise<string[]>;
  assessResponseQuality(response: AIResponse): Promise<number>;
  
  // ユーティリティ
  getRecommendedSynthesisMethod(responses: AIResponse[]): Promise<string>;
  estimateSynthesisComplexity(params: SynthesisParams): Promise<'low' | 'medium' | 'high'>;
}

@injectable()
export class SynthesisService implements ISynthesisService {
  private synthesisPrompts: Record<string, string>;
  private qualityWeights = {
    accuracy: 0.3,
    completeness: 0.25,
    clarity: 0.2,
    novelty: 0.15,
    relevance: 0.1
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager,
    @inject(TYPES.MetricsCollector) private metrics: IMetricsCollector
  ) {
    this.synthesisPrompts = this.initializeSynthesisPrompts();
    this.logger.info('SynthesisService initialized');
  }

  async synthesize(params: SynthesisParams): Promise<SynthesisResult> {
    const synthesisId = `synthesis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      this.metrics.increment('synthesis_requests_total');
      
      // 1. パラメータ検証
      this.validateParams(params);

      // 2. 入力分析
      const inputAnalysis = await this.analyzeInputResponses(params.responses);

      // 3. 統合手法の決定
      const synthesisMethod = params.synthesis_method || await this.getRecommendedSynthesisMethod(params.responses);

      // 4. 統合処理の実行
      const synthesisProcess = await this.executeSynthesis(
        params.responses,
        synthesisMethod,
        params,
        inputAnalysis
      );

      // 5. 品質評価
      const qualityMetrics = await this.evaluateSynthesisQuality(
        synthesisProcess.synthesizedContent,
        params.responses
      );

      // 6. 代替統合の生成（オプション）
      const alternativeSyntheses = await this.generateAlternativeSyntheses(
        params.responses,
        synthesisMethod,
        params
      );

      // 7. 推奨事項の生成
      const recommendations = this.generateRecommendations(
        synthesisProcess.synthesizedContent,
        qualityMetrics,
        inputAnalysis
      );

      const processingTime = Date.now() - startTime;
      this.metrics.timing('synthesis_duration_ms', processingTime);

      return {
        success: true,
        synthesis_id: synthesisId,
        input_analysis: inputAnalysis,
        synthesis_process: {
          method_used: synthesisMethod,
          processing_steps: synthesisProcess.steps,
          conflicts_resolved: synthesisProcess.conflictsResolved,
          consensus_level: synthesisProcess.consensusLevel,
          total_processing_time: processingTime
        },
        synthesized_content: synthesisProcess.synthesizedContent,
        quality_metrics: qualityMetrics,
        ...(alternativeSyntheses && alternativeSyntheses.length > 0 ? { alternative_syntheses: alternativeSyntheses } : {}),
        recommendations
      };

    } catch (error) {
      this.metrics.increment('synthesis_errors_total');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Synthesis failed', error instanceof Error ? error : new Error(String(error)), { synthesisId });

      return {
        success: false,
        synthesis_id: synthesisId,
        input_analysis: {
          total_responses: params.responses.length,
          response_providers: [],
          content_lengths: [],
          quality_scores: [],
          similarity_matrix: [],
          key_themes: []
        },
        synthesis_process: {
          method_used: 'none',
          processing_steps: [],
          conflicts_resolved: 0,
          consensus_level: 0,
          total_processing_time: Date.now() - startTime
        },
        synthesized_content: {
          main_content: '',
          key_points: []
        },
        quality_metrics: {
          coherence_score: 0,
          completeness_score: 0,
          novelty_score: 0,
          accuracy_estimate: 0,
          readability_score: 0
        },
        recommendations: {
          usage_suggestions: [],
          limitations: ['Synthesis failed due to error']
        },
        error: errorMessage
      };
    }
  }

  async createConsensus(responses: AIResponse[]): Promise<SynthesisResult> {
    return this.synthesize({
      responses,
      synthesis_method: 'consensus',
      synthesis_criteria: {
        highlight_disagreements: true,
        include_confidence_scores: true
      }
    });
  }

  async mergeBestElements(responses: AIResponse[], weights?: Record<string, number>): Promise<SynthesisResult> {
    return this.synthesize({
      responses,
      synthesis_method: 'weighted_merge',
      quality_weights: weights ? { ...this.qualityWeights, ...weights } : this.qualityWeights
    });
  }

  async generateComprehensiveSummary(responses: AIResponse[]): Promise<SynthesisResult> {
    return this.synthesize({
      responses,
      synthesis_method: 'comprehensive',
      synthesis_criteria: {
        preserve_original_insights: true,
        output_format: 'structured'
      }
    });
  }

  private validateParams(params: SynthesisParams): void {
    if (!params.responses || params.responses.length === 0) {
      throw new Error('At least one response is required for synthesis');
    }

    if (params.responses.length > 20) {
      throw new Error('Too many responses for synthesis (max 20)');
    }

    // 応答の基本検証
    params.responses.forEach((response, index) => {
      if (!response.content || response.content.trim().length === 0) {
        throw new Error(`Response ${index + 1} has no content`);
      }
      if (response.content.length > 50000) {
        throw new Error(`Response ${index + 1} is too long (max 50,000 characters)`);
      }
    });

    // プロバイダーの検証
    if (params.synthesizer_provider) {
      const availableProviders = this.providerManager.getAvailableProviders();
      if (!availableProviders.includes(params.synthesizer_provider)) {
        throw new Error(`Invalid synthesizer provider: ${params.synthesizer_provider}`);
      }
    }
  }

  private async analyzeInputResponses(responses: AIResponse[]): Promise<SynthesisResult['input_analysis']> {
    const providers = responses.map(r => r.provider);
    const contentLengths = responses.map(r => ({
      provider: r.provider,
      length: r.content.length
    }));

    // 品質スコアの計算
    const qualityScores = await Promise.all(
      responses.map(async response => ({
        provider: response.provider,
        score: await this.assessResponseQuality(response)
      }))
    );

    // 類似度行列の計算
    const similarityMatrix = await this.analyzeResponseSimilarity(responses);

    // 主要テーマの特定
    const keyThemes = await this.identifyKeyThemes(responses);

    this.logger.debug('Input analysis completed', {
      totalResponses: responses.length,
      avgQuality: qualityScores.reduce((sum, qs) => sum + qs.score, 0) / qualityScores.length,
      themesIdentified: keyThemes.length
    });

    return {
      total_responses: responses.length,
      response_providers: providers,
      content_lengths: contentLengths,
      quality_scores: qualityScores,
      similarity_matrix: similarityMatrix,
      key_themes: keyThemes
    };
  }

  private async executeSynthesis(
    responses: AIResponse[],
    method: string,
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis']
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    const steps: string[] = [];
    // let conflictsResolved = 0;
    // let consensusLevel = 0;

    steps.push(`Starting ${method} synthesis`);

    switch (method) {
      case 'consensus':
        return this.executeConsensusSynthesis(responses, params, inputAnalysis, steps);
      case 'weighted_merge':
        return this.executeWeightedMergeSynthesis(responses, params, inputAnalysis, steps);
      case 'best_of':
        return this.executeBestOfSynthesis(responses, params, inputAnalysis, steps);
      case 'comprehensive':
        return this.executeComprehensiveSynthesis(responses, params, inputAnalysis, steps);
      case 'extractive':
        return this.executeExtractiveSynthesis(responses, params, inputAnalysis, steps);
      case 'abstractive':
        return this.executeAbstractiveSynthesis(responses, params, inputAnalysis, steps);
      default:
        throw new Error(`Unknown synthesis method: ${method}`);
    }
  }

  private async executeConsensusSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Identifying areas of agreement');
    
    // 合意点の特定
    const areasOfAgreement = this.findCommonPoints(responses);
    const areasOfDisagreement = this.findConflictingPoints(responses);
    
    steps.push('Building consensus content');
    
    // 合意ベースのコンテンツ生成
    const consensusPrompt = this.buildConsensusPrompt(responses, areasOfAgreement, areasOfDisagreement, params);
    const synthesisProvider = params.synthesizer_provider || this.selectBestSynthesizer(inputAnalysis);
    
    const synthesisResponse = await this.providerManager.executeRequest(synthesisProvider, {
      id: `consensus-synthesis-${Date.now()}`,
      prompt: consensusPrompt
    });

    const keyPoints = this.extractKeyPoints(synthesisResponse.content);
    const confidenceAssessment = this.assessConfidence(responses, areasOfAgreement, areasOfDisagreement);
    
    steps.push('Consensus synthesis completed');

    return {
      synthesizedContent: {
        main_content: synthesisResponse.content,
        key_points: keyPoints,
        ...(areasOfAgreement.length > 0 ? { areas_of_agreement: areasOfAgreement } : {}),
        ...(areasOfDisagreement.length > 0 ? { areas_of_disagreement: areasOfDisagreement } : {}),
        ...(confidenceAssessment ? { confidence_assessment: confidenceAssessment } : {}),
        source_attribution: this.createSourceAttribution(keyPoints, responses)
      },
      steps,
      conflictsResolved: areasOfDisagreement.length,
      consensusLevel: areasOfAgreement.length / (areasOfAgreement.length + areasOfDisagreement.length)
    };
  }

  private async executeWeightedMergeSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Calculating response weights');
    
    // 品質ベースの重み付け
    const weights = this.calculateResponseWeights(inputAnalysis.quality_scores, params.quality_weights);
    
    steps.push('Merging weighted content');
    
    const mergePrompt = this.buildWeightedMergePrompt(responses, weights, params);
    const synthesisProvider = params.synthesizer_provider || this.selectBestSynthesizer(inputAnalysis);
    
    const synthesisResponse = await this.providerManager.executeRequest(synthesisProvider, {
      id: `weighted-merge-${Date.now()}`,
      prompt: mergePrompt
    });

    const keyPoints = this.extractKeyPoints(synthesisResponse.content);
    
    steps.push('Weighted merge completed');

    return {
      synthesizedContent: {
        main_content: synthesisResponse.content,
        key_points: keyPoints,
        source_attribution: this.createSourceAttribution(keyPoints, responses)
      },
      steps,
      conflictsResolved: 0,
      consensusLevel: 0.8 // Weighted merging generally maintains high coherence
    };
  }

  private async executeBestOfSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Selecting best response elements');
    
    // 最高品質のレスポンスを特定
    const bestResponse = inputAnalysis.quality_scores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    const selectedResponse = responses.find(r => r.provider === bestResponse.provider)!;
    
    steps.push('Enhancing selected content');
    
    // 他のレスポンスから補完要素を抽出
    const complementaryElements = this.extractComplementaryElements(selectedResponse, responses);
    
    const enhancementPrompt = this.buildBestOfPrompt(selectedResponse, complementaryElements, params);
    const synthesisProvider = params.synthesizer_provider || this.selectBestSynthesizer(inputAnalysis);
    
    const synthesisResponse = await this.providerManager.executeRequest(synthesisProvider, {
      id: `best-of-synthesis-${Date.now()}`,
      prompt: enhancementPrompt
    });

    const keyPoints = this.extractKeyPoints(synthesisResponse.content);
    
    steps.push('Best-of synthesis completed');

    return {
      synthesizedContent: {
        main_content: synthesisResponse.content,
        key_points: keyPoints,
        supporting_evidence: complementaryElements,
        source_attribution: this.createSourceAttribution(keyPoints, responses)
      },
      steps,
      conflictsResolved: 0,
      consensusLevel: 0.9 // Best-of maintains high quality
    };
  }

  private async executeComprehensiveSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Creating comprehensive synthesis');
    
    const comprehensivePrompt = this.buildComprehensivePrompt(responses, inputAnalysis, params);
    const synthesisProvider = params.synthesizer_provider || this.selectBestSynthesizer(inputAnalysis);
    
    const synthesisResponse = await this.providerManager.executeRequest(synthesisProvider, {
      id: `comprehensive-synthesis-${Date.now()}`,
      prompt: comprehensivePrompt
    });

    const keyPoints = this.extractKeyPoints(synthesisResponse.content);
    const supportingEvidence = this.extractSupportingEvidence(responses);
    
    steps.push('Comprehensive synthesis completed');

    return {
      synthesizedContent: {
        main_content: synthesisResponse.content,
        key_points: keyPoints,
        supporting_evidence: supportingEvidence,
        source_attribution: this.createSourceAttribution(keyPoints, responses) || undefined
      },
      steps,
      conflictsResolved: 0,
      consensusLevel: 0.7
    };
  }

  private async executeExtractiveSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    _inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Extracting key sentences and phrases');
    
    // 各レスポンスから重要な文章を抽出
    const extractedSentences = this.extractImportantSentences(responses);
    const rankedSentences = this.rankSentencesByImportance(extractedSentences);
    
    steps.push('Combining extracted content');
    
    // 抽出された内容を組み合わせ
    const mainContent = rankedSentences
      .slice(0, params.synthesis_criteria?.max_length ? Math.floor(params.synthesis_criteria.max_length / 100) : 10)
      .join(' ');
    
    const keyPoints = rankedSentences.slice(0, 5);
    
    steps.push('Extractive synthesis completed');

    return {
      synthesizedContent: {
        main_content: mainContent,
        key_points: keyPoints,
        source_attribution: this.createSourceAttribution(keyPoints, responses)
      },
      steps,
      conflictsResolved: 0,
      consensusLevel: 0.6
    };
  }

  private async executeAbstractiveSynthesis(
    responses: AIResponse[],
    params: SynthesisParams,
    inputAnalysis: SynthesisResult['input_analysis'],
    steps: string[]
  ): Promise<{
    synthesizedContent: SynthesisResult['synthesized_content'];
    steps: string[];
    conflictsResolved: number;
    consensusLevel: number;
  }> {
    steps.push('Creating abstractive summary');
    
    const abstractivePrompt = this.buildAbstractivePrompt(responses, inputAnalysis, params);
    const synthesisProvider = params.synthesizer_provider || this.selectBestSynthesizer(inputAnalysis);
    
    const synthesisResponse = await this.providerManager.executeRequest(synthesisProvider, {
      id: `abstractive-synthesis-${Date.now()}`,
      prompt: abstractivePrompt
    });

    const keyPoints = this.extractKeyPoints(synthesisResponse.content);
    
    steps.push('Abstractive synthesis completed');

    return {
      synthesizedContent: {
        main_content: synthesisResponse.content,
        key_points: keyPoints,
        source_attribution: this.createSourceAttribution(keyPoints, responses)
      },
      steps,
      conflictsResolved: 0,
      consensusLevel: 0.5 // Abstractive synthesis can diverge from sources
    };
  }

  async analyzeResponseSimilarity(responses: AIResponse[]): Promise<number[][]> {
    const matrix: number[][] = [];
    
    for (let i = 0; i < responses.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < responses.length; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else {
          matrix[i][j] = this.calculateTextSimilarity(responses[i].content, responses[j].content);
        }
      }
    }
    
    return matrix;
  }

  async identifyKeyThemes(responses: AIResponse[]): Promise<string[]> {
    const allText = responses.map(r => r.content).join(' ');
    const words = allText.toLowerCase().split(/\s+/).filter(word => word.length > 4);
    
    const frequency = new Map<string, number>();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  async assessResponseQuality(response: AIResponse): Promise<number> {
    let score = 0.5; // ベーススコア
    
    // 長さによる評価
    const contentLength = response.content.length;
    if (contentLength > 100 && contentLength < 5000) {
      score += 0.1;
    }
    
    // 構造による評価
    if (response.content.includes('\n') || response.content.includes('•') || response.content.includes('-')) {
      score += 0.1;
    }
    
    // 完了状態による評価
    if (response.finish_reason === 'stop') {
      score += 0.2;
    }
    
    // 使用量による評価（トークン効率）
    if (response.usage && response.usage.total_tokens > 0) {
      const efficiency = contentLength / response.usage.total_tokens;
      if (efficiency > 2) {
        score += 0.1;
      }
    }
    
    return Math.min(1, Math.max(0, score));
  }

  async getRecommendedSynthesisMethod(responses: AIResponse[]): Promise<string> {
    const similarity = await this.analyzeResponseSimilarity(responses);
    const avgSimilarity = similarity.flat().reduce((sum, val) => sum + val, 0) / (similarity.length * similarity.length);
    
    if (responses.length <= 2) {
      return 'weighted_merge';
    } else if (avgSimilarity > 0.8) {
      return 'consensus';
    } else if (avgSimilarity < 0.3) {
      return 'comprehensive';
    } else {
      return 'best_of';
    }
  }

  async estimateSynthesisComplexity(params: SynthesisParams): Promise<'low' | 'medium' | 'high'> {
    const responseCount = params.responses.length;
    const totalLength = params.responses.reduce((sum, r) => sum + r.content.length, 0);
    const avgLength = totalLength / responseCount;
    
    if (responseCount <= 2 && avgLength < 1000) {
      return 'low';
    } else if (responseCount <= 5 && avgLength < 3000) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  // プライベートヘルパーメソッド
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private findCommonPoints(responses: AIResponse[]): string[] {
    // 簡易的な共通点検出
    const sentences = responses.flatMap(r => 
      r.content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20)
    );
    
    const similarSentences: string[] = [];
    const threshold = 0.7;
    
    for (let i = 0; i < sentences.length; i++) {
      let similarCount = 0;
      for (let j = i + 1; j < sentences.length; j++) {
        if (this.calculateTextSimilarity(sentences[i], sentences[j]) > threshold) {
          similarCount++;
        }
      }
      if (similarCount >= responses.length / 2) {
        similarSentences.push(sentences[i]);
      }
    }
    
    return similarSentences.slice(0, 5);
  }

  private findConflictingPoints(responses: AIResponse[]): string[] {
    // 簡易的な対立点検出
    const conflictingWords = ['but', 'however', 'although', 'despite', 'whereas', 'contrary'];
    const conflicts: string[] = [];
    
    responses.forEach(response => {
      const sentences = response.content.split(/[.!?]+/).filter(s => s.length > 20);
      sentences.forEach(sentence => {
        if (conflictingWords.some(word => sentence.toLowerCase().includes(word))) {
          conflicts.push(sentence.trim());
        }
      });
    });
    
    return conflicts.slice(0, 3);
  }

  private extractKeyPoints(content: string): string[] {
    const sentences = content.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 30);
    
    // 重要な文章の特定（簡易版）
    const importantSentences = sentences.filter((sentence: string) => 
      sentence.includes('important') || 
      sentence.includes('key') || 
      sentence.includes('significant') ||
      sentence.includes('crucial') ||
      sentence.includes('主要') ||
      sentence.includes('重要')
    );
    
    return importantSentences.length > 0 ? importantSentences.slice(0, 5) : sentences.slice(0, 3);
  }

  private assessConfidence(
    _responses: AIResponse[], 
    areasOfAgreement: string[], 
    areasOfDisagreement: string[]
  ): SynthesisResult['synthesized_content']['confidence_assessment'] {
    const totalPoints = areasOfAgreement.length + areasOfDisagreement.length;
    const overallConfidence = totalPoints > 0 ? areasOfAgreement.length / totalPoints : 0.5;
    
    return {
      overall_confidence: overallConfidence,
      high_confidence_points: areasOfAgreement.slice(0, 3),
      low_confidence_points: areasOfDisagreement.slice(0, 2)
    };
  }

  private createSourceAttribution(points: string[], responses: AIResponse[]): Array<{point: string; sources: AIProvider[]}> {
    // 簡易的なソース帰属
    return points.map(point => ({
      point,
      sources: responses.map(r => r.provider).slice(0, 2) // 簡易版
    }));
  }

  private calculateResponseWeights(
    qualityScores: { provider: AIProvider; score: number }[],
    _weights?: SynthesisParams['quality_weights']
  ): Record<AIProvider, number> {
    const result: Record<string, number> = {};
    const totalScore = qualityScores.reduce((sum, qs) => sum + qs.score, 0);
    
    qualityScores.forEach(qs => {
      result[qs.provider] = totalScore > 0 ? qs.score / totalScore : 1 / qualityScores.length;
    });
    
    return result;
  }

  private extractComplementaryElements(selectedResponse: AIResponse, allResponses: AIResponse[]): string[] {
    const otherResponses = allResponses.filter(r => r.provider !== selectedResponse.provider);
    const elements: string[] = [];
    
    otherResponses.forEach(response => {
      const sentences = response.content.split(/[.!?]+/).filter(s => s.length > 30);
      const uniqueSentences = sentences.filter(sentence => 
        !this.isContentSimilar(sentence, selectedResponse.content)
      );
      elements.push(...uniqueSentences.slice(0, 2));
    });
    
    return elements.slice(0, 5);
  }

  private isContentSimilar(text1: string, text2: string): boolean {
    return this.calculateTextSimilarity(text1, text2) > 0.6;
  }

  private extractSupportingEvidence(_responses: AIResponse[]): string[] {
    const evidence: string[] = [];
    
    _responses.forEach((response: AIResponse) => {
      const sentences = response.content.split(/[.!?]+/).filter((s: string) => s.length > 20);
      const evidenceSentences = sentences.filter((sentence: string) =>
        sentence.includes('evidence') ||
        sentence.includes('research') ||
        sentence.includes('study') ||
        sentence.includes('data') ||
        sentence.includes('証拠') ||
        sentence.includes('研究')
      );
      evidence.push(...evidenceSentences);
    });
    
    return evidence.slice(0, 5);
  }

  private extractImportantSentences(responses: AIResponse[]): string[] {
    const allSentences: string[] = [];
    
    responses.forEach(response => {
      const sentences = response.content.split(/[.!?]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 30);
      allSentences.push(...sentences);
    });
    
    return allSentences;
  }

  private rankSentencesByImportance(sentences: string[]): string[] {
    // 簡易的な重要度ランキング
    const importanceKeywords = ['important', 'key', 'significant', 'crucial', 'essential', '重要', '主要'];
    
    return sentences.sort((a, b) => {
      const scoreA = importanceKeywords.reduce((score, keyword) => 
        score + (a.toLowerCase().includes(keyword) ? 1 : 0), 0
      );
      const scoreB = importanceKeywords.reduce((score, keyword) => 
        score + (b.toLowerCase().includes(keyword) ? 1 : 0), 0
      );
      return scoreB - scoreA;
    });
  }

  private selectBestSynthesizer(inputAnalysis: SynthesisResult['input_analysis']): AIProvider {
    // 最も高品質なプロバイダーを選択
    const bestProvider = inputAnalysis.quality_scores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    return bestProvider.provider;
  }

  private async evaluateSynthesisQuality(
    synthesizedContent: SynthesisResult['synthesized_content'],
    originalResponses: AIResponse[]
  ): Promise<SynthesisResult['quality_metrics']> {
    const content = synthesizedContent.main_content;
    
    // 一貫性スコア
    const coherenceScore = this.assessCoherence(content);
    
    // 完全性スコア
    const completenessScore = this.assessCompleteness(content, originalResponses);
    
    // 新規性スコア
    const noveltyScore = this.assessNovelty(content, originalResponses);
    
    // 精度推定
    const accuracyEstimate = this.estimateAccuracy(content);
    
    // 可読性スコア
    const readabilityScore = this.assessReadability(content);
    
    return {
      coherence_score: coherenceScore,
      completeness_score: completenessScore,
      novelty_score: noveltyScore,
      accuracy_estimate: accuracyEstimate,
      readability_score: readabilityScore
    };
  }

  private assessCoherence(content: string): number {
    // 簡易的な一貫性評価
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 10);
    let coherenceScore = 0.5;
    
    // 接続詞の使用
    const connectors = ['therefore', 'however', 'furthermore', 'moreover', 'consequently'];
    const hasConnectors = connectors.some(connector => content.toLowerCase().includes(connector));
    if (hasConnectors) coherenceScore += 0.2;
    
    // 文の長さの一貫性
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const lengthVariance = sentences.reduce((sum, s) => sum + Math.pow(s.length - avgLength, 2), 0) / sentences.length;
    if (lengthVariance < avgLength) coherenceScore += 0.2;
    
    return Math.min(1, coherenceScore);
  }

  private assessCompleteness(content: string, originalResponses: AIResponse[]): number {
    const originalTopics = this.extractTopics(originalResponses.map(r => r.content));
    const synthesisTopics = this.extractTopics([content]);
    
    const coveredTopics = originalTopics.filter(topic => 
      synthesisTopics.some(sTopic => this.calculateTextSimilarity(topic, sTopic) > 0.5)
    );
    
    return originalTopics.length > 0 ? coveredTopics.length / originalTopics.length : 0.5;
  }

  private extractTopics(texts: string[]): string[] {
    const allWords = texts.join(' ').toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const frequency = new Map<string, number>();
    
    allWords.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private assessNovelty(content: string, originalResponses: AIResponse[]): number {
    const originalContent = originalResponses.map(r => r.content).join(' ');
    const similarity = this.calculateTextSimilarity(content, originalContent);
    return Math.max(0, 1 - similarity);
  }

  private estimateAccuracy(content: string): number {
    // 簡易的な精度推定
    let accuracy = 0.5;
    
    // 具体的な数値や事実の存在
    const hasNumbers = /\d+/.test(content);
    if (hasNumbers) accuracy += 0.1;
    
    // 不確実性の表現
    const uncertaintyWords = ['might', 'could', 'possibly', 'perhaps', 'maybe'];
    const hasUncertainty = uncertaintyWords.some(word => content.toLowerCase().includes(word));
    if (hasUncertainty) accuracy += 0.1;
    
    // 断言的な表現の適度な使用
    const assertiveWords = ['definitely', 'certainly', 'absolutely', '確実に', '間違いなく'];
    const assertiveCount = assertiveWords.reduce((count, word) => 
      count + (content.toLowerCase().match(new RegExp(word, 'g'))?.length || 0), 0
    );
    if (assertiveCount > 0 && assertiveCount < 5) accuracy += 0.2;
    
    return Math.min(1, accuracy);
  }

  private assessReadability(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    
    // 平均文長
    const avgSentenceLength = words.length / sentences.length;
    let readabilityScore = 0.5;
    
    // 適切な文長
    if (avgSentenceLength > 10 && avgSentenceLength < 25) {
      readabilityScore += 0.3;
    }
    
    // 構造化
    if (content.includes('\n') || content.includes('•') || content.includes('-')) {
      readabilityScore += 0.2;
    }
    
    return Math.min(1, readabilityScore);
  }

  private async generateAlternativeSyntheses(
    _responses: AIResponse[],
    currentMethod: string,
    _params: SynthesisParams
  ): Promise<SynthesisResult['alternative_syntheses']> {
    const alternatives: NonNullable<SynthesisResult['alternative_syntheses']> = [];
    const alternativeMethods = ['consensus', 'weighted_merge', 'best_of'].filter(m => m !== currentMethod);
    
    for (const method of alternativeMethods.slice(0, 2)) {
      try {
        const altParams = { ..._params, synthesis_method: method as any };
        const altResult = await this.synthesize(altParams);
        
        if (altResult.success) {
          alternatives.push({
            method,
            content: altResult.synthesized_content.main_content,
            quality_score: (altResult.quality_metrics.coherence_score + altResult.quality_metrics.completeness_score) / 2,
            characteristics: [`Alternative ${method} synthesis`]
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to generate alternative synthesis with ${method}`, { error });
      }
    }
    
    return alternatives;
  }

  private generateRecommendations(
    synthesizedContent: SynthesisResult['synthesized_content'],
    qualityMetrics: SynthesisResult['quality_metrics'],
    inputAnalysis: SynthesisResult['input_analysis']
  ): SynthesisResult['recommendations'] {
    const usageSuggestions: string[] = [];
    const limitations: string[] = [];
    const furtherResearch: string[] = [];
    
    // 品質に基づく使用提案
    if (qualityMetrics.coherence_score > 0.8) {
      usageSuggestions.push('High coherence - suitable for formal documentation');
    }
    if (qualityMetrics.completeness_score > 0.7) {
      usageSuggestions.push('Comprehensive coverage - good for executive summaries');
    }
    
    // 制限事項の特定
    if (qualityMetrics.accuracy_estimate < 0.6) {
      limitations.push('Accuracy concerns - verify facts before use');
    }
    if (inputAnalysis.total_responses < 3) {
      limitations.push('Limited source diversity - consider additional perspectives');
    }
    
    // さらなる研究の提案
    if (synthesizedContent.areas_of_disagreement && synthesizedContent.areas_of_disagreement.length > 0) {
      furtherResearch.push('Resolve disagreements through additional expert consultation');
    }
    
    return {
      usage_suggestions: usageSuggestions,
      ...(furtherResearch.length > 0 ? { further_research: furtherResearch } : {}),
      limitations
    };
  }

  // プロンプト構築メソッド
  private buildConsensusPrompt(
    responses: AIResponse[],
    areasOfAgreement: string[],
    areasOfDisagreement: string[],
    params: SynthesisParams
  ): string {
    let prompt = this.synthesisPrompts.consensus + '\n\n';
    
    prompt += 'Original responses:\n\n';
    responses.forEach((response, index) => {
      prompt += `Response ${index + 1} (${response.provider}):\n${response.content}\n\n`;
    });
    
    if (areasOfAgreement.length > 0) {
      prompt += 'Areas of agreement:\n';
      areasOfAgreement.forEach(area => prompt += `- ${area}\n`);
      prompt += '\n';
    }
    
    if (areasOfDisagreement.length > 0) {
      prompt += 'Areas of disagreement to address:\n';
      areasOfDisagreement.forEach(area => prompt += `- ${area}\n`);
      prompt += '\n';
    }
    
    if (params.custom_instructions) {
      prompt += `Additional instructions: ${params.custom_instructions}\n\n`;
    }
    
    prompt += 'Please create a consensus synthesis that:\n';
    prompt += '1. Incorporates areas of agreement\n';
    prompt += '2. Addresses disagreements objectively\n';
    prompt += '3. Maintains accuracy and coherence\n';
    prompt += '4. Provides a balanced perspective\n';
    
    return prompt;
  }

  private buildWeightedMergePrompt(responses: AIResponse[], weights: Record<string, number>, params: SynthesisParams): string {
    let prompt = this.synthesisPrompts.weighted_merge + '\n\n';
    
    prompt += 'Responses with quality weights:\n\n';
    responses.forEach((response, index) => {
      const weight = weights[response.provider] || 0;
      prompt += `Response ${index + 1} (${response.provider}, weight: ${weight.toFixed(2)}):\n${response.content}\n\n`;
    });
    
    if (params.custom_instructions) {
      prompt += `Additional instructions: ${params.custom_instructions}\n\n`;
    }
    
    prompt += 'Please merge these responses, giving more weight to higher-quality responses while preserving valuable insights from all sources.\n';
    
    return prompt;
  }

  private buildBestOfPrompt(selectedResponse: AIResponse, complementaryElements: string[], params: SynthesisParams): string {
    let prompt = this.synthesisPrompts.best_of + '\n\n';
    
    prompt += `Best response (${selectedResponse.provider}):\n${selectedResponse.content}\n\n`;
    
    if (complementaryElements.length > 0) {
      prompt += 'Complementary elements to consider:\n';
      complementaryElements.forEach(element => prompt += `- ${element}\n`);
      prompt += '\n';
    }
    
    if (params.custom_instructions) {
      prompt += `Additional instructions: ${params.custom_instructions}\n\n`;
    }
    
    prompt += 'Please enhance the best response by incorporating valuable complementary elements while maintaining its high quality.\n';
    
    return prompt;
  }

  private buildComprehensivePrompt(
    responses: AIResponse[], 
    inputAnalysis: SynthesisResult['input_analysis'], 
    params: SynthesisParams
  ): string {
    let prompt = this.synthesisPrompts.comprehensive + '\n\n';
    
    prompt += 'All responses:\n\n';
    responses.forEach((response, index) => {
      prompt += `Response ${index + 1} (${response.provider}):\n${response.content}\n\n`;
    });
    
    prompt += `Key themes identified: ${inputAnalysis.key_themes.join(', ')}\n\n`;
    
    if (params.custom_instructions) {
      prompt += `Additional instructions: ${params.custom_instructions}\n\n`;
    }
    
    prompt += 'Please create a comprehensive synthesis that covers all important aspects and themes.\n';
    
    return prompt;
  }

  private buildAbstractivePrompt(
    responses: AIResponse[], 
    inputAnalysis: SynthesisResult['input_analysis'], 
    params: SynthesisParams
  ): string {
    let prompt = this.synthesisPrompts.abstractive + '\n\n';
    
    prompt += 'Source responses:\n\n';
    responses.forEach((response, index) => {
      prompt += `Source ${index + 1}:\n${response.content}\n\n`;
    });
    
    prompt += `Key themes: ${inputAnalysis.key_themes.join(', ')}\n\n`;
    
    if (params.custom_instructions) {
      prompt += `Additional instructions: ${params.custom_instructions}\n\n`;
    }
    
    prompt += 'Please create an abstractive summary that synthesizes the key concepts in your own words.\n';
    
    return prompt;
  }

  private initializeSynthesisPrompts(): Record<string, string> {
    return {
      consensus: 'You are tasked with creating a consensus synthesis from multiple AI responses. Focus on finding common ground and addressing discrepancies.',
      
      weighted_merge: 'You are tasked with merging multiple responses based on their quality weights. Higher-weighted responses should have more influence on the final synthesis.',
      
      best_of: 'You are tasked with enhancing the best response with complementary elements from other responses. Maintain the quality of the best response while adding valuable insights.',
      
      comprehensive: 'You are tasked with creating a comprehensive synthesis that covers all important aspects from the provided responses. Ensure completeness and accuracy.',
      
      extractive: 'You are tasked with extracting and combining the most important sentences and phrases from the provided responses.',
      
      abstractive: 'You are tasked with creating an abstractive synthesis that captures the essence of the provided responses in new, concise language.'
    };
  }
}