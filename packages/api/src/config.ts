import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

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
    // Parse comma-separated list of allowed origins from environment
    // Example: CORS_ALLOWED_ORIGINS=http://localhost:3000,https://app.aizen.ai
    origins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : process.env.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:3001'] // Default for development
        : false, // Disable CORS in production if not configured
    credentials: process.env.CORS_ALLOW_CREDENTIALS === 'true',
  },

  internalAuth: {
    // Internal authentication for metrics and monitoring endpoints
    enabled: process.env.INTERNAL_AUTH_ENABLED !== 'false',
    token: process.env.INTERNAL_AUTH_TOKEN,
  },
} as const;
