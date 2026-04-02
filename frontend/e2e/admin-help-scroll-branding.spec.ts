import path from 'path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { attachHealthTracker, expectPageHealthy, loginAsAdmin, loginAsStudent } from './helpers';

const ACTIVE_LOGO = '/logo.png';
const ACTIVE_FAVICON = '/favicon.ico';
const THEMES = ['light', 'dark'] as const;

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
    await page.evaluate((nextTheme) => {
        window.localStorage.setItem('campusway_theme', nextTheme);
        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, theme);
    await page.waitForTimeout(150);
}

async function makePageScrollable(page: Page) {
    await page.evaluate(() => {
        if (!document.getElementById('__e2e_scroll_spacer')) {
            const spacer = document.createElement('div');
            spacer.id = '__e2e_scroll_spacer';
            spacer.style.height = '3200px';
            spacer.style.pointerEvents = 'none';
            spacer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(spacer);
        }
    });
}

async function removeScrollSpacer(page: Page) {
    await page.evaluate(() => {
        document.getElementById('__e2e_scroll_spacer')?.remove();
    });
}

async function forceScrollDown(page: Page): Promise<number> {
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'auto' }));
    await page.waitForTimeout(400);
    let position = await page.evaluate(() => {
        const scroller = document.scrollingElement || document.documentElement;
        return Math.max(window.scrollY, scroller.scrollTop, document.documentElement.scrollTop, document.body.scrollTop);
    });
    if (position > 0) return position;

    await page.mouse.move(640, 350);
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(250);
    position = await page.evaluate(() => {
        const scroller = document.scrollingElement || document.documentElement;
        return Math.max(window.scrollY, scroller.scrollTop, document.documentElement.scrollTop, document.body.scrollTop);
    });
    return position;
}

async function countVisibleHelpButtons(page: Page): Promise<number> {
    return page.locator('button[aria-label^="Help:"]').evaluateAll((nodes) => (
        nodes.filter((node) => {
            const element = node as HTMLElement;
            return element.offsetParent !== null || element.getClientRects().length > 0;
        }).length
    ));
}

async function expectPopoverInViewport(page: Page, trigger: Locator) {
    await trigger.click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
}

async function openAdminRoute(page: Page, topLabel: string, childHref: string, urlPattern: RegExp, headingPattern: RegExp) {
    const sidebar = page.locator('aside').first();
    await sidebar.getByRole('link', { name: new RegExp(`^${escapeRegex(topLabel)}$`, 'i') }).click();
    const child = sidebar.locator(`a[href="${childHref}"]`).last();
    await expect(child).toBeVisible();
    await child.click();
    await expect(page).toHaveURL(urlPattern);
    await expect(page.getByRole('heading', { name: headingPattern }).first()).toBeVisible();
}

