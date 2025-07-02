/**
 * Metrics Service - メトリクスサービス実装
 * T010: パフォーマンス測定、統計収集、OpenTelemetry対応
 */

import { injectable, inject } from 'inversify';
import { Logger } from '../core/logger.js';
import { IMetricsCollector } from '../types/interfaces.js';
import { AIProvider, CollaborationResult } from '../types/common.js';
import { TYPES } from '../core/types.js';

export interface MetricPoint {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags: Record<string, string>;
  labels?: Record<string, string>;
}

export interface HistogramBucket {
  le: number; // less than or equal
  count: number;
}

export interface Histogram {
  buckets: HistogramBucket[];
  count: number;
  sum: number;
}

export interface Counter {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface Gauge {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface MetricsReport {
  counters: Counter[];
  gauges: Gauge[];
  histograms: Record<string, Histogram>;
  summary: {
    totalRequests: number;
    totalErrors: number;
    avgResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  timeRange: {
    start: number;
    end: number;
  };
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  cpuUsage?: number;
  tokensProcessed: number;
  cacheHitRate: number;
  errorCount: number;
}

export interface ProviderMetrics {
  provider: AIProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  totalTokensUsed: number;
  avgTokensPerRequest: number;
  errorRate: number;
  lastUsed: number;
}

export interface CollaborationMetrics {
  strategy: string;
  totalCollaborations: number;
  successfulCollaborations: number;
  avgExecutionTime: number;
  avgProvidersUsed: number;
  avgTokensUsed: number;
  qualityScores: number[];
  avgQualityScore: number;
}

@injectable()
export class MetricsService implements IMetricsCollector {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private metricPoints: MetricPoint[] = [];
  
  // 高速アクセス用キャッシュ
  private providerMetrics = new Map<AIProvider, ProviderMetrics>();
  private collaborationMetrics = new Map<string, CollaborationMetrics>();
  
  // 設定
  private readonly maxMetricPoints = 10000;
  private readonly metricRetentionMs = 24 * 60 * 60 * 1000; // 24時間

  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.initializeMetrics();
    this.startCleanupScheduler();
  }

  private initializeMetrics(): void {
    // 基本メトリクスの初期化
    this.createCounter('requests_total', 'Total number of requests');
    this.createCounter('errors_total', 'Total number of errors');
    this.createGauge('active_connections', 'Number of active connections');
    this.createHistogram('request_duration_seconds', 'Request duration in seconds');
    
    this.logger.info('MetricsService initialized');
  }

  private startCleanupScheduler(): void {
    // 定期的な古いメトリクスの削除
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // 1時間ごと
  }

  // カウンター操作
  createCounter(name: string, description: string, labels: Record<string, string> = {}): void {
    this.counters.set(name, {
      name,
      value: 0,
      labels: { ...labels, description }
    });
  }

  incrementCounter(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const counter = this.counters.get(name);
    if (counter) {
      counter.value += value;
      this.recordMetricPoint(name, counter.value, 'count', labels);
    }
  }

  // ゲージ操作
  createGauge(name: string, description: string, labels: Record<string, string> = {}): void {
    this.gauges.set(name, {
      name,
      value: 0,
      labels: { ...labels, description },
      timestamp: Date.now()
    });
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.value = value;
      gauge.timestamp = Date.now();
      this.recordMetricPoint(name, value, 'gauge', labels);
    }
  }

  incrementGauge(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.value += value;
      gauge.timestamp = Date.now();
      this.recordMetricPoint(name, gauge.value, 'gauge', labels);
    }
  }

