import { expect, test } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy, loginAsAdmin } from './helpers';

async function waitForAdminAccess(page: Parameters<typeof loginAsAdmin>[0]) {
    const accessGate = page.getByText(/Checking admin access/i).first();
    if (await accessGate.isVisible().catch(() => false)) {
        await accessGate.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    }
}

test.describe('Admin team/security smoke', () => {
    test('security center and team access consoles render core sections', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.includes('mobile'), 'Team/security smoke runs on desktop project only.');

        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsAdmin(page);
        const tracker = attachHealthTracker(page);

        await page.goto('/__cw_admin__/settings/security-center', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/settings\/security-center/);
        await expect(page.getByRole('heading', { name: /Security Center/i }).first()).toBeVisible();
        await expect(page.getByText(/Security Overview/i)).toBeVisible();
        await expect(page.getByText(/Failed Logins \(24h\)/i)).toBeVisible();

        await page.goto('/__cw_admin__/team/members', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/members/);
        await expect(page.getByRole('heading', { name: /Team Members/i }).first()).toBeVisible();
        await expect(page.getByPlaceholder(/Search members/i)).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Add Member/i }).or(page.getByText(/No team members yet/i)),
        ).toBeVisible();

        await page.goto('/__cw_admin__/team/roles', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/roles/);
        await expect(page.getByRole('heading', { name: /^Roles$/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Create Role/i })).toBeVisible();

        await page.goto('/__cw_admin__/team/permissions', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/permissions/);
        await expect(page.getByRole('heading', { name: /Permissions Matrix/i }).first()).toBeVisible();
        await expect(page.locator('select.admin-input').first()).toBeVisible();

        await page.goto('/__cw_admin__/team/approval-rules', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/approval-rules/);
        await expect(page.getByRole('heading', { name: /Approval Rules/i }).first()).toBeVisible();
        await expect(page.getByText(/Requires approval/i).first()).toBeVisible();

        await page.goto('/__cw_admin__/team/security', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/security/);
        await expect(page.getByRole('heading', { name: /Login & Security/i }).first()).toBeVisible();
        await expect(page.getByText(/Password Reset Required/i)).toBeVisible();

        await page.goto('/__cw_admin__/team/invites', { waitUntil: 'domcontentloaded' });
        await waitForAdminAccess(page);
        await expect(page).toHaveURL(/\/__cw_admin__\/team\/invites/);
        await expect(page.getByRole('heading', { name: /Invite \/ Access Requests/i }).first()).toBeVisible();
        await expect(
            page.getByText(/No pending invites/i).or(page.getByText(/Expires:/i).first()),
        ).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });
});
