import * as fs from 'fs';
import * as path from 'path';

import { config as dotenvConfig } from 'dotenv';

// Try to find .env file - check current dir, then parent directories
let envPath = '.env';
if (!fs.existsSync(envPath)) {
  envPath = path.join('..', '..', '.env'); // From packages/api to root
  if (!fs.existsSync(envPath)) {
    envPath = path.join('..', '..', '..', '.env'); // From packages/api/src to root
  }
}

// Load environment variables
const result = dotenvConfig({ path: envPath });

if (result.error) {
  console.warn('Failed to load .env file:', result.error);
} else if (process.env.NODE_ENV === 'development') {
  console.log(`✓ Loaded environment from ${envPath}`);
  console.log(
    `✓ ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`
  );
}

// Ensure node is in PATH for Claude Code SDK
if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
  process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;
}

const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : false;

const corsCredentials =
  process.env.CORS_ALLOW_CREDENTIALS !== undefined
    ? process.env.CORS_ALLOW_CREDENTIALS === 'true'
    : process.env.NODE_ENV === 'development';

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',

  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  server: {
    keepAliveTimeout: 55000, // 55 seconds for ALB compatibility
    headersTimeout: 56000, // 56 seconds
    requestTimeout: 50000, // 50 seconds
  },

  device: {
    heartbeatInterval: parseInt(
      process.env.DEVICE_HEARTBEAT_INTERVAL ?? '30000',
      10
    ), // 30 seconds default
    heartbeatTimeout: parseInt(
      process.env.DEVICE_HEARTBEAT_TIMEOUT ?? '90000',
      10
    ), // 90 seconds default (3 missed heartbeats)
    sessionTtl: parseInt(process.env.DEVICE_SESSION_TTL ?? '604800', 10), // 7 days default in seconds
  },

  cors: {
    origins: corsOrigins,
    credentials: corsCredentials,
  },

  internalAuth: {
    // Internal authentication for metrics and monitoring endpoints
    enabled: process.env.INTERNAL_AUTH_ENABLED !== 'false',
    token: process.env.INTERNAL_AUTH_TOKEN,
  },
} as const;
