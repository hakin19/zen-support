import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionsPage from './SessionsPageClient';
import type {
  DiagnosticSession,
  TranscriptEntry,
} from '@/store/sessions.store';

const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const authMock = vi.hoisted(() => {
  const state = {
    user: {
      id: 'user-1',
      email: 'john@example.com',
      role: 'admin' as const,
    },
    session: null,
    organization: null,
    isAuthenticated: true,
    loading: false,
  };

  const store = vi.fn((selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state
  ) as any;

  (store as any).setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial);
  };

  return { state, store };
});

vi.mock('@/store/auth.store', () => ({
  useAuthStore: authMock.store,
}));

const sessionsHoist = vi.hoisted(() => ({ store: vi.fn() }));

vi.mock('@/store/sessions.store', () => ({
  useSessionsStore: sessionsHoist.store,
}));

const authState = authMock.state;
const useAuthStoreMock = authMock.store as any;
const sessionsStoreMock = sessionsHoist.store as any;

const baseSessions: DiagnosticSession[] = [
  {
    id: 'session-1',
    device_id: 'device-1',
    customer_id: 'customer-1',
    user_id: 'user-1',
    session_type: 'diagnostic',
    status: 'pending',
    issue_description: 'Network connectivity issues',
    started_at: '2024-03-15T10:00:00Z',
    created_at: '2024-03-15T10:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    diagnostic_data: {},
    remediation_actions: [
      {
        action: 'Restart router',
        status: 'pending_approval',
        risk_level: 'low',
      },
    ],
  },
  {
    id: 'session-2',
    device_id: 'device-2',
    customer_id: 'customer-1',
    session_type: 'diagnostic',
    status: 'completed',
    issue_description: 'DNS resolution failure',
    started_at: '2024-03-14T14:00:00Z',
    created_at: '2024-03-14T14:00:00Z',
    updated_at: '2024-03-14T14:30:00Z',
    diagnostic_data: {},
  },
];

