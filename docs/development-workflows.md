# Development Workflows Documentation

## Overview

This document describes the automated development workflow scripts available in the Zen & Zen Network Support project. These scripts streamline common development tasks, ensure code quality, and maintain consistency across the team.

> **Related Documentation:**
>
> - [Testing Guide](./testing-guide.md) - Comprehensive testing documentation and command reference
> - [Testing Troubleshooting](./testing-troubleshooting.md) - Solutions for common test issues
> - [Testing Coverage](./testing-coverage.md) - Coverage requirements and quality gates

## Quick Start

Run the interactive workflow orchestrator:

```bash
npm run workflow
```

This provides an interactive menu for all common development workflows.

## Available Workflow Scripts

### 1. Environment Health Check (`env:check`)

Validates that your development environment is properly configured.

```bash
npm run env:check
```

**Checks:**

- Node.js and npm versions
- Environment variables
- Supabase connection
- Redis connection
- Docker services
- SSL certificates
- Git configuration
- Dependencies installation
- Disk space

**Use when:**

- Setting up a new development machine
- Troubleshooting environment issues
- Before starting development after a break

### 2. Workflow Orchestrator (`workflow`)

Interactive CLI for common development workflows with task chaining and automation.

```bash
npm run workflow              # Interactive mode
npm run workflow --help       # Show available workflows
npm run workflow --workflow=dev-cycle  # Run specific workflow
```

**Available workflows:**

- **quick-start**: Set up development environment
- **dev-cycle**: Run lint, type-check, and tests
- **pre-commit**: Prepare code for commit
- **feature-start**: Begin new feature development
- **feature-complete**: Finish feature development
- **release-prep**: Prepare for release
- **troubleshoot**: Fix common issues

### 3. Dependency Health Check (`deps:health`)

Checks for outdated dependencies and security vulnerabilities.

```bash
npm run deps:health
```

**Features:**

- Lists outdated packages (major/minor/patch)
- Identifies security vulnerabilities by severity
- Provides update recommendations
- Warns about breaking changes

**Use when:**

- Weekly dependency maintenance
- Before releases
- After security alerts

### 4. Development Test Runner (`dev:test`)

Combines linting, type-checking, and testing in a single workflow. See [Testing Guide](./testing-guide.md#running-tests) for detailed test command documentation.

```bash
npm run dev:test              # Run all checks
npm run dev:validate          # Run with auto-fix and coverage
```

### 5. Test Runner (`test:runner`)

Smart test execution with various strategies. See [Testing Guide](./testing-guide.md#running-tests) for complete usage.

```bash
npm run test:runner           # Interactive mode
```

### 6. TDD Watch Mode (`test:watch:tdd`)

Continuous test runner for Test-Driven Development. See [Testing Guide](./testing-guide.md#running-tests) for details.

```bash
npm run test:watch:tdd
```

### 7. Pre-release Validation (`pre-release`)

Comprehensive validation before releases.

```bash
npm run pre-release
```

**Validates:**

- Environment health
- Security vulnerabilities
- Code linting
- Type checking
- Test suite
- Coverage thresholds
- Build process
- Documentation

**Output:**

- Validation report
- Release notes draft
- Go/no-go recommendation

## Common Development Workflows

### Starting a New Feature

```bash
# 1. Start workflow orchestrator
npm run workflow

# 2. Select "Feature Start"
# This will:
# - Update main branch
# - Create feature branch
# - Check environment health
```

### Daily Development Cycle

```bash
# 1. Check environment health
npm run env:check

# 2. Start TDD watch mode
npm run test:watch:tdd

# 3. Before committing
npm run dev:validate
```

### Preparing for Release

```bash
# 1. Check dependencies
npm run deps:health

# 2. Run pre-release validation
npm run pre-release

# 3. Generate coverage badges
npm run coverage:badge

# 4. Update documentation
```

### Troubleshooting Issues

```bash
# 1. Check environment
npm run env:check

# 2. Run workflow troubleshooter
npm run workflow
# Select "Troubleshoot"

# 3. Clean install if needed
rm -rf node_modules
npm install
```

## Best Practices

### 1. Start Each Day

```bash
# Check environment health
npm run env:check

# Pull latest changes
git pull

# Check dependencies
npm run deps:health
```

### 2. Before Committing

```bash
# Run validation
npm run dev:validate

# Check coverage
npm run quality:check
```

### 3. Weekly Maintenance

```bash
# Check for updates
npm run deps:health

# Update safe dependencies
npm update

# Run full test suite
npm run test:coverage
```

### 4. Before Release

```bash
# Full validation
npm run pre-release

# Generate reports
npm run coverage:aggregate
npm run coverage:badge
```

## Script Configuration

See [Testing Guide - Environment Configuration](./testing-guide.md#environment-configuration) for required environment variables and setup instructions.

## Troubleshooting

For solutions to common issues with workflow scripts, tests, and environment setup, see:

- [Testing Troubleshooting Guide](./testing-troubleshooting.md) - Comprehensive troubleshooting solutions
- [Testing Coverage](./testing-coverage.md#troubleshooting) - Coverage-specific issues

## Advanced Usage

### Creating Custom Workflows

1. Add workflow to `scripts/workflow.ts`:

```typescript
'custom-workflow': [
  {
    name: 'Step 1',
    command: 'npm run command1',
    description: 'Description',
  },
  // ... more steps
]
```

2. Run custom workflow:

```bash
npm run workflow -- --workflow=custom-workflow
```

### Extending Scripts

All scripts export classes that can be extended:

```typescript
import { EnvironmentHealthChecker } from './scripts/env-check';

class CustomChecker extends EnvironmentHealthChecker {
  // Add custom checks
}
```

## Script Dependencies

Required npm packages for workflow scripts:

```json
{
  "chalk": "^5.3.0", // Terminal colors
  "ora": "^8.0.1", // Spinners
  "inquirer": "^9.2.0", // Interactive prompts
  "semver": "^7.5.0", // Version parsing
  "dotenv": "^17.0.0" // Environment variables
}
```

## Summary

The development workflow scripts provide:

1. **Automation**: Reduce manual tasks and errors
2. **Consistency**: Ensure all developers follow same processes
3. **Quality**: Enforce standards before code reaches repository
4. **Efficiency**: Save time with task chaining and orchestration
5. **Visibility**: Clear feedback on environment and code health

Use `npm run workflow` as your starting point for an interactive development experience, or run specific scripts directly for targeted tasks.
