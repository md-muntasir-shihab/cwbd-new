import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';
import ActiveSession from '../models/ActiveSession';
import User, { UserRole } from '../models/User';
import UserSubscription from '../models/UserSubscription';
import { IUserPermissions } from '../models/User';
import { getSecurityConfig } from '../services/securityConfigService';
import {
    hasLegacyPermissionBridge,
    hasPermissionsV2Override,
    hasRolePermission,
    type PermissionAction,
    type PermissionModule,
} from '../security/permissionsMatrix';

// user? is now declared globally via src/types/express-user-augmentation.d.ts
// (Express.Request namespace augmentation for @types/express v5 compatibility).
// AuthRequest is kept as a named alias for Request so callsites can import it.
export type AuthRequest = Request;

interface DecodedAuthToken {
    _id: string;
    id?: string;
    username: string;
    email: string;
    role: UserRole;
    fullName: string;
    permissions?: Partial<IUserPermissions>;
    permissionsV2?: Partial<Record<string, Partial<Record<string, boolean>>>>;
    sessionId?: string;
}

function decodeAndAttach(req: AuthRequest, token: string): void {
    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET is required in production'); })() : 'dev-only-jwt-secret-do-not-use');
    const decoded = jwt.verify(token, jwtSecret) as DecodedAuthToken;
    req.user = { ...decoded, id: decoded._id };
}

function extractToken(req: AuthRequest): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    const cookieToken = String(req.cookies?.access_token || '').trim();
    if (cookieToken) {
        return cookieToken;
    }

    // SSE auth must use secure cookies (or Authorization for non-SSE requests),
    // never query-string tokens to avoid bearer leakage in URLs/logs.

    return null;
}

// Debounce last_activity updates (max once per 60s per session)
const lastActivityUpdateMap = new Map<string, number>();

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    try {
        decodeAndAttach(req, token);

        const sessionId = req.user?.sessionId;
        if (sessionId) {
            Promise.all([
                ActiveSession.findOne({ session_id: sessionId, status: 'active' }).lean(),
                getSecurityConfig(true).catch(() => null),
            ])
                .then(([session, security]) => {
                    if (!session) {
                        res.status(401).json({
                            message: 'Session invalidated. You have been logged out.',
                            code: 'SESSION_INVALIDATED',
                        });
                        return;
                    }

                    if (security?.session?.idleTimeoutMinutes) {
                        const lastActivity = new Date(String(session.last_activity || session.updatedAt || new Date()));
                        const idleMs = Date.now() - lastActivity.getTime();
                        const maxIdleMs = Math.max(5, Number(security.session.idleTimeoutMinutes)) * 60 * 1000;
                        if (idleMs > maxIdleMs) {
                            ActiveSession.updateOne(
                                { session_id: sessionId, status: 'active' },
                                {
                                    $set: {
                                        status: 'terminated',
                                        terminated_reason: 'session_idle_timeout',
                                        terminated_at: new Date(),
                                        termination_meta: { trigger: 'idle_timeout' },
                                    },
                                }
                            ).catch(() => { /* no-op */ });
                            res.status(401).json({
                                message: 'Session expired due to inactivity. Please login again.',
                                code: 'SESSION_IDLE_TIMEOUT',
                            });
                            return;
                        }
                    }

                    if (security?.strictTokenHashValidation) {
                        const tokenHash = hashToken(token);
                        if (!session.jwt_token_hash || session.jwt_token_hash !== tokenHash) {
                            res.status(401).json({
                                message: 'Session invalidated. Please login again.',
                                code: 'SESSION_INVALIDATED',
                            });
                            return;
                        }
                    }

                    const now = Date.now();
                    const lastUpdate = lastActivityUpdateMap.get(sessionId) || 0;
                    if (now - lastUpdate > 60000) {
                        lastActivityUpdateMap.set(sessionId, now);
                        ActiveSession.updateOne(
                            { session_id: sessionId },
                            { $set: { last_activity: new Date() } }
                        ).catch(() => { /* no-op */ });
                    }

                    next();
                })
                .catch(() => {
                    // Graceful degradation if session store is unavailable.
                    next();
                });
            return;
        }

        // Legacy tokens without sessionId are temporarily allowed via security toggle.
        getSecurityConfig(true)
            .then((security) => {
                const mustRejectLegacy = (
                    security.singleBrowserLogin &&
                    security.forceLogoutOnNewLogin &&
                    !security.allowLegacyTokens
                );

                if (mustRejectLegacy) {
                    res.status(401).json({
                        message: 'Legacy token is no longer allowed. Please login again.',
                        code: 'LEGACY_TOKEN_NOT_ALLOWED',
                    });
                    return;
                }

                next();
            })
            .catch(() => {
                // Graceful degradation on settings lookup failure.
                next();
            });
    } catch {
        res.status(401).json({ message: 'Invalid or expired token', code: 'TOKEN_EXPIRED' });
    }
}

export const requireAuth = authenticate;

export function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
        next();
        return;
    }

    try {
        decodeAndAttach(req, token);
    } catch {
        // Silent fallback for optional auth: invalid tokens should not block public routes.
    }

    next();
}

export function authorize(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            forbidden(res, {
                message: 'Insufficient permissions',
            });
            return;
        }
        next();
    };
}

