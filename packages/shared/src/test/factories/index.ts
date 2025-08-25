/**
 * Test Data Factories
 *
 * Dynamic test data generation with builder pattern for flexible test scenarios
 */

import { faker } from '@faker-js/faker';

import {
  createCustomerFixture,
  createDeviceFixture,
  createDiagnosticSessionFixture,
  createUserFixture,
} from '../fixtures';

import type { Database } from '../../types/supabase.types';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type DiagnosticSessionInsert =
  Database['public']['Tables']['diagnostic_sessions']['Insert'];

/**
 * Builder pattern for creating customers with fluent API
 */
export class CustomerBuilder {
  private customer: Partial<CustomerInsert> = {};

  withName(name: string): this {
    this.customer.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.customer.email = email;
    return this;
  }

  withPlan(plan: 'basic' | 'pro' | 'enterprise'): this {
    this.customer.plan_type = plan;
    return this;
  }

  withStatus(status: 'active' | 'inactive' | 'suspended'): this {
    this.customer.status = status;
    return this;
  }

  withSettings(settings: Record<string, any>): this {
    this.customer.settings = { ...this.customer.settings, ...settings };
    return this;
  }

  withId(id?: string): this {
    this.customer.id = id || faker.string.uuid();
    return this;
  }

  build(): CustomerInsert {
    // Ensure ID is always set
    if (!this.customer.id) {
      this.customer.id = faker.string.uuid();
    }
    return createCustomerFixture(this.customer);
  }
}

/**
 * Builder pattern for creating users with fluent API
 */
export class UserBuilder {
  private user: Partial<UserInsert> = {};

  forCustomer(customerId: string): this {
    this.user.customer_id = customerId;
    return this;
  }

  withName(name: string): this {
    this.user.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  withRole(role: 'admin' | 'user' | 'readonly'): this {
    this.user.role = role;
    return this;
  }

  withActive(active: boolean): this {
    this.user.is_active = active;
    return this;
  }

  withPreferences(preferences: Record<string, any>): this {
    this.user.preferences = { ...this.user.preferences, ...preferences };
    return this;
  }

  withId(id?: string): this {
    this.user.id = id || faker.string.uuid();
    return this;
  }

  build(): UserInsert {
    if (!this.user.customer_id) {
      throw new Error('Customer ID is required for user');
    }
    return createUserFixture(this.user);
  }
}

/**
 * Builder pattern for creating devices with fluent API
 */
export class DeviceBuilder {
  private device: Partial<DeviceInsert> = {};

  forCustomer(customerId: string): this {
    this.device.customer_id = customerId;
    return this;
  }

  withName(name: string): this {
    this.device.name = name;
    return this;
  }

  withType(type: 'raspberry_pi' | 'router' | 'switch'): this {
    this.device.device_type = type;
    return this;
  }

  withStatus(status: 'online' | 'offline' | 'error'): this {
    this.device.status = status;
    return this;
  }

  withLocation(location: string): this {
    this.device.location = location;
    return this;
  }

  withIpAddress(ip: string): this {
    this.device.ip_address = ip;
    return this;
  }

  withConfig(config: Record<string, any>): this {
    this.device.config = { ...this.device.config, ...config };
    return this;
  }

  withId(id?: string): this {
    this.device.id = id || faker.string.uuid();
    return this;
  }

  build(): DeviceInsert {
    if (!this.device.customer_id) {
      throw new Error('Customer ID is required for device');
    }
    return createDeviceFixture(this.device);
  }
}

/**
 * Builder pattern for creating diagnostic sessions
 */
export class DiagnosticSessionBuilder {
  private session: Partial<DiagnosticSessionInsert> = {};

  forCustomer(customerId: string): this {
    this.session.customer_id = customerId;
    return this;
  }

  forDevice(deviceId: string): this {
    this.session.device_id = deviceId;
    return this;
  }

  byUser(userId: string): this {
    this.session.user_id = userId;
    return this;
  }

  withStatus(
    status: 'in_progress' | 'completed' | 'failed' | 'remediation_pending'
  ): this {
    this.session.status = status;
    return this;
  }

