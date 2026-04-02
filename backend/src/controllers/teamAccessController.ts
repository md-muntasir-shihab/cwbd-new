import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import TeamRole from '../models/TeamRole';
import RolePermissionSet from '../models/RolePermissionSet';
import MemberPermissionOverride from '../models/MemberPermissionOverride';
import TeamApprovalRule from '../models/TeamApprovalRule';
import TeamAuditLog from '../models/TeamAuditLog';
import TeamInvite from '../models/TeamInvite';
import ActiveSession from '../models/ActiveSession';
import AuditLog from '../models/AuditLog';
import LoginActivity from '../models/LoginActivity';
import type { AuthRequest } from '../middlewares/auth';
import { DEFAULT_TEAM_ROLES, TEAM_ACTIONS, TEAM_MODULES } from '../teamAccess/defaults';
import { issueSecurityToken } from '../services/securityTokenService';
import { sendCampusMail } from '../utils/mailer';
import { escapeRegex } from '../utils/escapeRegex';
import { getClientIp, getDeviceInfo } from '../utils/requestMeta';

const TEAM_USER_ROLES = ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'] as const;
const APP_DOMAIN = process.env.APP_DOMAIN || process.env.FRONTEND_URL || 'http://localhost:5175';

function normalizeEmail(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function asObjectId(id: string | string[]): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(Array.isArray(id) ? id[0] : id);
}

function randomPassword(): string {
    return crypto.randomBytes(8).toString('hex');
}

function canManageTeamPasswords(role: unknown): boolean {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'superadmin' || normalized === 'admin';
}

function validateManagedPassword(value: unknown): string {
    return String(value || '').trim();
}

function applyManagedPasswordState(
    user: InstanceType<typeof User>,
    passwordHash: string,
    adminId: string | undefined,
    forcePasswordResetRequired: boolean,
): void {
    user.password = passwordHash;
    user.passwordSetByAdminId = adminId && mongoose.Types.ObjectId.isValid(adminId)
        ? new mongoose.Types.ObjectId(adminId)
        : undefined;
    user.passwordLastChangedAtUTC = new Date();
    user.passwordChangedByType = 'admin';
    user.forcePasswordResetRequired = forcePasswordResetRequired;
    user.mustChangePassword = forcePasswordResetRequired;
    user.password_updated_at = new Date();
    user.passwordExpiresAt = null;
}

