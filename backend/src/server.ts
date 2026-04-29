import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { connectDB } from './config/db';
import { authenticate, requirePermission } from './middlewares/auth';
import publicRoutes from './routes/publicRoutes';
import adminRoutes from './routes/adminRoutes';
import studentRoutes from './routes/studentRoutes';
import webhookRoutes from './routes/webhookRoutes';
import { studentExamRoutes } from './routes/exams/studentExamRoutes';
import { runDefaultSetup } from './setup/defaultSetup';
import { startExamCronJobs } from './cron/examJobs';
import { startModernExamCronJobs } from './cron/modernExamJobs';
import { startStudentDashboardCronJobs } from './cron/dashboardJobs';
import { startFinanceRecurringCronJobs } from './cron/financeRecurringJobs';
import { seedDefaultChartOfAccounts } from './services/financeCenterService';
import { seedIntegrationConfigs } from './services/integrations/integrationsService';
import { startNewsV2CronJobs } from './cron/newsJobs';
import { startNotificationJobCron } from './cron/notificationJobs';
import { startRetentionCronJobs } from './cron/retentionJobs';
import { startSubscriptionExpiryCron } from './cron/subscriptionExpiryCron';
import { startBackupCronJobs } from './cron/backupJobs';
import { startExamSystemCronJobs } from './cron/examSystemCron';
import adminStudentMgmtRoutes from './routes/adminStudentMgmtRoutes';
import adminProviderRoutes from './routes/adminProviderRoutes';
import adminNotificationRoutes from './routes/adminNotificationRoutes';
import adminStudentSecurityRoutes from './routes/adminStudentSecurityRoutes';
import adminIntegrationsRoutes from './routes/adminIntegrationsRoutes';
import publicIntegrationsRoutes from './routes/publicIntegrationsRoutes';

// Exam Management System v1 routes
import questionHierarchyRoutes from './routes/questionHierarchy.routes';
import questionBankRoutes from './routes/questionBank.routes';
import examManagementRoutes from './routes/examManagement.routes';
import gamificationRoutes from './routes/gamification.routes';
import battleRoutes from './routes/battle.routes';
import mistakeVaultRoutes from './routes/mistakeVault.routes';
import practiceRoutes from './routes/practice.routes';
import studyRoutineRoutes from './routes/studyRoutine.routes';
import doubtRoutes from './routes/doubt.routes';
import examinerRoutes from './routes/examiner.routes';
import examPackageRoutes from './routes/examPackage.routes';
import { serveSecureUpload } from './controllers/secureUploadController';
import {
    enforceAdminPanelPolicy,
    enforceAdminReadOnlyMode,
    enforceSiteAccess,
} from './middlewares/securityGuards';
import { sanitizeRequestPayload } from './middlewares/requestSanitizer';
import { staticAssetCacheHeaders } from './middlewares/staticAssetCacheHeaders';
import { adminRateLimiter } from './middlewares/securityRateLimit';
import { requestIdMiddleware } from './middlewares/requestId';
import { cspNonceMiddleware } from './middlewares/cspNonce';
import { csrfTokenEndpoint } from './middlewares/csrfGuard';
import { logger } from './utils/logger';
import { runCommunicationCenterMigration } from './scripts/migrate-communication-center-v1';
import {
    type PermissionAction,
    type PermissionModule,
} from './security/permissionsMatrix';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003;
const ADMIN_SECRET_PATH = process.env.ADMIN_SECRET_PATH || 'campusway-secure-admin';
const DEFAULT_CORS_ORIGINS = ['http://localhost:5175', 'http://localhost:3000'];
const APP_VERSION = process.env.npm_package_version || '1.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DISABLE_RATE_LIMIT =
    process.env.DISABLE_SECURITY_RATE_LIMIT === 'true' ||
    process.env.E2E_DISABLE_RATE_LIMIT === 'true';

