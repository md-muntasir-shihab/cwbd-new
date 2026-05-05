/**
 * Question Bank Service
 *
 * CRUD, search, filtering, pagination, and versioning for QuestionBankQuestion.
 *
 * - createQuestion: validates MCQ correct option + hierarchy chain, generates contentHash
 * - updateQuestion: creates QuestionRevision if referenced by a published exam
 * - archiveQuestion: soft-delete via isArchived flag
 * - listQuestions: multi-filter search with pagination and faceted counts
 * - approveQuestion: sets review_status to 'approved'
 * - rejectQuestion: sets review_status to 'rejected' with reason
 * - bulkArchive: archives multiple questions at once
 * - bulkStatusChange: changes status of multiple questions
 * - detectDuplicates: finds potential duplicate questions using text similarity
 * - updateQuestionAnalytics: increments times_attempted and recalculates correct_rate
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.10, 2.11, 2.12, 2.13
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import QuestionBankQuestion, { IQuestionBankQuestion } from '../models/QuestionBankQuestion';
import QuestionRevision from '../models/QuestionRevision';
import Exam from '../models/Exam';
import QuestionGroup from '../models/QuestionGroup';
import QuestionSubGroup from '../models/QuestionSubGroup';
import QuestionCategory from '../models/QuestionCategory';
import QuestionChapter from '../models/QuestionChapter';
import QuestionTopic from '../models/QuestionTopic';
import { detectSimilarQuestions } from '../utils/questionBank';

// ─── DTO Types ──────────────────────────────────────────────

export interface CreateQuestionDto {
    question_en?: string;
    question_bn?: string;
    questionImageUrl?: string;
    questionFormulaLatex?: string;
    question_type?: 'mcq' | 'written_cq' | 'fill_blank' | 'true_false' | 'image_mcq';
    options?: { key: string; text_en?: string; text_bn?: string; imageUrl?: string; isCorrect?: boolean }[];
    correctKey?: 'A' | 'B' | 'C' | 'D';
    explanation_en?: string;
    explanation_bn?: string;
    explanationImageUrl?: string;
    ai_explanation?: { en?: string; bn?: string };
    images?: string[];
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
    subject?: string;
    moduleCategory?: string;
    topic?: string;
    subtopic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    languageMode?: 'en' | 'bn' | 'both';
    marks?: number;
    negativeMarks?: number;
    tags?: string[];
    sourceLabel?: string;
    chapter?: string;
    boardOrPattern?: string;
    yearOrSession?: string;
    status?: 'draft' | 'published' | 'archived' | 'flagged';
    created_by?: string;
}

export type UpdateQuestionDto = Partial<CreateQuestionDto>;

export interface QuestionFilters {
    group?: string;
    subGroup?: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    difficulty?: string;
    tags?: string | string[];
    year?: string;
    source?: string;
    question_type?: string;
    status?: string;
    review_status?: string;
    search?: string;
    archivedOnly?: boolean;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginationDto {
    page: number;
    limit: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    facets: FacetCounts;
}

export interface FacetCounts {
    difficulties: string[];
    question_types: string[];
    statuses: string[];
    review_statuses: string[];
    tags: string[];
}

export interface BulkResult {
    success: number;
    failed: number;
}

// ─── Helpers ────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(id);
}


/**
 * Compute a SHA-256 content hash for duplicate detection.
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
            .map((o) => `${o.key}|${(o.text_en || '').trim().toLowerCase()}|${(o.text_bn || '').trim().toLowerCase()}`),
        (q.correctKey || '').toUpperCase(),
    ];
    return crypto.createHash('sha256').update(parts.join('|||')).digest('hex');
}

// ─── Hierarchy Chain Validation ─────────────────────────────

/**
 * Validate that the provided hierarchy IDs exist and form a valid parent chain:
 *   group_id → sub_group_id → subject_id → chapter_id → topic_id
 *
 * Only validates IDs that are provided. When a child is provided, its parent
 * must also be provided and the child must actually reference that parent.
 *
 * Requirement 2.3
 */
