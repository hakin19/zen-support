#!/usr/bin/env node
/**
 * Debug test for device authentication
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createHash } from 'crypto';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Set SUPABASE_SERVICE_KEY from SUPABASE_SERVICE_ROLE_KEY if needed
if (
  !process.env.SUPABASE_SERVICE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Set to local Supabase for testing
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function debugAuth(): Promise<void> {
  console.log('🔍 Debugging device authentication...\n');

  // Import and initialize Supabase
  const { initializeSupabase, getSupabaseAdminClient } = await import(
    '@aizen/shared/utils/supabase-client'
  );

  initializeSupabase({
    url: process.env.SUPABASE_URL!,
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    serviceRoleKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  const TEST_DEVICE_ID = 'test-device-001';
  const TEST_DEVICE_SECRET = 'test-secret-12345';

  // Calculate hash
  const providedSecretHash = createHash('sha256')
    .update(TEST_DEVICE_SECRET)
    .digest('hex');
  console.log('Provided secret:', TEST_DEVICE_SECRET);
  console.log('Calculated hash:', providedSecretHash);

  // Fetch from database
  const supabase = getSupabaseAdminClient();
  const { data: device, error } = await supabase
    .from('devices')
    .select('id, device_id, customer_id, status, name, device_secret_hash')
    .eq('device_id', TEST_DEVICE_ID)
    .single();

  if (error) {
    console.error('Database error:', error);
    return;
  }

  console.log('\nDevice from database:');
  console.log('  ID:', device?.id);
  console.log('  Device ID:', device?.device_id);
  console.log('  Customer ID:', device?.customer_id);
  console.log('  Status:', device?.status);
  console.log('  Name:', device?.name);
  console.log('  Stored hash:', device?.device_secret_hash);

  console.log('\nHash comparison:');
  console.log(
    '  Hashes match?',
    device?.device_secret_hash === providedSecretHash
  );
  console.log('  Expected:', providedSecretHash);
  console.log('  Actual:  ', device?.device_secret_hash);
}

// Run the debug
debugAuth()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });
