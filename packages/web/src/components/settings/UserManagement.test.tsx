import React from 'react';
const isMVP = process.env.TEST_MODE === 'MVP';
const itFull = isMVP ? it.skip : it;
const describeFull = isMVP ? describe.skip : describe;
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '../../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { UserManagement } from './UserManagement';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

// Note: Stores and API are already mocked in setup.ts

describe('UserManagement', () => {
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
    {
      id: '4',
      email: 'pending@example.com',
      full_name: null,
      role: 'viewer' as const,
      created_at: '2024-01-10T00:00:00Z',
      last_login: null,
      status: 'invited' as const,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock auth store - need to mock the selector function
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

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({ data: { users: mockUsers } });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['test']));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User List Display', () => {
    it('should render the user management header', () => {
      render(<UserManagement />);
      expect(screen.getByText('User Management')).toBeInTheDocument();
      expect(
        screen.getByText(/Manage team members and their permissions/i)
      ).toBeInTheDocument();
    });

    it('should display loading state while fetching users', () => {
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
      render(<UserManagement />);
      expect(screen.getByTestId('users-loading')).toBeInTheDocument();
    });

    it('should display users in a table', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Owner')).toBeInTheDocument();
        expect(screen.getByText('Jane Admin')).toBeInTheDocument();
        expect(screen.getByText('Bob Viewer')).toBeInTheDocument();
      });
    });

    it('should show user details correctly', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        const ownerRow = screen.getByTestId('user-row-1');
        expect(
          within(ownerRow).getByText('owner@example.com')
        ).toBeInTheDocument();
        expect(within(ownerRow).getByText('Owner')).toBeInTheDocument();
        expect(within(ownerRow).getByText('Active')).toBeInTheDocument();
      });
    });

    it('should display pending invitations differently', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        const pendingRow = screen.getByTestId('user-row-4');
        expect(
          within(pendingRow).getByText('pending@example.com')
        ).toBeInTheDocument();
        expect(within(pendingRow).getByText('Pending')).toBeInTheDocument();
        expect(
          within(pendingRow).getByText('Invitation sent')
        ).toBeInTheDocument();
      });
    });

    it('should handle empty user list', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { users: [] } });
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('No users found')).toBeInTheDocument();
        expect(
          screen.getByText('Invite your first team member to get started')
        ).toBeInTheDocument();
      });
    });

    it('should display error state on fetch failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Failed to fetch users'));
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load users/i)).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Retry/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe('User Invitation', () => {
    it('should show invite button for admins and owners', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });
    });

    it('should not show invite button for viewers', async () => {
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
          setUser: vi.fn(),
          setSession: vi.fn(),
          setOrganization: vi.fn(),
          setLoading: vi.fn(),
          clearAuth: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UserManagement />);
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Invite User/i })
        ).not.toBeInTheDocument();
      });
    });

    it('should open invite modal when clicking invite button', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Invite Team Member')).toBeInTheDocument();
    });

    it('should validate email format in invite form', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      const submitButton = screen.getByRole('button', {
        name: /Send Invitation/i,
      });

      // Test invalid email
      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      expect(
        screen.getByText(/Please enter a valid email address/i)
      ).toBeInTheDocument();
    });

    it('should send invitation with correct data', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      const nameInput = screen.getByLabelText(/Full Name/i);
      const roleSelect = screen.getByLabelText(/Role/i);

      await user.type(emailInput, 'newuser@example.com');
      await user.type(nameInput, 'New User');
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: 'Admin' }));

      await user.click(
        screen.getByRole('button', { name: /Send Invitation/i })
      );

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/users/invite', {
          email: 'newuser@example.com',
          full_name: 'New User',
          role: 'admin',
        });
      });
    });

    it('should show success message after invitation sent', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'newuser@example.com');
      await user.click(
        screen.getByRole('button', { name: /Send Invitation/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Invitation sent successfully/i)
        ).toBeInTheDocument();
      });
    });

    it('should handle invitation errors gracefully', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockRejectedValue(new Error('Email already exists'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'existing@example.com');
      await user.click(
        screen.getByRole('button', { name: /Send Invitation/i })
      );

      await waitFor(() => {
        expect(screen.getByText(/Email already exists/i)).toBeInTheDocument();
      });
    });

    it('should resend invitation for pending users', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        const pendingRow = screen.getByTestId('user-row-4');
        expect(
          within(pendingRow).getByRole('button', {
            name: /Actions for pending@example.com/i,
          })
        ).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-4')).getByRole(
        'button',
        { name: /Actions for pending@example.com/i }
      );
      await user.click(actionsButton);

      // Now click the Resend button in the dropdown
      const resendButton = screen.getByRole('button', { name: /Resend/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/users/4/resend-invitation');
        expect(screen.getByText(/Invitation resent/i)).toBeInTheDocument();
      });
    });
  });

  describe('Role Management', () => {
    it('should display current user roles', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-1')).toHaveTextContent('Owner');
        expect(screen.getByTestId('user-row-2')).toHaveTextContent('Admin');
        expect(screen.getByTestId('user-row-3')).toHaveTextContent('Viewer');
      });
    });

    it('should allow owners to change user roles', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        const adminRow = screen.getByTestId('user-row-2');
        expect(
          within(adminRow).getByRole('button', {
            name: /Actions for admin@example.com/i,
          })
        ).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Now click Change Role in the dropdown
      const changeRoleButton = screen.getByRole('button', {
        name: /Change Role/i,
      });
      await user.click(changeRoleButton);

      // After clicking Change Role, a select dropdown appears
      const roleSelect = screen.getByTestId('role-select-2');
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: 'Viewer' }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/users/2/role', {
          role: 'viewer',
        });
      });
    });

    it('should not allow actions on current user', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        const ownerRow = screen.getByTestId('user-row-1');
        // Current user's row should not have an enabled actions button
        // The button exists but is disabled
        const buttons = within(ownerRow).queryAllByRole('button');
        // Should have checkbox button only, no actions button or it's disabled
        const actionsButton = buttons.find(btn =>
          btn.getAttribute('aria-label')?.includes('Actions')
        );

        if (actionsButton) {
          expect(actionsButton).toBeDisabled();
        } else {
          // No actions button for current user is also valid
          expect(actionsButton).toBeUndefined();
        }
      });
    });

    itFull('should not allow admins to change roles to owner', async () => {
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
          setUser: vi.fn(),
          setSession: vi.fn(),
          setOrganization: vi.fn(),
          setLoading: vi.fn(),
          clearAuth: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        const viewerRow = screen.getByTestId('user-row-3');
        // Admin users don't have permission to change roles
        expect(
          within(viewerRow).queryByRole('button', {
            name: /Actions for viewer@example.com/i,
          })
        ).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-3')).getByRole(
        'button',
        { name: /Actions for viewer@example.com/i }
      );
      await user.click(actionsButton);

      // Change Role should not be in the dropdown for admins
      expect(
        screen.queryByRole('button', { name: /Change Role/i })
      ).not.toBeInTheDocument();
    });

    it('should show confirmation dialog for role changes', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Click Change Role in the dropdown
      const changeRoleButton = screen.getByRole('button', {
        name: /Change Role/i,
      });
      await user.click(changeRoleButton);

      // After clicking Change Role, a select dropdown appears
      const roleSelect = screen.getByTestId('role-select-2');
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: 'Viewer' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to change/i)
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalled();
      });
    });

    itFull('should handle role change errors', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockRejectedValue(new Error('Permission denied'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Click Change Role in the dropdown
      const changeRoleButton = screen.getByRole('button', {
        name: /Change Role/i,
      });
      await user.click(changeRoleButton);

      // After clicking Change Role, a select dropdown appears
      const roleSelect = screen.getByTestId('role-select-2');
      await user.click(roleSelect);
      await user.click(screen.getByRole('option', { name: 'Viewer' }));

      await user.click(screen.getByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Removal', () => {
    it('should allow removing users (except owner)', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        const adminRow = screen.getByTestId('user-row-2');
        expect(
          within(adminRow).getByRole('button', {
            name: /Actions for admin@example.com/i,
          })
        ).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Check that Remove button exists in the dropdown
      expect(
        screen.getByRole('button', { name: /Remove/i })
      ).toBeInTheDocument();
    });

    it('should not allow removing current user', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        const ownerRow = screen.getByTestId('user-row-1');
        // Current user's row should not have an enabled actions button
        const buttons = within(ownerRow).queryAllByRole('button');
        const actionsButton = buttons.find(btn =>
          btn.getAttribute('aria-label')?.includes('Actions')
        );

        if (actionsButton) {
          expect(actionsButton).toBeDisabled();
        } else {
          // No actions button for current user is also valid
          expect(actionsButton).toBeUndefined();
        }
      });
    });

    it('should show confirmation before removing user', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Click Remove in the dropdown
      const removeButton = screen.getByRole('button', { name: /Remove/i });
      await user.click(removeButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to remove Jane Admin/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This action cannot be undone/i)
      ).toBeInTheDocument();
    });

    itFull('should remove user when confirmed', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-2')).getByRole(
        'button',
        { name: /Actions for admin@example.com/i }
      );
      await user.click(actionsButton);

      // Click Remove in the dropdown
      const removeButton = screen.getByRole('button', { name: /Remove/i });
      await user.click(removeButton);

      await user.click(
        screen.getByRole('button', { name: /Confirm Removal/i })
      );

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/users/2');
        expect(
          screen.getByText(/User removed successfully/i)
        ).toBeInTheDocument();
      });
    });

    itFull('should cancel pending invitations', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        const pendingRow = screen.getByTestId('user-row-4');
        expect(
          within(pendingRow).getByRole('button', {
            name: /Actions for pending@example.com/i,
          })
        ).toBeInTheDocument();
      });

      // Click the dropdown menu button
      const actionsButton = within(screen.getByTestId('user-row-4')).getByRole(
        'button',
        { name: /Actions for pending@example.com/i }
      );
      await user.click(actionsButton);

      // Click Cancel in the dropdown
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/users/4/invitation');
        expect(screen.getByText(/Invitation cancelled/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    itFull('should provide search functionality', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/Search users/i)
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search users/i);
      await user.type(searchInput, 'admin');

      // The component filters client-side, not server-side
      // Only admin@example.com and "Jane Admin" match the search
      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('user-row-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-row-3')).not.toBeInTheDocument();
    });

    it('should filter by role', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Filter by role/i)).toBeInTheDocument();
      });

      const roleFilter = screen.getByLabelText(/Filter by role/i);
      await user.click(roleFilter);
      await user.click(screen.getByRole('option', { name: 'Admin' }));

      // The component filters client-side
      await waitFor(() => {
        expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('user-row-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-row-3')).not.toBeInTheDocument();
    });

    itFull('should filter by status', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Filter by status/i)).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/Filter by status/i);
      await user.click(statusFilter);
      await user.click(screen.getByRole('option', { name: 'Pending' }));

      // The component filters client-side
      await waitFor(() => {
        expect(screen.getByTestId('user-row-4')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('user-row-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-row-2')).not.toBeInTheDocument();
    });

    itFull('should combine search and filters', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/Search users/i)
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search users/i);
      const statusFilter = screen.getByLabelText(/Filter by status/i);

      await user.type(searchInput, 'example.com');
      await user.click(statusFilter);
      await user.click(screen.getByRole('option', { name: 'Active' }));

      // Filters are applied client-side
      await waitFor(() => {
        expect(screen.getByTestId('user-row-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('user-row-2')).toBeInTheDocument();
      expect(screen.getByTestId('user-row-3')).toBeInTheDocument();
      expect(screen.queryByTestId('user-row-4')).not.toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('should paginate large user lists', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        full_name: `User ${i}`,
        role: 'viewer' as const,
        created_at: '2024-01-01T00:00:00Z',
        last_login: '2024-01-15T10:00:00Z',
        status: 'active' as const,
      }));

      vi.mocked(api.get).mockResolvedValue({
        data: { users: manyUsers, total: 25 },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByText('Showing 1-10 of 25 users')
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Next/i })
        ).toBeInTheDocument();
      });
    });

    it('should navigate between pages', async () => {
      const user = userEvent.setup();
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        full_name: `User ${i}`,
        role: 'viewer' as const,
        created_at: '2024-01-01T00:00:00Z',
        last_login: '2024-01-15T10:00:00Z',
        status: 'active' as const,
      }));

      vi.mocked(api.get).mockResolvedValue({
        data: { users: manyUsers.slice(0, 10), total: 25 },
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Next/i })
        ).toBeInTheDocument();
      });

      vi.mocked(api.get).mockResolvedValue({
        data: { users: manyUsers.slice(10, 20), total: 25 },
      });

      await user.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/users?page=2&limit=10');
        expect(
          screen.getByText('Showing 11-20 of 25 users')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('table', { name: /Users table/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toHaveAttribute('aria-label');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      // Tab to invite button
      await user.tab();
      expect(
        screen.getByRole('button', { name: /Invite User/i })
      ).toHaveFocus();

      // Enter to open modal
      await user.keyboard('{Enter}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Escape to close modal
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    itFull('should announce status changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Invite User/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Invite User/i }));

      const emailInput = screen.getByLabelText(/Email Address/i);
      await user.type(emailInput, 'newuser@example.com');
      await user.click(
        screen.getByRole('button', { name: /Send Invitation/i })
      );

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Invitation sent successfully/i);
        expect(alert).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describeFull('Real-time Updates', () => {
    it('should refresh when receiving WebSocket updates', async () => {
      const { rerender } = render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('John Owner')).toBeInTheDocument();
      });

      // Simulate WebSocket update
      const newUser = {
        id: '5',
        email: 'realtime@example.com',
        full_name: 'Realtime User',
        role: 'viewer' as const,
        created_at: '2024-01-20T00:00:00Z',
        last_login: null,
        status: 'active' as const,
      };

      vi.mocked(api.get).mockResolvedValue({
        data: { users: [...mockUsers, newUser] },
      });

      // Trigger re-fetch (simulating WebSocket event)
      rerender(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('Realtime User')).toBeInTheDocument();
      });
    });

    it('should update user status in real-time', async () => {
      const { rerender } = render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-4')).toHaveTextContent('Pending');
      });

      // Simulate user accepting invitation
      const updatedUsers = mockUsers.map(u =>
        u.id === '4'
          ? { ...u, status: 'active' as const, full_name: 'Bob Pending' }
          : u
      );

      vi.mocked(api.get).mockResolvedValue({ data: { users: updatedUsers } });

      rerender(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('user-row-4')).toHaveTextContent('Active');
        expect(screen.getByTestId('user-row-4')).toHaveTextContent(
          'Bob Pending'
        );
      });
    });
  });
});
