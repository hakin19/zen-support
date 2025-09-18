/** Sessions Store - Manages diagnostic session state and real-time updates
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { apiClient } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';

export type SessionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'remediation_pending'
  | 'approved'
  | 'rejected';

export interface RemediationAction {
  action: string;
  status: string;
  script?: string;
  risk_level?: string;
  approved_by?: string | null;
}

export interface DiagnosticSession {
  id: string;
  device_id: string;
  customer_id: string;
  user_id?: string;
  session_type: string;
  status: SessionStatus;
  issue_description?: string | null;
  started_at?: string;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
  diagnostic_data?: Record<string, unknown>;
  remediation_actions?: RemediationAction[] | null;
  notes?: string | null;
}

export interface SessionDevice {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface TranscriptEntry {
  timestamp: string;
  type: 'system' | 'diagnostic' | 'result' | 'error' | 'info';
  message: string;
}

interface SessionsState {
  sessions: DiagnosticSession[];
  devices: Record<string, SessionDevice>;
  users: Record<string, SessionUser>;
  loading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  searchQuery: string;
  statusFilter: SessionStatus | 'all';
  channel: RealtimeChannel | null;

  // Actions
  fetchSessions: (
    page?: number,
    filter?: SessionStatus | 'all',
    search?: string
  ) => Promise<void>;
  approveSession: (sessionId: string) => Promise<void>;
  rejectSession: (sessionId: string, reason?: string) => Promise<void>;
  approveCommand: (sessionId: string, commandId: string) => Promise<void>;
  rejectCommand: (
    sessionId: string,
    commandId: string,
    reason?: string
  ) => Promise<void>;
  fetchTranscript: (sessionId: string) => Promise<TranscriptEntry[]>;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: SessionStatus | 'all') => void;
  setCurrentPage: (page: number) => void;
  subscribeToUpdates: () => void;
  unsubscribeFromUpdates: () => void;

  // Real-time handlers
  handleSessionInsert: (session: DiagnosticSession) => void;
  handleSessionUpdate: (session: Partial<DiagnosticSession>) => void;
  handleSessionDelete: (sessionId: string) => void;
}

export const useSessionsStore = create<SessionsState>()(
  subscribeWithSelector((set, get) => ({
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

    fetchSessions: async (page = 1, filter = 'all', search = '') => {
      set({ loading: true, error: null });

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '10',
        });

        if (filter !== 'all') {
          params.append('status', filter);
        }

        if (search) {
          params.append('search', search);
        }

        const { data } = await apiClient.get<{
          sessions: DiagnosticSession[];
          devices: Record<string, SessionDevice>;
          users: Record<string, SessionUser>;
          totalCount: number;
        }>(`/api/v1/customer/sessions?${params}`);

        set({
          sessions: data.sessions ?? [],
          devices: data.devices ?? {},
          users: data.users ?? {},
          currentPage: page,
          totalPages: Math.ceil((data.totalCount ?? 0) / 10),
          totalCount: data.totalCount ?? 0,
          loading: false,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Failed to fetch sessions',
          loading: false,
        });
      }
    },

    approveSession: async (sessionId: string) => {
      await apiClient.post(`/api/v1/customer/sessions/${sessionId}/approve`, {
        approved: true,
      });

      // Update local state
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === sessionId ? { ...s, status: 'approved' as SessionStatus } : s
        ),
      }));

      // Refresh sessions
      const { currentPage, statusFilter, searchQuery } = get();
      void get().fetchSessions(currentPage, statusFilter, searchQuery);
    },

    rejectSession: async (sessionId: string, reason?: string) => {
      await apiClient.post(`/api/v1/customer/sessions/${sessionId}/reject`, {
        reason,
      });

      // Update local state
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === sessionId ? { ...s, status: 'rejected' as SessionStatus } : s
        ),
      }));

      // Refresh sessions
      const { currentPage, statusFilter, searchQuery } = get();
      void get().fetchSessions(currentPage, statusFilter, searchQuery);
    },

    approveCommand: async (sessionId: string, commandId: string) => {
      await apiClient.post(
        `/api/v1/customer/sessions/${sessionId}/approve-command`,
        { commandId, approved: true }
      );

      // Refresh sessions to get updated command status
      const { currentPage, statusFilter, searchQuery } = get();
      void get().fetchSessions(currentPage, statusFilter, searchQuery);
    },

    rejectCommand: async (
      sessionId: string,
      commandId: string,
      reason?: string
    ) => {
      await apiClient.post(
        `/api/v1/customer/sessions/${sessionId}/approve-command`,
        { commandId, approved: false, reason }
      );

      // Refresh sessions to get updated command status
      const { currentPage, statusFilter, searchQuery } = get();
      void get().fetchSessions(currentPage, statusFilter, searchQuery);
    },

    fetchTranscript: async (sessionId: string) => {
      try {
        const { data } = await apiClient.get<{
          transcript: TranscriptEntry[];
        }>(`/api/v1/customer/sessions/${sessionId}/transcript`);
        return data.transcript ?? [];
      } catch {
        // Failed to fetch transcript - return empty array
        return [];
      }
    },

    setSearchQuery: (query: string) => {
      set({ searchQuery: query });
    },

    setStatusFilter: (filter: SessionStatus | 'all') => {
      set({ statusFilter: filter });
    },

    setCurrentPage: (page: number) => {
      set({ currentPage: page });
    },

    subscribeToUpdates: () => {
      const supabase = createClient();
      const channel = supabase
        .channel('sessions-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'diagnostic_sessions',
          },
          payload => {
            const eventType = payload.eventType;

            if (eventType === 'INSERT' && payload.new) {
              get().handleSessionInsert(payload.new as DiagnosticSession);
            } else if (eventType === 'UPDATE' && payload.new) {
              get().handleSessionUpdate(
                payload.new as Partial<DiagnosticSession>
              );
            } else if (eventType === 'DELETE' && payload.old) {
              const oldSession = payload.old as DiagnosticSession;
              get().handleSessionDelete(oldSession.id);
            }
          }
        )
        .subscribe();

      set({ channel });
    },

    unsubscribeFromUpdates: () => {
      const { channel } = get();
      if (channel) {
        void channel.unsubscribe();
        set({ channel: null });
      }
    },

    handleSessionInsert: (session: DiagnosticSession) => {
      set(state => ({
        sessions: [session, ...state.sessions].slice(0, 10), // Keep only first 10
        totalCount: state.totalCount + 1,
      }));
    },

    handleSessionUpdate: (sessionUpdate: Partial<DiagnosticSession>) => {
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === sessionUpdate.id ? { ...s, ...sessionUpdate } : s
        ),
      }));
    },

    handleSessionDelete: (sessionId: string) => {
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== sessionId),
        totalCount: Math.max(0, state.totalCount - 1),
      }));
    },
  }))
);
