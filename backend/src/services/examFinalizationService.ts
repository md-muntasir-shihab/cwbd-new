import mongoose from 'mongoose';
import Exam from '../models/Exam';
import ExamSession from '../models/ExamSession';
import ExamResult from '../models/ExamResult';
import Question from '../models/Question';
import StudentProfile from '../models/StudentProfile';
import { syncExamResultToStudentProfile } from './examProfileSyncEngine';

type NormalizedIncomingAnswer = {
    questionId: string;
    selectedAnswer?: string;
    writtenAnswerUrl?: string;
    updatedAtUTC?: Date;
};

type NormalizedCheatFlag = {
    reason: string;
    timestamp: Date;
};

type AnswerConstraintViolation = {
    reason: string;
    questionId: string;
    limit: number;
    attempted: number;
};

export type FinalizeSubmissionType = 'manual' | 'auto_timeout' | 'auto_expired' | 'forced';

export type FinalizeExamSessionInput = {
    examId: string;
    studentId: string;
    attemptId?: string;
    expectedRevision?: number | null;
    submissionType: FinalizeSubmissionType;
    isAutoSubmit: boolean;
    incomingAnswers?: unknown;
    tabSwitchCount?: number;
    cheatFlags?: unknown;
    now?: Date;
    requestMeta?: {
        ipAddress?: string;
        userAgent?: string;
    };
    forcedSubmittedBy?: string;
};

export type FinalizeExamSessionResult =
    | {
        ok: true;
        statusCode: 200;
        alreadySubmitted: boolean;
        exam: any;
        session: any;
        result: any;
        obtainedMarks: number;
        percentage: number;
        correctCount: number;
        wrongCount: number;
        unansweredCount: number;
    }
    | {
        ok: false;
        statusCode: 400 | 404 | 409 | 423;
        message: string;
        latestRevision?: number;
        lockReason?: string;
        violations?: AnswerConstraintViolation[];
    };

function normalizeIncomingAnswers(input: unknown): NormalizedIncomingAnswer[] {
    if (Array.isArray(input)) {
        return input
            .map((item) => {
                const row = item as Record<string, unknown>;
                const updatedAtRaw = String(row.updatedAtUTC || row.savedAt || '').trim();
                const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : undefined;
                return {
                    questionId: String(row.questionId || '').trim(),
                    selectedAnswer: row.selectedAnswer !== undefined ? String(row.selectedAnswer || '') : undefined,
                    writtenAnswerUrl: row.writtenAnswerUrl !== undefined ? String(row.writtenAnswerUrl || '') : undefined,
                    updatedAtUTC: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
                };
            })
            .filter((row) => row.questionId);
    }

    if (input && typeof input === 'object') {
        const answerObject = input as Record<string, unknown>;
        return Object.entries(answerObject)
            .map(([questionId, value]) => {
                if (typeof value === 'string') {
                    return { questionId, selectedAnswer: value };
                }
                const item = (value || {}) as Record<string, unknown>;
                const updatedAtRaw = String(item.updatedAtUTC || item.savedAt || '').trim();
                const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : undefined;
                return {
                    questionId,
                    selectedAnswer: item.selectedAnswer !== undefined ? String(item.selectedAnswer || '') : undefined,
                    writtenAnswerUrl: item.writtenAnswerUrl !== undefined ? String(item.writtenAnswerUrl || '') : undefined,
                    updatedAtUTC: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
                };
            })
            .filter((row) => row.questionId);
    }

    return [];
}

function normalizeCheatFlags(input: unknown): NormalizedCheatFlag[] {
    if (!Array.isArray(input)) return [];
    const now = new Date();
    return input
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const row = entry as Record<string, unknown>;
            const rawReason = String(row.reason || row.eventType || '').trim();
            if (!rawReason) return null;
            return {
                reason: rawReason,
                timestamp: row.timestamp ? new Date(String(row.timestamp)) : now,
            };
        })
        .filter(Boolean) as NormalizedCheatFlag[];
}

