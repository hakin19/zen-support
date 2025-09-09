import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { OrganizationSettings } from './OrganizationSettings';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

// Mock the stores and API
vi.mock('@/store/auth.store');
vi.mock('@/lib/api-client');

describe('OrganizationSettings', () => {
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

    // Mock auth store - owner role by default
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: '1', email: 'owner@example.com', role: 'owner' },
      isAuthenticated: true,
      organization: mockOrganization,
    } as any);

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({
      data: { organization: mockOrganization },
    });
    vi.mocked(api.patch).mockResolvedValue({
      data: { success: true, organization: mockOrganization },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Organization Display', () => {
    it('should render organization settings header', () => {
      render(<OrganizationSettings />);
      expect(screen.getByText('Organization Settings')).toBeInTheDocument();
      expect(
        screen.getByText(/Manage your organization profile and preferences/i)
      ).toBeInTheDocument();
    });

    it('should display loading state while fetching', () => {
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
      render(<OrganizationSettings />);
      expect(screen.getByTestId('organization-loading')).toBeInTheDocument();
    });

    it('should display organization details', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
        expect(screen.getByDisplayValue('acme')).toBeInTheDocument();
        expect(
          screen.getByDisplayValue('support@acme.com')
        ).toBeInTheDocument();
        expect(screen.getByDisplayValue('+1-555-0100')).toBeInTheDocument();
      });
    });

    it('should display address information', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('123 Business St')).toBeInTheDocument();
        expect(screen.getByDisplayValue('San Francisco')).toBeInTheDocument();
        expect(screen.getByDisplayValue('CA')).toBeInTheDocument();
        expect(screen.getByDisplayValue('94105')).toBeInTheDocument();
      });
    });

    it('should handle error state', async () => {
      vi.mocked(api.get).mockRejectedValue(
        new Error('Failed to fetch organization')
      );
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load organization settings/i)
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Retry/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe('Access Control', () => {
    it('should allow editing for owners', () => {
      render(<OrganizationSettings />);
      expect(screen.queryByText(/Read-only mode/i)).not.toBeInTheDocument();
    });

    it('should allow editing for admins', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        organization: mockOrganization,
      } as any);

      render(<OrganizationSettings />);
      expect(screen.queryByText(/Read-only mode/i)).not.toBeInTheDocument();
    });

    it('should be read-only for viewers', async () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
        isAuthenticated: true,
        organization: mockOrganization,
      } as any);

      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Read-only mode/i)).toBeInTheDocument();
        const nameInput = screen.getByLabelText(/Organization Name/i);
        expect(nameInput).toBeDisabled();
      });
    });
  });

  describe('Basic Information', () => {
    it('should update organization name', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'New Company Name');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/organization', {
          name: 'New Company Name',
        });
      });
    });

    it('should validate subdomain format', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('acme')).toBeInTheDocument();
      });

      const subdomainInput = screen.getByLabelText(/Subdomain/i);
      await user.clear(subdomainInput);
      await user.type(subdomainInput, 'invalid subdomain!');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(screen.getByText(/Invalid subdomain format/i)).toBeInTheDocument();
    });

    it('should update contact information', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('support@acme.com')
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/Contact Email/i);
      const phoneInput = screen.getByLabelText(/Contact Phone/i);

      await user.clear(emailInput);
      await user.type(emailInput, 'newemail@acme.com');
      await user.clear(phoneInput);
      await user.type(phoneInput, '+1-555-0200');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization',
          expect.objectContaining({
            contact_email: 'newemail@acme.com',
            contact_phone: '+1-555-0200',
          })
        );
      });
    });
  });

  describe('Branding Settings', () => {
    it('should display branding section', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Branding')).toBeInTheDocument();
        expect(screen.getByLabelText(/Logo URL/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Primary Color/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Secondary Color/i)).toBeInTheDocument();
      });
    });

    it('should update logo URL', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('https://example.com/logo.png')
        ).toBeInTheDocument();
      });

      const logoInput = screen.getByLabelText(/Logo URL/i);
      await user.clear(logoInput);
      await user.type(logoInput, 'https://newlogo.com/logo.png');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization',
          expect.objectContaining({
            logo_url: 'https://newlogo.com/logo.png',
          })
        );
      });
    });

    it('should update brand colors', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('#007bff')).toBeInTheDocument();
      });

      const primaryColorInput = screen.getByLabelText(/Primary Color/i);
      const secondaryColorInput = screen.getByLabelText(/Secondary Color/i);

      await user.clear(primaryColorInput);
      await user.type(primaryColorInput, '#ff0000');
      await user.clear(secondaryColorInput);
      await user.type(secondaryColorInput, '#00ff00');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization',
          expect.objectContaining({
            primary_color: '#ff0000',
            secondary_color: '#00ff00',
          })
        );
      });
    });

    it('should preview color changes', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('#007bff')).toBeInTheDocument();
      });

      const primaryColorInput = screen.getByLabelText(/Primary Color/i);
      await user.clear(primaryColorInput);
      await user.type(primaryColorInput, '#ff0000');

      const preview = screen.getByTestId('color-preview');
      expect(preview).toHaveStyle({ backgroundColor: '#ff0000' });
    });
  });

  describe('Security Settings', () => {
    it('should display security settings for owners', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Security')).toBeInTheDocument();
        expect(screen.getByLabelText(/Enable SSO/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Enforce 2FA/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Session Timeout/i)).toBeInTheDocument();
      });
    });

    it('should not display security settings for viewers', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
        isAuthenticated: true,
        organization: mockOrganization,
      } as any);

      render(<OrganizationSettings />);

      expect(screen.queryByText('Security')).not.toBeInTheDocument();
    });

    it('should toggle SSO setting', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Enable SSO/i)).toBeChecked();
      });

      const ssoToggle = screen.getByLabelText(/Enable SSO/i);
      await user.click(ssoToggle);

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/settings',
          expect.objectContaining({
            allow_sso: false,
          })
        );
      });
    });

    it('should toggle 2FA enforcement', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Enforce 2FA/i)).not.toBeChecked();
      });

      const tfaToggle = screen.getByLabelText(/Enforce 2FA/i);
      await user.click(tfaToggle);

      // Confirm dialog
      expect(
        screen.getByText(/This will require all users to enable 2FA/i)
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/settings',
          expect.objectContaining({
            enforce_2fa: true,
          })
        );
      });
    });

    it('should update session timeout', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('60')).toBeInTheDocument(); // 3600 seconds = 60 minutes
      });

      const timeoutInput = screen.getByLabelText(/Session Timeout/i);
      await user.clear(timeoutInput);
      await user.type(timeoutInput, '120');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/settings',
          expect.objectContaining({
            session_timeout: 7200, // 120 minutes = 7200 seconds
          })
        );
      });
    });
  });

  describe('IP Whitelist', () => {
    it('should display IP whitelist section', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('IP Whitelist')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Add IP Address/i })
        ).toBeInTheDocument();
      });
    });

    it('should add IP address to whitelist', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Add IP Address/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Add IP Address/i }));

      const ipInput = screen.getByLabelText(/IP Address/i);
      const descriptionInput = screen.getByLabelText(/Description/i);

      await user.type(ipInput, '192.168.1.100');
      await user.type(descriptionInput, 'Office Network');

      await user.click(screen.getByRole('button', { name: /Add/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/ip-whitelist',
          {
            ip_address: '192.168.1.100',
            description: 'Office Network',
          }
        );
      });
    });

    it('should validate IP address format', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Add IP Address/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Add IP Address/i }));

      const ipInput = screen.getByLabelText(/IP Address/i);
      await user.type(ipInput, 'invalid.ip');

      await user.click(screen.getByRole('button', { name: /Add/i }));

      expect(
        screen.getByText(/Invalid IP address format/i)
      ).toBeInTheDocument();
    });

    it('should remove IP from whitelist', async () => {
      const user = userEvent.setup();
      const orgWithIPs = {
        ...mockOrganization,
        settings: {
          ...mockOrganization.settings,
          ip_whitelist: [
            {
              ip: '192.168.1.100',
              description: 'Office',
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        },
      };

      vi.mocked(api.get).mockResolvedValue({
        data: { organization: orgWithIPs },
      });
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
      });

      const removeButton = screen.getByRole('button', { name: /Remove/i });
      await user.click(removeButton);

      // Confirm dialog
      expect(
        screen.getByText(/Are you sure you want to remove this IP/i)
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
          '/api/organization/ip-whitelist/192.168.1.100'
        );
      });
    });
  });

  describe('Notification Preferences', () => {
    it('should display notification settings', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByLabelText(/Email Alerts/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/SMS Alerts/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
      });
    });

    it('should toggle email alerts', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Email Alerts/i)).toBeChecked();
      });

      const emailToggle = screen.getByLabelText(/Email Alerts/i);
      await user.click(emailToggle);

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/notifications',
          expect.objectContaining({
            email_alerts: false,
          })
        );
      });
    });

    it('should update webhook URL', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
      });

      const webhookInput = screen.getByLabelText(/Webhook URL/i);
      await user.type(webhookInput, 'https://webhook.example.com/notify');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/notifications',
          expect.objectContaining({
            webhook_url: 'https://webhook.example.com/notify',
          })
        );
      });
    });

    it('should test webhook', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
      });

      const webhookInput = screen.getByLabelText(/Webhook URL/i);
      await user.type(webhookInput, 'https://webhook.example.com/notify');

      await user.click(screen.getByRole('button', { name: /Test Webhook/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/test-webhook',
          {
            url: 'https://webhook.example.com/notify',
          }
        );
        expect(
          screen.getByText(/Webhook test successful/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('API Settings', () => {
    it('should display API settings', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('API Settings')).toBeInTheDocument();
        expect(screen.getByLabelText(/Rate Limit/i)).toBeInTheDocument();
        expect(screen.getByText('Allowed Origins')).toBeInTheDocument();
      });
    });

    it('should update rate limit', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      const rateLimitInput = screen.getByLabelText(/Rate Limit/i);
      await user.clear(rateLimitInput);
      await user.type(rateLimitInput, '5000');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/organization/api-settings',
          expect.objectContaining({
            rate_limit: 5000,
          })
        );
      });
    });

    it('should add allowed origin', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('https://acme.com')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Add Origin/i }));

      const originInput = screen.getByLabelText(/Origin URL/i);
      await user.type(originInput, 'https://app.acme.com');

      await user.click(screen.getByRole('button', { name: /Add/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/allowed-origins',
          {
            origin: 'https://app.acme.com',
          }
        );
      });
    });

    it('should validate origin URL format', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Add Origin/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Add Origin/i }));

      const originInput = screen.getByLabelText(/Origin URL/i);
      await user.type(originInput, 'not-a-url');

      await user.click(screen.getByRole('button', { name: /Add/i }));

      expect(screen.getByText(/Invalid URL format/i)).toBeInTheDocument();
    });
  });

  describe('Subscription Information', () => {
    it('should display subscription details', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
        expect(screen.getByText('Plan: Enterprise')).toBeInTheDocument();
        expect(screen.getByText('23 / 50 seats used')).toBeInTheDocument();
        expect(screen.getByText('$1,999.99 USD / month')).toBeInTheDocument();
      });
    });

    it('should show next billing date', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Next billing:/)).toBeInTheDocument();
        expect(screen.getByText(/February 1, 2024/)).toBeInTheDocument();
      });
    });

    it('should provide upgrade option for non-enterprise plans', async () => {
      const orgWithBasicPlan = {
        ...mockOrganization,
        subscription: {
          ...mockOrganization.subscription,
          plan: 'basic',
        },
      };

      vi.mocked(api.get).mockResolvedValue({
        data: { organization: orgWithBasicPlan },
      });
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Upgrade Plan/i })
        ).toBeInTheDocument();
      });
    });

    it('should manage billing for owners', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Manage Billing/i })
        ).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Manage Billing/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/organization/billing-portal'
        );
      });
    });

    it('should not show billing management for non-owners', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        organization: mockOrganization,
      } as any);

      render(<OrganizationSettings />);

      expect(
        screen.queryByRole('button', { name: /Manage Billing/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Danger Zone', () => {
    it('should display danger zone for owners', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Danger Zone')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Delete Organization/i })
        ).toBeInTheDocument();
      });
    });

    it('should not display danger zone for non-owners', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        organization: mockOrganization,
      } as any);

      render(<OrganizationSettings />);

      expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    });

    it('should require confirmation for organization deletion', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Delete Organization/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Delete Organization/i })
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/This action cannot be undone/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Type "DELETE" to confirm/i)).toBeInTheDocument();
    });

    it('should require typing DELETE to confirm', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Delete Organization/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Delete Organization/i })
      );

      const confirmButton = screen.getByRole('button', {
        name: /Confirm Delete/i,
      });
      expect(confirmButton).toBeDisabled();

      const confirmInput = screen.getByPlaceholderText(/Type DELETE/i);
      await user.type(confirmInput, 'DELETE');

      expect(confirmButton).toBeEnabled();

      await user.click(confirmButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/organization');
      });
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(
        screen.getByText(/Organization name is required/i)
      ).toBeInTheDocument();
    });

    it('should validate email format', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('support@acme.com')
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/Contact Email/i);
      await user.clear(emailInput);
      await user.type(emailInput, 'invalid-email');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
    });

    it('should validate phone format', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('+1-555-0100')).toBeInTheDocument();
      });

      const phoneInput = screen.getByLabelText(/Contact Phone/i);
      await user.clear(phoneInput);
      await user.type(phoneInput, '123');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(screen.getByText(/Invalid phone format/i)).toBeInTheDocument();
    });
  });

  describe('Success Feedback', () => {
    it('should show success message after saving', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Settings saved successfully/i)
        ).toBeInTheDocument();
      });
    });

    it('should handle save errors gracefully', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockRejectedValue(new Error('Server error'));

      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to save settings/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByRole('main', { name: /Organization Settings/i })
        ).toBeInTheDocument();
        expect(screen.getByLabelText(/Organization Name/i)).toHaveAttribute(
          'aria-required',
          'true'
        );
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      await user.tab();
      expect(screen.getByLabelText(/Organization Name/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/Subdomain/i)).toHaveFocus();
    });

    it('should announce changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<OrganizationSettings />);

      await waitFor(() => {
        expect(
          screen.getByDisplayValue('Acme Corporation')
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Organization Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Settings saved successfully/i);
        expect(alert).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
