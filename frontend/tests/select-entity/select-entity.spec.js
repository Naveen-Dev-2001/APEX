// @ts-check
/**
 * ============================================================
 *  APEX – Select Entity Page Test Suite
 *  Framework : Playwright (@playwright/test)
 *  Target    : http://localhost:3003/select-entity
 *  Component : frontend/src/features/entity/SelectEntityPage.jsx
 * ============================================================
 *
 *  Page Behaviour Summary:
 *    - Protected route: requires access_token in sessionStorage
 *    - On mount, calls GET /master-data/entity-master to load entities
 *    - Entity dropdown items rendered as "{entity_id} - {entity_name}"
 *      ("Default Entity" is remapped to "Top Level")
 *    - After entity selection, navigates based on active_role:
 *        scanner  → /invoices
 *        coder    → /coding
 *        approver → /approvals
 *        default  → /dashboard
 *    - Role selector (Login As) only shown when user has >1 role
 *    - Header avatar (user initial) opens a dropdown with a Logout button
 *
 *  Prerequisites:
 *    1. Start the dev server: npm run dev
 *    2. All API calls are intercepted via page.route() – no real backend needed.
 *
 *  Run:
 *    npx playwright test --config=tests/select-entity/playwright.config.js
 *
 *  Groups:
 *    TC-01..TC-04  → Auth Guard (unauthenticated access)
 *    TC-05..TC-07  → UI & Page Structure
 *    TC-08..TC-11  → Entity Dropdown (load, select, empty state)
 *    TC-12..TC-16  → Role-based Navigation after Entity Selection
 *    TC-17..TC-19  → Role Selector (multi-role users)
 *    TC-20..TC-22  → Header Avatar & Logout
 *    TC-23..TC-25  → UX / Edge Cases
 * ============================================================
 */

import { test, expect } from '@playwright/test';

// ─── API Route Patterns ───────────────────────────────────────────────────────
const API = {
    entityMaster: /\/master\/sheet\/Entity_Master/,
    adminSettings: /\/settings\/$/,
};

// ─── Selectors ────────────────────────────────────────────────────────────────
const SEL = {
    // Page headings
    pageHeading: 'h2',
    pageSubtext: 'p',

    // Entity dropdown trigger button (blue button)
    entityDropdownBtn: 'button[type="button"].bg-\\[\\#1e9bd8\\]',

    // Entity dropdown list items
    entityDropdownList: 'ul',
    entityOptionBtn: (displayName) => `ul button:has-text("${displayName}")`,

    // "No entities found" empty state
    emptyState: 'li:has-text("No entities found")',

    // Role selector (only visible for multi-role users)
    roleDropdownBtn: 'button[type="button"].bg-\\[\\#f8f9fa\\]',
    roleOptionBtn: (role) => `ul button:has-text("${role}")`,

    // Header avatar (circle with user initial)
    avatarBtn: 'div.bg-\\[\\#1e9bd8\\].rounded-full',

    // Logout button inside avatar dropdown
    logoutBtn: 'button:has-text("Logout")',

    // Logo image
    logo: 'img[alt="loanDNA Logo"]',
};

// ─── Auth State Helpers ───────────────────────────────────────────────────────
/**
 * Inject a valid auth session into the browser's sessionStorage so the
 * ProtectedRoute guard passes without a real login API call.
 */
async function setAuth(page, overrides = {}) {
    const defaults = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        active_role: 'admin',
        user: {
            id: 1,
            username: 'testuser',
            email: 'test@domain.com',
            role: 'admin',
            department: 'finance',
            email_notifications: true,
        },
    };
    const cfg = { ...defaults, ...overrides };

    await page.addInitScript((cfg) => {
        if (localStorage.getItem('skip_auth_init') === 'true') {
            return;
        }
        sessionStorage.setItem('access_token', cfg.access_token);
        sessionStorage.setItem('refresh_token', cfg.refresh_token);
        sessionStorage.setItem('active_role', cfg.active_role);
        sessionStorage.setItem('user', JSON.stringify(cfg.user));
    }, cfg);
}

/**
 * Mock the admin/settings endpoint (called by ProtectedRoute on mount).
 * Returns a non-empty navigation list to avoid infinite re-fetching loops.
 */
