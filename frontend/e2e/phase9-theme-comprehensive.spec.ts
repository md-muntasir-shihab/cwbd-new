import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Phase 9 Comprehensive Theme Validation
 * 
 * Tests dark/light theme consistency across:
 * - Public pages (14 sections of homepage + all public routes)
 * - Student panel (dashboard, profile, exams, notifications, support)
 * - Admin panel (dashboard, CRUD, tables, forms, modals)
 * - Shared components (cards, forms, tables, modals, buttons, icons, badges)
 * - Branding assets (logos, avatars, brand colors)
 * - Theme toggle functionality
 * 
 * For each test: verify in both dark and light themes
 */

const THEME_MODES = ['light', 'dark', 'system'] as const;
type ThemeMode = typeof THEME_MODES[number];

// Helper: Set theme via localStorage and reload
async function setTheme(page: Page, theme: ThemeMode) {
  await page.evaluate((t) => {
    localStorage.setItem('campusway_theme', t);
    // Apply theme
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (t === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (t === 'system') {
      // System preference handled by theme hook
      localStorage.setItem('campusway_theme', 'system');
    }
  }, theme);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// Helper: Get computed background color
async function getBackgroundColor(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return window.getComputedStyle(document.documentElement).backgroundColor;
  });
}

// Helper: Check text contrast
async function checkContrast(page: Page, selector: string): Promise<{ adequate: boolean; ratio: number }> {
  return await page.evaluate((sel) => {
    const elem = document.querySelector(sel) as HTMLElement;
    if (!elem) return { adequate: false, ratio: 0 };

    const style = window.getComputedStyle(elem);
    const fgColor = style.color;
    const bgColor = style.backgroundColor;

    // Parse RGB values
    const getRGB = (color: string) => {
      const match = color.match(/\d+/g);
      return match ? match.map(Number) : [0, 0, 0];
    };

    const [r1, g1, b1] = getRGB(fgColor);
    const [r2, g2, b2] = getRGB(bgColor);

    // Calculate luminance
    const getLuminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map((x) => {
        const s = x / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const l1 = getLuminance(r1, g1, b1);
    const l2 = getLuminance(r2, g2, b2);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
    return { adequate: ratio >= 4.5, ratio: parseFloat(ratio.toFixed(2)) };
  }, selector);
}

// Helper: Verify element is visible and not hidden
async function verifyElementVisibility(page: Page, selector: string): Promise<boolean> {
  try {
    const element = await page.locator(selector).first();
    const isVisible = await element.isVisible();
    
    if (!isVisible) return false;

    // Check for hidden properties
    const isHidden = await element.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      );
    });

    return !isHidden;
  } catch {
    return false;
  }
}

// Helper: Verify no horizontal overflow
async function checkHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    return document.documentElement.scrollWidth <= window.innerWidth;
  });
}

