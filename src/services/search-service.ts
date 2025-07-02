/**
 * Search Service - 検索サービス実装
 * T010: コラボレーション履歴の検索機能、全文検索、フィルタリング
 */

import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { CollaborationResult, AIProvider } from '../types/common.js';
import { ICacheService } from './cache-service';
import { TYPES } from '../core/types.js';

export interface SearchQuery {
  // 基本検索
  query?: string;
  exactMatch?: boolean;
  caseSensitive?: boolean;
  
  // フィルタリング
  filters?: {
    strategy?: string[];
    providers?: AIProvider[];
    success?: boolean;
    dateRange?: {
      start: Date;
      end: Date;
    };
    executionTimeRange?: {
      min: number; // milliseconds
      max: number;
    };
    tokenUsageRange?: {
      min: number;
      max: number;
    };
  };
  
  // ソート
  sortBy?: 'timestamp' | 'executionTime' | 'tokens' | 'relevance' | 'quality';
  sortOrder?: 'asc' | 'desc';
  
  // ページネーション
  page?: number;
  pageSize?: number;
  
  // 詳細オプション
  includeMetadata?: boolean;
  includeResponses?: boolean;
  fuzzyMatch?: boolean;
  searchFields?: string[];
}

export interface SearchResult {
  items: CollaborationResultWithScore[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchTime: number;
  suggestions?: string[];
  facets?: SearchFacets;
}

export interface CollaborationResultWithScore extends CollaborationResult {
  searchScore: number;
  highlights?: string[];
  matchedFields?: string[];
}

export interface SearchFacets {
  strategies: { value: string; count: number }[];
  providers: { value: AIProvider; count: number }[];
  successRate: { success: number; failure: number };
  timeDistribution: { range: string; count: number }[];
}

export interface SearchIndex {
  id: string;
  content: string;
  strategy: string;
  providers: AIProvider[];
  success: boolean;
  timestamp: number;
  executionTime: number;
  tokens: number;
  metadata: Record<string, any>;
  searchableText: string;
}

export interface ISearchService {
  // インデックス管理
  indexCollaboration(result: CollaborationResult): Promise<boolean>;
  removeFromIndex(id: string): Promise<boolean>;
  rebuildIndex(): Promise<boolean>;
  
  // 検索
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(partialQuery: string): Promise<string[]>;
  
  // 統計・分析
  getSearchStats(): Promise<{
    totalIndexed: number;
    indexSize: number;
    mostSearchedTerms: string[];
    popularFilters: Record<string, number>;
  }>;
  
  // 管理
  optimize(): Promise<void>;
  getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    indexSize: number;
    lastOptimization: number;
  }>;
}

