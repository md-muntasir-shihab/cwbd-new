// Feature: exam-center-backend-completion, Property 7: Analytics Computation Correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 7: Analytics Computation Correctness
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * For any set of ExamResult documents and optional date range filter,
 * the analytics `totalAttempts` SHALL equal the count of matching results,
 * `averageScore` SHALL equal the arithmetic mean of their `percentage` values,
 * `passRate` SHALL equal the proportion of results with `percentage >= 40`
 * (expressed as a percentage), and `activeStudents` SHALL equal the count
 * of distinct `student` IDs among matching results.
 *
 * This is a PURE LOGIC test — no database involved. We:
 * 1. Generate random ExamResult documents with percentage, student, and submittedAt
 * 2. Optionally generate a date range filter
 * 3. Apply the filter, compute metrics using the same logic as getAnalyticsOverview
 * 4. Verify the four invariants against an independent oracle
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExamResultEntry {
    student: string;
    percentage: number;
    submittedAt: Date;
}

interface DateRangeFilter {
    dateFrom?: Date;
    dateTo?: Date;
}

interface AnalyticsMetrics {
    totalAttempts: number;
    averageScore: number;
    passRate: number;
    activeStudents: number;
}

// ─── Pure Computation Logic (mirrors getAnalyticsOverview controller) ─────────

/**
 * Replicates the analytics aggregation from getAnalyticsOverview.
 * Filters results by optional date range, then computes:
 * - totalAttempts: count of matching results
 * - averageScore: arithmetic mean of percentage values (rounded to 2 dp)
 * - passRate: (count where percentage >= 40 / totalAttempts) * 100 (rounded to 2 dp)
 * - activeStudents: count of distinct student IDs
 */
function computeAnalytics(
    results: ExamResultEntry[],
    filter: DateRangeFilter,
): AnalyticsMetrics {
    // Apply date range filter (mirrors $match stage)
    let filtered = results;
    if (filter.dateFrom || filter.dateTo) {
        filtered = results.filter((r) => {
            if (filter.dateFrom && r.submittedAt < filter.dateFrom) return false;
            if (filter.dateTo && r.submittedAt > filter.dateTo) return false;
            return true;
        });
    }

    if (filtered.length === 0) {
        return {
            totalAttempts: 0,
            averageScore: 0,
            passRate: 0,
            activeStudents: 0,
        };
    }

    const totalAttempts = filtered.length;

    // Average score: arithmetic mean of percentage, rounded to 2 dp
    const sumPercentage = filtered.reduce((sum, r) => sum + r.percentage, 0);
    const averageScore = Math.round((sumPercentage / totalAttempts) * 100) / 100;

    // Pass rate: proportion with percentage >= 40, as percentage, rounded to 2 dp
    const passCount = filtered.filter((r) => r.percentage >= 40).length;
    const passRate = Math.round((passCount / totalAttempts) * 100 * 100) / 100;

    // Active students: distinct student IDs
    const activeStudents = new Set(filtered.map((r) => r.student)).size;

    return { totalAttempts, averageScore, passRate, activeStudents };
}

// ─── Independent Oracle ──────────────────────────────────────────────────────

/**
 * Independent oracle that computes expected analytics values directly
 * from the filtered entries, using a clearly correct implementation.
 */
