import { Response } from 'express';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import Question from '../models/Question';
import QuestionRevision from '../models/QuestionRevision';
import QuestionMedia from '../models/QuestionMedia';
import QuestionImportJob from '../models/QuestionImportJob';
import AuditLog from '../models/AuditLog';
import Exam from '../models/Exam';
import { ExamQuestionModel } from '../models/examQuestion.model';
import QuestionBankSettings from '../models/QuestionBankSettings';
import { getSignedUploadForBanner } from '../services/uploadProvider';
import {
    computeQualityScore,
    detectSimilarQuestions,
    normalizeQuestionPayload,
    sanitizeRichHtml,
    validateImageUrl,
    validateQuestionPayload,
} from '../utils/questionBank';
import { escapeRegex } from '../utils/escapeRegex';

type QBankAction = 'create' | 'edit' | 'delete' | 'approve' | 'bulk_import' | 'export' | 'lock';

const DEFAULT_SIMILARITY_THRESHOLD = 0.84;
const MAX_IMPORT_PREVIEW_ROWS = 10000;

function boolFromQuery(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return undefined;
}

function parseCsvList(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function toSafeObject(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input as Record<string, unknown>;
}

function buildLegacyCompatibilityPayload(normalized: ReturnType<typeof normalizeQuestionPayload>['normalized']) {
    return {
        ...normalized,
        class: normalized.class_level,
        questionImage: normalized.questionImage || undefined,
        active: normalized.status !== 'archived',
    };
}

function buildLocalizedCompatibilityPayload(normalized: ReturnType<typeof normalizeQuestionPayload>['normalized']) {
    const optionsLocalized = Array.isArray(normalized.optionsLocalized) && normalized.optionsLocalized.length > 0
        ? normalized.optionsLocalized
        : normalized.options.map((option) => ({
            key: option.key,
            text: { en: option.text, bn: '' },
            media_id: option.media_id || null,
        }));

    return {
        questionText: normalized.questionText || { en: normalized.question_text || normalized.question, bn: '' },
        optionsLocalized,
        explanationText: normalized.explanationText || { en: normalized.explanation_text || normalized.explanation, bn: '' },
        languageMode: normalized.languageMode || 'EN',
    };
}

function questionPermissionFromToken(req: AuthRequest, action: QBankAction): boolean {
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'superadmin') return true;

    const roleAllow: Record<QBankAction, string[]> = {
        create: ['admin', 'moderator', 'editor'],
        edit: ['admin', 'moderator', 'editor'],
        delete: ['admin', 'moderator'],
        approve: ['admin', 'moderator'],
        bulk_import: ['admin', 'moderator'],
        export: ['admin', 'moderator', 'editor'],
        lock: ['admin', 'moderator'],
    };

    if (roleAllow[action]?.includes(role)) {
        const perms = toSafeObject(req.user?.permissions);
        if (action === 'create' || action === 'edit' || action === 'bulk_import' || action === 'lock') {
            if (typeof perms.canEditExams === 'boolean') return Boolean(perms.canEditExams);
        }
        if (action === 'delete') {
            if (typeof perms.canDeleteData === 'boolean') return Boolean(perms.canDeleteData);
        }
        if (action === 'export') {
            if (typeof perms.canViewReports === 'boolean') return Boolean(perms.canViewReports);
        }
        return true;
    }

    const explicitPerms = toSafeObject(req.user?.permissions);
    const keyMap: Record<QBankAction, string> = {
        create: 'questionCreate',
        edit: 'questionEdit',
        delete: 'questionDelete',
        approve: 'questionApprove',
        bulk_import: 'questionBulkImport',
        export: 'questionExport',
        lock: 'questionLock',
    };
    const explicit = explicitPerms[keyMap[action]];
    return explicit === true;
}

function getCapabilities(req: AuthRequest): Record<string, boolean> {
    return {
        questionCreate: questionPermissionFromToken(req, 'create'),
        questionEdit: questionPermissionFromToken(req, 'edit'),
        questionDelete: questionPermissionFromToken(req, 'delete'),
        questionApprove: questionPermissionFromToken(req, 'approve'),
        questionBulkImport: questionPermissionFromToken(req, 'bulk_import'),
        questionExport: questionPermissionFromToken(req, 'export'),
        questionLock: questionPermissionFromToken(req, 'lock'),
    };
}

async function createAudit(
    req: AuthRequest,
    action: string,
    targetId?: string | string[],
    details?: Record<string, unknown>,
): Promise<void> {
    if (!req.user?._id || !mongoose.Types.ObjectId.isValid(req.user._id)) return;
    const normalizedTargetId = Array.isArray(targetId) ? targetId[0] : targetId;
    await AuditLog.create({
        actor_id: req.user._id,
        actor_role: req.user.role,
        action,
        target_id: normalizedTargetId && mongoose.Types.ObjectId.isValid(normalizedTargetId) ? normalizedTargetId : undefined,
        target_type: 'question_bank',
        ip_address: req.ip,
        details: details || {},
    });
}

async function createQuestionRevision(
    questionId: string,
    snapshot: Record<string, unknown>,
    changedBy?: string,
): Promise<mongoose.Types.ObjectId> {
    const latest = await QuestionRevision.findOne({ questionId }).sort({ revisionNo: -1 }).lean();
    const nextRevisionNo = Number(latest?.revisionNo || 0) + 1;
    const revision = await QuestionRevision.create({
        questionId,
        revisionNo: nextRevisionNo,
        snapshot,
        changedBy: changedBy && mongoose.Types.ObjectId.isValid(changedBy) ? changedBy : undefined,
        changedAt: new Date(),
    });
    return revision._id as mongoose.Types.ObjectId;
}

