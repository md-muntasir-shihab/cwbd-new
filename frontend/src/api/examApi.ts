import api from "../services/api";
import { isAxiosError } from "axios";
import type {
    BlockReason,
    ExamDetailResponse,
    ExamListItem,
    ExamListResponse,
    ExamQuestion,
    ExamRules,
    ExamQuestionsResponse,
    OptionKey,
    ResultResponse,
    SaveAnswersPayload,
    SaveAnswersResponse,
    SelectedOptionKey,
    SolutionsResponse,
    StartSessionResponse,
    SubmitExamResponse,
} from "../types/exam";

export interface FetchExamsParams {
    category?: string;
    status?: "live" | "upcoming" | "ended";
    q?: string;
    paid?: "paid" | "free";
    page?: number;
    limit?: number;
}

const examPath = (path: string): string => `/exams${path}`;
const knownOptionKeys: OptionKey[] = ["A", "B", "C", "D"];
const legacyStartBootstrap = new Map<string, ExamQuestionsResponse>();

function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null) return {};
    return value as Record<string, unknown>;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

function asIso(value: unknown, fallback = new Date().toISOString()): string {
    const raw = asString(value);
    if (!raw) return fallback;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function toOptionKey(value: unknown): SelectedOptionKey {
    const normalized = asString(value).toUpperCase();
    if (knownOptionKeys.includes(normalized as OptionKey)) {
        return normalized as OptionKey;
    }
    return null;
}

function mapLegacyReasonToBlockReason(reason: string): BlockReason | null {
    const normalized = reason.trim().toLowerCase();
    switch (normalized) {
        case "login_required":
            return "LOGIN_REQUIRED";
        case "group_restricted":
        case "access_group_restricted":
        case "access_user_restricted":
            return "GROUP_RESTRICTED";
        case "plan_restricted":
        case "access_plan_restricted":
            return "PLAN_RESTRICTED";
        case "subscription_required":
        case "subscription_inactive":
            return "SUBSCRIPTION_REQUIRED";
        case "payment_pending":
        case "payment_required":
            return "PAYMENT_PENDING";
        case "profile_below_70":
        case "profile_incomplete":
            return "PROFILE_BELOW_70";
        case "exam_not_in_window":
        case "outside_exam_window":
            return "EXAM_NOT_IN_WINDOW";
        case "attempt_limit_reached":
        case "max_attempt_limit_reached":
            return "ATTEMPT_LIMIT_REACHED";
        default:
            return null;
    }
}

function mapLockReasonToBlockReason(lockReason: string): BlockReason[] {
    const mapped = mapLegacyReasonToBlockReason(lockReason);
    return mapped ? [mapped] : [];
}

function normalizeBlockReasons(value: unknown): BlockReason[] {
    if (!Array.isArray(value)) return [];
    const mapped = value
        .map((item) => mapLegacyReasonToBlockReason(asString(item)))
        .filter((item): item is BlockReason => Boolean(item));
    return Array.from(new Set(mapped));
}

function normalizeStatus(value: unknown): "live" | "upcoming" | "ended" {
    const normalized = asString(value).toLowerCase();
    if (normalized === "upcoming") return "upcoming";
    if (
        normalized === "ended" ||
        normalized === "past" ||
        normalized === "completed" ||
        normalized === "completed_window"
    ) {
        return "ended";
    }
    return "live";
}

function normalizeAttemptStatus(value: unknown): "not_started" | "in_progress" | "submitted" | undefined {
    const normalized = asString(value).toLowerCase();
    if (normalized === "in_progress" || normalized === "active") return "in_progress";
    if (normalized === "submitted" || normalized === "completed" || normalized === "completed_window") {
        return "submitted";
    }
    if (normalized === "not_started") return "not_started";
    return undefined;
}

function normalizeRules(payload: Record<string, unknown>): ExamRules {
    const nested = asRecord(payload.rules);
    const answerChangeRaw =
        nested.answerChangeLimit !== undefined
            ? nested.answerChangeLimit
            : payload.answerEditLimitPerQuestion;
    return {
        negativeMarkingEnabled: Boolean(
            nested.negativeMarkingEnabled !== undefined
                ? nested.negativeMarkingEnabled
                : payload.negativeMarking,
        ),
        negativePerWrong: asNumber(
            nested.negativePerWrong !== undefined ? nested.negativePerWrong : payload.negativeMarkValue,
            0,
        ),
        answerChangeLimit:
            answerChangeRaw === null || answerChangeRaw === undefined
                ? null
                : Math.max(0, asNumber(answerChangeRaw, 0)),
        showQuestionPalette: Boolean(
            nested.showQuestionPalette !== undefined ? nested.showQuestionPalette : payload.showQuestionPalette,
        ),
        showTimer: Boolean(nested.showTimer !== undefined ? nested.showTimer : payload.showRemainingTime),
        allowBackNavigation: Boolean(
            nested.allowBackNavigation !== undefined ? nested.allowBackNavigation : payload.allowBackNavigation,
        ),
        randomizeQuestions: Boolean(
            nested.randomizeQuestions !== undefined ? nested.randomizeQuestions : payload.randomizeQuestions,
        ),
        randomizeOptions: Boolean(
            nested.randomizeOptions !== undefined ? nested.randomizeOptions : payload.randomizeOptions,
        ),
        autoSubmitOnTimeout: Boolean(
            nested.autoSubmitOnTimeout !== undefined ? nested.autoSubmitOnTimeout : payload.autoSubmitOnTimeout,
        ),
    };
}

function normalizeOptions(question: Record<string, unknown>) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length > 0) {
        return options
            .map((option) => {
                const row = asRecord(option);
                const key = toOptionKey(row.key);
                if (!key) return null;
                return {
                    key,
                    text_en: asString(row.text_en || row.text || row.value) || undefined,
                    text_bn: asString(row.text_bn) || undefined,
                    imageUrl: asString(row.imageUrl || row.image_url) || undefined,
                };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }

    return knownOptionKeys.map((key) => ({
        key,
        text_en: asString(question[`option${key}`]) || undefined,
        text_bn: undefined,
        imageUrl: asString(question[`option${key}ImageUrl`]) || undefined,
    }));
}

function normalizeQuestion(row: Record<string, unknown>, index: number): ExamQuestion {
    return {
        id: asString(row.id || row._id || row.questionId) || `q-${index + 1}`,
        orderIndex: asNumber(row.orderIndex, index),
        question_en: asString(row.question_en || row.question || row.questionText) || undefined,
        question_bn: asString(row.question_bn) || undefined,
        questionImageUrl: asString(row.questionImageUrl || row.questionImage || row.imageUrl) || undefined,
        options: normalizeOptions(row),
        marks: asNumber(row.marks, 1),
        negativeMarks:
            row.negativeMarks === undefined || row.negativeMarks === null
                ? undefined
                : asNumber(row.negativeMarks, 0),
    };
}

function normalizeAnswersFromSession(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .map((answer) => {
            const row = asRecord(answer);
            const questionId = asString(row.questionId || row.question || row._id);
            if (!questionId) return null;
            return {
                questionId,
                selectedKey: toOptionKey(row.selectedKey || row.selectedAnswer || row.selectedOption),
                changeCount: asNumber(row.changeCount, 0),
                updatedAtUTC: asIso(row.updatedAtUTC || row.savedAt),
            };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeExamListPayload(raw: unknown): ExamListResponse {
    const outer = asRecord(raw);
    // Handle ResponseBuilder envelope: { success, data: { items } }
    const payload = outer.data && typeof outer.data === 'object' && !Array.isArray(outer.data)
        ? asRecord(outer.data)
        : outer;
    const isContractShape = Array.isArray(payload.items);
    const itemsSource = isContractShape ? payload.items : payload.exams;
    const items: ExamListItem[] = Array.isArray(itemsSource)
        ? itemsSource.map((entry): ExamListItem => {
            const row = asRecord(entry);
            const lockReason = asString(row.lockReason);
            const blockedReasons = normalizeBlockReasons(row.blockedReasons).length
                ? normalizeBlockReasons(row.blockedReasons)
                : mapLockReasonToBlockReason(lockReason);
            const deliveryMode: ExamListItem["deliveryMode"] =
                asString(row.deliveryMode) === "external_link" ? "external_link" : "internal";
            return {
                id: asString(row.id || row._id),
                serialNo:
                    row.serialNo === undefined || row.serialNo === null
                        ? undefined
                        : asNumber(row.serialNo, 0),
                title: asString(row.title),
                title_bn: asString(row.title_bn) || undefined,
                examCategory: asString(row.examCategory || row.group_category) || "General",
                subject: asString(row.subject || row.groupName) || "General",
                bannerImageUrl: asString(row.bannerImageUrl || row.logoUrl) || undefined,
                examWindowStartUTC: asIso(row.examWindowStartUTC || row.startDate),
                examWindowEndUTC: asIso(row.examWindowEndUTC || row.endDate),
                durationMinutes: Math.max(1, asNumber(row.durationMinutes || row.duration, 1)),
                resultPublishAtUTC: asIso(
                    row.resultPublishAtUTC || row.resultPublishDate || row.examWindowEndUTC || row.endDate,
                ),
                subscriptionRequired: Boolean(row.subscriptionRequired),
                paymentRequired: Boolean(
                    row.paymentRequired !== undefined ? row.paymentRequired : row.paymentPending,
                ),
                priceBDT:
                    row.priceBDT === undefined || row.priceBDT === null
                        ? undefined
                        : asNumber(row.priceBDT, 0),
                attemptLimit: Math.max(1, asNumber(row.attemptLimit, 1)),
                allowReAttempt:
                    row.allowReAttempt !== undefined ? Boolean(row.allowReAttempt) : asNumber(row.attemptLimit, 1) > 1,
                status: normalizeStatus(row.status),
                myAttemptStatus: normalizeAttemptStatus(row.myAttemptStatus || row.status),
                deliveryMode,
                isLocked: Boolean(row.isLocked),
                lockReason: lockReason || undefined,
                canOpenDetails: row.canOpenDetails === undefined ? undefined : Boolean(row.canOpenDetails),
                canStart: row.canStart === undefined ? undefined : Boolean(row.canStart),
                joinUrl: asString(row.joinUrl) || null,
                contactAdmin: {
                    phone: asString(asRecord(row.contactAdmin).phone) || undefined,
                    whatsapp: asString(asRecord(row.contactAdmin).whatsapp) || undefined,
                    messageTemplate: asString(asRecord(row.contactAdmin).messageTemplate) || undefined,
                },
                blockedReasons,
            };
        })
        : [];

    return {
        items,
        page: Math.max(1, asNumber(payload.page, 1)),
        total: Math.max(items.length, asNumber(payload.total, items.length)),
        limit: Math.max(1, asNumber(payload.limit, items.length || 1)),
    };
}

function normalizeExamDetailPayload(raw: unknown, examId: string): ExamDetailResponse {
    const payload = asRecord(raw);
    const exam = asRecord(payload.exam);
    const source = Object.keys(exam).length > 0 ? exam : payload;
    const eligibility = asRecord(payload.eligibility);
    const explicitAccess = asRecord(payload.access);

    const legacyReasons = normalizeBlockReasons(eligibility.reasons);
    const explicitReasons = normalizeBlockReasons(explicitAccess.blockReasons);
    const mergedReasons = Array.from(new Set([...explicitReasons, ...legacyReasons]));

    if (Boolean(eligibility.paymentPending) && !mergedReasons.includes("PAYMENT_PENDING")) {
        mergedReasons.push("PAYMENT_PENDING");
    }
    if (
        asString(eligibility.accessDeniedReason).toLowerCase() === "subscription_required" &&
        !mergedReasons.includes("SUBSCRIPTION_REQUIRED")
    ) {
        mergedReasons.push("SUBSCRIPTION_REQUIRED");
    }

    const explicitStatus = asString(explicitAccess.accessStatus);
    const accessAllowed =
        explicitStatus === "allowed"
            ? true
            : explicitStatus === "blocked"
                ? false
                : eligibility.accessAllowed !== false;

    return {
        id: asString(source.id || source._id) || examId,
        title: asString(source.title),
        title_bn: asString(source.title_bn) || undefined,
        description: asString(source.description) || undefined,
        examCategory: asString(source.examCategory || source.group_category) || "General",
        subject: asString(source.subject || source.groupName) || "General",
        bannerImageUrl: asString(source.bannerImageUrl || source.logoUrl) || undefined,
        examWindowStartUTC: asIso(source.examWindowStartUTC || source.startDate),
        examWindowEndUTC: asIso(source.examWindowEndUTC || source.endDate),
        durationMinutes: Math.max(1, asNumber(source.durationMinutes || source.duration, 1)),
        resultPublishAtUTC: asIso(
            source.resultPublishAtUTC || source.resultPublishDate || source.examWindowEndUTC || source.endDate,
        ),
        rules: normalizeRules(source),
        access: {
            loginRequired: true,
            profileScoreMin: 70,
            subscriptionRequired: Boolean(
                explicitAccess.subscriptionRequired !== undefined
                    ? explicitAccess.subscriptionRequired
                    : source.subscriptionRequired,
            ),
            paymentRequired: Boolean(
                explicitAccess.paymentRequired !== undefined
                    ? explicitAccess.paymentRequired
                    : source.paymentRequired || eligibility.paymentPending,
            ),
            priceBDT:
                source.priceBDT === undefined || source.priceBDT === null
                    ? undefined
                    : asNumber(source.priceBDT, 0),
            accessStatus: accessAllowed ? "allowed" : "blocked",
            blockReasons: accessAllowed ? [] : mergedReasons,
        },
        attemptLimit:
            source.attemptLimit === undefined || source.attemptLimit === null
                ? undefined
                : Math.max(1, asNumber(source.attemptLimit, 1)),
        allowReAttempt:
            source.allowReAttempt === undefined ? undefined : Boolean(source.allowReAttempt),
    };
}

function normalizeSessionQuestionsPayload(raw: unknown): ExamQuestionsResponse {
    const payload = asRecord(raw);
    const examSource = asRecord(payload.exam);
    const sessionSource = asRecord(payload.session);
    const sourceExam = Object.keys(examSource).length > 0 ? examSource : sessionSource;
    const sessionId = asString(sessionSource.sessionId || sessionSource._id || sessionSource.id);
    const submittedAtUTC = asString(sessionSource.submittedAt || sessionSource.submittedAtUTC) || undefined;
    const isActive =
        sessionSource.isActive !== undefined
            ? Boolean(sessionSource.isActive)
            : submittedAtUTC
                ? false
                : asString(sessionSource.status).toLowerCase() !== "submitted";

    const questionsRaw = Array.isArray(payload.questions) ? payload.questions : [];
    const questions = questionsRaw.map((entry, index) => normalizeQuestion(asRecord(entry), index));

    const answersFromContract = normalizeAnswersFromSession(payload.answers);
    const answersFromSession = normalizeAnswersFromSession(sessionSource.answers);
    const answers = answersFromContract.length > 0 ? answersFromContract : answersFromSession;

    return {
        exam: {
            id: asString(sourceExam.id || sourceExam._id || sessionSource.examId || sessionSource.exam) || "",
            title: asString(sourceExam.title || sourceExam.examTitle) || "Exam",
            expiresAtUTC: asIso(sourceExam.expiresAtUTC || sessionSource.expiresAt),
            durationMinutes: Math.max(1, asNumber(sourceExam.durationMinutes || sourceExam.duration, 1)),
            resultPublishAtUTC: asIso(
                sourceExam.resultPublishAtUTC ||
                sourceExam.resultPublishDate ||
                sourceExam.examWindowEndUTC ||
                sourceExam.endDate,
            ),
            rules: normalizeRules(sourceExam),
        },
        session: sessionId
            ? {
                sessionId,
                isActive,
                submittedAtUTC,
                attemptRevision: typeof sessionSource.attemptRevision === 'number'
                    ? sessionSource.attemptRevision as number
                    : 0,
            }
            : undefined,
        questions,
        answers,
        antiCheatPolicy: payload.antiCheatPolicy && typeof payload.antiCheatPolicy === 'object'
            ? payload.antiCheatPolicy as ExamQuestionsResponse['antiCheatPolicy']
            : undefined,
    };
}

function buildBootstrapKey(examId: string, sessionId: string): string {
    return `${examId}:${sessionId}`;
}

function rememberLegacyBootstrap(examId: string, sessionId: string, payload: ExamQuestionsResponse): void {
    const key = buildBootstrapKey(examId, sessionId);
    legacyStartBootstrap.set(key, payload);
}

function readLegacyBootstrap(examId: string, sessionId: string): ExamQuestionsResponse | null {
    const key = buildBootstrapKey(examId, sessionId);
    const cached = legacyStartBootstrap.get(key) || null;
    if (cached) {
        legacyStartBootstrap.delete(key);
    }
    return cached;
}

export const examPdfUrls = {
    questions: (examId: string) => `/api/exams/${examId}/pdf/questions`,
    solutions: (examId: string) => `/api/exams/${examId}/pdf/solutions`,
    answers: (examId: string, sessionId: string) => `/api/exams/${examId}/sessions/${sessionId}/pdf/answers`,
};

function normalizeApiDownloadPath(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/api/")) return url.slice(4);
    if (url === "/api") return "/";
    return url;
}

export const fetchExams = async (params: FetchExamsParams): Promise<ExamListResponse> => {
    const response = await api.get<unknown>("/exams/public-list", { params });
    return normalizeExamListPayload(response.data);
};

export const fetchExamDetail = async (examId: string): Promise<ExamDetailResponse> => {
    try {
        const response = await api.get<unknown>(examPath(`/${examId}`));
        return normalizeExamDetailPayload(response.data, examId);
    } catch (error: unknown) {
        if (!isAxiosError(error)) throw error;
        const status = error.response?.status;
        const raw = error.response?.data;
        if (!raw || !status || ![400, 402, 403].includes(status)) throw error;

        const normalized = normalizeExamDetailPayload(raw, examId);
        const reasons = new Set(normalized.access.blockReasons);
        if (status === 402) reasons.add("PAYMENT_PENDING");
        if (!normalized.access.blockReasons.length && status === 403) {
            reasons.add("SUBSCRIPTION_REQUIRED");
        }

        return {
            ...normalized,
            access: {
                ...normalized.access,
                accessStatus: "blocked",
                blockReasons: Array.from(reasons),
            },
        };
    }
};

export const startExamSession = async (examId: string): Promise<StartSessionResponse> => {
    const normalizeStartPayload = (raw: unknown): StartSessionResponse => {
        const payload = asRecord(raw);
        if (Boolean(payload.redirect) && asString(payload.externalExamUrl)) {
            return {
                sessionId: "external_redirect",
                startedAtUTC: asIso(payload.serverNow),
                expiresAtUTC: asIso(payload.serverNow),
                serverNowUTC: asIso(payload.serverNow),
                redirect: true,
                externalExamUrl: asString(payload.externalExamUrl),
            };
        }

        const directSessionId = asString(payload.sessionId);
        if (directSessionId) {
            return {
                sessionId: directSessionId,
                startedAtUTC: asIso(payload.startedAtUTC),
                expiresAtUTC: asIso(payload.expiresAtUTC),
                serverNowUTC: asIso(payload.serverNowUTC || payload.serverNow),
            };
        }

        const session = asRecord(payload.session);
        const sessionId = asString(session.sessionId || session._id || session.id);
        if (!sessionId) {
            throw new Error("Exam session id missing from payload.");
        }

        const bootstrap = normalizeSessionQuestionsPayload(payload);
        rememberLegacyBootstrap(examId, sessionId, bootstrap);

        return {
            sessionId,
            startedAtUTC: asIso(session.startedAt),
            expiresAtUTC: asIso(session.expiresAt),
            serverNowUTC: asIso(payload.serverNow),
        };
    };

    try {
        const response = await api.post<StartSessionResponse>(examPath(`/${examId}/sessions/start`));
        return normalizeStartPayload(response.data);
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const legacy = await api.post<unknown>(examPath(`/${examId}/start`));
        return normalizeStartPayload(legacy.data);
    }
};

export const fetchSessionQuestions = async (
    examId: string,
    sessionId: string,
): Promise<ExamQuestionsResponse> => {
    try {
        const response = await api.get<unknown>(examPath(`/${examId}/sessions/${sessionId}/questions`));
        return normalizeSessionQuestionsPayload(response.data);
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const bootstrap = readLegacyBootstrap(examId, sessionId);
        if (bootstrap) {
            return bootstrap;
        }

        const legacy = await api.get<unknown>(examPath(`/${examId}/attempt/${sessionId}`));
        return normalizeSessionQuestionsPayload(legacy.data);
    }
};

export const saveAnswers = async (
    examId: string,
    sessionId: string,
    payload: SaveAnswersPayload,
): Promise<SaveAnswersResponse> => {
    const normalizeSavePayload = (raw: unknown): SaveAnswersResponse => {
        const data = asRecord(raw);
        if (Array.isArray(data.updated)) {
            return {
                ok: Boolean(data.ok),
                serverSavedAtUTC: asIso(data.serverSavedAtUTC || data.savedAt),
                updated: normalizeAnswersFromSession(data.updated),
            };
        }

        const serverSavedAtUTC = asIso(data.serverSavedAtUTC || data.savedAt);
        return {
            ok: Boolean(data.ok ?? data.saved ?? true),
            serverSavedAtUTC,
            updated: payload.answers.map((answer) => ({
                questionId: answer.questionId,
                changeCount: 0,
                updatedAtUTC: serverSavedAtUTC,
            })),
        };
    };

    try {
        const response = await api.post<SaveAnswersResponse>(
            examPath(`/${examId}/sessions/${sessionId}/answers`),
            payload,
        );
        return normalizeSavePayload(response.data);
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const legacyPayload = {
            answers: payload.answers.map((answer) => ({
                questionId: answer.questionId,
                selectedAnswer: answer.selectedKey || "",
                clientUpdatedAtUTC: answer.clientUpdatedAtUTC,
            })),
            currentQuestionId: payload.answers[payload.answers.length - 1]?.questionId || "",
        };

        const legacy = await api.post<unknown>(examPath(`/${examId}/attempt/${sessionId}/answer`), legacyPayload);
        return normalizeSavePayload(legacy.data);
    }
};

export const submitExam = async (examId: string, sessionId: string): Promise<SubmitExamResponse> => {
    const normalizeSubmitPayload = (raw: unknown): SubmitExamResponse => {
        const payload = asRecord(raw);
        return {
            ok: Boolean(payload.ok ?? payload.submitted ?? true),
            submittedAtUTC: asIso(payload.submittedAtUTC || payload.submittedAt || payload.savedAt),
        };
    };

    try {
        const response = await api.post<SubmitExamResponse>(examPath(`/${examId}/sessions/${sessionId}/submit`));
        return normalizeSubmitPayload(response.data);
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const legacy = await api.post<unknown>(examPath(`/${examId}/attempt/${sessionId}/submit`), {
            attemptId: sessionId,
        });
        return normalizeSubmitPayload(legacy.data);
    }
};

export const fetchExamResult = async (examId: string, sessionId: string): Promise<ResultResponse> => {
    try {
        const response = await api.get<ResultResponse>(examPath(`/${examId}/sessions/${sessionId}/result`));
        return response.data;
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const legacy = await api.get<unknown>(examPath(`/${examId}/result`));
        const payload = asRecord(legacy.data);
        const nowIso = new Date().toISOString();

        if (!Boolean(payload.resultPublished)) {
            return {
                status: "locked",
                publishAtUTC: asIso(payload.publishDate || asRecord(payload.exam).resultPublishDate, nowIso),
                serverNowUTC: nowIso,
            };
        }

        const result = asRecord(payload.result);
        const answers = Array.isArray(result.answers) ? result.answers : [];
        const correctCount =
            result.correctCount !== undefined
                ? asNumber(result.correctCount, 0)
                : answers.filter((item) => Boolean(asRecord(item).isCorrect)).length;
        const skippedCount =
            result.skippedCount !== undefined
                ? asNumber(result.skippedCount, 0)
                : asNumber(result.unansweredCount, 0);
        const wrongCount =
            result.wrongCount !== undefined
                ? asNumber(result.wrongCount, 0)
                : Math.max(answers.length - correctCount - skippedCount, 0);

        return {
            status: "published",
            obtainedMarks: asNumber(result.obtainedMarks, 0),
            totalMarks: asNumber(result.totalMarks || asRecord(payload.exam).totalMarks, 0),
            correctCount,
            wrongCount,
            skippedCount,
            percentage: asNumber(result.percentage, 0),
            rank:
                result.rank === undefined || result.rank === null ? undefined : asNumber(result.rank, 0),
            timeTakenSeconds: asNumber(result.timeTakenSeconds || result.timeTaken, 0),
            detailedAnswers: Array.isArray(result.detailedAnswers)
                ? (result.detailedAnswers as unknown[]).map((a) => {
                    const item = asRecord(a);
                    return {
                        questionId: String(item.questionId || ''),
                        question: String(item.question || ''),
                        questionImage: item.questionImage ? String(item.questionImage) : undefined,
                        selectedAnswer: String(item.selectedAnswer || ''),
                        correctAnswer: String(item.correctAnswer || ''),
                        isCorrect: Boolean(item.isCorrect),
                        marks: asNumber(item.marks, 0),
                        marksObtained: asNumber(item.marksObtained, 0),
                        explanation: String(item.explanation || ''),
                        correctWrongIndicator: (String(item.correctWrongIndicator || 'unanswered') as 'correct' | 'wrong' | 'unanswered'),
                        section: item.section ? String(item.section) : undefined,
                    };
                })
                : undefined,
            performanceSummary: payload.performanceSummary
                ? {
                    totalScore: asNumber(asRecord(payload.performanceSummary).totalScore, 0),
                    percentage: asNumber(asRecord(payload.performanceSummary).percentage, 0),
                    strengths: Array.isArray(asRecord(payload.performanceSummary).strengths)
                        ? (asRecord(payload.performanceSummary).strengths as string[])
                        : [],
                    weaknesses: Array.isArray(asRecord(payload.performanceSummary).weaknesses)
                        ? (asRecord(payload.performanceSummary).weaknesses as string[])
                        : [],
                }
                : undefined,
        };
    }
};

export const fetchExamSolutions = async (
    examId: string,
    sessionId: string,
): Promise<SolutionsResponse> => {
    try {
        const response = await api.get<SolutionsResponse>(examPath(`/${examId}/sessions/${sessionId}/solutions`));
        return response.data;
    } catch (error: unknown) {
        if (!isAxiosError(error) || error.response?.status !== 404) throw error;

        const legacy = await api.get<unknown>(examPath(`/${examId}/result`));
        const payload = asRecord(legacy.data);
        const nowIso = new Date().toISOString();

        if (!Boolean(payload.resultPublished)) {
            return {
                status: "locked",
                publishAtUTC: asIso(payload.publishDate || asRecord(payload.exam).resultPublishDate, nowIso),
                serverNowUTC: nowIso,
                reason: "Result not published yet",
            };
        }

        const result = asRecord(payload.result);
        const answerRows = Array.isArray(result.detailedAnswers)
            ? result.detailedAnswers
            : Array.isArray(result.answers)
                ? result.answers
                : [];

        return {
            status: "available",
            items: answerRows.map((item, index) => {
                const row = asRecord(item);
                return {
                    questionId: asString(row.questionId || row.question || row._id) || `q-${index + 1}`,
                    questionText:
                        asString(row.questionText || row.question || row.question_en || row.question_bn) ||
                        `Question ${index + 1}`,
                    selectedKey: toOptionKey(row.selectedKey || row.selectedAnswer || row.selectedOption),
                    correctKey: (toOptionKey(
                        row.correctKey || row.correctAnswer || row.correctOption,
                    ) || "A") as OptionKey,
                    explanationText: asString(row.explanation || row.solution || row.explanationText) || undefined,
                    questionImageUrl: asString(row.questionImageUrl || row.questionImage) || undefined,
                    explanationImageUrl:
                        asString(row.explanationImageUrl || row.solutionImage) || undefined,
                };
            }),
        };
    }
};

export const probePdfEndpoint = async (url: string): Promise<boolean> => {
    const normalizedUrl = normalizeApiDownloadPath(url);
    try {
        const response = await api.request({
            url: normalizedUrl,
            method: "HEAD",
        });
        return response.status !== 404;
    } catch (error) {
        if (isAxiosError(error)) {
            return error.response?.status !== 404;
        }
        return true;
    }
};

export const downloadPdfEndpoint = async (url: string, fallbackFilename: string): Promise<void> => {
    const response = await api.get<BlobPart>(normalizeApiDownloadPath(url), {
        responseType: "blob",
    });

    const contentType = String(response.headers["content-type"] || "application/pdf");
    const blob = new Blob([response.data], { type: contentType });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = objectUrl;
    link.download = fallbackFilename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
};
