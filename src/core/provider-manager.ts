/**
 * Provider Manager - AIプロバイダー管理クラス
 * T007: プロバイダーの統合管理
 */

import { injectable, inject } from 'inversify';
import { 
  IBaseProvider, 
  AIRequest, 
  AIResponse, 
  AIProvider, 
  ProviderConfig,
  HealthStatus,
  ProviderCapabilities,
  ValidationResult
} from '../types/index.js';
import { ProviderStats } from '../types/interfaces.js';
import { TYPES } from './types.js';

export interface IProviderManager {
  initializeProvider(provider: AIProvider, config: ProviderConfig): Promise<void>;
  initializeAllProviders(configs: Record<AIProvider, ProviderConfig>): Promise<void>;
  getProvider(provider: AIProvider): IBaseProvider;
  executeRequest(provider: AIProvider, request: AIRequest): Promise<AIResponse>;
  getAvailableProviders(): AIProvider[];
  getProviderHealth(provider: AIProvider): Promise<HealthStatus>;
  getAllProvidersHealth(): Promise<Record<AIProvider, HealthStatus>>;
  getProviderStats(provider: AIProvider): ProviderStats;
  getAllProvidersStats(): Record<AIProvider, ProviderStats>;
  executeCollaboration(params: { strategy: string; providers: AIProvider[]; request: AIRequest }): Promise<any>;
  disposeProvider(provider: AIProvider): Promise<void>;
  disposeAllProviders(): Promise<void>;
}

@injectable()
export class ProviderManager implements IProviderManager {
  private providers = new Map<AIProvider, IBaseProvider>();
  private initializedProviders = new Set<AIProvider>();

  constructor(
    @inject(TYPES.DeepSeekProvider) private deepSeekProvider: IBaseProvider,
    @inject(TYPES.OpenAIProvider) private openAIProvider: IBaseProvider,
    @inject(TYPES.AnthropicProvider) private anthropicProvider: IBaseProvider,
    @inject(TYPES.O3Provider) private o3Provider: IBaseProvider,
    @inject(TYPES.LLMStudioProvider) private llmStudioProvider: IBaseProvider
  ) {
    // プロバイダーマップの初期化
    this.providers.set('deepseek', this.deepSeekProvider);
    this.providers.set('openai', this.openAIProvider);
    this.providers.set('anthropic', this.anthropicProvider);
    this.providers.set('o3', this.o3Provider);
    this.providers.set('llmstudio', this.llmStudioProvider);
  }

