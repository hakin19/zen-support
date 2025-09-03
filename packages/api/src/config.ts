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
} as const;
