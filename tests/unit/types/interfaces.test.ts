/**
 * Interfaces テスト
 * TDD Red Phase: インターフェース型のテスト
 */

import {
  IAIProvider,
  ITool,
  ILogger,
  ICache,
  ProviderCapabilities,
  AIRequest,
  AIResponse,
  ValidationResult,
  ToolContext,
  ToolResult,
} from '@/types/interfaces';

describe('Interfaces', () => {
  describe('IAIProvider interface', () => {
    test('should define required methods and properties', () => {
      const mockProvider: IAIProvider = {
        name: 'openai',
        capabilities: {
          models: ['test-model'],
          max_tokens: 4096,
          languages: ['en'],
        },
        initialize: jest.fn(),
        generateResponse: jest.fn(),
        validateRequest: jest.fn(),
        getHealthStatus: jest.fn(),
        dispose: jest.fn(),
      };

      expect(mockProvider.name).toBe('openai');
      expect(mockProvider.capabilities.models).toContain('test-model');
      expect(typeof mockProvider.initialize).toBe('function');
      expect(typeof mockProvider.generateResponse).toBe('function');
      expect(typeof mockProvider.validateRequest).toBe('function');
      expect(typeof mockProvider.getHealthStatus).toBe('function');
      expect(typeof mockProvider.dispose).toBe('function');
    });
  });

  describe('ProviderCapabilities interface', () => {
    test('should have required properties', () => {
      const capabilities: ProviderCapabilities = {
        models: ['gpt-4', 'gpt-3.5-turbo'],
        max_tokens: 4096,
        languages: ['en', 'ja'],
      };

      expect(capabilities.models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
      expect(capabilities.max_tokens).toBe(4096);
      expect(capabilities.languages).toEqual(['en', 'ja']);
    });

    test('should accept optional properties', () => {
      const capabilities: ProviderCapabilities = {
        models: ['test-model'],
        max_tokens: 4096,
        languages: ['en'],
        supports_streaming: true,
        supports_functions: true,
        supports_vision: false,
      };

      expect(capabilities.supports_streaming).toBe(true);
      expect(capabilities.supports_functions).toBe(true);
      expect(capabilities.supports_vision).toBe(false);
    });
  });

  describe('AIRequest interface', () => {
    test('should have required properties', () => {
      const request: AIRequest = {
        id: 'test-id',
        prompt: 'Test prompt',
      };

      expect(request.id).toBe('test-id');
      expect(request.prompt).toBe('Test prompt');
    });

    test('should accept optional properties', () => {
      const request: AIRequest = {
        id: 'test-id',
        prompt: 'Test prompt',
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        stop: ['\\n'],
      };

      expect(request.model).toBe('gpt-4');
      expect(request.temperature).toBe(0.7);
      expect(request.max_tokens).toBe(1000);
      expect(request.stop).toEqual(['\\n']);
    });
  });

  describe('AIResponse interface', () => {
    test('should have required properties', () => {
      const response: AIResponse = {
        id: 'test-id',
        provider: 'openai',
        model: 'gpt-4',
        content: 'Test response',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        latency: 1000,
      };

      expect(response.id).toBe('test-id');
      expect(response.provider).toBe('openai');
      expect(response.content).toBe('Test response');
      expect(response.usage.total_tokens).toBe(30);
      expect(response.latency).toBe(1000);
    });
  });

  describe('ITool interface', () => {
    test('should define required methods and properties', () => {
      const mockTool: ITool = {
        name: 'test-tool',
        description: 'Test tool description',
        input_schema: { type: 'object' },
        execute: jest.fn(),
        validate: jest.fn(),
      };

      expect(mockTool.name).toBe('test-tool');
      expect(mockTool.description).toBe('Test tool description');
      expect(mockTool.input_schema.type).toBe('object');
      expect(typeof mockTool.execute).toBe('function');
      expect(typeof mockTool.validate).toBe('function');
    });
  });

  describe('ToolContext interface', () => {
    test('should have required request_id', () => {
      const context: ToolContext = {
        request_id: 'req-123',
      };

      expect(context.request_id).toBe('req-123');
    });

    test('should accept optional properties', () => {
      const context: ToolContext = {
        request_id: 'req-123',
        user_id: 'user-456',
        session_id: 'session-789',
        environment: { NODE_ENV: 'test' },
        config: { timeout: 30000 },
      };

      expect(context.user_id).toBe('user-456');
      expect(context.session_id).toBe('session-789');
      expect(context.environment?.NODE_ENV).toBe('test');
    });
  });

  describe('ToolResult interface', () => {
    test('should have required success property', () => {
      const result: ToolResult = {
        success: true,
      };

      expect(result.success).toBe(true);
    });

    test('should accept optional properties', () => {
      const result: ToolResult = {
        success: true,
        data: { result: 'test' },
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
          timestamp: '2024-01-15T10:30:00.000Z',
        },
        metadata: {
          request_id: 'req-123',
          timestamp: '2024-01-15T10:30:00.000Z',
          execution_time: 1000,
        },
      };

      expect(result.data).toEqual({ result: 'test' });
      expect(result.error?.code).toBe('TEST_ERROR');
      expect(result.metadata?.execution_time).toBe(1000);
    });
  });

  describe('ValidationResult interface', () => {
    test('should indicate valid result', () => {
      const result: ValidationResult = {
        valid: true,
      };

      expect(result.valid).toBe(true);
    });

    test('should handle invalid result with errors', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          {
            field: 'name',
            message: 'Name is required',
            code: 'REQUIRED',
          },
        ],
      };

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].field).toBe('name');
    });
  });

  describe('ILogger interface', () => {
    test('should define required log methods', () => {
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
        child: jest.fn(),
      };

      expect(typeof mockLogger.debug).toBe('function');
      expect(typeof mockLogger.info).toBe('function');
      expect(typeof mockLogger.warn).toBe('function');
      expect(typeof mockLogger.error).toBe('function');
      expect(typeof mockLogger.fatal).toBe('function');
      expect(typeof mockLogger.child).toBe('function');
    });
  });

  describe('ICache interface', () => {
    test('should define required cache methods', () => {
      const mockCache: ICache = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
        has: jest.fn(),
        getStats: jest.fn(),
      };

      expect(typeof mockCache.get).toBe('function');
      expect(typeof mockCache.set).toBe('function');
      expect(typeof mockCache.delete).toBe('function');
      expect(typeof mockCache.clear).toBe('function');
      expect(typeof mockCache.has).toBe('function');
      expect(typeof mockCache.getStats).toBe('function');
    });
  });
});