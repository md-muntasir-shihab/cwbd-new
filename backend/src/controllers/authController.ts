import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import User, { IUser, IUserPermissions, UserStatus } from '../models/User';
import StudentProfile from '../models/StudentProfile';
import AdminProfile from '../models/AdminProfile';
import LoginActivity from '../models/LoginActivity';
import ActiveSession from '../models/ActiveSession';
import AuditLog from '../models/AuditLog';
import RolePermissionSet from '../models/RolePermissionSet';
import { addAuthSessionStreamClient } from '../realtime/authSessionStream';
import { AuthRequest } from '../middlewares/auth';
import { getClientIp, getDeviceInfo } from '../utils/requestMeta';
import { sendCampusMail } from '../utils/mailer';
import { resolvePermissions, resolvePermissionsV2 } from '../utils/permissions';
import { SecurityConfig, getSecurityConfig, TwoFactorMethod } from '../services/securityConfigService';
import { getBrowserFingerprint, terminateSessions, terminateSessionsForUser } from '../services/sessionSecurityService';
import { buildTotpOtpAuthUrl, consumeBackupCode, generateBackupCodes, generateOtpCode, generateTotpSecret, hashOtpCode, maskEmail, normalizeTwoFactorMethod, sendOtpChallenge, verifyTotpCode } from '../services/twoFactorService';
import { getRuntimeSettingsSnapshot } from '../services/runtimeSettingsService';
import { calculatePasswordExpiryDate, getPasswordPolicyForRole, isPasswordCompliant } from '../services/securityCenterService';
import { clearPersistentRateLimit, consumePersistentRateLimit } from '../services/securityRateLimitService';
import { findValidSecurityToken, incrementSecurityTokenAttempts, invalidateSecurityTokens, issueSecurityToken, markSecurityTokenConsumed } from '../services/securityTokenService';

const IS_PROD_AUTH = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD_AUTH ? (() => { throw new Error('JWT_SECRET is required in production'); })() : 'dev-only-jwt-secret-do-not-use');
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.REFRESH_SECRET || (IS_PROD_AUTH ? (() => { throw new Error('REFRESH_SECRET is required in production'); })() : 'dev-only-refresh-secret-do-not-use');
const APP_DOMAIN = process.env.APP_DOMAIN || 'http://localhost:5173';
const ADMIN_UI_PATH = process.env.ADMIN_UI_PATH || '__cw_admin__';

type LoginPortal = 'student' | 'admin' | 'chairman';

interface AccessTokenPayload {
    _id: string;
    username: string;
    email: string;
    role: string;
    fullName: string;
    permissions: Partial<IUserPermissions>;
    permissionsV2?: Record<string, Record<string, boolean>>;
    sessionId?: string;
}

function generateAccessToken(user: IUser, fullName: string, sessionId?: string, ttlMinutes = 15): string {
    const expiresInSeconds = Math.max(5, ttlMinutes) * 60;
    const payload: AccessTokenPayload = {
        _id: String(user._id),
        username: user.username,
        email: user.email,
        role: user.role,
        fullName,
        permissions: resolvePermissions(user.role, user.permissions || undefined),
        permissionsV2: (user.permissionsV2 && Object.keys(user.permissionsV2).length > 0)
            ? (user.permissionsV2 as Record<string, Record<string, boolean>>)
            : resolvePermissionsV2(user.role),
        sessionId,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSeconds });
}

function generateRefreshToken(user: IUser, sessionId?: string, ttlDays = 7): string {
    const expiresInSeconds = Math.max(1, ttlDays) * 24 * 60 * 60;
    return jwt.sign({ _id: String(user._id), sessionId }, REFRESH_SECRET, { expiresIn: expiresInSeconds });
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getRedirectPath(role: string): string {
    if (role === 'student') return '/dashboard';
    if (role === 'chairman') return '/chairman/dashboard';
    return `/${ADMIN_UI_PATH}/dashboard`;
}

function normalizePortal(value: unknown): LoginPortal | null {
    const portal = String(value || '').trim().toLowerCase();
    if (portal === 'student' || portal === 'admin' || portal === 'chairman') return portal;
    return null;
}

function portalAllowsRole(portal: LoginPortal | null, role: string): boolean {
    if (!portal) return true;
    if (portal === 'student') return role === 'student';
    if (portal === 'chairman') return role === 'chairman';
    if (portal === 'admin') return isAdminRole(role);
    return true;
}

function roleMismatchMessage(portal: LoginPortal): string {
    if (portal === 'student') return 'This login is for students only.';
    if (portal === 'chairman') return 'This login is for chairman accounts only.';
    return 'This login is for admin accounts only.';
}

type OauthProviderKey = 'google' | 'apple' | 'twitter';

function getOauthStatus() {
    const oauthEnabled = String(process.env.OAUTH_ENABLED || '').trim().toLowerCase() === 'true';
    const providers: Array<{
        id: OauthProviderKey;
        label: string;
        enabled: boolean;
        configured: boolean;
    }> = [
            {
                id: 'google',
                label: 'Google',
                enabled: oauthEnabled && String(process.env.OAUTH_GOOGLE_ENABLED || '').trim().toLowerCase() === 'true',
                configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            },
            {
                id: 'apple',
                label: 'Apple',
                enabled: oauthEnabled && String(process.env.OAUTH_APPLE_ENABLED || '').trim().toLowerCase() === 'true',
                configured: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
            },
            {
                id: 'twitter',
                label: 'Twitter',
                enabled: oauthEnabled && String(process.env.OAUTH_TWITTER_ENABLED || '').trim().toLowerCase() === 'true',
                configured: Boolean(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),
            },
        ];
    return { oauthEnabled, providers };
}

function getOauthProvider(providerRaw: string): OauthProviderKey | null {
    const provider = String(providerRaw || '').trim().toLowerCase();
    if (provider === 'google' || provider === 'apple' || provider === 'twitter') return provider;
    return null;
}

async function getUserDisplayName(user: IUser): Promise<string> {
    if (user.role === 'student') {
        const studentProfile = await StudentProfile.findOne({ user_id: user._id }).lean();
        return studentProfile?.full_name || user.full_name || user.username;
    }
    const adminProfile = await AdminProfile.findOne({ user_id: user._id }).lean();
    return adminProfile?.admin_name || user.full_name || user.username;
}

function normalizeStatus(status: UserStatus): UserStatus {
    if (status === 'blocked') return 'blocked';
    if (status === 'suspended') return 'suspended';
    if (status === 'pending') return 'pending';
    return 'active';
}

function getSubscriptionSummary(user: IUser) {
    const nowMs = Date.now();
    const planCode = String(user.subscription?.planCode || user.subscription?.plan || '').trim().toLowerCase();
    const planName = String(user.subscription?.planName || user.subscription?.plan || '').trim();
    const startDate = user.subscription?.startDate || null;
    const expiryDate = user.subscription?.expiryDate || null;
    const expiryMs = expiryDate ? new Date(expiryDate).getTime() : NaN;
    const isExpiryValid = Number.isFinite(expiryMs) && expiryMs >= nowMs;
    const isActive = Boolean(user.subscription?.isActive === true && isExpiryValid);
    const daysLeft = isExpiryValid
        ? Math.max(0, Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000)))
        : 0;

    return {
        planCode,
        planName,
        isActive,
        startDate,
        expiryDate,
        daysLeft,
    };
}

async function logLoginAttempt(params: {
    user: IUser;
    success: boolean;
    req: Request;
    identifier: string;
    suspicious?: boolean;
    reason?: string;
}): Promise<void> {
    const ip = getClientIp(params.req);
    const device = getDeviceInfo(params.req);
    await LoginActivity.create({
        user_id: params.user._id,
        role: params.user.role,
        success: params.success,
        ip_address: ip,
        device_info: device,
        user_agent: params.req.headers['user-agent'],
        login_identifier: params.identifier,
        suspicious: Boolean(params.suspicious),
        reason: params.reason,
    });
}

