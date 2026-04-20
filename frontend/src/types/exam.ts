import type { BankQuestion } from './questionBank';

export type ExamStatus = "live" | "upcoming" | "ended";
export type AttemptStatus = "not_started" | "in_progress" | "submitted";
export type AccessStatus = "allowed" | "blocked";
export type OptionKey = "A" | "B" | "C" | "D";
export type SelectedOptionKey = OptionKey | null;
export type BlockReason =
    | "LOGIN_REQUIRED"
    | "SUBSCRIPTION_REQUIRED"
    | "GROUP_RESTRICTED"
    | "PLAN_RESTRICTED"
    | "PAYMENT_PENDING"
    | "PROFILE_BELOW_70"
    | "EXAM_NOT_IN_WINDOW"
    | "ATTEMPT_LIMIT_REACHED";

export interface ExamListItem {
    id: string;
    serialNo?: number;
    title: string;
    title_bn?: string;
    examCategory: string;
    subject: string;
    bannerImageUrl?: string;
    examWindowStartUTC: string;
    examWindowEndUTC: string;
    durationMinutes: number;
    resultPublishAtUTC: string;
    subscriptionRequired: boolean;
    paymentRequired: boolean;
    priceBDT?: number;
    attemptLimit: number;
    allowReAttempt: boolean;
    status: ExamStatus;
    myAttemptStatus?: AttemptStatus;
    deliveryMode?: "internal" | "external_link";
    isLocked?: boolean;
    lockReason?: string;
    canOpenDetails?: boolean;
    canStart?: boolean;
    joinUrl?: string | null;
    contactAdmin?: {
        phone?: string;
        whatsapp?: string;
        messageTemplate?: string;
    };
    blockedReasons?: BlockReason[];
}

export interface ExamListResponse {
    items: ExamListItem[];
    page: number;
    total: number;
    limit: number;
}

export interface ExamRules {
    negativeMarkingEnabled: boolean;
    negativePerWrong: number;
    answerChangeLimit: number | null;
    showQuestionPalette: boolean;
    showTimer: boolean;
    allowBackNavigation: boolean;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    autoSubmitOnTimeout: boolean;
}

export interface ExamAccess {
    loginRequired: true;
    profileScoreMin: 70;
    subscriptionRequired: boolean;
    paymentRequired: boolean;
    priceBDT?: number;
    accessStatus: AccessStatus;
    blockReasons: BlockReason[];
}

export interface ExamDetailResponse {
    id: string;
    title: string;
    title_bn?: string;
    description?: string;
    examCategory: string;
    subject: string;
    bannerImageUrl?: string;
    examWindowStartUTC: string;
    examWindowEndUTC: string;
    durationMinutes: number;
    resultPublishAtUTC: string;
    rules: ExamRules;
    access: ExamAccess;
    attemptLimit?: number;
    allowReAttempt?: boolean;
}

export interface StartSessionResponse {
    sessionId: string;
    startedAtUTC: string;
    expiresAtUTC: string;
    serverNowUTC: string;
    redirect?: boolean;
    externalExamUrl?: string;
}

export interface ExamQuestionOption {
    key: OptionKey;
    text_en?: string;
    text_bn?: string;
    imageUrl?: string;
}

export interface ExamQuestion {
    id: string;
    orderIndex: number;
    question_en?: string;
    question_bn?: string;
    questionImageUrl?: string;
    options: ExamQuestionOption[];
    marks: number;
    negativeMarks?: number;
}

export interface ExamAnswer {
    questionId: string;
    selectedKey: SelectedOptionKey;
    changeCount: number;
    updatedAtUTC: string;
}

export interface PendingAnswerRow {
    questionId: string;
    selectedKey: SelectedOptionKey;
    clientUpdatedAtUTC: string;
}

export interface RunnerCache {
    answers: Record<string, ExamAnswer>;
    markedQuestionIds: string[];
    unsynced: PendingAnswerRow[];
    lastSavedAtUTC?: string | null;
}

