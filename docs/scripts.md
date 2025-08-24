# NPM Scripts Documentation

This document describes all available npm scripts in the Aizen vNE project.

## Quick Start

```bash
# Initial setup
npm run setup:env     # Copy environment variables template
npm run setup         # Install dependencies and prepare git hooks

# Start development
npm run dev:docker    # Start Docker services (Redis + placeholder apps)
npm run dev           # Start all packages in development mode
```

## Development Scripts

### Running Services

| Command                    | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `npm run dev`              | Start all packages in development mode with hot-reload |
| `npm run dev:api`          | Start only the API Gateway service                     |
| `npm run dev:web`          | Start only the Web Portal                              |
| `npm run dev:device`       | Start only the Device Agent simulator                  |
| `npm run dev:ai`           | Start only the AI Orchestrator service                 |
| `npm run dev:docker`       | Start Docker Compose stack (Redis + services)          |
| `npm run dev:docker:build` | Build Docker images for all services                   |
| `npm run dev:docker:down`  | Stop and remove Docker containers                      |

### Building

| Command                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `npm run build`          | Build all packages for production              |
| `npm run build:affected` | Build only packages affected by recent changes |
| `npm run build:docker`   | Build Docker images with no cache              |

## Testing Scripts

### Test Execution

| Command                    | Description                     |
| -------------------------- | ------------------------------- |
| `npm run test`             | Run all tests                   |
| `npm run test:affected`    | Test only affected packages     |
| `npm run test:unit`        | Run unit tests only             |
| `npm run test:integration` | Run integration tests only      |
| `npm run test:e2e`         | Run end-to-end tests            |
| `npm run test:watch`       | Run tests in watch mode         |
| `npm run test:coverage`    | Generate test coverage reports  |
| `npm run test:docker`      | Run tests in Docker environment |

## Code Quality Scripts

### Linting & Formatting

| Command                 | Description                     |
| ----------------------- | ------------------------------- |
| `npm run lint`          | Check code with ESLint          |
| `npm run lint:fix`      | Auto-fix ESLint issues          |
| `npm run lint:affected` | Lint only affected files        |
| `npm run type-check`    | Run TypeScript type checking    |
| `npm run format`        | Format code with Prettier       |
| `npm run format:check`  | Check if code is formatted      |
| `npm run format:all`    | Format all files in the project |

## Dependency Management

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `npm run deps:check`  | Check for outdated dependencies   |
| `npm run deps:update` | Update all dependencies           |
| `npm run audit`       | Security audit of dependencies    |
| `npm run audit:fix`   | Auto-fix security vulnerabilities |

## Utility Scripts

### Project Maintenance

| Command               | Description                            |
| --------------------- | -------------------------------------- |
| `npm run graph`       | Visualize project dependency graph     |
| `npm run affected`    | Show affected projects graph           |
| `npm run clean`       | Clean build artifacts and node_modules |
| `npm run clean:cache` | Clear Nx cache                         |
| `npm run clean:full`  | Complete cleanup including .nx folder  |
| `npm run reset`       | Full reset and reinstall               |

## CI/CD Scripts

### Continuous Integration

| Command               | Description                        |
| --------------------- | ---------------------------------- |
| `npm run ci:test`     | Run linting, type-check, and tests |
| `npm run ci:build`    | Build for production               |
| `npm run ci:validate` | Complete CI validation pipeline    |

## Supabase Scripts

### Database Management

| Command                    | Description                           |
| -------------------------- | ------------------------------------- |
| `npm run supabase:link`    | Link to Supabase project              |
| `npm run supabase:migrate` | Push database migrations              |
| `npm run supabase:seed`    | Seed database with test data          |
| `npm run supabase:types`   | Generate TypeScript types from schema |

**Note**: Requires `SUPABASE_PROJECT_ID` environment variable

## Setup Scripts

### Initial Configuration

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `npm run setup`     | Complete initial setup                |
| `npm run setup:env` | Copy environment template             |
| `npm run prepare`   | Set up Git hooks (runs automatically) |

## Common Workflows

### Starting Fresh Development

```bash
# 1. Clone repository
git clone <repo-url>
cd zen-support

# 2. Initial setup
npm run setup:env
npm run setup

# 3. Configure environment
# Edit infrastructure/docker/.env with your Supabase credentials

# 4. Start development
npm run dev:docker
npm run dev
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in Docker
npm run test:docker
```

### Before Committing

```bash
# Check code quality
npm run lint
npm run type-check
npm run format:check

# Fix issues
npm run lint:fix
npm run format
```

### Cleaning Up

```bash
# Quick clean
npm run clean

# Full reset
npm run reset
```

## Environment Variables

Scripts that interact with external services require environment variables:

- **Docker scripts**: Use `.env` file in `infrastructure/docker/`
- **Supabase scripts**: Require `SUPABASE_PROJECT_ID` and credentials
- **Development scripts**: Use package-specific `.env` files

## Tips

1. **Use affected commands** when working on specific features to save time
2. **Run `npm run ci:validate` before pushing** to ensure CI will pass
3. **Use `npm run dev:docker` first** to start required services
4. **Check `npm run graph`** to understand project dependencies
5. **Run `npm run audit` regularly** to check for security issues

## Troubleshooting

### Scripts not working?

1. Ensure Node.js 20+ is installed: `node --version`
2. Clear cache: `npm run clean:cache`
3. Reset completely: `npm run reset`
4. Check Docker is running for Docker-related scripts

### Permission errors?

- On Unix systems, you may need to use `sudo` for Docker commands
- Ensure you have write permissions in the project directory

### Environment issues?

- Copy `.env.example` to `.env`: `npm run setup:env`
- Verify all required environment variables are set
- Check Docker Compose logs: `docker-compose logs`