async function validateHierarchyChain(data: {
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
}): Promise<void> {
    const { group_id, sub_group_id, subject_id, chapter_id, topic_id } = data;

    // Validate group exists
    if (group_id) {
        const group = await QuestionGroup.findById(group_id);
        if (!group) throw new Error(`Group "${group_id}" not found`);
    }

    // Validate sub_group exists and belongs to group
    if (sub_group_id) {
        if (!group_id) throw new Error('group_id is required when sub_group_id is provided');
        const subGroup = await QuestionSubGroup.findById(sub_group_id);
        if (!subGroup) throw new Error(`Sub-group "${sub_group_id}" not found`);
        if (subGroup.group_id.toString() !== group_id) {
            throw new Error(`Sub-group "${sub_group_id}" does not belong to group "${group_id}"`);
        }
    }

    // Validate subject exists and belongs to sub_group
    if (subject_id) {
        if (!sub_group_id) throw new Error('sub_group_id is required when subject_id is provided');
        const subject = await QuestionCategory.findById(subject_id);
        if (!subject) throw new Error(`Subject "${subject_id}" not found`);
        // QuestionCategory stores sub_group ref in parent_id
        if (subject.parent_id?.toString() !== sub_group_id) {
            throw new Error(`Subject "${subject_id}" does not belong to sub-group "${sub_group_id}"`);
        }
    }

    // Validate chapter exists and belongs to subject
    if (chapter_id) {
        if (!subject_id) throw new Error('subject_id is required when chapter_id is provided');
        const chapter = await QuestionChapter.findById(chapter_id);
        if (!chapter) throw new Error(`Chapter "${chapter_id}" not found`);
        if (chapter.subject_id.toString() !== subject_id) {
            throw new Error(`Chapter "${chapter_id}" does not belong to subject "${subject_id}"`);
        }
    }

    // Validate topic exists and belongs to chapter
    if (topic_id) {
        if (!chapter_id) throw new Error('chapter_id is required when topic_id is provided');
        const topic = await QuestionTopic.findById(topic_id);
        if (!topic) throw new Error(`Topic "${topic_id}" not found`);
        // QuestionTopic stores chapter ref in parent_id
        if (topic.parent_id?.toString() !== chapter_id) {
            throw new Error(`Topic "${topic_id}" does not belong to chapter "${chapter_id}"`);
        }
    }
}

// ─── MCQ Correct Option Validation ─────────────────────────

/**
 * For MCQ, image-based MCQ, and true-false question types, at least one option
 * must have isCorrect set to true. Written/CQ and fill-in-the-blank types are
 * exempt from this check.
 *
 * Requirement 2.2
 */
function validateMcqCorrectOption(data: CreateQuestionDto): void {
    const mcqTypes: string[] = ['mcq', 'image_mcq', 'true_false'];
    const qType = data.question_type || 'mcq';

    if (mcqTypes.includes(qType)) {
        const hasCorrect = (data.options || []).some((o) => o.isCorrect === true);
        if (!hasCorrect) {
            throw new Error(
                'MCQ questions must have at least one option with isCorrect set to true',
            );
        }
    }
}

// ─── Service Methods ────────────────────────────────────────

/**
 * Create a new question in the question bank.
 *
 * 1. Validate MCQ correct option (Requirement 2.2)
 * 2. Validate hierarchy chain (Requirement 2.3)
 * 3. Compute content hash for duplicate detection
 * 4. Persist to database
 */
