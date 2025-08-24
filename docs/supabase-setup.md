# Supabase Setup Documentation

## Overview

This document describes the Supabase setup for the Zen & Zen Network Support (Aizen vNE) project. Our Supabase instance provides:

- PostgreSQL database with Row Level Security (RLS)
- Authentication via Email OTP
- Real-time subscriptions
- Secure multi-tenant data isolation

## Project Details

- **Project Name**: zen-support
- **Project URL**: https://cgesudxbpqocqwixecdx.supabase.co
- **Database**: PostgreSQL 15
- **Authentication**: Email OTP (Magic Links)

## Environment Variables

The following environment variables are required in your `.env` file at the project root:

```bash
# Supabase Configuration
SUPABASE_URL=https://cgesudxbpqocqwixecdx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here  # Backend only - DO NOT expose to client
DATABASE_URL=postgresql://postgres:password@db.cgesudxbpqocqwixecdx.supabase.co:5432/postgres
```

## Database Schema

### Core Tables

1. **customers** - Customer organizations
   - `id` (UUID, Primary Key)
   - `name` (Text, Required)
   - `email` (Text, Unique)
   - `subscription_tier` (Text)
   - `is_active` (Boolean)

2. **users** - System users linked to customers
   - `id` (UUID, Primary Key, references auth.users)
   - `customer_id` (UUID, Foreign Key to customers)
   - `full_name` (Text)
   - `phone` (Text)
   - `role` (Text: admin, technician, viewer)

3. **devices** - Network devices per customer
   - `id` (UUID, Primary Key)
   - `customer_id` (UUID, Foreign Key)
   - `device_id` (Text, Hardware ID)
   - `status` (Enum: online, offline, error, maintenance)
   - `network_info` (JSONB)
   - `configuration` (JSONB)

4. **diagnostic_sessions** - Network diagnostic sessions
   - `id` (UUID, Primary Key)
   - `customer_id` (UUID, Foreign Key)
   - `device_id` (UUID, Foreign Key)
   - `status` (Enum: pending, in_progress, completed, failed)
   - `diagnostic_data` (JSONB)
   - `ai_analysis` (JSONB)

5. **remediation_actions** - Remediation scripts and actions
   - `id` (UUID, Primary Key)
   - `session_id` (UUID, Foreign Key)
   - `action_type` (Text)
   - `risk_level` (Text: low, medium, high, critical)
   - `status` (Enum: pending, approved, rejected, executed, failed)

6. **audit_logs** - Comprehensive audit trail
   - `id` (UUID, Primary Key)
   - `customer_id` (UUID, Foreign Key)
   - `action` (Enum: create, read, update, delete, authenticate, approve, reject)
   - `resource_type` (Text)
   - `details` (JSONB)

7. **network_diagnostics** - Network test results
   - `id` (UUID, Primary Key)
   - `device_id` (UUID, Foreign Key)
   - `diagnostic_type` (Text)
   - `result` (JSONB)
   - `is_anomaly` (Boolean)

8. **alerts** - System alerts
   - `id` (UUID, Primary Key)
   - `customer_id` (UUID, Foreign Key)
   - `alert_type` (Text)
   - `severity` (Text: info, warning, error, critical)
   - `is_resolved` (Boolean)

### Database Enums

- `device_status`: online | offline | error | maintenance
- `diagnostic_status`: pending | in_progress | completed | failed
- `remediation_status`: pending | approved | rejected | executed | failed
- `audit_action`: create | read | update | delete | authenticate | approve | reject

## Row Level Security (RLS)

All tables have RLS enabled to ensure multi-tenant data isolation:

### Key RLS Policies

1. **Customer Isolation**: Users can only access data from their own customer organization
2. **Role-Based Access**: Different permissions for admin, technician, and viewer roles
3. **Service Role Bypass**: Backend services using the service key bypass RLS for administrative tasks

### Helper Functions