const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;
const OTP_RESEND_WINDOW_MS = 10 * 60 * 1000;

function setRefreshCookie(res: Response, refreshToken: string, ttlDays = 7): void {
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: Math.max(1, ttlDays) * 24 * 60 * 60 * 1000,
    });
}

function isAdminRole(role: string): boolean {
    return ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'].includes(role);
}

function needsTwoFactor(user: IUser, security: SecurityConfig): boolean {
    if (security.testingAccessMode) return false;
    return (
        user.twoFactorEnabled === true ||
        (isAdminRole(user.role) && security.enable2faAdmin) ||
        (user.role === 'student' && security.enable2faStudent) ||
        (user.role === 'superadmin' && security.force2faSuperAdmin)
    );
}

function shouldSendChallenge(method: TwoFactorMethod): boolean {
    return method === 'email' || method === 'sms';
}

async function consumeOtpRateLimit(params: {
    bucket: 'otp_verify' | 'otp_resend';
    scopeKey: string;
    maxAllowed: number;
    windowMs: number;
    metadata?: Record<string, unknown>;
}): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const result = await consumePersistentRateLimit({
        bucket: params.bucket,
        scopeKey: params.scopeKey,
        maxAllowed: params.maxAllowed,
        windowMs: params.windowMs,
        metadata: params.metadata,
    });
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
}

async function clearOtpRateLimits(userId: string): Promise<void> {
    await Promise.all([
        clearPersistentRateLimit('otp_verify', `otp_verify:${userId}`),
        clearPersistentRateLimit('otp_resend', `otp_resend:${userId}`),
    ]);
}

function getOtpMethodForUser(user: IUser, security: SecurityConfig): TwoFactorMethod {
    const requested = normalizeTwoFactorMethod(user.two_factor_method, security.default2faMethod);
    if (requested === 'authenticator' && user.twoFactorEnabled && user.twoFactorSecret) {
        return 'authenticator';
    }
    if (requested === 'sms' && security.allowedTwoFactorMethods.includes('sms')) {
        return 'sms';
    }
    if (requested === 'authenticator' && security.allowedTwoFactorMethods.includes('authenticator')) {
        return 'authenticator';
    }
    return security.allowedTwoFactorMethods.includes('email') ? 'email' : security.default2faMethod;
}

async function applyPasswordSecurityState(
    user: IUser,
    nextPasswordHash: string,
    source: 'admin' | 'user' | 'reset',
    policy: ReturnType<typeof getPasswordPolicyForRole>,
): Promise<void> {
    const passwordHistory = Array.isArray(user.passwordHistory) ? user.passwordHistory.slice(0, 24) : [];
    if (user.password) {
        passwordHistory.unshift({
            hash: user.password,
            createdAt: new Date(),
            source,
        });
    }
    const keepCount = Math.max(0, policy.preventReuseCount || 0);
    user.password = nextPasswordHash;
    user.passwordHistory = keepCount > 0 ? passwordHistory.slice(0, keepCount) : [];
    user.passwordExpiresAt = calculatePasswordExpiryDate(policy) || null;
    user.mustChangePassword = false;
    user.forcePasswordResetRequired = false;
    user.password_updated_at = new Date();
    user.passwordLastChangedAtUTC = new Date();
    user.passwordChangedByType = source === 'admin' ? 'admin' : 'user';
}

function getPasswordPolicyForUserRole(security: SecurityConfig, role: string): typeof security.passwordPolicies.default {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'student') return security.passwordPolicies.student;
    if (normalized === 'superadmin' || normalized === 'admin') return security.passwordPolicies.admin;
    if (isAdminRole(normalized) || normalized === 'chairman') return security.passwordPolicies.staff;
    return security.passwordPolicies.default;
}

function getGenericAuthMessage(security: SecurityConfig, fallback: string): string {
    return security.authentication.genericErrorMessages ? 'Invalid credentials' : fallback;
}

function isVerifiedEmailRequired(security: SecurityConfig, role: string): boolean {
    if (security.testingAccessMode) return false;
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'student') return security.verificationRecovery.requireVerifiedEmailForStudents;
    if (isAdminRole(normalized) || normalized === 'chairman') return security.verificationRecovery.requireVerifiedEmailForAdmins;
    return false;
}

function isLegacyTokenBlocked(security: SecurityConfig): boolean {
    return security.singleBrowserLogin && security.forceLogoutOnNewLogin && !security.allowLegacyTokens;
}

function mergePermissionsV2Layers(
    ...layers: Array<Record<string, Record<string, boolean>> | Partial<Record<string, Partial<Record<string, boolean>>>> | undefined>
): Record<string, Record<string, boolean>> {
    const merged: Record<string, Record<string, boolean>> = {};

    for (const layer of layers) {
        if (!layer || typeof layer !== 'object') continue;
        for (const [moduleName, actions] of Object.entries(layer)) {
            if (!actions || typeof actions !== 'object') continue;
            if (!merged[moduleName]) merged[moduleName] = {};
            for (const [action, allowed] of Object.entries(actions)) {
                if (typeof allowed === 'boolean') {
                    merged[moduleName][action] = allowed;
                }
            }
        }
    }

    return merged;
}

async function buildUserPayload(user: IUser): Promise<Record<string, unknown>> {
    const fullName = await getUserDisplayName(user);

    let profileCompletionPercentage = 0;
    let userUniqueId = '';
    let studentMeta: Record<string, unknown> | null = null;

    if (user.role === 'student') {
        const profile = await StudentProfile.findOne({ user_id: user._id })
            .select('profile_completion_percentage user_unique_id department ssc_batch hsc_batch admittedAt groupIds')
            .lean();

        profileCompletionPercentage = Number(profile?.profile_completion_percentage || 0);
        userUniqueId = String(profile?.user_unique_id || '');
        studentMeta = {
            department: String(profile?.department || ''),
            ssc_batch: String(profile?.ssc_batch || ''),
            hsc_batch: String(profile?.hsc_batch || ''),
            admittedAt: profile?.admittedAt || user.createdAt,
            groupIds: Array.isArray(profile?.groupIds) ? profile.groupIds.map((id) => String(id)) : [],
        };
    }

    let resolvedPermissionsV2 = mergePermissionsV2Layers(
        resolvePermissionsV2(user.role) as Record<string, Record<string, boolean>>,
        user.permissionsV2 as Record<string, Record<string, boolean>> | undefined,
    );

    // Merge team role module permissions into permissionsV2
    if (user.teamRoleId) {
        const permSet = await RolePermissionSet.findOne({ roleId: user.teamRoleId }).lean();
        if (permSet?.modulePermissions) {
            resolvedPermissionsV2 = mergePermissionsV2Layers(
                resolvedPermissionsV2,
                permSet.modulePermissions as Record<string, Record<string, boolean>>,
            );
        }
    }

    return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        phoneVerified: Boolean(user.phoneVerifiedAt),
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        twoFactorMethod: user.two_factor_method || null,
        passwordExpiresAt: user.passwordExpiresAt || null,
        permissions: user.permissions,
        permissionsV2: resolvedPermissionsV2,
        mustChangePassword: user.mustChangePassword,
        redirectTo: getRedirectPath(user.role),
        profile_photo: user.profile_photo || '',
        profile_completion_percentage: profileCompletionPercentage,
        user_unique_id: userUniqueId,
        subscription: getSubscriptionSummary(user),
        student_meta: studentMeta,
    };
}

