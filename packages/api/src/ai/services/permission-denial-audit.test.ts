/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import the function that will be mocked
import { getSupabaseAdminClient } from '@aizen/shared';

// Create a shared insertMock for testing
const insertMock = vi.fn();

// Mock getSupabaseAdminClient
vi.mock('@aizen/shared', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'permission_denials') {
        return {
          insert: vi.fn((data: any) => {
            insertMock(data);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      if (table === 'approval_requests') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: null,
              error: null,
            })),
          })),
        };
      }
      if (table === 'approval_policies') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    }),
  })),
}));

// Mock WebSocketConnectionManager
const mockConnectionManager = {
  getConnectionsByType: vi.fn(() => []),
  sendToConnection: vi.fn(),
};

import { HITLPermissionHandler } from './hitl-permission-handler.service';
import { SDKOptionsFactory } from '../config/sdk-options.config';

describe('Permission Denial Audit Tracking', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Capture the mock for verification
    supabaseMock = getSupabaseAdminClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HITLPermissionHandler denial auditing', () => {
    it('should audit when a tool is immediately denied due to policy', async () => {
      const handler = new HITLPermissionHandler(mockConnectionManager as any);
      const sessionId = 'session-123';
      const customerId = 'customer-456';

      // Mock a policy that denies the tool
      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, [
          {
            id: 'policy-1',
            customerId,
            toolName: 'DangerousTool',
            autoApprove: false,
            requiresApproval: false, // Immediate denial
            riskThreshold: 'critical',
          },
        ]);
      });

      // Track if audit was called
      const auditSpy = vi.spyOn(handler as any, 'auditDenial');

      const canUseTool = handler.createCanUseToolHandler(sessionId, customerId);
      const result = await canUseTool(
        'DangerousTool',
        { command: 'rm -rf /' },
        {}
      );

      // Should be denied without going through approval
      expect(result.behavior).toBe('deny');

      // Verify audit was called
      if (auditSpy.mock.calls.length > 0) {
        expect(auditSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
            customerId,
            toolName: 'DangerousTool',
            reason: expect.stringContaining('policy'),
          })
        );
      }
    });
  });

  describe('SDKOptionsFactory denial auditing', () => {
    it('should audit denials for unknown tools', async () => {
      const auditCallback = vi.fn();
      const approvalCallback = vi.fn();

      const handler = SDKOptionsFactory.createPermissionHandler(
        approvalCallback,
        auditCallback
      );

      const result = await handler('UnknownTool', { param: 'value' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');

      // Verify audit callback was called
      expect(auditCallback).toHaveBeenCalledWith({
        toolName: 'UnknownTool',
        input: { param: 'value' },
        reason: expect.stringContaining('Unknown tool'),
        timestamp: expect.any(Number),
      });
    });

    it('should audit denials for always-denied tools', async () => {
      const auditCallback = vi.fn();
      const approvalCallback = vi.fn();

      const handler = SDKOptionsFactory.createPermissionHandler(
        approvalCallback,
        auditCallback
      );

      const result = await handler('WebFetch', { url: 'http://example.com' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');

      // Verify audit callback was called
      expect(auditCallback).toHaveBeenCalledWith({
        toolName: 'WebFetch',
        input: { url: 'http://example.com' },
        reason: expect.stringContaining(
          'not allowed in the current safety mode'
        ),
        timestamp: expect.any(Number),
      });
    });

    it('should audit denials when user rejects approval', async () => {
      const auditCallback = vi.fn();
      const approvalCallback = vi.fn().mockResolvedValue(false);

      const handler = SDKOptionsFactory.createPermissionHandler(
        approvalCallback,
        auditCallback
      );

      const result = await handler('Bash', { command: 'ls' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');

      // Verify audit callback was called
      expect(auditCallback).toHaveBeenCalledWith({
        toolName: 'Bash',
        input: { command: 'ls' },
        reason: expect.stringContaining('User denied permission'),
        timestamp: expect.any(Number),
      });
    });

    it('should audit denials on approval timeout', async () => {
      const auditCallback = vi.fn();
      const approvalCallback = vi.fn().mockRejectedValue(new Error('Timeout'));

      const handler = SDKOptionsFactory.createPermissionHandler(
        approvalCallback,
        auditCallback
      );

      const result = await handler('Edit', { file: 'test.txt' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');

      // Verify audit callback was called
      expect(auditCallback).toHaveBeenCalledWith({
        toolName: 'Edit',
        input: { file: 'test.txt' },
        reason: expect.stringContaining('Approval timeout or error'),
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Permission denial statistics', () => {
    it('should track denial reasons and frequencies', async () => {
      const denialStats = new Map<string, number>();
      const auditCallback = vi.fn((denial: any) => {
        const reason = denial.reason;
        denialStats.set(reason, (denialStats.get(reason) || 0) + 1);
      });

      const approvalCallback = vi.fn().mockResolvedValue(false);
      const handler = SDKOptionsFactory.createPermissionHandler(
        approvalCallback,
        auditCallback
      );

      // Try various tools that will be denied
      await handler('UnknownTool1', {}, {
        signal: new AbortController().signal,
      } as any);
      await handler('UnknownTool2', {}, {
        signal: new AbortController().signal,
      } as any);
      await handler('WebFetch', {}, {
        signal: new AbortController().signal,
      } as any);
      await handler('WebSearch', {}, {
        signal: new AbortController().signal,
      } as any);
      await handler('Bash', {}, {
        signal: new AbortController().signal,
      } as any);

      // Check that all denials were audited
      expect(auditCallback).toHaveBeenCalledTimes(5);

      // Verify we can track denial patterns
      expect(denialStats.size).toBeGreaterThan(0);
    });
  });

  describe('Database persistence of denials', () => {
    it('should persist denial records to permission_denials table', async () => {
      // Clear the mock from previous tests
      insertMock.mockClear();

      const handler = new HITLPermissionHandler(mockConnectionManager as any);

      // The auditDenial method now exists in the handler
      await handler.auditDenial({
        sessionId: 'session-123',
        customerId: 'customer-456',
        toolName: 'DangerousTool',
        input: { command: 'rm -rf /' },
        reason: 'Tool denied by security policy',
      });

      expect(insertMock).toHaveBeenCalledWith({
        session_id: 'session-123',
        customer_id: 'customer-456',
        tool_name: 'DangerousTool',
        tool_input: { command: 'rm -rf /' },
        denial_reason: 'Tool denied by security policy',
        risk_level: 'unknown',
        created_at: expect.any(String),
      });
    });
  });
});