async function mockAdminSettings(page) {
    await page.route(API.adminSettings, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                navigation: [
                    { path: '/dashboard', label: 'Dashboard', roles: ['all'] },
                    { path: '/invoices', label: 'Invoices', roles: ['scanner'] },
                    { path: '/coding', label: 'Coding', roles: ['coder'] },
                    { path: '/approvals', label: 'Approvals', roles: ['approver'] },
                    { path: '/select-entity', label: 'Select Entity', roles: ['all'] }
                ],
                settings: {}
            }),
        })
    );
}

/**
 * Mock the entity master API with a given list of entities.
 */
async function mockEntityMaster(page, entities = []) {
    await page.route(API.entityMaster, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: entities,
                total: entities.length,
            }),
        })
    );
}

/**
 * Navigate to /select-entity with auth set up and optional entity list.
 */
async function goToSelectEntity(page, { role = 'admin', entities = [], userOverrides = {} } = {}) {
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));
    await setAuth(page, {
        active_role: role,
        user: {
            id: 1,
            username: 'testuser',
            email: 'test@domain.com',
            role,
            department: 'finance',
            email_notifications: true,
            ...userOverrides,
        },
    });
    await mockAdminSettings(page);
    await mockEntityMaster(page, entities);
    await page.goto('/select-entity');
    await page.waitForSelector(SEL.pageHeading, { state: 'visible', timeout: 10_000 });
}

/** Default entity fixtures */
const ENTITIES = {
    alpha: { id: 1, entity_id: 'E001', entity_name: 'Alpha Corp' },
    beta: { id: 2, entity_id: 'E002', entity_name: 'Beta Ltd' },
    defaultEntity: { id: 3, entity_id: 'E000', entity_name: 'Default Entity' },
};

// ─── TC-01..TC-04 · Auth Guard ────────────────────────────────────────────────
test.describe('TC-01..04 · Auth Guard', () => {
    test('TC-01 · Unauthenticated access to /select-entity redirects to /login', async ({ page }) => {
        // Clear any existing session
        await page.addInitScript(() => sessionStorage.clear());
        await page.goto('/select-entity');
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });

    test('TC-02 · With valid token, /select-entity loads successfully', async ({ page }) => {
        await goToSelectEntity(page);
        await expect(page).toHaveURL(/\/select-entity/);
        await expect(page.locator(SEL.pageHeading)).toContainText('Select Entity');
    });

    test('TC-03 · Direct navigation after logout clears session and redirects', async ({ page }) => {
        await goToSelectEntity(page);

        // Simulate logout — clear sessionStorage and set skip flag in localStorage
        await page.evaluate(() => {
            sessionStorage.clear();
            localStorage.setItem('skip_auth_init', 'true');
        });

        // Navigating to the protected route must redirect back to login
        await page.goto('/select-entity');
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });

    test('TC-04 · /select-entity is inaccessible when only refresh_token exists (no access_token)', async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.clear();
            sessionStorage.setItem('refresh_token', 'stale-refresh');
        });
        await page.goto('/select-entity');
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
});

// ─── TC-05..TC-07 · UI & Page Structure ───────────────────────────────────────
test.describe('TC-05..07 · UI & Page Structure', () => {
    test.beforeEach(async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha] });
    });

    test('TC-05 · Page shows "Select Entity" heading and descriptive subtext', async ({ page }) => {
        await expect(page.locator(SEL.pageHeading)).toContainText('Select Entity');
        await expect(page.locator(SEL.pageSubtext).first()).toContainText(
            'Choose which entity you want to work with'
        );
    });

    test('TC-06 · Header logo is rendered', async ({ page }) => {
        await expect(page.locator(SEL.logo)).toBeVisible();
    });

    test('TC-07 · Entity dropdown trigger button shows "Choose Entity" placeholder by default', async ({ page }) => {
        await expect(page.locator(SEL.entityDropdownBtn)).toContainText('Choose Entity');
    });
});

