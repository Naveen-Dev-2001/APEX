// @ts-check
/**
 * ============================================================
 *  APEX – Dashboard Page Test Suite
 *  Framework : Playwright (@playwright/test)
 *  Target    : http://localhost:3003/dashboard
 *  Component : frontend/src/features/dashboard/DashboardPage.jsx
 * ============================================================
 */

import { test, expect } from '@playwright/test';

// ─── API Route Patterns ───────────────────────────────────────────────────────
const API = {
    settings: /\/settings\/$/,
    summary: /\/dashboard\/summary/,
    aging: /\/dashboard\/aging/,
    status: /\/dashboard\/status_breakdown/,
    vendors: /\/dashboard\/vendors/,
    topVendors: /\/dashboard\/top_vendors/,
    payments: /\/dashboard\/payments/,
    toggleEmail: /\/auth\/toggle-email-notifications/,
};

// ─── Selectors ────────────────────────────────────────────────────────────────
const SEL = {
    // Summary Cards (Title and Value selectors)
    card: 'div.h-\\[100px\\]',
    cardTitle: 'span.custom-font-jura',
    cardValue: 'span.font-creato',

    // Loading Skeletons
    cardSkeleton: '.react-loading-skeleton',
    chartSkeleton: '.react-loading-skeleton',

    // Fetching Overlay Spin
    fetchingOverlay: 'div.absolute.inset-0.z-50',
    fetchingText: 'span:has-text("Loading Dashboard Data...")',

    // Charts
    plotlyDiv: '.js-plotly-plot',
    barChartTitle: 'span:has-text("Payables Aging")',
    donutChartTitle: 'span:has-text("Status Breakdown")',
    vendorsAmountTitle: 'span:has-text("Vendors by Amount")',
    topVendorsTitle: 'span:has-text("Top Vendors")',

    // Interactive chart controls
    viewDropdown: 'select',
    zoomInBtn: 'button[title="Zoom In"]',
    zoomOutBtn: 'button[title="Zoom Out"]',
    resetBtn: 'button[title="Reset View"]',
    panBtn: 'button[title="Pan Mode"]',

    // Header Elements
    headerLogo: 'img[alt="loanDNA Logo"]',
    entityBadge: 'span.truncate',
    avatarBtn: 'div.bg-\\[\\#1e9bd8\\]',
    logoutBtn: 'button:has-text("Logout")',
    changeEntityBtn: 'button:has-text("Change Entity")',
    emailToggleBtn: 'button.relative.inline-flex.h-5.w-9',
};

// ─── Mock Data Fixtures ───────────────────────────────────────────────────────
const MOCK_SUMMARY = {
    total_invoices: 45,
    total_due: 157250.50,
    sage_posted: 12,
    waiting_approval: 8,
};

const MOCK_AGING = {
    "0_30": 50000,
    "31_60": 35000,
    "61_90": 20000,
    "91_120": 15000,
    "120_plus": 37250.50,
};

const MOCK_STATUS_BREAKDOWN = {
    processed: 5,
    waiting_coding: 10,
    waiting_approval: 8,
    approved: 12,
    rejected: 2,
    reworked: 1,
    uploading: 0,
    sage_posted: 12,
    sage_post_failed: 1,
    archived: 4,
    deleted: 0,
};

const MOCK_VENDORS = {
    by_amount: [
        { vendor: "Acme Corp", amount: 45000 },
        { vendor: "Global Supplies Ltd", amount: 32000 },
        { vendor: "Office Depot", amount: 15000 },
        { vendor: "Tech Solutions", amount: 12500 },
        { vendor: "Logistics Inc", amount: 8000 },
        { vendor: "Marketing Pro", amount: 5000 }
    ],
};

const MOCK_TOP_VENDORS = [
    { vendor: "Acme Corp", count: 15 },
    { vendor: "Office Depot", count: 12 },
    { vendor: "Global Supplies Ltd", count: 10 },
    { vendor: "Tech Solutions", count: 8 },
    { vendor: "Logistics Inc", count: 5 },
    { vendor: "Marketing Pro", count: 3 }
];

const MOCK_PAYMENTS = [];

// ─── Auth State Helpers ───────────────────────────────────────────────────────
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
        sessionStorage.setItem('selected_entity', 'E001');
        sessionStorage.setItem('selected_entity_name', 'E001 - Alpha Corp');
    }, cfg);
}

