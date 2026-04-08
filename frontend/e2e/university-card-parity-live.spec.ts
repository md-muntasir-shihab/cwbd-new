import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy } from './helpers';

function attachDialogGuard(page: Page) {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
        dialogs.push(`${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss().catch(() => undefined);
    });
    return dialogs;
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForUniversityCards(page: Page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await expect(page.locator('[data-university-card-id]').first()).toBeVisible({ timeout: 15000 });
}

async function pickCard(page: Page) {
    const withProgress = page.locator('[data-university-card-id]').filter({ hasText: /\b\d+\sday(?:s)?\sleft\b|Closes today|Closed|Starts in \d+ days|Dates TBD/i });
    if (await withProgress.count()) {
        return withProgress.first();
    }
    return page.locator('[data-university-card-id]').first();
}

async function expectClassicCardSignals(card: Locator) {
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Est\./i);
    await expect(card).toContainText(/Application/i);
    await expect(card).toContainText(/Upcoming Exam/i);
    await expect(card.getByTestId('university-card-status-indicator')).toBeVisible();

    const detailsAction = card.locator('[data-testid="university-card-details"]').first();
    await expect(detailsAction).toBeVisible();
}

async function expectDeadlineCopy(page: Page) {
    await expect(page.locator('[data-university-card-id]').filter({ hasText: /\b\d+\sday(?:s)?\sleft\b|Closes today|Closed|Starts in \d+ days|Dates TBD/i }).first()).toBeVisible();
    await expect(page.locator('[data-university-card-id]').filter({ hasText: /% elapsed/i })).toHaveCount(0);
}

async function expectClusterFilterVisible(page: Page) {
    const visibleClusterLabel = page.locator('label:visible').filter({ hasText: /^Cluster Group$/ });
    const isMobile = (page.viewportSize()?.width || 0) < 768;
    if (!isMobile) {
        await expect(visibleClusterLabel.first()).toBeVisible();
        return;
    }

    await page.getByRole('button', { name: /filters/i }).click();
    await expect(visibleClusterLabel.first()).toBeVisible();
    await page.getByRole('button', { name: /apply filters/i }).click();
}

function toSlug(value: string) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function resolveBrowseRoutes(request: APIRequestContext) {
    const homeResponse = await request.get('/api/home');
    expect(homeResponse.ok(), await homeResponse.text()).toBeTruthy();
    const homeBody = await homeResponse.json();

    const categorySlug = String(
        homeBody?.featuredCategories?.[0]?.slug
        || homeBody?.deadlineCategories?.[0]?.slug
        || homeBody?.upcomingExamCategories?.[0]?.slug
        || toSlug(homeBody?.universityCategories?.[0]?.categoryName || ''),
    ).trim();

    const clusterName = String(
        homeBody?.featuredClusters?.[0]?.name
        || homeBody?.deadlineClusters?.[0]?.name
        || homeBody?.upcomingExamClusters?.[0]?.name
        || homeBody?.universityCategories?.find?.((item: { clusterGroups?: string[] }) => Array.isArray(item?.clusterGroups) && item.clusterGroups.length > 0)?.clusterGroups?.[0]
        || '',
    ).trim();

    const clusterSlug = String(
        homeBody?.featuredClusters?.[0]?.slug
        || homeBody?.deadlineClusters?.[0]?.slug
        || homeBody?.upcomingExamClusters?.[0]?.slug
        || toSlug(clusterName),
    ).trim();

    expect(categorySlug, 'Unable to resolve a public category route from live home data').toBeTruthy();
    expect(clusterSlug, 'Unable to resolve a public cluster route from live home data').toBeTruthy();

    return {
        categoryHref: `/universities/category/${categorySlug}`,
        clusterHref: `/universities/cluster/${clusterSlug}`,
        clusterName,
    };
}

test.describe('University Card Parity Live', () => {
    test('main, category, and cluster pages keep the same classic card signals and no native dialogs', async ({ page, request }) => {
        const tracker = attachHealthTracker(page);
        const dialogs = attachDialogGuard(page);
        const { categoryHref, clusterHref, clusterName } = await resolveBrowseRoutes(request);

        await page.goto('/universities');
        await waitForUniversityCards(page);
        await expectClusterFilterVisible(page);
        const mainCard = await pickCard(page);
        await expectClassicCardSignals(mainCard);
        await expectDeadlineCopy(page);
        await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
        await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
        const mainVariant = await mainCard.getAttribute('data-university-card-variant');

        await page.goto(categoryHref);
        await waitForUniversityCards(page);
        await expect(page).toHaveURL(/\/universities\/category\//);
        const categoryCard = await pickCard(page);
        await expectClassicCardSignals(categoryCard);
        await expectDeadlineCopy(page);
        await expect(categoryCard).toHaveAttribute('data-university-card-variant', mainVariant || '');

        await page.goto(clusterHref);
        await waitForUniversityCards(page);
        await expect(page).toHaveURL(/\/universities\/cluster\//);
        const clusterCard = await pickCard(page);
        await expectClassicCardSignals(clusterCard);
        await expectDeadlineCopy(page);
        await expect(page.locator('[data-university-card-id]').filter({ hasText: new RegExp(escapeRegex(clusterName), 'i') }).first()).toBeVisible();
        await expect(clusterCard).toHaveAttribute('data-university-card-variant', mainVariant || '');

        await expectPageHealthy(page, tracker);
        expect(dialogs, `Native browser dialogs appeared:\n${dialogs.join('\n')}`).toEqual([]);
        tracker.detach();
    });
});
