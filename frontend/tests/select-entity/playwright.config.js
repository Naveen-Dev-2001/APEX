// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for APEX Select Entity Page tests.
 * Targets the local Vite dev server on http://localhost:3003
 *
 * Run BEFORE starting tests:  npm run dev
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './',

    // Auth state is injected per-test via addInitScript — sequential is safe
    fullyParallel: false,

    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,

    reporter: [
        ['html', { outputFolder: '../../playwright-report/select-entity', open: 'never' }],
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
        // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        // { name: 'webkit',  use: { ...devices['Desktop Safari']  } },
    ],
});
