// Unit tests for controller error handling paths
// Validates: Requirements 10.1, 10.2, 10.3, 10.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';

// ─── Mongoose mock ──────────────────────────────────────────────────────────

vi.mock('mongoose', async () => {
    const actual = await vi.importActual<typeof import('mongoose')>('mongoose');
    // Wrap ObjectId so `new mongoose.Types.ObjectId(id)` works in controllers
    class MockObjectId {
        _id: string;
        constructor(id?: string) { this._id = id || 'mock-id'; }
        toString() { return this._id; }
        toHexString() { return this._id; }
    }
    return {
        ...actual,
        default: {
            ...actual.default,
            Types: {
                ...actual.default.Types,
                ObjectId: MockObjectId,
            },
        },
    };
});

// ─── Model mocks ────────────────────────────────────────────────────────────

const mockExamResultFind = vi.fn();
const mockExamResultFindById = vi.fn();
const mockExamResultAggregate = vi.fn();

vi.mock('../models/ExamResult', () => ({
    default: {
        find: (...args: unknown[]) => mockExamResultFind(...args),
        findById: (...args: unknown[]) => mockExamResultFindById(...args),
        aggregate: (...args: unknown[]) => mockExamResultAggregate(...args),
    },
}));

const mockAntiCheatAggregate = vi.fn();
vi.mock('../models/AntiCheatViolationLog', () => ({
    default: {
        aggregate: (...args: unknown[]) => mockAntiCheatAggregate(...args),
    },
}));

const mockExamSessionFind = vi.fn();
vi.mock('../models/ExamSession', () => ({
    default: {
        find: (...args: unknown[]) => mockExamSessionFind(...args),
    },
}));

const mockExamCountDocuments = vi.fn();
vi.mock('../models/Exam', () => ({
    default: {
        countDocuments: (...args: unknown[]) => mockExamCountDocuments(...args),
    },
}));

const mockNotificationFind = vi.fn();
vi.mock('../models/Notification', () => ({
    default: {
        find: (...args: unknown[]) => mockNotificationFind(...args),
    },
}));

vi.mock('../models/Settings', () => ({
    default: {
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
    },
}));

vi.mock('../models/GroupMembership', () => ({
    default: {
        find: vi.fn(),
    },
}));

// Stub service imports that examManagementController pulls in
vi.mock('../services/ExamBuilderService', () => ({}));
vi.mock('../services/ExamRunnerService', () => ({}));
vi.mock('../services/ResultEngineService', () => ({ computeResult: vi.fn() }));
vi.mock('../services/LeaderboardService', () => ({ getExamLeaderboard: vi.fn() }));


// ─── Import controllers under test ─────────────────────────────────────────

import {
    getPendingEvaluationResults,
    gradeWrittenAnswer,
    getAntiCheatReport,
    getAnalyticsOverview,
} from '../controllers/examManagementController';

import { getSentNotifications } from '../controllers/notificationManagementController';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_OBJECT_ID = 'aabbccddeeff00112233aabb';

function mockReq(overrides: Record<string, unknown> = {}): AuthRequest {
    return {
        params: {},
        query: {},
        body: {},
        user: { _id: VALID_OBJECT_ID, role: 'admin' },
        ...overrides,
    } as unknown as AuthRequest;
}

function mockRes(): Response & { _status: number; _json: unknown } {
    const res: any = { _status: 200, _json: null };
    res.status = vi.fn((code: number) => {
        res._status = code;
        return res;
    });
    res.json = vi.fn((data: unknown) => {
        res._json = data;
        return res;
    });
    return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// getPendingEvaluationResults
// ═══════════════════════════════════════════════════════════════════════════

describe('getPendingEvaluationResults', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 400 for invalid ObjectId', async () => {
        const req = mockReq({ params: { id: 'invalid-id' } });
        const res = mockRes();

        await getPendingEvaluationResults(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'VALIDATION_ERROR' },
        });
    });

    it('returns 200 with empty array when no results match', async () => {
        // find().populate() chain returns empty array
        mockExamResultFind.mockReturnValue({
            populate: vi.fn().mockResolvedValue([]),
        });

        const req = mockReq({ params: { id: VALID_OBJECT_ID } });
        const res = mockRes();

        await getPendingEvaluationResults(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res._json).toMatchObject({ success: true, data: [] });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// gradeWrittenAnswer
// ═══════════════════════════════════════════════════════════════════════════

describe('gradeWrittenAnswer', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 404 when resultId does not exist', async () => {
        mockExamResultFindById.mockResolvedValue(null);

        const req = mockReq({
            params: { resultId: VALID_OBJECT_ID },
            body: {
                questionId: VALID_OBJECT_ID,
                marks: 5,
                maxMarks: 10,
                feedback: 'Good',
            },
        });
        const res = mockRes();

        await gradeWrittenAnswer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'NOT_FOUND' },
        });
    });

    it('returns 400 when questionId is not a written-type answer', async () => {
        const fakeResult = {
            _id: VALID_OBJECT_ID,
            answers: [
                {
                    question: VALID_OBJECT_ID,
                    questionType: 'mcq',
                    selectedAnswer: 'A',
                    isCorrect: true,
                },
            ],
            writtenGrades: [],
        };
        mockExamResultFindById.mockResolvedValue(fakeResult);

        const req = mockReq({
            params: { resultId: VALID_OBJECT_ID },
            body: {
                questionId: VALID_OBJECT_ID,
                marks: 5,
                maxMarks: 10,
                feedback: 'Good',
            },
        });
        const res = mockRes();

        await gradeWrittenAnswer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'VALIDATION_ERROR' },
        });
        expect(res._json.message).toContain('written');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAntiCheatReport
