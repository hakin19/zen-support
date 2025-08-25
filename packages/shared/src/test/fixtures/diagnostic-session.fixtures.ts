/**
 * Diagnostic Session Test Fixtures
 *
 * Provides type-safe diagnostic session fixtures for testing
 */

import { faker } from '@faker-js/faker';

import type { Database } from '../../types/supabase.types';

type DiagnosticSessionInsert =
  Database['public']['Tables']['diagnostic_sessions']['Insert'];

/**
 * Creates a default diagnostic session fixture
 */
export function createDiagnosticSessionFixture(
  overrides: Partial<DiagnosticSessionInsert> = {}
): DiagnosticSessionInsert {
  const now = new Date().toISOString();
  const startTime = faker.date.recent();

  return {
    id: faker.string.uuid(),
    customer_id: faker.string.uuid(),
    device_id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    session_type: 'diagnostic',
    status: 'in_progress',
    started_at: startTime.toISOString(),
    ended_at: null,
    diagnostic_data: {
      network_status: 'connected',
      latency_ms: faker.number.int({ min: 10, max: 200 }),
      packet_loss: faker.number.float({ min: 0, max: 5, multipleOf: 0.1 }),
      bandwidth_mbps: faker.number.int({ min: 10, max: 1000 }),
      tests_run: ['ping', 'traceroute', 'bandwidth'],
    },
    remediation_actions: [],
    notes: faker.lorem.sentence(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Diagnostic session fixture presets
 */
export const diagnosticSessionFixtures = {
  /**
   * Active diagnostic session
   */
  active: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert =>
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'in_progress',
      ended_at: null,
      diagnostic_data: {
        network_status: 'testing',
        tests_run: ['ping'],
        tests_pending: ['traceroute', 'bandwidth'],
      },
    }),

  /**
   * Completed successful session
   */
  completedSuccess: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert => {
    const startTime = faker.date.recent();
    const endTime = new Date(startTime.getTime() + 600000); // 10 mins

    return createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'completed',
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      diagnostic_data: {
        network_status: 'healthy',
        latency_ms: 25,
        packet_loss: 0,
        bandwidth_mbps: 500,
        tests_run: ['ping', 'traceroute', 'bandwidth', 'dns'],
        issues_found: [],
        recommendations: ['No issues detected'],
      },
      notes: 'All diagnostics passed successfully',
    });
  },

  /**
   * Session with issues found
   */
  withIssues: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert => {
    const startTime = faker.date.recent();
    const endTime = new Date(startTime.getTime() + 900000); // 15 mins

    return createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'completed',
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      diagnostic_data: {
        network_status: 'degraded',
        latency_ms: 250,
        packet_loss: 15,
        bandwidth_mbps: 50,
        tests_run: ['ping', 'traceroute', 'bandwidth', 'dns'],
        issues_found: [
          'High packet loss detected',
          'Latency exceeds threshold',
          'Bandwidth below expected',
        ],
        recommendations: [
          'Check physical connections',
          'Restart router',
          'Contact ISP',
        ],
      },
      remediation_actions: [
        {
          action: 'restart_router',
          status: 'pending',
          approved_by: null,
        },
      ],
      notes: 'Multiple network issues detected',
    });
  },

  /**
   * Failed diagnostic session
   */
  failed: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert =>
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'failed',
      diagnostic_data: {
        network_status: 'error',
        error_message: 'Device unreachable',
        tests_run: [],
        tests_failed: ['ping', 'connectivity'],
      },
      notes: 'Could not establish connection to device',
    }),

  /**
   * Session requiring remediation approval
   */
  pendingRemediation: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert =>
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'remediation_pending',
      diagnostic_data: {
        network_status: 'degraded',
        issues_found: ['Configuration drift detected'],
        proposed_actions: [
          'Update device configuration',
          'Apply security patches',
        ],
      },
      remediation_actions: [
        {
          action: 'update_config',
          status: 'pending_approval',
          script: 'sudo update-config.sh',
          risk_level: 'low',
        },
        {
          action: 'apply_patches',
          status: 'pending_approval',
          script: 'sudo apt-get update && sudo apt-get upgrade',
          risk_level: 'medium',
        },
      ],
    }),

  /**
   * Long-running session for performance testing
   */
  longRunning: (
    customerId: string,
    deviceId: string,
    userId: string
  ): DiagnosticSessionInsert => {
    const startTime = new Date(Date.now() - 3600000); // Started 1 hour ago

    return createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'in_progress',
      started_at: startTime.toISOString(),
      ended_at: null,
      diagnostic_data: {
        network_status: 'testing',
        tests_run: ['continuous_monitoring'],
        duration_ms: 3600000,
        data_points_collected: 3600,
      },
    });
  },
};

/**
 * Creates multiple diagnostic sessions
 */
export function createDiagnosticSessionFixtures(
  customerId: string,
  deviceId: string,
  userId: string,
  count: number,
  overrides: Partial<DiagnosticSessionInsert> = {}
): DiagnosticSessionInsert[] {
  return Array.from({ length: count }, () =>
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      ...overrides,
    })
  );
}

/**
 * Creates a series of sessions showing progression
 */
export function createSessionProgression(
  customerId: string,
  deviceId: string,
  userId: string
): DiagnosticSessionInsert[] {
  const baseTime = new Date(Date.now() - 86400000); // 24 hours ago

  return [
    // Initial diagnostic
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'completed',
      started_at: new Date(baseTime.getTime()).toISOString(),
      ended_at: new Date(baseTime.getTime() + 600000).toISOString(),
      diagnostic_data: {
        network_status: 'degraded',
        issues_found: ['High latency'],
      },
    }),
    // Follow-up with remediation
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'completed',
      started_at: new Date(baseTime.getTime() + 3600000).toISOString(),
      ended_at: new Date(baseTime.getTime() + 4200000).toISOString(),
      diagnostic_data: {
        network_status: 'improved',
        issues_found: [],
        notes: 'Issue resolved after remediation',
      },
    }),
    // Verification session
    createDiagnosticSessionFixture({
      customer_id: customerId,
      device_id: deviceId,
      user_id: userId,
      status: 'completed',
      started_at: new Date(baseTime.getTime() + 7200000).toISOString(),
      ended_at: new Date(baseTime.getTime() + 7800000).toISOString(),
      diagnostic_data: {
        network_status: 'healthy',
        notes: 'Confirmed issue resolution',
      },
    }),
  ];
}