function collectSelectionCount(answer: Record<string, unknown>): number {
    const history = Array.isArray(answer.answerHistory)
        ? answer.answerHistory.filter((h) => String((h as Record<string, unknown>).value || '').trim() !== '').length
        : 0;
    if (history > 0) return history;
    return String(answer.selectedAnswer || '').trim() ? 1 : 0;
}

function mergeAnswersWithConstraints({
    existingAnswers,
    incomingAnswers,
    answerEditLimitPerQuestion,
    maxAttemptSelectByQuestion,
    now,
}: {
    existingAnswers: Array<Record<string, unknown>>;
    incomingAnswers: NormalizedIncomingAnswer[];
    answerEditLimitPerQuestion?: number;
    maxAttemptSelectByQuestion: Map<string, number>;
    now: Date;
}): {
    mergedAnswers: Array<Record<string, unknown>>;
    violations: AnswerConstraintViolation[];
} {
    const answerMap = new Map<string, Record<string, unknown>>();
    for (const row of existingAnswers) {
        const questionId = String(row.questionId || '').trim();
        if (!questionId) continue;
        answerMap.set(questionId, {
            questionId,
            selectedAnswer: String(row.selectedAnswer || ''),
            writtenAnswerUrl: String(row.writtenAnswerUrl || ''),
            savedAt: row.savedAt ? new Date(String(row.savedAt)) : now,
            answerHistory: Array.isArray(row.answerHistory) ? row.answerHistory : [],
            changeCount: Number(row.changeCount || 0),
        });
    }

    const violations: AnswerConstraintViolation[] = [];
    const editLimit = Number(answerEditLimitPerQuestion);
    const enforceEditLimit = Number.isFinite(editLimit) && editLimit >= 0;

    for (const incoming of incomingAnswers) {
        const questionId = String(incoming.questionId || '').trim();
        if (!questionId) continue;

        const current = answerMap.get(questionId) || {
            questionId,
            selectedAnswer: '',
            writtenAnswerUrl: '',
            savedAt: now,
            answerHistory: [],
            changeCount: 0,
        };

        const incomingUpdatedAt = incoming.updatedAtUTC && !Number.isNaN(incoming.updatedAtUTC.getTime())
            ? incoming.updatedAtUTC
            : now;
        const currentSavedAt = current.savedAt ? new Date(String(current.savedAt)) : now;
        if (incomingUpdatedAt.getTime() < currentSavedAt.getTime()) {
            continue;
        }

        const prevSelected = String(current.selectedAnswer || '');
        const nextSelected = incoming.selectedAnswer !== undefined ? String(incoming.selectedAnswer || '') : prevSelected;
        const nextWritten = incoming.writtenAnswerUrl !== undefined
            ? String(incoming.writtenAnswerUrl || '')
            : String(current.writtenAnswerUrl || '');

        const selectedChanged = nextSelected !== prevSelected;
        const nextChangeCount = Number(current.changeCount || 0) + (selectedChanged && prevSelected !== '' ? 1 : 0);
        const selectionCount = collectSelectionCount(current);
        const nextSelectionCount = selectedChanged && nextSelected.trim()
            ? selectionCount + 1
            : selectionCount;

        if (enforceEditLimit && nextChangeCount > editLimit) {
            violations.push({
                reason: 'answer_edit_limit_exceeded',
                questionId,
                limit: editLimit,
                attempted: nextChangeCount,
            });
            continue;
        }

        const maxAttemptSelect = Number(maxAttemptSelectByQuestion.get(questionId) || 0);
        if (maxAttemptSelect > 0 && nextSelectionCount > maxAttemptSelect) {
            violations.push({
                reason: 'max_attempt_select_exceeded',
                questionId,
                limit: maxAttemptSelect,
                attempted: nextSelectionCount,
            });
            continue;
        }

        const nextHistory = selectedChanged
            ? [...(Array.isArray(current.answerHistory) ? current.answerHistory : []), { value: nextSelected, timestamp: incomingUpdatedAt }]
            : (Array.isArray(current.answerHistory) ? current.answerHistory : []);

        answerMap.set(questionId, {
            ...current,
            questionId,
            selectedAnswer: nextSelected,
            writtenAnswerUrl: nextWritten,
            savedAt: incomingUpdatedAt,
            answerHistory: nextHistory,
            changeCount: nextChangeCount,
        });
    }

    return {
        mergedAnswers: Array.from(answerMap.values()),
        violations,
    };
}

