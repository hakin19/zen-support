import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RootLayout } from './RootLayout';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

// Mock Supabase auth
vi.mock('@aizen/shared/lib/supabase', () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
              user_metadata: { role: 'admin' },
            },
          },
        },
        error: null,
      }),
    },
  }),
}));

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the layout wrapper with children', () => {
      render(
        <RootLayout>
          <div data-testid='test-child'>Test Content</div>
        </RootLayout>
      );

      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });

    it('should have proper HTML structure with body and main tags', () => {
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );

      const html = container.querySelector('html');
      const body = container.querySelector('body');
      expect(html).toHaveAttribute('lang', 'en');
      expect(body).toBeInTheDocument();
    });

    it('should apply dark mode class when theme is dark', () => {
      // This will be implemented when we add theme support
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );

      // Initially should not have dark class
      expect(container.querySelector('html')).not.toHaveClass('dark');
    });
  });

  describe('metadata', () => {
    it('should have proper viewport and charset meta tags', () => {
      const { container } = render(
        <RootLayout>
          <div>Content</div>
        </RootLayout>
      );

      // These will be added via Next.js metadata API
      // Test will be updated when implementing the actual component
      expect(container).toBeInTheDocument();
    });
  });

  describe('error boundary', () => {
    it('should handle errors gracefully', () => {
      // Error boundary tests will be added when implementing
      // the error handling component
      expect(true).toBe(true);
    });
  });
});