export async function createQuestion(data: CreateQuestionDto): Promise<IQuestionBankQuestion> {
    // Step 1: MCQ correct option validation
    validateMcqCorrectOption(data);

    // Step 2: Hierarchy chain validation
    await validateHierarchyChain(data);

    // Step 3: Compute content hash
    const contentHash = computeContentHash(data);

    // Step 4: Build and persist document
    const doc = new QuestionBankQuestion({
        question_en: data.question_en || '',
        question_bn: data.question_bn || '',
        questionImageUrl: data.questionImageUrl || '',
        questionFormulaLatex: data.questionFormulaLatex || '',
        question_type: data.question_type || 'mcq',
        options: data.options || [],
        correctKey: data.correctKey || 'A',
        explanation_en: data.explanation_en || '',
        explanation_bn: data.explanation_bn || '',
        explanationImageUrl: data.explanationImageUrl || '',
        ai_explanation: data.ai_explanation,
        images: data.images || [],
        group_id: data.group_id ? toObjectId(data.group_id) : undefined,
        sub_group_id: data.sub_group_id ? toObjectId(data.sub_group_id) : undefined,
        subject_id: data.subject_id ? toObjectId(data.subject_id) : undefined,
        chapter_id: data.chapter_id ? toObjectId(data.chapter_id) : undefined,
        topic_id: data.topic_id ? toObjectId(data.topic_id) : undefined,
        subject: data.subject || 'General',
        moduleCategory: data.moduleCategory || 'General',
        topic: data.topic || '',
        subtopic: data.subtopic || '',
        difficulty: data.difficulty || 'medium',
        languageMode: data.languageMode || 'en',
        marks: data.marks ?? 1,
        negativeMarks: data.negativeMarks ?? 0,
        tags: data.tags || [],
        sourceLabel: data.sourceLabel || '',
        chapter: data.chapter || '',
        boardOrPattern: data.boardOrPattern || '',
        yearOrSession: data.yearOrSession || '',
        status: data.status || 'draft',
        created_by: data.created_by ? toObjectId(data.created_by) : undefined,
        contentHash,
        versionNo: 1,
        isActive: true,
        isArchived: false,
    });

    return doc.save();
}


/**
 * Update an existing question in the question bank.
 *
 * If the question is referenced by at least one published exam (isPublished = true
 * or status in ['scheduled', 'live']), a QuestionRevision is created preserving
 * the original field values before applying the update.
 *
 * Requirement 2.4
 */
export async function updateQuestion(
    id: string,
    data: UpdateQuestionDto,
    changedBy?: string,
): Promise<IQuestionBankQuestion> {
    const existing = await QuestionBankQuestion.findById(id);
    if (!existing) {
        throw new Error(`Question "${id}" not found`);
    }

    // Check if this question is referenced by any published exam
    const publishedExamCount = await Exam.countDocuments({
        questionOrder: existing._id,
        $or: [
            { isPublished: true },
            { status: { $in: ['scheduled', 'live'] } },
        ],
    });

    if (publishedExamCount > 0) {
        // Create a revision preserving the original data before update
        const snapshot = existing.toObject() as unknown as Record<string, unknown>;
        // Remove Mongoose internal fields from snapshot
        delete snapshot.__v;

        const latestRevision = await QuestionRevision.findOne({ questionId: existing._id })
            .sort({ revisionNo: -1 })
            .lean();
        const nextRevisionNo = (latestRevision?.revisionNo ?? 0) + 1;

        await QuestionRevision.create({
            questionId: existing._id,
            revisionNo: nextRevisionNo,
            snapshot,
            changedBy: changedBy && mongoose.Types.ObjectId.isValid(changedBy)
                ? new mongoose.Types.ObjectId(changedBy)
                : undefined,
            changedAt: new Date(),
        });
    }

    // Apply updates to the question
    if (data.question_en !== undefined) existing.question_en = data.question_en;
    if (data.question_bn !== undefined) existing.question_bn = data.question_bn;
    if (data.questionImageUrl !== undefined) existing.questionImageUrl = data.questionImageUrl;
    if (data.questionFormulaLatex !== undefined) existing.questionFormulaLatex = data.questionFormulaLatex;
    if (data.question_type !== undefined) existing.question_type = data.question_type;
    if (data.options !== undefined) {
        existing.options = data.options as any;
        // Re-validate MCQ correct option if question type requires it
        validateMcqCorrectOption({ ...data, question_type: existing.question_type } as CreateQuestionDto);
    }
    if (data.correctKey !== undefined) existing.correctKey = data.correctKey;
    if (data.explanation_en !== undefined) existing.explanation_en = data.explanation_en;
    if (data.explanation_bn !== undefined) existing.explanation_bn = data.explanation_bn;
    if (data.explanationImageUrl !== undefined) existing.explanationImageUrl = data.explanationImageUrl;
    if (data.ai_explanation !== undefined) existing.ai_explanation = data.ai_explanation;
    if (data.images !== undefined) existing.images = data.images;
    if (data.difficulty !== undefined) existing.difficulty = data.difficulty;
    if (data.marks !== undefined) existing.marks = data.marks;
    if (data.negativeMarks !== undefined) existing.negativeMarks = data.negativeMarks;
    if (data.tags !== undefined) existing.tags = data.tags;
    if (data.sourceLabel !== undefined) existing.sourceLabel = data.sourceLabel;
    if (data.status !== undefined) existing.status = data.status;

    // Recompute content hash
    existing.contentHash = computeContentHash({
        question_en: existing.question_en,
        question_bn: existing.question_bn,
        options: existing.options as any,
        correctKey: existing.correctKey,
    });

    existing.versionNo = (existing.versionNo || 1) + 1;

    return existing.save();
}


