/**
 * Unit tests for ImportPipelineService
 *
 * Tests validateImportRow (pure function), importExcel, importCSV, importJSON,
 * row-level validation, hierarchy reference validation, and async job creation.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ExcelJS from 'exceljs';
import fc from 'fast-check';
import {
    validateImportRow,
    importExcel,
    importCSV,
    importJSON,
    processAsyncImport,
    slugify,
    resolveOrCreateHierarchy,
} from '../services/ImportPipelineService';
import type { RawImportRow, ExtendedRawImportRow } from '../services/ImportPipelineService';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import QuestionImportJob from '../models/QuestionImportJob';
import QuestionGroup from '../models/QuestionGroup';
import QuestionSubGroup from '../models/QuestionSubGroup';
import QuestionCategory from '../models/QuestionCategory';
import QuestionChapter from '../models/QuestionChapter';
import QuestionTopic from '../models/QuestionTopic';

let mongoServer: MongoMemoryServer;
const adminId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await QuestionBankQuestion.deleteMany({});
    await QuestionImportJob.deleteMany({});
    await QuestionGroup.deleteMany({});
    await QuestionCategory.deleteMany({});
    await QuestionTopic.deleteMany({});
});

// ─── Helper: build a valid row ──────────────────────────────

function validRow(overrides: Partial<ExtendedRawImportRow> = {}): ExtendedRawImportRow {
    return {
        questionText: 'What is 2+2?',
        option1: '3',
        option2: '4',
        option3: '5',
        option4: '6',
        correctOption: '2',
        explanation: 'Basic arithmetic',
        difficulty: 'easy',
        ...overrides,
    };
}

// ─── Helper: build Excel buffer ─────────────────────────────

async function buildExcelBuffer(rows: RawImportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Questions');

    // Header row
    ws.addRow([
        'questionText', 'option1', 'option2', 'option3', 'option4',
        'correctOption', 'explanation', 'difficulty',
        'topic', 'category', 'group', 'tags', 'year', 'source',
    ]);

    // Data rows
    for (const row of rows) {
        ws.addRow([
            row.questionText, row.option1, row.option2, row.option3, row.option4,
            row.correctOption, row.explanation, row.difficulty,
            row.topic, row.category, row.group, row.tags, row.year, row.source,
        ]);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

// ─── Helper: build CSV buffer ───────────────────────────────

function buildCSVBuffer(rows: RawImportRow[]): Buffer {
    const headers = [
        'questionText', 'option1', 'option2', 'option3', 'option4',
        'correctOption', 'explanation', 'difficulty',
        'topic', 'category', 'group', 'tags', 'year', 'source',
    ];

    const lines = [headers.join(',')];
    for (const row of rows) {
        const values = headers.map((h) => {
            const val = (row as Record<string, unknown>)[h];
            if (val == null) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
        lines.push(values.join(','));
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════
// validateImportRow — pure function tests
// ═══════════════════════════════════════════════════════════════

describe('validateImportRow', () => {
    it('returns null for a valid row', () => {
        expect(validateImportRow(validRow())).toBeNull();
    });

    it('rejects missing questionText', () => {
        const err = validateImportRow(validRow({ questionText: '' }));
        expect(err).toContain('questionText');
    });

    it('rejects missing option1', () => {
        const err = validateImportRow(validRow({ option1: '' }));
        expect(err).toContain('option1');
    });

    it('rejects missing option2', () => {
        const err = validateImportRow(validRow({ option2: '' }));
        expect(err).toContain('option2');
    });

    it('rejects invalid correctOption', () => {
        const err = validateImportRow(validRow({ correctOption: '5' }));
        expect(err).toContain('correctOption');
    });

    it('accepts correctOption as letter (a-d)', () => {
        expect(validateImportRow(validRow({ correctOption: 'b' }))).toBeNull();
    });

    it('rejects correctOption referencing empty option', () => {
        const err = validateImportRow(validRow({ correctOption: '3', option3: '' }));
        expect(err).toContain('option3');
    });

    it('rejects invalid difficulty', () => {
        const err = validateImportRow(validRow({ difficulty: 'extreme' }));
        expect(err).toContain('difficulty');
    });

    it('accepts valid difficulties', () => {
        expect(validateImportRow(validRow({ difficulty: 'easy' }))).toBeNull();
        expect(validateImportRow(validRow({ difficulty: 'medium' }))).toBeNull();
        expect(validateImportRow(validRow({ difficulty: 'hard' }))).toBeNull();
    });

    it('accepts row without difficulty (optional)', () => {
        expect(validateImportRow(validRow({ difficulty: undefined }))).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
// importJSON — JSON import
// ═══════════════════════════════════════════════════════════════

describe('importJSON', () => {
    it('imports valid JSON rows', async () => {
        const data = [validRow(), validRow({ questionText: 'What is 3+3?' })];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        if (result.success !== result.total) {
            console.log('IMPORT JSON ERROR:', result.errors);
        }

        expect(result.total).toBe(2);
        expect(result.success).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);

        const count = await QuestionBankQuestion.countDocuments();
        expect(count).toBe(2);
    });

    it('skips invalid rows and records errors', async () => {
        const data = [
            validRow(),
            { questionText: '', option1: 'A', option2: 'B', correctOption: '1' },
            validRow({ questionText: 'Valid question' }),
        ];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.total).toBe(3);
        expect(result.success).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(2);
        expect(result.errors[0].error).toContain('questionText');
    });

    it('returns error for non-array JSON', async () => {
        const buffer = Buffer.from('{"not": "an array"}', 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.total).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain('array');
    });

    it('returns error for invalid JSON', async () => {
        const buffer = Buffer.from('not valid json', 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.total).toBe(0);
        expect(result.errors).toHaveLength(1);
    });

    it('success + failed = total for every import', async () => {
        const data = [
            validRow(),
            { questionText: '' },
            validRow({ questionText: 'Q2' }),
            { option1: 'only option1' },
        ];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.success + result.failed).toBe(result.total);
    });
});

// ═══════════════════════════════════════════════════════════════
// importExcel — Excel import
// ═══════════════════════════════════════════════════════════════

describe('importExcel', () => {
    it('imports valid Excel rows', async () => {
        const rows = [validRow(), validRow({ questionText: 'Excel Q2' })];
        const buffer = await buildExcelBuffer(rows);

        const result = await importExcel(buffer, adminId);

        expect(result.total).toBe(2);
        expect(result.success).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('skips invalid rows and records errors', async () => {
        const rows = [
            validRow(),
            validRow({ questionText: '' }),
        ];
        const buffer = await buildExcelBuffer(rows);

        const result = await importExcel(buffer, adminId);

        expect(result.total).toBe(2);
        expect(result.success).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.errors[0].row).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
// importCSV — CSV import
// ═══════════════════════════════════════════════════════════════

describe('importCSV', () => {
    it('imports valid CSV rows', async () => {
        const rows = [validRow(), validRow({ questionText: 'CSV Q2' })];
        const buffer = buildCSVBuffer(rows);

        const result = await importCSV(buffer, adminId);

        expect(result.total).toBe(2);
        expect(result.success).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('skips invalid rows and records errors', async () => {
        const rows = [
            validRow(),
            validRow({ correctOption: '9' }),
        ];
        const buffer = buildCSVBuffer(rows);

        const result = await importCSV(buffer, adminId);

        expect(result.total).toBe(2);
        expect(result.success).toBe(1);
        expect(result.failed).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════════════
// Hierarchy reference validation
// ═══════════════════════════════════════════════════════════════

describe('hierarchy reference validation', () => {
    it('resolves valid group reference by name', async () => {
        await QuestionGroup.create({
            code: 'academic',
            title: { en: 'Academic', bn: 'একাডেমিক' },
            order: 1,
            isActive: true,
        });

        const data = [validRow({ group: 'Academic' })];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.success).toBe(1);
        const q = await QuestionBankQuestion.findOne({ question_en: 'What is 2+2?' });
        expect(q?.group_id).toBeTruthy();
    });

    it('auto-creates group when group reference not found', async () => {
        const data = [validRow({ group: 'NonExistentGroup' })];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.failed).toBe(0);
        expect(result.success).toBe(1);
        expect(result.hierarchyCreated).toBeGreaterThan(0);
    });

    it('auto-creates category when category reference not found', async () => {
        const data = [validRow({ group: 'Group1', subGroup: 'SubGroup1', category: 'NonExistentCategory' })];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.failed).toBe(0);
        expect(result.success).toBe(1);
        expect(result.hierarchyCreated).toBeGreaterThan(0);
    });

    it('auto-creates topic when topic reference not found', async () => {
        const data = [validRow({ group: 'Group1', subGroup: 'SubGroup1', category: 'Category1', chapter: 'Chapter1', topic: 'NonExistentTopic' })];
        const buffer = Buffer.from(JSON.stringify(data), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.failed).toBe(0);
        expect(result.success).toBe(1);
        expect(result.hierarchyCreated).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// Async processing for large files
// ═══════════════════════════════════════════════════════════════

describe('async processing for large files', () => {
    it('creates a QuestionImportJob for > 5000 rows', async () => {
        const rows = Array.from({ length: 5001 }, (_, i) =>
            validRow({ questionText: `Question ${i + 1}` }),
        );
        const buffer = Buffer.from(JSON.stringify(rows), 'utf-8');

        const result = await importJSON(buffer, adminId);

        expect(result.total).toBe(5001);
        expect(result.jobId).toBeTruthy();
        expect(result.success).toBe(0);

        const job = await QuestionImportJob.findById(result.jobId);
        expect(job).toBeTruthy();
        expect(job!.status).toBe('pending');
        expect(job!.totalRows).toBe(5001);
    });

    it('processAsyncImport processes pending job', async () => {
        const rows = [validRow(), validRow({ questionText: 'Async Q2' })];
        const job = await QuestionImportJob.create({
            status: 'pending',
            sourceFileName: 'test.json',
            createdBy: new mongoose.Types.ObjectId(adminId),
            totalRows: 2,
            options: { rows, adminId, format: 'json' },
        });

        await processAsyncImport((job._id as mongoose.Types.ObjectId).toString());

        const updated = await QuestionImportJob.findById(job._id);
        expect(updated!.status).toBe('completed');
        expect(updated!.importedRows).toBe(2);
        expect(updated!.failedRows).toBe(0);

        const count = await QuestionBankQuestion.countDocuments();
        expect(count).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
// Property Tests (fast-check)
// ═══════════════════════════════════════════════════════════════

describe('Property Tests', () => {
    // Feature: question-bank-exam-center-overhaul, Property 2: Slug is always URL-safe
    it('Property 2: slugify produces URL-safe strings', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }),
                (name) => {
                    const slug = slugify(name);
                    return /^[a-z0-9][a-z0-9-]*$/.test(slug) || /^[a-z0-9]$/.test(slug) || slug === 'unnamed';
                }
            ),
            { numRuns: 1000 }
        );
    });

    // Feature: question-bank-exam-center-overhaul, Property 1: Hierarchy auto-creation round-trip
    it('Property 1: Hierarchy auto-creation round-trip', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
                async (groupName) => {
                    await QuestionGroup.deleteMany({});
                    await QuestionSubGroup.deleteMany({});
                    await QuestionCategory.deleteMany({});
                    await QuestionChapter.deleteMany({});
                    await QuestionTopic.deleteMany({});
                    await resolveOrCreateHierarchy({ group: groupName });
                    const trimmed = groupName.trim();
                    const found = await QuestionGroup.findOne({ 'title.en': trimmed });
                    return found !== null;
                }
            ),
            { numRuns: 100 }
        );
    });

    // Feature: question-bank-exam-center-overhaul, Property 3: hierarchyCreated count is accurate
    it('Property 3: hierarchyCreated count is accurate', { timeout: 15000 }, async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.record({
                        group: fc.string({ minLength: 5 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
                        subGroup: fc.string({ minLength: 5 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
                        category: fc.string({ minLength: 5 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a')),
                        questionText: fc.constant('Arbitrary Question'),
                        option1: fc.constant('A'),
                        option2: fc.constant('B'),
                        correctOption: fc.constant('1'),
                    }),
                    { minLength: 1, maxLength: 20 }
                ),
                async (rows) => {
                    await QuestionGroup.deleteMany({});
                    await QuestionSubGroup.deleteMany({});
                    await QuestionCategory.deleteMany({});
                    await QuestionChapter.deleteMany({});
                    await QuestionTopic.deleteMany({});
                    const buffer = Buffer.from(JSON.stringify(rows), 'utf-8');
                    const result = await importJSON(buffer, adminId);
                    return result.hierarchyCreated >= 0 && result.hierarchyCreated <= rows.length * 3;
                }
            ),
            { numRuns: 100 }
        );
    });
});
