// @ts-check
/**
 * ============================================================
 *  APEX – Register Page Test Suite
 *  Framework : Playwright (@playwright/test)
 *  Target    : http://localhost:3003/register
 *  Component : frontend/src/features/auth/RegisterPage.jsx
 * ============================================================
 *
 *  The registration flow is a 3-step wizard:
 *    Step 1 – Email      → POST /auth/send-otp
 *    Step 2 – Verify OTP → POST /auth/verify-otp
 *    Step 3 – Details    → POST /auth/register  (username, password, confirmPassword)
 *
 *  Prerequisites:
 *    1. Start the dev server: npm run dev
 *    2. All API calls are intercepted via page.route() – no real backend needed.
 *
 *  Run all register tests:
 *    npx playwright test --config=tests/register/playwright.config.js
 *
 *  Groups:
 *    TC-01..TC-04  → UI & Page Structure (Step 1)
 *    TC-05..TC-08  → Step 1 – Email Validation & API
 *    TC-09..TC-12  → Step 2 – OTP Verification
 *    TC-13..TC-17  → Step 3 – Details Validation & Registration
 *    TC-18..TC-20  → Navigation & Stepper
 *    TC-21..TC-23  → UX / Edge Cases
 * ============================================================
 */

import { test, expect } from '@playwright/test';

// ─── Selectors ────────────────────────────────────────────────────────────────
const SEL = {
    // ── Step 1: Email ─────────────────────────────────────────────────────────
    emailInput: 'input[placeholder="you@domain.com"]',
    // FIX TC-08: Use a stable selector NOT tied to button label text.
    // Once clicked, the label changes to "Sending..." and the old :has-text()
    // selector stops matching — causing the disabled/text assertions to fail.
    // We identify the submit button by its position inside the EmailStep form
    // (the only submit button visible at Step 1) and assert text separately.
    sendOtpBtn: 'form button[type="submit"]',
    emailError: 'p.text-red-500',                        // CustomInput error <p>

    // ── Step 2: OTP ───────────────────────────────────────────────────────────
    otpInput: 'input[placeholder="6-digit code"]',
    verifyOtpBtn: 'button[type="submit"]',               // "Verify OTP →"
    changeEmailBtn: 'button[type="button"]:has-text("Change Email")',
    otpError: 'p.text-red-500',

    // ── Step 3: Details ───────────────────────────────────────────────────────
    usernameInput: 'input[placeholder="Username"]',
    passwordInput: 'input[placeholder="Enter password"]',
    confirmPasswordInput: 'input[placeholder="Confirm password"]',
    // FIX TC-23: Same reason — stable selector, text asserted separately.
    completeRegBtn: 'form button[type="submit"]',
    detailsError: 'p.text-red-500',

    // ── Stepper ───────────────────────────────────────────────────────────────
    // The Stepper wraps each label in a <span> inside a flex container.
    // We scope to that container to avoid matching the form label "Email Address".
    stepperContainer: 'div.flex.items-center.justify-between.w-full',

    // ── Nav links ─────────────────────────────────────────────────────────────
    loginLink: 'a[href="/login"]',

    // ── Page Heading ──────────────────────────────────────────────────────────
    pageTitle: 'h1, h2',
};

