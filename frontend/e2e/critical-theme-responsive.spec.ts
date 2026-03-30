import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';
import {
    applyTheme,
    expectNoCriticalHorizontalOverflow,
    RESPONSIVE_VIEWPORTS,
    THEMES,
} from './responsiveTheme';

async function isAdminLoginVisible(page: Parameters<typeof test>[0]['page']) {
    if (page.url().includes('/__cw_admin__/login')) return true;
    return page.getByRole('button', { name: /Sign In to Admin Panel/i }).first().isVisible().catch(() => false);
}

async function goToAdminRoute(page: Parameters<typeof test>[0]['page'], path: string) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const loadingAccess = page.getByText(/Checking admin access/i).first();
    if (await loadingAccess.isVisible().catch(() => false)) {
        await expect(loadingAccess).not.toBeVisible({ timeout: 15000 });
    }
    if (await isAdminLoginVisible(page)) {
        await loginAsAdmin(page, 'desktop');
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        if (await loadingAccess.isVisible().catch(() => false)) {
            await expect(loadingAccess).not.toBeVisible({ timeout: 15000 });
        }
    }
}

test.describe('Critical Theme + Responsive Matrix', () => {
    test('public home stays usable across required breakpoints in light/dark', async ({ page }) => {
        test.setTimeout(180_000);
        for (const theme of THEMES) {
            for (const viewport of RESPONSIVE_VIEWPORTS) {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.goto('/', { waitUntil: 'domcontentloaded' });
                await applyTheme(page, theme);
                await page.reload({ waitUntil: 'domcontentloaded' });

                await expect(page.locator('body')).toBeVisible();
                await expect(page.getByRole('link', { name: /^Home$/i }).first()).toBeVisible();
                if (viewport.width < 1024) {
                    await expect(page.getByRole('button', { name: /Open menu|Toggle menu|Open navigation/i }).first()).toBeVisible();
                } else {
                    await expect(page.getByRole('link', { name: /^News$/i }).first()).toBeVisible();
                }
                await expectNoCriticalHorizontalOverflow(page, `/ ${theme} ${viewport.width}`);
            }
        }
    });

    test('admin news/finance/exams remain usable across required breakpoints in light/dark', async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsAdmin(page, 'desktop');

        for (const theme of THEMES) {
            await applyTheme(page, theme);

            for (const viewport of RESPONSIVE_VIEWPORTS) {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });

                await goToAdminRoute(page, '/__cw_admin__/news/pending');
                await expect(page.getByRole('heading', { name: /Items to Review/i }).first()).toBeVisible({ timeout: 15000 });
                await expect(page.getByRole('button', { name: /More filters/i })).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/__cw_admin__/news/pending ${theme} ${viewport.width}`);

                await goToAdminRoute(page, '/__cw_admin__/news/dashboard');
                await expect(page.getByRole('heading', { name: /Overview|Start with the task you need/i }).first()).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/__cw_admin__/news/dashboard ${theme} ${viewport.width}`);

                await goToAdminRoute(page, '/__cw_admin__/finance/dashboard');
                await expect(page).toHaveURL(/\/__cw_admin__\/finance\/dashboard/);
                await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/__cw_admin__/finance/dashboard ${theme} ${viewport.width}`);

                await goToAdminRoute(page, '/__cw_admin__/exams');
                await expect(page.getByRole('heading', { name: /Exams|Exam Center/i }).first()).toBeVisible({ timeout: 15000 });
                if (viewport.width >= 1024) {
                    await expect(page.locator('aside')).toHaveCount(1);
                }
                await expectNoCriticalHorizontalOverflow(page, `/__cw_admin__/exams ${theme} ${viewport.width}`);
            }
        }
    });
});
