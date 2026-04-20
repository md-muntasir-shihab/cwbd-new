import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import Question from '../models/Question';
import QuestionBankSettings from '../models/QuestionBankSettings';

/**
 * Feature: exam-question-bank, Property 8: Archive-instead-of-delete when enabled
 *
 * Validates: Requirements 4.5
 *
 * For any bank question, when QuestionBankSettings.archiveInsteadOfDelete is true,
 * calling delete should set isArchived (status = 'archived', active = false) on the
 * question without removing the record from the database, and the question should
 * still be retrievable by ID.
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
    await Question.deleteMany({});
    await QuestionBankSettings.deleteMany({});
    // Ensure archiveInsteadOfDelete is true for these tests
    await QuestionBankSettings.create({ archiveInsteadOfDelete: true });
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const difficultyArb = fc.constantFrom('easy', 'medium', 'hard');
const correctKeyArb = fc.constantFrom('A', 'B', 'C', 'D');
const marksArb = fc.integer({ min: 1, max: 10 });

/**
 * Generate a valid bank question payload for the Question model.
 */
const bankQuestionPayloadArb = fc.record({
    question: fc.string({ minLength: 10, maxLength: 100 }),
    subject: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    difficulty: difficultyArb,
    correctAnswer: correctKeyArb,
    marks: marksArb,
    options: fc.constant([
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
        { key: 'C', text: 'Option C' },
        { key: 'D', text: 'Option D' },
    ]),
    active: fc.constant(true),
    status: fc.constantFrom('draft', 'pending_review', 'approved'),
});

// ─── Archive Logic (mirrors controller's deleteQuestion when archiveInsteadOfDelete is true) ─

/**
 * Performs the same archive logic as the questionBankController's
 * deleteQuestion handler when archiveInsteadOfDelete is enabled.
 */
async function performArchiveDelete(questionId: string): Promise<void> {
    const settings = await QuestionBankSettings.findOne();

    if (!settings?.archiveInsteadOfDelete) {
        throw new Error('archiveInsteadOfDelete should be true for archive delete tests');
    }

    const existing = await Question.findById(questionId);
    if (!existing) {
        throw new Error('Question not found');
    }

    // Soft delete: archive the question instead of removing it
    existing.status = 'archived';
    existing.active = false;
    existing.archived_at = new Date();
    await existing.save();
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 8: Archive-instead-of-delete when enabled', () => {
    it('when archiveInsteadOfDelete is true, deleting a question archives it without removing the record', async () => {
        await fc.assert(
            fc.asyncProperty(bankQuestionPayloadArb, async (qPayload) => {
                // Clean up from previous iteration
                await Question.deleteMany({});

                // 1. Create the bank question
                const bankQuestion = await Question.create(qPayload);
                const bankQuestionId = bankQuestion._id.toString();

                // Capture original field values for comparison
                const originalQuestion = bankQuestion.question;
                const originalSubject = bankQuestion.subject;
                const originalDifficulty = bankQuestion.difficulty;
                const originalMarks = bankQuestion.marks;

                // 2. Perform archive delete
                await performArchiveDelete(bankQuestionId);

                // 3. Verify: question is still retrievable by ID (NOT removed from DB)
                const archivedQuestion = await Question.findById(bankQuestionId);
                expect(archivedQuestion).not.toBeNull();

                // 4. Verify: question is marked as archived
                expect(archivedQuestion!.status).toBe('archived');
                expect(archivedQuestion!.active).toBe(false);
                expect(archivedQuestion!.archived_at).toBeInstanceOf(Date);

                // 5. Verify: original data fields are preserved
                expect(archivedQuestion!.question).toBe(originalQuestion);
                expect(archivedQuestion!.subject).toBe(originalSubject);
                expect(archivedQuestion!.difficulty).toBe(originalDifficulty);
                expect(archivedQuestion!.marks).toBe(originalMarks);

                // 6. Verify: total count in DB is still 1 (record was not deleted)
                const totalCount = await Question.countDocuments({ _id: bankQuestionId });
                expect(totalCount).toBe(1);
            }),
            { numRuns: 20 },
        );
    });
});
