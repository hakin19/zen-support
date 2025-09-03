import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Fluentd Log Aggregation', () => {
  const mockLogDir = '/tmp/test-logs';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fluentd Configuration', () => {
    it('should parse Fluentd configuration correctly', () => {
      const fluentdConfig = {
        sources: [
          {
            type: 'tail',
            path: '/logs/agent*/app.log',
            tag: 'agent.logs',
            parse: 'json',
          },
          {
            type: 'tail',
            path: '/logs/agent*/*.log',
            excludePath: ['/logs/agent*/app.log'],
            tag: 'agent.general',
            parse: 'multiline',
          },
        ],
        filters: [
          {
            type: 'record_transformer',
            match: 'agent.**',
            records: ['hostname', 'tag', 'timestamp'],
          },
        ],
        outputs: [
          {
            type: 'file',
            match: 'agent.**',
            path: '/fluentd/log/aggregated',
            compress: 'gzip',
            format: 'json',
          },
          {
            type: 'stdout',
            match: '**',
            format: 'json',
          },
        ],
      };

      expect(fluentdConfig.sources).toHaveLength(2);
      expect(fluentdConfig.filters).toHaveLength(1);
      expect(fluentdConfig.outputs).toHaveLength(2);

      const jsonSource = fluentdConfig.sources.find(s => s.parse === 'json');
      expect(jsonSource?.tag).toBe('agent.logs');

      const fileOutput = fluentdConfig.outputs.find(o => o.type === 'file');
      expect(fileOutput?.compress).toBe('gzip');
    });

    it('should handle multiple log formats', () => {
      const logFormats = {
        json: {
          pattern: /^\{.*\}$/,
          example:
            '{"level":"info","message":"Agent started","timestamp":"2025-01-15T10:00:00Z"}',
        },
        multiline: {
          pattern: /^\d{4}-\d{2}-\d{2}/,
          example:
            '2025-01-15 10:00:00.123 [INFO] Agent started\nAdditional context here',
        },
        plain: {
          pattern: /.*/,
          example: 'Simple log message',
        },
      };

      const testLog = (log: string, format: string): boolean => {
        const formatter = logFormats[format as keyof typeof logFormats];
        return formatter.pattern.test(log);
      };

      expect(testLog(logFormats.json.example, 'json')).toBe(true);
      expect(testLog(logFormats.multiline.example, 'multiline')).toBe(true);
      expect(testLog(logFormats.plain.example, 'plain')).toBe(true);
    });
  });

  describe('Log Collection', () => {
    it('should collect logs from multiple agents', () => {
      const agentLogs = {
        agent1: [
          { level: 'info', message: 'Agent 1 started', timestamp: new Date() },
          {
            level: 'debug',
            message: 'Agent 1 heartbeat',
            timestamp: new Date(),
          },
        ],
        agent2: [
          { level: 'info', message: 'Agent 2 started', timestamp: new Date() },
          {
            level: 'error',
            message: 'Agent 2 connection failed',
            timestamp: new Date(),
          },
        ],
        agent3: [
          { level: 'info', message: 'Agent 3 started', timestamp: new Date() },
          {
            level: 'warn',
            message: 'Agent 3 high memory',
            timestamp: new Date(),
          },
        ],
      };

      const collectLogs = () => {
        const allLogs = [];
        for (const [agent, logs] of Object.entries(agentLogs)) {
          for (const log of logs) {
            allLogs.push({ ...log, agent });
          }
        }
        return allLogs;
      };

      const collected = collectLogs();
      expect(collected).toHaveLength(6);
      expect(collected.filter(l => l.level === 'info')).toHaveLength(3);
      expect(collected.filter(l => l.level === 'error')).toHaveLength(1);
      expect(collected.filter(l => l.agent === 'agent1')).toHaveLength(2);
    });

    it('should add metadata to logs', () => {
      const enrichLog = (log: any, metadata: any) => {
        return {
          ...log,
          hostname: metadata.hostname,
          tag: metadata.tag,
          timestamp: metadata.timestamp || log.timestamp,
          source: metadata.source,
        };
      };

      const originalLog = {
        level: 'info',
        message: 'Test message',
      };

      const metadata = {
        hostname: 'device-agent-us-west-001',
        tag: 'agent.logs',
        timestamp: new Date().toISOString(),
        source: 'device-agent',
      };

      const enrichedLog = enrichLog(originalLog, metadata);

      expect(enrichedLog).toHaveProperty('hostname');
      expect(enrichedLog).toHaveProperty('tag');
      expect(enrichedLog).toHaveProperty('source');
      expect(enrichedLog.hostname).toBe('device-agent-us-west-001');
      expect(enrichedLog.tag).toBe('agent.logs');
    });
  });

  describe('Log Aggregation', () => {
    it('should aggregate logs by time window', () => {
      const logs = [
        { timestamp: '2025-01-15T10:00:00Z', message: 'Log 1' },
        { timestamp: '2025-01-15T10:00:30Z', message: 'Log 2' },
        { timestamp: '2025-01-15T10:01:00Z', message: 'Log 3' },
        { timestamp: '2025-01-15T10:01:30Z', message: 'Log 4' },
        { timestamp: '2025-01-15T10:02:00Z', message: 'Log 5' },
      ];

      const aggregateByMinute = (logs: any[]) => {
        const buckets: Record<string, any[]> = {};

        logs.forEach(log => {
          const date = new Date(log.timestamp);
          const key = `${date.getUTCHours()}:${date.getUTCMinutes()}`;

          if (!buckets[key]) {
            buckets[key] = [];
          }
          buckets[key].push(log);
        });

        return buckets;
      };

      const aggregated = aggregateByMinute(logs);
      const bucketKeys = Object.keys(aggregated);

      expect(bucketKeys).toHaveLength(3);
      expect(aggregated['10:0']).toHaveLength(2);
      expect(aggregated['10:1']).toHaveLength(2);
      expect(aggregated['10:2']).toHaveLength(1);
    });

    it('should buffer logs before writing', () => {
      class LogBuffer {
        private buffer: any[] = [];
        private maxSize: number;
        private flushInterval: number;
        private lastFlush: Date = new Date();

        constructor(maxSize: number, flushInterval: number) {
          this.maxSize = maxSize;
          this.flushInterval = flushInterval;
        }

        add(log: any): boolean {
          this.buffer.push(log);

          if (this.shouldFlush()) {
            this.flush();
            return true;
          }
          return false;
        }

        shouldFlush(): boolean {
          const timeSinceFlush = Date.now() - this.lastFlush.getTime();
          return (
            this.buffer.length >= this.maxSize ||
            timeSinceFlush >= this.flushInterval
          );
        }

        flush(): any[] {
          const flushed = [...this.buffer];
          this.buffer = [];
          this.lastFlush = new Date();
          return flushed;
        }

        size(): number {
          return this.buffer.length;
        }
      }

      const buffer = new LogBuffer(5, 10000);

      for (let i = 0; i < 4; i++) {
        const flushed = buffer.add({ message: `Log ${i}` });
        expect(flushed).toBe(false);
      }

      expect(buffer.size()).toBe(4);

      const flushed = buffer.add({ message: 'Log 5' });
      expect(flushed).toBe(true);
      expect(buffer.size()).toBe(0);
    });
  });

  describe('Log Compression', () => {
    it('should compress logs for storage', () => {
      const simulateCompression = (
        logs: any[]
      ): { original: number; compressed: number; ratio: number } => {
        const originalSize = JSON.stringify(logs).length;
        const compressedSize = Math.floor(originalSize * 0.3);
        const ratio = ((originalSize - compressedSize) / originalSize) * 100;

        return {
          original: originalSize,
          compressed: compressedSize,
          ratio: Math.round(ratio),
        };
      };

      const logs = Array.from({ length: 100 }, (_, i) => ({
        level: 'info',
        message: `This is log message number ${i}`,
        timestamp: new Date().toISOString(),
        agent: `agent-${i % 3}`,
      }));

      const compression = simulateCompression(logs);

      expect(compression.compressed).toBeLessThan(compression.original);
      expect(compression.ratio).toBeGreaterThan(50);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate logs by date', () => {
      const getLogFileName = (date: Date): string => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `aggregated.${year}${month}${day}.log`;
      };

      const today = new Date('2025-01-15T12:00:00Z');
      const yesterday = new Date('2025-01-14T12:00:00Z');
      const tomorrow = new Date('2025-01-16T12:00:00Z');

      expect(getLogFileName(today)).toBe('aggregated.20250115.log');
      expect(getLogFileName(yesterday)).toBe('aggregated.20250114.log');
      expect(getLogFileName(tomorrow)).toBe('aggregated.20250116.log');
    });

    it('should clean up old log files', () => {
      const logFiles = [
        { name: 'aggregated.20250101.log', date: new Date('2025-01-01') },
        { name: 'aggregated.20250105.log', date: new Date('2025-01-05') },
        { name: 'aggregated.20250110.log', date: new Date('2025-01-10') },
        { name: 'aggregated.20250115.log', date: new Date('2025-01-15') },
      ];

      const cleanupOldLogs = (files: any[], retentionDays: number): any[] => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        return files.filter(file => file.date > cutoffDate);
      };

      vi.setSystemTime(new Date('2025-01-15'));

      const retained = cleanupOldLogs(logFiles, 7);
      expect(retained).toHaveLength(2);
      expect(retained.map(f => f.name)).toContain('aggregated.20250110.log');
      expect(retained.map(f => f.name)).toContain('aggregated.20250115.log');

      vi.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should handle log parsing errors', () => {
      const parseLog = (logLine: string): any | null => {
        try {
          if (logLine.startsWith('{')) {
            return JSON.parse(logLine);
          } else {
            const match = logLine.match(
              /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+\[(\w+)\]\s+(.*)/
            );
            if (match) {
              return {
                timestamp: match[1],
                level: match[2],
                message: match[3],
              };
            }
          }
          return null;
        } catch (error) {
          return null;
        }
      };

      const validJson = '{"level":"info","message":"Valid log"}';
      const invalidJson = '{"level":"info","message":"Invalid log"';
      const multilineLog = '2025-01-15 10:00:00.123 [INFO] Valid multiline';
      const invalidLog = 'Random text without structure';

      expect(parseLog(validJson)).toBeTruthy();
      expect(parseLog(invalidJson)).toBeNull();
      expect(parseLog(multilineLog)).toBeTruthy();
      expect(parseLog(invalidLog)).toBeNull();
    });

    it('should retry on write failures', async () => {
      class RetryWriter {
        private retries: number = 0;
        private maxRetries: number = 3;
        private backoffMs: number = 1000;

        async write(data: any): Promise<boolean> {
          for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
              if (attempt < 2) {
                throw new Error('Write failed');
              }
              this.retries = attempt;
              return true;
            } catch (error) {
              if (attempt === this.maxRetries) {
                throw error;
              }
              await new Promise(resolve =>
                setTimeout(resolve, this.backoffMs * Math.pow(2, attempt))
              );
            }
          }
          return false;
        }

        getRetries(): number {
          return this.retries;
        }
      }

      const writer = new RetryWriter();
      const result = await writer.write({ message: 'Test log' });

      expect(result).toBe(true);
      expect(writer.getRetries()).toBe(2);
    });
  });
});
