# API Scripts

## Device Seeding Script

### seed-test-device.ts

Seeds a test device for local development and testing.

**Usage:**

```bash
# From the API package directory
npm run seed:device

# Or from project root
cd packages/api && npm run seed:device

# Or directly with tsx
npx tsx packages/api/src/scripts/seed-test-device.ts
```

**What it does:**

1. Creates a test customer if not exists (ID: `test-customer-001`)
2. Creates or updates a test device (ID: `test-device-001`)
3. Sets a known device secret for authentication (`test-secret-12345`)
4. Generates an activation code for alternative registration

**Output:**

The script will output the credentials needed for testing:
- Device ID and Secret for direct authentication
- Activation code for registration flow
- Example API calls for authentication

**Environment Requirements:**

Requires the following environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These should be configured in your `.env` file at the project root.

**Testing Authentication:**

After running the seed script, you can test authentication with:

```bash
curl -X POST http://localhost:3001/api/v1/device/auth \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "test-device-001", "deviceSecret": "test-secret-12345"}'
```

This will return a session token that can be used for subsequent API calls.