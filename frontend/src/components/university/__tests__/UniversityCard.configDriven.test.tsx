/**
 * Integration test: Config-driven rendering for UniversityCard modern variant
 *
 * Tests that changing config values correctly toggles the corresponding UI elements.
 *
 * **Validates: Requirements 8.5**
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UniversityCard from '../UniversityCard';

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


/* ─── Fixed university data with all fields populated ─── */
const UNIVERSITY = {
    id: 'uni-001',
    name: 'Dhaka University',
    shortForm: 'DU',
    slug: 'dhaka-university',
    category: 'Public',
    clusterGroup: 'A-Unit Cluster',
    clusterSlug: 'a-unit-cluster',
    contactNumber: '+880-1234567890',
    established: 1921,
    address: 'Dhaka, Bangladesh',
    email: 'info@example.com',
    website: 'https://example.com',
    admissionWebsite: 'https://apply.example.com',
    totalSeats: '5000',
    scienceSeats: '2000',
    artsSeats: '1500',
    businessSeats: '1500',
    applicationStartDate: '2025-01-01T00:00:00.000Z',
    applicationEndDate: '2027-12-31T00:00:00.000Z',
    scienceExamDate: '2027-06-15T00:00:00.000Z',
    artsExamDate: '2027-06-20T00:00:00.000Z',
    businessExamDate: '2027-06-25T00:00:00.000Z',
    examCentersPreview: ['Dhaka', 'Chittagong', 'Rajshahi'],
    logoUrl: 'https://example.com/logo.png',
};

function renderCard(config: Record<string, unknown>) {
    return render(
        <MemoryRouter>
            <UniversityCard
                university={UNIVERSITY}
                config={config}
                cardVariant="modern"
            />
        </MemoryRouter>,
    );
}

describe('UniversityCard modern — config-driven rendering (Validates: Requirements 8.5)', () => {
    it('hides UnitDateChip grid when showExamDates is false', () => {
        const { container } = renderCard({ showExamDates: false });
        const text = container.textContent ?? '';
        // The 3-col grid with Science/Humanities/Business labels should be absent
        expect(text).not.toContain('Humanities');
        const grids = container.querySelectorAll('.grid-cols-3');
        for (const grid of grids) {
            const gridText = grid.textContent ?? '';
            expect(gridText).not.toContain('Science');
            expect(gridText).not.toContain('Humanities');
            expect(gridText).not.toContain('Business');
        }
    });

    it('shows UnitDateChip grid when showExamDates is true', () => {
        const { container } = renderCard({ showExamDates: true });
        const text = container.textContent ?? '';
        expect(text).toContain('Science');
        expect(text).toContain('Humanities');
        expect(text).toContain('Business');
    });

    it('hides Application Window when showApplicationProgress is false', () => {
        const { container } = renderCard({ showApplicationProgress: false });
        const text = container.textContent ?? '';
        expect(text).not.toMatch(/Application Window/i);
    });

    it('shows Application Window when showApplicationProgress is true', () => {
        const { container } = renderCard({ showApplicationProgress: true });
        const text = container.textContent ?? '';
        expect(text).toMatch(/Application Window/i);
    });

    it('hides cluster badge when showClusterBadge is false', () => {
        const { container } = renderCard({ showClusterBadge: false });
        // Purple-bordered badge should be absent
        const purpleBadges = container.querySelectorAll('[class*="border-purple"]');
        expect(purpleBadges.length).toBe(0);
        // Cluster group text should not appear
        const text = container.textContent ?? '';
        expect(text).not.toContain('A-Unit Cluster');
    });

    it('shows cluster badge when showClusterBadge is true and university has clusterGroup', () => {
        const { container } = renderCard({ showClusterBadge: true });
        const text = container.textContent ?? '';
        expect(text).toContain('A-Unit Cluster');
        const purpleBadges = container.querySelectorAll('[class*="border-purple"]');
        expect(purpleBadges.length).toBeGreaterThan(0);
    });

    it('hides exam centers when showExamCentersOnHomeCards is false and showExamCentersPreview is false', () => {
        const { container } = renderCard({
            showExamCentersOnHomeCards: false,
            showExamCentersPreview: false,
        });
        const text = container.textContent ?? '';
        expect(text).not.toContain('Centers:');
    });

    it('shows exam centers when showExamCentersPreview is true and university has examCentersPreview', () => {
        const { container } = renderCard({
            showExamCentersPreview: true,
        });
        const text = container.textContent ?? '';
        expect(text).toContain('Centers:');
        expect(text).toContain('Dhaka');
    });
});
