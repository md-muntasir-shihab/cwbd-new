import { test, expect } from '@playwright/test';

test.describe('Module 1: Core Dashboard & Analytics', () => {
    test('Admin Dashboard loads all statistics widgets', async ({ page }) => {
        await page.goto('/__cw_admin__/dashboard');
        
        // Wait for the loader to clear
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        
        // Check for key KPI elements
        await expect(page.locator('body')).toContainText(/UNIVERSITIES|Universities/i);
        await expect(page.locator('body')).toContainText(/STUDENT MANAGEMENT|Student/i);
    });

    test('Analytics Dashboard V2 Loads', async ({ page }) => {
        await page.goto('/__cw_admin__/analytics');
        await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });
        
        // Check if analytics page has charts or data
        await expect(page.locator('body')).toContainText(/Analytic|Dashboard|Chart/i);
    });
});