function detectDevice(ua: string): string {
    if (/mobile/i.test(ua)) return 'Mobile';
    if (/tablet|ipad/i.test(ua)) return 'Tablet';
    return 'Desktop';
}

function detectBrowser(ua: string): string {
    if (/chrome/i.test(ua) && !/edge/i.test(ua)) return 'Chrome';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    if (/edge/i.test(ua)) return 'Edge';
    return 'Unknown';
}

async function updateExamAnalytics(examId: string): Promise<void> {
    const results = await ExamResult.find({ exam: examId }).lean();
    if (results.length === 0) return;
    const marks = results.map((r) => Number(r.obtainedMarks || 0));
    const avg = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;

    await Exam.findByIdAndUpdate(examId, {
        totalParticipants: results.length,
        avgScore: Math.round(avg * 10) / 10,
        highestScore: Math.max(...marks),
        lowestScore: Math.min(...marks),
    });

    const sorted = [...results].sort((a, b) => {
        if (Number(b.obtainedMarks || 0) !== Number(a.obtainedMarks || 0)) {
            return Number(b.obtainedMarks || 0) - Number(a.obtainedMarks || 0);
        }
        if (Number(a.timeTaken || 0) !== Number(b.timeTaken || 0)) {
            return Number(a.timeTaken || 0) - Number(b.timeTaken || 0);
        }
        return new Date(String(a.submittedAt || 0)).getTime() - new Date(String(b.submittedAt || 0)).getTime();
    });

    await Promise.all(
        sorted.map((result, index) => ExamResult.findByIdAndUpdate(result._id, { rank: index + 1 }))
    );
}

async function updateStudentPoints(studentId: string): Promise<void> {
    const results = await ExamResult.find({ student: studentId }).lean();
    const totalPoints = results.reduce((sum, item) => {
        const rankBonus = item.rank ? Math.max(0, 100 - Number(item.rank)) : 0;
        return sum + Number(item.percentage || 0) + rankBonus;
    }, 0);

    const allStudents = await StudentProfile.find({}).sort({ points: -1 }).select('user_id points').lean();
    const myIndex = allStudents.findIndex((row) => String(row.user_id) === studentId);

    await StudentProfile.findOneAndUpdate(
        { user_id: studentId },
        {
            points: Math.round(totalPoints),
            rank: myIndex !== -1 ? myIndex + 1 : undefined,
        },
        { upsert: true }
    );
}

