# Testing and Coverage Documentation

## Overview

This document describes the testing and coverage reporting infrastructure for the Zen & Zen Network Support (Aizen vNE) project. The system enforces code quality through comprehensive coverage reporting, quality gates, and automated checks.

## Coverage Goals

The project maintains the following minimum coverage thresholds:

| Package | Required Coverage | Rationale |
|---------|-------------------|-----------|
| **Global** | 60% | Baseline for all code |
| **@aizen/shared** | 70% | Critical shared utilities require higher coverage |
| **@aizen/api** | 65% | Backend services need robust testing |
| **@aizen/web** | 60% | Frontend code with standard coverage |
| **@aizen/device-agent** | 60% | Device agent with standard coverage |

## Running Tests with Coverage

### Basic Commands

```bash
# Run all tests with coverage
npm run test:coverage

# View coverage report in browser
npm run coverage:view

# Clean coverage reports
npm run coverage:clean
```

### Package-Specific Testing

```bash
# Test specific package
npm test -- packages/api/**/*.test.ts

# Test with watch mode
npm run test:watch

# Test only affected code
npm run test:affected
```

## Coverage Reporting

### 1. HTML Reports

Interactive HTML reports are generated automatically:

```bash
# Generate and view HTML coverage report
npm run test:coverage
npm run coverage:view
```

Reports are saved to `coverage/index.html` and `coverage/lcov-report/index.html`.

### 2. Coverage Badges

Generate SVG badges for README display:

```bash
# Generate coverage badges
npm run coverage:badge
```

Badges are saved to `coverage/badges/` with a README snippet in `coverage/badges/README_SNIPPET.md`.

### 3. Aggregated Reports

Combine coverage from all packages:

```bash
# Generate aggregated coverage report
npm run coverage:aggregate
```

Reports are saved to `coverage/aggregated/` with:
- `coverage-aggregated.json` - Raw aggregated data
- `coverage-detailed.json` - Detailed package breakdown
- `COVERAGE_REPORT.md` - Markdown report

## Quality Gates

### Running Quality Checks

```bash
# Check if coverage meets thresholds
npm run quality:check
```

This command:
1. Validates coverage against configured thresholds
2. Checks for coverage regression
3. Generates quality reports
4. Saves historical data for trend tracking

### Quality Gate Reports

Reports are generated in multiple formats:
- `coverage/quality-report.json` - Machine-readable report
- `coverage/quality-report.md` - Human-readable markdown
- `coverage/history/` - Historical coverage data

### Enforcement

Quality gates are enforced at multiple levels:

1. **Test Execution**: Vitest enforces thresholds during test runs
2. **Pre-commit Hooks**: Coverage is checked for staged files (optional)
3. **CI/CD Pipeline**: Quality gates block deployment on failure
4. **Manual Checks**: Run `npm run quality:check` anytime

## Pre-commit Coverage Checks

### Configuration

Pre-commit hooks use lint-staged to run checks on staged files. To add coverage checks to pre-commit:

```bash
# Run coverage check for staged files
npx tsx scripts/staged-coverage.ts

# With custom threshold
npx tsx scripts/staged-coverage.ts --threshold=70

# Verbose output
npx tsx scripts/staged-coverage.ts --verbose
```

### Skipping Coverage Checks

If needed, skip pre-commit hooks temporarily:

```bash
git commit --no-verify -m "Emergency fix"
```

⚠️ **Warning**: Only skip checks in emergencies. Always ensure coverage before merging.

## Coverage Workflow

### Development Workflow

1. **Write Tests First**: Follow TDD practices
2. **Run Tests Locally**: `npm test` or `npm run test:watch`
3. **Check Coverage**: `npm run test:coverage`
4. **Validate Quality**: `npm run quality:check`
5. **Generate Badges**: `npm run coverage:badge` (before release)

### CI/CD Workflow

1. **Automatic Testing**: Tests run on every push
2. **Coverage Collection**: Coverage data collected automatically
3. **Quality Gates**: Builds fail if thresholds not met
4. **Historical Tracking**: Coverage trends monitored over time

### PR Workflow

1. **Differential Coverage**: New code must meet thresholds
2. **Coverage Comments**: Bot comments with coverage changes
3. **Required Checks**: PRs blocked if coverage drops
4. **Badge Updates**: Coverage badges updated on merge

## Understanding Coverage Metrics

### Metric Types

- **Statements**: Percentage of executable statements covered
- **Branches**: Percentage of conditional branches covered
- **Functions**: Percentage of functions called
- **Lines**: Percentage of source lines covered

