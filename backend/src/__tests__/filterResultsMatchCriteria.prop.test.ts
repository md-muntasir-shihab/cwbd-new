import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { listBankQuestions } from '../services/questionBankAdvancedService';

/**
 * Feature: exam-question-bank, Property 3: Filter results match criteria
 *
 * Validates: Requirements 2.4, 2.5
 *
 * For any combination of subject, moduleCategory, difficulty, and search text
 * filters applied to the question list endpoint, every returned question should
 * match all active filter criteria (subject equals filter subject, moduleCategory
 * equals filter category, difficulty equals filter difficulty, and
 * question_en/question_bn/tags contain the search text).
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

const difficultyArb = fc.constantFrom('easy', 'medium', 'hard') as fc.Arbitrary<'easy' | 'medium' | 'hard'>;
const correctKeyArb = fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>;

const subjectArb = fc.constantFrom('Math', 'Science', 'English', 'History', 'BangladeshStudies');
const categoryArb = fc.constantFrom('Algebra', 'Physics', 'Grammar', 'Ancient', 'Liberation');

const questionTextArb = fc
    .string({ minLength: 10, maxLength: 60 })
    .filter((s) => s.trim().length >= 10)
    .map((s) => s.trim());

const optionsArb = fc.constant([
    { key: 'A' as const, text_en: 'Option A', text_bn: 'বিকল্প ক' },
    { key: 'B' as const, text_en: 'Option B', text_bn: 'বিকল্প খ' },
    { key: 'C' as const, text_en: 'Option C', text_bn: 'বিকল্প গ' },
    { key: 'D' as const, text_en: 'Option D', text_bn: 'বিকল্প ঘ' },
]);

/**
 * Generate a valid bank question payload with controlled subject, category,
 * and difficulty so we can filter on them deterministically.
 */
const bankQuestionPayloadArb = fc.record({
    question_en: questionTextArb,
    question_bn: questionTextArb,
    subject: subjectArb,
    moduleCategory: categoryArb,
    difficulty: difficultyArb,
    correctKey: correctKeyArb,
    options: optionsArb,
    explanation_en: fc.string({ minLength: 0, maxLength: 30 }),
    explanation_bn: fc.string({ minLength: 0, maxLength: 30 }),
    marks: fc.integer({ min: 1, max: 5 }),
    isActive: fc.constant(true),
    isArchived: fc.constant(false),
});

/**
 * Generate a diverse set of 5-15 questions so filters have meaningful results.
 */
const bankQuestionArrayArb = fc.array(bankQuestionPayloadArb, { minLength: 5, maxLength: 15 });

/**
 * Generate optional filter params. Each filter is either present or undefined.
 */
const filterParamsArb = fc.record({
    subject: fc.option(subjectArb, { nil: undefined }),
    moduleCategory: fc.option(categoryArb, { nil: undefined }),
    difficulty: fc.option(difficultyArb, { nil: undefined }),
    q: fc.option(
        fc.constantFrom('Math', 'Science', 'Option', 'English'),
        { nil: undefined },
    ),
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 3: Filter results match criteria', () => {
    it('every returned question matches all active filter criteria', async () => {
        await fc.assert(
            fc.asyncProperty(bankQuestionArrayArb, filterParamsArb, async (payloads, filters) => {
                // Clean up from previous iteration
                await QuestionBankQuestion.deleteMany({});

                // 1. Seed the database with generated questions
                await QuestionBankQuestion.insertMany(payloads);

                // 2. Build the filter params for the list endpoint
                const filterParams: Record<string, string | undefined> = {
                    subject: filters.subject,
                    moduleCategory: filters.moduleCategory,
                    difficulty: filters.difficulty,
                    q: filters.q,
                };

                // 3. Call the list endpoint with a large limit to get all results
                const listResult = await listBankQuestions({
                    ...filterParams,
                    page: 1,
                    limit: 10000,
                });

                // 4. Verify every returned question matches all active filter criteria
                for (const q of listResult.questions) {
                    if (filters.subject) {
                        expect(q.subject).toBe(filters.subject);
                    }
                    if (filters.moduleCategory) {
                        expect(q.moduleCategory).toBe(filters.moduleCategory);
                    }
                    if (filters.difficulty) {
                        expect(q.difficulty).toBe(filters.difficulty);
                    }
                    if (filters.q) {
                        const searchText = filters.q.toLowerCase();
                        const matchesEn = (q.question_en || '').toLowerCase().includes(searchText);
                        const matchesBn = (q.question_bn || '').toLowerCase().includes(searchText);
                        const matchesSubject = (q.subject || '').toLowerCase().includes(searchText);
                        const matchesTopic = (q.topic || '').toLowerCase().includes(searchText);
                        const matchesTags = Array.isArray(q.tags) &&
                            q.tags.some((t: string) => t.toLowerCase().includes(searchText));
                        expect(
                            matchesEn || matchesBn || matchesSubject || matchesTopic || matchesTags,
                        ).toBe(true);
                    }
                }

                // 5. Verify completeness: every question in DB matching the
                //    filters is included in the list results
                const dbFilter: Record<string, unknown> = { isArchived: false };
                if (filters.subject) dbFilter.subject = filters.subject;
                if (filters.moduleCategory) dbFilter.moduleCategory = filters.moduleCategory;
                if (filters.difficulty) dbFilter.difficulty = filters.difficulty;

                let dbQuestions;
                if (filters.q) {
                    dbQuestions = await QuestionBankQuestion.find({
                        ...dbFilter,
                        $or: [
                            { question_en: { $regex: filters.q, $options: 'i' } },
                            { question_bn: { $regex: filters.q, $options: 'i' } },
                            { subject: { $regex: filters.q, $options: 'i' } },
                            { topic: { $regex: filters.q, $options: 'i' } },
                            { tags: { $elemMatch: { $regex: filters.q, $options: 'i' } } },
                        ],
                    }).lean();
                } else {
                    dbQuestions = await QuestionBankQuestion.find(dbFilter).lean();
                }

                const listIds = new Set(listResult.questions.map((q: any) => String(q._id)));
                const dbIds = new Set(dbQuestions.map((q: any) => String(q._id)));

                // The list result set should be identical to the direct DB query
                expect(listIds.size).toBe(dbIds.size);
                for (const id of dbIds) {
                    expect(listIds.has(id)).toBe(true);
                }
                for (const id of listIds) {
                    expect(dbIds.has(id)).toBe(true);
                }
            }),
            { numRuns: 20 },
        );
    });
});
