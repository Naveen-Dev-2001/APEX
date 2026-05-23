// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for APEX Invoices Page tests.
 * Targets the local Vite dev server on http://localhost:3003
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,

    reporter: [
        ['html', { outputFolder: '../../playwright-report/invoices', open: 'never' }],
        ['list'],
    ],

    use: {
        baseURL: 'http://localhost:3003',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        viewport: { width: 1280, height: 800 },
        actionTimeout: 10_000,
        navigationTimeout: 20_000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
