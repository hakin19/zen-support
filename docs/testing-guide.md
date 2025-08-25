# Testing Guide for Aizen vNE

## Overview

This project uses **Vitest** as the primary testing framework, providing fast, ESM-native testing with excellent TypeScript support. Tests can run both locally and within Docker containers to ensure environment consistency.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (great for TDD)
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests in Docker containers
npm run test:docker

# Open Vitest UI for interactive testing
npm run test:ui
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

### Test Environment Variables

Tests use `.env.test` for configuration. Key variables:

```bash
NODE_ENV=test
TEST_SUPABASE_URL=...         # Test Supabase instance
REDIS_HOST=localhost
REDIS_PORT=6380               # Different port for test Redis
ENABLE_AI_MOCK_MODE=true      # Mock AI responses
DISABLE_RATE_LIMITING=true    # Disable rate limits in tests
```

### Package-Specific Setup

Each package has its own `test/setup.ts` for specific configurations:

- **api**: Mocks Supabase and Redis clients
- **shared**: Basic environment setup
- **device-agent**: Mocks network utilities and child processes
- **web**: Mocks Next.js router and React components

## Running Tests in Docker

### Single Package Testing

```bash
# Test specific package in Docker
docker-compose -f infrastructure/docker/docker-compose.yml \
               -f infrastructure/docker/docker-compose.test.yml \
               run api-gateway npm test
```

### Full Test Suite

```bash
# Run all tests in Docker
npm run test:docker

# This runs tests in isolated containers with:
# - Separate Redis instance
# - Test environment variables
# - Volume mounts for results/coverage
```

### Test Results

Test results and coverage reports are saved to:

- `test-results/` - JUnit XML and JSON reports
- `coverage/` - HTML, LCOV coverage reports

## Coverage Requirements

Current minimum thresholds (configured in `vitest.config.ts`):

- **Branches**: 60%
- **Functions**: 60%
- **Lines**: 60%
- **Statements**: 60%

View coverage report:

```bash
npm run test:coverage
# Then open coverage/index.html in browser
```

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

1. Write tests FIRST (TDD approach)
2. Ensure all tests pass locally
3. Check coverage doesn't decrease
4. Run `npm run test:docker` before committing
5. Update this guide if adding new testing patterns

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [Faker.js](https://fakerjs.dev/)

---

For questions or issues with testing, check the project's issue tracker or contact the development team.
