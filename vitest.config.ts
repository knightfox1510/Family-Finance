// vitest.config.ts
// Place this at the project root alongside package.json.
//
// Install once:
//   npm install -D vitest @vitest/coverage-v8
//
// Add to package.json scripts:
//   "test":          "vitest run",
//   "test:watch":    "vitest",
//   "test:coverage": "vitest run --coverage"

import { defineConfig } from 'vitest/config';
import path             from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['lib/**/*.ts'],
      exclude:  ['lib/__tests__/**', 'lib/supabaseClient.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
