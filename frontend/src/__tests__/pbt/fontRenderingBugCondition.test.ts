/**
 * Bug Condition Exploration Test — C3: Font/Typography (Bug 1.7)
 *
 * **Validates: Requirements 1.7**
 *
 * This property-based test encodes the EXPECTED (correct) behavior for font
 * rendering. It is designed to FAIL on unfixed code, surfacing
 * counterexamples that prove the bugs exist.
 *
 * Bug Condition:
 *   isBugCondition_FontRendering(input) triggers when:
 *     NOT hasFontFaceDeclaration
 *     OR fontFallbackUsedInstead(component)
 *     OR cssSpecificityOverridesBanglaFont(component)
 *
 * Properties tested:
 *   P1: index.css contains @font-face declarations for Bangla fonts with
 *       font-display: swap and correct src paths (currently missing entirely)
 *   P2: index.html has preload hints for critical font files
 *       (currently no font preload hints exist)
 *   P3: tailwind.config.js extends fontFamily with Bangla/Bengali font
 *       families so utility classes work without specificity conflicts
 *       (currently no Bangla font family defined)
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

// ─── Read source files once ─────────────────────────────────────────

const indexCssContent = fs.readFileSync(INDEX_CSS_PATH, 'utf-8');
const indexHtmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
const tailwindConfigContent = fs.readFileSync(TAILWIND_CONFIG_PATH, 'utf-8');

// ─── Generators ─────────────────────────────────────────────────────

/** Components that render Bangla text and need proper font support */
const banglaComponentArb = fc.constantFrom(
    'UniversityCard',
    'ExamCenterLocation',
    'ContentBlock',
    'NewsArticle',
    'QuestionBank',
);

/** Required Bangla font families that should have @font-face declarations */
const requiredBanglaFontArb = fc.constantFrom(
    'Noto Sans Bengali',
    'Hind Siliguri',
);

/** Font formats that should be referenced in @font-face src */
const fontFormatArb = fc.constantFrom('woff2', 'woff', 'truetype');

/** Font weights that Bangla fonts should support */
const fontWeightArb = fc.constantFrom('400', '500', '600', '700');

/** Generate font rendering state matching the bug condition spec */
const fontRenderingStateArb = fc.record({
    component: banglaComponentArb,
    requiredFont: requiredBanglaFontArb,
    fontWeight: fontWeightArb,
    fontFormat: fontFormatArb,
});

// ─── Test Suite ─────────────────────────────────────────────────────

