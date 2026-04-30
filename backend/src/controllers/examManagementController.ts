import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import { ResponseBuilder } from '../utils/responseBuilder';
import * as ExamBuilderService from '../services/ExamBuilderService';
import * as ExamRunnerService from '../services/ExamRunnerService';
import { computeResult } from '../services/ResultEngineService';
import { getExamLeaderboard } from '../services/LeaderboardService';
import Exam from '../models/Exam';
import ExamResult from '../models/ExamResult';
import AntiCheatViolationLog from '../models/AntiCheatViolationLog';
import ExamSession from '../models/ExamSession';

// ── Exam Management Controller ──────────────────────────────
// Thin handlers delegating to ExamBuilderService, ExamRunnerService,
// ResultEngineService, and LeaderboardService.
// Requirements: 4.1, 5.1, 7.4, 8.3, 17.3, 17.4, 17.5, 17.6

// ═══════════════════════════════════════════════════════════
// Admin Handlers
// ═══════════════════════════════════════════════════════════

// ─── Admin: Create Draft (Step 1) ───────────────────────────

/**
 * POST / — Create a new exam draft.
 */
export async function createDraft(req: AuthRequest, res: Response): Promise<void> {
    try {
        const createdBy = req.user!._id as string;
        const exam = await ExamBuilderService.createExamDraft({ ...req.body, createdBy });
        ResponseBuilder.send(res, 201, ResponseBuilder.created(exam, 'Exam draft created'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── Admin: Update Question Selection (Step 2) ──────────────

/**
 * PUT /:id/questions — Set selected questions on a draft exam.
 */
export async function updateQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        await ExamBuilderService.updateQuestionSelection(String(req.params.id), req.body.questionIds);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Questions updated'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('draft') ? 400 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Auto-Pick Questions (Step 2 alternative) ────────

/**
 * POST /:id/auto-pick — Auto-select questions by difficulty distribution.
 */
export async function autoPick(req: AuthRequest, res: Response): Promise<void> {
    try {
        const questionIds = await ExamBuilderService.autoPick(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ questionIds }, 'Questions auto-picked'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('draft') ? 400 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Update Settings (Step 3) ────────────────────────

/**
 * PUT /:id/settings — Update exam settings (marks, shuffle, visibility, anti-cheat).
 */
export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
        await ExamBuilderService.updateSettings(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Settings updated'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('draft') ? 400 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Update Scheduling (Step 4) ──────────────────────

/**
 * PUT /:id/scheduling — Update exam scheduling and pricing.
 */
export async function updateScheduling(req: AuthRequest, res: Response): Promise<void> {
    try {
        await ExamBuilderService.updateScheduling(String(req.params.id), req.body);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Scheduling updated'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : message.includes('draft') ? 400 : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Preview Exam ────────────────────────────────────

/**
 * GET /:id/preview — Preview an exam with its questions before publishing.
 */
export async function previewExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await Exam.findById(String(req.params.id)).populate('questionOrder').lean();
        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(exam));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── Admin: Publish Exam (Step 5) ───────────────────────────

/**
 * POST /:id/publish — Validate and publish a draft exam.
 */
export async function publishExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await ExamBuilderService.publishExam(String(req.params.id));
        ResponseBuilder.send(res, 200, ResponseBuilder.success(exam, 'Exam published'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404
            : message.includes('Cannot publish') || message.includes('Only draft') ? 400
                : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Clone Exam ──────────────────────────────────────

/**
 * POST /:id/clone — Clone an existing exam as a new draft.
 */
export async function cloneExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await ExamBuilderService.cloneExam(String(req.params.id));
        ResponseBuilder.send(res, 201, ResponseBuilder.created(exam, 'Exam cloned'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Get Pending Evaluation Results ──────────────────

/**
 * GET /:id/results/pending-evaluation — Fetch all exam results that need
 * written-answer grading for the given exam.
 */
export async function getPendingEvaluationResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id);
        if (!/^[a-fA-F0-9]{24}$/.test(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam ID format'));
            return;
        }

        // Fetch all results for this exam that have written answers
        const results = await ExamResult.find({
            exam: examId,
            $or: [
                { status: 'pending_evaluation' },
                { 'answers.questionType': 'written' },
            ],
        }).populate('student', '_id full_name username email');

        // Keep results where status is pending_evaluation OR at least one
        // written answer lacks a corresponding writtenGrades entry
        const filtered = results.filter((result) => {
            if (result.status === 'pending_evaluation') return true;
            const writtenAnswers = result.answers.filter((a) => a.questionType === 'written');
            if (writtenAnswers.length === 0) return false;
            const gradedQuestionIds = new Set(
                (result.writtenGrades || []).map((g) => String(g.questionId)),
            );
            return writtenAnswers.some((a) => !gradedQuestionIds.has(String(a.question)));
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success(filtered));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Grade Written Answer ────────────────────────────

/**
 * POST /results/:resultId/grade — Grade a single written answer
 * in an exam result.
 */
export async function gradeWrittenAnswer(req: AuthRequest, res: Response): Promise<void> {
    try {
        const resultId = String(req.params.resultId);
        if (!/^[a-fA-F0-9]{24}$/.test(resultId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid result ID format'));
            return;
        }

        const result = await ExamResult.findById(resultId);
        if (!result) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Result not found'));
            return;
        }

        const { questionId, marks, maxMarks, feedback } = req.body;

        // Verify questionId corresponds to a written-type answer
        const writtenAnswer = result.answers.find(
            (a) => String(a.question) === questionId && a.questionType === 'written',
        );
        if (!writtenAnswer) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Question is not a written-type answer'));
            return;
        }

        // Upsert entry in writtenGrades array
        const gradeEntry = {
            questionId,
            marks,
            maxMarks,
            feedback: feedback || '',
            gradedBy: req.user!._id,
            gradedAt: new Date(),
        };

        const existingIndex = (result.writtenGrades || []).findIndex(
            (g) => String(g.questionId) === questionId,
        );

        if (existingIndex >= 0) {
            result.writtenGrades![existingIndex] = gradeEntry as any;
        } else {
            if (!result.writtenGrades) {
                result.writtenGrades = [];
            }
            result.writtenGrades.push(gradeEntry as any);
        }

        // Check if all written answers have corresponding writtenGrades entries
        const writtenAnswers = result.answers.filter((a) => a.questionType === 'written');
        const grades = result.writtenGrades || [];
        const gradedQuestionIds = new Set(
            grades.map((g) => String(g.questionId)),
        );
        const allGraded = writtenAnswers.every((a) => gradedQuestionIds.has(String(a.question)));

        if (allGraded) {
            // Recalculate: MCQ marksObtained + written grades marks
            const mcqMarks = result.answers
                .filter((a) => a.questionType !== 'written')
                .reduce((sum, a) => sum + (a.marksObtained || 0), 0);

            const writtenMarks = grades.reduce((sum, g) => sum + g.marks, 0);

            result.obtainedMarks = mcqMarks + writtenMarks;
            result.percentage = result.totalMarks > 0
                ? (result.obtainedMarks / result.totalMarks) * 100
                : 0;
            result.status = 'evaluated';
        }

        await result.save();

        ResponseBuilder.send(res, 200, ResponseBuilder.success(result));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Anti-Cheat Report ───────────────────────────────

/**
 * GET /:id/anti-cheat-report — Generate a comprehensive anti-cheat
 * violation report for the given exam.
 */
export async function getAntiCheatReport(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id);
        if (!/^[a-fA-F0-9]{24}$/.test(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam ID format'));
            return;
        }

        const examObjectId = new mongoose.Types.ObjectId(examId);

        const [summaryResult, byType, flaggedSessions] = await Promise.all([
            // Summary: total violations, distinct sessions, distinct students
            AntiCheatViolationLog.aggregate([
                { $match: { exam: examObjectId } },
                {
                    $group: {
                        _id: null,
                        totalViolations: { $sum: 1 },
                        flaggedSessions: { $addToSet: '$session' },
                        uniqueStudentsFlagged: { $addToSet: '$student' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        totalViolations: 1,
                        flaggedSessions: { $size: '$flaggedSessions' },
                        uniqueStudentsFlagged: { $size: '$uniqueStudentsFlagged' },
                    },
                },
            ]),

            // By Type: group by violationType, count each
            AntiCheatViolationLog.aggregate([
                { $match: { exam: examObjectId } },
                {
                    $group: {
                        _id: '$violationType',
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        violationType: '$_id',
                        count: 1,
                    },
                },
            ]),

            // Flagged Sessions: sessions with violationsCount > 0
            ExamSession.find({ exam: examId, violationsCount: { $gt: 0 } })
                .populate('student', '_id full_name email')
                .select('student violationsCount deviceFingerprint ipAddress submittedAt status')
                .lean(),
        ]);

        const summary = summaryResult.length > 0
            ? summaryResult[0]
            : { totalViolations: 0, flaggedSessions: 0, uniqueStudentsFlagged: 0 };

        const report = {
            summary,
            violationsByType: byType,
            flaggedSessions: flaggedSessions.map((session: any) => ({
                sessionId: session._id,
                studentId: session.student?._id || null,
                studentName: session.student?.full_name || null,
                studentEmail: session.student?.email || null,
                violationCount: session.violationsCount,
                deviceFingerprint: session.deviceFingerprint || null,
                ipAddress: session.ipAddress || null,
                submittedAt: session.submittedAt || null,
                status: session.status,
            })),
        };

        ResponseBuilder.send(res, 200, ResponseBuilder.success(report));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Admin: Analytics Overview ───────────────────────────────

/**
 * GET /analytics/overview — Compute exam center metrics with optional
 * date range and exam filters.
 */
export async function getAnalyticsOverview(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { dateFrom, dateTo, examId } = req.query;

        // Validate date formats if provided
        if (dateFrom) {
            const d = new Date(dateFrom as string);
            if (isNaN(d.getTime())) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid date format for dateFrom'));
                return;
            }
        }
        if (dateTo) {
            const d = new Date(dateTo as string);
            if (isNaN(d.getTime())) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid date format for dateTo'));
                return;
            }
        }

        // Validate examId format if provided
        if (examId && !/^[a-fA-F0-9]{24}$/.test(examId as string)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam ID format'));
            return;
        }

        // Build match filter for ExamResult
        const matchFilter: Record<string, any> = {};
        if (examId) {
            matchFilter.exam = new mongoose.Types.ObjectId(examId as string);
        }
        if (dateFrom || dateTo) {
            matchFilter.submittedAt = {};
            if (dateFrom) matchFilter.submittedAt.$gte = new Date(dateFrom as string);
            if (dateTo) matchFilter.submittedAt.$lte = new Date(dateTo as string);
        }

        // Run aggregation pipeline
        const [aggregationResult, totalExams] = await Promise.all([
            ExamResult.aggregate([
                { $match: matchFilter },
                {
                    $group: {
                        _id: null,
                        totalAttempts: { $sum: 1 },
                        averageScore: { $avg: '$percentage' },
                        passCount: {
                            $sum: { $cond: [{ $gte: ['$percentage', 40] }, 1, 0] },
                        },
                        activeStudents: { $addToSet: '$student' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        totalAttempts: 1,
                        averageScore: 1,
                        passCount: 1,
                        activeStudents: { $size: '$activeStudents' },
                    },
                },
            ]),

            // Count total exams with optional date filter on createdAt
            Exam.countDocuments(
                dateFrom || dateTo
                    ? {
                        createdAt: {
                            ...(dateFrom ? { $gte: new Date(dateFrom as string) } : {}),
                            ...(dateTo ? { $lte: new Date(dateTo as string) } : {}),
                        },
                    }
                    : {},
            ),
        ]);

        // Return zeroed metrics when no data exists
        const metrics = aggregationResult.length > 0
            ? {
                totalExams,
                totalAttempts: aggregationResult[0].totalAttempts,
                averageScore: Math.round((aggregationResult[0].averageScore || 0) * 100) / 100,
                passRate: aggregationResult[0].totalAttempts > 0
                    ? Math.round((aggregationResult[0].passCount / aggregationResult[0].totalAttempts) * 100 * 100) / 100
                    : 0,
                activeStudents: aggregationResult[0].activeStudents,
            }
            : {
                totalExams,
                totalAttempts: 0,
                averageScore: 0,
                passRate: 0,
                activeStudents: 0,
            };

        ResponseBuilder.send(res, 200, ResponseBuilder.success(metrics));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404 : 500;
        const code = status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ═══════════════════════════════════════════════════════════
// Student Handlers
// ═══════════════════════════════════════════════════════════

// ─── Student: Start Exam ────────────────────────────────────

/**
 * POST /:id/start — Start an exam session for the authenticated student.
 */
export async function startExamSession(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id as string;
        const result = await ExamRunnerService.startExam(
            String(req.params.id),
            studentId,
            req.body.deviceInfo,
        );
        ResponseBuilder.send(res, 201, ResponseBuilder.created(result, 'Exam session started'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404
            : message.includes('not published') || message.includes('not started')
                || message.includes('ended') || message.includes('Maximum attempts')
                || message.includes('access') ? 403
                : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Student: Save Answers ──────────────────────────────────

/**
 * PATCH /sessions/:id/answers — Auto-save answers for an in-progress session.
 */
export async function saveAnswers(req: AuthRequest, res: Response): Promise<void> {
    try {
        await ExamRunnerService.saveAnswers(String(req.params.id), req.body.answers);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Answers saved'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404
            : message.includes('not in progress') || message.includes('expired')
                || message.includes('no longer active') ? 400
                : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Student: Submit Exam ───────────────────────────────────

/**
 * POST /:id/submit — Submit an exam session (manual or auto-timeout).
 */
export async function submitExamSession(req: AuthRequest, res: Response): Promise<void> {
    try {
        const submissionType = req.body.submissionType === 'auto_timeout' ? 'auto_timer' as const : 'manual' as const;
        const session = await ExamRunnerService.submitExam(req.body.sessionId, submissionType);

        // Trigger result computation asynchronously
        computeResult(String(session._id)).catch(() => {
            // Result computation errors are logged internally; don't block the response
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ sessionId: session._id }, 'Exam submitted'));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        const status = message.includes('not found') ? 404
            : message.includes('already been submitted') ? 400
                : 500;
        const code = status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR';
        ResponseBuilder.send(res, status, ResponseBuilder.error(code, message));
    }
}

// ─── Student: Get Result ────────────────────────────────────

/**
 * GET /:id/result — Get the exam result for the authenticated student.
 */
export async function getResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id as string;
        const result = await ExamResult.findOne({
            exam: String(req.params.id),
            student: studentId,
        }).lean();

        if (!result) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Result not found'));
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success(result));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── Student: Get Leaderboard ───────────────────────────────

/**
 * GET /:id/leaderboard — Get the leaderboard for a specific exam.
 */
export async function getExamLeaderboardHandler(req: AuthRequest, res: Response): Promise<void> {
    try {
        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const studentId = req.user?._id as string | undefined;
        const leaderboard = await getExamLeaderboard(String(req.params.id), page, studentId);
        ResponseBuilder.send(res, 200, ResponseBuilder.success(leaderboard));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}
