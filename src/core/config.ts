/**
 * Config Manager - 設定管理システム
 * 環境変数、設定ファイル、バリデーションを統合管理
 */

import { injectable } from 'inversify';
import { IConfigManager, ConfigManagerOptions, ConfigValidationError } from '../types/index.js';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs/promises';
import * as path from 'path';

// 設定のスキーマ定義
const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    server: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        log_level: { 
          type: 'string', 
          enum: ['debug', 'info', 'warn', 'error', 'fatal'] 
        },
        port: { type: 'number', minimum: 1000, maximum: 65535 },
        host: { type: 'string' }
      },
      required: ['name', 'version'],
      additionalProperties: true
    },
    providers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            enum: ['deepseek', 'openai', 'o3', 'anthropic', 'gemini'] 
          },
          enabled: { type: 'boolean' },
          api_key: { type: 'string' },
          base_url: { type: 'string' },
          timeout: { type: 'number', minimum: 1000 },
          max_retries: { type: 'number', minimum: 0 },
          default_model: { type: 'string' }
        },
        required: ['name', 'enabled'],
        additionalProperties: true
      }
    },
    strategies: {
      type: 'object',
      properties: {
        default: { 
          type: 'string', 
          enum: ['parallel', 'sequential', 'consensus', 'iterative'] 
        },
        timeout: { type: 'number', minimum: 1000 },
        max_iterations: { type: 'number', minimum: 1 }
      },
      additionalProperties: true
    },
    cache: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        type: { type: 'string', enum: ['memory', 'redis', 'file'] },
        ttl: { type: 'number', minimum: 0 },
        max_size: { type: 'number', minimum: 0 }
      },
      additionalProperties: true
    },
    metrics: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        collection_interval: { type: 'number', minimum: 1000 }
      },
      additionalProperties: true
    }
  },
  required: ['server'],
  additionalProperties: true
};

// App Config interface for DI container
export interface AppConfig {
  server: {
    name: string;
    version: string;
    environment: string;
  };
  providers: {
    deepseek: {
      apiKey: string;
      baseURL: string;
    };
    openai: {
      apiKey: string;
      baseURL: string;
    };
    anthropic: {
      apiKey: string;
      baseURL: string;
    };
    o3: {
      apiKey: string;
      baseURL: string;
    };
  };
  cache: {
    provider: string;
    maxSize: number;
    defaultTTL: number;
  };
  logging: {
    level: string;
    enableConsole: boolean;
    enableFile: boolean;
    fileOptions: {
      filename: string;
      maxSize: number;
      maxFiles: number;
    };
  };
}

// デフォルト設定
const DEFAULT_CONFIG = {
  server: {
    name: 'claude-code-ai-collab-mcp',
    version: '1.0.0',
    log_level: 'info',
    port: 3000,
    host: 'localhost'
  },
  providers: [
    {
      name: 'deepseek',
      enabled: true,
      api_key: '${DEEPSEEK_API_KEY}',
      timeout: 30000,
      max_retries: 3
    },
    {
      name: 'anthropic',
      enabled: true,
      api_key: '${ANTHROPIC_API_KEY}',
      timeout: 30000,
      max_retries: 3
    }
  ],
  strategies: {
    default: 'parallel',
    timeout: 60000,
    max_iterations: 3
  },
  cache: {
    enabled: true,
    type: 'memory',
    ttl: 3600,
    max_size: 1000
  },
  metrics: {
    enabled: true,
    collection_interval: 5000
  }
};

@injectable()
export class ConfigManager implements IConfigManager {
  private config: Record<string, unknown> = {};
  private validationErrors: ConfigValidationError[] = [];
  private ajv: Ajv;
  private options: ConfigManagerOptions;

  constructor(options: ConfigManagerOptions = {}) {
    this.options = {
      configDir: options.configDir || path.join(process.cwd(), 'config'),
      environment: options.environment || process.env.NODE_ENV || 'default',
      enableHotReload: options.enableHotReload || false,
      interpolateEnvVars: options.interpolateEnvVars !== false,
      ...options
    };
    
    this.ajv = new Ajv({ 
      allErrors: true,
      useDefaults: true,
      removeAdditional: false
    });
    
    // フォーマットバリデーターを追加
    addFormats(this.ajv);
  }

