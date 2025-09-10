import { initializeSupabase } from '@aizen/shared/utils/supabase-client';
import { initializeRedis } from '@aizen/shared/utils/redis-client';
import { deviceAuthService } from './src/services/device-auth.service.js';

// Load env
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.test' });

// Initialize clients
initializeSupabase({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

initializeRedis({
  host: 'localhost',
  port: 6379,
  password: '',
  db: 1,
});

// Test authentication
const result = await deviceAuthService.validateCredentials(
  'test-device-integration',
  'integration-test-secret'
);

console.log('Validation result:', result);

process.exit(0);