import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import { ExamQuestionModel } from '../models/examQuestion.model';

/**
 * Feature: exam-question-bank, Property 1: Question creation round-trip
 *
 * Validates: Requirements 1.1, 1.8
 *
 * For any valid question payload with correctKey values E-H, creating the
 * question and then fetching it by ID should return a record with all fields
 * matching the original payload.
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
    await ExamQuestionModel.deleteMany({});
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const extendedKeyArb = fc.constantFrom('E', 'F', 'G', 'H');

const nonEmptyString = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const optionArb = fc.record({
    key: nonEmptyString,
    text_en: fc.option(nonEmptyString, { nil: undefined }),
    text_bn: fc.option(nonEmptyString, { nil: undefined }),
});

const difficultyArb = fc.constantFrom('easy', 'medium', 'hard');

/**
 * Generate a valid ExamQuestion payload with correctKey restricted to E-H.
 * Options array has between 5 and 8 entries to exercise the extended key range.
 */
const examQuestionPayloadArb = fc
    .record({
        examId: nonEmptyString,
        fromBankQuestionId: nonEmptyString,
        orderIndex: fc.integer({ min: 0, max: 100 }),
        question_en: fc.option(nonEmptyString, { nil: undefined }),
        question_bn: fc.option(nonEmptyString, { nil: undefined }),
        correctKey: extendedKeyArb,
        explanation_en: fc.option(nonEmptyString, { nil: undefined }),
        explanation_bn: fc.option(nonEmptyString, { nil: undefined }),
        marks: fc.integer({ min: 1, max: 10 }),
        negativeMarks: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
        topic: fc.option(nonEmptyString, { nil: undefined }),
        difficulty: difficultyArb,
        tags: fc.array(nonEmptyString, { minLength: 0, maxLength: 5 }),
    })
    .chain((base) => {
        // Generate 5-8 options so keys E-H are meaningful
        const optionCount = fc.integer({ min: 5, max: 8 });
        return optionCount.chain((count) =>
            fc.array(optionArb, { minLength: count, maxLength: count }).map((options) => ({
                ...base,
                options,
            })),
        );
    });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 1: Question creation round-trip', () => {
    it('creating a question with correctKey E-H and fetching by ID returns matching fields', async () => {
        await fc.assert(
            fc.asyncProperty(examQuestionPayloadArb, async (payload) => {
                const doc = await ExamQuestionModel.create(payload);
                const fetched = await ExamQuestionModel.findById(doc._id).lean();

                expect(fetched).not.toBeNull();
                expect(fetched!.examId).toBe(payload.examId);
                expect(fetched!.fromBankQuestionId).toBe(payload.fromBankQuestionId);
                expect(fetched!.orderIndex).toBe(payload.orderIndex);
                expect(fetched!.correctKey).toBe(payload.correctKey);
                expect(fetched!.marks).toBe(payload.marks);
                expect(fetched!.difficulty).toBe(payload.difficulty);
                expect(fetched!.tags).toEqual(payload.tags);

                // Verify options round-trip
                expect(fetched!.options).toHaveLength(payload.options.length);
                for (let i = 0; i < payload.options.length; i++) {
                    expect(fetched!.options[i].key).toBe(payload.options[i].key);
                }

                // Optional string fields: present when provided
                if (payload.question_en !== undefined) {
                    expect(fetched!.question_en).toBe(payload.question_en);
                }
                if (payload.question_bn !== undefined) {
                    expect(fetched!.question_bn).toBe(payload.question_bn);
                }
                if (payload.explanation_en !== undefined) {
                    expect(fetched!.explanation_en).toBe(payload.explanation_en);
                }
                if (payload.explanation_bn !== undefined) {
                    expect(fetched!.explanation_bn).toBe(payload.explanation_bn);
                }
                if (payload.topic !== undefined) {
                    expect(fetched!.topic).toBe(payload.topic);
                }

                // Clean up for next iteration
                await ExamQuestionModel.deleteOne({ _id: doc._id });
            }),
            { numRuns: 20 },
        );
    });
});
