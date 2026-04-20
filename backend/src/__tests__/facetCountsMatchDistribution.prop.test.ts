import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { listBankQuestions } from '../services/questionBankAdvancedService';

/**
 * Feature: exam-question-bank, Property 5: Facet counts match actual distribution
 *
 * Validates: Requirements 2.8, 16.3
 *
 * For any set of questions in the database, the facet counts returned by the
 * list endpoint should exactly match the actual count of questions per subject,
 * per moduleCategory, and per difficulty level within the current filter scope.
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
 * and difficulty so we can verify facet distribution deterministically.
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
 * Generate a diverse set of 5-20 questions so facets have meaningful distributions.
 */
const bankQuestionArrayArb = fc.array(bankQuestionPayloadArb, { minLength: 5, maxLength: 20 });

/**
 * Generate optional filter params to test facets within a filtered scope.
 */
const filterParamsArb = fc.record({
    subject: fc.option(subjectArb, { nil: undefined }),
    moduleCategory: fc.option(categoryArb, { nil: undefined }),
    difficulty: fc.option(difficultyArb, { nil: undefined }),
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 5: Facet counts match actual distribution', () => {
    it('facet distinct values match actual distribution per subject, moduleCategory, and difficulty', async () => {
        await fc.assert(
            fc.asyncProperty(bankQuestionArrayArb, filterParamsArb, async (payloads, filters) => {
                // Clean up from previous iteration
                await QuestionBankQuestion.deleteMany({});

                // 1. Seed the database with generated questions
                await QuestionBankQuestion.insertMany(payloads);

                // 2. Build filter params for the list endpoint
                const filterParams: Record<string, string | undefined> = {
                    subject: filters.subject,
                    moduleCategory: filters.moduleCategory,
                    difficulty: filters.difficulty,
                };

                // 3. Call the list endpoint with a large limit to get facets
                const listResult = await listBankQuestions({
                    ...filterParams,
                    page: 1,
                    limit: 10000,
                });

                const facets = listResult.facets;

                // 4. Build the same filter that listBankQuestions uses internally
                const dbFilter: Record<string, unknown> = { isArchived: false };
                if (filters.subject) dbFilter.subject = filters.subject;
                if (filters.moduleCategory) dbFilter.moduleCategory = filters.moduleCategory;
                if (filters.difficulty) dbFilter.difficulty = filters.difficulty;

                // 5. Compute expected distinct values directly from DB
                const [expectedSubjects, expectedCategories, expectedDifficulties] = await Promise.all([
                    QuestionBankQuestion.distinct('subject', dbFilter),
                    QuestionBankQuestion.distinct('moduleCategory', dbFilter),
                    QuestionBankQuestion.distinct('difficulty', dbFilter),
                ]);

                const sortedExpectedSubjects = expectedSubjects.filter(Boolean).sort();
                const sortedExpectedCategories = expectedCategories.filter(Boolean).sort();
                const sortedExpectedDifficulties = expectedDifficulties.filter(Boolean).sort();

                // 6. Verify facet subjects match actual distinct subjects
                expect([...facets.subjects].sort()).toEqual(sortedExpectedSubjects);

                // 7. Verify facet moduleCategories match actual distinct moduleCategories
                expect([...facets.moduleCategories].sort()).toEqual(sortedExpectedCategories);

                // 8. Verify facet difficulties match actual distinct difficulties
                expect([...facets.difficulties].sort()).toEqual(sortedExpectedDifficulties);

                // 9. Verify that for each facet subject value, the count of questions
                //    in the list result matches the actual DB count
                for (const subject of facets.subjects) {
                    const listCount = listResult.questions.filter(
                        (q: any) => q.subject === subject,
                    ).length;
                    const dbCount = await QuestionBankQuestion.countDocuments({
                        ...dbFilter,
                        subject,
                    });
                    expect(listCount).toBe(dbCount);
                }

                // 10. Verify that for each facet moduleCategory value, the count matches
                for (const cat of facets.moduleCategories) {
                    const listCount = listResult.questions.filter(
                        (q: any) => q.moduleCategory === cat,
                    ).length;
                    const dbCount = await QuestionBankQuestion.countDocuments({
                        ...dbFilter,
                        moduleCategory: cat,
                    });
                    expect(listCount).toBe(dbCount);
                }

                // 11. Verify that for each facet difficulty value, the count matches
                for (const diff of facets.difficulties) {
                    const listCount = listResult.questions.filter(
                        (q: any) => q.difficulty === diff,
                    ).length;
                    const dbCount = await QuestionBankQuestion.countDocuments({
                        ...dbFilter,
                        difficulty: diff,
                    });
                    expect(listCount).toBe(dbCount);
                }

                // 12. Verify total count consistency
                expect(listResult.questions.length).toBe(listResult.total);
            }),
            { numRuns: 20 },
        );
    });
});