async function terminateTeamMemberSessions(memberId: string): Promise<void> {
    await ActiveSession.updateMany(
        { user_id: asObjectId(memberId), status: 'active' },
        { $set: { status: 'terminated', terminated_reason: 'admin_password_reset', terminated_at: new Date() } },
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequiredApprovals(value: unknown, fallback = 1): number | null {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return parsed;
}

async function resolveApproverRoleIds(body: Record<string, unknown>): Promise<{ ids: mongoose.Types.ObjectId[]; invalid: string[] }> {
    const rawValues = [
        ...(Array.isArray(body.approverRoleIds) ? body.approverRoleIds : []),
        ...(Array.isArray(body.approverRoles) ? body.approverRoles : []),
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    const uniqueValues = Array.from(new Set(rawValues));
    if (uniqueValues.length === 0) {
        return { ids: [], invalid: [] };
    }

    const resolvedIds = new Map<string, mongoose.Types.ObjectId>();
    const unresolved: string[] = [];

    uniqueValues.forEach((value) => {
        if (mongoose.Types.ObjectId.isValid(value)) {
            resolvedIds.set(value, asObjectId(value));
            return;
        }
        unresolved.push(value);
    });

    if (unresolved.length === 0) {
        return { ids: Array.from(resolvedIds.values()), invalid: [] };
    }

    const roleMatches = await TeamRole.find({
        $or: [
            { slug: { $in: unresolved.map((value) => value.toLowerCase()) } },
            { name: { $in: unresolved } },
        ],
    })
        .select('_id slug name')
        .lean();

    const matchedKeys = new Set<string>();
    roleMatches.forEach((role) => {
        resolvedIds.set(String(role._id), asObjectId(String(role._id)));
        matchedKeys.add(String(role.slug || '').trim().toLowerCase());
        matchedKeys.add(String(role.name || '').trim());
    });

    return {
        ids: Array.from(resolvedIds.values()),
        invalid: unresolved.filter((value) => !matchedKeys.has(value) && !matchedKeys.has(value.toLowerCase())),
    };
}

async function issueMemberSetPasswordInvite(
    user: { _id: mongoose.Types.ObjectId; email: string; full_name: string; username: string },
    createdBy?: string,
): Promise<boolean> {
    const email = normalizeEmail(user.email);
    if (!email) return false;

    const { rawToken } = await issueSecurityToken({
        userId: user._id,
        purpose: 'set_password',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        channel: 'email',
        replaceExisting: true,
        createdBy: createdBy && mongoose.Types.ObjectId.isValid(createdBy)
            ? new mongoose.Types.ObjectId(createdBy)
            : null,
        meta: { email, teamMember: true },
    });

    const setPasswordUrl = `${APP_DOMAIN}/student/reset-password?token=${rawToken}`;
    return sendCampusMail({
        to: email,
        subject: 'CampusWay: Set your team account password',
        text: `Set your CampusWay password: ${setPasswordUrl}`,
        html: `<p>Hello ${user.full_name || user.username},</p><p>Your CampusWay team account is ready.</p><p><a href="${setPasswordUrl}">Set your password</a></p><p>This link expires in 24 hours and can be used once.</p>`,
    });
}

function pickModulePermissions(input: unknown): Record<string, Record<string, boolean>> {
    const source = (typeof input === 'object' && input) ? (input as Record<string, unknown>) : {};
    const payload: Record<string, Record<string, boolean>> = {};
    TEAM_MODULES.forEach((moduleName) => {
        const row = source[moduleName];
        const rowObj = (typeof row === 'object' && row) ? (row as Record<string, unknown>) : {};
        payload[moduleName] = {};
        TEAM_ACTIONS.forEach((action) => {
            payload[moduleName][action] = Boolean(rowObj[action]);
        });
    });
    return payload;
}

function applyOverride(
    base: Record<string, Record<string, boolean>>,
    allow: Record<string, Record<string, boolean>>,
    deny: Record<string, Record<string, boolean>>,
): Record<string, Record<string, boolean>> {
    const next = JSON.parse(JSON.stringify(base)) as Record<string, Record<string, boolean>>;
    Object.entries(allow || {}).forEach(([moduleName, actions]) => {
        if (!next[moduleName]) next[moduleName] = {};
        Object.entries(actions || {}).forEach(([action, value]) => {
            if (value) next[moduleName][action] = true;
        });
    });
    Object.entries(deny || {}).forEach(([moduleName, actions]) => {
        if (!next[moduleName]) next[moduleName] = {};
        Object.entries(actions || {}).forEach(([action, value]) => {
            if (value) next[moduleName][action] = false;
        });
    });
    return next;
}

async function writeAudit(
    req: Request,
    action: string,
    targetType: string,
    targetId: string | string[] | undefined,
    oldValueSummary?: Record<string, unknown>,
    newValueSummary?: Record<string, unknown>,
    status: 'success' | 'failed' | 'blocked' = 'success',
): Promise<void> {
    const authReq = req as AuthRequest;
    const tid = Array.isArray(targetId) ? targetId[0] : targetId;
    await TeamAuditLog.create({
        actorId: authReq.user?._id ? asObjectId(String(authReq.user._id)) : undefined,
        module: 'team_access_control',
        action,
        targetType,
        targetId: tid,
        oldValueSummary,
        newValueSummary,
        status,
        ip: getClientIp(req),
        device: getDeviceInfo(req),
    });
}

function buildActivityActor(raw: unknown): {
    _id: string;
    full_name?: string;
    username?: string;
    email?: string;
    role?: string;
} | undefined {
    if (!isRecord(raw)) return undefined;
    const id = String(raw._id || '').trim();
    if (!id) return undefined;
    return {
        _id: id,
        full_name: String(raw.full_name || '').trim() || undefined,
        username: String(raw.username || '').trim() || undefined,
        email: String(raw.email || '').trim() || undefined,
        role: String(raw.role || '').trim() || undefined,
    };
}

function buildSessionDurationMinutes(startValue: unknown, endValue: unknown): number | null {
    const start = startValue ? new Date(String(startValue)) : null;
    const end = endValue ? new Date(String(endValue)) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return null;
    return Math.max(0, Math.round(diffMs / 60000));
}

function buildSessionDeviceLabel(item: Record<string, unknown>): string {
    const deviceName = String(item.device_name || '').trim();
    const browser = String(item.browser || '').trim();
    const platform = String(item.platform || '').trim();
    const deviceType = String(item.device_type || '').trim();
    return [deviceName, browser, platform, deviceType].filter(Boolean).join(' • ');
}

function normalizeAuditStatus(value: unknown, fallback = 'success'): string {
    const status = String(value || '').trim().toLowerCase();
    if (!status) return fallback;
    if (status === 'active' || status === 'terminated') return status;
    if (status === 'warning' || status === 'pending' || status === 'failed' || status === 'blocked') return status;
    if (status === 'success') return 'success';
    return fallback;
}

export async function ensureDefaultTeamRoles(): Promise<void> {
    for (const role of DEFAULT_TEAM_ROLES) {
        const existing = await TeamRole.findOne({ slug: role.slug });
        let roleDoc = existing;
        if (!roleDoc) {
            roleDoc = await TeamRole.create({
                name: role.name,
                slug: role.slug,
                description: role.description,
                isSystemRole: role.isSystemRole,
                isActive: role.isActive,
                basePlatformRole: role.basePlatformRole,
            });
        }

        const permissionSet = await RolePermissionSet.findOne({ roleId: roleDoc._id });
        if (!permissionSet) {
            await RolePermissionSet.create({ roleId: roleDoc._id, modulePermissions: role.modulePermissions });
        }
    }
}

export async function teamGetMembers(req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const search = String(req.query.search || '').trim();
        const roleId = String(req.query.roleId || '').trim();
        const status = String(req.query.status || '').trim();

        const filter: Record<string, unknown> = {
            role: { $in: TEAM_USER_ROLES },
        };

        if (status) filter.status = status;
        if (search) {
            const safeSearch = escapeRegex(search);
            filter.$or = [
                { full_name: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
                { username: { $regex: safeSearch, $options: 'i' } },
            ];
        }
        if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
            filter.teamRoleId = asObjectId(roleId);
        }

        const members = await User.find(filter)
            .select('_id full_name email phone_number username role teamRoleId status lastLoginAtUTC twoFactorEnabled forcePasswordResetRequired')
            .populate('teamRoleId', 'name slug')
            .sort({ updatedAt: -1 })
            .lean();

        res.json({ items: members });
    } catch (error) {
        console.error('teamGetMembers error:', error);
        res.status(500).json({ message: 'Failed to load team members' });
    }
}

export async function teamCreateMember(req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const authReq = req as AuthRequest;
        const body = req.body as Record<string, unknown>;
        const fullName = String(body.fullName || '').trim();
        const email = normalizeEmail(body.email);
        const username = String(body.username || email.split('@')[0] || '').trim().toLowerCase();
        const phone = String(body.phone || '').trim();
        const roleId = String(body.roleId || '').trim();
        const mode = String(body.mode || 'invite').trim();
        const status = String(body.status || 'active').trim();
        const notes = String(body.notes || '').trim();
        const passwordMode = String(body.passwordMode || (body.password ? 'manual' : 'invite')).trim().toLowerCase();
        const directPassword = validateManagedPassword(body.password);
        const useDirectPassword = passwordMode === 'manual';

        if (useDirectPassword && !canManageTeamPasswords(authReq.user?.role)) {
            res.status(403).json({ message: 'Only admin or super admin can set passwords directly' });
            return;
        }

        if (useDirectPassword && directPassword.length < 8) {
            res.status(400).json({ message: 'Password must be at least 8 characters' });
            return;
        }

        const requirePasswordReset = Boolean(body.forcePasswordResetRequired ?? (useDirectPassword ? false : true));

        if (!fullName || !email || !username || !mongoose.Types.ObjectId.isValid(roleId)) {
            res.status(400).json({ message: 'fullName, email, username and roleId are required' });
            return;
        }

        const existing = await User.findOne({ $or: [{ email }, { username }] }).lean();
        if (existing) {
            res.status(409).json({ message: 'Email or username already exists' });
            return;
        }

        const role = await TeamRole.findById(roleId).lean();
        if (!role) {
            res.status(404).json({ message: 'Role not found' });
            return;
        }

        const passwordHash = await bcrypt.hash(useDirectPassword ? directPassword : randomPassword(), 10);

        const user = await User.create({
            full_name: fullName,
            email,
            username,
            phone_number: phone || undefined,
            password: passwordHash,
            role: role.basePlatformRole,
            teamRoleId: role._id,
            status,
            forcePasswordResetRequired: requirePasswordReset,
            mustChangePassword: requirePasswordReset,
            passwordSetByAdminId: authReq.user?._id && mongoose.Types.ObjectId.isValid(String(authReq.user._id))
                ? new mongoose.Types.ObjectId(String(authReq.user._id))
                : null,
            passwordLastChangedAtUTC: new Date(),
            passwordChangedByType: 'admin',
            password_updated_at: new Date(),
            passwordExpiresAt: null,
            notes,
        });

        const shouldSendInvite = mode !== 'draft' && mode !== 'without_send';
        const inviteSent = !useDirectPassword && shouldSendInvite
            ? await issueMemberSetPasswordInvite(user, authReq.user?._id ? String(authReq.user._id) : undefined)
            : false;
        if (!useDirectPassword) {
            const inviteStatus = mode === 'draft' ? 'draft' : inviteSent ? 'sent' : 'pending';
            await TeamInvite.create({
                memberId: user._id,
                fullName,
                email,
                phone,
                roleId: role._id,
                status: inviteStatus,
                invitedBy: authReq.user?._id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                notes,
            });
        }

        await writeAudit(req, 'member_created', 'team_member', String(user._id), undefined, {
            roleId,
            role: role.slug,
            status,
            inviteMode: mode,
            passwordMode: useDirectPassword ? 'manual' : 'invite',
            forcePasswordResetRequired: requirePasswordReset,
            inviteSent,
        });

        res.status(201).json({
            message: useDirectPassword
                ? 'Team member created with a direct password'
                : inviteSent ? 'Team member created and invite sent' : 'Team member created',
            item: {
                _id: user._id,
                fullName: user.full_name,
                email: user.email,
                roleId,
                passwordMode: useDirectPassword ? 'manual' : 'invite',
                inviteSent,
            },
        });
    } catch (error) {
        console.error('teamCreateMember error:', error);
        res.status(500).json({ message: 'Failed to create team member' });
    }
}

export async function teamGetMemberById(req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const member = await User.findById(req.params.id)
            .select('_id full_name email phone_number username role teamRoleId status lastLoginAtUTC loginAttempts twoFactorEnabled forcePasswordResetRequired notes createdAt updatedAt')
            .populate('teamRoleId', 'name slug description basePlatformRole')
            .lean();

        if (!member) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }

        const [override, logs] = await Promise.all([
            MemberPermissionOverride.findOne({ memberId: asObjectId(req.params.id) }).lean(),
            TeamAuditLog.find({ targetId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean(),
        ]);

        res.json({ item: member, override, logs });
    } catch (error) {
        console.error('teamGetMemberById error:', error);
        res.status(500).json({ message: 'Failed to load member details' });
    }
}

export async function teamUpdateMember(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const member = await User.findById(req.params.id);
        if (!member) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }

        const oldValue = {
            teamRoleId: member.teamRoleId,
            role: member.role,
            status: member.status,
            forcePasswordResetRequired: member.forcePasswordResetRequired,
            email: member.email,
        };

        if (body.fullName) member.full_name = String(body.fullName).trim();
        if (body.email !== undefined) {
            const nextEmail = normalizeEmail(body.email);
            if (!nextEmail) {
                res.status(400).json({ message: 'email is required' });
                return;
            }
            if (nextEmail !== member.email) {
                const existing = await User.findOne({
                    email: nextEmail,
                    _id: { $ne: member._id },
                }).select('_id').lean();
                if (existing) {
                    res.status(409).json({ message: 'Email already exists' });
                    return;
                }
                member.email = nextEmail;
            }
        }
        const phoneInput = body.phone ?? body.phone_number;
        if (phoneInput !== undefined) member.phone_number = String(phoneInput || '').trim();
        if (body.status) member.status = String(body.status) as any;
        if (body.notes !== undefined) member.notes = String(body.notes || '').trim();
        if (body.forcePasswordResetRequired !== undefined) {
            member.forcePasswordResetRequired = Boolean(body.forcePasswordResetRequired);
        }

        const roleId = String(body.roleId || body.teamRoleId || '').trim();
        if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
            const role = await TeamRole.findById(roleId).lean();
            if (!role) {
                res.status(404).json({ message: 'Role not found' });
                return;
            }
            member.teamRoleId = role._id as mongoose.Types.ObjectId;
            member.role = role.basePlatformRole;
        }

        await member.save();
        await writeAudit(req, 'member_updated', 'team_member', req.params.id, oldValue as Record<string, unknown>, {
            teamRoleId: member.teamRoleId,
            role: member.role,
            status: member.status,
            forcePasswordResetRequired: member.forcePasswordResetRequired,
            email: member.email,
        });

        res.json({ message: 'Member updated', item: member });
    } catch (error) {
        console.error('teamUpdateMember error:', error);
        res.status(500).json({ message: 'Failed to update member' });
    }
}

