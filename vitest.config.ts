import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      '.output/**',
      'e2e/**',
      'playwright-report/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**', 'utils/**', 'composables/**', 'hooks/**', 'src/lib/**', 'src/utils/**'],
      exclude: ['**/*.d.ts', '**/*.config.*', '**/index.ts'],
      thresholds: {
        lines: 60,
        functions: 70,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
