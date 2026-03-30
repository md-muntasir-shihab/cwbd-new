import { expect, test } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy } from './helpers';

const NEXT_ROUTES = [
    { path: '/', readyText: /CampusWay|News|Student|Admin/i },
    { path: '/news', readyText: /News|Latest|CampusWay/i },
    { path: '/student', readyText: /Student|Dashboard|Login/i },
    { path: '/admin-dashboard', readyText: /Admin|Dashboard|Login/i },
] as const;

test.describe('Next Hybrid Smoke', () => {
    test('core hybrid routes render without critical client or API failures', async ({ page }) => {
        test.setTimeout(120_000);

        for (const route of NEXT_ROUTES) {
            const tracker = attachHealthTracker(page);
            await page.goto(route.path, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('body')).toBeVisible();
            await expect(page.getByText(route.readyText).first()).toBeVisible({ timeout: 20_000 });
            await expectPageHealthy(page, tracker);
            tracker.detach();
        }
    });
});
