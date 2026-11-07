/**
 * The browser tests (`npm run test:browsers`): the built package on the example
 * page, under the server's strict CSP, in every engine. Apart from vitest, eslint's
 * type-checked rules and the published files: plain JS in `browser-tests`.
 *
 * On 127.0.0.1 and a port of its own, not 5179: another host is another storage, and
 * the user's own server may be on 5179. The server builds first and stops at the end.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 5287;
const origin = `http://127.0.0.1:${PORT}`;

/** Chrome and Edge only where they are installed already: this never installs them. */
const installed = (...path) =>
  [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'],
  ].some((base) => base && existsSync(join(base, ...path)));

const channel = (name, device, chosen) => ({
  name,
  use: { ...devices[device], channel: chosen },
});

export default defineConfig({
  testDir: 'browser-tests',
  testMatch: '*.spec.js',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: 4,
  retries: 0, // a retry would hide what this suite looks for
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run examples',
    env: { PORT: String(PORT) },
    url: `${origin}/examples/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ...(installed('Google', 'Chrome', 'Application', 'chrome.exe') ?
      [channel('chrome', 'Desktop Chrome', 'chrome')]
    : []),
    ...(installed('Microsoft', 'Edge', 'Application', 'msedge.exe') ?
      [channel('edge', 'Desktop Edge', 'msedge')]
    : []),
  ],
});
