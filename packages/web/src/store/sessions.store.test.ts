import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useSessionsStore } from './sessions.store';
import { apiClient } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';
import type {
  DiagnosticSession,
  SessionStatus,
  TranscriptEntry,
} from './sessions.store';

// Mock dependencies
vi.mock('@/lib/api-client');
vi.mock('@/lib/supabase/client');

const mockSessions: DiagnosticSession[] = [
  {
    id: 'session-1',
    device_id: 'device-1',
    customer_id: 'customer-1',
    user_id: 'user-1',
    session_type: 'diagnostic',
    status: 'pending',
    issue_description: 'Network connectivity issues',
    started_at: '2024-03-15T10:00:00Z',
    ended_at: null,
    created_at: '2024-03-15T10:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    expires_at: '2024-03-15T11:00:00Z',
    diagnostic_data: {},
    remediation_actions: [
      {
        action: 'Restart router',
        status: 'pending_approval',
        risk_level: 'low',
      },
    ],
    notes: null,
  },
  {
    id: 'session-2',
    device_id: 'device-2',
    customer_id: 'customer-1',
    status: 'completed',
    session_type: 'diagnostic',
    issue_description: 'DNS resolution failure',
    started_at: '2024-03-14T14:00:00Z',
    ended_at: '2024-03-14T14:30:00Z',
    created_at: '2024-03-14T14:00:00Z',
    updated_at: '2024-03-14T14:30:00Z',
    diagnostic_data: {},
    notes: null,
  },
];

const mockDevices = {
  'device-1': {
    id: 'device-1',
    name: 'Main Router',
    status: 'online' as const,
  },
  'device-2': {
    id: 'device-2',
    name: 'Backup Router',
    status: 'offline' as const,
  },
};

