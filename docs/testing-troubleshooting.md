# Testing Troubleshooting Guide

> **Related Documentation:**
>
> - [Testing Guide](./testing-guide.md) - Main testing documentation and commands
> - [Development Workflows](./development-workflows.md) - Automated workflow scripts
> - [Testing Coverage](./testing-coverage.md) - Coverage requirements and quality gates

## Common Issues and Solutions

### 1. Supabase Won't Start

#### Problem: "No such container: supabase_db_zen-support"

**Solution:**

```bash
# Stop any partial containers
npx supabase stop

# Clean Docker volumes if needed
docker system prune -a --volumes

# Start fresh
npx supabase start
```

#### Problem: Supabase takes too long to start

**Cause:** First-time Docker image downloads
**Solution:**

- Be patient on first run (can take 5-10 minutes)
- Check your internet connection
- Monitor progress with: `docker images | grep supabase`

### 2. Seed Data Errors

#### Problem: "invalid input syntax for type uuid"

**Cause:** Invalid UUID format in seed files
**Solution:**

- UUIDs must start with hex characters (0-9, a-f)
- Invalid: `s1111111-1111-1111-1111-111111111111`
- Valid: `e1111111-1111-1111-1111-111111111111`

#### Problem: "violates foreign key constraint"

**Cause:** Referencing non-existent records
**Solution:**

- Create auth users before inserting into users table
- Ensure parent records exist before children
- Check migration order

#### Problem: "column does not exist"

**Cause:** Mismatch between seed file and schema
**Solution:**

- Review the table schema in migrations
- Update seed files to match actual columns
- Run `npx supabase db reset` to start fresh

### 3. Test Failures

#### Problem: "Cannot read properties of undefined"

**Cause:** Mock setup issues or missing implementations
**Solution:**

```typescript
// Ensure mocks are set up before imports
vi.mock('redis');
import { redisClient } from './redis-client';
```

#### Problem: "function is not a function"

**Cause:** Function not exported or not implemented
**Solution:**

- Check that functions are exported from modules
- Verify implementation exists
- Update test imports

### 4. Connection Issues

#### Problem: Can't connect to Supabase

**Solution:**

```bash
# Check if Supabase is running
npx supabase status

# Verify ports are available
lsof -i :54321  # API
lsof -i :54322  # PostgreSQL

# Check Docker is running
docker ps
```

#### Problem: Redis connection failed

**Solution:**

```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connection
redis-cli -p 6379 ping
```

### 5. Environment Variable Issues

#### Problem: Environment variables not loading

**Solution:**

```bash
# Ensure .env.test exists
cp .env.test.example .env.test

# Check file is being loaded
npm test -- --reporter=verbose
```

#### Problem: Wrong environment values

**Solution:**

- Check vitest.config.ts for hardcoded values
- Verify .env.test has correct values
- Use `console.log(process.env)` to debug

### 6. Docker Issues

#### Problem: "Cannot connect to Docker daemon"

**Solution:**

```bash
# Start Docker Desktop (macOS/Windows)
open -a Docker  # macOS

# Linux: Start Docker service
sudo systemctl start docker
```

#### Problem: Out of disk space

**Solution:**

```bash
# Clean up Docker
docker system prune -a --volumes

# Remove unused images
docker image prune -a

# Check disk usage
docker system df
```

### 7. Port Conflicts

#### Problem: "Port already in use"

**Solution:**

```bash
# Find process using port
lsof -i :54321

# Kill process (use PID from above)
kill -9 <PID>

# Or change ports in supabase/config.toml
```

### 8. Migration Issues

#### Problem: Migrations fail to apply

**Solution:**

```bash
# Reset database completely
npx supabase db reset

# Apply migrations manually
npx supabase db push

# Check migration status
npx supabase migration list
```

### 9. Authentication Issues

#### Problem: Can't create test users

**Cause:** Users table references auth.users
**Solution:**

1. Create auth users first via Supabase Auth
2. Then insert into users table with matching IDs
3. Or use triggers to auto-create user records

### 10. Performance Issues

#### Problem: Tests run slowly

**Solution:**

