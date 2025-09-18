/**
 * Sessions Queue & Approvals Page Tests
 * Test-first implementation for sessions management functionality
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import SessionsPage from './page';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              email: 'admin@test.com',
              user_metadata: {
                role: 'owner',
              },
            },
            access_token: 'test-token',
          },
        },
      }),
    },
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        if (typeof callback === 'function') {
          callback('SUBSCRIBED');
        }
        return {
          unsubscribe: vi.fn(),
        };
      }),
    })),
  })),
}));

// Mock diagnostic session fixtures
const mockSessions = [
  {
    id: 'session-1',
    device_id: 'device-1',
    customer_id: 'customer-1',
    user_id: 'user-1',
    session_type: 'diagnostic',
    status: 'pending',
    issue_description: 'Network connectivity issues',
    started_at: '2025-01-17T10:00:00Z',
    created_at: '2025-01-17T10:00:00Z',
    updated_at: '2025-01-17T10:00:00Z',
    expires_at: '2025-01-17T11:00:00Z',
    diagnostic_data: {
      network_status: 'testing',
      tests_run: ['ping'],
    },
    remediation_actions: [
      {
        action: 'restart_router',
        status: 'pending_approval',
        script: 'sudo systemctl restart networking',
        risk_level: 'low',
      },
    ],
  },
  {
    id: 'session-2',
    device_id: 'device-2',
    customer_id: 'customer-1',
    user_id: 'user-2',
    session_type: 'diagnostic',
    status: 'in_progress',
    issue_description: 'Slow internet speed',
    started_at: '2025-01-17T09:30:00Z',
    created_at: '2025-01-17T09:30:00Z',
    updated_at: '2025-01-17T09:45:00Z',
    diagnostic_data: {
      network_status: 'degraded',
      latency_ms: 250,
      packet_loss: 15,
    },
  },
  {
    id: 'session-3',
    device_id: 'device-3',
    customer_id: 'customer-1',
    user_id: 'user-1',
    session_type: 'diagnostic',
    status: 'completed',
    issue_description: 'DNS resolution failure',
    started_at: '2025-01-17T08:00:00Z',
    ended_at: '2025-01-17T08:30:00Z',
    created_at: '2025-01-17T08:00:00Z',
    updated_at: '2025-01-17T08:30:00Z',
    diagnostic_data: {
      network_status: 'healthy',
      issues_found: [],
      recommendations: ['No issues detected'],
    },
  },
];

// Mock device data
const mockDevices = {
  'device-1': { name: 'Office Router', status: 'online' },
  'device-2': { name: 'Warehouse AP', status: 'online' },
  'device-3': { name: 'Guest Network', status: 'offline' },
};

// Mock user data
const mockUsers = {
  'user-1': { name: 'John Smith', email: 'john@test.com' },
  'user-2': { name: 'Jane Doe', email: 'jane@test.com' },
};

describe('Sessions Queue & Approvals Page', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock API responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/customer/sessions')) {
        if (url.includes('session-1') && url.includes('approve')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sessions: mockSessions,
            devices: mockDevices,
            users: mockUsers,
          }),
        });
      }
      if (url.includes('/api/v1/customer/sessions/') && url.includes('/transcript')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            transcript: [
              { timestamp: '10:00:00', type: 'system', message: 'Session started' },
              { timestamp: '10:00:05', type: 'diagnostic', message: 'Running network diagnostics' },
              { timestamp: '10:00:10', type: 'result', message: 'High latency detected: 250ms' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Queue Display', () => {
    it('should display sessions queue with proper filters', async () => {
      render(<SessionsPage />);

      // Wait for sessions to load
      await waitFor(() => {
        expect(screen.getByText('Sessions Queue')).toBeInTheDocument();
      });

      // Check filter buttons are present
      expect(screen.getByRole('button', { name: /All Sessions/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pending Approval/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /In Progress/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Completed/i })).toBeInTheDocument();

      // Check sessions are displayed
      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
        expect(screen.getByText('Slow internet speed')).toBeInTheDocument();
        expect(screen.getByText('DNS resolution failure')).toBeInTheDocument();
      });
    });

    it('should display status badges correctly', async () => {
      render(<SessionsPage />);

      await waitFor(() => {
        const pendingBadge = screen.getByTestId('status-badge-pending');
        expect(pendingBadge).toHaveTextContent('Pending');
        expect(pendingBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');

        const inProgressBadge = screen.getByTestId('status-badge-in_progress');
        expect(inProgressBadge).toHaveTextContent('In Progress');
        expect(inProgressBadge).toHaveClass('bg-blue-100', 'text-blue-800');

        const completedBadge = screen.getByTestId('status-badge-completed');
        expect(completedBadge).toHaveTextContent('Completed');
        expect(completedBadge).toHaveClass('bg-green-100', 'text-green-800');
      });
    });

    it('should filter sessions when filter buttons are clicked', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
      });

      // Filter by Pending Approval
      await user.click(screen.getByRole('button', { name: /Pending Approval/i }));

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
        expect(screen.queryByText('Slow internet speed')).not.toBeInTheDocument();
        expect(screen.queryByText('DNS resolution failure')).not.toBeInTheDocument();
      });

      // Filter by In Progress
      await user.click(screen.getByRole('button', { name: /In Progress/i }));

      await waitFor(() => {
        expect(screen.queryByText('Network connectivity issues')).not.toBeInTheDocument();
        expect(screen.getByText('Slow internet speed')).toBeInTheDocument();
        expect(screen.queryByText('DNS resolution failure')).not.toBeInTheDocument();
      });

      // Show all sessions again
      await user.click(screen.getByRole('button', { name: /All Sessions/i }));

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
        expect(screen.getByText('Slow internet speed')).toBeInTheDocument();
        expect(screen.getByText('DNS resolution failure')).toBeInTheDocument();
      });
    });

    it('should display session metadata correctly', async () => {
      render(<SessionsPage />);

      await waitFor(() => {
        // Check device names are displayed
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.getByText('Warehouse AP')).toBeInTheDocument();
        expect(screen.getByText('Guest Network')).toBeInTheDocument();

        // Check user info is displayed
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });

  describe('Approval Actions', () => {
    it('should show approve/reject buttons for pending sessions', async () => {
      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        const approveButton = within(pendingSessionRow).getByRole('button', { name: /Approve/i });
        const rejectButton = within(pendingSessionRow).getByRole('button', { name: /Reject/i });

        expect(approveButton).toBeInTheDocument();
        expect(rejectButton).toBeInTheDocument();
      });
    });

    it('should not show approve/reject buttons for non-pending sessions', async () => {
      render(<SessionsPage />);

      await waitFor(() => {
        const inProgressRow = screen.getByTestId('session-row-session-2');
        const completedRow = screen.getByTestId('session-row-session-3');

        expect(within(inProgressRow).queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument();
        expect(within(completedRow).queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument();
      });
    });

    it('should handle session approval', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        const approveButton = within(pendingSessionRow).getByRole('button', { name: /Approve/i });
        expect(approveButton).toBeInTheDocument();
      });

      // Click approve button
      const pendingSessionRow = screen.getByTestId('session-row-session-1');
      await user.click(within(pendingSessionRow).getByRole('button', { name: /Approve/i }));

      // Verify confirmation dialog
      await waitFor(() => {
        expect(screen.getByText('Approve Session Actions?')).toBeInTheDocument();
        expect(screen.getByText(/restart_router/)).toBeInTheDocument();
      });

      // Confirm approval
      await user.click(screen.getByRole('button', { name: /Confirm Approval/i }));

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/customer/sessions/session-1/approve'),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    it('should handle session rejection', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        expect(within(pendingSessionRow).getByRole('button', { name: /Reject/i })).toBeInTheDocument();
      });

      // Click reject button
      const pendingSessionRow = screen.getByTestId('session-row-session-1');
      await user.click(within(pendingSessionRow).getByRole('button', { name: /Reject/i }));

      // Verify confirmation dialog
      await waitFor(() => {
        expect(screen.getByText('Reject Session Actions?')).toBeInTheDocument();
      });

      // Add rejection reason
      const reasonInput = screen.getByLabelText(/Rejection Reason/i);
      await user.type(reasonInput, 'Risk too high for current network state');

      // Confirm rejection
      await user.click(screen.getByRole('button', { name: /Confirm Rejection/i }));

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/customer/sessions/session-1/reject'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Risk too high'),
          })
        );
      });
    });
  });

  describe('Transcript Access', () => {
    it('should allow viewing session transcript', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
      });

      // Click view transcript button
      const sessionRow = screen.getByTestId('session-row-session-1');
      await user.click(within(sessionRow).getByRole('button', { name: /View Transcript/i }));

      // Verify transcript modal
      await waitFor(() => {
        expect(screen.getByText('Session Transcript')).toBeInTheDocument();
        expect(screen.getByText('Session started')).toBeInTheDocument();
        expect(screen.getByText('Running network diagnostics')).toBeInTheDocument();
        expect(screen.getByText('High latency detected: 250ms')).toBeInTheDocument();
      });

      // Close modal
      await user.click(screen.getByRole('button', { name: /Close/i }));

      await waitFor(() => {
        expect(screen.queryByText('Session Transcript')).not.toBeInTheDocument();
      });
    });

    it('should show transcript timestamps and types', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        const sessionRow = screen.getByTestId('session-row-session-1');
        expect(sessionRow).toBeInTheDocument();
      });

      // Open transcript
      const sessionRow = screen.getByTestId('session-row-session-1');
      await user.click(within(sessionRow).getByRole('button', { name: /View Transcript/i }));

      await waitFor(() => {
        // Check for timestamps
        expect(screen.getByText('10:00:00')).toBeInTheDocument();
        expect(screen.getByText('10:00:05')).toBeInTheDocument();
        expect(screen.getByText('10:00:10')).toBeInTheDocument();

        // Check for message type indicators
        const systemMessage = screen.getByTestId('transcript-system');
        const diagnosticMessage = screen.getByTestId('transcript-diagnostic');
        const resultMessage = screen.getByTestId('transcript-result');

        expect(systemMessage).toHaveClass('text-gray-600');
        expect(diagnosticMessage).toHaveClass('text-blue-600');
        expect(resultMessage).toHaveClass('text-green-600');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to session_* websocket events', async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const mockClient = createBrowserClient();

      render(<SessionsPage />);

      await waitFor(() => {
        expect(mockClient.channel).toHaveBeenCalledWith('sessions-updates');
      });

      const channelMock = mockClient.channel('sessions-updates');
      expect(channelMock.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'diagnostic_sessions',
        }),
        expect.any(Function)
      );
    });

    it('should update session status when session_status event received', async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const mockClient = createBrowserClient();

      let websocketCallback: any;
      const channelMock = {
        on: vi.fn().mockImplementation((event, config, callback) => {
          if (config.table === 'diagnostic_sessions') {
            websocketCallback = callback;
          }
          return channelMock;
        }),
        subscribe: vi.fn((callback) => {
          if (typeof callback === 'function') {
            callback('SUBSCRIBED');
          }
          return { unsubscribe: vi.fn() };
        }),
      };

      mockClient.channel = vi.fn(() => channelMock);

      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
      });

      // Simulate WebSocket event for status update
      await websocketCallback({
        eventType: 'UPDATE',
        new: {
          id: 'session-1',
          status: 'approved',
        },
      });

      // Verify the session status is updated
      await waitFor(() => {
        const sessionRow = screen.getByTestId('session-row-session-1');
        const statusBadge = within(sessionRow).getByTestId('status-badge-approved');
        expect(statusBadge).toHaveTextContent('Approved');
      });
    });

    it('should add new session when session_created event received', async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const mockClient = createBrowserClient();

      let websocketCallback: any;
      const channelMock = {
        on: vi.fn().mockImplementation((event, config, callback) => {
          if (config.table === 'diagnostic_sessions') {
            websocketCallback = callback;
          }
          return channelMock;
        }),
        subscribe: vi.fn((callback) => {
          if (typeof callback === 'function') {
            callback('SUBSCRIBED');
          }
          return { unsubscribe: vi.fn() };
        }),
      };

      mockClient.channel = vi.fn(() => channelMock);

      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
      });

      // Simulate WebSocket event for new session
      await websocketCallback({
        eventType: 'INSERT',
        new: {
          id: 'session-4',
          device_id: 'device-4',
          customer_id: 'customer-1',
          status: 'pending',
          issue_description: 'New connectivity issue',
          created_at: '2025-01-17T11:00:00Z',
        },
      });

      // Verify the new session appears
      await waitFor(() => {
        expect(screen.getByText('New connectivity issue')).toBeInTheDocument();
      });
    });

    it('should remove session from queue when approved', async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const mockClient = createBrowserClient();

      let websocketCallback: any;
      const channelMock = {
        on: vi.fn().mockImplementation((event, config, callback) => {
          if (config.table === 'diagnostic_sessions') {
            websocketCallback = callback;
          }
          return channelMock;
        }),
        subscribe: vi.fn((callback) => {
          if (typeof callback === 'function') {
            callback('SUBSCRIBED');
          }
          return { unsubscribe: vi.fn() };
        }),
      };

      mockClient.channel = vi.fn(() => channelMock);

      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
      });

      // Filter to show only pending sessions
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Pending Approval/i }));

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
        expect(screen.queryByText('Slow internet speed')).not.toBeInTheDocument();
      });

      // Simulate WebSocket event for approval
      await websocketCallback({
        eventType: 'UPDATE',
        new: {
          id: 'session-1',
          status: 'approved',
        },
      });

      // Verify the session is removed from pending queue
      await waitFor(() => {
        expect(screen.queryByText('Network connectivity issues')).not.toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('should paginate long session lists', async () => {
      // Mock a large number of sessions
      const manySessions = Array.from({ length: 25 }, (_, i) => ({
        ...mockSessions[0],
        id: `session-${i + 1}`,
        issue_description: `Issue ${i + 1}`,
      }));

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            sessions: manySessions.slice(0, 10), // First page
            totalCount: 25,
            devices: mockDevices,
            users: mockUsers,
          }),
        })
      );

      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Issue 1')).toBeInTheDocument();
        expect(screen.getByText('Issue 10')).toBeInTheDocument();
        expect(screen.queryByText('Issue 11')).not.toBeInTheDocument();
      });

      // Check pagination controls
      expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

      // Navigate to next page
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Next/i }));

      // Mock second page response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            sessions: manySessions.slice(10, 20), // Second page
            totalCount: 25,
            devices: mockDevices,
            users: mockUsers,
          }),
        })
      );

      await waitFor(() => {
        expect(screen.queryByText('Issue 1')).not.toBeInTheDocument();
        expect(screen.getByText('Issue 11')).toBeInTheDocument();
        expect(screen.getByText('Issue 20')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should search sessions by issue description', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Network connectivity issues')).toBeInTheDocument();
        expect(screen.getByText('Slow internet speed')).toBeInTheDocument();
        expect(screen.getByText('DNS resolution failure')).toBeInTheDocument();
      });

      // Type in search input
      const searchInput = screen.getByPlaceholderText(/Search sessions/i);
      await user.type(searchInput, 'DNS');

      // Verify filtered results
      await waitFor(() => {
        expect(screen.queryByText('Network connectivity issues')).not.toBeInTheDocument();
        expect(screen.queryByText('Slow internet speed')).not.toBeInTheDocument();
        expect(screen.getByText('DNS resolution failure')).toBeInTheDocument();
      });
    });

    it('should debounce search input', async () => {
      const user = userEvent.setup();
      render(<SessionsPage />);

      const searchInput = screen.getByPlaceholderText(/Search sessions/i);

      // Type quickly
      await user.type(searchInput, 'test');

      // Should not immediately trigger multiple API calls
      expect(mockFetch).toHaveBeenCalledTimes(1); // Initial load

      // Wait for debounce
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2); // After debounce
      }, { timeout: 400 });
    });
  });

  describe('Role-based Access Control', () => {
    it('should show approve/reject buttons only for owners and admins', async () => {
      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        expect(within(pendingSessionRow).getByRole('button', { name: /Approve/i })).toBeInTheDocument();
      });
    });

    it('should hide approve/reject buttons for regular members', async () => {
      // Mock user with member role
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const mockClient = createBrowserClient();
      mockClient.auth.getSession = vi.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              email: 'member@test.com',
              user_metadata: {
                role: 'member',
              },
            },
            access_token: 'test-token',
          },
        },
      });

      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        expect(within(pendingSessionRow).queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument();
        expect(within(pendingSessionRow).queryByRole('button', { name: /Reject/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when sessions fail to load', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      render(<SessionsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load sessions/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
    });

    it('should show error toast when approval fails', async () => {
      const user = userEvent.setup();

      // Mock approval failure
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('approve')) {
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
          });
        }
        // Default response for sessions list
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sessions: mockSessions,
            devices: mockDevices,
            users: mockUsers,
          }),
        });
      });

      render(<SessionsPage />);

      await waitFor(() => {
        const pendingSessionRow = screen.getByTestId('session-row-session-1');
        expect(within(pendingSessionRow).getByRole('button', { name: /Approve/i })).toBeInTheDocument();
      });

      // Try to approve
      const pendingSessionRow = screen.getByTestId('session-row-session-1');
      await user.click(within(pendingSessionRow).getByRole('button', { name: /Approve/i }));

      // Confirm in dialog
      await waitFor(() => {
        expect(screen.getByText('Approve Session Actions?')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /Confirm Approval/i }));

      // Check error toast
      await waitFor(() => {
        expect(screen.getByText(/Failed to approve session/i)).toBeInTheDocument();
      });
    });
  });
});