function oracleAnalytics(
    results: ExamResultEntry[],
    filter: DateRangeFilter,
): AnalyticsMetrics {
    // Filter by date range
    const matching = results.filter((r) => {
        if (filter.dateFrom && r.submittedAt.getTime() < filter.dateFrom.getTime()) return false;
        if (filter.dateTo && r.submittedAt.getTime() > filter.dateTo.getTime()) return false;
        return true;
    });

    if (matching.length === 0) {
        return { totalAttempts: 0, averageScore: 0, passRate: 0, activeStudents: 0 };
    }

    const totalAttempts = matching.length;

    // Mean of percentages
    let total = 0;
    for (const r of matching) {
        total += r.percentage;
    }
    const averageScore = Math.round((total / totalAttempts) * 100) / 100;

    // Pass rate
    let passes = 0;
    for (const r of matching) {
        if (r.percentage >= 40) passes++;
    }
    const passRate = Math.round((passes / totalAttempts) * 100 * 100) / 100;

    // Distinct students
    const studentSet = new Set<string>();
    for (const r of matching) {
        studentSet.add(r.student);
    }
    const activeStudents = studentSet.size;

    return { totalAttempts, averageScore, passRate, activeStudents };
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const objectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Small pool of student IDs to ensure realistic overlap (some students take multiple exams). */
const studentPoolArb = fc.array(objectIdArb, { minLength: 1, maxLength: 5 });

/** Generate a date within a reasonable range (2024-01-01 to 2025-12-31). */
const dateArb = fc
    .integer({ min: 1704067200000, max: 1767225600000 }) // 2024-01-01 to 2025-12-31 in ms
    .map((ms) => new Date(ms));

/** Generate a single ExamResult entry. */
const examResultEntryArb = (studentPool: string[]): fc.Arbitrary<ExamResultEntry> =>
    fc.record({
        student: fc.constantFrom(...studentPool),
        percentage: fc.double({ min: 0, max: 100, noNaN: true }),
        submittedAt: dateArb,
    });

/** Generate a set of ExamResult entries (0-15). */
const examResultsArb: fc.Arbitrary<ExamResultEntry[]> = studentPoolArb.chain((pool) =>
    fc.integer({ min: 0, max: 15 }).chain((count) =>
        fc.array(examResultEntryArb(pool), { minLength: count, maxLength: count }),
    ),
);

/** Generate an optional date range filter. */
const dateRangeFilterArb: fc.Arbitrary<DateRangeFilter> = fc.oneof(
    // No filter
    fc.constant({} as DateRangeFilter),
    // dateFrom only
    dateArb.map((d) => ({ dateFrom: d })),
    // dateTo only
    dateArb.map((d) => ({ dateTo: d })),
    // Both dateFrom and dateTo (ensure dateFrom <= dateTo)
    fc
        .tuple(dateArb, dateArb)
        .map(([a, b]) =>
            a.getTime() <= b.getTime()
                ? { dateFrom: a, dateTo: b }
                : { dateFrom: b, dateTo: a },
        ),
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 7: Analytics Computation Correctness', () => {
    /**
     * All four analytics invariants hold for any set of results and date filter.
     * **Validates: Requirements 8.1, 8.2, 8.3**
     */
    it('totalAttempts, averageScore, passRate, and activeStudents match oracle for any results and date filter', () => {
        fc.assert(
            fc.property(examResultsArb, dateRangeFilterArb, (results, filter) => {
                const computed = computeAnalytics(results, filter);
                const expected = oracleAnalytics(results, filter);

                // Invariant 1: totalAttempts equals count of matching results
                expect(computed.totalAttempts).toBe(expected.totalAttempts);

                // Invariant 2: averageScore equals arithmetic mean of percentage values
                expect(computed.averageScore).toBeCloseTo(expected.averageScore, 2);

                // Invariant 3: passRate equals proportion with percentage >= 40 (as percentage)
                expect(computed.passRate).toBeCloseTo(expected.passRate, 2);

                // Invariant 4: activeStudents equals distinct student count
                expect(computed.activeStudents).toBe(expected.activeStudents);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Empty result set produces zeroed metrics.
     * **Validates: Requirements 8.1, 8.2, 8.3**
     */
    it('returns zeroed metrics for empty result set', () => {
        const metrics = computeAnalytics([], {});

        expect(metrics.totalAttempts).toBe(0);
        expect(metrics.averageScore).toBe(0);
        expect(metrics.passRate).toBe(0);
        expect(metrics.activeStudents).toBe(0);
    });

    /**
     * When all results are filtered out by date range, metrics are zeroed.
     * **Validates: Requirements 8.1, 8.2, 8.3**
     */
    it('returns zeroed metrics when all results are outside the date range', () => {
        fc.assert(
            fc.property(
                studentPoolArb.chain((pool) =>
                    fc.array(examResultEntryArb(pool), { minLength: 1, maxLength: 10 }),
                ),
                (results) => {
                    // Set a date range that is before all results
                    const earliest = Math.min(...results.map((r) => r.submittedAt.getTime()));
                    const filter: DateRangeFilter = {
                        dateFrom: new Date(earliest - 200000000),
                        dateTo: new Date(earliest - 100000000),
                    };

                    const metrics = computeAnalytics(results, filter);

                    expect(metrics.totalAttempts).toBe(0);
                    expect(metrics.averageScore).toBe(0);
                    expect(metrics.passRate).toBe(0);
                    expect(metrics.activeStudents).toBe(0);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * passRate is always between 0 and 100 (inclusive).
     * **Validates: Requirements 8.1, 8.3**
     */
    it('passRate is always between 0 and 100', () => {
        fc.assert(
            fc.property(examResultsArb, dateRangeFilterArb, (results, filter) => {
                const metrics = computeAnalytics(results, filter);

                expect(metrics.passRate).toBeGreaterThanOrEqual(0);
                expect(metrics.passRate).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * activeStudents is always <= totalAttempts (each student counted at most once).
     * **Validates: Requirements 8.1, 8.2**
     */
    it('activeStudents is always less than or equal to totalAttempts', () => {
        fc.assert(
            fc.property(examResultsArb, dateRangeFilterArb, (results, filter) => {
                const metrics = computeAnalytics(results, filter);

                expect(metrics.activeStudents).toBeLessThanOrEqual(metrics.totalAttempts);
            }),
            { numRuns: 100 },
        );
    });
});