// ═══════════════════════════════════════════════════════════════════════════

describe('getAntiCheatReport', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 400 for invalid ObjectId', async () => {
        const req = mockReq({ params: { id: 'invalid-id' } });
        const res = mockRes();

        await getAntiCheatReport(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'VALIDATION_ERROR' },
        });
    });

    it('returns 200 with zeroed summary when no violations exist', async () => {
        // Summary aggregate returns empty, byType aggregate returns empty
        mockAntiCheatAggregate
            .mockResolvedValueOnce([])   // summary
            .mockResolvedValueOnce([]);  // byType

        // Flagged sessions: find().populate().select().lean() chain
        mockExamSessionFind.mockReturnValue({
            populate: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([]),
                }),
            }),
        });

        const req = mockReq({ params: { id: VALID_OBJECT_ID } });
        const res = mockRes();

        await getAntiCheatReport(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res._json).toMatchObject({
            success: true,
            data: {
                summary: {
                    totalViolations: 0,
                    flaggedSessions: 0,
                    uniqueStudentsFlagged: 0,
                },
                violationsByType: [],
                flaggedSessions: [],
            },
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAnalyticsOverview
// ═══════════════════════════════════════════════════════════════════════════

describe('getAnalyticsOverview', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 400 for invalid dateFrom format', async () => {
        const req = mockReq({ query: { dateFrom: 'not-a-date' } });
        const res = mockRes();

        await getAnalyticsOverview(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'VALIDATION_ERROR' },
        });
        expect(res._json.message).toContain('dateFrom');
    });

    it('returns 400 for invalid dateTo format', async () => {
        const req = mockReq({ query: { dateTo: 'not-a-date' } });
        const res = mockRes();

        await getAnalyticsOverview(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._json).toMatchObject({
            success: false,
            error: { code: 'VALIDATION_ERROR' },
        });
        expect(res._json.message).toContain('dateTo');
    });

    it('returns 200 with zeroed metrics when no data exists', async () => {
        mockExamResultAggregate.mockResolvedValue([]);
        mockExamCountDocuments.mockResolvedValue(0);

        const req = mockReq({ query: {} });
        const res = mockRes();

        await getAnalyticsOverview(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res._json).toMatchObject({
            success: true,
            data: {
                totalExams: 0,
                totalAttempts: 0,
                averageScore: 0,
                passRate: 0,
                activeStudents: 0,
            },
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// getSentNotifications
// ═══════════════════════════════════════════════════════════════════════════

describe('getSentNotifications', () => {
    beforeEach(() => vi.clearAllMocks());

    /** Helper: set up the Notification.find().sort().limit().lean() chain. */
    function setupNotificationChain(items: unknown[] = []) {
        const leanFn = vi.fn().mockResolvedValue(items);
        const limitFn = vi.fn().mockReturnValue({ lean: leanFn });
        const sortFn = vi.fn().mockReturnValue({ limit: limitFn });
        mockNotificationFind.mockReturnValue({ sort: sortFn });
        return { sortFn, limitFn, leanFn };
    }

    it('uses default limit of 50 when no limit param provided', async () => {
        const { limitFn } = setupNotificationChain();

        const req = mockReq({ query: {} });
        const res = mockRes();

        await getSentNotifications(req, res);

        expect(limitFn).toHaveBeenCalledWith(50);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res._json).toMatchObject({ success: true, data: { items: [] } });
    });

    it('uses custom limit when provided (limit=10)', async () => {
        const { limitFn } = setupNotificationChain();

        const req = mockReq({ query: { limit: '10' } });
        const res = mockRes();

        await getSentNotifications(req, res);

        expect(limitFn).toHaveBeenCalledWith(10);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('clamps limit=500 down to 200', async () => {
        const { limitFn } = setupNotificationChain();

        const req = mockReq({ query: { limit: '500' } });
        const res = mockRes();

        await getSentNotifications(req, res);

        expect(limitFn).toHaveBeenCalledWith(200);
    });

    it('clamps limit=-5 up to 1', async () => {
        const { limitFn } = setupNotificationChain();

        const req = mockReq({ query: { limit: '-5' } });
        const res = mockRes();

        await getSentNotifications(req, res);

        expect(limitFn).toHaveBeenCalledWith(1);
    });
});
