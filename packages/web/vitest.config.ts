import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.next/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'test/**',
      ],
      thresholds: {
        perFile: false,
        autoUpdate: false,
        '100': false,
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'test/**/*.test.{ts,tsx}',
    ],
    testTimeout: 10000,
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@aizen/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
