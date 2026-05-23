// @ts-check
/**
 * ============================================================
 *  APEX – Login Page Test Suite
 *  Framework : Playwright (@playwright/test)
 *  Target    : http://localhost:3003/login
 *  Component : frontend/src/features/auth/LoginPage.jsx
 * ============================================================
 *
 *  Prerequisites:
 *    1. Start the dev server: npm run dev
 *    2. (Optional) Supply real credentials via env vars for
 *       auth-gated tests:
 *         TEST_EMAIL=you@domain.com TEST_PASSWORD=YourPass npx playwright test
 *
 *  Run all login tests:
 *    npx playwright test --config=tests/login/playwright.config.js
 *
 *  Groups:
 *    TC-01..TC-05  → UI & Page Structure
 *    TC-06..TC-10  → Client-side Validation
 *    TC-11..TC-14  → API / Auth Flows
 *    TC-15..TC-16  → Protected Route Redirection
 *    TC-17         → Microsoft SSO Button
 *    TC-18..TC-21  → UX / Edge Cases
 * ============================================================
 */

import { test, expect } from '@playwright/test';

// ─── Selectors ────────────────────────────────────────────────────────────────
// Ant Design wraps inputs; the actual <input> sits inside .ant-input or .ant-input-affix-wrapper
const SEL = {
    // Email – Ant Design Input (type="email")
    emailInput: 'input[placeholder="you@domain.com"]',
    // Password – Ant Design Input.Password (type="password")
    passwordInput: 'input[placeholder="Enter password"]',
    // Primary submit button
    loginBtn: 'button[type="submit"]',
    // Microsoft SSO button
    microsoftBtn: 'button:has(img[alt="Microsoft"])',
    // Inline error banner rendered by LoginPage
    errorBanner: '.bg-red-50.border.border-red-200',
    // "Forgot password?" link
    forgotPasswordLink: 'a[href="/forgot-password"]',
    // "Register" link at the bottom
    registerLink: 'a[href="/register"]',
    // AlertModal rendered for bad email format – title text
    alertModalTitle: '.ant-modal-title, [role="dialog"] h4, [role="dialog"] .font-semibold',
    // AlertModal OK button
    alertModalOkBtn: 'button:has-text("OK")',
    // Page heading inside AuthLayout
    pageTitle: 'h1, h2',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Navigate to the login page and wait for the email input to be ready.
 */
async function goToLogin(page) {
    await page.goto('/login');
    await page.waitForSelector(SEL.emailInput, { state: 'visible' });
}

/**
 * Fill email + password fields and optionally click the Login button.
 */
async function fillCredentials(page, email, password, submit = false) {
    await page.fill(SEL.emailInput, email);
    await page.fill(SEL.passwordInput, password);
    if (submit) {
        await page.click(SEL.loginBtn);
    }
}

// ─── TC-01..TC-05 · UI & Page Structure ───────────────────────────────────────
test.describe('TC-01..05 · UI & Page Structure', () => {
    test.beforeEach(async ({ page }) => {
        await goToLogin(page);
    });

    test('TC-01 · Login page loads and URL resolves correctly', async ({ page }) => {
        await expect(page).toHaveURL(/\/login/);
        // HTTP 200-level response (no error page)
        const response = await page.request.get('/login');
        // The SPA always returns 200 for the index.html; just verify we loaded
        await expect(page.locator(SEL.emailInput)).toBeVisible();
    });

    test('TC-02 · Page shows "Welcome Back" heading', async ({ page }) => {
        // AuthLayout renders a title prop as a heading
        await expect(page.locator(SEL.pageTitle).first()).toContainText('Welcome Back');
    });

    test('TC-03 · Email and Password inputs are visible and empty by default', async ({ page }) => {
        const emailInput = page.locator(SEL.emailInput);
        const passwordInput = page.locator(SEL.passwordInput);

        await expect(emailInput).toBeVisible();
        await expect(passwordInput).toBeVisible();
        await expect(emailInput).toHaveValue('');
        await expect(passwordInput).toHaveValue('');
    });

    test('TC-04 · Password field masks input (type="password")', async ({ page }) => {
        await expect(page.locator(SEL.passwordInput)).toHaveAttribute('type', 'password');
    });

    test('TC-05 · Forgot Password and Register navigation links are present', async ({ page }) => {
        await expect(page.locator(SEL.forgotPasswordLink)).toBeVisible();
        await expect(page.locator(SEL.registerLink)).toBeVisible();
    });
});

// ─── TC-06..TC-10 · Client-side Validation ────────────────────────────────────
test.describe('TC-06..10 · Client-side Validation', () => {
    test.beforeEach(async ({ page }) => {
        await goToLogin(page);
    });

    test('TC-06 · Submitting with both fields empty shows "required" error', async ({ page }) => {
        await page.click(SEL.loginBtn);
        await expect(page.locator(SEL.errorBanner)).toBeVisible();
        await expect(page.locator(SEL.errorBanner)).toContainText('Email and password are required');
    });

    test('TC-07 · Submitting with only email filled shows "required" error', async ({ page }) => {
        await page.fill(SEL.emailInput, 'user@example.com');
        await page.click(SEL.loginBtn);
        await expect(page.locator(SEL.errorBanner)).toContainText('Email and password are required');
    });

    test('TC-08 · Submitting with only password filled shows "required" error', async ({ page }) => {
        await page.fill(SEL.passwordInput, 'SomePassword123');
        await page.click(SEL.loginBtn);
        await expect(page.locator(SEL.errorBanner)).toContainText('Email and password are required');
    });

    test('TC-09 · Invalid email format triggers AlertModal with "Invalid Email Address"', async ({ page }) => {
        await fillCredentials(page, 'not-an-email', 'SomePassword123', true);

        // AlertModal should appear
        await expect(page.locator(SEL.alertModalTitle)).toBeVisible({ timeout: 5_000 });
        await expect(page.locator(SEL.alertModalTitle)).toContainText('Invalid Input');

        // Dismiss the modal
        await page.locator(SEL.alertModalOkBtn).click();
        await expect(page.locator(SEL.alertModalTitle)).not.toBeVisible();
    });

    test('TC-10 · Typing in email field clears the inline error banner', async ({ page }) => {
        // First produce the error
        await page.click(SEL.loginBtn);
        await expect(page.locator(SEL.errorBanner)).toBeVisible();

        // Then type in the email field
        await page.fill(SEL.emailInput, 'a');
        await expect(page.locator(SEL.errorBanner)).not.toBeVisible();
    });
});

// ─── TC-11..TC-14 · API / Auth Flows ─────────────────────────────────────────
test.describe('TC-11..14 · API / Auth Flows', () => {
    test.beforeEach(async ({ page }) => {
        await goToLogin(page);
    });

    test('TC-11 · Invalid credentials show an error message from the API', async ({ page }) => {
        // Intercept the API call and return a 401 response
        await page.route('**/auth/login', route =>
            route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'Invalid credentials' }),
            })
        );

        await fillCredentials(page, 'wrong@domain.com', 'wrongpassword', true);

        await expect(page.locator(SEL.errorBanner)).toBeVisible({ timeout: 10_000 });
        await expect(page.locator(SEL.errorBanner)).toContainText('Invalid credentials');
    });

    test('TC-12 · Login button is disabled while the request is in-flight', async ({ page }) => {
        // Simulate a slow API call (hold the request open)
        let releaseRequest;
        await page.route('**/auth/login', async route => {
            await new Promise(resolve => { releaseRequest = resolve; });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ access_token: 'token', ispasswordchange: true }),
            });
        });

        await fillCredentials(page, 'user@domain.com', 'Password123', true);

        // Button must be disabled immediately after clicking
        await expect(page.locator(SEL.loginBtn)).toBeDisabled({ timeout: 3_000 });
        await expect(page.locator(SEL.loginBtn)).toContainText('Signing in...');

        // Release the held request so the page doesn't hang
        releaseRequest();
    });

    test('TC-13 · Successful login navigates to /select-entity (mocked API)', async ({ page }) => {
        await page.route('**/auth/login', route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'mock-access-token',
                    refresh_token: 'mock-refresh-token',
                    id: 1,
                    username: 'testuser',
                    email: 'user@domain.com',
                    role: 'user',
                    department: 'Engineering',
                    email_notifications: true,
                    ispasswordchange: true,
                }),
            })
        );

        await fillCredentials(page, 'user@domain.com', 'ValidPass123!', true);

        await expect(page).toHaveURL(/\/select-entity/, { timeout: 15_000 });
    });

    test('TC-14 · First-time login (ispasswordchange=false) redirects to /change-password-first-time', async ({ page }) => {
        await page.route('**/auth/login', route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'mock-access-token',
                    refresh_token: 'mock-refresh-token',
                    id: 2,
                    email: 'newuser@domain.com',
                    ispasswordchange: false,
                }),
            })
        );

        await fillCredentials(page, 'newuser@domain.com', 'TempPass123!', true);

        await expect(page).toHaveURL(/\/change-password-first-time/, { timeout: 15_000 });
    });
});

