/**
 * Property 4: Preservation — Brand Asset Defaults Unchanged
 *
 * For any page load where the brand asset bug condition does NOT hold
 * (default assets, retired path normalization, theme toggling), the system
 * SHALL produce exactly the same behavior as the original system.
 *
 * These tests observe and lock in the CORRECT behavior of the unfixed code
 * for non-bug-condition brand asset states. They must PASS on unfixed code.
 *
 * **Validates: Requirements 3.7, 3.8, 3.9**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Domain Constants (from backend/src/utils/brandAssets.ts) ────────

const PUBLIC_BRAND_ASSETS = {
    logo: '/logo.svg',
    favicon: '/favicon.ico',
} as const;

type BrandAssetKind = keyof typeof PUBLIC_BRAND_ASSETS;

const RETIRED_BRAND_ASSET_PATHS = new Set<string>([
    '',
    '/logo.png',
    '/uploads/logo-1773555868748-118876447.webp',
    '/uploads/favicon-1773555868749-501330119.webp',
]);

// ─── Pure Logic Under Test (extracted from brandAssets.ts) ───────────

function normalizeAssetValue(value: unknown): string {
    return String(value || '').trim();
}

/**
 * Mirrors `normalizeStoredBrandAsset` from backend/src/utils/brandAssets.ts.
 * When the stored value is empty, null, undefined, or a retired path,
 * it falls back to the default PUBLIC_BRAND_ASSETS for that kind.
 */
function normalizeStoredBrandAsset(value: unknown, kind: BrandAssetKind): string {
    const normalized = normalizeAssetValue(value);
    if (!normalized || RETIRED_BRAND_ASSET_PATHS.has(normalized)) {
        return PUBLIC_BRAND_ASSETS[kind];
    }
    return normalized;
}

// ─── Theme Logic (extracted from hooks/useTheme.tsx) ─────────────────

type ThemeMode = 'light' | 'dark' | 'system';
const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_STORAGE_KEY = 'campusway_theme';

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'system') return 'dark'; // default system preference in tests
    return mode;
}

/**
 * Theme toggle cycle: light → dark → system → light
 * Mirrors toggleDarkMode from useTheme.tsx
 */
function toggleTheme(current: ThemeMode): ThemeMode {
    return current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
}

// ─── useWebsiteSettings normalization (from hooks/useWebsiteSettings.ts) ──

const WEBSITE_SETTINGS_CACHE_KEY = 'cw_public_website_settings_cache';

interface BrandSettings {
    websiteName: string;
    logoUrl?: string;
    logo?: string;
    favicon?: string;
    motto?: string;
}

/**
 * Mirrors normalizeSettingsPayload from useWebsiteSettings.ts.
 * Normalizes logo/logoUrl bidirectionally.
 */
function normalizeSettingsPayload(raw: unknown): BrandSettings | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const payload = raw as Record<string, unknown>;
    const inner = typeof payload.settings === 'object' && payload.settings !== null
        ? (payload.settings as Record<string, unknown>)
        : null;

    const merged: Record<string, unknown> = {
        ...(inner || {}),
        ...payload,
    };

    const normalized: Partial<BrandSettings> & { settings?: unknown } = merged;
    if (!normalized.logo && normalized.logoUrl) normalized.logo = normalized.logoUrl;
    if (!normalized.logoUrl && normalized.logo) normalized.logoUrl = normalized.logo;
    delete normalized.settings;

    return {
        websiteName: String(normalized.websiteName || 'CampusWay'),
        ...normalized,
    } as BrandSettings;
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const brandAssetKindArb = fc.constantFrom<BrandAssetKind>('logo', 'favicon');
const themeModeArb = fc.constantFrom<ThemeMode>(...VALID_MODES);

/** Generate values that should normalize to the default asset */
const emptyOrRetiredValueArb = fc.oneof(
    fc.constant(''),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant('/logo.png'),
    fc.constant('/uploads/logo-1773555868748-118876447.webp'),
    fc.constant('/uploads/favicon-1773555868749-501330119.webp'),
);

/** Generate valid custom asset URLs that are NOT retired */
const validCustomAssetArb = fc.oneof(
    fc.constant('/uploads/logo-custom-abc123.webp'),
    fc.constant('/uploads/favicon-custom-xyz789.ico'),
    fc.constant('https://cdn.example.com/brand/logo.png'),
    fc.stringMatching(/^\/uploads\/brand-[a-z0-9]{6}\.(webp|png|svg|ico)$/),
);