function shouldSkipExpressRateLimit(req: express.Request): boolean {
    if (DISABLE_RATE_LIMIT) return true;
    if (!IS_PRODUCTION) {
        const ip = String(req.ip || req.socket?.remoteAddress || '').toLowerCase();
        const forwarded = String(req.headers['x-forwarded-for'] || '').toLowerCase();
        const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '').toLowerCase();
        const isLoopbackIp =
            ip.includes('127.0.0.1') ||
            ip.includes('::1') ||
            forwarded.includes('127.0.0.1') ||
            forwarded.includes('::1');
        if (isLoopbackIp) return true;
        if (identifier.includes('e2e_') || identifier.endsWith('@campusway.local')) return true;
    }
    return false;
}

function validateRequiredEnv(): void {
    if (!String(process.env.MONGODB_URI || '').trim() && String(process.env.MONGO_URI || '').trim()) {
        process.env.MONGODB_URI = process.env.MONGO_URI;
    }

    const missing = [];
    const hasMongoUri = Boolean(String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim());
    if (!hasMongoUri) missing.push('MONGODB_URI|MONGO_URI');

    if (missing.length > 0) {
        console.error(`[startup] Missing required env keys: ${missing.join(', ')}`);
        console.error('[startup] Please update Azure App Service Configuration.');
        // process.exit(1);
    }
    if (IS_PRODUCTION) {
        if (!process.env.JWT_SECRET) console.warn('[startup] WARNING: JWT_SECRET is missing. Using insecure fallback.');
        if (!process.env.JWT_REFRESH_SECRET && !process.env.REFRESH_SECRET) console.warn('[startup] WARNING: JWT_REFRESH_SECRET is missing. Using insecure fallback.');
        if (!process.env.FRONTEND_URL) console.warn('[startup] WARNING: FRONTEND_URL is missing. Using insecure fallback.');
        if (!process.env.ADMIN_ORIGIN) console.warn('[startup] WARNING: ADMIN_ORIGIN is missing. Using insecure fallback.');
    }
}

function parseCorsOrigins(raw: string | undefined): string[] {
    if (!raw) return DEFAULT_CORS_ORIGINS;
    const parsed = raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return parsed.length > 0 ? parsed : DEFAULT_CORS_ORIGINS;
}

const allowedCorsOrigins = parseCorsOrigins(
    process.env.CORS_ORIGIN ||
    [process.env.FRONTEND_URL, process.env.ADMIN_ORIGIN].filter(Boolean).join(',')
);

if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
}

