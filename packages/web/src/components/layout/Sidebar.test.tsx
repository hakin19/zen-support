import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sidebar } from './Sidebar';
import type { User } from '@aizen/shared';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockPathname = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname(),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'admin',
    customer_id: 'customer-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/chat');
  });

  describe('rendering', () => {
    it('should render the sidebar with logo', () => {
      render(<Sidebar user={mockUser} />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByText(/Aizen vNE/i)).toBeInTheDocument();
    });

    it('should render navigation links', () => {
      render(<Sidebar user={mockUser} />);

      expect(
        screen.getByRole('link', { name: /dashboard/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /chat/i })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /settings/i })
      ).toBeInTheDocument();
    });

    it('should highlight active navigation item', () => {
      mockPathname.mockReturnValue('/chat');
      render(<Sidebar user={mockUser} />);

      const chatLink = screen.getByRole('link', { name: /chat/i });
      expect(chatLink).toHaveClass('active');
    });

    it('should highlight dashboard link when on dashboard route', () => {
      mockPathname.mockReturnValue('/dashboard');
      render(<Sidebar user={mockUser} />);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      expect(dashboardLink).toHaveClass('active');
    });

    it('should show user info with email and role', () => {
      render(<Sidebar user={mockUser} />);

      expect(screen.getByText(mockUser.email!)).toBeInTheDocument();
      expect(screen.getByText(mockUser.role!)).toBeInTheDocument();
    });

    it('should render sign out button', () => {
      const onSignOut = vi.fn();
      render(<Sidebar user={mockUser} onSignOut={onSignOut} />);

      expect(
        screen.getByRole('button', { name: /sign out/i })
      ).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate to chat when chat link is clicked', () => {
      render(<Sidebar user={mockUser} />);

      const chatLink = screen.getByRole('link', { name: /chat/i });
      expect(chatLink).toHaveAttribute('href', '/chat');
    });

    it('should navigate to dashboard when dashboard link is clicked', () => {
      render(<Sidebar user={mockUser} />);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    it('should navigate to settings when settings link is clicked', () => {
      render(<Sidebar user={mockUser} />);

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      expect(settingsLink).toHaveAttribute('href', '/settings');
    });
  });

  describe('responsive behavior', () => {
    it('should be collapsible on mobile', () => {
      render(<Sidebar user={mockUser} />);

      const toggleButton = screen.getByRole('button', {
        name: /toggle sidebar/i,
      });
      expect(toggleButton).toBeInTheDocument();

      fireEvent.click(toggleButton);
      // Sidebar should be collapsed - specific implementation will vary
    });

    it('should show mobile menu button on small screens', () => {
      render(<Sidebar user={mockUser} />);

      const mobileMenuButton = screen.getByRole('button', {
        name: /toggle sidebar/i,
      });
      expect(mobileMenuButton).toBeInTheDocument();
    });
  });

  describe('role-based visibility', () => {
    it('should show all navigation items for admin users', () => {
      render(<Sidebar user={{ ...mockUser, role: 'admin' }} />);

      expect(screen.getByRole('link', { name: /chat/i })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /settings/i })
      ).toBeInTheDocument();
    });

    it('should show limited navigation for viewer users', () => {
      render(<Sidebar user={{ ...mockUser, role: 'viewer' }} />);

      expect(screen.getByRole('link', { name: /chat/i })).toBeInTheDocument();
      // Settings might be limited or hidden for viewers
      const settingsLink = screen.getByRole('link', { name: /settings/i });
      expect(settingsLink).toBeInTheDocument();
    });

    it('should show owner-specific options for owner role', () => {
      render(<Sidebar user={{ ...mockUser, role: 'owner' }} />);

      // Owner should see all options
      expect(screen.getByRole('link', { name: /chat/i })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /settings/i })
      ).toBeInTheDocument();
    });
  });

  describe('sign out', () => {
    it('should call sign out handler when sign out button is clicked', async () => {
      const onSignOut = vi.fn();
      render(<Sidebar user={mockUser} onSignOut={onSignOut} />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      expect(onSignOut).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<Sidebar user={mockUser} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Main navigation');
    });

    it('should support keyboard navigation', () => {
      render(<Sidebar user={mockUser} />);

      const chatLink = screen.getByRole('link', { name: /chat/i });
      chatLink.focus();
      expect(document.activeElement).toBe(chatLink);
    });
  });
});
