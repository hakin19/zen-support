# Test Data Management Guide

## Overview

This guide covers the comprehensive test data management system for the Zen & Zen Network Support project. The system provides type-safe fixtures, dynamic factories, and utilities for managing test data throughout the testing lifecycle.

## Architecture

The test data management system consists of:

1. **Fixtures** - Type-safe, predefined test data with sensible defaults
2. **Factories** - Dynamic test data generation with builder pattern
3. **Test Context** - Simple test isolation and cleanup utilities
4. **Seeding Scripts** - Database population for different test scenarios
5. **Cleanup Scripts** - Safe removal of test data with foreign key handling
6. **Reset Scripts** - Complete database reset with snapshot capabilities

## Test Fixtures

### Location

`packages/shared/src/test/fixtures/`

### Available Fixtures

#### Customer Fixtures

```typescript
import { customerFixtures, createCustomerFixture } from '@aizen/shared/test/fixtures';

// Use predefined fixtures
const basicCustomer = customerFixtures.basic();
const proCustomer = customerFixtures.pro();
const enterpriseCustomer = customerFixtures.enterprise();

// Create custom fixture
const customCustomer = createCustomerFixture({
  name: 'Test Company',
  plan_type: 'pro',
  status: 'active',
});
```

#### User Fixtures

```typescript
import { userFixtures, createUserFixture } from '@aizen/shared/test/fixtures';

// Create users for a customer
const admin = userFixtures.admin(customerId);
const regularUser = userFixtures.regularUser(customerId);
const readOnlyUser = userFixtures.readOnlyUser(customerId);

// Create a team
const team = createTeamFixtures(customerId);
```

#### Device Fixtures

```typescript
import { deviceFixtures, createDeviceFixture } from '@aizen/shared/test/fixtures';

// Create devices
const raspberryPi = deviceFixtures.raspberryPi(customerId);
const router = deviceFixtures.router(customerId);
const offlineDevice = deviceFixtures.offline(customerId);

// Create network infrastructure
const infrastructure = createNetworkInfrastructure(customerId);
```

#### Complete Scenarios

```typescript
import {
  createMinimalTestScenario,
  createAuthTestScenario,
  createDiagnosticsTestScenario,
  createMultiTenantTestScenario,
} from '@aizen/shared/test/fixtures';

// Minimal setup for quick tests
const minimal = createMinimalTestScenario();

// Auth testing scenario
const authScenario = createAuthTestScenario();

// Diagnostics testing
const diagnosticsScenario = createDiagnosticsTestScenario();
```

## Test Factories

### Location

`packages/shared/src/test/factories/`

### Builder Pattern Usage

```typescript
import { testDataFactory } from '@aizen/shared/test/factories';

// Build a customer
const customer = testDataFactory
  .customer()
  .withName('Acme Corp')
  .withPlan('enterprise')
  .withStatus('active')
  .build();

// Build a user
const user = testDataFactory
  .user()
  .forCustomer(customerId)
  .withRole('admin')
  .withEmail('admin@acme.com')
  .build();

// Build a complete scenario
const scenario = testDataFactory
  .scenario()
  .withCustomer(c => c.withPlan('pro'))
  .withUser(u => u.withRole('admin'))
  .withDevice(d => d.withType('raspberry_pi'))
  .build();
```

### Relational Test Data

```typescript
import { testDataFactory } from '@aizen/shared/test/factories';

// Create full customer setup
const fullSetup = testDataFactory.relational.createFullCustomerSetup();

// Create multi-tenant data
const tenants = testDataFactory.relational.createMultiTenantData(3);

// Create specific scenarios
const authData = testDataFactory.relational.createScenario('auth');
const diagnosticsData = testDataFactory.relational.createScenario('diagnostics');
```

## Test Context Utility

### Location

`packages/shared/src/test/utils/test-context.ts`

### Basic Usage

```typescript
import { TestContext, withTestData } from '@aizen/shared/test/utils';

// Using TestContext directly
describe('My Test Suite', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should test something', async () => {
    // Seed data
    const data = await context.seedMinimalData();

    // Your test logic here
    expect(data.customer).toBeDefined();
  });
});

// Using withTestData helper
it('should test with automatic cleanup', async () => {
  await withTestData(async data => {
    // Your test logic here
    expect(data.customer).toBeDefined();
  });
});
```

## Seeding Scripts

### Available Commands

```bash
# Seed with standard strategy (default)
npm run seed:test

# Seed with minimal data
npm run seed:test -- --strategy minimal

# Seed with comprehensive data
npm run seed:test -- --strategy comprehensive --verbose

# Seed specific scenarios
npm run seed:test -- --strategy scenarios --scenarios auth,diagnostics

# Clean before seeding
npm run seed:test -- --clean --strategy standard
```

### Seeding Strategies

| Strategy        | Description                                   | Use Case                 |
| --------------- | --------------------------------------------- | ------------------------ |
| `minimal`       | Single customer, user, device                 | Unit tests, quick checks |
| `standard`      | Multiple entities with realistic distribution | Integration tests        |
| `comprehensive` | Large dataset                                 | Performance testing      |
| `scenarios`     | Specific test scenarios                       | Feature testing          |

## Cleanup Scripts

### Available Commands