export async function teamSuspendMember(req: Request, res: Response): Promise<void> {
    await teamUpdateStatus(req, res, 'suspended', 'member_suspended');
}

export async function teamActivateMember(req: Request, res: Response): Promise<void> {
    await teamUpdateStatus(req, res, 'active', 'member_activated');
}

async function teamUpdateStatus(req: Request, res: Response, status: string, action: string): Promise<void> {
    try {
        const member = await User.findById(req.params.id);
        if (!member) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }
        const oldStatus = member.status;
        member.status = status as any;
        await member.save();
        await writeAudit(req, action, 'team_member', req.params.id, { status: oldStatus }, { status });
        res.json({ message: `Member ${status}` });
    } catch (error) {
        console.error('teamUpdateStatus error:', error);
        res.status(500).json({ message: 'Failed to update status' });
    }
}

export async function teamResetPassword(req: Request, res: Response): Promise<void> {
    try {
        const authReq = req as AuthRequest;
        const body = req.body as Record<string, unknown>;
        const member = await User.findById(req.params.id).select('+password');
        if (!member) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }

        const mode = String(body.mode || (body.password ? 'manual' : 'invite')).trim().toLowerCase();
        const directPassword = validateManagedPassword(body.password);
        const useDirectPassword = mode === 'manual';

        if (useDirectPassword && directPassword.length < 8) {
            res.status(400).json({ message: 'Password must be at least 8 characters' });
            return;
        }

        if (useDirectPassword) {
            const forcePasswordResetRequired = Boolean(body.forcePasswordResetRequired ?? false);
            const passwordHash = await bcrypt.hash(directPassword, 10);
            applyManagedPasswordState(member, passwordHash, authReq.user?._id ? String(authReq.user._id) : undefined, forcePasswordResetRequired);
        } else {
            const passwordHash = await bcrypt.hash(randomPassword(), 10);
            applyManagedPasswordState(member, passwordHash, authReq.user?._id ? String(authReq.user._id) : undefined, true);
        }

        await member.save();
        await terminateTeamMemberSessions(String(req.params.id));
        const inviteSent = !useDirectPassword
            ? await issueMemberSetPasswordInvite(member, authReq.user?._id ? String(authReq.user._id) : undefined)
            : false;
        await writeAudit(req, 'member_password_reset', 'team_member', req.params.id, undefined, {
            mode: useDirectPassword ? 'manual' : 'invite',
            forcePasswordResetRequired: member.forcePasswordResetRequired,
            inviteSent,
        });
        res.json({
            message: useDirectPassword
                ? (member.forcePasswordResetRequired ? 'Password updated and force reset enabled' : 'Password updated')
                : inviteSent ? 'Password reset link sent' : 'Password reset prepared',
            inviteSent,
        });
    } catch (error) {
        console.error('teamResetPassword error:', error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
}

export async function teamRevokeSessions(req: Request, res: Response): Promise<void> {
    try {
        const result = await ActiveSession.updateMany(
            { user_id: asObjectId(req.params.id), status: 'active' },
            { $set: { status: 'terminated', terminated_reason: 'admin_revoke', terminated_at: new Date() } },
        );
        await writeAudit(req, 'member_sessions_revoked', 'team_member', req.params.id, undefined, {
            modifiedCount: result.modifiedCount,
        });
        res.json({ message: 'Sessions revoked', modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error('teamRevokeSessions error:', error);
        res.status(500).json({ message: 'Failed to revoke sessions' });
    }
}

export async function teamResendInvite(req: Request, res: Response): Promise<void> {
    try {
        const invite = await TeamInvite.findOne({ memberId: asObjectId(req.params.id) }).sort({ createdAt: -1 });
        if (!invite) {
            res.status(404).json({ message: 'Invite not found' });
            return;
        }
        invite.status = 'sent';
        invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await invite.save();
        await writeAudit(req, 'member_invite_resent', 'team_invite', String(invite._id), { status: 'old' }, { status: 'sent' });
        res.json({ message: 'Invite re-sent', item: invite });
    } catch (error) {
        console.error('teamResendInvite error:', error);
        res.status(500).json({ message: 'Failed to resend invite' });
    }
}

export async function teamGetRoles(_req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const [roles, users] = await Promise.all([
            TeamRole.find({}).sort({ isSystemRole: -1, name: 1 }).lean(),
            User.aggregate([
                { $match: { role: { $in: TEAM_USER_ROLES } } },
                { $group: { _id: '$teamRoleId', totalUsers: { $sum: 1 } } },
            ]),
        ]);

        const countMap = new Map(users.map((item) => [String(item._id || ''), Number(item.totalUsers || 0)]));
        const roleIds = roles.map((r) => r._id);
        const permissionSets = await RolePermissionSet.find({ roleId: { $in: roleIds } }).lean();
        const permissionMap = new Map(permissionSets.map((item) => [String(item.roleId), item.modulePermissions]));

        res.json({
            items: roles.map((role) => ({
                ...role,
                totalUsers: countMap.get(String(role._id)) || 0,
                modulePermissions: permissionMap.get(String(role._id)) || {},
            })),
        });
    } catch (error) {
        console.error('teamGetRoles error:', error);
        res.status(500).json({ message: 'Failed to load roles' });
    }
}

export async function teamCreateRole(req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const body = req.body as Record<string, unknown>;
        const name = String(body.name || '').trim();
        const description = String(body.description || '').trim();
        const slug = String(body.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const cloneFromRoleId = String(body.cloneFromRoleId || '').trim();
        const basePlatformRole = String(body.basePlatformRole || 'viewer').trim();

        if (!name || !slug) {
            res.status(400).json({ message: 'name is required' });
            return;
        }

        const existing = await TeamRole.findOne({ slug }).lean();
        if (existing) {
            res.status(409).json({ message: 'Role slug already exists' });
            return;
        }

        const role = await TeamRole.create({
            name,
            slug,
            description,
            isSystemRole: false,
            isActive: body.isActive !== false,
            basePlatformRole,
        });

        let modulePermissions = pickModulePermissions(body.modulePermissions);
        if (cloneFromRoleId && mongoose.Types.ObjectId.isValid(cloneFromRoleId)) {
            const source = await RolePermissionSet.findOne({ roleId: asObjectId(cloneFromRoleId) }).lean();
            if (source?.modulePermissions) {
                modulePermissions = source.modulePermissions as Record<string, Record<string, boolean>>;
            }
        }

        await RolePermissionSet.create({ roleId: role._id, modulePermissions });
        await writeAudit(req, 'role_created', 'team_role', String(role._id), undefined, { slug, name });

        res.status(201).json({ message: 'Role created', item: role });
    } catch (error) {
        console.error('teamCreateRole error:', error);
        res.status(500).json({ message: 'Failed to create role' });
    }
}

export async function teamGetRoleById(req: Request, res: Response): Promise<void> {
    try {
        const role = await TeamRole.findById(req.params.id).lean();
        if (!role) {
            res.status(404).json({ message: 'Role not found' });
            return;
        }
        const permissions = await RolePermissionSet.findOne({ roleId: asObjectId(req.params.id) }).lean();
        const users = await User.find({ teamRoleId: asObjectId(req.params.id) })
            .select('_id full_name email role status')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();
        res.json({ item: role, permissions: permissions?.modulePermissions || {}, users });
    } catch (error) {
        console.error('teamGetRoleById error:', error);
        res.status(500).json({ message: 'Failed to load role details' });
    }
}

export async function teamUpdateRole(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const role = await TeamRole.findById(req.params.id);
        if (!role) {
            res.status(404).json({ message: 'Role not found' });
            return;
        }

        if (body.name) role.name = String(body.name).trim();
        if (body.description !== undefined) role.description = String(body.description || '').trim();
        if (body.isActive !== undefined) role.isActive = Boolean(body.isActive);
        if (!role.isSystemRole && body.basePlatformRole) {
            role.basePlatformRole = String(body.basePlatformRole) as any;
        }
        await role.save();

        if (body.modulePermissions) {
            const modulePermissions = pickModulePermissions(body.modulePermissions);
            await RolePermissionSet.updateOne({ roleId: role._id }, { $set: { modulePermissions } }, { upsert: true });
        }

        await writeAudit(req, 'role_updated', 'team_role', req.params.id, undefined, {
            name: role.name,
            isActive: role.isActive,
            basePlatformRole: role.basePlatformRole,
        });

        res.json({ message: 'Role updated', item: role });
    } catch (error) {
        console.error('teamUpdateRole error:', error);
        res.status(500).json({ message: 'Failed to update role' });
    }
}

export async function teamDuplicateRole(req: Request, res: Response): Promise<void> {
    try {
        const source = await TeamRole.findById(req.params.id).lean();
        if (!source) {
            res.status(404).json({ message: 'Role not found' });
            return;
        }
        const sourcePermissions = await RolePermissionSet.findOne({ roleId: asObjectId(req.params.id) }).lean();

        const suffix = Date.now().toString().slice(-6);
        const role = await TeamRole.create({
            name: `${source.name} Copy`,
            slug: `${source.slug}-copy-${suffix}`,
            description: source.description,
            isSystemRole: false,
            isActive: source.isActive,
            basePlatformRole: source.basePlatformRole,
        });

        await RolePermissionSet.create({
            roleId: role._id,
            modulePermissions: sourcePermissions?.modulePermissions || {},
        });

        await writeAudit(req, 'role_duplicated', 'team_role', String(role._id), { sourceRoleId: source._id as unknown as string }, { roleId: role._id as unknown as string });
        res.status(201).json({ message: 'Role duplicated', item: role });
    } catch (error) {
        console.error('teamDuplicateRole error:', error);
        res.status(500).json({ message: 'Failed to duplicate role' });
    }
}

export async function teamDeleteRole(req: Request, res: Response): Promise<void> {
    try {
        const role = await TeamRole.findById(req.params.id);
        if (!role) {
            res.status(404).json({ message: 'Role not found' });
            return;
        }
        if (role.isSystemRole) {
            res.status(400).json({ message: 'System roles cannot be archived/deleted' });
            return;
        }

        const usersUsingRole = await User.countDocuments({ teamRoleId: role._id });
        if (usersUsingRole > 0) {
            role.isActive = false;
            await role.save();
            await writeAudit(req, 'role_archived', 'team_role', req.params.id, undefined, { usersUsingRole });
            res.json({ message: 'Role archived because it is assigned to members' });
            return;
        }

        await Promise.all([
            RolePermissionSet.deleteOne({ roleId: role._id }),
            TeamRole.deleteOne({ _id: role._id }),
        ]);

        await writeAudit(req, 'role_deleted', 'team_role', req.params.id);
        res.json({ message: 'Role deleted' });
    } catch (error) {
        console.error('teamDeleteRole error:', error);
        res.status(500).json({ message: 'Failed to delete role' });
    }
}

export async function teamGetPermissions(req: Request, res: Response): Promise<void> {
    try {
        await ensureDefaultTeamRoles();
        const roles = await TeamRole.find({ isActive: true }).sort({ name: 1 }).lean();
        const roleIds = roles.map((r) => r._id);
        const sets = await RolePermissionSet.find({ roleId: { $in: roleIds } }).lean();
        const setMap = new Map(sets.map((set) => [String(set.roleId), set.modulePermissions]));

        res.json({
            modules: TEAM_MODULES,
            actions: TEAM_ACTIONS,
            roles: roles.map((role) => ({
                _id: role._id,
                name: role.name,
                slug: role.slug,
                permissions: setMap.get(String(role._id)) || {},
            })),
        });
    } catch (error) {
        console.error('teamGetPermissions error:', error);
        res.status(500).json({ message: 'Failed to load permissions matrix' });
    }
}

export async function teamUpdateRolePermissions(req: Request, res: Response): Promise<void> {
    try {
        const roleId = String(req.params.id);
        if (!mongoose.Types.ObjectId.isValid(roleId)) {
            res.status(400).json({ message: 'Invalid role id' });
            return;
        }
        const modulePermissions = pickModulePermissions((req.body as Record<string, unknown>).modulePermissions);
        await RolePermissionSet.updateOne({ roleId: new mongoose.Types.ObjectId(roleId) }, { $set: { modulePermissions } }, { upsert: true });

        await writeAudit(req, 'role_permissions_updated', 'team_role', roleId, undefined, { updated: true });
        res.json({ message: 'Role permissions updated' });
    } catch (error) {
        console.error('teamUpdateRolePermissions error:', error);
        res.status(500).json({ message: 'Failed to update permissions' });
    }
}

export async function teamUpdateMemberOverride(req: Request, res: Response): Promise<void> {
    try {
        const memberId = String(req.params.id);
        if (!mongoose.Types.ObjectId.isValid(memberId)) {
            res.status(400).json({ message: 'Invalid member id' });
            return;
        }

        const body = req.body as Record<string, unknown>;
        if (body.allow === undefined && body.deny === undefined) {
            res.status(400).json({ message: 'allow or deny permission matrix is required' });
            return;
        }
        if (body.allow !== undefined && !isRecord(body.allow)) {
            res.status(400).json({ message: 'allow must be a permission matrix object' });
            return;
        }
        if (body.deny !== undefined && !isRecord(body.deny)) {
            res.status(400).json({ message: 'deny must be a permission matrix object' });
            return;
        }

        const member = await User.findById(memberId).select('teamRoleId').lean();
        if (!member) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }

        const allow = pickModulePermissions(body.allow);
        const deny = pickModulePermissions(body.deny);

        await MemberPermissionOverride.updateOne(
            { memberId: asObjectId(memberId) },
            { $set: { allow, deny } },
            { upsert: true },
        );

        if (member?.teamRoleId) {
            const base = await RolePermissionSet.findOne({ roleId: member.teamRoleId }).lean();
            const merged = applyOverride(
                (base?.modulePermissions || {}) as Record<string, Record<string, boolean>>,
                allow,
                deny,
            );
            await User.updateOne({ _id: asObjectId(memberId) }, { $set: { permissionsV2: merged } });
        }

        await writeAudit(req, 'member_override_updated', 'team_member', memberId, undefined, { allow, deny });
        res.json({ message: 'Member override updated' });
    } catch (error) {
        console.error('teamUpdateMemberOverride error:', error);
        res.status(500).json({ message: 'Failed to update member override' });
    }
}

