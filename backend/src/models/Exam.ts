import mongoose, { Schema, Document } from 'mongoose';
import type { AntiCheatOverrides } from '../types/antiCheat';

/* ── Schedule Window sub-schema ── */
export interface IScheduleWindow {
    startDateTimeUTC: Date;
    endDateTimeUTC: Date;
    allowedDaysOfWeek?: number[]; // 0=Sun..6=Sat
    recurrence?: { type: 'none' | 'weekly' | 'monthly'; interval: number };
}

export interface IExam extends Document {
    title: string;
    slug?: string;
    title_bn?: string;
    type?: 'Science' | 'Arts' | 'Commerce' | 'Mixed'; // Exam Type
    group_category?: 'SSC' | 'HSC' | 'Admission' | 'Custom';
    examCategory?: string;
    subject: string; // Keep for legacy
    subjectBn?: string;
    universityNameBn?: string;
    examType?: 'mcq_only' | 'written_optional';
    classes?: string[];
    subjects?: string[];
    chapters?: string[];
    branchFilters?: string[];
    batchFilters?: string[];

    // JSON defining rules, e.g. [{ subject: 'Physics', difficulty: 'hard', count: 5 }]
    question_selection_rules?: any[];

    description?: string;
    totalQuestions: number;
    totalMarks: number;
    duration: number; // minutes once started
    negativeMarking: boolean;
    negativeMarkValue: number;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    allowBackNavigation: boolean;
    showQuestionPalette: boolean;
    showRemainingTime: boolean;
    autoSubmitOnTimeout: boolean;
    allowPause: boolean;

    /* ── Legacy single window (kept for backward compat) ── */
    startDate: Date;
    endDate: Date;

    /* ── Advanced schedule: multiple windows ── */
    scheduleWindows: IScheduleWindow[];

    /* ── Answer edit limit per question (0 = no edits, undefined = unlimited) ── */
    answerEditLimitPerQuestion?: number;

    /* ── External exam: if set, student redirected instead of in-app exam ── */
    deliveryMode?: 'internal' | 'external_link';
    externalExamUrl?: string;
    examCenterId?: mongoose.Types.ObjectId | null;
    examCenterSnapshot?: {
        name?: string;
        address?: string;
        code?: string;
        note?: string;
    };
    templateId?: mongoose.Types.ObjectId | null;
    importProfileId?: mongoose.Types.ObjectId | null;
    logoUrl?: string;
    share_link?: string;
    short_link?: string;
    share_link_expires_at?: Date;

    /* ── Banner image for this exam ── */
    bannerSource?: 'upload' | 'url' | 'default';
    bannerImageUrl?: string;
    bannerAltText?: string;

    /* ── Result publish scheduling ── */
    resultPublishDate: Date;
    isPublished: boolean;
    publish_results_after_minutes?: number; // 0 for instant
    resultPublishMode?: 'immediate' | 'manual' | 'scheduled';

    /* ── Show answers after exam ── */
    showAnswersAfterExam: boolean;

    /* ── Solutions ── */
    solutionReleaseRule?: 'after_exam_end' | 'after_result_publish' | 'manual';
    solutionsEnabled?: boolean;

    /* ── Default marks per question if not specified per-question ── */
    defaultMarksPerQuestion: number;

    /* ── Access control (flat, legacy) ── */
    accessMode: 'all' | 'specific';
    access_type?: 'restricted' | 'public_link';
    allowedUsers: mongoose.Types.ObjectId[];
    allowed_user_ids?: mongoose.Types.ObjectId[];
    assignedUniversityIds: mongoose.Types.ObjectId[];
    attemptLimit: number;
    allowReAttempt?: boolean;

    /* ── Monetization ── */
    subscriptionRequired?: boolean;
    paymentRequired?: boolean;
    priceBDT?: number;

    /* ── Visibility & Audience (unified) ── */
    visibilityMode?: 'all_students' | 'group_only' | 'subscription_only' | 'custom';
    targetGroupIds?: mongoose.Types.ObjectId[];
    requiresActiveSubscription?: boolean;
    requiresPayment?: boolean;
    minimumProfileScore?: number;
    targetAudienceSummaryCache?: string;
    displayOnDashboard?: boolean;
    displayOnPublicList?: boolean;
    isActive?: boolean;

    /* ── Security / Advanced ── */
    written_upload_enabled?: boolean;
    antiCheatOverrides?: AntiCheatOverrides;
    security_policies?: {
        tab_switch_limit: number;
        copy_paste_violations: number;
        camera_enabled: boolean;
        require_fullscreen: boolean;
        auto_submit_on_violation: boolean;
        violation_action?: 'warn' | 'submit' | 'lock';
    };

