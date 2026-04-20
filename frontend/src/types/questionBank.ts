/* ── Question Bank v2 Types ── */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type LanguageMode = 'en' | 'bn' | 'both';
export type SetMode = 'manual' | 'rule_based';

export interface BankQuestionOption {
    key: 'A' | 'B' | 'C' | 'D';
    text_en: string;
    text_bn: string;
    imageUrl?: string;
}

export interface BankQuestion {
    _id: string;
    bankQuestionId: string;
    subject: string;
    moduleCategory: string;
    topic: string;
    subtopic: string;
    difficulty: Difficulty;
    languageMode: LanguageMode;
    question_en: string;
    question_bn: string;
    questionImageUrl: string;
    options: BankQuestionOption[];
    correctKey: 'A' | 'B' | 'C' | 'D';
    explanation_en: string;
    explanation_bn: string;
    explanationImageUrl: string;
    marks: number;
    negativeMarks: number;
    tags: string[];
    sourceLabel: string;
    chapter: string;
    boardOrPattern: string;
    yearOrSession: string;
    isActive: boolean;
    isArchived: boolean;
    contentHash: string;
    versionNo: number;
    parentQuestionId: string | null;
    createdByAdminId: string;
    updatedByAdminId: string;
    createdAt: string;
    updatedAt: string;
    // Enriched fields from list
    usageCount?: number;
    analytics?: BankQuestionAnalytics | null;
}

export interface BankQuestionAnalytics {
    _id: string;
    bankQuestionId: string;
    totalAppearances: number;
    totalCorrect: number;
    totalWrong: number;
    totalSkipped: number;
    accuracyPercent: number;
    lastUpdatedAtUTC: string;
}

export interface BankQuestionDetail {
    question: BankQuestion;
    usageCount: number;
    analytics: BankQuestionAnalytics | null;
    versions: { _id: string; versionNo: number; createdAt: string }[];
}

export interface BankQuestionListResponse {
    questions: BankQuestion[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    facets: BankQuestionFacets;
}

export interface BankQuestionFacets {
    subjects: string[];
    moduleCategories: string[];
    topics: string[];
    difficulties: string[];
    tags: string[];
}

export interface BankQuestionFilters {
    q?: string;
    subject?: string;
    moduleCategory?: string;
    topic?: string;
    difficulty?: string;
    tag?: string;
    status?: string;
    page?: number;
    limit?: number;
    sort?: string;
}

export interface SetRules {
    subject: string;
    moduleCategory: string;
    topics: string[];
    tags: string[];
    difficultyMix: { easy: number; medium: number; hard: number };
    totalQuestions: number;
    defaultMarks: number;
    defaultNegativeMarks: number;
}

export interface QuestionBankSet {
    _id: string;
    name: string;
    description: string;
    mode: SetMode;
    rules: SetRules;
    selectedBankQuestionIds: string[];
    createdByAdminId: string;
    createdAt: string;
    updatedAt: string;
}

export interface QuestionBankSettings {
    _id: string;
    versioningOnEditIfUsed: boolean;
    duplicateDetectionSensitivity: number;
    defaultMarks: number;
    defaultNegativeMarks: number;
    archiveInsteadOfDelete: boolean;
    allowImageUploads: boolean;
    allowBothLanguages: boolean;
    importSizeLimit: number;
}

export interface ImportPreviewRow {
    rowIndex: number;
    raw: Record<string, unknown>;
    mapped: Record<string, unknown>;
    errors: { row: number; field: string; message: string }[];
    contentHash: string;
}

export interface ImportPreviewResponse {
    totalRows: number;
    headers: string[];
    mapping: Record<string, string>;
    preview: ImportPreviewRow[];
    availableColumns: string[];
}

export interface ImportCommitResponse {
    totalRows: number;
    imported: number;
    skipped: number;
    failed: number;
    errorRows: { row: number; reason: string; data: Record<string, unknown> }[];
}

export interface AnalyticsSummary {
    summary: {
        bySubject: { _id: string; count: number }[];
        byCategory: { _id: string; count: number }[];
        byTopic: { _id: string; count: number }[];
        byDifficulty: { _id: string; count: number }[];
        totalQuestions: number;
        totalActive: number;
        totalArchived: number;
    };
    mostUsed: unknown[];
    lowAccuracy: BankQuestionAnalytics[];
    highSkip: BankQuestionAnalytics[];
    neverUsed: BankQuestion[];
    topicPerformance: {
        _id: { subject: string; topic: string };
        avgAccuracy: number;
        totalQuestions: number;
        totalAttempts: number;
    }[];
}

/* ── Bulk Copy Response ── */

export interface BulkCopyResponse {
    copied: number;
    newQuestions: BankQuestion[];
}

/* ── Question Selector Types ── */

export interface SelectedQuestion {
    bankQuestionId: string;
    question_en?: string;
    question_bn?: string;
    subject: string;
    difficulty: Difficulty;
    options: BankQuestionOption[];
    correctKey: string;
    marks: number;
    orderIndex: number;
}

export interface QuestionSelectorState {
    availableQuestions: BankQuestion[];
    filters: BankQuestionFilters;
    pagination: { page: number; total: number; limit: number };
    facets: BankQuestionFacets;
    isLoading: boolean;
    selectedQuestions: SelectedQuestion[];
    totalMarks: number;
    totalQuestions: number;
}
