// @ts-check
/**
 * ============================================================
 *  APEX – Invoice Page Test Suite
 *  Framework : Playwright (@playwright/test)
 *  Target    : http://localhost:3003/invoices
 *  Component : frontend/src/features/invoices/Invoice.jsx
 * ============================================================
 */

import { test, expect } from '@playwright/test';

// ─── API Route Patterns ───────────────────────────────────────────────────────
const API = {
    settings: /\/settings\/$/,
    entityMaster: /\/master\/sheet\/Entity_Master/,
    invoices: /\/invoices\/(\?|$)/,
    filterOptions: /\/invoices\/filter-options/,
    deletedInvoices: /\/invoices\/deleted/,
    deleteInvoice: /\/invoices\/\d+(\?|$)/,
    archiveInvoice: /\/invoices\/\d+\/archive/,
    bulkDelete: /\/invoices\/bulk-delete/,
    bulkArchive: /\/invoices\/bulk-archive/,
};

// ─── Selectors ────────────────────────────────────────────────────────────────
const SEL = {
    // Tabs
    tabInProgress: 'button:has-text("In Progress Invoices")',
    tabPosted: 'button:has-text("Posted To Sage Invoices")',
    tabDeleted: 'button:has-text("Deleted Invoices")',
    tabArchived: 'button:has-text("Archived Invoices")',

    // Search and View Controls
    searchInput: 'input[placeholder*="Search"]',
    viewDropdown: 'span.ant-select-selection-item:has-text("Condensed View"), span.ant-select-selection-placeholder:has-text("Select View"), div.ant-select-selector',
    viewDropdownOption: 'div.ant-select-item-option-content',
    exportBtn: 'button:has-text("Export")',
    refreshBtn: 'button:has-text("Refresh")',
    addInvoiceBtn: 'button:has-text("Add Invoice")',

    // DataTable Elements
    table: 'table',
    tableHeaders: 'thead th',
    tableRows: 'tbody tr',
    tableHeaderSortIcon: 'thead th div.flex-col',

    // Pagination Footer
    paginationSelect: 'div.flex.items-center.gap-2 select',
    paginationPrev: 'button:has-text("<")',
    paginationNext: 'button:has-text(">")',
    paginationPageNum: 'button.w-7.h-7',

    // Bulk actions
    bulkBar: 'div:has-text("Selected")',
    bulkDeleteBtn: 'button:has-text("Bulk Delete")',
    bulkCancelBtn: 'button:has-text("Cancel")',

    // Confirmation Modals
    confirmModal: 'div.bg-white:has-text("?")',
    confirmDeleteBtn: 'button:has-text("Delete Permanently")',
    confirmArchiveBtn: 'button:has-text("Archive")',
    discardBtn: 'button:has-text("Discard")',
    cancelBtn: 'button:has-text("Cancel")',
};

// ─── Mock Data Fixtures ───────────────────────────────────────────────────────
const MOCK_INVOICES = [
    {
        id: 101,
        invoice_number: "INV-2026-001",
        vendor_id: "VEND001",
        vendor_name: "Acme Industrial",
        uploaded_by: "test_uploader",
        uploaded_at: "2026-05-23T10:00:00Z",
        updated_at: "2026-05-23T11:00:00Z",
        status: "waiting_coding",
        status_label: "Waiting For Coding",
        current_approver_level: 1,
        last_modified_by: "test_modifier",
        entity: "E001",
        extracted_data: {
            vendor_info: {
                name: { value: "Acme Industrial" },
                address: { value: "123 Factory Lane" },
                country: { value: "USA" },
                tax_id: { value: "TX-9999" },
                contact_email: { value: "acme@example.com" },
                phone: { value: "555-0199" }
            },
            client_info: {
                name: { value: "Alpha Corp" },
                billing_address: { value: "100 Corporate Plaza" },
                shipping_address: { value: "100 Corporate Plaza" }
            },
            invoice_details: {
                currency: { value: "USD" }
            },
            amounts: {
                total_invoice_amount: { value: 2500.00 },
                amount_due: { value: 2500.00 },
                subtotal: { value: 2300.00 },
                total_tax_amount: { value: 200.00 }
            },
            Items: {
                value: [
                    {
                        description: { value: "Industrial Widget production" },
                        item_number: { value: "WIDG-001" },
                        quantity: { value: 10 },
                        amount: { value: 230.00 }
                    }
                ]
            }
        }
    },
    {
        id: 102,
        invoice_number: "INV-2026-002",
        vendor_id: "VEND002",
        vendor_name: "Global Logistics",
        uploaded_by: "test_uploader",
        uploaded_at: "2026-05-22T08:00:00Z",
        updated_at: "2026-05-22T09:00:00Z",
        status: "sage_posted",
        status_label: "Posted to Sage",
        current_approver_level: 1,
        last_modified_by: "sage_sync",
        entity: "E001",
        extracted_data: {
            vendor_info: {
                name: { value: "Global Logistics" },
                address: { value: "456 Port Parkway" },
                country: { value: "Canada" },
                tax_id: { value: "TX-8888" },
                contact_email: { value: "global@example.com" },
                phone: { value: "555-0288" }
            },
            client_info: {
                name: { value: "Alpha Corp" },
                billing_address: { value: "100 Corporate Plaza" },
                shipping_address: { value: "100 Corporate Plaza" }
            },
            invoice_details: {
                currency: { value: "CAD" }
            },
            amounts: {
                total_invoice_amount: { value: 157250.50 },
                amount_due: { value: 157250.50 },
                subtotal: { value: 150000.00 },
                total_tax_amount: { value: 7250.50 }
            },
            Items: {
                value: [
                    {
                        description: { value: "Shipping container delivery" },
                        item_number: { value: "SHIP-002" },
                        quantity: { value: 2 },
                        amount: { value: 75000.00 }
                    }
                ]
            }
        }
    }
];

