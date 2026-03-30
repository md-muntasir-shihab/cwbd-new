import { expect, test } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy, loginAsAdmin, loginAsStudent } from './helpers';

test.describe('Student/Admin hub regression', () => {
    test('student mobile navigation drawer exposes all routes', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loginAsStudent(page, 'mobile');

        const tracker = attachHealthTracker(page);
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /Open student navigation/i }).click();

        const drawer = page.locator('aside').filter({ hasText: /Quick Navigation/i }).last();
        await expect(drawer.getByText(/Quick Navigation/i)).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Payments', exact: true })).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
        await expect(drawer.getByRole('link', { name: 'Support', exact: true })).toBeVisible();

        await drawer.getByRole('link', { name: 'Resources', exact: true }).click();
        await expect(page).toHaveURL(/\/student\/resources/);
        await expect(page.getByRole('button', { name: /More student navigation/i })).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('admin resource settings, contact center, approvals, and security pages render the new responsive shells', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.includes('mobile'), 'Admin shell regression runs on desktop project only.');
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsAdmin(page);

        const tracker = attachHealthTracker(page);

        await page.goto('/__cw_admin__/settings/resource-settings', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: /Resource Settings/i })).toBeVisible();
        await expect(page.getByText(/Branding & Hero/i)).toBeVisible();
        await expect(page.getByText(/Visibility & Layout/i)).toBeVisible();
        await expect(page.getByText(/Access & Policy/i)).toBeVisible();

        await page.goto('/__cw_admin__/campaigns/contact-center', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: /Subscription Contact Center/i }).last()).toBeVisible();
        await expect(page.getByText(/Overview/i).first()).toBeVisible();

        await page.goto('/__cw_admin__/approvals', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: /Approval Center/i })).toBeVisible();
        const emptyState = await page.getByText(/All caught up/i).isVisible().catch(() => false);
        if (!emptyState) {
            await page.locator('button').filter({ hasText: /Ready to review|Waiting for another admin/i }).first().click().catch(() => undefined);
        }

        await page.goto('/__cw_admin__/settings/security-center', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(/Security Overview/i)).toBeVisible();
        const activeSessionsCard = page.getByText('Active Sessions').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        await expect(activeSessionsCard.getByRole('button')).toHaveCount(0);

        await page.goto('/__cw_admin__/dashboard', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(/payments cleared today/i).first()).toBeVisible();
        await expect(page.getByText(/active staff/i).first()).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });
});
