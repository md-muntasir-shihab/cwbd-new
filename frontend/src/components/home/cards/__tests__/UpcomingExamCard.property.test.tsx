/**
 * Property 2: No exam centers on home cards
 *
 * For any university data object with a non-empty `examCentersPreview` array,
 * when rendered by UpcomingExamCard, the rendered output SHALL NOT contain
 * any exam center name text from that array.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 2: No exam centers on home cards
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import UpcomingExamCard from '../UpcomingExamCard';
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

/* ─── Arbitrary: random ApiUniversityCardPreview with non-empty examCentersPreview ─── */

/** Produces a valid ISO date string within 2000–2090 range. */
const isoDate = fc
    .integer({
        min: new Date('2000-01-01T00:00:00Z').getTime(),
        max: new Date('2090-01-01T00:00:00Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

/** Produces either a valid ISO date or an empty/missing value. */
const optionalDate = fc.oneof(isoDate, fc.constant(''), fc.constant(undefined as unknown as string));

/**
 * Generates an exam center name that is meaningful (non-empty, trimmed, no
 * overlap with structural card text like "Apply Now", "Details", etc.).
 */
const arbExamCenter = fc
    .stringMatching(/^[A-Z][a-z]+ (Center|Hall|Campus|Building|Complex) \d{1,3}$/)
    .filter((s) => s.trim().length > 0);

/** Generates a random ApiUniversityCardPreview with at least 1 exam center. */
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
    examCentersPreview: fc.array(arbExamCenter, { minLength: 1, maxLength: 5 }),
    shortDescription: fc.string({ minLength: 0, maxLength: 100 }),
    logoUrl: fc.oneof(fc.constant('https://example.com/logo.png'), fc.constant('')),
    badgeText: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    featured: fc.option(fc.boolean(), { nil: undefined }),
    isHistorical: fc.option(fc.boolean(), { nil: undefined }),
    endedAt: fc.option(isoDate, { nil: undefined }),
    timelineStatus: fc.option(fc.constantFrom('upcoming' as const, 'ended' as const), { nil: undefined }),
});

/* ─── Property test ─── */

describe('Feature: home-card-cleanup-redesign, Property 2: No exam centers on home cards', () => {
    it('UpcomingExamCard never renders exam center text from examCentersPreview for any university data', () => {
        fc.assert(
            fc.property(arbUniversity, (uni) => {
                const { container, unmount } = render(
                    <MemoryRouter>
                        <UpcomingExamCard university={uni} />
                    </MemoryRouter>,
                );

                const textContent = container.textContent ?? '';

                // Each exam center name from the preview array must NOT appear in the rendered output
                for (const center of uni.examCentersPreview) {
                    const trimmed = center.trim();
                    if (trimmed.length > 0) {
                        expect(textContent).not.toContain(trimmed);
                    }
                }

                unmount();
            }),
            { numRuns: 100 },
        );
    });
});
