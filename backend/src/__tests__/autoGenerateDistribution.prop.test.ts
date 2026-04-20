import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';

/**
 * Feature: exam-question-bank, Property 19: Auto-generate respects distribution
 *
 * Validates: Requirements 12.2, 12.3
 *
 * For any auto-generate request with subject/category filters and difficulty
 * distribution {easy: E, medium: M, hard: H}, the returned questions should
 * contain exactly E easy, M medium, and H hard questions, and all questions
 * should match the specified subject and category filters.
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

/**
 * Generate a valid bank question payload with a specific difficulty, subject,
 * and moduleCategory so we can seed the DB with known distributions.
 */
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
// We extract the pure DB logic so we can test without HTTP request/response mocking.

interface AutoGenerateParams {
    subject?: string;
    moduleCategory?: string;
    distribution: { easy: number; medium: number; hard: number };
}

interface DistEntry {
    requested: number;
    available: number;
    selected: number;
}

interface AutoGenerateResult {
    questions: Array<Record<string, unknown>>;
    distribution: Record<string, DistEntry>;
}

async function autoGenerate(params: AutoGenerateParams): Promise<AutoGenerateResult> {
    const baseFilter: Record<string, unknown> = { isActive: true, isArchived: false };
    if (params.subject) baseFilter.subject = params.subject;
    if (params.moduleCategory) baseFilter.moduleCategory = params.moduleCategory;

    const result: Array<Record<string, unknown>> = [];
    const distReport: Record<string, DistEntry> = {};

    for (const level of ['easy', 'medium', 'hard'] as const) {
        const count = params.distribution[level];

        if (count <= 0) {
            distReport[level] = { requested: 0, available: 0, selected: 0 };
            continue;
        }

        const available = await QuestionBankQuestion.countDocuments({
            ...baseFilter,
            difficulty: level,
        });

        if (available < count) {
            throw new Error(
                `Insufficient ${level} questions: requested ${count}, available ${available}`,
            );
        }

        const selected = await QuestionBankQuestion.aggregate([
            { $match: { ...baseFilter, difficulty: level } },
            { $sample: { size: count } },
        ]);

        result.push(...selected);
        distReport[level] = { requested: count, available, selected: selected.length };
    }

    return { questions: result, distribution: distReport };
}


// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 19: Auto-generate respects distribution', () => {
    it('returned questions match requested counts per difficulty and filter criteria', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate requested counts per difficulty (0-5 each, at least 1 total)
                fc.record({
                    easy: fc.integer({ min: 0, max: 5 }),
                    medium: fc.integer({ min: 0, max: 5 }),
                    hard: fc.integer({ min: 0, max: 5 }),
                }).filter((d) => d.easy + d.medium + d.hard > 0),
                // Generate a subject and category for filtering
                fc.constantFrom('Math', 'Science', 'English'),
                fc.constantFrom('Algebra', 'Physics', 'Grammar'),
                async (distribution, subject, moduleCategory) => {
                    // Clean up from previous iteration
                    await QuestionBankQuestion.deleteMany({});

                    // Seed the DB with enough questions per difficulty for the target
                    // subject/category. We add extra questions (requested + 3) to ensure
                    // $sample has a pool to pick from.
                    const seedPromises: Promise<unknown>[] = [];
                    for (const level of ['easy', 'medium', 'hard'] as const) {
                        const count = distribution[level];
                        if (count > 0) {
                            const payloads = await fc.sample(
                                bankQuestionPayloadArb(level, subject, moduleCategory),
                                count + 3,
                            );
                            seedPromises.push(QuestionBankQuestion.insertMany(payloads));
                        }
                    }

                    // Also seed some "noise" questions with a different subject to verify
                    // filtering works correctly.
                    const noisePayloads = await fc.sample(
                        bankQuestionPayloadArb('easy', 'NoiseSubject', 'NoiseCat'),
                        5,
                    );
                    seedPromises.push(QuestionBankQuestion.insertMany(noisePayloads));

                    await Promise.all(seedPromises);

                    // Run auto-generate
                    const result = await autoGenerate({
                        subject,
                        moduleCategory,
                        distribution,
                    });

                    // ── Verify difficulty counts ──
                    const easyCt = result.questions.filter((q) => q.difficulty === 'easy').length;
                    const medCt = result.questions.filter((q) => q.difficulty === 'medium').length;
                    const hardCt = result.questions.filter((q) => q.difficulty === 'hard').length;

                    expect(easyCt).toBe(distribution.easy);
                    expect(medCt).toBe(distribution.medium);
                    expect(hardCt).toBe(distribution.hard);

                    // Total count matches sum
                    expect(result.questions.length).toBe(
                        distribution.easy + distribution.medium + distribution.hard,
                    );

                    // ── Verify all questions match subject/category filters ──
                    for (const q of result.questions) {
                        expect(q.subject).toBe(subject);
                        expect(q.moduleCategory).toBe(moduleCategory);
                        // All returned questions must be active and not archived
                        expect(q.isActive).toBe(true);
                        expect(q.isArchived).toBe(false);
                    }

                    // ── Verify distribution report accuracy ──
                    for (const level of ['easy', 'medium', 'hard'] as const) {
                        const entry = result.distribution[level];
                        expect(entry.requested).toBe(distribution[level]);
                        expect(entry.selected).toBe(distribution[level]);
                        // available >= requested (we seeded enough)
                        expect(entry.available).toBeGreaterThanOrEqual(distribution[level]);
                    }

                    // ── Verify no duplicate question IDs ──
                    const ids = result.questions.map((q) => String(q._id));
                    expect(new Set(ids).size).toBe(ids.length);
                },
            ),
            { numRuns: 20 },
        );
    });
});
