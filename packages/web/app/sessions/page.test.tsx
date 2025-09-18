import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import SessionsPage from './page';
import { useAuthStore } from '@/store/auth.store';
import { useSessionsStore } from '@/store/sessions.store';
import { useToast } from '@/hooks/use-toast';
import type {
  DiagnosticSession,
  SessionStatus,
  TranscriptEntry,
} from '@/store/sessions.store';

// Mock the stores and hooks
vi.mock('@/store/auth.store');
vi.mock('@/store/sessions.store');
vi.mock('@/hooks/use-toast');

// Mock data
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
  {
    id: 'session-3',
    device_id: 'device-1',
    customer_id: 'customer-1',
    status: 'in_progress',
    session_type: 'diagnostic',
    issue_description: 'Performance degradation',
    started_at: '2024-03-15T09:00:00Z',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T09:30:00Z',
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
  {
    timestamp: '10:03:00',
    type: 'error',
    message: 'Failed to connect to primary DNS',
  },
];

describe('SessionsPage', () => {
  const mockToast = vi.fn();
  const mockFetchSessions = vi.fn();
  const mockApproveSession = vi.fn();
  const mockRejectSession = vi.fn();
  const mockFetchTranscript = vi.fn().mockResolvedValue(mockTranscript);
  const mockSetSearchQuery = vi.fn();
  const mockSetStatusFilter = vi.fn();
  const mockSetCurrentPage = vi.fn();
  const mockSubscribeToUpdates = vi.fn();
  const mockUnsubscribeFromUpdates = vi.fn();
  const mockHandleSessionInsert = vi.fn();
  const mockHandleSessionUpdate = vi.fn();
  const mockHandleSessionDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useToast as any).mockReturnValue({ toast: mockToast });

    (useAuthStore as any).mockReturnValue({
      user: {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin',
      },
    });

    (useSessionsStore as any).mockReturnValue({
      sessions: mockSessions,
      devices: mockDevices,
      users: mockUsers,
      loading: false,
      error: null,
      currentPage: 1,
      totalPages: 3,
      totalCount: 25,
      searchQuery: '',
      statusFilter: 'all',
      channel: null,
      fetchSessions: mockFetchSessions,
      approveSession: mockApproveSession,
      rejectSession: mockRejectSession,
      fetchTranscript: mockFetchTranscript,
      setSearchQuery: mockSetSearchQuery,
      setStatusFilter: mockSetStatusFilter,
      setCurrentPage: mockSetCurrentPage,
      subscribeToUpdates: mockSubscribeToUpdates,
      unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
      handleSessionInsert: mockHandleSessionInsert,
      handleSessionUpdate: mockHandleSessionUpdate,
      handleSessionDelete: mockHandleSessionDelete,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders the sessions page with header', () => {
      render(<SessionsPage />);

      expect(screen.getByText('Sessions Queue')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Manage diagnostic sessions and approve remediation actions'
        )
      ).toBeInTheDocument();
    });

    it('renders the filters section', () => {
      render(<SessionsPage />);

      expect(
        screen.getByPlaceholderText('Search sessions...')
      ).toBeInTheDocument();
      expect(screen.getByText('All Sessions')).toBeInTheDocument();
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('renders the sessions table with correct headers', () => {
      render(<SessionsPage />);

      expect(screen.getByText('Session ID')).toBeInTheDocument();
      expect(screen.getByText('Device')).toBeInTheDocument();
      expect(screen.getByText('User')).toBeInTheDocument();
      expect(screen.getByText('Issue')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('displays sessions data correctly', () => {
      render(<SessionsPage />);

      // Check first session
      expect(
        screen.getByText('session-1...', { exact: false })
      ).toBeInTheDocument();
      expect(
        screen.getByText('Network connectivity issues')
      ).toBeInTheDocument();
      expect(screen.getByText('Main Router')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();

      // Check status badges
      expect(screen.getByTestId('status-badge-pending')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-completed')).toBeInTheDocument();
      expect(
        screen.getByTestId('status-badge-in_progress')
      ).toBeInTheDocument();
    });
  });

  describe('Search and Filter Functionality', () => {
    it('updates search query with debounce', async () => {
      vi.useFakeTimers();

      render(<SessionsPage />);

      const searchInput = screen.getByPlaceholderText('Search sessions...');
      fireEvent.change(searchInput, { target: { value: 'network' } });

      // Advance timers for debounce
      vi.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockSetSearchQuery).toHaveBeenCalledWith('network');
      });

      vi.useRealTimers();
    });

    it('filters sessions by status', async () => {
      render(<SessionsPage />);

      const pendingButton = screen.getByRole('button', {
        name: 'Pending Approval',
      });
      fireEvent.click(pendingButton);

      await waitFor(() => {
        expect(mockSetStatusFilter).toHaveBeenCalledWith('pending');
      });
    });

    it('filters sessions to show only pending ones', () => {
      const pendingSessions = mockSessions.filter(
        s =>
          s.status === 'pending' ||
          s.remediation_actions?.some(a => a.status === 'pending_approval')
      );

      (useSessionsStore as any).mockReturnValue({
        sessions: pendingSessions,
        devices: mockDevices,
        users: mockUsers,
        loading: false,
        error: null,
        currentPage: 1,
        totalPages: 1,
        totalCount: 1,
        searchQuery: '',
        statusFilter: 'pending',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      // Should only show pending session
      expect(
        screen.getByText('session-1...', { exact: false })
      ).toBeInTheDocument();
      expect(
        screen.queryByText('session-2...', { exact: false })
      ).not.toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('displays pagination controls when there are multiple pages', () => {
      render(<SessionsPage />);

      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
      render(<SessionsPage />);

      const previousButton = screen.getByRole('button', { name: /Previous/i });
      expect(previousButton).toBeDisabled();
    });

    it('disables Next button on last page', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: mockSessions,
        devices: mockDevices,
        users: mockUsers,
        loading: false,
        error: null,
        currentPage: 3,
        totalPages: 3,
        totalCount: 25,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeDisabled();
    });

    it('navigates to next page', async () => {
      render(<SessionsPage />);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(mockSetCurrentPage).toHaveBeenCalledWith(2);
      });
    });

    it('navigates to previous page', async () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: mockSessions,
        devices: mockDevices,
        users: mockUsers,
        loading: false,
        error: null,
        currentPage: 2,
        totalPages: 3,
        totalCount: 25,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      const previousButton = screen.getByRole('button', { name: /Previous/i });
      fireEvent.click(previousButton);

      await waitFor(() => {
        expect(mockSetCurrentPage).toHaveBeenCalledWith(1);
      });
    });

    it('hides pagination when there is only one page', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: mockSessions,
        devices: mockDevices,
        users: mockUsers,
        loading: false,
        error: null,
        currentPage: 1,
        totalPages: 1,
        totalCount: 3,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });
  });

  describe('Session Actions', () => {
    it('shows approve and reject buttons for admin users on pending sessions', () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      expect(
        within(sessionRow).getByRole('button', { name: /Approve/ })
      ).toBeInTheDocument();
      expect(
        within(sessionRow).getByRole('button', { name: /Reject/ })
      ).toBeInTheDocument();
    });

    it('hides approve/reject buttons for non-admin users', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: 'user-2',
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'user',
        },
      });

      render(<SessionsPage />);

      const sessionRows = screen.getAllByTestId(/^session-row-/);
      sessionRows.forEach(row => {
        expect(
          within(row).queryByRole('button', { name: /Approve/ })
        ).not.toBeInTheDocument();
        expect(
          within(row).queryByRole('button', { name: /Reject/ })
        ).not.toBeInTheDocument();
      });
    });

    it('opens approval modal when Approve button is clicked', async () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const approveButton = within(sessionRow).getByRole('button', {
        name: /Approve/,
      });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Approve Session Actions?')
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'This will approve all pending remediation actions for this session.'
          )
        ).toBeInTheDocument();
      });
    });

    it('opens rejection modal when Reject button is clicked', async () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const rejectButton = within(sessionRow).getByRole('button', {
        name: /Reject/,
      });
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(screen.getByText('Reject Session Actions?')).toBeInTheDocument();
        expect(
          screen.getByText(
            'This will reject the remediation actions for this session.'
          )
        ).toBeInTheDocument();
      });
    });

    it('handles session approval successfully', async () => {
      mockApproveSession.mockResolvedValueOnce(undefined);

      render(<SessionsPage />);

      // Open approval modal
      const sessionRow = screen.getByTestId('session-row-session-1');
      const approveButton = within(sessionRow).getByRole('button', {
        name: /Approve/,
      });
      fireEvent.click(approveButton);

      // Confirm approval
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', {
          name: /Confirm Approval/i,
        });
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockApproveSession).toHaveBeenCalledWith('session-1');
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Session Approved',
          description: 'Session actions have been approved successfully.',
        });
      });
    });

    it('handles session rejection with reason', async () => {
      mockRejectSession.mockResolvedValueOnce(undefined);

      render(<SessionsPage />);

      // Open rejection modal
      const sessionRow = screen.getByTestId('session-row-session-1');
      const rejectButton = within(sessionRow).getByRole('button', {
        name: /Reject/,
      });
      fireEvent.click(rejectButton);

      // Enter rejection reason
      await waitFor(() => {
        const reasonTextarea = screen.getByPlaceholderText(
          'Optional: Provide a reason for rejection...'
        );
        fireEvent.change(reasonTextarea, {
          target: { value: 'Not authorized for this change' },
        });
      });

      // Confirm rejection
      const confirmButton = screen.getByRole('button', {
        name: /Confirm Rejection/i,
      });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockRejectSession).toHaveBeenCalledWith(
          'session-1',
          'Not authorized for this change'
        );
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Session Rejected',
          description: 'Session actions have been rejected.',
        });
      });
    });

    it('handles approval error gracefully', async () => {
      const error = new Error('Approval failed');
      mockApproveSession.mockRejectedValueOnce(error);

      render(<SessionsPage />);

      // Open approval modal
      const sessionRow = screen.getByTestId('session-row-session-1');
      const approveButton = within(sessionRow).getByRole('button', {
        name: /Approve/,
      });
      fireEvent.click(approveButton);

      // Confirm approval
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', {
          name: /Confirm Approval/i,
        });
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Failed to approve session',
          description: 'Approval failed',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Transcript Modal', () => {
    it('opens transcript modal when View Transcript is clicked', async () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const transcriptButton = within(sessionRow).getByRole('button', {
        name: /View Transcript/i,
      });
      fireEvent.click(transcriptButton);

      await waitFor(() => {
        expect(screen.getByText('Session Transcript')).toBeInTheDocument();
        expect(
          screen.getByText('Detailed log of session activities and diagnostics')
        ).toBeInTheDocument();
      });
    });

    it('displays transcript entries with correct styling', async () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const transcriptButton = within(sessionRow).getByRole('button', {
        name: /View Transcript/i,
      });
      fireEvent.click(transcriptButton);

      await waitFor(() => {
        expect(screen.getByTestId('transcript-system')).toBeInTheDocument();
        expect(screen.getByTestId('transcript-diagnostic')).toBeInTheDocument();
        expect(screen.getByTestId('transcript-result')).toBeInTheDocument();
        expect(screen.getByTestId('transcript-error')).toBeInTheDocument();
      });

      // Check transcript content
      expect(screen.getByText('Session started')).toBeInTheDocument();
      expect(
        screen.getByText('Running network diagnostics')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Found issue with DNS server')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Failed to connect to primary DNS')
      ).toBeInTheDocument();
    });

    it('shows loading state while fetching transcript', async () => {
      mockFetchTranscript.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const transcriptButton = within(sessionRow).getByRole('button', {
        name: /View Transcript/i,
      });
      fireEvent.click(transcriptButton);

      await waitFor(() => {
        expect(screen.getByText('Session Transcript')).toBeInTheDocument();
      });

      // Should show loading spinner
      const modal = screen.getByRole('dialog');
      expect(modal.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('handles transcript fetch error gracefully', async () => {
      mockFetchTranscript.mockRejectedValueOnce(
        new Error('Failed to fetch transcript')
      );

      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const transcriptButton = within(sessionRow).getByRole('button', {
        name: /View Transcript/i,
      });
      fireEvent.click(transcriptButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Failed to load transcript',
          description: 'Failed to fetch transcript',
          variant: 'destructive',
        });
      });
    });

    it('displays empty state when no transcript is available', async () => {
      mockFetchTranscript.mockResolvedValueOnce([]);

      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const transcriptButton = within(sessionRow).getByRole('button', {
        name: /View Transcript/i,
      });
      fireEvent.click(transcriptButton);

      await waitFor(() => {
        expect(
          screen.getByText('No transcript available for this session')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('subscribes to updates on mount', () => {
      render(<SessionsPage />);

      expect(mockSubscribeToUpdates).toHaveBeenCalled();
    });

    it('unsubscribes from updates on unmount', () => {
      const { unmount } = render(<SessionsPage />);

      unmount();

      expect(mockUnsubscribeFromUpdates).toHaveBeenCalled();
    });
  });

  describe('Error States', () => {
    it('displays error state when sessions fail to load', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: [],
        devices: {},
        users: {},
        loading: false,
        error: 'Failed to connect to server',
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      expect(screen.getByText('Failed to load sessions')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to connect to server')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Retry/i })
      ).toBeInTheDocument();
    });

    it('handles retry on error', async () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: [],
        devices: {},
        users: {},
        loading: false,
        error: 'Network error',
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      const retryButton = screen.getByRole('button', { name: /Retry/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockFetchSessions).toHaveBeenCalledWith(1, 'all', '');
      });
    });
  });

  describe('Loading States', () => {
    it('displays loading state in table when sessions are loading', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: [],
        devices: {},
        users: {},
        loading: true,
        error: null,
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });

    it('shows refresh button with spinning icon when loading', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: mockSessions,
        devices: mockDevices,
        users: mockUsers,
        loading: true,
        error: null,
        currentPage: 1,
        totalPages: 3,
        totalCount: 25,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      const refreshButton = screen.getByRole('button', { name: /Refresh/i });
      expect(refreshButton.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('displays empty state when no sessions are found', () => {
      (useSessionsStore as any).mockReturnValue({
        sessions: [],
        devices: {},
        users: {},
        loading: false,
        error: null,
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      expect(screen.getByText('No sessions found')).toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('refreshes sessions when refresh button is clicked', async () => {
      render(<SessionsPage />);

      const refreshButton = screen.getByRole('button', { name: /Refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockFetchSessions).toHaveBeenCalledWith(1, 'all', '');
      });
    });
  });

  describe('Remediation Actions Display', () => {
    it('shows remediation actions in approval modal', async () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      const approveButton = within(sessionRow).getByRole('button', {
        name: /Approve/,
      });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText('Remediation Actions:')).toBeInTheDocument();
        expect(screen.getByText('Restart router')).toBeInTheDocument();
        expect(screen.getByText('Risk: low')).toBeInTheDocument();
      });
    });
  });

  describe('Permission-based Rendering', () => {
    it('shows approve/reject buttons for owner role', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'owner',
        },
      });

      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      expect(
        within(sessionRow).getByRole('button', { name: /Approve/ })
      ).toBeInTheDocument();
      expect(
        within(sessionRow).getByRole('button', { name: /Reject/ })
      ).toBeInTheDocument();
    });

    it('hides approve/reject buttons for user role', () => {
      (useAuthStore as any).mockReturnValue({
        user: {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'user',
        },
      });

      render(<SessionsPage />);

      const sessionRows = screen.getAllByTestId(/^session-row-/);
      sessionRows.forEach(row => {
        expect(
          within(row).queryByRole('button', { name: /Approve/ })
        ).not.toBeInTheDocument();
        expect(
          within(row).queryByRole('button', { name: /Reject/ })
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Date Formatting', () => {
    it('formats session dates correctly', () => {
      render(<SessionsPage />);

      // The formatDate function should format dates as "MMM DD, HH:MM"
      // Based on the mock data, we should see formatted dates
      expect(
        screen.getByText((content, element) => {
          return element?.textContent?.includes('Mar 15') ?? false;
        })
      ).toBeInTheDocument();
    });
  });

  describe('Device Status Display', () => {
    it('displays device online status correctly', () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      expect(within(sessionRow).getByText('online')).toBeInTheDocument();
    });

    it('displays device offline status correctly', () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-2');
      expect(within(sessionRow).getByText('offline')).toBeInTheDocument();
    });

    it('displays unknown device placeholder', () => {
      const sessionsWithUnknownDevice = [
        {
          ...mockSessions[0],
          device_id: 'unknown-device',
        },
      ];

      (useSessionsStore as any).mockReturnValue({
        sessions: sessionsWithUnknownDevice,
        devices: mockDevices,
        users: mockUsers,
        loading: false,
        error: null,
        currentPage: 1,
        totalPages: 1,
        totalCount: 1,
        searchQuery: '',
        statusFilter: 'all',
        channel: null,
        fetchSessions: mockFetchSessions,
        approveSession: mockApproveSession,
        rejectSession: mockRejectSession,
        fetchTranscript: mockFetchTranscript,
        setSearchQuery: mockSetSearchQuery,
        setStatusFilter: mockSetStatusFilter,
        setCurrentPage: mockSetCurrentPage,
        subscribeToUpdates: mockSubscribeToUpdates,
        unsubscribeFromUpdates: mockUnsubscribeFromUpdates,
        handleSessionInsert: mockHandleSessionInsert,
        handleSessionUpdate: mockHandleSessionUpdate,
        handleSessionDelete: mockHandleSessionDelete,
      });

      render(<SessionsPage />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('User Display', () => {
    it('displays user information correctly', () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-1');
      expect(within(sessionRow).getByText('John Doe')).toBeInTheDocument();
      expect(
        within(sessionRow).getByText('john@example.com')
      ).toBeInTheDocument();
    });

    it('displays System for sessions without user', () => {
      render(<SessionsPage />);

      const sessionRow = screen.getByTestId('session-row-session-2');
      expect(within(sessionRow).getByText('System')).toBeInTheDocument();
    });
  });
});
