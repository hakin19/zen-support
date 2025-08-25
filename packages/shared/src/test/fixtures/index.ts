/**
 * Test Fixtures Index
 *
 * Central export for all test fixtures
 */

// Core entity fixtures
export * from './customer.fixtures';
export * from './user.fixtures';
export * from './device.fixtures';
export * from './diagnostic-session.fixtures';

// Re-export commonly used fixture combinations
import { createCustomerFixture, customerFixtures } from './customer.fixtures';
import { deviceFixtures, createNetworkInfrastructure } from './device.fixtures';
import {
  createDiagnosticSessionFixture,
  diagnosticSessionFixtures,
} from './diagnostic-session.fixtures';
import {
  createUserFixture,
  userFixtures,
  createTeamFixtures,
} from './user.fixtures';

import type { Database } from '../../types/supabase.types';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type DiagnosticSessionInsert =
  Database['public']['Tables']['diagnostic_sessions']['Insert'];

/**
 * Complete test scenario with all related entities
 */
export interface CompleteTestScenario {
  customer: CustomerInsert;
  users: UserInsert[];
  devices: DeviceInsert[];
  sessions: DiagnosticSessionInsert[];
}

/**
 * Creates a complete test scenario with customer, users, devices, and sessions
 */
export function createCompleteTestScenario(
  options: {
    userCount?: number;
    deviceCount?: number;
    sessionCount?: number;
    planType?: 'basic' | 'pro' | 'enterprise';
  } = {}
): CompleteTestScenario {
  const {
    userCount = 3,
    deviceCount = 2,
    sessionCount = 1,
    planType = 'basic',
  } = options;

  // Create customer
  const customer = createCustomerFixture({
    plan_type: planType,
    name: `Test ${planType} Company`,
  });

  // Create users
  const customerId = customer.id!;
  const users = createTeamFixtures(customerId);
  if (userCount > 3) {
    users.push(
      ...Array.from({ length: userCount - 3 }, (_, i) =>
        createUserFixture({
          customer_id: customerId,
          email: `user${i + 4}@test.example.com`,
          name: `Additional User ${i + 1}`,
        })
      )
    );
  }

  // Create devices
  const devices =
    deviceCount > 0
      ? createNetworkInfrastructure(customerId).slice(0, deviceCount)
      : [];

  // Create diagnostic sessions
  const sessions =
    sessionCount > 0 && devices.length > 0 && users.length > 0
      ? Array.from({ length: sessionCount }, (_, i) => {
          const device = devices[i % devices.length];
          const user = users[i % users.length];
          return device && user
            ? createDiagnosticSessionFixture({
                customer_id: customerId,
                device_id: device.id!,
                user_id: user.id!,
                status: i === 0 ? 'in_progress' : 'completed',
              })
            : null;
        }).filter((s): s is DiagnosticSessionInsert => s !== null)
      : [];

  return {
    customer,
    users: users.slice(0, userCount),
    devices,
    sessions,
  };
}

/**
 * Creates test data for authentication testing
 */
export function createAuthTestScenario() {
  const customer = customerFixtures.enterprise();
  const customerId = customer.id!;
  const users = [
    userFixtures.admin(customerId),
    userFixtures.regularUser(customerId),
    userFixtures.readOnlyUser(customerId),
    userFixtures.inactiveUser(customerId),
    userFixtures.mfaUser(customerId),
  ];

  return { customer, users };
}

/**
 * Creates test data for diagnostics testing
 */
export function createDiagnosticsTestScenario() {
  const customer = customerFixtures.pro();
  const customerId = customer.id!;
  const admin = userFixtures.admin(customerId);
  const devices = [
    deviceFixtures.raspberryPi(customerId),
    deviceFixtures.offline(customerId),
    deviceFixtures.error(customerId),
    deviceFixtures.performanceIssue(customerId),
  ];

  const sessions = [
    diagnosticSessionFixtures.active(customerId, devices[0]!.id!, admin.id!),
    diagnosticSessionFixtures.withIssues(
      customerId,
      devices[2]!.id!,
      admin.id!
    ),
    diagnosticSessionFixtures.pendingRemediation(
      customerId,
      devices[3]!.id!,
      admin.id!
    ),
  ];

  return { customer, users: [admin], devices, sessions };
}

/**
 * Creates test data for multi-tenant testing
 */
export function createMultiTenantTestScenario() {
  const scenarios: CompleteTestScenario[] = [
    createCompleteTestScenario({
      planType: 'basic',
      userCount: 2,
      deviceCount: 1,
    }),
    createCompleteTestScenario({
      planType: 'pro',
      userCount: 5,
      deviceCount: 3,
    }),
    createCompleteTestScenario({
      planType: 'enterprise',
      userCount: 10,
      deviceCount: 5,
    }),
  ];

  return scenarios;
}

/**
 * Creates minimal test data for quick tests
 */
export function createMinimalTestScenario(): CompleteTestScenario {
  const customer = customerFixtures.basic();
  const customerId = customer.id!;
  const user = userFixtures.admin(customerId);
  const device = deviceFixtures.raspberryPi(customerId);

  return {
    customer,
    users: [user],
    devices: [device],
    sessions: [],
  };
}

/**
 * Creates edge case test data
 */
export function createEdgeCaseTestScenario() {
  const customer = customerFixtures.withSpecialChars();
  const customerId = customer.id!;
  const user = userFixtures.withSpecialChars(customerId);
  const device = deviceFixtures.withSpecialChars(customerId);

  return {
    customer,
    users: [user],
    devices: [device],
    sessions: [],
  };
}

/**
 * Helper to generate unique IDs for fixtures
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
