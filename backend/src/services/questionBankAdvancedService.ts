import crypto from 'crypto';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import QuestionBankQuestion, { IQuestionBankQuestion, IBankQuestionOption } from '../models/QuestionBankQuestion';
import QuestionBankSet, { IQuestionBankSet, ISetRules } from '../models/QuestionBankSet';
import QuestionBankUsage from '../models/QuestionBankUsage';
import QuestionBankAnalytics from '../models/QuestionBankAnalytics';
import QuestionBankSettings from '../models/QuestionBankSettings';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';
import { AnswerModel } from '../models/answer.model';
import AuditLog from '../models/AuditLog';

// ─── Content Hash ────────────────────────────────────────
export function computeContentHash(q: {
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
            .map((o) => `${o.key}|${(o.text_en || '').trim().toLowerCase()}|${(o.text_bn || '').trim().toLowerCase()}`),
        (q.correctKey || '').toUpperCase(),
    ];
    return crypto.createHash('sha256').update(parts.join('|||')).digest('hex');
}

// ─── Audit helper ────────────────────────────────────────
async function audit(
    adminId: string,
    action: string,
    targetId?: string,
    details?: Record<string, unknown>,
): Promise<void> {
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return;
    await AuditLog.create({
        actor_id: adminId,
        actor_role: 'admin',
        action,
        target_id: targetId && mongoose.Types.ObjectId.isValid(targetId) ? targetId : undefined,
        target_type: 'question_bank_v2',
        details: details || {},
    }).catch(() => { });
}

// ─── Settings (singleton) ────────────────────────────────
export async function getSettings(): Promise<any> {
    const existing = await QuestionBankSettings.findOne().lean();
    if (existing) {
        return existing;
    }

    const created = await QuestionBankSettings.create({});
    return created.toObject();
}

export async function updateSettings(data: Record<string, unknown>, adminId: string) {
    let doc = await QuestionBankSettings.findOne();
    if (!doc) doc = new QuestionBankSettings();
    const allowed = [
        'versioningOnEditIfUsed',
        'duplicateDetectionSensitivity',
        'defaultMarks',
        'defaultNegativeMarks',
        'archiveInsteadOfDelete',
        'allowImageUploads',
        'allowBothLanguages',
        'importSizeLimit',
    ];
    for (const key of allowed) {
        if (data[key] !== undefined) (doc as any)[key] = data[key];
    }
    await doc.save();
    await audit(adminId, 'qbank_settings_update', undefined, data);
    return doc.toObject();
}

// ─── CRUD: Bank Questions ────────────────────────────────
export async function createBankQuestion(
    data: Record<string, unknown>,
    adminId: string,
): Promise<IQuestionBankQuestion> {
    const hash = computeContentHash(data as any);
    const existing = await QuestionBankQuestion.findOne({ contentHash: hash, isArchived: false }).lean();
    let duplicateWarning: string | undefined;
    if (existing) {
        duplicateWarning = `Duplicate question detected (ID: ${existing._id})`;
    }

    const doc = await QuestionBankQuestion.create({
        ...data,
        contentHash: hash,
        createdByAdminId: adminId,
        updatedByAdminId: adminId,
    });

    await audit(adminId, 'qbank_question_create', String(doc._id));
    if (duplicateWarning) (doc as any)._duplicateWarning = duplicateWarning;
    return doc;
}

export async function getBankQuestion(id: string) {
    const question = await QuestionBankQuestion.findById(id).lean();
    if (!question) return null;
    const usageCount = await QuestionBankUsage.countDocuments({ bankQuestionId: question._id });
    const analytics = await QuestionBankAnalytics.findOne({ bankQuestionId: question._id }).lean();
    const versions = await QuestionBankQuestion.find({ parentQuestionId: question._id })
        .select('_id versionNo createdAt')
        .sort({ versionNo: -1 })
        .lean();
    return { question, usageCount, analytics, versions };
}

export async function updateBankQuestion(
    id: string,
    data: Record<string, unknown>,
    adminId: string,
) {
    const question = await QuestionBankQuestion.findById(id);
    if (!question) return null;

    const settings = await getSettings();
    const usageCount = await QuestionBankUsage.countDocuments({ bankQuestionId: question._id });

    // Version-aware update: if question is used in published exams, create new version
    if (usageCount > 0 && settings.versioningOnEditIfUsed) {
        const newVersion = await QuestionBankQuestion.create({
            ...question.toObject(),
            _id: undefined,
            versionNo: question.versionNo + 1,
            parentQuestionId: question._id,
            contentHash: computeContentHash({ ...question.toObject(), ...data } as any),
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
            ...data,
        });
        await audit(adminId, 'qbank_question_version', String(newVersion._id), {
            parentId: String(question._id),
            versionNo: newVersion.versionNo,
        });
        return { question: newVersion, versioned: true, parentId: String(question._id) };
    }

    // Direct update
    const hash = computeContentHash({ ...question.toObject(), ...data } as any);
    Object.assign(question, data, { contentHash: hash, updatedByAdminId: adminId });
    await question.save();
    await audit(adminId, 'qbank_question_update', String(question._id));
    return { question, versioned: false };
}