// ─── TC-08..TC-11 · Entity Dropdown ───────────────────────────────────────────
test.describe('TC-08..11 · Entity Dropdown', () => {
    test('TC-08 · Clicking the entity button opens the dropdown list', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha, ENTITIES.beta] });

        await page.locator(SEL.entityDropdownBtn).click();

        // List items with entity display names should appear
        await expect(page.locator(SEL.entityOptionBtn('E001 - Alpha Corp'))).toBeVisible({ timeout: 5_000 });
        await expect(page.locator(SEL.entityOptionBtn('E002 - Beta Ltd'))).toBeVisible();
    });

    test('TC-09 · Selecting an entity updates the dropdown button label', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha] });

        await page.locator(SEL.entityDropdownBtn).click();
        await page.locator(SEL.entityOptionBtn('E001 - Alpha Corp')).click();

        // Button label must reflect the selected entity
        await expect(page.locator(SEL.entityDropdownBtn)).toContainText('E001 - Alpha Corp');
    });

    test('TC-10 · "Default Entity" is remapped to "Top Level" in the dropdown', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.defaultEntity] });

        await page.locator(SEL.entityDropdownBtn).click();

        // "Default Entity" must appear as "E000 - Top Level"
        await expect(page.locator(SEL.entityOptionBtn('E000 - Top Level'))).toBeVisible({ timeout: 5_000 });
        await expect(page.locator(SEL.entityOptionBtn('E000 - Default Entity'))).not.toBeVisible();
    });

    test('TC-11 · Empty entity list shows "No entities found" message', async ({ page }) => {
        await goToSelectEntity(page, { entities: [] });

        await page.locator(SEL.entityDropdownBtn).click();

        await expect(page.locator(SEL.emptyState)).toBeVisible({ timeout: 5_000 });
    });
});

// ─── TC-12..TC-16 · Role-based Navigation ─────────────────────────────────────
test.describe('TC-12..16 · Role-based Navigation after Entity Selection', () => {
    /**
     * Helper: set up with a given role, select the first entity, and return
     * the resulting URL.
     */
    async function selectEntityAndGetURL(page, role) {
        await goToSelectEntity(page, {
            role,
            entities: [ENTITIES.alpha],
            userOverrides: { role },
        });
        await page.locator(SEL.entityDropdownBtn).click();
        await page.locator(SEL.entityOptionBtn('E001 - Alpha Corp')).click();
        await page.waitForURL(/\/(dashboard|invoices|coding|approvals)/, { timeout: 10_000 });
        return page.url();
    }

    test('TC-12 · admin role → navigates to /dashboard', async ({ page }) => {
        const url = await selectEntityAndGetURL(page, 'admin');
        expect(url).toMatch(/\/dashboard/);
    });

    test('TC-13 · scanner role → navigates to /invoices', async ({ page }) => {
        const url = await selectEntityAndGetURL(page, 'scanner');
        expect(url).toMatch(/\/invoices/);
    });

    test('TC-14 · coder role → navigates to /coding', async ({ page }) => {
        const url = await selectEntityAndGetURL(page, 'coder');
        expect(url).toMatch(/\/coding/);
    });

    test('TC-15 · approver role → navigates to /approvals', async ({ page }) => {
        const url = await selectEntityAndGetURL(page, 'approver');
        expect(url).toMatch(/\/approvals/);
    });

    test('TC-16 · Entity selection stores entity_id in sessionStorage', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha] });

        await page.locator(SEL.entityDropdownBtn).click();
        await page.locator(SEL.entityOptionBtn('E001 - Alpha Corp')).click();

        // Wait for navigation to complete
        await page.waitForURL(/\/(dashboard|invoices|coding|approvals)/, { timeout: 10_000 });

        const storedEntity = await page.evaluate(() => sessionStorage.getItem('selected_entity'));
        const storedEntityName = await page.evaluate(() => sessionStorage.getItem('selected_entity_name'));

        expect(storedEntity).toBe('E001');
        expect(storedEntityName).toBe('E001 - Alpha Corp');
    });
});

