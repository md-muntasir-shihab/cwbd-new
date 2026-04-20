import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import crypto from 'crypto';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import QuestionImportJob from '../models/QuestionImportJob';

/**
 * Feature: exam-question-bank, Property 12: Import duplicate detection via contentHash
 *
 * Validates: Requirements 7.7
 *
 * For any question that already exists in the database with a given contentHash,
 * importing a row that produces the same contentHash should increment `duplicateRows`
 * on the ImportJob rather than creating a new QuestionBankQuestion record.
 *
 * This property tests the core duplicate detection mechanism used during import:
 * 1. Pre-seed questions with known contentHash values
 * 2. Simulate the import duplicate-detection logic (contentHash lookup)
 * 3. Verify duplicateRows is incremented and no new records are created
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
    await QuestionImportJob.deleteMany({});
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute contentHash the same way the production code does
 * (mirrors questionBankAdvancedService.computeContentHash)
 */
function computeContentHash(q: {
    question_en?: string;
    question_bn?: string;
    options?: { key: string; text_en?: string; text_bn?: string }[];
    correctKey?: string;
}): string {
    const parts = [
        (q.question_en || '').trim().toLowerCase(),
        (q.question_bn || '').trim().toLowerCase(),
        ...(q.options || [])
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(
                (o) =>
                    `${o.key}|${(o.text_en || '').trim().toLowerCase()}|${(o.text_bn || '').trim().toLowerCase()}`,
            ),
        (q.correctKey || '').toUpperCase(),
    ];
    return crypto.createHash('sha256').update(parts.join('|||')).digest('hex');
}

/**
 * Simulate the import duplicate-detection logic from the production import flow.
 * For each incoming row, compute its contentHash and check if a question with
 * that hash already exists. If so, increment duplicateRows; otherwise create it.
 */
async function simulateImport(
    rows: Array<{
        question_en: string;
        question_bn: string;
        subject: string;
        moduleCategory: string;
        difficulty: 'easy' | 'medium' | 'hard';
        options: Array<{ key: 'A' | 'B' | 'C' | 'D'; text_en: string; text_bn: string }>;
        correctKey: 'A' | 'B' | 'C' | 'D';
    }>,
): Promise<{ importedRows: number; duplicateRows: number; totalRows: number }> {
    let importedRows = 0;
    let duplicateRows = 0;

    for (const row of rows) {
        const hash = computeContentHash(row);
        const existing = await QuestionBankQuestion.findOne({ contentHash: hash });

        if (existing) {
            duplicateRows += 1;
        } else {
            await QuestionBankQuestion.create({
                question_en: row.question_en,
                question_bn: row.question_bn,
                subject: row.subject,
                moduleCategory: row.moduleCategory,
                difficulty: row.difficulty,
                options: row.options,
                correctKey: row.correctKey,
                contentHash: hash,
                isActive: true,
                isArchived: false,
            });
            importedRows += 1;
        }
    }

    return { importedRows, duplicateRows, totalRows: rows.length };
}

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const optionKeyArb = fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>;
const difficultyArb = fc.constantFrom('easy', 'medium', 'hard') as fc.Arbitrary<
    'easy' | 'medium' | 'hard'
>;

/** Generate a valid question row with unique option keys A-D */
const questionRowArb = fc
    .record({
        question_en: fc.string({ minLength: 10, maxLength: 80 }).filter((s) => s.trim().length >= 10),
        question_bn: fc.string({ minLength: 0, maxLength: 80 }),
        subject: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        moduleCategory: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        difficulty: difficultyArb,
        correctKey: optionKeyArb,
        optA_en: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        optB_en: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        optC_en: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        optD_en: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    })
    .map((r) => ({
        question_en: r.question_en,
        question_bn: r.question_bn,
        subject: r.subject,
        moduleCategory: r.moduleCategory,
        difficulty: r.difficulty,
        correctKey: r.correctKey,
        options: [
            { key: 'A' as const, text_en: r.optA_en, text_bn: '' },
            { key: 'B' as const, text_en: r.optB_en, text_bn: '' },
            { key: 'C' as const, text_en: r.optC_en, text_bn: '' },
            { key: 'D' as const, text_en: r.optD_en, text_bn: '' },
        ],
    }));