async function issueOtpChallenge(user: IUser, security: SecurityConfig): Promise<{
    tempToken: string;
    method: TwoFactorMethod;
    maskedEmail: string;
    expiresInSeconds: number;
}> {
    const requestedMethod = getOtpMethodForUser(user, security);
    const expiresAt = new Date(Date.now() + security.otpExpiryMinutes * 60 * 1000);
    const otpCode = shouldSendChallenge(requestedMethod) ? generateOtpCode() : '';
    const { rawToken } = await issueSecurityToken({
        userId: user._id,
        purpose: 'two_factor_pending',
        expiresAt,
        channel: requestedMethod,
        meta: shouldSendChallenge(requestedMethod)
            ? { method: requestedMethod, otpHash: hashOtpCode(otpCode), maskedEmail: maskEmail(user.email) }
            : { method: requestedMethod },
        maxAttempts: security.maxOtpAttempts,
        replaceExisting: true,
    });

    const deliveredMethod = shouldSendChallenge(requestedMethod)
        ? await sendOtpChallenge({
            user,
            method: requestedMethod,
            otpCode,
            expiryMinutes: security.otpExpiryMinutes,
        })
        : requestedMethod;

    return {
        tempToken: rawToken,
        method: deliveredMethod,
        maskedEmail: deliveredMethod === 'email' ? maskEmail(user.email) : '',
        expiresInSeconds: security.otpExpiryMinutes * 60,
    };
}

