import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { User } from '@aizen/shared';

interface DiagnosticSession {
  id: string;
  customer_id: string;
  device_id: string;
  user_id?: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface AppState {
  // User state
  user: User | null;
  setUser: (user: User | null) => void;

  // Session state
  currentSession: DiagnosticSession | null;
  setSession: (session: DiagnosticSession | null) => void;
  clearSession: () => void;

  // Loading state
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Sidebar state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Theme state
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Notification state
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Reset state
  reset: () => void;
}

const initialState = {
  user: null,
  currentSession: null,
  isLoading: false,
  isSidebarOpen: true,
  theme: 'system' as const,
  notifications: [] as Notification[],
};

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Initial state
      ...initialState,

      // User actions
      setUser: user => set({ user }, false, 'setUser'),

      // Session actions
      setSession: session =>
        set({ currentSession: session }, false, 'setSession'),
      clearSession: () => set({ currentSession: null }, false, 'clearSession'),

      // Loading actions
      setLoading: loading => set({ isLoading: loading }, false, 'setLoading'),

      // Sidebar actions
      toggleSidebar: () =>
        set(
          state => ({ isSidebarOpen: !state.isSidebarOpen }),
          false,
          'toggleSidebar'
        ),
      setSidebarOpen: open =>
        set({ isSidebarOpen: open }, false, 'setSidebarOpen'),

      // Theme actions
      setTheme: theme => {
        set({ theme }, false, 'setTheme');
        // Apply theme to document
        if (theme === 'dark') {
          if (typeof document !== 'undefined') {
            document.documentElement.classList.add('dark');
          }
        } else if (theme === 'light') {
          if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('dark');
          }
        } else {
          // System theme
          const prefersDark =
            typeof window !== 'undefined'
              ? window.matchMedia('(prefers-color-scheme: dark)').matches
              : false;
          if (prefersDark) {
            if (typeof document !== 'undefined') {
              document.documentElement.classList.add('dark');
            }
          } else {
            if (typeof document !== 'undefined') {
              document.documentElement.classList.remove('dark');
            }
          }
        }
      },

      // Notification actions
      addNotification: notification => {
        set(
          state => ({
            notifications: [...state.notifications, notification],
          }),
          false,
          'addNotification'
        );

        // Auto-remove notification after duration
        if (notification.duration !== 0) {
          if (typeof setTimeout !== 'undefined') {
            setTimeout(() => {
              get().removeNotification(notification.id);
            }, notification.duration ?? 5000);
          }
        }
      },

      removeNotification: id => {
        set(
          state => ({
            notifications: state.notifications.filter(n => n.id !== id),
          }),
          false,
          'removeNotification'
        );
      },

      clearNotifications: () =>
        set({ notifications: [] }, false, 'clearNotifications'),

      // Reset action
      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'app-store' }
  )
);
