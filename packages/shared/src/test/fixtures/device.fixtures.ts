/**
 * Device Test Fixtures
 *
 * Provides type-safe device fixtures for testing with sensible defaults
 */

import { faker } from '@faker-js/faker';

import type { Database } from '../../types/supabase.types';

type DeviceInsert = Database['public']['Tables']['devices']['Insert'];

/**
 * Creates a default device fixture
 */
export function createDeviceFixture(
  overrides: Partial<DeviceInsert> = {}
): DeviceInsert {
  const now = new Date().toISOString();

  return {
    id: faker.string.uuid(),
    customer_id: faker.string.uuid(), // Should be overridden with valid customer ID
    name: `${faker.word.adjective()} ${faker.word.noun()}`,
    device_type: 'raspberry_pi',
    mac_address: faker.internet.mac(),
    ip_address: faker.internet.ip(),
    location: faker.location.city(),
    status: 'online',
    last_seen: now,
    config: {
      firmware_version: '1.0.0',
      auto_update: true,
      monitoring_interval: 60,
      diagnostic_level: 'standard',
    },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Device fixture presets for common test scenarios
 */
export const deviceFixtures = {
  /**
   * Raspberry Pi device (default agent)
   */
  raspberryPi: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Test Raspberry Pi',
      device_type: 'raspberry_pi',
      status: 'online',
      config: {
        firmware_version: '2.0.0',
        auto_update: true,
        monitoring_interval: 60,
        diagnostic_level: 'verbose',
        agent_version: '1.0.0',
        cellular_enabled: true,
      },
    }),

  /**
   * Router device for network monitoring
   */
  router: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Main Router',
      device_type: 'router',
      status: 'online',
      ip_address: '192.168.1.1',
      config: {
        firmware_version: '3.1.0',
        auto_update: false,
        monitoring_interval: 30,
        diagnostic_level: 'standard',
        management_interface: 'ssh',
      },
    }),

  /**
   * Switch device for network infrastructure
   */
  switch: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Core Switch',
      device_type: 'switch',
      status: 'online',
      ip_address: '192.168.1.2',
      config: {
        firmware_version: '2.5.0',
        auto_update: false,
        monitoring_interval: 120,
        diagnostic_level: 'minimal',
        port_count: 48,
        vlan_enabled: true,
      },
    }),

  /**
   * Offline device for testing connectivity issues
   */
  offline: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Offline Device',
      device_type: 'raspberry_pi',
      status: 'offline',
      last_seen: faker.date.past().toISOString(),
      config: {
        firmware_version: '1.0.0',
        auto_update: true,
        last_error: 'Connection timeout',
      },
    }),

  /**
   * Device with error status
   */
  error: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Error Device',
      device_type: 'raspberry_pi',
      status: 'error',
      config: {
        firmware_version: '1.0.0',
        auto_update: true,
        error_code: 'CRITICAL_FAILURE',
        error_message: 'Hardware malfunction detected',
        error_timestamp: new Date().toISOString(),
      },
    }),

  /**
   * Device with performance issues
   */
  performanceIssue: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'High CPU Device',
      device_type: 'raspberry_pi',
      status: 'online',
      config: {
        firmware_version: '1.0.0',
        auto_update: true,
        cpu_usage: 95,
        memory_usage: 87,
        disk_usage: 92,
        temperature: 85,
        alert_state: 'warning',
      },
    }),

  /**
   * Device pending configuration
   */
  pending: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Pending Device',
      device_type: 'raspberry_pi',
      status: 'offline',
      last_seen: null,
      config: {
        firmware_version: '1.0.0',
        auto_update: true,
        setup_completed: false,
        activation_pending: true,
      },
    }),

  /**
   * Device with special characters in fields
   */
  withSpecialChars: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'Device & "Special" <Characters>',
      location: "O'Connor's Office, 3rd Floor & Basement",
      config: {
        firmware_version: '1.0.0',
        custom_field: '!@#$%^&*(){}[]|\\:";\'<>?,./`~',
        unicode_test: '🚀 🎯 📊 ✅ ❌',
      },
    }),

  /**
   * Device with maximum field lengths
   */
  withMaxLengths: (customerId: string): DeviceInsert =>
    createDeviceFixture({
      customer_id: customerId,
      name: 'D'.repeat(255),
      location: 'L'.repeat(255),
      mac_address: 'FF:FF:FF:FF:FF:FF',
      ip_address: '255.255.255.255',
      config: {
        firmware_version: '999.999.999',
        very_long_config: 'x'.repeat(1000),
      },
    }),
};

/**
 * Creates multiple device fixtures for a customer
 */
export function createDeviceFixtures(
  customerId: string,
  count: number,
  overrides: Partial<DeviceInsert> = {}
): DeviceInsert[] {
  return Array.from({ length: count }, (_, index) =>
    createDeviceFixture({
      customer_id: customerId,
      name: `Device ${index + 1}`,
      ip_address: `192.168.1.${10 + index}`,
      ...overrides,
    })
  );
}

/**
 * Creates a network infrastructure set of devices
 */
export function createNetworkInfrastructure(
  customerId: string
): DeviceInsert[] {
  return [
    deviceFixtures.router(customerId),
    deviceFixtures.switch(customerId),
    ...createDeviceFixtures(customerId, 3, { device_type: 'raspberry_pi' }),
  ];
}

/**
 * Creates devices in various states for testing
 */
export function createDeviceStatusScenarios(
  customerId: string
): Record<string, DeviceInsert> {
  return {
    online: deviceFixtures.raspberryPi(customerId),
    offline: deviceFixtures.offline(customerId),
    error: deviceFixtures.error(customerId),
    performance: deviceFixtures.performanceIssue(customerId),
    pending: deviceFixtures.pending(customerId),
  };
}

/**
 * Creates devices for testing diagnostics
 */
export function createDiagnosticTestDevices(
  customerId: string
): DeviceInsert[] {
  return [
    createDeviceFixture({
      customer_id: customerId,
      name: 'Healthy Device',
      status: 'online',
      config: {
        firmware_version: '2.0.0',
        cpu_usage: 25,
        memory_usage: 40,
        disk_usage: 35,
        temperature: 45,
      },
    }),
    createDeviceFixture({
      customer_id: customerId,
      name: 'Warning Device',
      status: 'online',
      config: {
        firmware_version: '1.5.0',
        cpu_usage: 75,
        memory_usage: 80,
        disk_usage: 85,
        temperature: 70,
        alert_state: 'warning',
      },
    }),
    createDeviceFixture({
      customer_id: customerId,
      name: 'Critical Device',
      status: 'error',
      config: {
        firmware_version: '1.0.0',
        cpu_usage: 95,
        memory_usage: 98,
        disk_usage: 99,
        temperature: 90,
        alert_state: 'critical',
      },
    }),
  ];
}
