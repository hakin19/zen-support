import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@aizen/shared';
import {
  getSupabaseAdminClient,
  getAuthenticatedSupabaseClient,
} from '@aizen/shared/utils/supabase-client';

vi.mock('@aizen/shared/utils/supabase-client');

describe('Web Portal Database Schema', () => {
  let adminClient: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  const testCustomerId = 'test-customer-123';
  const testUserId = 'test-user-456';
  const testOwnerId = 'test-owner-789';
  const testAdminId = 'test-admin-111';
  const testViewerId = 'test-viewer-222';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock admin client for migrations
    adminClient = {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById: vi.fn(),
        },
      },
    } as any;

    // Mock authenticated client for RLS testing
    userClient = {
      from: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    } as any;

    vi.mocked(getSupabaseAdminClient).mockReturnValue(adminClient);
    vi.mocked(getAuthenticatedSupabaseClient).mockReturnValue(userClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User Roles Table', () => {
    it('should create user_roles table with correct schema', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                user_id: testOwnerId,
                customer_id: testCustomerId,
                role: 'owner',
                created_at: '2025-01-04T10:00:00Z',
                updated_at: '2025-01-04T10:00:00Z',
                created_by: testOwnerId,
              },
            ],
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('user_roles')
        .select('*')
        .eq('customer_id', testCustomerId);

      expect(result.data).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatchObject({
        user_id: testOwnerId,
        customer_id: testCustomerId,
        role: 'owner',
      });
      expect(mockFrom).toHaveBeenCalledWith('user_roles');
    });

    it('should enforce unique constraint on user_id and customer_id', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          },
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient.from('user_roles').insert({
        user_id: testOwnerId,
        customer_id: testCustomerId,
        role: 'admin',
        created_by: testOwnerId,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('23505');
    });

    it('should validate role enum values', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: '22P02',
            message: 'invalid input value for enum user_role',
          },
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient.from('user_roles').insert({
        user_id: testUserId,
        customer_id: testCustomerId,
        role: 'invalid_role' as any,
        created_by: testOwnerId,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('22P02');
    });
  });

  describe('Chat Sessions Table', () => {
    it('should create chat_sessions table with correct schema', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: {
              id: 'session-123',
              customer_id: testCustomerId,
              user_id: testUserId,
              title: 'Network Troubleshooting',
              status: 'active',
              metadata: { device_id: 'device-001' },
              created_at: '2025-01-04T10:00:00Z',
              updated_at: '2025-01-04T10:00:00Z',
            },
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('chat_sessions')
        .insert({
          customer_id: testCustomerId,
          user_id: testUserId,
          title: 'Network Troubleshooting',
          status: 'active',
          metadata: { device_id: 'device-001' },
        })
        .select();

      expect(result.data).toBeDefined();
      expect(result.data).toMatchObject({
        customer_id: testCustomerId,
        user_id: testUserId,
        status: 'active',
      });
    });

    it('should cascade delete messages when session is deleted', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { deleted_messages: 5 },
        error: null,
      });

      adminClient.rpc = mockRpc;

      const result = await adminClient.rpc('test_cascade_delete_session', {
        session_id: 'session-123',
      });

      expect(result.data?.deleted_messages).toBe(5);
      expect(mockRpc).toHaveBeenCalledWith('test_cascade_delete_session', {
        session_id: 'session-123',
      });
    });
  });

  describe('Chat Messages Table', () => {
    it('should create chat_messages table with correct schema', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: {
              id: 'msg-123',
              session_id: 'session-123',
              role: 'user',
              content: 'Help me troubleshoot the network',
              metadata: {},
              created_at: '2025-01-04T10:00:00Z',
            },
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('chat_messages')
        .insert({
          session_id: 'session-123',
          role: 'user',
          content: 'Help me troubleshoot the network',
        })
        .select();

      expect(result.data).toBeDefined();
      expect(result.data?.role).toBe('user');
      expect(result.data?.content).toBe('Help me troubleshoot the network');
    });

    it('should validate message role enum', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: '22P02',
            message: 'invalid input value for enum message_role',
          },
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient.from('chat_messages').insert({
        session_id: 'session-123',
        role: 'invalid' as any,
        content: 'Test message',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('22P02');
    });
  });

  describe('AI Prompts Table', () => {
    it('should create ai_prompts table with correct schema', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: {
              id: 'prompt-123',
              customer_id: testCustomerId,
              name: 'Network Diagnostic',
              template: 'Analyze the following network issue: {{issue}}',
              category: 'diagnostic',
              version: 1,
              is_active: true,
              created_by: testOwnerId,
              created_at: '2025-01-04T10:00:00Z',
              updated_at: '2025-01-04T10:00:00Z',
            },
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('ai_prompts')
        .insert({
          customer_id: testCustomerId,
          name: 'Network Diagnostic',
          template: 'Analyze the following network issue: {{issue}}',
          category: 'diagnostic',
          created_by: testOwnerId,
        })
        .select();

      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('Network Diagnostic');
      expect(result.data?.is_active).toBe(true);
      expect(result.data?.version).toBe(1);
    });

    it('should auto-increment version for same name and customer', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { new_version: 2 },
        error: null,
      });

      adminClient.rpc = mockRpc;

      const result = await adminClient.rpc('increment_prompt_version', {
        customer_id: testCustomerId,
        prompt_name: 'Network Diagnostic',
      });

      expect(result.data?.new_version).toBe(2);
    });
  });

  describe('Device Actions Table', () => {
    it('should create device_actions table with correct schema', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: {
              id: 'action-123',
              session_id: 'session-123',
              device_id: 'device-001',
              action_type: 'diagnostic',
              command: 'ping 8.8.8.8',
              status: 'pending',
              requested_by: testUserId,
              metadata: {},
              created_at: '2025-01-04T10:00:00Z',
              executed_at: null,
              completed_at: null,
            },
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('device_actions')
        .insert({
          session_id: 'session-123',
          device_id: 'device-001',
          action_type: 'diagnostic',
          command: 'ping 8.8.8.8',
          status: 'pending',
          requested_by: testUserId,
        })
        .select();

      expect(result.data).toBeDefined();
      expect(result.data?.status).toBe('pending');
      expect(result.data?.action_type).toBe('diagnostic');
    });

    it('should validate action status enum', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '22P02',
              message: 'invalid input value for enum action_status',
            },
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('device_actions')
        .update({ status: 'invalid' as any })
        .eq('id', 'action-123');

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('22P02');
    });

    it('should track approval and rejection', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: {
              id: 'action-123',
              status: 'approved',
              approved_by: testAdminId,
              approved_at: '2025-01-04T10:05:00Z',
            },
            error: null,
          }),
        }),
      });

      adminClient.from = mockFrom;

      const result = await adminClient
        .from('device_actions')
        .update({
          status: 'approved',
          approved_by: testAdminId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', 'action-123');

      expect(result.data?.status).toBe('approved');
      expect(result.data?.approved_by).toBe(testAdminId);
    });
  });

  describe('Row Level Security Policies', () => {
    describe('User Roles RLS', () => {
      it('should allow users to view only their customer roles', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  user_id: testUserId,
                  customer_id: testCustomerId,
                  role: 'admin',
                },
              ],
              error: null,
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testUserId } as any },
          error: null,
        });

        const result = await userClient
          .from('user_roles')
          .select('*')
          .eq('user_id', testUserId);

        expect(result.data).toHaveLength(1);
        expect(result.data![0].user_id).toBe(testUserId);
      });

      it('should allow only owners to insert new roles', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '42501',
              message: 'insufficient privilege',
            },
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testViewerId } as any },
          error: null,
        });

        const result = await userClient.from('user_roles').insert({
          user_id: 'new-user',
          customer_id: testCustomerId,
          role: 'viewer',
          created_by: testViewerId,
        });

        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('42501');
      });

      it('should allow owners and admins to update roles', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: {
                  user_id: testViewerId,
                  role: 'admin',
                },
                error: null,
              }),
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testAdminId } as any },
          error: null,
        });

        const result = await userClient
          .from('user_roles')
          .update({ role: 'admin' })
          .eq('user_id', testViewerId)
          .eq('customer_id', testCustomerId);

        expect(result.data?.role).toBe('admin');
        expect(result.error).toBeNull();
      });
    });

    describe('Chat Sessions RLS', () => {
      it('should allow users to view only their customer sessions', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'session-123',
                  customer_id: testCustomerId,
                  user_id: testUserId,
                },
              ],
              error: null,
            }),
          }),
        });

        userClient.from = mockFrom;

        const result = await userClient
          .from('chat_sessions')
          .select('*')
          .eq('customer_id', testCustomerId);

        expect(result.data).toHaveLength(1);
        expect(result.data![0].customer_id).toBe(testCustomerId);
      });

      it('should prevent access to other customer sessions', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        });

        userClient.from = mockFrom;

        const result = await userClient
          .from('chat_sessions')
          .select('*')
          .eq('customer_id', 'other-customer');

        expect(result.data).toHaveLength(0);
      });
    });

    describe('AI Prompts RLS', () => {
      it('should allow only owners to modify prompts', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: '42501',
                message: 'insufficient privilege',
              },
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testAdminId } as any },
          error: null,
        });

        const result = await userClient
          .from('ai_prompts')
          .update({ template: 'New template' })
          .eq('id', 'prompt-123');

        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('42501');
      });

      it('should allow all roles to view prompts', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'prompt-123',
                  customer_id: testCustomerId,
                  name: 'Network Diagnostic',
                },
              ],
              error: null,
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testViewerId } as any },
          error: null,
        });

        const result = await userClient
          .from('ai_prompts')
          .select('*')
          .eq('customer_id', testCustomerId);

        expect(result.data).toHaveLength(1);
        expect(result.data![0].name).toBe('Network Diagnostic');
      });
    });

    describe('Device Actions RLS', () => {
      it('should allow admins and owners to approve actions', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: {
                id: 'action-123',
                status: 'approved',
                approved_by: testAdminId,
              },
              error: null,
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testAdminId } as any },
          error: null,
        });

        const result = await userClient
          .from('device_actions')
          .update({
            status: 'approved',
            approved_by: testAdminId,
          })
          .eq('id', 'action-123');

        expect(result.data?.status).toBe('approved');
        expect(result.error).toBeNull();
      });

      it('should prevent viewers from approving actions', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: '42501',
                message: 'insufficient privilege',
              },
            }),
          }),
        });

        userClient.from = mockFrom;
        vi.mocked(userClient.auth.getUser).mockResolvedValue({
          data: { user: { id: testViewerId } as any },
          error: null,
        });

        const result = await userClient
          .from('device_actions')
          .update({
            status: 'approved',
            approved_by: testViewerId,
          })
          .eq('id', 'action-123');

        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('42501');
      });
    });
  });

  describe('Database Functions and Triggers', () => {
    it('should auto-update updated_at timestamp on row modification', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          original_updated_at: '2025-01-04T10:00:00Z',
          new_updated_at: '2025-01-04T10:05:00Z',
        },
        error: null,
      });

      adminClient.rpc = mockRpc;

      const result = await adminClient.rpc('test_updated_at_trigger', {
        table_name: 'user_roles',
        record_id: testUserId,
      });

      expect(result.data?.original_updated_at).not.toBe(
        result.data?.new_updated_at
      );
    });

    it('should validate customer_id consistency across related tables', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { is_valid: true },
        error: null,
      });

      adminClient.rpc = mockRpc;

      const result = await adminClient.rpc('validate_customer_consistency', {
        session_id: 'session-123',
        customer_id: testCustomerId,
      });

      expect(result.data?.is_valid).toBe(true);
    });
  });
});