function isLoopbackOrigin(origin: string): boolean {
    const normalized = origin.trim();
    if (!normalized) return false;
    if (normalized === 'null') return true;
    const loopbackPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(?::\d+)?$/i;
    if (loopbackPattern.test(normalized)) return true;
    try {
        const parsed = new URL(normalized);
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function inferStandaloneAdminModule(pathname: string): PermissionModule | null {
    const clean = String(pathname || '').trim().toLowerCase();
    if (!clean || clean === '/health' || clean.startsWith('/openapi')) return null;
    if (
        clean.endsWith('/security') ||
        clean.includes('/set-password') ||
        clean.includes('/force-reset') ||
        clean.includes('/revoke-sessions') ||
        clean.includes('/resend-account-info')
    ) {
        return 'security_logs';
    }
    if (
        clean.startsWith('/students-v2') ||
        clean.startsWith('/students/create-with-password') ||
        clean.startsWith('/students/') ||
        clean.startsWith('/student-groups') ||
        clean.startsWith('/student-contact-timeline') ||
        clean.startsWith('/student-settings') ||
        clean.startsWith('/audience-segments') ||
        clean.startsWith('/import-export-logs')
    ) {
        return 'students_groups';
    }
    if (clean.startsWith('/subscriptions-v2') || clean.startsWith('/subscription-plans') || clean.startsWith('/subscriptions')) {
        return 'subscription_plans';
    }
    if (
        clean.startsWith('/payments') ||
        clean.startsWith('/finance') ||
        clean.startsWith('/expenses') ||
        clean.startsWith('/staff-payouts') ||
        clean.startsWith('/dues') ||
        clean.includes('/payments') ||
        clean.includes('/finance')
    ) {
        return 'payments';
    }
    if (clean.startsWith('/support-tickets') || clean.startsWith('/contact-messages') || clean.startsWith('/notices')) {
        return 'support_center';
    }
    if (
        clean.startsWith('/notifications') ||
        clean.startsWith('/notifications-v2') ||
        clean.startsWith('/notification-providers') ||
        clean.startsWith('/notification-templates') ||
        clean.startsWith('/data-hub')
    ) {
        return 'notifications';
    }
    return null;
}

function inferStandaloneAdminAction(method: string, pathname: string): PermissionAction {
    const cleanPath = String(pathname || '').toLowerCase();
    const upperMethod = String(method || '').toUpperCase();
    if (cleanPath.includes('bulk')) return 'bulk';
    if (cleanPath.includes('/export')) return 'export';
    if (cleanPath.includes('publish')) return 'publish';
    if (cleanPath.includes('approve') || cleanPath.includes('reject')) return 'approve';
    if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') return 'view';
    if (upperMethod === 'POST') return 'create';
    if (upperMethod === 'DELETE') return 'delete';
    return 'edit';
}

const enforceStandaloneAdminModulePermissions = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) => {
    const moduleName = inferStandaloneAdminModule(req.path);
    if (!moduleName) {
        next();
        return;
    }

    const action = inferStandaloneAdminAction(req.method, req.path);
    return requirePermission(moduleName, action)(req as any, res, next);
};

const standaloneAdminApiHardening = [
    authenticate,
    enforceAdminPanelPolicy,
    enforceAdminReadOnlyMode,
    enforceStandaloneAdminModulePermissions,
];

// =============
// Middleware
// =============
app.use(requestIdMiddleware);
app.use(cspNonceMiddleware);
app.use((req, res, next) => {
    const nonce = res.locals.cspNonce || '';

    // Build connect-src from CORS allowlist
    const connectSources: string[] = ["'self'"];
    for (const origin of allowedCorsOrigins) {
        if (!connectSources.includes(origin)) {
            connectSources.push(origin);
        }
    }

    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        xssFilter: true,
        hsts: IS_PRODUCTION
            ? { maxAge: 31536000, includeSubDomains: true, preload: true }
            : false,
        frameguard: { action: 'deny' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", `'nonce-${nonce}'`],
                styleSrc: ["'self'", `'nonce-${nonce}'`, 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: connectSources,
                frameAncestors: ["'none'"],
                reportUri: '/api/csp-violation-report',
                reportTo: 'csp-endpoint',
            },
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })(req, res, () => {
        // Set Permissions-Policy header manually (Helmet v8 doesn't include it)
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        next();
    });
});
app.use(compression());
app.use(cookieParser());
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());
app.use(sanitizeRequestPayload);
app.use(enforceSiteAccess);

// Set Cache-Control headers for static asset responses (images, fonts, CSS)
app.use(staticAssetCacheHeaders);

// Serve uploaded media files
app.get('/uploads/:storedName', serveSecureUpload);
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), {
    maxAge: IS_PRODUCTION ? '7d' : 0,
    etag: true,
    setHeaders: (res, filePath) => {
        if (IS_PRODUCTION && /\.(png|jpe?g|webp|gif|svg|pdf|woff2?|ttf|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (!IS_PRODUCTION) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    },
}));

// CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        // Always reject wildcard origin
        if (origin === '*') {
            logger.warn('[cors] rejected wildcard origin', undefined as any, { origin });
            callback(new Error('CORS wildcard origin not allowed'));
            return;
        }

        // Production: block loopback origins (localhost, 127.0.0.1, ::1)
        if (IS_PRODUCTION && isLoopbackOrigin(origin)) {
            logger.warn('[cors] blocked loopback origin in production', undefined as any, { origin });
            callback(new Error('CORS loopback origin not allowed in production'));
            return;
        }

        const allowLoopback = !IS_PRODUCTION && isLoopbackOrigin(origin);
        if (allowedCorsOrigins.includes(origin) || allowLoopback) {
            callback(null, true);
            return;
        }
        logger.warn('[cors] blocked origin', undefined as any, { origin });
        callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: IS_PRODUCTION ? 500 : 1000, // more generous for local development
    message: { message: 'Too many requests, please try again later.' },
    skip: shouldSkipExpressRateLimit,
});
app.use('/api/', apiLimiter);

// Stricter rate limit for auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 20 : 100,
    message: { message: 'Too many login attempts, please try again later.' },
    skip: shouldSkipExpressRateLimit,
});
app.use('/api/auth/login', authLimiter);

// Exam system rate limiter — 100 requests per minute per authenticated user (Requirement 17.5)
const examSystemLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { message: 'Too many requests to exam system, please try again later.' },
    keyGenerator: (req: express.Request) => {
        // Use authenticated user ID when available, fall back to IP
        const userId = (req as any).user?.id || (req as any).user?._id;
        return userId ? String(userId) : String(req.ip || req.socket?.remoteAddress || 'unknown');
    },
    skip: shouldSkipExpressRateLimit,
});
app.use('/api/v1/', examSystemLimiter);

// =============
// Routes
// =============

// CSRF token endpoint
app.get('/api/auth/csrf-token', csrfTokenEndpoint);

// Public API
app.use('/api', publicRoutes);
app.use('/api/integrations', publicIntegrationsRoutes);

// Admin API (behind secret path)
app.use(`/api/${ADMIN_SECRET_PATH}`, adminRateLimiter);
app.use(`/api/${ADMIN_SECRET_PATH}`, adminRoutes);
app.use('/api/admin', adminRateLimiter);
app.use('/api/admin', standaloneAdminApiHardening, adminStudentMgmtRoutes);
app.use('/api/admin', standaloneAdminApiHardening, adminNotificationRoutes);
    app.use('/api/admin', standaloneAdminApiHardening, adminProviderRoutes);
    app.use('/api/admin', standaloneAdminApiHardening, adminIntegrationsRoutes);
app.use('/api/admin', standaloneAdminApiHardening, adminStudentSecurityRoutes);
app.use('/api/admin', adminRoutes);

// Student API
app.use('/api/student', studentRoutes);

// Modern exam routes (session-based)
app.use('/api', studentExamRoutes);

// Exam Management System v1 routes (Requirement 17.1–17.6)
app.use('/api/v1/question-hierarchy', questionHierarchyRoutes);
app.use('/api/v1/questions', questionBankRoutes);
app.use('/api/v1/exams', examManagementRoutes);
app.use('/api/v1/gamification', gamificationRoutes);
app.use('/api/v1/battles', battleRoutes);
app.use('/api/v1/mistake-vault', mistakeVaultRoutes);
app.use('/api/v1/practice', practiceRoutes);
app.use('/api/v1/study-routine', studyRoutineRoutes);
app.use('/api/v1/doubts', doubtRoutes);
app.use('/api/v1/examiner', examinerRoutes);
app.use('/api/v1/exam-packages', examPackageRoutes);

// Webhooks
app.use('/api/webhooks', webhookRoutes);
app.use('/api/payments', webhookRoutes);


// CSP violation reporting endpoint
app.post('/api/csp-violation-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body?.['csp-report'] || req.body;
    logger.warn('CSP violation report', req, {
        blockedUri: report?.['blocked-uri'],
        violatedDirective: report?.['violated-directive'],
        documentUri: report?.['document-uri'],
        originalPolicy: report?.['original-policy'],
    });
    res.status(204).end();
});