async function createSessionForUser(params: {
    user: IUser;
    req: Request;
    security: SecurityConfig;
    trigger: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
    const { user, req, security, trigger } = params;
    const ipAddress = getClientIp(req);
    const deviceInfo = getDeviceInfo(req);

    if (security.singleBrowserLogin && security.forceLogoutOnNewLogin) {
        await terminateSessionsForUser(String(user._id), 'new_login_from_another_device', {
            initiatedBy: String(user._id),
            meta: { trigger },
        });
    } else {
        const maxActive = Math.max(1, Number(security.examProtection.maxActiveSessionsPerUser || 1));
        const activeSessions = await ActiveSession.find({ user_id: user._id, status: 'active' })
            .sort({ last_activity: -1 })
            .select('session_id')
            .lean();
        if (activeSessions.length >= maxActive) {
            const stale = activeSessions.slice(maxActive - 1).map((item) => String(item.session_id));
            if (stale.length) {
                await terminateSessions({
                    filter: { session_id: { $in: stale } },
                    reason: 'max_active_session_limit',
                    initiatedBy: String(user._id),
                    meta: { trigger: 'security_max_active_sessions' },
                });
            }
        }
    }

    const sessionId = uuidv4();
    const fullName = await getUserDisplayName(user);
    const accessToken = generateAccessToken(user, fullName, sessionId, security.session.accessTokenTTLMinutes);
    const refreshToken = generateRefreshToken(user, sessionId, security.session.refreshTokenTTLDays);

    await ActiveSession.create({
        user_id: user._id,
        session_id: sessionId,
        jwt_token_hash: hashToken(accessToken),
        browser_fingerprint: getBrowserFingerprint(req),
        ip_address: ipAddress,
        device_type: deviceInfo,
        login_time: new Date(),
        last_activity: new Date(),
        status: 'active',
    });

    return { accessToken, refreshToken };
}

async function logOtpFailure(params: {
    user: IUser;
    req: Request;
    reason: string;
    details?: Record<string, unknown>;
}): Promise<void> {
    await LoginActivity.create({
        user_id: params.user._id,
        role: params.user.role,
        success: false,
        ip_address: getClientIp(params.req),
        device_info: getDeviceInfo(params.req),
        user_agent: params.req.headers['user-agent'],
        login_identifier: params.user.username,
        suspicious: false,
        reason: params.reason,
    });

    await AuditLog.create({
        actor_id: params.user._id,
        actor_role: params.user.role,
        action: 'otp_verification_failed',
        target_id: params.user._id,
        target_type: 'user',
        ip_address: getClientIp(params.req),
        details: {
            reason: params.reason,
            userId: String(params.user._id),
            ip: getClientIp(params.req),
            timestamp: new Date().toISOString(),
            ...(params.details || {}),
        },
    });
}

function respondOtpError(
    res: Response,
    status: number,
    code: string,
    message: string,
    extra?: Record<string, unknown>
): void {
    res.status(status).json({
        code,
        message,
        ...(extra || {}),
    });
}

export async function login(req: Request, res: Response): Promise<void> {
    try {
        const identifierRaw = req.body.identifier || req.body.email || req.body.username;
        const identifier = String(identifierRaw || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const portal = normalizePortal(req.body.portal);

        if (!identifier || !password) {
            res.status(400).json({ message: 'Username/email and password are required' });
            return;
        }

        const security = await getSecurityConfig(true);
        const lookup = identifier.includes('@')
            ? { email: identifier }
            : { username: identifier };

        const user = await User.findOne(lookup).select('+password +twoFactorSecret');
        if (!user) {
            res.status(401).json({ message: getGenericAuthMessage(security, 'Invalid credentials') });
            return;
        }

        if (!portalAllowsRole(portal, user.role)) {
            res.status(403).json({ message: portal ? roleMismatchMessage(portal) : 'Account role mismatch for this portal.' });
            return;
        }

        if (user.role === 'student' && security.panic.disableStudentLogins && !security.testingAccessMode) {
            await logLoginAttempt({
                user,
                success: false,
                req,
                identifier,
                reason: 'student_login_disabled_by_policy',
            });
            res.status(423).json({
                code: 'STUDENT_LOGIN_DISABLED',
                message: 'Student logins are temporarily disabled by administrator policy.',
            });
            return;
        }

        const status = normalizeStatus(user.status);
        const shouldBypassPendingVerification = security.testingAccessMode && status === 'pending';
        if (status === 'suspended' || status === 'blocked' || (status === 'pending' && !shouldBypassPendingVerification)) {
            await logLoginAttempt({
                user,
                success: false,
                req,
                identifier,
                reason: status === 'pending' ? 'account_pending_verification' : 'account_disabled',
            });
            const msg = status === 'pending'
                ? 'Your account is pending email verification. Please check your inbox.'
                : 'Account is suspended or blocked. Contact support.';
            res.status(403).json({ message: msg });
            return;
        }

        if (isVerifiedEmailRequired(security, user.role) && !user.emailVerifiedAt) {
            await logLoginAttempt({
                user,
                success: false,
                req,
                identifier,
                reason: 'email_not_verified',
            });
            res.status(403).json({ message: 'Email verification is required before login.' });
            return;
        }

        if (!security.testingAccessMode && user.lockUntil && user.lockUntil > new Date()) {
            await logLoginAttempt({
                user,
                success: false,
                req,
                identifier,
                reason: 'account_locked',
            });
            res.status(423).json({
                message: `Account locked. Try again after ${Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000)} minutes.`,
            });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            if (!security.testingAccessMode) {
                user.loginAttempts += 1;
                if (user.loginAttempts >= security.loginProtection.maxAttempts) {
                    user.lockUntil = new Date(Date.now() + security.loginProtection.lockoutMinutes * 60 * 1000);
                }
            }
            await user.save();
            await logLoginAttempt({
                user,
                success: false,
                req,
                identifier,
                reason: 'invalid_password',
            });
            res.status(401).json({ message: getGenericAuthMessage(security, 'Invalid credentials') });
            return;
        }

        if (user.passwordExpiresAt && user.passwordExpiresAt.getTime() <= Date.now()) {
            user.mustChangePassword = true;
        }

        const ipAddress = getClientIp(req);
        const deviceInfo = getDeviceInfo(req);
        const pastLoginsCount = await LoginActivity.countDocuments({
            user_id: user._id,
            success: true,
        });
        const isKnownFingerprint = await LoginActivity.exists({
            user_id: user._id,
            success: true,
            ip_address: ipAddress,
            device_info: deviceInfo,
        });
        const suspiciousLogin = pastLoginsCount > 0 && !isKnownFingerprint;

        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.lockReason = null;
        user.lastLogin = new Date();
        user.lastLoginAtUTC = new Date();
        user.ip_address = ipAddress;
        user.device_info = deviceInfo;
        if (!user.permissions) {
            user.permissions = resolvePermissions(user.role);
        }
        user.permissionsV2 = mergePermissionsV2Layers(
            resolvePermissionsV2(user.role) as Record<string, Record<string, boolean>>,
            user.permissionsV2 as Record<string, Record<string, boolean>> | undefined,
        );
        await user.save();

        await logLoginAttempt({
            user,
            success: true,
            req,
            identifier,
            suspicious: suspiciousLogin,
            reason: suspiciousLogin ? 'new_device_or_ip' : undefined,
        });

        if (suspiciousLogin) {
            await AuditLog.create({
                actor_id: user._id,
                actor_role: user.role,
                action: 'suspicious_login_alert',
                target_id: user._id,
                target_type: 'user',
                ip_address: ipAddress,
                details: {
                    device_info: deviceInfo,
                    login_identifier: identifier,
                },
            });
        }

        if (isAdminRole(user.role)) {
            const updateDoc: Record<string, unknown> = {
                $setOnInsert: {
                    user_id: user._id,
                    admin_name: user.full_name || user.username,
                    role_level: user.role,
                    permissions: resolvePermissions(user.role),
                },
                $push: {
                    login_history: {
                        $each: [{ ip: ipAddress, device: deviceInfo, timestamp: new Date() }],
                        $slice: -100,
                    },
                },
            };

            if (suspiciousLogin) {
                (updateDoc.$push as Record<string, unknown>).security_logs = {
                    $each: [{ action: 'Suspicious login detected', timestamp: new Date(), details: `${ipAddress} | ${deviceInfo}` }],
                    $slice: -100,
                };
            }

            await AdminProfile.findOneAndUpdate({ user_id: user._id }, updateDoc, { upsert: true, new: true });
        }

        if (needsTwoFactor(user!, security)) {
            const challenge = await issueOtpChallenge(user!, security);
            res.json({ requires2fa: true, ...challenge });
            return;
        }

        const session = await createSessionForUser({
            user,
            req,
            security,
            trigger: 'login_credentials',
        });

        setRefreshCookie(res, session.refreshToken, security.session.refreshTokenTTLDays);
        const userPayload = await buildUserPayload(user);

        res.json({
            token: session.accessToken,
            user: userPayload,
            suspiciousLogin,
        });
    } catch (error) {
        console.error('login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function loginAdmin(req: Request, res: Response): Promise<void> {
    req.body = { ...(req.body || {}), portal: 'admin' };
    await login(req, res);
}

export async function loginChairman(req: Request, res: Response): Promise<void> {
    req.body = { ...(req.body || {}), portal: 'chairman' };
    await login(req, res);
}

export async function refresh(req: Request, res: Response): Promise<void> {
    try {
        const refreshToken = req.cookies?.refresh_token;
        if (!refreshToken) {
            res.status(401).json({ message: 'No refresh token provided' });
            return;
        }

        const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { _id: string; sessionId?: string };
        const user = await User.findById(decoded._id);
        if (!user || (user.status !== 'active' && user.status !== 'pending')) {
            res.status(403).json({ message: 'User not found or inactive' });
            return;
        }

        const security = await getSecurityConfig(true);
        if (!decoded.sessionId && isLegacyTokenBlocked(security)) {
            res.status(401).json({ message: 'Legacy token is no longer allowed. Please login again.', code: 'LEGACY_TOKEN_NOT_ALLOWED' });
            return;
        }

        if (decoded.sessionId) {
            const session = await ActiveSession.findOne({ session_id: decoded.sessionId, status: 'active' });
            if (!session) {
                res.status(401).json({ message: 'Session invalidated', code: 'SESSION_INVALIDATED' });
                return;
            }
        }

        const fullName = await getUserDisplayName(user);
        const token = generateAccessToken(user, fullName, decoded.sessionId, security.session.accessTokenTTLMinutes);
        const newRefreshToken = generateRefreshToken(user, decoded.sessionId, security.session.refreshTokenTTLDays);
        if (decoded.sessionId) {
            await ActiveSession.updateOne(
                { session_id: decoded.sessionId, status: 'active' },
                {
                    $set: {
                        jwt_token_hash: hashToken(token),
                        last_activity: new Date(),
                    },
                }
            );
        }
        setRefreshCookie(res, newRefreshToken, security.session.refreshTokenTTLDays);
        res.json({ token });
    } catch {
        res.status(403).json({ message: 'Invalid or expired refresh token' });
    }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET) as { sessionId?: string };
            if (decoded.sessionId) {
                await ActiveSession.updateOne(
                    { session_id: decoded.sessionId },
                    {
                        $set: {
                            status: 'terminated',
                            terminated_reason: 'user_logout',
                            terminated_at: new Date(),
                            termination_meta: { trigger: 'user_logout' },
                        },
                    }
                );
            }
        }
    } catch {
        // Ignore token decode errors on logout.
    }
    res.clearCookie('refresh_token');
    res.json({ message: 'Logged out successfully' });
}

export async function verify2fa(req: Request, res: Response): Promise<void> {
    try {
        const { tempToken, otp } = req.body as { tempToken?: string; otp?: string };
        if (!tempToken || !otp) {
            respondOtpError(res, 400, 'OTP_REQUIRED', 'Temp token and OTP are required');
            return;
        }

        const tokenDoc = await findValidSecurityToken(tempToken, 'two_factor_pending');
        if (!tokenDoc) {
            respondOtpError(res, 401, 'OTP_SESSION_INVALID', 'Expired or invalid verification session. Please login again.');
            return;
        }

        const user = await User.findById(tokenDoc.userId).select('+twoFactorSecret +twoFactorBackupCodes');
        if (!user) {
            respondOtpError(res, 404, 'OTP_USER_NOT_FOUND', 'User not found');
            return;
        }

        const verifyBucket = `otp_verify:${String(user._id)}`;
        const security = await getSecurityConfig(true);
        const verifyLimit = await consumeOtpRateLimit({
            bucket: 'otp_verify',
            scopeKey: verifyBucket,
            maxAllowed: security.authentication.otpVerifyLimit,
            windowMs: OTP_VERIFY_WINDOW_MS,
            metadata: { userId: String(user._id) },
        });
        if (!verifyLimit.allowed) {
            await logOtpFailure({ user, req, reason: 'otp_rate_limited' });
            respondOtpError(res, 429, 'OTP_RATE_LIMITED', 'Too many OTP verification requests. Please wait and try again.', {
                attemptsRemaining: 0,
            });
            return;
        }

        if (tokenDoc.attempts >= Math.min(tokenDoc.maxAttempts, security.maxOtpAttempts)) {
            const lockMinutes = Math.max(1, security.loginProtection.lockoutMinutes);
            const lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
            user.lockUntil = lockUntil;
            user.lockReason = 'otp_max_attempts';
            user.lastLockAt = new Date();
            await user.save();
            await logOtpFailure({ user, req, reason: 'otp_max_attempts' });
            respondOtpError(res, 423, 'OTP_MAX_ATTEMPTS', `Too many failed attempts. Account locked for ${lockMinutes} minutes.`, {
                attemptsRemaining: 0,
                lockUntil: lockUntil.toISOString(),
            });
            return;
        }

        const normalizedOtp = String(otp || '').replace(/\D/g, '');
        const isDefaultTestOtp = security.allowTestOtp && normalizedOtp === security.testOtpCode;
        const challengeMethod = normalizeTwoFactorMethod(tokenDoc.channel || tokenDoc.meta?.method, security.default2faMethod);
        let verified = false;

        if (challengeMethod === 'authenticator') {
            verified = Boolean(user.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, normalizedOtp));
            if (!verified) {
                const backupResult = consumeBackupCode(user.twoFactorBackupCodes, normalizedOtp);
                if (backupResult.ok) {
                    user.twoFactorBackupCodes = backupResult.nextCodes;
                    verified = true;
                }
            }
        } else {
            const expectedHash = String(tokenDoc.meta?.otpHash || '');
            const otpHash = hashOtpCode(normalizedOtp);
            verified = otpHash === expectedHash || isDefaultTestOtp;
        }

        if (!verified) {
            const updatedToken = await incrementSecurityTokenAttempts(tokenDoc);
            const attemptsRemaining = Math.max(0, Math.min(updatedToken.maxAttempts, security.maxOtpAttempts) - updatedToken.attempts);
            await logOtpFailure({
                user,
                req,
                reason: 'otp_invalid',
                details: { attemptsRemaining },
            });
            respondOtpError(res, 401, 'OTP_INVALID', 'Invalid OTP', { attemptsRemaining });
            return;
        }

        await markSecurityTokenConsumed(tokenDoc);

        await clearOtpRateLimits(String(user._id));

        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.lockReason = null;
        user.lastLogin = new Date();
        user.lastLoginAtUTC = new Date();
        user.ip_address = getClientIp(req);
        user.device_info = getDeviceInfo(req);
        user.twoFactorLastVerifiedAt = new Date();
        if (!user.permissions) {
            user.permissions = resolvePermissions(user.role);
        }
        user.permissionsV2 = mergePermissionsV2Layers(
            resolvePermissionsV2(user.role) as Record<string, Record<string, boolean>>,
            user.permissionsV2 as Record<string, Record<string, boolean>> | undefined,
        );
        await user.save();

        const session = await createSessionForUser({
            user,
            req,
            security,
            trigger: 'login_2fa',
        });

        setRefreshCookie(res, session.refreshToken, security.session.refreshTokenTTLDays);
        const userPayload = await buildUserPayload(user);
        res.json({ token: session.accessToken, user: userPayload });
    } catch (error) {
        console.error('verify2fa error:', error);
        respondOtpError(res, 500, 'OTP_SERVER_ERROR', 'Server error');
    }
}

