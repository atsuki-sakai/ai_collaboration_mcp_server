/**
 * Common Types テスト
 * TDD Red Phase: 失敗するテストを最初に作成
 */

import {
  UUID,
  Timestamp,
  AIProvider,
  ProblemType,
  LanguageCode,
  ProgrammingLanguage,
  ErrorDetail,
  TokenUsage,
} from '@/types/common';

describe('Common Types', () => {
  describe('UUID type', () => {
    test('should accept valid UUID format', () => {
      const validUUID: UUID = '550e8400-e29b-41d4-a716-446655440000';
      expect(validUUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('should accept string as UUID type', () => {
      const uuid: UUID = 'test-uuid-string';
      expect(typeof uuid).toBe('string');
    });
  });

  describe('Timestamp type', () => {
    test('should accept ISO 8601 format', () => {
      const validTimestamp: Timestamp = '2024-01-15T10:30:00.000Z';
      expect(new Date(validTimestamp).toISOString()).toBe(validTimestamp);
    });

    test('should accept string as Timestamp type', () => {
      const timestamp: Timestamp = '2024-01-15T10:30:00.000Z';
      expect(typeof timestamp).toBe('string');
    });
  });

  describe('AIProvider enum', () => {
    test('should include all supported providers', () => {
      const deepseek: AIProvider = 'deepseek';
      const openai: AIProvider = 'openai';
      const o3: AIProvider = 'o3';
      const anthropic: AIProvider = 'anthropic';

      expect(deepseek).toBe('deepseek');
      expect(openai).toBe('openai');
      expect(o3).toBe('o3');
      expect(anthropic).toBe('anthropic');
    });
  });

  describe('ProblemType enum', () => {
    test('should include all problem types', () => {
      const coding: ProblemType = 'coding';
      const debugging: ProblemType = 'debugging';
      const architecture: ProblemType = 'architecture';
      const algorithm: ProblemType = 'algorithm';
      const optimization: ProblemType = 'optimization';

      expect(coding).toBe('coding');
      expect(debugging).toBe('debugging');
      expect(architecture).toBe('architecture');
      expect(algorithm).toBe('algorithm');
      expect(optimization).toBe('optimization');
    });
  });

  describe('LanguageCode enum', () => {
    test('should include supported language codes', () => {
      const japanese: LanguageCode = 'ja';
      const english: LanguageCode = 'en';
      const chinese: LanguageCode = 'zh';

      expect(japanese).toBe('ja');
      expect(english).toBe('en');
      expect(chinese).toBe('zh');
    });
  });

  describe('ProgrammingLanguage enum', () => {
    test('should include supported programming languages', () => {
      const typescript: ProgrammingLanguage = 'typescript';
      const javascript: ProgrammingLanguage = 'javascript';
      const python: ProgrammingLanguage = 'python';

      expect(typescript).toBe('typescript');
      expect(javascript).toBe('javascript');
      expect(python).toBe('python');
    });
  });

  describe('ErrorDetail interface', () => {
    test('should have required properties', () => {
      const error: ErrorDetail = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        timestamp: '2024-01-15T10:30:00.000Z',
      };

      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.timestamp).toBe('2024-01-15T10:30:00.000Z');
    });

    test('should accept optional properties', () => {
      const error: ErrorDetail = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        timestamp: '2024-01-15T10:30:00.000Z',
        details: { key: 'value' },
        stack: 'Error stack trace',
      };

      expect(error.details).toEqual({ key: 'value' });
      expect(error.stack).toBe('Error stack trace');
    });
  });

  describe('TokenUsage interface', () => {
    test('should have required token count properties', () => {
      const usage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      };

      expect(usage.prompt_tokens).toBe(100);
      expect(usage.completion_tokens).toBe(200);
      expect(usage.total_tokens).toBe(300);
    });

    test('should accept optional estimated_cost', () => {
      const usage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
        estimated_cost: 0.05,
      };

      expect(usage.estimated_cost).toBe(0.05);
    });

    test('should enforce number types for token counts', () => {
      const usage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      };

      expect(typeof usage.prompt_tokens).toBe('number');
      expect(typeof usage.completion_tokens).toBe('number');
      expect(typeof usage.total_tokens).toBe('number');
    });
  });
});