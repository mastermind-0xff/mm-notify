import { defineConfig } from 'vitest/config';
import { cssText } from './scripts/css-text.js';

export default defineConfig({
  plugins: [cssText()],
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts', 'src/test-utils/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