    autosave_interval_sec?: number;
    reviewSettings?: {
        showQuestion: boolean;
        showSelectedAnswer: boolean;
        showCorrectAnswer: boolean;
        showExplanation: boolean;
        showSolutionImage: boolean;
    };
    certificateSettings?: {
        enabled: boolean;
        minPercentage: number;
        passOnly: boolean;
        templateVersion: string;
    };
    accessControl?: {
        allowedGroupIds: mongoose.Types.ObjectId[];
        allowedPlanCodes: string[];
        allowedUserIds: mongoose.Types.ObjectId[];
    };

    instructions?: string;
    require_instructions_agreement?: boolean;

    status: 'draft' | 'scheduled' | 'live' | 'closed';

    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;

    /* ── Analytics cached ── */
    totalParticipants: number;
    avgScore: number;
    highestScore: number;
    lowestScore: number;
}

const ScheduleWindowSchema = new Schema({
    startDateTimeUTC: { type: Date, required: true },
    endDateTimeUTC: { type: Date, required: true },
    allowedDaysOfWeek: [{ type: Number, min: 0, max: 6 }],
    recurrence: {
        type: { type: String, enum: ['none', 'weekly', 'monthly'], default: 'none' },
        interval: { type: Number, default: 1 },
    },
}, { _id: false });

const ExamSchema = new Schema<IExam>({
    title: { type: String, required: true, trim: true },
    slug: { type: String, default: '', trim: true },
    title_bn: { type: String, default: '' },
    type: { type: String, enum: ['Science', 'Arts', 'Commerce', 'Mixed'], default: 'Mixed' },
    group_category: { type: String, enum: ['SSC', 'HSC', 'Admission', 'Custom'], default: 'Custom' },
    examCategory: { type: String, default: '', index: true },
    subject: { type: String, required: true },
    subjectBn: { type: String, default: '' },
    universityNameBn: { type: String, default: '' },
    examType: { type: String, enum: ['mcq_only', 'written_optional'], default: 'mcq_only' },
    classes: { type: [String], default: [] },
    subjects: { type: [String], default: [] },
    chapters: { type: [String], default: [] },
    branchFilters: { type: [String], default: [] },
    batchFilters: { type: [String], default: [] },

    question_selection_rules: { type: [Schema.Types.Mixed], default: [] },

    description: String,
    totalQuestions: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    duration: { type: Number, required: true },
    negativeMarking: { type: Boolean, default: false },
    negativeMarkValue: { type: Number, default: 0.25 },
    randomizeQuestions: { type: Boolean, default: false },
    randomizeOptions: { type: Boolean, default: false },
    allowBackNavigation: { type: Boolean, default: true },
    showQuestionPalette: { type: Boolean, default: true },
    showRemainingTime: { type: Boolean, default: true },
    autoSubmitOnTimeout: { type: Boolean, default: true },
    allowPause: { type: Boolean, default: false },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    scheduleWindows: { type: [ScheduleWindowSchema], default: [] },
    answerEditLimitPerQuestion: { type: Number, default: undefined },
    deliveryMode: { type: String, enum: ['internal', 'external_link'], default: 'internal' },
    externalExamUrl: { type: String, default: null },
    examCenterId: { type: Schema.Types.ObjectId, ref: 'ExamCenter', default: null },
    examCenterSnapshot: {
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        code: { type: String, default: '' },
        note: { type: String, default: '' },
    },
    templateId: { type: Schema.Types.ObjectId, ref: 'ExamImportTemplate', default: null },
    importProfileId: { type: Schema.Types.ObjectId, ref: 'ExamMappingProfile', default: null },
    logoUrl: { type: String, default: '' },
    share_link: { type: String, default: '', trim: true },
    short_link: { type: String, default: '', trim: true },
    share_link_expires_at: { type: Date, default: null },
    bannerSource: { type: String, enum: ['upload', 'url', 'default'], default: 'default' },
    bannerImageUrl: { type: String, default: null },
    bannerAltText: { type: String, default: '' },

    resultPublishDate: { type: Date, required: true },
    isPublished: { type: Boolean, default: false },
    publish_results_after_minutes: { type: Number, default: 0 },

    showAnswersAfterExam: { type: Boolean, default: false },

    solutionReleaseRule: { type: String, enum: ['after_exam_end', 'after_result_publish', 'manual'], default: 'after_result_publish' },
    solutionsEnabled: { type: Boolean, default: false },

    defaultMarksPerQuestion: { type: Number, default: 1 },

    accessMode: { type: String, enum: ['all', 'specific'], default: 'all' },
    access_type: { type: String, enum: ['restricted', 'public_link'], default: 'restricted' },

    allowedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    allowed_user_ids: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    assignedUniversityIds: [{ type: Schema.Types.ObjectId, ref: 'University' }],
    attemptLimit: { type: Number, default: 1 },
    allowReAttempt: { type: Boolean, default: false },

    subscriptionRequired: { type: Boolean, default: false },
    paymentRequired: { type: Boolean, default: false },
    priceBDT: { type: Number, default: null },

    visibilityMode: { type: String, enum: ['all_students', 'group_only', 'subscription_only', 'custom'], default: 'all_students' },
    targetGroupIds: [{ type: Schema.Types.ObjectId, ref: 'StudentGroup' }],
    requiresActiveSubscription: { type: Boolean, default: false },
    requiresPayment: { type: Boolean, default: false },
    minimumProfileScore: { type: Number, default: null },
    targetAudienceSummaryCache: { type: String, default: '' },
    displayOnDashboard: { type: Boolean, default: true },
    displayOnPublicList: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },

    written_upload_enabled: { type: Boolean, default: false },
    antiCheatOverrides: { type: Schema.Types.Mixed, default: undefined },
    security_policies: {
        tab_switch_limit: { type: Number, default: 3 },
        copy_paste_violations: { type: Number, default: 3 },
        camera_enabled: { type: Boolean, default: false },
        require_fullscreen: { type: Boolean, default: true },
        auto_submit_on_violation: { type: Boolean, default: false },
        violation_action: { type: String, enum: ['warn', 'submit', 'lock'], default: 'warn' },
    },

    autosave_interval_sec: { type: Number, default: 5 },
    resultPublishMode: { type: String, enum: ['immediate', 'manual', 'scheduled'], default: 'scheduled' },
    reviewSettings: {
        showQuestion: { type: Boolean, default: true },
        showSelectedAnswer: { type: Boolean, default: true },
        showCorrectAnswer: { type: Boolean, default: true },
        showExplanation: { type: Boolean, default: true },
        showSolutionImage: { type: Boolean, default: true },
    },
    certificateSettings: {
        enabled: { type: Boolean, default: false },
        minPercentage: { type: Number, default: 40 },
        passOnly: { type: Boolean, default: true },
        templateVersion: { type: String, default: 'v1' },
    },
    accessControl: {
        allowedGroupIds: [{ type: Schema.Types.ObjectId, ref: 'StudentGroup' }],
        allowedPlanCodes: [{ type: String }],
        allowedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },

    instructions: { type: String, default: '' },
    require_instructions_agreement: { type: Boolean, default: true },

    status: { type: String, enum: ['draft', 'scheduled', 'live', 'closed'], default: 'draft' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    totalParticipants: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    lowestScore: { type: Number, default: 0 },
}, { timestamps: true, collection: 'exam_collection' });