export async function teamGetApprovalRules(_req: Request, res: Response): Promise<void> {
    try {
        const items = await TeamApprovalRule.find({}).populate('approverRoleIds', 'name slug').sort({ module: 1, action: 1 }).lean();
        res.json({ items });
    } catch (error) {
        console.error('teamGetApprovalRules error:', error);
        res.status(500).json({ message: 'Failed to load approval rules' });
    }
}

export async function teamCreateApprovalRule(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const module = String(body.module || '').trim().toLowerCase();
        const action = String(body.action || '').trim().toLowerCase();
        const requiresApproval = body.requiresApproval !== false;
        const requiredApprovals = parseRequiredApprovals(body.requiredApprovals, 1);
        const description = String(body.description || '').trim();
        const { ids: approverRoleIds, invalid } = await resolveApproverRoleIds(body);

        if (!module || !action) {
            res.status(400).json({ message: 'module and action are required' });
            return;
        }
        if (requiredApprovals === null) {
            res.status(400).json({ message: 'requiredApprovals must be an integer greater than 0' });
            return;
        }
        if (invalid.length > 0) {
            res.status(400).json({ message: `Unknown approver roles: ${invalid.join(', ')}` });
            return;
        }

        const item = await TeamApprovalRule.create({
            module,
            action,
            requiresApproval,
            requiredApprovals,
            description,
            approverRoleIds,
        });
        const populatedItem = await TeamApprovalRule.findById(item._id).populate('approverRoleIds', 'name slug').lean();

        await writeAudit(req, 'approval_rule_created', 'approval_rule', String(item._id), undefined, {
            module,
            action,
            requiresApproval,
            requiredApprovals,
            description,
            approverRoleIds: approverRoleIds.map((id) => String(id)),
        });
        res.status(201).json({ item: populatedItem || item, message: 'Approval rule created' });
    } catch (error) {
        console.error('teamCreateApprovalRule error:', error);
        res.status(500).json({ message: 'Failed to create approval rule' });
    }
}

