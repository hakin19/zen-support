/**
 * User Test Fixtures
 *
 * Provides type-safe user fixtures for testing with sensible defaults
 */

import { faker } from '@faker-js/faker';

import type { Database } from '../../types/supabase.types';

type UserInsert = Database['public']['Tables']['users']['Insert'];

/**
 * Creates a default user fixture
 */
export function createUserFixture(
  overrides: Partial<UserInsert> = {}
): UserInsert {
  const now = new Date().toISOString();

  return {
    id: faker.string.uuid(),
    customer_id: faker.string.uuid(), // Should be overridden with valid customer ID
    email: faker.internet.email(),
    role: 'user',
    name: faker.person.fullName(),
    phone: faker.phone.number(),
    is_active: true,
    last_login: faker.date.recent().toISOString(),
    preferences: {
      theme: 'light',
      language: 'en',
      notifications: {
        email: true,
        sms: false,
        push: true,
      },
    },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * User fixture presets for common test scenarios
 */
export const userFixtures = {
  /**
   * Admin user with full permissions
   */
  admin: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'admin@test.example.com',
      role: 'admin',
      name: 'Test Admin',
      is_active: true,
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: {
          email: true,
          sms: true,
          push: true,
        },
        admin_settings: {
          can_manage_users: true,
          can_manage_devices: true,
          can_view_audit_logs: true,
        },
      },
    }),

  /**
   * Regular user with standard permissions
   */
  regularUser: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'user@test.example.com',
      role: 'user',
      name: 'Test User',
      is_active: true,
    }),

  /**
   * Read-only user for viewing data only
   */
  readOnlyUser: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'readonly@test.example.com',
      role: 'readonly',
      name: 'Read Only User',
      is_active: true,
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: {
          email: false,
          sms: false,
          push: false,
        },
      },
    }),

  /**
   * Inactive user for testing access denial
   */
  inactiveUser: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'inactive@test.example.com',
      role: 'user',
      name: 'Inactive User',
      is_active: false,
      last_login: null,
    }),

  /**
   * User who has never logged in
   */
  pendingUser: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'pending@test.example.com',
      role: 'user',
      name: 'Pending User',
      is_active: true,
      last_login: null,
      preferences: {
        theme: 'light',
        language: 'en',
        onboarding_completed: false,
      },
    }),

  /**
   * User with MFA enabled
   */
  mfaUser: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'mfa@test.example.com',
      role: 'user',
      name: 'MFA User',
      is_active: true,
      preferences: {
        theme: 'light',
        language: 'en',
        mfa_enabled: true,
        mfa_method: 'totp',
      },
    }),

  /**
   * User with special characters in fields
   */
  withSpecialChars: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: 'special+test@example-test.com',
      name: "O'Connor-Smith, Jr. & Associates",
      phone: '+1 (555) 123-4567 ext. 890',
      preferences: {
        theme: 'dark',
        language: 'en',
        custom_field: '!@#$%^&*(){}[]|\\:";\'<>?,./`~',
        unicode_test: '🚀 🎯 📊 ✅ ❌',
      },
    }),

  /**
   * User with maximum field lengths
   */
  withMaxLengths: (customerId: string): UserInsert =>
    createUserFixture({
      customer_id: customerId,
      email: `${'a'.repeat(50)}@${'b'.repeat(50)}.com`,
      name: 'A'.repeat(255),
      phone: '9'.repeat(20),
      preferences: {
        theme: 'light',
        language: 'en',
        very_long_preference: 'x'.repeat(1000),
      },
    }),
};

/**
 * Creates multiple user fixtures for a customer
 */
export function createUserFixtures(
  customerId: string,
  count: number,
  overrides: Partial<UserInsert> = {}
): UserInsert[] {
  return Array.from({ length: count }, (_, index) =>
    createUserFixture({
      customer_id: customerId,
      email: `user${index + 1}@test.example.com`,
      name: `Test User ${index + 1}`,
      ...overrides,
    })
  );
}

/**
 * Creates a standard team of users for a customer
 */
export function createTeamFixtures(customerId: string): UserInsert[] {
  return [
    userFixtures.admin(customerId),
    userFixtures.regularUser(customerId),
    userFixtures.readOnlyUser(customerId),
  ].map((user, index) => ({
    ...user,
    email: user.email.replace('@', `${index}@`), // Ensure unique emails
  }));
}

/**
 * Creates users for testing role-based access control
 */
export function createRBACTestUsers(
  customerId: string
): Record<string, UserInsert> {
  return {
    admin: userFixtures.admin(customerId),
    user: userFixtures.regularUser(customerId),
    readonly: userFixtures.readOnlyUser(customerId),
    inactive: userFixtures.inactiveUser(customerId),
  };
}
