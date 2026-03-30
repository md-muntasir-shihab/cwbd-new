import { expect, Page } from '@playwright/test';

export const RESPONSIVE_VIEWPORTS = [
    { width: 320, height: 700 },
    { width: 360, height: 780 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 900 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
] as const;

export const THEMES = ['light', 'dark'] as const;

export async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
    await page.evaluate((nextTheme) => {
        window.localStorage.setItem('campusway_theme', nextTheme);
        if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, theme);
}

export async function expectNoCriticalHorizontalOverflow(page: Page, hint = 'page'): Promise<void> {
    const overflowPx = await page.evaluate(
        () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    expect(overflowPx, `${hint}: horizontal overflow detected`).toBeLessThanOrEqual(24);
}
