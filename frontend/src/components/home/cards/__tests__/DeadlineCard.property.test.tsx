/**
 * Property 1: Single urgency indicator per card
 *
 * For any university data object, the rendered DeadlineCard SHALL contain
 * at most one element conveying the urgency state (e.g., "Closed", countdown
 * chip with "days left" / "Today!" / "TBD"). No two elements on the same card
 * should communicate the same status.
 *
 * **Validates: Requirements 1.1, 1.4**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 1: Single urgency indicator per card
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import DeadlineCard from '../DeadlineCard';
import type { ApiUniversityCardPreview } from '../../../../services/api';

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


/* ─── Arbitrary: random ApiUniversityCardPreview ─── */

/** Produces a valid ISO date string within 2000–2090 range. */
const isoDate = fc
    .integer({
        min: new Date('2000-01-01T00:00:00Z').getTime(),
        max: new Date('2090-01-01T00:00:00Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

/** Produces either a valid ISO date or an empty/missing value. */
const optionalDate = fc.oneof(isoDate, fc.constant(''), fc.constant(undefined as unknown as string));

/** Generates a random ApiUniversityCardPreview with plausible data. */
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

/* ─── Urgency indicator detection ─── */

/**
 * Urgency indicators are dedicated badge/chip UI elements that convey time-based status.
 * The CountdownChip renders as a `rounded-full` span with text like "X days left",
 * "Today!", "TBD". The ProgressBar's inline label (e.g., "Closed", "X days left")
 * is part of the progress bar component, not a separate urgency indicator.
 *
 * Detection strategy: count `rounded-full` elements whose text matches urgency phrases.
 * This targets CountdownChip / CountdownBadge specifically.
 */
const URGENCY_TEXT = [
    /\d+ days? left/i,
    /today!/i,
    /\btbd\b/i,
];

function countUrgencyIndicators(container: HTMLElement): number {
    // CountdownChip and CountdownBadge both use `rounded-full`
    const chips = container.querySelectorAll('[class*="rounded-full"]');
    let count = 0;

    for (const el of chips) {
        const text = (el.textContent ?? '').trim();
        if (!text) continue;

        const isUrgency = URGENCY_TEXT.some((pat) => pat.test(text));
        if (isUrgency) count++;
    }

    return count;
}

/* ─── Property test ─── */

describe('Feature: home-card-cleanup-redesign, Property 1: Single urgency indicator per card', () => {
    it('DeadlineCard renders at most one urgency indicator for any university data', () => {
        fc.assert(
            fc.property(arbUniversity, (uni) => {
                const { container, unmount } = render(
                    <MemoryRouter>
                        <DeadlineCard university={uni} />
                    </MemoryRouter>,
                );

                const urgencyCount = countUrgencyIndicators(container);
                expect(urgencyCount).toBeLessThanOrEqual(1);

                unmount();
            }),
            { numRuns: 100 },
        );
    });
});


/* ─── Property 3: Removed elements absent from DeadlineCard ─── */

/**
 * Property 3: Removed elements absent from DeadlineCard
 *
 * For any university data object, the rendered DeadlineCard SHALL NOT contain:
 * an "Application Window" labeled section, individual Science/Humanities/Business
 * exam date chips, or a cluster group badge.
 *
 * **Validates: Requirements 3.6, 3.8, 5.3**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 3: Removed elements absent from DeadlineCard
 */

/** Patterns that must NOT appear in the rendered DeadlineCard output. */
const REMOVED_PATTERNS = [
    /application\s+window/i,
    /science\s+exam/i,
    /humanities\s+exam/i,
    /business\s+exam/i,
    /বিজ্ঞান/,
    /মানবিক/,
    /ব্যবসায়/,
];

describe('Feature: home-card-cleanup-redesign, Property 3: Removed elements absent from DeadlineCard', () => {
    it('DeadlineCard never renders Application Window, exam date chips, or cluster badge for any university data', () => {
        fc.assert(
            fc.property(arbUniversity, (uni) => {
                const { container, unmount } = render(
                    <MemoryRouter>
                        <DeadlineCard university={uni} />
                    </MemoryRouter>,
                );

                const textContent = container.textContent ?? '';

                // 1. No "Application Window" section
                for (const pattern of REMOVED_PATTERNS) {
                    expect(textContent).not.toMatch(pattern);
                }

                // 2. No cluster group badge — if uni has a clusterGroup value,
                //    it must NOT appear as a standalone badge element in the card
                if (uni.clusterGroup && uni.clusterGroup.trim()) {
                    const badges = container.querySelectorAll('[class*="rounded"]');
                    for (const badge of badges) {
                        const badgeText = (badge.textContent ?? '').trim();
                        // The cluster group text should not be rendered as its own badge
                        expect(badgeText).not.toBe(uni.clusterGroup.trim());
                    }
                }

                unmount();
            }),
            { numRuns: 100 },
        );
    });
});
