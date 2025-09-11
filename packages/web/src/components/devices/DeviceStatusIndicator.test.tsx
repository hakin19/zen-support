import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeviceStatusIndicator,
  DeviceStatusList,
} from './DeviceStatusIndicator';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('DeviceStatusIndicator', () => {
  let mockSupabaseClient: any;
  let mockChannel: any;
  let mockSubscription: any;

  beforeEach(() => {
    // Setup mock channel and subscription
    mockSubscription = {
      unsubscribe: vi.fn(),
    };

    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue(mockSubscription),
    };

    // Setup mock Supabase client
    mockSupabaseClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'device-001',
                name: 'Test Device',
                status: 'online',
                last_heartbeat: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
      channel: vi.fn().mockReturnValue(mockChannel),
    };

    (createClient as any).mockReturnValue(mockSupabaseClient);

    // Mock environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should show loading state initially', () => {
      render(<DeviceStatusIndicator deviceId='device-001' />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should fetch and display device status', async () => {
      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('devices');
      expect(screen.getByTestId('device-status-device-001')).toHaveAttribute(
        'data-status',
        'online'
      );
    });

    it('should display offline status', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'device-001',
                name: 'Test Device',
                status: 'offline',
                last_heartbeat: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      });

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
      });

      expect(screen.getByTestId('device-status-device-001')).toHaveAttribute(
        'data-status',
        'offline'
      );
    });

    it('should handle error state', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Failed to fetch'),
            }),
          }),
        }),
      });

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to device status updates', async () => {
      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      // Verify channel subscriptions were created
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'device-status-device-001'
      );
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'device-events-device-001'
      );
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: 'id=eq.device-001',
        }),
        expect.any(Function)
      );
    });

    it('should update status when receiving real-time update', async () => {
      let postgresCallback: any;
      mockChannel.on.mockImplementation(
        (
          event: string,
          _config: unknown,
          callback: (payload: unknown) => void
        ) => {
          if (event === 'postgres_changes') {
            postgresCallback = callback;
          }
          return mockChannel;
        }
      );

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      // Simulate real-time update changing status to offline
      postgresCallback({
        new: {
          id: 'device-001',
          name: 'Test Device',
          status: 'offline',
          last_heartbeat: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
      });

      expect(screen.getByTestId('device-status-device-001')).toHaveAttribute(
        'data-status',
        'offline'
      );
    });

    it('should handle broadcast events for immediate updates', async () => {
      let broadcastCallback: any;
      mockChannel.on.mockImplementation(
        (
          event: string,
          _config: unknown,
          callback: (payload: unknown) => void
        ) => {
          if (event === 'broadcast') {
            broadcastCallback = callback;
          }
          return mockChannel;
        }
      );

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      // Simulate broadcast event changing status to connecting
      broadcastCallback({
        payload: {
          deviceId: 'device-001',
          status: 'connecting',
          timestamp: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Connecting')).toBeInTheDocument();
      });
    });

    it('should unsubscribe on unmount', async () => {
      const { unmount } = render(
        <DeviceStatusIndicator deviceId='device-001' />
      );

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(2); // Once for each subscription
    });
  });

  describe('Display Options', () => {
    it('should hide label when showLabel is false', async () => {
      render(<DeviceStatusIndicator deviceId='device-001' showLabel={false} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('device-status-device-001')
        ).toBeInTheDocument();
      });

      expect(screen.queryByText('Online')).not.toBeInTheDocument();
    });

    it('should apply size classes correctly', async () => {
      const { rerender } = render(
        <DeviceStatusIndicator deviceId='device-001' size='sm' />
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('device-status-device-001')
        ).toBeInTheDocument();
      });

      // Check for small size class
      const iconElement = screen
        .getByTestId('device-status-device-001')
        .querySelector('svg');
      expect(iconElement).toHaveClass('h-3', 'w-3');

      // Rerender with large size
      rerender(<DeviceStatusIndicator deviceId='device-001' size='lg' />);

      const largeIconElement = screen
        .getByTestId('device-status-device-001')
        .querySelector('svg');
      expect(largeIconElement).toHaveClass('h-5', 'w-5');
    });

    it('should display time since last heartbeat', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'device-001',
                name: 'Test Device',
                status: 'online',
                last_heartbeat: fiveMinutesAgo,
              },
              error: null,
            }),
          }),
        }),
      });

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText(/5m ago/)).toBeInTheDocument();
      });
    });
  });

  describe('DeviceStatusList', () => {
    it('should render multiple device indicators', async () => {
      const deviceIds = ['device-001', 'device-002', 'device-003'];

      render(<DeviceStatusList deviceIds={deviceIds} />);

      await waitFor(() => {
        expect(screen.getAllByText('Online')).toHaveLength(3);
      });

      deviceIds.forEach(id => {
        expect(screen.getByTestId(`device-status-${id}`)).toBeInTheDocument();
      });
    });

    it('should handle empty device list', () => {
      render(<DeviceStatusList deviceIds={[]} />);

      // Should render empty container
      expect(screen.queryByTestId(/device-status-/)).not.toBeInTheDocument();
    });
  });

  describe('Performance and Updates', () => {
    it('should update within 2 seconds of status change', async () => {
      vi.useFakeTimers();
      let postgresCallback: any;

      mockChannel.on.mockImplementation(
        (
          event: string,
          _config: unknown,
          callback: (payload: unknown) => void
        ) => {
          if (event === 'postgres_changes') {
            postgresCallback = callback;
          }
          return mockChannel;
        }
      );

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      const startTime = Date.now();

      // Simulate status change
      postgresCallback({
        new: {
          id: 'device-001',
          name: 'Test Device',
          status: 'offline',
          last_heartbeat: new Date().toISOString(),
        },
      });

      // Advance timers
      vi.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
      });

      const endTime = Date.now();
      const updateTime = endTime - startTime;

      // Verify update happened within 2 seconds
      expect(updateTime).toBeLessThanOrEqual(2000);

      vi.useRealTimers();
    });

    it('should handle rapid status changes', async () => {
      let postgresCallback: any;

      mockChannel.on.mockImplementation(
        (
          event: string,
          _config: unknown,
          callback: (payload: unknown) => void
        ) => {
          if (event === 'postgres_changes') {
            postgresCallback = callback;
          }
          return mockChannel;
        }
      );

      render(<DeviceStatusIndicator deviceId='device-001' />);

      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });

      // Simulate rapid status changes
      const statusChanges = ['offline', 'connecting', 'online', 'offline'];

      for (const status of statusChanges) {
        postgresCallback({
          new: {
            id: 'device-001',
            name: 'Test Device',
            status,
            last_heartbeat: new Date().toISOString(),
          },
        });
      }

      // Should end up with the last status
      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
      });

      expect(screen.getByTestId('device-status-device-001')).toHaveAttribute(
        'data-status',
        'offline'
      );
    });
  });
});
