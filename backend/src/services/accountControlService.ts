/**
 * Account Control Service
 *
 * Admin-side account lifecycle operations:
 * - Create student with admin-set password
 * - Send / resend account info
 * - Admin set new password
 * - Force password reset toggle
 * - Revoke all sessions
 * - Student self-service change password (with audit)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import AuditLog from '../models/AuditLog';
import ActiveSession from '../models/ActiveSession';
import { getSecurityConfig } from './securityConfigService';
import { terminateSessionsForUser } from './sessionSecurityService';
import { issueSecurityToken } from './securityTokenService';
import { sendCampusMail } from '../utils/mailer';

/* ================================================================
   Types
   ================================================================ */

export interface AdminSetPasswordOpts {
    studentId: string;
    newPassword: string;
    adminId: string;
    ipAddress?: string;
    sendVia?: ('sms' | 'email')[];
    revokeExistingSessions?: boolean;
}

export interface AdminSetPasswordResult {
    success: boolean;
    message: string;
    sendResult?: { sent: number; failed: number };
}

export interface CreateStudentWithPasswordOpts {
    username: string;
    email?: string;
    phone_number?: string;
    full_name: string;
    password: string;
    role?: string;
    sendVia?: ('sms' | 'email')[];
    adminId: string;
    ipAddress?: string;
    profileData?: {
        department?: string;
        ssc_batch?: string;
        hsc_batch?: string;
        guardian_name?: string;
        guardian_phone?: string;
        guardian_email?: string;
        roll_number?: string;
    };
}

export interface CreateStudentResult {
    success: boolean;
    message: string;
    userId?: string;
    sendResult?: { sent: number; failed: number };
}

const APP_DOMAIN = process.env.APP_DOMAIN || process.env.FRONTEND_URL || 'http://localhost:5175';

function newRandomPassword(length = 24): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

async function issueSetPasswordInvite(
    user: { _id: mongoose.Types.ObjectId; email?: string; full_name?: string; username: string },
    adminId: string,
): Promise<boolean> {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return false;

    const { rawToken } = await issueSecurityToken({
        userId: user._id,
        purpose: 'set_password',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        channel: 'email',
        replaceExisting: true,
        createdBy: new mongoose.Types.ObjectId(adminId),
        meta: { email },
    });

    const setPasswordUrl = `${APP_DOMAIN}/student/reset-password?token=${rawToken}`;
    return sendCampusMail({
        to: email,
        subject: 'CampusWay: Set your password',
        text: `Set your CampusWay password: ${setPasswordUrl}`,
        html: `<p>Hello ${user.full_name || user.username},</p><p>Your CampusWay account is ready.</p><p><a href="${setPasswordUrl}">Set your password</a></p><p>This link expires in 24 hours and can be used once.</p>`,
    });
}

async function applyInviteOnlyPasswordState(
    user: InstanceType<typeof User>,
    adminId: string,
): Promise<void> {
    user.password = await bcrypt.hash(newRandomPassword(), 12);
    user.passwordSetByAdminId = new mongoose.Types.ObjectId(adminId);
    user.passwordLastChangedAtUTC = new Date();
    user.passwordChangedByType = 'admin';
    user.forcePasswordResetRequired = true;
    user.mustChangePassword = true;
    user.password_updated_at = new Date();
    user.passwordExpiresAt = null;
}

/* ================================================================
   Admin: set password for student
   ================================================================ */