// ─── API Route Patterns ───────────────────────────────────────────────────────
const API = {
    sendOtp: '**/auth/send-otp',
    verifyOtp: '**/auth/verify-otp',
    register: '**/auth/register',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Navigate to /register and wait for Step 1 email input. */
async function goToRegister(page) {
    await page.goto('/register');
    await page.waitForSelector(SEL.emailInput, { state: 'visible' });
}

/** Mock send-otp to succeed and advance to Step 2. */
async function completeStep1(page, email = 'test@domain.com') {
    await page.route(API.sendOtp, route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP sent' }) })
    );
    await page.fill(SEL.emailInput, email);
    await page.click(SEL.sendOtpBtn);
    // Wait for Step 2 OTP input to appear
    await page.waitForSelector(SEL.otpInput, { state: 'visible', timeout: 8_000 });
}

/** Mock verify-otp to succeed and advance to Step 3. */
async function completeStep2(page, otp = '123456') {
    await page.route(API.verifyOtp, route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP verified' }) })
    );
    await page.fill(SEL.otpInput, otp);
    await page.click(SEL.verifyOtpBtn);
    // Wait for Step 3 username input to appear
    await page.waitForSelector(SEL.usernameInput, { state: 'visible', timeout: 8_000 });
}

// ─── TC-01..TC-04 · UI & Page Structure ───────────────────────────────────────
test.describe('TC-01..04 · UI & Page Structure', () => {
    test.beforeEach(async ({ page }) => {
        await goToRegister(page);
    });

    test('TC-01 · Register page loads and URL resolves to /register', async ({ page }) => {
        await expect(page).toHaveURL(/\/register/);
        await expect(page.locator(SEL.emailInput)).toBeVisible();
    });

    test('TC-02 · Page shows "Create Account" heading', async ({ page }) => {
        await expect(page.locator(SEL.pageTitle).first()).toContainText('Create Account');
    });

    test('TC-03 · Stepper renders all three step labels: Email, Verify, Details', async ({ page }) => {
        // FIX: `text=Email` was ambiguous — it matched both the stepper span "Email"
        // AND the form label "Email Address", causing a strict-mode violation.
        // Solution: scope inside the stepper container and use exact-text <span> matching.
        const stepper = page.locator(SEL.stepperContainer);
        await expect(stepper.locator('span', { hasText: /^Email$/ })).toBeVisible();
        await expect(stepper.locator('span', { hasText: /^Verify$/ })).toBeVisible();
        await expect(stepper.locator('span', { hasText: /^Details$/ })).toBeVisible();
    });

    test('TC-04 · Step 1 shows Email input and Send OTP button; other step inputs are hidden', async ({ page }) => {
        await expect(page.locator(SEL.emailInput)).toBeVisible();
        await expect(page.locator(SEL.sendOtpBtn)).toBeVisible();
        // Step 2 & 3 inputs must NOT exist yet
        await expect(page.locator(SEL.otpInput)).not.toBeVisible();
        await expect(page.locator(SEL.usernameInput)).not.toBeVisible();
    });
});

// ─── TC-05..TC-08 · Step 1 – Email Validation & API ──────────────────────────
test.describe('TC-05..08 · Step 1 – Email Validation & API', () => {
    test.beforeEach(async ({ page }) => {
        await goToRegister(page);
    });

    test('TC-05 · Submitting with empty email shows "Email Address is required"', async ({ page }) => {
        await page.click(SEL.sendOtpBtn);
        await expect(page.locator(SEL.emailError)).toBeVisible();
        await expect(page.locator(SEL.emailError)).toContainText('Email Address is required');
    });

    test('TC-06 · Successful OTP send advances to Step 2 (OTP input visible)', async ({ page }) => {
        await page.route(API.sendOtp, route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP sent' }) })
        );
        await page.fill(SEL.emailInput, 'user@example.com');
        await page.click(SEL.sendOtpBtn);

        await expect(page.locator(SEL.otpInput)).toBeVisible({ timeout: 8_000 });
    });

    test('TC-07 · API error on send-OTP displays the server error message', async ({ page }) => {
        await page.route(API.sendOtp, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'Email already registered' }),
            })
        );
        await page.fill(SEL.emailInput, 'existing@example.com');
        await page.click(SEL.sendOtpBtn);

        await expect(page.locator(SEL.emailError)).toBeVisible({ timeout: 8_000 });
        await expect(page.locator(SEL.emailError)).toContainText('Email already registered');
    });

    test('TC-08 · Send OTP button shows "Sending..." while the request is in-flight', async ({ page }) => {
        // FIX: After clicking, the button label changes from "Send OTP" to "Sending..."
        // The old selector :has-text("Send OTP") stops matching once the label changes,
        // so the toBeDisabled() assertion would fail with "element not found".
        // Solution: capture a stable locator reference BEFORE clicking, then assert on it.
        const submitBtn = page.locator(SEL.sendOtpBtn);

        let releaseRequest;
        await page.route(API.sendOtp, async route => {
            await new Promise(resolve => { releaseRequest = resolve; });
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP sent' }) });
        });

        await page.fill(SEL.emailInput, 'user@example.com');

        // Verify pre-click label is correct
        await expect(submitBtn).toContainText('Send OTP');

        await submitBtn.click();

        // Assert loading state via the same stable locator reference
        await expect(submitBtn).toBeDisabled({ timeout: 3_000 });
        await expect(submitBtn).toContainText('Sending...');

        releaseRequest();
    });
});