- `get_user_customer_id()`: Returns the current user's customer_id
- `is_admin()`: Checks if the current user has admin role
- `has_role(role)`: Checks if the user has a specific role

## Authentication Flow

1. **Email OTP Sign-In**:

   ```typescript
   import { auth } from '@aizen/shared';

   // Request OTP
   await auth.signInWithOTP('user@example.com');

   // Verify OTP
   await auth.verifyOTP('user@example.com', '123456');
   ```

2. **Session Management**:
   - Sessions auto-refresh when using the client
   - Session data stored in secure httpOnly cookies
   - Backend validates sessions using Supabase JWT

## Real-Time Subscriptions

Subscribe to database changes for live updates:

```typescript
import { realtime } from '@aizen/shared';

// Subscribe to device status changes
const channel = realtime.subscribeToDeviceStatus(customerId, payload => {
  console.log('Device updated:', payload);
});

// Unsubscribe when done
realtime.unsubscribe(channel);
```

Available subscriptions:

- Device status changes
- Diagnostic session updates
- New alerts

## Performance Optimizations

### Indexes

All foreign keys and commonly queried fields are indexed:

- Customer lookups
- Device status queries
- Session filtering by status
- Alert severity filtering
- Audit log searches

### Database Functions

- `analyze_table_health()`: Monitors table sizes and maintenance needs

## Development Workflow

### Running Migrations

Migrations are managed via the Supabase MCP server:

```typescript
// Apply a new migration
await supabase.applyMigration({
  name: '005_new_feature',
  query: 'CREATE TABLE ...',
});
```

### Testing Connection

Run the test script to verify database connectivity:

```bash
npx tsx packages/api/src/test-supabase.ts
```

This tests:

1. Anonymous connection
2. Service role connection
3. Auth functionality
4. Database functions
5. Real-time subscriptions

### TypeScript Types

Database types are auto-generated from the schema:

```typescript
import type { Database, Customer, Device } from '@aizen/shared';

// Types are fully typed based on actual database schema
const customer: Customer = {
  id: '...',
  name: 'Acme Corp',
  email: 'admin@acme.com',
  // ...
};
```

To regenerate types after schema changes:

```bash
npm run generate:types
```

## Security Best Practices

1. **Never expose service keys**: Only use `SUPABASE_SERVICE_KEY` on the backend
2. **Use RLS policies**: All tables must have appropriate RLS policies
3. **Validate user input**: Always sanitize and validate data before database operations
4. **Audit logging**: All state changes are logged to audit_logs table
5. **Secure connections**: All database connections use SSL/TLS

## Monitoring & Maintenance

### Health Checks

Monitor database health using the `analyze_table_health()` function:

```typescript
const health = await supabaseAdmin.rpc('analyze_table_health');
// Returns table sizes, row counts, and maintenance recommendations
```

### Common Queries

```sql
-- Active devices per customer
SELECT customer_id, COUNT(*) as device_count
FROM devices
WHERE status = 'online'
GROUP BY customer_id;

-- Recent diagnostic sessions
SELECT * FROM diagnostic_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Pending remediation actions
SELECT * FROM remediation_actions
WHERE status = 'pending'
ORDER BY created_at ASC;
```

## Troubleshooting

### Common Issues

1. **"Missing Supabase environment variables"**
   - Ensure `.env` file exists in project root
   - Check that all required variables are set

2. **"Permission denied for table"**
   - Check RLS policies for the table
   - Ensure user has appropriate role
   - Use service key for administrative operations

3. **"Real-time subscription failed"**
   - Check network connectivity
   - Verify Supabase project is not paused
   - Ensure correct channel filters

### Debug Mode

Enable debug logging for Supabase client:

```typescript
const supabase = createClient(url, key, {
  auth: {
    debug: true,
  },
});
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL RLS Guide](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- Project Dashboard: https://app.supabase.com/project/cgesudxbpqocqwixecdx