export async function teamUpdateApprovalRule(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const item = await TeamApprovalRule.findById(req.params.id);
        if (!item) {
            res.status(404).json({ message: 'Approval rule not found' });
            return;
        }
        const requiredApprovals = parseRequiredApprovals(body.requiredApprovals, item.requiredApprovals || 1);
        const { ids: approverRoleIds, invalid } = await resolveApproverRoleIds(body);
        if (requiredApprovals === null) {
            res.status(400).json({ message: 'requiredApprovals must be an integer greater than 0' });
            return;
        }
        if (invalid.length > 0) {
            res.status(400).json({ message: `Unknown approver roles: ${invalid.join(', ')}` });
            return;
        }

        if (body.module) item.module = String(body.module).trim().toLowerCase();
        if (body.action) item.action = String(body.action).trim().toLowerCase();
        if (body.requiresApproval !== undefined) item.requiresApproval = Boolean(body.requiresApproval);
        if (body.requiredApprovals !== undefined) item.requiredApprovals = requiredApprovals;
        if (body.description !== undefined) item.description = String(body.description || '').trim();
        if (Array.isArray(body.approverRoleIds) || Array.isArray(body.approverRoles)) {
            item.approverRoleIds = approverRoleIds;
        }
        await item.save();
        const populatedItem = await TeamApprovalRule.findById(item._id).populate('approverRoleIds', 'name slug').lean();

        await writeAudit(req, 'approval_rule_updated', 'approval_rule', req.params.id, undefined, {
            module: item.module,
            action: item.action,
            requiresApproval: item.requiresApproval,
            requiredApprovals: item.requiredApprovals,
            description: item.description,
        });
        res.json({ message: 'Approval rule updated', item: populatedItem || item });
    } catch (error) {
        console.error('teamUpdateApprovalRule error:', error);
        res.status(500).json({ message: 'Failed to update approval rule' });
    }
}

