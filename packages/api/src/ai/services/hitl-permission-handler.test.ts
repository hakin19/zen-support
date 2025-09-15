import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-code';

// Mock getSupabaseAdminClient
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

// Mock WebSocket connection manager
vi.mock('../../routes/websocket', () => ({
  getConnectionManager: vi.fn(() => ({
    getConnectionsByType: vi.fn(() => []),
    broadcast: vi.fn(),
  })),
}));

import { HITLPermissionHandler } from './hitl-permission-handler.service';

describe('HITLPermissionHandler Error Handling', () => {
  let handler: HITLPermissionHandler;
  let mockSupabase: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mock Supabase client
    const { getSupabaseAdminClient } = await import(
      '@aizen/shared/utils/supabase-client'
    );

    // Set up the mock structure
    mockSupabase = {
      from: vi.fn(),
    };

    (getSupabaseAdminClient as any).mockReturnValue(mockSupabase);

    handler = new HITLPermissionHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('auditApprovalRequest error handling', () => {
    it('should throw error when database insert fails', async () => {
      // Mock database error
      const dbError = {
        message: 'Database connection failed',
        code: 'CONNECTION_ERROR',
      };

      // First mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Second mock for insert (audit request)
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: dbError, data: null }),
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Attempt to use tool that requires approval
      const promise = canUseTool('dangerous_tool', { command: 'rm -rf /' }, {});

      // Should reject with error
      await expect(promise).rejects.toThrow(
        'Failed to audit approval request: Database connection failed'
      );
    });

    it('should log error details when audit fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock database error
      const dbError = {
        message: 'Unique constraint violation',
        code: '23505',
      };

      // First mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Second mock for insert (audit request)
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: dbError, data: null }),
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Attempt to use tool
      try {
        await canUseTool('test_tool', { data: 'test' }, {});
      } catch {
        // Expected to throw
      }

      // Verify error was logged with context
      expect(consoleSpy).toHaveBeenCalledWith(
        '[HITL] Failed to audit approval request:',
        expect.objectContaining({
          approvalId: expect.any(String),
          sessionId: 'session-123',
          error: 'Unique constraint violation',
          code: '23505',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('updateApprovalStatus error handling', () => {
    it.skip('should throw error when database update fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock successful insert for audit
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null, data: null }),
      });

      // Create approval request
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Start approval request (non-blocking)
      const approvalPromise = canUseTool('test_tool', { data: 'test' }, {});

      // Wait a bit for the approval to be registered
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get the approval ID (first pending approval)
      const pendingApprovals = (handler as any).pendingApprovals;
      const approvalIds = Array.from(pendingApprovals.keys());

      // Check if we have any pending approvals
      expect(approvalIds.length).toBeGreaterThan(0);
      const approvalId = approvalIds[0];
      expect(approvalId).toBeDefined();

      // Mock database error for update BEFORE calling handleApprovalResponse
      const updateError = {
        message: 'Row not found',
        code: 'PGRST116',
      };

      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: updateError })),
        })),
      });

      // Attempt to approve - this should throw an error
      const result = handler.handleApprovalResponse(approvalId, 'approved', {
        reason: 'Test approval',
      });

      await expect(result).rejects.toThrow(
        'Failed to update approval status: Row not found'
      );

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[HITL] Failed to update approval status:',
        expect.objectContaining({
          approvalId,
          status: 'approved',
          error: 'Row not found',
          code: 'PGRST116',
        })
      );

      consoleSpy.mockRestore();

      // Clean up
      try {
        await approvalPromise;
      } catch {
        // Expected to fail
      }
    });
  });

  describe('timestamp consistency', () => {
    it('should use ISO-8601 format for database timestamps', async () => {
      const insertSpy = vi.fn(data =>
        Promise.resolve({ error: null, data: null })
      );

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock for insert (audit request)
      mockSupabase.from.mockReturnValueOnce({
        insert: insertSpy,
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Start approval request
      const promise = canUseTool('test_tool', { data: 'test' }, {});

      // Wait a bit for the audit to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify insert was called with ISO timestamp
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        })
      );

      // Clean up
      const pendingApprovals = (handler as any).pendingApprovals;
      const approvalId = Array.from(pendingApprovals.keys())[0];

      // Mock for update status
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      });

      await handler.handleApprovalResponse(approvalId, 'denied', {});
    });

    it('should maintain both timestamp formats in PendingApproval', () => {
      const timestamps = (handler as any).getTimestamps();

      expect(timestamps).toHaveProperty('timestamp');
      expect(timestamps).toHaveProperty('timestampISO');
      expect(typeof timestamps.timestamp).toBe('number');
      expect(typeof timestamps.timestampISO).toBe('string');
      expect(timestamps.timestampISO).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('error propagation', () => {
    it('should propagate audit errors to caller', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock database error for insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(data =>
          Promise.resolve({
            error: { message: 'Network error', code: 'NETWORK_ERROR' },
            data: null,
          })
        ),
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Should reject with detailed error
      await expect(
        canUseTool('test_tool', { data: 'test' }, {})
      ).rejects.toThrow('Failed to audit approval request: Network error');

      consoleSpy.mockRestore();
    });

    it('should clean up pending approval on audit failure', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock database error for insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(data =>
          Promise.resolve({
            error: { message: 'Timeout', code: 'TIMEOUT' },
            data: null,
          })
        ),
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Attempt approval
      try {
        await canUseTool('test_tool', { data: 'test' }, {});
      } catch {
        // Expected to throw
      }

      // Verify pending approval was cleaned up
      const pendingApprovals = (handler as any).pendingApprovals;
      expect(pendingApprovals.size).toBe(0);

      consoleSpy.mockRestore();
    });
  });

  describe('timeout handling', () => {
    it('should update status to timeout in database when request times out', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock successful insert for audit
      const insertSpy = vi.fn(data =>
        Promise.resolve({ error: null, data: null })
      );
      mockSupabase.from.mockReturnValueOnce({
        insert: insertSpy,
      });

      // Mock successful update for timeout status
      const updateSpy = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }));
      mockSupabase.from.mockReturnValue({
        update: updateSpy,
      });

      // Create canUseTool handler with short timeout
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Start approval request with very short timeout
      const promise = canUseTool(
        'test_tool',
        { data: 'test' },
        { timeout: 50 } // 50ms timeout
      );

      // Wait for timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should reject with timeout error
      await expect(promise).rejects.toThrow('Approval request timed out');

      // Verify update was called with timeout status
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'timeout',
          decision_reason: expect.stringContaining('Request timed out after'),
          decided_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          updated_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
        })
      );

      // Verify pending approval was cleaned up
      const pendingApprovals = (handler as any).pendingApprovals;
      expect(pendingApprovals.size).toBe(0);

      consoleSpy.mockRestore();
    });

    it('should emit timeout event for monitoring', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock successful insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null, data: null }),
      });

      // Mock successful update
      mockSupabase.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      });

      // Create spy for event emission
      const eventSpy = vi.fn();
      handler.on('approval_timeout', eventSpy);

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Start approval request with short timeout
      const promise = canUseTool(
        'critical_tool',
        { action: 'delete' },
        { timeout: 50 }
      );

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify timeout event was emitted
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: expect.stringMatching(/^approval-/),
          sessionId: 'session-123',
          customerId: 'customer-456',
          toolName: 'critical_tool',
          timeout: 50,
        })
      );

      // Clean up
      handler.off('approval_timeout', eventSpy);
      consoleSpy.mockRestore();

      // Await promise to avoid unhandled rejection
      await expect(promise).rejects.toThrow();
    });

    it('should continue with cleanup even if database update fails on timeout', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock for loadPolicies (select query)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      });

      // Mock successful insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null, data: null }),
      });

      // Mock failed update for timeout status
      const updateError = {
        message: 'Connection lost',
        code: 'NETWORK_ERROR',
      };
      mockSupabase.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        })),
      });

      // Create canUseTool handler
      const canUseTool = handler.createCanUseToolHandler(
        'session-123',
        'customer-456'
      );

      // Start approval request with short timeout
      const promise = canUseTool(
        'test_tool',
        { data: 'test' },
        { timeout: 50 }
      );

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still reject with timeout error despite DB failure
      await expect(promise).rejects.toThrow('Approval request timed out');

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[HITL] Failed to update timeout status:',
        expect.objectContaining({
          approvalId: expect.stringMatching(/^approval-/),
          error: expect.stringContaining('Failed to update approval status'),
        })
      );

      // Verify pending approval was still cleaned up
      const pendingApprovals = (handler as any).pendingApprovals;
      expect(pendingApprovals.size).toBe(0);

      consoleSpy.mockRestore();
    });
  });
});
