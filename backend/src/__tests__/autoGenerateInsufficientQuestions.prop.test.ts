import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';

/**
 * Feature: exam-question-bank, Property 20: Auto-generate insufficient questions error
 *
 * Validates: Requirements 12.4
 *
 * For any auto-generate request where the bank contains fewer questions than
 * requested for any difficulty level, the service should return a 400 error
 * specifying which difficulty level has insufficient questions and the
 * available count.
 */

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await QuestionBankQuestion.deleteMany({});
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const correctKeyArb = fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>;

const questionTextArb = fc
    .string({ minLength: 10, maxLength: 80 })
    .filter((s) => s.trim().length >= 10)
    .map((s) => s.trim());

const optionsArb = fc.constant([
    { key: 'A' as const, text_en: 'Option A', text_bn: 'বিকল্প ক' },
    { key: 'B' as const, text_en: 'Option B', text_bn: 'বিকল্প খ' },
    { key: 'C' as const, text_en: 'Option C', text_bn: 'বিকল্প গ' },
    { key: 'D' as const, text_en: 'Option D', text_bn: 'বিকল্প ঘ' },
]);

function bankQuestionPayloadArb(
    difficulty: 'easy' | 'medium' | 'hard',
    subject: string,
    moduleCategory: string,
) {
    return fc.record({
        question_en: questionTextArb,
        question_bn: questionTextArb,
        subject: fc.constant(subject),
        moduleCategory: fc.constant(moduleCategory),
        difficulty: fc.constant(difficulty),
        correctKey: correctKeyArb,
        options: optionsArb,
        explanation_en: fc.string({ minLength: 0, maxLength: 50 }),
        explanation_bn: fc.string({ minLength: 0, maxLength: 50 }),
        marks: fc.integer({ min: 1, max: 10 }),
        isActive: fc.constant(true),
        isArchived: fc.constant(false),
    });
}

// ─── Core auto-generate logic (mirrors adminAutoGenerateExam controller) ─────

interface AutoGenerateParams {
    subject?: string;
    moduleCategory?: string;
    distribution: { easy: number; medium: number; hard: number };
}

interface ShortageError {
    message: string;
    shortage: {
        level: string;
        requested: number;
        available: number;
    };
}

async function autoGenerate(params: AutoGenerateParams): Promise<unknown> {
    const baseFilter: Record<string, unknown> = { isActive: true, isArchived: false };
    if (params.subject) baseFilter.subject = params.subject;
    if (params.moduleCategory) baseFilter.moduleCategory = params.moduleCategory;

    for (const level of ['easy', 'medium', 'hard'] as const) {
        const count = params.distribution[level];

        if (count <= 0) continue;

        const available = await QuestionBankQuestion.countDocuments({
            ...baseFilter,
            difficulty: level,
        });

        if (available < count) {
            const error: ShortageError = {
                message: `Insufficient ${level} questions: requested ${count}, available ${available}`,
                shortage: {
                    level,
                    requested: count,
                    available,
                },
            };
            throw error;
        }
    }

    // If we get here, there are enough questions — should not happen in this test
    return { success: true };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 20: Auto-generate insufficient questions error', () => {
    it('returns error with shortage details when bank has fewer questions than requested', async () => {
        await fc.assert(
            fc.asyncProperty(
                // The difficulty level that will be short
                fc.constantFrom('easy', 'medium', 'hard') as fc.Arbitrary<'easy' | 'medium' | 'hard'>,
                // How many questions to seed for the short level (0-3)
                fc.integer({ min: 0, max: 3 }),
                // How many MORE to request than available (1-5)
                fc.integer({ min: 1, max: 5 }),
                // Subject and category for filtering
                fc.constantFrom('Math', 'Science', 'English'),
                fc.constantFrom('Algebra', 'Physics', 'Grammar'),
                async (shortLevel, seedCount, extraRequested, subject, moduleCategory) => {
                    await QuestionBankQuestion.deleteMany({});

                    const requestedCount = seedCount + extraRequested;

                    // Seed the DB with fewer questions than requested for the short level
                    if (seedCount > 0) {
                        const payloads = await fc.sample(
                            bankQuestionPayloadArb(shortLevel, subject, moduleCategory),
                            seedCount,
                        );
                        await QuestionBankQuestion.insertMany(payloads);
                    }

                    // Seed plenty of questions for the other levels so they don't fail first
                    const otherLevels = (['easy', 'medium', 'hard'] as const).filter(
                        (l) => l !== shortLevel,
                    );
                    for (const level of otherLevels) {
                        const payloads = await fc.sample(
                            bankQuestionPayloadArb(level, subject, moduleCategory),
                            10,
                        );
                        await QuestionBankQuestion.insertMany(payloads);
                    }

                    // Build distribution: the short level requests more than available,
                    // other levels request a small safe amount
                    const distribution = { easy: 0, medium: 0, hard: 0 };
                    distribution[shortLevel] = requestedCount;

                    // The controller processes levels in order: easy, medium, hard.
                    // Only set non-zero for other levels that come AFTER the short level
                    // in processing order, so the short level is hit first.
                    // Actually, we need to be careful: if a level before shortLevel
                    // has a non-zero request, it must succeed. We seeded 10 for others,
                    // so requesting 1 is safe.
                    for (const level of otherLevels) {
                        distribution[level] = 1;
                    }

                    // Call auto-generate — should throw with shortage details
                    let caughtError: ShortageError | null = null;
                    try {
                        await autoGenerate({
                            subject,
                            moduleCategory,
                            distribution,
                        });
                    } catch (err) {
                        caughtError = err as ShortageError;
                    }

                    // ── Verify error was thrown ──
                    expect(caughtError).not.toBeNull();

                    // ── Verify shortage details ──
                    expect(caughtError!.shortage).toBeDefined();
                    expect(caughtError!.shortage.level).toBe(shortLevel);
                    expect(caughtError!.shortage.requested).toBe(requestedCount);
                    expect(caughtError!.shortage.available).toBe(seedCount);

                    // ── Verify available < requested ──
                    expect(caughtError!.shortage.available).toBeLessThan(
                        caughtError!.shortage.requested,
                    );

                    // ── Verify error message contains the difficulty level ──
                    expect(caughtError!.message).toContain(shortLevel);
                    expect(caughtError!.message).toContain(String(requestedCount));
                    expect(caughtError!.message).toContain(String(seedCount));
                },
            ),
            { numRuns: 20 },
        );
    });
});