export async function adminSetPassword(opts: AdminSetPasswordOpts): Promise<AdminSetPasswordResult> {
    const user = await User.findById(opts.studentId).select('+password');
    if (!user) {
        return { success: false, message: 'Student not found.' };
    }

    const providedPassword = String(opts.newPassword || '').trim();
    const useDirectPassword = providedPassword.length > 0;

    if (useDirectPassword) {
        const security = await getSecurityConfig(true);
        const policy = security.passwordPolicies.student;
        const passwordCheck = {
            ok:
                providedPassword.length >= policy.minLength &&
                (!policy.requireUppercase || /[A-Z]/.test(providedPassword)) &&
                (!policy.requireLowercase || /[a-z]/.test(providedPassword)) &&
                (!policy.requireNumber || /\d/.test(providedPassword)) &&
                (!policy.requireSpecial || /[^A-Za-z0-9]/.test(providedPassword)),
            message: 'Password does not meet student password policy.',
        };
        if (!passwordCheck.ok) {
            return { success: false, message: passwordCheck.message };
        }

        const nextPasswordHash = await bcrypt.hash(providedPassword, 12);
        const previousHistory = Array.isArray(user.passwordHistory) ? user.passwordHistory.slice(0, 24) : [];
        if (user.password) {
            previousHistory.unshift({
                hash: user.password,
                createdAt: new Date(),
                source: 'admin',
            });
        }
        user.password = nextPasswordHash;
        user.passwordHistory = previousHistory.slice(0, Math.max(0, policy.preventReuseCount || 0));
        user.passwordSetByAdminId = new mongoose.Types.ObjectId(opts.adminId);
        user.passwordLastChangedAtUTC = new Date();
        user.passwordChangedByType = 'admin';
        user.forcePasswordResetRequired = false;
        user.mustChangePassword = false;
        user.passwordResetRequired = false;
        user.password_updated_at = new Date();
        user.passwordExpiresAt = null;
        await user.save();
    } else {
        await applyInviteOnlyPasswordState(user, opts.adminId);
        await user.save();
    }

    if (opts.revokeExistingSessions !== false) {
        await terminateSessionsForUser(String(user._id), 'admin_password_reset', {
            initiatedBy: opts.adminId,
            meta: { trigger: useDirectPassword ? 'admin_set_password' : 'admin_reset_student_password' },
        });
    }

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(opts.adminId),
        actor_role: 'admin',
        action: useDirectPassword ? 'admin_set_student_password' : 'admin_reset_student_password',
        target_id: user._id,
        target_type: 'User',
        ip_address: opts.ipAddress,
        details: {
            revokedSessions: opts.revokeExistingSessions !== false,
            flow: useDirectPassword ? 'direct_password' : 'invite_only',
        },
    });

    let sendResult: { sent: number; failed: number } | undefined;
    if (!useDirectPassword && (!opts.sendVia || opts.sendVia.includes('email'))) {
        const inviteSent = await issueSetPasswordInvite(user, opts.adminId);
        sendResult = { sent: inviteSent ? 1 : 0, failed: inviteSent ? 0 : 1 };
        user.accountInfoLastSentAtUTC = inviteSent ? new Date() : user.accountInfoLastSentAtUTC;
        user.accountInfoLastSentChannels = inviteSent ? ['email'] : user.accountInfoLastSentChannels;
        user.credentialsLastResentAtUTC = new Date();
        await user.save();
    }

    return {
        success: true,
        message: useDirectPassword
            ? 'Password updated successfully.'
            : sendResult?.sent
                ? 'Password reset link issued successfully.'
                : 'Password reset prepared. No invite was delivered.',
        sendResult,
    };
}

/* ================================================================
   Admin: create student with password (and optional send)
   ================================================================ */

