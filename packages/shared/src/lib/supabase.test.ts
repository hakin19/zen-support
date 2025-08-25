import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase, auth } from './supabase';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
  })),
}));

describe('Supabase Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should sign in with OTP', async () => {
      const mockResponse = {
        data: { user: null, session: null },
        error: null,
      };

      vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue(mockResponse);

      const result = await auth.signInWithOTP('test@example.com');

      expect(result).toEqual(mockResponse);
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          shouldCreateUser: false,
        },
      });
    });

    it('should handle sign in error', async () => {
      const mockError = {
        data: null,
        error: { message: 'Invalid email', status: 400 },
      };

      vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue(mockError);

      const result = await auth.signInWithOTP('invalid-email');

      expect(result.error).toBeDefined();
      expect((result.error as any)?.message).toBe('Invalid email');
    });

    it('should sign out user', async () => {
      const mockResponse = { error: null };

      vi.mocked(supabase.auth.signOut).mockResolvedValue(mockResponse);

      const result = await auth.signOut();

      expect(result).toEqual(mockResponse);
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it('should get current session', async () => {
      const mockSession = {
        data: {
          session: {
            access_token: 'token123',
            user: { id: 'user123', email: 'test@example.com' },
          },
        },
        error: null,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue(mockSession);

      const result = await auth.getSession();

      expect(result).toEqual(mockSession);
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    it('should get current user', async () => {
      const mockUser = {
        data: {
          user: {
            id: 'user123',
            email: 'test@example.com',
            created_at: '2024-01-01',
          },
        },
        error: null,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockUser);

      const result = await auth.getUser();

      expect(result).toEqual(mockUser);
      expect(supabase.auth.getUser).toHaveBeenCalled();
    });
  });

  describe('Real-time Subscriptions', () => {
    it('should subscribe to table changes', async () => {
      const mockCallback = vi.fn();
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      // Test using the actual realtime functions from supabase.ts
      // Import is already at the top, use the exported realtime
      const { realtime } = await import('./supabase');
      const subscription = realtime.subscribeToDeviceStatus(
        '123',
        mockCallback
      );

      expect(supabase.channel).toHaveBeenCalledWith('devices:123');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: 'customer_id=eq.123',
        },
        mockCallback
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should subscribe to diagnostic sessions', async () => {
      const mockCallback = vi.fn();
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      const { realtime } = await import('./supabase');
      realtime.subscribeToSessions('123', mockCallback);

      expect(supabase.channel).toHaveBeenCalledWith('sessions:123');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diagnostic_sessions',
          filter: 'customer_id=eq.123',
        },
        mockCallback
      );
    });

    it('should subscribe to alerts', async () => {
      const mockCallback = vi.fn();
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      const { realtime } = await import('./supabase');
      realtime.subscribeToAlerts('123', mockCallback);

      expect(supabase.channel).toHaveBeenCalledWith('alerts:123');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: 'customer_id=eq.123',
        },
        mockCallback
      );
    });
  });

  describe('Database Operations', () => {
    it('should query data from a table', async () => {
      const mockData = [
        { id: '1', name: 'Device 1' },
        { id: '2', name: 'Device 2' },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      const query = supabase
        .from('devices')
        .select('*')
        .eq('customer_id', '123');

      const result = await query;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should handle database errors', async () => {
      const mockError = {
        message: 'Permission denied',
        code: '42501',
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      const query = supabase
        .from('devices')
        .select('*')
        .eq('customer_id', '999');

      const result = await query;

      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
});