export async function deleteBankQuestion(id: string, adminId: string) {
    const settings = await getSettings();
    if (settings.archiveInsteadOfDelete) {
        return archiveBankQuestion(id, adminId);
    }
    const result = await QuestionBankQuestion.findByIdAndDelete(id);
    if (result) await audit(adminId, 'qbank_question_delete', id);
    return result;
}

export async function archiveBankQuestion(id: string, adminId: string) {
    const q = await QuestionBankQuestion.findByIdAndUpdate(
        id,
        { isArchived: true, isActive: false, updatedByAdminId: adminId },
        { new: true },
    );
    if (q) await audit(adminId, 'qbank_question_archive', id);
    return q;
}

export async function restoreBankQuestion(id: string, adminId: string) {
    const q = await QuestionBankQuestion.findByIdAndUpdate(
        id,
        { isArchived: false, isActive: true, updatedByAdminId: adminId },
        { new: true },
    );
    if (q) await audit(adminId, 'qbank_question_restore', id);
    return q;
}

export async function duplicateBankQuestion(id: string, adminId: string) {
    const src = await QuestionBankQuestion.findById(id).lean();
    if (!src) return null;
    const { _id, bankQuestionId, createdAt, updatedAt, ...rest } = src as any;
    const dup = await QuestionBankQuestion.create({
        ...rest,
        bankQuestionId: undefined,
        createdByAdminId: adminId,
        updatedByAdminId: adminId,
        versionNo: 1,
        parentQuestionId: null,
    });
    await audit(adminId, 'qbank_question_duplicate', String(dup._id), { sourceId: id });
    return dup;
}

// ─── List / Search / Filter ─────────────────────────────
export interface ListBankQuestionsParams {
    q?: string;
    subject?: string;
    moduleCategory?: string;
    topic?: string;
    difficulty?: string;
    tag?: string;
    status?: string; // 'active' | 'archived' | 'all'
    page?: number;
    limit?: number;
    sort?: string;
}

export async function listBankQuestions(params: ListBankQuestionsParams): Promise<any> {
    const filter: Record<string, unknown> = {};

    if (params.subject) filter.subject = params.subject;
    if (params.moduleCategory) filter.moduleCategory = params.moduleCategory;
    if (params.topic) filter.topic = { $regex: params.topic, $options: 'i' };
    if (params.difficulty) filter.difficulty = params.difficulty;
    if (params.tag) filter.tags = { $in: params.tag.split(',').map((t) => t.trim()).filter(Boolean) };

    if (params.status === 'archived') {
        filter.isArchived = true;
    } else if (params.status === 'all') {
        // no filter
    } else {
        filter.isArchived = false;
    }

    if (params.q) {
        filter.$or = [
            { question_en: { $regex: params.q, $options: 'i' } },
            { question_bn: { $regex: params.q, $options: 'i' } },
            { subject: { $regex: params.q, $options: 'i' } },
            { topic: { $regex: params.q, $options: 'i' } },
            { tags: { $elemMatch: { $regex: params.q, $options: 'i' } } },
        ];
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 25));
    const skip = (page - 1) * limit;

    const sortField = params.sort || '-createdAt';
    const sortObj: Record<string, 1 | -1> = {};
    if (sortField.startsWith('-')) {
        sortObj[sortField.slice(1)] = -1;
    } else {
        sortObj[sortField] = 1;
    }

    const [questions, total, facets] = await Promise.all([
        QuestionBankQuestion.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
        QuestionBankQuestion.countDocuments(filter),
        computeFacets(filter),
    ]);

    // Attach usage counts for returned questions
    const qIds = questions.map((q) => q._id);
    const usageCounts = await QuestionBankUsage.aggregate([
        { $match: { bankQuestionId: { $in: qIds } } },
        { $group: { _id: '$bankQuestionId', count: { $sum: 1 } } },
    ]);
    const usageMap = new Map(usageCounts.map((u) => [String(u._id), u.count]));

    // Attach analytics
    const analyticsDocs = await QuestionBankAnalytics.find({ bankQuestionId: { $in: qIds } }).lean();
    const analyticsMap = new Map(analyticsDocs.map((a) => [String(a.bankQuestionId), a]));

    const enriched = questions.map((q) => ({
        ...q,
        usageCount: usageMap.get(String(q._id)) || 0,
        analytics: analyticsMap.get(String(q._id)) || null,
    }));

    return {
        questions: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        facets,
    };
}

