/**
 * Review Tool - レビューツール実装
 * T009: AIプロバイダーを使ったコンテンツレビュー機能を提供するMCPツール
 */

import { injectable, inject } from 'inversify';
import { 
  AIRequest,
  AIResponse,
  AIProvider
} from '../types/index.js';
import { IProviderManager } from '../core/provider-manager.js';
import { TYPES } from '../core/types.js';

export interface ReviewParams {
  content: string;
  review_type?: 'quality' | 'accuracy' | 'style' | 'completeness' | 'bias' | 'comprehensive';
  criteria?: {
    focus_areas?: string[];
    severity_level?: 'lenient' | 'balanced' | 'strict';
    target_audience?: string;
    domain?: string;
  };
  reviewers?: {
    providers?: AIProvider[];
    expertise_preference?: 'generalist' | 'specialist';
    review_style?: 'constructive' | 'critical' | 'detailed';
  };
  output_format?: 'structured' | 'narrative' | 'checklist' | 'scores';
}

export interface ReviewResult {
  success: boolean;
  review_id: string;
  content_analyzed: {
    word_count: number;
    estimated_reading_time: number;
    content_type: string;
    complexity_score: number;
  };
  overall_assessment: {
    overall_score: number; // 0-100
    overall_rating: 'excellent' | 'good' | 'satisfactory' | 'needs_improvement' | 'poor';
    summary: string;
    key_strengths: string[];
    key_weaknesses: string[];
  };
  detailed_reviews: Array<{
    reviewer: AIProvider;
    review_type: string;
    scores: Record<string, number>; // 0-100 scale
    feedback: {
      positive_aspects: string[];
      areas_for_improvement: string[];
      specific_suggestions: string[];
      critical_issues?: string[];
    };
    confidence: number;
    review_time: number;
  }>;
  aggregated_metrics: {
    clarity: number;
    accuracy: number;
    completeness: number;
    coherence: number;
    engagement: number;
    bias_score: number; // Lower is better
    readability: number;
  };
  recommendations: {
    priority_actions: string[];
    optional_improvements: string[];
    follow_up_reviews?: string[];
  };
  error?: string;
}

@injectable()
export class ReviewTool {
  private reviewPrompts: Record<string, string>;

  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {
    this.reviewPrompts = this.initializeReviewPrompts();
  }