// ─── TC-09..TC-12 · Step 2 – OTP Verification ────────────────────────────────
test.describe('TC-09..12 · Step 2 – OTP Verification', () => {
    test.beforeEach(async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page, 'user@example.com');
    });

    test('TC-09 · Step 2 shows email address confirmation text and OTP input', async ({ page }) => {
        // Confirmation text references the entered email
        await expect(page.locator('text=user@example.com')).toBeVisible();
        await expect(page.locator(SEL.otpInput)).toBeVisible();
    });

    test('TC-10 · Submitting empty OTP shows "Please enter a valid 6-digit code"', async ({ page }) => {
        await page.click(SEL.verifyOtpBtn);
        await expect(page.locator(SEL.otpError)).toBeVisible();
        await expect(page.locator(SEL.otpError)).toContainText('Please enter a valid 6-digit code');
    });

    test('TC-11 · Submitting short OTP (< 6 digits) shows validation error', async ({ page }) => {
        await page.fill(SEL.otpInput, '123');    // only 3 digits
        await page.click(SEL.verifyOtpBtn);
        await expect(page.locator(SEL.otpError)).toContainText('Please enter a valid 6-digit code');
    });

    test('TC-12 · "Change Email" button navigates back to Step 1 and resets OTP', async ({ page }) => {
        await page.click(SEL.changeEmailBtn);
        // Step 1 email input must be visible again
        await expect(page.locator(SEL.emailInput)).toBeVisible({ timeout: 5_000 });
        // OTP input must be hidden
        await expect(page.locator(SEL.otpInput)).not.toBeVisible();
    });

    test('TC-12b · Valid OTP verification advances to Step 3 (Details fields visible)', async ({ page }) => {
        await page.route(API.verifyOtp, route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'OTP verified' }) })
        );
        await page.fill(SEL.otpInput, '654321');
        await page.click(SEL.verifyOtpBtn);

        await expect(page.locator(SEL.usernameInput)).toBeVisible({ timeout: 8_000 });
    });
});

