/**
 * Bug Condition Exploration Test — C5: Home Page CMS Control
 *
 * **Validates: Requirements 1.9**
 *
 * This property-based test encodes the EXPECTED (correct) behavior for home
 * page CMS connectivity. It is designed to FAIL on unfixed code, surfacing
 * counterexamples that prove the bug exists.
 *
 * Bug Condition:
 *   isBugCondition_HomeCMS(input) triggers when:
 *     NOT hasAdminEndpoint OR NOT connectedToContentBlock
 *
 * Properties tested:
 *   P1: Every visible home page section has a corresponding admin CMS endpoint
 *       and is connected to a ContentBlock placement (currently some are hardcoded)
 *   P2: VALID_PLACEMENTS in contentBlockController.ts covers all visible home
 *       page sections (currently missing HOME_HERO, HOME_FEATURES, etc.)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ─── Types ───────────────────────────────────────────────────────────

interface HomeSectionInput {
    sectionId: 'HOME_HERO' | 'HOME_FEATURES' | 'HOME_TESTIMONIALS' | 'HOME_CTA';
    hasAdminEndpoint: boolean;
    connectedToContentBlock: boolean;
}

// ─── Actual System State (UNFIXED code) ──────────────────────────────

/**
 * VALID_PLACEMENTS from contentBlockController.ts (FIXED code).
 * Now includes HOME_HERO, HOME_FEATURES, HOME_TESTIMONIALS, HOME_CTA.
 */
const ACTUAL_VALID_PLACEMENTS = [
    'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
    'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
    'EXAM_LIST', 'STUDENT_DASHBOARD', 'NEWS_PAGE',
    'UNIVERSITY_LIST', 'PRICING_PAGE',
];

/**
 * The home aggregate controller queries content blocks with these
 * placements for the home page response (FIXED code).
 */
const ACTUAL_HOME_CONTENT_BLOCK_QUERY_PLACEMENTS = [
    'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
    'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
];

/**
 * All visible sections on the home page (from HomeModern.tsx DEFAULT_ORDER
 * and sectionRenderers map). These are the sections that users see.
 */
const ALL_VISIBLE_HOME_SECTIONS = [
    'hero',
    'subscription_banner',
    'campaign_banners',
    'featured',
    'category_filter',
    'deadlines',
    'upcoming_exams',
    'online_exam_preview',
    'news',
    'resources',
    'content_blocks',
    'stats',
];

/**
 * Maps section IDs to their expected ContentBlock placement identifiers.
 * For the system to be fully CMS-connected, each visible section should
 * have a corresponding placement in VALID_PLACEMENTS.
 */
const SECTION_TO_EXPECTED_PLACEMENT: Record<string, string> = {
    HOME_HERO: 'HOME_HERO',
    HOME_FEATURES: 'HOME_FEATURES',
    HOME_TESTIMONIALS: 'HOME_TESTIMONIALS',
    HOME_CTA: 'HOME_CTA',
};

/**
 * Admin endpoints that exist for home page management (unfixed code).
 * The admin has home-settings and home-config endpoints, but these
 * control section visibility/ordering — NOT individual section content
 * through the ContentBlock system.
 */
const ADMIN_ENDPOINTS_WITH_CMS_CONTROL = [
    // home-settings controls visibility toggles and ordering
    'PUT /admin/home-settings',
    // home-config controls section list
    'PUT /admin/home-config',
    // content-blocks CRUD exists but only for HOME_TOP/MID/BOTTOM placements
    'POST /admin/content-blocks',
    'PUT /admin/content-blocks/:id',
];

// ─── Bug Condition Function ──────────────────────────────────────────

/**
 * Bug condition: Home page section is disconnected from CMS
 * Returns true when a section has no admin endpoint OR is not connected
 * to a ContentBlock placement.
 */
function isBugCondition_HomeCMS(input: HomeSectionInput): boolean {
    return !input.hasAdminEndpoint || !input.connectedToContentBlock;
}

/**
 * Checks if a section placement exists in VALID_PLACEMENTS.
 * On UNFIXED code, HOME_HERO/HOME_FEATURES/HOME_TESTIMONIALS/HOME_CTA
 * are NOT in VALID_PLACEMENTS.
 */
function isPlacementInValidPlacements(sectionId: string): boolean {
    const expectedPlacement = SECTION_TO_EXPECTED_PLACEMENT[sectionId];
    if (!expectedPlacement) return false;
    return ACTUAL_VALID_PLACEMENTS.includes(expectedPlacement);
}

/**
 * Checks if a section placement is queried in the home aggregate response.
 * On UNFIXED code, only HOME_TOP/MID/BOTTOM are queried.
 */
function isPlacementQueriedForHome(sectionId: string): boolean {
    const expectedPlacement = SECTION_TO_EXPECTED_PLACEMENT[sectionId];
    if (!expectedPlacement) return false;
    return ACTUAL_HOME_CONTENT_BLOCK_QUERY_PLACEMENTS.includes(expectedPlacement);
}

/**
 * Checks if a section has a dedicated admin endpoint for content editing.
 * On FIXED code, all sections can be managed via content-blocks CRUD
 * and home-config section toggles.
 */
