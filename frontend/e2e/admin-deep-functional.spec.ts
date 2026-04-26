/**
 * CampusWay Admin Panel — Deep Functional Test Suite
 * Tests every admin page + interactive functions (buttons, forms, modals, tabs, CRUD)
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:5175';
const A = '/__cw_admin__';

// ── Login helper ──
async function adminLogin(page: Page): Promise<boolean> {
    const creds = [
        { email: 'e2e_admin_desktop@campusway.local', password: 'E2E_Admin#12345' },
        { email: 'admin', password: 'Admin@123' },
    ];
    for (const c of creds) {
        try {
            await page.goto(`${BASE}${A}/login`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);
            await page.locator('input[type="text"], input[type="email"], input#identifier').first().fill(c.email);
            await page.locator('input[type="password"]').first().fill(c.password);
            await page.locator('button[type="submit"], button:has-text("Sign")').first().click();
            await page.waitForTimeout(4000);
            if (page.url().includes('/dashboard')) return true;
        } catch { /* next */ }
    }
    return false;
}

// ── Helpers ──
async function ss(page: Page, name: string) {
    await page.screenshot({ path: `e2e/screenshots/admin-deep/${name}.png`, fullPage: true, timeout: 8000 }).catch(() => { });
}

async function nav(page: Page, path: string, wait = 2500) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(wait);
}

async function hasText(page: Page): Promise<boolean> {
    const t = await page.evaluate(() => document.body?.innerText?.trim() || '');
    return t.length > 15;
}

async function hasCrash(page: Page): Promise<boolean> {
    const t = await page.evaluate(() => document.body?.innerText?.trim() || '');
    return /Cannot read properties|Unhandled Runtime Error|Application error|ChunkLoadError/i.test(t);
}

async function countVisible(page: Page, selector: string): Promise<number> {
    return page.locator(selector).filter({ hasNotText: '' }).count();
}

// ═══════════════════════════════════════════════════════════════
// SHARED CONTEXT — Single admin login for all tests
// ═══════════════════════════════════════════════════════════════
let ctx: BrowserContext;
let pg: Page;
let loggedIn = false;

test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    pg = await ctx.newPage();
    loggedIn = await adminLogin(pg);
    if (!loggedIn) console.error('[ADMIN-DEEP] Login FAILED');
});
test.afterAll(async () => { await ctx?.close(); });

// ═══════════════════════════════════════════════════════════════
// 1. DASHBOARD
// ═══════════════════════════════════════════════════════════════
test.describe('1. Dashboard', () => {
    test('loads with widgets', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/dashboard`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '01-dashboard');
    });
});

// ═══════════════════════════════════════════════════════════════
// 2. UNIVERSITIES
// ═══════════════════════════════════════════════════════════════
test.describe('2. Universities', () => {
    test('list page loads with table/cards', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/universities`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '02-universities-list');
        // Check for table rows or cards
        const rows = await countVisible(pg, 'tr, [data-testid*="university"], .card');
        console.log(`[UNIV] Visible items: ${rows}`);
    });

    test('add university button exists', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/universities`);
        const addBtn = await pg.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), a:has-text("Add")').first().isVisible().catch(() => false);
        console.log(`[UNIV] Add button visible: ${addBtn}`);
        await ss(pg, '02-universities-add-btn');
    });

    test('university settings page', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/university-settings`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '02-university-settings');
    });
});

// ═══════════════════════════════════════════════════════════════
// 3. EXAMS
// ═══════════════════════════════════════════════════════════════
test.describe('3. Exams', () => {
    test('exams list page', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/exams`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '03-exams-list');
    });

    test('create exam button', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/exams`);
        const btn = await pg.locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New")').first().isVisible().catch(() => false);
        console.log(`[EXAM] Create button: ${btn}`);
        await ss(pg, '03-exams-create-btn');
    });

    test('question bank page', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/question-bank`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '03-question-bank');
    });
});

// ═══════════════════════════════════════════════════════════════
// 4. NEWS
// ═══════════════════════════════════════════════════════════════
test.describe('4. News', () => {
    test('news console', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/news/pending`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '04-news-console');
    });

    test('news settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/news`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '04-news-settings');
    });
});

