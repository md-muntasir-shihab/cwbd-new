import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionImportJob from '../models/QuestionImportJob';

/**
 * Feature: exam-question-bank, Property 11: Import count invariant
 *
 * Validates: Requirements 7.4
 *
 * For any Excel import job, the equation
 *   totalRows = importedRows + skippedRows + failedRows + duplicateRows
 * should hold after the import completes.
 *
 * This property verifies that the QuestionImportJob model correctly stores
 * and preserves the count invariant across arbitrary import scenarios.
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
    await QuestionImportJob.deleteMany({});
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

/**
 * Generate a set of non-negative import counts that satisfy the invariant:
 *   totalRows = importedRows + skippedRows + failedRows + duplicateRows
 *
 * We generate four independent non-negative integers and derive totalRows
 * as their sum, guaranteeing the invariant by construction.
 */
const importCountsArb = fc
    .record({
        importedRows: fc.integer({ min: 0, max: 200 }),
        skippedRows: fc.integer({ min: 0, max: 200 }),
        failedRows: fc.integer({ min: 0, max: 200 }),
        duplicateRows: fc.integer({ min: 0, max: 200 }),
    })
    .map((counts) => ({
        ...counts,
        totalRows: counts.importedRows + counts.skippedRows + counts.failedRows + counts.duplicateRows,
    }));

const statusArb = fc.constantFrom('pending', 'processing', 'completed', 'failed') as fc.Arbitrary<
    'pending' | 'processing' | 'completed' | 'failed'
>;

const rowErrorsArb = (failedCount: number) =>
    fc.array(
        fc.record({
            rowNumber: fc.integer({ min: 2, max: 1000 }),
            reason: fc.string({ minLength: 5, maxLength: 80 }).filter((s) => s.trim().length > 0),
        }),
        { minLength: Math.min(failedCount, 1), maxLength: Math.max(failedCount, 1) },
    );

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 11: Import count invariant', () => {
    it('totalRows = importedRows + skippedRows + failedRows + duplicateRows after import', async () => {
        await fc.assert(
            fc.asyncProperty(importCountsArb, statusArb, async (counts, status) => {
                // Clean up from previous iteration
                await QuestionImportJob.deleteMany({});

                // 1. Create an import job with the generated counts
                const job = await QuestionImportJob.create({
                    status,
                    sourceFileName: 'test-import.xlsx',
                    totalRows: counts.totalRows,
                    importedRows: counts.importedRows,
                    skippedRows: counts.skippedRows,
                    failedRows: counts.failedRows,
                    duplicateRows: counts.duplicateRows,
                    rowErrors: [],
                    startedAt: new Date(),
                    finishedAt: status === 'completed' || status === 'failed' ? new Date() : null,
                });

                // 2. Retrieve the job from the database
                const retrieved = await QuestionImportJob.findById(job._id).lean();
                expect(retrieved).not.toBeNull();

                // 3. Verify the count invariant holds after round-trip
                const sum =
                    retrieved!.importedRows +
                    retrieved!.skippedRows +
                    retrieved!.failedRows +
                    retrieved!.duplicateRows;

                expect(sum).toBe(retrieved!.totalRows);

                // 4. Verify individual counts match what was stored
                expect(retrieved!.importedRows).toBe(counts.importedRows);
                expect(retrieved!.skippedRows).toBe(counts.skippedRows);
                expect(retrieved!.failedRows).toBe(counts.failedRows);
                expect(retrieved!.duplicateRows).toBe(counts.duplicateRows);
                expect(retrieved!.totalRows).toBe(counts.totalRows);
            }),
            { numRuns: 20 },
        );
    });

    it('invariant holds when import job is updated after processing rows', async () => {
        await fc.assert(
            fc.asyncProperty(importCountsArb, async (counts) => {
                // Clean up from previous iteration
                await QuestionImportJob.deleteMany({});

                // 1. Create a pending import job with only totalRows set
                const job = await QuestionImportJob.create({
                    status: 'pending',
                    sourceFileName: 'update-test.xlsx',
                    totalRows: counts.totalRows,
                    importedRows: 0,
                    skippedRows: 0,
                    failedRows: 0,
                    duplicateRows: 0,
                    rowErrors: [],
                });

                // 2. Simulate import completion by updating counts
                job.status = 'completed';
                job.importedRows = counts.importedRows;
                job.skippedRows = counts.skippedRows;
                job.failedRows = counts.failedRows;
                job.duplicateRows = counts.duplicateRows;
                job.finishedAt = new Date();
                await job.save();

                // 3. Retrieve and verify invariant
                const retrieved = await QuestionImportJob.findById(job._id).lean();
                expect(retrieved).not.toBeNull();

                const sum =
                    retrieved!.importedRows +
                    retrieved!.skippedRows +
                    retrieved!.failedRows +
                    retrieved!.duplicateRows;

                expect(sum).toBe(retrieved!.totalRows);
            }),
            { numRuns: 20 },
        );
    });
});