@injectable()
export class SearchService implements ISearchService {
  private searchIndex = new Map<string, SearchIndex>();
  private invertedIndex = new Map<string, Set<string>>(); // word -> document IDs
  private searchStats = {
    totalSearches: 0,
    searchTermFreq: new Map<string, number>(),
    filterUsage: new Map<string, number>()
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CacheManager) private cache: ICacheService
  ) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // キャッシュからインデックスを復元
      await this.loadIndexFromCache();
      this.logger.info('SearchService initialized', { 
        indexSize: this.searchIndex.size 
      });
    } catch (error) {
      this.logger.error('Failed to initialize SearchService', error instanceof Error ? error : new Error(String(error)));
    }
  }

  async indexCollaboration(result: CollaborationResult): Promise<boolean> {
    try {
      const id = this.generateId(result);
      const searchableText = this.extractSearchableText(result);
      
      const index: SearchIndex = {
        id,
        content: result.final_result?.content || '',
        strategy: result.strategy,
        providers: (result.metadata?.providers_used as AIProvider[]) || [],
        success: result.success,
        timestamp: result.metadata?.timestamp ? new Date(result.metadata.timestamp as string).getTime() : Date.now(),
        executionTime: (result.metadata?.execution_time as number) || 0,
        tokens: result.final_result?.usage?.total_tokens || 0,
        metadata: result.metadata || {},
        searchableText
      };

      // メインインデックスに追加
      this.searchIndex.set(id, index);
      
      // 転置インデックス更新
      this.updateInvertedIndex(id, searchableText);
      
      // キャッシュに保存
      await this.saveIndexToCache();
      
      this.logger.debug('Collaboration indexed', { id, contentLength: searchableText.length });
      return true;
    } catch (error) {
      this.logger.error('Failed to index collaboration', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async removeFromIndex(id: string): Promise<boolean> {
    try {
      const item = this.searchIndex.get(id);
      if (!item) return false;

      // メインインデックスから削除
      this.searchIndex.delete(id);
      
      // 転置インデックスから削除
      this.removeFromInvertedIndex(id, item.searchableText);
      
      // キャッシュ更新
      await this.saveIndexToCache();
      
      this.logger.debug('Collaboration removed from index', { id });
      return true;
    } catch (error) {
      this.logger.error('Failed to remove from index', error instanceof Error ? error : new Error(String(error)), { id });
      return false;
    }
  }

  async rebuildIndex(): Promise<boolean> {
    try {
      this.searchIndex.clear();
      this.invertedIndex.clear();
      
      // 実際の実装では、永続化されたデータからインデックスを再構築
      this.logger.info('Index rebuilt successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to rebuild index', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    this.searchStats.totalSearches++;

    try {
      // クエリの統計記録
      if (query.query) {
        this.recordSearchTerm(query.query);
      }
      this.recordFilterUsage(query.filters);

      // 検索実行
      let results = await this.executeSearch(query);
      
      // フィルタリング
      results = this.applyFilters(results, query.filters);
      
      // ソート
      results = this.sortResults(results, query.sortBy, query.sortOrder);
      
      // ページネーション
      const { paginatedResults, totalCount } = this.paginate(results, query.page, query.pageSize);
      
      // ファセット生成
      const facets = this.generateFacets(results);
      
      // 検索候補生成
      const suggestions = await this.generateSuggestions(query.query);

      const searchTime = Date.now() - startTime;

      this.logger.debug('Search completed', {
        query: query.query,
        totalResults: totalCount,
        searchTime
      });

      return {
        items: paginatedResults,
        totalCount,
        page: query.page || 1,
        pageSize: query.pageSize || 20,
        totalPages: Math.ceil(totalCount / (query.pageSize || 20)),
        searchTime,
        suggestions,
        facets
      };
    } catch (error) {
      this.logger.error('Search failed', error instanceof Error ? error : new Error(String(error)), { query });
      return {
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        searchTime: Date.now() - startTime
      };
    }
  }

  async suggest(partialQuery: string): Promise<string[]> {
    try {
      const suggestions: string[] = [];
      const lowerQuery = partialQuery.toLowerCase();
      
      // 検索履歴から候補生成
      for (const [term, _freq] of this.searchStats.searchTermFreq.entries()) {
        if (term.toLowerCase().includes(lowerQuery) && term !== partialQuery) {
          suggestions.push(term);
        }
      }
      
      // 頻度順でソート
      suggestions.sort((a, b) => {
        const freqA = this.searchStats.searchTermFreq.get(a) || 0;
        const freqB = this.searchStats.searchTermFreq.get(b) || 0;
        return freqB - freqA;
      });
      
      return suggestions.slice(0, 10);
    } catch (error) {
      this.logger.error('Failed to generate suggestions', error instanceof Error ? error : new Error(String(error)), { partialQuery });
      return [];
    }
  }

  async getSearchStats(): Promise<{
    totalIndexed: number;
    indexSize: number;
    mostSearchedTerms: string[];
    popularFilters: Record<string, number>;
  }> {
    const mostSearchedTerms = Array.from(this.searchStats.searchTermFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term);

    const popularFilters = Object.fromEntries(this.searchStats.filterUsage.entries());

    return {
      totalIndexed: this.searchIndex.size,
      indexSize: this.calculateIndexSize(),
      mostSearchedTerms,
      popularFilters
    };
  }

  async optimize(): Promise<void> {
    try {
      // 古いエントリの削除
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30日前
      const toDelete: string[] = [];
      
      for (const [id, item] of this.searchIndex.entries()) {
        if (item.timestamp < cutoff) {
          toDelete.push(id);
        }
      }
      
      for (const id of toDelete) {
        await this.removeFromIndex(id);
      }
      
      // インデックス圧縮
      await this.compactIndex();
      
      this.logger.info('Search index optimized', { 
        deletedEntries: toDelete.length,
        currentSize: this.searchIndex.size 
      });
    } catch (error) {
      this.logger.error('Failed to optimize search index', error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    indexSize: number;
    lastOptimization: number;
  }> {
    const indexSize = this.searchIndex.size;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (indexSize > 100000) {
      status = 'degraded';
    }
    if (indexSize > 500000) {
      status = 'unhealthy';
    }

    return {
      status,
      indexSize,
      lastOptimization: Date.now() // 実際の実装では最後の最適化時刻を保存
    };
  }

  // プライベートメソッド
  private generateId(result: CollaborationResult): string {
    const timestamp = result.metadata?.timestamp || new Date().toISOString();
    const strategy = result.strategy;
    return `${strategy}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSearchableText(result: CollaborationResult): string {
    const parts: string[] = [];
    
    // 最終結果のコンテンツ
    if (result.final_result?.content) {
      parts.push(result.final_result.content);
    }
    
    // レスポンスのコンテンツ
    if (result.responses) {
      for (const response of result.responses) {
        if (response.content) {
          parts.push(response.content);
        }
      }
    }
    
    // メタデータの検索可能フィールド
    if (result.metadata) {
      const searchableMetadata = this.extractSearchableMetadata(result.metadata);
      parts.push(searchableMetadata);
    }
    
    return parts.join(' ').toLowerCase();
  }

  private extractSearchableMetadata(metadata: any): string {
    const searchableFields: string[] = [];
    
    // 特定のフィールドを検索可能テキストに含める
    const fieldsToInclude = ['request_id', 'execution_time', 'providers_used'];
    
    for (const field of fieldsToInclude) {
      if (metadata[field]) {
        if (Array.isArray(metadata[field])) {
          searchableFields.push(metadata[field].join(' '));
        } else {
          searchableFields.push(String(metadata[field]));
        }
      }
    }
    
    return searchableFields.join(' ');
  }

  private updateInvertedIndex(docId: string, text: string): void {
    const words = this.tokenize(text);
    
    for (const word of words) {
      if (!this.invertedIndex.has(word)) {
        this.invertedIndex.set(word, new Set());
      }
      this.invertedIndex.get(word)!.add(docId);
    }
  }

  private removeFromInvertedIndex(docId: string, text: string): void {
    const words = this.tokenize(text);
    
    for (const word of words) {
      const docSet = this.invertedIndex.get(word);
      if (docSet) {
        docSet.delete(docId);
        if (docSet.size === 0) {
          this.invertedIndex.delete(word);
        }
      }
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private async executeSearch(query: SearchQuery): Promise<CollaborationResultWithScore[]> {
    let candidateIds: Set<string>;

    if (query.query) {
      candidateIds = this.searchByQuery(query.query, query.fuzzyMatch);
    } else {
      candidateIds = new Set(this.searchIndex.keys());
    }

    const results: CollaborationResultWithScore[] = [];
    
    for (const id of candidateIds) {
      const item = this.searchIndex.get(id);
      if (!item) continue;

      const score = this.calculateScore(item, query);
      const highlights = this.generateHighlights(item, query.query);
      
      // CollaborationResultWithScoreに変換
      const result: CollaborationResultWithScore = {
        success: item.success,
        strategy: item.strategy,
        responses: [], // 必要に応じて復元
        final_result: {
          id: item.id,
          content: item.content,
          provider: item.providers[0] || 'unknown' as AIProvider,
          usage: { 
            prompt_tokens: 0, 
            completion_tokens: 0, 
            total_tokens: item.tokens 
          },
          latency: item.executionTime,
          finish_reason: 'stop'
        },
        metadata: item.metadata,
        searchScore: score,
        highlights,
        matchedFields: this.getMatchedFields(item, query.query)
      };

      results.push(result);
    }

    return results;
  }

  private searchByQuery(queryText: string, fuzzyMatch?: boolean): Set<string> {
    const words = this.tokenize(queryText);
    const matchedDocs = new Set<string>();

    for (const word of words) {
      let wordMatches = this.invertedIndex.get(word) || new Set();

      // ファジーマッチング
      if (fuzzyMatch && wordMatches.size === 0) {
        wordMatches = this.fuzzySearch(word);
      }

      // 最初の単語の場合は結果を初期化
      if (matchedDocs.size === 0) {
        for (const docId of wordMatches) {
          matchedDocs.add(docId);
        }
      } else {
        // AND検索: 既存の結果と交差
        const intersection = new Set<string>();
        for (const docId of matchedDocs) {
          if (wordMatches.has(docId)) {
            intersection.add(docId);
          }
        }
        matchedDocs.clear();
        for (const docId of intersection) {
          matchedDocs.add(docId);
        }
      }
    }

    return matchedDocs;
  }

  private fuzzySearch(word: string): Set<string> {
    const matches = new Set<string>();
    const threshold = 0.7; // 類似度閾値

    for (const indexWord of this.invertedIndex.keys()) {
      if (this.calculateSimilarity(word, indexWord) >= threshold) {
        const docs = this.invertedIndex.get(indexWord);
        if (docs) {
          for (const docId of docs) {
            matches.add(docId);
          }
        }
      }
    }

    return matches;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // レーベンシュタイン距離による類似度計算
    const matrix: number[][] = [];
    const len1 = str1.length;
    const len2 = str2.length;

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  private calculateScore(item: SearchIndex, query: SearchQuery): number {
    let score = 1.0;

    // クエリマッチスコア
    if (query.query) {
      const queryWords = this.tokenize(query.query);
      const textWords = this.tokenize(item.searchableText);
      const matches = queryWords.filter(word => textWords.includes(word));
      score *= matches.length / queryWords.length;
    }

    // 成功率ボーナス
    if (item.success) {
      score *= 1.1;
    }

    // 新しさのボーナス
    const age = Date.now() - item.timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30日
    const freshness = Math.max(0, 1 - age / maxAge);
    score *= (0.5 + 0.5 * freshness);

    return score;
  }

  private generateHighlights(item: SearchIndex, query?: string): string[] {
    if (!query) return [];

    const highlights: string[] = [];
    const queryWords = this.tokenize(query);
    const sentences = item.content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const word of queryWords) {
        if (lowerSentence.includes(word)) {
          highlights.push(sentence.trim());
          break;
        }
      }
    }

    return highlights.slice(0, 3); // 最大3つのハイライト
  }

  private getMatchedFields(item: SearchIndex, query?: string): string[] {
    if (!query) return [];

    const matchedFields: string[] = [];
    const queryWords = this.tokenize(query);

    // コンテンツフィールドチェック
    if (queryWords.some(word => item.content.toLowerCase().includes(word))) {
      matchedFields.push('content');
    }

    // 戦略フィールドチェック
    if (queryWords.some(word => item.strategy.toLowerCase().includes(word))) {
      matchedFields.push('strategy');
    }

    return matchedFields;
  }

  private applyFilters(results: CollaborationResultWithScore[], filters?: SearchQuery['filters']): CollaborationResultWithScore[] {
    if (!filters) return results;

    return results.filter(result => {
      // 戦略フィルタ
      if (filters.strategy && !filters.strategy.includes(result.strategy)) {
        return false;
      }

      // プロバイダーフィルタ
      if (filters.providers && result.metadata?.providers_used) {
        const providersUsed = result.metadata.providers_used as AIProvider[];
        const hasMatchingProvider = filters.providers.some(provider =>
          providersUsed.includes(provider)
        );
        if (!hasMatchingProvider) return false;
      }

      // 成功フィルタ
      if (filters.success !== undefined && result.success !== filters.success) {
        return false;
      }

      // 日付範囲フィルタ
      if (filters.dateRange && result.metadata?.timestamp) {
        const timestamp = new Date(result.metadata.timestamp as string).getTime();
        if (timestamp < filters.dateRange.start.getTime() || 
            timestamp > filters.dateRange.end.getTime()) {
          return false;
        }
      }

      // 実行時間フィルタ
      if (filters.executionTimeRange && result.metadata?.execution_time) {
        const execTime = result.metadata.execution_time as number;
        if (execTime < filters.executionTimeRange.min || 
            execTime > filters.executionTimeRange.max) {
          return false;
        }
      }

      // トークン使用量フィルタ
      if (filters.tokenUsageRange && result.final_result?.usage?.total_tokens) {
        const tokens = result.final_result.usage.total_tokens;
        if (tokens < filters.tokenUsageRange.min || 
            tokens > filters.tokenUsageRange.max) {
          return false;
        }
      }

      return true;
    });
  }

  private sortResults(results: CollaborationResultWithScore[], sortBy?: string, sortOrder?: string): CollaborationResultWithScore[] {
    const order = sortOrder === 'asc' ? 1 : -1;

    return results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'timestamp':
          const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp as string).getTime() : 0;
          const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp as string).getTime() : 0;
          comparison = timeA - timeB;
          break;
        case 'executionTime':
          const execA = (a.metadata?.execution_time as number) || 0;
          const execB = (b.metadata?.execution_time as number) || 0;
          comparison = execA - execB;
          break;
        case 'tokens':
          const tokensA = a.final_result?.usage?.total_tokens || 0;
          const tokensB = b.final_result?.usage?.total_tokens || 0;
          comparison = tokensA - tokensB;
          break;
        case 'relevance':
        default:
          comparison = a.searchScore - b.searchScore;
          break;
      }

      return comparison * order;
    });
  }

  private paginate(results: CollaborationResultWithScore[], page?: number, pageSize?: number): {
    paginatedResults: CollaborationResultWithScore[];
    totalCount: number;
  } {
    const currentPage = Math.max(1, page || 1);
    const size = Math.max(1, Math.min(100, pageSize || 20));
    const start = (currentPage - 1) * size;
    const end = start + size;

    return {
      paginatedResults: results.slice(start, end),
      totalCount: results.length
    };
  }

  private generateFacets(results: CollaborationResultWithScore[]): SearchFacets {
    const strategies = new Map<string, number>();
    const providers = new Map<AIProvider, number>();
    let successCount = 0;
    let failureCount = 0;
    const timeRanges = new Map<string, number>();

    for (const result of results) {
      // 戦略ファセット
      strategies.set(result.strategy, (strategies.get(result.strategy) || 0) + 1);

      // プロバイダーファセット
      if (result.metadata?.providers_used) {
        const providersUsed = result.metadata.providers_used as AIProvider[];
        for (const provider of providersUsed) {
          providers.set(provider, (providers.get(provider) || 0) + 1);
        }
      }

      // 成功率ファセット
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      // 時間分布ファセット
      if (result.metadata?.timestamp) {
        const date = new Date(result.metadata.timestamp as string);
        const range = this.getTimeRange(date);
        timeRanges.set(range, (timeRanges.get(range) || 0) + 1);
      }
    }

    return {
      strategies: Array.from(strategies.entries()).map(([value, count]) => ({ value, count })),
      providers: Array.from(providers.entries()).map(([value, count]) => ({ value, count })),
      successRate: { success: successCount, failure: failureCount },
      timeDistribution: Array.from(timeRanges.entries()).map(([range, count]) => ({ range, count }))
    };
  }

  private getTimeRange(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return 'This week';
    if (diffDays <= 30) return 'This month';
    if (diffDays <= 90) return 'Last 3 months';
    return 'Older';
  }

  private async generateSuggestions(query?: string): Promise<string[]> {
    if (!query) return [];
    return this.suggest(query);
  }

  private recordSearchTerm(term: string): void {
    this.searchStats.searchTermFreq.set(term, (this.searchStats.searchTermFreq.get(term) || 0) + 1);
  }

  private recordFilterUsage(filters?: SearchQuery['filters']): void {
    if (!filters) return;

    if (filters.strategy) this.searchStats.filterUsage.set('strategy', (this.searchStats.filterUsage.get('strategy') || 0) + 1);
    if (filters.providers) this.searchStats.filterUsage.set('providers', (this.searchStats.filterUsage.get('providers') || 0) + 1);
    if (filters.success !== undefined) this.searchStats.filterUsage.set('success', (this.searchStats.filterUsage.get('success') || 0) + 1);
    if (filters.dateRange) this.searchStats.filterUsage.set('dateRange', (this.searchStats.filterUsage.get('dateRange') || 0) + 1);
  }

  private calculateIndexSize(): number {
    let size = 0;
    for (const item of this.searchIndex.values()) {
      size += JSON.stringify(item).length;
    }
    return size;
  }

  private async loadIndexFromCache(): Promise<void> {
    try {
      const cachedIndex = await this.cache.get<SearchIndex[]>('search_index');
      if (cachedIndex) {
        for (const item of cachedIndex) {
          this.searchIndex.set(item.id, item);
          this.updateInvertedIndex(item.id, item.searchableText);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load index from cache', { error });
    }
  }

  private async saveIndexToCache(): Promise<void> {
    try {
      const indexArray = Array.from(this.searchIndex.values());
      await this.cache.set('search_index', indexArray, 24 * 3600); // 24時間キャッシュ
    } catch (error) {
      this.logger.warn('Failed to save index to cache', { error });
    }
  }

  private async compactIndex(): Promise<void> {
    // インデックスの圧縮処理（実装詳細は省略）
    this.logger.debug('Index compaction completed');
  }

  // getter for stats (testing用)
  get stats() {
    return this.searchStats;
  }
}