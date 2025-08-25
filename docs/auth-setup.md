# Authentication Setup Documentation

## Overview

This document describes the authentication setup for the Zen & Zen Network Support system. The authentication is built on Supabase Auth with Email OTP and integrated with Redis for session management.

## Current Status (Phase 100.2.3)

### ✅ Completed

- Supabase Auth configuration with Email OTP
- Database schema with users table and RLS policies
- Redis session management implementation
- Test scripts for Redis functionality
- Seed data for test customers and devices
- Authentication helper functions in shared package

### 🔄 Deferred to POC Completion

- Full Email OTP flow testing (requires email provider setup)
- User registration workflow
- Production-ready session management

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  Supabase    │────▶│   Redis     │
│  (Browser)  │     │    Auth      │     │  Sessions   │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    │   (users)    │
                    └──────────────┘
```

## Components

### 1. Supabase Authentication

- **Method**: Email OTP (One-Time Password)
- **Configuration**: Located in `supabase/migrations/003_auth_configuration.sql`
- **Helper Functions**: `packages/shared/src/lib/supabase.ts`

### 2. Database Schema

#### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### User Roles

- `super_admin`: Full system access
- `admin`: Customer-level admin
- `operator`: Can execute remediation actions
- `viewer`: Read-only access

### 3. Redis Session Management

**Configuration**: `infrastructure/docker/redis.conf`

- Session TTL: 24 hours (default)
- Cache eviction: allkeys-lru
- Persistence: AOF enabled

**Client Implementation**: `packages/shared/src/utils/redis-client.ts`

- Session storage/retrieval
- Cache management
- Pub/Sub support

### 4. Row-Level Security (RLS)

All tables have RLS policies enforcing multi-tenant isolation:

- Users can only access data from their customer
- Admins have broader access within their customer
- Super admins have full access

## Test Scripts

### Redis Session Test

```bash
npx tsx scripts/test-redis-session.ts
```

Tests:

- Redis connectivity
- Session storage/retrieval
- TTL management
- Cache functionality
- Pub/Sub messaging

### Email OTP Test (Partial)

```bash
npx tsx scripts/test-email-otp.ts
```

Tests:

- OTP request sending
- Redis session integration
- Sign out functionality

**Note**: Full OTP verification requires manual testing via Supabase dashboard.

## Test Data

### Seeded Customers

1. **Acme Corp** (ID: 11111111-1111-1111-1111-111111111111)
   - Subscription: Premium
   - Industry: Technology
2. **TechStart Inc** (ID: 22222222-2222-2222-2222-222222222222)
   - Subscription: Standard
   - Industry: Software
3. **Global Retail Co** (ID: 33333333-3333-3333-3333-333333333333)
   - Subscription: Enterprise
   - Industry: Retail

### Test Devices

- DEV-ACME-001 (Acme Corp)
- DEV-TECH-001 (TechStart Inc)
- DEV-RETAIL-001 (Global Retail Co)

## Environment Variables

Required in `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...
```

## Usage Examples

### Initialize Authentication

```typescript
import { auth } from '@aizen/shared';

// Request OTP
const { data, error } = await auth.signInWithOTP('user@example.com');

// Verify OTP (requires actual code from email)
const { data: session } = await auth.verifyOTP('user@example.com', '123456');

// Get current session
const { data: currentSession } = await auth.getSession();

// Sign out
await auth.signOut();
```

### Redis Session Management

```typescript
import { getRedisClient, initializeRedis } from '@aizen/shared';

// Initialize
await initializeRedis({ host: 'localhost', port: 6379 });
const redis = getRedisClient();

// Store session
await redis.setSession(sessionId, userData, 3600);

// Retrieve session
const session = await redis.getSession(sessionId);

// Extend session
await redis.extendSession(sessionId, 7200);

// Delete session
await redis.deleteSession(sessionId);
```

## Security Considerations

1. **Multi-tenant Isolation**: RLS policies ensure data separation
2. **Session Security**: Redis sessions expire after 24 hours
3. **OTP Security**: 6-digit codes expire after 10 minutes
4. **Service Key**: Only used for admin operations, never exposed to client
5. **HTTPS Only**: All auth operations require secure connections

## Next Steps (Post-POC)

1. **Email Provider Integration**
   - Configure SMTP or email service (SendGrid, AWS SES)
   - Enable production OTP delivery
2. **Enhanced Session Management**
   - Implement refresh token rotation
   - Add session fingerprinting
   - Device tracking
3. **MFA Support**
   - Add SMS OTP as secondary factor
   - Support for authenticator apps
4. **Audit Logging**
   - Track all authentication events
   - Failed login monitoring
   - Suspicious activity detection

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Ensure Redis container is running: `docker ps | grep redis`
   - Check port 6379 is not in use: `lsof -i :6379`

2. **OTP Not Received**
   - Check Supabase dashboard > Authentication > Logs
   - In development, OTP codes appear in logs, not email

3. **RLS Policy Errors**
   - Verify user has correct role in users table
   - Check customer_id matches between user and data

4. **Session Expired**
   - Default TTL is 24 hours
   - Use `extendSession()` to refresh

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Redis Session Management](https://redis.io/docs/manual/patterns/session-store/)
- [RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