test.describe('Admin help, scroll reset, and branding', () => {
    test('admin help coverage stays readable across critical routes in light and dark themes', async ({ page }) => {
        test.setTimeout(240_000);
        const tracker = attachHealthTracker(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAsAdmin(page, 'desktop');

        const uploadFixture = path.resolve(process.cwd(), '..', 'test-exam-import.csv');

        for (const theme of THEMES) {
            await applyTheme(page, theme);

            await expect(page.getByRole('button', { name: /How this works/i })).toBeVisible();
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(14);
            await expectPopoverInViewport(page, page.getByRole('button', { name: /How this works/i }));

            await openAdminRoute(page, 'Website Control', '/__cw_admin__/settings/home-control', /\/__cw_admin__\/settings\/home-control/, /Home Control|Home Settings/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(15);
            await expectPopoverInViewport(page, page.getByLabel('Help: Show Search Box').first());

            await openAdminRoute(page, 'Website Control', '/__cw_admin__/settings/site-settings', /\/__cw_admin__\/settings\/site-settings/, /Site Settings/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(10);
            await expectPopoverInViewport(page, page.getByLabel('Help: Allow System Mode').first());

            await openAdminRoute(page, 'Question Bank', '/__cw_admin__/question-bank/import', /\/__cw_admin__\/question-bank\/import/, /Import Questions/i);
            await page.locator('input[type="file"]').setInputFiles(uploadFixture);
            await expect(page.getByRole('button', { name: 'Preview Import', exact: true })).toBeVisible();
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(18);
            await expectPopoverInViewport(page, page.getByLabel('Help: Download Template').first());
            await expectPopoverInViewport(page, page.getByLabel('Help: Upload Import File').first());
            await expectPopoverInViewport(page, page.getByLabel('Help: Preview Import').first());

            await openAdminRoute(page, 'Finance Center', '/__cw_admin__/finance/dashboard', /\/__cw_admin__\/finance\/dashboard/, /Finance Dashboard/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(18);
            await expectPopoverInViewport(page, page.getByLabel('Help: Reporting Month').first());
            await expectPopoverInViewport(page, page.getByLabel('Help: P&L Report').first());

            await openAdminRoute(page, 'Finance Center', '/__cw_admin__/finance/transactions', /\/__cw_admin__\/finance\/transactions/, /Transactions/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(15);
            await expectPopoverInViewport(page, page.getByLabel('Help: New Transaction').first());
            await expectPopoverInViewport(page, page.getByLabel('Help: Transaction Filters').first());

            await openAdminRoute(page, 'Security & Logs', '/__cw_admin__/settings/security-center', /\/__cw_admin__\/settings\/security-center/, /Security Center/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(15);
            await expectPopoverInViewport(page, page.locator('button[aria-label^="Help:"]').first());

            await openAdminRoute(page, 'Support & Communication', '/__cw_admin__/contact', /\/__cw_admin__\/contact/, /Contact Messages/i);
            expect(await countVisibleHelpButtons(page)).toBeGreaterThanOrEqual(10);
            await expectPopoverInViewport(page, page.getByLabel('Help: Refresh Contact Messages').first());
        }

        await expectPageHealthy(page, tracker);
        tracker.detach();
    });

    test('route changes reset scroll position for public, student, and admin navigation', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1280, height: 700 });

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const publicNewsLink = page.locator('header').getByRole('link', { name: /^News$/i }).first();
        await expect(publicNewsLink).toBeVisible();
        expect(await forceScrollDown(page)).toBeGreaterThanOrEqual(20);
        await publicNewsLink.click();
        await expect(page).toHaveURL(/\/news/);
        await page.waitForTimeout(2600);
        expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(120);

        await loginAsStudent(page, 'desktop');
        await makePageScrollable(page);
        expect(await forceScrollDown(page)).toBeGreaterThanOrEqual(20);
        await page.locator('aside').getByRole('link', { name: /^Notifications$/i }).click();
        await expect(page).toHaveURL(/\/notifications/);
        await removeScrollSpacer(page);
        await page.waitForTimeout(2600);
        expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(120);

        await loginAsAdmin(page, 'desktop');
        const adminSidebar = page.locator('aside').first();
        await adminSidebar.getByRole('link', { name: /^Security & Logs$/i }).click();
        const securityCenterLink = adminSidebar.locator('a[href="/__cw_admin__/settings/security-center"]').last();
        await expect(securityCenterLink).toBeVisible();
        await securityCenterLink.click();
        await expect(page).toHaveURL(/\/__cw_admin__\/settings\/security-center/);
        await makePageScrollable(page);
        expect(await forceScrollDown(page)).toBeGreaterThanOrEqual(20);
        await adminSidebar.getByRole('link', { name: /^Universities$/i }).click();
        await expect(page).toHaveURL(/\/__cw_admin__\/universities/);
        await removeScrollSpacer(page);
        await page.waitForTimeout(2600);
        expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(120);
    });

    test('public branding keeps the active canonical logo and favicon', async ({ page }) => {
        const response = await page.request.get('/api/settings/public');
        expect(response.ok()).toBeTruthy();
        const payload = await response.json();
        const settings = payload?.data || payload;

        expect(String(settings?.logo || settings?.logoUrl || '')).toContain(ACTIVE_LOGO);
        expect(String(settings?.favicon || '')).toContain(ACTIVE_FAVICON);

        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const logo = page.locator('header img').first();
        await expect(logo).toBeVisible();
        await expect(logo).toHaveAttribute('src', new RegExp(`${escapeRegex(ACTIVE_LOGO)}$`));

        const faviconHref = await page.locator('head link[rel~="icon"]').first().getAttribute('href');
        expect(faviconHref || '').toContain(ACTIVE_FAVICON);
    });
});