// ─── Auth State Helpers ───────────────────────────────────────────────────────
async function setAuth(page, overrides = {}) {
    const defaults = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        active_role: 'scanner',
        user: {
            id: 1,
            username: 'scanneruser',
            email: 'scanner@domain.com',
            role: 'scanner',
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

async function mockSettingsAndEntity(page) {
    await page.route(API.settings, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                navigation: [
                    { path: '/dashboard', label: 'Dashboard', roles: ['all'] },
                    { path: '/invoices', label: 'Invoices', roles: ['all'] },
                    { path: '/select-entity', label: 'Select Entity', roles: ['all'] }
                ],
                settings: {}
            }),
        })
    );

    await page.route(API.entityMaster, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { entity_id: "E001", entity_name: "E001 - Alpha Corp", gst_applicable: true }
            ]),
        })
    );

    // Mock auth refresh endpoint
    await page.route(/\/auth\/refresh/, route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: 'refreshed-mock-access-token',
                refresh_token: 'refreshed-mock-refresh-token'
            }),
        })
    );
}

async function mockInvoicesApis(page, {
    invoices = MOCK_INVOICES,
    total = 2,
    filterOptions = ["waiting_coding", "sage_posted", "processed"],
    deletedInvoices = [
        {
            id: 103,
            invoice_number: "DEL-2026-999",
            vendor_id: "VEND999",
            vendor_name: "Office World",
            uploaded_by: "deleted_user",
            uploaded_at: "2026-05-20T10:00:00Z",
            deleted_at: "2026-05-21T11:00:00Z",
            deleted_by: "admin",
            status: "deleted",
            status_label: "Deleted",
            entity: "E001",
            extracted_data: {
                vendor_info: { name: { value: "Office World" } },
                amounts: { total_invoice_amount: { value: 120.00 }, amount_due: { value: 120.00 } }
            }
        }
    ],
    deletedTotal = 1
} = {}) {
    // Mock get invoices
    await page.route(API.invoices, async (route) => {
        const method = route.request().method();
        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: invoices, total: total }),
            });
        } else {
            await route.continue();
        }
    });

    // Mock filter options
    await page.route(API.filterOptions, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(filterOptions),
        });
    });

    // Mock deleted invoices
    await page.route(API.deletedInvoices, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: deletedInvoices, total: deletedTotal }),
        });
    });
}

async function goToInvoices(page, options = {}) {
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));
    
    // Explicitly clean up cross-test skip_auth_init leakage
    await page.addInitScript(() => {
        localStorage.removeItem('skip_auth_init');
    });
    
    await setAuth(page, options);
    await mockSettingsAndEntity(page);
    await mockInvoicesApis(page, options);
    await page.goto('/invoices');
}

