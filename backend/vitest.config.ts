// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.vitest.ts', 'src/**/*.vitest.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/modules/panic/**', 'src/modules/hospital/**'],
      exclude: ['src/**/__tests__/**'],
    },
    // Silence console output by default in tests
    silent: false,
    // Set a reasonable timeout
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@common': path.resolve(__dirname, './src/common'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@config': path.resolve(__dirname, './src/config'),
    },
  },
});
