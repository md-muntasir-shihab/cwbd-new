import { expect, test } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy } from './helpers';

const responsiveWidths = [
    { name: 'w360', width: 360, height: 800 },
    { name: 'w390', width: 390, height: 844 },
    { name: 'w768', width: 768, height: 1024 },
    { name: 'w1024', width: 1024, height: 768 },
    { name: 'w1440', width: 1440, height: 900 },
] as const;

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, hint: string) {
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1);
    expect(hasOverflow, `${hint}: horizontal overflow detected`).toBeFalsy();
}

function universityCard(page: import('@playwright/test').Page, name: string) {
    return page.locator('[data-university-card-id]').filter({ hasText: name }).first();
}

function visibleUniversitySelect(page: import('@playwright/test').Page, optionLabel: string) {
    return page
        .locator('select:visible')
        .filter({ has: page.locator('option', { hasText: optionLabel }) })
        .first();
}

function visibleUniversitySearch(page: import('@playwright/test').Page) {
    return page.locator('input[placeholder="Search by name or short form..."]:visible').first();
}

async function openUniversityFilters(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /Open (filter panel|more filters)/i }).click();
}

test.describe('Open Universities Full Audit', () => {
    test('home renders featured university and cluster sections with working navigation', async ({ page }) => {
        const tracker = attachHealthTracker(page);
        await page.goto('/');
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

        await expect(page.getByRole('heading', { name: /Featured Universities/i })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: /Featured Clusters/i })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: /Application Deadlines/i })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: /Upcoming Exams/i })).toBeVisible({ timeout: 15000 });

        const highlightedCategoryCard = page.getByTestId('highlighted-category-card').first();
        await expect(highlightedCategoryCard).toBeVisible();
        const highlightedCategoryCards = page.getByTestId('highlighted-category-card');
        expect(await highlightedCategoryCards.count()).toBeGreaterThan(0);
        await expect(highlightedCategoryCard).toContainText(/Highlighted Category/i);
        await expect(highlightedCategoryCard).toContainText(/Home Highlight/i);

        const highlightedCategoryHref = await highlightedCategoryCard.getAttribute('href');
        expect(highlightedCategoryHref).toBeTruthy();

        const featuredClusterLink = page.locator('a[href^="/universities/cluster/"]').first();
        const featuredClusterHref = await featuredClusterLink.getAttribute('href');
        expect(featuredClusterHref).toBeTruthy();

        await highlightedCategoryCard.click();
        await expect(page).toHaveURL(new RegExp(escapeRegex(String(highlightedCategoryHref))));
        await expect(page.getByRole('heading').first()).toBeVisible();

        await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expect(featuredClusterLink).toBeVisible();
        await featuredClusterLink.click();
        await expect(page).toHaveURL(new RegExp(escapeRegex(String(featuredClusterHref))));
        await expect(page.getByRole('heading').first()).toBeVisible();

        await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole('heading', { name: /Featured Universities/i })).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('universities list supports search, category, cluster, sort, and back-refresh state', async ({ page }) => {
        const tracker = attachHealthTracker(page);
        await page.goto('/universities');
        const isMobile = (page.viewportSize()?.width ?? 1440) < 768;
        const sortSelect = visibleUniversitySelect(page, 'Name (A-Z)');

        await expect(sortSelect).toHaveValue('name_asc');
        await expect(page.locator('[data-university-card-id]').first()).toBeVisible();

        const categoryTabs = page.getByTestId('university-category-tab');
        const tabCount = await categoryTabs.count();
        expect(tabCount).toBeGreaterThan(1);

        const previousCategoryTab = categoryTabs.nth(0);
        const nextCategoryTab = categoryTabs.nth(1);
        const nextCategoryLabel = (await nextCategoryTab.textContent()) || '';
        await nextCategoryTab.click();
        await expect(nextCategoryTab).toHaveAttribute('aria-selected', 'true');
        await expect(nextCategoryTab).toContainText(new RegExp(escapeRegex(nextCategoryLabel.trim()), 'i'));
        await expect(page.locator('[data-university-card-id]').first()).toBeVisible();

        await previousCategoryTab.click();
        await expect(previousCategoryTab).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('[data-university-card-id]').first()).toBeVisible();

        await page.getByTestId('university-category-tab').filter({ hasText: /Science & Technology/i }).first().click();
        if (isMobile) {
            await openUniversityFilters(page);
        }
        const searchInput = visibleUniversitySearch(page);
        await searchInput.fill('BUET');
        await expect(universityCard(page, 'Bangladesh University of Engineering and Technology')).toBeVisible();

        const clusterSelect = visibleUniversitySelect(page, 'Engineering Alliance');
        await clusterSelect.selectOption('Engineering Alliance');

        const nameDescSelect = visibleUniversitySelect(page, 'Name (Z-A)');
        await nameDescSelect.selectOption('name_desc');
        if (isMobile) {
            await page.getByRole('button', { name: /Apply Filters/i }).click();
        }

        const buetCard = universityCard(page, 'Bangladesh University of Engineering and Technology');
        await expect(buetCard).toHaveAttribute('data-university-card-variant', 'classic');
        await expect(buetCard).toContainText(/Science & Technology/i);
        await expect(buetCard).toContainText(/Engineering Alliance/i);
        await expect(buetCard.getByTestId('university-card-details')).toBeVisible();
        await expect(buetCard.getByTestId('university-card-official')).toBeVisible();
        await expect(buetCard.getByTestId('university-card-apply')).toBeVisible();

        await buetCard.getByTestId('university-card-details').click();
        await expect(page).toHaveURL(/\/universities\/bangladesh-university-of-engineering-and-technology/);

        await page.goBack();
        await expect(page).toHaveURL(/\/universities/);
        if (isMobile) {
            await openUniversityFilters(page);
        }
        await expect(visibleUniversitySearch(page)).toHaveValue('BUET');
        await expect(visibleUniversitySelect(page, 'Engineering Alliance')).toHaveValue('Engineering Alliance');
        await expect(visibleUniversitySelect(page, 'Name (Z-A)')).toHaveValue('name_desc');
        if (isMobile) {
            await page.getByRole('button', { name: /Apply Filters/i }).click();
        }
        await expect(page).toHaveURL(/q=BUET/);
        await expect(page).toHaveURL(/cluster=Engineering(?:%20|\+)Alliance/);
        await expect(page).toHaveURL(/sort=name_desc/);

        await page.reload();
        if (isMobile) {
            await openUniversityFilters(page);
        }
        await expect(visibleUniversitySearch(page)).toHaveValue('BUET');
        await expect(visibleUniversitySelect(page, 'Engineering Alliance')).toHaveValue('Engineering Alliance');
        await expect(visibleUniversitySelect(page, 'Name (Z-A)')).toHaveValue('name_desc');
        if (isMobile) {
            await page.getByRole('button', { name: /Apply Filters/i }).click();
        }
        await expect(universityCard(page, 'Bangladesh University of Engineering and Technology')).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('category and cluster routes load directly, refresh correctly, and handle empty cluster state', async ({ page }) => {
        const tracker = attachHealthTracker(page);

        await page.goto('/universities/category/science-technology');
        await expect(page.getByRole('heading', { name: /Science & Technology/i }).first()).toBeVisible();
        const categoryCard = universityCard(page, 'Bangladesh University of Engineering and Technology');
        await expect(categoryCard).toBeVisible();
        await expect(categoryCard).toHaveAttribute('data-university-card-variant', 'modern');
        await page.reload();
        await expect(page.getByRole('heading', { name: /Science & Technology/i }).first()).toBeVisible();

        await page.goto('/universities/cluster/engineering-alliance');
        await expect(page.getByRole('heading', { name: /Engineering Alliance/i })).toBeVisible();
        const clusterSummary = page.locator('div').filter({ has: page.getByRole('heading', { name: /Engineering Alliance/i }) }).first();
        await expect(clusterSummary.getByText(/Members/i).first()).toBeVisible();
        await expect(clusterSummary.getByText(/Application Window/i).first()).toBeVisible();
        await expect(clusterSummary.getByText(/Science Exam/i).first()).toBeVisible();
        await expect(clusterSummary.getByText(/Business Exam/i).first()).toBeVisible();
        await expect(universityCard(page, 'Rajshahi University of Engineering & Technology')).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: /Engineering Alliance/i })).toBeVisible();

        await page.goto('/universities/cluster/open-qa-empty-cluster');
        await expect(page.getByRole('heading', { name: /Open QA Empty Cluster/i })).toBeVisible();
        await expect(page.getByText(/0 universities/i)).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('detail pages handle fallback logos, long names, missing short names, and invalid links gracefully', async ({ page }) => {
        const tracker = attachHealthTracker(page);

        await page.goto('/universities/open-qa-broken-logo-university');
        await expect(page.getByRole('heading', { name: /Open QA Broken Logo University/i })).toBeVisible();
        await expect(page.getByTestId('university-fallback-logo').first()).toBeVisible();
        await expect(page.getByRole('heading', { name: /Description/i })).toBeVisible();
        await expect(page.getByText(/Open Universities QA dataset\./i)).toHaveCount(0);
        await expect(page.getByText(/open-university QA fixture\./i)).toHaveCount(0);

        await page.goto('/universities/open-qa-no-short-name-institute');
        await expect(page.getByRole('heading', { name: /Open QA No Short Name Institute/i })).toBeVisible();
        await expect(page.getByTestId('university-fallback-logo').first()).toBeVisible();

        await page.goto('/universities/open-qa-long-name-university-for-advanced-science-and-interdisciplinary-engineering-studies');
        await expect(page.getByRole('heading', { name: /Open QA Long Name University/i })).toBeVisible();
        await expect(page.getByText(/Application Timeline/i)).toBeVisible();

        await page.goto('/universities/open-qa-invalid-link-university');
        await expect(page.getByRole('heading', { name: /Open QA Invalid Link University/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Website N\/A/i })).toBeVisible();

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('responsive layouts and theme remain stable across core university routes', async ({ page }) => {
        const tracker = attachHealthTracker(page);
        await page.goto('/');

        const themeToggle = page.getByTestId('theme-toggle').first();
        if (await themeToggle.count()) {
            await themeToggle.click();
            await page.waitForTimeout(250);
        }

        const routes = [
            '/',
            '/universities',
            '/universities/category/science-technology',
            '/universities/cluster/engineering-alliance',
            '/universities/open-qa-broken-logo-university',
        ];

        for (const route of routes) {
            await page.goto(route);
            for (const viewport of responsiveWidths) {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.waitForTimeout(150);
                await expectNoHorizontalOverflow(page, `${route} ${viewport.name}`);
            }
        }

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });
});
