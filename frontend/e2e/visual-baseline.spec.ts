import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsStudent } from './helpers';
import { applyTheme } from './responsiveTheme';

async function settleForVisualSnapshot(page: import('@playwright/test').Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.addStyleTag({
        content: `
            *,
            *::before,
            *::after {
                animation-duration: 0s !important;
                animation-delay: 0s !important;
                transition-duration: 0s !important;
                transition-delay: 0s !important;
                scroll-behavior: auto !important;
                caret-color: transparent !important;
            }

            canvas,
            video,
            iframe {
                visibility: hidden !important;
            }

            [role="dialog"],
            .fixed.inset-0.z-\\[100\\] {
                display: none !important;
            }
        `,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
}

test.describe('Visual Baseline', () => {
    test.use({
        viewport: { width: 1440, height: 900 },
    });

    test('public home remains visually stable in light and dark', async ({ page }) => {
        test.setTimeout(90_000);

        for (const theme of ['light', 'dark'] as const) {
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await applyTheme(page, theme);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await settleForVisualSnapshot(page);
            await expect(page).toHaveScreenshot(`public-home-${theme}.png`, {
                animations: 'disabled',
                caret: 'hide',
                maxDiffPixelRatio: 0.03,
                timeout: 20_000,
            });
        }
    });

    test('student dashboard shell remains visually stable', async ({ page }) => {
        test.setTimeout(90_000);
        await loginAsStudent(page, 'desktop');
        await applyTheme(page, 'dark');
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await settleForVisualSnapshot(page);
        await expect(page).toHaveScreenshot('student-dashboard-dark.png', {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.04,
            mask: [page.locator('canvas')],
            timeout: 20_000,
        });
    });

    test('admin dashboard shell remains visually stable', async ({ page }) => {
        test.setTimeout(90_000);
        await loginAsAdmin(page, 'desktop');
        await applyTheme(page, 'dark');
        await page.goto('/__cw_admin__/dashboard', { waitUntil: 'domcontentloaded' });
        await settleForVisualSnapshot(page);
        await expect(page).toHaveScreenshot('admin-dashboard-dark.png', {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.04,
            mask: [page.locator('canvas')],
            timeout: 20_000,
        });
    });
});