export async function teamDeleteApprovalRule(req: Request, res: Response): Promise<void> {
    try {
        await TeamApprovalRule.deleteOne({ _id: asObjectId(req.params.id) });
        await writeAudit(req, 'approval_rule_deleted', 'approval_rule', req.params.id);
        res.json({ message: 'Approval rule deleted' });
    } catch (error) {
        console.error('teamDeleteApprovalRule error:', error);
        res.status(500).json({ message: 'Failed to delete approval rule' });
    }
}

export async function teamGetActivity(req: Request, res: Response): Promise<void> {
    try {
        const actorId = String(req.query.actorId || '').trim();
        const module = String(req.query.module || '').trim();
        const action = String(req.query.action || '').trim();

        const objectActorId = actorId && mongoose.Types.ObjectId.isValid(actorId) ? asObjectId(actorId) : null;
        const teamFilter: Record<string, unknown> = {};
        const auditFilter: Record<string, unknown> = {};
        const loginFilter: Record<string, unknown> = {};
        const sessionFilter: Record<string, unknown> = {};

        if (objectActorId) {
            teamFilter.actorId = objectActorId;
            auditFilter.actor_id = objectActorId;
            loginFilter.user_id = objectActorId;
            sessionFilter.user_id = objectActorId;
        }
        if (module) {
            teamFilter.module = module;
            auditFilter.module = module;
        }
        if (action) {
            teamFilter.action = action;
            auditFilter.action = action;
        }

        const includeLoginActivity = !module || ['auth_security', 'security_logs', 'team_access_control'].includes(module);
        const includeSessionActivity = !module || ['session_security', 'security_logs', 'auth_security', 'team_access_control'].includes(module);
        const loginSuccessFilter = action === 'login_success' ? true : action === 'login_failed' ? false : undefined;
        const sessionStatusFilter = action === 'session_active'
            ? 'active'
            : action === 'session_terminated'
                ? 'terminated'
                : undefined;

        if (loginSuccessFilter !== undefined) {
            loginFilter.success = loginSuccessFilter;
        }
        if (sessionStatusFilter) {
            sessionFilter.status = sessionStatusFilter;
        }

        const [teamItems, auditItems, loginItems, sessionItems] = await Promise.all([
            TeamAuditLog.find(teamFilter)
                .populate('actorId', 'full_name username email role')
                .sort({ createdAt: -1 })
                .limit(160)
                .lean(),
            AuditLog.find(auditFilter)
                .populate('actor_id', 'full_name username email role')
                .sort({ timestamp: -1 })
                .limit(160)
                .lean(),
            includeLoginActivity
                ? LoginActivity.find(loginFilter)
                    .populate('user_id', 'full_name username email role')
                    .sort({ createdAt: -1 })
                    .limit(120)
                    .lean()
                : Promise.resolve([]),
            includeSessionActivity
                ? ActiveSession.find(sessionFilter)
                    .populate('user_id', 'full_name username email role')
                    .sort({ last_activity: -1, login_time: -1 })
                    .limit(120)
                    .lean()
                : Promise.resolve([]),
        ]);

        const items = [
            ...teamItems.map((item) => {
                const actor = buildActivityActor(item.actorId);
                const createdAt = (item as typeof item & { createdAt?: Date }).createdAt || new Date();
                return {
                    _id: String(item._id),
                    kind: 'team_audit',
                    actorId: actor,
                    actorName: actor?.full_name || actor?.username || 'System',
                    actorRole: actor?.role,
                    module: String(item.module || 'team_access_control'),
                    action: String(item.action || 'activity'),
                    targetType: String(item.targetType || '').trim() || undefined,
                    targetId: String(item.targetId || '').trim() || undefined,
                    oldValueSummary: item.oldValueSummary,
                    newValueSummary: item.newValueSummary,
                    status: normalizeAuditStatus(item.status),
                    ip: String(item.ip || '').trim() || undefined,
                    device: String(item.device || '').trim() || undefined,
                    createdAt,
                };
            }),
            ...auditItems.map((item) => {
                const actor = buildActivityActor(item.actor_id);
                return {
                    _id: String(item._id),
                    kind: 'audit_log',
                    actorId: actor,
                    actorName: actor?.full_name || actor?.username || 'System',
                    actorRole: String(item.actor_role || actor?.role || '').trim() || undefined,
                    module: String(item.module || 'system'),
                    action: String(item.action || 'activity'),
                    targetType: String(item.target_type || '').trim() || undefined,
                    targetId: item.target_id ? String(item.target_id) : undefined,
                    oldValueSummary: item.before,
                    newValueSummary: item.after,
                    status: normalizeAuditStatus(item.status),
                    ip: String(item.ip_address || '').trim() || undefined,
                    device: String(item.device || '').trim() || undefined,
                    details: item.details,
                    sessionId: String(item.sessionId || '').trim() || undefined,
                    createdAt: item.timestamp,
                };
            }),
            ...loginItems.map((item) => {
                const actor = buildActivityActor(item.user_id);
                return {
                    _id: String(item._id),
                    kind: 'login_activity',
                    actorId: actor,
                    actorName: actor?.full_name || actor?.username || item.login_identifier || 'Unknown user',
                    actorRole: String(item.role || actor?.role || '').trim() || undefined,
                    module: 'auth_security',
                    action: item.success ? 'login_success' : 'login_failed',
                    targetType: 'auth',
                    targetId: actor?._id,
                    status: item.success ? 'success' : 'failed',
                    ip: String(item.ip_address || '').trim() || undefined,
                    device: String(item.device_info || item.user_agent || '').trim() || undefined,
                    details: {
                        loginIdentifier: item.login_identifier,
                        suspicious: Boolean(item.suspicious),
                        reason: item.reason || '',
                    },
                    createdAt: item.createdAt,
                };
            }),
            ...sessionItems.map((item) => {
                const actor = buildActivityActor(item.user_id);
                const sessionRecord = item as unknown as Record<string, unknown>;
                const loginAt = item.login_time || item.createdAt;
                const lastActivityAt = item.last_activity || item.updatedAt || loginAt;
                return {
                    _id: String(item._id),
                    kind: 'session_activity',
                    actorId: actor,
                    actorName: actor?.full_name || actor?.username || 'Unknown user',
                    actorRole: actor?.role,
                    module: 'session_security',
                    action: item.status === 'terminated' ? 'session_terminated' : 'session_active',
                    targetType: 'session',
                    targetId: String(item.session_id || '').trim() || undefined,
                    status: normalizeAuditStatus(item.status, 'active'),
                    ip: String(item.ip_address || '').trim() || undefined,
                    device: buildSessionDeviceLabel(sessionRecord) || undefined,
                    browser: String(item.browser || '').trim() || undefined,
                    platform: String(item.platform || '').trim() || undefined,
                    locationSummary: String(item.location_summary || '').trim() || undefined,
                    sessionId: String(item.session_id || '').trim() || undefined,
                    loginAt,
                    lastActivityAt,
                    durationMinutes: buildSessionDurationMinutes(loginAt, lastActivityAt),
                    details: {
                        riskScore: item.risk_score,
                        riskFlags: item.risk_flags,
                        terminatedReason: item.terminated_reason,
                    },
                    createdAt: lastActivityAt,
                };
            }),
        ]
            .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime())
            .slice(0, 300);

        res.json({ items });
    } catch (error) {
        console.error('teamGetActivity error:', error);
        res.status(500).json({ message: 'Failed to load activity logs' });
    }
}

