// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for APEX Register Page tests.
 * Targets the local Vite dev server on http://localhost:3003
 *
 * Run BEFORE starting tests:  npm run dev
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './',

    // 3-step wizard has state dependencies — keep tests sequential
    fullyParallel: false,

    // Fail CI build if test.only() is accidentally committed
    forbidOnly: !!process.env.CI,

    // Retry failed tests on CI only
    retries: process.env.CI ? 2 : 0,

    // Single worker preserves session/state order
    workers: 1,

    reporter: [
        ['html', { outputFolder: '../../playwright-report/register', open: 'never' }],
        ['list'],
    ],

    use: {
        baseURL: 'http://localhost:3003',

        // Capture trace on the first retry
        trace: 'on-first-retry',

        // Screenshot only on failure
        screenshot: 'only-on-failure',

        // Standard desktop viewport
        viewport: { width: 1280, height: 800 },

        // Ant Design renders asynchronously
        actionTimeout: 10_000,
        navigationTimeout: 20_000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        // { name: 'webkit',  use: { ...devices['Desktop Safari']  } },
    ],
});