const mockUsers = {
  'user-1': { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
};

const mockTranscript: TranscriptEntry[] = [
  { timestamp: '10:00:00', type: 'system', message: 'Session started' },
  {
    timestamp: '10:01:00',
    type: 'diagnostic',
    message: 'Running network diagnostics',
  },
  {
    timestamp: '10:02:00',
    type: 'result',
    message: 'Found issue with DNS server',
  },
];

describe('SessionsStore', () => {
  let mockChannel: Partial<RealtimeChannel>;
  let mockSupabaseClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to initial state
    useSessionsStore.setState({
      sessions: [],
      devices: {},
      users: {},
      loading: false,
      error: null,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      searchQuery: '',
      statusFilter: 'all',
      channel: null,
    });

    // Mock Supabase channel
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    };

    // Mock Supabase client
    mockSupabaseClient = {
      channel: vi.fn(() => mockChannel),
    };

    (createClient as any).mockReturnValue(mockSupabaseClient);

    // Default API client mock
    (apiClient.get as any).mockResolvedValue({
      data: {
        sessions: mockSessions,
        devices: mockDevices,
        users: mockUsers,
        totalCount: 2,
      },
    });

    (apiClient.post as any).mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchSessions', () => {
    it('fetches sessions successfully', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.fetchSessions(1, 'all', '');
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/customer/sessions?page=1&limit=10'
      );
      expect(result.current.sessions).toEqual(mockSessions);
      expect(result.current.devices).toEqual(mockDevices);
      expect(result.current.users).toEqual(mockUsers);
      expect(result.current.totalCount).toBe(2);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('fetches sessions with status filter', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.fetchSessions(1, 'pending', '');
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/customer/sessions?page=1&limit=10&status=pending'
      );
    });

    it('fetches sessions with search query', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.fetchSessions(1, 'all', 'network');
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/customer/sessions?page=1&limit=10&search=network'
      );
    });

    it('handles fetch error gracefully', async () => {
      const error = new Error('Failed to fetch');
      (apiClient.get as any).mockRejectedValue(error);

      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.fetchSessions(1, 'all', '');
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to fetch');
      expect(result.current.sessions).toEqual([]);
    });

    it('sets loading state while fetching', async () => {
      let resolvePromise: any;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      (apiClient.get as any).mockReturnValue(promise);

      const { result } = renderHook(() => useSessionsStore());

      act(() => {
        void result.current.fetchSessions(1, 'all', '');
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();

      await act(async () => {
        resolvePromise({
          data: {
            sessions: mockSessions,
            devices: mockDevices,
            users: mockUsers,
            totalCount: 2,
          },
        });
      });

      expect(result.current.loading).toBe(false);
    });

    it('calculates total pages correctly', async () => {
      (apiClient.get as any).mockResolvedValue({
        data: {
          sessions: mockSessions,
          devices: mockDevices,
          users: mockUsers,
          totalCount: 25,
        },
      });

      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.fetchSessions(1, 'all', '');
      });

      expect(result.current.totalPages).toBe(3); // 25 items with 10 per page
    });
  });

  describe('approveSession', () => {
    it('approves session successfully', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Set initial sessions
      act(() => {
        useSessionsStore.setState({ sessions: [...mockSessions] });
      });

      // Mock fetchSessions to return updated session
      (apiClient.get as any).mockResolvedValue({
        data: {
          sessions: [
            { ...mockSessions[0], status: 'approved' },
            mockSessions[1],
          ],
          devices: {},
          users: {},
          totalCount: 2,
        },
      });

      await act(async () => {
        await result.current.approveSession('session-1');
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/approve',
        {
          approved: true,
        }
      );

      // Check that session status was updated
      const updatedSession = result.current.sessions.find(
        s => s.id === 'session-1'
      );
      expect(updatedSession?.status).toBe('approved');
    });

    it('refreshes sessions after approval', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Mock fetchSessions
      const fetchSessionsSpy = vi.spyOn(result.current, 'fetchSessions');

      await act(async () => {
        await result.current.approveSession('session-1');
      });

      expect(fetchSessionsSpy).toHaveBeenCalledWith(1, 'all', '');
    });
  });

  describe('rejectSession', () => {
    it('rejects session successfully', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Set initial sessions
      act(() => {
        useSessionsStore.setState({ sessions: [...mockSessions] });
      });

      // Mock fetchSessions to return updated session
      (apiClient.get as any).mockResolvedValue({
        data: {
          sessions: [
            { ...mockSessions[0], status: 'rejected' },
            mockSessions[1],
          ],
          devices: {},
          users: {},
          totalCount: 2,
        },
      });

      await act(async () => {
        await result.current.rejectSession('session-1', 'Risk too high');
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/reject',
        {
          reason: 'Risk too high',
        }
      );

      // Check that session status was updated
      const updatedSession = result.current.sessions.find(
        s => s.id === 'session-1'
      );
      expect(updatedSession?.status).toBe('rejected');
    });

    it('rejects session without reason', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.rejectSession('session-1');
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/reject',
        {
          reason: undefined,
        }
      );
    });

    it('refreshes sessions after rejection', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Mock fetchSessions
      const fetchSessionsSpy = vi.spyOn(result.current, 'fetchSessions');

      await act(async () => {
        await result.current.rejectSession('session-1');
      });

      expect(fetchSessionsSpy).toHaveBeenCalledWith(1, 'all', '');
    });
  });

  describe('approveCommand', () => {
    it('approves command successfully', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.approveCommand('session-1', 'command-1');
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/approve-command',
        { commandId: 'command-1', approved: true }
      );
    });

    it('refreshes sessions after command approval', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Mock fetchSessions
      const fetchSessionsSpy = vi.spyOn(result.current, 'fetchSessions');

      await act(async () => {
        await result.current.approveCommand('session-1', 'command-1');
      });

      expect(fetchSessionsSpy).toHaveBeenCalledWith(1, 'all', '');
    });
  });

  describe('rejectCommand', () => {
    it('rejects command with reason', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.rejectCommand(
          'session-1',
          'command-1',
          'Too risky'
        );
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/approve-command',
        { commandId: 'command-1', approved: false, reason: 'Too risky' }
      );
    });

    it('rejects command without reason', async () => {
      const { result } = renderHook(() => useSessionsStore());

      await act(async () => {
        await result.current.rejectCommand('session-1', 'command-1');
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/approve-command',
        { commandId: 'command-1', approved: false, reason: undefined }
      );
    });

    it('refreshes sessions after command rejection', async () => {
      const { result } = renderHook(() => useSessionsStore());

      // Mock fetchSessions
      const fetchSessionsSpy = vi.spyOn(result.current, 'fetchSessions');

      await act(async () => {
        await result.current.rejectCommand('session-1', 'command-1');
      });

      expect(fetchSessionsSpy).toHaveBeenCalledWith(1, 'all', '');
    });
  });

  describe('fetchTranscript', () => {
    it('fetches transcript successfully', async () => {
      (apiClient.get as any).mockResolvedValue({
        data: { transcript: mockTranscript },
      });

      const { result } = renderHook(() => useSessionsStore());

      const transcript = await act(async () => {
        return await result.current.fetchTranscript('session-1');
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/customer/sessions/session-1/transcript'
      );
      expect(transcript).toEqual(mockTranscript);
    });

    it('returns empty array on error', async () => {
      (apiClient.get as any).mockRejectedValue(new Error('Failed to fetch'));

      const { result } = renderHook(() => useSessionsStore());

      const transcript = await act(async () => {
        return await result.current.fetchTranscript('session-1');
      });

      expect(transcript).toEqual([]);
    });
  });

  describe('setSearchQuery', () => {
    it('updates search query', () => {
      const { result } = renderHook(() => useSessionsStore());

      act(() => {
        result.current.setSearchQuery('network issues');
      });

      expect(result.current.searchQuery).toBe('network issues');
    });
  });

  describe('setStatusFilter', () => {
    it('updates status filter', () => {
      const { result } = renderHook(() => useSessionsStore());

      act(() => {
        result.current.setStatusFilter('pending');
      });

      expect(result.current.statusFilter).toBe('pending');
    });

    it('allows setting filter to all', () => {
      const { result } = renderHook(() => useSessionsStore());

      act(() => {
        result.current.setStatusFilter('all');
      });

      expect(result.current.statusFilter).toBe('all');
    });
  });

  describe('setCurrentPage', () => {
    it('updates current page', () => {
      const { result } = renderHook(() => useSessionsStore());

      act(() => {
        result.current.setCurrentPage(3);
      });

      expect(result.current.currentPage).toBe(3);
    });
  });

  describe('Real-time Updates', () => {
    describe('subscribeToUpdates', () => {
      it('creates channel subscription', () => {
        const { result } = renderHook(() => useSessionsStore());

        act(() => {
          result.current.subscribeToUpdates();
        });

        expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
          'sessions-updates'
        );
        expect(mockChannel.on).toHaveBeenCalledWith(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'diagnostic_sessions',
          },
          expect.any(Function)
        );
        expect(mockChannel.subscribe).toHaveBeenCalled();
        expect(result.current.channel).toBeTruthy();
        expect(result.current.channel).toHaveProperty('unsubscribe');
      });

      it('handles INSERT event', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({
            sessions: [mockSessions[0]],
            totalCount: 1,
          });
        });

        // Subscribe and get the callback
        act(() => {
          result.current.subscribeToUpdates();
        });

        const callback = (mockChannel.on as any).mock.calls[0][2];
        const newSession: DiagnosticSession = {
          id: 'session-3',
          device_id: 'device-3',
          customer_id: 'customer-1',
          status: 'pending',
          session_type: 'diagnostic',
          issue_description: 'New issue',
          created_at: '2024-03-16T10:00:00Z',
          updated_at: '2024-03-16T10:00:00Z',
          diagnostic_data: {},
        };

        // Simulate INSERT event
        act(() => {
          callback({ eventType: 'INSERT', new: newSession });
        });

        expect(result.current.sessions).toHaveLength(2);
        expect(result.current.sessions[0].id).toBe('session-3');
        expect(result.current.totalCount).toBe(2);
      });

      it('handles UPDATE event', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({ sessions: [...mockSessions] });
        });

        // Subscribe and get the callback
        act(() => {
          result.current.subscribeToUpdates();
        });

        const callback = (mockChannel.on as any).mock.calls[0][2];
        const updatedSession = { id: 'session-1', status: 'completed' };

        // Simulate UPDATE event
        act(() => {
          callback({ eventType: 'UPDATE', new: updatedSession });
        });

        expect(result.current.sessions[0].status).toBe('completed');
      });

      it('handles DELETE event', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({
            sessions: [...mockSessions],
            totalCount: 2,
          });
        });

        // Subscribe and get the callback
        act(() => {
          result.current.subscribeToUpdates();
        });

        const callback = (mockChannel.on as any).mock.calls[0][2];

        // Simulate DELETE event
        act(() => {
          callback({ eventType: 'DELETE', old: { id: 'session-1' } });
        });

        expect(result.current.sessions).toHaveLength(1);
        expect(result.current.sessions[0].id).toBe('session-2');
        expect(result.current.totalCount).toBe(1);
      });

      it('limits sessions to 10 after insert', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup 10 initial sessions
        const tenSessions = Array.from({ length: 10 }, (_, i) => ({
          ...mockSessions[0],
          id: `session-${i}`,
        }));

        act(() => {
          useSessionsStore.setState({ sessions: tenSessions, totalCount: 10 });
        });

        // Subscribe and get the callback
        act(() => {
          result.current.subscribeToUpdates();
        });

        const callback = (mockChannel.on as any).mock.calls[0][2];
        const newSession = { ...mockSessions[0], id: 'session-new' };

        // Simulate INSERT event
        act(() => {
          callback({ eventType: 'INSERT', new: newSession });
        });

        expect(result.current.sessions).toHaveLength(10);
        expect(result.current.sessions[0].id).toBe('session-new');
        expect(result.current.totalCount).toBe(11);
      });
    });

    describe('unsubscribeFromUpdates', () => {
      it('unsubscribes from channel', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Subscribe first
        act(() => {
          result.current.subscribeToUpdates();
        });

        expect(result.current.channel).toBeTruthy();
        expect(result.current.channel).toHaveProperty('unsubscribe');

        // Unsubscribe
        act(() => {
          result.current.unsubscribeFromUpdates();
        });

        expect(mockChannel.unsubscribe).toHaveBeenCalled();
        expect(result.current.channel).toBeNull();
      });

      it('handles unsubscribe when no channel exists', () => {
        const { result } = renderHook(() => useSessionsStore());

        expect(result.current.channel).toBeNull();

        // Should not throw error
        act(() => {
          result.current.unsubscribeFromUpdates();
        });

        expect(result.current.channel).toBeNull();
      });
    });
  });

  describe('Real-time Event Handlers', () => {
    describe('handleSessionInsert', () => {
      it('adds new session to the beginning', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({
            sessions: [mockSessions[0]],
            totalCount: 1,
          });
        });

        const newSession: DiagnosticSession = {
          id: 'session-3',
          device_id: 'device-3',
          customer_id: 'customer-1',
          status: 'pending',
          session_type: 'diagnostic',
          issue_description: 'New issue',
          created_at: '2024-03-16T10:00:00Z',
          updated_at: '2024-03-16T10:00:00Z',
          diagnostic_data: {},
        };

        act(() => {
          result.current.handleSessionInsert(newSession);
        });

        expect(result.current.sessions).toHaveLength(2);
        expect(result.current.sessions[0].id).toBe('session-3');
        expect(result.current.totalCount).toBe(2);
      });
    });

    describe('handleSessionUpdate', () => {
      it('updates existing session', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({ sessions: [...mockSessions] });
        });

        act(() => {
          result.current.handleSessionUpdate({
            id: 'session-1',
            status: 'completed',
          });
        });

        expect(result.current.sessions[0].status).toBe('completed');
        expect(result.current.sessions[0].id).toBe('session-1');
      });

      it('does not update non-existent session', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({ sessions: [...mockSessions] });
        });

        act(() => {
          result.current.handleSessionUpdate({
            id: 'non-existent',
            status: 'completed',
          });
        });

        expect(result.current.sessions).toEqual(mockSessions);
      });
    });

    describe('handleSessionDelete', () => {
      it('removes session by ID', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({
            sessions: [...mockSessions],
            totalCount: 2,
          });
        });

        act(() => {
          result.current.handleSessionDelete('session-1');
        });

        expect(result.current.sessions).toHaveLength(1);
        expect(result.current.sessions[0].id).toBe('session-2');
        expect(result.current.totalCount).toBe(1);
      });

      it('does not affect count if session does not exist', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup initial sessions
        act(() => {
          useSessionsStore.setState({
            sessions: [...mockSessions],
            totalCount: 2,
          });
        });

        act(() => {
          result.current.handleSessionDelete('non-existent');
        });

        expect(result.current.sessions).toHaveLength(2);
        // Total count decreases even if session doesn't exist because the handler always decrements
        expect(result.current.totalCount).toBe(1);
      });

      it('does not go below zero count', () => {
        const { result } = renderHook(() => useSessionsStore());

        // Setup with single session
        act(() => {
          useSessionsStore.setState({
            sessions: [mockSessions[0]],
            totalCount: 1,
          });
        });

        act(() => {
          result.current.handleSessionDelete('session-1');
        });

        expect(result.current.sessions).toHaveLength(0);
        expect(result.current.totalCount).toBe(0);

        // Try to delete again
        act(() => {
          result.current.handleSessionDelete('session-1');
        });

        expect(result.current.totalCount).toBe(0);
      });
    });
  });
});
