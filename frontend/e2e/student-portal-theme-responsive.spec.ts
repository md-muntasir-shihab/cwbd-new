import { expect, test } from '@playwright/test';
import { loginAsStudent } from './helpers';

const VIEWPORTS = [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 900 },
] as const;

const THEMES = ['light', 'dark'] as const;

async function applyTheme(page: Parameters<typeof test>[0]['page'], theme: 'light' | 'dark') {
    await page.evaluate((nextTheme) => {
        window.localStorage.setItem('campusway_theme', nextTheme);
        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, theme);
}

async function expectNoCriticalHorizontalOverflow(page: Parameters<typeof test>[0]['page'], hint: string) {
    const overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(overflowPx, `${hint}: horizontal overflow detected`).toBeLessThanOrEqual(24);
}

test.describe('Student Portal Theme + Responsive Matrix', () => {
    test('dashboard, profile, security, and support remain usable across required breakpoints in light/dark', async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsStudent(page, 'desktop');

        for (const theme of THEMES) {
            await applyTheme(page, theme);

            for (const viewport of VIEWPORTS) {
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
                await expect(page.getByRole('heading', { name: /Support/i }).first()).toBeVisible({ timeout: 15000 });
                await expectNoCriticalHorizontalOverflow(page, `/support ${theme} ${viewport.width}`);
            }
        }
    });
});