  async load(): Promise<void> {
    try {
      // デフォルト設定から開始
      this.config = this.deepClone(DEFAULT_CONFIG);

      // 設定ファイルを読み込み
      await this.loadConfigFiles();

      // 環境変数で直接オーバーライド（展開前に適用）
      this.applyEnvironmentOverrides();

      // 環境変数を処理（プレースホルダー展開）
      if (this.options.interpolateEnvVars) {
        this.interpolateEnvironmentVariables();
      }
      
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async reload(): Promise<void> {
    this.config = {};
    this.validationErrors = [];
    
    // 環境をデフォルトに戻してリロード
    const originalEnv = this.options.environment;
    this.options.environment = 'default';
    
    await this.load();
    
    // 環境設定を復元
    this.options.environment = originalEnv || 'default';
  }

  get(key?: string): unknown {
    if (!key || key === '') {
      return this.config;
    }

    return this.getNestedValue(this.config, key);
  }

  set(key: string, value: unknown): void {
    if (!key || key === '') {
      if (typeof value === 'object' && value !== null) {
        this.config = { ...value as Record<string, unknown> };
      }
      return;
    }

    this.setNestedValue(this.config, key, value);
  }

  async validate(): Promise<boolean> {
    this.validationErrors = [];
    
    const validate = this.ajv.compile(CONFIG_SCHEMA);
    const isValid = validate(this.config);

    if (!isValid && validate.errors) {
      this.validationErrors = validate.errors.map(error => ({
        field: (error.instancePath || error.schemaPath).replace(/^\//, '').replace(/\//g, '.'),
        message: error.message || 'Validation error',
        code: error.keyword || 'unknown',
        expected: error.schema,
        actual: error.data
      }));
    }

    return isValid;
  }

  getValidationErrors(): ConfigValidationError[] {
    return [...this.validationErrors];
  }

  has(key: string): boolean {
    return this.getNestedValue(this.config, key) !== undefined;
  }

  toJSON(): Record<string, unknown> {
    return this.deepClone(this.config);
  }

  private async loadConfigFiles(): Promise<void> {
    const configFiles = [
      'default.yaml',
      'default.yml',
      'default.json',
      `${this.options.environment}.yaml`,
      `${this.options.environment}.yml`,
      `${this.options.environment}.json`
    ];

    for (const fileName of configFiles) {
      const filePath = path.join(this.options.configDir!, fileName);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileConfig = await this.parseConfigFile(content, fileName);
        
        if (fileConfig) {
          this.config = this.deepMerge(this.config, fileConfig);
        }
      } catch (error) {
        // ファイルが存在しない場合は無視
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error(`Failed to load config file ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  private async parseConfigFile(content: string, fileName: string): Promise<Record<string, unknown> | null> {
    const ext = path.extname(fileName).toLowerCase();
    
    try {
      switch (ext) {
        case '.yaml':
        case '.yml':
          return yaml.load(content) as Record<string, unknown>;
        case '.json':
          return JSON.parse(content);
        default:
          return null;
      }
    } catch (error) {
      throw new Error(`Failed to parse ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private interpolateEnvironmentVariables(): void {
    this.config = this.interpolateObject(this.config) as Record<string, unknown>;
  }

  private interpolateObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.interpolateString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value);
      }
      return result;
    }
    
    return obj;
  }

  private interpolateString(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      return value !== undefined ? value : match;
    });
  }

  private applyEnvironmentOverrides(): void {
    // 共通的な環境変数マッピング
    const envMappings: Record<string, string> = {
      'LOG_LEVEL': 'server.log_level',
      'PORT': 'server.port',
      'HOST': 'server.host',
      'CACHE_ENABLED': 'cache.enabled',
      'METRICS_ENABLED': 'metrics.enabled'
    };

    for (const [envKey, configKey] of Object.entries(envMappings)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        let parsedValue: unknown = envValue;
        
        // 型変換
        if (envValue === 'true') parsedValue = true;
        else if (envValue === 'false') parsedValue = false;
        else if (/^\d+$/.test(envValue)) parsedValue = parseInt(envValue, 10);
        else if (/^\d+\.\d+$/.test(envValue)) parsedValue = parseFloat(envValue);
        
        this.setNestedValue(this.config, configKey, parsedValue);
      }
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    
    const cloned = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      cloned[key] = this.deepClone(value);
    }
    
    return cloned as T;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>
          );
        } else {
          result[key] = this.deepClone(value);
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
}