  withDiagnosticData(data: Record<string, any>): this {
    this.session.diagnostic_data = { ...this.session.diagnostic_data, ...data };
    return this;
  }

  withDuration(startTime: Date, endTime?: Date): this {
    this.session.started_at = startTime.toISOString();
    if (endTime) {
      this.session.ended_at = endTime.toISOString();
    }
    return this;
  }

  withId(id?: string): this {
    this.session.id = id || faker.string.uuid();
    return this;
  }

  build(): DiagnosticSessionInsert {
    if (
      !this.session.customer_id ||
      !this.session.device_id ||
      !this.session.user_id
    ) {
      throw new Error(
        'Customer ID, Device ID, and User ID are required for session'
      );
    }
    return createDiagnosticSessionFixture(this.session);
  }
}

/**
 * Factory for creating complete test scenarios
 */
export class TestScenarioFactory {
  private customerBuilder = new CustomerBuilder();
  private users: UserBuilder[] = [];
  private devices: DeviceBuilder[] = [];
  private sessions: DiagnosticSessionBuilder[] = [];

  withCustomer(builder: (customer: CustomerBuilder) => CustomerBuilder): this {
    this.customerBuilder = builder(new CustomerBuilder());
    return this;
  }

  withUser(builder: (user: UserBuilder) => UserBuilder): this {
    this.users.push(builder(new UserBuilder()));
    return this;
  }

  withDevice(builder: (device: DeviceBuilder) => DeviceBuilder): this {
    this.devices.push(builder(new DeviceBuilder()));
    return this;
  }

  withSession(
    builder: (session: DiagnosticSessionBuilder) => DiagnosticSessionBuilder
  ): this {
    this.sessions.push(builder(new DiagnosticSessionBuilder()));
    return this;
  }

  build() {
    const customer = this.customerBuilder.build();
    const customerId = customer.id!; // We ensure this is set in CustomerBuilder.build()

    const users = this.users.map(builder =>
      builder.forCustomer(customerId).build()
    );

    const devices = this.devices.map(builder =>
      builder.forCustomer(customerId).build()
    );

    const sessions = this.sessions.map(builder => {
      // Ensure session has valid references
      const userId = users[0]?.id || faker.string.uuid();
      const deviceId = devices[0]?.id || faker.string.uuid();
      return builder
        .forCustomer(customerId)
        .forDevice(deviceId)
        .byUser(userId)
        .build();
    });

    return {
      customer,
      users,
      devices,
      sessions,
    };
  }
}

/**
 * Factory for creating test data with relationships
 */
export class RelationalTestDataFactory {
  /**
   * Creates a customer with a full team and infrastructure
   */
  static createFullCustomerSetup(customerId?: string) {
    const customer = new CustomerBuilder()
      .withId(customerId)
      .withPlan('enterprise')
      .build();

    // Customer ID is guaranteed to be set by CustomerBuilder.build()
    const customerIdSafe = customer.id!;

    const admin = new UserBuilder()
      .forCustomer(customerIdSafe)
      .withRole('admin')
      .withEmail('admin@test.com')
      .build();

    const users = [
      admin,
      new UserBuilder()
        .forCustomer(customerIdSafe)
        .withRole('user')
        .withEmail('user1@test.com')
        .build(),
      new UserBuilder()
        .forCustomer(customerIdSafe)
        .withRole('readonly')
        .withEmail('readonly@test.com')
        .build(),
    ];

    const devices = [
      new DeviceBuilder()
        .forCustomer(customerIdSafe)
        .withType('raspberry_pi')
        .withStatus('online')
        .build(),
      new DeviceBuilder()
        .forCustomer(customerIdSafe)
        .withType('router')
        .withStatus('online')
        .build(),
    ];

    // Safe access to device and user IDs
    const firstDevice = devices[0];
    const sessions =
      firstDevice && admin.id
        ? [
            new DiagnosticSessionBuilder()
              .forCustomer(customerIdSafe)
              .forDevice(firstDevice.id!)
              .byUser(admin.id)
              .withStatus('completed')
              .build(),
          ]
        : [];

    return { customer, users, devices, sessions };
  }

