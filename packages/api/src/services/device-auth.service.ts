import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';

import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import type { WebSocketConnectionManager } from './websocket-connection-manager';

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
  status: string; // accepts 'healthy' | 'degraded' | 'offline' | 'online'
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

// Global connection manager instance (will be set by server initialization)
let connectionManager: WebSocketConnectionManager | null = null;

export function setConnectionManager(
  manager: WebSocketConnectionManager
): void {
  connectionManager = manager;
}

export const deviceAuthService = {
  async validateCredentials(
    deviceId: string,
    deviceSecret: string
  ): Promise<ValidationResult> {
    try {
      console.log('[AUTH] Validating device credentials for:', deviceId);
      console.log('[AUTH] Using Supabase URL:', process.env.SUPABASE_URL);
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Starting validation for: ${deviceId}\n`
      );
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Env SUPABASE_URL: ${process.env.SUPABASE_URL}\n`
      );
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Env SUPABASE_SERVICE_ROLE_KEY exists: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}\n`
      );

      const supabase = getSupabaseAdminClient();
      fs.appendFileSync('/tmp/test-diag.log', `[AUTH] Got Supabase client\n`);
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Client type: ${typeof supabase}, has from: ${typeof supabase?.from}\n`
      );

      // Fetch device from database (only existing schema fields)
      console.log('[AUTH] Fetching device from database...');
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] About to query for device: ${deviceId}\n`
      );

      // Simplified approach - just try the standard Supabase pattern
      let result;
      try {
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] About to call supabase.from('devices')\n`
        );
        const fromResult = supabase.from('devices');
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] from() returned: ${typeof fromResult}, has select: ${typeof fromResult?.select}\n`
        );

        const selectResult = fromResult.select(
          'device_id, customer_id, status, name'
        );
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] select() returned: ${typeof selectResult}, has eq: ${typeof selectResult?.eq}\n`
        );

        const eqResult = selectResult.eq('device_id', deviceId);
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] eq() returned: ${typeof eqResult}, has single: ${typeof eqResult?.single}\n`
        );

        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] About to await single()\n`
        );
        const singlePromise = eqResult.single();
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] single() returned: ${typeof singlePromise}, is Promise: ${singlePromise instanceof Promise}\n`
        );
        result = await singlePromise;
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] After await, result type: ${typeof result}\n`
        );
      } catch (queryErr) {
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] Query threw error: ${String(queryErr)}\n`
        );
        throw queryErr;
      }

      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Query completed, result: ${JSON.stringify(result)}\n`
      );

      // Continue with result processing
      if (!result) {
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] Result is null/undefined\n`
        );
      } else if (result.error) {
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] Result has error: ${JSON.stringify(result.error)}\n`
        );
      } else if (result.data) {
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[AUTH] Result has data: ${JSON.stringify(result.data)}\n`
        );
      }

      // Check if result is undefined (which happens when Supabase isn't initialized properly)
      if (!result) {
        console.error(
          '[AUTH] Supabase query returned undefined - client may not be initialized'
        );
        return { valid: false };
      }

      const { data: device, error } = result;

      if (error ?? !device) {
        if (error) {
          console.error('[AUTH] Error fetching device:', error);
          fs.appendFileSync(
            '/tmp/test-diag.log',
            `[AUTH] Error: ${JSON.stringify(error)}\n`
          );
        } else {
          console.error('[AUTH] Device not found:', deviceId);
          // List all devices to debug
          const listResult = await supabase.from('devices').select('device_id');
          console.log('[AUTH] All devices in database:', listResult?.data);
          fs.appendFileSync(
            '/tmp/test-diag.log',
            `[AUTH] Device not found. All devices: ${JSON.stringify(listResult?.data)}\n`
          );
        }
        return { valid: false };
      }

      console.log('[AUTH] Device found:', device);
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Device found: ${JSON.stringify(device)}\n`
      );

      // Verify the device secret using Redis-backed hash for local/dev bootstrap
      // Key pattern: device:secret:sha256:{deviceId}
      const redis = getRedisClient();
      const providedSecretHash = hashSecret(deviceSecret);
      const redisKey = `device:secret:sha256:${deviceId}`;

      console.log('[AUTH] Checking Redis for secret with key:', redisKey);
      const storedHash = await redis.getClient().get(redisKey);
      console.log('[AUTH] Redis has secret:', !!storedHash);
      console.log('[AUTH] Hashes match:', storedHash === providedSecretHash);

      if (!storedHash || storedHash !== providedSecretHash) {
        console.error('[AUTH] Secret validation failed');
        return { valid: false };
      }

      console.log('[AUTH] Secret validated successfully');

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
      fs.appendFileSync(
        '/tmp/test-diag.log',
        `[AUTH] Error in validateCredentials: ${String(error)}\n`
      );
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
        last_seen: new Date().toISOString(),
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
      const newStatus =
        data.status === 'healthy' || data.status === 'online'
          ? 'online'
          : 'offline';

      // Get device's customer ID for broadcasting
      const { data: device } = await supabase
        .from('devices')
        .select('customer_id')
        .eq('device_id', deviceId)
        .single();

      // Update device last_seen timestamp, status, and metrics in DB
      const { error } = await supabase
        .from('devices')
        .update({
          last_seen: new Date().toISOString(),
          status: newStatus,
          metrics: data.metrics ?? null,
        })
        .eq('device_id', deviceId);

      if (error) {
        console.error('Error updating heartbeat:', error);
        return false;
      }

      // Broadcast device status update to web portal connections
      if (connectionManager && device?.customer_id) {
        await connectionManager.broadcastToCustomer(
          device.customer_id as string,
          {
            type: 'device_status',
            deviceId,
            status: newStatus,
            lastSeen: new Date().toISOString(),
            metrics: data.metrics,
          }
        );
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
