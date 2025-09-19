import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/test-utils';
import '@testing-library/jest-dom';
import { OrganizationSettingsPageClient as OrganizationSettingsPage } from './page';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Note: Stores and API are already mocked in setup.ts

describe('Organization Settings Page', () => {
  const mockOrganization = {
    id: 'org-1',
    name: 'Acme Corporation',
    subdomain: 'acme',
    contact_email: 'support@acme.com',
    settings: {
      allow_sso: true,
      enforce_2fa: false,
      session_timeout: 3600,
      ip_whitelist: [],
      notification_preferences: {
        email_alerts: true,
        sms_alerts: false,
        webhook_url: null,
      },
      api_settings: {
        rate_limit: 1000,
        allowed_origins: ['https://acme.com'],
      },
    },
    subscription: {
      plan: 'enterprise',
      seats: 50,
      used_seats: 23,
      billing_cycle: 'monthly',
      next_billing_date: '2024-02-01T00:00:00Z',
      amount: 1999.99,
      currency: 'USD',
      status: 'active',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();

    // Set up default API mocks
    vi.mocked(api.get).mockResolvedValue({
      data: { organization: mockOrganization },
    });
    vi.mocked(api.patch).mockResolvedValue({
      data: { success: true, organization: mockOrganization },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth Guard', () => {
    it('should show loading state while auth is hydrating', () => {
      // Mock auth store with loading state
      vi.mocked(useAuthStore).mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true, // Auth is still hydrating
        organization: null,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      // Should show loading indicator, not the settings page
      expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
      expect(
        screen.queryByText('Organization Settings')
      ).not.toBeInTheDocument();
    });

    it('should block rendering until hydration completes', async () => {
      // Start with loading state
      const mockAuthStore = {
        user: null,
        isAuthenticated: false,
        loading: true,
        organization: null,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any;

      vi.mocked(useAuthStore).mockReturnValue(mockAuthStore);

      const { rerender } = render(<OrganizationSettingsPage />);

      // Initially should show loading
      expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
      expect(
        screen.queryByText('Organization Settings')
      ).not.toBeInTheDocument();

      // Update to hydrated state with authenticated user
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '1', email: 'owner@example.com', role: 'owner' },
        isAuthenticated: true,
        loading: false, // Hydration complete
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      rerender(<OrganizationSettingsPage />);

      // Now should show the organization settings
      await waitFor(() => {
        expect(screen.queryByTestId('auth-loading')).not.toBeInTheDocument();
        expect(screen.getByText('Organization Settings')).toBeInTheDocument();
      });
    });

    it('should redirect to login if not authenticated after hydration', () => {
      // Mock auth store with hydration complete but not authenticated
      vi.mocked(useAuthStore).mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false, // Hydration complete
        organization: null,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      // Should redirect to login
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('should render organization settings for authenticated users', async () => {
      // Mock auth store with authenticated owner
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '1', email: 'owner@example.com', role: 'owner' },
        isAuthenticated: true,
        loading: false, // Hydration complete
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Organization Settings')).toBeInTheDocument();
        expect(
          screen.getByText(/Manage your organization profile/i)
        ).toBeInTheDocument();
      });
    });

    it('should handle different user roles appropriately', async () => {
      // Test with admin role
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        loading: false,
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      const { rerender } = render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Organization Settings')).toBeInTheDocument();
        // Admins should be able to edit most settings
        expect(screen.queryByText(/Read-only mode/i)).not.toBeInTheDocument();
      });

      // Test with viewer role
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
        isAuthenticated: true,
        loading: false,
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      rerender(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Organization Settings')).toBeInTheDocument();
        // Viewers should see read-only message
        expect(screen.getByText(/Read-only mode/i)).toBeInTheDocument();
      });
    });
  });

  describe('Billing Portal Integration', () => {
    it('should display billing portal link for owners', async () => {
      // Mock auth store with owner role
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '1', email: 'owner@example.com', role: 'owner' },
        isAuthenticated: true,
        loading: false,
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Manage Billing/i })
        ).toBeInTheDocument();
      });
    });

    it('should not display billing portal link for non-owners', async () => {
      // Mock auth store with admin role
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        loading: false,
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Manage Billing/i })
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Page Metadata', () => {
    it('should have proper page structure', async () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '1', email: 'owner@example.com', role: 'owner' },
        isAuthenticated: true,
        loading: false,
        organization: mockOrganization,
        setUser: vi.fn(),
        setSession: vi.fn(),
        setOrganization: vi.fn(),
        setLoading: vi.fn(),
        clearAuth: vi.fn(),
      } as any);

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        // Should have proper heading structure
        const heading = screen.getByRole('heading', {
          level: 1,
          name: /Organization Settings/i,
        });
        expect(heading).toBeInTheDocument();

        // Should have proper description
        expect(
          screen.getByText(/Manage your organization profile and preferences/i)
        ).toBeInTheDocument();
      });
    });
  });
});
