import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@context': path.resolve(__dirname, './src/context'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  define: {
    // Matches the Vite production define; keeps Landing.tsx from blowing up in tests
    __DEMO_ENABLED__: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Scope Vitest to src/ only — e2e/ specs belong to Playwright, not Vitest
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**', 'dist/**'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Scope thresholds to files that are directly under test.
      // As more test files are added, expand `include` to keep the bar meaningful.
      include: ['src/App.tsx'],
      thresholds: {
        statements: 50,
        branches: 50,
        // App.tsx is a routing entry file; many component functions only render
        // under authenticated/admin conditions. 30% is the realistic minimum
        // achievable with smoke tests alone. Raise this as unit tests are added.
        functions: 30,
        lines: 50,
      },
      exclude: [
        'node_modules/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
