import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authFile = join(__dirname, '..', '.playwright-auth', 'admin.json');

setup('authenticate as admin', async ({ page }) => {
    await page.goto('/__cw_admin__/login');
    await page.getByPlaceholder('admin@example.com').fill('admin@campusway.com');
    await page.getByPlaceholder('********').fill('Admin@123456');
    await page.getByRole('button', { name: 'Sign In to Admin Panel' }).click();

    // Wait for the dashboard to fully load
    await page.waitForURL('**/__cw_admin__/dashboard**', { timeout: 15000 });
    
    // Wait for the "Checking admin access..." to disappear
    await expect(page.locator('text=Checking admin access...')).toBeHidden({ timeout: 15000 });

    // Verify we're actually on the dashboard
    await expect(page.locator('body')).toContainText(/Admin Summary|Dashboard/i);

    // Save auth state
    await page.context().storageState({ path: authFile });
});
