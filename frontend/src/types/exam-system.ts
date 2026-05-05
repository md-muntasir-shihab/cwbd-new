// ═══════════════════════════════════════════════════════════════════════════
// Exam Management System — Frontend Domain Types
// Mirrors backend Mongoose model interfaces as plain TypeScript types.
// All ObjectId references are represented as `string`.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Generic API Response Types ──────────────────────────────────────────

/** Standard API response envelope used by all endpoints. */
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message: string;
}

/** Paginated API response with metadata. */
export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    message: string;
    pagination: PaginationMeta;
}

/** Alias for paginated API response (matches API envelope convention). */
export type ApiPaginatedResponse<T> = PaginatedResponse<T>;

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

/** Pagination request parameters. */
export interface PaginationParams {
    page?: number;
    limit?: number;
    sort?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
}

// ─── Bilingual Text ──────────────────────────────────────────────────────

export interface BilingualText {
    en: string;
    bn: string;
}

export interface BilingualTextOptional {
    en?: string;
    bn?: string;
}

// ─── Enums ───────────────────────────────────────────────────────────────

// Question hierarchy
export type HierarchyLevel = 'group' | 'sub_group' | 'subject' | 'chapter' | 'topic';

// Question types
export type QuestionType = 'mcq' | 'written_cq' | 'fill_blank' | 'true_false' | 'image_mcq';

// Question status
export type QuestionStatus = 'draft' | 'published' | 'archived' | 'flagged';

// Question review status
export type QuestionReviewStatus = 'pending' | 'approved' | 'rejected';

// Difficulty levels
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

// Exam schedule types
export type ExamScheduleType = 'live' | 'practice' | 'scheduled' | 'upcoming';

// Leaderboard types
export type LeaderboardType = 'exam' | 'group' | 'weekly' | 'global' | 'subject';

// League tiers
export type LeagueTier = 'iron' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'platinum';

// Mistake vault mastery status
export type MasteryStatus = 'weak' | 'still_weak' | 'mastered';

// Battle session status
export type BattleStatus = 'pending' | 'active' | 'completed' | 'declined' | 'expired';

// Battle result
export type BattleResult = 'challenger_win' | 'opponent_win' | 'draw' | 'pending';

// Doubt thread status
export type DoubtStatus = 'open' | 'resolved';

// Doubt vote direction
export type VoteDirection = 'up' | 'down';

// Examiner application status
export type ExaminerApplicationStatus = 'pending' | 'approved' | 'rejected';

// Topic mastery level
export type TopicMasteryLevel = 'beginner' | 'intermediate' | 'advanced' | 'mastered';

// Anti-cheat violation types
export type ViolationType =
    | 'tab_switch'
    | 'copy_attempt'
    | 'fullscreen_exit'
    | 'fingerprint_match'
    | 'ip_duplicate';

// Exam result status (extended)
export type ExamResultStatus = 'submitted' | 'evaluated' | 'pending_evaluation';

// Student group join method
export type GroupJoinMethod = 'open' | 'approval_required' | 'invite_only' | 'code_based';

// Student group visibility
export type GroupVisibility = 'public' | 'private' | 'invite_only';

// Badge category
export type BadgeCategory = 'exam' | 'streak' | 'league' | 'battle' | 'practice' | 'milestone';

// Exam submission type
export type SubmissionType = 'manual' | 'auto_timeout' | 'anti_cheat';

// Day of week for study routine
export type DayOfWeek =
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';

// Notification types (exam system additions)
export type ExamNotificationType =
    | 'exam_published'
    | 'exam_starting_soon'
    | 'result_published'
    | 'streak_warning'
    | 'group_membership'
    | 'battle_challenge'
    | 'payment_confirmation'
    | 'routine_reminder'
    | 'doubt_reply';

// ─── Entity Interfaces: New Models ───────────────────────────────────────

