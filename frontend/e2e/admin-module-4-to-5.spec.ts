import { test, expect } from '@playwright/test';

test.describe('Module 4: Question Bank Management', () => {
    test('Question Bank loads', async ({ page }) => {
        await page.goto('/__cw_admin__/question-bank');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Question/i);
    });
});

test.describe('Module 5: Finance Management', () => {
    test('Finance Dashboard loads', async ({ page }) => {
        await page.goto('/__cw_admin__/finance-center/dashboard');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Revenue|Finance|Total/i);
    });

    test('Finance Transactions page', async ({ page }) => {
        await page.goto('/__cw_admin__/finance-center/transactions');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Transaction/i);
    });

    test('Finance Invoices page', async ({ page }) => {
        await page.goto('/__cw_admin__/finance-center/invoices');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Invoice/i);
    });

    test('Finance Refunds page', async ({ page }) => {
        await page.goto('/__cw_admin__/finance-center/refunds');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Refund/i);
    });
});
