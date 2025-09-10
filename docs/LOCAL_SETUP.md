# Local Development Setup Guide

This guide provides step-by-step instructions for setting up the Aizen vNE development environment on your local machine, including platform-specific commands for Mac, Windows, and Linux.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** 20 LTS or higher
- **npm** 9.0 or higher
- **Docker Desktop** (Mac/Windows) or Docker Engine (Linux)
- **Git**
- **Redis** (optional, included in Docker setup)

## Quick Start (All Platforms)

```bash
# Clone the repository
git clone https://github.com/your-org/zen-support.git
cd zen-support

# Install dependencies
npm install

# Copy environment configuration
cp .env.local.example .env.local

# Start local Supabase (for database)
npm run test:supabase:start

# Start Docker services (Redis + Device Agent)
docker-compose up -d

# In separate terminals:
# Terminal 1 - Start API service
npm run dev:api

# Terminal 2 - Start Web portal
npm run dev:web
```

## Platform-Specific Setup

### macOS Setup

```bash
# Install Docker Desktop if not already installed
brew install --cask docker

# Verify Docker is running
docker --version
docker-compose --version

# Setup environment
cp .env.local.example .env.local

# Initialize local Supabase database
npm run test:supabase:init

# Start all services
docker-compose up -d  # Redis + Device Agent
npm run dev:api       # API on port 3001 (separate terminal)
npm run dev:web       # Web on port 3000 (separate terminal)

# Verify services are running
curl http://localhost:3001/health  # API health check
curl http://localhost:3000          # Web portal
curl http://localhost:3002/health  # Device Agent health
```

### Windows Setup

```powershell
# Install Docker Desktop from https://www.docker.com/products/docker-desktop

# Open PowerShell as Administrator

# Setup environment
copy .env.local.example .env.local

# Initialize local Supabase database
npm run test:supabase:init

# Start all services
docker-compose up -d  # Redis + Device Agent

# In separate terminals (use PowerShell or Command Prompt):
# Terminal 1
npm run dev:api  # API on port 3001

# Terminal 2
npm run dev:web  # Web on port 3000

# Verify services (PowerShell)
Invoke-WebRequest http://localhost:3001/health
Invoke-WebRequest http://localhost:3000
Invoke-WebRequest http://localhost:3002/health
```

### Linux Setup

```bash
# Install Docker Engine (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Add your user to docker group (logout/login required)
sudo usermod -aG docker $USER

# Setup environment
cp .env.local.example .env.local

# Initialize local Supabase database
npm run test:supabase:init

# IMPORTANT: Linux requires host.docker.internal mapping
# The docker-compose.yml already includes this configuration

# Start all services
docker-compose up -d  # Redis + Device Agent

# In separate terminals:
npm run dev:api  # API on port 3001
npm run dev:web  # Web on port 3000

# Verify services
curl http://localhost:3001/health  # API health check
curl http://localhost:3000          # Web portal
curl http://localhost:3002/health  # Device Agent health
```

#### Linux-Specific Network Configuration

On Linux, the `host.docker.internal` hostname doesn't work by default. The docker-compose.yml file includes the necessary configuration:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

If you need to run Docker commands manually, add this flag:
```bash
docker run --add-host=host.docker.internal:host-gateway ...
```

## Service Architecture

The local development environment uses a **hybrid approach**:

| Service | Location | Port | Description |
|---------|----------|------|-------------|
| API | Host (npm) | 3001 | Backend API with hot-reload |
| Web | Host (npm) | 3000 | Next.js portal with hot-reload |
| Redis | Docker | 6379 | Session storage & caching |
| Device Agent | Docker | 3002 | Simulated Raspberry Pi device |
| Supabase | Docker | 54321 | PostgreSQL database |

## Common Commands

### Starting Services

```bash
# Start everything (recommended order)
npm run test:supabase:start   # Start local database
docker-compose up -d           # Start Redis & Device Agent
npm run dev:api                # Start API (separate terminal)
npm run dev:web                # Start Web (separate terminal)

# Start individual Docker services
docker-compose up -d redis
docker-compose up -d device-agent

# Start with logs visible
docker-compose up  # Shows all logs (Ctrl+C to stop)
```

### Stopping Services

```bash
# Stop Docker services
docker-compose down

# Stop and remove volumes (full cleanup)
docker-compose down -v

# Stop local Supabase
npm run test:supabase:stop

# Stop API/Web (in their terminals)
Ctrl+C
```

