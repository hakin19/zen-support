'use client';

import { createClient } from '@supabase/supabase-js';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'connecting';
  last_heartbeat: string;
}

interface DeviceStatusIndicatorProps {
  deviceId: string;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function DeviceStatusIndicator({
  deviceId,
  className,
  showLabel = true,
  size = 'md',
}: DeviceStatusIndicatorProps): React.ReactElement {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );

  useEffect(() => {
    // Fetch initial device status
    const fetchDevice = async () => {
      try {
        const { data, error } = await supabase
          .from('devices')
          .select('id, name, status, last_heartbeat')
          .eq('id', deviceId)
          .single();

        if (error) throw error;
        setDevice(data);
        setLoading(false);
      } catch {
        // console.error('Error fetching device:', err);
        setError('Failed to load device');
        setLoading(false);
      }
    };

    void fetchDevice();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`device-status-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`,
        },
        (payload: { new: Device }) => {
          // Device status update
          setDevice(payload.new);
        }
      )
      .subscribe();

    // Also subscribe to broadcast events for immediate updates
    const broadcastSubscription = supabase
      .channel(`device-events-${deviceId}`)
      .on(
        'broadcast',
        { event: 'device_status' },
        ({
          payload,
        }: {
          payload: {
            deviceId: string;
            status: 'online' | 'offline' | 'connecting';
            timestamp: string;
          };
        }) => {
          if (payload.deviceId === deviceId) {
            setDevice(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                status: payload.status,
                last_heartbeat: payload.timestamp,
              };
            });
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      void subscription.unsubscribe();
      void broadcastSubscription.unsubscribe();
    };
  }, [deviceId, supabase]);

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Loader2 className='animate-spin h-4 w-4' />
        {showLabel && <span className='text-sm'>Loading...</span>}
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <WifiOff className='h-4 w-4 text-gray-400' />
        {showLabel && <span className='text-sm text-gray-500'>Unknown</span>}
      </div>
    );
  }

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const statusConfig = {
    online: {
      icon: Wifi,
      color: 'text-green-500',
      label: 'Online',
      pulse: true,
    },
    offline: {
      icon: WifiOff,
      color: 'text-red-500',
      label: 'Offline',
      pulse: false,
    },
    connecting: {
      icon: Wifi,
      color: 'text-yellow-500',
      label: 'Connecting',
      pulse: true,
    },
  };

  const config = statusConfig[device.status] || statusConfig.offline;
  const Icon = config.icon;

  // Calculate time since last heartbeat
  const timeSinceHeartbeat = device.last_heartbeat
    ? Math.floor(
        (Date.now() - new Date(device.last_heartbeat).getTime()) / 1000
      )
    : null;

  const formatTimeSince = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      data-testid={`device-status-${deviceId}`}
      data-status={device.status}
    >
      <div className='relative'>
        <Icon className={cn(sizeClasses[size], config.color)} />
        {config.pulse && (
          <span
            className={cn(
              'absolute inset-0 animate-ping rounded-full opacity-75',
              config.color.replace('text-', 'bg-')
            )}
          />
        )}
      </div>
      {showLabel && (
        <div className='flex flex-col'>
          <span className={cn('text-sm font-medium', config.color)}>
            {config.label}
          </span>
          {timeSinceHeartbeat !== null && (
            <span className='text-xs text-gray-500'>
              {formatTimeSince(timeSinceHeartbeat)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Compound component for multiple devices
interface DeviceStatusListProps {
  deviceIds: string[];
  className?: string;
}

export function DeviceStatusList({
  deviceIds,
  className,
}: DeviceStatusListProps): React.ReactElement {
  return (
    <div className={cn('space-y-2', className)}>
      {deviceIds.map(deviceId => (
        <DeviceStatusIndicator
          key={deviceId}
          deviceId={deviceId}
          showLabel={true}
          size='md'
        />
      ))}
    </div>
  );
}
