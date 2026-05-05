import { test, expect } from '@playwright/test';

test.describe('Module 6: University Management', () => {
    test('Universities page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/universities');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Universit/i);
    });
});

test.describe('Module 7: Subscription & Campaigns', () => {
    test('Subscription Plans page', async ({ page }) => {
        await page.goto('/__cw_admin__/subscription-plans');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Plan|Subscription/i);
    });

    test('Campaigns Hub page', async ({ page }) => {
        await page.goto('/__cw_admin__/campaigns');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Campaign/i);
    });
});

test.describe('Module 8: Content Management', () => {
    test('Resources page loads', async ({ page }) => {
        await page.goto('/__cw_admin__/resources');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Resource/i);
    });

    test('News Console loads', async ({ page }) => {
        await page.goto('/__cw_admin__/news');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/News/i);
    });

    test('Legal Pages load', async ({ page }) => {
        await page.goto('/__cw_admin__/legal');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Legal|Terms|Privacy/i);
    });
});

test.describe('Module 9: Settings & Configuration', () => {
    test('Settings Center loads', async ({ page }) => {
        await page.goto('/__cw_admin__/settings');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Setting|Configuration|Control/i);
    });

    test('Security Center loads', async ({ page }) => {
        await page.goto('/__cw_admin__/settings/security-center');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Security/i);
    });

    test('Site Settings loads', async ({ page }) => {
        await page.goto('/__cw_admin__/settings/site-settings');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('body')).toContainText(/Site|Branding/i);
    });
});