describe('Bug Condition C3: Font/Typography — Exploration PBT', () => {

    /**
     * Property 1 (Bug 1.7): index.css must contain @font-face declarations
     * for Bangla fonts with font-display: swap and correct src paths.
     *
     * On UNFIXED code: index.css has NO @font-face declarations at all.
     * The CSS only references 'Plus Jakarta Sans' and 'Sora' (loaded via
     * Google Fonts in index.html), but no Bangla fonts are declared.
     *
     * Expected: @font-face declarations for Bangla fonts (e.g., Noto Sans
     * Bengali, Hind Siliguri) with font-display: swap and valid src paths.
     *
     * **Validates: Requirements 1.7**
     */
    describe('P1: @font-face declarations for Bangla fonts in index.css', () => {
        it('index.css must contain @font-face declarations', () => {
            fc.assert(
                fc.property(
                    fontRenderingStateArb,
                    (_state) => {
                        // The CSS file must contain at least one @font-face rule
                        const hasFontFace = indexCssContent.includes('@font-face');
                        expect(hasFontFace).toBe(true);
                    },
                ),
                { numRuns: 20 },
            );
        });

        it('Bangla font families must have @font-face declarations with font-display: swap', () => {
            fc.assert(
                fc.property(
                    requiredBanglaFontArb,
                    (fontFamily) => {
                        // Check that the CSS contains a @font-face block for this font
                        const fontFamilyPattern = new RegExp(
                            `@font-face[^}]*font-family:\\s*['"]?${fontFamily.replace(/\s+/g, '\\s+')}['"]?`,
                            'is',
                        );
                        const hasFontFaceForFamily = fontFamilyPattern.test(indexCssContent);
                        expect(hasFontFaceForFamily).toBe(true);

                        // Check that font-display: swap is used
                        const fontDisplayPattern = new RegExp(
                            `@font-face[^}]*font-family:\\s*['"]?${fontFamily.replace(/\s+/g, '\\s+')}['"]?[^}]*font-display:\\s*swap`,
                            'is',
                        );
                        const hasFontDisplaySwap = fontDisplayPattern.test(indexCssContent);
                        expect(hasFontDisplaySwap).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });

        it('Bangla font @font-face declarations must have valid src paths', () => {
            fc.assert(
                fc.property(
                    requiredBanglaFontArb,
                    (fontFamily) => {
                        // Check that the @font-face block has a src with a file reference
                        const srcPattern = new RegExp(
                            `@font-face[^}]*font-family:\\s*['"]?${fontFamily.replace(/\s+/g, '\\s+')}['"]?[^}]*src:\\s*url\\(`,
                            'is',
                        );
                        const hasSrcUrl = srcPattern.test(indexCssContent);
                        expect(hasSrcUrl).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    /**
     * Property 2 (Bug 1.7): index.html must have preload hints for critical
     * font files to prevent FOIT (Flash of Invisible Text) and FOUT (Flash
     * of Unstyled Text).
     *
     * On UNFIXED code: index.html has preconnect hints for Google Fonts but
     * NO <link rel="preload" as="font"> tags for any local font files.
     *
     * Expected: <link rel="preload" as="font" type="font/woff2" crossorigin>
     * tags for critical Bangla font files.
     *
     * **Validates: Requirements 1.7**
     */
    describe('P2: Font preload hints in index.html', () => {
        it('index.html must contain font preload link tags', () => {
            fc.assert(
                fc.property(
                    banglaComponentArb,
                    (_component) => {
                        // Check for <link rel="preload" as="font"> tags
                        const hasPreloadFont = /rel=["']preload["'][^>]*as=["']font["']/i.test(indexHtmlContent)
                            || /as=["']font["'][^>]*rel=["']preload["']/i.test(indexHtmlContent);
                        expect(hasPreloadFont).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });

        it('font preload hints must include crossorigin attribute', () => {
            fc.assert(
                fc.property(
                    banglaComponentArb,
                    (_component) => {
                        // Font preload links must have crossorigin for CORS
                        const preloadPattern = /<link[^>]*rel=["']preload["'][^>]*as=["']font["'][^>]*crossorigin/i;
                        const altPreloadPattern = /<link[^>]*as=["']font["'][^>]*rel=["']preload["'][^>]*crossorigin/i;
                        const hasCrossOrigin = preloadPattern.test(indexHtmlContent)
                            || altPreloadPattern.test(indexHtmlContent);
                        expect(hasCrossOrigin).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    /**
     * Property 3 (Bug 1.7): tailwind.config.js must extend fontFamily with
     * Bangla/Bengali font families so that utility classes like `font-bangla`
     * work without CSS specificity conflicts.
     *
     * On UNFIXED code: tailwind.config.js only defines `sans` and `heading`
     * font families. No Bangla font family is defined, so there's no way
     * to apply Bangla fonts via Tailwind utility classes.
     *
     * Expected: theme.extend.fontFamily should include a Bangla font family
     * (e.g., `bangla: ['Noto Sans Bengali', 'Hind Siliguri', ...]`).
     *
     * **Validates: Requirements 1.7**
     */
    describe('P3: Tailwind config includes Bangla font family', () => {
        it('tailwind.config.js must define a Bangla font family in theme.extend.fontFamily', () => {
            fc.assert(
                fc.property(
                    banglaComponentArb,
                    (_component) => {
                        // Check that the Tailwind config includes a Bangla font family
                        const hasBanglaFont = /fontFamily[\s\S]*?bangla\s*:/i.test(tailwindConfigContent)
                            || /fontFamily[\s\S]*?bengali\s*:/i.test(tailwindConfigContent)
                            || /fontFamily[\s\S]*?bn\s*:/i.test(tailwindConfigContent);
                        expect(hasBanglaFont).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });

        it('Bangla font family must include proper fallback fonts', () => {
            fc.assert(
                fc.property(
                    requiredBanglaFontArb,
                    (fontFamily) => {
                        // The Tailwind config should reference the Bangla font name
                        const fontNameEscaped = fontFamily.replace(/\s+/g, '\\s+');
                        const hasFontReference = new RegExp(fontNameEscaped, 'i').test(tailwindConfigContent);
                        expect(hasFontReference).toBe(true);
                    },
                ),
                { numRuns: 10 },
            );
        });

        it('sans font family should include Bangla font as fallback for mixed content', () => {
            fc.assert(
                fc.property(
                    fc.constant(true),
                    (_) => {
                        // The sans font stack should include a Bangla font so that
                        // mixed English/Bangla content renders correctly without
                        // needing explicit font-bangla utility class
                        const sansSection = tailwindConfigContent.match(
                            /sans\s*:\s*\[([^\]]+)\]/,
                        );
                        expect(sansSection).not.toBeNull();

                        if (sansSection) {
                            const sansStack = sansSection[1].toLowerCase();
                            const hasBanglaInSans = sansStack.includes('noto sans bengali')
                                || sansStack.includes('hind siliguri')
                                || sansStack.includes('bangla');
                            expect(hasBanglaInSans).toBe(true);
                        }
                    },
                ),
                { numRuns: 5 },
            );
        });
    });
});
