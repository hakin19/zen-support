#!/usr/bin/env tsx

/**
 * Test Data Seeding Script
 *
 * Comprehensive test data generation and seeding for Supabase database.
 * Supports multiple seeding strategies:
 * - Minimal: Basic data for simple tests
 * - Standard: Comprehensive data for integration tests
 * - Scenarios: Specific test scenarios and edge cases
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { faker } from '@faker-js/faker';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Supabase connection configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

interface SeedingOptions {
  strategy: 'minimal' | 'standard' | 'comprehensive' | 'scenarios';
  clean?: boolean;
  verbose?: boolean;
  scenarios?: string[];
}

interface TestCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan_type: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'inactive' | 'suspended';
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface TestUser {
  id: string;
  customer_id: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  name: string;
  phone: string;
  is_active: boolean;
  last_login: string | null;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface TestDevice {
  id: string;
  customer_id: string;
  name: string;
  device_type: 'raspberry_pi' | 'router' | 'switch';
  mac_address: string;
  ip_address: string;
  location: string;
  status: 'online' | 'offline' | 'error';
  last_seen: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

class TestDataSeeder {
  private supabase;
  private generatedData: {
    customers: TestCustomer[];
    users: TestUser[];
    devices: TestDevice[];
  } = {
    customers: [],
    users: [],
    devices: [],
  };

  constructor(private options: SeedingOptions) {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async seed(): Promise<boolean> {
    console.log(
      `🌱 Seeding test data with ${this.options.strategy} strategy...`
    );

    try {
      // Clean existing data if requested
      if (this.options.clean) {
        await this.cleanDatabase();
      }

      // Generate and insert data based on strategy
      await this.generateData();
      await this.insertData();

      // Save seeded data manifest
      await this.saveDataManifest();

      console.log('✅ Test data seeding completed successfully!');
      this.printSummary();

      return true;
    } catch (error) {
      console.error('❌ Test data seeding failed:', error);
      return false;
    }
  }

  private async cleanDatabase(): Promise<void> {
    console.log('🧹 Cleaning existing test data...');

    const tables = [
      'audit_logs',
      'alerts',
      'network_diagnostics',
      'remediation_actions',
      'diagnostic_sessions',
      'devices',
      'users',
      'customers',
    ];

    for (const table of tables) {
      const { error } = await this.supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all except dummy rows

      if (error && !error.message.includes('does not exist')) {
        console.warn(`Warning: Failed to clean ${table}:`, error.message);
      } else if (this.options.verbose) {
        console.log(`  ✅ Cleaned ${table}`);
      }
    }
  }

  private async generateData(): Promise<void> {
    console.log('🎲 Generating test data...');

    switch (this.options.strategy) {
      case 'minimal':
        this.generateMinimalData();
        break;
      case 'standard':
        this.generateStandardData();
        break;
      case 'comprehensive':
        this.generateComprehensiveData();
        break;
      case 'scenarios':
        await this.generateScenarioData();
        break;
    }
  }

  private generateMinimalData(): void {
    // Single customer, user, and device for basic testing
    const customer = this.createTestCustomer({
      name: 'Test Company',
      email: 'test@example.com',
      plan_type: 'basic',
    });

    const user = this.createTestUser({
      customer_id: customer.id,
      email: 'admin@test.example.com',
      role: 'admin',
      name: 'Test Admin',
    });

    const device = this.createTestDevice({
      customer_id: customer.id,
      name: 'Test Device',
      device_type: 'raspberry_pi',
      status: 'online',
    });

    this.generatedData.customers.push(customer);
    this.generatedData.users.push(user);
    this.generatedData.devices.push(device);
  }

  private generateStandardData(): void {
    // Multiple customers with realistic data distribution
    const customerCount = 5;
    const usersPerCustomer = 3;
    const devicesPerCustomer = 2;

    for (let i = 0; i < customerCount; i++) {
      const customer = this.createTestCustomer({
        name: faker.company.name(),
        email: faker.internet.email(),
        plan_type: faker.helpers.arrayElement(['basic', 'pro', 'enterprise']),
      });

      this.generatedData.customers.push(customer);

      // Generate users for this customer
      for (let j = 0; j < usersPerCustomer; j++) {
        const user = this.createTestUser({
          customer_id: customer.id,
          email: faker.internet.email(),
          role:
            j === 0
              ? 'admin'
              : faker.helpers.arrayElement(['user', 'readonly']),
          name: faker.person.fullName(),
        });

        this.generatedData.users.push(user);
      }

      // Generate devices for this customer
      for (let k = 0; k < devicesPerCustomer; k++) {
        const device = this.createTestDevice({
          customer_id: customer.id,
          name: `${faker.word.adjective()} ${faker.word.noun()}`,
          device_type: faker.helpers.arrayElement([
            'raspberry_pi',
            'router',
            'switch',
          ]),
          status: faker.helpers.arrayElement(['online', 'offline', 'error']),
        });

        this.generatedData.devices.push(device);
      }
    }
  }

  private generateComprehensiveData(): void {
    // Large dataset for performance testing
    const customerCount = 20;
    const usersPerCustomer = 5;
    const devicesPerCustomer = 8;

    for (let i = 0; i < customerCount; i++) {
      const customer = this.createTestCustomer({
        name: faker.company.name(),
        email: faker.internet.email(),
        plan_type: faker.helpers.arrayElement(['basic', 'pro', 'enterprise']),
      });

      this.generatedData.customers.push(customer);

      // Generate users for this customer
      for (let j = 0; j < usersPerCustomer; j++) {
        const user = this.createTestUser({
          customer_id: customer.id,
          email: faker.internet.email(),
          role:
            j === 0
              ? 'admin'
              : faker.helpers.arrayElement(['user', 'readonly']),
          name: faker.person.fullName(),
        });

        this.generatedData.users.push(user);
      }

      // Generate devices for this customer
      for (let k = 0; k < devicesPerCustomer; k++) {
        const device = this.createTestDevice({
          customer_id: customer.id,
          name: `${faker.word.adjective()} ${faker.word.noun()}`,
          device_type: faker.helpers.arrayElement([
            'raspberry_pi',
            'router',
            'switch',
          ]),
          status: faker.helpers.arrayElement(['online', 'offline', 'error']),
        });

        this.generatedData.devices.push(device);
      }
    }
  }

  private async generateScenarioData(): Promise<void> {
    const scenarios = this.options.scenarios || [
      'auth',
      'diagnostics',
      'alerts',
    ];

    for (const scenario of scenarios) {
      switch (scenario) {
        case 'auth':
          this.generateAuthScenario();
          break;
        case 'diagnostics':
          this.generateDiagnosticsScenario();
          break;
        case 'alerts':
          this.generateAlertsScenario();
          break;
        case 'edge-cases':
          this.generateEdgeCasesScenario();
          break;
        default:
          console.warn(`Unknown scenario: ${scenario}`);
      }
    }
  }

  private generateAuthScenario(): void {
    // Customer with various user roles and permissions
    const customer = this.createTestCustomer({
      name: 'Auth Test Corp',
      email: 'auth@test.example.com',
      plan_type: 'enterprise',
    });

    const users = [
      {
        email: 'admin@auth.test',
        role: 'admin' as const,
        name: 'Admin User',
        is_active: true,
      },
      {
        email: 'user@auth.test',
        role: 'user' as const,
        name: 'Regular User',
        is_active: true,
      },
      {
        email: 'readonly@auth.test',
        role: 'readonly' as const,
        name: 'ReadOnly User',
        is_active: true,
      },
      {
        email: 'inactive@auth.test',
        role: 'user' as const,
        name: 'Inactive User',
        is_active: false,
      },
    ];

    this.generatedData.customers.push(customer);

    for (const userData of users) {
      const user = this.createTestUser({
        customer_id: customer.id,
        ...userData,
      });
      this.generatedData.users.push(user);
    }
  }

  private generateDiagnosticsScenario(): void {
    // Customer with devices in various diagnostic states
    const customer = this.createTestCustomer({
      name: 'Diagnostics Test Lab',
      email: 'diagnostics@test.example.com',
      plan_type: 'pro',
    });

    const devices = [
      { name: 'Healthy Device', status: 'online' as const },
      { name: 'Offline Device', status: 'offline' as const },
      { name: 'Error Device', status: 'error' as const },
    ];

    this.generatedData.customers.push(customer);

    for (const deviceData of devices) {
      const device = this.createTestDevice({
        customer_id: customer.id,
        device_type: 'raspberry_pi',
        ...deviceData,
      });
      this.generatedData.devices.push(device);
    }
  }

  private generateAlertsScenario(): void {
    // Customer with various alert conditions
    const customer = this.createTestCustomer({
      name: 'Alerts Test Facility',
      email: 'alerts@test.example.com',
      plan_type: 'enterprise',
    });

    this.generatedData.customers.push(customer);

    // Devices that will trigger various alerts
    const alertDevices = [
      { name: 'High CPU Device', status: 'online' as const },
      { name: 'Low Memory Device', status: 'online' as const },
      { name: 'Network Issue Device', status: 'error' as const },
    ];

    for (const deviceData of alertDevices) {
      const device = this.createTestDevice({
        customer_id: customer.id,
        device_type: 'raspberry_pi',
        ...deviceData,
      });
      this.generatedData.devices.push(device);
    }
  }

  private generateEdgeCasesScenario(): void {
    // Edge cases and boundary conditions
    const customer = this.createTestCustomer({
      name: 'Edge Cases & Boundaries Inc.',
      email: 'edge@test.example.com',
      plan_type: 'basic',
      // Test with special characters
      settings: {
        special_chars: 'äöü@#$%^&*()[]{}|\\:";\'<>?,./`~',
        unicode: '🚀🎯📊✅❌🔍🧪',
        empty_object: {},
        null_value: null,
      },
    });

    this.generatedData.customers.push(customer);

    // User with edge case data
    const edgeUser = this.createTestUser({
      customer_id: customer.id,
      email:
        'very.long.email.address.that.tests.length.limits@extremely.long.domain.name.that.might.cause.issues.example.com',
      role: 'user',
      name: 'User With Very Long Name That Might Cause Display Issues',
      preferences: {
        empty_array: [],
        nested_object: { deep: { very: { deep: { value: 'found' } } } },
      },
    });

    this.generatedData.users.push(edgeUser);
  }

  private createTestCustomer(
    overrides: Partial<TestCustomer> = {}
  ): TestCustomer {
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
      },
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  private createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    const now = new Date().toISOString();
    return {
      id: faker.string.uuid(),
      customer_id: '',
      email: faker.internet.email(),
      role: 'user',
      name: faker.person.fullName(),
      phone: faker.phone.number(),
      is_active: true,
      last_login: faker.date.recent().toISOString(),
      preferences: {
        theme: 'light',
        language: 'en',
      },
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  private createTestDevice(overrides: Partial<TestDevice> = {}): TestDevice {
    const now = new Date().toISOString();
    return {
      id: faker.string.uuid(),
      customer_id: '',
      name: `Device ${faker.number.int({ min: 100, max: 999 })}`,
      device_type: 'raspberry_pi',
      mac_address: faker.internet.mac(),
      ip_address: faker.internet.ip(),
      location: faker.location.city(),
      status: 'online',
      last_seen: now,
      config: {
        firmware_version: '1.0.0',
        auto_update: true,
      },
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  private async insertData(): Promise<void> {
    console.log('💾 Inserting data into database...');

    // Insert in dependency order
    await this.insertCustomers();
    await this.insertUsers();
    await this.insertDevices();
  }

  private async insertCustomers(): Promise<void> {
    if (this.generatedData.customers.length === 0) return;

    const { error } = await this.supabase
      .from('customers')
      .insert(this.generatedData.customers);

    if (error) {
      throw new Error(`Failed to insert customers: ${error.message}`);
    }

    if (this.options.verbose) {
      console.log(
        `  ✅ Inserted ${this.generatedData.customers.length} customers`
      );
    }
  }

  private async insertUsers(): Promise<void> {
    if (this.generatedData.users.length === 0) return;

    const { error } = await this.supabase
      .from('users')
      .insert(this.generatedData.users);

    if (error) {
      throw new Error(`Failed to insert users: ${error.message}`);
    }

    if (this.options.verbose) {
      console.log(`  ✅ Inserted ${this.generatedData.users.length} users`);
    }
  }

  private async insertDevices(): Promise<void> {
    if (this.generatedData.devices.length === 0) return;

    const { error } = await this.supabase
      .from('devices')
      .insert(this.generatedData.devices);

    if (error) {
      throw new Error(`Failed to insert devices: ${error.message}`);
    }

    if (this.options.verbose) {
      console.log(`  ✅ Inserted ${this.generatedData.devices.length} devices`);
    }
  }

  private async saveDataManifest(): Promise<void> {
    const manifest = {
      strategy: this.options.strategy,
      timestamp: new Date().toISOString(),
      summary: {
        customers: this.generatedData.customers.length,
        users: this.generatedData.users.length,
        devices: this.generatedData.devices.length,
      },
      data: this.generatedData,
    };

    const manifestPath = path.join(
      ROOT_DIR,
      'test-results',
      'test-data-manifest.json'
    );
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    if (this.options.verbose) {
      console.log(`📄 Saved data manifest to: ${manifestPath}`);
    }
  }

  private printSummary(): void {
    console.log('\n📊 Seeding Summary:');
    console.log(`  Strategy: ${this.options.strategy}`);
    console.log(`  Customers: ${this.generatedData.customers.length}`);
    console.log(`  Users: ${this.generatedData.users.length}`);
    console.log(`  Devices: ${this.generatedData.devices.length}`);
    console.log(`  Total records: ${this.getTotalRecords()}`);
  }

  private getTotalRecords(): number {
    return (
      this.generatedData.customers.length +
      this.generatedData.users.length +
      this.generatedData.devices.length
    );
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: SeedingOptions = {
    strategy: 'standard',
    clean: false,
    verbose: false,
    scenarios: [],
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--strategy':
        options.strategy = args[++i] as SeedingOptions['strategy'];
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--scenarios':
        options.scenarios = args[++i].split(',');
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const seeder = new TestDataSeeder(options);
  const success = await seeder.seed();
  process.exit(success ? 0 : 1);
}

function printHelp() {
  console.log(`
Test Data Seeding - Comprehensive test data generation

Usage: npm run seed:test -- [options]

Options:
  --strategy <type>     Seeding strategy: minimal, standard, comprehensive, scenarios
  --clean              Clean existing data before seeding
  --verbose            Show detailed output
  --scenarios <list>   Comma-separated list of scenarios (for scenarios strategy)
  --help               Show this help

Strategies:
  minimal              Single customer, user, and device for basic testing
  standard             Multiple customers with realistic data distribution (default)
  comprehensive        Large dataset for performance testing
  scenarios            Specific test scenarios and edge cases

Available Scenarios:
  auth                 Authentication and authorization test data
  diagnostics          Devices in various diagnostic states
  alerts               Alert conditions and monitoring scenarios
  edge-cases           Boundary conditions and special characters

Examples:
  npm run seed:test                                    # Standard strategy
  npm run seed:test -- --strategy minimal --clean     # Clean + minimal data
  npm run seed:test -- --strategy scenarios --scenarios auth,alerts
  npm run seed:test -- --strategy comprehensive --verbose

Environment Variables:
  SUPABASE_URL         Supabase instance URL (default: http://localhost:54321)
  SUPABASE_SERVICE_KEY Service role key for database access
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { TestDataSeeder };