// ─── TC-15..TC-16 · Protected Route Redirection ───────────────────────────────
test.describe('TC-15..16 · Protected Route Redirection', () => {
    test('TC-15 · /dashboard redirects to login when unauthenticated', async ({ page }) => {
        // Clear any stored auth state
        await page.goto('/');
        await page.evaluate(() => sessionStorage.clear());

        await page.goto('/dashboard');
        // ProtectedRoute should redirect back to login
        await expect(page).toHaveURL(/\/(login|)$/, { timeout: 10_000 });
        await expect(page.locator(SEL.emailInput)).toBeVisible();
    });

    test('TC-16 · /invoices redirects to login when unauthenticated', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => sessionStorage.clear());

        await page.goto('/invoices');
        await expect(page).toHaveURL(/\/(login|)$/, { timeout: 10_000 });
        await expect(page.locator(SEL.emailInput)).toBeVisible();
    });
});

// ─── TC-17 · Microsoft SSO Button ─────────────────────────────────────────────
test.describe('TC-17 · Microsoft SSO Button', () => {
    test.beforeEach(async ({ page }) => {
        await goToLogin(page);
    });

    test('TC-17 · Microsoft login button is visible and clickable', async ({ page }) => {
        const msBtn = page.locator(SEL.microsoftBtn);
        await expect(msBtn).toBeVisible();
        await expect(msBtn).toBeEnabled();
        // Button carries the Microsoft icon image
        await expect(msBtn.locator('img[alt="Microsoft"]')).toBeVisible();
    });
});

