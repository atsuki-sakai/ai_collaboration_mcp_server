/**
 * Compare Tool - 比較ツール実装
 * T009: 複数のコンテンツやアイデアを比較分析するMCPツール
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest,
  AIResponse,
  AIProvider
} from '../types/index.js';
import { IProviderManager } from '../core/provider-manager.js';
import { TYPES } from '../core/types.js';

export interface CompareParams {
  items: Array<{
    id: string;
    title?: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  comparison_type?: 'comprehensive' | 'quality' | 'accuracy' | 'style' | 'effectiveness' | 'similarity';
  criteria?: {
    dimensions?: string[];
    weights?: Record<string, number>;
    focus_areas?: string[];
    scoring_method?: 'absolute' | 'relative' | 'ranking';
  };
  analysis_depth?: 'quick' | 'detailed' | 'exhaustive';
  output_format?: 'matrix' | 'narrative' | 'ranked_list' | 'pros_cons';
  comparers?: {
    providers?: AIProvider[];
    require_consensus?: boolean;
    bias_mitigation?: boolean;
  };
}

export interface CompareResult {
  success: boolean;
  comparison_id: string;
  items_compared: Array<{
    id: string;
    title: string;
    word_count: number;
    complexity_score: number;
  }>;
  comparison_summary: {
    winner?: string;
    top_performers: string[];
    key_differentiators: string[];
    consensus_level: number; // 0-1
    overall_insights: string[];
  };
  detailed_analysis: {
    dimension_scores: Record<string, Record<string, number>>; // dimension -> item_id -> score
    pairwise_comparisons?: Array<{
      item1: string;
      item2: string;
      comparison: string;
      similarity_score: number;
      preference?: string;
    }>;
    clustering?: {
      groups: Array<{
        group_id: string;
        items: string[];
        characteristics: string[];
      }>;
      outliers: string[];
    };
  };
  individual_assessments: Array<{
    comparer: AIProvider;
    analysis_type: string;
    rankings: Array<{
      rank: number;
      item_id: string;
      score: number;
      reasoning: string;
    }>;
    key_observations: string[];
    confidence: number;
  }>;
  recommendations: {
    best_choice?: {
      item_id: string;
      reasoning: string;
      confidence: number;
    };
    context_specific_recommendations?: Array<{
      context: string;
      recommended_item: string;
      reasoning: string;
    }>;
    improvement_suggestions?: Record<string, string[]>; // item_id -> suggestions
  };
  error?: string;
}

@injectable()
export class CompareTool {
  private comparisonPrompts: Record<string, string>;

  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {
    this.comparisonPrompts = this.initializeComparisonPrompts();
  }

  async execute(params: CompareParams): Promise<CompareResult> {
    const comparisonId = `compare-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 1. パラメータの検証
      this.validateParams(params);

      // 2. アイテムの事前分析
      const itemsAnalysis = this.analyzeItems(params.items);

      // 3. 比較戦略の決定
      const comparisonStrategy = this.determineComparisonStrategy(params, itemsAnalysis);

      // 4. 個別の比較分析実行
      const individualAssessments = await this.conductIndividualAssessments(
        params,
        comparisonStrategy
      );

      // 5. 詳細分析の実行
      const detailedAnalysis = await this.performDetailedAnalysis(
        params,
        individualAssessments
      );

      // 6. 比較サマリーの生成
      const comparisonSummary = this.generateComparisonSummary(
        individualAssessments,
        detailedAnalysis,
        params.items
      );

      // 7. 推奨事項の生成
      const recommendations = this.generateRecommendations(
        individualAssessments,
        detailedAnalysis,
        comparisonSummary,
        params
      );

      return {
        success: true,
        comparison_id: comparisonId,
        items_compared: itemsAnalysis,
        comparison_summary: comparisonSummary,
        detailed_analysis: detailedAnalysis,
        individual_assessments: individualAssessments,
        recommendations
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        comparison_id: comparisonId,
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
        recommendations: {},
        error: errorMessage
      };
    }
  }

  private validateParams(params: CompareParams): void {
    if (!params.items || params.items.length < 2) {
      throw new Error('At least 2 items are required for comparison');
    }

    if (params.items.length > 10) {
      throw new Error('Too many items for comparison (max 10)');
    }

    // アイテムの基本検証
    params.items.forEach((item, index) => {
      if (!item.id || !item.content) {
        throw new Error(`Item ${index + 1} must have id and content`);
      }
      if (item.content.length > 20000) {
        throw new Error(`Item ${item.id} content is too long (max 20,000 characters)`);
      }
    });

    // 重複IDチェック
    const ids = params.items.map(item => item.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new Error('All item IDs must be unique');
    }

    // プロバイダーの検証
    if (params.comparers?.providers) {
      const availableProviders = this.providerManager.getAvailableProviders();
      const invalidProviders = params.comparers.providers.filter(p => 
        !availableProviders.includes(p)
      );
      if (invalidProviders.length > 0) {
        throw new Error(`Invalid comparers: ${invalidProviders.join(', ')}`);
      }
    }
  }

  private analyzeItems(items: CompareParams['items']): CompareResult['items_compared'] {
    return items.map(item => {
      const words = item.content.split(/\s+/).filter(word => word.length > 0);
      const complexity = this.calculateComplexity(item.content, words);

      return {
        id: item.id,
        title: item.title || `Item ${item.id}`,
        word_count: words.length,
        complexity_score: complexity
      };
    });
  }

  private calculateComplexity(content: string, words: string[]): number {
    let complexity = 0;

    // 語彙の複雑さ
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    complexity += Math.min(avgWordLength / 8, 0.3);

    // 技術用語の密度
    const technicalWords = words.filter(word => 
      word.length > 6 || /[A-Z]{2,}/.test(word)
    ).length;
    complexity += Math.min(technicalWords / words.length, 0.4);

    // 構造の複雑さ
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = words.length / sentences.length;
    complexity += Math.min(avgSentenceLength / 25, 0.3);

    return Math.min(complexity, 1);
  }

  private determineComparisonStrategy(
    params: CompareParams,
    itemsAnalysis: CompareResult['items_compared']
  ): {
    comparisonType: string;
    dimensions: string[];
    providers: AIProvider[];
    analysisDepth: string;
  } {
    const comparisonType = params.comparison_type || 'comprehensive';
    const analysisDepth = params.analysis_depth || 'detailed';

    // 比較次元の決定
    let dimensions: string[];
    if (params.criteria?.dimensions) {
      dimensions = params.criteria.dimensions;
    } else {
      dimensions = this.getDefaultDimensions(comparisonType);
    }

    // プロバイダーの選択
    const availableProviders = this.providerManager.getAvailableProviders();
    let providers: AIProvider[];
    if (params.comparers?.providers) {
      providers = params.comparers.providers;
    } else {
      // アイテム数と複雑さに基づく自動選択
      const maxComplexity = Math.max(...itemsAnalysis.map(item => item.complexity_score));
      const itemCount = itemsAnalysis.length;
      
      if (maxComplexity > 0.7 || itemCount > 5) {
        providers = availableProviders.slice(0, 3); // より多くのプロバイダー
      } else {
        providers = availableProviders.slice(0, 2);
      }
    }

    return {
      comparisonType,
      dimensions,
      providers,
      analysisDepth
    };
  }

  private getDefaultDimensions(comparisonType: string): string[] {
    const dimensionSets: Record<string, string[]> = {
      comprehensive: ['quality', 'clarity', 'completeness', 'accuracy', 'effectiveness'],
      quality: ['writing_quality', 'structure', 'coherence', 'depth'],
      accuracy: ['factual_accuracy', 'logical_consistency', 'evidence_quality'],
      style: ['writing_style', 'tone', 'readability', 'engagement'],
      effectiveness: ['persuasiveness', 'clarity', 'impact', 'practicality'],
      similarity: ['content_similarity', 'approach_similarity', 'style_similarity']
    };

    return dimensionSets[comparisonType] || dimensionSets.comprehensive;
  }

  private async conductIndividualAssessments(
    params: CompareParams,
    strategy: {
      comparisonType: string;
      dimensions: string[];
      providers: AIProvider[];
      analysisDepth: string;
    }
  ): Promise<CompareResult['individual_assessments']> {
    const assessments: CompareResult['individual_assessments'] = [];

    for (const provider of strategy.providers) {
      try {
        const prompt = this.buildComparisonPrompt(
          params.items,
          strategy.comparisonType,
          strategy.dimensions,
          strategy.analysisDepth,
          params.criteria
        );

        const request: AIRequest = {
          id: `comparison-${provider}-${Date.now()}`,
          prompt
        };

        const response = await this.providerManager.executeRequest(provider, request);
        const parsedAssessment = this.parseAssessmentResponse(response, params.items);

        assessments.push({
          comparer: provider,
          analysis_type: strategy.comparisonType,
          rankings: parsedAssessment.rankings,
          key_observations: parsedAssessment.observations,
          confidence: this.calculateComparerConfidence(response, params.items.length)
        });

      } catch (error) {
        console.warn(`Comparison assessment failed for ${provider}:`, error);
      }
    }

    return assessments;
  }

  private buildComparisonPrompt(
    items: CompareParams['items'],
    comparisonType: string,
    dimensions: string[],
    analysisDepth: string,
    criteria?: CompareParams['criteria']
  ): string {
    const basePrompt = this.comparisonPrompts[comparisonType] || this.comparisonPrompts.comprehensive;
    
    let prompt = `${basePrompt}\n\n`;

    // アイテムの提示
    prompt += 'Items to compare:\n\n';
    items.forEach((item, index) => {
      prompt += `**Item ${index + 1} (ID: ${item.id})**\n`;
      if (item.title) {
        prompt += `Title: ${item.title}\n`;
      }
      prompt += `Content: ${item.content}\n\n`;
    });

    // 比較次元の指定
    prompt += `\nPlease compare these items across the following dimensions:\n`;
    dimensions.forEach(dimension => {
      prompt += `- ${dimension}\n`;
    });

    // 分析の深さ
    const depthInstructions = {
      quick: 'Provide a concise comparison focusing on the most important differences.',
      detailed: 'Provide a thorough analysis with specific examples and detailed reasoning.',
      exhaustive: 'Provide an extremely detailed analysis covering all aspects and nuances.'
    };
    prompt += `\nAnalysis depth: ${(depthInstructions as any)[analysisDepth] || depthInstructions.detailed}\n`;

    // 追加基準
    if (criteria?.focus_areas) {
      prompt += `\nPay special attention to: ${criteria.focus_areas.join(', ')}\n`;
    }

    // 出力フォーマットの指定
    prompt += this.getComparisonOutputFormat(items);

    return prompt;
  }

  private getComparisonOutputFormat(items: CompareParams['items']): string {
    return `
Please structure your comparison as follows:

1. RANKINGS (1 = best, ${items.length} = worst):
${items.map((item, _) => `   Item ${item.id}: Rank [number] (Score: [0-100])`).join('\n')}

2. DIMENSION SCORES (0-100 for each item):
${items.map(item => `   Item ${item.id}: [list scores for each dimension]`).join('\n')}

3. KEY OBSERVATIONS:
   - [3-5 main insights about the comparison]

4. DETAILED REASONING:
   - [Explain your rankings and scores with specific examples]

5. SIMILARITY ANALYSIS (if applicable):
   - [Identify similar items and key differences]

Be specific and provide concrete examples to support your assessments.`;
  }

  private parseAssessmentResponse(
    response: AIResponse,
    items: CompareParams['items']
  ): {
    rankings: CompareResult['individual_assessments'][0]['rankings'];
    observations: string[];
  } {
    const content = response.content;
    
    // ランキングの抽出
    const rankings = this.extractRankings(content, items);
    
    // 主要な観察事項の抽出
    const observations = this.extractObservations(content);

    return { rankings, observations };
  }

  private extractRankings(
    content: string,
    items: CompareParams['items']
  ): CompareResult['individual_assessments'][0]['rankings'] {
    const rankings: CompareResult['individual_assessments'][0]['rankings'] = [];
    
    items.forEach(item => {
      // ランクとスコアの抽出パターン
      const rankPattern = new RegExp(`Item ${item.id}.*?Rank\\s*(\\d+).*?Score[:\\s]*(\\d+)`, 'i');
      const match = content.match(rankPattern);
      
      let rank = 1;
      let score = 70; // デフォルト
      let reasoning = 'No specific reasoning provided';

      if (match) {
        rank = parseInt(match[1]) || 1;
        score = parseInt(match[2]) || 70;
      }

      // 理由の抽出
      const reasoningPattern = new RegExp(`Item ${item.id}.*?reasoning[:\\s]*([^\\n]+)`, 'i');
      const reasoningMatch = content.match(reasoningPattern);
      if (reasoningMatch) {
        reasoning = reasoningMatch[1].trim();
      }

      rankings.push({
        rank,
        item_id: item.id,
        score,
        reasoning
      });
    });

    // ランクでソート
    rankings.sort((a, b) => a.rank - b.rank);

    return rankings;
  }

  private extractObservations(content: string): string[] {
    const observationsPattern = /KEY OBSERVATIONS?:([\s\S]*?)(?=\d+\.|$)/i;
    const match = content.match(observationsPattern);
    
    if (!match) return ['General comparison completed'];
    
    const observationsText = match[1];
    const observations = observationsText
      .split(/[-•\n]/)
      .map(obs => obs.trim())
      .filter(obs => obs.length > 10)
      .slice(0, 5);

    return observations.length > 0 ? observations : ['Comparative analysis provided'];
  }

  private calculateComparerConfidence(response: AIResponse, itemCount: number): number {
    let confidence = 0.6; // ベース信頼度

    // 完了状態
    if (response.finish_reason === 'stop') {
      confidence += 0.2;
    }

    // 構造化の度合い
    const structureElements = [
      /RANKING/i,
      /SCORE/i,
      /OBSERVATION/i,
      /REASONING/i
    ].filter(pattern => pattern.test(response.content)).length;

    confidence += (structureElements / 4) * 0.15;

    // アイテム数への対応
    const itemMentions = response.content.match(/Item\s+\w+/gi)?.length || 0;
    if (itemMentions >= itemCount) {
      confidence += 0.05;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private async performDetailedAnalysis(
    params: CompareParams,
    assessments: CompareResult['individual_assessments']
  ): Promise<CompareResult['detailed_analysis']> {
    // 次元スコアの集約
    const dimensionScores = this.aggregateDimensionScores(assessments, params);

    // ペアワイズ比較（アイテム数が少ない場合）
    let pairwiseComparisons;
    if (params.items.length <= 4) {
      pairwiseComparisons = await this.performPairwiseComparisons(params.items);
    }

    // クラスタリング（アイテム数が多い場合）
    let clustering;
    if (params.items.length >= 4) {
      clustering = this.performClustering(assessments, params.items);
    }

    return {
      dimension_scores: dimensionScores,
      ...(pairwiseComparisons && pairwiseComparisons.length > 0 ? { pairwise_comparisons: pairwiseComparisons } : {}),
      ...(clustering ? { clustering } : {})
    };
  }

  private aggregateDimensionScores(
    assessments: CompareResult['individual_assessments'],
    params: CompareParams
  ): Record<string, Record<string, number>> {
    const dimensionScores: Record<string, Record<string, number>> = {};
    
    // デフォルト次元の設定
    const dimensions = params.criteria?.dimensions || this.getDefaultDimensions(params.comparison_type || 'comprehensive');
    
    dimensions.forEach(dimension => {
      dimensionScores[dimension] = {};
      
      params.items.forEach(item => {
        // 各評価者のスコアの平均
        const scores = assessments
          .map(assessment => {
            const ranking = assessment.rankings.find(r => r.item_id === item.id);
            return ranking ? ranking.score : 70;
          });
        
        dimensionScores[dimension][item.id] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      });
    });

    return dimensionScores;
  }

  private async performPairwiseComparisons(
    items: CompareParams['items']
  ): Promise<CompareResult['detailed_analysis']['pairwise_comparisons']> {
    const comparisons: NonNullable<CompareResult['detailed_analysis']['pairwise_comparisons']> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const item1 = items[i];
        const item2 = items[j];

        // 類似度の計算
        const similarity = this.calculateContentSimilarity(item1.content, item2.content);
        
        // 簡易的な比較説明の生成
        const comparison = this.generatePairComparison(item1, item2, similarity);

        comparisons.push({
          item1: item1.id,
          item2: item2.id,
          comparison,
          similarity_score: similarity
        });
      }
    }

    return comparisons;
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private generatePairComparison(
    item1: CompareParams['items'][0],
    item2: CompareParams['items'][0],
    similarity: number
  ): string {
    const similarityLevel = similarity > 0.7 ? 'very similar' : 
                           similarity > 0.4 ? 'moderately similar' : 'quite different';
    
    return `Items ${item1.id} and ${item2.id} are ${similarityLevel} (similarity: ${(similarity * 100).toFixed(1)}%)`;
  }

  private performClustering(
    assessments: CompareResult['individual_assessments'],
    items: CompareParams['items']
  ): CompareResult['detailed_analysis']['clustering'] {
    // 簡易的なクラスタリング（スコア類似性ベース）
    const groups: Array<{ group_id: string; items: string[]; characteristics: string[] }> = [];
    const used = new Set<string>();
    
    items.forEach((item, index) => {
      if (used.has(item.id)) return;
      
      const group = {
        group_id: `group_${index + 1}`,
        items: [item.id],
        characteristics: [`Representative: ${item.title || item.id}`]
      };
      
      used.add(item.id);
      
      // 類似アイテムを探す
      items.forEach(otherItem => {
        if (used.has(otherItem.id)) return;
        
        const similarity = this.calculateItemSimilarity(item, otherItem, assessments);
        if (similarity > 0.7) {
          group.items.push(otherItem.id);
          used.add(otherItem.id);
        }
      });
      
      groups.push(group);
    });

    // 外れ値の特定（単独グループ）
    const outliers = groups
      .filter(group => group.items.length === 1)
      .map(group => group.items[0]);

    return {
      groups: groups.filter(group => group.items.length > 1),
      outliers
    };
  }

  private calculateItemSimilarity(
    item1: CompareParams['items'][0],
    item2: CompareParams['items'][0],
    assessments: CompareResult['individual_assessments']
  ): number {
    // 評価スコアの類似性
    const scores1 = assessments.map(a => a.rankings.find(r => r.item_id === item1.id)?.score || 70);
    const scores2 = assessments.map(a => a.rankings.find(r => r.item_id === item2.id)?.score || 70);
    
    const scoreDiff = scores1.reduce((sum, score, index) => 
      sum + Math.abs(score - scores2[index]), 0
    ) / scores1.length;
    
    const scoreSimilarity = Math.max(0, 1 - scoreDiff / 50); // 50点差で類似度0
    
    // コンテンツの類似性
    const contentSimilarity = this.calculateContentSimilarity(item1.content, item2.content);
    
    return (scoreSimilarity + contentSimilarity) / 2;
  }

  private generateComparisonSummary(
    assessments: CompareResult['individual_assessments'],
    detailedAnalysis: CompareResult['detailed_analysis'],
    items: CompareParams['items']
  ): CompareResult['comparison_summary'] {
    // 勝者の決定
    const itemScores = new Map<string, number>();
    items.forEach(item => {
      const avgScore = assessments.reduce((sum, assessment) => {
        const ranking = assessment.rankings.find(r => r.item_id === item.id);
        return sum + (ranking?.score || 70);
      }, 0) / assessments.length;
      itemScores.set(item.id, avgScore);
    });

    const sortedItems = Array.from(itemScores.entries()).sort((a, b) => b[1] - a[1]);
    const winner = sortedItems[0]?.[0];
    const topPerformers = sortedItems.slice(0, Math.min(3, sortedItems.length)).map(([id]) => id);

    // 合意レベルの計算
    const consensusLevel = this.calculateConsensusLevel(assessments);

    return {
      winner,
      top_performers: topPerformers,
      key_differentiators: this.identifyKeyDifferentiators(assessments),
      consensus_level: consensusLevel,
      overall_insights: this.generateOverallInsights(assessments, detailedAnalysis, items.length)
    };
  }

  private identifyKeyDifferentiators(
    assessments: CompareResult['individual_assessments']
  ): string[] {
    // const differentiators: string[] = [];
    
    // 各評価者の観察から共通パターンを抽出
    const allObservations = assessments.flatMap(a => a.key_observations);
    
    // 頻出するキーワードやテーマを特定
    const themes = this.extractCommonThemes(allObservations);
    
    return themes.slice(0, 5);
  }

  private extractCommonThemes(observations: string[]): string[] {
    const keywords = observations
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 4);
    
    const frequency = new Map<string, number>();
    keywords.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private calculateConsensusLevel(assessments: CompareResult['individual_assessments']): number {
    if (assessments.length < 2) return 1;
    
    // ランキングの一致度を計算
    let totalAgreement = 0;
    let comparisons = 0;
    
    for (let i = 0; i < assessments.length; i++) {
      for (let j = i + 1; j < assessments.length; j++) {
        const ranking1 = assessments[i].rankings;
        const ranking2 = assessments[j].rankings;
        
        const agreement = this.calculateRankingAgreement(ranking1, ranking2);
        totalAgreement += agreement;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalAgreement / comparisons : 0;
  }

  private calculateRankingAgreement(
    ranking1: CompareResult['individual_assessments'][0]['rankings'],
    ranking2: CompareResult['individual_assessments'][0]['rankings']
  ): number {
    let agreement = 0;
    const totalItems = ranking1.length;
    
    ranking1.forEach(item1 => {
      const item2 = ranking2.find(r => r.item_id === item1.item_id);
      if (item2) {
        const rankDiff = Math.abs(item1.rank - item2.rank);
        const maxDiff = totalItems - 1;
        agreement += 1 - (rankDiff / maxDiff);
      }
    });
    
    return agreement / totalItems;
  }

  private generateOverallInsights(
    assessments: CompareResult['individual_assessments'],
    detailedAnalysis: CompareResult['detailed_analysis'],
    _itemCount: number
  ): string[] {
    const insights: string[] = [];
    
    // 評価者間の一致度に基づく洞察
    const consensus = this.calculateConsensusLevel(assessments);
    if (consensus > 0.8) {
      insights.push('Strong consensus among evaluators on item rankings');
    } else if (consensus < 0.4) {
      insights.push('Significant disagreement among evaluators suggests subjective preferences');
    }
    
    // クラスタリング結果に基づく洞察
    if (detailedAnalysis.clustering) {
      const groups = detailedAnalysis.clustering.groups.length;
      if (groups > 1) {
        insights.push(`Items naturally cluster into ${groups} distinct groups`);
      }
      
      if (detailedAnalysis.clustering.outliers.length > 0) {
        insights.push(`${detailedAnalysis.clustering.outliers.length} item(s) stand out as unique`);
      }
    }
    
    // 類似度に基づく洞察
    if (detailedAnalysis.pairwise_comparisons) {
      const avgSimilarity = detailedAnalysis.pairwise_comparisons.reduce((sum, comp) => 
        sum + comp.similarity_score, 0
      ) / detailedAnalysis.pairwise_comparisons.length;
      
      if (avgSimilarity > 0.7) {
        insights.push('Items are generally quite similar in content and approach');
      } else if (avgSimilarity < 0.3) {
        insights.push('Items represent diverse approaches and perspectives');
      }
    }
    
    return insights;
  }

  private generateRecommendations(
    assessments: CompareResult['individual_assessments'],
    detailedAnalysis: CompareResult['detailed_analysis'],
    summary: CompareResult['comparison_summary'],
    params: CompareParams
  ): CompareResult['recommendations'] {
    const recommendations: CompareResult['recommendations'] = {};

    // 最良選択の推奨
    if (summary.winner && summary.consensus_level > 0.6) {
      const winnerAssessment = assessments[0].rankings.find(r => r.item_id === summary.winner);
      recommendations.best_choice = {
        item_id: summary.winner,
        reasoning: winnerAssessment?.reasoning || 'Highest overall scores across evaluators',
        confidence: summary.consensus_level
      };
    }

    // コンテキスト特有の推奨
    const contextRecommendations = this.generateContextSpecificRecommendations(
      assessments,
      detailedAnalysis
    );
    if (contextRecommendations) {
      recommendations.context_specific_recommendations = contextRecommendations;
    }

    // 改善提案
    recommendations.improvement_suggestions = this.generateImprovementSuggestions(
      assessments,
      params.items
    );

    return recommendations;
  }

  private generateContextSpecificRecommendations(
    assessments: CompareResult['individual_assessments'],
    _detailedAnalysis: CompareResult['detailed_analysis']
  ): CompareResult['recommendations']['context_specific_recommendations'] {
    const recommendations: NonNullable<CompareResult['recommendations']['context_specific_recommendations']> = [];

    // 簡易的なコンテキスト別推奨
    const contexts = ['speed', 'quality', 'innovation', 'cost-effectiveness'];
    
    contexts.forEach(context => {
      // コンテキストに最適なアイテムを決定（簡易版）
      const topRankedItem = assessments[0]?.rankings[0]?.item_id;
      if (topRankedItem) {
        recommendations.push({
          context,
          recommended_item: topRankedItem,
          reasoning: `Best overall performer suitable for ${context} requirements`
        });
      }
    });

    return recommendations;
  }

  private generateImprovementSuggestions(
    assessments: CompareResult['individual_assessments'],
    items: CompareParams['items']
  ): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {};

    items.forEach(item => {
      const itemSuggestions: string[] = [];
      
      // 各評価者からの理由を分析して改善点を抽出
      assessments.forEach(assessment => {
        const ranking = assessment.rankings.find(r => r.item_id === item.id);
        if (ranking && ranking.rank > 1) {
          // 順位が低い場合の改善提案
          if (ranking.reasoning.toLowerCase().includes('clarity')) {
            itemSuggestions.push('Improve clarity and structure');
          }
          if (ranking.reasoning.toLowerCase().includes('detail')) {
            itemSuggestions.push('Add more specific details and examples');
          }
          if (ranking.reasoning.toLowerCase().includes('accuracy')) {
            itemSuggestions.push('Verify factual accuracy and sources');
          }
        }
      });

      // 重複を除去
      suggestions[item.id] = [...new Set(itemSuggestions)];
    });

    return suggestions;
  }

  private initializeComparisonPrompts(): Record<string, string> {
    return {
      comprehensive: `Please conduct a comprehensive comparison of the provided items. Evaluate them across multiple dimensions including quality, accuracy, effectiveness, and overall merit.`,
      
      quality: `Please compare the quality of the provided items. Focus on writing quality, structure, depth, and overall presentation.`,
      
      accuracy: `Please compare the accuracy and reliability of the provided items. Evaluate factual correctness, logical consistency, and evidence quality.`,
      
      style: `Please compare the writing style and presentation of the provided items. Focus on tone, readability, engagement, and appropriateness.`,
      
      effectiveness: `Please compare how effective each item is at achieving its intended purpose. Consider persuasiveness, clarity, and practical value.`,
      
      similarity: `Please analyze the similarities and differences between the provided items. Focus on content overlap, approach similarities, and unique characteristics.`
    };
  }

  // ユーティリティメソッド
  getToolInfo(): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    examples: Array<{ input: CompareParams; description: string }>;
  } {
    return {
      name: 'compare',
      description: 'Compare multiple items using AI analysis across various dimensions',
      parameters: {
        items: { type: 'array', required: true, description: 'Items to compare' },
        comparison_type: { type: 'string', enum: ['comprehensive', 'quality', 'accuracy', 'style', 'effectiveness', 'similarity'], description: 'Type of comparison' },
        criteria: { type: 'object', description: 'Comparison criteria and weights' },
        analysis_depth: { type: 'string', enum: ['quick', 'detailed', 'exhaustive'], description: 'Depth of analysis' },
        output_format: { type: 'string', enum: ['matrix', 'narrative', 'ranked_list', 'pros_cons'], description: 'Output format' },
        comparers: { type: 'object', description: 'Comparer configuration' }
      },
      examples: [
        {
          input: {
            items: [
              { id: 'proposal_a', title: 'Proposal A', content: 'Content of proposal A...' },
              { id: 'proposal_b', title: 'Proposal B', content: 'Content of proposal B...' }
            ],
            comparison_type: 'comprehensive'
          },
          description: 'Comprehensive comparison of two proposals'
        },
        {
          input: {
            items: [
              { id: 'article1', content: 'Article content...' },
              { id: 'article2', content: 'Another article...' },
              { id: 'article3', content: 'Third article...' }
            ],
            comparison_type: 'quality',
            analysis_depth: 'detailed'
          },
          description: 'Detailed quality comparison of three articles'
        }
      ]
    };
  }
}