import { Response } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import User from '../models/User';
import ManualPayment from '../models/ManualPayment';
import ExamResult from '../models/ExamResult';
import ExamSession from '../models/ExamSession';
import News from '../models/News';
import SupportTicket from '../models/SupportTicket';
import Resource from '../models/Resource';
import EventLog from '../models/EventLog';
import Question from '../models/Question';
import { AuthRequest } from '../middlewares/auth';
import { ResponseBuilder } from '../utils/responseBuilder';

function parseDateRange(query: Record<string, unknown>, defaultDays = 30): { from: Date; to: Date } {
    const now = new Date();
    const to = query.to ? new Date(String(query.to)) : now;
    const from = query.from ? new Date(String(query.from)) : new Date(to.getTime() - defaultDays * 86400000);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from > to) {
        return { from: new Date(now.getTime() - defaultDays * 86400000), to: now };
    }
    return { from, to };
}

function toCsvValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

export async function adminGetReportsSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { from, to } = parseDateRange(req.query as Record<string, unknown>);
        const now = new Date();

        const [
            dailyStudents,
            activeSubscriptions,
            paymentSummary,
            pendingPayments,
            examAttempts,
            examSubmissions,
            topSources,
            supportOpened,
            supportResolved,
            resourceEventCount,
            resourceDownloadCounter,
        ] = await Promise.all([
            User.aggregate([
                { $match: { role: 'student', createdAt: { $gte: from, $lte: to } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            User.countDocuments({ role: 'student', 'subscription.isActive': true, 'subscription.expiryDate': { $gt: now } }),
            ManualPayment.aggregate([
                { $match: { date: { $gte: from, $lte: to }, status: 'paid' } },
                { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
            ManualPayment.countDocuments({ date: { $gte: from, $lte: to }, status: 'pending' }),
            ExamSession.countDocuments({ startedAt: { $gte: from, $lte: to } }),
            ExamResult.countDocuments({ submittedAt: { $gte: from, $lte: to } }),
            News.aggregate([
                { $match: { createdAt: { $gte: from, $lte: to } } },
                { $group: { _id: { $ifNull: ['$sourceName', 'Unknown'] }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            SupportTicket.countDocuments({ createdAt: { $gte: from, $lte: to } }),
            SupportTicket.countDocuments({ updatedAt: { $gte: from, $lte: to }, status: { $in: ['resolved', 'closed'] } }),
            EventLog.countDocuments({ createdAt: { $gte: from, $lte: to }, eventName: 'resource_download' }),
            Resource.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$downloads', 0] } } } }]),
        ]);

        const paid = paymentSummary[0] || { amount: 0, count: 0 };
        const resourceTotal = Number(resourceDownloadCounter[0]?.total || 0);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            range: { from: from.toISOString(), to: to.toISOString() },
            dailyNewStudents: dailyStudents.map((row) => ({ date: row._id, count: Number(row.count || 0) })),
            activeSubscriptions,
            payments: {
                receivedAmount: Number(paid.amount || 0),
                receivedCount: Number(paid.count || 0),
                pendingCount: pendingPayments,
            },
            exams: {
                attempted: examAttempts,
                submitted: examSubmissions,
            },
            topNewsSources: topSources.map((row) => ({ source: row._id || 'Unknown', count: Number(row.count || 0) })),
            supportTickets: { opened: supportOpened, resolved: supportResolved },
            resourceDownloads: {
                eventCount: resourceEventCount,
                totalCounter: resourceTotal,
            },
        }));
    } catch (error) {
        console.error('adminGetReportsSummary error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminExportReportsSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
        const capture: { payload?: any } = {};
        const mockRes = {
            json(payload: any) { capture.payload = payload; return payload; },
            status() { return this; },
        } as unknown as Response;
        await adminGetReportsSummary(req, mockRes);

        const data = capture.payload;
        if (!data) {
            ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to build summary report'));
            return;
        }

        const format = String(req.query.format || 'csv').trim().toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const summaryRows = [
            { metric: 'Active Subscriptions', value: data.activeSubscriptions },
            { metric: 'Payments Received Count', value: data.payments.receivedCount },
            { metric: 'Payments Received Amount', value: data.payments.receivedAmount },
            { metric: 'Payments Pending Count', value: data.payments.pendingCount },
            { metric: 'Exams Attempted', value: data.exams.attempted },
            { metric: 'Exams Submitted', value: data.exams.submitted },
            { metric: 'Support Tickets Opened', value: data.supportTickets.opened },
            { metric: 'Support Tickets Resolved', value: data.supportTickets.resolved },
            { metric: 'Resource Download Events', value: data.resourceDownloads.eventCount },
            { metric: 'Resource Download Counter', value: data.resourceDownloads.totalCounter },
        ];

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Summary');
            sheet.columns = [{ header: 'Metric', key: 'metric', width: 36 }, { header: 'Value', key: 'value', width: 20 }];
            summaryRows.forEach((row) => sheet.addRow(row));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="reports-summary-${Date.now()}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        const csv = [
            'Metric,Value',
            ...summaryRows.map((row) => `${toCsvValue(row.metric)},${toCsvValue(row.value)}`),
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="reports-summary-${Date.now()}.csv"`);
        res.status(200).send(csv);
    } catch (error) {
        console.error('adminExportReportsSummary error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetExamInsights(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam id'));
            return;
        }

        const [results, sessions] = await Promise.all([
            ExamResult.find({ exam: examId }).populate('student', 'full_name username email').lean(),
            ExamSession.find({ exam: examId }).lean(),
        ]);

        const questionStats = new Map<string, { attempts: number; correct: number }>();
        const timeDistribution = { '0-10m': 0, '10-20m': 0, '20-30m': 0, '30-45m': 0, '45m+': 0 };
        const suspiciousRows: Array<{ studentId: string; tabSwitchCount: number; cheatFlags: number }> = [];

        results.forEach((result: any) => {
            const answers = Array.isArray(result.answers) ? result.answers : [];
            answers.forEach((answer: any) => {
                const qid = String(answer.question || '').trim();
                if (!qid) return;
                const prev = questionStats.get(qid) || { attempts: 0, correct: 0 };
                prev.attempts += 1;
                if (answer.isCorrect) prev.correct += 1;
                questionStats.set(qid, prev);
            });

            const minutes = Math.max(0, Number(result.timeTaken || 0) / 60);
            if (minutes <= 10) timeDistribution['0-10m'] += 1;
            else if (minutes <= 20) timeDistribution['10-20m'] += 1;
            else if (minutes <= 30) timeDistribution['20-30m'] += 1;
            else if (minutes <= 45) timeDistribution['30-45m'] += 1;
            else timeDistribution['45m+'] += 1;

            suspiciousRows.push({
                studentId: String(result.student?._id || ''),
                tabSwitchCount: Number(result.tabSwitchCount || 0),
                cheatFlags: Array.isArray(result.cheat_flags) ? result.cheat_flags.length : 0,
            });
        });

        sessions.forEach((session: any) => {
            suspiciousRows.push({
                studentId: String(session.student || ''),
                tabSwitchCount: Number(session.tabSwitchCount || 0),
                cheatFlags: Array.isArray(session.cheat_flags) ? session.cheat_flags.length : 0,
            });
        });

        const questionIds = Array.from(questionStats.keys()).filter((id) => mongoose.Types.ObjectId.isValid(id));
        const questions = await Question.find({ _id: { $in: questionIds } }).select('question subject topic chapter').lean();
        const questionMap = new Map<string, any>();
        questions.forEach((question) => questionMap.set(String(question._id), question));

        const questionWiseAccuracy = Array.from(questionStats.entries()).map(([questionId, stat]) => {
            const question = questionMap.get(questionId);
            const attempts = Number(stat.attempts || 0);
            const correct = Number(stat.correct || 0);
            return {
                questionId,
                question: String(question?.question || '').slice(0, 120),
                subject: String(question?.subject || 'General'),
                topic: String(question?.topic || question?.chapter || 'General'),
                attempts,
                correct,
                accuracy: attempts ? Number(((correct / attempts) * 100).toFixed(2)) : 0,
            };
        }).sort((a, b) => a.accuracy - b.accuracy);

        const topicMap = new Map<string, { attempts: number; correct: number }>();
        questionWiseAccuracy.forEach((row) => {
            const key = `${row.subject} / ${row.topic}`;
            const prev = topicMap.get(key) || { attempts: 0, correct: 0 };
            prev.attempts += row.attempts;
            prev.correct += row.correct;
            topicMap.set(key, prev);
        });
        const topicWeakness = Array.from(topicMap.entries()).map(([topic, stat]) => ({
            topic,
            attempts: stat.attempts,
            accuracy: stat.attempts ? Number(((stat.correct / stat.attempts) * 100).toFixed(2)) : 0,
        })).sort((a, b) => a.accuracy - b.accuracy);

        const topScorers = results
            .map((result: any) => ({
                studentId: String(result.student?._id || ''),
                name: String(result.student?.full_name || result.student?.username || result.student?.email || 'Student'),
                percentage: Number(result.percentage || 0),
                obtainedMarks: Number(result.obtainedMarks || 0),
                totalMarks: Number(result.totalMarks || 0),
            }))
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 20);

        const suspiciousMap = new Map<string, { studentId: string; tabSwitchCount: number; cheatFlags: number }>();
        suspiciousRows.forEach((item) => {
            const key = item.studentId || `unknown-${Math.random()}`;
            const prev = suspiciousMap.get(key) || { studentId: item.studentId, tabSwitchCount: 0, cheatFlags: 0 };
            prev.tabSwitchCount += item.tabSwitchCount;
            prev.cheatFlags += item.cheatFlags;
            suspiciousMap.set(key, prev);
        });
        const suspiciousActivity = Array.from(suspiciousMap.values())
            .filter((item) => item.tabSwitchCount > 0 || item.cheatFlags > 0)
            .sort((a, b) => (b.tabSwitchCount + b.cheatFlags) - (a.tabSwitchCount + a.cheatFlags));

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            examId,
            totalResults: results.length,
            questionWiseAccuracy,
            topicWeakness,
            timeTakenDistribution: timeDistribution,
            topScorers,
            suspiciousActivity,
        }));
    } catch (error) {
        console.error('adminGetExamInsights error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminExportExamInsights(req: AuthRequest, res: Response): Promise<void> {
    try {
        const capture: { payload?: any; status?: number } = {};
        const mockRes = {
            json(payload: any) { capture.payload = payload; return payload; },
            status(code: number) { capture.status = code; return this; },
        } as unknown as Response;
        await adminGetExamInsights(req, mockRes);

        if (capture.status && capture.status >= 400) {
            ResponseBuilder.send(res, capture.status, capture.payload || ResponseBuilder.error('SERVER_ERROR', 'Failed to generate insights'));
            return;
        }
        const data = capture.payload;
        if (!data) {
            ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed to generate insights'));
            return;
        }

        const format = String(req.query.format || 'csv').trim().toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const qSheet = workbook.addWorksheet('Question Accuracy');
            qSheet.columns = [
                { header: 'Question ID', key: 'questionId', width: 24 },
                { header: 'Question', key: 'question', width: 60 },
                { header: 'Subject', key: 'subject', width: 20 },
                { header: 'Topic', key: 'topic', width: 24 },
                { header: 'Attempts', key: 'attempts', width: 12 },
                { header: 'Correct', key: 'correct', width: 12 },
                { header: 'Accuracy', key: 'accuracy', width: 12 },
            ];
            data.questionWiseAccuracy.forEach((row: any) => qSheet.addRow(row));

            const topicSheet = workbook.addWorksheet('Topic Weakness');
            topicSheet.columns = [
                { header: 'Topic', key: 'topic', width: 36 },
                { header: 'Attempts', key: 'attempts', width: 12 },
                { header: 'Accuracy', key: 'accuracy', width: 12 },
            ];
            data.topicWeakness.forEach((row: any) => topicSheet.addRow(row));

            const scoreSheet = workbook.addWorksheet('Top Scorers');
            scoreSheet.columns = [
                { header: 'Student ID', key: 'studentId', width: 28 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Percentage', key: 'percentage', width: 12 },
                { header: 'Obtained', key: 'obtainedMarks', width: 12 },
                { header: 'Total', key: 'totalMarks', width: 12 },
            ];
            data.topScorers.forEach((row: any) => scoreSheet.addRow(row));

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="exam-insights-${req.params.examId}-${Date.now()}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        const csv = [
            'Question ID,Question,Subject,Topic,Attempts,Correct,Accuracy',
            ...data.questionWiseAccuracy.map((row: any) => [
                toCsvValue(row.questionId),
                toCsvValue(row.question),
                toCsvValue(row.subject),
                toCsvValue(row.topic),
                toCsvValue(row.attempts),
                toCsvValue(row.correct),
                toCsvValue(row.accuracy),
            ].join(',')),
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="exam-insights-${req.params.examId}-${Date.now()}.csv"`);
        res.status(200).send(csv);
    } catch (error) {
        console.error('adminExportExamInsights error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}
