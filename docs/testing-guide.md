# Testing Guide for Aizen vNE

## Overview

This project uses **Vitest** as the primary testing framework, providing fast, ESM-native testing with excellent TypeScript support. Tests can run both locally and within Docker containers to ensure environment consistency.

## Quick Start

### Prerequisites

Before running tests, ensure you have Supabase running locally:

```bash
# Start local Supabase (required for tests)
npm run test:supabase:start

# Or initialize with migrations and seed data
npm run test:supabase:init
```

### Running Tests

```bash
# Run all tests (Supabase must be running)
npm test

# Run tests in watch mode (great for TDD)
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with automatic Supabase setup
npm run test:env

# Run tests in Docker containers
npm run test:docker

# Open Vitest UI for interactive testing
npm run test:ui

# New Advanced Testing Options (Phase 100.3)
# Intelligent test runner with multiple modes
npm run test:runner -- --mode affected --coverage
npm run test:runner -- --mode package --package shared

# TDD workflow with real-time file watching
npm run test:watch:tdd

# Integrated development validation pipeline
npm run dev:test
npm run dev:validate  # With auto-fix and coverage

# Quality gates with coverage enforcement and trend tracking
npm run quality:check

# Test data lifecycle management
npm run seed:test      # Generate test data with multiple strategies
npm run cleanup:test   # Clean up test data with safety features
npm run reset:test-db  # Complete database reset with snapshots
```

### Test Environment Management

```bash
# Start local Supabase
npm run test:supabase:start

# Stop local Supabase
npm run test:supabase:stop

# Reset test database
npm run test:supabase:reset

# Check Supabase status
npm run test:supabase:status
```

## Testing Architecture

### Test Types

1. **Unit Tests** - Test individual functions and components in isolation
2. **Integration Tests** - Test interactions between multiple components
3. **E2E Tests** - Test complete user workflows (coming in Phase 200)

### Directory Structure

```
packages/
├── api/
│   ├── src/
│   │   └── *.test.ts         # Unit tests next to source files
│   ├── test/
│   │   └── setup.ts          # Test setup and mocks
│   └── vitest.config.ts      # Package-specific config
├── shared/
│   ├── src/
│   │   ├── lib/*.test.ts     # Library tests
│   │   └── utils/*.test.ts   # Utility tests
│   └── test/setup.ts
├── device-agent/
│   └── test/setup.ts
└── web/
    └── test/setup.ts

test/
├── fixtures/                  # Shared test data generators
│   └── index.ts              # Mock data factories
└── setup.ts                  # Global test setup
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await someFunction(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Mocking Dependencies

#### Mocking Modules

```typescript
// Mock entire module
vi.mock('@aizen/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));
```

#### Mocking Functions

```typescript
// Mock specific function
const mockCallback = vi.fn();
mockCallback.mockResolvedValue('result');

// Verify calls
expect(mockCallback).toHaveBeenCalledWith('arg');
expect(mockCallback).toHaveBeenCalledTimes(1);
```

### Testing Async Code

```typescript
// Using async/await
it('should handle async operations', async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});

// Testing rejected promises
it('should handle errors', async () => {
  await expect(failingFunction()).rejects.toThrow('Error message');
});
```

## Test Data Management

### Using Test Fixtures

```typescript
import { createMockCustomer, createMockDevice, createTestScenario } from '@/test/fixtures';

// Create single mock
const customer = createMockCustomer({
  name: 'Test Company',
  plan_type: 'enterprise',
});

// Create complete scenario
const scenario = createTestScenario();
// Returns: { customer, users, devices, sessions, alerts }
```

### Available Mock Generators

- `createMockCustomer()` - Customer with company details
- `createMockUser()` - User with role and permissions
- `createMockDevice()` - Raspberry Pi device
- `createMockDiagnosticSession()` - Diagnostic session with results
- `createMockRemediationAction()` - Remediation scripts
- `createMockAlert()` - System alerts
- `createMockNetworkDiagnostic()` - Network test results

## Environment Configuration

### Local Supabase Setup

The test environment uses Supabase CLI to run a full local Supabase stack that matches production:

1. **PostgreSQL 15** - Same version as hosted Supabase
2. **PostgREST** - REST API layer
3. **GoTrue** - Authentication service
4. **Realtime** - WebSocket subscriptions
5. **Storage** - S3-compatible storage
6. **Kong** - API gateway
7. **Edge Functions** - Deno runtime

### Test Environment Variables

Tests use `.env.test` for configuration. Key variables:

```bash
NODE_ENV=test