```bash
# Full cleanup (requires --force)
npm run cleanup:test -- --mode full --force

# Selective cleanup by customer
npm run cleanup:test -- --mode selective --customer-id <id>

# Clean specific tables
npm run cleanup:test -- --mode selective --tables users,devices

# Transaction-based cleanup (recent data)
npm run cleanup:test -- --mode transaction

# Verify cleanup (dry run)
npm run cleanup:test -- --mode verify

# List customers for selective cleanup
npm run cleanup:test -- --list-customers

# Estimate cleanup size
npm run cleanup:test -- --estimate
```

### Cleanup Modes

| Mode          | Description             | Safety           |
| ------------- | ----------------------- | ---------------- |
| `full`        | Remove all test data    | Requires --force |
| `selective`   | Remove specific data    | Safe             |
| `transaction` | Remove recent test data | Safe             |
| `verify`      | Check data state        | Read-only        |

## Database Reset

### Available Commands

```bash
# Full reset (requires --force)
npm run reset:test-db -- --mode full --force

# Reset with specific strategy
npm run reset:test-db -- --mode data --strategy minimal

# Create snapshot
npm run reset:test-db -- --mode snapshot

# Restore from snapshot
npm run reset:test-db -- --mode snapshot --restore snapshot-name

# List available snapshots
npm run reset:test-db -- --list-snapshots

# Validate database state
npm run reset:test-db -- --validate
```

### Reset Modes

| Mode         | Description                           | Impact         |
| ------------ | ------------------------------------- | -------------- |
| `full`       | Stop/start Supabase, migrations, data | Complete reset |
| `migrations` | Clean data and reapply migrations     | Schema reset   |
| `data`       | Clean and reseed data                 | Data reset     |
| `snapshot`   | Create/restore snapshots              | Backup/restore |

## Writing Tests with Test Data

### Example Test File

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@aizen/shared/test/utils';
import { customerFixtures } from '@aizen/shared/test/fixtures';
import { testDataFactory } from '@aizen/shared/test/factories';

describe('Customer API Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should create a customer', async () => {
    // Use fixture
    const customerData = customerFixtures.basic();

    // Seed to database
    const { customers } = await context.seedCustomData({
      customers: [customerData],
    });

    // Test your API
    const response = await fetch(`/api/customers/${customers[0].id}`);
    expect(response.ok).toBe(true);
  });

  it('should handle complex scenario', async () => {
    // Use factory for dynamic data
    const scenario = testDataFactory
      .scenario()
      .withCustomer(c => c.withPlan('enterprise'))
      .withUser(u => u.withRole('admin'))
      .withDevice(d => d.withStatus('online'))
      .build();

    // Seed all data
    await context.seedCustomData(scenario);

    // Your test logic
  });
});
```

## Best Practices

### 1. Use Appropriate Strategies

- **Unit Tests**: Use minimal fixtures or mocked data
- **Integration Tests**: Use standard fixtures with TestContext
- **E2E Tests**: Use comprehensive scenarios with full seeding
- **Performance Tests**: Use factories to generate large datasets

### 2. Clean Up After Tests

Always clean up test data:

```typescript
afterEach(async () => {
  await context.cleanup();
});
```

### 3. Use Type-Safe Fixtures

Leverage TypeScript for type safety:

```typescript
import type { Database } from '@aizen/shared/types/supabase.types';

type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
```

### 4. Track Test Data

Use TestContext to track and clean up data:

```typescript
const context = new TestContext();
// All inserted data is tracked
await context.seedMinimalData();
// Cleanup removes only tracked data
await context.cleanup();
```

### 5. Use Meaningful Test Data

Create realistic test scenarios:

```typescript
// Good: Meaningful names and realistic data
const customer = customerFixtures.enterprise();

// Bad: Random meaningless data
const customer = { name: 'asdf', email: 'test@test.com' };
```

## Troubleshooting

### Issue: Foreign Key Constraint Errors

**Solution**: Clean data in reverse dependency order (sessions → devices → users → customers)

### Issue: Duplicate Key Errors

**Solution**: Use unique identifiers or clean existing data before seeding

### Issue: Tests Interfering with Each Other

**Solution**: Use TestContext for proper isolation and cleanup

### Issue: Slow Test Execution

**Solution**: Use minimal fixtures for unit tests, comprehensive only for E2E

### Issue: Database State Inconsistent

**Solution**: Use database reset script to restore clean state

## Environment Configuration

Required environment variables for test data management:

```env
# Supabase Configuration
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=your-service-key

# Test Environment
NODE_ENV=test
```

## Integration with CI/CD

The test data management system integrates with CI/CD pipelines:

1. **Setup**: Start Supabase and run migrations
2. **Seed**: Load appropriate test data
3. **Test**: Execute test suites
4. **Cleanup**: Remove test data
5. **Report**: Generate coverage and results

Example GitHub Actions workflow:

```yaml
- name: Setup Test Environment
  run: npm run test:supabase:start

- name: Seed Test Data
  run: npm run seed:test -- --strategy standard

- name: Run Tests
  run: npm test

- name: Cleanup
  run: npm run cleanup:test -- --mode full --force
```

## Summary

The test data management system provides:

- ✅ Type-safe fixtures for all core entities
- ✅ Dynamic factories with builder pattern
- ✅ Simple test isolation with TestContext
- ✅ Comprehensive seeding strategies
- ✅ Safe cleanup with foreign key handling
- ✅ Database reset and snapshot capabilities
- ✅ Integration with test lifecycle

This ensures consistent, reliable, and maintainable test data across the entire test suite.
