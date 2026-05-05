import { test, expect } from '@playwright/test';

test.describe('Module 3: Exam Management System V2', () => {
    test('Exam List page loads correctly', async ({ page }) => {
        await page.goto('/__cw_admin__/exams');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Exam/i);
    });

    test('Hierarchy Manager page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/exam-center/hierarchy');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Hierarchy|Category|Topic/i);
    });

    test('Exam Builder Wizard renders', async ({ page }) => {
        await page.goto('/__cw_admin__/exam-center/builder');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Builder|Exam|Create/i);
    });
});