export async function resendOtp(req: Request, res: Response): Promise<void> {
    try {
        const { tempToken } = req.body as { tempToken?: string };
        if (!tempToken) {
            respondOtpError(res, 400, 'OTP_REQUIRED', 'Temp token is required');
            return;
        }

        const tokenDoc = await findValidSecurityToken(tempToken, 'two_factor_pending');
        if (!tokenDoc) {
            respondOtpError(res, 401, 'OTP_SESSION_INVALID', 'Expired session. Please login again.');
            return;
        }

        const user = await User.findById(tokenDoc.userId).select('+twoFactorSecret');
        if (!user) {
            respondOtpError(res, 404, 'OTP_USER_NOT_FOUND', 'User not found');
            return;
        }

        const resendBucket = `otp_resend:${String(user._id)}`;
        const security = await getSecurityConfig(true);
        const resendLimit = await consumeOtpRateLimit({
            bucket: 'otp_resend',
            scopeKey: resendBucket,
            maxAllowed: security.authentication.otpResendLimit,
            windowMs: OTP_RESEND_WINDOW_MS,
            metadata: { userId: String(user._id) },
        });
        if (!resendLimit.allowed) {
            await logOtpFailure({ user, req, reason: 'otp_rate_limited' });
            respondOtpError(res, 429, 'OTP_RATE_LIMITED', 'Too many OTP resend requests. Please wait and try again.', {
                attemptsRemaining: 0,
            });
            return;
        }

        const challenge = await issueOtpChallenge(user, security);

        res.json({
            message: 'New OTP sent successfully',
            ...challenge,
        });
    } catch (error) {
        console.error('resendOtp error:', error);
        respondOtpError(res, 500, 'OTP_SERVER_ERROR', 'Server error');
    }
}

export async function checkSession(req: AuthRequest, res: Response): Promise<void> {
    try {
        const security = await getSecurityConfig(true);
        if (!req.user?.sessionId) {
            if (isLegacyTokenBlocked(security)) {
                res.status(401).json({ valid: false, code: 'LEGACY_TOKEN_NOT_ALLOWED' });
                return;
            }
            res.json({ valid: true });
            return;
        }

        const session = await ActiveSession.findOne({
            session_id: req.user.sessionId,
            status: 'active',
        }).lean();

        if (!session) {
            res.status(401).json({ valid: false, code: 'SESSION_INVALIDATED' });
            return;
        }

        if (security.strictTokenHashValidation) {
            const authHeader = req.headers.authorization || '';
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
            if (!token || hashToken(token) !== session.jwt_token_hash) {
                res.status(401).json({ valid: false, code: 'SESSION_INVALIDATED' });
                return;
            }
        }

        res.json({ valid: true });
    } catch {
        res.json({ valid: true });
    }
}

export function sessionStream(req: AuthRequest, res: Response): void {
    if (!req.user) {
        res.status(401).json({ message: 'Not authenticated' });
        return;
    }

    if (!req.user.sessionId) {
        res.status(400).json({ code: 'SESSION_ID_REQUIRED', message: 'Session token required for stream.' });
        return;
    }

    addAuthSessionStreamClient({
        userId: req.user._id,
        sessionId: req.user.sessionId,
        res,
    });
}

