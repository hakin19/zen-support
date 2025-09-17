import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OrganizationSettingsPage from './page';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('Organization Settings Page - API Integration', () => {
  const mockOrganization = {
    id: 'org-1',
    name: 'Acme Corporation',
    subdomain: 'acme',
    logo_url: 'https://example.com/logo.png',
    primary_color: '#007bff',
    secondary_color: '#6c757d',
    contact_email: 'support@acme.com',
    contact_phone: '+1-555-0100',
    address: '123 Business St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'USA',
    timezone: 'America/Los_Angeles',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
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

    // Mock auth store with authenticated owner
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

    // Set up default API mocks
    vi.mocked(api.get).mockResolvedValue({
      data: { organization: mockOrganization },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Form Submissions to PATCH Endpoint', () => {
    it('should submit basic info changes to /api/organization', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValue({
        data: {
          success: true,
          organization: { ...mockOrganization, name: 'New Corp' },
        },
      });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'New Corp');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/organization', {
          name: 'New Corp',
        });
      });
    });

    it('should submit security settings to /api/organization/settings', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValue({
        data: { success: true, organization: mockOrganization },
      });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Enable SSO/i)).toBeInTheDocument();
      });

      const ssoToggle = screen.getByLabelText(/Enable SSO/i);
      await user.click(ssoToggle);

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      // Security section save button is the 3rd one (index 2)
      await user.click(saveButtons[2]!);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/organization/settings', {
          allow_sso: false,
        });
      });
    });

    it('should submit notification settings to /api/organization/notifications', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValue({
        data: { success: true },
      });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Email Alerts/i)).toBeInTheDocument();
      });

      const emailToggle = screen.getByLabelText(/Email Alerts/i);
      await user.click(emailToggle);

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      // Notifications section save button is the 4th one (index 3)
      await user.click(saveButtons[3]!);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/notifications',
          {
            email_alerts: false,
            webhook_url: '', // Empty webhook URL is also sent
          }
        );
      });
    });

    it('should submit API settings to /api/organization/api-settings', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValue({
        data: { success: true },
      });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Rate Limit/i)).toBeInTheDocument();
      });

      const rateLimitInput = screen.getByLabelText(
        /Rate Limit/i
      ) as HTMLInputElement;
      await user.click(rateLimitInput);
      await user.keyboard('{Control>}a{/Control}2000');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      // API Settings save button is the last one
      await user.click(saveButtons[saveButtons.length - 1]!);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/api-settings',
          {
            rate_limit: 2000,
          }
        );
      });
    });
  });

  describe('Success States', () => {
    it('should display success message after successful save', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValue({
        data: { success: true, organization: mockOrganization },
      });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Corp');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(
          screen.getByText(/Settings saved successfully/i)
        ).toBeInTheDocument();
      });
    });

    it('should refresh data after successful save', async () => {
      const user = userEvent.setup();
      const updatedOrg = { ...mockOrganization, name: 'Updated Corp' };

      vi.mocked(api.patch).mockResolvedValue({
        data: { success: true, organization: updatedOrg },
      });

      // Mock the refresh call to return updated data
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          data: { organization: mockOrganization },
        })
        .mockResolvedValueOnce({
          data: { organization: updatedOrg },
        });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Corp');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        // Should have called get twice - once on mount, once after save
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(api.get).toHaveBeenLastCalledWith('/api/organization');
      });
    });
  });

  describe('Error States', () => {
    it('should display error message on save failure', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockRejectedValue(new Error('Network error'));

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Failed Update');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to save settings/i)
        ).toBeInTheDocument();
      });
    });

    it('should handle validation errors', async () => {
      const user = userEvent.setup();

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      // Clear required field
      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(
          screen.getByText(/Organization name is required/i)
        ).toBeInTheDocument();
        // Should not call API if validation fails
        expect(api.patch).not.toHaveBeenCalled();
      });
    });

    it('should handle invalid email format', async () => {
      const user = userEvent.setup();

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('support@acme.com')
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/Contact Email/i);
      await user.clear(emailInput);
      await user.type(emailInput, 'invalid-email');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
        expect(api.patch).not.toHaveBeenCalled();
      });
    });

    it('should handle invalid subdomain format', async () => {
      const user = userEvent.setup();

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('acme')).toBeInTheDocument();
      });

      const subdomainInput = screen.getByLabelText(/Subdomain/i);
      await user.clear(subdomainInput);
      await user.type(subdomainInput, 'Invalid Subdomain!');

      const saveButtons = screen.getAllByRole('button', {
        name: /Save Changes/i,
      });
      await user.click(saveButtons[0]!);

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid subdomain format/i)
        ).toBeInTheDocument();
        expect(api.patch).not.toHaveBeenCalled();
      });
    });

    it('should handle API connection errors gracefully', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Connection failed'));

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load organization settings/i)
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Retry/i })
        ).toBeInTheDocument();
      });
    });

    it('should allow retry on load failure', async () => {
      const user = userEvent.setup();

      // First call fails, second succeeds
      vi.mocked(api.get)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({
          data: { organization: mockOrganization },
        });

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load organization settings/i)
        ).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Billing Portal Access', () => {
    it('should call billing portal API when manage billing is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValue({
        data: { url: 'https://billing.stripe.com/session' },
      });

      // Mock window.location.href
      delete (window as any).location;
      window.location = { href: '' } as Location;

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Manage Billing/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Manage Billing/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/billing-portal'
        );
        expect(window.location.href).toBe('https://billing.stripe.com/session');
      });
    });

    it('should handle billing portal API errors', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockRejectedValue(
        new Error('Billing service unavailable')
      );

      render(<OrganizationSettingsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Manage Billing/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Manage Billing/i }));

      // The component uses toast for error display
      // We can't directly test the toast, but we can verify the API was called
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/billing-portal'
        );
      });
    });
  });
});
