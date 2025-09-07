import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from './app.store';
import type { User, DiagnosticSession } from '@aizen/shared/types';

describe('useAppStore', () => {
  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'admin',
    customer_id: 'customer-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockSession: DiagnosticSession = {
    id: 'session-123',
    customer_id: 'customer-123',
    device_id: 'device-123',
    status: 'active',
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.reset();
    });
  });

  describe('user state', () => {
    it('should initialize with null user', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.user).toBeNull();
    });

    it('should set user', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.user).toEqual(mockUser);
    });

    it('should clear user', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.user).toEqual(mockUser);

      act(() => {
        result.current.setUser(null);
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('session state', () => {
    it('should initialize with null current session', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.currentSession).toBeNull();
    });

    it('should set current session', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSession(mockSession);
      });

      expect(result.current.currentSession).toEqual(mockSession);
    });

    it('should clear session', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSession(mockSession);
      });

      expect(result.current.currentSession).toEqual(mockSession);

      act(() => {
        result.current.clearSession();
      });

      expect(result.current.currentSession).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should initialize with loading false', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.isLoading).toBe(false);
    });

    it('should set loading state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sidebar state', () => {
    it('should initialize with sidebar open on desktop', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.isSidebarOpen).toBe(true);
    });

    it('should toggle sidebar', () => {
      const { result } = renderHook(() => useAppStore());

      const initialState = result.current.isSidebarOpen;

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.isSidebarOpen).toBe(!initialState);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.isSidebarOpen).toBe(initialState);
    });

    it('should set sidebar open state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.isSidebarOpen).toBe(false);

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.isSidebarOpen).toBe(true);
    });
  });

  describe('theme state', () => {
    it('should initialize with system theme', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.theme).toBe('system');
    });

    it('should set theme', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
    });
  });

  describe('notification state', () => {
    it('should initialize with empty notifications', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.notifications).toEqual([]);
    });

    it('should add notification', () => {
      const { result } = renderHook(() => useAppStore());

      const notification = {
        id: 'notif-1',
        type: 'success' as const,
        message: 'Test notification',
      };

      act(() => {
        result.current.addNotification(notification);
      });

      expect(result.current.notifications).toContainEqual(notification);
    });

    it('should remove notification', () => {
      const { result } = renderHook(() => useAppStore());

      const notification = {
        id: 'notif-1',
        type: 'success' as const,
        message: 'Test notification',
      };

      act(() => {
        result.current.addNotification(notification);
      });

      expect(result.current.notifications).toContainEqual(notification);

      act(() => {
        result.current.removeNotification('notif-1');
      });

      expect(result.current.notifications).not.toContainEqual(notification);
    });

    it('should clear all notifications', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.addNotification({
          id: 'notif-1',
          type: 'success',
          message: 'Notification 1',
        });
        result.current.addNotification({
          id: 'notif-2',
          type: 'error',
          message: 'Notification 2',
        });
      });

      expect(result.current.notifications).toHaveLength(2);

      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.notifications).toEqual([]);
    });
  });

  describe('reset functionality', () => {
    it('should reset all state to initial values', () => {
      const { result } = renderHook(() => useAppStore());

      // Set various state values
      act(() => {
        result.current.setUser(mockUser);
        result.current.setSession(mockSession);
        result.current.setLoading(true);
        result.current.setSidebarOpen(false);
        result.current.setTheme('dark');
        result.current.addNotification({
          id: 'test',
          type: 'info',
          message: 'Test',
        });
      });

      // Verify state was set
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.currentSession).toEqual(mockSession);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSidebarOpen).toBe(false);
      expect(result.current.theme).toBe('dark');
      expect(result.current.notifications).toHaveLength(1);

      // Reset
      act(() => {
        result.current.reset();
      });

      // Verify state was reset
      expect(result.current.user).toBeNull();
      expect(result.current.currentSession).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSidebarOpen).toBe(true);
      expect(result.current.theme).toBe('system');
      expect(result.current.notifications).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('should persist state across hook instances', () => {
      const { result: result1 } = renderHook(() => useAppStore());
      const { result: result2 } = renderHook(() => useAppStore());

      act(() => {
        result1.current.setUser(mockUser);
      });

      expect(result2.current.user).toEqual(mockUser);
    });
  });
});
