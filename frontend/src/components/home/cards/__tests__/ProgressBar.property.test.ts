/**
 * Property 5: Progress bar percentage calculation
 *
 * For any valid (startDate, endDate) pair where endDate > startDate,
 * calculateProgress SHALL return a percentage equal to
 * clamp(0, (now - start) / (end - start) * 100, 100),
 * and remainingDays SHALL equal Math.ceil((end - now) / MS_PER_DAY) when end > now, else 0.
 *
 * **Validates: Requirements 4.1, 4.2, 4.6**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 5: Progress bar percentage calculation
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateProgress } from '../ProgressBar';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Arbitrary that produces a { startDate, endDate, now } triple where
 * endDate is strictly after startDate, and all dates are valid ISO strings.
 * Dates are constrained to 2000–2099 to stay within parseUniversityDate's
 * isUsableDate range (1900–2100).
 */
const validDateTriple = fc
    .tuple(
        // startMs: timestamp between 2000-01-01 and 2090-01-01
        fc.integer({
            min: new Date('2000-01-01T00:00:00Z').getTime(),
            max: new Date('2090-01-01T00:00:00Z').getTime(),
        }),
        // gap in ms: at least 1 hour, up to ~10 years
        fc.integer({ min: 3_600_000, max: 10 * 365 * MS_PER_DAY }),
    )
    .map(([startMs, gap]) => {
        const endMs = startMs + gap;
        return {
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
            startMs,
            endMs,
        };
    })
    .chain(({ startDate, endDate, startMs, endMs }) =>
        // now can be anywhere from 1 year before start to 1 year after end
        fc
            .integer({
                min: startMs - 365 * MS_PER_DAY,
                max: endMs + 365 * MS_PER_DAY,
            })
            .map((nowMs) => ({
                startDate,
                endDate,
                now: new Date(nowMs),
                startMs,
                endMs,
                nowMs,
            })),
    );


describe('Feature: home-card-cleanup-redesign, Property 5: Progress bar percentage calculation', () => {
    it('percentage equals clamp(0, (now - start) / (end - start) * 100, 100)', () => {
        fc.assert(
            fc.property(validDateTriple, ({ startDate, endDate, now, startMs, endMs, nowMs }) => {
                const result = calculateProgress(startDate, endDate, 7, now);

                // With valid dates where end > start, result must not be null
                expect(result).not.toBeNull();

                const total = endMs - startMs;
                const elapsed = nowMs - startMs;
                const expectedPercentage = Math.min(100, Math.max(0, (elapsed / total) * 100));

                expect(result!.percentage).toBeCloseTo(expectedPercentage, 3);
            }),
            { numRuns: 200 },
        );
    });

    it('remainingDays equals Math.ceil((end - now) / MS_PER_DAY) when end > now, else 0', () => {
        fc.assert(
            fc.property(validDateTriple, ({ startDate, endDate, now, endMs, nowMs }) => {
                const result = calculateProgress(startDate, endDate, 7, now);

                expect(result).not.toBeNull();

                const diffMs = endMs - nowMs;
                const expectedRemainingDays = diffMs > 0 ? Math.ceil(diffMs / MS_PER_DAY) : 0;

                expect(result!.remainingDays).toBe(expectedRemainingDays);
            }),
            { numRuns: 200 },
        );
    });

    it('percentage is always clamped to [0, 100]', () => {
        fc.assert(
            fc.property(validDateTriple, ({ startDate, endDate, now }) => {
                const result = calculateProgress(startDate, endDate, 7, now);

                expect(result).not.toBeNull();
                expect(result!.percentage).toBeGreaterThanOrEqual(0);
                expect(result!.percentage).toBeLessThanOrEqual(100);
            }),
            { numRuns: 200 },
        );
    });
});


/**
 * Property 6: Progress bar color follows closingSoonDays threshold
 *
 * For any (remainingDays, closingSoonDays) pair:
 *   - remainingDays > Math.max(1, closingSoonDays) → 'emerald'
 *   - remainingDays <= Math.max(1, closingSoonDays) && remainingDays > 0 → 'amber'
 *   - remainingDays <= 0 → 'gray'
 *
 * **Validates: Requirements 4.3, 4.4, 4.5**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 6: Progress bar color follows closingSoonDays threshold
 */

/**
 * Arbitrary that produces { startDate, endDate, now, closingSoonDays } such that
 * `calculateProgress` yields a deterministic `remainingDays` value.
 *
 * Strategy: fix a startDate, pick a totalDays span (≥ 2 days), then place `now`
 * relative to endDate so that remainingDays is a known value. closingSoonDays is
 * generated independently.
 */
