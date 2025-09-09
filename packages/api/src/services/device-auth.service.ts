import { randomBytes, createHash } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

export interface Device {
  id: string;
  customerId: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  name?: string;
  deviceSecret?: string;
}

export interface ValidationResult {
  valid: boolean;
  device?: Device;
}

export interface ActivationCodeResult {
  valid: boolean;
  customerId?: string;
  deviceId?: string;
  reason?: string;
}

export interface RegisterDeviceResult {
  deviceId: string;
  deviceSecret: string;
  customerId: string;
}

class DeviceError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'DeviceError';
  }
}

interface HeartbeatData {
  status: string;
  metrics?: {
    cpu: number;
    memory: number;
    uptime: number;
  };
}

const ACTIVATION_CODE_PREFIX = 'device:activation:';
const ACTIVATION_CODE_TTL = 86400; // 24 hours in seconds

function generateDeviceSecret(): string {
  // Generate a secure random secret (32 bytes -> 64 char hex string)
  return randomBytes(32).toString('hex');
}

function hashSecret(secret: string): string {
  // Hash the secret for storage (we never store plaintext secrets)
  return createHash('sha256').update(secret).digest('hex');
}

export const deviceAuthService = {
  async validateCredentials(
    deviceId: string,
    deviceSecret: string
  ): Promise<ValidationResult> {
    try {
      const supabase = getSupabaseAdminClient();

      // Fetch device from database (only existing schema fields)
      const { data: device, error } = await supabase
        .from('devices')
        .select('device_id, customer_id, status, name')
        .eq('device_id', deviceId)
        .single();

      if (error ?? !device) {
        return { valid: false };
      }

      // Verify the device secret using Redis-backed hash for local/dev bootstrap
      // Key pattern: device:secret:sha256:{deviceId}
      const redis = getRedisClient();
      const providedSecretHash = hashSecret(deviceSecret);
      const redisKey = `device:secret:sha256:${deviceId}`;
      const storedHash = await redis.getClient().get(redisKey);
      if (!storedHash || storedHash !== providedSecretHash) {
        return { valid: false };
      }

      // Check if device is in maintenance mode
      if (device.status === 'maintenance') {
        return {
          valid: true,
          device: {
            id: device.device_id as string,
            customerId: device.customer_id as string,
            status: 'maintenance',
            name: device.name as string,
          },
        };
      }

      return {
        valid: true,
        device: {
          id: device.device_id as string,
          customerId: device.customer_id as string,
          status: device.status as
            | 'online'
            | 'offline'
            | 'error'
            | 'maintenance',
          name: device.name as string,
        },
      };
    } catch (error) {
      console.error('Error validating device credentials:', error);
      return { valid: false };
    }
  },

  async validateActivationCode(
    activationCode: string
  ): Promise<ActivationCodeResult> {
    const redis = getRedisClient();
    const key = `${ACTIVATION_CODE_PREFIX}${activationCode}`;

    // Check if activation code exists
    const data = await redis.getClient().get(key);

    if (!data) {
      return {
        valid: false,
        reason: 'invalid',
      };
    }

    let customerId: string;
    let deviceId: string | undefined;

    try {
      const parsedData = JSON.parse(data) as {
        customerId: string;
        deviceId?: string;
      };
      customerId = parsedData.customerId;
      deviceId = parsedData.deviceId;
    } catch (error) {
      console.error('Failed to parse activation code data:', error);
      return {
        valid: false,
        reason: 'invalid',
      };
    }

    // Check if this device is already registered
    if (deviceId) {
      const supabase = getSupabaseAdminClient();
      const { data: device } = await supabase
        .from('devices')
        .select('id')
        .eq('id', deviceId)
        .single();

      if (device) {
        return {
          valid: false,
          reason: 'already_registered',
        };
      }
    }

    return {
      valid: true,
      customerId,
      deviceId,
    };
  },

  async registerDevice({
    deviceId,
    customerId,
    deviceName,
  }: {
    deviceId: string;
    customerId: string;
    deviceName: string;
  }): Promise<RegisterDeviceResult> {
    try {
      const supabase = getSupabaseAdminClient();

      // Check if device already exists
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('id')
        .eq('device_id', deviceId)
        .single();

      if (existingDevice) {
        throw new DeviceError('Device ID already registered', 'DEVICE_EXISTS');
      }

      // Generate device secret
      const deviceSecret = generateDeviceSecret();

      // Create device record (existing schema fields only)
      const { error: insertError } = await supabase.from('devices').insert({
        device_id: deviceId,
        customer_id: customerId,
        name: deviceName,
        status: 'offline',
        last_heartbeat_at: new Date().toISOString(),
      });

      if (insertError) {
        // Check for unique constraint violation (Postgres error code 23505)
        if ('code' in insertError && insertError.code === '23505') {
          throw new DeviceError(
            'Device ID already registered',
            'DEVICE_EXISTS'
          );
        }
        console.error('Error registering device:', insertError);
        throw new Error('Failed to register device');
      }

      // Store secret hash in Redis for validation
      const redis = getRedisClient();
      const redisKey = `device:secret:sha256:${deviceId}`;
      await redis.getClient().set(redisKey, hashSecret(deviceSecret));

      return {
        deviceId,
        deviceSecret, // Return the plaintext secret (only shown once)
        customerId,
      };
    } catch (error) {
      // Re-throw known errors
      if (error instanceof DeviceError) {
        throw error;
      }

      console.error('Error registering device:', error);
      throw new Error('Failed to register device');
    }
  },

  async updateHeartbeat(
    deviceId: string,
    data: HeartbeatData
  ): Promise<boolean> {
    try {
      const supabase = getSupabaseAdminClient();

      // Update device last_seen timestamp, status, and metrics in DB
      const { error } = await supabase
        .from('devices')
        .update({
          last_heartbeat_at: new Date().toISOString(),
          status: data.status === 'healthy' ? 'online' : 'offline',
          network_info: data.metrics ? { metrics: data.metrics } : null,
        })
        .eq('device_id', deviceId);

      if (error) {
        console.error('Error updating heartbeat:', error);
        return false;
      }

      // Also store metrics in Redis for real-time monitoring
      if (data.metrics) {
        const redis = getRedisClient();
        const metricsKey = `device:metrics:${deviceId}`;
        await redis.getClient().setEx(
          metricsKey,
          300, // 5 minute TTL for metrics
          JSON.stringify({
            ...data,
            timestamp: new Date().toISOString(),
          })
        );
      }

      return true;
    } catch (error) {
      console.error('Error updating heartbeat:', error);
      return false;
    }
  },

  async createActivationCode(
    customerId: string,
    deviceId: string
  ): Promise<string> {
    const redis = getRedisClient();

    // Generate a unique activation code
    const activationCode = randomBytes(16).toString('hex');
    const key = `${ACTIVATION_CODE_PREFIX}${activationCode}`;

    // Store in Redis with TTL - now includes both customerId AND deviceId for security
    await redis
      .getClient()
      .setEx(
        key,
        ACTIVATION_CODE_TTL,
        JSON.stringify({ customerId, deviceId })
      );

    return activationCode;
  },
};