export async function createStudentWithPassword(opts: CreateStudentWithPasswordOpts): Promise<CreateStudentResult> {
    // Check for existing user
    const existing = await User.findOne({
        $or: [
            { username: opts.username },
            ...(opts.email ? [{ email: opts.email }] : []),
        ],
    }).lean();
    if (existing) {
        return { success: false, message: 'A user with this username or email already exists.' };
    }

    const hashed = await bcrypt.hash(newRandomPassword(), 12);
    const user = await User.create({
        username: opts.username,
        email: opts.email,
        phone_number: opts.phone_number,
        full_name: opts.full_name,
        password: hashed,
        role: opts.role ?? 'student',
        status: 'active',
        passwordSetByAdminId: new mongoose.Types.ObjectId(opts.adminId),
        passwordLastChangedAtUTC: new Date(),
        passwordChangedByType: 'admin',
        forcePasswordResetRequired: true,
        mustChangePassword: true,
        passwordExpiresAt: null,
    });

    // Create student profile
    if (opts.profileData || opts.role === 'student') {
        await StudentProfile.create({
            user_id: user._id,
            full_name: opts.full_name,
            email: opts.email,
            phone_number: opts.phone_number,
            department: opts.profileData?.department,
            ssc_batch: opts.profileData?.ssc_batch,
            hsc_batch: opts.profileData?.hsc_batch,
            guardian_name: opts.profileData?.guardian_name,
            guardian_phone: opts.profileData?.guardian_phone,
            guardian_email: opts.profileData?.guardian_email,
            roll_number: opts.profileData?.roll_number,
        });
    }

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(opts.adminId),
        actor_role: 'admin',
        action: 'admin_created_student',
        target_id: user._id,
        target_type: 'User',
        ip_address: opts.ipAddress,
        details: {
            sendVia: opts.sendVia,
            flow: 'invite_only',
        },
    });

    let sendResult: { sent: number; failed: number } | undefined;
    const inviteSent = await issueSetPasswordInvite(user, opts.adminId);
    sendResult = { sent: inviteSent ? 1 : 0, failed: inviteSent ? 0 : 1 };
    if (inviteSent) {
        user.accountInfoLastSentAtUTC = new Date();
        user.accountInfoLastSentChannels = ['email'];
        await user.save();
    }

    return {
        success: true,
        message: inviteSent ? 'Student created and password setup link sent.' : 'Student created. No password setup invite was delivered.',
        userId: String(user._id),
        sendResult,
    };
}

/* ================================================================
   Admin: resend account info
   ================================================================ */

export async function adminResendAccountInfo(
    studentId: string,
    channels: ('sms' | 'email')[],
    adminId: string,
): Promise<{ sent: number; failed: number }> {
    const user = await User.findById(studentId).select('username full_name email').lean();
    if (!user) throw new Error('Student not found');    

    const inviteSent = (!channels.length || channels.includes('email'))
        ? await issueSetPasswordInvite(user as unknown as { _id: mongoose.Types.ObjectId; email?: string; full_name?: string; username: string }, adminId)
        : false;

    await User.findByIdAndUpdate(studentId, {
        $set: {
            accountInfoLastSentAtUTC: inviteSent ? new Date() : undefined,
            accountInfoLastSentChannels: inviteSent ? ['email'] : undefined,
            credentialsLastResentAtUTC: new Date(),
        },
    });

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(adminId),
        actor_role: 'admin',
        action: 'account_setup_invite_resent',
        target_id: new mongoose.Types.ObjectId(studentId),
        target_type: 'User',
        details: { channels, inviteSent },
    });

    return { sent: inviteSent ? 1 : 0, failed: inviteSent ? 0 : 1 };
}

/* ================================================================
   Admin: force password reset toggle
   ================================================================ */

export async function toggleForceReset(
    studentId: string,
    force: boolean,
    adminId: string,
    ipAddress?: string,
): Promise<void> {
    await User.findByIdAndUpdate(studentId, {
        forcePasswordResetRequired: force,
        mustChangePassword: force,
    });

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(adminId),
        actor_role: 'admin',
        action: force ? 'force_password_reset_enabled' : 'force_password_reset_disabled',
        target_id: new mongoose.Types.ObjectId(studentId),
        target_type: 'User',
        ip_address: ipAddress,
    });
}

/* ================================================================
   Admin: revoke all sessions for a student
   ================================================================ */

export async function adminRevokeStudentSessions(
    studentId: string,
    adminId: string,
    ipAddress?: string,
): Promise<void> {
    await terminateSessionsForUser(studentId, 'admin_revoked', {
        initiatedBy: adminId,
        meta: { trigger: 'admin_revoke_sessions' },
    });

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(adminId),
        actor_role: 'admin',
        action: 'admin_revoked_student_sessions',
        target_id: new mongoose.Types.ObjectId(studentId),
        target_type: 'User',
        ip_address: ipAddress,
    });
}

/* ================================================================
   Student: self-service change password (with new metadata)
   ================================================================ */