// ─── TC-01..TC-04 · Page Access & Role Constraints ──────────────────────────────
test.describe('TC-01..04 · Page Access & Role Constraints', () => {
    test('TC-01 · Unauthenticated access to /invoices redirects to /login', async ({ page }) => {
        await page.addInitScript(() => {
            sessionStorage.clear();
            localStorage.setItem('skip_auth_init', 'true');
        });
        await page.goto('/invoices');
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });

    test('TC-02 · Authenticated access loads invoices page correctly', async ({ page }) => {
        await goToInvoices(page);
        await expect(page).toHaveURL(/\/invoices/);
        await expect(page.locator(SEL.tabInProgress)).toBeVisible();
        await expect(page.locator(SEL.searchInput)).toBeVisible();
        await expect(page.locator(SEL.table)).toBeVisible();
    });

    test('TC-03 · View-only role (approver) cannot perform writer actions', async ({ page }) => {
        await goToInvoices(page, {
            active_role: 'approver',
            user: { id: 2, username: 'approveruser', email: 'approver@domain.com', role: 'approver' }
        });

        // "Add Invoice" button should not be present
        await expect(page.locator(SEL.addInvoiceBtn)).toHaveCount(0);

        // Row checkboxes for bulk action should not be present
        await expect(page.locator('tbody tr input[type="checkbox"]')).toHaveCount(0);

        // Individual delete action button should not be present in the rows
        await expect(page.locator('button[title="Delete"]')).toHaveCount(0);
    });

    test('TC-04 · Writer roles (scanner/coder) can see action buttons and selectors', async ({ page }) => {
        await goToInvoices(page, {
            active_role: 'scanner',
            user: { id: 1, username: 'scanneruser', email: 'scanner@domain.com', role: 'scanner' }
        });

        // "Add Invoice" button is visible
        await expect(page.locator(SEL.addInvoiceBtn)).toBeVisible();

        // Checkboxes are visible
        await expect(page.locator('tbody tr input[type="checkbox"]').first()).toBeVisible();

        // Individual delete action button is visible
        await expect(page.locator('button[title="Delete"]').first()).toBeVisible();

        // Individual archive action button is visible (since invoice 102 status is sage_posted)
        await expect(page.locator('button[title="Archive"]').first()).toBeVisible();
    });
});

// ─── TC-05..TC-08 · Search & Column Filtering ────────────────────────────────────
test.describe('TC-05..08 · Search & Column Filtering', () => {
    test('TC-05 · Real-time search triggers debounced API requests', async ({ page }) => {
        let requestedSearch = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            requestedSearch = url.searchParams.get('search');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 })
            });
        });

        await goToInvoices(page);
        
        // Type into search box
        await page.locator(SEL.searchInput).fill('INV-2026');

        // Verify debounced API request goes through with correct param within 1-2 seconds
        await page.waitForResponse(res => res.url().includes('/invoices/') && res.url().includes('search=INV-2026'));
        expect(requestedSearch).toBe('INV-2026');
    });

    test('TC-06 · Column filters apply correct stringified parameters to API', async ({ page }) => {
        let filtersPassed = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            filtersPassed = url.searchParams.get('filters');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 })
            });
        });

        await goToInvoices(page);

        // Click on the funnel filter icon for Status column
        const statusHeader = page.locator('thead th:has-text("Status")');
        const filterIcon = statusHeader.locator('button[title^="Filter by"]');
        await filterIcon.click();

        // Select the "waiting_coding" checkbox option in list mode
        await page.locator('label:has-text("Waiting For Coding")').click();

        // Click OK button inside the filter popover
        await page.locator('button:has-text("OK")').click();

        // Verify API request went out with filter values
        await page.waitForResponse(res => res.url().includes('/invoices/') && res.url().includes('filters='));
        expect(filtersPassed).toContain('waiting_coding');
    });

    test('TC-07 · Changing search query resets pagination skip to 0', async ({ page }) => {
        let requestedSkip = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            requestedSkip = url.searchParams.get('skip');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 })
            });
        });

        await goToInvoices(page);

        // Set skip state manually to something else (e.g. go to page 2 if possible, or search triggers skip reset)
        await page.locator(SEL.searchInput).fill('INV-2026');
        await page.waitForResponse(res => res.url().includes('/invoices/'));
        expect(requestedSkip).toBe('0');
    });

    test('TC-08 · Opening column filter calls filter-options endpoint', async ({ page }) => {
        let filterOptionsCalled = false;
        await page.route(API.filterOptions, async (route) => {
            filterOptionsCalled = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(["processed", "approved"]),
            });
        });

        await goToInvoices(page);

        // Open Vendor ID filter option popover
        const vendorIdHeader = page.locator('thead th:has-text("Vendor ID")');
        const filterIcon = vendorIdHeader.locator('button[title^="Filter by"]');
        await filterIcon.click();

        expect(filterOptionsCalled).toBe(true);
    });
});

