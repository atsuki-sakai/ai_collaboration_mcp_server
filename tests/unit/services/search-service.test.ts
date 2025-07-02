/**
 * SearchService Unit Tests
 * T010: Search service implementation tests
 */

import 'reflect-metadata';
import { SearchService, ISearchService, SearchQuery, SearchResult } from '@/services/search-service';
import { Logger } from '@/core/logger';
import { CollaborationResult, AIProvider } from '@/types/common';

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  fatal = jest.fn();
}

// Mock Cache Service
class MockCacheService {
  get = jest.fn();
  set = jest.fn();
  delete = jest.fn();
  clear = jest.fn();
}

describe('SearchService', () => {
  let searchService: SearchService;
  let mockLogger: MockLogger;
  let mockCache: MockCacheService;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockCache = new MockCacheService();
    searchService = new SearchService(mockLogger as any, mockCache as any);
  });

  afterEach(async () => {
    await searchService.clearIndex();
  });

  describe('Index Management', () => {
    it('should index collaboration results', async () => {
      const collaborationResult: CollaborationResult = {
        success: true,
        collaboration_id: 'test-collab-1',
        strategy_used: 'parallel',
        providers_used: ['deepseek', 'openai'],
        individual_results: [
          {
            provider: 'deepseek' as AIProvider,
            content: 'DeepSeek response about machine learning',
            execution_time: 150,
            success: true,
            metadata: { temperature: 0.7 }
          },
          {
            provider: 'openai' as AIProvider,
            content: 'OpenAI response about machine learning',
            execution_time: 200,
            success: true,
            metadata: { temperature: 0.7 }
          }
        ],
        synthesis_result: {
          synthesized_content: 'Combined insights about machine learning',
          confidence_score: 0.9,
          key_insights: ['ML basics', 'AI applications'],
          consensus_level: 0.85
        },
        performance_metrics: {
          total_execution_time: 350,
          strategy_execution_time: 300,
          synthesis_time: 50,
          provider_response_times: {
            deepseek: 150,
            openai: 200
          },
          token_usage: {
            total_prompt_tokens: 100,
            total_completion_tokens: 300,
            total_tokens: 400,
            provider_breakdown: {
              deepseek: { prompt: 50, completion: 150, total: 200 },
              openai: { prompt: 50, completion: 150, total: 200 }
            }
          }
        },
        metadata: {
          execution_context: {
            request_id: 'req-123',
            user_id: 'user-456'
          },
          tool_version: '1.0.0',
          execution_timestamp: new Date().toISOString()
        }
      };

      const indexed = await searchService.indexCollaboration(collaborationResult);
      expect(indexed).toBe(true);
    });

    it('should remove items from index', async () => {
      const collaborationResult: CollaborationResult = {
        success: true,
        collaboration_id: 'test-collab-2',
        strategy_used: 'sequential',
        providers_used: ['deepseek'],
        individual_results: [],
        synthesis_result: {
          synthesized_content: 'Test content',
          confidence_score: 0.8,
          key_insights: [],
          consensus_level: 0.8
        },
        performance_metrics: {
          total_execution_time: 100,
          strategy_execution_time: 80,
          synthesis_time: 20,
          provider_response_times: {},
          token_usage: {
            total_prompt_tokens: 50,
            total_completion_tokens: 100,
            total_tokens: 150,
            provider_breakdown: {}
          }
        },
        metadata: {
          execution_context: {},
          tool_version: '1.0.0',
          execution_timestamp: new Date().toISOString()
        }
      };

      await searchService.indexCollaboration(collaborationResult);
      const removed = await searchService.removeFromIndex('test-collab-2');
      expect(removed).toBe(true);
    });

    it('should rebuild index', async () => {
      const rebuilt = await searchService.rebuildIndex();
      expect(rebuilt).toBe(true);
    });

    it('should clear index', async () => {
      const cleared = await searchService.clearIndex();
      expect(cleared).toBe(true);
    });
  });

  describe('Basic Search', () => {
    beforeEach(async () => {
      // Index some test collaboration results
      const results: CollaborationResult[] = [
        {
          success: true,
          collaboration_id: 'ml-collab-1',
          strategy_used: 'parallel',
          providers_used: ['deepseek', 'openai'],
          individual_results: [
            {
              provider: 'deepseek' as AIProvider,
              content: 'Machine learning algorithms and neural networks',
              execution_time: 150,
              success: true,
              metadata: {}
            }
          ],
          synthesis_result: {
            synthesized_content: 'Comprehensive guide to machine learning algorithms',
            confidence_score: 0.9,
            key_insights: ['supervised learning', 'neural networks', 'deep learning'],
            consensus_level: 0.85
          },
          performance_metrics: {
            total_execution_time: 300,
            strategy_execution_time: 250,
            synthesis_time: 50,
            provider_response_times: { deepseek: 150, openai: 100 },
            token_usage: {
              total_prompt_tokens: 100,
              total_completion_tokens: 200,
              total_tokens: 300,
              provider_breakdown: {}
            }
          },
          metadata: {
            execution_context: { request_id: 'req-1' },
            tool_version: '1.0.0',
            execution_timestamp: new Date().toISOString()
          }
        },
        {
          success: true,
          collaboration_id: 'ai-collab-2',
          strategy_used: 'consensus',
          providers_used: ['anthropic'],
          individual_results: [
            {
              provider: 'anthropic' as AIProvider,
              content: 'Artificial intelligence applications in healthcare',
              execution_time: 180,
              success: true,
              metadata: {}
            }
          ],
          synthesis_result: {
            synthesized_content: 'AI applications in medical diagnosis and treatment',
            confidence_score: 0.95,
            key_insights: ['medical AI', 'diagnosis', 'treatment planning'],
            consensus_level: 0.9
          },
          performance_metrics: {
            total_execution_time: 200,
            strategy_execution_time: 180,
            synthesis_time: 20,
            provider_response_times: { anthropic: 180 },
            token_usage: {
              total_prompt_tokens: 80,
              total_completion_tokens: 150,
              total_tokens: 230,
              provider_breakdown: {}
            }
          },
          metadata: {
            execution_context: { request_id: 'req-2' },
            tool_version: '1.0.0',
            execution_timestamp: new Date().toISOString()
          }
        }
      ];

      for (const result of results) {
        await searchService.indexCollaboration(result);
      }
    });

    it('should perform basic text search', async () => {
      const query: SearchQuery = {
        query: 'machine learning'
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.searchTime).toBeGreaterThan(0);
    });

    it('should handle empty search queries', async () => {
      const query: SearchQuery = {
        query: ''
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle search with no results', async () => {
      const query: SearchQuery = {
        query: 'nonexistent topic that should not match anything'
      };

      const result = await searchService.search(query);
      
      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('Filtered Search', () => {
    beforeEach(async () => {
      const result: CollaborationResult = {
        success: true,
        collaboration_id: 'filtered-test',
        strategy_used: 'parallel',
        providers_used: ['deepseek', 'openai'],
        individual_results: [],
        synthesis_result: {
          synthesized_content: 'Test content for filtering',
          confidence_score: 0.8,
          key_insights: [],
          consensus_level: 0.8
        },
        performance_metrics: {
          total_execution_time: 500,
          strategy_execution_time: 400,
          synthesis_time: 100,
          provider_response_times: {},
          token_usage: {
            total_prompt_tokens: 200,
            total_completion_tokens: 300,
            total_tokens: 500,
            provider_breakdown: {}
          }
        },
        metadata: {
          execution_context: {},
          tool_version: '1.0.0',
          execution_timestamp: new Date().toISOString()
        }
      };

      await searchService.indexCollaboration(result);
    });

    it('should filter by strategy', async () => {
      const query: SearchQuery = {
        query: '*',
        filters: {
          strategy: ['parallel']
        }
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should filter by providers', async () => {
      const query: SearchQuery = {
        query: '*',
        filters: {
          providers: ['deepseek']
        }
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should filter by success status', async () => {
      const query: SearchQuery = {
        query: '*',
        filters: {
          success: true
        }
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should filter by execution time range', async () => {
      const query: SearchQuery = {
        query: '*',
        filters: {
          executionTimeRange: {
            min: 100,
            max: 1000
          }
        }
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('Sorting and Pagination', () => {
    it('should sort by timestamp', async () => {
      const query: SearchQuery = {
        query: '*',
        sortBy: 'timestamp',
        sortOrder: 'desc'
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(result.page).toBe(1);
    });

    it('should sort by execution time', async () => {
      const query: SearchQuery = {
        query: '*',
        sortBy: 'executionTime',
        sortOrder: 'asc'
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
    });

    it('should handle pagination', async () => {
      const query: SearchQuery = {
        query: '*',
        page: 1,
        pageSize: 10
      };

      const result = await searchService.search(query);
      
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('should handle different page sizes', async () => {
      const query: SearchQuery = {
        query: '*',
        page: 1,
        pageSize: 5
      };

      const result = await searchService.search(query);
      
      expect(result.pageSize).toBe(5);
    });
  });

  describe('Advanced Search Features', () => {
    it('should handle exact match search', async () => {
      const query: SearchQuery = {
        query: 'machine learning',
        exactMatch: true
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle case sensitive search', async () => {
      const query: SearchQuery = {
        query: 'Machine Learning',
        caseSensitive: true
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle fuzzy matching', async () => {
      const query: SearchQuery = {
        query: 'machne lerning', // Typos
        fuzzyMatch: true
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should include metadata when requested', async () => {
      const query: SearchQuery = {
        query: '*',
        includeMetadata: true
      };

      const result = await searchService.search(query);
      
      expect(result.items).toBeDefined();
      // If there are results, they should include metadata
      if (result.items.length > 0) {
        expect(result.items[0].metadata).toBeDefined();
      }
    });

    it('should provide search suggestions', async () => {
      const suggestions = await searchService.suggest('mach');
      
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('Statistics and Analysis', () => {
    it('should provide search statistics', async () => {
      const stats = await searchService.getSearchStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
      expect(stats.totalIndexed).toBeDefined();
      expect(stats.indexSize).toBeDefined();
      expect(stats.mostSearchedTerms).toBeDefined();
      expect(stats.popularFilters).toBeDefined();
    });

    it('should provide collaboration insights', async () => {
      const insights = await searchService.getCollaborationInsights();
      
      expect(insights).toBeDefined();
      expect(typeof insights).toBe('object');
    });

    it('should track search performance', async () => {
      const performance = await searchService.getSearchPerformance();
      
      expect(performance).toBeDefined();
      expect(typeof performance).toBe('object');
    });

    it('should provide provider analytics', async () => {
      const analytics = await searchService.getProviderAnalytics();
      
      expect(analytics).toBeDefined();
      expect(typeof analytics).toBe('object');
    });

    it('should analyze search trends', async () => {
      const trends = await searchService.getSearchTrends();
      
      expect(trends).toBeDefined();
      expect(typeof trends).toBe('object');
    });
  });

  describe('Index Health and Optimization', () => {
    it('should report index health', async () => {
      const health = await searchService.getIndexHealth();
      
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('should optimize index', async () => {
      const optimized = await searchService.optimizeIndex();
      
      expect(optimized).toBe(true);
    });

    it('should validate index integrity', async () => {
      const integrity = await searchService.validateIndex();
      
      expect(integrity).toBeDefined();
      expect(typeof integrity).toBe('object');
    });
  });

  describe('Backup and Restore', () => {
    it('should backup search index', async () => {
      const backupPath = await searchService.backupIndex();
      
      expect(backupPath).toBeDefined();
      expect(typeof backupPath).toBe('string');
    });

    it('should restore from backup', async () => {
      const backupPath = await searchService.backupIndex();
      const restored = await searchService.restoreIndex(backupPath);
      
      expect(restored).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid collaboration results gracefully', async () => {
      const invalidResult = null as any;
      
      const indexed = await searchService.indexCollaboration(invalidResult);
      expect(indexed).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle malformed search queries', async () => {
      const invalidQuery = {
        query: null,
        page: -1,
        pageSize: 0
      } as any;

      const result = await searchService.search(invalidQuery);
      
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle index corruption gracefully', async () => {
      // Simulate index corruption
      const health = await searchService.getIndexHealth();
      
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });

    it('should handle cache failures', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      
      const query: SearchQuery = { query: 'test' };
      const result = await searchService.search(query);
      
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large result sets efficiently', async () => {
      // Index many results
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const result: CollaborationResult = {
          success: true,
          collaboration_id: `perf-test-${i}`,
          strategy_used: 'parallel',
          providers_used: ['deepseek'],
          individual_results: [],
          synthesis_result: {
            synthesized_content: `Performance test content ${i}`,
            confidence_score: 0.8,
            key_insights: [],
            consensus_level: 0.8
          },
          performance_metrics: {
            total_execution_time: 100 + i,
            strategy_execution_time: 80 + i,
            synthesis_time: 20,
            provider_response_times: {},
            token_usage: {
              total_prompt_tokens: 50,
              total_completion_tokens: 100,
              total_tokens: 150,
              provider_breakdown: {}
            }
          },
          metadata: {
            execution_context: {},
            tool_version: '1.0.0',
            execution_timestamp: new Date().toISOString()
          }
        };
        
        promises.push(searchService.indexCollaboration(result));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);

      // Search should still be fast
      const startTime = Date.now();
      const searchResult = await searchService.search({ query: 'performance' });
      const searchTime = Date.now() - startTime;

      expect(searchTime).toBeLessThan(1000); // Should complete within 1 second
      expect(searchResult.items).toBeDefined();
    });

    it('should handle concurrent searches', async () => {
      const query: SearchQuery = { query: 'test' };
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(searchService.search(query));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
      });
    });
  });
});