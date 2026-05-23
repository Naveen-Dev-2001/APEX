// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for APEX Login Page tests.
 * Targets the local Vite dev server on http://localhost:3003
 *
 * Run BEFORE starting tests:  npm run dev
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    // Directory containing the test specs (relative to this config file)
    testDir: './',

    // Keep tests sequential for auth flows
    fullyParallel: false,

    // Fail CI build if test.only() is accidentally committed
    forbidOnly: !!process.env.CI,

    // Retry failed tests on CI
    retries: process.env.CI ? 2 : 0,

    // Single worker keeps session-state predictable
    workers: 1,

    reporter: [
        ['html', { outputFolder: '../../playwright-report/login', open: 'never' }],
        ['list'],
    ],

    use: {
        baseURL: 'http://localhost:3003',

        // Capture a trace only on the first retry (helps diagnose flaky tests)
        trace: 'on-first-retry',

        // Screenshot only on failure
        screenshot: 'only-on-failure',

        // Standard desktop viewport
        viewport: { width: 1280, height: 800 },

        // Ant Design renders asynchronously — give actions a generous timeout
        actionTimeout: 10_000,
        navigationTimeout: 20_000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Uncomment to run cross-browser tests:
        // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        // { name: 'webkit',  use: { ...devices['Desktop Safari']  } },
    ],

    // NOTE: Start the dev server manually before running tests:
    //   npm run dev
    // webServer: {
    //   command: 'npm run dev',
    //   url: 'http://localhost:3003',
    //   reuseExistingServer: !process.env.CI,
    // },
});