async function computeFacets(baseFilter: Record<string, unknown>) {
    const [subjects, moduleCategories, topics, difficulties, tags] = await Promise.all([
        QuestionBankQuestion.distinct('subject', baseFilter),
        QuestionBankQuestion.distinct('moduleCategory', baseFilter),
        QuestionBankQuestion.distinct('topic', baseFilter),
        QuestionBankQuestion.distinct('difficulty', baseFilter),
        QuestionBankQuestion.distinct('tags', baseFilter),
    ]);
    return {
        subjects: subjects.filter(Boolean).sort(),
        moduleCategories: moduleCategories.filter(Boolean).sort(),
        topics: topics.filter(Boolean).sort(),
        difficulties: difficulties.filter(Boolean),
        tags: tags.filter(Boolean).sort(),
    };
}

// ─── Import / Export ─────────────────────────────────────
const IMPORT_COLUMN_MAP: Record<string, string> = {
    subject: 'subject',
    modulecategory: 'moduleCategory',
    module_category: 'moduleCategory',
    topic: 'topic',
    subtopic: 'subtopic',
    difficulty: 'difficulty',
    languagemode: 'languageMode',
    language_mode: 'languageMode',
    question_en: 'question_en',
    question_bn: 'question_bn',
    questionimageurl: 'questionImageUrl',
    optiona_en: 'optionA_en',
    optionb_en: 'optionB_en',
    optionc_en: 'optionC_en',
    optiond_en: 'optionD_en',
    optiona_bn: 'optionA_bn',
    optionb_bn: 'optionB_bn',
    optionc_bn: 'optionC_bn',
    optiond_bn: 'optionD_bn',
    correctkey: 'correctKey',
    correct_key: 'correctKey',
    explanation_en: 'explanation_en',
    explanation_bn: 'explanation_bn',
    explanationimageurl: 'explanationImageUrl',
    marks: 'marks',
    negativemarks: 'negativeMarks',
    negative_marks: 'negativeMarks',
    tags: 'tags',
    sourcelabel: 'sourceLabel',
    source_label: 'sourceLabel',
    chapter: 'chapter',
    boardorpattern: 'boardOrPattern',
    board_or_pattern: 'boardOrPattern',
    yearorsession: 'yearOrSession',
    year_or_session: 'yearOrSession',
};

function applyColumnMapping(row: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [srcCol, destField] of Object.entries(mapping)) {
        if (row[srcCol] !== undefined) result[destField] = row[srcCol];
    }
    return result;
}

function autoMapColumns(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    for (const header of headers) {
        const normalized = header.toLowerCase().replace(/[\s\-]/g, '_').replace(/[^a-z0-9_]/g, '');
        if (IMPORT_COLUMN_MAP[normalized]) {
            mapping[header] = IMPORT_COLUMN_MAP[normalized];
        }
    }
    return mapping;
}

function rowToQuestion(mapped: Record<string, unknown>): Record<string, unknown> {
    const options: IBankQuestionOption[] = [];
    for (const key of ['A', 'B', 'C', 'D'] as const) {
        options.push({
            key,
            text_en: String(mapped[`option${key}_en`] || '').trim(),
            text_bn: String(mapped[`option${key}_bn`] || '').trim(),
            imageUrl: '',
        });
    }
    const tags = typeof mapped.tags === 'string'
        ? mapped.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : Array.isArray(mapped.tags)
            ? mapped.tags
            : [];
    return {
        subject: String(mapped.subject || '').trim(),
        moduleCategory: String(mapped.moduleCategory || '').trim(),
        topic: String(mapped.topic || '').trim(),
        subtopic: String(mapped.subtopic || '').trim(),
        difficulty: (['easy', 'medium', 'hard'].includes(String(mapped.difficulty || '').toLowerCase())
            ? String(mapped.difficulty).toLowerCase()
            : 'medium'),
        languageMode: (['en', 'bn', 'both'].includes(String(mapped.languageMode || '').toLowerCase())
            ? String(mapped.languageMode).toLowerCase()
            : 'en'),
        question_en: String(mapped.question_en || '').trim(),
        question_bn: String(mapped.question_bn || '').trim(),
        questionImageUrl: String(mapped.questionImageUrl || '').trim(),
        options,
        correctKey: String(mapped.correctKey || '').trim().toUpperCase(),
        explanation_en: String(mapped.explanation_en || '').trim(),
        explanation_bn: String(mapped.explanation_bn || '').trim(),
        explanationImageUrl: String(mapped.explanationImageUrl || '').trim(),
        marks: Number(mapped.marks) || 1,
        negativeMarks: Number(mapped.negativeMarks) || 0,
        tags,
        sourceLabel: String(mapped.sourceLabel || '').trim(),
        chapter: String(mapped.chapter || '').trim(),
        boardOrPattern: String(mapped.boardOrPattern || '').trim(),
        yearOrSession: String(mapped.yearOrSession || '').trim(),
    };
}

interface ImportValidationError {
    row: number;
    field: string;
    message: string;
}

