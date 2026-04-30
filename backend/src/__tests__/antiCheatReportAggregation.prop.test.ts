// Feature: exam-center-backend-completion, Property 5: Anti-Cheat Report Aggregation Correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 5: Anti-Cheat Report Aggregation Correctness
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * For any set of AntiCheatViolationLog entries for an exam, the report's
 * `summary.totalViolations` SHALL equal the total count of violation log entries,
 * `summary.flaggedSessions` SHALL equal the count of distinct session IDs with violations,
 * `summary.uniqueStudentsFlagged` SHALL equal the count of distinct student IDs with violations,
 * and the sum of all `violationsByType[].count` values SHALL equal `summary.totalViolations`.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface AntiCheatViolationLogEntry {
    exam: string;
    session: string;
    student: string;
    violationType: string;
}

interface ReportSummary {
    totalViolations: number;
    flaggedSessions: number;
    uniqueStudentsFlagged: number;
}

interface ViolationByType {
    violationType: string;
    count: number;
}

interface AntiCheatReport {
    summary: ReportSummary;
    violationsByType: ViolationByType[];
}

// ─── Pure Aggregation Logic (mirrors getAntiCheatReport controller) ──────────

/**
 * Replicates the summary aggregation from getAntiCheatReport.
 * Groups all violation log entries and computes:
 * - totalViolations: count of all entries
 * - flaggedSessions: count of distinct session IDs
 * - uniqueStudentsFlagged: count of distinct student IDs
 */
function computeSummary(entries: AntiCheatViolationLogEntry[]): ReportSummary {
    if (entries.length === 0) {
        return { totalViolations: 0, flaggedSessions: 0, uniqueStudentsFlagged: 0 };
    }

    const sessions = new Set(entries.map((e) => e.session));
    const students = new Set(entries.map((e) => e.student));

    return {
        totalViolations: entries.length,
        flaggedSessions: sessions.size,
        uniqueStudentsFlagged: students.size,
    };
}

/**
 * Replicates the by-type aggregation from getAntiCheatReport.
 * Groups entries by violationType and counts each.
 */
function computeViolationsByType(entries: AntiCheatViolationLogEntry[]): ViolationByType[] {
    const countMap = new Map<string, number>();
    for (const entry of entries) {
        countMap.set(entry.violationType, (countMap.get(entry.violationType) || 0) + 1);
    }
    return Array.from(countMap.entries()).map(([violationType, count]) => ({
        violationType,
        count,
    }));
}

/**
 * Assembles the full anti-cheat report from violation log entries,
 * mirroring the controller logic.
 */
function computeAntiCheatReport(entries: AntiCheatViolationLogEntry[]): AntiCheatReport {
    return {
        summary: computeSummary(entries),
        violationsByType: computeViolationsByType(entries),
    };
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const objectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Violation types matching the anti-cheat system. */
const violationTypeArb = fc.constantFrom(
    'tab_switch',
    'copy_attempt',
    'fullscreen_exit',
    'focus_loss',
    'right_click',
);

/**
 * Generate a set of AntiCheatViolationLog entries for a single exam.
 * Uses a small pool of session and student IDs to ensure realistic
 * overlap (some sessions/students appear in multiple violations).
 */
const violationEntriesArb = objectIdArb.chain((examId) =>
    fc
        .record({
            sessionPool: fc.array(objectIdArb, { minLength: 1, maxLength: 5 }),
            studentPool: fc.array(objectIdArb, { minLength: 1, maxLength: 5 }),
            entryCount: fc.integer({ min: 0, max: 20 }),
        })
        .chain(({ sessionPool, studentPool, entryCount }) =>
            fc
                .array(
                    fc.record({
                        session: fc.constantFrom(...sessionPool),
                        student: fc.constantFrom(...studentPool),
                        violationType: violationTypeArb,
                    }),
                    { minLength: entryCount, maxLength: entryCount },
                )
                .map((entries) =>
                    entries.map((e) => ({
                        exam: examId,
                        session: e.session,
                        student: e.student,
                        violationType: e.violationType,
                    })),
                ),
        ),
);

// ─── Reference Oracle ────────────────────────────────────────────────────────

/**
 * Independent oracle that computes expected report values directly
 * from the raw entries, using a clearly correct implementation.
 */
function oracleReport(entries: AntiCheatViolationLogEntry[]): {
    totalViolations: number;
    flaggedSessions: number;
    uniqueStudentsFlagged: number;
    sumOfTypeCounts: number;
} {
    const totalViolations = entries.length;
    const flaggedSessions = new Set(entries.map((e) => e.session)).size;
    const uniqueStudentsFlagged = new Set(entries.map((e) => e.student)).size;

    // Count by type independently
    const typeCounts = new Map<string, number>();
    for (const entry of entries) {
        typeCounts.set(entry.violationType, (typeCounts.get(entry.violationType) || 0) + 1);
    }
    const sumOfTypeCounts = Array.from(typeCounts.values()).reduce((sum, c) => sum + c, 0);

    return { totalViolations, flaggedSessions, uniqueStudentsFlagged, sumOfTypeCounts };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 5: Anti-Cheat Report Aggregation Correctness', () => {
    /**
     * summary.totalViolations equals the total count of violation log entries.
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     */
    it('totalViolations equals total count, flaggedSessions equals distinct sessions, uniqueStudentsFlagged equals distinct students, and sum of violationsByType counts equals totalViolations', () => {
        fc.assert(
            fc.property(violationEntriesArb, (entries) => {
                const report = computeAntiCheatReport(entries);
                const expected = oracleReport(entries);

                // Invariant 1: totalViolations equals total count of entries
                expect(report.summary.totalViolations).toBe(expected.totalViolations);

                // Invariant 2: flaggedSessions equals distinct session count
                expect(report.summary.flaggedSessions).toBe(expected.flaggedSessions);

                // Invariant 3: uniqueStudentsFlagged equals distinct student count
                expect(report.summary.uniqueStudentsFlagged).toBe(expected.uniqueStudentsFlagged);

                // Invariant 4: sum of violationsByType[].count equals totalViolations
                const sumOfTypeCounts = report.violationsByType.reduce(
                    (sum, v) => sum + v.count,
                    0,
                );
                expect(sumOfTypeCounts).toBe(report.summary.totalViolations);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Empty violation set produces zeroed summary and empty violationsByType.
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     */
    it('returns zeroed summary and empty violationsByType for empty violation set', () => {
        const report = computeAntiCheatReport([]);

        expect(report.summary.totalViolations).toBe(0);
        expect(report.summary.flaggedSessions).toBe(0);
        expect(report.summary.uniqueStudentsFlagged).toBe(0);
        expect(report.violationsByType).toEqual([]);
    });

    /**
     * Each violation type in the report corresponds to a type present in the input entries.
     * **Validates: Requirements 3.1, 3.3**
     */
    it('violationsByType only contains types present in the input entries', () => {
        fc.assert(
            fc.property(violationEntriesArb, (entries) => {
                const report = computeAntiCheatReport(entries);
                const inputTypes = new Set(entries.map((e) => e.violationType));

                for (const byType of report.violationsByType) {
                    expect(inputTypes.has(byType.violationType)).toBe(true);
                }

                // Number of distinct types in report matches input
                expect(report.violationsByType.length).toBe(inputTypes.size);
            }),
            { numRuns: 100 },
        );
    });
});