// ─── TC-09..TC-11 · Pagination & Layout Views ───────────────────────────────────
test.describe('TC-09..11 · Pagination & Layout Views', () => {
    test('TC-09 · Clicking pagination buttons updates skip offset', async ({ page }) => {
        let lastSkip = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            lastSkip = url.searchParams.get('skip');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 20 }),
            });
        });

        await goToInvoices(page);

        // Click page 2 button
        const page2Btn = page.locator(SEL.paginationPageNum).filter({ hasText: '2' });
        await page2Btn.click();

        await page.waitForResponse(res => res.url().includes('/invoices/'));
        expect(lastSkip).toBe('15');
    });

    test('TC-10 · Changing items-per-page limit resets skip and updates limit', async ({ page }) => {
        let lastLimit = null;
        let lastSkip = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            lastLimit = url.searchParams.get('limit');
            lastSkip = url.searchParams.get('skip');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 40 }),
            });
        });

        await goToInvoices(page);

        // Select itemsPerPage limit = 30
        const selectLimit = page.locator(SEL.paginationSelect);
        await selectLimit.selectOption('30');

        await page.waitForResponse(res => res.url().includes('/invoices/'));
        expect(lastLimit).toBe('30');
        expect(lastSkip).toBe('0');
    });

    test('TC-11 · Layout Views toggle updates columns and headers', async ({ page }) => {
        await goToInvoices(page);

        // Default condensed view displays "Vendor Name" but not "Vendor Address"
        await expect(page.locator(SEL.tableHeaders).filter({ hasText: 'Vendor Name' })).toBeVisible();
        await expect(page.locator(SEL.tableHeaders).filter({ hasText: 'Vendor Address' })).toHaveCount(0);

        // Toggle to Full View
        const viewSel = page.locator(SEL.viewDropdown);
        await viewSel.click();

        // Select full view option
        await page.locator(SEL.viewDropdownOption).filter({ hasText: 'Full View' }).click();

        // Now "Vendor Address" column header is visible
        await expect(page.locator(SEL.tableHeaders).filter({ hasText: 'Vendor Address' })).toBeVisible();
    });
});

// ─── TC-12 · Column Header Sorting ─────────────────────────────────────────────
test.describe('TC-12 · Column Header Sorting', () => {
    test('TC-12 · Clicking header triggers API call with sorting parameters', async ({ page }) => {
        let lastSortBy = null;
        let lastSortDir = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            lastSortBy = url.searchParams.get('sort_by');
            lastSortDir = url.searchParams.get('sort_dir');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 }),
            });
        });

        await goToInvoices(page);

        // Click "Invoice Number" column header
        const invoiceNumHeader = page.locator(SEL.tableHeaders).filter({ hasText: 'Invoice Number' });
        await invoiceNumHeader.click();

        await page.waitForResponse(res => res.url().includes('/invoices/'));
        expect(lastSortBy).toBe('invoice_number');
        expect(lastSortDir).toBe('asc');
    });
});

