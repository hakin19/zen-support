/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-code';

// Mock getSupabaseAdminClient
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: null,
          error: null,
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: [],
            error: null,
          })),
          single: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

// Mock WebSocketConnectionManager
const mockConnectionManager = {
  getConnectionsByType: vi.fn(() => []),
  broadcast: vi.fn(),
  broadcastToCustomer: vi.fn(),
};

// Mock NetworkMCPTools
vi.mock('../tools/network-mcp-tools', () => ({
  NetworkMCPTools: class MockNetworkMCPTools {
    isReadOnlyTool(toolName: string): boolean {
      return ['Read', 'Glob', 'Grep'].includes(toolName);
    }
  },
}));

import { HITLPermissionHandler } from './hitl-permission-handler.service';

describe('HITLPermissionHandler - Policy Validation', () => {
  let handler: HITLPermissionHandler;
  let canUseTool: CanUseTool;
  const sessionId = 'session-123';
  const customerId = 'customer-456';

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new HITLPermissionHandler(mockConnectionManager as any);
    canUseTool = handler.createCanUseToolHandler(sessionId, customerId);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canUseTool handler creation', () => {
    it('should create a bound canUseTool handler for a session', () => {
      expect(canUseTool).toBeDefined();
      expect(typeof canUseTool).toBe('function');
    });

    it('should store session-customer mapping', () => {
      const anotherSessionId = 'session-789';
      const anotherCustomerId = 'customer-012';

      const anotherHandler = handler.createCanUseToolHandler(
        anotherSessionId,
        anotherCustomerId
      );

      expect(anotherHandler).toBeDefined();
      // Both handlers should be independent
      expect(canUseTool).not.toBe(anotherHandler);
    });
  });

  describe('Read-only tool auto-approval', () => {
    it('should auto-approve read-only tools without requiring approval', async () => {
      const result = await canUseTool('Read', { file: 'test.txt' }, {});

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({ file: 'test.txt' });
    });

    it('should auto-approve Glob tool', async () => {
      const result = await canUseTool('Glob', { pattern: '*.js' }, {});

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({ pattern: '*.js' });
    });

    it('should auto-approve Grep tool', async () => {
      const result = await canUseTool(
        'Grep',
        { pattern: 'TODO', file: 'app.js' },
        {}
      );

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({ pattern: 'TODO', file: 'app.js' });
    });
  });

  describe('Policy-based approval', () => {
    it('should use auto-approve policy when configured', async () => {
      // Mock policy loading to return auto-approve policy
      const mockPolicy = {
        id: 'policy-1',
        customerId,
        toolName: 'Bash',
        autoApprove: true,
        requiresApproval: false,
        riskThreshold: 'low',
      };

      // Mock the loadPolicies method
      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, [mockPolicy]);
      });

      const result = await canUseTool('Bash', { command: 'ls -la' }, {});

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({ command: 'ls -la' });
    });

    it('should request approval for tools requiring approval', async () => {
      // Mock policy loading to return require-approval policy
      const mockPolicy = {
        id: 'policy-2',
        customerId,
        toolName: 'Write',
        autoApprove: false,
        requiresApproval: true,
        riskThreshold: 'high',
      };

      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, [mockPolicy]);
      });

      // Mock broadcastApprovalRequest to prevent actual broadcast
      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      // Start the approval request (it will timeout or need manual approval)
      const resultPromise = canUseTool(
        'Write',
        { file: 'config.json', content: '{}' },
        {
          timeout: 100, // Short timeout for testing
        } as any
      );

      // Simulate timeout
      await expect(resultPromise).rejects.toThrow('Approval request timed out');
    });

    it('should handle policy with conditions', async () => {
      // Mock policy with conditions
      const mockPolicy = {
        id: 'policy-3',
        customerId,
        toolName: 'Edit',
        autoApprove: false,
        requiresApproval: true,
        riskThreshold: 'medium',
        conditions: {
          maxFileSize: 1000,
          allowedExtensions: ['.txt', '.md'],
        },
      };

      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, [mockPolicy]);
      });

      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const resultPromise = canUseTool(
        'Edit',
        { file: 'readme.md', changes: 'content' },
        {
          timeout: 100,
        } as any
      );

      await expect(resultPromise).rejects.toThrow('Approval request timed out');
    });
  });

  describe('Approval with abort signal', () => {
    it('should handle abort signal during approval request', async () => {
      const abortController = new AbortController();

      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const resultPromise = canUseTool(
        'Write',
        { file: 'test.txt', content: 'data' },
        {
          signal: abortController.signal,
        } as any
      );

      // Abort the request
      setTimeout(() => abortController.abort(), 50);

      await expect(resultPromise).rejects.toThrow('Request aborted');
    });

    it('should reject immediately if signal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Abort before making request

      const resultPromise = canUseTool('Edit', { file: 'test.txt' }, {
        signal: abortController.signal,
      } as any);

      await expect(resultPromise).rejects.toThrow('Request aborted');
    });
  });

  describe('Suggestions handling', () => {
    it('should return suggestions when provided', async () => {
      const suggestions = [
        {
          toolName: 'Read',
          input: { file: 'config.json' },
          reason: 'Read first',
        },
        {
          toolName: 'Edit',
          input: { file: 'config.json' },
          reason: 'Then edit',
        },
      ];

      const result = await canUseTool('Write', { file: 'config.json' }, {
        suggestions,
      } as any);

      expect(result.behavior).toBe('allow');
      expect((result as any).updatedPermissions).toEqual(suggestions);
    });
  });

  describe('Unknown tool handling', () => {
    it('should request approval for unknown tools by default', async () => {
      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, []);
      });

      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resultPromise = canUseTool('UnknownTool', { param: 'value' }, {
        timeout: 100,
      } as any);

      await expect(resultPromise).rejects.toThrow('Approval request timed out');

      expect(warnSpy).toHaveBeenCalledWith(
        'No policy found for tool UnknownTool, defaulting to require approval'
      );

      warnSpy.mockRestore();
    });
  });

  describe('Manual approval flow', () => {
    it('should resolve with allow when manually approved', async () => {
      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const resultPromise = canUseTool('Write', { file: 'test.txt' }, {});

      // Get the pending approval
      await new Promise(resolve => setTimeout(resolve, 10)); // Let the promise register
      const pendingApprovals = (handler as any).pendingApprovals as Map<
        string,
        any
      >;
      const approvalId = Array.from(pendingApprovals.keys())[0];
      const pending = pendingApprovals.get(approvalId);

      // Manually approve
      await handler.handleApprovalResponse(approvalId, 'approved', {
        reason: 'Test approval',
      });

      const result = await resultPromise;
      expect(result.behavior).toBe('allow');
    });

    it('should resolve with deny when manually rejected', async () => {
      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const resultPromise = canUseTool('Edit', { file: 'sensitive.txt' }, {});

      // Get the pending approval
      await new Promise(resolve => setTimeout(resolve, 10));
      const pendingApprovals = (handler as any).pendingApprovals as Map<
        string,
        any
      >;
      const approvalId = Array.from(pendingApprovals.keys())[0];

      // Manually deny
      await handler.handleApprovalResponse(approvalId, 'denied', {
        reason: 'Too risky',
      });

      const result = await resultPromise;
      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain('Too risky');
    });

    it('should handle approval with input modifications', async () => {
      vi.spyOn(handler as any, 'broadcastApprovalRequest').mockResolvedValue(
        undefined
      );

      const originalInput = { file: 'test.txt', content: 'original' };
      const resultPromise = canUseTool('Write', originalInput, {});

      // Get the pending approval
      await new Promise(resolve => setTimeout(resolve, 10));
      const pendingApprovals = (handler as any).pendingApprovals as Map<
        string,
        any
      >;
      const approvalId = Array.from(pendingApprovals.keys())[0];

      // Approve with modifications
      const modifiedInput = { file: 'test.txt', content: 'modified' };
      await handler.handleApprovalResponse(approvalId, 'modify', {
        modifiedInput,
        reason: 'Approved with changes',
      });

      const result = await resultPromise;
      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual(modifiedInput);
    });
  });

  describe('Risk level handling', () => {
    it('should include risk level in approval request', async () => {
      const mockPolicy = {
        id: 'policy-4',
        customerId,
        toolName: 'Bash',
        autoApprove: false,
        requiresApproval: true,
        riskThreshold: 'high',
      };

      vi.spyOn(handler as any, 'loadPolicies').mockImplementation(async () => {
        (handler as any).approvalPolicies.set(customerId, [mockPolicy]);
      });

      const broadcastSpy = vi
        .spyOn(handler as any, 'broadcastApprovalRequest')
        .mockResolvedValue(undefined);

      const resultPromise = canUseTool('Bash', { command: 'rm -rf /' }, {
        riskLevel: 'critical',
        reasoning: 'Dangerous command detected',
        timeout: 100,
      } as any);

      await expect(resultPromise).rejects.toThrow('Approval request timed out');

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          riskLevel: 'critical',
          reasoning: 'Dangerous command detected',
        })
      );
    });
  });
});
