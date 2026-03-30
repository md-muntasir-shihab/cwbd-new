import { expect, test } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy, loginAsStudent } from './helpers';

test.describe('Student Smoke', () => {
    test('student can login and open dashboard/profile', async ({ page }) => {
        const tracker = attachHealthTracker(page);
        await loginAsStudent(page);

        await page.getByTestId('student-entry-trigger').click();
        await expect(page.getByTestId('student-entry-card')).toBeVisible();
        await expect(page.getByTestId('student-entry-card').getByText(/Profile Readiness/i)).toBeVisible();
        await expect(page.getByText(/My Subscription/i).first()).toBeVisible();
        await expect(page.locator('text=Profile Completion').first()).toBeVisible();

        await page.goto('/profile');
        await expect(page.getByRole('heading', { name: /Profile & Documents/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Save Changes/i })).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });
});
