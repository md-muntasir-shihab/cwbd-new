/**
 * Property 4: UniversityCard modern hides detail sections on home page
 *
 * For any university data object, when UniversityCard is rendered in modern variant
 * with home page config (`showExamDates=false`, `showApplicationProgress=false`),
 * the output SHALL NOT contain: individual exam date chips (UnitDateChip),
 * the "Application Window" box, or the seat count grid.
 *
 * **Validates: Requirements 3.3, 3.4, 3.5**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 4: UniversityCard modern hides detail sections on home page
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import UniversityCard from '../UniversityCard';
import type { ApiUniversityCardPreview } from '../../../services/api';

/* ─── Mock framer-motion to render plain HTML ─── */
vi.mock('framer-motion', () => {
    const wrap = (tag: string) =>
        ({ children, ...rest }: any) => {
            const El = tag as any;
            const {
                whileHover, whileTap, whileFocus, whileInView, whileDrag,
                initial, animate, exit, variants, transition, layout,
                layoutId, onAnimationComplete, onAnimationStart,
                ...domProps
            } = rest;
            return <El {...domProps}>{children}</El>;
        };
    return {
        motion: {
            div: wrap('div'),
            article: wrap('article'),
            span: wrap('span'),
            button: wrap('button'),
            a: wrap('a'),
            section: wrap('section'),
            li: wrap('li'),
        },
        AnimatePresence: ({ children }: any) => <>{children}</>,
    };
});

/* ─── Mock analytics ─── */
vi.mock('../../../services/api', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        trackAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
    };
});


/* ─── Mock react-hot-toast ─── */
vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

/* ─── Arbitrary: random ApiUniversityCardPreview ─── */

const isoDate = fc
    .integer({
        min: new Date('2000-01-01T00:00:00Z').getTime(),
        max: new Date('2090-01-01T00:00:00Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

const optionalDate = fc.oneof(isoDate, fc.constant(''), fc.constant(undefined as unknown as string));

const arbUniversity: fc.Arbitrary<ApiUniversityCardPreview> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
    shortForm: fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 2, maxLength: 8 }).map((a) => a.join('')),
    slug: fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'slug'),
    category: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
    clusterId: fc.option(fc.uuid(), { nil: undefined }),
    clusterGroup: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    contactNumber: fc.string({ minLength: 0, maxLength: 20 }),
    established: fc.option(fc.integer({ min: 1900, max: 2025 }), { nil: null }),
    address: fc.string({ minLength: 0, maxLength: 100 }),
    email: fc.constant('test@example.com'),
    website: fc.constant('https://example.com'),
    admissionWebsite: fc.oneof(fc.constant('https://apply.example.com'), fc.constant('')),
    totalSeats: fc.nat({ max: 99999 }).map(String),
    scienceSeats: fc.nat({ max: 99999 }).map(String),
    artsSeats: fc.nat({ max: 99999 }).map(String),
    businessSeats: fc.nat({ max: 99999 }).map(String),
    applicationStart: optionalDate as fc.Arbitrary<string>,
    applicationEnd: optionalDate as fc.Arbitrary<string>,
    applicationStartDate: optionalDate as fc.Arbitrary<string>,
    applicationEndDate: optionalDate as fc.Arbitrary<string>,
    scienceExamDate: optionalDate as fc.Arbitrary<string>,
    artsExamDate: optionalDate as fc.Arbitrary<string>,
    businessExamDate: optionalDate as fc.Arbitrary<string>,
    examDateScience: optionalDate as fc.Arbitrary<string>,
    examDateArts: optionalDate as fc.Arbitrary<string>,
    examDateBusiness: optionalDate as fc.Arbitrary<string>,
    examCentersPreview: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    shortDescription: fc.string({ minLength: 0, maxLength: 100 }),
    logoUrl: fc.oneof(fc.constant('https://example.com/logo.png'), fc.constant('')),
    badgeText: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    featured: fc.option(fc.boolean(), { nil: undefined }),
    isHistorical: fc.option(fc.boolean(), { nil: undefined }),
    endedAt: fc.option(isoDate, { nil: undefined }),
    timelineStatus: fc.option(fc.constantFrom('upcoming' as const, 'ended' as const), { nil: undefined }),
});

/* ─── Home page config that hides detail sections ─── */
const HOME_PAGE_CONFIG = {
    showExamDates: false,
    showApplicationProgress: false,
    showExamCentersPreview: false,
    showExamCentersOnHomeCards: false,
};

/* ─── Property test ─── */

describe('Feature: home-card-cleanup-redesign, Property 4: UniversityCard modern hides detail sections on home page', () => {
    it('UniversityCard modern variant hides exam date chips, Application Window box, and seat grid when rendered with home page config', () => {
        fc.assert(
            fc.property(arbUniversity, (uni) => {
                const { container, unmount } = render(
                    <MemoryRouter>
                        <UniversityCard
                            university={uni}
                            config={HOME_PAGE_CONFIG}
                            cardVariant="modern"
                        />
                    </MemoryRouter>,
                );

                const textContent = container.textContent ?? '';

                // 1. No "Application Window" text (Requirement 3.4)
                expect(textContent).not.toMatch(/application\s+window/i);

                // 2. No UnitDateChip labels — Science/Humanities/Business exam date chips (Requirement 3.3)
                // The UnitDateChip grid renders as a 3-col grid with "Science", "Humanities", "Business" labels
                const unitDateChipGrid = container.querySelector('.grid.grid-cols-3');
                if (unitDateChipGrid) {
                    const gridText = unitDateChipGrid.textContent ?? '';
                    expect(gridText.toLowerCase()).not.toContain('science');
                    expect(gridText.toLowerCase()).not.toContain('humanities');
                    expect(gridText.toLowerCase()).not.toContain('business');
                }

                // Also check via tracking-class selector used by UnitDateChip labels
                const chipLabels = container.querySelectorAll('[class*="tracking-[0.16em]"]');
                for (const chip of chipLabels) {
                    const chipText = (chip.textContent ?? '').trim().toLowerCase();
                    expect(chipText).not.toBe('science');
                    expect(chipText).not.toBe('humanities');
                    expect(chipText).not.toBe('business');
                }

                // 3. No seat count grid — Total/Sci/Com/Arts labels (Requirement 3.5)
                // The modern variant doesn't have a seat grid, but verify anyway
                expect(textContent).not.toMatch(/\bAvailable Seats\b/i);
                const allGrids = container.querySelectorAll('.grid');
                for (const grid of allGrids) {
                    const gridText = grid.textContent ?? '';
                    const hasSeatLabels =
                        /\bTotal\b/.test(gridText) &&
                        /\bSci\b/.test(gridText) &&
                        /\bCom\b/.test(gridText) &&
                        /\bArts\b/.test(gridText);
                    expect(hasSeatLabels).toBe(false);
                }

                // 4. Card should still render university name and action buttons
                // Use trimmed name since DOM may collapse whitespace
                expect(textContent).toContain(uni.name.trim());

                // Verify the card renders as modern variant
                const article = container.querySelector('[data-university-card-variant="modern"]');
                expect(article).not.toBeNull();

                unmount();
            }),
            { numRuns: 100 },
        );
    });
});