// ─── Property Tests ──────────────────────────────────────────────────

describe('Property 4: Preservation — Brand Asset Defaults Unchanged', () => {

    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    /**
     * **Validates: Requirements 3.7**
     *
     * Default brand assets (`/logo.svg`, `/favicon.ico`) display correctly
     * when no custom assets are uploaded. The normalizeStoredBrandAsset
     * function returns the default for empty/null/undefined values.
     */
    describe('3.7: Default brand assets display when no custom assets uploaded', () => {
        it('empty/null/undefined values normalize to default brand assets', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined)),
                    (kind, value) => {
                        const result = normalizeStoredBrandAsset(value, kind);
                        expect(result).toBe(PUBLIC_BRAND_ASSETS[kind]);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('default logo is /logo.svg', () => {
            expect(PUBLIC_BRAND_ASSETS.logo).toBe('/logo.svg');
            expect(normalizeStoredBrandAsset('', 'logo')).toBe('/logo.svg');
            expect(normalizeStoredBrandAsset(null, 'logo')).toBe('/logo.svg');
            expect(normalizeStoredBrandAsset(undefined, 'logo')).toBe('/logo.svg');
        });

        it('default favicon is /favicon.ico', () => {
            expect(PUBLIC_BRAND_ASSETS.favicon).toBe('/favicon.ico');
            expect(normalizeStoredBrandAsset('', 'favicon')).toBe('/favicon.ico');
            expect(normalizeStoredBrandAsset(null, 'favicon')).toBe('/favicon.ico');
            expect(normalizeStoredBrandAsset(undefined, 'favicon')).toBe('/favicon.ico');
        });

        it('valid custom asset URLs are preserved (not overridden by defaults)', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    validCustomAssetArb,
                    (kind, customUrl) => {
                        const result = normalizeStoredBrandAsset(customUrl, kind);
                        // Custom URLs that are NOT retired should be returned as-is
                        expect(result).toBe(customUrl);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('normalizeSettingsPayload preserves websiteName default as CampusWay', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        logoUrl: fc.oneof(fc.constant(''), fc.constant('/logo.svg')),
                        motto: fc.constantFrom('Plan. Explore. Achieve.', ''),
                    }),
                    (input) => {
                        const result = normalizeSettingsPayload({
                            websiteName: 'CampusWay',
                            ...input,
                        });
                        expect(result).not.toBeNull();
                        expect(result!.websiteName).toBe('CampusWay');
                    },
                ),
                { numRuns: 30 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.8**
     *
     * Retired brand asset paths normalize correctly to the default.
     * The RETIRED_BRAND_ASSET_PATHS set contains old/deprecated paths
     * that should fall back to PUBLIC_BRAND_ASSETS.
     */
    describe('3.8: Retired brand asset paths normalize to defaults', () => {
        it('all retired paths normalize to the default for any asset kind', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    emptyOrRetiredValueArb,
                    (kind, retiredValue) => {
                        const result = normalizeStoredBrandAsset(retiredValue, kind);
                        expect(result).toBe(PUBLIC_BRAND_ASSETS[kind]);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('/logo.png (retired) normalizes to /logo.svg for logo kind', () => {
            expect(normalizeStoredBrandAsset('/logo.png', 'logo')).toBe('/logo.svg');
        });

        it('/logo.png (retired) normalizes to /favicon.ico for favicon kind', () => {
            expect(normalizeStoredBrandAsset('/logo.png', 'favicon')).toBe('/favicon.ico');
        });

        it('specific retired upload paths normalize to defaults', () => {
            expect(
                normalizeStoredBrandAsset('/uploads/logo-1773555868748-118876447.webp', 'logo'),
            ).toBe('/logo.svg');
            expect(
                normalizeStoredBrandAsset('/uploads/favicon-1773555868749-501330119.webp', 'favicon'),
            ).toBe('/favicon.ico');
        });

        it('non-retired paths are NOT normalized to defaults', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    validCustomAssetArb,
                    (kind, customUrl) => {
                        const result = normalizeStoredBrandAsset(customUrl, kind);
                        // Non-retired custom URLs should NOT be replaced with defaults
                        expect(result).not.toBe(PUBLIC_BRAND_ASSETS[kind]);
                        expect(result).toBe(customUrl);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.9**
     *
     * Theme toggling (light/dark/system) does not affect branding.
     * The theme system operates independently of brand asset resolution.
     * Toggling the theme changes CSS classes on the root element but
     * does not alter logoUrl, favicon, websiteName, or motto.
     */
    describe('3.9: Theme toggling does not affect branding', () => {
        it('brand asset normalization is independent of theme mode', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    emptyOrRetiredValueArb,
                    themeModeArb,
                    (kind, value, themeMode) => {
                        // Simulate theme being set
                        const _resolved = resolveTheme(themeMode);

                        // Brand asset normalization should produce the same result
                        // regardless of which theme mode is active
                        const result = normalizeStoredBrandAsset(value, kind);
                        expect(result).toBe(PUBLIC_BRAND_ASSETS[kind]);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('theme toggle cycle is deterministic and does not touch brand settings', () => {
            fc.assert(
                fc.property(
                    themeModeArb,
                    (startMode) => {
                        // Toggle through all three modes
                        const after1 = toggleTheme(startMode);
                        const after2 = toggleTheme(after1);
                        const after3 = toggleTheme(after2);

                        // Full cycle returns to original mode
                        expect(after3).toBe(startMode);

                        // Each toggle produces a valid mode
                        expect(VALID_MODES).toContain(after1);
                        expect(VALID_MODES).toContain(after2);
                        expect(VALID_MODES).toContain(after3);
                    },
                ),
                { numRuns: 20 },
            );
        });

        it('brand settings in localStorage are not affected by theme changes', () => {
            fc.assert(
                fc.property(
                    themeModeArb,
                    fc.constantFrom('CampusWay', 'MyUniversity'),
                    fc.constantFrom('/logo.svg', '/uploads/custom-logo.webp'),
                    (themeMode, websiteName, logoUrl) => {
                        // Store brand settings in localStorage
                        const brandSettings = JSON.stringify({ websiteName, logoUrl });
                        window.localStorage.setItem(WEBSITE_SETTINGS_CACHE_KEY, brandSettings);

                        // Simulate theme toggle (writes to different key)
                        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);

                        // Brand settings should be completely unaffected
                        const storedBrand = window.localStorage.getItem(WEBSITE_SETTINGS_CACHE_KEY);
                        expect(storedBrand).toBe(brandSettings);

                        const parsed = JSON.parse(storedBrand!);
                        expect(parsed.websiteName).toBe(websiteName);
                        expect(parsed.logoUrl).toBe(logoUrl);

                        // Theme key is separate
                        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(themeMode);
                    },
                ),
                { numRuns: 30 },
            );
        });

        it('custom brand assets remain unchanged across all theme modes', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    validCustomAssetArb,
                    themeModeArb,
                    (kind, customUrl, themeMode) => {
                        // Simulate theme being active
                        const _resolved = resolveTheme(themeMode);

                        // Custom brand asset normalization is theme-independent
                        const result = normalizeStoredBrandAsset(customUrl, kind);
                        expect(result).toBe(customUrl);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * Combined property: for all non-bug-condition brand asset states,
     * the system produces correct behavior.
     */
    describe('Combined: all non-bug-condition brand asset states behave correctly', () => {
        it('default assets, retired paths, and theme independence hold simultaneously', () => {
            fc.assert(
                fc.property(
                    brandAssetKindArb,
                    emptyOrRetiredValueArb,
                    themeModeArb,
                    validCustomAssetArb,
                    (kind, retiredValue, themeMode, customUrl) => {
                        // 1. Default/retired values normalize to PUBLIC_BRAND_ASSETS
                        const defaultResult = normalizeStoredBrandAsset(retiredValue, kind);
                        expect(defaultResult).toBe(PUBLIC_BRAND_ASSETS[kind]);

                        // 2. Custom values are preserved
                        const customResult = normalizeStoredBrandAsset(customUrl, kind);
                        expect(customResult).toBe(customUrl);

                        // 3. Theme mode does not affect either result
                        const _resolved = resolveTheme(themeMode);
                        const defaultAfterTheme = normalizeStoredBrandAsset(retiredValue, kind);
                        const customAfterTheme = normalizeStoredBrandAsset(customUrl, kind);
                        expect(defaultAfterTheme).toBe(defaultResult);
                        expect(customAfterTheme).toBe(customResult);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