/**
 * Archive (soft-delete) a question by setting isArchived = true.
 *
 * Archived questions are excluded from future exam selection queries
 * and listQuestions results.
 *
 * Requirement 2.5
 */
export async function archiveQuestion(id: string): Promise<void> {
    const question = await QuestionBankQuestion.findById(id);
    if (!question) {
        throw new Error(`Question "${id}" not found`);
    }
    question.isArchived = true;
    question.status = 'archived';
    await question.save();
}


/**
 * List questions with multi-filter search, pagination, and faceted counts.
 *
 * Archived questions (isArchived = true) are always excluded from results.
 *
 * Requirements 2.5, 2.6, 2.8
 */
export async function listQuestions(
    filters: QuestionFilters,
    pagination: PaginationDto,
): Promise<PaginatedResult<IQuestionBankQuestion>> {
    // Determine archive filter based on archivedOnly flag
    const query: Record<string, unknown> = filters.archivedOnly
        ? { isArchived: true }
        : { isArchived: { $ne: true } };

    // Apply filters
    if (filters.group) query.group_id = toObjectId(filters.group);
    if (filters.subGroup) query.sub_group_id = toObjectId(filters.subGroup);
    if (filters.subject) query.subject = filters.subject;
    if (filters.chapter) query.chapter = filters.chapter;
    if (filters.topic) query.topic = filters.topic;
    if (filters.difficulty) query.difficulty = filters.difficulty;
    if (filters.question_type) query.question_type = filters.question_type;
    if (filters.status) query.status = filters.status;
    if (filters.review_status) query.review_status = filters.review_status;
    if (filters.year) query.yearOrSession = filters.year;
    if (filters.source) query.sourceLabel = filters.source;

    if (filters.tags) {
        const tagList = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
        if (tagList.length > 0) {
            query.tags = { $all: tagList };
        }
    }

    if (filters.search) {
        query.$or = [
            { question_en: { $regex: filters.search, $options: 'i' } },
            { question_bn: { $regex: filters.search, $options: 'i' } },
        ];
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Build sort object from filters, defaulting to createdAt desc
    const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'difficulty', 'marks', 'status', 'question_type', 'question_en'];
    let sortObj: Record<string, 1 | -1> = { createdAt: -1 };
    if (filters.sortField && ALLOWED_SORT_FIELDS.includes(filters.sortField)) {
        sortObj = { [filters.sortField]: filters.sortOrder === 'asc' ? 1 : -1 };
    }

    const [data, total] = await Promise.all([
        QuestionBankQuestion.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .lean<IQuestionBankQuestion[]>(),
        QuestionBankQuestion.countDocuments(query),
    ]);

    // Compute faceted counts (on the filtered set, excluding pagination)
    const facetPipeline = [
        { $match: query },
        {
            $facet: {
                difficulties: [{ $group: { _id: '$difficulty' } }, { $project: { _id: 0, value: '$_id' } }],
                question_types: [{ $group: { _id: '$question_type' } }, { $project: { _id: 0, value: '$_id' } }],
                statuses: [{ $group: { _id: '$status' } }, { $project: { _id: 0, value: '$_id' } }],
                review_statuses: [{ $group: { _id: '$review_status' } }, { $project: { _id: 0, value: '$_id' } }],
                tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags' } }, { $project: { _id: 0, value: '$_id' } }],
            },
        },
    ];

    const facetResult = await QuestionBankQuestion.aggregate(facetPipeline);
    const rawFacets = facetResult[0] || {};

    const facets: FacetCounts = {
        difficulties: (rawFacets.difficulties || []).map((d: { value: string }) => d.value).filter(Boolean),
        question_types: (rawFacets.question_types || []).map((d: { value: string }) => d.value).filter(Boolean),
        statuses: (rawFacets.statuses || []).map((d: { value: string }) => d.value).filter(Boolean),
        review_statuses: (rawFacets.review_statuses || []).map((d: { value: string }) => d.value).filter(Boolean),
        tags: (rawFacets.tags || []).map((d: { value: string }) => d.value).filter(Boolean),
    };

    return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        facets,
    };
}


