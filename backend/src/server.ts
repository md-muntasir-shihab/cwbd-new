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
import { seedDefaultChartOfAccounts } from './services/financeSeedService';
import { startNewsV2CronJobs } from './cron/newsJobs';
import { startNotificationJobCron } from './cron/notificationJobs';
import { startRetentionCronJobs } from './cron/retentionJobs';
import { startSubscriptionExpiryCron } from './cron/subscriptionExpiryCron';
import adminStudentMgmtRoutes from './routes/adminStudentMgmtRoutes';
import adminProviderRoutes from './routes/adminProviderRoutes';
import adminNotificationRoutes from './routes/adminNotificationRoutes';
import adminStudentSecurityRoutes from './routes/adminStudentSecurityRoutes';
import { serveSecureUpload } from './controllers/secureUploadController';
import {
    enforceAdminPanelPolicy,
    enforceAdminReadOnlyMode,
    enforceSiteAccess,
} from './middlewares/securityGuards';
import { sanitizeRequestPayload } from './middlewares/requestSanitizer';
import { adminRateLimiter } from './middlewares/securityRateLimit';
import { requestIdMiddleware } from './middlewares/requestId';
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
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    xssFilter: true,
    hsts: IS_PRODUCTION
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    frameguard: { action: 'deny' },
    contentSecurityPolicy: IS_PRODUCTION ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])],
        },
    } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(cookieParser());
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());
app.use(sanitizeRequestPayload);
app.use(enforceSiteAccess);

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
        const allowLoopback = !IS_PRODUCTION && isLoopbackOrigin(origin);
        if (allowedCorsOrigins.includes(origin) || allowLoopback) {
            callback(null, true);
            return;
        }
        console.warn('[cors] blocked origin', origin);
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

// =============
// Routes
// =============

// Public API
app.use('/api', publicRoutes);

// Admin API (behind secret path)
app.use(`/api/${ADMIN_SECRET_PATH}`, adminRateLimiter);
app.use(`/api/${ADMIN_SECRET_PATH}`, adminRoutes);
app.use('/api/admin', adminRateLimiter);
app.use('/api/admin', standaloneAdminApiHardening, adminStudentMgmtRoutes);
app.use('/api/admin', standaloneAdminApiHardening, adminNotificationRoutes);
app.use('/api/admin', standaloneAdminApiHardening, adminProviderRoutes);
app.use('/api/admin', standaloneAdminApiHardening, adminStudentSecurityRoutes);
app.use('/api/admin', adminRoutes);

// Student API
app.use('/api/student', studentRoutes);

// Modern exam routes (session-based)
app.use('/api', studentExamRoutes);

// Webhooks
app.use('/api/webhooks', webhookRoutes);
app.use('/api/payments', webhookRoutes);


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

    // Seed default Chart-of-Account entries (idempotent)
    await seedDefaultChartOfAccounts();
    } catch(err) { console.error('[startup] Core data/cron sync failed. MongoDB might be down. Keeping container ALIVE:', err); }

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
}

start();