export async function finalizeExamSession(input: FinalizeExamSessionInput): Promise<FinalizeExamSessionResult> {
    const examId = String(input.examId || '').trim();
    const studentId = String(input.studentId || '').trim();
    const now = input.now || new Date();

    const exam = await Exam.findById(examId);
    if (!exam) {
        return { ok: false, statusCode: 404, message: 'Exam not found.' };
    }

    const sessionFilter: Record<string, unknown> = { exam: examId, student: studentId };
    if (input.attemptId) sessionFilter._id = input.attemptId;
    const session = await ExamSession.findOne(sessionFilter).sort({ attemptNo: -1 });
    if (!session) {
        return { ok: false, statusCode: 404, message: 'No session found to submit.' };
    }
    if (session.sessionLocked) {
        return {
            ok: false,
            statusCode: 423,
            message: 'Session is locked and cannot be submitted until reviewed.',
            lockReason: String((session as any).lockReason || ''),
        };
    }
    if (input.expectedRevision !== undefined && input.expectedRevision !== null) {
        const expected = Number(input.expectedRevision);
        const current = Number((session as any).attemptRevision || 0);
        if (Number.isFinite(expected) && current !== expected) {
            return {
                ok: false,
                statusCode: 409,
                message: 'Attempt state is stale. Please refresh exam state before submit.',
                latestRevision: current,
            };
        }
    }

    const currentAttemptNo = Number((session as any).attemptNo || 1);
    const existingResult = await ExamResult.findOne({
        exam: examId,
        student: studentId,
        attemptNo: currentAttemptNo,
    }).lean();
    if (existingResult) {
        if (session.isActive) {
            session.isActive = false;
            session.status = 'submitted';
            session.auto_submitted = Boolean((existingResult as any).isAutoSubmitted);
            session.submissionType = input.submissionType;
            session.submittedAt = new Date((existingResult as any).submittedAt || Date.now());
            session.attemptRevision = Number((session as any).attemptRevision || 0) + 1;
            await session.save();
        }
        return {
            ok: true,
            statusCode: 200,
            alreadySubmitted: true,
            exam: exam.toObject(),
            session: session.toObject(),
            result: existingResult as unknown as Record<string, unknown>,
            obtainedMarks: Number((existingResult as any).obtainedMarks || 0),
            percentage: Number((existingResult as any).percentage || 0),
            correctCount: Number((existingResult as any).correctCount || 0),
            wrongCount: Number((existingResult as any).wrongCount || 0),
            unansweredCount: Number((existingResult as any).unansweredCount || 0),
        };
    }

    const assignedQuestionIds = session.answers.map((answer) => String(answer.questionId || '')).filter(Boolean);
    const questions = await Question.find({ _id: { $in: assignedQuestionIds } }).lean();

    const maxAttemptSelectByQuestion = new Map<string, number>();
    for (const row of questions) {
        maxAttemptSelectByQuestion.set(String(row._id), Number((row as Record<string, unknown>).max_attempt_select || 0));
    }

    const merged = mergeAnswersWithConstraints({
        existingAnswers: session.answers.map((answer) => ({
            questionId: answer.questionId,
            selectedAnswer: answer.selectedAnswer,
            writtenAnswerUrl: answer.writtenAnswerUrl,
            answerHistory: answer.answerHistory,
            changeCount: answer.changeCount,
            savedAt: answer.savedAt,
        })),
        incomingAnswers: normalizeIncomingAnswers(input.incomingAnswers).filter((answer) => assignedQuestionIds.includes(answer.questionId)),
        answerEditLimitPerQuestion: Number.isFinite(Number(exam.answerEditLimitPerQuestion))
            ? Number(exam.answerEditLimitPerQuestion)
            : undefined,
        maxAttemptSelectByQuestion,
        now,
    });
    if (merged.violations.length > 0) {
        session.cheat_flags = [
            ...(session.cheat_flags || []),
            ...merged.violations.map((violation) => ({
                reason: `${violation.reason}:${violation.questionId}:${violation.attempted}/${violation.limit}`,
                timestamp: now,
            })),
        ];
        await session.save();
        return {
            ok: false,
            statusCode: 400,
            message: 'Answer constraints violated. Please review your submission.',
            violations: merged.violations,
        };
    }
    session.answers = merged.mergedAnswers as any;

    const answerMap = new Map<string, { selectedAnswer: string; writtenAnswerUrl: string }>(
        merged.mergedAnswers.map((answer) => [
            String(answer.questionId),
            {
                selectedAnswer: String(answer.selectedAnswer || ''),
                writtenAnswerUrl: String(answer.writtenAnswerUrl || ''),
            },
        ])
    );

    let obtainedMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    // Track per-topic performance for strengths/weaknesses analysis
    const topicCorrect = new Map<string, number>();
    const topicTotal = new Map<string, number>();

    const evaluatedAnswers = questions.map((question) => {
        const qId = String(question._id || '');
        const answer = answerMap.get(qId) || { selectedAnswer: '', writtenAnswerUrl: '' };
        const selected = String(answer.selectedAnswer || '');
        const writtenAnswerUrl = String(answer.writtenAnswerUrl || '');
        const rawType = String((question as Record<string, unknown>).questionType || '').trim().toLowerCase();
        const inferredWritten = Boolean(
            writtenAnswerUrl ||
            (!(question as Record<string, unknown>).optionA && !(question as Record<string, unknown>).optionB
                && !(question as Record<string, unknown>).optionC && !(question as Record<string, unknown>).optionD)
        );
        const questionType: 'mcq' | 'written' = rawType === 'written' || rawType === 'mcq'
            ? (rawType as 'mcq' | 'written')
            : (inferredWritten ? 'written' : 'mcq');
        let isCorrect = false;
        let marksObtained = 0;

        if (questionType === 'mcq') {
            isCorrect = selected === question.correctAnswer;
            if (!selected) {
                unansweredCount += 1;
            } else if (isCorrect) {
                correctCount += 1;
                marksObtained = Number(question.marks || 0);
                obtainedMarks += marksObtained;
            } else {
                wrongCount += 1;
                if (exam.negativeMarking) {
                    const negVal = (question as Record<string, unknown>).negativeMarks as number | undefined;
                    obtainedMarks -= Number(negVal ?? exam.negativeMarkValue);
                }
            }
        } else if (!writtenAnswerUrl) {
            unansweredCount += 1;
        }

        // Determine correct/wrong/unanswered indicator
        let correctWrongIndicator: 'correct' | 'wrong' | 'unanswered' = 'unanswered';
        if (questionType === 'mcq') {
            if (!selected) {
                correctWrongIndicator = 'unanswered';
            } else if (isCorrect) {
                correctWrongIndicator = 'correct';
            } else {
                correctWrongIndicator = 'wrong';
            }
        } else {
            correctWrongIndicator = writtenAnswerUrl ? (isCorrect ? 'correct' : 'wrong') : 'unanswered';
        }

        // Track topic performance
        const topic = String((question as Record<string, unknown>).topic || (question as Record<string, unknown>).section || (question as Record<string, unknown>).subject || 'General');
        if (topic && questionType === 'mcq' && selected) {
            topicTotal.set(topic, (topicTotal.get(topic) || 0) + 1);
            if (isCorrect) {
                topicCorrect.set(topic, (topicCorrect.get(topic) || 0) + 1);
            }
        }

        void Question.findByIdAndUpdate(question._id, {
            $inc: {
                totalAttempted: selected || writtenAnswerUrl ? 1 : 0,
                totalCorrect: isCorrect ? 1 : 0,
            },
        }).exec();

        return {
            question: question._id,
            questionType,
            selectedAnswer: selected,
            writtenAnswerUrl: writtenAnswerUrl || undefined,
            isCorrect,
            timeTaken: 0,
            marks: Number(question.marks || 0),
            marksObtained,
            explanation: String((question as Record<string, unknown>).explanation || ''),
            correctWrongIndicator,
            topic,
        };
    });

    obtainedMarks = Math.max(0, obtainedMarks);
    const totalMarks = Number(exam.totalMarks || 0);
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100 * 10) / 10 : 0;
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
    const maxSeconds = Math.max(0, Number(exam.duration || 0) * 60);
    const timeTaken = Math.min(elapsedSeconds, maxSeconds || elapsedSeconds);
    const hasWrittenQuestions = evaluatedAnswers.some((answer) => answer.questionType === 'written');
    const resultStatus = hasWrittenQuestions ? 'submitted' : 'evaluated';

    // Build performance summary with strengths/weaknesses by topic
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    for (const [topic, total] of topicTotal.entries()) {
        const correct = topicCorrect.get(topic) || 0;
        const topicPct = total > 0 ? (correct / total) * 100 : 0;
        if (topicPct >= 70) {
            strengths.push(topic);
        } else if (topicPct < 50) {
            weaknesses.push(topic);
        }
    }
    const performanceSummary = {
        totalScore: obtainedMarks,
        percentage,
        strengths,
        weaknesses,
    };

    const requestUserAgent = String(input.requestMeta?.userAgent || '');
    const requestIp = String(input.requestMeta?.ipAddress || '');

    let resultDoc;
    try {
        resultDoc = await ExamResult.create({
            exam: examId,
            student: studentId,
            attemptNo: currentAttemptNo,
            answers: evaluatedAnswers,
            detailedAnswers: evaluatedAnswers.map((a) => ({
                question: a.question,
                questionType: a.questionType,
                selectedAnswer: a.selectedAnswer,
                isCorrect: a.isCorrect,
                marks: a.marks,
                marksObtained: a.marksObtained,
                explanation: a.explanation,
                correctWrongIndicator: a.correctWrongIndicator,
                topic: a.topic,
            })),
            performanceSummary,
            totalMarks,
            obtainedMarks,
            correctCount,
            wrongCount,
            unansweredCount,
            percentage,
            timeTaken,
            deviceInfo: session.deviceInfo || detectDevice(requestUserAgent),
            browserInfo: session.browserInfo || detectBrowser(requestUserAgent),
            ipAddress: session.ipAddress || requestIp,
            tabSwitchCount: input.tabSwitchCount !== undefined ? input.tabSwitchCount : Number(session.tabSwitchCount || 0),
            isAutoSubmitted: Boolean(input.isAutoSubmit),
            submittedAt: now,
            cheat_flags: [...(session.cheat_flags || []), ...normalizeCheatFlags(input.cheatFlags)],
            status: resultStatus,
        });
    } catch (error: any) {
        if (error?.code === 11000) {
            const duplicate = await ExamResult.findOne({
                exam: examId,
                student: studentId,
                attemptNo: currentAttemptNo,
            }).lean();
            if (duplicate) {
                return {
                    ok: true,
                    statusCode: 200,
                    alreadySubmitted: true,
                    exam: exam.toObject(),
                    session: session.toObject(),
                    result: duplicate as unknown as Record<string, unknown>,
                    obtainedMarks: Number((duplicate as any).obtainedMarks || 0),
                    percentage: Number((duplicate as any).percentage || 0),
                    correctCount: Number((duplicate as any).correctCount || 0),
                    wrongCount: Number((duplicate as any).wrongCount || 0),
                    unansweredCount: Number((duplicate as any).unansweredCount || 0),
                };
            }
        }
        throw error;
    }

    session.isActive = false;
    session.status = 'submitted';
    session.auto_submitted = Boolean(input.isAutoSubmit);
    session.submissionType = input.submissionType;
    session.submittedAt = now;
    session.lastSavedAt = now;
    session.attemptRevision = Number((session as any).attemptRevision || 0) + 1;
    if (input.submissionType === 'forced') {
        session.forcedSubmittedAt = now;
        if (input.forcedSubmittedBy && mongoose.Types.ObjectId.isValid(input.forcedSubmittedBy)) {
            session.forcedSubmittedBy = new mongoose.Types.ObjectId(String(input.forcedSubmittedBy));
        }
    }
    if (input.tabSwitchCount !== undefined) {
        session.tabSwitchCount = Number(input.tabSwitchCount || 0);
    }
    await session.save();

    await updateExamAnalytics(examId);
    await updateStudentPoints(studentId);
    await syncExamResultToStudentProfile({
        exam: exam.toObject() as unknown as Record<string, unknown>,
        result: resultDoc.toObject() as unknown as Record<string, unknown>,
        studentId,
        source: 'internal_result',
        syncMode: 'overwrite_mapped_fields',
        notifyStudent: true,
    });

    return {
        ok: true,
        statusCode: 200,
        alreadySubmitted: false,
        exam: exam.toObject(),
        session: session.toObject(),
        result: resultDoc.toObject(),
        obtainedMarks,
        percentage,
        correctCount,
        wrongCount,
        unansweredCount,
    };
}