export function forbidden(
    res: Response,
    payload: {
        message?: string;
        module?: PermissionModule;
        action?: PermissionAction;
    } = {},
): void {
    res.status(403).json({
        errorCode: 'FORBIDDEN',
        message: payload.message || 'You do not have permission to perform this action.',
        ...(payload.module ? { module: payload.module } : {}),
        ...(payload.action ? { action: payload.action } : {}),
    });
}

export function requireRole(...roles: UserRole[]) {
    return authorize(...roles);
}

export function requireAnyRole(...roles: string[]) {
    return authorize(...roles);
}

export function requireAuthStudent(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }
    if (req.user.role !== 'student') {
        forbidden(res, { message: 'Student access only' });
        return;
    }
    next();
}

type SubscriptionGateState = {
    allowed: boolean;
    reason: 'missing' | 'inactive' | 'expired' | 'not_student';
    expiryDate: Date | null;
};

function evaluateSubscriptionState(user: Record<string, any>): SubscriptionGateState {
    if (String(user.role || '') !== 'student') {
        return { allowed: false, reason: 'not_student', expiryDate: null };
    }

    const subscription = user.subscription || {};
    const hasPlanIdentity = Boolean(subscription.plan || subscription.planCode || subscription.planName);
    if (!hasPlanIdentity) {
        return { allowed: false, reason: 'missing', expiryDate: null };
    }

    const isActive = subscription.isActive === true;
    const expiryDate = subscription.expiryDate ? new Date(subscription.expiryDate) : null;

    if (!isActive) {
        return { allowed: false, reason: 'inactive', expiryDate };
    }

    if (!expiryDate || Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() < Date.now()) {
        return { allowed: false, reason: 'expired', expiryDate };
    }

    return { allowed: true, reason: 'inactive', expiryDate };
}

export async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user?._id) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const [user, activeSubscription, latestSubscription] = await Promise.all([
            User.findById(req.user._id).select('role subscription').lean(),
            UserSubscription.findOne({
                userId: req.user._id,
                status: 'active',
                expiresAtUTC: { $gt: new Date() },
            })
                .select('expiresAtUTC')
                .lean(),
            UserSubscription.findOne({ userId: req.user._id })
                .sort({ expiresAtUTC: -1, updatedAt: -1, createdAt: -1 })
                .select('status expiresAtUTC')
                .lean(),
        ]);
        if (!user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (activeSubscription) {
            next();
            return;
        }

        const gate = evaluateSubscriptionState(user as Record<string, any>);
        const canonicalExpiryDate = latestSubscription?.expiresAtUTC ? new Date(latestSubscription.expiresAtUTC) : null;
        const canonicalReason = latestSubscription
            ? (String(latestSubscription.status || '') === 'active' ? 'expired' : 'inactive')
            : gate.reason;
        const finalReason = gate.reason === 'missing' && latestSubscription ? canonicalReason : gate.reason;
        const finalExpiryDate = gate.expiryDate || canonicalExpiryDate;
        if (!gate.allowed) {
            const expiryLabel = finalExpiryDate ? finalExpiryDate.toISOString() : null;
            res.status(403).json({
                subscriptionRequired: true,
                reason: finalReason,
                expiryDate: expiryLabel,
                message: finalReason === 'expired'
                    ? `Your subscription has expired${expiryLabel ? ` on ${expiryLabel}` : ''}.`
                    : 'Active subscription required to access exams.',
            });
            return;
        }

        next();
    } catch {
        res.status(500).json({ message: 'Unable to validate subscription state' });
    }
}

export function authorizePermission(permission: keyof IUserPermissions) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        if (req.user.role === 'superadmin') {
            next();
            return;
        }

        if (!req.user.permissions?.[permission]) {
            forbidden(res, { message: `Permission denied: ${permission}` });
            return;
        }

        next();
    };
}

export function requirePermission(moduleName: PermissionModule, action: PermissionAction) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const role = req.user.role as UserRole;
        if (role === 'superadmin') {
            next();
            return;
        }

        const permissionsV2Override = hasPermissionsV2Override(req.user.permissionsV2, moduleName, action);
        if (permissionsV2Override === true) {
            next();
            return;
        }
        if (permissionsV2Override === false) {
            forbidden(res, {
                message: `You are not allowed to ${action} ${moduleName}.`,
                module: moduleName,
                action,
            });
            return;
        }

        if (hasRolePermission(role, moduleName, action)) {
            next();
            return;
        }

        const legacyBridge = hasLegacyPermissionBridge(req.user.permissions, moduleName, action);
        if (legacyBridge === true) {
            next();
            return;
        }

        forbidden(res, {
            message: `You are not allowed to ${action} ${moduleName}.`,
            module: moduleName,
            action,
        });
    };
}

export function checkOwnership(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }
    if (['superadmin', 'admin', 'moderator'].includes(req.user.role)) {
        next();
        return;
    }
    if (req.params.id && req.params.id !== req.user._id.toString()) {
        forbidden(res, { message: 'You can only modify your own data.' });
        return;
    }
    next();
}

export function auditMiddleware(actionName: string) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (req.user && ['superadmin', 'admin', 'moderator', 'editor'].includes(req.user.role)) {
            AuditLog.create({
                actor_id: req.user._id,
                actor_role: req.user.role,
                action: actionName,
                target_id: req.params.id || req.body.id || undefined,
                target_type: req.baseUrl.split('/').pop() || 'system',
                ip_address: req.ip,
                details: {
                    method: req.method,
                    path: req.originalUrl,
                },
            }).catch((err) => console.error('AuditLog Error:', err));
        }
        next();
    };
}