ExamSchema.index({ startDate: 1, endDate: 1, isPublished: 1 });
ExamSchema.index({ status: 1 });
ExamSchema.index({ group_category: 1, startDate: 1 });
ExamSchema.index({ isPublished: 1, startDate: 1, endDate: 1, group_category: 1 });
ExamSchema.index({ share_link: 1 }, { unique: true, sparse: true });
ExamSchema.index({ slug: 1 }, { unique: true, sparse: true });

ExamSchema.pre('validate', function validateExternalExamConfig(next) {
    const doc = this as IExam;
    const deliveryMode = String(doc.deliveryMode || 'internal').trim().toLowerCase();
    const externalExamUrl = String(doc.externalExamUrl || '').trim();
    const slugSeed = String(doc.slug || doc.title || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    if (!doc.slug) {
        doc.slug = slugSeed || `exam-${Date.now()}`;
    } else {
        doc.slug = slugSeed || doc.slug;
    }

    if (deliveryMode === 'external_link') {
        if (!externalExamUrl) {
            next(new Error('externalExamUrl is required when deliveryMode is external_link.'));
            return;
        }
        try {
            const parsed = new URL(externalExamUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                next(new Error('externalExamUrl must start with http:// or https://'));
                return;
            }
            doc.externalExamUrl = parsed.toString();
        } catch {
            next(new Error('externalExamUrl must be a valid URL.'));
            return;
        }
    } else {
        doc.deliveryMode = 'internal';
        doc.externalExamUrl = undefined;
    }

    next();
});

export default mongoose.model<IExam>('Exam', ExamSchema);