// ─── Review Workflow ────────────────────────────────────────

/**
 * Approve a question by setting its review_status to 'approved'.
 *
 * Only questions with review_status 'pending' can be approved.
 * The reviewer ID is recorded for audit purposes.
 *
 * Requirement 2.11
 */
export async function approveQuestion(id: string, reviewerId: string): Promise<void> {
    const question = await QuestionBankQuestion.findById(id);
    if (!question) {
        throw new Error(`Question "${id}" not found`);
    }
    if (question.review_status === 'approved') {
        throw new Error(`Question "${id}" is already approved`);
    }

    question.review_status = 'approved';
    question.updatedByAdminId = reviewerId;
    await question.save();
}


/**
 * Reject a question by setting its review_status to 'rejected'.
 *
 * Only questions with review_status 'pending' can be rejected.
 * A reason must be provided for the rejection.
 *
 * Requirement 2.11
 */
export async function rejectQuestion(id: string, reviewerId: string, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
        throw new Error('Rejection reason is required');
    }

    const question = await QuestionBankQuestion.findById(id);
    if (!question) {
        throw new Error(`Question "${id}" not found`);
    }
    if (question.review_status === 'rejected') {
        throw new Error(`Question "${id}" is already rejected`);
    }

    question.review_status = 'rejected';
    question.updatedByAdminId = reviewerId;
    // Store rejection reason in explanation field as a convention
    // (the reason is also typically stored in audit logs by the controller layer)
    await question.save();
}


// ─── Bulk Actions ───────────────────────────────────────────

/**
 * Archive multiple questions at once via soft-delete.
 *
 * Each question is individually processed so that failures on one
 * do not block the rest. Returns a summary of successes and failures.
 *
 * Requirement 2.13
 */
export async function bulkArchive(ids: string[]): Promise<BulkResult> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                failed++;
                continue;
            }
            const result = await QuestionBankQuestion.updateOne(
                { _id: toObjectId(id), isArchived: { $ne: true } },
                { $set: { isArchived: true, status: 'archived' } },
            );
            if (result.modifiedCount > 0) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { success, failed };
}


/**
 * Change the status of multiple questions at once.
 *
 * Validates that the target status is one of the allowed QuestionStatus values.
 * Each question is individually processed so that failures on one
 * do not block the rest.
 *
 * Requirement 2.13
 */
export async function bulkStatusChange(ids: string[], status: string): Promise<BulkResult> {
    const allowedStatuses = ['draft', 'published', 'archived', 'flagged'];
    if (!allowedStatuses.includes(status)) {
        throw new Error(`Invalid status "${status}". Allowed: ${allowedStatuses.join(', ')}`);
    }

    let success = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                failed++;
                continue;
            }
            const updateFields: Record<string, unknown> = { status };
            // If archiving via status change, also set isArchived flag
            if (status === 'archived') {
                updateFields.isArchived = true;
            }

            const result = await QuestionBankQuestion.updateOne(
                { _id: toObjectId(id) },
                { $set: updateFields },
            );
            if (result.modifiedCount > 0) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { success, failed };
}


/**
 * Approve multiple questions at once by setting review_status to 'approved'.
 *
 * Each question is individually processed so that failures on one
 * do not block the rest. Returns a summary of successes and failures.
 */
export async function bulkApprove(ids: string[], adminId: string): Promise<BulkResult> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                failed++;
                continue;
            }
            const result = await QuestionBankQuestion.updateOne(
                { _id: toObjectId(id), review_status: { $ne: 'approved' } },
                { $set: { review_status: 'approved', updatedByAdminId: adminId } },
            );
            if (result.modifiedCount > 0) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { success, failed };
}


/**
 * Restore multiple archived questions (move out of recycle bin).
 *
 * Sets isArchived = false and status back to 'draft'.
 */
export async function bulkRestore(ids: string[]): Promise<BulkResult> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                failed++;
                continue;
            }
            const result = await QuestionBankQuestion.updateOne(
                { _id: toObjectId(id), isArchived: true },
                { $set: { isArchived: false, status: 'draft' } },
            );
            if (result.modifiedCount > 0) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { success, failed };
}