function validateRow(q: Record<string, unknown>, rowIndex: number): ImportValidationError[] {
    const errors: ImportValidationError[] = [];
    if (!q.subject) errors.push({ row: rowIndex, field: 'subject', message: 'Subject is required' });
    if (!q.moduleCategory) errors.push({ row: rowIndex, field: 'moduleCategory', message: 'Module category is required' });
    if (!q.question_en && !q.question_bn) errors.push({ row: rowIndex, field: 'question', message: 'At least one question text (EN or BN) is required' });
    if (!['A', 'B', 'C', 'D'].includes(String(q.correctKey))) {
        errors.push({ row: rowIndex, field: 'correctKey', message: 'Correct key must be A, B, C, or D' });
    }
    const opts = q.options as IBankQuestionOption[];
    if (!opts || opts.length < 2) {
        errors.push({ row: rowIndex, field: 'options', message: 'At least 2 options required' });
    } else {
        const hasText = opts.filter((o) => o.text_en || o.text_bn);
        if (hasText.length < 2) {
            errors.push({ row: rowIndex, field: 'options', message: 'At least 2 options must have text' });
        }
    }
    return errors;
}

export async function importPreview(
    buffer: Buffer,
    filename: string,
    mapping?: Record<string, string>,
) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const autoMapping = mapping || autoMapColumns(headers);

    const previewRows = rawRows.slice(0, 20).map((row, i) => {
        const mapped = applyColumnMapping(row, autoMapping);
        const question = rowToQuestion(mapped);
        const errors = validateRow(question, i + 1);
        const hash = computeContentHash(question as any);
        return { rowIndex: i + 1, raw: row, mapped: question, errors, contentHash: hash };
    });

    // Check duplicates against DB
    const hashes = previewRows.map((r) => r.contentHash);
    const existingHashes = await QuestionBankQuestion.find(
        { contentHash: { $in: hashes } },
        { contentHash: 1 },
    ).lean();
    const existingSet = new Set(existingHashes.map((d) => d.contentHash));

    for (const row of previewRows) {
        if (existingSet.has(row.contentHash)) {
            row.errors.push({ row: row.rowIndex, field: 'duplicate', message: 'Duplicate question already exists in bank' });
        }
    }

    return {
        totalRows: rawRows.length,
        headers,
        mapping: autoMapping,
        preview: previewRows,
        availableColumns: Object.values(IMPORT_COLUMN_MAP),
    };
}

export async function importCommit(
    buffer: Buffer,
    filename: string,
    mapping: Record<string, string>,
    mode: 'create' | 'upsert',
    adminId: string,
) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errorRows: { row: number; reason: string; data: Record<string, unknown> }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
        const mapped = applyColumnMapping(rawRows[i], mapping);
        const question = rowToQuestion(mapped);
        const errors = validateRow(question, i + 1);

        if (errors.length > 0) {
            failed++;
            errorRows.push({ row: i + 1, reason: errors.map((e) => e.message).join('; '), data: rawRows[i] });
            continue;
        }

        const hash = computeContentHash(question as any);
        (question as any).contentHash = hash;
        (question as any).createdByAdminId = adminId;
        (question as any).updatedByAdminId = adminId;

        if (mode === 'upsert') {
            const existing = await QuestionBankQuestion.findOne({ contentHash: hash });
            if (existing) {
                Object.assign(existing, question, { updatedByAdminId: adminId });
                await existing.save();
                imported++;
                continue;
            }
        } else {
            const dup = await QuestionBankQuestion.findOne({ contentHash: hash });
            if (dup) {
                skipped++;
                continue;
            }
        }

        await QuestionBankQuestion.create(question);
        imported++;
    }

    await audit(adminId, 'qbank_import_commit', undefined, {
        filename,
        totalRows: rawRows.length,
        imported,
        skipped,
        failed,
    });

    return { totalRows: rawRows.length, imported, skipped, failed, errorRows };
}