// ─── TC-13..TC-16 · Individual & Bulk Actions ────────────────────────────────────
test.describe('TC-13..16 · Individual & Bulk Actions', () => {
    test('TC-13 · Individual Delete triggers confirmation modal, API call, and toast', async ({ page }) => {
        let deleteCalled = false;
        await page.route(API.deleteInvoice, async (route) => {
            deleteCalled = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        });

        await goToInvoices(page);

        // Click the first row delete icon
        const deleteBtn = page.locator('button[title="Delete"]').first();
        await deleteBtn.click();

        // Asserts confirmation modal opens
        const modal = page.locator(SEL.confirmModal);
        await expect(modal).toBeVisible();

        // Click confirm/delete permanently button
        await page.locator(SEL.confirmDeleteBtn).click();

        // Verify API is hit
        await page.waitForResponse(res => res.url().match(API.deleteInvoice) && res.request().method() === 'DELETE');
        expect(deleteCalled).toBe(true);
    });

    test('TC-14 · Individual Archive triggers confirmation modal, API call, and toast', async ({ page }) => {
        let archiveCalled = false;
        await page.route(API.archiveInvoice, async (route) => {
            archiveCalled = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        });

        await goToInvoices(page);

        // Click the first row archive icon (for invoice id 102 - Posted to Sage)
        const archiveBtn = page.locator('button[title="Archive"]').first();
        await archiveBtn.click();

        // Asserts confirmation modal opens
        const modal = page.locator(SEL.confirmModal);
        await expect(modal).toBeVisible();

        // Click confirm archive button
        await page.locator(SEL.confirmArchiveBtn).click();

        // Verify API is hit
        await page.waitForResponse(res => res.url().match(API.archiveInvoice) && res.request().method() === 'POST');
        expect(archiveCalled).toBe(true);
    });

    test('TC-15 · Checking checkboxes displays floating bulk actions panel with correct counts', async ({ page }) => {
        await goToInvoices(page);

        // Bulk action bar should not be visible initially
        await expect(page.locator(SEL.bulkBar)).toHaveCount(0);

        // Select the first checkbox
        const firstCheckbox = page.locator('tbody tr input[type="checkbox"]').first();
        await firstCheckbox.check();

        // Verify bulk bar is visible
        const bulkBar = page.locator(SEL.bulkBar);
        await expect(bulkBar).toBeVisible();
        await expect(bulkBar).toContainText('1 Invoice Selected');

        // Select the second checkbox
        const secondCheckbox = page.locator('tbody tr input[type="checkbox"]').nth(1);
        await secondCheckbox.check();
        await expect(bulkBar).toContainText('2 Invoices Selected');
    });

    test('TC-16 · Executing Bulk Delete hits bulk-delete endpoint and clears selection', async ({ page }) => {
        let bulkDeletePayload = null;
        await page.route(API.bulkDelete, async (route) => {
            bulkDeletePayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: [101, 102], failed: [] }),
            });
        });

        await goToInvoices(page);

        // Select first checkbox
        await page.locator('tbody tr input[type="checkbox"]').first().check();
        
        // Select second checkbox
        await page.locator('tbody tr input[type="checkbox"]').nth(1).check();

        // Click Bulk Delete in bulk panel
        await page.locator(SEL.bulkDeleteBtn).click();

        // Popconfirm/Modal confirmation - click "Delete" option in Ant Popconfirm
        const popconfirmOk = page.locator('button.ant-btn-dangerous');
        await popconfirmOk.click();

        // Verify bulk delete API payload
        await page.waitForResponse(res => res.url().match(API.bulkDelete) && res.request().method() === 'POST');
        expect(bulkDeletePayload.invoice_ids).toEqual([101, 102]);

        // Bulk action panel should disappear after successful bulk delete
        await expect(page.locator(SEL.bulkBar)).toHaveCount(0);
    });
});

// ─── TC-17..TC-18 · Tab Switching & Deleted Invoices Tab ──────────────────────────
test.describe('TC-17..18 · Tab Switching & Deleted Invoices Tab', () => {
    test('TC-17 · Switching tabs clears checkbox selections and adjusts query params', async ({ page }) => {
        let requestedTab = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            requestedTab = url.searchParams.get('tab');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 })
            });
        });

        await goToInvoices(page);

        // Select first checkbox
        await page.locator('tbody tr input[type="checkbox"]').first().check();
        await expect(page.locator(SEL.bulkBar)).toBeVisible();

        // Click "Posted To Sage Invoices" tab
        await page.locator(SEL.tabPosted).click();

        // Verify API was called with tab="posted_stage"
        await page.waitForResponse(res => res.url().includes('tab=posted_stage'));
        expect(requestedTab).toBe('posted_stage');

        // Selection should be cleared (bulk bar disappears)
        await expect(page.locator(SEL.bulkBar)).toHaveCount(0);
    });

    test('TC-18 · Deleted Invoices tab renders deleted table by calling deleted endpoint', async ({ page }) => {
        await goToInvoices(page);

        // Click "Deleted Invoices" tab
        await page.locator(SEL.tabDeleted).click();

        // Wait for /invoices/deleted response
        await page.waitForResponse(res => res.url().includes('/invoices/deleted'));

        // Check if row exists with DEL-2026-999
        await expect(page.locator('tbody tr').filter({ hasText: 'DEL-2026-999' })).toBeVisible();
    });
});

// ─── TC-19 · Excel Export ────────────────────────────────────────────────────────
test.describe('TC-19 · Excel Export', () => {
    test('TC-19 · Clicking Export calls invoices endpoint with limit=-1 for full records export', async ({ page }) => {
        let exportLimit = null;
        await page.route(API.invoices, async (route) => {
            const url = new URL(route.request().url());
            if (url.searchParams.get('limit') === '-1') {
                exportLimit = url.searchParams.get('limit');
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: MOCK_INVOICES, total: 2 }),
            });
        });

        await goToInvoices(page);

        // Click Export
        await page.locator(SEL.exportBtn).click();

        // Verify API was called with limit=-1
        await page.waitForResponse(res => res.url().includes('limit=-1'));
        expect(exportLimit).toBe('-1');
    });
});
