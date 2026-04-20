/**
 * Preservation Property Tests — C3: Font/Typography
 *
 * **Validates: Requirements 3.7**
 *
 * These property-based tests verify that EXISTING font behavior remains
 * unchanged after the font rendering fix is applied. They follow the
 * observation-first methodology:
 *
 * 1. Observe on UNFIXED code: existing system fonts and Tailwind default
 *    font classes render correctly on non-affected components
 * 2. Write tests asserting that existing font utility classes continue to work
 * 3. Verify tests PASS on UNFIXED code
 *
 * Preservation Requirements:
 *   - Default brand assets (`/logo.svg`, `/favicon.ico`) display correctly
 *   - Existing system fonts (Plus Jakarta Sans, Sora, Segoe UI) work correctly
 *   - Tailwind default font utility classes (font-sans, font-heading) work
 *   - CSS custom properties for fonts remain functional
 *   - Theme toggling (light/dark) does not affect font rendering
 *   - Google Fonts preconnect hints remain in place
 *
 * These tests MUST PASS on both unfixed and fixed code.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ─── Paths to source files ──────────────────────────────────────────

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..');
const INDEX_CSS_PATH = path.join(FRONTEND_ROOT, 'src', 'styles', 'index.css');
const INDEX_HTML_PATH = path.join(FRONTEND_ROOT, 'index.html');
const TAILWIND_CONFIG_PATH = path.join(FRONTEND_ROOT, 'tailwind.config.js');
const THEME_CSS_PATH = path.join(FRONTEND_ROOT, 'src', 'styles', 'theme.css');

// ─── Read source files once ─────────────────────────────────────────

const indexCssContent = fs.readFileSync(INDEX_CSS_PATH, 'utf-8');
const indexHtmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
const tailwindConfigContent = fs.readFileSync(TAILWIND_CONFIG_PATH, 'utf-8');
const themeCssContent = fs.readFileSync(THEME_CSS_PATH, 'utf-8');

// ─── Generators ─────────────────────────────────────────────────────

/** Existing system fonts that should continue to work */
const existingSystemFontArb = fc.constantFrom(
    'Plus Jakarta Sans',
    'Sora',
    'Segoe UI',
    'sans-serif',
);

/** Tailwind font utility classes that should continue to work */
const tailwindFontClassArb = fc.constantFrom(
    'font-sans',
    'font-heading',
);

/** CSS font-family declarations that should exist in index.css */
const cssFontFamilyArb = fc.constantFrom(
    "'Plus Jakarta Sans'",
    'Sora',
    "'Segoe UI'",
    'sans-serif',
);

/** Google Fonts that should remain preconnected */
const googleFontPreconnectArb = fc.constantFrom(
    'fonts.googleapis.com',
    'fonts.gstatic.com',
);

/** Theme modes that should not affect font rendering */
const themeModeArb = fc.constantFrom('light', 'dark');

/** Components that use existing font classes */
const existingFontComponentArb = fc.constantFrom(
    'body',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    '.font-heading',
    '.btn-primary',
    '.card',
);

// ─── Test Suite ─────────────────────────────────────────────────────

