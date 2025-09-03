import { randomBytes, createHash } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

export interface Device {
  id: string;
  customerId: string;
  status: 'active' | 'inactive' | 'suspended';
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

      // Fetch device from database
      const { data: device, error } = await supabase
        .from('devices')
        .select('id, customer_id, status, name, device_secret_hash')
        .eq('id', deviceId)
        .single();

      if (error ?? !device) {
        return { valid: false };
      }

      // Verify the device secret
      const providedSecretHash = hashSecret(deviceSecret);
      if (device.device_secret_hash !== providedSecretHash) {
        return { valid: false };
      }

      // Check if device is not suspended
      if (device.status === 'suspended') {
        return {
          valid: true,
          device: {
            id: device.id as string,
            customerId: device.customer_id as string,
            status: 'suspended',
            name: device.name as string,
          },
        };
      }

      return {
        valid: true,
        device: {
          id: device.id as string,
          customerId: device.customer_id as string,
          status: device.status as 'active' | 'inactive' | 'suspended',
          name: device.name as string,
        },
      };
    } catch (error) {
      console.error('Failed to validate device credentials:', error);
      return { valid: false };
    }
  },

  async validateActivationCode(code: string): Promise<ActivationCodeResult> {
    try {
      const redis = getRedisClient();
      const activationData = await redis.getCache(
        `${ACTIVATION_CODE_PREFIX}${code}`
      );

      if (!activationData) {
        return { valid: false, reason: 'expired' };
      }

      const { customerId, deviceId } = activationData as {
        customerId: string;
        deviceId: string;
      };

      // Check if device is not already registered
      const supabase = getSupabaseAdminClient();
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('id')
        .eq('id', deviceId)
        .single();

      if (existingDevice?.id) {
        return { valid: false, reason: 'already_registered' };
      }

      return {
        valid: true,
        customerId,
        deviceId,
      };
    } catch (error) {
      console.error('Failed to validate activation code:', error);
      return { valid: false, reason: 'error' };
    }
  },

  async registerDevice(params: {
    deviceId: string;
    customerId: string;
    deviceName: string;
  }): Promise<RegisterDeviceResult> {
    try {
      const supabase = getSupabaseAdminClient();

      // Generate a new device secret
      const deviceSecret = generateDeviceSecret();
      const deviceSecretHash = hashSecret(deviceSecret);

      // Insert device into database
      const { error } = await supabase.from('devices').insert({
        id: params.deviceId,
        customer_id: params.customerId,
        name: params.deviceName,
        device_secret_hash: deviceSecretHash,
        status: 'active',
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });

      if (error) {
        if (error.code === '23505') {
          // Unique violation
          const deviceExistsError = new Error(
            'Device ID already registered'
          ) as Error & { code: string };
          deviceExistsError.code = 'DEVICE_EXISTS';
          throw deviceExistsError;
        }
        throw error;
      }

      return {
        deviceId: params.deviceId,
        deviceSecret,
        customerId: params.customerId,
      };
    } catch (error) {
      console.error('Failed to register device:', error);
      throw error;
    }
  },

  async updateHeartbeat(
    deviceId: string,
    data: HeartbeatData
  ): Promise<boolean> {
    try {
      const supabase = getSupabaseAdminClient();

      // Update device last_seen and metrics
      const { error } = await supabase
        .from('devices')
        .update({
          last_seen: new Date().toISOString(),
          status: data.status === 'healthy' ? 'active' : 'degraded',
          metrics: data.metrics
            ? {
                cpu: data.metrics.cpu,
                memory: data.metrics.memory,
                uptime: data.metrics.uptime,
                updated_at: new Date().toISOString(),
              }
            : undefined,
        })
        .eq('id', deviceId);

      if (error) {
        console.error('Failed to update device heartbeat:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to update heartbeat:', error);
      return false;
    }
  },

  async createActivationCode(
    customerId: string,
    deviceId: string
  ): Promise<string> {
    try {
      const redis = getRedisClient();

      // Generate a human-friendly activation code (8 chars, uppercase)
      const code = randomBytes(4).toString('hex').toUpperCase();

      await redis.setCache(
        `${ACTIVATION_CODE_PREFIX}${code}`,
        { customerId, deviceId },
        ACTIVATION_CODE_TTL
      );

      return code;
    } catch (error) {
      console.error('Failed to create activation code:', error);
      throw error;
    }
  },
};