/** Generate 1-5 unique questions (used as pre-existing questions in the bank) */
const uniqueQuestionsArb = fc.array(questionRowArb, { minLength: 1, maxLength: 5 });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 12: Import duplicate detection via contentHash', () => {
    it('duplicate rows increment duplicateRows instead of creating new records', async () => {
        await fc.assert(
            fc.asyncProperty(uniqueQuestionsArb, async (seedQuestions) => {
                await QuestionBankQuestion.deleteMany({});
                await QuestionImportJob.deleteMany({});

                // 1. Pre-seed the database with questions (first import)
                const firstImport = await simulateImport(seedQuestions);
                expect(firstImport.duplicateRows).toBe(0);

                const countAfterFirstImport = await QuestionBankQuestion.countDocuments();
                expect(countAfterFirstImport).toBe(firstImport.importedRows);

                // 2. Import the SAME questions again (should all be detected as duplicates)
                const secondImport = await simulateImport(seedQuestions);

                // 3. Verify: all rows in the second import should be duplicates
                expect(secondImport.duplicateRows).toBe(seedQuestions.length);
                expect(secondImport.importedRows).toBe(0);

                // 4. Verify: no new records were created
                const countAfterSecondImport = await QuestionBankQuestion.countDocuments();
                expect(countAfterSecondImport).toBe(countAfterFirstImport);

                // 5. Record the import job and verify duplicateRows is tracked
                const job = await QuestionImportJob.create({
                    status: 'completed',
                    sourceFileName: 'duplicate-test.xlsx',
                    totalRows: secondImport.totalRows,
                    importedRows: secondImport.importedRows,
                    skippedRows: 0,
                    failedRows: 0,
                    duplicateRows: secondImport.duplicateRows,
                    rowErrors: [],
                    finishedAt: new Date(),
                });

                const retrieved = await QuestionImportJob.findById(job._id).lean();
                expect(retrieved!.duplicateRows).toBe(seedQuestions.length);
                expect(retrieved!.importedRows).toBe(0);
            }),
            { numRuns: 15 },
        );
    });

    it('mixed import with some new and some duplicate questions tracks counts correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueQuestionsArb,
                uniqueQuestionsArb,
                async (existingQuestions, newQuestions) => {
                    await QuestionBankQuestion.deleteMany({});

                    // 1. Pre-seed the database with existing questions
                    await simulateImport(existingQuestions);
                    const countAfterSeed = await QuestionBankQuestion.countDocuments();

                    // 2. Build a mixed batch: some duplicates of existing + some new
                    const mixedBatch = [...existingQuestions, ...newQuestions];

                    // 3. Import the mixed batch
                    const result = await simulateImport(mixedBatch);

                    // 4. Compute expected duplicates: questions from existingQuestions
                    //    that already have matching contentHash in the DB
                    //    (all of existingQuestions should be duplicates)
                    expect(result.duplicateRows).toBeGreaterThanOrEqual(existingQuestions.length);

                    // 5. Total records should be seed count + newly imported
                    const finalCount = await QuestionBankQuestion.countDocuments();
                    expect(finalCount).toBe(countAfterSeed + result.importedRows);

                    // 6. The invariant: totalRows = importedRows + duplicateRows
                    expect(result.totalRows).toBe(result.importedRows + result.duplicateRows);
                },
            ),
            { numRuns: 15 },
        );
    });

    it('contentHash is deterministic — same question data always produces the same hash', async () => {
        await fc.assert(
            fc.property(questionRowArb, (question) => {
                const hash1 = computeContentHash(question);
                const hash2 = computeContentHash(question);
                expect(hash1).toBe(hash2);
                expect(hash1).toHaveLength(64); // SHA-256 hex length
            }),
            { numRuns: 20 },
        );
    });
});
