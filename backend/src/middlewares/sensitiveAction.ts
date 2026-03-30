import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { NextFunction, Response } from 'express';
import AuditLog from '../models/AuditLog';
import User from '../models/User';
import { AuthRequest } from './auth';
import { RiskyActionKey } from '../models/SecuritySettings';
import {
    buildApprovalRequestContextFromRequest,
    requestApproval,
    shouldRequireTwoPersonApproval,
} from '../services/actionApprovalService';
import { getSecuritySettingsSnapshot } from '../services/securityCenterService';
import { consumeBackupCode, verifyTotpCode } from '../services/twoFactorService';
import { createSecurityAlert } from '../controllers/securityAlertController';
import { getClientIp, getDeviceInfo } from '../utils/requestMeta';

type SensitiveActionOptions = {
    actionKey: RiskyActionKey;
    moduleName: string;
    actionName: string;
    requireReason?: boolean;
    enforceExportRolePolicy?: boolean;
};

type SensitiveActionContext = {
    reason: string;
    reauthenticatedAt: string;
    usedTwoFactor: boolean;
};

type SensitiveExportTrackerOptions = {
    moduleName: string;
    actionName: string;
    targetType?: string;
    targetParam?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readString(value: unknown): string {
    return String(value || '').trim();
}

function readHeader(req: AuthRequest, name: string): string {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? readString(value[0]) : readString(value);
}

function getReason(req: AuthRequest): string {
    return readHeader(req, 'x-sensitive-reason') || readString(asRecord(req.body).reason) || readString(req.query.reason);
}

function getCurrentPassword(req: AuthRequest): string {
    return readHeader(req, 'x-current-password') || readString(asRecord(req.body).currentPassword) || readString(req.query.currentPassword);
}

function getOtpCode(req: AuthRequest): string {
    return readHeader(req, 'x-otp-code')
        || readString(asRecord(req.body).otpCode)
        || readString(asRecord(req.body).backupCode)
        || readString(req.query.otpCode)
        || readString(req.query.backupCode);
}

function sanitizePayloadSnapshot(body: Record<string, unknown>): Record<string, unknown> {
    const next = { ...body };
    delete next.currentPassword;
    delete next.otpCode;
    delete next.backupCode;
    return next;
}

export function getSensitiveActionContext(req: AuthRequest): SensitiveActionContext | null {
    const value = asRecord((req as AuthRequest & { sensitiveAction?: SensitiveActionContext }).sensitiveAction);
    if (!value.reason && !value.reauthenticatedAt) return null;
    return {
        reason: readString(value.reason),
        reauthenticatedAt: readString(value.reauthenticatedAt),
        usedTwoFactor: Boolean(value.usedTwoFactor),
    };
}

export function requireSensitiveAction(options: SensitiveActionOptions) {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.user?._id) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const settings = await getSecuritySettingsSnapshot(true);
            const reason = getReason(req);
            const reasonRequired = Boolean(
                (options.requireReason ?? settings.accessControl.sensitiveActionReasonRequired)
                || (options.actionKey === 'students.export' && settings.exportSecurity.requireReason),
            );
            if (reasonRequired && !reason) {
                res.status(400).json({ message: 'A reason is required for this action.' });
                return;
            }

            if (options.enforceExportRolePolicy) {
                const allowedRoles = (settings.accessControl.exportAllowedRoles?.length
                    ? settings.accessControl.exportAllowedRoles
                    : settings.exportSecurity.allowedRoles
                )
                    .map((item) => readString(item).toLowerCase())
                    .filter(Boolean);
                if (req.user.role !== 'superadmin' && allowedRoles.length && !allowedRoles.includes(String(req.user.role || '').toLowerCase())) {
                    res.status(403).json({ message: 'Your role is not allowed to export this data.' });
                    return;
                }
            }

            const currentPassword = getCurrentPassword(req);
            if (!currentPassword) {
                res.status(400).json({ message: 'Current password is required for this action.' });
                return;
            }

            const user = await User.findById(req.user._id).select('+password +twoFactorSecret +twoFactorBackupCodes');
            if (!user || ['blocked', 'suspended'].includes(String(user.status || ''))) {
                res.status(404).json({ message: 'User not found' });
                return;
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                res.status(400).json({ message: 'Current password is incorrect' });
                return;
            }

            let usedTwoFactor = false;
            const shouldStepUpWithOtp = !settings.runtimeGuards.testingAccessMode
                && Boolean(settings.twoFactor.stepUpForSensitiveActions)
                && Boolean(user.twoFactorEnabled);
            if (shouldStepUpWithOtp && (user.twoFactorSecret || (Array.isArray(user.twoFactorBackupCodes) && user.twoFactorBackupCodes.length > 0))) {
                const otpCode = getOtpCode(req);
                if (!otpCode) {
                    res.status(400).json({ message: 'Authenticator or backup code is required for this action.' });
                    return;
                }

                if (user.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, otpCode)) {
                    user.twoFactorLastVerifiedAt = new Date();
                    usedTwoFactor = true;
                    await user.save();
                } else {
                    const backupResult = consumeBackupCode(user.twoFactorBackupCodes, otpCode);
                    if (!backupResult.ok) {
                        res.status(400).json({ message: 'Invalid authenticator or backup code' });
                        return;
                    }
                    user.twoFactorBackupCodes = backupResult.nextCodes;
                    user.twoFactorLastVerifiedAt = new Date();
                    usedTwoFactor = true;
                    await user.save();
                }
            }

            if (req.user.role !== 'superadmin' && await shouldRequireTwoPersonApproval(options.actionKey)) {
                const approval = await requestApproval({
                    actionKey: options.actionKey,
                    module: options.moduleName,
                    action: options.actionName,
                    routePath: req.originalUrl,
                    method: req.method,
                    paramsSnapshot: { ...(req.params || {}) },
                    querySnapshot: { ...(req.query || {}) } as Record<string, unknown>,
                    payloadSnapshot: sanitizePayloadSnapshot(asRecord(req.body)),
                    actor: {
                        userId: String(req.user._id),
                        role: String(req.user.role || ''),
                    },
                    requestContext: buildApprovalRequestContextFromRequest(req),
                });

                res.status(202).json({
                    message: 'Action requires second approval and is now queued.',
                    code: 'PENDING_SECOND_APPROVAL',
                    approvalId: approval._id,
                    expiresAt: approval.expiresAt,
                });
                return;
            }

            (req as AuthRequest & { sensitiveAction?: SensitiveActionContext }).sensitiveAction = {
                reason,
                reauthenticatedAt: new Date().toISOString(),
                usedTwoFactor,
            };
            next();
        } catch (error) {
            console.error('requireSensitiveAction error:', error);
            res.status(500).json({ message: 'Unable to verify this sensitive action.' });
        }
    };
}

