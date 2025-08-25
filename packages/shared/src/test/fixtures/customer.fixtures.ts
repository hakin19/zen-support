/**
 * Customer Test Fixtures
 *
 * Provides type-safe customer fixtures for testing with sensible defaults
 */

import { faker } from '@faker-js/faker';

import type { Database } from '../../types/supabase.types';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];

/**
 * Creates a default customer fixture
 */
export function createCustomerFixture(
  overrides: Partial<CustomerInsert> = {}
): CustomerInsert {
  const now = new Date().toISOString();

  return {
    id: faker.string.uuid(),
    name: faker.company.name(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    plan_type: 'basic',
    status: 'active',
    settings: {
      notifications_enabled: true,
      timezone: faker.location.timeZone(),
      max_devices: 10,
      max_users: 5,
    },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Customer fixture presets for common test scenarios
 */
export const customerFixtures = {
  /**
   * Basic plan customer with minimal features
   */
  basic: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Basic Test Company',
      email: 'basic@test.example.com',
      plan_type: 'basic',
      settings: {
        notifications_enabled: true,
        timezone: 'America/New_York',
        max_devices: 5,
        max_users: 2,
      },
    }),

  /**
   * Pro plan customer with enhanced features
   */
  pro: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Pro Test Company',
      email: 'pro@test.example.com',
      plan_type: 'pro',
      settings: {
        notifications_enabled: true,
        timezone: 'America/New_York',
        max_devices: 20,
        max_users: 10,
        priority_support: true,
      },
    }),

  /**
   * Enterprise customer with all features
   */
  enterprise: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Enterprise Test Corp',
      email: 'enterprise@test.example.com',
      plan_type: 'enterprise',
      settings: {
        notifications_enabled: true,
        timezone: 'America/New_York',
        max_devices: 100,
        max_users: 50,
        priority_support: true,
        custom_branding: true,
        sla_guarantee: true,
      },
    }),

  /**
   * Suspended customer for testing access restrictions
   */
  suspended: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Suspended Test Company',
      email: 'suspended@test.example.com',
      status: 'suspended',
      plan_type: 'basic',
    }),

  /**
   * Inactive customer for testing cleanup scenarios
   */
  inactive: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Inactive Test Company',
      email: 'inactive@test.example.com',
      status: 'inactive',
      plan_type: 'basic',
    }),

  /**
   * Customer with special characters for edge case testing
   */
  withSpecialChars: (): CustomerInsert =>
    createCustomerFixture({
      name: 'Test & Co. "Special" <Characters>',
      email: 'special+chars@test-example.com',
      phone: '+1 (555) 123-4567 ext. 890',
      settings: {
        notifications_enabled: true,
        timezone: 'America/New_York',
        custom_field: '!@#$%^&*(){}[]|\\:";\'<>?,./`~',
        unicode_test: '🚀 🎯 📊 ✅ ❌',
      },
    }),

  /**
   * Customer with maximum field lengths for boundary testing
   */
  withMaxLengths: (): CustomerInsert =>
    createCustomerFixture({
      name: 'A'.repeat(255), // Assuming 255 char limit
      email: `${'a'.repeat(50)}@${'b'.repeat(50)}.com`,
      phone: '9'.repeat(20),
      settings: {
        notifications_enabled: true,
        timezone: 'America/New_York',
        very_long_key: 'x'.repeat(1000),
      },
    }),
};

/**
 * Creates multiple customer fixtures
 */
export function createCustomerFixtures(
  count: number,
  overrides: Partial<CustomerInsert> = {}
): CustomerInsert[] {
  return Array.from({ length: count }, () => createCustomerFixture(overrides));
}

/**
 * Creates a customer with related data structure
 */
export function createCustomerWithRelations() {
  const customer = createCustomerFixture();

  return {
    customer,
    // Relations will be added by other fixtures
    users: [],
    devices: [],
  };
}