export interface PdfAvailability {
    questions: boolean;
    solutions: boolean;
    answers: boolean;
}

export interface AntiCheatPolicyConfig {
    enableBlurTracking?: boolean;
    enableContextMenuBlock?: boolean;
    requireFullscreen?: boolean;
    enableClipboardBlock?: boolean;
    warningCooldownSeconds?: number;
    tabSwitchLimit?: number;
    copyPasteViolationLimit?: number;
    maxFullscreenExitLimit?: number;
    violationAction?: 'warn' | 'submit' | 'lock';
    allowMobileRelaxedMode?: boolean;
    proctoringSignalsEnabled?: boolean;
    strictExamTabLock?: boolean;
}

export interface ExamQuestionsResponse {
    exam: {
        id: string;
        title: string;
        expiresAtUTC: string;
        durationMinutes: number;
        resultPublishAtUTC: string;
        rules: ExamRules;
    };
    session?: {
        sessionId: string;
        isActive: boolean;
        submittedAtUTC?: string;
        attemptRevision?: number;
    };
    questions: ExamQuestion[];
    answers: ExamAnswer[];
    antiCheatPolicy?: AntiCheatPolicyConfig;
}

export interface SaveAnswersPayload {
    answers: PendingAnswerRow[];
}

export interface SaveAnswersResponse {
    ok: boolean;
    serverSavedAtUTC: string;
    updated: Array<{
        questionId: string;
        changeCount: number;
        updatedAtUTC: string;
    }>;
}

export interface SubmitExamResponse {
    ok: boolean;
    submittedAtUTC: string;
}

export interface ResultResponseLocked {
    status: "locked";
    publishAtUTC: string;
    serverNowUTC: string;
}

export interface ResultResponsePublished {
    status: "published";
    obtainedMarks: number;
    totalMarks: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    percentage: number;
    rank?: number;
    timeTakenSeconds: number;
    detailedAnswers?: {
        questionId?: string;
        question?: string;
        questionImage?: string;
        selectedAnswer?: string;
        correctAnswer?: string;
        isCorrect: boolean;
        marks: number;
        marksObtained: number;
        explanation: string;
        correctWrongIndicator: "correct" | "wrong" | "unanswered";
        section?: string;
    }[];
    performanceSummary?: {
        totalScore: number;
        percentage: number;
        strengths: string[];
        weaknesses: string[];
    };
}

export type ResultResponse = ResultResponseLocked | ResultResponsePublished;

export type SolutionsResponse =
    | {
        status: "locked";
        publishAtUTC: string;
        serverNowUTC: string;
        reason: string;
    }
    | {
        status: "available";
        items: Array<{
            questionId: string;
            questionText: string;
            selectedKey: SelectedOptionKey;
            correctKey: OptionKey;
            explanationText?: string;
            questionImageUrl?: string;
            explanationImageUrl?: string;
        }>;
    };

/* ── Auto-Generate Types ── */

export interface AutoGenerateRequest {
    subject?: string;
    moduleCategory?: string;
    distribution: { easy: number; medium: number; hard: number };
    defaultMarksPerQuestion?: number;
}

export interface AutoGenerateResponse {
    questions: BankQuestion[];
    distribution: {
        easy: { requested: number; available: number; selected: number };
        medium: { requested: number; available: number; selected: number };
        hard: { requested: number; available: number; selected: number };
    };
}

/* ── Bulk Attach Types ── */

export interface BulkAttachRequest {
    questions: Array<{ bankQuestionId: string; marks: number; orderIndex: number }>;
}

/* ── Exam Preview Types ── */

export interface ExamPreviewResponse {
    exam: {
        title: string;
        subject: string;
        duration: number;
        totalMarks: number;
        totalQuestions: number;
        negativeMarking: boolean;
        negativeMarkValue: number;
    };
    questions: Array<{
        orderIndex: number;
        question_en?: string;
        question_bn?: string;
        questionImageUrl?: string;
        options: Array<{ key: string; text_en?: string; text_bn?: string }>;
        marks: number;
    }>;
}