export async function getActiveSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, string>;
        const userId = String(query.userId || req.params.userId || '').trim();
        const status = String(query.status || '').trim().toLowerCase();

        const pageNum = Math.max(1, Number(query.page || 1));
        const limitNum = Math.max(1, Math.min(200, Number(query.limit || 20)));
        const skip = (pageNum - 1) * limitNum;

        const match: Record<string, unknown> = {};
        if (userId) match.user_id = userId;
        if (status === 'active' || status === 'terminated') {
            match.status = status;
        }

        const [total, items] = await Promise.all([
            ActiveSession.countDocuments(match),
            ActiveSession.find(match)
                .populate('user_id', 'username full_name email role')
                .sort({ login_time: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);

        const pages = Math.max(1, Math.ceil(total / limitNum));
        res.json({ items, sessions: items, total, page: pageNum, pages });
    } catch (error) {
        console.error('getActiveSessions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function forceLogoutUser(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = (req.body || {}) as { userId?: string; sessionId?: string; reason?: string };
        const userId = String(body.userId || req.params.userId || '').trim();
        const sessionId = String(body.sessionId || '').trim();
        const reason = String(body.reason || 'admin_force_logout').trim() || 'admin_force_logout';

        if (!userId && !sessionId) {
            res.status(400).json({ message: 'userId or sessionId is required' });
            return;
        }

        const termination = sessionId
            ? await terminateSessions({
                filter: userId ? { session_id: sessionId, user_id: userId } : { session_id: sessionId },
                reason,
                initiatedBy: req.user?._id,
                meta: { trigger: 'admin_force_logout' },
            })
            : await terminateSessionsForUser(userId, reason, {
                initiatedBy: req.user?._id,
                meta: { trigger: 'admin_force_logout' },
            });

        await AuditLog.create({
            actor_id: req.user?._id,
            actor_role: req.user?.role,
            action: 'force_logout_user',
            target_id: userId || undefined,
            target_type: sessionId ? 'session' : 'user',
            ip_address: getClientIp(req),
            details: {
                sessionId: sessionId || undefined,
                reason,
                sessions_terminated: termination.terminatedCount,
                terminatedAt: termination.terminatedAt,
            },
        });

        res.json({
            message: 'Session termination completed',
            terminatedCount: termination.terminatedCount,
            sessionIds: termination.sessionIds,
            terminatedAt: termination.terminatedAt,
        });
    } catch (error) {
        console.error('forceLogoutUser error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getTwoFactorUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, string>;
        const role = String(query.role || '').trim().toLowerCase();
        const enabled = String(query.enabled || '').trim().toLowerCase();
        const search = String(query.search || '').trim();

        const pageNum = Math.max(1, Number(query.page || 1));
        const limitNum = Math.max(1, Math.min(200, Number(query.limit || 20)));
        const skip = (pageNum - 1) * limitNum;

        const match: Record<string, unknown> = {};
        if (role) {
            const roleList = role.split(',').map((item) => item.trim()).filter(Boolean);
            if (roleList.length === 1) match.role = roleList[0];
            if (roleList.length > 1) match.role = { $in: roleList };
        }

        if (enabled === 'true' || enabled === 'false') {
            match.twoFactorEnabled = enabled === 'true';
        }

        if (search) {
            const regex = new RegExp(search, 'i');
            match.$or = [
                { username: regex },
                { email: regex },
                { full_name: regex },
            ];
        }

        const [total, users] = await Promise.all([
            User.countDocuments(match),
            User.find(match)
                .select('username email full_name role twoFactorEnabled two_factor_method lastLogin createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);

        const pages = Math.max(1, Math.ceil(total / limitNum));
        res.json({
            items: users.map((user) => ({
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.full_name || user.username,
                role: user.role,
                twoFactorEnabled: Boolean(user.twoFactorEnabled),
                two_factor_method: user.two_factor_method || null,
                lastLogin: user.lastLogin || null,
            })),
            total,
            page: pageNum,
            pages,
        });
    } catch (error) {
        console.error('getTwoFactorUsers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function updateTwoFactorUser(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const body = req.body as { twoFactorEnabled?: boolean; two_factor_method?: TwoFactorMethod | null };

        if (body.twoFactorEnabled === undefined && body.two_factor_method === undefined) {
            res.status(400).json({ message: 'twoFactorEnabled or two_factor_method is required' });
            return;
        }

        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (body.two_factor_method !== undefined) {
            const methodRaw = body.two_factor_method;
            if (methodRaw === null || String(methodRaw).trim() === '') {
                user.two_factor_method = null;
            } else {
                user.two_factor_method = normalizeTwoFactorMethod(methodRaw, 'email');
            }
        }

        if (body.twoFactorEnabled !== undefined) {
            user.twoFactorEnabled = Boolean(body.twoFactorEnabled);
            if (user.twoFactorEnabled && !user.two_factor_method) {
                user.two_factor_method = 'email';
            }
        }

        await user.save();

        await AuditLog.create({
            actor_id: req.user?._id,
            actor_role: req.user?.role,
            action: 'update_user_2fa_settings',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
            details: {
                twoFactorEnabled: user.twoFactorEnabled,
                two_factor_method: user.two_factor_method,
            },
        });

        res.json({
            message: '2FA settings updated',
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                twoFactorEnabled: user.twoFactorEnabled,
                two_factor_method: user.two_factor_method,
            },
        });
    } catch (error) {
        console.error('updateTwoFactorUser error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function resetTwoFactorUser(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('+twoFactorSecret +twoFactorBackupCodes');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        user.twoFactorEnabled = false;
        user.two_factor_method = null;
        user.twoFactorSecret = undefined;
        user.twoFactorBackupCodes = [];
        user.twoFactorRecoveryLastIssuedAt = null;
        user.twoFactorLastVerifiedAt = null;
        await user.save();

        await invalidateSecurityTokens({ userId: user._id, purpose: 'two_factor_pending' });

        await AuditLog.create({
            actor_id: req.user?._id,
            actor_role: req.user?.role,
            action: 'reset_user_2fa',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ message: 'User 2FA reset successfully' });
    } catch (error) {
        console.error('resetTwoFactorUser error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getTwoFactorFailures(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, string>;
        const userId = String(query.userId || '').trim();
        const from = String(query.from || '').trim();
        const to = String(query.to || '').trim();

        const pageNum = Math.max(1, Number(query.page || 1));
        const limitNum = Math.max(1, Math.min(200, Number(query.limit || 20)));
        const skip = (pageNum - 1) * limitNum;

        const failureReasons = [
            'otp_invalid',
            'otp_expired',
            'otp_max_attempts',
            'otp_rate_limited',
            'otp_not_found',
            'otp_session_invalid',
        ];

        const match: Record<string, unknown> = {
            success: false,
            reason: { $in: failureReasons },
        };

        if (userId) match.user_id = userId;

        const createdAt: Record<string, Date> = {};
        if (from) {
            const fromDate = new Date(from);
            if (!Number.isNaN(fromDate.getTime())) createdAt.$gte = fromDate;
        }
        if (to) {
            const toDate = new Date(to);
            if (!Number.isNaN(toDate.getTime())) createdAt.$lte = toDate;
        }
        if (Object.keys(createdAt).length > 0) {
            match.createdAt = createdAt;
        }

        const [total, rows] = await Promise.all([
            LoginActivity.countDocuments(match),
            LoginActivity.find(match)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);

        const userIds = Array.from(new Set(rows.map((row) => String(row.user_id)).filter(Boolean)));
        const users = userIds.length
            ? await User.find({ _id: { $in: userIds } }).select('username email full_name role').lean()
            : [];

        const userMap = new Map(users.map((user) => [String(user._id), user]));
        const pages = Math.max(1, Math.ceil(total / limitNum));

        const items = rows.map((row) => {
            const user = userMap.get(String(row.user_id));
            return {
                _id: row._id,
                userId: row.user_id,
                username: user?.username || '',
                email: user?.email || '',
                fullName: user?.full_name || '',
                role: user?.role || row.role,
                reason: row.reason || '',
                ip_address: row.ip_address || '',
                device_info: row.device_info || '',
                createdAt: row.createdAt,
            };
        });

        res.json({ items, total, page: pageNum, pages });
    } catch (error) {
        console.error('getTwoFactorFailures error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function register(req: Request, res: Response): Promise<void> {
    try {
        const runtime = await getRuntimeSettingsSnapshot(true);
        if (!runtime.featureFlags.studentRegistrationEnabled) {
            res.status(403).json({ message: 'Student self-registration is currently disabled. Please contact admin.' });
            return;
        }

        const fullName = String(req.body.fullName || req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const phone = String(req.body.phone || '').trim();
        const security = await getSecurityConfig(true);
        if (security.panic.disableStudentLogins) {
            res.status(423).json({
                code: 'STUDENT_LOGIN_DISABLED',
                message: 'Student registration is temporarily disabled by administrator policy.',
            });
            return;
        }

        if (!fullName || !email || !username) {
            res.status(400).json({ message: 'Full name, username, email and password are required' });
            return;
        }

        const passwordPolicyResult = isPasswordCompliant(password, security.passwordPolicies.student);
        if (!passwordPolicyResult.ok) {
            res.status(400).json({ message: passwordPolicyResult.message || 'Password does not meet policy requirements.' });
            return;
        }

        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });
        if (existingUser) {
            res.status(400).json({ message: 'Email or username already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = await User.create({
            full_name: fullName,
            email,
            username,
            password: hashedPassword,
            role: 'student',
            status: 'pending',
            phone_number: phone || undefined,
            permissions: resolvePermissions('student'),
            permissionsV2: resolvePermissionsV2('student'),
            emailVerificationPendingAt: new Date(),
            passwordExpiresAt: calculatePasswordExpiryDate(security.passwordPolicies.student),
        });

        await StudentProfile.create({
            user_id: newUser._id,
            full_name: fullName,
            username,
            email,
            phone,
            phone_number: phone,
            profile_completion_percentage: 10,
        });

        const { rawToken: verifyToken } = await issueSecurityToken({
            userId: newUser._id,
            purpose: 'email_verification',
            expiresAt: new Date(Date.now() + security.verificationRecovery.emailVerificationExpiryHours * 60 * 60 * 1000),
            channel: 'email',
            meta: { email },
            replaceExisting: true,
        });

        const verifyUrl = `${APP_DOMAIN}/api/auth/verify?token=${verifyToken}`;
        await sendCampusMail({
            to: email,
            subject: 'CampusWay: Verify your email',
            text: `Verify your email: ${verifyUrl}`,
            html: `<p>Hello ${fullName},</p><p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in ${security.verificationRecovery.emailVerificationExpiryHours} hours.</p>`,
        });

        res.status(201).json({
            message: 'Registration successful. Please verify your email from the inbox.',
        });
    } catch (error) {
        console.error('register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getOauthProviders(_req: Request, res: Response): Promise<void> {
    try {
        const status = getOauthStatus();
        res.json(status);
    } catch (error) {
        console.error('getOauthProviders error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function startOauth(req: Request, res: Response): Promise<void> {
    try {
        const provider = getOauthProvider(String(req.params.provider || ''));
        if (!provider) {
            res.status(400).json({ message: 'Unsupported OAuth provider' });
            return;
        }

        const status = getOauthStatus();
        const providerStatus = status.providers.find((item) => item.id === provider);
        if (!status.oauthEnabled || !providerStatus?.enabled) {
            res.status(200).json({
                ok: false,
                code: 'OAUTH_DISABLED',
                message: `${provider} sign-in is disabled`,
            });
            return;
        }
        if (!providerStatus.configured) {
            res.status(200).json({
                ok: false,
                code: 'OAUTH_NOT_CONFIGURED',
                message: `${provider} OAuth credentials are not configured`,
            });
            return;
        }

        res.status(501).json({
            ok: false,
            code: 'OAUTH_PROVIDER_PENDING',
            message: `${provider} OAuth handshake endpoint is ready but provider wiring is pending`,
        });
    } catch (error) {
        console.error('startOauth error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
    try {
        const provider = getOauthProvider(String(req.params.provider || ''));
        if (!provider) {
            res.status(400).json({ message: 'Unsupported OAuth provider' });
            return;
        }

        const status = getOauthStatus();
        const providerStatus = status.providers.find((item) => item.id === provider);
        if (!status.oauthEnabled || !providerStatus?.enabled || !providerStatus?.configured) {
            res.status(200).json({
                ok: false,
                code: 'OAUTH_UNAVAILABLE',
                message: `${provider} sign-in is currently unavailable`,
            });
            return;
        }

        res.status(501).json({
            ok: false,
            code: 'OAUTH_PROVIDER_PENDING',
            message: `${provider} callback handler is not finalized yet`,
        });
    } catch (error) {
        console.error('oauthCallback error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
    try {
        const token = String(req.query.token || '').trim();
        if (!token) {
            res.status(400).json({ message: 'Token is required' });
            return;
        }

        const tokenDoc = await findValidSecurityToken(token, 'email_verification');
        if (!tokenDoc) {
            res.status(400).json({ message: 'Invalid or expired token' });
            return;
        }

        const user = await User.findById(tokenDoc.userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        user.status = 'active';
        user.emailVerifiedAt = new Date();
        user.emailVerificationPendingAt = null;
        await user.save();
        await markSecurityTokenConsumed(tokenDoc);

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('verifyEmail error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
    try {
        const identifierRaw = req.body.identifier || req.body.email || req.body.username;
        const identifier = String(identifierRaw || '').trim().toLowerCase();

        if (!identifier) {
            res.status(400).json({ message: 'Email or username is required' });
            return;
        }

        const lookup = identifier.includes('@')
            ? { email: identifier }
            : { username: identifier };
        const user = await User.findOne(lookup);

        if (!user) {
            res.json({ message: 'If the account exists, a password reset link has been sent.' });
            return;
        }

        const security = await getSecurityConfig(true);
        const { rawToken: resetToken } = await issueSecurityToken({
            userId: user._id,
            purpose: 'password_reset',
            expiresAt: new Date(Date.now() + security.verificationRecovery.passwordResetExpiryMinutes * 60 * 1000),
            channel: 'email',
            meta: { email: user.email, username: user.username },
            replaceExisting: true,
        });

        const resetUrl = `${APP_DOMAIN}/student/reset-password?token=${resetToken}`;
        await sendCampusMail({
            to: user.email,
            subject: 'CampusWay: Password reset request',
            text: `Reset your password: ${resetUrl}`,
            html: `<p>Hello ${user.full_name || user.username},</p><p>Use this link to reset your CampusWay password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in ${security.verificationRecovery.passwordResetExpiryMinutes} minutes.</p>`,
        });

        res.json({ message: 'If the account exists, a password reset link has been sent.' });
    } catch (error) {
        console.error('forgotPassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
    try {
        const token = String(req.body.token || '').trim();
        const newPassword = String(req.body.newPassword || '');

        if (!token) {
            res.status(400).json({ message: 'Valid token and new password are required' });
            return;
        }

        const tokenDoc =
            await findValidSecurityToken(token, 'password_reset') ||
            await findValidSecurityToken(token, 'set_password');
        if (!tokenDoc) {
            res.status(400).json({ message: 'Invalid or expired token' });
            return;
        }

        const user = await User.findById(tokenDoc.userId).select('+password +passwordHistory');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const security = await getSecurityConfig(true);
        const passwordPolicy = getPasswordPolicyForUserRole(security, user.role);
        const passwordPolicyResult = isPasswordCompliant(newPassword, passwordPolicy);
        if (!passwordPolicyResult.ok) {
            res.status(400).json({ message: passwordPolicyResult.message || 'Password does not meet policy requirements.' });
            return;
        }

        const nextPasswordHash = await bcrypt.hash(newPassword, 12);
        await applyPasswordSecurityState(user, nextPasswordHash, 'reset', passwordPolicy);
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
        await markSecurityTokenConsumed(tokenDoc);
        await invalidateSecurityTokens({ userId: user._id, purpose: tokenDoc.purpose });
        await terminateSessionsForUser(String(user._id), 'password_reset', {
            initiatedBy: String(user._id),
            meta: { trigger: 'reset_password' },
        });
        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'password_reset_completed',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('resetPassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const user = await User.findById(req.user._id);
        if (!user || ['suspended', 'blocked'].includes(user.status)) {
            res.status(403).json({ message: 'User not found or blocked' });
            return;
        }

        const fullName = await getUserDisplayName(user);
        let profileCompletionPercentage = 0;
        let userUniqueId = '';
        let studentMeta: Record<string, unknown> | null = null;

        if (user.role === 'student') {
            const profile = await StudentProfile.findOne({ user_id: user._id })
                .select('profile_completion_percentage user_unique_id department ssc_batch hsc_batch admittedAt groupIds')
                .lean();
            profileCompletionPercentage = Number(profile?.profile_completion_percentage || 0);
            userUniqueId = String(profile?.user_unique_id || '');
            studentMeta = {
                department: String(profile?.department || ''),
                ssc_batch: String(profile?.ssc_batch || ''),
                hsc_batch: String(profile?.hsc_batch || ''),
                admittedAt: profile?.admittedAt || user.createdAt,
                groupIds: Array.isArray(profile?.groupIds) ? profile?.groupIds.map((id) => String(id)) : [],
            };
        }

        res.json({
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName,
                status: user.status,
                emailVerified: Boolean(user.emailVerifiedAt),
                phoneVerified: Boolean(user.phoneVerifiedAt),
                twoFactorEnabled: Boolean(user.twoFactorEnabled),
                twoFactorMethod: user.two_factor_method || null,
                passwordExpiresAt: user.passwordExpiresAt || null,
                permissions: resolvePermissions(user.role, user.permissions || undefined),
                permissionsV2: user.permissionsV2 || resolvePermissionsV2(user.role),
                mustChangePassword: user.mustChangePassword,
                redirectTo: getRedirectPath(user.role),
                profile_photo: user.profile_photo || '',
                profile_completion_percentage: profileCompletionPercentage,
                user_unique_id: userUniqueId,
                subscription: getSubscriptionSummary(user),
                student_meta: studentMeta,
            },
        });
    } catch (error) {
        console.error('getMe error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');
        if (!currentPassword) {
            res.status(400).json({ message: 'Current password and new password are required' });
            return;
        }

        const security = await getSecurityConfig(true);
        const passwordPolicy = getPasswordPolicyForUserRole(security, req.user.role);
        const passwordPolicyResult = isPasswordCompliant(newPassword, passwordPolicy);
        if (!passwordPolicyResult.ok) {
            res.status(400).json({ message: passwordPolicyResult.message || 'Password does not meet policy requirements.' });
            return;
        }

        const user = await User.findById(req.user._id).select('+password +passwordHistory');
        if (!user || ['suspended', 'blocked'].includes(user.status)) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            // Wrong current password is a validation failure, not an auth-session failure.
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        const nextPasswordHash = await bcrypt.hash(newPassword, 12);
        await applyPasswordSecurityState(user, nextPasswordHash, 'user', passwordPolicy);
        await user.save();
        await terminateSessionsForUser(String(user._id), 'password_changed', {
            initiatedBy: String(user._id),
            meta: { trigger: 'change_password' },
        });

        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'password_changed',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('changePassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getMySecuritySessions(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const sessions = await ActiveSession.find({ user_id: req.user._id })
            .sort({ last_activity: -1 })
            .limit(25)
            .lean();

        res.json({
            sessions: sessions.map((session) => ({
                sessionId: session.session_id,
                status: session.status,
                current: session.session_id === req.user?.sessionId,
                loginAt: session.login_time,
                lastActiveAt: session.last_activity,
                ipAddress: session.ip_address || '',
                deviceInfo: session.device_type || '',
                browser: session.browser || '',
                platform: session.platform || '',
                locationSummary: session.location_summary || '',
                riskScore: session.risk_score || 0,
                riskFlags: Array.isArray(session.risk_flags) ? session.risk_flags : [],
            })),
        });
    } catch (error) {
        console.error('getMySecuritySessions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function revokeMySecuritySession(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const sessionId = String(req.params.sessionId || req.body?.sessionId || '').trim();
        if (!sessionId) {
            res.status(400).json({ message: 'sessionId is required' });
            return;
        }

        const result = await terminateSessions({
            filter: { user_id: req.user._id, session_id: sessionId },
            reason: 'user_revoked_session',
            initiatedBy: req.user._id,
            meta: { trigger: 'self_security_session_revoke' },
        });

        await AuditLog.create({
            actor_id: req.user._id,
            actor_role: req.user.role,
            action: 'self_session_revoked',
            target_type: 'session',
            ip_address: getClientIp(req),
            details: { sessionId, terminatedCount: result.terminatedCount },
        });

        res.json({ message: 'Session revoked successfully', terminatedCount: result.terminatedCount });
    } catch (error) {
        console.error('revokeMySecuritySession error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function logoutAllMySessions(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const result = await terminateSessionsForUser(String(req.user._id), 'self_logout_all', {
            initiatedBy: req.user._id,
            meta: { trigger: 'self_security_logout_all' },
        });

        await AuditLog.create({
            actor_id: req.user._id,
            actor_role: req.user.role,
            action: 'self_logout_all_sessions',
            target_type: 'user',
            ip_address: getClientIp(req),
            details: { terminatedCount: result.terminatedCount },
        });

        res.json({ message: 'Logged out from all devices', terminatedCount: result.terminatedCount });
    } catch (error) {
        console.error('logoutAllMySessions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function beginTotpSetup(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const currentPassword = String(req.body?.currentPassword || '');
        const user = await User.findById(req.user._id).select('+password +twoFactorSecret +twoFactorBackupCodes');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        const secret = generateTotpSecret();
        const backupCodes = generateBackupCodes(8);
        user.twoFactorEnabled = false;
        user.two_factor_method = 'authenticator';
        user.twoFactorSecret = secret;
        user.twoFactorBackupCodes = backupCodes.hashedCodes;
        user.twoFactorRecoveryLastIssuedAt = new Date();
        await user.save();

        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'two_factor_setup_started',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({
            secret,
            otpAuthUrl: buildTotpOtpAuthUrl({
                accountName: user.email || user.username,
                secret,
            }),
            backupCodes: backupCodes.plainCodes,
        });
    } catch (error) {
        console.error('beginTotpSetup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function confirmTotpSetup(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const code = String(req.body?.code || '').trim();
        const user = await User.findById(req.user._id).select('+twoFactorSecret +twoFactorBackupCodes');
        if (!user || !user.twoFactorSecret) {
            res.status(400).json({ message: 'No pending authenticator setup found' });
            return;
        }
        if (!verifyTotpCode(user.twoFactorSecret, code)) {
            res.status(400).json({ message: 'Invalid authenticator code' });
            return;
        }

        user.twoFactorEnabled = true;
        user.two_factor_method = 'authenticator';
        user.twoFactorLastVerifiedAt = new Date();
        await user.save();

        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'two_factor_enabled',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ message: 'Authenticator app enabled successfully' });
    } catch (error) {
        console.error('confirmTotpSetup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function regenerateBackupCodes(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const currentPassword = String(req.body?.currentPassword || '');
        const user = await User.findById(req.user._id).select('+password +twoFactorBackupCodes +twoFactorSecret');
        if (!user || !user.twoFactorEnabled) {
            res.status(404).json({ message: 'User not found or 2FA is not enabled' });
            return;
        }
        if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        const backupCodes = generateBackupCodes(8);
        user.twoFactorBackupCodes = backupCodes.hashedCodes;
        user.twoFactorRecoveryLastIssuedAt = new Date();
        await user.save();

        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'two_factor_backup_codes_regenerated',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ backupCodes: backupCodes.plainCodes });
    } catch (error) {
        console.error('regenerateBackupCodes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function disableTwoFactor(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const currentPassword = String(req.body?.currentPassword || '');
        const user = await User.findById(req.user._id).select('+password +twoFactorSecret +twoFactorBackupCodes');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
            res.status(400).json({ message: 'Current password is incorrect' });
            return;
        }

        user.twoFactorEnabled = false;
        user.two_factor_method = null;
        user.twoFactorSecret = undefined;
        user.twoFactorBackupCodes = [];
        user.twoFactorRecoveryLastIssuedAt = null;
        user.twoFactorLastVerifiedAt = null;
        await user.save();
        await invalidateSecurityTokens({ userId: user._id, purpose: 'two_factor_pending' });

        await AuditLog.create({
            actor_id: user._id,
            actor_role: user.role,
            action: 'two_factor_disabled',
            target_id: user._id,
            target_type: 'user',
            ip_address: getClientIp(req),
        });

        res.json({ message: 'Two-factor authentication disabled' });
    } catch (error) {
        console.error('disableTwoFactor error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}


