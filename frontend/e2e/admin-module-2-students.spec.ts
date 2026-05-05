import { test, expect } from '@playwright/test';

test.describe('Module 2: Student Management System', () => {
    test('Student Management page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/student-management/list');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Student/i);
    });

    test('Student Groups page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/student-management/groups');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Group|Student/i);
    });
});
