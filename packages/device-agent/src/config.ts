import type { DeviceConfig } from './types.js';

/**
 * Configuration loader for device agent
 * Loads and validates environment variables
 */
export class ConfigLoader {
  static load(): DeviceConfig {
    const config: DeviceConfig = {
      deviceId: this.getRequiredEnv('DEVICE_ID'),
      deviceSecret: this.getRequiredEnv('DEVICE_SECRET'),
      apiUrl: this.getRequiredEnv('API_URL'),
      customerId: this.getRequiredEnv('CUSTOMER_ID'),
      heartbeatInterval: this.getOptionalNumber('HEARTBEAT_INTERVAL', 30000),
      logLevel: this.getLogLevel(),
      mockMode: process.env.MOCK_MODE === 'true',
      // Additional retry and backoff configurations
      maxRetries: this.getOptionalNumber('MAX_RETRIES', 3),
      retryDelay: this.getOptionalNumber('RETRY_DELAY', 1000),
      maxReconnectAttempts: this.getOptionalNumber(
        'MAX_RECONNECT_ATTEMPTS',
        10
      ),
      maxReconnectInterval: this.getOptionalNumber(
        'MAX_RECONNECT_INTERVAL',
        30000
      ),
      // WebSocket configurations
      websocketReconnectInterval: this.getOptionalNumber(
        'WEBSOCKET_RECONNECT_INTERVAL',
        5000
      ),
      websocketMaxRetries: this.getOptionalNumber('WEBSOCKET_MAX_RETRIES', 10),
    };

    this.validateConfig(config);
    return config;
  }

  private static getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      throw new Error(`Environment variable ${key} is required`);
    }
    return value.trim();
  }

  private static getOptionalNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a number`);
    }
    return parsed;
  }

  private static getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
    const level = process.env.LOG_LEVEL?.toLowerCase() ?? 'info';
    const validLevels = ['debug', 'info', 'warn', 'error'];

    if (!validLevels.includes(level)) {
      console.warn(`Invalid LOG_LEVEL "${level}", defaulting to "info"`);
      return 'info';
    }

    return level as 'debug' | 'info' | 'warn' | 'error';
  }

  private static validateConfig(config: DeviceConfig): void {
    // Validate API URL format
    try {
      new globalThis.URL(config.apiUrl);
    } catch {
      throw new Error(`Invalid API_URL: ${config.apiUrl}`);
    }

    // Validate heartbeat interval
    if (config.heartbeatInterval && config.heartbeatInterval < 1000) {
      throw new Error('HEARTBEAT_INTERVAL must be at least 1000ms');
    }

    // Validate device ID format (alphanumeric with hyphens/underscores)
    const deviceIdRegex = /^[a-zA-Z0-9_-]+$/;
    if (!deviceIdRegex.test(config.deviceId)) {
      throw new Error(
        'DEVICE_ID must be alphanumeric with hyphens/underscores only'
      );
    }

    // Validate customer ID format
    const customerIdRegex = /^[a-zA-Z0-9_-]+$/;
    if (!customerIdRegex.test(config.customerId)) {
      throw new Error(
        'CUSTOMER_ID must be alphanumeric with hyphens/underscores only'
      );
    }
  }

  static printConfig(config: DeviceConfig): void {
    console.log('='.repeat(50));
    console.log('Device Agent Configuration');
    console.log('='.repeat(50));
    console.log(`Device ID:        ${config.deviceId}`);
    console.log(`Customer ID:      ${config.customerId}`);
    console.log(`API URL:          ${config.apiUrl}`);
    console.log(`Heartbeat:        ${config.heartbeatInterval}ms`);
    console.log(`Log Level:        ${config.logLevel}`);
    console.log(
      `Mock Mode:        ${config.mockMode ? 'ENABLED' : 'Disabled'}`
    );
    console.log(`Node Version:     ${process.version}`);
    console.log(`Platform:         ${process.platform}`);
    console.log('='.repeat(50));
  }
}