// ─── TC-17..TC-19 · Role Selector (Multi-role Users) ─────────────────────────
test.describe('TC-17..19 · Role Selector', () => {
    test('TC-17 · Role selector is NOT shown for single-role users', async ({ page }) => {
        // Single role: user.role = 'admin' (no comma)
        await goToSelectEntity(page, {
            role: 'admin',
            entities: [ENTITIES.alpha],
        });

        // The "Login As" label must not be present
        await expect(page.locator('text=Login As')).not.toBeVisible();
    });

    test('TC-18 · Role selector IS shown for multi-role users', async ({ page }) => {
        // Multi-role: user.role = 'admin,approver'
        await goToSelectEntity(page, {
            role: 'admin',
            entities: [ENTITIES.alpha],
            userOverrides: { role: 'admin,approver' },
        });

        await expect(page.locator('text=Login As')).toBeVisible({ timeout: 5_000 });
        await expect(page.locator(SEL.roleDropdownBtn)).toBeVisible();
    });

    test('TC-19 · Selecting a different role from the role dropdown updates the active role display', async ({ page }) => {
        await goToSelectEntity(page, {
            role: 'admin',
            entities: [ENTITIES.alpha],
            userOverrides: { role: 'admin,approver' },
        });

        // Open the role dropdown and pick "approver"
        await page.locator(SEL.roleDropdownBtn).click();
        await page.locator(SEL.roleOptionBtn('approver')).click();

        // The role button label must now show "approver"
        await expect(page.locator(SEL.roleDropdownBtn)).toContainText('approver');
    });
});

// ─── TC-20..TC-22 · Header Avatar & Logout ────────────────────────────────────
test.describe('TC-20..22 · Header Avatar & Logout', () => {
    test.beforeEach(async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha] });
    });

    test('TC-20 · Avatar displays the first letter of the username (uppercase)', async ({ page }) => {
        // username = 'testuser' → initial = 'T'
        await expect(page.locator(SEL.avatarBtn)).toContainText('T');
    });

    test('TC-21 · Clicking the avatar opens the dropdown showing the Logout button', async ({ page }) => {
        await page.locator(SEL.avatarBtn).click();
        await expect(page.locator(SEL.logoutBtn)).toBeVisible({ timeout: 5_000 });
    });

    test('TC-22 · Clicking Logout clears session and redirects to /login', async ({ page }) => {
        await page.locator(SEL.avatarBtn).click();
        await page.locator(SEL.logoutBtn).click();

        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

        // sessionStorage must be cleared
        const token = await page.evaluate(() => sessionStorage.getItem('access_token'));
        expect(token).toBeNull();
    });
});

// ─── TC-23..TC-25 · UX / Edge Cases ──────────────────────────────────────────
test.describe('TC-23..25 · UX & Edge Cases', () => {
    test('TC-23 · Clicking outside the entity dropdown closes it', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha, ENTITIES.beta] });

        // Open dropdown
        await page.locator(SEL.entityDropdownBtn).click();
        await expect(page.locator(SEL.entityOptionBtn('E001 - Alpha Corp'))).toBeVisible();

        // Click somewhere else on the page (the heading)
        await page.locator(SEL.pageHeading).click();

        // Dropdown must be dismissed
        await expect(page.locator(SEL.entityOptionBtn('E001 - Alpha Corp'))).not.toBeVisible();
    });

    test('TC-24 · Multiple entities are all listed in the dropdown', async ({ page }) => {
        const entities = [ENTITIES.alpha, ENTITIES.beta, ENTITIES.defaultEntity];
        await goToSelectEntity(page, { entities });

        await page.locator(SEL.entityDropdownBtn).click();

        await expect(page.locator(SEL.entityOptionBtn('E001 - Alpha Corp'))).toBeVisible();
        await expect(page.locator(SEL.entityOptionBtn('E002 - Beta Ltd'))).toBeVisible();
        // Default Entity → Top Level
        await expect(page.locator(SEL.entityOptionBtn('E000 - Top Level'))).toBeVisible();

        // Total visible option buttons inside the list
        const count = await page.locator('ul li button').count();
        expect(count).toBe(3);
    });

    test('TC-25 · Avatar dropdown closes when clicking outside (user profile area)', async ({ page }) => {
        await goToSelectEntity(page, { entities: [ENTITIES.alpha] });

        // Open avatar dropdown
        await page.locator(SEL.avatarBtn).click();
        await expect(page.locator(SEL.logoutBtn)).toBeVisible();

        // Click outside (the page heading)
        await page.locator(SEL.pageHeading).click();

        // Logout button must be hidden
        await expect(page.locator(SEL.logoutBtn)).not.toBeVisible();
    });
});