async function notifyQBankWebhook(eventType: 'approved' | 'rejected', payload: Record<string, unknown>): Promise<void> {
    const webhookUrl = String(process.env.QBANK_APPROVAL_WEBHOOK_URL || '').trim();
    if (!webhookUrl) return;

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event: eventType, ...payload }),
        });

        if (!response.ok) {
            console.warn('[qbank-webhook] failed', { status: response.status, webhookUrl });
        }
    } catch (error) {
        console.warn('[qbank-webhook] request error', error);
    }
}

function buildFilter(query: Record<string, unknown>): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.subject) filter.subject = String(query.subject).trim();
    if (query.chapter) filter.chapter = String(query.chapter).trim();
    if (query.difficulty) filter.difficulty = String(query.difficulty).trim().toLowerCase();
    if (query.status) filter.status = String(query.status).trim().toLowerCase();
    if (query.class_level || query.class) filter.class_level = String(query.class_level || query.class).trim();
    if (query.department) filter.department = String(query.department).trim();
    if (query.created_by && mongoose.Types.ObjectId.isValid(String(query.created_by))) {
        filter.created_by = String(query.created_by);
    }

    const tags = parseCsvList(query.tags);
    if (tags.length > 0) filter.tags = { $in: tags };

    const hasImage = boolFromQuery(query.has_image);
    if (hasImage === true) {
        filter.$or = [
            { image_media_id: { $ne: null } },
            { questionImage: { $exists: true, $ne: '' } },
        ];
    }
    if (hasImage === false) {
        filter.$and = [
            { $or: [{ image_media_id: null }, { image_media_id: { $exists: false } }] },
            { $or: [{ questionImage: '' }, { questionImage: { $exists: false } }] },
        ];
    }

    const hasExplanation = boolFromQuery(query.has_explanation);
    if (hasExplanation === true) {
        filter.$or = [
            ...((filter.$or as Record<string, unknown>[]) || []),
            { explanation_text: { $exists: true, $ne: '' } },
            { explanation: { $exists: true, $ne: '' } },
            { 'explanationText.en': { $exists: true, $ne: '' } },
            { 'explanationText.bn': { $exists: true, $ne: '' } },
        ];
    }
    if (hasExplanation === false) {
        filter.$and = [
            ...((filter.$and as Record<string, unknown>[]) || []),
            {
                $or: [
                    { explanation_text: { $exists: false } },
                    { explanation_text: '' },
                ],
            },
            {
                $or: [
                    { explanation: { $exists: false } },
                    { explanation: '' },
                ],
            },
        ];
    }

    const search = String(query.search || '').trim();
    if (search) {
        const safeSearch = escapeRegex(search);
        filter.$or = [
            ...((filter.$or as Record<string, unknown>[]) || []),
            { question: { $regex: safeSearch, $options: 'i' } },
            { question_text: { $regex: safeSearch, $options: 'i' } },
            { 'questionText.en': { $regex: safeSearch, $options: 'i' } },
            { 'questionText.bn': { $regex: safeSearch, $options: 'i' } },
            { 'optionsLocalized.text.en': { $regex: safeSearch, $options: 'i' } },
            { 'optionsLocalized.text.bn': { $regex: safeSearch, $options: 'i' } },
            { 'explanationText.en': { $regex: safeSearch, $options: 'i' } },
            { 'explanationText.bn': { $regex: safeSearch, $options: 'i' } },
            { subject: { $regex: safeSearch, $options: 'i' } },
            { chapter: { $regex: safeSearch, $options: 'i' } },
            { tags: { $elemMatch: { $regex: safeSearch, $options: 'i' } } },
        ];
    }

    const minScore = Number(query.quality_score_min ?? query.qualityMin);
    const maxScore = Number(query.quality_score_max ?? query.qualityMax);
    if (Number.isFinite(minScore) || Number.isFinite(maxScore)) {
        filter.quality_score = {};
        if (Number.isFinite(minScore)) (filter.quality_score as Record<string, unknown>).$gte = minScore;
        if (Number.isFinite(maxScore)) (filter.quality_score as Record<string, unknown>).$lte = maxScore;
    }

    return filter;
}

async function computeFacets(baseFilter: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [subjects, chapters, tags, statuses, difficulty, qualityRange] = await Promise.all([
        Question.distinct('subject', baseFilter),
        Question.distinct('chapter', baseFilter),
        Question.distinct('tags', baseFilter),
        Question.distinct('status', baseFilter),
        Question.distinct('difficulty', baseFilter),
        Question.aggregate([
            { $match: baseFilter },
            { $group: { _id: null, min: { $min: '$quality_score' }, max: { $max: '$quality_score' } } },
        ]),
    ]);

    return {
        subjects: subjects.filter(Boolean),
        chapters: chapters.filter(Boolean),
        tags: tags.filter(Boolean),
        statuses: statuses.filter(Boolean),
        difficulty: difficulty.filter(Boolean),
        qualityRange: {
            min: Number(qualityRange[0]?.min || 0),
            max: Number(qualityRange[0]?.max || 100),
        },
    };
}

function applyColumnMapping(
    row: Record<string, unknown>,
    mapping: Record<string, string>,
): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(mapping || {})) {
        mapped[target] = row[source];
    }
    return mapped;
}