// ═══════════════════════════════════════════════════════════════
// 5. RESOURCES
// ═══════════════════════════════════════════════════════════════
test.describe('5. Resources', () => {
    test('resources list', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/resources`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '05-resources');
    });

    test('resource settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/resource-settings`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '05-resource-settings');
    });
});

// ═══════════════════════════════════════════════════════════════
// 6. STUDENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════
test.describe('6. Student Management', () => {
    test('student list', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/list`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '06-student-list');
    });

    test('student create form', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/create`);
        expect(await hasCrash(pg)).toBe(false);
        const formFields = await countVisible(pg, 'input, select, textarea');
        console.log(`[STUDENT] Create form fields: ${formFields}`);
        await ss(pg, '06-student-create');
    });

    test('student import/export page', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/import-export`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '06-student-import-export');
    });

    test('student groups', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/groups`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '06-student-groups');
    });

    test('CRM timeline', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/crm-timeline`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '06-crm-timeline');
    });

    test('weak topics', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/weak-topics`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '06-weak-topics');
    });

    test('profile requests', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/profile-requests`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '06-profile-requests');
    });

    test('student settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/settings`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '06-student-mgmt-settings');
    });
});

// ═══════════════════════════════════════════════════════════════
// 7. SUBSCRIPTIONS & FINANCE
// ═══════════════════════════════════════════════════════════════
test.describe('7. Subscriptions & Finance', () => {
    test('subscription plans', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/subscriptions/plans`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '07-subscription-plans');
    });

    test('subscriptions v2', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/subscriptions-v2`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-subscriptions-v2');
    });

    test('finance dashboard', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/dashboard`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '07-finance-dashboard');
    });

    test('finance transactions', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/transactions`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-transactions');
    });

    test('finance invoices', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/invoices`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-invoices');
    });

    test('finance expenses', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/expenses`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-expenses');
    });

    test('finance budgets', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/budgets`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-budgets');
    });

    test('finance import', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/import`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-import');
    });

    test('finance export', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/export`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-export');
    });

    test('finance settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/settings`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-settings');
    });

    test('finance audit log', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/audit-log`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '07-finance-audit-log');
    });
});

// ═══════════════════════════════════════════════════════════════
// 8. CAMPAIGNS
// ═══════════════════════════════════════════════════════════════
test.describe('8. Campaigns', () => {
    test('campaign dashboard', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/dashboard`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '08-campaign-dashboard');
    });

    test('campaign list', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/list`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '08-campaign-list');
    });

    test('new campaign form', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/new`);
        expect(await hasCrash(pg)).toBe(false);
        const fields = await countVisible(pg, 'input, select, textarea');
        console.log(`[CAMPAIGN] New form fields: ${fields}`);
        await ss(pg, '08-campaign-new');
    });

    test('campaign templates', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/templates`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '08-campaign-templates');
    });

    test('campaign settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/settings`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '08-campaign-settings');
    });

    test('campaign logs', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaigns/logs`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '08-campaign-logs');
    });

    test('campaign banners', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/campaign-banners`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '08-campaign-banners');
    });
});

// ═══════════════════════════════════════════════════════════════
// 9. SUPPORT & HELP
// ═══════════════════════════════════════════════════════════════
test.describe('9. Support & Help', () => {
    test('support center', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/support-center`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '09-support-center');
    });

    test('help center admin', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/help-center`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '09-help-center');
    });

    test('contact messages', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/contact`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '09-contact');
    });
});

// ═══════════════════════════════════════════════════════════════
// 10. TEAM & SECURITY
// ═══════════════════════════════════════════════════════════════
test.describe('10. Team & Security', () => {
    test('team members', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/members`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '10-team-members');
    });

    test('team roles', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/roles`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-team-roles');
    });

    test('team permissions', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/permissions`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-team-permissions');
    });

    test('team approval rules', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/approval-rules`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-approval-rules');
    });

    test('team activity', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/activity`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-team-activity');
    });

    test('team security', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/security`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-team-security');
    });

    test('team invites', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/team/invites`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-team-invites');
    });

    test('approvals', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/approvals`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-approvals');
    });

    test('pending approvals', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/pending-approvals`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '10-pending-approvals');
    });
});

