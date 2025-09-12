#!/usr/bin/env node

/**
 * Seed script to create a test device for local development
 * Run with: npx tsx packages/api/src/scripts/seed-test-device.ts
 */

import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

import {
  initializeRedis,
  getRedisClient,
} from '@aizen/shared/utils/redis-client';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function seedTestDevice(): Promise<void> {
  console.log('🔧 Seeding test device for local development...\n');

  // Check environment variables
  if (!process.env.SUPABASE_URL) {
    console.error('❌ SUPABASE_URL not found in environment variables');
    process.exit(1);
  }

  if (
    !process.env.SUPABASE_SERVICE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      '❌ SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY not found in environment variables'
    );
    process.exit(1);
  }

  // Set SUPABASE_SERVICE_KEY from SUPABASE_SERVICE_ROLE_KEY if needed
  if (
    !process.env.SUPABASE_SERVICE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Import after env vars are loaded
  const { supabaseAdmin } = await import('@aizen/shared');

  const TEST_DEVICE_ID = 'test-device-001';
  const TEST_DEVICE_SECRET = 'test-secret-12345';
  const TEST_CUSTOMER_ID = '00000000-0000-0000-0000-000000000001'; // Valid UUID for testing

  try {
    // Check if test customer exists, create if not
    console.log('1. Checking for test customer...');
    const { data: existingCustomer } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .eq('id', TEST_CUSTOMER_ID)
      .single();

    if (!existingCustomer) {
      console.log('   Creating test customer...');

      const { error: customerError } = await supabaseAdmin
        .from('customers')
        .insert({
          id: TEST_CUSTOMER_ID,
          name: 'Test Company',
          email: 'test@example.com',
          phone: '+15555551234',
          subscription_tier: 'basic',
          is_active: true,
          metadata: { company: 'Test Company Inc.' },
        });

      if (customerError) {
        console.error(
          '   ❌ Failed to create test customer:',

          customerError.message
        );
        process.exit(1);
      }
      console.log('   ✅ Test customer created');
    } else {
      console.log('   ✅ Test customer already exists');
    }

    // Check if test device exists
    console.log('\n2. Checking for test device...');
    const { data: existingDevice } = await supabaseAdmin
      .from('devices')
      .select('id, device_id, name, status')
      .eq('device_id', TEST_DEVICE_ID)
      .single();

    if (existingDevice) {
      console.log('   ⚠️  Test device already exists');
      console.log('   Updating device status...');

      const { error: updateError } = await supabaseAdmin
        .from('devices')
        .update({
          status: 'offline',
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq('device_id', TEST_DEVICE_ID);

      if (updateError) {
        console.error('   ❌ Failed to update device:', updateError.message);
        process.exit(1);
      }
      console.log('   ✅ Device updated');
    } else {
      console.log('   Creating test device...');

      const { error: deviceError } = await supabaseAdmin
        .from('devices')
        .insert({
          device_id: TEST_DEVICE_ID,
          customer_id: TEST_CUSTOMER_ID,
          name: 'Test Device',
          status: 'offline',
          network_info: {
            model: 'Raspberry Pi 4B',
            serial: 'TEST-SERIAL-001',
            firmware: '1.0.0',
          },
        });

      if (deviceError) {
        console.error(
          '   ❌ Failed to create test device:',

          deviceError.message
        );
        process.exit(1);
      }
      console.log('   ✅ Test device created');
    }

    // Store secret hash in Redis (used by auth validation)
    console.log('\n3. Storing device secret in Redis...');
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

    const redis = initializeRedis({ host: redisHost, port: redisPort });
    await redis.connect();

    const hashedSecret = createHash('sha256')
      .update(TEST_DEVICE_SECRET)
      .digest('hex');

    const redisKey = `device:secret:sha256:${TEST_DEVICE_ID}`;
    await getRedisClient().getClient().set(redisKey, hashedSecret);
    console.log('   ✅ Secret stored under key:', redisKey);

    console.log('\n✨ Test device seeded successfully!\n');
    console.log('📋 Device Credentials:');
    console.log('   Device ID:     ', TEST_DEVICE_ID);
    console.log('   Device Secret: ', TEST_DEVICE_SECRET);
    console.log('   Customer ID:   ', TEST_CUSTOMER_ID);
    console.log('\n💡 Usage:');
    console.log(
      '   Use these credentials in the Device Agent environment variables:'
    );
    console.log(`   DEVICE_ID=${TEST_DEVICE_ID}`);
    console.log(`   DEVICE_SECRET=${TEST_DEVICE_SECRET}`);
    console.log('\n🔐 Authentication:');
    console.log('   POST /api/v1/device/auth');
    console.log(
      `   Body: { "deviceId": "${TEST_DEVICE_ID}", "deviceSecret": "${
        TEST_DEVICE_SECRET
      }" }`
    );
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the seed script
void seedTestDevice();
