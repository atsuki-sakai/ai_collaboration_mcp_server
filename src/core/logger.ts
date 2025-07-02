/**
 * Logger Service - 構造化ログシステム
 * Winstonベースのロガー実装
 */

import winston from 'winston';
import { injectable } from 'inversify';
import { ILogger, LogLevel, BaseMetadata, LoggerMetadata } from '../types/index.js';
import 'winston-daily-rotate-file';

// ログメタデータの型定義 (LoggerMetadataを拡張)
export type LogMetadata = LoggerMetadata & Partial<BaseMetadata>;

// エラー情報の型定義
interface LogError {
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
}

// ログエントリの型定義（T004要件）
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  error?: LogError;
}

export interface LoggerConfig {
  level?: LogLevel;
  format?: winston.Logform.Format;
  transports?: winston.transport[];
  enableRotation?: boolean;
  rotationOptions?: {
    datePattern?: string;
    maxSize?: string;
    maxFiles?: string;
  };
}

@injectable()
export class Logger implements ILogger {
  private logger: winston.Logger;
  private context: LoggerMetadata = {};

  constructor(config: LoggerConfig = {}) {
    const transports: winston.transport[] = config.transports || [];
    
    // デフォルトでコンソール出力を追加
    if (transports.length === 0) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    // ログローテーション設定（T004要件）
    if (config.enableRotation) {
      // winston-daily-rotate-fileのDailyRotateFileトランスポート
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DailyRotateFile = (winston.transports as any).DailyRotateFile;
      if (DailyRotateFile) {
        transports.push(
          new DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: config.rotationOptions?.datePattern || 'YYYY-MM-DD',
            maxSize: config.rotationOptions?.maxSize || '20m',
            maxFiles: config.rotationOptions?.maxFiles || '14d',
            format: winston.format.json()
          })
        );
      }
    }

    this.logger = winston.createLogger({
      level: config.level || 'info',
      format: config.format || winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports
    });
  }

  debug(message: string, metadata?: LoggerMetadata): void {
    this.log('debug', message, undefined, metadata);
  }

  info(message: string, metadata?: LoggerMetadata): void {
    this.log('info', message, undefined, metadata);
  }

  warn(message: string, metadata?: LoggerMetadata): void {
    this.log('warn', message, undefined, metadata);
  }

  error(message: string, error?: Error, metadata?: LoggerMetadata): void {
    this.log('error', message, error, metadata);
  }

  fatal(message: string, error?: Error, metadata?: LoggerMetadata): void {
    this.log('error', message, error, metadata); // Winston doesn't have fatal level by default
  }

  child(metadata: LoggerMetadata): ILogger {
    const childLogger = new Logger({
      level: this.logger.level as LogLevel,
      transports: this.logger.transports,
    });
    childLogger.context = { ...this.context, ...metadata };
    return childLogger;
  }

  private log(level: LogLevel, message: string, error?: Error, metadata?: LoggerMetadata): void {
    const logMetadata = {
      ...this.maskSensitiveData({ ...this.context, ...metadata }),
      ...(error && { 
        error: { 
          message: error.message, 
          stack: error.stack,
          ...(error.name && { name: error.name })
        } 
      })
    };

    this.logger.log(level, message, logMetadata);
  }

  private maskSensitiveData(data: LoggerMetadata): LoggerMetadata {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'key'];
    const masked: LoggerMetadata = { ...data };

    for (const key of Object.keys(masked)) {
      if (sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive.toLowerCase())
      )) {
        masked[key] = '***MASKED***';
      } else if (typeof masked[key] === 'object' && masked[key] !== null) {
        // 再帰的にマスク処理
        masked[key] = this.maskSensitiveData(masked[key] as LoggerMetadata);
      }
    }

    return masked;
  }
}