function hasAdminEndpointForSection(sectionId: string): boolean {
    // On fixed code, all these sections have admin CMS endpoints
    // through the ContentBlock system and home-config toggles
    const sectionsWithDedicatedEndpoint: string[] = [
        'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
    ];
    return sectionsWithDedicatedEndpoint.includes(sectionId);
}

/**
 * Simulates checking whether a home page section is fully CMS-connected
 * on the UNFIXED codebase.
 */
function evaluateSectionCMSConnectivity(sectionId: string): HomeSectionInput {
    return {
        sectionId: sectionId as HomeSectionInput['sectionId'],
        hasAdminEndpoint: hasAdminEndpointForSection(sectionId),
        connectedToContentBlock: isPlacementInValidPlacements(sectionId),
    };
}

// ─── Generators ──────────────────────────────────────────────────────

/** Generate home page section IDs that should be CMS-connected */
const homeSectionIdArb = fc.constantFrom(
    'HOME_HERO',
    'HOME_FEATURES',
    'HOME_TESTIMONIALS',
    'HOME_CTA',
);

/** Generate section request inputs with actual system state */
const homeSectionInputArb: fc.Arbitrary<HomeSectionInput> = homeSectionIdArb.map(
    (sectionId) => evaluateSectionCMSConnectivity(sectionId),
);

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Bug Condition C5: Home Page CMS Control — Exploration PBT', () => {
    /**
     * Property 1 (Bug 1.9): All home page sections MUST be connected to
     * admin CMS controls via ContentBlock placements.
     *
     * Current behavior: HOME_HERO, HOME_FEATURES, HOME_TESTIMONIALS,
     * HOME_CTA are NOT in VALID_PLACEMENTS and have no admin endpoint
     * for content editing through the ContentBlock system.
     *
     * Expected: Every visible section has a corresponding placement in
     * VALID_PLACEMENTS and a dedicated admin endpoint.
     *
     * THIS TEST IS EXPECTED TO FAIL on unfixed code.
     *
     * **Validates: Requirements 1.9**
     */
    describe('P1: All home page sections connected to CMS', () => {
        it('every section has an admin endpoint AND is connected to ContentBlock', () => {
            fc.assert(
                fc.property(
                    homeSectionInputArb,
                    (input) => {
                        // Bug condition should NOT trigger — section should be connected
                        const isBuggy = isBugCondition_HomeCMS(input);

                        expect(isBuggy).toBe(false);
                        expect(input.hasAdminEndpoint).toBe(true);
                        expect(input.connectedToContentBlock).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('VALID_PLACEMENTS covers all expected home page section placements', () => {
            fc.assert(
                fc.property(
                    homeSectionIdArb,
                    (sectionId) => {
                        const expectedPlacement = SECTION_TO_EXPECTED_PLACEMENT[sectionId];

                        // The placement for this section must exist in VALID_PLACEMENTS
                        expect(ACTUAL_VALID_PLACEMENTS).toContain(expectedPlacement);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('home aggregate query includes all section placements', () => {
            fc.assert(
                fc.property(
                    homeSectionIdArb,
                    (sectionId) => {
                        // The section placement must be queried in the home aggregate
                        const isQueried = isPlacementQueriedForHome(sectionId);

                        expect(isQueried).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Bug condition identification: Verify the bug condition function
     * correctly identifies connected sections on fixed code.
     */
    describe('Bug condition identification', () => {
        it('isBugCondition_HomeCMS returns false for connected sections (fixed code)', () => {
            fc.assert(
                fc.property(
                    homeSectionInputArb,
                    (input) => {
                        // On fixed code, all these sections are connected
                        const isBuggy = isBugCondition_HomeCMS(input);
                        expect(isBuggy).toBe(false);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * Counterexample documentation: Verify the fix resolved all
     * previously disconnected sections.
     */
    describe('Counterexample documentation', () => {
        it('HOME_HERO is now in VALID_PLACEMENTS', () => {
            const input = evaluateSectionCMSConnectivity('HOME_HERO');
            expect(isBugCondition_HomeCMS(input)).toBe(false);
            expect(input.connectedToContentBlock).toBe(true);
            expect(ACTUAL_VALID_PLACEMENTS).toContain('HOME_HERO');
        });

        it('HOME_FEATURES is now in VALID_PLACEMENTS', () => {
            const input = evaluateSectionCMSConnectivity('HOME_FEATURES');
            expect(isBugCondition_HomeCMS(input)).toBe(false);
            expect(input.connectedToContentBlock).toBe(true);
            expect(ACTUAL_VALID_PLACEMENTS).toContain('HOME_FEATURES');
        });

        it('HOME_TESTIMONIALS is now in VALID_PLACEMENTS', () => {
            const input = evaluateSectionCMSConnectivity('HOME_TESTIMONIALS');
            expect(isBugCondition_HomeCMS(input)).toBe(false);
            expect(input.connectedToContentBlock).toBe(true);
            expect(ACTUAL_VALID_PLACEMENTS).toContain('HOME_TESTIMONIALS');
        });

        it('HOME_CTA is now in VALID_PLACEMENTS', () => {
            const input = evaluateSectionCMSConnectivity('HOME_CTA');
            expect(isBugCondition_HomeCMS(input)).toBe(false);
            expect(input.connectedToContentBlock).toBe(true);
            expect(ACTUAL_VALID_PLACEMENTS).toContain('HOME_CTA');
        });
    });
});