  async execute(params: ReviewParams): Promise<ReviewResult> {
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 1. パラメータの検証
      this.validateParams(params);

      // 2. コンテンツの事前分析
      const contentAnalysis = this.analyzeContent(params.content);

      // 3. レビュー戦略の決定
      const reviewStrategy = this.determineReviewStrategy(params, contentAnalysis);

      // 4. 複数のレビューアーからレビューを取得
      const detailedReviews = await this.conductDetailedReviews(
        params,
        reviewStrategy
      );

      // 5. 全体評価の計算
      const overallAssessment = this.calculateOverallAssessment(
        detailedReviews,
        contentAnalysis
      );

      // 6. メトリクスの集約
      const aggregatedMetrics = this.aggregateMetrics(detailedReviews);

      // 7. 推奨事項の生成
      const recommendations = this.generateRecommendations(
        detailedReviews,
        overallAssessment,
        params
      );

      return {
        success: true,
        review_id: reviewId,
        content_analyzed: contentAnalysis,
        overall_assessment: overallAssessment,
        detailed_reviews: detailedReviews,
        aggregated_metrics: aggregatedMetrics,
        recommendations
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        review_id: reviewId,
        content_analyzed: {
          word_count: 0,
          estimated_reading_time: 0,
          content_type: 'unknown',
          complexity_score: 0
        },
        overall_assessment: {
          overall_score: 0,
          overall_rating: 'poor',
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
        },
        error: errorMessage
      };
    }
  }

  private validateParams(params: ReviewParams): void {
    if (!params.content || params.content.trim().length === 0) {
      throw new Error('Content to review is required and cannot be empty');
    }

    if (params.content.length > 50000) {
      throw new Error('Content is too long (max 50,000 characters)');
    }

    if (params.reviewers?.providers) {
      const availableProviders = this.providerManager.getAvailableProviders();
      const invalidProviders = params.reviewers.providers.filter(p => 
        !availableProviders.includes(p)
      );
      if (invalidProviders.length > 0) {
        throw new Error(`Invalid reviewers: ${invalidProviders.join(', ')}`);
      }
    }
  }

  private analyzeContent(content: string): ReviewResult['content_analyzed'] {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const estimatedReadingTime = Math.ceil(wordCount / 200); // 200 words per minute

    // コンテンツタイプの推定
    const contentType = this.detectContentType(content);

    // 複雑度スコアの計算
    const complexityScore = this.calculateComplexityScore(content, words);

    return {
      word_count: wordCount,
      estimated_reading_time: estimatedReadingTime,
      content_type: contentType,
      complexity_score: complexityScore
    };
  }

  private detectContentType(content: string): string {
    const lowerContent = content.toLowerCase();

    if (content.includes('```') || lowerContent.includes('function') || lowerContent.includes('class')) {
      return 'code';
    }
    if (lowerContent.includes('abstract') || lowerContent.includes('introduction') || lowerContent.includes('methodology')) {
      return 'academic';
    }
    if (lowerContent.includes('requirements') || lowerContent.includes('specification')) {
      return 'technical_documentation';
    }
    if (content.includes('# ') || content.includes('## ')) {
      return 'documentation';
    }
    if (lowerContent.includes('executive summary') || lowerContent.includes('market analysis')) {
      return 'business';
    }

    return 'general_text';
  }

  private calculateComplexityScore(content: string, words: string[]): number {
    let complexity = 0;

    // 語彙の複雑さ
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    complexity += Math.min(avgWordLength / 10, 0.3);

    // 文の長さ
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = words.length / sentences.length;
    complexity += Math.min(avgSentenceLength / 30, 0.3);

    // 技術用語の密度
    const technicalWords = words.filter(word => 
      word.length > 8 || /[A-Z]{2,}/.test(word)
    ).length;
    complexity += Math.min(technicalWords / words.length, 0.4);

    return Math.min(complexity, 1);
  }

  private determineReviewStrategy(
    params: ReviewParams,
    contentAnalysis: ReviewResult['content_analyzed']
  ): {
    reviewTypes: string[];
    providers: AIProvider[];
    reviewApproach: string;
  } {
    const availableProviders = this.providerManager.getAvailableProviders();
    
    // レビュータイプの決定
    let reviewTypes: string[];
    if (params.review_type === 'comprehensive') {
      reviewTypes = ['quality', 'accuracy', 'style', 'completeness'];
    } else {
      reviewTypes = [params.review_type || 'quality'];
    }

    // プロバイダーの選択
    let providers: AIProvider[];
    if (params.reviewers?.providers) {
      providers = params.reviewers.providers;
    } else {
      // コンテンツタイプに基づく自動選択
      providers = this.selectOptimalReviewers(
        contentAnalysis.content_type,
        availableProviders,
        params.reviewers?.expertise_preference || 'generalist'
      );
    }

    // レビューアプローチの決定
    const reviewApproach = this.determineReviewApproach(
      contentAnalysis,
      params.criteria?.severity_level || 'balanced'
    );

    return { reviewTypes, providers, reviewApproach };
  }

  private selectOptimalReviewers(
    contentType: string,
    availableProviders: AIProvider[],
    expertisePreference: string
  ): AIProvider[] {
    const providerStrengths: Record<AIProvider, string[]> = {
      'openai': ['general_text', 'academic', 'code'],
      'anthropic': ['academic', 'business', 'technical_documentation'],
      'deepseek': ['code', 'technical_documentation'],
      'o3': ['academic', 'complex_reasoning'],
      'gemini': ['general_text', 'documentation'],
      'llmstudio': ['general_text', 'code']
    };

    const suitableProviders = availableProviders.filter(provider => {
      const strengths = providerStrengths[provider] || [];
      return strengths.includes(contentType) || strengths.includes('general_text');
    });

    // 専門性の好みに基づく調整
    if (expertisePreference === 'specialist' && suitableProviders.length > 0) {
      return suitableProviders.slice(0, 2);
    }

    return availableProviders.slice(0, Math.min(3, availableProviders.length));
  }

  private determineReviewApproach(
    contentAnalysis: ReviewResult['content_analyzed'],
    severityLevel: string
  ): string {
    if (contentAnalysis.complexity_score > 0.7) {
      return 'detailed_technical';
    }
    if (severityLevel === 'strict') {
      return 'critical_analysis';
    }
    if (severityLevel === 'lenient') {
      return 'constructive_feedback';
    }
    return 'balanced_review';
  }

  private async conductDetailedReviews(
    params: ReviewParams,
    strategy: { reviewTypes: string[]; providers: AIProvider[]; reviewApproach: string }
  ): Promise<ReviewResult['detailed_reviews']> {
    const reviews: ReviewResult['detailed_reviews'] = [];

    for (const provider of strategy.providers) {
      for (const reviewType of strategy.reviewTypes) {
        try {
          const startTime = Date.now();
          
          const reviewPrompt = this.buildReviewPrompt(
            params.content,
            reviewType,
            strategy.reviewApproach,
            params.criteria
          );

          const request: AIRequest = {
            id: `review-${reviewType}-${provider}-${Date.now()}`,
            prompt: reviewPrompt
          };

          const response = await this.providerManager.executeRequest(provider, request);
          const reviewTime = Date.now() - startTime;

          const parsedReview = this.parseReviewResponse(response, reviewType);

          reviews.push({
            reviewer: provider,
            review_type: reviewType,
            scores: parsedReview.scores,
            feedback: parsedReview.feedback,
            confidence: this.calculateReviewerConfidence(response),
            review_time: reviewTime
          });

        } catch (error) {
          console.warn(`Review failed for ${provider} (${reviewType}):`, error);
        }
      }
    }

    return reviews;
  }

  private buildReviewPrompt(
    content: string,
    reviewType: string,
    approach: string,
    criteria?: ReviewParams['criteria']
  ): string {
    const basePrompt = this.reviewPrompts[reviewType] || this.reviewPrompts['quality'];
    
    let prompt = `${basePrompt}\n\nContent to review:\n${content}\n\n`;

    // アプローチに基づく指示
    const approachInstructions = {
      'detailed_technical': 'Please provide a thorough technical analysis with specific examples.',
      'critical_analysis': 'Please be critical and identify all potential issues or weaknesses.',
      'constructive_feedback': 'Please focus on constructive suggestions for improvement.',
      'balanced_review': 'Please provide a balanced review highlighting both strengths and areas for improvement.'
    };

    prompt += `Review approach: ${(approachInstructions as Record<string, string>)[approach] || approachInstructions['balanced_review']}\n\n`;

    // 基準の追加
    if (criteria) {
      if (criteria.focus_areas) {
        prompt += `Focus specifically on: ${criteria.focus_areas.join(', ')}\n`;
      }
      if (criteria.target_audience) {
        prompt += `Target audience: ${criteria.target_audience}\n`;
      }
      if (criteria.domain) {
        prompt += `Domain context: ${criteria.domain}\n`;
      }
    }

    prompt += this.getReviewOutputFormat(reviewType);

    return prompt;
  }

  private getReviewOutputFormat(reviewType: string): string {
    return `
Please structure your review as follows:
1. SCORES (0-100 scale):
   - Clarity: [score]
   - ${this.getTypeSpecificMetrics(reviewType).join('\n   - ')}

2. POSITIVE ASPECTS:
   - [List 2-3 key strengths]

3. AREAS FOR IMPROVEMENT:
   - [List 2-4 specific issues]

4. SPECIFIC SUGGESTIONS:
   - [Provide 2-3 actionable recommendations]

5. CRITICAL ISSUES (if any):
   - [List any major problems]

Be specific and provide examples where possible.`;
  }

  private getTypeSpecificMetrics(reviewType: string): string[] {
    const metrics: Record<string, string[]> = {
      'quality': ['Accuracy: [score]', 'Completeness: [score]', 'Coherence: [score]'],
      'accuracy': ['Factual accuracy: [score]', 'Source reliability: [score]', 'Logical consistency: [score]'],
      'style': ['Writing quality: [score]', 'Tone appropriateness: [score]', 'Readability: [score]'],
      'completeness': ['Coverage: [score]', 'Depth: [score]', 'Missing elements: [score]'],
      'bias': ['Objectivity: [score]', 'Balanced perspective: [score]', 'Inclusive language: [score]']
    };

    return metrics[reviewType] || metrics['quality'];
  }

  private parseReviewResponse(
    response: AIResponse,
    reviewType: string
  ): {
    scores: Record<string, number>;
    feedback: ReviewResult['detailed_reviews'][0]['feedback'];
  } {
    const content = response.content;
    
    // スコアの抽出
    const scores = this.extractScores(content, reviewType);
    
    // フィードバックの抽出
    const feedback = this.extractFeedback(content);

    return { scores, feedback };
  }

  private extractScores(content: string, _reviewType: string): Record<string, number> {
    const scores: Record<string, number> = {};
    // const defaultMetrics = this.getTypeSpecificMetrics(reviewType);
    
    // スコアパターンの正規表現
    const scorePattern = /(\w+(?:\s+\w+)*?):\s*(\d+)/gi;
    const matches = content.matchAll(scorePattern);
    
    for (const match of matches) {
      const metric = match[1].toLowerCase().trim();
      const score = parseInt(match[2]);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        scores[metric] = score;
      }
    }

    // デフォルトスコアの設定（抽出できなかった場合）
    const baseMetrics = ['clarity', 'accuracy', 'completeness', 'coherence'];
    baseMetrics.forEach(metric => {
      if (!(metric in scores)) {
        scores[metric] = 70; // デフォルト値
      }
    });

    return scores;
  }

  private extractFeedback(content: string): ReviewResult['detailed_reviews'][0]['feedback'] {
    // const sections = content.split(/\d+\.\s+/);
    
    const feedback = {
      positive_aspects: this.extractListItems(content, 'POSITIVE ASPECTS'),
      areas_for_improvement: this.extractListItems(content, 'AREAS FOR IMPROVEMENT'),
      specific_suggestions: this.extractListItems(content, 'SPECIFIC SUGGESTIONS'),
      critical_issues: this.extractListItems(content, 'CRITICAL ISSUES')
    };

    // 空の配列は削除
    if (feedback.critical_issues.length === 0) {
      if ('critical_issues' in feedback) {
        delete (feedback as Record<string, unknown>).critical_issues;
      }
    }

    return feedback;
  }

  private extractListItems(content: string, sectionName: string): string[] {
    const sectionRegex = new RegExp(`${sectionName}:([\\s\\S]*?)(?=\\d+\\.|$)`, 'i');
    const match = content.match(sectionRegex);
    
    if (!match) return [];
    
    const sectionContent = match[1];
    const items = sectionContent
      .split(/[-•\n]/)
      .map(item => item.trim())
      .filter(item => item.length > 0 && !item.match(/^\[/))
      .slice(0, 5); // 最大5項目

    return items;
  }

  private calculateReviewerConfidence(response: AIResponse): number {
    let confidence = 0.7; // ベース信頼度

    // 完了状態による調整
    if (response.finish_reason === 'stop') {
      confidence += 0.2;
    }

    // レスポンス品質による調整
    const contentLength = response.content.length;
    if (contentLength > 500 && contentLength < 3000) {
      confidence += 0.1;
    }

    // 構造化の度合い
    const structurePoints = [
      /SCORES?:/i,
      /POSITIVE/i,
      /IMPROVEMENT/i,
      /SUGGESTION/i
    ].filter(pattern => pattern.test(response.content)).length;

    confidence += (structurePoints / 4) * 0.1;

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateOverallAssessment(
    reviews: ReviewResult['detailed_reviews'],
    contentAnalysis: ReviewResult['content_analyzed']
  ): ReviewResult['overall_assessment'] {
    if (reviews.length === 0) {
      return {
        overall_score: 0,
        overall_rating: 'poor',
        summary: 'No reviews available',
        key_strengths: [],
        key_weaknesses: []
      };
    }

    // 全体スコアの計算（重み付き平均）
    const weightedScores = reviews.map(review => {
      const avgScore = Object.values(review.scores).reduce((sum, score) => sum + score, 0) / Object.values(review.scores).length;
      return avgScore * review.confidence;
    });

    const totalWeight = reviews.reduce((sum, review) => sum + review.confidence, 0);
    const overallScore = weightedScores.reduce((sum, score) => sum + score, 0) / totalWeight;

    // 評価レベルの決定
    const overallRating = this.scoreToRating(overallScore);

    // 主要な強みと弱みの集約
    const allStrengths = reviews.flatMap(review => review.feedback.positive_aspects);
    const allWeaknesses = reviews.flatMap(review => review.feedback.areas_for_improvement);

    const keyStrengths = this.consolidateItems(allStrengths).slice(0, 3);
    const keyWeaknesses = this.consolidateItems(allWeaknesses).slice(0, 3);

    // サマリーの生成
    const summary = this.generateOverallSummary(
      overallScore,
      overallRating,
      contentAnalysis,
      reviews.length
    );

    return {
      overall_score: Math.round(overallScore),
      overall_rating: overallRating,
      summary,
      key_strengths: keyStrengths,
      key_weaknesses: keyWeaknesses
    };
  }

  private scoreToRating(score: number): ReviewResult['overall_assessment']['overall_rating'] {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'satisfactory';
    if (score >= 40) return 'needs_improvement';
    return 'poor';
  }

  private consolidateItems(items: string[]): string[] {
    // 類似項目の統合（簡易版）
    const consolidated: string[] = [];
    const used = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      
      const consolidatedItem = items[i];
      used.add(i);

      // 類似項目を探して統合
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue;
        
        if (this.areItemsSimilar(items[i], items[j])) {
          used.add(j);
        }
      }

      consolidated.push(consolidatedItem);
    }

    return consolidated;
  }

  private areItemsSimilar(item1: string, item2: string): boolean {
    const words1 = new Set(item1.toLowerCase().split(/\s+/));
    const words2 = new Set(item2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size > 0.5; // 50%以上の類似度
  }

  private generateOverallSummary(
    score: number,
    rating: string,
    contentAnalysis: ReviewResult['content_analyzed'],
    reviewCount: number
  ): string {
    const complexityDescription = contentAnalysis.complexity_score > 0.7 ? 'complex' : 
                                 contentAnalysis.complexity_score > 0.4 ? 'moderate' : 'straightforward';

    return `This ${complexityDescription} ${contentAnalysis.content_type} content (${contentAnalysis.word_count} words) received a ${rating} rating (${Math.round(score)}/100) based on ${reviewCount} review(s). ${this.getRatingSummary(rating)}`;
  }

  private getRatingSummary(rating: string): string {
    const summaries = {
      'excellent': 'The content demonstrates high quality across all evaluated dimensions.',
      'good': 'The content is well-written with minor areas for improvement.',
      'satisfactory': 'The content meets basic requirements but has notable areas for enhancement.',
      'needs_improvement': 'The content requires significant improvements before publication.',
      'poor': 'The content needs substantial revision across multiple areas.'
    };

    return (summaries as Record<string, string>)[rating] || 'Review completed.';
  }

  private aggregateMetrics(reviews: ReviewResult['detailed_reviews']): ReviewResult['aggregated_metrics'] {
    if (reviews.length === 0) {
      return {
        clarity: 0,
        accuracy: 0,
        completeness: 0,
        coherence: 0,
        engagement: 0,
        bias_score: 100,
        readability: 0
      };
    }

    const metrics = ['clarity', 'accuracy', 'completeness', 'coherence', 'engagement', 'readability'];
    const aggregated: Record<string, number> = {};

    metrics.forEach(metric => {
      const scores = reviews
        .map(review => review.scores[metric])
        .filter(score => score !== undefined);
      
      if (scores.length > 0) {
        aggregated[metric] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      } else {
        aggregated[metric] = 70; // デフォルト値
      }
    });

    // バイアススコアは逆算（低いほど良い）
    const objectivityScores = reviews
      .map(review => review.scores['objectivity'] || review.scores['bias'])
      .filter(score => score !== undefined);
    
    aggregated.bias_score = objectivityScores.length > 0 ? 
      100 - (objectivityScores.reduce((sum, score) => sum + score, 0) / objectivityScores.length) : 50;

    return aggregated as ReviewResult['aggregated_metrics'];
  }

  private generateRecommendations(
    reviews: ReviewResult['detailed_reviews'],
    assessment: ReviewResult['overall_assessment'],
    params: ReviewParams
  ): ReviewResult['recommendations'] {
    const allSuggestions = reviews.flatMap(review => review.feedback.specific_suggestions);
    const allCriticalIssues = reviews.flatMap(review => review.feedback.critical_issues || []);

    // 優先アクションの決定
    const priorityActions: string[] = [];
    
    if (allCriticalIssues.length > 0) {
      priorityActions.push(...allCriticalIssues.slice(0, 2));
    }

    if (assessment.overall_score < 60) {
      priorityActions.push('Conduct comprehensive revision addressing key weaknesses');
    }

    if (priorityActions.length === 0 && allSuggestions.length > 0) {
      priorityActions.push(...allSuggestions.slice(0, 2));
    }

    // オプショナルな改善
    const optionalImprovements = allSuggestions
      .filter(suggestion => !priorityActions.includes(suggestion))
      .slice(0, 3);

    // フォローアップレビューの提案
    const followUpReviews: string[] = [];
    
    if (params.review_type !== 'comprehensive') {
      followUpReviews.push('Consider comprehensive review for complete analysis');
    }

    if (assessment.overall_score < 80) {
      followUpReviews.push('Schedule follow-up review after implementing improvements');
    }

    return {
      priority_actions: this.consolidateItems(priorityActions).slice(0, 3),
      optional_improvements: this.consolidateItems(optionalImprovements),
      ...(followUpReviews.length > 0 ? { follow_up_reviews: followUpReviews } : {})
    };
  }

  private initializeReviewPrompts(): Record<string, string> {
    return {
      quality: `Please conduct a comprehensive quality review of the following content. Evaluate the overall quality, clarity, accuracy, and effectiveness of the content.`,
      
      accuracy: `Please review the following content for factual accuracy and logical consistency. Check for any errors, inconsistencies, or unsupported claims.`,
      
      style: `Please review the writing style, tone, and readability of the following content. Evaluate whether the style is appropriate for the intended audience and purpose.`,
      
      completeness: `Please review the following content for completeness and coverage. Identify any missing information, gaps, or areas that need more detail.`,
      
      bias: `Please review the following content for potential bias, objectivity issues, or lack of balanced perspective. Evaluate the fairness and inclusivity of the content.`,
      
      comprehensive: `Please conduct a thorough, multi-dimensional review of the following content covering quality, accuracy, style, completeness, and potential bias.`
    };
  }

  // ユーティリティメソッド
  getToolInfo(): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    examples: Array<{ input: ReviewParams; description: string }>;
  } {
    return {
      name: 'review',
      description: 'Get comprehensive reviews of content from multiple AI perspectives',
      parameters: {
        content: { type: 'string', required: true, description: 'Content to review' },
        review_type: { type: 'string', enum: ['quality', 'accuracy', 'style', 'completeness', 'bias', 'comprehensive'], description: 'Type of review to conduct' },
        criteria: { type: 'object', description: 'Review criteria and constraints' },
        reviewers: { type: 'object', description: 'Reviewer configuration' },
        output_format: { type: 'string', enum: ['structured', 'narrative', 'checklist', 'scores'], description: 'Format for review output' }
      },
      examples: [
        {
          input: {
            content: 'Article draft about climate change...',
            review_type: 'comprehensive',
            criteria: { 
              focus_areas: ['accuracy', 'bias'], 
              target_audience: 'general public' 
            }
          },
          description: 'Comprehensive review of article with focus on accuracy and bias'
        },
        {
          input: {
            content: 'Technical documentation for API...',
            review_type: 'completeness',
            reviewers: { expertise_preference: 'specialist' }
          },
          description: 'Completeness review by technical specialists'
        }
      ]
    };
  }
}