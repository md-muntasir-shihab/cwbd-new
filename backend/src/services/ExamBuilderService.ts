/**
 * Exam Builder Service
 *
 * Orchestrates the 5-step exam creation wizard:
 *   Step 1: createExamDraft — basic info (title, description, type, group/subject filters, duration)
 *   Step 2: updateQuestionSelection — manual question selection
 *           autoPick — auto-select questions by count and difficulty distribution
 *   Step 3: updateSettings — marks, negative marking, pass %, shuffle, visibility, anti-cheat, groups
 *   Step 4: updateScheduling — schedule type, start/end times, pricing
 *   Step 5: publishExam — validate completeness, set status to 'scheduled', mark isPublished
 *
 * Also provides cloneExam for template-based creation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11
 */
import mongoose from 'mongoose';
import Exam, { IExam } from '../models/Exam';
import QuestionBankQuestion from '../models/QuestionBankQuestion';

// ─── DTO Types ──────────────────────────────────────────────

export interface ExamInfoDto {
    title: string;
    title_bn: string;
    description?: string;
    exam_type: 'Practice' | 'Mock' | 'Scheduled' | 'Live' | 'Custom';
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    duration?: number; // minutes
    durationMinutes?: number; // fallback for frontend
    createdBy: string; // admin/examiner user ID
}

export interface AutoPickConfig {
    count: number;
    difficultyDistribution: {
        easy: number;   // percentage 0-100
        medium: number; // percentage 0-100
        hard: number;   // percentage 0-100
    };
}

export interface ExamSettingsDto {
    marksPerQuestion: number;
    negativeMarking: number;
    passPercentage: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    showResultMode: 'immediately' | 'after_deadline' | 'manual';
    maxAttempts: number;
    assignedGroups: string[]; // ObjectId strings
    visibility: 'public' | 'group_only' | 'private' | 'invite_only';
    antiCheat: {
        tab_switch_detect: boolean;
        fullscreen_mode: boolean;
        copy_paste_disabled: boolean;
    };
}

export interface ExamSchedulingDto {
    exam_schedule_type: 'live' | 'practice' | 'scheduled' | 'upcoming';
    startTime?: Date;
    endTime?: Date;
    resultPublishTime?: Date;
    pricing: {
        isFree: boolean;
        amountBDT?: number;
        couponCodes?: string[];
    };
}

// ─── Helpers ────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(id);
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 * Returns the same array reference.
 */
function shuffleArray<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── Step 1: Create Exam Draft ──────────────────────────────

/**
 * Create a new exam in draft status with basic info from Step 1.
 *
 * Sets sensible defaults for required Exam fields so the document
 * can be saved and progressively updated through subsequent wizard steps.
 *
 * Requirement 4.1
 */
export async function createExamDraft(data: ExamInfoDto): Promise<IExam> {
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const exam = new Exam({
        title: data.title,
        title_bn: data.title_bn,
        description: data.description || '',
        subject: data.title, // legacy field — use title as placeholder
        duration: data.duration || data.durationMinutes || 60,
        status: 'draft',
        isPublished: false,

        // Hierarchy filters from wizard step 1
        group_id: data.group_id ? toObjectId(data.group_id) : undefined,
        sub_group_id: data.sub_group_id ? toObjectId(data.sub_group_id) : undefined,
        subject_id: data.subject_id ? toObjectId(data.subject_id) : undefined,

        // Defaults for required Exam fields
        totalQuestions: 0,
        totalMarks: 0,
        startDate: now,
        endDate: oneWeekLater,
        resultPublishDate: oneWeekLater,
        createdBy: toObjectId(data.createdBy),

        // Question order starts empty
        questionOrder: [],
        perQuestionMarks: [],
    });

    return exam.save();
}

// ─── Step 2: Update Question Selection ──────────────────────

/**
 * Set the selected questions on an exam (manual selection).
 *
 * Validates that the exam exists and is in draft status,
 * and that at least 1 question ID is provided.
 * Updates questionOrder, totalQuestions, and recalculates totalMarks.
 *
 * Requirement 4.2, 4.9, 4.10
 */
export async function updateQuestionSelection(
    examId: string,
    questionIds: string[],
): Promise<void> {
    const exam = await Exam.findById(examId);
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }
    if (exam.status !== 'draft') {
        throw new Error('Can only update questions on a draft exam');
    }
    if (questionIds.length < 1) {
        throw new Error('At least one question must be selected');
    }

    const objectIds = questionIds.map(toObjectId);

    // Verify all question IDs exist and are not archived
    const existingCount = await QuestionBankQuestion.countDocuments({
        _id: { $in: objectIds },
        isArchived: { $ne: true },
    });
    if (existingCount !== questionIds.length) {
        throw new Error(
            `Some question IDs are invalid or archived. Expected ${questionIds.length}, found ${existingCount}`,
        );
    }

    exam.questionOrder = objectIds;
    exam.totalQuestions = questionIds.length;

    // Recalculate totalMarks from per-question marks or default
    const defaultMarks = exam.defaultMarksPerQuestion || 1;
    exam.totalMarks = questionIds.length * defaultMarks;

    await exam.save();
}

