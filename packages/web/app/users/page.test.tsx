import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import '@testing-library/jest-dom';
import { UsersPageClient } from './page';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

// Mock the stores and API
vi.mock('@/store/auth.store');
vi.mock('@/lib/api-client');
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

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

  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock router
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);

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

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({
      data: {
        users: mockUsers,
        total: mockUsers.length,
      },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['test']));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Guard', () => {
    it('should show loading state while auth is hydrating', () => {
      vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
          user: null,
          session: null,
          organization: null,
          isAuthenticated: false,
          loading: true,
          setUser: vi.fn(),
          setSession: vi.fn(),
          setOrganization: vi.fn(),
          setLoading: vi.fn(),
          clearAuth: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPageClient />);

      expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByText('User Administration')).not.toBeInTheDocument();
    });

    it('should redirect to login when not authenticated', async () => {
      vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
          user: null,
          session: null,
          organization: null,
          isAuthenticated: false,
          loading: false,
          setUser: vi.fn(),
          setSession: vi.fn(),
          setOrganization: vi.fn(),
          setLoading: vi.fn(),
          clearAuth: vi.fn(),
        };
        return selector ? selector(state) : state;
      });

      render(<UsersPageClient />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });

      // Should not render any content
      expect(screen.queryByText('User Administration')).not.toBeInTheDocument();
    });

    it('should render content when authenticated', async () => {
      // Default mock is authenticated, so just test it renders
      render(<UsersPageClient />);

      await waitFor(() => {
        expect(screen.getByText('User Administration')).toBeInTheDocument();
        expect(
          screen.getByText('Manage team members and their access')
        ).toBeInTheDocument();
      });

      // Should not redirect
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Page Rendering', () => {
    it('should render the users page with title and description', () => {
      render(<UsersPageClient />);
      expect(screen.getByText('User Administration')).toBeInTheDocument();
      expect(
        screen.getByText('Manage team members and their access')
      ).toBeInTheDocument();
    });

    it('should render the UserManagement component', async () => {
      render(<UsersPageClient />);

      await waitFor(() => {
        // Verify the component is mounted by checking for its header
        expect(screen.getByText('User Management')).toBeInTheDocument();
      });
    });
  });

  // Note: Detailed UserManagement behavior tests (search, pagination, roles, invites, etc.)
  // are covered in packages/web/src/components/settings/UserManagement.test.tsx
  // This page test focuses only on page-specific concerns (auth guard, title, component mounting)
});