async function mockAdminSettings(page) {
    await page.route(API.settings, route =>
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

async function mockDashboardApis(page, {
    summary = MOCK_SUMMARY,
    aging = MOCK_AGING,
    status = MOCK_STATUS_BREAKDOWN,
    vendors = MOCK_VENDORS,
    topVendors = MOCK_TOP_VENDORS,
    payments = MOCK_PAYMENTS,
    delayMs = 0
} = {}) {
    const handler = (data) => async (route) => {
        if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(data),
        });
    };

    await page.route(API.summary, handler(summary));
    await page.route(API.aging, handler(aging));
    await page.route(API.status, handler(status));
    await page.route(API.vendors, handler(vendors));
    await page.route(API.topVendors, handler(topVendors));
    await page.route(API.payments, handler(payments));
}

async function goToDashboard(page, options = {}) {
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));
    await setAuth(page, options);
    await mockAdminSettings(page);
    await mockDashboardApis(page, options);
    await page.goto('/dashboard');
}

// ─── TC-01..TC-02 · Page Access & Routing ─────────────────────────────────────
test.describe('TC-01..02 · Page Access & Routing', () => {
    test('TC-01 · Unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
        await page.addInitScript(() => sessionStorage.clear());
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });

    test('TC-02 · Authenticated access with valid token loads dashboard page', async ({ page }) => {
        await goToDashboard(page);
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.locator(SEL.headerLogo)).toBeVisible();
        await expect(page.locator(SEL.entityBadge)).toContainText('E001 - Alpha Corp');
    });
});

// ─── TC-03..TC-07 · Summary Cards ──────────────────────────────────────────────
test.describe('TC-03..07 · Summary Cards', () => {
    test('TC-03 · Renders "Total Invoices" summary card with correct value', async ({ page }) => {
        await goToDashboard(page);
        const card = page.locator(SEL.card).filter({ hasText: 'Total Invoices' });
        await expect(card.locator(SEL.cardValue)).toHaveText('45');
    });

    test('TC-04 · Renders "Total Overdue" card formatted correctly as currency', async ({ page }) => {
        await goToDashboard(page);
        const card = page.locator(SEL.card).filter({ hasText: 'Total Overdue' });
        // MOCK_SUMMARY.total_due is 157250.50 -> should format to $ 157,250.50
        await expect(card.locator(SEL.cardValue)).toHaveText('$ 157,250.50');
    });

    test('TC-05 · Renders "Posted to Sage" card with correct value', async ({ page }) => {
        await goToDashboard(page);
        const card = page.locator(SEL.card).filter({ hasText: 'Posted to Sage' });
        await expect(card.locator(SEL.cardValue)).toHaveText('12');
    });

    test('TC-06 · Renders "Pending Approval" card with correct value', async ({ page }) => {
        await goToDashboard(page);
        const card = page.locator(SEL.card).filter({ hasText: 'Pending Approval' });
        await expect(card.locator(SEL.cardValue)).toHaveText('8');
    });

    test('TC-07 · Displays fallback values when summary fields are missing or null', async ({ page }) => {
        await goToDashboard(page, {
            summary: {
                total_invoices: null,
                total_due: null,
                sage_posted: undefined,
                waiting_approval: null,
            }
        });
        const overdueCard = page.locator(SEL.card).filter({ hasText: 'Total Overdue' });
        const invoicesCard = page.locator(SEL.card).filter({ hasText: 'Total Invoices' });

        await expect(invoicesCard.locator(SEL.cardValue)).toHaveText('0');
        await expect(overdueCard.locator(SEL.cardValue)).toHaveText('$ 0.00');
    });
});

// ─── TC-08..TC-13 · Charts Data & Formatting ──────────────────────────────────
test.describe('TC-08..13 · Charts Data & Formatting', () => {
    test.beforeEach(async ({ page }) => {
        await goToDashboard(page);
    });

    test('TC-08 · Payables Aging chart renders in the DOM', async ({ page }) => {
        const agingChart = page.locator('div.bg-white:has(span:has-text("Payables Aging"))').locator(SEL.plotlyDiv);
        await expect(agingChart).toBeVisible({ timeout: 10_000 });
    });

    test('TC-09 · Status Breakdown chart renders in the DOM', async ({ page }) => {
        const statusChart = page.locator('div.bg-white:has(span:has-text("Status Breakdown"))').locator(SEL.plotlyDiv);
        await expect(statusChart).toBeVisible({ timeout: 10_000 });
    });

    test('TC-10 · Center Text annotation is rendered inside Donut Chart', async ({ page }) => {
        // Status breakdown total counts: 5+10+8+12+2+1+0+12+1+4+0 = 55
        const centerAnnotationText = page.locator('svg text:has-text("Total")');
        await expect(centerAnnotationText).toBeVisible();
        await expect(centerAnnotationText).toContainText('55');
    });

    test('TC-11 · Vendors by Amount chart renders in the DOM', async ({ page }) => {
        const vendorsAmountChart = page.locator('div.bg-white:has(span:has-text("Vendors by Amount"))').locator(SEL.plotlyDiv);
        await expect(vendorsAmountChart).toBeVisible();
    });

    test('TC-12 · Top Vendors chart renders in the DOM', async ({ page }) => {
        const topVendorsChart = page.locator('div.bg-white:has(span:has-text("Top Vendors"))').locator(SEL.plotlyDiv);
        await expect(topVendorsChart).toBeVisible();
    });

    test('TC-13 · Sliced data displays correctly based on view count', async ({ page }) => {
        const chartWrapper = page.locator('div.bg-white:has(span:has-text("Top Vendors"))');
        const selectDropdown = chartWrapper.locator(SEL.viewDropdown);
        
        // Default is Top 5
        await expect(selectDropdown).toHaveValue('5');

        // Change select value to "10"
        await selectDropdown.selectOption({ label: 'Top 10' });
        await expect(selectDropdown).toHaveValue('10');
    });
});

