import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'test/**',
      ],
      thresholds: {
        perFile: false,
        autoUpdate: false,
        '100': false,
        branches: 65,
        functions: 65,
        lines: 65,
        statements: 65,
      },
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'test/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@aizen/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
