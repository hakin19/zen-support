import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProtectedRoute } from './ProtectedRoute';
import type { Session } from '@supabase/supabase-js';

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  redirect: vi.fn(path => {
    throw new Error(`NEXT_REDIRECT: ${path}`);
  }),
}));

// Mock Supabase auth
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@aizen/shared/lib/supabase', () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

describe('ProtectedRoute', () => {
  const mockSession: Session = {
    access_token: 'test-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      app_metadata: {},
      user_metadata: { role: 'admin' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe('authentication check', () => {
    it('should render children when user is authenticated', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('should redirect to login when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login');
      });

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should show loading state while checking authentication', () => {
      mockGetSession.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('role-based access control', () => {
    it('should allow access when user has required role', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      render(
        <ProtectedRoute requiredRole='admin'>
          <div data-testid='admin-content'>Admin Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      });
    });

    it('should deny access when user lacks required role', async () => {
      const viewerSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          user_metadata: { role: 'viewer' },
        },
      };

      mockGetSession.mockResolvedValue({
        data: { session: viewerSession },
        error: null,
      });

      render(
        <ProtectedRoute requiredRole='admin'>
          <div data-testid='admin-content'>Admin Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/access denied/i)).toBeInTheDocument();
      });

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });

    it('should handle owner role hierarchy correctly', async () => {
      const ownerSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          user_metadata: { role: 'owner' },
        },
      };

      mockGetSession.mockResolvedValue({
        data: { session: ownerSession },
        error: null,
      });

      render(
        <ProtectedRoute requiredRole='admin'>
          <div data-testid='admin-content'>Admin Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      });
    });

    it('should handle admin role accessing owner-only content', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      render(
        <ProtectedRoute requiredRole='owner'>
          <div data-testid='owner-content'>Owner Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/access denied/i)).toBeInTheDocument();
      });

      expect(screen.queryByTestId('owner-content')).not.toBeInTheDocument();
    });
  });

  describe('auth state changes', () => {
    it('should listen for auth state changes', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(mockOnAuthStateChange).toHaveBeenCalled();
      });
    });

    it('should redirect when user signs out', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { rerender } = render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      // Simulate auth state change to signed out
      const authChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
      authChangeCallback('SIGNED_OUT', null);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login');
      });
    });

    it('should clean up auth listener on unmount', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const unsubscribe = vi.fn();
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe } },
      });

      const { unmount } = render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle session fetch errors', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: new Error('Failed to fetch session'),
      });

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByText(/error loading session/i)).toBeInTheDocument();
      });
    });

    it('should retry on temporary failures', async () => {
      let callCount = 0;
      mockGetSession.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            data: { session: null },
            error: new Error('Network error'),
          };
        }
        return {
          data: { session: mockSession },
          error: null,
        };
      });

      render(
        <ProtectedRoute>
          <div data-testid='protected-content'>Protected Content</div>
        </ProtectedRoute>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      expect(callCount).toBeGreaterThan(1);
    });
  });
});
