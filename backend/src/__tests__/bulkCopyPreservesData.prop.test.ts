import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { bulkCopy } from '../services/questionBankAdvancedService';

/**
 * Feature: exam-question-bank, Property 9: Bulk copy preserves data with suffix
 *
 * Validates: Requirements 5.6
 *
 * For any set of bank questions, bulk copying them should create new
 * QuestionBankQuestion records where each copy has "(Copy)" appended to
 * `question_en` and `question_bn`, and all other fields (subject,
 * moduleCategory, difficulty, options, correctKey, explanation) match
 * the originals. New `contentHash` is generated for each copy,
 * `versionNo` is set to 1, and `parentQuestionId` is null.
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

const nonEmptyTrimmedStr = fc
    .string({ minLength: 3, maxLength: 40 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim());

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
 * Generate a valid bank question payload for the QuestionBankQuestion model.
 */
const bankQuestionPayloadArb = fc.record({
    question_en: questionTextArb,
    question_bn: questionTextArb,
    subject: nonEmptyTrimmedStr,
    moduleCategory: nonEmptyTrimmedStr,
    difficulty: difficultyArb,
    correctKey: correctKeyArb,
    options: optionsArb,
    explanation_en: fc.string({ minLength: 0, maxLength: 50 }),
    explanation_bn: fc.string({ minLength: 0, maxLength: 50 }),
    marks: fc.integer({ min: 1, max: 10 }),
    isActive: fc.constant(true),
    isArchived: fc.constant(false),
});

/**
 * Generate an array of 1-5 distinct bank question payloads for bulk copy testing.
 */
const bankQuestionArrayArb = fc.array(bankQuestionPayloadArb, { minLength: 1, maxLength: 5 });

// ─── Fake admin ID for the service call ──────────────────────────────────────

const ADMIN_ID = new mongoose.Types.ObjectId().toString();

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 9: Bulk copy preserves data with suffix', () => {
    it('bulk copying questions appends "(Copy)" to question_en and question_bn and preserves all other fields', async () => {
        await fc.assert(
            fc.asyncProperty(bankQuestionArrayArb, async (payloads) => {
                // Clean up from previous iteration
                await QuestionBankQuestion.deleteMany({});

                // 1. Create source bank questions
                const sources = await QuestionBankQuestion.insertMany(payloads);
                const sourceIds = sources.map((s) => s._id.toString());

                // 2. Perform bulk copy
                const result = await bulkCopy(sourceIds, ADMIN_ID);

                // 3. Verify correct number of copies
                expect(result.copied).toBe(sources.length);
                expect(result.newQuestions).toHaveLength(sources.length);

                // 4. For each source, find its copy and verify fields
                for (let i = 0; i < sources.length; i++) {
                    const src = sources[i];
                    const copy = result.newQuestions[i];

                    // "(Copy)" suffix on question text
                    expect(copy.question_en).toBe(
                        src.question_en ? `${src.question_en} (Copy)` : '',
                    );
                    expect(copy.question_bn).toBe(
                        src.question_bn ? `${src.question_bn} (Copy)` : '',
                    );

                    // All other fields match originals
                    expect(copy.subject).toBe(src.subject);
                    expect(copy.moduleCategory).toBe(src.moduleCategory);
                    expect(copy.difficulty).toBe(src.difficulty);
                    expect(copy.correctKey).toBe(src.correctKey);
                    expect(copy.explanation_en).toBe(src.explanation_en);
                    expect(copy.explanation_bn).toBe(src.explanation_bn);

                    // Options match
                    expect(copy.options).toHaveLength(src.options.length);
                    for (let j = 0; j < src.options.length; j++) {
                        expect(copy.options[j].key).toBe(src.options[j].key);
                        expect(copy.options[j].text_en).toBe(src.options[j].text_en);
                        expect(copy.options[j].text_bn).toBe(src.options[j].text_bn);
                    }

                    // New contentHash is generated (different from source since text changed)
                    expect(copy.contentHash).toBeTruthy();
                    expect(copy.contentHash).not.toBe(src.contentHash);

                    // versionNo is 1 and parentQuestionId is null
                    expect(copy.versionNo).toBe(1);
                    expect(copy.parentQuestionId).toBeNull();

                    // Copy has a different _id than source
                    expect(copy._id.toString()).not.toBe(src._id.toString());
                }

                // 5. Verify total count in DB: originals + copies
                const totalCount = await QuestionBankQuestion.countDocuments();
                expect(totalCount).toBe(sources.length * 2);
            }),
            { numRuns: 20 },
        );
    });
});