/** QuestionSubGroup — 2nd level of hierarchy (between Group and Subject). */
export interface QuestionSubGroup {
    _id: string;
    group_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    iconUrl?: string;
    order: number;
    isActive: boolean;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

/** QuestionChapter — 4th level of hierarchy (between Subject and Topic). */
export interface QuestionChapter {
    _id: string;
    subject_id: string;
    group_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    order: number;
    isActive: boolean;
    questionCount?: number;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

/** LeaderboardEntry — pre-computed rank entry for fast leaderboard retrieval. */
export interface LeaderboardEntry {
    _id: string;
    student: string;
    exam?: string;
    group?: string;
    subject?: string;
    leaderboardType: LeaderboardType;
    periodKey?: string;
    score: number;
    percentage: number;
    rank: number;
    timeTaken: number;
    displayName: string;
    updatedAt: string;
}

/** Accuracy breakdown for a single category (topic, chapter, or subject). */
export interface AccuracyBreakdown {
    correct: number;
    total: number;
    percentage: number;
}

/** Recent score entry in student analytics. */
export interface RecentScoreEntry {
    examId: string;
    score: number;
    percentage: number;
    date: string;
}

/** StudentAnalyticsAggregate — per-student aggregated performance metrics. */
export interface StudentAnalytics {
    _id: string;
    student: string;
    totalExamsTaken: number;
    averageScore: number;
    averagePercentage: number;
    topicAccuracy: Record<string, AccuracyBreakdown>;
    chapterAccuracy: Record<string, AccuracyBreakdown>;
    subjectAccuracy: Record<string, AccuracyBreakdown>;
    recentScores: RecentScoreEntry[];
    avgTimePerQuestion: number;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
    xpTotal: number;
    leagueTier: LeagueTier;
    weakestTopics: string[];
    updatedAt: string;
}

/** MistakeVaultEntry — per-student incorrect question record. */
export interface MistakeVaultEntry {
    _id: string;
    student: string;
    question: string;
    exam?: string;
    selectedAnswer: string;
    correctAnswer: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    attemptDate: string;
    retryCount: number;
    masteryStatus: MasteryStatus;
    lastRetryDate?: string;
    createdAt: string;
    updatedAt: string;
}

/** Battle answer record for a single question. */
export interface BattleAnswer {
    questionId: string;
    answer: string;
    isCorrect: boolean;
    answeredAt: string;
}

/** XP/Coins awarded per player in a battle. */
export interface BattleReward {
    challenger: number;
    opponent: number;
}

/** BattleSession — live 1v1 MCQ battle record. */
export interface BattleSession {
    _id: string;
    challenger: string;
    opponent: string;
    topic?: string;
    subject?: string;
    questions: string[];
    status: BattleStatus;
    duration: number;
    challengerAnswers: BattleAnswer[];
    opponentAnswers: BattleAnswer[];
    challengerScore: number;
    opponentScore: number;
    winner?: string;
    result: BattleResult;
    xpAwarded: BattleReward;
    coinsAwarded: BattleReward;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}

/** Coupon code entry within an exam package. */
export interface PackageCouponCode {
    code: string;
    discountPercent: number;
    maxUses: number;
    usedCount: number;
    expiresAt: string;
}

/** ExamPackage — bundled exam package for sale. */
export interface ExamPackage {
    _id: string;
    title: string;
    title_bn?: string;
    description?: string;
    exams: string[];
    priceBDT: number;
    discountPercentage: number;
    couponCodes: PackageCouponCode[];
    validFrom: string;
    validUntil: string;
    createdBy: string;
    isActive: boolean;
    purchaseCount: number;
    createdAt: string;
    updatedAt: string;
}

/** Streak calendar day entry. */
export interface StreakCalendarDay {
    date: string;
    active: boolean;
}

/** StreakRecord — student streak tracking. */
export interface StreakRecord {
    _id: string;
    student: string;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
    streakCalendar: StreakCalendarDay[];
    createdAt: string;
    updatedAt: string;
}

/** League history entry. */
export interface LeagueHistoryEntry {
    tier: string;
    achievedAt: string;
}

/** LeagueProgress — student league progression. */
export interface LeagueProgress {
    _id: string;
    student: string;
    currentTier: LeagueTier;
    mockTestsCompleted: number;
    xpMultiplier: number;
    promotedAt?: string;
    history: LeagueHistoryEntry[];
    createdAt: string;
    updatedAt: string;
}

/** Study routine item for a single day. */
export interface RoutineItem {
    subject: string;
    topic?: string;
    goal: string;
    completed: boolean;
}

/** Daily schedule entry in a study routine. */
export interface DailySchedule {
    day: DayOfWeek;
    items: RoutineItem[];
}

/** Exam countdown entry. */
export interface ExamCountdown {
    examTitle: string;
    examDate: string;
}

/** StudyRoutine — student weekly study schedule. */
export interface StudyRoutine {
    _id: string;
    student: string;
    weeklySchedule: DailySchedule[];
    examCountdowns: ExamCountdown[];
    adherencePercentage: number;
    createdAt: string;
    updatedAt: string;
}

/** Voter record in a doubt reply. */
export interface DoubtVoter {
    userId: string;
    vote: VoteDirection;
}

/** Reply within a doubt thread. */
export interface DoubtReply {
    _id?: string;
    author: string;
    content: string;
    upvotes: number;
    downvotes: number;
    voters: DoubtVoter[];
    isPinned: boolean;
    createdAt: string;
}

/** DoubtThread — AI explanation + community discussion per question. */
export interface DoubtThread {
    _id: string;
    question: string;
    createdBy: string;
    aiExplanation?: string;
    status: DoubtStatus;
    replies: DoubtReply[];
    replyCount: number;
    createdAt: string;
    updatedAt: string;
}

/** Examiner application data. */
export interface ExaminerApplicationData {
    institutionName?: string;
    experience?: string;
    subjects?: string[];
    reason: string;
}

/** ExaminerApplication — examiner role application. */
export interface ExaminerApplication {
    _id: string;
    user: string;
    status: ExaminerApplicationStatus;
    applicationData: ExaminerApplicationData;
    reviewedBy?: string;
    reviewedAt?: string;
    commissionRate: number;
    createdAt: string;
    updatedAt: string;
}

/** TopicMastery — per-student adaptive learning mastery map. */
export interface TopicMastery {
    _id: string;
    student: string;
    topic: string;
    subject?: string;
    masteryLevel: TopicMasteryLevel;
    totalAttempts: number;
    correctCount: number;
    lastScore: number;
    lastPracticeDate: string;
    createdAt: string;
    updatedAt: string;
}

/** XPLog — gamification XP transaction log. */
export interface XPLog {
    _id: string;
    student: string;
    amount: number;
    event: string;
    sourceId?: string;
    multiplier: number;
    createdAt: string;
}

/** CoinLog — gamification coin transaction log. */
export interface CoinLog {
    _id: string;
    student: string;
    amount: number;
    event: string;
    sourceId?: string;
    createdAt: string;
}

/** AntiCheatViolationLog — violation event record. */
export interface AntiCheatViolationLog {
    _id: string;
    session: string;
    student: string;
    exam: string;
    violationType: ViolationType;
    details?: string;
    deviceFingerprint?: string;
    ipAddress?: string;
    timestamp: string;
}

// ─── Extended Model Field Types ──────────────────────────────────────────

/** Exam pricing configuration. */
export interface ExamPricing {
    isFree: boolean;
    amountBDT?: number;
    couponCodes?: string[];
}

/** Per-question marks assignment. */
export interface PerQuestionMarks {
    questionId: string;
    marks: number;
}

/** Written exam grade entry. */
export interface WrittenGrade {
    questionId: string;
    marks: number;
    maxMarks: number;
    feedback: string;
    gradedBy: string;
    aiSuggestedMarks?: number;
    gradedAt: string;
}

/** Badge criteria definition. */
export interface BadgeCriteria {
    type: string;
    threshold: number;
}

// ─── DTO Interfaces: Exam Builder Wizard ─────────────────────────────────

/** Step 1 — Exam basic info. */
export interface ExamInfoDto {
    title: string;
    title_bn?: string;
    description?: string;
    exam_type?: string;
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    durationMinutes: number;
}

/** Step 2 — Question selection (manual pick). */
export interface QuestionSelectionDto {
    questionIds: string[];
}

/** Difficulty distribution for auto-pick. */
export interface DifficultyDistribution {
    easy: number;
    medium: number;
    hard: number;
}

/** Step 2 — Auto-pick configuration. */
export interface AutoPickConfig {
    count: number;
    difficultyDistribution: DifficultyDistribution;
}

/** Step 3 — Exam settings. */
export interface ExamSettingsDto {
    marksPerQuestion?: number;
    negativeMarks?: number;
    passPercentage?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    showResultMode?: 'immediately' | 'after_deadline' | 'manual';
    maxAttempts?: number;
    assignedGroups?: string[];
    visibility?: 'public' | 'group_only' | 'private' | 'invite_only';
    antiCheatSettings?: {
        tabSwitchDetect?: boolean;
        fullscreenMode?: boolean;
        copyPasteDisabled?: boolean;
    };
}

/** Step 4 — Exam scheduling and pricing. */
export interface ExamSchedulingDto {
    examScheduleType: ExamScheduleType;
    examWindowStartUTC?: string;
    examWindowEndUTC?: string;
    resultPublishAtUTC?: string;
    pricing?: ExamPricing;
    packageId?: string;
}

// ─── DTO Interfaces: Question Hierarchy ──────────────────────────────────

/** Create/update group DTO. */
export interface CreateGroupDto {
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    iconUrl?: string;
    color?: string;
    order?: number;
}

export type UpdateGroupDto = Partial<CreateGroupDto>;

/** Create sub-group DTO. */
export interface CreateSubGroupDto {
    group_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    iconUrl?: string;
    order?: number;
}

/** Create subject DTO. */
export interface CreateSubjectDto {
    sub_group_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    order?: number;
}

/** Create chapter DTO. */
export interface CreateChapterDto {
    subject_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    order?: number;
}

/** Create topic DTO. */
export interface CreateTopicDto {
    chapter_id: string;
    code: string;
    title: BilingualText;
    description?: BilingualTextOptional;
    order?: number;
}

/** Reorder nodes DTO. */
export interface ReorderNodesDto {
    level: HierarchyLevel;
    orderedIds: string[];
}

/** Merge nodes DTO. */
export interface MergeNodesDto {
    level: HierarchyLevel;
    sourceId: string;
    targetId: string;
}

// ─── DTO Interfaces: Question Bank ───────────────────────────────────────

/** Question option for creation/update. */
export interface QuestionOptionDto {
    key: string;
    text_en?: string;
    text_bn?: string;
    imageUrl?: string;
    isCorrect: boolean;
}

/** Create question DTO. */
export interface CreateQuestionDto {
    question_type: QuestionType;
    question_en?: string;
    question_bn?: string;
    options: QuestionOptionDto[];
    difficulty: DifficultyLevel;
    marks: number;
    negativeMarks?: number;
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
    tags?: string[];
    explanation_en?: string;
    explanation_bn?: string;
    images?: string[];
    year?: string;
    source?: string;
}

export type UpdateQuestionDto = Partial<CreateQuestionDto>;

/** Question filter parameters. */
export interface QuestionFilters extends PaginationParams {
    q?: string;
    group_id?: string;
    sub_group_id?: string;
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
    difficulty?: DifficultyLevel;
    question_type?: QuestionType;
    status?: QuestionStatus;
    review_status?: QuestionReviewStatus;
    tags?: string[];
    year?: string;
    source?: string;
    archivedOnly?: boolean;
}

/** Bulk action DTO. */
export interface BulkActionDto {
    action: 'archive' | 'status_change' | 'category_reassign' | 'approve' | 'restore' | 'hard_delete';
    ids: string[];
    newStatus?: QuestionStatus;
    targetCategoryId?: string;
}

/** Review action DTO. */
export interface ReviewActionDto {
    action: 'approve' | 'reject';
    reason?: string;
}

/** Bulk operation result. */
export interface BulkResult {
    success: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
}

// ─── DTO Interfaces: Exam Session ────────────────────────────────────────

/** Device info for exam start. */
export interface DeviceInfo {
    fingerprint: string;
    userAgent: string;
    screenResolution?: string;
    timezone?: string;
}

/** Answer update for auto-save. */
export interface AnswerUpdate {
    questionId: string;
    selectedAnswer: string;
    writtenAnswerUrl?: string;
}

/** Violation event for anti-cheat. */
export interface ViolationEvent {
    violationType: ViolationType;
    details?: string;
    timestamp: string;
}

// ─── DTO Interfaces: Gamification & Social ───────────────────────────────

/** Battle challenge DTO. */
export interface BattleChallengeDto {
    opponentId: string;
    topicId?: string;
    subjectId?: string;
}

/** Battle answer submission DTO. */
export interface BattleAnswerDto {
    questionId: string;
    answer: string;
}

/** Study routine update DTO. */
export interface StudyRoutineDto {
    weeklySchedule: DailySchedule[];
    examCountdowns?: ExamCountdown[];
}

/** Create doubt thread DTO. */
export interface DoubtCreateDto {
    questionId: string;
}

/** Post doubt reply DTO. */
export interface DoubtReplyDto {
    content: string;
}

/** Vote on a doubt reply DTO. */
export interface DoubtVoteDto {
    replyId: string;
    vote: VoteDirection;
}

/** Examiner application DTO. */
export interface ExaminerApplicationDto {
    institutionName?: string;
    experience?: string;
    subjects?: string[];
    reason: string;
}

/** Create/update exam package DTO. */
export interface ExamPackageDto {
    title: string;
    title_bn?: string;
    description?: string;
    exams: string[];
    priceBDT: number;
    discountPercentage?: number;
    couponCodes?: PackageCouponCode[];
    validFrom: string;
    validUntil: string;
}

// ─── Hierarchy Tree Response Types ───────────────────────────────────────

/** A single node in the hierarchy tree. */
export interface HierarchyNode {
    _id: string;
    code: string;
    title: BilingualText;
    order: number;
    isActive: boolean;
    level: HierarchyLevel;
    children?: HierarchyNode[];
}

/** Full hierarchy tree response. */
export interface HierarchyTree {
    groups: HierarchyNode[];
}

// ─── Leaderboard Response Types ──────────────────────────────────────────

/** A single page of leaderboard results. */
export interface LeaderboardPage {
    entries: LeaderboardEntry[];
    myEntry?: LeaderboardEntry;
    pagination: PaginationMeta;
}

// ─── Gamification Profile Types ──────────────────────────────────────────

/** Streak info returned from streak update. */
export interface StreakInfo {
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string;
}

/** League status returned from promotion check. */
export interface LeagueStatus {
    currentTier: LeagueTier;
    mockTestsCompleted: number;
    xpMultiplier: number;
    promoted: boolean;
}

/** Combined gamification profile for a student. */
export interface GamificationProfile {
    xpTotal: number;
    coinsBalance: number;
    currentStreak: number;
    longestStreak: number;
    leagueTier: LeagueTier;
    xpMultiplier: number;
    badges: Array<{
        _id: string;
        title: string;
        title_bn?: string;
        category: BadgeCategory;
        iconUrl?: string;
        awardedAt: string;
    }>;
    streakCalendar: StreakCalendarDay[];
}

// ─── Battle Progress Types ───────────────────────────────────────────────

/** Real-time battle progress update. */
export interface BattleProgress {
    battleId: string;
    playerScore: number;
    opponentScore: number;
    questionsAnswered: number;
    totalQuestions: number;
    isCorrect: boolean;
}

// ─── Mistake Vault Filter Types ──────────────────────────────────────────

/** Mistake vault filter parameters. */
export interface MistakeVaultFilters extends PaginationParams {
    subject?: string;
    chapter?: string;
    topic?: string;
    examId?: string;
    masteryStatus?: MasteryStatus;
    dateFrom?: string;
    dateTo?: string;
}

// ─── Import/Export Types ─────────────────────────────────────────────────

/** Import result summary. */
export interface ImportResult {
    totalRows: number;
    successful: number;
    failed: number;
    errors: Array<{ row: number; field?: string; message: string }>;
}

// ─── Score Computation Types ─────────────────────────────────────────────

/** Score breakdown from result computation. */
export interface ScoreBreakdown {
    obtainedMarks: number;
    totalMarks: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    percentage: number;
    passed: boolean;
    timeTakenSeconds: number;
}

// ─── Examiner Dashboard Types ────────────────────────────────────────────

/** Examiner earnings summary. */
export interface ExaminerEarnings {
    totalSales: number;
    commissionDeducted: number;
    netEarnings: number;
    recentTransactions: Array<{
        _id: string;
        amount: number;
        examTitle?: string;
        packageTitle?: string;
        date: string;
    }>;
}