# Local Supabase (standard values for local development)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Redis test instance
REDIS_HOST=localhost
REDIS_PORT=6380               # Different port for test Redis

# Test-specific settings
ENABLE_AI_MOCK_MODE=true      # Mock AI responses
DISABLE_RATE_LIMITING=true    # Disable rate limits in tests
```

Copy `.env.test.example` to `.env.test` to get started:

```bash
cp .env.test.example .env.test
```

### Package-Specific Setup

Each package has its own `test/setup.ts` for specific configurations:

- **api**: Mocks Supabase and Redis clients
- **shared**: Basic environment setup
- **device-agent**: Mocks network utilities and child processes
- **web**: Mocks Next.js router and React components

## Running Tests in Docker

### Docker Compose Test Environment

The project includes a complete Docker Compose test environment that runs Supabase and all services:

```bash
# Build test containers
npm run test:docker:build

# Run all tests in Docker
npm run test:docker

# Clean up test containers and volumes
npm run test:docker:down
```

### What's Included

The Docker test environment (`docker-compose.test.yml`) includes:

- **Local Supabase** - Full stack running in containers
- **Test Runner** - Dedicated container for running tests
- **Redis Test Instance** - Isolated Redis on port 6380
- **All Services** - API Gateway, Web Portal, Device Agent, etc.
- **Volume Mounts** - For test results and coverage reports

### Single Package Testing

```bash
# Test specific package in Docker
docker-compose --env-file .env.test \
               -f infrastructure/docker/docker-compose.test.yml \
               run api-gateway npm test
```

### Test Results

Test results and coverage reports are saved to:

- `test-results/` - JUnit XML and JSON reports
- `coverage/` - HTML, LCOV coverage reports

## Quality Gates and Coverage

### Coverage Requirements & Enforcement

Current minimum thresholds (configured in `vitest.config.ts`):

**Global thresholds:**
- **Branches**: 60%
- **Functions**: 60%
- **Lines**: 60%
- **Statements**: 60%

**Package-specific thresholds:**
- **shared package**: 70% (all metrics)
- **api package**: 65% (all metrics)

### Quality Gate Enforcement

Automated quality gates prevent commits that reduce code quality:

```bash
# Check quality gates (runs automatically on pre-push)
npm run quality:check

# View coverage report in browser
npm run coverage:view

# Clean coverage artifacts
npm run coverage:clean
```

**Quality gates check:**
- Coverage thresholds compliance
- Coverage trend analysis (prevents regression)
- Historical data tracking
- Markdown reports generation

**Enforcement points:**
- Pre-push hook (automatic)
- CI/CD pipeline
- Manual validation

## Test Data Management

### Seeding Test Data

Generate realistic test data using multiple strategies:

```bash
# Generate test data with different strategies
npm run seed:test

# Available strategies:
# --strategy minimal     # Basic required data only
# --strategy standard    # Typical development dataset  
# --strategy comprehensive # Full feature testing dataset
# --strategy scenarios   # Specific testing scenarios

# Examples:
npm run seed:test -- --strategy minimal
npm run seed:test -- --strategy comprehensive --customers 10
```

**Seeding strategies:**

- **minimal**: Core entities for basic functionality
- **standard**: Balanced dataset for typical development
- **comprehensive**: Full-featured data for extensive testing
- **scenarios**: Specialized scenarios (auth flows, diagnostics, edge cases)

### Database Cleanup

Clean test data safely with multiple cleanup modes:

```bash
# Clean up test data (requires --force for safety)
npm run cleanup:test -- --force

# Available modes:
# --mode full        # Clean all test data
# --mode selective   # Clean recent test data only
# --mode transaction # Clean with transaction rollback support
# --mode verify      # Dry-run to see what would be cleaned