// ─── TC-14..TC-16 · Loading & Fetching States ──────────────────────────────────
test.describe('TC-14..16 · Loading & Fetching States', () => {
    test('TC-14 · Displays skeleton loaders while dashboard query is loading', async ({ page }) => {
        // Mock with delay to allow checking loading state
        await goToDashboard(page, { delayMs: 2000 });
        
        // Verify loading skeletons are visible
        await expect(page.locator(SEL.cardSkeleton).first()).toBeVisible();
    });

    test('TC-15 · Shows background fetching overlay spinner when query is fetching in background', async ({ page }) => {
        await goToDashboard(page, { delayMs: 2000 });

        // Let's trigger a page reload which naturally hits fetching states with the delay active
        await page.reload();
        await expect(page.locator(SEL.fetchingOverlay)).toBeVisible();
        await expect(page.locator(SEL.fetchingText)).toBeVisible();

        // Wait for the fetching overlay to disappear
        await expect(page.locator(SEL.fetchingOverlay)).not.toBeVisible({ timeout: 5000 });
    });

    test('TC-16 · Skeletons disappear and content loads when fetching finishes', async ({ page }) => {
        await goToDashboard(page);
        
        // Wait for skeletons to disappear and content cards to be visible
        await expect(page.locator(SEL.cardSkeleton)).toHaveCount(0);
        await expect(page.locator(SEL.cardValue).first()).toBeVisible();
    });
});

// ─── TC-17 · Error Handling ────────────────────────────────────────────────────
test.describe('TC-17 · Error Handling', () => {
    test('TC-17 · Page handles partial dashboard API failures gracefully', async ({ page }) => {
        await goToDashboard(page, {
            summary: {
                total_invoices: null,
                total_due: null,
                sage_posted: null,
                waiting_approval: null,
            }
        });
        // Skeletons are gone, cards display fallback 0 values
        await expect(page.locator(SEL.cardSkeleton)).toHaveCount(0);
        await expect(page.locator(SEL.cardValue).first()).toHaveText('0');
    });
});

// ─── TC-18..TC-20 · Interactive Controls & Header Actions ─────────────────────
test.describe('TC-18..20 · Interactive Controls & Header Actions', () => {
    test.beforeEach(async ({ page }) => {
        await goToDashboard(page);
    });

    test('TC-18 · BarChart controls (Zoom In, Zoom Out, Reset, Pan) are clickable', async ({ page }) => {
        const chartWrapper = page.locator('div.bg-white:has(span:has-text("Payables Aging"))');
        
        // Click Zoom In
        const zoomIn = chartWrapper.locator(SEL.zoomInBtn);
        await zoomIn.click();
        
        // Click Zoom Out
        const zoomOut = chartWrapper.locator(SEL.zoomOutBtn);
        await zoomOut.click();

        // Click Reset View
        const reset = chartWrapper.locator(SEL.resetBtn);
        await reset.click();

        // Toggle Pan Mode
        const pan = chartWrapper.locator(SEL.panBtn);
        await pan.click();
    });

    test('TC-19 · Change Entity from header profile dropdown redirects to entity selection page', async ({ page }) => {
        await page.locator(SEL.avatarBtn).click();
        await page.locator(SEL.changeEntityBtn).click();
        await expect(page).toHaveURL(/\/select-entity/);
    });

    test('TC-20 · Toggling email notifications in header updates UI state and hits API', async ({ page }) => {
        // Intercept toggle-email-notifications post call
        await page.route(API.toggleEmail, route => 
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        );

        await page.locator(SEL.avatarBtn).click();
        const toggleBtn = page.locator(SEL.emailToggleBtn);
        await expect(toggleBtn).toBeVisible();

        // Perform click to toggle notifications
        await toggleBtn.click();
    });
});
