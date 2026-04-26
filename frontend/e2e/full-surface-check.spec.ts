/**
 * CampusWay Full Surface Page Load Check
 * Tests every public, student, and admin route for successful page load.
 * Checks: HTTP status, no crash, page renders content (not blank).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:5175';

// ── Credentials ──
const ADMIN_CREDS = { email: 'admin', password: 'Admin@123' };
const STUDENT_CREDS = { email: 'campus_test_user', password: 'Student@123' };

// ── Public Routes (no auth needed) ──
const PUBLIC_ROUTES = [
    '/',
    '/universities',
    '/news',
    '/exams',
    '/resources',
    '/contact',
    '/help-center',
    '/subscription-plans',
    '/about',
    '/terms',
    '/privacy',
    '/login',
    '/student/register',
    '/student/forgot-password',
];

// ── Student Routes (need student login) ──
const STUDENT_ROUTES = [
    '/dashboard',
    '/profile',
    '/profile/security',
    '/results',
    '/payments',
    '/notifications',
    '/support',
];

// ── Admin Routes (need admin login) ──
const ADMIN_ROUTES = [
    '/__cw_admin__/dashboard',
    '/__cw_admin__/universities',
    '/__cw_admin__/exams',
    '/__cw_admin__/question-bank',
    '/__cw_admin__/resources',
    '/__cw_admin__/support-center',
    '/__cw_admin__/help-center',
    '/__cw_admin__/contact',
    '/__cw_admin__/reports',
    '/__cw_admin__/settings',
    '/__cw_admin__/settings/home-control',
    '/__cw_admin__/settings/university-settings',
    '/__cw_admin__/settings/site-settings',
    '/__cw_admin__/settings/banner-manager',
    '/__cw_admin__/settings/security-center',
    '/__cw_admin__/settings/system-logs',
    '/__cw_admin__/settings/reports',
    '/__cw_admin__/settings/notifications',
    '/__cw_admin__/settings/analytics',
    '/__cw_admin__/settings/news',
    '/__cw_admin__/settings/resource-settings',
    '/__cw_admin__/settings/admin-profile',
    '/__cw_admin__/settings/student-settings',
    '/__cw_admin__/news/pending',
    '/__cw_admin__/student-management/list',
    '/__cw_admin__/student-management/create',
    '/__cw_admin__/student-management/import-export',
    '/__cw_admin__/student-management/groups',
    '/__cw_admin__/student-management/crm-timeline',
    '/__cw_admin__/student-management/weak-topics',
    '/__cw_admin__/student-management/profile-requests',
    '/__cw_admin__/student-management/notifications',
    '/__cw_admin__/student-management/settings',
    '/__cw_admin__/subscriptions/plans',
    '/__cw_admin__/finance/dashboard',
    '/__cw_admin__/finance/transactions',
    '/__cw_admin__/finance/invoices',
    '/__cw_admin__/finance/expenses',
    '/__cw_admin__/finance/budgets',
    '/__cw_admin__/finance/recurring',
    '/__cw_admin__/finance/vendors',
    '/__cw_admin__/finance/refunds',
    '/__cw_admin__/finance/export',
    '/__cw_admin__/finance/import',
    '/__cw_admin__/finance/audit-log',
    '/__cw_admin__/finance/settings',
    '/__cw_admin__/campaigns/dashboard',
    '/__cw_admin__/campaigns/list',
    '/__cw_admin__/campaigns/new',
    '/__cw_admin__/campaigns/templates',
    '/__cw_admin__/campaigns/settings',
    '/__cw_admin__/campaigns/logs',
    '/__cw_admin__/campaign-banners',
    '/__cw_admin__/team/members',
    '/__cw_admin__/team/roles',
    '/__cw_admin__/team/permissions',
    '/__cw_admin__/team/approval-rules',
    '/__cw_admin__/team/activity',
    '/__cw_admin__/team/security',
    '/__cw_admin__/team/invites',
    '/__cw_admin__/approvals',
    '/__cw_admin__/pending-approvals',
    '/__cw_admin__/legal-pages',
    '/__cw_admin__/founder-details',
];


// ── Helper: check page loaded successfully ──
async function checkPageLoad(page: Page, url: string, label: string) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = response?.status() ?? 0;

    // Allow 200, 304 (cached), and client-side routing (which returns 200 for index.html)
    expect(status, `${label}: HTTP ${status}`).toBeLessThan(400);

    // Wait for React to render something
    await page.waitForTimeout(1500);

    // Check page is not completely blank
    const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '');
    const hasContent = bodyText.length > 10;

    // Check for crash indicators
    const hasCrash = bodyText.includes('Cannot read properties') ||
        bodyText.includes('Unhandled Runtime Error') ||
        bodyText.includes('Something went wrong') ||
        bodyText.includes('Application error');

    return { status, hasContent, hasCrash, bodyText: bodyText.slice(0, 200) };
}

// ── Helper: Admin login ──
async function adminLogin(page: Page) {
    await page.goto(`${BASE}/__cw_admin__/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByRole('textbox', { name: 'admin@example.com' }).fill(ADMIN_CREDS.email);
    await page.getByRole('textbox', { name: '********' }).first().fill(ADMIN_CREDS.password);
    await page.getByRole('button', { name: /sign in to admin/i }).click();
    await page.waitForTimeout(3000);
}

// ── Helper: Student login ──
async function studentLogin(page: Page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.getByRole('textbox', { name: /email|phone|username/i }).first().fill(STUDENT_CREDS.email);
    await page.getByRole('textbox', { name: /password/i }).first().fill(STUDENT_CREDS.password);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForTimeout(3000);
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════

test.describe('PUBLIC ROUTES — No Auth', () => {
    for (const route of PUBLIC_ROUTES) {
        test(`Public: ${route}`, async ({ page }) => {
            const result = await checkPageLoad(page, `${BASE}${route}`, `Public ${route}`);
            expect(result.hasCrash, `CRASH on ${route}: ${result.bodyText}`).toBe(false);
            expect(result.hasContent, `BLANK page on ${route}`).toBe(true);
        });
    }
});

test.describe('STUDENT ROUTES — Authenticated', () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await studentLogin(page);
    });

    test.afterAll(async () => {
        await context.close();
    });

    for (const route of STUDENT_ROUTES) {
        test(`Student: ${route}`, async () => {
            const result = await checkPageLoad(page, `${BASE}${route}`, `Student ${route}`);
            expect(result.hasCrash, `CRASH on ${route}: ${result.bodyText}`).toBe(false);
            expect(result.hasContent, `BLANK page on ${route}`).toBe(true);
        });
    }
});

test.describe('ADMIN ROUTES — Authenticated', () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await adminLogin(page);
    });

    test.afterAll(async () => {
        await context.close();
    });

    for (const route of ADMIN_ROUTES) {
        test(`Admin: ${route}`, async () => {
            const result = await checkPageLoad(page, `${BASE}${route}`, `Admin ${route}`);
            expect(result.hasCrash, `CRASH on ${route}: ${result.bodyText}`).toBe(false);
            expect(result.hasContent, `BLANK page on ${route}`).toBe(true);
        });
    }
});