See [Testing Guide - Advanced Test Commands](./testing-guide.md#advanced-test-commands) for optimized test runners.

```bash
# Use intelligent test runner for affected files only
npm run test:runner -- --mode affected

# Use TDD watch mode for development
npm run test:watch:tdd

# Run tests in parallel
npm test -- --pool=forks
```

### 11. Quality Gates Issues

See [Testing Coverage Documentation](./testing-coverage.md) for detailed coverage requirements and troubleshooting.

#### Problem: Pre-push hook fails with coverage errors

**Solution:**

```bash
# Check current coverage status
npm run quality:check

# View detailed coverage report
npm run coverage:view

# Fix failing areas and verify
npm run dev:validate
```

#### Problem: Quality gates fail but coverage looks fine

See [Testing Coverage - Troubleshooting](./testing-coverage.md#troubleshooting) for detailed solutions.

### 12. Test Data Management Issues

For detailed test data management documentation, see [Testing Guide - Test Data Management](./testing-guide.md#test-data-management).

#### Problem: Seed data generation fails

**Solution:**

```bash
# Verify Supabase is running
npm run test:supabase:status

# Try minimal seed strategy first
npm run seed:test -- --strategy minimal --force
```

#### Problem: Database cleanup fails

**Solution:**

```bash
# Use verify mode to see what would be deleted
npm run cleanup:test -- --mode verify

# Use transaction mode for safer cleanup
npm run cleanup:test -- --mode transaction --force
```

#### Problem: Snapshot operations fail

**Solution:**

```bash
# Verify PostgreSQL client tools
psql --version

# Use data-only reset if snapshots fail
npm run reset:test-db -- --mode data
```

### 13. Development Workflow Script Issues

See [Development Workflows Documentation](./development-workflows.md) for complete workflow script documentation.

#### Problem: TDD watch mode not detecting file changes

**Solution:**

```bash
# Check Node.js version (should be 20 LTS)
node --version

# Clear cached file watchers
npm run clean:cache

# Check if chokidar dependency is installed
npm ls chokidar
```

#### Problem: Dev validation pipeline fails

**Solution:**

```bash
# Run individual steps to isolate issue
npm run lint
npm run type-check
npm run test

# Use environment checker
npm run env:check
```

## Debugging Commands

### Check Supabase Status

```bash
npx supabase status
docker ps | grep supabase
npm run test:supabase:status
```

### View Supabase Logs

```bash
npx supabase logs --tail 100
docker logs supabase_db_zen-support
```

### Quality and Coverage Debugging

See [Testing Coverage](./testing-coverage.md) for detailed coverage debugging information.

```bash
# Check quality gates status
npm run quality:check

# View coverage report in browser
npm run coverage:view
```

### Development Workflow Debugging

See [Development Workflows](./development-workflows.md) for workflow debugging information.

```bash
# Check environment health
npm run env:check

# Run workflow orchestrator
npm run workflow

# Validate entire pipeline
npm run dev:validate
```

### Reset Everything

```bash
# Stop all services
npx supabase stop
docker-compose down -v

# Clean Docker
docker system prune -a --volumes

# Reset test database completely
npm run reset:test-db -- --mode full

# Start fresh
npm run test:supabase:init
```

### Test Database Connection

```bash
# Connect to PostgreSQL
psql postgresql://postgres:postgres@localhost:54322/postgres

# Test query
SELECT * FROM customers LIMIT 1;
```

## Getting Help

If you encounter issues not covered here:

1. Check Supabase logs: `npx supabase logs`
2. Review Docker logs: `docker logs <container_name>`
3. Enable debug mode: `npx supabase start --debug`
4. Check GitHub issues for similar problems
5. Ask in the project's issue tracker

## Prevention Tips

1. **Always stop Supabase properly**: Use `npx supabase stop`
2. **Keep Docker updated**: Ensure Docker Desktop is current
3. **Monitor disk space**: Docker can use significant space
4. **Use consistent Node version**: Stick to Node 20 LTS
5. **Regular cleanup**: Run `docker system prune` weekly
6. **Check ports before starting**: Ensure ports 54321-54330 are free
7. **Validate seed data**: Test SQL files before committing
8. **Use TDD workflow**: Start development with `npm run test:watch:tdd`
9. **Run quality gates**: Let pre-push hooks catch issues early
10. **Clean test data regularly**: Use `npm run cleanup:test -- --mode verify` to monitor
11. **Create snapshots**: Use `npm run reset:test-db -- --mode snapshot` for clean states
12. **Validate before commits**: Use `npm run dev:validate` to catch issues early
13. **Monitor coverage trends**: Check `npm run quality:check` regularly
14. **Document changes**: Update this guide when finding new issues

---

For more information, see:

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Vitest Documentation](https://vitest.dev/)
- [Docker Troubleshooting](https://docs.docker.com/config/troubleshoot/)