// ─── Step 2: Auto-Pick Questions ────────────────────────────

/**
 * Automatically select questions matching the exam's group/subject filters
 * and the specified difficulty distribution.
 *
 * The difficulty distribution percentages must sum to 100.
 * Questions are randomly selected from each difficulty pool.
 * Returns the selected question ID strings (does NOT save to exam — caller
 * can review and then call updateQuestionSelection).
 *
 * Requirement 4.3
 */
export async function autoPick(
    examId: string,
    config: AutoPickConfig,
): Promise<string[]> {
    const { count, difficultyDistribution } = config;

    // Validate distribution sums to 100
    const total = difficultyDistribution.easy + difficultyDistribution.medium + difficultyDistribution.hard;
    if (total !== 100) {
        throw new Error(`Difficulty distribution must sum to 100, got ${total}`);
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }

    // Build base filter matching the exam's hierarchy filters
    const baseFilter: Record<string, unknown> = {
        isArchived: { $ne: true },
        status: { $in: ['published', 'draft'] },
    };
    if (exam.group_id) baseFilter.group_id = exam.group_id;
    if (exam.sub_group_id) baseFilter.sub_group_id = exam.sub_group_id;
    if (exam.subject_id) baseFilter.subject_id = exam.subject_id;

    // Calculate target counts per difficulty (round to nearest, adjust remainder)
    const easyTarget = Math.round((difficultyDistribution.easy / 100) * count);
    const hardTarget = Math.round((difficultyDistribution.hard / 100) * count);
    const mediumTarget = count - easyTarget - hardTarget; // remainder goes to medium

    // Helper: randomly sample N documents from a difficulty pool
    async function sampleByDifficulty(
        difficulty: 'easy' | 'medium' | 'hard',
        target: number,
    ): Promise<string[]> {
        if (target <= 0) return [];

        const pipeline = [
            { $match: { ...baseFilter, difficulty } },
            { $sample: { size: target } },
            { $project: { _id: 1 } },
        ];

        const docs = await QuestionBankQuestion.aggregate(pipeline);
        return docs.map((d) => d._id.toString());
    }

    const [easyIds, mediumIds, hardIds] = await Promise.all([
        sampleByDifficulty('easy', easyTarget),
        sampleByDifficulty('medium', mediumTarget),
        sampleByDifficulty('hard', hardTarget),
    ]);

    const selectedIds = [...easyIds, ...mediumIds, ...hardIds];

    // Shuffle the combined result so difficulties are interleaved
    shuffleArray(selectedIds);

    return selectedIds;
}

// ─── Step 3: Update Settings ────────────────────────────────

/**
 * Update exam settings (marks, negative marking, pass %, shuffle, visibility,
 * anti-cheat, assigned groups).
 *
 * Requirement 4.4
 */
export async function updateSettings(
    examId: string,
    settings: ExamSettingsDto,
): Promise<void> {
    const exam = await Exam.findById(examId);
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }
    if (exam.status !== 'draft') {
        throw new Error('Can only update settings on a draft exam');
    }

    // Marks per question
    exam.defaultMarksPerQuestion = settings.marksPerQuestion;

    // Negative marking
    exam.negativeMarking = settings.negativeMarking > 0;
    exam.negativeMarkValue = settings.negativeMarking;

    // Recalculate totalMarks based on question count and new marks per question
    const questionCount = exam.questionOrder?.length || exam.totalQuestions || 0;
    exam.totalMarks = questionCount * settings.marksPerQuestion;

    // Shuffle settings
    exam.randomizeQuestions = settings.shuffleQuestions;
    exam.randomizeOptions = settings.shuffleOptions;

    // Result display mode
    exam.resultPublishMode = settings.showResultMode === 'immediately'
        ? 'immediate'
        : settings.showResultMode === 'after_deadline'
            ? 'scheduled'
            : 'manual';
    exam.showAnswersAfterExam = settings.showResultMode === 'immediately';

    // Attempt limit
    exam.attemptLimit = settings.maxAttempts;
    exam.allowReAttempt = settings.maxAttempts > 1;

    // Assigned groups
    const groupObjectIds = settings.assignedGroups.map(toObjectId);
    exam.targetGroupIds = groupObjectIds;
    if (exam.accessControl) {
        exam.accessControl.allowedGroupIds = groupObjectIds;
    }

    // Visibility
    exam.visibilityMode = settings.visibility === 'public'
        ? 'all_students'
        : settings.visibility === 'group_only'
            ? 'group_only'
            : settings.visibility === 'private'
                ? 'custom'
                : 'custom'; // invite_only maps to custom
    exam.accessMode = settings.visibility === 'public' ? 'all' : 'specific';

    // Anti-cheat settings
    exam.security_policies = {
        tab_switch_limit: settings.antiCheat.tab_switch_detect ? 3 : 0,
        copy_paste_violations: settings.antiCheat.copy_paste_disabled ? 3 : 0,
        camera_enabled: false,
        require_fullscreen: settings.antiCheat.fullscreen_mode,
        auto_submit_on_violation: settings.antiCheat.tab_switch_detect,
        violation_action: 'warn',
    };

    await exam.save();
}

