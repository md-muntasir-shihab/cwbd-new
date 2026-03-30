import { expect, test } from '@playwright/test';

import { communicationHubShot, ensureCommunicationHubQaDir, writeCommunicationHubArtifact } from './communicationHubAuditHelpers';
import { attachHealthTracker, expectPageHealthy, loginAsAdmin } from './helpers';

type AuditCheckpoint = {
  name: string;
  status: 'passed' | 'failed';
  screenshot: string;
  note?: string;
};

async function runCheckpoint(
  page: import('@playwright/test').Page,
  results: AuditCheckpoint[],
  name: string,
  action: () => Promise<void>,
) {
  try {
    await action();
    await communicationHubShot(page, name);
    results.push({ name, status: 'passed', screenshot: `${name}.png` });
  } catch (error) {
    const failedName = `${name}-failed`;
    await communicationHubShot(page, failedName);
    results.push({
      name,
      status: 'failed',
      screenshot: `${failedName}.png`,
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

test.describe('Campaign Hub Browser Audit', () => {
  test.beforeEach(async ({ page }) => {
    ensureCommunicationHubQaDir();
    await loginAsAdmin(page);
  });

  test('dashboard and campaign lists', async ({ page }) => {
    const tracker = attachHealthTracker(page);
    const results: AuditCheckpoint[] = [];

    await runCheckpoint(page, results, '01-dashboard', async () => {
      await page.goto('/__cw_admin__/campaigns', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Queue and delivery health/i).first()).toBeVisible();
    });

    await runCheckpoint(page, results, '02-campaigns-list', async () => {
      await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
      await expect(page.getByRole('columnheader', { name: /Name/i })).toBeVisible();
    });

    await expectPageHealthy(page, tracker);
    tracker.detach();
    writeCommunicationHubArtifact('audit-dashboard-and-lists.json', results);
    expect(results.filter((item) => item.status === 'failed')).toEqual([]);
  });

  test('new campaign flow', async ({ page }) => {
    const tracker = attachHealthTracker(page);
    const results: AuditCheckpoint[] = [];

    await runCheckpoint(page, results, '03-new-campaign-audience', async () => {
      await page.goto('/__cw_admin__/campaigns/new', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Select Audience/i })).toBeVisible({ timeout: 15000 });
      await page.locator('input').first().fill('Communication Hub QA Campaign');
    });

    await runCheckpoint(page, results, '04-new-campaign-content', async () => {
      await page.getByRole('button', { name: /Next: Content/i }).click();
      await expect(page.getByText(/Message Content/i)).toBeVisible();
      await page.locator('textarea').first().fill('Hello {student_name}, communication hub QA preview only.');
    });

    await runCheckpoint(page, results, '05-new-campaign-delivery', async () => {
      await page.getByRole('button', { name: /Preview & Estimate/i }).click();
      await expect(page.getByText(/Delivery Options/i)).toBeVisible();
    });

    await runCheckpoint(page, results, '06-new-campaign-review', async () => {
      await page.getByRole('button', { name: /Preview & Estimate$/i }).click();
      await expect(page.getByText(/Review & Send/i)).toBeVisible({ timeout: 20000 });
    });

    await expectPageHealthy(page, tracker);
    tracker.detach();
    writeCommunicationHubArtifact('audit-new-campaign-flow.json', results);
    expect(results.filter((item) => item.status === 'failed')).toEqual([]);
  });

  test('subscription contact center', async ({ page }) => {
    const tracker = attachHealthTracker(page);
    const results: AuditCheckpoint[] = [];

    await runCheckpoint(page, results, '07-contact-overview', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=overview', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Subscription Contact Center/i }).nth(1)).toBeVisible();
      await expect(page.getByText(/single audience source for copy, export, guardian-aware handoff/i)).toBeVisible();
    });

    await runCheckpoint(page, results, '08-contact-members', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=members', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/one table, one filter bar, one bulk action bar/i)).toBeVisible();
    });

    await runCheckpoint(page, results, '09-contact-outreach', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=outreach', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Personal Outreach Mode/i })).toBeVisible();
    });

    await runCheckpoint(page, results, '10-contact-export', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=export', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Export \/ Copy Center/i })).toBeVisible();
      await page.getByRole('button', { name: /Preview output/i }).click();
      await expect(page.locator('textarea')).toBeVisible();
    });

    await runCheckpoint(page, results, '11-contact-presets', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=presets', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Saved Format Presets/i })).toBeVisible();
    });

    await runCheckpoint(page, results, '12-contact-logs', async () => {
      await page.goto('/__cw_admin__/campaigns/contact-center?tab=logs', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Logs \/ History/i })).toBeVisible();
    });

    await expectPageHealthy(page, tracker);
    tracker.detach();
    writeCommunicationHubArtifact('audit-contact-center.json', results);
    expect(results.filter((item) => item.status === 'failed')).toEqual([]);
  });

  test('templates providers triggers and notifications', async ({ page }) => {
    const tracker = attachHealthTracker(page);
    const results: AuditCheckpoint[] = [];

    await runCheckpoint(page, results, '13-templates', async () => {
      await page.goto('/__cw_admin__/campaigns/templates', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Templates/i })).toBeVisible();
    });

    await runCheckpoint(page, results, '14-providers', async () => {
      await page.goto('/__cw_admin__/campaigns?view=providers', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Provider Configuration/i })).toBeVisible();
    });

    await runCheckpoint(page, results, '15-triggers', async () => {
      await page.goto('/__cw_admin__/campaigns?view=triggers', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Smart Auto-Triggers/i })).toBeVisible();
      await expect(page.getByText(/Configure trigger channels, audience mode, delay, quiet-hours handling, and template overrides/i)).toBeVisible();
    });

    await runCheckpoint(page, results, '16-notifications', async () => {
      await page.goto('/__cw_admin__/campaigns?view=notifications', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Notification operations studio/i })).toBeVisible();
    });

    await expectPageHealthy(page, tracker);
    tracker.detach();
    writeCommunicationHubArtifact('audit-templates-providers-triggers-notifications.json', results);
    expect(results.filter((item) => item.status === 'failed')).toEqual([]);
  });

  test('logs settings and aliases', async ({ page }) => {
    const tracker = attachHealthTracker(page);
    const results: AuditCheckpoint[] = [];

    await runCheckpoint(page, results, '17-delivery-logs', async () => {
      await page.goto('/__cw_admin__/campaigns/logs', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('columnheader', { name: /Recipient/i })).toBeVisible();
    });

    await runCheckpoint(page, results, '18-settings', async () => {
      await page.goto('/__cw_admin__/campaigns/settings', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Send Limits/i)).toBeVisible();
    });

    await runCheckpoint(page, results, '19-notification-center-alias', async () => {
      await page.goto('/__cw_admin__/notification-center', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\?view=notifications/);
    });

    await runCheckpoint(page, results, '20-trigger-alias', async () => {
      await page.goto('/__cw_admin__/notifications/triggers', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/__cw_admin__\/campaigns\?view=triggers/);
    });

    await expectPageHealthy(page, tracker);
    tracker.detach();
    writeCommunicationHubArtifact('audit-logs-settings-aliases.json', results);
    expect(results.filter((item) => item.status === 'failed')).toEqual([]);
  });
});