const devices = {
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

const users = {
  'user-1': { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
  'user-2': { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
};

const transcriptEntries: TranscriptEntry[] = [
  { timestamp: '10:00', type: 'system', message: 'Session started' },
  { timestamp: '10:01', type: 'diagnostic', message: 'Running diagnostics' },
];

const buildStoreState = (overrides: Record<string, unknown> = {}) => {
  const mockFetchSessions = vi.fn().mockResolvedValue(undefined);
  const mockApproveSession = vi.fn().mockResolvedValue(undefined);
  const mockRejectSession = vi.fn().mockResolvedValue(undefined);
  const mockFetchTranscript = vi.fn().mockResolvedValue(transcriptEntries);
  const mockSetSearchQuery = vi.fn();
  const mockSetStatusFilter = vi.fn();
  const mockSetCurrentPage = vi.fn();
  const mockSubscribe = vi.fn();
  const mockUnsubscribe = vi.fn();

  const storeValue = {
    sessions: baseSessions,
    devices,
    users,
    loading: false,
    error: null,
    currentPage: 1,
    totalPages: 2,
    searchQuery: '',
    statusFilter: 'all',
    fetchSessions: mockFetchSessions,
    approveSession: mockApproveSession,
    rejectSession: mockRejectSession,
    fetchTranscript: mockFetchTranscript,
    setSearchQuery: mockSetSearchQuery,
    setStatusFilter: mockSetStatusFilter,
    setCurrentPage: mockSetCurrentPage,
    subscribeToUpdates: mockSubscribe,
    unsubscribeFromUpdates: mockUnsubscribe,
    ...overrides,
  };

  sessionsStoreMock.mockReturnValue(storeValue);

  return {
    mockFetchSessions: storeValue.fetchSessions,
    mockApproveSession: storeValue.approveSession,
    mockRejectSession: storeValue.rejectSession,
    mockFetchTranscript: storeValue.fetchTranscript,
    mockSetSearchQuery: storeValue.setSearchQuery,
    mockSetStatusFilter: storeValue.setStatusFilter,
    mockSetCurrentPage: storeValue.setCurrentPage,
    mockSubscribe: storeValue.subscribeToUpdates,
    mockUnsubscribe: storeValue.unsubscribeFromUpdates,
  };
};

beforeEach(() => {
  mockToast.mockReset();
  sessionsStoreMock.mockReset();
  useAuthStoreMock.setState({
    user: { ...authState.user, role: 'admin' as const },
  });
});

describe('SessionsPage', () => {
  it('renders sessions list with device and user info', () => {
    buildStoreState();
    render(<SessionsPage />);

    const firstRow = screen.getByTestId('session-row-session-1');
    expect(within(firstRow).getByText('Main Router')).toBeInTheDocument();
    expect(within(firstRow).getByText('john@example.com')).toBeInTheDocument();
    expect(
      within(firstRow).getByTestId('status-badge-pending')
    ).toBeInTheDocument();

    const secondRow = screen.getByTestId('session-row-session-2');
    expect(
      within(secondRow).getByTestId('status-badge-completed')
    ).toBeInTheDocument();
  });

  it('debounces search input and updates store query', async () => {
    const { mockSetSearchQuery } = buildStoreState();
    vi.useFakeTimers();

    try {
      render(<SessionsPage />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'latency' } });

      await act(async () => {
        vi.advanceTimersByTime(400);
        await vi.runOnlyPendingTimersAsync();
      });

      expect(mockSetSearchQuery).toHaveBeenCalledWith('latency');
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates status filter when filter button clicked', async () => {
    const { mockSetStatusFilter } = buildStoreState();

    render(<SessionsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Pending Approval' }));

    await waitFor(() => {
      expect(mockSetStatusFilter).toHaveBeenCalledWith('pending');
    });
  });

  it('invokes approveSession when admin confirms approval', async () => {
    const { mockApproveSession } = buildStoreState();

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    fireEvent.click(within(row).getByRole('button', { name: /Approve/i }));

    fireEvent.click(screen.getByRole('button', { name: /Confirm Approval/i }));

    await waitFor(() => {
      expect(mockApproveSession).toHaveBeenCalledWith('session-1');
    });
  });

  it('invokes rejectSession with reason when rejection confirmed', async () => {
    const { mockRejectSession } = buildStoreState();

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    fireEvent.click(within(row).getByRole('button', { name: /Reject/i }));

    const reasonInput = screen.getByLabelText('Rejection Reason');
    await userEvent.type(reasonInput, 'Unsafe command');

    fireEvent.click(screen.getByRole('button', { name: /Confirm Rejection/i }));

    await waitFor(() => {
      expect(mockRejectSession).toHaveBeenCalledWith(
        'session-1',
        'Unsafe command'
      );
    });
  });

  it('opens transcript modal and shows transcript entries', async () => {
    const { mockFetchTranscript } = buildStoreState();

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    fireEvent.click(
      within(row).getByRole('button', { name: /View Transcript/i })
    );

    await waitFor(() => {
      expect(mockFetchTranscript).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Session Transcript')).toBeInTheDocument();
      expect(screen.getByTestId('transcript-system')).toBeInTheDocument();
    });
  });

  it('shows empty state when transcript returns no entries', async () => {
    const { mockFetchTranscript } = buildStoreState({
      fetchTranscript: vi.fn().mockResolvedValue([] as TranscriptEntry[]),
    });

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    fireEvent.click(
      within(row).getByRole('button', { name: /View Transcript/i })
    );

    await waitFor(() => {
      expect(mockFetchTranscript).toHaveBeenCalledWith('session-1');
      expect(
        screen.getByText('No transcript available for this session')
      ).toBeInTheDocument();
    });
  });

  it('hides approve/reject buttons for non-admin users', () => {
    useAuthStoreMock.setState({
      user: { ...authState.user, role: 'viewer' as const },
    });
    buildStoreState();

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    expect(
      within(row).queryByRole('button', { name: /Approve/i })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Reject/i })
    ).not.toBeInTheDocument();
  });

  it('is resilient when transcript returns undefined', async () => {
    const { mockFetchTranscript } = buildStoreState({
      fetchTranscript: vi.fn().mockResolvedValue(undefined),
    });

    render(<SessionsPage />);

    const row = screen.getByTestId('session-row-session-1');
    fireEvent.click(
      within(row).getByRole('button', { name: /View Transcript/i })
    );

    await waitFor(() => {
      expect(mockFetchTranscript).toHaveBeenCalledWith('session-1');
      expect(
        screen.getByText('No transcript available for this session')
      ).toBeInTheDocument();
    });
  });
});