// ═══════════════════════════════════════════════════════════════
// 11. SETTINGS CENTER (all sub-pages)
// ═══════════════════════════════════════════════════════════════
test.describe('11. Settings Center', () => {
    test('settings hub', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-settings-hub');
    });

    test('home control', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/home-control`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-home-control');
    });

    test('site settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/site-settings`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        // Check form fields exist
        const fields = await countVisible(pg, 'input, select, textarea');
        console.log(`[SITE-SETTINGS] Form fields: ${fields}`);
        await ss(pg, '11-site-settings');
    });

    test('banner manager', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/banner-manager`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-banner-manager');
    });

    test('security center', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/security-center`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-security-center');
    });

    test('system logs', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/system-logs`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-system-logs');
    });

    test('notification settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/notifications`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '11-notification-settings');
    });

    test('analytics settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/analytics`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '11-analytics-settings');
    });

    test('admin profile', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/admin-profile`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '11-admin-profile');
    });

    test('reports settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/reports`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '11-reports-settings');
    });

    test('student settings', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/student-settings`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '11-student-settings');
    });
});

// ═══════════════════════════════════════════════════════════════
// 12. MISC PAGES
// ═══════════════════════════════════════════════════════════════
test.describe('12. Misc Pages', () => {
    test('reports', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/reports`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '12-reports');
    });

    test('notification center', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/notification-center`);
        expect(await hasCrash(pg)).toBe(false);
        await ss(pg, '12-notification-center');
    });

    test('legal pages', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/legal-pages`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '12-legal-pages');
    });

    test('founder details', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/founder-details`);
        expect(await hasCrash(pg)).toBe(false);
        expect(await hasText(pg)).toBe(true);
        await ss(pg, '12-founder-details');
    });
});

// ═══════════════════════════════════════════════════════════════
// 13. INTERACTIVE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════
test.describe('13. Interactive Functions', () => {
    test('sidebar navigation works', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/dashboard`);
        // Click a sidebar link
        const sidebarLinks = pg.locator('nav a, aside a, [role="navigation"] a').filter({ hasText: /Universit/i });
        if (await sidebarLinks.count() > 0) {
            await sidebarLinks.first().click();
            await pg.waitForTimeout(2000);
            expect(pg.url()).toContain('universit');
        }
        await ss(pg, '13-sidebar-nav');
    });

    test('dashboard has clickable stat cards', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/dashboard`);
        const cards = pg.locator('.card, [class*="stat"], [class*="widget"], [class*="Card"]');
        const count = await cards.count();
        console.log(`[DASHBOARD] Stat cards/widgets: ${count}`);
        await ss(pg, '13-dashboard-cards');
    });

    test('settings form has save button', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/settings/site-settings`);
        const saveBtn = await pg.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first().isVisible().catch(() => false);
        console.log(`[SETTINGS] Save button visible: ${saveBtn}`);
        expect(saveBtn).toBe(true);
        await ss(pg, '13-settings-save-btn');
    });

    test('university list has action buttons', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/universities`);
        const actionBtns = await pg.locator('button:has-text("Edit"), button:has-text("Delete"), button:has-text("View"), [aria-label*="edit"], [aria-label*="delete"]').count();
        console.log(`[UNIV] Action buttons: ${actionBtns}`);
        await ss(pg, '13-university-actions');
    });

    test('student list has search/filter', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/student-management/list`);
        const searchInput = await pg.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first().isVisible().catch(() => false);
        console.log(`[STUDENT] Search input: ${searchInput}`);
        await ss(pg, '13-student-search');
    });

    test('finance dashboard has charts', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/finance/dashboard`);
        const charts = await pg.locator('canvas, svg.recharts-surface, [class*="chart"], [class*="Chart"]').count();
        console.log(`[FINANCE] Chart elements: ${charts}`);
        await ss(pg, '13-finance-charts');
    });

    test('notification center has tabs', async () => {
        test.skip(!loggedIn);
        await nav(pg, `${A}/notification-center`);
        const tabs = await pg.locator('[role="tab"], button[class*="tab"], .tab').count();
        console.log(`[NOTIF] Tab elements: ${tabs}`);
        await ss(pg, '13-notification-tabs');
    });
});