export function trackSensitiveExport(options: SensitiveExportTrackerOptions) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        let handled = false;

        res.on('finish', () => {
            if (handled) return;
            handled = true;

            if (res.statusCode < 200 || res.statusCode >= 400) {
                return;
            }

            const actorId = String(req.user?._id || '').trim();
            if (!mongoose.Types.ObjectId.isValid(actorId)) {
                return;
            }

            void (async () => {
                try {
                    const settings = await getSecuritySettingsSnapshot(true).catch(() => null);
                    const sensitiveContext = getSensitiveActionContext(req);
                    const targetIdRaw = options.targetParam ? readString(req.params?.[options.targetParam]) : '';
                    const format = readString(req.query.format) || readString(req.query.type) || 'default';

                    await AuditLog.create({
                        actor_id: new mongoose.Types.ObjectId(actorId),
                        actor_role: String(req.user?.role || '').trim(),
                        action: 'sensitive_export',
                        module: options.moduleName,
                        status: 'success',
                        target_id: mongoose.Types.ObjectId.isValid(targetIdRaw)
                            ? new mongoose.Types.ObjectId(targetIdRaw)
                            : undefined,
                        target_type: options.targetType || 'export',
                        requestId: readString((req as AuthRequest & { requestId?: string }).requestId),
                        sessionId: readString(req.user?.sessionId),
                        device: getDeviceInfo(req),
                        reason: sensitiveContext?.reason || '',
                        after: {
                            action: options.actionName,
                            module: options.moduleName,
                            path: req.originalUrl,
                            format,
                            usedTwoFactor: Boolean(sensitiveContext?.usedTwoFactor),
                        },
                        ip_address: getClientIp(req),
                        details: {
                            action: options.actionName,
                            module: options.moduleName,
                            path: req.originalUrl,
                            method: req.method,
                            format,
                        },
                    });

                    if (settings?.alerting?.exportAlerts) {
                        await createSecurityAlert(
                            'sensitive_export',
                            'warning',
                            'Sensitive export completed',
                            `${String(req.user?.role || 'admin')} completed ${options.actionName.replace(/_/g, ' ')}.`,
                            {
                                module: options.moduleName,
                                action: options.actionName,
                                actorUserId: actorId,
                                actorRole: String(req.user?.role || '').trim(),
                                path: req.originalUrl,
                                format,
                            },
                        );
                    }
                } catch (error) {
                    console.error('trackSensitiveExport error:', error);
                }
            })();
        });

        next();
    };
}
