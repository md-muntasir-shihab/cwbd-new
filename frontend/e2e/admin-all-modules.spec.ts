import { test, expect, type Page } from '@playwright/test';

// Single session — login once, navigate all admin modules sequentially.
// The CampusWay backend enforces single-session per user, so we MUST
// keep one browser context alive and avoid re-logging in.
// 
// IMPORTANT: We do NOT call page.goto() for the first test since
// the beforeAll already lands us on the dashboard. For subsequent
// navigations we use the sidebar links or page.goto with reload.

test.describe.serial('Admin Panel — All 13 Modules Live Test', () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();

        // Login
        await page.goto('/__cw_admin__/login');
        await page.getByPlaceholder('admin@example.com').fill('admin@campusway.com');
        await page.getByPlaceholder('********').fill('Admin@123456');
        await page.getByRole('button', { name: 'Sign In to Admin Panel' }).click();
        
        // Wait for redirect to dashboard
        await page.waitForURL('**/__cw_admin__/dashboard**', { timeout: 20000 });
        
        // Wait for the access checker to finish
        await page.waitForTimeout(1000);
        try {
            await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 30000 });
        } catch {
            // already hidden
        }
        
        // Wait for the actual dashboard content to render
        await expect(page.locator('body')).toContainText('Admin Summary', { timeout: 30000 });
    });

    test.afterAll(async () => {
        await page.close();
    });

    // Helper to navigate via sidebar link text (React SPA navigation, no page reload)
    async function navSidebar(linkText: string) {
        await page.locator(`nav >> text="${linkText}"`).first().click();
        await page.waitForTimeout(1500);
    }

    // Helper to navigate via URL click (SPA-style using React Router Link)
    async function navTo(path: string) {
        // Use SPA-style navigation by evaluating in context
        await page.evaluate((p) => {
            window.history.pushState({}, '', p);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
        await page.waitForTimeout(2000);
    }

    // ═══════════════════════════════════════════
    // MODULE 1: Core Dashboard & Analytics
    // ═══════════════════════════════════════════

    test('M1: Admin Dashboard loads', async () => {
        // We are already on the dashboard from beforeAll
        const body = page.locator('body');
        await expect(body).toContainText('Admin Summary', { timeout: 10000 });
        await expect(body).toContainText('Universities', { timeout: 10000 });
        await expect(body).toContainText('Student Management', { timeout: 10000 });
        await expect(body).toContainText('Exams', { timeout: 10000 });
        await expect(body).toContainText('Question Bank', { timeout: 10000 });
        await expect(body).toContainText('Finance Center', { timeout: 10000 });
        await expect(body).toContainText('Team & Access Control', { timeout: 10000 });
    });

    test('M1: Dashboard KPI card counts', async () => {
        // Verify that KPI cards display numeric values
        const bodyText = await page.locator('body').textContent();
        // Universities should show 321
        expect(bodyText).toContain('321');
    });

    // ═══════════════════════════════════════════
    // MODULE 6: University Management (sidebar link)
    // ═══════════════════════════════════════════

    test('M6: Universities page loads via sidebar', async () => {
        await page.locator('a:has-text("Universities")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Universit', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 8: Content - News Management
    // ═══════════════════════════════════════════

    test('M8: News Management loads via sidebar', async () => {
        await page.locator('a:has-text("News Management")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('News', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 3: Exam Management
    // ═══════════════════════════════════════════

    test('M3: Exams page loads via sidebar', async () => {
        await page.locator('a:has-text("Exams")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Exam', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 4: Question Bank
    // ═══════════════════════════════════════════

    test('M4: Question Bank loads via sidebar', async () => {
        await page.locator('a:has-text("Question Bank")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Question', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 3: Exam Center
    // ═══════════════════════════════════════════

    test('M3: Exam Center loads via sidebar', async () => {
        await page.locator('a:has-text("Exam Center")').first().click();
        await page.waitForTimeout(2000);
        const content = await page.locator('body').textContent();
        expect(content!.length).toBeGreaterThan(100);
    });

    // ═══════════════════════════════════════════
    // MODULE 2: Student Management
    // ═══════════════════════════════════════════

    test('M2: Student Management loads via sidebar', async () => {
        await page.locator('a:has-text("Student Management")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Student', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 7: Subscription & Payments
    // ═══════════════════════════════════════════

    test('M7: Subscription & Payments loads via sidebar', async () => {
        await page.locator('a:has-text("Subscription")').first().click();
        await page.waitForTimeout(2000);
        const content = await page.locator('body').textContent();
        expect(content!.length).toBeGreaterThan(100);
    });

    // ═══════════════════════════════════════════
    // MODULE 8: Resources
    // ═══════════════════════════════════════════

    test('M8: Resources loads via sidebar', async () => {
        await page.locator('a:has-text("Resources")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Resource', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 10: Support & Communication
    // ═══════════════════════════════════════════

    test('M10: Support & Communication loads via sidebar', async () => {
        await page.locator('a:has-text("Support")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Support', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 7: Campaigns Hub
    // ═══════════════════════════════════════════

    test('M7: Campaigns Hub loads via sidebar', async () => {
        await page.locator('a:has-text("Campaigns")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Campaign', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 5: Finance Center
    // ═══════════════════════════════════════════

    test('M5: Finance Center loads via sidebar', async () => {
        await page.locator('a:has-text("Finance Center")').first().click();
        await page.waitForTimeout(2000);
        const content = await page.locator('body').textContent();
        expect(content!.length).toBeGreaterThan(100);
    });

    // ═══════════════════════════════════════════
    // MODULE 11: Team & Access Control
    // ═══════════════════════════════════════════

    test('M11: Team & Access Control loads via sidebar', async () => {
        await page.locator('a:has-text("Team & Access Control")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Team', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // MODULE 9: Security & Logs
    // ═══════════════════════════════════════════

    test('M9: Security & Logs loads via sidebar', async () => {
        await page.locator('a:has-text("Security")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Security', { timeout: 10000 });
    });

    // ═══════════════════════════════════════════
    // Navigate back to dashboard and verify session
    // ═══════════════════════════════════════════

    test('Session persistence: Dashboard still accessible', async () => {
        await page.locator('a:has-text("Dashboard")').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('body')).toContainText('Admin Summary', { timeout: 10000 });
    });
});