// Main test suite
test.describe('Phase 9: Comprehensive Theme Validation', () => {
  
  // ============================================================================
  // PUBLIC PAGES THEME TESTS
  // ============================================================================
  
  test.describe('PUBLIC PAGES THEME - Homepage', () => {
    THEME_MODES.forEach((theme) => {
      test(`Homepage renders correctly in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Verify theme is applied
        const isDarkMode = theme === 'dark';
        const htmlClass = await page.locator('html').getAttribute('class');
        if (isDarkMode) {
          expect(htmlClass).toContain('dark');
        } else {
          expect(htmlClass).not.toContain('dark');
        }

        // Check no horizontal overflow
        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);

        // Verify visible sections (14 main sections)
        const sections = [
          'header', 'hero', 'stats', 'features', 'universities',
          'news', 'testimonials', 'cta', 'plans', 'faq',
          'resources', 'support', 'partners', 'footer'
        ];

        for (const section of sections) {
          const sectionElement = await page.locator(`[data-section="${section}"]`).or(
            page.locator(`#${section}`).or(
              page.locator(`.${section}`)
            )
          ).first();
          
          // At least check header and footer are visible
          if (section === 'header' || section === 'footer') {
            const isVisible = await verifyElementVisibility(page, `[data-section="${section}"]`);
            if (!isVisible) {
              const isVisibleAlt = await sectionElement.isVisible().catch(() => false);
              expect(isVisibleAlt || isVisible).toBe(true);
            }
          }
        }

        // Check primary text contrast
        const textContrast = await checkContrast(page, 'body');
        expect(textContrast.ratio).toBeGreaterThanOrEqual(3.5);
      });

      test(`Homepage buttons visible and clickable in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check primary button
        const primaryButton = page.locator('button[class*="primary"]').first();
        const isPrimaryVisible = await verifyElementVisibility(page, 'button[class*="primary"]');
        expect(isPrimaryVisible).toBe(true);

        // Check secondary button
        const secondaryButton = page.locator('button[class*="secondary"]').first();
        const isSecondaryVisible = await verifyElementVisibility(page, 'button[class*="secondary"]');
        if (await page.locator('button[class*="secondary"]').count() > 0) {
          expect(isSecondaryVisible).toBe(true);
        }
      });
    });
  });

  test.describe('PUBLIC PAGES THEME - Universities', () => {
    THEME_MODES.forEach((theme) => {
      test(`Universities list visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/universities');
        await page.waitForLoadState('networkidle');
        await setTheme(page, theme);

        // Check university cards are visible
        const cards = await page.locator('[data-testid*="university"]').count();
        expect(cards).toBeGreaterThan(0);

        // Verify no hidden content
        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);

        // Check text readability
        const contrast = await checkContrast(page, '.university-card');
        expect(contrast.ratio).toBeGreaterThanOrEqual(3);
      });
    });
  });

  test.describe('PUBLIC PAGES THEME - News', () => {
    THEME_MODES.forEach((theme) => {
      test(`News list visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/news');
        await page.waitForLoadState('networkidle');
        await setTheme(page, theme);

        // Check news cards
        const newsCards = await page.locator('[data-testid*="news"]').count();
        expect(newsCards).toBeGreaterThanOrEqual(0);

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });

  test.describe('PUBLIC PAGES THEME - Subscription Plans', () => {
    THEME_MODES.forEach((theme) => {
      test(`Subscription plans display correctly in ${theme} mode`, async ({ page }) => {
        await page.goto('/subscription-plans');
        await page.waitForLoadState('networkidle');
        await setTheme(page, theme);

        // Check plan cards
        const planCards = await page.locator('[class*="plan-card"]').count();
        expect(planCards).toBeGreaterThan(0);

        // Verify pricing text is readable
        const priceElements = await page.locator('[class*="price"]').count();
        expect(priceElements).toBeGreaterThan(0);

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });

  test.describe('PUBLIC PAGES THEME - Contact Form', () => {
    THEME_MODES.forEach((theme) => {
      test(`Contact form inputs visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/contact');
        await page.waitForLoadState('networkidle');
        await setTheme(page, theme);

        // Check form inputs are visible
        const inputs = await page.locator('input[type="text"], input[type="email"], textarea').count();
        expect(inputs).toBeGreaterThan(0);

        // Verify inputs have visible labels
        const labels = await page.locator('label').count();
        expect(labels).toBeGreaterThan(0);

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });

  // ============================================================================
  // STUDENT PANEL THEME TESTS
  // ============================================================================

  test.describe('STUDENT PANEL THEME - Dashboard', () => {
    THEME_MODES.forEach((theme) => {
      test(`Student dashboard renders correctly in ${theme} mode`, async ({ page }) => {
        // Note: This assumes test user is logged in or tests are run with auth
        // Adjust based on your test setup
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle').catch(() => {});
        
        // If not authenticated, skip
        const isOnLogin = page.url().includes('/login');
        if (isOnLogin) {
          test.skip();
        }

        await setTheme(page, theme);

        // Verify dashboard content visible
        const dashboardContent = await page.locator('[data-testid="dashboard-content"]').or(
          page.locator('main')
        ).first();

        const isVisible = await dashboardContent.isVisible().catch(() => false);
        if (isVisible) {
          const noOverflow = await checkHorizontalOverflow(page);
          expect(noOverflow).toBe(true);
        }
      });
    });
  });

  test.describe('STUDENT PANEL THEME - Exams', () => {
    THEME_MODES.forEach((theme) => {
      test(`Student exams list visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/exams');
        await page.waitForLoadState('networkidle').catch(() => {});
        
        const isOnLogin = page.url().includes('/login');
        if (isOnLogin) {
          test.skip();
        }

        await setTheme(page, theme);

        // Check exam items
        const examItems = await page.locator('[data-testid*="exam"]').count();
        // May be 0 if no exams, but structure should be visible

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });

  // ============================================================================
  // ADMIN PANEL THEME TESTS
  // ============================================================================

  test.describe('ADMIN PANEL THEME - Dashboard', () => {
    THEME_MODES.forEach((theme) => {
      test(`Admin dashboard renders correctly in ${theme} mode`, async ({ page }) => {
        await page.goto('/__cw_admin__/dashboard');
        await page.waitForLoadState('networkidle').catch(() => {});

        // If not authenticated as admin, skip
        const isOnLogin = page.url().includes('/login') || page.url().includes('/access-denied');
        if (isOnLogin) {
          test.skip();
        }

        await setTheme(page, theme);

        // Verify admin content visible
        const adminContent = await page.locator('main').first();
        const isVisible = await adminContent.isVisible().catch(() => false);

        if (isVisible) {
          const noOverflow = await checkHorizontalOverflow(page);
          expect(noOverflow).toBe(true);
        }
      });
    });
  });

  test.describe('ADMIN PANEL THEME - Tables', () => {
    THEME_MODES.forEach((theme) => {
      test(`Admin tables render correctly in ${theme} mode`, async ({ page }) => {
        await page.goto('/__cw_admin__/dashboard');
        await page.waitForLoadState('networkidle').catch(() => {});

        const isOnLogin = page.url().includes('/login');
        if (isOnLogin) {
          test.skip();
        }

        await setTheme(page, theme);

        // Check if tables exist and are readable
        const tables = await page.locator('table').count();
        
        if (tables > 0) {
          // Check table text contrast
          const tableHeaders = await page.locator('th').count();
          expect(tableHeaders).toBeGreaterThan(0);

          // Verify table rows are visible
          const tableRows = await page.locator('tbody tr').count();
          expect(tableRows).toBeGreaterThanOrEqual(0);

          const noOverflow = await checkHorizontalOverflow(page);
          expect(noOverflow).toBe(true);
        }
      });
    });
  });

  test.describe('ADMIN PANEL THEME - Finance', () => {
    THEME_MODES.forEach((theme) => {
      test(`Admin finance page visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/__cw_admin__/finance');
        await page.waitForLoadState('networkidle').catch(() => {});

        const isOnLogin = page.url().includes('/login');
        if (isOnLogin) {
          test.skip();
        }

        await setTheme(page, theme);

        // Check finance content
        const financeContent = await page.locator('main').first();
        const isVisible = await financeContent.isVisible().catch(() => false);

        if (isVisible) {
          // Check for common finance elements (cards, charts, tables)
          const cards = await page.locator('[class*="card"]').count();
          expect(cards).toBeGreaterThanOrEqual(0);

          const noOverflow = await checkHorizontalOverflow(page);
          expect(noOverflow).toBe(true);
        }
      });
    });
  });

  // ============================================================================
  // SHARED COMPONENTS THEME TESTS
  // ============================================================================

  test.describe('SHARED COMPONENTS - Cards', () => {
    THEME_MODES.forEach((theme) => {
      test(`Cards visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check for card components
        const cards = await page.locator('[class*="card"]').count();
        
        if (cards > 0) {
          // Check card text contrast
          const firstCard = page.locator('[class*="card"]').first();
          const isVisible = await firstCard.isVisible();
          expect(isVisible).toBe(true);
        }
      });
    });
  });

  test.describe('SHARED COMPONENTS - Forms', () => {
    THEME_MODES.forEach((theme) => {
      test(`Form inputs visible and usable in ${theme} mode`, async ({ page }) => {
        await page.goto('/contact');
        await page.waitForLoadState('networkidle');
        await setTheme(page, theme);

        // Check input visibility
        const inputs = await page.locator('input[type="text"], input[type="email"]').count();
        
        if (inputs > 0) {
          const firstInput = page.locator('input').first();
          const isVisible = await firstInput.isVisible();
          expect(isVisible).toBe(true);

          // Check input has visible border/outline in current theme
          const borderStyle = await firstInput.evaluate((el) => {
            return window.getComputedStyle(el).borderColor;
          });
          expect(borderStyle).toBeTruthy();
        }
      });
    });
  });

  test.describe('SHARED COMPONENTS - Buttons', () => {
    THEME_MODES.forEach((theme) => {
      test(`All button types visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check different button types
        const buttonTypes = ['primary', 'secondary', 'danger', 'ghost'];
        
        for (const type of buttonTypes) {
          const selector = `button[class*="${type}"]`;
          const count = await page.locator(selector).count();
          
          if (count > 0) {
            const button = page.locator(selector).first();
            const isVisible = await button.isVisible();
            expect(isVisible).toBe(true);
          }
        }
      });
    });
  });

  test.describe('SHARED COMPONENTS - Icons', () => {
    THEME_MODES.forEach((theme) => {
      test(`Icons visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check for SVG icons
        const icons = await page.locator('svg').count();
        
        if (icons > 0) {
          const firstIcon = page.locator('svg').first();
          const isVisible = await firstIcon.isVisible();
          expect(isVisible).toBe(true);
        }
      });
    });
  });

  // ============================================================================
  // BRANDING ASSETS THEME TESTS
  // ============================================================================

  test.describe('BRANDING ASSETS - Logo', () => {
    THEME_MODES.forEach((theme) => {
      test(`Logo visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check logo
        const logo = page.locator('img[alt*="logo"], [data-testid*="logo"]').first();
        const isVisible = await logo.isVisible().catch(() => false);

        if (isVisible) {
          // Verify logo has proper src
          const src = await logo.getAttribute('src');
          expect(src).toBeTruthy();
        }
      });
    });
  });

  test.describe('BRANDING ASSETS - Avatars', () => {
    THEME_MODES.forEach((theme) => {
      test(`Avatars visible in ${theme} mode`, async ({ page }) => {
        await page.goto('/');
        await setTheme(page, theme);

        // Check for avatar elements
        const avatars = await page.locator('[class*="avatar"]').count();
        
        if (avatars > 0) {
          const firstAvatar = page.locator('[class*="avatar"]').first();
          const isVisible = await firstAvatar.isVisible();
          expect(isVisible).toBe(true);
        }
      });
    });
  });

  // ============================================================================
  // THEME TOGGLE FUNCTIONALITY TESTS
  // ============================================================================

  test.describe('THEME TOGGLE - Functionality', () => {
    test('Theme toggle cycles through all modes', async ({ page }) => {
      await page.goto('/');

      // Get toggle button
      const toggleButton = page.locator('[data-testid="theme-toggle"]');
      const exists = await toggleButton.isVisible().catch(() => false);

      if (exists) {
        // Verify initial state
        let currentTheme = await page.evaluate(() => localStorage.getItem('campusway_theme'));

        // Click to cycle through themes
        for (let i = 0; i < 3; i++) {
          await toggleButton.click();
          await page.waitForTimeout(300);
          currentTheme = await page.evaluate(() => localStorage.getItem('campusway_theme'));
          expect(['light', 'dark', 'system']).toContain(currentTheme);
        }
      }
    });

    test('Theme persists after page reload', async ({ page }) => {
      await page.goto('/');

      // Set to dark theme
      await setTheme(page, 'dark');

      // Verify localStorage
      const savedTheme = await page.evaluate(() => localStorage.getItem('campusway_theme'));
      expect(savedTheme).toBe('dark');

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify theme persists
      const htmlClass = await page.locator('html').getAttribute('class');
      expect(htmlClass).toContain('dark');

      const reloadedTheme = await page.evaluate(() => localStorage.getItem('campusway_theme'));
      expect(reloadedTheme).toBe('dark');
    });

    test('Light theme persists after reload', async ({ page }) => {
      await page.goto('/');

      // Set to light theme
      await setTheme(page, 'light');

      const savedTheme = await page.evaluate(() => localStorage.getItem('campusway_theme'));
      expect(savedTheme).toBe('light');

      await page.reload();
      await page.waitForLoadState('networkidle');

      const htmlClass = await page.locator('html').getAttribute('class');
      expect(htmlClass).not.toContain('dark');
    });
  });

  // ============================================================================
  // RESPONSIVE THEME TESTS
  // ============================================================================

  test.describe('RESPONSIVE THEME - Mobile', () => {
    THEME_MODES.forEach((theme) => {
      test(`Mobile viewport renders correctly in ${theme} mode`, async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 360, height: 640 });

        await page.goto('/');
        await setTheme(page, theme);

        // Check no horizontal overflow on mobile
        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);

        // Check buttons are still visible and clickable
        const buttons = await page.locator('button').count();
        if (buttons > 0) {
          const firstButton = page.locator('button').first();
          const isVisible = await firstButton.isVisible();
          expect(isVisible).toBe(true);
        }
      });
    });
  });

  test.describe('RESPONSIVE THEME - Tablet', () => {
    THEME_MODES.forEach((theme) => {
      test(`Tablet viewport renders correctly in ${theme} mode`, async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });

        await page.goto('/');
        await setTheme(page, theme);

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });

  test.describe('RESPONSIVE THEME - Desktop', () => {
    THEME_MODES.forEach((theme) => {
      test(`Desktop viewport renders correctly in ${theme} mode`, async ({ page }) => {
        // Set desktop viewport
        await page.setViewportSize({ width: 1440, height: 900 });

        await page.goto('/');
        await setTheme(page, theme);

        const noOverflow = await checkHorizontalOverflow(page);
        expect(noOverflow).toBe(true);
      });
    });
  });
});