// Health check - /health alias for Render's health checker, /api/health for API clients
const healthHandler = (_req: express.Request, res: express.Response) => {
    const dbStateMap: Record<number, 'down' | 'connected'> = {
        0: 'down',
        1: 'connected',
        2: 'down',
        3: 'down',
        99: 'down',
    };
    const readyState = mongoose.connection.readyState;
    const db = dbStateMap[readyState] || 'down';
    res.json({
        status: 'OK',
        timeUTC: new Date().toISOString(),
        version: APP_VERSION,
        db,
    });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// 404 handler - Frontend is hosted separately on Firebase
app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const statusCode = Number(err.status || 500);
    const isClientError = statusCode >= 400 && statusCode < 500;
    const message = isClientError ? err.message || 'Request failed' : 'Internal server error';
    logger.error(`Unhandled error: ${err.message}`, req, {
        statusCode,
        stack: IS_PRODUCTION ? undefined : err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(statusCode).json({ message, requestId: (req as any).requestId });
});

// =============
// Start
// =============
async function start() {
    validateRequiredEnv();
    await connectDB();

    try {
        console.log('[startup] Running one-time 2FA reset migration...');
        const result = await mongoose.connection.collection('users').updateMany(
            { twoFactorEnabled: true },
            {
                $set: {
                    twoFactorEnabled: false,
                    twoFactorSecret: null,
                    twoFactorBackupCodes: [],
                    two_factor_method: null,
                }
            }
        );
        console.log(`✅ [startup] Updated ${result.modifiedCount} users — 2FA disabled.`);
    } catch (err) {
        console.error('[startup] Failed to run 2FA reset migration:', err);
    }

    try {
        const communicationMigrationResult = await runCommunicationCenterMigration();
        console.log('[startup] communication migration completed', communicationMigrationResult);

        // First-boot setup (controlled by ALLOW_DEFAULT_SETUP env)
        await runDefaultSetup();

        // Start background cron jobs (e.g. auto-submitting expired exams)
        startExamCronJobs();
        startModernExamCronJobs();
        startStudentDashboardCronJobs();
        startNewsV2CronJobs();
        startNotificationJobCron();
        startRetentionCronJobs();
        startSubscriptionExpiryCron();
        startFinanceRecurringCronJobs();
        startBackupCronJobs();
        startExamSystemCronJobs();

        // Seed default Chart-of-Account entries (idempotent)
        await seedDefaultChartOfAccounts();

        // Seed integration registry rows (idempotent, all disabled by default)
        await seedIntegrationConfigs();
    } catch (err) { console.error('[startup] Core data/cron sync failed. MongoDB might be down. Keeping container ALIVE:', err); }

    const server = app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`🚀 CampusWay Backend running on port ${PORT}`);
        console.log(`📡 Public API: http://0.0.0.0:${PORT}/api`);
        console.log(`🔒 Admin API:  http://0.0.0.0:${PORT}/api/${ADMIN_SECRET_PATH}`);
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use. Please:`);
            console.error(`   1. Stop the other process using port ${PORT}, or`);
            console.error(`   2. Set a different PORT in your .env file`);
            process.exit(1);
        } else {
            console.error('❌ Server error:', err);
            process.exit(1);
        }
    });

    // Graceful shutdown handler
    function gracefulShutdown(signal: string) {
        console.log(`[server] ${signal} received — starting graceful shutdown`);

        const forceTimeout = setTimeout(() => {
            console.error('[server] Graceful shutdown timed out after 30s — forcing exit');
            process.exit(1);
        }, 30_000);
        forceTimeout.unref();

        server.close(async () => {
            console.log('[server] HTTP server closed — no longer accepting connections');
            try {
                await mongoose.connection.close();
                console.log('[server] MongoDB connection closed');
            } catch (err) {
                console.error('[server] Error closing MongoDB connection:', err);
            }
            clearTimeout(forceTimeout);
            process.exit(0);
        });
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start();
