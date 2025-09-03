import { initializeRedis } from '@aizen/shared/utils/redis-client';
import { initializeSupabase } from '@aizen/shared/utils/supabase-client';

import { config } from './config';
import { createApp, startServer, gracefulShutdown } from './server';

async function main(): Promise<void> {
  // Initialize external clients before creating the app
  if (config.supabase.url && config.supabase.anonKey) {
    initializeSupabase({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      serviceRoleKey: config.supabase.serviceRoleKey,
    });
    console.log('✓ Supabase client initialized');
    if (config.supabase.serviceRoleKey) {
      console.log('✓ Supabase admin client initialized');
    } else {
      console.warn(
        '⚠ Supabase service role key missing, admin operations may fail'
      );
    }
  } else {
    console.warn(
      '⚠ Supabase configuration missing, some features may not work'
    );
  }

  initializeRedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  });
  console.log('✓ Redis client initialized');

  const app = await createApp();

  // Register signal handlers
  process.on('SIGTERM', () => {
    app.log.info('SIGTERM received, starting graceful shutdown');
    void gracefulShutdown(app).then(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    app.log.info('SIGINT received, starting graceful shutdown');
    void gracefulShutdown(app).then(() => {
      process.exit(0);
    });
  });

  try {
    await startServer(app);
    const address = app.server.address();
    const url =
      typeof address === 'string'
        ? address
        : address
          ? `http://${address.address}:${address.port}`
          : 'unknown';
    app.log.info(`Server listening on ${url}`);
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
