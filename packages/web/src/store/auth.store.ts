import { create } from 'zustand';

type UserRole = 'owner' | 'admin' | 'viewer' | 'operator' | 'super_admin';

interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
}

interface AuthState {
  user: User | null;
  session: Record<string, unknown> | null;
  organization: Record<string, unknown> | null;
  isAuthenticated: boolean;
  loading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Record<string, unknown> | null) => void;
  setOrganization: (organization: Record<string, unknown> | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  session: null,
  organization: null,
  isAuthenticated: false,
  loading: true,
  setUser: user => set({ user, isAuthenticated: !!user }),
  setSession: session => set({ session }),
  setOrganization: organization => set({ organization }),
  setLoading: loading => set({ loading }),
  clearAuth: () =>
    set({
      user: null,
      session: null,
      organization: null,
      isAuthenticated: false,
    }),
}));