async function parseImportRows(req: AuthRequest): Promise<{ rows: Array<Record<string, unknown>>; sourceFileName: string }> {
    const payload = req.body as Record<string, unknown>;

    if (Array.isArray(payload.questions)) {
        return {
            rows: payload.questions.map((row) => toSafeObject(row)).slice(0, MAX_IMPORT_PREVIEW_ROWS),
            sourceFileName: String(payload.sourceFileName || 'mapped-questions.json'),
        };
    }

    if (Array.isArray(payload.rows)) {
        const rows = payload.rows.map((row) => toSafeObject(row));
        const mapping = toSafeObject(payload.mapping) as Record<string, string>;
        const mappedRows = Object.keys(mapping).length
            ? rows.map((row) => ({ ...row, ...applyColumnMapping(row, mapping) }))
            : rows;
        return {
            rows: mappedRows.slice(0, MAX_IMPORT_PREVIEW_ROWS),
            sourceFileName: String(payload.sourceFileName || 'rows.json'),
        };
    }

    if (!req.file?.buffer) {
        throw new Error('No import rows found');
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, unknown>>;
    return {
        rows: rows.slice(0, MAX_IMPORT_PREVIEW_ROWS),
        sourceFileName: req.file.originalname || 'upload.xlsx',
    };
}

async function isQuestionUsedInPublishedExam(question: { exam?: unknown }): Promise<boolean> {
    if (!question?.exam || !mongoose.Types.ObjectId.isValid(String(question.exam))) return false;
    const exam = await Exam.findById(String(question.exam)).select('isPublished status').lean();
    return Boolean(exam?.isPublished || exam?.status === 'live' || exam?.status === 'scheduled');
}

export async function getQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const filter = buildFilter(req.query as Record<string, unknown>);
        const page = Math.max(1, Number((req.query.page as string) || 1));
        const limit = Math.min(200, Math.max(1, Number((req.query.limit as string) || 20)));
        const skip = (page - 1) * limit;

        const sortBy = String(req.query.sortBy || 'updatedAt');
        const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
        const sort: Record<string, 1 | -1> = { [sortBy]: sortDir };

        const [questions, total, facets] = await Promise.all([
            Question.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            Question.countDocuments(filter),
            computeFacets(filter),
        ]);

        res.json({
            questions,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            facets,
            capabilities: getCapabilities(req),
        });
    } catch (err) {
        console.error('getQuestions error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getQuestionById(req: AuthRequest, res: Response): Promise<void> {
    try {
        const question = await Question.findById(req.params.id).lean();
        if (!question) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }

        const revisions = await QuestionRevision.find({ questionId: req.params.id })
            .sort({ revisionNo: -1 })
            .limit(20)
            .lean();

        res.json({ question, revisions, capabilities: getCapabilities(req) });
    } catch (err) {
        console.error('getQuestionById error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function createQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'create')) {
            res.status(403).json({ message: 'Permission denied: question:create' });
            return;
        }

        const payload = toSafeObject(req.body);

        // Validate question payload against business rules (Requirements 1.9, 1.10, 3.2)
        const validation = validateQuestionPayload(payload);
        if (!validation.valid) {
            res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
            return;
        }

        const defaultStatus = String(payload.default_status || process.env.QBANK_DEFAULT_STATUS || 'draft').trim().toLowerCase();
        const fallbackStatus = defaultStatus === 'pending_review' ? 'pending_review' : 'draft';
        const { normalized, errors } = normalizeQuestionPayload(payload, fallbackStatus);

        if (payload.question_html) {
            normalized.question_html = sanitizeRichHtml(payload.question_html);
        }

        if (errors.length > 0) {
            res.status(400).json({ message: errors[0], errors });
            return;
        }

        const recentCandidates = await Question.find({ status: { $ne: 'archived' } })
            .select('_id question question_text options optionA optionB optionC optionD')
            .sort({ updatedAt: -1 })
            .limit(300)
            .lean();

        const threshold = Number(payload.duplicate_threshold || process.env.QBANK_DUPLICATE_THRESHOLD || DEFAULT_SIMILARITY_THRESHOLD);
        const duplicateMatches = detectSimilarQuestions(
            { question: normalized.question, options: normalized.options },
            recentCandidates as Array<{ _id: unknown; question?: string; question_text?: string; options?: Array<{ key: string; text: string }>; optionA?: string; optionB?: string; optionC?: string; optionD?: string }>,
            Number.isFinite(threshold) ? threshold : DEFAULT_SIMILARITY_THRESHOLD,
        );

        const flaggedDuplicate = duplicateMatches.length > 0;
        const quality = computeQualityScore({
            ...normalized,
            flagged_duplicate: flaggedDuplicate,
            usage_count: 0,
            avg_correct_pct: null,
        });

        const questionData = {
            ...buildLegacyCompatibilityPayload(normalized),
            ...buildLocalizedCompatibilityPayload(normalized),
            quality_score: quality.score,
            quality_flags: quality.flags,
            flagged_duplicate: flaggedDuplicate,
            duplicate_of_ids: duplicateMatches.slice(0, 5).map((match) => new mongoose.Types.ObjectId(match.questionId)),
            revision_no: 1,
            created_by: req.user?._id,
            last_edited_by: req.user?._id,
        };

        const newQuestion = await Question.create(questionData);
        const revisionId = await createQuestionRevision(
            String(newQuestion._id),
            newQuestion.toObject() as unknown as Record<string, unknown>,
            String(req.user?._id || ''),
        );

        await Question.findByIdAndUpdate(newQuestion._id, { previous_revision_id: revisionId, revision_no: 1 });
        await createAudit(req, 'qbank_question_created', String(newQuestion._id), {
            status: questionData.status,
            quality_score: quality.score,
            flagged_duplicate: flaggedDuplicate,
            duplicateMatches: duplicateMatches.slice(0, 3),
        });

        const warning = flaggedDuplicate ? '????????? ?????? ?????? ??? ????? — ??????? ??? ???' : undefined;
        res.status(201).json({
            message: 'Question created successfully',
            warning,
            question: await Question.findById(newQuestion._id).lean(),
            duplicateMatches,
        });
    } catch (err) {
        console.error('createQuestion error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function updateQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'edit')) {
            res.status(403).json({ message: 'Permission denied: question:edit' });
            return;
        }

        const existing = await Question.findById(req.params.id);
        if (!existing) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }

        if (existing.locked) {
            res.status(409).json({ message: 'Question is locked and cannot be edited.' });
            return;
        }

        const payload = { ...toSafeObject(req.body), question: req.body?.question ?? existing.question };

        // Validate question payload against business rules (Requirements 1.9, 1.10, 3.2)
        const validation = validateQuestionPayload(payload as Record<string, unknown>);
        if (!validation.valid) {
            res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
            return;
        }

        const { normalized, errors } = normalizeQuestionPayload(payload as Record<string, unknown>, existing.status || 'draft');
        if (errors.length > 0) {
            res.status(400).json({ message: errors[0], errors });
            return;
        }

        const recentCandidates = await Question.find({ _id: { $ne: existing._id }, status: { $ne: 'archived' } })
            .select('_id question question_text options optionA optionB optionC optionD')
            .sort({ updatedAt: -1 })
            .limit(300)
            .lean();

        const threshold = Number(req.body?.duplicate_threshold || process.env.QBANK_DUPLICATE_THRESHOLD || DEFAULT_SIMILARITY_THRESHOLD);
        const duplicateMatches = detectSimilarQuestions(
            { question: normalized.question, options: normalized.options },
            recentCandidates as Array<{ _id: unknown; question?: string; question_text?: string; options?: Array<{ key: string; text: string }>; optionA?: string; optionB?: string; optionC?: string; optionD?: string }>,
            Number.isFinite(threshold) ? threshold : DEFAULT_SIMILARITY_THRESHOLD,
        );
        const flaggedDuplicate = duplicateMatches.length > 0;

        const quality = computeQualityScore({
            ...normalized,
            flagged_duplicate: flaggedDuplicate,
            usage_count: Number(existing.usage_count || existing.totalAttempted || 0),
            avg_correct_pct: existing.avg_correct_pct,
        });

        const priorSnapshot = existing.toObject() as unknown as Record<string, unknown>;
        const previousRevisionId = await createQuestionRevision(
            String(existing._id),
            priorSnapshot,
            String(req.user?._id || ''),
        );

        existing.set({
            ...buildLegacyCompatibilityPayload(normalized),
            ...buildLocalizedCompatibilityPayload(normalized),
            quality_score: quality.score,
            quality_flags: quality.flags,
            flagged_duplicate: flaggedDuplicate,
            duplicate_of_ids: duplicateMatches.slice(0, 5).map((match) => new mongoose.Types.ObjectId(match.questionId)),
            revision_no: Number(existing.revision_no || 1) + 1,
            previous_revision_id: previousRevisionId,
            last_edited_by: req.user?._id,
            updatedAt: new Date(),
        });

        await existing.save();

        await createAudit(req, 'qbank_question_updated', String(existing._id), {
            revision_no: existing.revision_no,
            quality_score: quality.score,
            flagged_duplicate: flaggedDuplicate,
        });

        const warning = flaggedDuplicate ? '????????? ?????? ?????? ??? ????? — ??????? ??? ???' : undefined;
        res.json({
            message: 'Question updated successfully',
            warning,
            question: await Question.findById(existing._id).lean(),
            duplicateMatches,
        });
    } catch (err) {
        console.error('updateQuestion error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function deleteQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'delete')) {
            res.status(403).json({ message: 'Permission denied: question:delete' });
            return;
        }

        const existing = await Question.findById(req.params.id);
        if (!existing) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }

        // Check if archive-instead-of-delete setting is enabled
        const settings = await QuestionBankSettings.findOne();

        if (settings?.archiveInsteadOfDelete) {
            // Soft delete: archive the question instead of removing it
            existing.status = 'archived';
            existing.active = false;
            existing.archived_at = new Date();
            existing.archived_by = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)
                ? new mongoose.Types.ObjectId(req.user._id)
                : null;
            await existing.save();

            await createAudit(req, 'qbank_question_archived', req.params.id, { softDelete: true, archiveInsteadOfDelete: true });
            res.json({ message: 'Question archived successfully', question: existing });
            return;
        }

        // Hard delete with cascade
        const questionId = existing._id.toString();

        // IMPORTANT: Get affected exam IDs BEFORE deleting ExamQuestions
        const affectedExamIds = await ExamQuestionModel.distinct('examId', {
            fromBankQuestionId: questionId,
        });

        // Remove all ExamQuestion records referencing this bank question
        await ExamQuestionModel.deleteMany({ fromBankQuestionId: questionId });

        // Recalculate totalQuestions and totalMarks for each affected exam
        for (const examId of affectedExamIds) {
            const remaining = await ExamQuestionModel.find({ examId });
            await Exam.findByIdAndUpdate(examId, {
                totalQuestions: remaining.length,
                totalMarks: remaining.reduce((sum: number, q: any) => sum + (q.marks || 0), 0),
            });
        }

        // Delete the bank question itself
        await existing.deleteOne();

        await createAudit(req, 'qbank_question_deleted', req.params.id, {
            hardDelete: true,
            cascadeExamIds: affectedExamIds,
        });
        res.json({ message: 'Question deleted successfully' });
    } catch (err) {
        console.error('deleteQuestion error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function approveQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'approve')) {
            res.status(403).json({ message: 'Permission denied: question:approve' });
            return;
        }

        const question = await Question.findById(req.params.id);
        if (!question) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }

        const action = String(req.body?.action || 'approve').trim().toLowerCase();
        const reason = String(req.body?.reason || '').trim();
        const publishStatus = action === 'reject' ? 'rejected' : 'approved';

        const strictMediaApproval = String(process.env.QBANK_REQUIRE_APPROVED_MEDIA || '').trim() === 'true';
        if (
            publishStatus === 'approved' &&
            strictMediaApproval &&
            (question.media_status === 'pending' || (question.image_media_id && question.media_status !== 'approved'))
        ) {
            res.status(400).json({
                message: '?????? ???? ???????? ??, ?????? ??????? ??? ?????',
            });
            return;
        }

        question.status = publishStatus;
        question.moderation_reason = reason;
        question.moderated_by = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)
            ? new mongoose.Types.ObjectId(req.user._id)
            : null;
        question.moderated_at = new Date();
        question.last_edited_by = question.moderated_by;
        question.revision_no = Number(question.revision_no || 1) + 1;

        const snapshot = question.toObject() as unknown as Record<string, unknown>;
        const revisionId = await createQuestionRevision(
            String(question._id),
            snapshot,
            String(req.user?._id || ''),
        );
        question.previous_revision_id = revisionId;
        await question.save();

        await notifyQBankWebhook(publishStatus === 'approved' ? 'approved' : 'rejected', {
            questionId: String(question._id),
            status: publishStatus,
            moderatedBy: req.user?._id,
            reason,
            timestamp: new Date().toISOString(),
        });

        await createAudit(req, publishStatus === 'approved' ? 'qbank_question_approved' : 'qbank_question_rejected', String(question._id), {
            reason,
        });

        res.json({
            message: publishStatus === 'approved' ? 'Question approved successfully' : 'Question rejected successfully',
            question,
        });
    } catch (err) {
        console.error('approveQuestion error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function lockQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'lock')) {
            res.status(403).json({ message: 'Permission denied: question:lock' });
            return;
        }

        const question = await Question.findById(req.params.id);
        if (!question) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }

        const requestedLockState = typeof req.body?.locked === 'boolean' ? Boolean(req.body.locked) : true;
        const reason = String(req.body?.reason || '').trim();

        if (!requestedLockState) {
            question.locked = false;
            question.locked_reason = '';
            question.locked_at = null;
            question.locked_by = null;
            await question.save();
            await createAudit(req, 'qbank_question_unlocked', String(question._id));
            res.json({ message: 'Question unlocked successfully', question });
            return;
        }

        const usedInPublishedExam = await isQuestionUsedInPublishedExam(question);
        if (!usedInPublishedExam && boolFromQuery(req.body?.force) !== true) {
            res.status(400).json({ message: 'Question is not linked to a published exam. Use force=true to lock manually.' });
            return;
        }

        question.locked = true;
        question.locked_reason = reason || (usedInPublishedExam ? 'used_in_published_exam' : 'manual_lock');
        question.locked_at = new Date();
        question.locked_by = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)
            ? new mongoose.Types.ObjectId(req.user._id)
            : null;
        await question.save();

        await createAudit(req, 'qbank_question_locked', String(question._id), {
            reason: question.locked_reason,
            usedInPublishedExam,
        });

        res.json({ message: 'Question locked successfully', question });
    } catch (err) {
        console.error('lockQuestion error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function searchSimilarQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const payload = toSafeObject(req.body);
        const { normalized, errors } = normalizeQuestionPayload(payload, 'draft');
        if (!normalized.question || errors.includes('?????? ????? ???')) {
            res.status(400).json({ message: '?????? ????? ???' });
            return;
        }

        const threshold = Number(payload.threshold || process.env.QBANK_DUPLICATE_THRESHOLD || DEFAULT_SIMILARITY_THRESHOLD);
        const subject = String(payload.subject || '').trim();
        const filter: Record<string, unknown> = { status: { $ne: 'archived' } };
        if (subject) filter.subject = subject;
        if (payload.excludeId && mongoose.Types.ObjectId.isValid(String(payload.excludeId))) {
            filter._id = { $ne: new mongoose.Types.ObjectId(String(payload.excludeId)) };
        }

        const candidates = await Question.find(filter)
            .select('_id question question_text options optionA optionB optionC optionD subject chapter quality_score status')
            .sort({ updatedAt: -1 })
            .limit(400)
            .lean();

        const matches = detectSimilarQuestions(
            { question: normalized.question, options: normalized.options },
            candidates as Array<{ _id: unknown; question?: string; question_text?: string; options?: Array<{ key: string; text: string }>; optionA?: string; optionB?: string; optionC?: string; optionD?: string }>,
            Number.isFinite(threshold) ? threshold : DEFAULT_SIMILARITY_THRESHOLD,
        );

        res.json({
            threshold: Number.isFinite(threshold) ? threshold : DEFAULT_SIMILARITY_THRESHOLD,
            matches,
            warning: matches.length > 0 ? '????????? ?????? ?????? ??? ????? — ??????? ??? ???' : undefined,
        });
    } catch (err) {
        console.error('searchSimilarQuestions error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function revertQuestionRevision(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'edit')) {
            res.status(403).json({ message: 'Permission denied: question:edit' });
            return;
        }

        const revisionNo = Number(req.params.revisionNo || 0);
        if (!Number.isFinite(revisionNo) || revisionNo <= 0) {
            res.status(400).json({ message: 'Invalid revision number' });
            return;
        }

        const question = await Question.findById(req.params.id);
        if (!question) {
            res.status(404).json({ message: 'Question not found' });
            return;
        }
        if (question.locked) {
            res.status(409).json({ message: 'Question is locked and cannot be reverted.' });
            return;
        }

        const revision = await QuestionRevision.findOne({
            questionId: req.params.id,
            revisionNo,
        }).lean();

        if (!revision?.snapshot) {
            res.status(404).json({ message: 'Revision not found' });
            return;
        }

        const currentSnapshot = question.toObject() as unknown as Record<string, unknown>;
        const previousRevisionId = await createQuestionRevision(
            String(question._id),
            currentSnapshot,
            String(req.user?._id || ''),
        );

        const snapshot = toSafeObject(revision.snapshot);
        delete snapshot._id;
        delete snapshot.createdAt;
        delete snapshot.updatedAt;

        question.set({
            ...snapshot,
            previous_revision_id: previousRevisionId,
            revision_no: Number(question.revision_no || 1) + 1,
            last_edited_by: req.user?._id,
            updatedAt: new Date(),
        });

        await question.save();
        await createAudit(req, 'qbank_question_reverted', String(question._id), { revisionNo });

        res.json({
            message: 'Question reverted successfully',
            question,
            revertedFrom: revisionNo,
        });
    } catch (err) {
        console.error('revertQuestionRevision error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function bulkImportQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'bulk_import')) {
            res.status(403).json({ message: 'Permission denied: question:bulk_import' });
            return;
        }

        const { rows, sourceFileName } = await parseImportRows(req);
        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ message: 'Invalid or empty import rows.' });
            return;
        }

        const defaultStatusRaw = String(req.body?.defaultStatus || process.env.QBANK_IMPORT_DEFAULT_STATUS || 'pending_review')
            .trim()
            .toLowerCase();
        const defaultStatus = defaultStatusRaw === 'approved' ? 'approved' : 'pending_review';

        const duplicateThresholdRaw = Number(req.body?.duplicateThreshold || process.env.QBANK_DUPLICATE_THRESHOLD || DEFAULT_SIMILARITY_THRESHOLD);
        const duplicateThreshold = Number.isFinite(duplicateThresholdRaw) ? duplicateThresholdRaw : DEFAULT_SIMILARITY_THRESHOLD;
        const autoApproveMedia = boolFromQuery(req.body?.autoApproveMedia) === true;

        const importJob = await QuestionImportJob.create({
            status: 'processing',
            sourceFileName,
            createdBy: req.user?._id,
            startedAt: new Date(),
            totalRows: rows.length,
            importedRows: 0,
            skippedRows: 0,
            failedRows: 0,
            duplicateRows: 0,
            rowErrors: [],
            options: {
                defaultStatus,
                duplicateThreshold,
            },
        });

        const rowErrors: Array<{ rowNumber: number; reason: string; payload?: Record<string, unknown> }> = [];
        let importedRows = 0;
        let skippedRows = 0;
        let failedRows = 0;
        let duplicateRows = 0;

        const candidateCache = await Question.find({ status: { $ne: 'archived' } })
            .select('_id question question_text options optionA optionB optionC optionD')
            .sort({ updatedAt: -1 })
            .limit(600)
            .lean();
        const syntheticCandidates: Array<{ _id: string; question: string; options: Array<{ key: string; text: string }> }> = [];

        for (let index = 0; index < rows.length; index += 1) {
            const row = toSafeObject(rows[index]);
            const rowNumber = index + 2;
            try {
                const { normalized, errors } = normalizeQuestionPayload(row, defaultStatus);
                if (errors.length > 0) {
                    failedRows += 1;
                    rowErrors.push({
                        rowNumber,
                        reason: `????? ????? ?? ?? ??????: ${errors.join(', ')}`,
                        payload: row,
                    });
                    continue;
                }

                const imageUrl = String(row.image_url || row.imageUrl || '').trim();
                if (imageUrl) {
                    const validation = await validateImageUrl(imageUrl);
                    if (!validation.ok) {
                        failedRows += 1;
                        rowErrors.push({
                            rowNumber,
                            reason: '??? ???? ???? ??? ???? ???? ????? ???? (Max 5MB)',
                            payload: row,
                        });
                        continue;
                    }

                    const media = await QuestionMedia.create({
                        sourceType: 'external_link',
                        url: imageUrl,
                        mimeType: validation.mimeType || '',
                        sizeBytes: validation.sizeBytes || 0,
                        status: autoApproveMedia ? 'approved' : 'pending',
                        alt_text_bn: normalized.media_alt_text_bn,
                        createdBy: req.user?._id,
                        approvedBy: autoApproveMedia ? req.user?._id : null,
                        approvedAt: autoApproveMedia ? new Date() : null,
                    });
                    normalized.image_media_id = media._id;
                    normalized.media_status = autoApproveMedia ? 'approved' : 'pending';
                }

                const duplicateMatches = detectSimilarQuestions(
                    { question: normalized.question, options: normalized.options },
                    [
                        ...(candidateCache as Array<{ _id: unknown; question?: string; question_text?: string; options?: Array<{ key: string; text: string }>; optionA?: string; optionB?: string; optionC?: string; optionD?: string }>),
                        ...syntheticCandidates,
                    ],
                    duplicateThreshold,
                );

                const flaggedDuplicate = duplicateMatches.length > 0;
                if (flaggedDuplicate) duplicateRows += 1;

                const quality = computeQualityScore({
                    ...normalized,
                    flagged_duplicate: flaggedDuplicate,
                    usage_count: 0,
                    avg_correct_pct: null,
                });

                const questionPayload = {
                    ...buildLegacyCompatibilityPayload(normalized),
                    quality_score: quality.score,
                    quality_flags: quality.flags,
                    flagged_duplicate: flaggedDuplicate,
                    duplicate_of_ids: duplicateMatches.slice(0, 5).map((entry) => new mongoose.Types.ObjectId(entry.questionId)),
                    status: defaultStatus,
                    created_by: req.user?._id,
                    last_edited_by: req.user?._id,
                    revision_no: 1,
                };

                const created = await Question.create(questionPayload);
                const revisionId = await createQuestionRevision(
                    String(created._id),
                    created.toObject() as unknown as Record<string, unknown>,
                    String(req.user?._id || ''),
                );
                created.previous_revision_id = revisionId;
                await created.save();

                syntheticCandidates.push({
                    _id: String(created._id),
                    question: normalized.question,
                    options: normalized.options,
                });

                importedRows += 1;
            } catch (error) {
                failedRows += 1;
                rowErrors.push({
                    rowNumber,
                    reason: `????? ????? ?? ?? ??????: ${(error as Error).message}`,
                    payload: row,
                });
            }
        }

        skippedRows = rows.length - importedRows - failedRows;
        importJob.status = failedRows > 0 && importedRows === 0 ? 'failed' : 'completed';
        importJob.importedRows = importedRows;
        importJob.skippedRows = skippedRows;
        importJob.failedRows = failedRows;
        importJob.duplicateRows = duplicateRows;
        importJob.rowErrors = rowErrors;
        importJob.finishedAt = new Date();
        await importJob.save();

        await createAudit(req, 'qbank_bulk_import', String(importJob._id), {
            totalRows: rows.length,
            importedRows,
            skippedRows,
            failedRows,
            duplicateRows,
            sourceFileName,
        });

        res.status(202).json({
            message: 'Bulk import started',
            import_job_id: String(importJob._id),
            summary: {
                totalRows: rows.length,
                importedRows,
                skippedRows,
                failedRows,
                duplicateRows,
            },
            rowErrors,
        });
    } catch (err) {
        console.error('bulkImportQuestions error:', err);
        res.status(500).json({ message: 'Server error during bulk import' });
    }
}