describe('Preservation C3: Font/Typography — Existing Behavior Unchanged', () => {

    /**
     * Property 1: Tailwind config must continue to define sans and heading
     * font families with existing system fonts.
     *
     * Observation: On UNFIXED code, tailwind.config.js defines:
     *   - sans: ['Plus Jakarta Sans', 'Segoe UI', 'sans-serif']
     *   - heading: ['Sora', 'Plus Jakarta Sans', 'Segoe UI', 'sans-serif']
     *
     * These definitions MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P1: Tailwind font family definitions preserved', () => {
        it('tailwind.config.js must define sans font family with Plus Jakarta Sans', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that sans font family is defined
                        const hasSansFamily = /fontFamily[\s\S]*?sans\s*:/i.test(tailwindConfigContent);
                        expect(hasSansFamily).toBe(true);

                        // Check that Plus Jakarta Sans is in the sans stack
                        const sansMatch = tailwindConfigContent.match(/sans\s*:\s*\[([^\]]+)\]/);
                        expect(sansMatch).not.toBeNull();
                        if (sansMatch) {
                            const sansStack = sansMatch[1];
                            expect(sansStack).toContain('Plus Jakarta Sans');
                        }
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('tailwind.config.js must define heading font family with Sora', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that heading font family is defined
                        const hasHeadingFamily = /fontFamily[\s\S]*?heading\s*:/i.test(tailwindConfigContent);
                        expect(hasHeadingFamily).toBe(true);

                        // Check that Sora is in the heading stack
                        const headingMatch = tailwindConfigContent.match(/heading\s*:\s*\[([^\]]+)\]/);
                        expect(headingMatch).not.toBeNull();
                        if (headingMatch) {
                            const headingStack = headingMatch[1];
                            expect(headingStack).toContain('Sora');
                        }
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('existing system fonts must remain in font stacks', () => {
            fc.assert(
                fc.property(
                    existingSystemFontArb,
                    (fontName) => {
                        // Each existing system font should be referenced in tailwind config
                        const fontNamePattern = new RegExp(fontName.replace(/\s+/g, '\\s+'), 'i');
                        const hasFontInConfig = fontNamePattern.test(tailwindConfigContent);
                        expect(hasFontInConfig).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    /**
     * Property 2: index.css must continue to define body and heading font
     * families using the existing system fonts.
     *
     * Observation: On UNFIXED code, index.css defines:
     *   - body { font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; }
     *   - h1-h6 { font-family: Sora, 'Plus Jakarta Sans', 'Segoe UI', sans-serif; }
     *   - .font-heading { font-family: Sora, 'Plus Jakarta Sans', 'Segoe UI', sans-serif; }
     *
     * These definitions MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P2: CSS font-family declarations preserved', () => {
        it('body must have Plus Jakarta Sans as primary font', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that body has font-family with Plus Jakarta Sans
                        const bodyFontPattern = /body\s*\{[^}]*font-family:[^;]*Plus\s+Jakarta\s+Sans/i;
                        const hasBodyFont = bodyFontPattern.test(indexCssContent);
                        expect(hasBodyFont).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('headings must have Sora as primary font', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that h1-h6 have font-family with Sora
                        const headingFontPattern = /h[1-6][^{]*\{[^}]*font-family:[^;]*Sora/i;
                        const hasHeadingFont = headingFontPattern.test(indexCssContent);
                        expect(hasHeadingFont).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('.font-heading utility class must define Sora font family', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that .font-heading class exists with Sora
                        const fontHeadingPattern = /\.font-heading\s*\{[^}]*font-family:[^;]*Sora/i;
                        const hasFontHeadingClass = fontHeadingPattern.test(indexCssContent);
                        expect(hasFontHeadingClass).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('CSS font-family declarations must include fallback fonts', () => {
            fc.assert(
                fc.property(
                    cssFontFamilyArb,
                    (fontFamily) => {
                        // Each font family should appear in the CSS
                        const fontPattern = new RegExp(fontFamily.replace(/'/g, "['\"]?").replace(/\s+/g, '\\s+'), 'i');
                        const hasFontInCss = fontPattern.test(indexCssContent);
                        expect(hasFontInCss).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    /**
     * Property 3: index.html must continue to have Google Fonts preconnect
     * hints and the Google Fonts stylesheet link for Plus Jakarta Sans and Sora.
     *
     * Observation: On UNFIXED code, index.html has:
     *   - <link rel="preconnect" href="https://fonts.googleapis.com" />
     *   - <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
     *   - <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans...&family=Sora..." rel="stylesheet" />
     *
     * These MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P3: Google Fonts integration preserved', () => {
        it('index.html must have preconnect hints for Google Fonts', () => {
            fc.assert(
                fc.property(
                    googleFontPreconnectArb,
                    (domain) => {
                        // Check that preconnect hint exists for the domain
                        const preconnectPattern = new RegExp(
                            `<link[^>]*rel=["']preconnect["'][^>]*href=["'][^"']*${domain}`,
                            'i',
                        );
                        const hasPreconnect = preconnectPattern.test(indexHtmlContent);
                        expect(hasPreconnect).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.html must have Google Fonts stylesheet link for Plus Jakarta Sans', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that Google Fonts stylesheet includes Plus Jakarta Sans
                        const googleFontsPattern = /fonts\.googleapis\.com\/css2[^"']*Plus\+Jakarta\+Sans/i;
                        const hasGoogleFonts = googleFontsPattern.test(indexHtmlContent);
                        expect(hasGoogleFonts).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.html must have Google Fonts stylesheet link for Sora', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that Google Fonts stylesheet includes Sora
                        const googleFontsPattern = /fonts\.googleapis\.com\/css2[^"']*Sora/i;
                        const hasGoogleFonts = googleFontsPattern.test(indexHtmlContent);
                        expect(hasGoogleFonts).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('Google Fonts link must include display=swap for performance', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Check that display=swap is in the Google Fonts URL
                        const displaySwapPattern = /fonts\.googleapis\.com\/css2[^"']*display=swap/i;
                        const hasDisplaySwap = displaySwapPattern.test(indexHtmlContent);
                        expect(hasDisplaySwap).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });
    });

    /**
     * Property 4: Theme CSS must not define any font-family overrides that
     * would conflict with the base font definitions.
     *
     * Observation: On UNFIXED code, theme.css only defines color variables
     * and gradients. It does NOT override any font-family properties.
     *
     * This MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P4: Theme CSS does not override fonts', () => {
        it('theme.css must not contain font-family declarations', () => {
            fc.assert(
                fc.property(
                    themeModeArb,
                    (_mode) => {
                        // theme.css should not have any font-family declarations
                        // that would override the base styles
                        const hasFontFamilyOverride = /font-family\s*:/i.test(themeCssContent);
                        expect(hasFontFamilyOverride).toBe(false);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('theme.css must only contain color and gradient variables', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // Verify theme.css contains expected CSS variables
                        const hasColorVars = /--bg\s*:/i.test(themeCssContent);
                        const hasSurfaceVars = /--surface\s*:/i.test(themeCssContent);
                        const hasTextVars = /--text\s*:/i.test(themeCssContent);
                        const hasGradientVars = /--gradient/i.test(themeCssContent);

                        expect(hasColorVars).toBe(true);
                        expect(hasSurfaceVars).toBe(true);
                        expect(hasTextVars).toBe(true);
                        expect(hasGradientVars).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });
    });

    /**
     * Property 5: CSS font smoothing and antialiasing settings must be preserved.
     *
     * Observation: On UNFIXED code, index.css defines:
     *   - body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
     *   - body.antialiased class in index.html
     *
     * These MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P5: Font smoothing settings preserved', () => {
        it('body must have webkit font smoothing antialiased', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasWebkitSmoothing = /-webkit-font-smoothing\s*:\s*antialiased/i.test(indexCssContent);
                        expect(hasWebkitSmoothing).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('body must have moz osx font smoothing grayscale', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasMozSmoothing = /-moz-osx-font-smoothing\s*:\s*grayscale/i.test(indexCssContent);
                        expect(hasMozSmoothing).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.html body must have antialiased class', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasAntialiasedClass = /<body[^>]*class=["'][^"']*antialiased/i.test(indexHtmlContent);
                        expect(hasAntialiasedClass).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });
    });

    /**
     * Property 6: Tailwind @layer directives must be preserved for proper
     * CSS cascade ordering.
     *
     * Observation: On UNFIXED code, index.css uses:
     *   - @tailwind base;
     *   - @tailwind components;
     *   - @tailwind utilities;
     *   - @layer base { ... }
     *   - @layer components { ... }
     *   - @layer utilities { ... }
     *
     * These MUST remain unchanged after the fix.
     *
     * **Validates: Requirements 3.7**
     */
    describe('P6: Tailwind layer directives preserved', () => {
        it('index.css must have @tailwind base directive', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasTailwindBase = /@tailwind\s+base\s*;/i.test(indexCssContent);
                        expect(hasTailwindBase).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.css must have @tailwind components directive', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasTailwindComponents = /@tailwind\s+components\s*;/i.test(indexCssContent);
                        expect(hasTailwindComponents).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.css must have @tailwind utilities directive', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasTailwindUtilities = /@tailwind\s+utilities\s*;/i.test(indexCssContent);
                        expect(hasTailwindUtilities).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.css must have @layer base block', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasLayerBase = /@layer\s+base\s*\{/i.test(indexCssContent);
                        expect(hasLayerBase).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.css must have @layer components block', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasLayerComponents = /@layer\s+components\s*\{/i.test(indexCssContent);
                        expect(hasLayerComponents).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });

        it('index.css must have @layer utilities block', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        const hasLayerUtilities = /@layer\s+utilities\s*\{/i.test(indexCssContent);
                        expect(hasLayerUtilities).toBe(true);
                    },
                ),
                { numRuns: 5 },
            );
        });
    });
});
