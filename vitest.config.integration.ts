import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.integration.ts'], // Use integration setup without mocks
    include: ['**/*.integration.test.ts'], // Only run integration tests
    env: {
      // Use local Supabase for tests
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      SUPABASE_SERVICE_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      SUPABASE_SERVICE_ROLE_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      NODE_ENV: 'test',
    },
    testTimeout: 60000, // Longer timeout for integration tests
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Allow parallel tests
      },
    },
    watch: false,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@aizen/shared': path.resolve(__dirname, './packages/shared/src'),
      '@aizen/api': path.resolve(__dirname, './packages/api/src'),
      '@aizen/web': path.resolve(__dirname, './packages/web/src'),
      '@aizen/device-agent': path.resolve(
        __dirname,
        './packages/device-agent/src'
      ),
    },
  },
});