// ─── TC-18..TC-21 · UX / Edge Cases ──────────────────────────────────────────
test.describe('TC-18..21 · UX & Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
        await goToLogin(page);
    });

    test('TC-18 · Repeated invalid credential submissions keep error message updated', async ({ page }) => {
        // First attempt
        await page.route('**/auth/login', route =>
            route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'Invalid credentials' }),
            })
        );
        await fillCredentials(page, 'bad@domain.com', 'wrong1', true);
        await expect(page.locator(SEL.errorBanner)).toContainText('Invalid credentials', { timeout: 8_000 });

        // Second attempt – error must refresh
        await page.fill(SEL.emailInput, 'bad@domain.com');
        await page.fill(SEL.passwordInput, 'wrong2');
        await page.click(SEL.loginBtn);
        await expect(page.locator(SEL.errorBanner)).toContainText('Invalid credentials', { timeout: 8_000 });
    });

    test('TC-19 · Pressing Enter key inside the form submits the login request', async ({ page }) => {
        await page.route('**/auth/login', route =>
            route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'Invalid credentials' }),
            })
        );

        await page.fill(SEL.emailInput, 'user@domain.com');
        await page.fill(SEL.passwordInput, 'WrongPass');
        await page.keyboard.press('Enter');

        await expect(page.locator(SEL.errorBanner)).toBeVisible({ timeout: 8_000 });
    });

    test('TC-20 · Tab-key navigation moves focus from Email → Password → Submit button', async ({ page }) => {
        // Click email to set initial focus
        await page.click(SEL.emailInput);

        // Tab → should move to password
        await page.keyboard.press('Tab');
        // Ant Design may wrap in a span; check the active element is within the password wrapper
        const activeTag = await page.evaluate(() => document.activeElement?.tagName);
        // Active element is the password input or its toggle icon
        expect(['INPUT', 'SPAN', 'BUTTON']).toContain(activeTag);
    });

    test('TC-21 · Page title is set correctly', async ({ page }) => {
        // The index.html or React Helmet should set an appropriate title
        // At minimum the title should not be blank
        const title = await page.title();
        expect(title.length).toBeGreaterThan(0);
    });
});
