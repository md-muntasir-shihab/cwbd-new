import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../../models/User';
import ActiveSession from '../../models/ActiveSession';
import StudentProfile from '../../models/StudentProfile';

/**
 * Integration Tests: Backend Auth Endpoints
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * Tests the auth refresh and me endpoints:
 * 1. POST /auth/refresh with valid refresh token returns new access token
 * 2. POST /auth/refresh with revoked session returns 401 SESSION_INVALIDATED
 * 3. POST /auth/refresh with expired token returns 403
 * 4. GET /auth/me with valid token returns full user payload
 * 5. GET /auth/me with expired token returns 401
 * 6. ActiveSession.last_activity updated after successful refresh
 */

const JWT_SECRET = 'test-jwt-secret';
const REFRESH_SECRET = 'test-refresh-secret';

let mongoServer: MongoMemoryServer;
let app: express.Express;

// Increase test timeout for MongoMemoryServer startup
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

// Mock the security config service to return predictable values
vi.mock('../../services/securityConfigService', () => ({
    getSecurityConfig: vi.fn().mockResolvedValue({
        singleBrowserLogin: false,
        forceLogoutOnNewLogin: false,
        allowLegacyTokens: true,
        strictTokenHashValidation: false,
        testingAccessMode: false,
        session: {
            accessTokenTTLMinutes: 15,
            refreshTokenTTLDays: 7,
            idleTimeoutMinutes: 0,
        },
        examProtection: {
            maxActiveSessionsPerUser: 5,
        },
    }),
    SecurityConfig: {},
    TwoFactorMethod: {},
}));

// Mock audit/alert services to avoid side effects
vi.mock('../../services/securityAuditLogger', () => ({
    logAuthFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/securityAlertService', () => ({
    checkAuthFailureSpike: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/requestMeta', () => ({
    getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
    getDeviceInfo: vi.fn().mockReturnValue('test-device'),
}));
vi.mock('../../realtime/authSessionStream', () => ({
    addAuthSessionStreamClient: vi.fn(),
}));
vi.mock('../../utils/mailer', () => ({
    sendCampusMail: vi.fn().mockResolvedValue(undefined),
}));


// ─── Helper Functions ────────────────────────────────────────────────────────

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTestAccessToken(userId: string, sessionId: string, expiresIn = '15m'): string {
    return jwt.sign(
        {
            _id: userId,
            username: 'teststudent',
            email: 'test@campusway.local',
            role: 'student',
            fullName: 'Test Student',
            permissions: {},
            permissionsV2: {},
            sessionId,
        },
        JWT_SECRET,
        { expiresIn }
    );
}

function generateTestRefreshToken(userId: string, sessionId: string, expiresIn = '7d'): string {
    return jwt.sign({ _id: userId, sessionId }, REFRESH_SECRET, { expiresIn });
}

function generateExpiredRefreshToken(userId: string, sessionId: string): string {
    return jwt.sign({ _id: userId, sessionId }, REFRESH_SECRET, { expiresIn: '-1s' });
}

function generateExpiredAccessToken(userId: string, sessionId: string): string {
    return jwt.sign(
        {
            _id: userId,
            username: 'teststudent',
            email: 'test@campusway.local',
            role: 'student',
            fullName: 'Test Student',
            permissions: {},
            permissionsV2: {},
            sessionId,
        },
        JWT_SECRET,
        { expiresIn: '-1s' }
    );
}

let testUserId: string;
const testSessionId = 'test-session-id-001';

beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
    process.env.NODE_ENV = 'test';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Build a minimal Express app with just the auth routes
    const { refresh, getMe } = await import('../../controllers/authController');
    const { authenticate } = await import('../../middlewares/auth');

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Skip CSRF for tests — mount refresh directly
    app.post('/api/auth/refresh', refresh);
    app.get('/api/auth/me', authenticate, getMe);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await User.deleteMany({});
    await ActiveSession.deleteMany({});
    await StudentProfile.deleteMany({});

    // Create a test user
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    const user = await User.create({
        full_name: 'Test Student',
        username: 'teststudent',
        email: 'test@campusway.local',
        password: hashedPassword,
        role: 'student',
        status: 'active',
        loginAttempts: 0,
        twoFactorEnabled: false,
        mustChangePassword: false,
        passwordResetRequired: false,
        forcePasswordResetRequired: false,
        permissions: {
            canEditExams: false,
            canManageStudents: false,
            canViewReports: false,
            canManageSettings: false,
            canManageFinance: false,
        },
    });
    testUserId = String(user._id);

    // Create a student profile
    await StudentProfile.create({
        user_id: user._id,
        full_name: 'Test Student',
        user_unique_id: 'STU-001',
        profile_completion_percentage: 80,
    });

    // Create an active session
    const accessToken = generateTestAccessToken(testUserId, testSessionId);
    await ActiveSession.create({
        user_id: user._id,
        session_id: testSessionId,
        jwt_token_hash: hashToken(accessToken),
        browser_fingerprint: 'test-fingerprint',
        ip_address: '127.0.0.1',
        device_type: 'test-device',
        login_time: new Date(),
        last_activity: new Date(Date.now() - 60000), // 1 minute ago
        status: 'active',
    });
});


// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Auth Endpoints Integration Tests', () => {
    describe('POST /api/auth/refresh — valid refresh token (Req 7.1)', () => {
        it('returns a new access token when refresh token is valid', async () => {
            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(200);

            expect(res.body.token).toBeDefined();
            expect(typeof res.body.token).toBe('string');
            expect(res.body.token.length).toBeGreaterThan(0);

            // Verify the new token is a valid JWT
            const decoded = jwt.verify(res.body.token, JWT_SECRET) as any;
            expect(decoded._id).toBe(testUserId);
            expect(decoded.sessionId).toBe(testSessionId);
            expect(decoded.role).toBe('student');
        });

        it('rotates the refresh token cookie on success', async () => {
            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(200);

            // Check that a new refresh_token cookie is set
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            const refreshCookie = (Array.isArray(cookies) ? cookies : [cookies])
                .find((c: string) => c.startsWith('refresh_token='));
            expect(refreshCookie).toBeDefined();
            expect(refreshCookie).toContain('HttpOnly');
        });
    });

    describe('POST /api/auth/refresh — revoked session (Req 7.2)', () => {
        it('returns 401 SESSION_INVALIDATED when session is terminated', async () => {
            // Terminate the session
            await ActiveSession.updateOne(
                { session_id: testSessionId },
                { $set: { status: 'terminated', terminated_reason: 'admin_revoke' } }
            );

            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(401);

            expect(res.body.code).toBe('SESSION_INVALIDATED');
            expect(res.body.message).toContain('Session invalidated');
        });

        it('returns 401 SESSION_INVALIDATED when session is deleted', async () => {
            // Delete the session entirely
            await ActiveSession.deleteOne({ session_id: testSessionId });

            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(401);

            expect(res.body.code).toBe('SESSION_INVALIDATED');
        });
    });

    describe('POST /api/auth/refresh — expired token (Req 7.2)', () => {
        it('returns 403 when refresh token is expired', async () => {
            const expiredToken = generateExpiredRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${expiredToken}`])
                .expect(403);

            expect(res.body.message).toContain('Invalid or expired refresh token');
        });

        it('returns 401 when no refresh token cookie is provided', async () => {
            const res = await request(app)
                .post('/api/auth/refresh')
                .expect(401);

            expect(res.body.message).toContain('No refresh token provided');
        });
    });

    describe('GET /api/auth/me — valid token (Req 7.3)', () => {
        it('returns full user payload with valid access token', async () => {
            const accessToken = generateTestAccessToken(testUserId, testSessionId);

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.user).toBeDefined();
            expect(res.body.user._id).toBe(testUserId);
            expect(res.body.user.username).toBe('teststudent');
            expect(res.body.user.email).toBe('test@campusway.local');
            expect(res.body.user.role).toBe('student');
            expect(res.body.user.fullName).toBe('Test Student');
            expect(res.body.user.status).toBe('active');
        });

        it('returns subscription info in user payload', async () => {
            const accessToken = generateTestAccessToken(testUserId, testSessionId);

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.user.subscription).toBeDefined();
            expect(typeof res.body.user.subscription.isActive).toBe('boolean');
        });

        it('returns student_meta for student users', async () => {
            const accessToken = generateTestAccessToken(testUserId, testSessionId);

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.user.student_meta).toBeDefined();
            expect(res.body.user.student_meta).toHaveProperty('department');
            expect(res.body.user.student_meta).toHaveProperty('groupIds');
        });
    });

    describe('GET /api/auth/me — expired token (Req 7.4)', () => {
        it('returns 401 when access token is expired', async () => {
            const expiredToken = generateExpiredAccessToken(testUserId, testSessionId);

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);

            expect(res.body.message).toBeDefined();
        });

        it('returns 401 when no authorization header is provided', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .expect(401);

            expect(res.body.message).toBeDefined();
        });
    });

    describe('ActiveSession.last_activity update (Req 7.5)', () => {
        it('updates last_activity after successful refresh', async () => {
            // Record the initial last_activity
            const sessionBefore = await ActiveSession.findOne({ session_id: testSessionId }).lean();
            expect(sessionBefore).not.toBeNull();
            const lastActivityBefore = new Date(sessionBefore!.last_activity).getTime();

            // Wait a small amount to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 50));

            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(200);

            // Check that last_activity was updated
            const sessionAfter = await ActiveSession.findOne({ session_id: testSessionId }).lean();
            expect(sessionAfter).not.toBeNull();
            const lastActivityAfter = new Date(sessionAfter!.last_activity).getTime();

            expect(lastActivityAfter).toBeGreaterThan(lastActivityBefore);
        });

        it('updates jwt_token_hash after successful refresh', async () => {
            const sessionBefore = await ActiveSession.findOne({ session_id: testSessionId }).lean();
            const hashBefore = sessionBefore!.jwt_token_hash;

            const refreshToken = generateTestRefreshToken(testUserId, testSessionId);

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', [`refresh_token=${refreshToken}`])
                .expect(200);

            const sessionAfter = await ActiveSession.findOne({ session_id: testSessionId }).lean();
            const hashAfter = sessionAfter!.jwt_token_hash;

            // Hash should be updated to match the new token
            expect(hashAfter).not.toBe(hashBefore);
            expect(hashAfter).toBe(hashToken(res.body.token));
        });
    });
});
