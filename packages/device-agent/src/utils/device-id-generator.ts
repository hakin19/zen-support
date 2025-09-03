/**
 * Device ID Generator Utility
 * Generates unique device IDs for multi-agent orchestration
 */

import { randomBytes } from 'crypto';
import * as os from 'os';

export interface DeviceIdOptions {
  location?: string;
  index?: number;
  prefix?: string;
  includeHost?: boolean;
}

/**
 * Generate a unique device ID based on environment and configuration
 */
export function generateDeviceId(options: DeviceIdOptions = {}): string {
  const {
    location = process.env.LOCATION ?? 'UNKNOWN',
    index = process.env.DEVICE_INDEX ? parseInt(process.env.DEVICE_INDEX) : 1,
    prefix = 'DEV',
    includeHost = false,
  } = options;

  // Format index with leading zeros
  const formattedIndex = String(index).padStart(3, '0');

  // Base ID format: DEV-LOCATION-INDEX
  let deviceId = `${prefix}-${location}-${formattedIndex}`;

  // Optionally include hostname for better identification
  if (includeHost) {
    const hostname = os
      .hostname()
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8);
    deviceId = `${deviceId}-${hostname}`;
  }

  return deviceId.toUpperCase();
}

/**
 * Generate a random suffix for device ID uniqueness
 */
export function generateRandomSuffix(length: number = 4): string {
  return randomBytes(length).toString('hex').substring(0, length).toUpperCase();
}

/**
 * Parse device ID to extract components
 */
export function parseDeviceId(deviceId: string): {
  prefix: string;
  location: string;
  index: number;
  hostname?: string;
} | null {
  const pattern = /^([A-Z]+)-([A-Z-]+)-(\d{3})(?:-([A-Z0-9]+))?$/;
  const match = deviceId.match(pattern);

  if (!match) {
    return null;
  }

  return {
    prefix: match[1]!,
    location: match[2]!,
    index: parseInt(match[3]!),
    hostname: match[4],
  };
}

/**
 * Validate device ID format
 */
export function isValidDeviceId(deviceId: string): boolean {
  const pattern = /^[A-Z]+-[A-Z-]+-\d{3}(?:-[A-Z0-9]+)?$/;
  return pattern.test(deviceId);
}

/**
 * Generate device ID from Docker container environment
 */
export function generateFromDockerEnv(): string {
  // Check if running in Docker
  const isDocker =
    process.env.DOCKER_CONTAINER === 'true' ||
    process.env.HOSTNAME?.startsWith('device-agent-');

  if (!isDocker) {
    // Fallback for non-Docker environments
    return generateDeviceId({
      location: 'LOCAL',
      index: Math.floor(Math.random() * 999) + 1,
    });
  }

  // Extract info from container hostname if available
  const hostname = process.env.HOSTNAME ?? '';
  const containerMatch = hostname.match(/device-agent-([a-z-]+)-(\d+)/);

  if (containerMatch?.[1] && containerMatch[2]) {
    return generateDeviceId({
      location: containerMatch[1].toUpperCase(),
      index: parseInt(containerMatch[2]),
    });
  }

  // Use environment variables as fallback
  return process.env.DEVICE_ID ?? generateDeviceId();
}

/**
 * Get or generate device ID (singleton pattern)
 */
let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  cachedDeviceId ??= process.env.DEVICE_ID ?? generateFromDockerEnv();
  return cachedDeviceId;
}

/**
 * Reset cached device ID (mainly for testing)
 */
export function resetDeviceId(): void {
  cachedDeviceId = null;
}
