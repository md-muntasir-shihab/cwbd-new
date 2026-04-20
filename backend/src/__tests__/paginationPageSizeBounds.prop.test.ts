import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { listBankQuestions } from '../services/questionBankAdvancedService';

/**
 * Feature: exam-question-bank, Property 4: Pagination respects page size bounds
 *
 * Validates: Requirements 2.7, 14.1
 *
 * For any page size value between 20 and 50, the question list endpoint should
 * return at most that many results per page, and totalPages should equal
 * ceil(total / pageSize).
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQuestion(index: number) {
    return {
        question_en: `Test question number ${index} for pagination`,
        question_bn: `পরীক্ষার প্রশ্ন নম্বর ${index}`,
        subject: 'Math',
        moduleCategory: 'Algebra',
        difficulty: (['easy', 'medium', 'hard'] as const)[index % 3],
        correctKey: 'A' as const,
        options: [
            { key: 'A' as const, text_en: 'Option A', text_bn: 'বিকল্প ক' },
            { key: 'B' as const, text_en: 'Option B', text_bn: 'বিকল্প খ' },
            { key: 'C' as const, text_en: 'Option C', text_bn: 'বিকল্প গ' },
            { key: 'D' as const, text_en: 'Option D', text_bn: 'বিকল্প ঘ' },
        ],
        marks: 1,
        isActive: true,
        isArchived: false,
    };
}

// ─── Arbitrary Generators ────────────────────────────────────────────────────

/** Page size between 20 and 50 (the allowed range per Requirements 2.7, 14.1) */
const pageSizeArb = fc.integer({ min: 20, max: 50 });

/** Total question count between 0 and 120 to cover various page boundary cases */
const totalQuestionsArb = fc.integer({ min: 0, max: 120 });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 4: Pagination respects page size bounds', () => {
    it('results per page <= pageSize and totalPages = ceil(total / pageSize)', async () => {
        await fc.assert(
            fc.asyncProperty(totalQuestionsArb, pageSizeArb, async (totalQuestions, pageSize) => {
                // Clean up from previous iteration
                await QuestionBankQuestion.deleteMany({});

                // 1. Seed the database with the generated number of questions
                if (totalQuestions > 0) {
                    const questions = Array.from({ length: totalQuestions }, (_, i) => makeQuestion(i));
                    await QuestionBankQuestion.insertMany(questions);
                }

                // 2. Call the list endpoint with the generated page size
                const result = await listBankQuestions({
                    page: 1,
                    limit: pageSize,
                });

                // 3. Verify results per page <= pageSize
                expect(result.questions.length).toBeLessThanOrEqual(pageSize);

                // 4. Verify totalPages = ceil(total / pageSize)
                const expectedTotalPages = Math.ceil(result.total / pageSize) || 0;
                expect(result.totalPages).toBe(expectedTotalPages);

                // 5. Verify total matches the number of seeded questions
                expect(result.total).toBe(totalQuestions);

                // 6. Verify the actual count matches min(total, pageSize) for page 1
                const expectedCount = Math.min(totalQuestions, pageSize);
                expect(result.questions.length).toBe(expectedCount);

                // 7. If there are multiple pages, verify a middle/last page also respects bounds
                if (result.totalPages > 1) {
                    const lastPageResult = await listBankQuestions({
                        page: result.totalPages,
                        limit: pageSize,
                    });

                    // Last page should also have <= pageSize results
                    expect(lastPageResult.questions.length).toBeLessThanOrEqual(pageSize);
                    expect(lastPageResult.questions.length).toBeGreaterThan(0);

                    // Last page result count should be total % pageSize (or pageSize if evenly divisible)
                    const expectedLastPageCount = totalQuestions % pageSize === 0
                        ? pageSize
                        : totalQuestions % pageSize;
                    expect(lastPageResult.questions.length).toBe(expectedLastPageCount);
                }
            }),
            { numRuns: 20 },
        );
    });
});
