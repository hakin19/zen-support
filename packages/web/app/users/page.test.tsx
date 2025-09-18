import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UsersPage from './page';
import { useAuthStore } from '@/store/auth.store';
import { useWebSocketStore } from '@/store/websocket.store';
import { api } from '@/lib/api-client';

// Mock the stores and API
vi.mock('@/store/auth.store');
vi.mock('@/store/websocket.store');
vi.mock('@/lib/api-client');

describe('Users Page', () => {
  const mockUsers = [
    {
      id: '1',
      email: 'owner@example.com',
      full_name: 'John Owner',
      role: 'owner' as const,
      created_at: '2024-01-01T00:00:00Z',
      last_login: '2024-01-15T10:00:00Z',
      status: 'active' as const,
    },
    {
      id: '2',
      email: 'admin@example.com',
      full_name: 'Jane Admin',
      role: 'admin' as const,
      created_at: '2024-01-02T00:00:00Z',
      last_login: '2024-01-14T10:00:00Z',
      status: 'active' as const,
    },
    {
      id: '3',
      email: 'viewer@example.com',
      full_name: 'Bob Viewer',
      role: 'viewer' as const,
      created_at: '2024-01-03T00:00:00Z',
      last_login: '2024-01-13T10:00:00Z',
      status: 'active' as const,
    },
  ];

  const mockWebSocketClient = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock auth store with owner role by default
    vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
      const state = {
        user: {
          id: '1',
          email: 'owner@example.com',
          role: 'owner',
          full_name: 'John Owner',
        },
        session: {},
        organization: {
          id: 'org-1',
          name: 'Test Organization',
        },
        isAuthenticated: true,
        loading: false,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    // Mock WebSocket store
    vi.mocked(useWebSocketStore).mockImplementation((selector?: any) => {
      const state = {
        users: [],
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        subscribe: vi.fn((event, callback) => {
          return vi.fn(); // Return unsubscribe function
        }),
        setUsers: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({
      data: {
        users: mockUsers,
        total: mockUsers.length
      }
    });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['test']));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Rendering', () => {
    it('should render the users page with title and description', () => {
      render(<UsersPage />);
      expect(screen.getByText('User Administration')).toBeInTheDocument();
      expect(screen.getByText('Manage team members and their access')).toBeInTheDocument();
    });

    it('should render the UserManagement component', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeInTheDocument();
      });
    });

    it('should display users list when data is loaded', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Owner')).toBeInTheDocument();
        expect(screen.getByText('Jane Admin')).toBeInTheDocument();
        expect(screen.getByText('Bob Viewer')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should have a search input field', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search users...');
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('should filter users based on search query', async () => {
      const user = userEvent.setup();
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Owner')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search users...');
      await user.type(searchInput, 'admin');

      // Mock filtered API response
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          users: [mockUsers[1]],
          total: 1
        }
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          expect.stringContaining('search=admin')
        );
      });
    });
  });

  describe('Pagination', () => {
    it('should display pagination controls when there are multiple pages', async () => {
      // Mock response with pagination
      vi.mocked(api.get).mockResolvedValue({
        data: {
          users: mockUsers,
          total: 25 // More than one page
        }
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByText(/Showing.*of.*users/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
      });
    });

    it('should handle page navigation', async () => {
      const user = userEvent.setup();

      vi.mocked(api.get).mockResolvedValue({
        data: {
          users: mockUsers,
          total: 25
        }
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          expect.stringContaining('page=2')
        );
      });
    });
  });

  describe('Role Display', () => {
    it('should display user roles with appropriate badges', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        // Check for role badges
        expect(screen.getByText('Owner')).toBeInTheDocument();
        expect(screen.getByText('Admin')).toBeInTheDocument();
        expect(screen.getByText('Viewer')).toBeInTheDocument();
      });
    });

    it('should show role-specific icons', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        const ownerRow = screen.getByTestId('user-row-1');
        // Check that the Owner badge contains the shield icon (visible as part of the badge)
        const ownerBadge = within(ownerRow).getByText('Owner');
        expect(ownerBadge).toBeInTheDocument();
        // The shield icon is rendered as an svg within the badge element
        const badgeParent = ownerBadge.parentElement;
        expect(badgeParent?.querySelector('.lucide-shield')).toBeInTheDocument();
      });
    });
  });

  describe('User Invitation', () => {
    it('should show invite button for admins and owners', async () => {
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Invite User/i })).toBeInTheDocument();
      });
    });

    it('should open invite modal when clicking invite button', async () => {
      const user = userEvent.setup();
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Invite User/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });

    it('should send invitation with correct data', async () => {
      const user = userEvent.setup();
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Invite User/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      const nameInput = screen.getByLabelText(/Full Name/i);

      await user.type(emailInput, 'newuser@example.com');
      await user.type(nameInput, 'New User');

      await user.click(screen.getByRole('button', { name: /Send Invitation/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/users/invite', {
          email: 'newuser@example.com',
          full_name: 'New User',
          role: expect.any(String),
        });
      });
    });
  });

  describe('Resend Invite', () => {
    it('should show resend option for pending invitations', async () => {
      const pendingUser = {
        id: '4',
        email: 'pending@example.com',
        full_name: null,
        role: 'viewer' as const,
        created_at: '2024-01-10T00:00:00Z',
        last_login: null,
        status: 'invited' as const,
      };

      vi.mocked(api.get).mockResolvedValue({
        data: {
          users: [...mockUsers, pendingUser],
          total: 4
        }
      });

      render(<UsersPage />);

      await waitFor(() => {
        const pendingRow = screen.getByTestId('user-row-4');
        expect(within(pendingRow).getByText('Pending')).toBeInTheDocument();
      });
    });

    it('should handle resend invitation action', async () => {
      const user = userEvent.setup();
      const pendingUser = {
        id: '4',
        email: 'pending@example.com',
        full_name: null,
        role: 'viewer' as const,
        created_at: '2024-01-10T00:00:00Z',
        last_login: null,
        status: 'invited' as const,
      };

      vi.mocked(api.get).mockResolvedValue({
        data: {
          users: [...mockUsers, pendingUser],
          total: 4
        }
      });

      render(<UsersPage />);

      await waitFor(() => {
        const pendingRow = screen.getByTestId('user-row-4');
        expect(pendingRow).toBeInTheDocument();
      });

      // Open dropdown for pending user
      const pendingRow = screen.getByTestId('user-row-4');
      const moreButton = within(pendingRow).getByRole('button', { name: /Actions/i });
      await user.click(moreButton);

      // Click resend
      const resendButton = screen.getByRole('button', { name: /Resend/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/users/4/resend-invitation'
        );
      });
    });
  });

  describe('Role Toggle', () => {
    it('should allow owners to change user roles', async () => {
      const user = userEvent.setup();
      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });

      // Open dropdown for admin user
      const adminRow = screen.getByTestId('user-row-2');
      const moreButton = within(adminRow).getByRole('button', { name: /Actions/i });
      await user.click(moreButton);

      // Click change role
      const changeRoleButton = screen.getByRole('button', { name: /Change Role/i });
      await user.click(changeRoleButton);

      // Select new role
      const roleSelect = screen.getByTestId('role-select-2');
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: 'Viewer' }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/users/2/role',
          { role: 'viewer' }
        );
      });
    });

    it('should not allow non-owners to change roles', async () => {
      // Mock as admin user
      vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
          user: {
            id: '2',
            email: 'admin@example.com',
            role: 'admin',
            full_name: 'Jane Admin',
          },
          session: {},
          organization: {
            id: 'org-1',
            name: 'Test Organization',
          },
          isAuthenticated: true,
          loading: false,
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-3')).toBeInTheDocument();
      });

      // Open dropdown for viewer user
      const viewerRow = screen.getByTestId('user-row-3');
      const moreButton = within(viewerRow).getByRole('button', { name: /Actions/i });
      await userEvent.click(moreButton);

      // Change role option should not be available
      expect(screen.queryByRole('button', { name: /Change Role/i })).not.toBeInTheDocument();
    });
  });

  describe('WebSocket Real-time Updates', () => {
    it('should subscribe to user_* events on mount', async () => {
      const subscribe = vi.fn();
      vi.mocked(useWebSocketStore).mockImplementation((selector?: any) => {
        const state = {
          users: [],
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          subscribe,
          setUsers: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(subscribe).toHaveBeenCalledWith('user_added', expect.any(Function));
        expect(subscribe).toHaveBeenCalledWith('user_updated', expect.any(Function));
        expect(subscribe).toHaveBeenCalledWith('user_removed', expect.any(Function));
      });
    });

    it('should refresh users list when user_added event is received', async () => {
      let userAddedCallback: Function | null = null;

      vi.mocked(useWebSocketStore).mockImplementation((selector?: any) => {
        const state = {
          users: [],
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          subscribe: vi.fn((event, callback) => {
            if (event === 'user_added') {
              userAddedCallback = callback;
            }
            return vi.fn();
          }),
          setUsers: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1);
      });

      // Simulate user_added event
      if (userAddedCallback) {
        userAddedCallback({ user: { id: '5', email: 'new@example.com' } });
      }

      await waitFor(() => {
        // Should refetch users
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });

    it('should refresh users list when user_updated event is received', async () => {
      let userUpdatedCallback: Function | null = null;

      vi.mocked(useWebSocketStore).mockImplementation((selector?: any) => {
        const state = {
          users: [],
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          subscribe: vi.fn((event, callback) => {
            if (event === 'user_updated') {
              userUpdatedCallback = callback;
            }
            return vi.fn();
          }),
          setUsers: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1);
      });

      // Simulate user_updated event
      if (userUpdatedCallback) {
        userUpdatedCallback({ user: { id: '2', role: 'viewer' } });
      }

      await waitFor(() => {
        // Should refetch users
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });

    it('should refresh users list when user_removed event is received', async () => {
      let userRemovedCallback: Function | null = null;

      vi.mocked(useWebSocketStore).mockImplementation((selector?: any) => {
        const state = {
          users: [],
          connect: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          subscribe: vi.fn((event, callback) => {
            if (event === 'user_removed') {
              userRemovedCallback = callback;
            }
            return vi.fn();
          }),
          setUsers: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1);
      });

      // Simulate user_removed event
      if (userRemovedCallback) {
        userRemovedCallback({ userId: '3' });
      }

      await waitFor(() => {
        // Should refetch users
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Permission-based UI', () => {
    it('should show appropriate UI for viewers', async () => {
      // Mock as viewer
      vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
          user: {
            id: '3',
            email: 'viewer@example.com',
            role: 'viewer',
            full_name: 'Bob Viewer',
          },
          session: {},
          organization: {
            id: 'org-1',
            name: 'Test Organization',
          },
          isAuthenticated: true,
          loading: false,
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPage />);

      await waitFor(() => {
        // Should show permission notice
        expect(screen.getByText(/You have viewer permissions/i)).toBeInTheDocument();
        // Should not show invite button
        expect(screen.queryByRole('button', { name: /Invite User/i })).not.toBeInTheDocument();
      });
    });
  });
});