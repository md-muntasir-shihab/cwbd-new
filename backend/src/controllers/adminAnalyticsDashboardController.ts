/**
 * Admin Analytics Dashboard Controller
 *
 * Aggregates platform-wide metrics for the Exam Center Analytics dashboard.
 * Covers: platform totals, today's snapshot, daily attempt trends,
 * user growth, difficulty distribution, per-exam stats, subject heatmap, revenue.
 *
 * Requirement 27.x
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import { ResponseBuilder } from '../utils/responseBuilder';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import Exam from '../models/Exam';
import ExamResult from '../models/ExamResult';
import User from '../models/User';
import QuestionGroup from '../models/QuestionGroup';
import UserSubscription from '../models/UserSubscription';

// ─── Helpers ─────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
}

function todayStart(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// ─── Controller ──────────────────────────────────────────────────────────

export async function adminGetAnalyticsDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
        const range = String(req.query?.range || 'daily').trim().toLowerCase();
        const lookback = range === 'monthly' ? 365 : range === 'weekly' ? 90 : 30;
        const since = daysAgo(lookback);
        const today = todayStart();

        // ── Platform Metrics (run in parallel) ──
        const [
            totalQuestions,
            totalExams,
            totalAttempts,
            activeStudents,
            totalGroups,
            totalRevenue,
        ] = await Promise.all([
            QuestionBankQuestion.countDocuments({ isActive: true }).catch(() => 0),
            Exam.countDocuments().catch(() => 0),
            ExamResult.countDocuments().catch(() => 0),
            User.countDocuments({ role: 'student', isActive: true }).catch(() => 0),
            QuestionGroup.countDocuments({ isActive: true }).catch(() => 0),
            UserSubscription.aggregate([
                { $match: { status: { $in: ['active', 'expired'] } } },
                { $group: { _id: null, total: { $sum: '$paidAmount' } } },
            ]).then((r) => (r[0]?.total as number) || 0).catch(() => 0),
        ]);

        const platform = {
            totalQuestions,
            totalExams,
            totalAttempts,
            activeStudents,
            totalGroups,
            totalRevenue,
        };

        // ── Today Snapshot ──
        const [activeExamsToday, liveExamCount, recentSignups, popularExamsRaw] = await Promise.all([
            Exam.countDocuments({
                $or: [
                    { status: 'active' },
                    { status: 'published' },
                    { startTime: { $lte: new Date() }, endTime: { $gte: new Date() } },
                ],
            }).catch(() => 0),
            Exam.countDocuments({
                startTime: { $lte: new Date() },
                endTime: { $gte: new Date() },
            }).catch(() => 0),
            User.countDocuments({ role: 'student', createdAt: { $gte: today } }).catch(() => 0),
            ExamResult.aggregate([
                { $match: { createdAt: { $gte: daysAgo(7) } } },
                { $group: { _id: '$examId', attempts: { $sum: 1 } } },
                { $sort: { attempts: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'exams',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'exam',
                    },
                },
                { $unwind: { path: '$exam', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        title: { $ifNull: ['$exam.title', 'Untitled'] },
                        attempts: 1,
                    },
                },
            ]).catch(() => []),
        ]);

        const todayMetrics = {
            activeExams: activeExamsToday,
            liveExamCount,
            recentSignups,
            popularExams: popularExamsRaw as Array<{ title: string; attempts: number }>,
        };

        // ── Daily Attempts Series ──
        const dailyAttempts = await ExamResult.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    attempts: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', attempts: 1 } },
        ]).catch(() => []);

        // ── User Growth Series ──
        const userGrowth = await User.aggregate([
            { $match: { role: 'student', createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    users: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', users: 1 } },
        ]).catch(() => []);

        // ── Difficulty Distribution ──
        const difficultyDistribution = await QuestionBankQuestion.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: { $ifNull: ['$difficulty', 'medium'] },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    level: '$_id',
                    count: 1,
                    wrongPercentage: { $literal: 0 }, // placeholder — no per-question wrong tracking yet
                },
            },
        ]).catch(() => []);

        // ── Per-Exam Statistics (top 20) ──
        const examStats = await ExamResult.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: '$examId',
                    participants: { $sum: 1 },
                    avgScore: { $avg: '$percentage' },
                    highestScore: { $max: '$percentage' },
                    lowestScore: { $min: '$percentage' },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                },
            },
            { $sort: { participants: -1 } },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'exams',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'exam',
                },
            },
            { $unwind: { path: '$exam', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    examId: '$_id',
                    title: { $ifNull: ['$exam.title', 'Untitled'] },
                    participants: 1,
                    avgScore: { $round: ['$avgScore', 1] },
                    highestScore: { $round: ['$highestScore', 1] },
                    lowestScore: { $round: ['$lowestScore', 1] },
                    completionRate: {
                        $round: [
                            {
                                $multiply: [
                                    { $cond: [{ $gt: ['$participants', 0] }, { $divide: ['$completed', '$participants'] }, 0] },
                                    100,
                                ],
                            },
                            1,
                        ],
                    },
                },
            },
        ]).catch(() => []);

        // ── Subject Heatmap ──
        const subjectHeatmap = await ExamResult.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $lookup: {
                    from: 'exams',
                    localField: 'examId',
                    foreignField: '_id',
                    as: 'exam',
                },
            },
            { $unwind: { path: '$exam', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ['$exam.subject', 'Uncategorized'] },
                    attempts: { $sum: 1 },
                    avgScore: { $avg: '$percentage' },
                },
            },
            { $sort: { attempts: -1 } },
            { $limit: 15 },
            {
                $project: {
                    _id: 0,
                    subject: '$_id',
                    attempts: 1,
                    avgScore: { $round: ['$avgScore', 1] },
                },
            },
        ]).catch(() => []);

        // ── Revenue Summary ──
        const revenueAgg = await UserSubscription.aggregate([
            { $match: { status: { $in: ['active', 'expired'] } } },
            {
                $facet: {
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalRevenue: { $sum: '$paidAmount' },
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    recent: [
                        { $sort: { createdAt: -1 } },
                        { $limit: 10 },
                        {
                            $project: {
                                _id: 0,
                                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                                amount: '$paidAmount',
                                type: 'subscription',
                            },
                        },
                    ],
                },
            },
        ]).catch(() => [{ totals: [], recent: [] }]);

        const revData = revenueAgg[0] || { totals: [], recent: [] };
        const revTotals = revData.totals[0] || { totalRevenue: 0, count: 0 };

        const revenue = {
            totalPaidExams: 0, // paid exam revenue not separately tracked yet
            totalPackageSales: revTotals.totalRevenue || 0,
            totalRevenue: revTotals.totalRevenue || 0,
            recentTransactions: (revData.recent || []) as Array<{ date: string; amount: number; type: string }>,
        };

        // ── Compose response ──
        const responseData = {
            platform,
            today: todayMetrics,
            dailyAttempts,
            userGrowth,
            difficultyDistribution,
            examStats,
            subjectHeatmap,
            revenue,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error('adminGetAnalyticsDashboard error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to load analytics data'));
    }
}