### Viewing Logs

```bash
# All Docker logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f redis
docker-compose logs -f device-agent

# API logs (in the terminal running npm run dev:api)
# Web logs (in the terminal running npm run dev:web)
```

### Database Management

```bash
# Reset database and apply migrations
npm run test:supabase:reset

# Apply new migrations
npx supabase db push

# Access database directly
psql postgresql://postgres:postgres@localhost:54322/postgres

# Generate TypeScript types from database
npm run generate:types
```

### Testing

```bash
# Run all tests
npm test

# Run integration tests (requires services running)
npm test -- packages/api/src/integration-tests

# Run specific test file
npm test -- device-e2e.integration.test.ts

# Run with coverage
npm run test:coverage
```

### Device Agent Management

```bash
# Rebuild device agent after code changes
docker-compose build device-agent
docker-compose up -d device-agent

# View device agent health
curl http://localhost:3002/health

# Access device agent logs
docker-compose logs -f device-agent

# Run multiple device agents (for testing)
docker-compose up -d --scale device-agent=3
```

### Redis Management

```bash
# Access Redis CLI
docker exec -it aizen-redis-dev redis-cli

# Common Redis commands
redis-cli ping
redis-cli keys '*'
redis-cli get session:token
redis-cli flushall  # Clear all data
```

## Seeding Test Data

The system comes with pre-configured test devices. To seed additional test data:

```bash
# Seed test devices (run after database is up)
npm run seed:device

# The following test devices are available by default:
# Device 1: ID=test-device-001, Secret=test-secret-001
# Device 2: ID=test-device-002, Secret=test-secret-002

# You can also add custom devices via SQL
psql postgresql://postgres:postgres@localhost:54322/postgres << EOF
INSERT INTO devices (id, customer_id, name, device_secret_hash, status)
VALUES (
  'custom-device-001',
  'test-customer-001',
  'Custom Test Device',
  SHA256('custom-secret'),
  'offline'
);
EOF
```

## Environment Variables

Key environment variables for local development:

```bash
# Device Agent (Docker)
DEVICE_ID=dev-device-001
DEVICE_SECRET=dev-secret-key
API_URL=http://host.docker.internal:3001

# API Service (Host)
API_PORT=3001
REDIS_URL=redis://localhost:6379
SUPABASE_URL=http://localhost:54321

# Web Service (Host)
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

See `.env.local.example` for complete configuration options.

## Troubleshooting

### Port Conflicts

If you get port already in use errors:

```bash
# Find process using port (Mac/Linux)
lsof -i :3000
lsof -i :3001
lsof -i :6379

# Find process using port (Windows)
netstat -ano | findstr :3000
netstat -ano | findstr :3001
netstat -ano | findstr :6379

# Kill process (Mac/Linux)
kill -9 <PID>

# Kill process (Windows)
taskkill /PID <PID> /F
```

### Docker Issues

```bash
# Reset Docker completely
docker-compose down -v
docker system prune -a

# Check Docker daemon status
docker ps

# Restart Docker Desktop (Mac/Windows)
# Use Docker Desktop UI

# Restart Docker (Linux)
sudo systemctl restart docker
```

### Connection Issues

```bash
# Verify all services are running
docker-compose ps
curl http://localhost:3001/health
curl http://localhost:3000
curl http://localhost:3002/health

# Check Docker network
docker network ls
docker network inspect zen-support_aizen-dev

# Test Redis connection
redis-cli -h localhost -p 6379 ping
```

### Database Issues

```bash
# Reset database completely
npm run test:supabase:stop
npm run test:supabase:reset
npm run test:supabase:init

# Check database connection
psql postgresql://postgres:postgres@localhost:54322/postgres -c "SELECT 1"

# View database logs
docker logs supabase-db
```

## Development Workflow

1. **Start Services**: Follow the quick start guide above
2. **Make Changes**: Edit code in your IDE
3. **Hot Reload**: API and Web services auto-reload on changes
4. **Device Agent Changes**: Rebuild and restart the container
5. **Test**: Run tests to verify changes
6. **Commit**: Use conventional commits (e.g., `feat:`, `fix:`)

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Supabase Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Redis Documentation](https://redis.io/documentation)
- [Next.js Development](https://nextjs.org/docs)
- [Fastify Documentation](https://www.fastify.io/docs/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs for error messages
3. Search existing GitHub issues
4. Create a new issue with detailed information

---

Last updated: 2025-09-10