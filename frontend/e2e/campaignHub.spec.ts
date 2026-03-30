import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Communication Hub', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('should navigate to Communication Hub and load all panels', async ({ page }) => {
        await page.goto('/__cw_admin__/campaigns', { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns/);

        await page.getByRole('button', { name: 'Providers', exact: true }).click();
        await expect(page.getByRole('heading', { name: /Provider Configuration/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /\+ Add Provider|Add Provider/i })).toBeVisible();

        await page.getByRole('button', { name: 'Smart Triggers', exact: true }).click();
        await expect(page.getByRole('heading', { name: /Smart Auto-Triggers/i })).toBeVisible();
        await expect(page.getByText(/Configure trigger channels, audience mode, delay, quiet-hours handling, and template overrides/i)).toBeVisible();

        await page.getByRole('button', { name: 'Subscription Contact Center', exact: true }).click();
        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\/contact-center/);
        await expect(page.getByRole('heading', { name: /Subscription Contact Center/i }).nth(1)).toBeVisible();
        await expect(page.getByRole('button', { name: /^Overview$/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Members$/i })).toBeVisible();
        await expect(page.getByText(/single audience source for copy, export, guardian-aware handoff/i)).toBeVisible();
    });

    test('should allow previewing exports and handing off the same audience into a new campaign', async ({ page }) => {
        await page.goto('/__cw_admin__/campaigns/contact-center?tab=export', { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('heading', { name: /Export \/ Copy Center/i })).toBeVisible();
        await expect(page.getByText(/Using all .* filtered audience|Using .* selected members/i)).toBeVisible();

        await page.getByRole('button', { name: /Preview output/i }).click();
        await expect(page.locator('textarea')).toContainText(/\+880|01/);

        await page.goto('/__cw_admin__/campaigns/contact-center', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /Send Campaign/i }).first().click();

        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\/new/);
        await expect(page.getByText(/prefilled from Subscription Contact Center/i)).toBeVisible();
        await expect(page.locator('select').nth(1)).toHaveValue('filter');
    });

    test('should lock selected rows into the campaign handoff instead of treating them as loose include overrides', async ({ page }) => {
        await page.goto('/__cw_admin__/campaigns/contact-center?tab=members', { waitUntil: 'domcontentloaded' });
        const firstCheckbox = page.locator('.space-y-3.px-4.pb-4 input[type="checkbox"]').first();
        await firstCheckbox.check();
        await expect(page.getByText(/^1 selected$/i)).toBeVisible();
        await page.getByRole('button', { name: /Create campaign/i }).click();

        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\/new/);
        await expect(page.getByText(/Selected rows stay locked to 1 member/i)).toBeVisible();

        await page.getByRole('button', { name: /Next: Content/i }).click();
        await page.locator('textarea').first().fill('Selected audience exact handoff test');
        await page.getByRole('button', { name: /Preview & Estimate/i }).click();
        await expect(page.getByText(/Delivery Options/i)).toBeVisible();
        await page.getByRole('button', { name: /Preview & Estimate$/i }).click();

        await expect(page.locator('li').filter({ hasText: /Selected rows locked from Contact Center/i })).toContainText('1');
    });

    test('should consolidate legacy notification routes into Campaign Hub views', async ({ page }) => {
        await page.goto('/__cw_admin__/notification-center', { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\?view=notifications/);
        await expect(page.getByRole('heading', { name: /Notification operations studio/i })).toBeVisible();

        await page.goto('/__cw_admin__/notifications/triggers', { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\?view=triggers/);
        await expect(page.getByRole('heading', { name: /Smart Auto-Triggers/i })).toBeVisible();
    });
});