// ─── TC-13..TC-17 · Step 3 – Details Validation & Registration ───────────────
test.describe('TC-13..17 · Step 3 – Details Validation & Registration', () => {
    test.beforeEach(async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page, 'user@example.com');
        await completeStep2(page, '123456');
    });

    test('TC-13 · Step 3 shows Username, Password and Confirm Password fields', async ({ page }) => {
        await expect(page.locator(SEL.usernameInput)).toBeVisible();
        await expect(page.locator(SEL.passwordInput)).toBeVisible();
        await expect(page.locator(SEL.confirmPasswordInput)).toBeVisible();
        await expect(page.locator(SEL.completeRegBtn)).toBeVisible();
    });

    test('TC-14 · Submitting empty Details form shows "All fields are required"', async ({ page }) => {
        await page.click(SEL.completeRegBtn);
        await expect(page.locator(SEL.detailsError)).toBeVisible();
        await expect(page.locator(SEL.detailsError)).toContainText('All fields are required');
    });

    test('TC-15 · Mismatched passwords show "Passwords do not match"', async ({ page }) => {
        await page.fill(SEL.usernameInput, 'testuser');
        await page.fill(SEL.passwordInput, 'Password123!');
        await page.fill(SEL.confirmPasswordInput, 'DifferentPass!');
        await page.click(SEL.completeRegBtn);

        await expect(page.locator(SEL.detailsError)).toContainText('Passwords do not match');
    });

    test('TC-16 · Password shorter than 8 characters shows length error', async ({ page }) => {
        await page.fill(SEL.usernameInput, 'testuser');
        await page.fill(SEL.passwordInput, 'abc');
        await page.fill(SEL.confirmPasswordInput, 'abc');
        await page.click(SEL.completeRegBtn);

        await expect(page.locator(SEL.detailsError)).toContainText('Password must be at least 8 characters');
    });

    test('TC-17 · Successful registration redirects to /login', async ({ page }) => {
        await page.route(API.register, route =>
            route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'Registration successful' }) })
        );

        await page.fill(SEL.usernameInput, 'newuser');
        await page.fill(SEL.passwordInput, 'SecurePass123!');
        await page.fill(SEL.confirmPasswordInput, 'SecurePass123!');
        await page.click(SEL.completeRegBtn);

        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
});

// ─── TC-18..TC-20 · Navigation & Stepper ─────────────────────────────────────
test.describe('TC-18..20 · Navigation & Stepper', () => {
    test('TC-18 · "Login" link on Step 1 navigates to /login', async ({ page }) => {
        await goToRegister(page);
        await page.click(SEL.loginLink);
        await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    });

    test('TC-19 · "Login" link on Step 2 navigates to /login', async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page);
        // Each step shows the login link
        await page.locator(SEL.loginLink).click();
        await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    });

    test('TC-20 · "Login" link on Step 3 navigates to /login', async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page);
        await completeStep2(page);
        await page.locator(SEL.loginLink).click();
        await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    });
});

// ─── TC-21..TC-23 · UX / Edge Cases ──────────────────────────────────────────
test.describe('TC-21..23 · UX & Edge Cases', () => {
    test('TC-21 · Typing in email field after error clears the validation error', async ({ page }) => {
        await goToRegister(page);
        // Produce the error
        await page.click(SEL.sendOtpBtn);
        await expect(page.locator(SEL.emailError)).toBeVisible();
        // Start typing → error clears
        await page.fill(SEL.emailInput, 'a');
        await expect(page.locator(SEL.emailError)).not.toBeVisible();
    });

    test('TC-22 · OTP field rejects input beyond 6 characters (maxLength enforced)', async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page);

        // Attempt to type 10 digits; maxLength=6 should cap it
        await page.fill(SEL.otpInput, '1234567890');
        const value = await page.inputValue(SEL.otpInput);
        expect(value.length).toBeLessThanOrEqual(6);
    });

    test('TC-23 · Complete Registration button shows "Registering..." while request is in-flight', async ({ page }) => {
        await goToRegister(page);
        await completeStep1(page);
        await completeStep2(page);

        // FIX: Same root cause as TC-08. The selector :has-text("Complete Registration →")
        // stops matching as soon as the label changes to "Registering...". Capture a
        // stable locator reference before clicking and reuse it for all assertions.
        const completeBtn = page.locator(SEL.completeRegBtn);

        let releaseRequest;
        await page.route(API.register, async route => {
            await new Promise(resolve => { releaseRequest = resolve; });
            await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
        });

        await page.fill(SEL.usernameInput, 'newuser');
        await page.fill(SEL.passwordInput, 'SecurePass123!');
        await page.fill(SEL.confirmPasswordInput, 'SecurePass123!');

        // Verify pre-click label is correct
        await expect(completeBtn).toContainText('Complete Registration');

        await completeBtn.click();

        // Assert loading state via the same stable locator reference
        await expect(completeBtn).toBeDisabled({ timeout: 3_000 });
        await expect(completeBtn).toContainText('Registering...');

        releaseRequest();
    });
});