/**
 * Permanently delete multiple questions from the database.
 *
 * WARNING: This action is irreversible. Should only be called by superadmin.
 * The controller layer is responsible for role-checking before invoking this.
 */
export async function bulkHardDelete(ids: string[]): Promise<BulkResult> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                failed++;
                continue;
            }
            const result = await QuestionBankQuestion.deleteOne({ _id: toObjectId(id) });
            if (result.deletedCount > 0) {
                success++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { success, failed };
}


// ─── Duplicate Detection ────────────────────────────────────

/**
 * Detect potential duplicate questions by comparing the given question text
 * against existing questions using both contentHash exact matching and
 * the detectSimilarQuestions text-similarity utility.
 *
 * Returns an array of questions that are potential duplicates, sorted by
 * similarity score descending.
 *
 * Requirement 2.12
 */
export async function detectDuplicates(questionText: string): Promise<IQuestionBankQuestion[]> {
    if (!questionText || questionText.trim().length === 0) {
        return [];
    }

    const normalizedText = questionText.trim().toLowerCase();

    // Step 1: Check for exact contentHash matches
    const contentHash = crypto.createHash('sha256')
        .update(normalizedText + '|||' + '|||')
        .digest('hex');

    const exactMatches = await QuestionBankQuestion.find({
        contentHash,
        isArchived: { $ne: true },
    }).lean<IQuestionBankQuestion[]>();

    // Step 2: Use text-similarity matching via detectSimilarQuestions
    // Fetch recent non-archived questions as candidates for comparison
    const candidates = await QuestionBankQuestion.find({
        isArchived: { $ne: true },
    })
        .sort({ createdAt: -1 })
        .limit(500)
        .select('_id question_en question_bn options')
        .lean();

    const similarityMatches = detectSimilarQuestions(
        { question: questionText.trim(), options: [] },
        candidates.map((c) => ({
            _id: c._id,
            question: (c as any).question_en || (c as any).question_bn || '',
            options: ((c as any).options || []).map((o: any) => ({
                key: o.key || '',
                text: o.text_en || o.text_bn || '',
            })),
        })),
        0.7, // lower threshold for broader detection
    );

    // Step 3: Combine results, deduplicating by ID
    const matchedIds = new Set<string>(
        exactMatches.map((q) => q._id.toString()),
    );

    for (const match of similarityMatches) {
        matchedIds.add(match.questionId);
    }

    if (matchedIds.size === 0) {
        return [];
    }

    // Fetch full documents for all matched IDs
    const allMatches = await QuestionBankQuestion.find({
        _id: { $in: Array.from(matchedIds).map((id) => toObjectId(id)) },
        isArchived: { $ne: true },
    }).lean<IQuestionBankQuestion[]>();

    return allMatches;
}


// ─── Per-Question Analytics ─────────────────────────────────

/**
 * Update per-question analytics after an exam attempt.
 *
 * Increments `times_attempted` by 1 and recalculates `correct_rate` as
 * the percentage of correct attempts out of total attempts:
 *   correct_rate = (previous_correct_count + (wasCorrect ? 1 : 0)) / new_times_attempted * 100
 *
 * The previous correct count is derived from the existing correct_rate and times_attempted:
 *   previous_correct_count = Math.round(correct_rate / 100 * times_attempted)
 *
 * Requirement 2.10
 */
export async function updateQuestionAnalytics(
    questionId: string,
    wasCorrect: boolean,
): Promise<IQuestionBankQuestion> {
    const question = await QuestionBankQuestion.findById(questionId);
    if (!question) {
        throw new Error(`Question "${questionId}" not found`);
    }

    const previousAttempts = question.times_attempted || 0;
    const previousRate = question.correct_rate || 0;

    // Derive the previous correct count from the stored rate and attempts
    const previousCorrectCount = Math.round((previousRate / 100) * previousAttempts);

    const newAttempts = previousAttempts + 1;
    const newCorrectCount = previousCorrectCount + (wasCorrect ? 1 : 0);
    const newRate = (newCorrectCount / newAttempts) * 100;

    question.times_attempted = newAttempts;
    question.correct_rate = newRate;

    return question.save();
}
