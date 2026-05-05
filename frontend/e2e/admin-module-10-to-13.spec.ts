import { test, expect } from '@playwright/test';

test.describe('Module 10: Support & Communication', () => {
    test('Support Center loads', async ({ page }) => {
        await page.goto('/__cw_admin__/support');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Support/i);
    });

    test('Notifications Center loads', async ({ page }) => {
        await page.goto('/__cw_admin__/notifications');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Notification/i);
    });
});

test.describe('Module 11: Team & Access Control', () => {
    test('Team Access Console loads', async ({ page }) => {
        await page.goto('/__cw_admin__/team');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Team/i);
    });
});

test.describe('Module 12: Approvals & Reports', () => {
    test('Approvals page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/approvals/actions');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Approval/i);
    });

    test('Reports page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/reports');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Report/i);
    });
});

test.describe('Module 13: Student Settings', () => {
    test('Student Settings page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/students');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Student/i);
    });
});