export async function getQuestionImportJob(req: AuthRequest, res: Response): Promise<void> {
    try {
        const job = await QuestionImportJob.findById(req.params.jobId).lean();
        if (!job) {
            res.status(404).json({ message: 'Import job not found' });
            return;
        }
        res.json({
            import_job_id: String(job._id),
            status: job.status,
            sourceFileName: job.sourceFileName,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            summary: {
                totalRows: job.totalRows,
                importedRows: job.importedRows,
                skippedRows: job.skippedRows,
                failedRows: job.failedRows,
                duplicateRows: job.duplicateRows,
            },
            rowErrors: job.rowErrors || [],
        });
    } catch (err) {
        console.error('getQuestionImportJob error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function exportQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'export')) {
            res.status(403).json({ message: 'Permission denied: question:export' });
            return;
        }

        const bodyFilter = toSafeObject(req.body?.filters || req.body || {});
        const queryFilter = buildFilter(bodyFilter);
        const rows = await Question.find(queryFilter)
            .sort({ updatedAt: -1 })
            .lean();

        const exportRows = rows.map((question) => ({
            id: String(question._id),
            class_level: question.class_level || question.class || '',
            department: question.department || '',
            subject: question.subject || '',
            chapter: question.chapter || '',
            topic: question.topic || '',
            difficulty: question.difficulty || '',
            status: question.status || '',
            question_text: question.question_text || question.question || '',
            option_a: question.optionA || '',
            option_b: question.optionB || '',
            option_c: question.optionC || '',
            option_d: question.optionD || '',
            correct_answer: Array.isArray(question.correct_answer) && question.correct_answer.length > 0
                ? question.correct_answer.join(',')
                : question.correctAnswer || '',
            explanation: question.explanation_text || question.explanation || '',
            tags: Array.isArray(question.tags) ? question.tags.join(', ') : '',
            quality_score: Number(question.quality_score || 0),
            usage_count: Number(question.usage_count || question.totalAttempted || 0),
            avg_correct_pct: Number(question.avg_correct_pct || 0),
            last_used_at: question.last_used_at ? new Date(question.last_used_at).toISOString() : '',
            updated_at: question.updatedAt ? new Date(question.updatedAt).toISOString() : '',
        }));

        const format = String(req.body?.format || req.query?.format || 'xlsx').toLowerCase();

        if (format === 'csv') {
            const sheet = XLSX.utils.json_to_sheet(exportRows);
            const csv = XLSX.utils.sheet_to_csv(sheet);
            res.setHeader('content-type', 'text/csv; charset=utf-8');
            res.setHeader('content-disposition', `attachment; filename=\"qbank-export-${Date.now()}.csv\"`);
            res.send(csv);
            return;
        }

        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(exportRows);
        XLSX.utils.book_append_sheet(workbook, sheet, 'QBank');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('content-disposition', `attachment; filename=\"qbank-export-${Date.now()}.xlsx\"`);
        res.send(buffer);

        await createAudit(req, 'qbank_export', undefined, { count: exportRows.length, format });
    } catch (err) {
        console.error('exportQuestions error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function signQuestionMediaUpload(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'edit')) {
            res.status(403).json({ message: 'Permission denied: question:edit' });
            return;
        }

        const filename = String(req.body?.filename || '').trim();
        const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
        if (!filename || !mimeType.startsWith('image/')) {
            res.status(400).json({ message: '??? ???? ???? ??? ???? ???? ????? ???? (Max 5MB)' });
            return;
        }

        const signed = await getSignedUploadForBanner(filename, mimeType);
        res.json(signed);
    } catch (err) {
        console.error('signQuestionMediaUpload error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function createQuestionMedia(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!questionPermissionFromToken(req, 'edit')) {
            res.status(403).json({ message: 'Permission denied: question:edit' });
            return;
        }

        const sourceType = String(req.body?.sourceType || 'external_link').trim();
        const url = String(req.body?.url || req.body?.publicUrl || '').trim();
        const altText = String(req.body?.alt_text_bn || req.body?.altText || '').trim();

        if (!url) {
            res.status(400).json({ message: '??? ???? ???? ??? ???? ???? ????? ???? (Max 5MB)' });
            return;
        }

        const validation = await validateImageUrl(url);
        if (!validation.ok && sourceType === 'external_link') {
            res.status(400).json({ message: '??? ???? ???? ??? ???? ???? ????? ???? (Max 5MB)' });
            return;
        }

        const media = await QuestionMedia.create({
            sourceType: sourceType === 'upload' ? 'upload' : 'external_link',
            url,
            mimeType: String(req.body?.mimeType || validation.mimeType || ''),
            sizeBytes: Number(req.body?.sizeBytes || validation.sizeBytes || 0),
            status: boolFromQuery(req.body?.approveNow) === true ? 'approved' : 'pending',
            alt_text_bn: altText,
            createdBy: req.user?._id,
            approvedBy: boolFromQuery(req.body?.approveNow) === true ? req.user?._id : null,
            approvedAt: boolFromQuery(req.body?.approveNow) === true ? new Date() : null,
        });

        await createAudit(req, 'qbank_media_created', String(media._id), {
            sourceType: media.sourceType,
            status: media.status,
        });

        res.status(201).json({
            message: 'Media created successfully',
            media,
        });
    } catch (err) {
        console.error('createQuestionMedia error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getQbankPicker(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const filter: Record<string, unknown> = { status: 'approved' };

        if (query.subject) filter.subject = String(query.subject).trim();
        if (query.chapter) filter.chapter = String(query.chapter).trim();
        if (query.difficulty) filter.difficulty = String(query.difficulty).trim().toLowerCase();
        if (query.class_level) filter.class_level = String(query.class_level).trim();
        if (query.department) filter.department = String(query.department).trim();

        const tags = parseCsvList(query.tags);
        if (tags.length > 0) filter.tags = { $in: tags };

        const excludeIds = parseCsvList(query.exclude_ids)
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        if (excludeIds.length > 0) {
            filter._id = { $nin: excludeIds };
        }

        const hasImage = boolFromQuery(query.has_image);
        if (hasImage === true) {
            filter.$or = [{ image_media_id: { $ne: null } }, { questionImage: { $exists: true, $ne: '' } }];
        }

        const qualityMin = Number(query.quality_score_min);
        if (Number.isFinite(qualityMin)) {
            filter.quality_score = { $gte: qualityMin };
        }

        const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
        const random = boolFromQuery(query.random) === true;
        const includeExplanation = boolFromQuery(query.include_explanation) === true;

        let docs = await Question.find(filter)
            .select(includeExplanation
                ? '_id question question_text question_type questionType options optionA optionB optionC optionD correct_answer difficulty marks negative_marks quality_score subject chapter class_level tags explanation explanation_text image_media_id media_alt_text_bn estimated_time'
                : '_id question question_text question_type questionType options optionA optionB optionC optionD correct_answer difficulty marks negative_marks quality_score subject chapter class_level tags image_media_id media_alt_text_bn estimated_time')
            .sort({ quality_score: -1, updatedAt: -1 })
            .limit(random ? Math.min(800, limit * 5) : limit)
            .lean();

        if (random) {
            docs = docs.sort(() => Math.random() - 0.5).slice(0, limit);
        }

        res.json({
            questions: docs,
            total: docs.length,
            filter,
        });
    } catch (err) {
        console.error('getQbankPicker error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function incrementQbankUsage(req: AuthRequest, res: Response): Promise<void> {
    try {
        const payload = toSafeObject(req.body);
        const examId = payload.examId && mongoose.Types.ObjectId.isValid(String(payload.examId))
            ? new mongoose.Types.ObjectId(String(payload.examId))
            : null;

        const entries = Array.isArray(payload.items)
            ? payload.items
            : payload.questionId
                ? [{ questionId: payload.questionId, isCorrect: payload.isCorrect }]
                : [];

        if (!Array.isArray(entries) || entries.length === 0) {
            res.status(400).json({ message: 'Invalid usage payload' });
            return;
        }

        const normalizedEntries = entries
            .map((entry) => {
                const item = toSafeObject(entry);
                const questionId = String(item.questionId || '').trim();
                const isCorrect = Boolean(item.isCorrect);
                return { questionId, isCorrect };
            })
            .filter((entry) => mongoose.Types.ObjectId.isValid(entry.questionId));

        if (normalizedEntries.length === 0) {
            res.status(400).json({ message: 'Invalid question ids' });
            return;
        }

        const updates = await Promise.all(normalizedEntries.map(async (entry) => {
            const question = await Question.findById(entry.questionId);
            if (!question) return null;

            question.usage_count = Number(question.usage_count || 0) + 1;
            question.totalAttempted = Number(question.totalAttempted || 0) + 1;
            if (entry.isCorrect) {
                question.totalCorrect = Number(question.totalCorrect || 0) + 1;
            }
            question.avg_correct_pct = question.totalAttempted > 0
                ? Number(((question.totalCorrect / question.totalAttempted) * 100).toFixed(2))
                : null;
            question.last_used_in_exam = examId;
            question.last_used_at = new Date();

            const quality = computeQualityScore({
                ...normalizeQuestionPayload(question.toObject() as unknown as Record<string, unknown>, question.status || 'draft').normalized,
                flagged_duplicate: Boolean(question.flagged_duplicate),
                usage_count: question.usage_count,
                avg_correct_pct: question.avg_correct_pct,
            });
            question.quality_score = quality.score;
            question.quality_flags = quality.flags;

            await question.save();
            return {
                questionId: entry.questionId,
                usage_count: question.usage_count,
                avg_correct_pct: question.avg_correct_pct,
            };
        }));

        res.json({
            updated: updates.filter(Boolean),
            count: updates.filter(Boolean).length,
        });
    } catch (err) {
        console.error('incrementQbankUsage error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

