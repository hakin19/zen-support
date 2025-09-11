import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '../../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SettingsPage } from './SettingsPage';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

// Mock the router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/settings'),
}));

// Mock the stores
vi.mock('@/store/auth.store');

// Mock child components to simplify testing
vi.mock('./UserManagement', () => ({
  UserManagement: () => (
    <div data-testid='user-management'>User Management Component</div>
  ),
}));

vi.mock('./DeviceRegistration', () => ({
  DeviceRegistration: () => (
    <div data-testid='device-registration'>Device Registration Component</div>
  ),
}));

vi.mock('./PromptTemplateEditor', () => ({
  PromptTemplateEditor: () => (
    <div data-testid='prompt-template-editor'>
      Prompt Template Editor Component
    </div>
  ),
}));

vi.mock('./OrganizationSettings', () => ({
  OrganizationSettings: () => (
    <div data-testid='organization-settings'>
      Organization Settings Component
    </div>
  ),
}));

describe('SettingsPage', () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRouter).mockReturnValue(mockRouter as any);

    // Mock auth store - owner role by default
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: '1', email: 'owner@example.com', role: 'owner' },
      isAuthenticated: true,
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Layout', () => {
    it('should render settings page header', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(
        screen.getByText(/Manage your organization and account settings/i)
      ).toBeInTheDocument();
    });

    it('should display navigation tabs', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Devices/i })).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Organization/i })
      ).toBeInTheDocument();
    });

    it('should show AI Prompts tab for owners only', () => {
      render(<SettingsPage />);
      expect(
        screen.getByRole('tab', { name: /AI Prompts/i })
      ).toBeInTheDocument();
    });

    it('should not show AI Prompts tab for admins', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
      } as any);

      render(<SettingsPage />);
      expect(
        screen.queryByRole('tab', { name: /AI Prompts/i })
      ).not.toBeInTheDocument();
    });

    it('should not show AI Prompts tab for viewers', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
        isAuthenticated: true,
      } as any);

      render(<SettingsPage />);
      expect(
        screen.queryByRole('tab', { name: /AI Prompts/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should show Users tab content by default', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('user-management')).toBeInTheDocument();
      expect(
        screen.queryByTestId('device-registration')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('organization-settings')
      ).not.toBeInTheDocument();
    });

    it('should switch to Devices tab when clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      expect(screen.queryByTestId('user-management')).not.toBeInTheDocument();
      expect(screen.getByTestId('device-registration')).toBeInTheDocument();
    });

    it('should switch to Organization tab when clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /Organization/i }));

      expect(screen.queryByTestId('user-management')).not.toBeInTheDocument();
      expect(screen.getByTestId('organization-settings')).toBeInTheDocument();
    });

    it('should switch to AI Prompts tab when clicked (owner only)', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /AI Prompts/i }));

      expect(screen.queryByTestId('user-management')).not.toBeInTheDocument();
      expect(screen.getByTestId('prompt-template-editor')).toBeInTheDocument();
    });

    it('should update URL when switching tabs', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      expect(mockRouter.push).toHaveBeenCalledWith('/settings?tab=devices');
    });

    it('should load tab from URL parameter', () => {
      vi.mocked(useRouter).mockReturnValue({
        ...mockRouter,
        query: { tab: 'devices' },
      } as any);

      render(<SettingsPage />);

      expect(screen.getByTestId('device-registration')).toBeInTheDocument();
    });
  });

  describe('Role-Based Access', () => {
    describe('Owner Role', () => {
      it('should have access to all tabs', () => {
        render(<SettingsPage />);

        expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Devices/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /AI Prompts/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Organization/i })
        ).toBeInTheDocument();
      });

      it('should have full access to all components', async () => {
        const user = userEvent.setup();
        render(<SettingsPage />);

        // Check Users tab
        expect(screen.getByTestId('user-management')).toBeInTheDocument();

        // Check Devices tab
        await user.click(screen.getByRole('tab', { name: /Devices/i }));
        expect(screen.getByTestId('device-registration')).toBeInTheDocument();

        // Check AI Prompts tab
        await user.click(screen.getByRole('tab', { name: /AI Prompts/i }));
        expect(
          screen.getByTestId('prompt-template-editor')
        ).toBeInTheDocument();

        // Check Organization tab
        await user.click(screen.getByRole('tab', { name: /Organization/i }));
        expect(screen.getByTestId('organization-settings')).toBeInTheDocument();
      });
    });

    describe('Admin Role', () => {
      beforeEach(() => {
        vi.mocked(useAuthStore).mockReturnValue({
          user: { id: '2', email: 'admin@example.com', role: 'admin' },
          isAuthenticated: true,
        } as any);
      });

      it('should have access to most tabs except AI Prompts', () => {
        render(<SettingsPage />);

        expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Devices/i })
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('tab', { name: /AI Prompts/i })
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Organization/i })
        ).toBeInTheDocument();
      });

      it('should have edit access to allowed components', async () => {
        const user = userEvent.setup();
        render(<SettingsPage />);

        // Check Users tab
        expect(screen.getByTestId('user-management')).toBeInTheDocument();

        // Check Devices tab
        await user.click(screen.getByRole('tab', { name: /Devices/i }));
        expect(screen.getByTestId('device-registration')).toBeInTheDocument();

        // Check Organization tab
        await user.click(screen.getByRole('tab', { name: /Organization/i }));
        expect(screen.getByTestId('organization-settings')).toBeInTheDocument();
      });
    });

    describe('Viewer Role', () => {
      beforeEach(() => {
        vi.mocked(useAuthStore).mockReturnValue({
          user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
          isAuthenticated: true,
        } as any);
      });

      it('should have limited tab access', () => {
        render(<SettingsPage />);

        expect(screen.getByRole('tab', { name: /Users/i })).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Devices/i })
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('tab', { name: /AI Prompts/i })
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /Organization/i })
        ).toBeInTheDocument();
      });

      it('should have read-only access to components', async () => {
        const user = userEvent.setup();
        render(<SettingsPage />);

        expect(screen.getByText(/Read-only access/i)).toBeInTheDocument();

        // All components should be in read-only mode
        expect(screen.getByTestId('user-management')).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Devices/i }));
        expect(screen.getByTestId('device-registration')).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Organization/i }));
        expect(screen.getByTestId('organization-settings')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Indicators', () => {
    it('should show active tab indicator', () => {
      render(<SettingsPage />);

      const usersTab = screen.getByRole('tab', { name: /Users/i });
      expect(usersTab).toHaveAttribute('aria-selected', 'true');
      expect(usersTab).toHaveClass('border-b-2', 'border-blue-600');
    });

    it('should update active indicator when switching tabs', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      const devicesTab = screen.getByRole('tab', { name: /Devices/i });
      expect(devicesTab).toHaveAttribute('aria-selected', 'true');
      expect(devicesTab).toHaveClass('border-b-2', 'border-blue-600');

      const usersTab = screen.getByRole('tab', { name: /Users/i });
      expect(usersTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should show tab icons', () => {
      render(<SettingsPage />);

      expect(screen.getByTestId('users-icon')).toBeInTheDocument();
      expect(screen.getByTestId('devices-icon')).toBeInTheDocument();
      expect(screen.getByTestId('organization-icon')).toBeInTheDocument();
    });

    it('should show badge for pending invitations', async () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '1', email: 'owner@example.com', role: 'owner' },
        isAuthenticated: true,
        pendingInvitations: 3,
      } as any);

      render(<SettingsPage />);

      const usersTab = screen.getByRole('tab', { name: /Users/i });
      const badge = within(usersTab).getByText('3');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-red-500');
    });
  });

  describe('Responsive Design', () => {
    it('should show mobile-friendly tab layout on small screens', () => {
      // Mock window.matchMedia for mobile
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 640px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(<SettingsPage />);

      expect(screen.getByTestId('mobile-tab-menu')).toBeInTheDocument();
    });

    it('should show dropdown menu for tabs on mobile', async () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 640px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      const menuButton = screen.getByRole('button', { name: /Menu/i });
      await user.click(menuButton);

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /Users/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /Devices/i })
      ).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner when switching tabs', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      // Simulate slow component loading
      vi.mock('./DeviceRegistration', () => ({
        DeviceRegistration: () => {
          const [loading, setLoading] = React.useState(true);
          React.useEffect(() => {
            setTimeout(() => setLoading(false), 100);
          }, []);
          return loading ? (
            <div data-testid='loading'>Loading...</div>
          ) : (
            <div data-testid='device-registration'>Device Registration</div>
          );
        },
      }));

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error boundary for component failures', () => {
      // Mock a component that throws an error
      vi.mock('./UserManagement', () => ({
        UserManagement: () => {
          throw new Error('Component error');
        },
      }));

      // Suppress error output in test
      const originalError = console.error;
      console.error = vi.fn();

      render(<SettingsPage />);

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Try again/i })
      ).toBeInTheDocument();

      console.error = originalError;
    });

    it('should allow retry after error', async () => {
      let shouldError = true;

      vi.mock('./UserManagement', () => ({
        UserManagement: () => {
          if (shouldError) {
            shouldError = false;
            throw new Error('Component error');
          }
          return <div data-testid='user-management'>User Management</div>;
        },
      }));

      const originalError = console.error;
      console.error = vi.fn();

      const user = userEvent.setup();
      render(<SettingsPage />);

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Try again/i }));

      expect(screen.getByTestId('user-management')).toBeInTheDocument();

      console.error = originalError;
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation between tabs', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      const usersTab = screen.getByRole('tab', { name: /Users/i });
      const devicesTab = screen.getByRole('tab', { name: /Devices/i });

      // Focus on first tab
      await user.click(usersTab);
      expect(usersTab).toHaveFocus();

      // Navigate with arrow keys
      await user.keyboard('{ArrowRight}');
      expect(devicesTab).toHaveFocus();

      // Activate with Enter
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('device-registration')).toBeInTheDocument();
    });

    it('should support Tab key navigation', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.tab();
      expect(screen.getByRole('tab', { name: /Users/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('tab', { name: /Devices/i })).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SettingsPage />);

      expect(
        screen.getByRole('navigation', { name: /Settings navigation/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should have proper ARIA attributes on tabs', () => {
      render(<SettingsPage />);

      const usersTab = screen.getByRole('tab', { name: /Users/i });
      expect(usersTab).toHaveAttribute('aria-selected');
      expect(usersTab).toHaveAttribute('aria-controls');

      const tabPanel = screen.getByRole('tabpanel');
      expect(tabPanel).toHaveAttribute('aria-labelledby');
    });

    it('should announce tab changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      const announcement = screen.getByRole('status', { hidden: true });
      expect(announcement).toHaveTextContent(/Devices tab selected/i);
    });

    it('should support reduced motion preference', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(<SettingsPage />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach(tab => {
        expect(tab).toHaveClass('transition-none');
      });
    });
  });

  describe('Performance', () => {
    it('should lazy load tab content', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      // Initially only Users component should be loaded
      expect(screen.getByTestId('user-management')).toBeInTheDocument();

      // Device component should not be in DOM until tab is clicked
      expect(
        screen.queryByTestId('device-registration')
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      // Now Device component should be loaded
      expect(screen.getByTestId('device-registration')).toBeInTheDocument();
    });

    it('should cache previously loaded tabs', async () => {
      const user = userEvent.setup();
      const renderSpy = vi.fn();

      vi.mock('./UserManagement', () => ({
        UserManagement: () => {
          renderSpy();
          return <div data-testid='user-management'>User Management</div>;
        },
      }));

      render(<SettingsPage />);

      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Switch to another tab
      await user.click(screen.getByRole('tab', { name: /Devices/i }));

      // Switch back to Users tab
      await user.click(screen.getByRole('tab', { name: /Users/i }));

      // Component should not re-render if cached
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });
});