export async function studentChangePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
): Promise<{ success: boolean; message: string }> {
    const security = await getSecurityConfig(true);
    const policyCheck = {
        ok:
            String(newPassword || '').length >= security.passwordPolicies.student.minLength &&
            (!security.passwordPolicies.student.requireUppercase || /[A-Z]/.test(newPassword)) &&
            (!security.passwordPolicies.student.requireLowercase || /[a-z]/.test(newPassword)) &&
            (!security.passwordPolicies.student.requireNumber || /\d/.test(newPassword)) &&
            (!security.passwordPolicies.student.requireSpecial || /[^A-Za-z0-9]/.test(newPassword)),
        message: 'Password does not meet policy.',
    };
    if (!policyCheck.ok) {
        return { success: false, message: policyCheck.message || 'Password does not meet policy.' };
    }

    const user = await User.findById(userId).select('+password');
    if (!user || ['suspended', 'blocked'].includes(user.status)) {
        return { success: false, message: 'User not found or blocked.' };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        return { success: false, message: 'Current password is incorrect.' };
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    user.forcePasswordResetRequired = false;
    user.passwordLastChangedAtUTC = new Date();
    user.passwordChangedByType = 'user';
    user.password_updated_at = new Date();
    await user.save();

    await terminateSessionsForUser(String(user._id), 'password_changed', {
        initiatedBy: String(user._id),
        meta: { trigger: 'student_change_password' },
    });

    await AuditLog.create({
        actor_id: user._id,
        actor_role: user.role,
        action: 'student_password_changed',
        target_id: user._id,
        target_type: 'User',
        ip_address: ipAddress,
    });

    return { success: true, message: 'Password changed successfully.' };
}

/* ================================================================
   Get student security metadata (for admin detail view)
   ================================================================ */

export async function getStudentSecurityMeta(studentId: string) {
    const user = await User.findById(studentId)
        .select(
            'passwordSetByAdminId passwordLastChangedAtUTC passwordChangedByType ' +
            'forcePasswordResetRequired mustChangePassword accountInfoLastSentAtUTC ' +
            'accountInfoLastSentChannels credentialsLastResentAtUTC loginAttempts ' +
            'lockUntil password_updated_at status lastLoginAtUTC email phone_number full_name role',
        )
        .lean();
    if (!user) return null;

    const activeSessions = await ActiveSession.countDocuments({
        user_id: new mongoose.Types.ObjectId(studentId),
        status: 'active',
    });

    const recentAudit = await AuditLog.find({
        target_id: new mongoose.Types.ObjectId(studentId),
        target_type: 'User',
        action: {
            $in: [
                'admin_set_student_password',
                'admin_reset_student_password',
                'student_password_changed',
                'account_setup_invite_resent',
                'admin_revoked_student_sessions',
                'force_password_reset_enabled',
                'force_password_reset_disabled',
            ],
        },
    })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean();

    return {
        userId: String(user._id),
        fullName: user.full_name || '',
        email: user.email || '',
        phone: user.phone_number || '',
        role: user.role,
        passwordSetByAdminId: user.passwordSetByAdminId,
        passwordSetByAdmin: Boolean(user.passwordSetByAdminId),
        passwordLastChangedAtUTC: user.passwordLastChangedAtUTC,
        passwordChangedByType: user.passwordChangedByType,
        forcePasswordResetRequired: user.forcePasswordResetRequired,
        mustChangePassword: user.mustChangePassword,
        accountInfoLastSentAtUTC: user.accountInfoLastSentAtUTC,
        accountInfoLastSentChannels: user.accountInfoLastSentChannels,
        credentialsLastResentAtUTC: user.credentialsLastResentAtUTC,
        loginAttempts: user.loginAttempts,
        lockUntil: user.lockUntil,
        passwordUpdatedAt: user.password_updated_at,
        status: user.status,
        lastLoginAt: user.lastLoginAtUTC,
        activeSessions,
        recentSecurityAudit: recentAudit,
        recentAudit: recentAudit,
    };
}
