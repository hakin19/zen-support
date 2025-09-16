/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import { query } from '@anthropic-ai/claude-code';

import { AIOrchestrator } from './ai-orchestrator.service';
import { sanitizeObject } from '../../utils/pii-sanitizer';
import { SDKOptionsFactory } from '../config/sdk-options.config';

// Mock the dependencies
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn(),
}));

vi.mock('../../utils/pii-sanitizer', () => ({
  sanitizeObject: vi.fn(obj => obj), // Default pass-through for most tests
  sanitizeForDatabase: vi.fn(obj => obj),
  createMinimalBroadcastPayload: vi.fn(),
}));

vi.mock('../config/sdk-options.config', () => ({
  SDKOptionsFactory: {
    createDiagnosticOptions: vi.fn(() => ({ permissionMode: 'plan' })),
    createRemediationOptions: vi.fn(() => ({ permissionMode: 'default' })),
  },
}));

describe('AIOrchestrator - PII Sanitization', () => {
  let orchestrator: AIOrchestrator;
  let mockQuery: any;

  beforeEach(() => {
    orchestrator = new AIOrchestrator();
    mockQuery = vi.mocked(query);
    vi.mocked(sanitizeObject).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeDiagnostics', () => {
    it('should sanitize diagnostic data before passing to SDK query', async () => {
      // Arrange
      const diagnosticPrompt = {
        input: {
          deviceId: 'device-123',
          deviceType: 'router',
          symptoms: ['Network connectivity issues'],
          diagnosticData: {
            pingResults: {
              host: '192.168.1.100',
              email: 'admin@example.com',
              token: 'api_key=secret123',
            },
            traceroute: [],
            dnsResolution: {},
            networkInterfaces: {},
            connectionStatus: 'connected',
          },
        },
      };

      const sanitizedData = {
        deviceId: 'device-123',
        deviceType: 'router',
        symptoms: [],
        diagnosticData: {
          pingResults: {
            host: '192.168.*.*',
            email: '<EMAIL_REDACTED>',
            token: '<API_KEY_REDACTED>',
          },
          traceroute: [],
          dnsResolution: {},
          networkInterfaces: {},
          connectionStatus: 'connected',
        },
      };

      // Setup mock to return sanitized data
      vi.mocked(sanitizeObject).mockReturnValue(sanitizedData as any);

      // Setup mock query response
      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'system', subtype: 'init' };
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.analyzeDiagnostics(
        diagnosticPrompt as any,
        'session-123'
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalledWith(diagnosticPrompt.input);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('<EMAIL_REDACTED>'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('admin@example.com'),
        })
      );
    });

    it('should sanitize IP addresses but keep private ranges partially visible', async () => {
      // Arrange
      const diagnosticPrompt = {
        input: {
          deviceId: 'device-456',
          deviceType: 'switch',
          symptoms: ['Packet loss'],
          diagnosticData: {
            pingResults: [
              { host: '8.8.8.8', latency: 25 }, // Public IP
              { host: '192.168.1.100', latency: 5 }, // Private IP
              { host: '10.0.0.1', latency: 3 }, // Private IP
            ],
          },
        },
      };

      const sanitizedData = {
        deviceId: 'device-123',
        deviceType: 'router',
        symptoms: [],
        diagnosticData: {
          pingResults: [
            { host: '<IP_REDACTED>', latency: 25 },
            { host: '192.168.*.*', latency: 5 },
            { host: '10.0.*.*', latency: 3 },
          ],
        },
      };

      vi.mocked(sanitizeObject).mockReturnValue(sanitizedData as any);

      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.analyzeDiagnostics(
        diagnosticPrompt as any,
        'session-456'
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('<IP_REDACTED>'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('8.8.8.8'),
        })
      );
    });

    it('should sanitize sensitive tokens and credentials', async () => {
      // Arrange
      const diagnosticPrompt = {
        input: {
          deviceId: 'device-789',
          deviceType: 'firewall',
          symptoms: ['Authentication failure'],
          diagnosticData: {
            authLogs: {
              apiKey: 'sk-ant-api03-secret-key-123',
              password: 'SuperSecret123!',
              awsKey: 'AKIAIOSFODNN7EXAMPLE',
              sshKey:
                '-----BEGIN PRIVATE KEY-----\nMIIEvQIBAD...\n-----END PRIVATE KEY-----',
            },
          },
        },
      };

      const sanitizedData = {
        authLogs: {
          apiKey: '<REDACTED>',
          password: '<REDACTED>',
          awsKey: '<AWS_KEY_REDACTED>',
          sshKey: '<PRIVATE_KEY_REDACTED>',
        },
      };

      vi.mocked(sanitizeObject).mockReturnValue(sanitizedData as any);

      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.analyzeDiagnostics(
        diagnosticPrompt as any,
        'session-789'
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('sk-ant-api03'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('SuperSecret123'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('AKIAIOSFODNN7EXAMPLE'),
        })
      );
    });
  });

  describe('generateRemediation', () => {
    it('should sanitize remediation data before passing to SDK', async () => {
      // Arrange
      const remediationPrompt = {
        input: {
          issue: 'Network outage',
          rootCause: 'DNS misconfiguration at admin@company.com server',
          targetDevice: {
            hostname: 'router.internal.local',
            managementIP: '10.0.0.1',
            contactEmail: 'network-admin@company.com',
          },
          constraints: {
            maxExecutionTime: 300,
            rollbackRequired: true,
          },
        },
      };

      const sanitizedInput = {
        issue: 'Network outage',
        rootCause: 'DNS misconfiguration at <EMAIL_REDACTED> server',
        targetDevice: {
          hostname: 'router.internal.local',
          managementIP: '10.0.*.*',
          contactEmail: '<EMAIL_REDACTED>',
        },
        constraints: {
          maxExecutionTime: 300,
          rollbackRequired: true,
        },
      };

      vi.mocked(sanitizeObject).mockReturnValue(sanitizedInput as any);

      const mockCanUseTool = vi.fn().mockResolvedValue({
        behavior: 'allow',
        updatedInput: {},
      });

      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.generateRemediation(
        remediationPrompt as any,
        'session-rem-123',
        mockCanUseTool
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalledWith(remediationPrompt.input);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('<EMAIL_REDACTED>'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('network-admin@company.com'),
        })
      );
    });
  });

  describe('analyzePerformance', () => {
    it('should sanitize performance metrics before SDK query', async () => {
      // Arrange
      const performancePrompt = {
        input: {
          metrics: {
            latency: {
              source: '192.168.1.10',
              averageMs: 45,
            },
            throughput: {
              mbps: 850,
            },
            packetLoss: {
              percent: 0.5,
              affectedHost: 'user@192.168.1.20',
            },
            utilization: {
              cpu: 75,
            },
          },
          timeRange: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-01T23:59:59Z',
          },
          thresholds: {
            latencyMs: 50,
            packetLossPercent: 1,
            utilizationPercent: 80,
          },
        },
      };

      const sanitizedMetrics = {
        latency: {
          source: '192.168.*.*',
          averageMs: 45,
        },
        throughput: {
          mbps: 850,
        },
        packetLoss: {
          percent: 0.5,
          affectedHost: '<EMAIL_REDACTED>',
        },
        utilization: {
          cpu: 75,
        },
      };

      vi.mocked(sanitizeObject).mockImplementation((obj: any) => {
        if (obj.latency) {
          return sanitizedMetrics as any;
        }
        return obj;
      });

      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.analyzePerformance(
        performancePrompt as any,
        'session-perf-123'
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalledWith(
        performancePrompt.input.metrics
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('192.168.1.10'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('user@192.168.1.20'),
        })
      );
    });
  });

  describe('analyzeSecurity', () => {
    it('should sanitize security scan results before SDK query', async () => {
      // Arrange
      const securityPrompt = {
        input: {
          scanResults: {
            openPorts: [
              { port: 22, service: 'SSH', host: '203.0.113.1' },
              { port: 443, service: 'HTTPS', host: '10.0.0.5' },
            ],
            vulnerabilities: [
              {
                id: 'CVE-2024-12345',
                affectedHost: 'admin@vulnerable-server.com',
                severity: 'HIGH',
              },
            ],
          },
          complianceRequirements: ['PCI-DSS', 'HIPAA'],
        },
      };

      const sanitizedScanResults = {
        openPorts: [
          { port: 22, service: 'SSH', host: '<IP_REDACTED>' },
          { port: 443, service: 'HTTPS', host: '10.0.*.*' },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2024-12345',
            affectedHost: '<EMAIL_REDACTED>',
            severity: 'HIGH',
          },
        ],
      };

      vi.mocked(sanitizeObject).mockImplementation((obj: any) => {
        if (obj.openPorts) {
          return sanitizedScanResults as any;
        }
        return obj;
      });

      const mockGenerator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'result', subtype: 'success' };
        },
      };
      mockQuery.mockReturnValue(mockGenerator);

      // Act
      const messages = [];
      for await (const message of orchestrator.analyzeSecurity(
        securityPrompt as any,
        'session-sec-123'
      )) {
        messages.push(message);
      }

      // Assert
      expect(sanitizeObject).toHaveBeenCalledWith(
        securityPrompt.input.scanResults
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('203.0.113.1'),
        })
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.not.stringContaining('admin@vulnerable-server.com'),
        })
      );
    });
  });
});
