import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts', './packages/web/test/setup.ts'],
    // Use a DOM-like environment for web package tests
    environmentMatchGlobs: [
      ['packages/web/**', 'happy-dom'],
    ],
    env: {
      // Use local Supabase for tests
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      SUPABASE_SERVICE_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        'text-summary',
        'json',
        'json-summary',
        'html',
        'lcov',
        'cobertura',
        'clover',
      ],
      reportOnFailure: true,
      all: true,
      clean: true,
      cleanOnRerun: true,
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'test/**',
        'tests/**',
        '**/__tests__/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/test-*/**',
        'scripts/**',
        'infrastructure/**',
        'supabase/**',
        '**/.next/**',
        '**/coverage/**',
        '**/test-results/**',
      ],
      include: ['packages/**/*.{js,ts,tsx}'],
      thresholds: {
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
        // Per-package thresholds
        'packages/shared/**': {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        'packages/api/**': {
          branches: 65,
          functions: 65,
          lines: 65,
          statements: 65,
        },
      },
      watermarks: {
        statements: [60, 80],
        functions: [60, 80],
        branches: [60, 80],
        lines: [60, 80],
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    watch: false,
    reporters: ['default'],
    outputFile: {
      junit: './test-results/junit.xml',
      json: './test-results/results.json',
    },
  },
  resolve: {
    alias: {
      '@aizen/shared': path.resolve(__dirname, './packages/shared/src'),
      '@aizen/api': path.resolve(__dirname, './packages/api/src'),
      '@aizen/web': path.resolve(__dirname, './packages/web/src'),
      '@': path.resolve(__dirname, './packages/web/src'),
      '@aizen/device-agent': path.resolve(
        __dirname,
        './packages/device-agent/src'
      ),
    },
  },
});