// ─── Step 4: Update Scheduling ──────────────────────────────

/**
 * Update exam scheduling and pricing configuration.
 *
 * Requirement 4.5
 */
export async function updateScheduling(
    examId: string,
    scheduling: ExamSchedulingDto,
): Promise<void> {
    const exam = await Exam.findById(examId);
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }
    if (exam.status !== 'draft') {
        throw new Error('Can only update scheduling on a draft exam');
    }

    // Schedule type
    exam.exam_schedule_type = scheduling.exam_schedule_type;

    // Start/end times
    if (scheduling.startTime) {
        exam.startDate = scheduling.startTime;
    }
    if (scheduling.endTime) {
        exam.endDate = scheduling.endTime;
    }

    // Result publish time
    if (scheduling.resultPublishTime) {
        exam.resultPublishDate = scheduling.resultPublishTime;
    }

    // Pricing
    exam.pricing = {
        isFree: scheduling.pricing.isFree,
        amountBDT: scheduling.pricing.amountBDT ?? 0,
        couponCodes: scheduling.pricing.couponCodes ?? [],
    };
    exam.paymentRequired = !scheduling.pricing.isFree;
    exam.priceBDT = scheduling.pricing.isFree ? undefined : scheduling.pricing.amountBDT;

    await exam.save();
}

// ─── Step 5: Publish Exam ───────────────────────────────────

/**
 * Validate that all required fields are set, then change status to 'scheduled'
 * and mark isPublished = true.
 *
 * Validation checks:
 * - Exam must be in draft status
 * - At least 1 question must be selected (Requirement 4.9)
 * - Duration must be set
 * - Start and end dates must be set
 *
 * Requirement 4.6, 4.7, 4.9
 */
export async function publishExam(examId: string): Promise<IExam> {
    const exam = await Exam.findById(examId);
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }
    if (exam.status !== 'draft') {
        throw new Error('Only draft exams can be published');
    }

    // Validate required fields
    const errors: string[] = [];

    if (!exam.title || exam.title.trim().length === 0) {
        errors.push('Title is required');
    }
    if (!exam.questionOrder || exam.questionOrder.length < 1) {
        errors.push('At least one question must be selected before publishing');
    }
    if (!exam.duration || exam.duration <= 0) {
        errors.push('Duration must be set and positive');
    }
    if (!exam.startDate) {
        errors.push('Start date is required');
    }
    if (!exam.endDate) {
        errors.push('End date is required');
    }

    if (errors.length > 0) {
        throw new Error(`Cannot publish exam: ${errors.join('; ')}`);
    }

    // Publish the exam
    exam.status = 'scheduled';
    exam.isPublished = true;

    return exam.save();
}

// ─── Clone Exam ─────────────────────────────────────────────

/**
 * Create a copy of an existing exam as a new draft.
 *
 * Copies all configuration (title, questions, settings, scheduling) but
 * resets status to 'draft', isPublished to false, and analytics to zero.
 * The cloned exam gets a new title suffix " (Copy)".
 *
 * Requirement 4.11
 */
export async function cloneExam(sourceExamId: string): Promise<IExam> {
    const source = await Exam.findById(sourceExamId);
    if (!source) {
        throw new Error(`Source exam "${sourceExamId}" not found`);
    }

    // Convert to plain object and strip Mongoose internals
    const sourceObj = source.toObject() as unknown as Record<string, unknown>;
    delete sourceObj._id;
    delete sourceObj.__v;
    delete sourceObj.createdAt;
    delete sourceObj.updatedAt;
    delete sourceObj.slug;
    delete sourceObj.share_link;
    delete sourceObj.short_link;

    const cloned = new Exam({
        ...sourceObj,
        title: `${source.title} (Copy)`,
        title_bn: source.title_bn ? `${source.title_bn} (কপি)` : undefined,
        status: 'draft',
        isPublished: false,

        // Reset analytics
        totalParticipants: 0,
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
    });

    return cloned.save();
}