const colorTestArbitrary = fc
    .record({
        // Total span of the period in days (at least 2 so start < end with room)
        totalDays: fc.integer({ min: 2, max: 3650 }),
        // Remaining days: -30 (past) to totalDays (we'll clamp later)
        remainingDaysRaw: fc.integer({ min: -30, max: 3650 }),
        // closingSoonDays can be 0, negative, or positive — implementation clamps to max(1, x)
        closingSoonDays: fc.integer({ min: -5, max: 365 }),
    })
    .filter(({ totalDays, remainingDaysRaw }) => {
        // Ensure remainingDays doesn't exceed totalDays (now must be >= start)
        return remainingDaysRaw <= totalDays;
    })
    .map(({ totalDays, remainingDaysRaw, closingSoonDays }) => {
        // Use a fixed base date to keep things in the valid 2000–2090 range
        const baseMs = new Date('2050-01-01T00:00:00Z').getTime();
        const startMs = baseMs;
        const endMs = startMs + totalDays * MS_PER_DAY;

        // Place `now` so that remainingDays matches our target.
        // remainingDays = Math.ceil((endMs - nowMs) / MS_PER_DAY) when end > now, else 0
        // To get exact remainingDays = R (when R > 0): nowMs = endMs - R * MS_PER_DAY
        // For R <= 0: place now at or after endMs
        let nowMs: number;
        if (remainingDaysRaw <= 0) {
            // Place now at endMs + |remainingDaysRaw| days (past the end)
            nowMs = endMs + Math.abs(remainingDaysRaw) * MS_PER_DAY;
        } else {
            // Place now exactly so ceil((endMs - nowMs) / MS_PER_DAY) = remainingDaysRaw
            nowMs = endMs - remainingDaysRaw * MS_PER_DAY;
        }

        return {
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
            now: new Date(nowMs),
            closingSoonDays,
            expectedRemainingDays: remainingDaysRaw <= 0 ? 0 : remainingDaysRaw,
        };
    });

describe('Feature: home-card-cleanup-redesign, Property 6: Progress bar color follows closingSoonDays threshold', () => {
    it('returns emerald when remainingDays > safeThreshold', () => {
        fc.assert(
            fc.property(
                colorTestArbitrary.filter(
                    ({ expectedRemainingDays, closingSoonDays }) =>
                        expectedRemainingDays > Math.max(1, closingSoonDays),
                ),
                ({ startDate, endDate, now, closingSoonDays }) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays, now);
                    expect(result).not.toBeNull();
                    expect(result!.color).toBe('emerald');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('returns amber when 0 < remainingDays <= safeThreshold', () => {
        fc.assert(
            fc.property(
                colorTestArbitrary.filter(
                    ({ expectedRemainingDays, closingSoonDays }) =>
                        expectedRemainingDays > 0 &&
                        expectedRemainingDays <= Math.max(1, closingSoonDays),
                ),
                ({ startDate, endDate, now, closingSoonDays }) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays, now);
                    expect(result).not.toBeNull();
                    expect(result!.color).toBe('amber');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('returns gray when remainingDays <= 0', () => {
        fc.assert(
            fc.property(
                colorTestArbitrary.filter(
                    ({ expectedRemainingDays }) => expectedRemainingDays <= 0,
                ),
                ({ startDate, endDate, now, closingSoonDays }) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays, now);
                    expect(result).not.toBeNull();
                    expect(result!.color).toBe('gray');
                },
            ),
            { numRuns: 100 },
        );
    });
});


/**
 * Property 7: Missing dates cause ProgressBar fallback
 *
 * For any university data where the start date or end date is missing, null,
 * undefined, empty string, or an invalid date string, calculateProgress SHALL
 * return null (so the card hides the ProgressBar and falls back to CountdownChip).
 *
 * **Validates: Requirements 4.7**
 *
 * Tag: Feature: home-card-cleanup-redesign, Property 7: Missing dates cause ProgressBar fallback
 */

/** Arbitrary that produces values parseUniversityDate treats as missing/invalid. */
const missingOrInvalidDate = fc.oneof(
    fc.constant(undefined),
    fc.constant(null as unknown as undefined),
    fc.constant(''),
    fc.constant('   '),
    // Random non-date strings that new Date() returns Invalid Date for
    fc.constantFrom('not-a-date', 'abc123', 'hello', 'xyz!@#', 'invalid', 'foo-bar-baz'),
);

/** Arbitrary that produces a valid ISO date string within the usable range. */
const validIsoDate = fc
    .integer({
        min: new Date('2000-01-01T00:00:00Z').getTime(),
        max: new Date('2090-01-01T00:00:00Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString());

describe('Feature: home-card-cleanup-redesign, Property 7: Missing dates cause ProgressBar fallback', () => {
    it('returns null when startDate is missing or invalid', () => {
        fc.assert(
            fc.property(
                missingOrInvalidDate,
                validIsoDate,
                fc.integer({ min: 1, max: 365 }),
                (startDate, endDate, closingSoonDays) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays);
                    expect(result).toBeNull();
                },
            ),
            { numRuns: 100 },
        );
    });

    it('returns null when endDate is missing or invalid', () => {
        fc.assert(
            fc.property(
                validIsoDate,
                missingOrInvalidDate,
                fc.integer({ min: 1, max: 365 }),
                (startDate, endDate, closingSoonDays) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays);
                    expect(result).toBeNull();
                },
            ),
            { numRuns: 100 },
        );
    });

    it('returns null when both dates are missing or invalid', () => {
        fc.assert(
            fc.property(
                missingOrInvalidDate,
                missingOrInvalidDate,
                fc.integer({ min: 1, max: 365 }),
                (startDate, endDate, closingSoonDays) => {
                    const result = calculateProgress(startDate, endDate, closingSoonDays);
                    expect(result).toBeNull();
                },
            ),
            { numRuns: 100 },
        );
    });
});
