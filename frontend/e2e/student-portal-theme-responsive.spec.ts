import { expect, test } from '@playwright/test';
import { loginAsStudent } from './helpers';
import {
    applyTheme,
    expectNoCriticalHorizontalOverflow,
    RESPONSIVE_VIEWPORTS,
    THEMES,
} from './responsiveTheme';

test.describe('Student Portal Theme + Responsive Matrix', () => {
    test('dashboard, profile, security, and support remain usable across required breakpoints in light/dark', async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsStudent(page, 'desktop');

        for (const theme of THEMES) {
            await applyTheme(page, theme);

            for (const viewport of RESPONSIVE_VIEWPORTS) {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });

                await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
                await page.getByTestId('student-entry-trigger').click();
                await expect(page.getByTestId('student-entry-card')).toBeVisible({ timeout: 15000 });
                await expect(page.getByTestId('student-entry-card').getByText(/Profile Readiness/i)).toBeVisible();
                await expectNoCriticalHorizontalOverflow(page, `/dashboard ${theme} ${viewport.width}`);

                await page.goto('/profile', { waitUntil: 'domcontentloaded' });
                await expect(page.getByRole('heading', { name: /Profile & Documents/i })).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/profile ${theme} ${viewport.width}`);

                await page.goto('/profile/security', { waitUntil: 'domcontentloaded' });
                await expect(page.getByRole('heading', { name: /Security/i }).first()).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/profile/security ${theme} ${viewport.width}`);

                await page.goto('/support', { waitUntil: 'domcontentloaded' });
                await page.getByText(/Loading page\.\.\./i).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
                await expect(page.getByRole('heading', { name: /Support & Help|Support/i }).first()).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/support ${theme} ${viewport.width}`);
            }
        }
    });
});
