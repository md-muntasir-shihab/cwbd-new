/**
 * Unit tests for questionBankAdvancedService — import preview & commit
 *
 * Tests:
 * - importPreview: parses xlsx, auto-maps columns, validates rows, detects duplicates
 * - importCommit: creates questions, skips duplicates (create mode), upserts (upsert mode)
 * - generateImportTemplate: returns a valid xlsx buffer
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import XLSX from 'xlsx';
import {
    importPreview,
    importCommit,
    generateImportTemplate,
} from '../services/questionBankAdvancedService';
import QuestionBankQuestion from '../models/QuestionBankQuestion';

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
});

// ─── Helper: build a valid xlsx buffer ──────────────────────────────────────

function buildXlsx(rows: Record<string, unknown>[]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const VALID_ROW = {
    subject: 'Physics',
    moduleCategory: 'Mechanics',
    topic: 'Newton Laws',
    difficulty: 'medium',
    languageMode: 'en',
    question_en: "What is Newton's first law?",
    optionA_en: 'An object at rest stays at rest',
    optionB_en: 'Force equals mass times acceleration',
    optionC_en: 'Every action has an equal reaction',
    optionD_en: 'None of the above',
    correctKey: 'A',
    marks: 1,
    negativeMarks: 0,
};

const DEFAULT_MAPPING: Record<string, string> = {
    subject: 'subject',
    moduleCategory: 'moduleCategory',
    topic: 'topic',
    difficulty: 'difficulty',
    languageMode: 'languageMode',
    question_en: 'question_en',
    optionA_en: 'optionA_en',
    optionB_en: 'optionB_en',
    optionC_en: 'optionC_en',
    optionD_en: 'optionD_en',
    correctKey: 'correctKey',
    marks: 'marks',
    negativeMarks: 'negativeMarks',
};

// ─── importPreview ───────────────────────────────────────────────────────────

describe('importPreview', () => {
    it('returns totalRows, headers, mapping, preview, availableColumns for valid xlsx', async () => {
        const buf = buildXlsx([VALID_ROW]);
        const result = await importPreview(buf, 'test.xlsx');

        expect(result.totalRows).toBe(1);
        expect(result.headers).toContain('subject');
        expect(result.headers).toContain('question_en');
        expect(result.mapping).toBeDefined();
        expect(Array.isArray(result.preview)).toBe(true);
        expect(result.preview).toHaveLength(1);
        expect(Array.isArray(result.availableColumns)).toBe(true);
        expect(result.availableColumns.length).toBeGreaterThan(0);
    });

    it('auto-maps known column names', async () => {
        const buf = buildXlsx([VALID_ROW]);
        const result = await importPreview(buf, 'test.xlsx');

        expect(result.mapping['subject']).toBe('subject');
        expect(result.mapping['question_en']).toBe('question_en');
        expect(result.mapping['correctKey']).toBe('correctKey');
    });

    it('returns no errors for a fully valid row', async () => {
        const buf = buildXlsx([VALID_ROW]);
        const result = await importPreview(buf, 'test.xlsx');

        expect(result.preview[0].errors).toHaveLength(0);
    });

    it('returns validation errors for missing required fields', async () => {
        const invalidRow = { ...VALID_ROW, subject: '', question_en: '', question_bn: '' };
        const buf = buildXlsx([invalidRow]);
        const result = await importPreview(buf, 'test.xlsx');

        const errors = result.preview[0].errors;
        expect(errors.length).toBeGreaterThan(0);
        const fields = errors.map((e) => e.field);
        expect(fields).toContain('subject');
        expect(fields).toContain('question');
    });

    it('returns validation error for invalid correctKey', async () => {
        const badRow = { ...VALID_ROW, correctKey: 'E' };
        const buf = buildXlsx([badRow]);
        const result = await importPreview(buf, 'test.xlsx');

        const fields = result.preview[0].errors.map((e) => e.field);
        expect(fields).toContain('correctKey');
    });

    it('detects duplicate rows already in DB', async () => {
        const buf = buildXlsx([VALID_ROW]);
        // First commit the row so it exists in DB
        await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        // Now preview the same row — should flag as duplicate
        const result = await importPreview(buf, 'test.xlsx');
        const dupErrors = result.preview[0].errors.filter((e) => e.field === 'duplicate');
        expect(dupErrors.length).toBe(1);
    });

    it('handles custom column mapping override', async () => {
        const customRow = {
            'Question Text': 'What is gravity?',
            'Subject Name': 'Physics',
            'Module': 'Mechanics',
            'Answer': 'A',
            'Opt1': 'Attraction',
            'Opt2': 'Repulsion',
            'Opt3': 'Neutral',
            'Opt4': 'None',
        };
        const buf = buildXlsx([customRow]);
        const customMapping: Record<string, string> = {
            'Question Text': 'question_en',
            'Subject Name': 'subject',
            'Module': 'moduleCategory',
            'Answer': 'correctKey',
            'Opt1': 'optionA_en',
            'Opt2': 'optionB_en',
            'Opt3': 'optionC_en',
            'Opt4': 'optionD_en',
        };
        const result = await importPreview(buf, 'test.xlsx', customMapping);

        expect(result.mapping).toMatchObject(customMapping);
        expect(result.preview[0].mapped.question_en).toBe('What is gravity?');
        expect(result.preview[0].mapped.subject).toBe('Physics');
    });

    it('limits preview to first 20 rows', async () => {
        const rows = Array.from({ length: 30 }, (_, i) => ({
            ...VALID_ROW,
            question_en: `Question ${i + 1}`,
        }));
        const buf = buildXlsx(rows);
        const result = await importPreview(buf, 'test.xlsx');

        expect(result.totalRows).toBe(30);
        expect(result.preview.length).toBeLessThanOrEqual(20);
    });
});

// ─── importCommit ────────────────────────────────────────────────────────────

describe('importCommit', () => {
    it('creates questions from valid rows in create mode', async () => {
        const buf = buildXlsx([VALID_ROW]);
        const result = await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        expect(result.imported).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.totalRows).toBe(1);

        const count = await QuestionBankQuestion.countDocuments();
        expect(count).toBe(1);
    });

    it('skips duplicate rows in create mode', async () => {
        const buf = buildXlsx([VALID_ROW]);
        await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);
        const result = await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(0);

        const count = await QuestionBankQuestion.countDocuments();
        expect(count).toBe(1);
    });

    it('upserts duplicate rows in upsert mode', async () => {
        const buf = buildXlsx([VALID_ROW]);
        await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        const updatedRow = { ...VALID_ROW, topic: 'Updated Topic' };
        const buf2 = buildXlsx([updatedRow]);
        const result = await importCommit(buf2, 'test.xlsx', DEFAULT_MAPPING, 'upsert', adminId);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(0);
    });

    it('records failed rows with reasons', async () => {
        const badRow = { ...VALID_ROW, subject: '', question_en: '' };
        const buf = buildXlsx([badRow]);
        const result = await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        expect(result.failed).toBe(1);
        expect(result.imported).toBe(0);
        expect(result.errorRows.length).toBe(1);
        expect(result.errorRows[0].row).toBe(1);
        expect(typeof result.errorRows[0].reason).toBe('string');
    });

    it('handles mixed valid and invalid rows', async () => {
        const rows = [
            VALID_ROW,
            { ...VALID_ROW, question_en: 'Second valid question?' },
            { ...VALID_ROW, subject: '', question_en: '' },
        ];
        const buf = buildXlsx(rows);
        const result = await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        expect(result.imported).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.totalRows).toBe(3);
    });

    it('imports multiple rows correctly', async () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({
            ...VALID_ROW,
            question_en: `Question number ${i + 1}`,
        }));
        const buf = buildXlsx(rows);
        const result = await importCommit(buf, 'test.xlsx', DEFAULT_MAPPING, 'create', adminId);

        expect(result.imported).toBe(5);
        expect(result.failed).toBe(0);
        const count = await QuestionBankQuestion.countDocuments();
        expect(count).toBe(5);
    });
});

// ─── generateImportTemplate ──────────────────────────────────────────────────

describe('generateImportTemplate', () => {
    it('returns a non-empty buffer', () => {
        const buf = generateImportTemplate();
        expect(buf).toBeInstanceOf(Buffer);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('returns a valid xlsx file with expected headers', () => {
        const buf = generateImportTemplate();
        const wb = XLSX.read(buf, { type: 'buffer' });
        expect(wb.SheetNames.length).toBeGreaterThan(0);

        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        expect(rows.length).toBeGreaterThan(0);

        const headers = Object.keys(rows[0]);
        expect(headers).toContain('subject');
        expect(headers).toContain('question_en');
        expect(headers).toContain('correctKey');
    });
});
