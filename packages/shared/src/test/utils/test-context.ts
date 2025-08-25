/**
 * Test Context Utility
 *
 * Simple test isolation and cleanup utilities for consistent test execution
 */

import { createMinimalTestScenario } from '../fixtures';

import type { Database } from '../../types/supabase.types';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type DiagnosticSessionInsert =
  Database['public']['Tables']['diagnostic_sessions']['Insert'];

/**
 * Test context for managing test data lifecycle
 */
export class TestContext {
  private testDataIds: {
    customerIds: string[];
    userIds: string[];
    deviceIds: string[];
    sessionIds: string[];
  } = {
    customerIds: [],
    userIds: [],
    deviceIds: [],
    sessionIds: [],
  };

  constructor() {
    // Test context initialized
  }

  /**
   * Gets minimal test data for testing
   */
  getMinimalTestData() {
    const scenario = createMinimalTestScenario();

    // Track IDs for cleanup reference
    this.testDataIds.customerIds.push(scenario.customer.id!);
    scenario.users.forEach(u => this.testDataIds.userIds.push(u.id!));
    scenario.devices.forEach(d => this.testDataIds.deviceIds.push(d.id!));

    return scenario;
  }

  /**
   * Prepares custom test data for testing
   */
  prepareCustomTestData(data: {
    customers?: CustomerInsert[];
    users?: UserInsert[];
    devices?: DeviceInsert[];
    sessions?: DiagnosticSessionInsert[];
  }) {
    // Track IDs for potential cleanup
    if (data.customers?.length) {
      this.testDataIds.customerIds.push(...data.customers.map(c => c.id!));
    }
    if (data.users?.length) {
      this.testDataIds.userIds.push(...data.users.map(u => u.id!));
    }
    if (data.devices?.length) {
      this.testDataIds.deviceIds.push(...data.devices.map(d => d.id!));
    }
    if (data.sessions?.length) {
      this.testDataIds.sessionIds.push(...data.sessions.map(s => s.id!));
    }

    return data;
  }

  /**
   * Cleans up test data references
   */
  cleanup() {
    // Reset tracking arrays
    this.testDataIds = {
      customerIds: [],
      userIds: [],
      deviceIds: [],
      sessionIds: [],
    };
  }

  /**
   * Gets tracked test data IDs
   */
  getTrackedIds() {
    return { ...this.testDataIds };
  }
}

/**
 * Helper function to create and manage test context
 */
export function withTestContext<T>(
  testFn: (context: TestContext) => T | Promise<T>
): () => Promise<T> {
  return async () => {
    const context = new TestContext();
    try {
      return await testFn(context);
    } finally {
      context.cleanup();
    }
  };
}

/**
 * Creates a new test context instance
 */
export function createTestContext(): TestContext {
  return new TestContext();
}