# Examples:
npm run cleanup:test -- --mode selective --days 1 --force
npm run cleanup:test -- --mode verify  # See what would be deleted
```

### Database Reset & Snapshots

Complete database management with snapshot support:

```bash
# Reset database completely
npm run reset:test-db -- --mode full

# Available modes:
# --mode full        # Complete reset with migrations
# --mode migrations  # Reset to specific migration
# --mode data        # Reset data only, keep schema
# --mode snapshot    # Create/restore snapshots

# Snapshot management:
npm run reset:test-db -- --mode snapshot --action create --name clean-state
npm run reset:test-db -- --mode snapshot --action restore --name clean-state
npm run reset:test-db -- --mode snapshot --action list
```

**Snapshot features:**
- pg_dump/pg_restore for reliable state management
- Named snapshots for different test scenarios
- Automatic validation after restore
- Migration state tracking

## Best Practices

### 1. Test Organization

- Keep tests close to source files (`*.test.ts`)
- Group related tests using `describe` blocks
- Use descriptive test names that explain the expected behavior

### 2. Test Independence

- Each test should be independent and not rely on execution order
- Clean up after tests using `afterEach` hooks
- Reset all mocks between tests

### 3. Meaningful Assertions

```typescript
// Good - specific assertion
expect(response.status).toBe(200);
expect(response.data.user.email).toBe('test@example.com');

// Bad - too generic
expect(response).toBeDefined();
```

### 4. Testing Edge Cases

- Test error conditions and edge cases
- Test with invalid/missing inputs
- Test boundary conditions

### 5. Async Testing

- Always await async operations
- Use `.rejects` for testing promise rejections
- Set appropriate timeouts for long operations

## Debugging Tests

### Run Single Test File

```bash
# Run specific test file
npx vitest src/utils/redis-client.test.ts

# Run with debugging output
npx vitest --reporter=verbose
```

### Using Vitest UI

```bash
npm run test:ui
# Opens browser with interactive test runner
```

### VSCode Integration

Install the [Vitest extension](https://marketplace.visualstudio.com/items?itemName=vitest.explorer) for:

- Run tests from editor
- Debug tests with breakpoints
- See test status in explorer

## Common Issues and Solutions

### Issue: Environment Variables Not Loading

**Solution**: Ensure `.env` and `.env.test` exist in project root

```bash
cp .env.example .env
cp .env.example .env.test
```

### Issue: Tests Failing in Docker but Passing Locally

**Solution**: Check Docker-specific environment variables and ensure services are healthy:

```bash
docker-compose ps
docker-compose logs redis
```

### Issue: Mock Not Working

**Solution**: Ensure mock is defined before importing the module:

```typescript
// ✅ Correct - mock before import
vi.mock('redis');
import { redisClient } from './redis-client';

// ❌ Wrong - mock after import
import { redisClient } from './redis-client';
vi.mock('redis');
```

### Issue: Timeout Errors

**Solution**: Increase timeout for slow operations:

```typescript
it('slow test', async () => {
  // Test code
}, 30000); // 30 second timeout
```

## CI/CD Integration

Tests run automatically in GitHub Actions on:

- Pull requests
- Pushes to main branch

The CI pipeline:

1. Installs dependencies
2. Runs linting and type checking
3. Runs all tests with coverage
4. Uploads coverage reports
5. Fails if coverage drops below thresholds

## Contributing

When adding new features:

1. **Write tests FIRST** (TDD approach with `npm run test:watch:tdd`)
2. **Ensure all tests pass locally** (`npm test`)
3. **Run integrated validation** (`npm run dev:validate`)
4. **Check quality gates pass** (`npm run quality:check`)
5. **Coverage requirements met** (automatic pre-push validation)
6. **Run Docker tests** (`npm run test:docker`) for final verification
7. **Update documentation** if adding new testing patterns

### Development Workflow

```bash
# Start TDD workflow
npm run test:watch:tdd

# Run comprehensive validation before commit
npm run dev:validate

# Quality gates run automatically on git push
# Or run manually: npm run quality:check
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [Faker.js](https://fakerjs.dev/)

---

For questions or issues with testing, check the project's issue tracker or contact the development team.
