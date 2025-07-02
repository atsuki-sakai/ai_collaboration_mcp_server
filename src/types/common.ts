/**
 * Common Types - 共通型定義
 * すべてのコンポーネントで使用される基本的な型を定義
 */

// 基本型定義
export type UUID = string;
export type Timestamp = string;

// 言語・地域関連
export type LanguageCode = 'ja' | 'en' | 'zh' | 'ko' | 'es' | 'fr' | 'de';
export type ProgrammingLanguage = 
  | 'typescript' 
  | 'javascript' 
  | 'python' 
  | 'java' 
  | 'go' 
  | 'rust' 
  | 'cpp' 
  | 'csharp'
  | 'ruby'
  | 'php';

// フレームワーク
export type Framework = 
  | 'react' 
  | 'vue' 
  | 'angular' 
  | 'nextjs' 
  | 'express' 
  | 'django' 
  | 'spring'
  | 'fastapi';

// AI・問題関連
export type AIProvider = 'deepseek' | 'openai' | 'o3' | 'anthropic' | 'gemini';
export type ProblemType = 
  | 'coding' 
  | 'debugging' 
  | 'architecture' 
  | 'algorithm' 
  | 'optimization'
  | 'refactoring'
  | 'testing'
  | 'general';

// ログレベル
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// レビューフォーカス
export type ReviewFocus = 
  | 'performance' 
  | 'security' 
  | 'readability' 
  | 'best_practices' 
  | 'bugs'
  | 'maintainability'
  | 'scalability';

// 検索タイプ
export type SearchType = 'general' | 'news' | 'academic' | 'technical' | 'code';

// 重要度
export type Severity = 'error' | 'warning' | 'info' | 'suggestion';

// エラー詳細
export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Timestamp;
  stack?: string;
}

// トークン使用量
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

// レート制限情報
export interface RateLimit {
  requests: number;
  period: number; // ミリ秒
  remaining?: number;
  reset_at?: Timestamp;
}

// キャッシュオプション
export interface CacheOptions {
  ttl?: number; // 秒
  key?: string;
  tags?: string[];
  invalidate_on?: string[];
}

// メタデータ基底型
export interface BaseMetadata {
  request_id: UUID;
  timestamp: Timestamp;
  [key: string]: unknown;
}

// 協力結果
export interface CollaborationResult {
  success: boolean;
  strategy: string;
  final_result?: {
    id: UUID;
    content: string;
    provider: AIProvider;
    usage: TokenUsage;
    latency: number;
    finish_reason?: string;
    metadata?: BaseMetadata;
  };
  responses: Array<{
    id: UUID;
    content: string;
    provider: AIProvider;
    usage: TokenUsage;
    latency: number;
    finish_reason?: string;
    metadata?: BaseMetadata;
  }>;
  metadata?: Record<string, unknown>;
}