### Coverage Interpretation

| Coverage % | Status | Interpretation |
|------------|--------|----------------|
| 80-100% | 🟢 Excellent | Well-tested, production-ready |
| 60-79% | 🟡 Good | Acceptable, room for improvement |
| 40-59% | 🟠 Fair | Needs attention, add more tests |
| 0-39% | 🔴 Poor | High risk, prioritize testing |

### What to Test

**Priority 1 - Critical Path**:
- Authentication and authorization
- Data validation and sanitization
- Error handling and recovery
- Core business logic

**Priority 2 - Important Features**:
- API endpoints and responses
- State management
- Data transformations
- Integration points

**Priority 3 - Nice to Have**:
- UI components
- Utility functions
- Configuration loading
- Logging and metrics

### What Not to Test

- Generated code (database types, migrations)
- Third-party libraries
- Development-only code
- Simple getters/setters
- Constants and configuration

## Troubleshooting

### Common Issues

#### Coverage Not Generated

```bash
# Ensure test environment is set up
npm run test:supabase:init

# Clean and regenerate coverage
npm run coverage:clean
npm run test:coverage
```

#### Thresholds Failing

```bash
# Check current coverage
npm run test:coverage

# View detailed report
npm run coverage:view

# Check which files need tests
npm run quality:check
```

#### Coverage Data Incorrect

```bash
# Clear all caches
npm run clean:cache
rm -rf coverage/

# Regenerate from scratch
npm run test:coverage
```

### Getting Help

1. Run `npm run quality:check` for detailed failure reasons
2. Check `coverage/quality-report.md` for specific issues
3. View HTML reports for line-by-line coverage
4. Review historical data in `coverage/history/`

## Best Practices

### Writing Testable Code

1. **Keep functions small**: Single responsibility principle
2. **Inject dependencies**: Use dependency injection
3. **Avoid side effects**: Pure functions are easier to test
4. **Use interfaces**: Mock external dependencies
5. **Handle errors explicitly**: Test error paths

### Improving Coverage

1. **Start with critical paths**: Test most important code first
2. **Test edge cases**: Empty arrays, null values, errors
3. **Use test generators**: Property-based testing for complex logic
4. **Mock external services**: Don't test third-party code
5. **Refactor untestable code**: Make code testable, then test it

### Maintaining Coverage

1. **Set realistic goals**: Start at 60%, improve gradually
2. **Track trends**: Monitor coverage over time
3. **Celebrate improvements**: Recognize coverage increases
4. **Address regressions quickly**: Don't let coverage slip
5. **Review uncovered code**: Regularly audit untested areas

## Advanced Configuration

### Custom Thresholds

Edit `vitest.config.ts` in each package:

```typescript
coverage: {
  thresholds: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
    // Per-file thresholds
    perFile: true,
    // Auto-update baseline
    autoUpdate: true,
  }
}
```

### Excluding Files

Add patterns to coverage exclusion:

```typescript
coverage: {
  exclude: [
    'node_modules/**',
    '**/*.config.{js,ts}',
    '**/*.d.ts',
    'test/**',
    'src/types/**', // Generated types
  ]
}
```

### Custom Reporters

Add additional coverage reporters:

```typescript
coverage: {
  reporter: [
    'text',
    'json',
    'html',
    'lcov',        // For CI integration
    'cobertura',   // For Jenkins
    'clover',      // For IDEs
    'teamcity',    // For TeamCity
  ]
}
```

## Integration with CI/CD

### GitHub Actions

Coverage is automatically collected in CI:

```yaml
- name: Run tests with coverage
  run: npm run test:ci

- name: Check quality gates
  run: npm run quality:check

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

### Coverage Services

The project can integrate with:
- **Codecov**: Detailed coverage tracking
- **Coveralls**: Coverage history and badges
- **SonarQube**: Code quality and security
- **Code Climate**: Maintainability metrics

## Summary

The coverage reporting system provides:

1. ✅ **Automated coverage collection** with multiple reporters
2. ✅ **Quality gates** that enforce minimum thresholds
3. ✅ **Coverage badges** for visual status
4. ✅ **Historical tracking** for trend analysis
5. ✅ **Monorepo aggregation** for overall metrics
6. ✅ **Pre-commit hooks** for early detection
7. ✅ **Detailed reporting** in multiple formats
8. ✅ **CI/CD integration** for continuous quality

Maintain high coverage to ensure code quality, reduce bugs, and increase confidence in deployments.