/**
 * Property 8: Category badge truncation
 *
 * For any category string, when rendered by DeadlineCard or UpcomingExamCard,
 * the category badge element SHALL have `truncate` and `max-w-[20ch]` CSS classes
 * applied (structural truncation), a `title` attribute containing the full category
 * text (for tooltip on hover), and the full text present in textContent (CSS handles
 * the visual truncation in the browser).
 *
 * Note: jsdom does not apply CSS, so we verify the structural classes are present
 * rather than testing visual truncation directly.
 *
 * **Validates: Requirements 5.1, 5.2, 5.5**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 8: Category badge truncation
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import DeadlineCard from '../DeadlineCard';
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

/* ─── Arbitrary generators ─── */

const isoDate = fc
    .integer({
        min: new Date('2000-01-01T00:00:00Z').getTime(),
        max: new Date('2090-01-01T00:00:00Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

const optionalDate = fc.oneof(isoDate, fc.constant(''), fc.constant(undefined as unknown as string));

/**
 * Category string generator: produces strings between 5 and 60 characters.
 * Uses alphanumeric + spaces to ensure readable category names.
 */
const arbCategory = fc
    .stringMatching(/^[A-Za-z][A-Za-z0-9 ]{4,59}$/)
    .filter((s) => s.trim().length >= 5);

/** Build a university preview with a specific category string. */
function makeUniversity(category: string): ApiUniversityCardPreview {
    return {
        id: 'test-id',
        name: 'Test University',
        shortForm: ['T', 'U'],
        slug: 'test-university',
        category,
        clusterId: undefined,
        clusterGroup: undefined,
        contactNumber: '',
        established: null,
        address: '',
        email: 'test@example.com',
        website: 'https://example.com',
        admissionWebsite: 'https://apply.example.com',
        totalSeats: '100',
        scienceSeats: '50',
        artsSeats: '30',
        businessSeats: '20',
        applicationStart: '2025-01-01T00:00:00Z',
        applicationEnd: '2025-12-31T00:00:00Z',
        applicationStartDate: '2025-01-01T00:00:00Z',
        applicationEndDate: '2025-12-31T00:00:00Z',
        scienceExamDate: '2025-06-15T00:00:00Z',
        artsExamDate: '2025-06-16T00:00:00Z',
        businessExamDate: '2025-06-17T00:00:00Z',
        examDateScience: '2025-06-15T00:00:00Z',
        examDateArts: '2025-06-16T00:00:00Z',
        examDateBusiness: '2025-06-17T00:00:00Z',
        examCentersPreview: [],
        shortDescription: '',
        logoUrl: 'https://example.com/logo.png',
        badgeText: undefined,
        featured: false,
        isHistorical: false,
        endedAt: undefined,
        timelineStatus: 'upcoming',
    } as ApiUniversityCardPreview;
}


/**
 * Finds the category badge element in the rendered container.
 * The badge is identified by having both `truncate` and `max-w-` in its class list.
 */
function findCategoryBadge(container: HTMLElement): Element | null {
    const allElements = container.querySelectorAll('[class*="truncate"]');
    for (const el of allElements) {
        const cls = el.getAttribute('class') ?? '';
        if (cls.includes('truncate') && cls.includes('max-w-')) {
            return el;
        }
    }
    return null;
}

/* ─── Property tests ─── */

describe('Feature: home-card-cleanup-redesign, Property 8: Category badge truncation', () => {
    it('DeadlineCard category badge has truncation classes, title attribute, and full text for any category string', () => {
        fc.assert(
            fc.property(arbCategory, (category) => {
                const uni = makeUniversity(category);
                const { container, unmount } = render(
                    <MemoryRouter>
                        <DeadlineCard university={uni} />
                    </MemoryRouter>,
                );

                const badge = findCategoryBadge(container);

                // 1. Badge element exists with truncation classes
                expect(badge).not.toBeNull();
                const cls = badge!.getAttribute('class') ?? '';
                expect(cls).toContain('truncate');
                expect(cls).toMatch(/max-w-\[20ch\]/);

                // 2. Title attribute contains the full category text (tooltip on hover)
                expect(badge!.getAttribute('title')).toBe(category);

                // 3. Full text is present in textContent (CSS handles visual truncation)
                expect(badge!.textContent).toContain(category);

                unmount();
            }),
            { numRuns: 100 },
        );
    });

    it('UpcomingExamCard category badge has truncation classes, title attribute, and full text for any category string', () => {
        fc.assert(
            fc.property(arbCategory, (category) => {
                const uni = makeUniversity(category);
                const { container, unmount } = render(
                    <MemoryRouter>
                        <UpcomingExamCard university={uni} />
                    </MemoryRouter>,
                );

                const badge = findCategoryBadge(container);

                // 1. Badge element exists with truncation classes
                expect(badge).not.toBeNull();
                const cls = badge!.getAttribute('class') ?? '';
                expect(cls).toContain('truncate');
                expect(cls).toMatch(/max-w-\[20ch\]/);

                // 2. Title attribute contains the full category text (tooltip on hover)
                expect(badge!.getAttribute('title')).toBe(category);

                // 3. Full text is present in textContent (CSS handles visual truncation)
                expect(badge!.textContent).toContain(category);

                unmount();
            }),
            { numRuns: 100 },
        );
    });
});