  // ヒストグラム操作
  createHistogram(name: string, _description: string, buckets: number[] = [0.1, 0.5, 1, 2, 5, 10]): void {
    this.histograms.set(name, {
      buckets: buckets.map(le => ({ le, count: 0 })),
      count: 0,
      sum: 0
    });
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.count++;
      histogram.sum += value;
      
      // バケットを更新
      histogram.buckets.forEach(bucket => {
        if (value <= bucket.le) {
          bucket.count++;
        }
      });
      
      this.recordMetricPoint(name, value, 'histogram', labels);
    }
  }

  // メトリクス記録
  recordMetric(name: string, value: number, unit: string = 'count', tags: Record<string, string> = {}): void {
    this.recordMetricPoint(name, value, unit, tags);
  }

  private recordMetricPoint(name: string, value: number, unit: string, tags: Record<string, string>): void {
    const point: MetricPoint = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags
    };

    this.metricPoints.push(point);
    
    // メトリクス数制限
    if (this.metricPoints.length > this.maxMetricPoints) {
      this.metricPoints = this.metricPoints.slice(-this.maxMetricPoints);
    }
  }

  // 高レベルメトリクス記録
  recordCollaboration(result: CollaborationResult): void {
    const strategy = result.strategy;
    const success = result.success;
    const executionTime = result.metadata?.execution_time || 0;
    const providersUsed = (result.metadata?.providers_used as AIProvider[])?.length || 0;
    
    // 基本メトリクス
    this.incrementCounter('collaborations_total', 1, { strategy, status: success ? 'success' : 'failure' });
    this.recordHistogram('collaboration_duration_seconds', (executionTime as number) / 1000, { strategy });
    this.recordHistogram('providers_per_collaboration', providersUsed, { strategy });

    // 戦略別メトリクス
    let strategyMetrics = this.collaborationMetrics.get(strategy);
    if (!strategyMetrics) {
      strategyMetrics = {
        strategy,
        totalCollaborations: 0,
        successfulCollaborations: 0,
        avgExecutionTime: 0,
        avgProvidersUsed: 0,
        avgTokensUsed: 0,
        qualityScores: [],
        avgQualityScore: 0
      };
      this.collaborationMetrics.set(strategy, strategyMetrics);
    }

    strategyMetrics.totalCollaborations++;
    if (success) {
      strategyMetrics.successfulCollaborations++;
    }

    // 移動平均の更新
    const alpha = 0.1; // 指数移動平均の係数
    strategyMetrics.avgExecutionTime = this.updateMovingAverage(
      strategyMetrics.avgExecutionTime,
      executionTime as number,
      alpha
    );
    strategyMetrics.avgProvidersUsed = this.updateMovingAverage(
      strategyMetrics.avgProvidersUsed,
      providersUsed,
      alpha
    );

    // トークン使用量
    if (result.final_result?.usage) {
      const tokensUsed = result.final_result.usage.total_tokens;
      strategyMetrics.avgTokensUsed = this.updateMovingAverage(
        strategyMetrics.avgTokensUsed,
        tokensUsed,
        alpha
      );
      this.recordHistogram('tokens_per_collaboration', tokensUsed, { strategy });
    }
  }

  recordProviderMetrics(provider: AIProvider, responseTime: number, success: boolean, tokensUsed: number = 0): void {
    // 基本メトリクス
    this.incrementCounter('provider_requests_total', 1, { provider, status: success ? 'success' : 'failure' });
    this.recordHistogram('provider_response_time_seconds', responseTime / 1000, { provider });
    
    if (tokensUsed > 0) {
      this.recordHistogram('provider_tokens_used', tokensUsed, { provider });
    }

    // プロバイダー別メトリクス
    let providerMetrics = this.providerMetrics.get(provider);
    if (!providerMetrics) {
      providerMetrics = {
        provider,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        totalTokensUsed: 0,
        avgTokensPerRequest: 0,
        errorRate: 0,
        lastUsed: Date.now()
      };
      this.providerMetrics.set(provider, providerMetrics);
    }

    providerMetrics.totalRequests++;
    providerMetrics.lastUsed = Date.now();
    
    if (success) {
      providerMetrics.successfulRequests++;
    } else {
      providerMetrics.failedRequests++;
    }

    // 移動平均の更新
    const alpha = 0.1;
    providerMetrics.avgResponseTime = this.updateMovingAverage(
      providerMetrics.avgResponseTime,
      responseTime,
      alpha
    );

    if (tokensUsed > 0) {
      providerMetrics.totalTokensUsed += tokensUsed;
      providerMetrics.avgTokensPerRequest = providerMetrics.totalTokensUsed / providerMetrics.totalRequests;
    }

    providerMetrics.errorRate = providerMetrics.failedRequests / providerMetrics.totalRequests;
  }

  recordPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.recordHistogram('execution_time_ms', metrics.executionTime);
    this.setGauge('memory_usage_bytes', metrics.memoryUsage);
    this.recordHistogram('tokens_processed', metrics.tokensProcessed);
    this.setGauge('cache_hit_rate', metrics.cacheHitRate);
    this.incrementCounter('errors_total', metrics.errorCount);

    if (metrics.cpuUsage !== undefined) {
      this.setGauge('cpu_usage_percent', metrics.cpuUsage);
    }
  }

  // レポート生成
  async generateReport(startTime?: number, endTime?: number): Promise<MetricsReport> {
    const start = startTime || (Date.now() - this.metricRetentionMs);
    const end = endTime || Date.now();

    const filteredPoints = this.metricPoints.filter(
      point => point.timestamp >= start && point.timestamp <= end
    );

    // 集計計算
    const totalRequests = this.getCounterValue('requests_total') || 0;
    const totalErrors = this.getCounterValue('errors_total') || 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    // 平均レスポンス時間の計算
    const responseTimePoints = filteredPoints.filter(p => p.name === 'request_duration_seconds');
    const avgResponseTime = responseTimePoints.length > 0
      ? responseTimePoints.reduce((sum, p) => sum + p.value, 0) / responseTimePoints.length
      : 0;

    // スループット計算（リクエスト/秒）
    const timeRangeSeconds = (end - start) / 1000;
    const throughput = timeRangeSeconds > 0 ? totalRequests / timeRangeSeconds : 0;

    return {
      counters: Array.from(this.counters.values()),
      gauges: Array.from(this.gauges.values()),
      histograms: Object.fromEntries(this.histograms),
      summary: {
        totalRequests,
        totalErrors,
        avgResponseTime,
        errorRate,
        throughput
      },
      timeRange: { start, end }
    };
  }

  getProviderMetrics(): ProviderMetrics[] {
    return Array.from(this.providerMetrics.values());
  }

  getCollaborationMetrics(): CollaborationMetrics[] {
    return Array.from(this.collaborationMetrics.values());
  }

  // ユーティリティメソッド
  private updateMovingAverage(currentAvg: number, newValue: number, alpha: number): number {
    return alpha * newValue + (1 - alpha) * currentAvg;
  }

  private getCounterValue(name: string): number {
    return this.counters.get(name)?.value || 0;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.metricRetentionMs;
    
    // 古いメトリクスポイントを削除
    this.metricPoints = this.metricPoints.filter(point => point.timestamp > cutoff);
    
    // 使用されていないプロバイダーメトリクスをクリーンアップ
    for (const [provider, metrics] of this.providerMetrics.entries()) {
      if (metrics.lastUsed < cutoff) {
        this.providerMetrics.delete(provider);
      }
    }

    this.logger.debug('Metrics cleanup completed', {
      metricPoints: this.metricPoints.length,
      providerMetrics: this.providerMetrics.size
    });
  }

  // OpenTelemetry互換エクスポート
  exportMetrics(): any {
    return {
      resourceMetrics: [{
        resource: {
          attributes: {
            'service.name': 'claude-code-ai-collab-mcp',
            'service.version': '1.0.0'
          }
        },
        scopeMetrics: [{
          scope: {
            name: 'metrics-service',
            version: '1.0.0'
          },
          metrics: this.convertToOTelFormat()
        }]
      }]
    };
  }

  private convertToOTelFormat(): any[] {
    const metrics: any[] = [];

    // カウンターを変換
    for (const counter of this.counters.values()) {
      metrics.push({
        name: counter.name,
        description: counter.labels.description || '',
        unit: 'count',
        sum: {
          dataPoints: [{
            asInt: counter.value,
            timeUnixNano: Date.now() * 1000000,
            attributes: Object.entries(counter.labels)
              .filter(([key]) => key !== 'description')
              .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
          }],
          aggregationTemporality: 2, // CUMULATIVE
          isMonotonic: true
        }
      });
    }

    // ゲージを変換
    for (const gauge of this.gauges.values()) {
      metrics.push({
        name: gauge.name,
        description: gauge.labels.description || '',
        unit: 'gauge',
        gauge: {
          dataPoints: [{
            asDouble: gauge.value,
            timeUnixNano: gauge.timestamp * 1000000,
            attributes: Object.entries(gauge.labels)
              .filter(([key]) => key !== 'description')
              .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
          }]
        }
      });
    }

    return metrics;
  }

  // IMetricsCollector実装
  collect(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(name, value, 'count', tags);
  }

  increment(name: string, tags?: Record<string, string>): void {
    this.incrementCounter(name, 1, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.setGauge(name, value, tags);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordHistogram(name, value, tags);
  }

  timing(name: string, duration: number, tags?: Record<string, string>): void {
    this.recordHistogram(name, duration, tags);
  }

  decrement(name: string, tags?: Record<string, string>): void {
    this.incrementCounter(name, -1, tags);
  }
}