export async function teamGetActivityById(req: Request, res: Response): Promise<void> {
    try {
        const item = await TeamAuditLog.findById(req.params.id).populate('actorId', 'full_name username email role').lean();
        if (!item) {
            res.status(404).json({ message: 'Activity log not found' });
            return;
        }
        res.json({ item });
    } catch (error) {
        console.error('teamGetActivityById error:', error);
        res.status(500).json({ message: 'Failed to load activity log' });
    }
}

export async function teamGetSecurityOverview(_req: Request, res: Response): Promise<void> {
    try {
        const members = await User.find({ role: { $in: TEAM_USER_ROLES } })
            .select('_id full_name email status forcePasswordResetRequired twoFactorEnabled loginAttempts lastLoginAtUTC')
            .sort({ updatedAt: -1 })
            .lean();

        res.json({
            items: members,
            summary: {
                total: members.length,
                suspended: members.filter((m) => m.status === 'suspended').length,
                resetRequired: members.filter((m) => m.forcePasswordResetRequired).length,
                twoFactorEnabled: members.filter((m) => m.twoFactorEnabled).length,
            },
        });
    } catch (error) {
        console.error('teamGetSecurityOverview error:', error);
        res.status(500).json({ message: 'Failed to load security overview' });
    }
}

export async function teamGetInvites(_req: Request, res: Response): Promise<void> {
    try {
        const items = await TeamInvite.find({})
            .populate('roleId', 'name slug')
            .populate('invitedBy', 'full_name username')
            .sort({ createdAt: -1 })
            .limit(300)
            .lean();
        res.json({ items });
    } catch (error) {
        console.error('teamGetInvites error:', error);
        res.status(500).json({ message: 'Failed to load invites' });
    }
}
