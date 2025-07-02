/**
 * Consensus Strategy - 合意形成戦略
 * T008: 複数のAIプロバイダーの結果から合意を形成
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

export interface ConsensusStrategyConfig {
  providers: AIProvider[];
  consensusThreshold?: number; // 合意に必要な最小一致率 (0-1)
  maxRounds?: number; // 最大ラウンド数
  votingMethod?: 'majority' | 'weighted' | 'unanimous' | 'ranked';
  conflictResolution?: 'revote' | 'expert' | 'combine' | 'abort';
  expertProvider?: AIProvider; // 対立時の決定者
}

export interface ConsensusRound {
  roundNumber: number;
  responses: Array<{
    provider: AIProvider;
    response: AIResponse;
    vote?: string;
    confidence?: number;
  }>;
  agreement: number;
  consensus: boolean;
  conflictAreas?: string[];
}

export interface VotingResult {
  winner: string;
  votes: Record<string, number>;
  confidence: number;
  agreement: number;
}

@injectable()
export class ConsensusStrategy {
  constructor(
    @inject(TYPES.ProviderManager) private providerManager: IProviderManager
  ) {}

  async execute(
    request: AIRequest,
    config: ConsensusStrategyConfig
  ): Promise<CollaborationResult> {
    const startTime = Date.now();

    try {
      const providers = this.validateProviders(config.providers);
      const maxRounds = config.maxRounds || 3;
      const consensusThreshold = config.consensusThreshold || 0.7;

      const rounds = await this.executeConsensusRounds(
        request,
        providers,
        maxRounds,
        consensusThreshold,
        config
      );

      const finalResult = this.buildFinalConsensus(rounds, request, config);

      const collaborationResult: CollaborationResult = {
        success: true,
        strategy: 'consensus',
        responses: rounds.flatMap(round => round.responses.map(r => r.response)),
        final_result: finalResult,
        metadata: {
          request_id: request.id,
          timestamp: new Date().toISOString() as Timestamp,
          execution_time: Date.now() - startTime,
          providers_used: providers,
          rounds_completed: rounds.length,
          final_agreement: rounds[rounds.length - 1]?.agreement || 0,
          consensus_achieved: rounds.some(round => round.consensus),
          voting_method: config.votingMethod || 'majority',
          consensus_threshold: consensusThreshold
        }
      };

      return collaborationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        strategy: 'consensus',
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
    if (!providers || providers.length < 2) {
      throw new Error('At least two providers must be specified for consensus');
    }

    const availableProviders = this.providerManager.getAvailableProviders();
    const validProviders = providers.filter(provider => 
      availableProviders.includes(provider)
    );

    if (validProviders.length < 2) {
      throw new Error('At least two available providers required for consensus');
    }

    return validProviders;
  }

  private async executeConsensusRounds(
    request: AIRequest,
    providers: AIProvider[],
    maxRounds: number,
    consensusThreshold: number,
    config: ConsensusStrategyConfig
  ): Promise<ConsensusRound[]> {
    const rounds: ConsensusRound[] = [];
    let currentRequest = request;

    for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
      const round = await this.executeRound(
        currentRequest,
        providers,
        roundNumber,
        config
      );

      rounds.push(round);

      // 合意が形成されたら終了
      if (round.consensus && round.agreement >= consensusThreshold) {
        break;
      }

      // 対立がある場合の処理
      if (roundNumber < maxRounds && !round.consensus) {
        currentRequest = this.prepareConflictResolutionRequest(
          request,
          round,
          roundNumber + 1
        );
      }
    }

    return rounds;
  }

  private async executeRound(
    request: AIRequest,
    providers: AIProvider[],
    roundNumber: number,
    config: ConsensusStrategyConfig
  ): Promise<ConsensusRound> {
    const responses: ConsensusRound['responses'] = [];

    // 全プロバイダーから回答を取得
    for (const provider of providers) {
      try {
        const response = await this.providerManager.executeRequest(provider, {
          ...request,
          id: `${request.id}-round-${roundNumber}-${provider}`
        });

        responses.push({
          provider,
          response,
          confidence: this.calculateResponseConfidence(response)
        });
      } catch (error) {
        console.warn(`Provider ${provider} failed in round ${roundNumber}:`, error);
      }
    }

    if (responses.length === 0) {
      throw new Error(`No responses received in round ${roundNumber}`);
    }

    // 投票と合意分析
    const votingResult = this.analyzeConsensus(responses, config.votingMethod || 'majority');
    const agreement = votingResult.agreement;
    const consensusThreshold = config.consensusThreshold || 0.7;

    return {
      roundNumber,
      responses,
      agreement,
      consensus: agreement >= consensusThreshold,
      ...(agreement < consensusThreshold ? { conflictAreas: this.identifyConflictAreas(responses) } : {})
    };
  }

  private analyzeConsensus(
    responses: ConsensusRound['responses'],
    votingMethod: 'majority' | 'weighted' | 'unanimous' | 'ranked'
  ): VotingResult {
    switch (votingMethod) {
      case 'majority':
        return this.majorityVoting(responses);
      case 'weighted':
        return this.weightedVoting(responses);
      case 'unanimous':
        return this.unanimousVoting(responses);
      case 'ranked':
        return this.rankedVoting(responses);
      default:
        return this.majorityVoting(responses);
    }
  }

  private majorityVoting(responses: ConsensusRound['responses']): VotingResult {
    // 応答の類似性に基づくクラスタリング
    const clusters = this.clusterSimilarResponses(responses);
    const votes: Record<string, number> = {};
    
    clusters.forEach((cluster, index) => {
      votes[`cluster_${index}`] = cluster.length;
    });

    const maxVotes = Math.max(...Object.values(votes));
    const winners = Object.entries(votes).filter(([, count]) => count === maxVotes);
    const winner = winners[0][0];
    
    const agreement = maxVotes / responses.length;
    const confidence = this.calculateClusterConfidence(clusters[parseInt(winner.split('_')[1])]);

    return {
      winner,
      votes,
      confidence,
      agreement
    };
  }

  private weightedVoting(responses: ConsensusRound['responses']): VotingResult {
    const clusters = this.clusterSimilarResponses(responses);
    const weightedVotes: Record<string, number> = {};
    
    clusters.forEach((cluster, index) => {
      const totalWeight = cluster.reduce((sum, response) => {
        return sum + (response.confidence || 0.5);
      }, 0);
      weightedVotes[`cluster_${index}`] = totalWeight;
    });

    const maxWeight = Math.max(...Object.values(weightedVotes));
    const winner = Object.entries(weightedVotes).find(([, weight]) => weight === maxWeight)?.[0] || 'cluster_0';
    
    const totalPossibleWeight = responses.length;
    const agreement = maxWeight / totalPossibleWeight;
    const confidence = this.calculateClusterConfidence(clusters[parseInt(winner.split('_')[1])]);

    return {
      winner,
      votes: weightedVotes,
      confidence,
      agreement
    };
  }

  private unanimousVoting(responses: ConsensusRound['responses']): VotingResult {
    const similarity = this.calculateOverallSimilarity(responses);
    const agreement = similarity;
    const winner = agreement > 0.9 ? 'unanimous' : 'no_consensus';
    
    return {
      winner,
      votes: { unanimous: agreement > 0.9 ? responses.length : 0 },
      confidence: agreement,
      agreement
    };
  }

  private rankedVoting(responses: ConsensusRound['responses']): VotingResult {
    // レスポンスを品質でランク付け
    const rankedResponses = responses
      .map(r => ({
        ...r,
        qualityScore: this.calculateResponseQuality(r.response)
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore);

    // 上位応答の類似性を確認
    const topResponses = rankedResponses.slice(0, Math.ceil(responses.length / 2));
    const topSimilarity = this.calculateGroupSimilarity(topResponses);
    
    return {
      winner: 'top_ranked',
      votes: { top_ranked: topResponses.length },
      confidence: topResponses[0]?.qualityScore || 0.5,
      agreement: topSimilarity
    };
  }

  private clusterSimilarResponses(responses: ConsensusRound['responses']): ConsensusRound['responses'][] {
    const clusters: ConsensusRound['responses'][] = [];
    const similarityThreshold = 0.6;

    for (const response of responses) {
      let addedToCluster = false;
      
      for (const cluster of clusters) {
        const similarity = this.calculateSimilarity(
          response.response.content,
          cluster[0].response.content
        );
        
        if (similarity >= similarityThreshold) {
          cluster.push(response);
          addedToCluster = true;
          break;
        }
      }
      
      if (!addedToCluster) {
        clusters.push([response]);
      }
    }

    return clusters;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Jaccard類似度を使用
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private calculateOverallSimilarity(responses: ConsensusRound['responses']): number {
    if (responses.length < 2) return 1.0;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        totalSimilarity += this.calculateSimilarity(
          responses[i].response.content,
          responses[j].response.content
        );
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculateGroupSimilarity(responses: Array<{ response: AIResponse }>): number {
    if (responses.length < 2) return 1.0;
    
    const similarities: number[] = [];
    
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        similarities.push(this.calculateSimilarity(
          responses[i].response.content,
          responses[j].response.content
        ));
      }
    }
    
    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  private calculateClusterConfidence(cluster: ConsensusRound['responses']): number {
    const confidences = cluster.map(r => r.confidence || 0.5);
    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  }

  private calculateResponseConfidence(response: AIResponse): number {
    let confidence = 0.5;
    
    // finish_reasonによる調整
    if (response.finish_reason === 'stop') {
      confidence += 0.2;
    }
    
    // コンテンツ長による調整
    const contentLength = response.content.length;
    if (contentLength > 100 && contentLength < 2000) {
      confidence += 0.1;
    }
    
    // トークン効率による調整
    const efficiency = response.usage.completion_tokens / response.usage.prompt_tokens;
    if (efficiency > 0.2 && efficiency < 2) {
      confidence += 0.1;
    }
    
    return Math.min(1, confidence);
  }

  private calculateResponseQuality(response: AIResponse): number {
    let score = 0;
    
    // 内容の充実度
    const contentLength = response.content.length;
    if (contentLength > 200) score += 0.3;
    
    // 完全性
    if (response.finish_reason === 'stop') score += 0.2;
    
    // 効率性
    const latency = response.latency;
    if (latency < 10000) score += 0.2; // 10秒未満
    
    // トークン使用効率
    const tokenRatio = response.usage.completion_tokens / response.usage.total_tokens;
    if (tokenRatio > 0.3) score += 0.3;
    
    return score;
  }

  private identifyConflictAreas(responses: ConsensusRound['responses']): string[] {
    const conflicts: string[] = [];
    
    // キーワードの分析
    const allKeywords = responses.map(r => 
      this.extractKeywords(r.response.content)
    );
    
    const uniqueKeywords = new Set(allKeywords.flat());
    
    for (const keyword of uniqueKeywords) {
      const mentionCount = allKeywords.filter(keywords => 
        keywords.includes(keyword)
      ).length;
      
      // 半分以上で言及されていないキーワードは対立点の可能性
      if (mentionCount < responses.length / 2 && mentionCount > 0) {
        conflicts.push(keyword);
      }
    }
    
    return conflicts.slice(0, 5); // 上位5つの対立点
  }

  private extractKeywords(text: string): string[] {
    // 簡易的なキーワード抽出
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 4)
      .filter((word, index, array) => array.indexOf(word) === index)
      .slice(0, 20);
  }

  private prepareConflictResolutionRequest(
    originalRequest: AIRequest,
    conflictRound: ConsensusRound,
    nextRound: number
  ): AIRequest {
    const conflictSummary = this.summarizeConflicts(conflictRound);
    
    const resolutionPrompt = `${originalRequest.prompt}

Previous responses showed some disagreement. Here's a summary of the conflict areas:
${conflictSummary}

Please provide a response that addresses these conflicts and aims for a more unified answer.`;

    return {
      ...originalRequest,
      id: `${originalRequest.id}-resolution-${nextRound}`,
      prompt: resolutionPrompt
    };
  }

  private summarizeConflicts(round: ConsensusRound): string {
    const responses = round.responses.map(r => 
      `${r.provider}: ${r.response.content.substring(0, 200)}...`
    );
    
    const conflictAreas = round.conflictAreas?.join(', ') || 'various topics';
    
    return `Disagreement level: ${(1 - round.agreement) * 100}%
Conflict areas: ${conflictAreas}
Different perspectives:
${responses.join('\n')}`;
  }

  private buildFinalConsensus(
    rounds: ConsensusRound[],
    originalRequest: AIRequest,
    config: ConsensusStrategyConfig
  ): AIResponse {
    const lastRound = rounds[rounds.length - 1];
    const finalId = `consensus-final-${Date.now()}`;
    
    let finalContent: string;
    let consensusAchieved = false;

    if (lastRound.consensus) {
      // 合意が形成された場合
      const winningCluster = this.getWinningCluster(lastRound);
      finalContent = this.synthesizeConsensus(winningCluster);
      consensusAchieved = true;
    } else {
      // 合意が形成されなかった場合の対立解決
      finalContent = this.resolveConflict(rounds, config);
    }

    const totalUsage = rounds.flatMap(round => round.responses).reduce(
      (acc, response) => ({
        prompt_tokens: acc.prompt_tokens + response.response.usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + response.response.usage.completion_tokens,
        total_tokens: acc.total_tokens + response.response.usage.total_tokens
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    const baseMetadata: BaseMetadata = {
      request_id: originalRequest.id,
      timestamp: new Date().toISOString() as Timestamp,
      consensus_achieved: consensusAchieved,
      final_agreement: lastRound.agreement,
      rounds_summary: rounds.map(round => ({
        round: round.roundNumber,
        agreement: round.agreement,
        consensus: round.consensus,
        participants: round.responses.length
      }))
    };

    return {
      id: finalId,
      provider: 'consensus_final' as AIProvider,
      model: 'consensus_collaboration',
      content: finalContent,
      usage: totalUsage,
      latency: rounds.reduce((sum, round) => 
        sum + round.responses.reduce((roundSum, r) => roundSum + r.response.latency, 0), 0
      ),
      finish_reason: 'stop',
      metadata: baseMetadata
    };
  }

  private getWinningCluster(round: ConsensusRound): ConsensusRound['responses'] {
    const clusters = this.clusterSimilarResponses(round.responses);
    return clusters.reduce((largest, current) => 
      current.length > largest.length ? current : largest
    );
  }

  private synthesizeConsensus(cluster: ConsensusRound['responses']): string {
    if (cluster.length === 1) {
      return cluster[0].response.content;
    }

    // 複数の類似応答を統合
    const commonElements = this.findCommonElements(cluster);
    const uniqueContributions = this.findUniqueContributions(cluster);

    return `Consensus Summary:
${commonElements}

Additional Perspectives:
${uniqueContributions}

This consensus represents the agreement of ${cluster.length} AI providers.`;
  }

  private findCommonElements(cluster: ConsensusRound['responses']): string {
    // 簡易的な共通要素抽出
    const allTexts = cluster.map(r => r.response.content);
    const sentences = allTexts.flatMap(text => 
      text.split(/[.!?]+/).filter(s => s.trim().length > 10)
    );
    
    // 頻出する文章パターンを探す
    const commonSentences = sentences.filter((sentence, _, array) => {
      const similar = array.filter(s => 
        this.calculateSimilarity(sentence, s) > 0.7
      );
      return similar.length > 1;
    });

    return commonSentences.slice(0, 3).join('. ') + '.';
  }

  private findUniqueContributions(cluster: ConsensusRound['responses']): string {
    return cluster.map((response) => 
      `Provider ${response.provider}: ${response.response.content.substring(0, 150)}...`
    ).join('\n\n');
  }

  private resolveConflict(rounds: ConsensusRound[], config: ConsensusStrategyConfig): string {
    const conflictResolution = config.conflictResolution || 'combine';
    const allResponses = rounds.flatMap(round => round.responses);

    switch (conflictResolution) {
      case 'expert':
        return this.expertResolution(allResponses, config.expertProvider);
      case 'combine':
        return this.combineConflictingResponses(allResponses);
      case 'abort':
        return 'Consensus could not be reached. Significant disagreement persists among providers.';
      default:
        return this.combineConflictingResponses(allResponses);
    }
  }

  private expertResolution(
    responses: ConsensusRound['responses'],
    expertProvider?: AIProvider
  ): string {
    if (expertProvider) {
      const expertResponse = responses.find(r => r.provider === expertProvider);
      if (expertResponse) {
        return `Expert Decision (${expertProvider}):
${expertResponse.response.content}

Note: This decision was made by the designated expert provider to resolve conflicts.`;
      }
    }

    // エキスパートが指定されていない場合、最高品質の応答を選択
    const bestResponse = responses.reduce((best, current) => 
      this.calculateResponseQuality(current.response) > 
      this.calculateResponseQuality(best.response) ? current : best
    );

    return `Best Available Response (${bestResponse.provider}):
${bestResponse.response.content}

Note: Selected based on response quality metrics due to lack of consensus.`;
  }

  private combineConflictingResponses(responses: ConsensusRound['responses']): string {
    const perspectives = responses.map(r => ({
      provider: r.provider,
      content: r.response.content,
      confidence: r.confidence || 0.5
    }));

    const combined = `Multiple Perspectives on the Question:

${perspectives.map((p, index) => 
  `Perspective ${index + 1} (${p.provider}, confidence: ${(p.confidence * 100).toFixed(1)}%):
${p.content}`
).join('\n\n---\n\n')}

Summary: The AI providers offered different perspectives on this question. Consider all viewpoints when making your decision.`;

    return combined;
  }
}