export async function exportQuestions(
    filters: ListBankQuestionsParams,
    format: 'csv' | 'xlsx',
) {
    const result = await listBankQuestions({ ...filters, page: 1, limit: 10000 });
    const rows = result.questions.map((q: any) => ({
        subject: q.subject,
        moduleCategory: q.moduleCategory,
        topic: q.topic || '',
        subtopic: q.subtopic || '',
        difficulty: q.difficulty,
        languageMode: q.languageMode,
        question_en: q.question_en || '',
        question_bn: q.question_bn || '',
        questionImageUrl: q.questionImageUrl || '',
        optionA_en: q.options?.[0]?.text_en || '',
        optionA_bn: q.options?.[0]?.text_bn || '',
        optionB_en: q.options?.[1]?.text_en || '',
        optionB_bn: q.options?.[1]?.text_bn || '',
        optionC_en: q.options?.[2]?.text_en || '',
        optionC_bn: q.options?.[2]?.text_bn || '',
        optionD_en: q.options?.[3]?.text_en || '',
        optionD_bn: q.options?.[3]?.text_bn || '',
        correctKey: q.correctKey,
        explanation_en: q.explanation_en || '',
        explanation_bn: q.explanation_bn || '',
        explanationImageUrl: q.explanationImageUrl || '',
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        tags: (q.tags || []).join(', '),
        sourceLabel: q.sourceLabel || '',
        chapter: q.chapter || '',
        boardOrPattern: q.boardOrPattern || '',
        yearOrSession: q.yearOrSession || '',
        usageCount: q.usageCount || 0,
        accuracy: q.analytics?.accuracyPercent ?? '',
        isActive: q.isActive,
        isArchived: q.isArchived,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');

    if (format === 'csv') {
        return XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function generateImportTemplate(): Buffer {
    const headers = [
        'subject', 'moduleCategory', 'topic', 'subtopic', 'difficulty', 'languageMode',
        'question_en', 'question_bn', 'questionImageUrl',
        'optionA_en', 'optionA_bn', 'optionB_en', 'optionB_bn',
        'optionC_en', 'optionC_bn', 'optionD_en', 'optionD_bn',
        'correctKey', 'explanation_en', 'explanation_bn', 'explanationImageUrl',
        'marks', 'negativeMarks', 'tags', 'sourceLabel', 'chapter', 'boardOrPattern', 'yearOrSession',
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─── Sets / Templates ────────────────────────────────────
export async function listSets(adminId?: string) {
    const filter: Record<string, unknown> = {};
    if (adminId) filter.createdByAdminId = adminId;
    return QuestionBankSet.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getSet(id: string) {
    return QuestionBankSet.findById(id).lean();
}

export async function createSet(data: Record<string, unknown>, adminId: string) {
    const doc = await QuestionBankSet.create({ ...data, createdByAdminId: adminId });
    await audit(adminId, 'qbank_set_create', String(doc._id));
    return doc;
}

export async function updateSet(id: string, data: Record<string, unknown>, adminId: string) {
    const doc = await QuestionBankSet.findByIdAndUpdate(id, data, { new: true });
    if (doc) await audit(adminId, 'qbank_set_update', id);
    return doc;
}

export async function deleteSet(id: string, adminId: string) {
    const doc = await QuestionBankSet.findByIdAndDelete(id);
    if (doc) await audit(adminId, 'qbank_set_delete', id);
    return doc;
}

export async function resolveSetQuestions(setId: string) {
    const set = await QuestionBankSet.findById(setId).lean();
    if (!set) return null;

    if (set.mode === 'manual' && set.selectedBankQuestionIds.length > 0) {
        const ids = set.selectedBankQuestionIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        return QuestionBankQuestion.find({ _id: { $in: ids }, isArchived: false }).lean();
    }

    if (set.mode === 'rule_based' && set.rules) {
        return resolveRuleBasedQuestions(set.rules);
    }
    return [];
}

async function resolveRuleBasedQuestions(rules: ISetRules) {
    const filter: Record<string, unknown> = { isArchived: false, isActive: true };
    if (rules.subject) filter.subject = rules.subject;
    if (rules.moduleCategory) filter.moduleCategory = rules.moduleCategory;
    if (rules.topics && rules.topics.length > 0) filter.topic = { $in: rules.topics };
    if (rules.tags && rules.tags.length > 0) filter.tags = { $in: rules.tags };

    const mix = rules.difficultyMix || { easy: 0, medium: 0, hard: 0 };
    const total = rules.totalQuestions || (mix.easy + mix.medium + mix.hard) || 25;

    if (mix.easy > 0 || mix.medium > 0 || mix.hard > 0) {
        const [easy, medium, hard] = await Promise.all([
            mix.easy > 0
                ? QuestionBankQuestion.aggregate([
                    { $match: { ...filter, difficulty: 'easy' } },
                    { $sample: { size: mix.easy } },
                ])
                : [],
            mix.medium > 0
                ? QuestionBankQuestion.aggregate([
                    { $match: { ...filter, difficulty: 'medium' } },
                    { $sample: { size: mix.medium } },
                ])
                : [],
            mix.hard > 0
                ? QuestionBankQuestion.aggregate([
                    { $match: { ...filter, difficulty: 'hard' } },
                    { $sample: { size: mix.hard } },
                ])
                : [],
        ]);
        return [...easy, ...medium, ...hard];
    }

    return QuestionBankQuestion.aggregate([
        { $match: filter },
        { $sample: { size: total } },
    ]);
}

// ─── Exam Integration ────────────────────────────────────
export async function searchBankQuestionsForExam(
    examId: string,
    params: ListBankQuestionsParams,
): Promise<any> {
    // Exclude already-attached questions
    const attached = await ExamQuestionModel.find({ examId }, { fromBankQuestionId: 1 }).lean();
    const attachedIds = attached
        .map((a: any) => a.fromBankQuestionId)
        .filter(Boolean);

    const result = await listBankQuestions(params);
    if (attachedIds.length > 0) {
        result.questions = result.questions.filter(
            (q: any) => !attachedIds.includes(String(q._id)),
        );
    }
    return result;
}

export async function attachBankQuestionsToExam(
    examId: string,
    bankQuestionIds: string[],
    adminId: string,
) {
    const questions = await QuestionBankQuestion.find({
        _id: { $in: bankQuestionIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) },
        isArchived: false,
    }).lean();

    const existingCount = await ExamQuestionModel.countDocuments({ examId });
    const docs = questions.map((q: any, i: number) => ({
        examId,
        fromBankQuestionId: String(q._id),
        orderIndex: existingCount + i + 1,
        question_en: q.question_en,
        question_bn: q.question_bn,
        questionImageUrl: q.questionImageUrl,
        options: q.options,
        correctKey: q.correctKey,
        explanation_en: q.explanation_en,
        explanation_bn: q.explanation_bn,
        explanationImageUrl: q.explanationImageUrl,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        topic: q.topic,
        difficulty: q.difficulty,
        tags: q.tags,
    }));

    const created = await ExamQuestionModel.insertMany(docs);
    await audit(adminId, 'qbank_exam_attach', examId, {
        bankQuestionIds,
        attachedCount: created.length,
    });
    return created;
}

export async function removeBankQuestionFromExam(
    examId: string,
    examQuestionId: string,
    adminId: string,
) {
    const result = await ExamQuestionModel.findOneAndDelete({
        _id: examQuestionId,
        examId,
    });
    if (result) {
        await audit(adminId, 'qbank_exam_remove', examId, { examQuestionId });
    }
    return result;
}

export async function reorderExamQuestions(
    examId: string,
    orderMap: { id: string; orderIndex: number }[],
    adminId: string,
) {
    const ops = orderMap.map((item) => ({
        updateOne: {
            filter: { _id: item.id, examId },
            update: { $set: { orderIndex: item.orderIndex } },
        },
    }));
    await ExamQuestionModel.bulkWrite(ops);
    await audit(adminId, 'qbank_exam_reorder', examId);
    return ExamQuestionModel.find({ examId }).sort({ orderIndex: 1 }).lean();
}

export async function finalizeExamSnapshot(examId: string, adminId: string) {
    const examQuestions = await ExamQuestionModel.find({ examId }).lean();
    const bankLinked = examQuestions.filter((eq: any) => eq.fromBankQuestionId);

    // Create usage records
    const usageDocs = bankLinked.map((eq: any) => ({
        bankQuestionId: new mongoose.Types.ObjectId(eq.fromBankQuestionId),
        examId,
        usedAtUTC: new Date(),
        snapshotQuestionId: String(eq._id),
    }));

    if (usageDocs.length > 0) {
        await QuestionBankUsage.insertMany(usageDocs, { ordered: false }).catch(() => { });
    }

    await audit(adminId, 'qbank_exam_finalize', examId, {
        totalQuestions: examQuestions.length,
        bankLinked: bankLinked.length,
    });

    return { totalQuestions: examQuestions.length, bankLinked: bankLinked.length };
}

// ─── Analytics ───────────────────────────────────────────
export async function getAnalytics(params: {
    subject?: string;
    moduleCategory?: string;
    topic?: string;
    examId?: string;
    groupId?: string;
}) {
    const questionFilter: Record<string, unknown> = { isArchived: false };
    if (params.subject) questionFilter.subject = params.subject;
    if (params.moduleCategory) questionFilter.moduleCategory = params.moduleCategory;
    if (params.topic) questionFilter.topic = { $regex: params.topic, $options: 'i' };

    // 1. Aggregate counts by dimension
    const [bySubject, byCategory, byTopic, byDifficulty] = await Promise.all([
        QuestionBankQuestion.aggregate([
            { $match: questionFilter },
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        QuestionBankQuestion.aggregate([
            { $match: questionFilter },
            { $group: { _id: '$moduleCategory', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        QuestionBankQuestion.aggregate([
            { $match: questionFilter },
            { $group: { _id: '$topic', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 50 },
        ]),
        QuestionBankQuestion.aggregate([
            { $match: questionFilter },
            { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        ]),
    ]);

    // 2. Most used questions
    const mostUsed = await QuestionBankUsage.aggregate([
        { $group: { _id: '$bankQuestionId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        {
            $lookup: {
                from: 'question_bank_questions',
                localField: '_id',
                foreignField: '_id',
                as: 'question',
            },
        },
        { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
    ]);

    // 3. Low accuracy / high skip (from precomputed analytics)
    const [lowAccuracy, highSkip, neverUsed] = await Promise.all([
        QuestionBankAnalytics.find({ totalAppearances: { $gte: 5 } })
            .sort({ accuracyPercent: 1 })
            .limit(20)
            .lean(),
        QuestionBankAnalytics.find({ totalAppearances: { $gte: 5 } })
            .sort({ totalSkipped: -1 })
            .limit(20)
            .lean(),
        QuestionBankQuestion.find({
            ...questionFilter,
            _id: {
                $nin: await QuestionBankUsage.distinct('bankQuestionId'),
            },
        })
            .limit(20)
            .lean(),
    ]);

    // 4. Topic weakness heatmap: accuracy by topic
    const topicPerformance = await QuestionBankAnalytics.aggregate([
        {
            $lookup: {
                from: 'question_bank_questions',
                localField: 'bankQuestionId',
                foreignField: '_id',
                as: 'question',
            },
        },
        { $unwind: '$question' },
        {
            $group: {
                _id: { subject: '$question.subject', topic: '$question.topic' },
                avgAccuracy: { $avg: '$accuracyPercent' },
                totalQuestions: { $sum: 1 },
                totalAttempts: { $sum: '$totalAppearances' },
            },
        },
        { $sort: { avgAccuracy: 1 } },
    ]);

    return {
        summary: {
            bySubject,
            byCategory,
            byTopic,
            byDifficulty,
            totalQuestions: await QuestionBankQuestion.countDocuments(questionFilter),
            totalActive: await QuestionBankQuestion.countDocuments({ ...questionFilter, isActive: true }),
            totalArchived: await QuestionBankQuestion.countDocuments({ ...questionFilter, isArchived: true }),
        },
        mostUsed,
        lowAccuracy,
        highSkip,
        neverUsed,
        topicPerformance,
    };
}

export async function refreshAnalyticsForQuestion(bankQuestionId: string) {
    // Find all exam_questions that reference this bank question
    const snapshots = await ExamQuestionModel.find({ fromBankQuestionId: bankQuestionId }).lean();
    if (snapshots.length === 0) return null;

    const snapshotIds = snapshots.map((s: any) => String(s._id));
    const examIds = [...new Set(snapshots.map((s: any) => s.examId))];

    // Get all answers for these questions
    const answers = await AnswerModel.find({
        questionId: { $in: snapshotIds },
        examId: { $in: examIds },
    }).lean();

    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSkipped = 0;

    // Build correctKey map from snapshots
    const correctKeyMap = new Map<string, string>();
    for (const snap of snapshots) {
        correctKeyMap.set(String((snap as any)._id), (snap as any).correctKey);
    }

    for (const answer of answers) {
        const correctKey = correctKeyMap.get(String((answer as any).questionId));
        if (!answer.selectedKey) {
            totalSkipped++;
        } else if (answer.selectedKey === correctKey) {
            totalCorrect++;
        } else {
            totalWrong++;
        }
    }

    const totalAppearances = totalCorrect + totalWrong + totalSkipped;
    const accuracyPercent = totalAppearances > 0
        ? Math.round((totalCorrect / totalAppearances) * 10000) / 100
        : 0;

    const updated = await QuestionBankAnalytics.findOneAndUpdate(
        { bankQuestionId: new mongoose.Types.ObjectId(bankQuestionId) },
        {
            $set: {
                totalAppearances,
                totalCorrect,
                totalWrong,
                totalSkipped,
                accuracyPercent,
                lastUpdatedAtUTC: new Date(),
            },
        },
        { upsert: true, new: true },
    );

    return updated;
}

// ─── Bulk Analytics Refresh (cron-friendly) ──────────────
export async function refreshAllAnalytics() {
    const allBankIds = await QuestionBankUsage.distinct('bankQuestionId');
    let refreshed = 0;
    for (const bankId of allBankIds) {
        await refreshAnalyticsForQuestion(String(bankId));
        refreshed++;
    }
    return { refreshed };
}

// ─── Bulk actions ────────────────────────────────────────
export async function bulkArchive(ids: string[], adminId: string) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await QuestionBankQuestion.updateMany(
        { _id: { $in: validIds } },
        { $set: { isArchived: true, isActive: false, updatedByAdminId: adminId } },
    );
    await audit(adminId, 'qbank_bulk_archive', undefined, { ids: validIds, modified: result.modifiedCount });
    return result;
}

export async function bulkActivate(ids: string[], active: boolean, adminId: string) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await QuestionBankQuestion.updateMany(
        { _id: { $in: validIds } },
        { $set: { isActive: active, updatedByAdminId: adminId } },
    );
    await audit(adminId, 'qbank_bulk_activate', undefined, { ids: validIds, active, modified: result.modifiedCount });
    return result;
}

export async function bulkUpdateTags(ids: string[], tags: string[], mode: 'add' | 'set', adminId: string) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const update = mode === 'add'
        ? { $addToSet: { tags: { $each: tags } }, $set: { updatedByAdminId: adminId } }
        : { $set: { tags, updatedByAdminId: adminId } };
    const result = await QuestionBankQuestion.updateMany({ _id: { $in: validIds } }, update);
    await audit(adminId, 'qbank_bulk_tags', undefined, { ids: validIds, tags, mode, modified: result.modifiedCount });
    return result;
}

export async function bulkDelete(ids: string[], adminId: string) {
    const settings = await getSettings();
    if (settings.archiveInsteadOfDelete) {
        return bulkArchive(ids, adminId);
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    // Cascade: for each question, remove linked ExamQuestions and recalculate Exam totals
    const questionIdStrings = validIds.map((id) => id.toString());

    // Get all affected exam IDs BEFORE deleting ExamQuestions
    const affectedExamIds = await ExamQuestionModel.distinct('examId', {
        fromBankQuestionId: { $in: questionIdStrings },
    });

    // Remove all ExamQuestion records referencing any of the deleted bank questions
    await ExamQuestionModel.deleteMany({ fromBankQuestionId: { $in: questionIdStrings } });

    // Recalculate totalQuestions and totalMarks for each affected exam
    for (const examId of affectedExamIds) {
        const remaining = await ExamQuestionModel.find({ examId });
        await Exam.findByIdAndUpdate(examId, {
            totalQuestions: remaining.length,
            totalMarks: remaining.reduce((sum: number, q: any) => sum + (q.marks || 0), 0),
        });
    }

    // Delete the bank questions themselves
    const result = await QuestionBankQuestion.deleteMany({ _id: { $in: validIds } });
    await audit(adminId, 'qbank_bulk_delete', undefined, {
        ids: validIds,
        deleted: result.deletedCount,
        cascadeExamIds: affectedExamIds,
    });
    return result;
}

// ─── PDF Export ──────────────────────────────────────────
export async function exportQuestionsPdf(filters: ListBankQuestionsParams): Promise<PDFKit.PDFDocument> {
    const result = await listBankQuestions({ ...filters, page: 1, limit: 10000 });
    const questions = result.questions;

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Question Bank Export', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Total Questions: ${questions.length}  |  Generated: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
    doc.moveDown(1);

    const difficultyLabel: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i] as any;

        // Check if we need a new page (leave room for at least a card header)
        if (doc.y > 680) doc.addPage();

        // Card header line
        doc.fontSize(12).font('Helvetica-Bold')
            .text(`Q${i + 1}.`, { continued: true })
            .font('Helvetica')
            .text(`  [${q.subject || 'N/A'}]  [${difficultyLabel[q.difficulty] || q.difficulty}]`);
        doc.moveDown(0.3);

        // Question text (en)
        if (q.question_en) {
            doc.fontSize(11).font('Helvetica-Bold').text('EN: ', { continued: true })
                .font('Helvetica').text(q.question_en);
        }
        // Question text (bn)
        if (q.question_bn) {
            doc.fontSize(11).font('Helvetica-Bold').text('BN: ', { continued: true })
                .font('Helvetica').text(q.question_bn);
        }
        doc.moveDown(0.3);

        // Options
        if (q.options && q.options.length > 0) {
            for (const opt of q.options) {
                const isCorrect = opt.key === q.correctKey;
                const prefix = isCorrect ? `✓ ${opt.key})` : `  ${opt.key})`;
                const optText = [opt.text_en, opt.text_bn].filter(Boolean).join(' / ');
                doc.fontSize(10).font(isCorrect ? 'Helvetica-Bold' : 'Helvetica')
                    .text(`${prefix} ${optText}`);
            }
        }
        doc.moveDown(0.3);

        // Correct answer
        doc.fontSize(10).font('Helvetica-Bold').text(`Correct Answer: ${q.correctKey}`);

        // Explanation
        const explanation = q.explanation_en || q.explanation_bn;
        if (explanation) {
            doc.fontSize(10).font('Helvetica-Bold').text('Explanation: ', { continued: true })
                .font('Helvetica').text(explanation);
        }

        // Separator
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
        doc.moveDown(0.5);
    }

    return doc;
}

export async function bulkCopy(ids: string[], adminId: string) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const sources = await QuestionBankQuestion.find({
        _id: { $in: validIds },
        isActive: true,
        isArchived: false,
    }).lean();

    if (sources.length !== validIds.length) {
        const foundIds = new Set(sources.map((s: any) => String(s._id)));
        const missing = validIds.filter((id) => !foundIds.has(id));
        throw new Error(`Some question IDs not found or inactive: ${missing.join(', ')}`);
    }

    const newQuestions = [];
    for (const src of sources) {
        const { _id, bankQuestionId, createdAt, updatedAt, ...rest } = src as any;
        const copyData = {
            ...rest,
            bankQuestionId: undefined,
            question_en: (rest.question_en || '') ? `${rest.question_en} (Copy)` : '',
            question_bn: (rest.question_bn || '') ? `${rest.question_bn} (Copy)` : '',
            versionNo: 1,
            parentQuestionId: null,
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
        };
        copyData.contentHash = computeContentHash(copyData);
        const doc = await QuestionBankQuestion.create(copyData);
        newQuestions.push(doc);
    }

    await audit(adminId, 'qbank_bulk_copy', undefined, {
        sourceIds: validIds,
        copied: newQuestions.length,
    });

    return { copied: newQuestions.length, newQuestions };
}
