import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'test-results',
      'playwright-report',
      // local notes and references, git-ignored
      '.claude',
      'resources',
    ],
  },
  js.configs.recommended,
  {
    // root configs, the build scripts and the examples' server run in Node
    files: ['*.js', 'scripts/**/*.js', 'examples/server.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // the examples' page scripts run in the browser
    files: ['examples/**/*.js'],
    ignores: ['examples/server.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Playwright's tests run in Node and hand functions to the browser
    files: ['browser-tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
    },
  },
  {
    files: ['src/**/*.spec.ts', 'src/test-utils/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier
);