  async initializeProvider(provider: AIProvider, config: ProviderConfig): Promise<void> {
    const providerInstance = this.getProvider(provider);
    
    try {
      await providerInstance.initialize(config);
      this.initializedProviders.add(provider);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize ${provider} provider: ${errorMessage}`);
    }
  }

  async initializeAllProviders(configs: Record<AIProvider, ProviderConfig>): Promise<void> {
    const initPromises = Object.entries(configs).map(async ([provider, config]) => {
      if (this.providers.has(provider as AIProvider)) {
        await this.initializeProvider(provider as AIProvider, config);
      }
    });

    try {
      await Promise.all(initPromises);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize providers: ${errorMessage}`);
    }
  }

  getProvider(provider: AIProvider): IBaseProvider {
    const providerInstance = this.providers.get(provider);
    
    if (!providerInstance) {
      throw new Error(`Provider ${provider} is not registered`);
    }
    
    return providerInstance;
  }

  async executeRequest(provider: AIProvider, request: AIRequest): Promise<AIResponse> {
    if (!this.initializedProviders.has(provider)) {
      throw new Error(`Provider ${provider} is not initialized`);
    }

    const providerInstance = this.getProvider(provider);
    
    try {
      return await providerInstance.generateResponse(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Request execution failed for ${provider}: ${errorMessage}`);
    }
  }

  getAvailableProviders(): AIProvider[] {
    return Array.from(this.initializedProviders);
  }

  async getProviderHealth(provider: AIProvider): Promise<HealthStatus> {
    const providerInstance = this.getProvider(provider);
    
    try {
      return await providerInstance.getHealthStatus();
    } catch (error) {
      return {
        healthy: false,
        last_error: {
          code: 'HEALTH_CHECK_ERROR',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          stack: error instanceof Error ? (error.stack || '') : ''
        }
      };
    }
  }

  async getAllProvidersHealth(): Promise<Record<AIProvider, HealthStatus>> {
    const healthPromises = Array.from(this.providers.keys()).map(async (provider) => {
      const health = await this.getProviderHealth(provider);
      return [provider, health] as const;
    });

    const healthResults = await Promise.all(healthPromises);
    
    return Object.fromEntries(healthResults) as Record<AIProvider, HealthStatus>;
  }

  getProviderStats(provider: AIProvider): ProviderStats {
    const providerInstance = this.getProvider(provider);
    return providerInstance.getStats();
  }

  getAllProvidersStats(): Record<AIProvider, ProviderStats> {
    const stats: Partial<Record<AIProvider, ProviderStats>> = {};
    
    for (const [provider, providerInstance] of this.providers) {
      stats[provider] = providerInstance.getStats();
    }
    
    return stats as Record<AIProvider, ProviderStats>;
  }

  async disposeProvider(provider: AIProvider): Promise<void> {
    if (!this.initializedProviders.has(provider)) {
      return; // 初期化されていないプロバイダーは無視
    }

    const providerInstance = this.getProvider(provider);
    
    try {
      await providerInstance.dispose();
      this.initializedProviders.delete(provider);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to dispose ${provider} provider: ${errorMessage}`);
    }
  }

  async disposeAllProviders(): Promise<void> {
    const disposePromises = Array.from(this.initializedProviders).map(provider =>
      this.disposeProvider(provider)
    );

    try {
      await Promise.all(disposePromises);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to dispose all providers: ${errorMessage}`);
    }
  }

  async executeCollaboration(params: { strategy: string; providers: AIProvider[]; request: AIRequest }): Promise<any> {
    const { strategy, providers, request } = params;
    
    // 基本的なコラボレーション実装
    const results = [];
    
    for (const provider of providers) {
      if (this.isProviderAvailable(provider)) {
        try {
          const response = await this.executeRequest(provider, request);
          results.push({
            provider,
            response,
            success: true
          });
        } catch (error) {
          results.push({
            provider,
            error: error instanceof Error ? error.message : String(error),
            success: false
          });
        }
      }
    }

    return {
      strategy,
      success: results.some(r => r.success),
      results,
      summary: `Executed ${strategy} strategy with ${results.length} providers`
    };
  }

  // ユーティリティメソッド
  isProviderAvailable(provider: AIProvider): boolean {
    return this.initializedProviders.has(provider);
  }

  getProviderCapabilities(provider: AIProvider): ProviderCapabilities {
    const providerInstance = this.getProvider(provider);
    return providerInstance.capabilities;
  }

  findProvidersByCapability(capability: keyof ProviderCapabilities): AIProvider[] {
    const capableProviders: AIProvider[] = [];
    
    for (const [provider, providerInstance] of this.providers) {
      if (this.initializedProviders.has(provider)) {
        const capabilities = providerInstance.capabilities;
        if (capabilities[capability]) {
          capableProviders.push(provider);
        }
      }
    }
    
    return capableProviders;
  }

  getBestProviderForModel(model: string): AIProvider | null {
    for (const [provider, providerInstance] of this.providers) {
      if (this.initializedProviders.has(provider) && 
          providerInstance.capabilities.models.includes(model)) {
        return provider;
      }
    }
    
    return null;
  }

  async validateRequest(provider: AIProvider, request: AIRequest): Promise<ValidationResult> {
    const providerInstance = this.getProvider(provider);
    return providerInstance.validateRequest(request);
  }

  getProvidersStatus(): Record<AIProvider, { 
    registered: boolean; 
    initialized: boolean; 
    healthy: boolean;
  }> {
    const status: Partial<Record<AIProvider, { 
      registered: boolean; 
      initialized: boolean; 
      healthy: boolean;
    }>> = {};
    
    for (const [provider, providerInstance] of this.providers) {
      status[provider] = {
        registered: true,
        initialized: this.initializedProviders.has(provider),
        healthy: providerInstance.isHealthy()
      };
    }
    
    return status as Record<AIProvider, { 
      registered: boolean; 
      initialized: boolean; 
      healthy: boolean;
    }>;
  }
}