  /**
   * Creates multiple related customers for multi-tenant testing
   */
  static createMultiTenantData(count: number = 3) {
    return Array.from({ length: count }, (_, i) => {
      const planTypes: Array<'basic' | 'pro' | 'enterprise'> = [
        'basic',
        'pro',
        'enterprise',
      ];
      const plan = planTypes[i % 3]!; // We know this is always defined

      return new TestScenarioFactory()
        .withCustomer(c => c.withPlan(plan).withName(`Company ${i + 1}`))
        .withUser(u => u.withRole('admin').withEmail(`admin${i}@test.com`))
        .withDevice(d => d.withType('raspberry_pi').withStatus('online'))
        .build();
    });
  }

  /**
   * Creates test data for specific scenarios
   */
  static createScenario(
    scenario: 'auth' | 'diagnostics' | 'performance' | 'edge-cases'
  ) {
    switch (scenario) {
      case 'auth':
        return this.createAuthScenario();
      case 'diagnostics':
        return this.createDiagnosticsScenario();
      case 'performance':
        return this.createPerformanceScenario();
      case 'edge-cases':
        return this.createEdgeCaseScenario();
      default:
        throw new Error(`Unknown scenario: ${scenario as string}`);
    }
  }

  private static createAuthScenario() {
    const customer = new CustomerBuilder().withPlan('enterprise').build();
    const customerId = customer.id!;
    const users = [
      new UserBuilder()
        .forCustomer(customerId)
        .withRole('admin')
        .withActive(true)
        .build(),
      new UserBuilder()
        .forCustomer(customerId)
        .withRole('user')
        .withActive(true)
        .build(),
      new UserBuilder()
        .forCustomer(customerId)
        .withRole('readonly')
        .withActive(true)
        .build(),
      new UserBuilder()
        .forCustomer(customerId)
        .withRole('user')
        .withActive(false)
        .build(),
    ];
    return { customer, users, devices: [], sessions: [] };
  }

  private static createDiagnosticsScenario() {
    const customer = new CustomerBuilder().withPlan('pro').build();
    const customerId = customer.id!;
    const user = new UserBuilder()
      .forCustomer(customerId)
      .withRole('admin')
      .build();
    const devices = [
      new DeviceBuilder().forCustomer(customerId).withStatus('online').build(),
      new DeviceBuilder().forCustomer(customerId).withStatus('offline').build(),
      new DeviceBuilder().forCustomer(customerId).withStatus('error').build(),
    ];
    const sessions = devices.map(device =>
      new DiagnosticSessionBuilder()
        .forCustomer(customerId)
        .forDevice(device.id!)
        .byUser(user.id!)
        .withStatus(device.status === 'error' ? 'failed' : 'completed')
        .build()
    );
    return { customer, users: [user], devices, sessions };
  }

  private static createPerformanceScenario() {
    const customer = new CustomerBuilder().withPlan('enterprise').build();
    const customerId = customer.id!;
    const users = Array.from({ length: 50 }, (_, i) =>
      new UserBuilder()
        .forCustomer(customerId)
        .withEmail(`user${i}@test.com`)
        .build()
    );
    const devices = Array.from({ length: 100 }, (_, i) =>
      new DeviceBuilder()
        .forCustomer(customerId)
        .withName(`Device ${i}`)
        .build()
    );
    return { customer, users, devices, sessions: [] };
  }

  private static createEdgeCaseScenario() {
    const customer = new CustomerBuilder()
      .withName('Test & Co. "Special" <Characters>')
      .withEmail('special+test@example-test.com')
      .build();
    const customerId = customer.id!;
    const user = new UserBuilder()
      .forCustomer(customerId)
      .withName("O'Connor-Smith, Jr. & Associates")
      .build();
    const device = new DeviceBuilder()
      .forCustomer(customerId)
      .withName('Device & "Special" <Characters>')
      .build();
    return { customer, users: [user], devices: [device], sessions: [] };
  }
}

/**
 * Convenience factory functions
 */
export const testDataFactory = {
  customer: () => new CustomerBuilder(),
  user: () => new UserBuilder(),
  device: () => new DeviceBuilder(),
  session: () => new DiagnosticSessionBuilder(),
  scenario: () => new TestScenarioFactory(),
  relational: RelationalTestDataFactory,
};
