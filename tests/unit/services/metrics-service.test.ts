/**
 * MetricsService Unit Tests
 * T010: Metrics service implementation tests
 */

import 'reflect-metadata';
import { MetricsService, IMetricsService, MetricsOptions } from '@/services/metrics-service';
import { Logger } from '@/core/logger';

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  fatal = jest.fn();
}

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let mockLogger: MockLogger;
  let options: MetricsOptions;

  beforeEach(() => {
    mockLogger = new MockLogger();
    options = {
      enableCollection: true,
      collectionInterval: 1000,
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      maxMetricsCount: 10000,
      aggregationWindow: 60 * 1000, // 1 minute
      enableHistograms: true,
      enableExport: true,
      exportFormat: 'prometheus',
      exportEndpoint: '/metrics'
    };

    metricsService = new MetricsService(mockLogger as any, options);
  });

  afterEach(async () => {
    await metricsService.reset();
  });

  describe('Counter Metrics', () => {
    it('should increment counters', () => {
      metricsService.increment('test_counter');
      metricsService.increment('test_counter');
      metricsService.increment('test_counter');

      const metrics = metricsService.getMetrics();
      expect(metrics.counters.test_counter).toEqual(
        expect.objectContaining({
          value: 3,
          name: 'test_counter'
        })
      );
    });

    it('should increment counters with custom values', () => {
      metricsService.increment('test_counter', 5);
      metricsService.increment('test_counter', 3);

      const metrics = metricsService.getMetrics();
      expect(metrics.counters.test_counter.value).toBe(8);
    });

    it('should increment counters with tags', () => {
      metricsService.increment('http_requests', 1, { method: 'GET', status: '200' });
      metricsService.increment('http_requests', 1, { method: 'POST', status: '201' });
      metricsService.increment('http_requests', 1, { method: 'GET', status: '200' });

      const metrics = metricsService.getMetrics();
      expect(metrics.counters['http_requests.method=GET.status=200'].value).toBe(2);
      expect(metrics.counters['http_requests.method=POST.status=201'].value).toBe(1);
    });

    it('should decrement counters', () => {
      metricsService.increment('test_counter', 10);
      metricsService.decrement('test_counter', 3);

      const metrics = metricsService.getMetrics();
      expect(metrics.counters.test_counter.value).toBe(7);
    });

    it('should handle negative decrements', () => {
      metricsService.increment('test_counter', 5);
      metricsService.decrement('test_counter', 10);

      const metrics = metricsService.getMetrics();
      expect(metrics.counters.test_counter.value).toBe(-5);
    });
  });

  describe('Gauge Metrics', () => {
    it('should set gauge values', () => {
      metricsService.gauge('cpu_usage', 65.5);
      metricsService.gauge('memory_usage', 1024);

      const metrics = metricsService.getMetrics();
      expect(metrics.gauges.cpu_usage.value).toBe(65.5);
      expect(metrics.gauges.memory_usage.value).toBe(1024);
    });

    it('should update gauge values', () => {
      metricsService.gauge('temperature', 20.5);
      metricsService.gauge('temperature', 22.3);

      const metrics = metricsService.getMetrics();
      expect(metrics.gauges.temperature.value).toBe(22.3);
    });

    it('should set gauges with tags', () => {
      metricsService.gauge('disk_usage', 75.2, { disk: 'sda1', mount: '/' });
      metricsService.gauge('disk_usage', 45.8, { disk: 'sdb1', mount: '/home' });

      const metrics = metricsService.getMetrics();
      expect(metrics.gauges['disk_usage.disk=sda1.mount=/'].value).toBe(75.2);
      expect(metrics.gauges['disk_usage.disk=sdb1.mount=/home'].value).toBe(45.8);
    });
  });

  describe('Timing Metrics', () => {
    it('should record timing measurements', () => {
      metricsService.timing('api_response_time', 150);
      metricsService.timing('api_response_time', 200);
      metricsService.timing('api_response_time', 100);

      const metrics = metricsService.getMetrics();
      const timing = metrics.timings.api_response_time;
      
      expect(timing.count).toBe(3);
      expect(timing.sum).toBe(450);
      expect(timing.min).toBe(100);
      expect(timing.max).toBe(200);
      expect(timing.avg).toBe(150);
    });

    it('should record timings with tags', () => {
      metricsService.timing('db_query_time', 50, { operation: 'select', table: 'users' });
      metricsService.timing('db_query_time', 100, { operation: 'insert', table: 'users' });
      metricsService.timing('db_query_time', 75, { operation: 'select', table: 'users' });

      const metrics = metricsService.getMetrics();
      const selectTiming = metrics.timings['db_query_time.operation=select.table=users'];
      const insertTiming = metrics.timings['db_query_time.operation=insert.table=users'];

      expect(selectTiming.count).toBe(2);
      expect(selectTiming.avg).toBe(62.5);
      expect(insertTiming.count).toBe(1);
      expect(insertTiming.avg).toBe(100);
    });

    it('should calculate percentiles', () => {
      // Add many timing measurements
      for (let i = 1; i <= 100; i++) {
        metricsService.timing('response_time', i);
      }

      const metrics = metricsService.getMetrics();
      const timing = metrics.timings.response_time;

      expect(timing.p50).toBeCloseTo(50, 5);
      expect(timing.p95).toBeCloseTo(95, 5);
      expect(timing.p99).toBeCloseTo(99, 5);
    });
  });

  describe('Histogram Metrics', () => {
    it('should record histogram values', () => {
      metricsService.histogram('request_size', 1024);
      metricsService.histogram('request_size', 2048);
      metricsService.histogram('request_size', 512);

      const metrics = metricsService.getMetrics();
      const histogram = metrics.histograms.request_size;

      expect(histogram.count).toBe(3);
      expect(histogram.sum).toBe(3584);
      expect(histogram.buckets).toBeDefined();
    });

    it('should use custom buckets', () => {
      const customBuckets = [100, 500, 1000, 5000];
      metricsService.histogram('custom_metric', 750, undefined, customBuckets);

      const metrics = metricsService.getMetrics();
      const histogram = metrics.histograms.custom_metric;

      expect(histogram.buckets).toEqual(
        expect.objectContaining({
          100: 0,
          500: 0,
          1000: 1,
          5000: 1
        })
      );
    });

    it('should record histograms with tags', () => {
      metricsService.histogram('response_size', 1024, { endpoint: '/api/users' });
      metricsService.histogram('response_size', 2048, { endpoint: '/api/posts' });

      const metrics = metricsService.getMetrics();
      expect(metrics.histograms['response_size.endpoint=/api/users']).toBeDefined();
      expect(metrics.histograms['response_size.endpoint=/api/posts']).toBeDefined();
    });
  });

  describe('Custom Metrics', () => {
    it('should record custom metrics', () => {
      metricsService.recordCustomMetric('business_metric', 42, 'custom', { unit: 'orders' });

      const metrics = metricsService.getMetrics();
      expect(metrics.custom.business_metric).toEqual(
        expect.objectContaining({
          value: 42,
          type: 'custom',
          tags: { unit: 'orders' }
        })
      );
    });

    it('should update custom metrics', () => {
      metricsService.recordCustomMetric('revenue', 1000, 'currency');
      metricsService.recordCustomMetric('revenue', 1500, 'currency');

      const metrics = metricsService.getMetrics();
      expect(metrics.custom.revenue.value).toBe(1500);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const performanceData = {
        cpuUsage: 65.5,
        memoryUsage: 1024 * 1024 * 512, // 512MB
        diskUsage: 75.2,
        networkIn: 1024 * 100, // 100KB
        networkOut: 1024 * 50,  // 50KB
        activeConnections: 25,
        errorRate: 0.02
      };

      await metricsService.recordPerformanceMetrics(performanceData);

      const metrics = metricsService.getMetrics();
      expect(metrics.gauges.cpu_usage.value).toBe(65.5);
      expect(metrics.gauges.memory_usage.value).toBe(1024 * 1024 * 512);
      expect(metrics.gauges.active_connections.value).toBe(25);
      expect(metrics.gauges.error_rate.value).toBe(0.02);
    });

    it('should calculate rates', async () => {
      // Record initial values
      await metricsService.recordPerformanceMetrics({
        cpuUsage: 50,
        memoryUsage: 1024 * 1024 * 256,
        networkIn: 1024 * 100,
        networkOut: 1024 * 50
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Record new values
      await metricsService.recordPerformanceMetrics({
        cpuUsage: 60,
        memoryUsage: 1024 * 1024 * 300,
        networkIn: 1024 * 200,
        networkOut: 1024 * 100
      });

      const metrics = metricsService.getMetrics();
      expect(metrics.gauges.network_in_rate).toBeDefined();
      expect(metrics.gauges.network_out_rate).toBeDefined();
    });
  });

  describe('Aggregation', () => {
    it('should aggregate metrics over time windows', async () => {
      // Record metrics over time
      for (let i = 0; i < 10; i++) {
        metricsService.timing('api_call', 100 + i * 10);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const aggregated = await metricsService.getAggregatedMetrics('1m');
      expect(aggregated.timings.api_call).toBeDefined();
      expect(aggregated.timings.api_call.count).toBe(10);
    });

    it('should support different aggregation windows', async () => {
      metricsService.timing('test_metric', 100);
      
      const oneMinute = await metricsService.getAggregatedMetrics('1m');
      const fiveMinutes = await metricsService.getAggregatedMetrics('5m');
      const oneHour = await metricsService.getAggregatedMetrics('1h');

      expect(oneMinute).toBeDefined();
      expect(fiveMinutes).toBeDefined();
      expect(oneHour).toBeDefined();
    });
  });

  describe('Export Functionality', () => {
    it('should export metrics in Prometheus format', async () => {
      metricsService.increment('http_requests_total', 1, { method: 'GET' });
      metricsService.gauge('cpu_usage_percent', 65.5);
      metricsService.timing('response_time_ms', 150);

      const exported = await metricsService.exportMetrics('prometheus');
      
      expect(exported).toContain('http_requests_total{method="GET"}');
      expect(exported).toContain('cpu_usage_percent 65.5');
      expect(exported).toContain('response_time_ms_count');
      expect(exported).toContain('response_time_ms_sum');
    });

    it('should export metrics in JSON format', async () => {
      metricsService.increment('counter_metric', 5);
      metricsService.gauge('gauge_metric', 42.5);

      const exported = await metricsService.exportMetrics('json');
      const parsed = JSON.parse(exported);

      expect(parsed.counters.counter_metric.value).toBe(5);
      expect(parsed.gauges.gauge_metric.value).toBe(42.5);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should export metrics in OpenTelemetry format', async () => {
      metricsService.increment('otel_counter', 3);
      metricsService.timing('otel_duration', 250);

      const exported = await metricsService.exportMetrics('opentelemetry');
      const parsed = JSON.parse(exported);

      expect(parsed.resourceMetrics).toBeDefined();
      expect(parsed.resourceMetrics[0].instrumentationLibraryMetrics).toBeDefined();
    });
  });

  describe('Health Monitoring', () => {
    it('should provide health status', async () => {
      const health = await metricsService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.details).toEqual(
        expect.objectContaining({
          collection_enabled: true,
          metrics_count: expect.any(Number),
          last_collection: expect.any(String),
          memory_usage: expect.any(Number)
        })
      );
    });

    it('should detect unhealthy conditions', async () => {
      // Fill up metrics to exceed limits
      for (let i = 0; i < 15000; i++) {
        metricsService.increment(`test_metric_${i}`);
      }

      const health = await metricsService.getHealthStatus();
      expect(health.status).toBe('degraded');
      expect(health.details.warnings).toContain('High metrics count');
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean up old metrics', async () => {
      metricsService.increment('old_metric', 1);
      
      // Simulate old timestamp
      const metrics = metricsService.getMetrics();
      if (metrics.counters.old_metric) {
        (metrics.counters.old_metric as any).timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      }

      await metricsService.cleanup();

      const cleanedMetrics = metricsService.getMetrics();
      expect(cleanedMetrics.counters.old_metric).toBeUndefined();
    });

    it('should reset all metrics', async () => {
      metricsService.increment('counter', 5);
      metricsService.gauge('gauge', 42);
      metricsService.timing('timing', 100);

      await metricsService.reset();

      const metrics = metricsService.getMetrics();
      expect(Object.keys(metrics.counters)).toHaveLength(0);
      expect(Object.keys(metrics.gauges)).toHaveLength(0);
      expect(Object.keys(metrics.timings)).toHaveLength(0);
    });

    it('should optimize storage', async () => {
      // Add many metrics
      for (let i = 0; i < 1000; i++) {
        metricsService.increment(`metric_${i}`, 1);
      }

      const beforeOptimization = metricsService.getMetrics();
      const beforeCount = Object.keys(beforeOptimization.counters).length;

      await metricsService.optimize();

      const afterOptimization = metricsService.getMetrics();
      const afterCount = Object.keys(afterOptimization.counters).length;

      // Optimization might consolidate or remove unused metrics
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metric names', () => {
      expect(() => {
        metricsService.increment('', 1);
      }).not.toThrow();

      expect(() => {
        metricsService.increment(null as any, 1);
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle invalid metric values', () => {
      expect(() => {
        metricsService.gauge('test', NaN);
      }).not.toThrow();

      expect(() => {
        metricsService.timing('test', Infinity);
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle export errors gracefully', async () => {
      // Mock an export that would fail
      const result = await metricsService.exportMetrics('invalid-format' as any);
      
      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});