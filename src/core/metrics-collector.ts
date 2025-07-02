/**
 * Metrics Collector Service - メトリクス収集システム
 * パフォーマンス監視とメトリクス収集
 */

import { injectable } from 'inversify';
import { IMetricsCollector } from '../types/index.js';

interface MetricRecord {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timing';
  tags: Record<string, string>;
  timestamp: number;
}

@injectable()
export class MetricsCollector implements IMetricsCollector {
  private metrics: Map<string, MetricRecord[]> = new Map();

  increment(metric: string, tags: Record<string, string> = {}): void {
    this.recordMetric(metric, 1, 'counter', tags);
  }

  decrement(metric: string, tags: Record<string, string> = {}): void {
    this.recordMetric(metric, -1, 'counter', tags);
  }

  gauge(metric: string, value: number, tags: Record<string, string> = {}): void {
    this.recordMetric(metric, value, 'gauge', tags);
  }

  histogram(metric: string, value: number, tags: Record<string, string> = {}): void {
    this.recordMetric(metric, value, 'histogram', tags);
  }

  timing(metric: string, duration: number, tags: Record<string, string> = {}): void {
    this.recordMetric(metric, duration, 'timing', tags);
  }

  private recordMetric(
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram' | 'timing',
    tags: Record<string, string>
  ): void {
    const record: MetricRecord = {
      name,
      value,
      type,
      tags,
      timestamp: Date.now(),
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(record);

    // Keep only last 1000 records per metric to prevent memory leaks
    const records = this.metrics.get(name)!;
    if (records.length > 1000) {
      records.splice(0, records.length - 1000);
    }
  }

  // Debug method to get recorded metrics
  getMetrics(): Map<string, MetricRecord[]> {
    return new Map(this.metrics);
  }

  // Clear all metrics (useful for testing)
  clear(): void {
    this.metrics.clear();
  }
}