/**
 * Notification Orchestration Service
 *
 * Resolves audience → recipients → channels → template rendering →
 * provider send → delivery log → finance sync → audit log.
 *
 * Supports: manual campaigns, automatic triggers, result publishing,
 * guardian combinations, duplicate prevention, quiet hours,
 * delayed scheduling, test-send, preview/estimate.
 */

import mongoose from 'mongoose';
import NotificationJob from '../models/NotificationJob';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationTemplate from '../models/NotificationTemplate';
import NotificationSettings, { INotificationSettings } from '../models/NotificationSettings';
import StudentGroup from '../models/StudentGroup';
import StudentProfile from '../models/StudentProfile';
import User from '../models/User';
import UserSubscription from '../models/UserSubscription';
import FinanceSettings from '../models/FinanceSettings';
import FinanceTransaction from '../models/FinanceTransaction';
import AuditLog from '../models/AuditLog';
import {
    sendSMS,
    sendEmail,
    getActiveProvider,
    renderTemplate,
    SendResult,
} from './notificationProviderService';
import { nextTxnCode } from './financeCenterService';
import { resolveSubscriptionContactUserIds } from './subscriptionContactCenterService';

/* ================================================================
   Types
   ================================================================ */

export interface RecipientInfo {
    userId: mongoose.Types.ObjectId;
    phone?: string;
    email?: string;
    fullName: string;
    isGuardian?: boolean;
    guardianPhone?: string;
    guardianEmail?: string;
    guardianName?: string;
}

export interface CampaignSendOptions {
    campaignName: string;
    channels: ('sms' | 'email')[];
    templateKey?: string;
    customBody?: string;
    customSubject?: string;
    vars?: Record<string, string>;
    audienceType: 'group' | 'filter' | 'manual' | 'all';
    audienceGroupId?: string;
    audienceFilters?: Record<string, unknown>;
    manualStudentIds?: string[];
    includeUserIds?: string[];
    excludeUserIds?: string[];
    guardianTargeted?: boolean;
    recipientMode?: 'student' | 'guardian' | 'both';
    scheduledAtUTC?: Date;
    quietHoursMode?: 'respect' | 'bypass';
    adminId: string;
    triggerKey?: string;
    testSend?: boolean;
    originModule?: 'campaign' | 'news' | 'notice' | 'trigger';
    originEntityId?: string;
    originAction?: string;
}

export interface PreviewEstimate {
    recipientCount: number;
    guardianCount: number;
    channelBreakdown: { sms: number; email: number };
    estimatedCostBDT: number;
    sampleRendered?: { subject?: string; body: string };
}

function deriveJobChannel(channels: ('sms' | 'email')[]): 'sms' | 'email' | 'both' {
    if (channels.includes('sms') && channels.includes('email')) return 'both';
    return channels.includes('email') ? 'email' : 'sms';
}

function deriveJobTarget(audienceType: CampaignSendOptions['audienceType']): 'single' | 'group' | 'filter' | 'selected' {
    if (audienceType === 'group') return 'group';
    if (audienceType === 'manual') return 'selected';
    return 'filter';
}

/* ================================================================
   Settings helper (singleton)
   ================================================================ */

async function getSettings(): Promise<INotificationSettings> {
    let settings = await NotificationSettings.findOne().lean<INotificationSettings>();
    if (!settings) {
        settings = await NotificationSettings.create({});
    }
    return settings;
}

async function resolveActorObjectId(actorId: string): Promise<mongoose.Types.ObjectId> {
    if (mongoose.Types.ObjectId.isValid(actorId)) {
        return new mongoose.Types.ObjectId(actorId);
    }

    const admin = await User.findOne({ role: { $in: ['superadmin', 'admin'] } })
        .select('_id')
        .sort({ createdAt: 1 })
        .lean();
    if (admin?._id) {
        return new mongoose.Types.ObjectId(String(admin._id));
    }

    const fallback = await User.findOne({ role: { $in: ['moderator', 'support_agent', 'finance_agent', 'editor', 'viewer'] } })
        .select('_id')
        .sort({ createdAt: 1 })
        .lean();
    if (fallback?._id) {
        return new mongoose.Types.ObjectId(String(fallback._id));
    }

    throw new Error('No admin actor is available for notification job ownership');
}

/* ================================================================
   Audience resolution
   ================================================================ */

export async function resolveAudience(
    audienceType: CampaignSendOptions['audienceType'],
    opts: {
        groupId?: string;
        filters?: Record<string, unknown>;
        manualStudentIds?: string[];
        includeUserIds?: string[];
        excludeUserIds?: string[];
    },
): Promise<RecipientInfo[]> {
    let userIds: mongoose.Types.ObjectId[] = [];

    if (audienceType === 'manual' && opts.manualStudentIds?.length) {
        userIds = opts.manualStudentIds.map((id) => new mongoose.Types.ObjectId(id));
    } else if (audienceType === 'group' && opts.groupId) {
        const group = await StudentGroup.findById(opts.groupId).lean();
        if (!group) return [];
        if (group.type === 'dynamic' && group.rules) {
            userIds = await resolveDynamicGroupUserIds(group.rules);
        } else {
            // Use StudentProfile.groupIds as the authoritative membership source
            const memberProfiles = await StudentProfile.find(
                { groupIds: new mongoose.Types.ObjectId(opts.groupId), status: { $ne: 'deleted' } },
            ).select('user_id').lean();
            userIds = memberProfiles.map((p) => p.user_id as mongoose.Types.ObjectId);
        }
    } else if (audienceType === 'filter' && opts.filters) {
        userIds = await resolveFilterUserIds(opts.filters);
    } else if (audienceType === 'all') {
        const profiles = await StudentProfile.find({ status: { $ne: 'deleted' } })
            .select('user_id')
            .lean();
        userIds = profiles.map((p) => p.user_id as mongoose.Types.ObjectId);
    }

    const includeIds = (opts.includeUserIds ?? [])
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    if (includeIds.length > 0) {
        const seen = new Set(userIds.map((id) => String(id)));
        for (const includeId of includeIds) {
            if (!seen.has(String(includeId))) {
                userIds.push(includeId);
            }
        }
    }

    const excludeIdSet = new Set(
        (opts.excludeUserIds ?? [])
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => String(id)),
    );
    if (excludeIdSet.size > 0) {
        userIds = userIds.filter((id) => !excludeIdSet.has(String(id)));
    }

    if (!userIds.length) return [];

    const [users, profiles] = await Promise.all([
        User.find({ _id: { $in: userIds } })
            .select('email phone_number full_name')
            .lean(),
        StudentProfile.find({ user_id: { $in: userIds } })
            .select('user_id email phone_number full_name guardian_name guardian_phone guardian_email')
            .lean(),
    ]);

    const profileMap = new Map(
        profiles.map((p) => [String(p.user_id), p]),
    );

    return users.map((u) => {
        const p = profileMap.get(String(u._id)) as Record<string, unknown> | undefined;
        return {
            userId: u._id as mongoose.Types.ObjectId,
            phone: (p?.phone_number ?? u.phone_number ?? '') as string,
            email: (p?.email ?? u.email ?? '') as string,
            fullName: (p?.full_name ?? u.full_name ?? '') as string,
            guardianPhone: (p?.guardian_phone ?? '') as string,
            guardianEmail: (p?.guardian_email ?? '') as string,
            guardianName: (p?.guardian_name ?? '') as string,
        };
    });
}

async function resolveDynamicGroupUserIds(
    rules: Record<string, unknown>,
): Promise<mongoose.Types.ObjectId[]> {
    return resolveFilterUserIds(rules);
}

async function resolveFilterUserIds(
    filters: Record<string, unknown>,
): Promise<mongoose.Types.ObjectId[]> {
    const mappedFilters: Record<string, unknown> = {
        ...filters,
        accountStatuses: Array.isArray(filters.accountStatuses)
            ? filters.accountStatuses
            : (Array.isArray(filters.statuses) ? filters.statuses : undefined),
    };
    return resolveSubscriptionContactUserIds(mappedFilters);
}

async function filterUserIdsByActivePlanCodes(
    userIds: mongoose.Types.ObjectId[],
    planCodes: string[],
): Promise<mongoose.Types.ObjectId[]> {
    const normalizedPlanCodes = Array.from(new Set(planCodes.map((value) => value.trim().toLowerCase()).filter(Boolean)));
    if (!userIds.length || !normalizedPlanCodes.length) {
        return userIds;
    }

    const subscriptions = await UserSubscription.find({
        userId: { $in: userIds },
        status: 'active',
        expiresAtUTC: { $gt: new Date() },
    })
        .populate('planId', 'code')
        .select('userId planId')
        .lean();

    const allowedUserIds = new Set<string>();
    for (const subscription of subscriptions as Array<Record<string, unknown>>) {
        const plan = (subscription.planId as Record<string, unknown> | undefined) || {};
        const planCode = String(plan.code || '').trim().toLowerCase();
        if (!planCode || !normalizedPlanCodes.includes(planCode)) continue;
        allowedUserIds.add(String(subscription.userId || ''));
    }

    return userIds.filter((userId) => allowedUserIds.has(String(userId)));
}

/* ================================================================
   Duplicate prevention
   ================================================================ */

async function isDuplicate(params: {
    studentId: mongoose.Types.ObjectId;
    channel: string;
    templateKey?: string;
    windowMinutes: number;
    to: string;
    guardianTargeted: boolean;
}): Promise<boolean> {
    const {
        studentId,
        channel,
        templateKey,
        windowMinutes,
        to,
        guardianTargeted,
    } = params;
    if (windowMinutes <= 0) return false;
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const existing = await NotificationDeliveryLog.findOne({
        studentId,
        channel,
        status: 'sent',
        sentAtUTC: { $gte: cutoff },
        to,
        guardianTargeted,
        ...(templateKey ? { templateKey: String(templateKey).toUpperCase() } : {}),
    }).lean();
    return !!existing;
}

function resolveOriginModule(opts: CampaignSendOptions): 'campaign' | 'news' | 'notice' | 'trigger' {
    if (opts.originModule === 'news' || opts.originModule === 'notice' || opts.originModule === 'trigger') {
        return opts.originModule;
    }
    return opts.triggerKey ? 'trigger' : 'campaign';
}

/* ================================================================
   Quiet hours check
   ================================================================ */

interface ZonedDateParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

interface QuietHoursState {
    active: boolean;
    nextAllowedAtUTC?: Date;
}

function getTimeZoneParts(date: Date, timeZone: string): ZonedDateParts {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = getTimeZoneParts(date, timeZone);
    const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return utcMs - date.getTime();
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offsetMs = getTimeZoneOffsetMs(guess, timeZone);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);
}

function shiftCalendarDate(parts: Pick<ZonedDateParts, 'year' | 'month' | 'day'>, days: number): Pick<ZonedDateParts, 'year' | 'month' | 'day'> {
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

function isQuietHourActive(hour: number, startHour: number, endHour: number): boolean {
    if (startHour <= endHour) {
        return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
}

function getQuietHoursState(settings: INotificationSettings, now = new Date()): QuietHoursState {
    if (!settings.quietHours?.enabled) return { active: false };
    const { startHour, endHour, timezone = 'Asia/Dhaka' } = settings.quietHours;
    const localNow = getTimeZoneParts(now, timezone);
    const active = isQuietHourActive(localNow.hour, startHour, endHour);
    if (!active) return { active: false };

    let targetDate = { year: localNow.year, month: localNow.month, day: localNow.day };
    if (startHour > endHour && localNow.hour >= startHour) {
        targetDate = shiftCalendarDate(targetDate, 1);
    }

    let nextAllowedAtUTC = zonedDateTimeToUtc(targetDate.year, targetDate.month, targetDate.day, endHour, 0, 0, timezone);
    if (nextAllowedAtUTC.getTime() <= now.getTime()) {
        const nextDay = shiftCalendarDate(targetDate, 1);
        nextAllowedAtUTC = zonedDateTimeToUtc(nextDay.year, nextDay.month, nextDay.day, endHour, 0, 0, timezone);
    }

    return { active: true, nextAllowedAtUTC };
}

function normalizeChannels(channels: ('sms' | 'email')[] | undefined): ('sms' | 'email')[] {
    const normalized = Array.from(new Set((channels ?? []).filter((channel): channel is 'sms' | 'email' => channel === 'sms' || channel === 'email')));
    return normalized.length > 0 ? normalized : ['email'];
}

function normalizeRecipientMode(mode: string | undefined): 'student' | 'guardian' | 'both' {
    return mode === 'guardian' || mode === 'both' ? mode : 'student';
}

/* ================================================================
   Preview / Estimate
   ================================================================ */

export async function previewAndEstimate(
    opts: CampaignSendOptions,
): Promise<PreviewEstimate> {
    const recipients = await resolveAudience(opts.audienceType, {
        groupId: opts.audienceGroupId,
        filters: opts.audienceFilters,
        manualStudentIds: opts.manualStudentIds,
    });

    const finSettings = await FinanceSettings.findOne().lean();
    const smsCost = finSettings?.smsCostPerMessageBDT ?? 0.35;
    const emailCost = finSettings?.emailCostPerMessageBDT ?? 0.05;

    let smsCount = 0;
    let emailCount = 0;
    let guardianCount = 0;

    for (const r of recipients) {
        for (const ch of opts.channels) {
            if (ch === 'sms' && r.phone) smsCount++;
            if (ch === 'email' && r.email) emailCount++;
        }
        if (opts.guardianTargeted || opts.recipientMode === 'guardian' || opts.recipientMode === 'both') {
            guardianCount++;
            for (const ch of opts.channels) {
                if (ch === 'sms' && r.guardianPhone) smsCount++;
                if (ch === 'email' && r.guardianEmail) emailCount++;
            }
        }
    }

    const estimatedCostBDT = smsCount * smsCost + emailCount * emailCost;

    let sampleRendered: PreviewEstimate['sampleRendered'] | undefined;
    if (opts.templateKey) {
        const tpl = await NotificationTemplate.findOne({
            key: opts.templateKey.toUpperCase(),
            isEnabled: true,
        }).lean();
        if (tpl) {
            const sampleVars: Record<string, string> = {
                student_name: 'সাকিব আহমেদ',
                guardian_name: 'জনাব আহমেদ',
                ...(opts.vars ?? {}),
            };
            sampleRendered = {
                body: renderTemplate(tpl.body, sampleVars),
                subject: tpl.subject ? renderTemplate(tpl.subject, sampleVars) : undefined,
            };
        }
    } else if (opts.customBody) {
        sampleRendered = {
            body: renderTemplate(opts.customBody, opts.vars ?? {}),
            subject: opts.customSubject,
        };
    }

    return {
        recipientCount: recipients.length,
        guardianCount,
        channelBreakdown: { sms: smsCount, email: emailCount },
        estimatedCostBDT: Math.round(estimatedCostBDT * 100) / 100,
        sampleRendered,
    };
}

/* ================================================================
   Finance sync
   ================================================================ */

async function syncCostToFinance(
    channel: 'sms' | 'email',
    count: number,
    costPerMessage: number,
    sourceType: string,
    jobId: string,
    adminId: string,
    description: string,
): Promise<void> {
    const totalCost = count * costPerMessage;
    if (totalCost <= 0) return;
    const txnCode = await nextTxnCode();
    const actorObjectId = await resolveActorObjectId(adminId);
    await FinanceTransaction.create({
        txnCode,
        direction: 'expense',
        amount: totalCost,
        currency: 'BDT',
        dateUTC: new Date(),
        accountCode: channel === 'sms' ? 'COM-SMS' : 'COM-EMAIL',
        categoryLabel: `${channel.toUpperCase()} Campaign Cost`,
        description,
        status: 'paid',
        method: 'auto',
        sourceType,
        sourceId: jobId,
        paidAtUTC: new Date(),
        createdByAdminId: actorObjectId,
    });
}

function parseStoredAudienceFilters(raw: string | undefined): Record<string, unknown> | undefined {
    if (!raw) return undefined;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

interface StoredNotificationJobShape {
    _id: mongoose.Types.ObjectId;
    campaignName?: string;
    channel: 'sms' | 'email' | 'both';
    templateKey?: string;
    customBody?: string;
    customSubject?: string;
    payloadOverrides?: Record<string, string>;
    audienceType?: string;
    target?: string;
    targetGroupId?: mongoose.Types.ObjectId | null;
    targetStudentId?: mongoose.Types.ObjectId | null;
    targetStudentIds?: mongoose.Types.ObjectId[] | null;
    targetFilterJson?: string;
    guardianTargeted?: boolean;
    recipientMode?: string;
    scheduledAtUTC?: Date | null;
    createdByAdminId: mongoose.Types.ObjectId;
    triggerKey?: string;
    originModule?: 'campaign' | 'news' | 'notice' | 'trigger';
    originEntityId?: string;
    originAction?: string;
    isTestSend?: boolean;
}

function deriveAudienceTypeFromJob(job: StoredNotificationJobShape): CampaignSendOptions['audienceType'] {
    if (job.audienceType === 'group' || job.audienceType === 'filter' || job.audienceType === 'manual' || job.audienceType === 'all') {
        return job.audienceType;
    }
    if (job.target === 'group') return 'group';
    if (job.target === 'single' || job.target === 'selected') return 'manual';
    return 'filter';
}

function buildCampaignOptionsFromJob(job: StoredNotificationJobShape): CampaignSendOptions {
    const manualStudentIds = Array.from(new Set([
        ...(job.targetStudentId ? [String(job.targetStudentId)] : []),
        ...((job.targetStudentIds ?? []).map((studentId) => String(studentId))),
    ]));

    const storedFilters = parseStoredAudienceFilters(job.targetFilterJson);

    return {
        campaignName: String(job.campaignName || job.templateKey || 'Queued Notification'),
        channels: job.channel === 'both' ? ['sms', 'email'] : [job.channel],
        templateKey: job.templateKey && job.templateKey !== 'CUSTOM' ? job.templateKey : undefined,
        customBody: job.customBody,
        customSubject: job.customSubject,
        vars: job.payloadOverrides,
        audienceType: deriveAudienceTypeFromJob(job),
        audienceGroupId: job.targetGroupId ? String(job.targetGroupId) : undefined,
        audienceFilters: storedFilters,
        manualStudentIds: manualStudentIds.length > 0 ? manualStudentIds : undefined,
        includeUserIds: Array.isArray(storedFilters?.includeUserIds) ? storedFilters.includeUserIds as string[] : undefined,
        excludeUserIds: Array.isArray(storedFilters?.excludeUserIds) ? storedFilters.excludeUserIds as string[] : undefined,
        guardianTargeted: Boolean(job.guardianTargeted),
        recipientMode: normalizeRecipientMode(job.recipientMode),
        scheduledAtUTC: job.scheduledAtUTC ?? undefined,
        adminId: String(job.createdByAdminId),
        triggerKey: job.triggerKey,
        testSend: Boolean(job.isTestSend),
        originModule: job.originModule,
        originEntityId: job.originEntityId,
        originAction: job.originAction,
    };
}

async function resolveTemplateForCampaign(opts: CampaignSendOptions): Promise<{ _id: mongoose.Types.ObjectId; body: string; subject?: string; key: string } | null> {
    if (!opts.templateKey) return null;
    const template = await NotificationTemplate.findOne({
        key: opts.templateKey.toUpperCase(),
        isEnabled: true,
    })
        .select('_id key body subject')
        .lean();
    return template ? { _id: template._id as mongoose.Types.ObjectId, body: template.body, subject: template.subject, key: template.key } : null;
}

function renderCampaignContent(
    template: { _id: mongoose.Types.ObjectId; body: string; subject?: string; key: string } | null,
    opts: CampaignSendOptions,
    recipient: RecipientInfo,
): { body: string; subject: string } {
    const mergedVars: Record<string, string> = {
        student_name: recipient.fullName,
        guardian_name: recipient.guardianName || '',
        ...(opts.vars ?? {}),
    };
    const body = template
        ? renderTemplate(template.body, mergedVars)
        : opts.customBody
            ? renderTemplate(opts.customBody, mergedVars)
            : '';
    const subject = template?.subject
        ? renderTemplate(template.subject, mergedVars)
        : opts.customSubject ?? '';
    return { body, subject };
}

function buildDeliveryTargets(
    recipient: RecipientInfo,
    channels: ('sms' | 'email')[],
    recipientMode: 'student' | 'guardian' | 'both',
): Array<{ to: string; channel: 'sms' | 'email'; isGuardian: boolean }> {
    const targets: Array<{ to: string; channel: 'sms' | 'email'; isGuardian: boolean }> = [];
    for (const channel of channels) {
        if (recipientMode === 'student' || recipientMode === 'both') {
            const address = channel === 'sms' ? recipient.phone : recipient.email;
            if (address) targets.push({ to: address, channel, isGuardian: false });
        }
        if (recipientMode === 'guardian' || recipientMode === 'both') {
            const address = channel === 'sms' ? recipient.guardianPhone : recipient.guardianEmail;
            if (address) targets.push({ to: address, channel, isGuardian: true });
        }
    }
    return targets;
}

async function resolveAudienceForCampaign(opts: CampaignSendOptions): Promise<RecipientInfo[]> {
    const recipients = await resolveAudience(opts.audienceType, {
        groupId: opts.audienceGroupId,
        filters: opts.audienceFilters,
        manualStudentIds: opts.manualStudentIds,
        includeUserIds: opts.includeUserIds,
        excludeUserIds: opts.excludeUserIds,
    });
    return opts.testSend ? recipients.slice(0, 1) : recipients;
}

function estimateNotificationCost(
    recipients: RecipientInfo[],
    channels: ('sms' | 'email')[],
    recipientMode: 'student' | 'guardian' | 'both',
    smsCost: number,
    emailCost: number,
): number {
    let total = 0;
    for (const recipient of recipients) {
        for (const target of buildDeliveryTargets(recipient, channels, recipientMode)) {
            total += target.channel === 'sms' ? smsCost : emailCost;
        }
    }
    return total;
}
async function createNotificationJobRecord(
    opts: CampaignSendOptions,
    state: {
        status: 'queued' | 'processing';
        scheduledAtUTC?: Date;
        quietHoursApplied?: boolean;
        recipientsCount: number;
        estimatedCost: number;
        errorMessage?: string;
    },
) {
    const actorObjectId = await resolveActorObjectId(opts.adminId);
    const manualStudentObjectIds = (opts.manualStudentIds ?? [])
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    return NotificationJob.create({
        type: state.scheduledAtUTC ? 'scheduled' : opts.triggerKey ? 'triggered' : opts.testSend ? 'test_send' : 'bulk',
        campaignName: opts.campaignName,
        status: state.status,
        channel: deriveJobChannel(normalizeChannels(opts.channels)),
        target: deriveJobTarget(opts.audienceType),
        targetStudentId: manualStudentObjectIds.length === 1 ? manualStudentObjectIds[0] : undefined,
        targetGroupId: opts.audienceGroupId && mongoose.Types.ObjectId.isValid(opts.audienceGroupId)
            ? new mongoose.Types.ObjectId(opts.audienceGroupId)
            : undefined,
        targetStudentIds: manualStudentObjectIds.length > 0 ? manualStudentObjectIds : undefined,
        targetFilterJson: (opts.audienceFilters || opts.includeUserIds?.length || opts.excludeUserIds?.length)
            ? JSON.stringify({
                ...(opts.audienceFilters || {}),
                ...(opts.includeUserIds?.length ? { includeUserIds: opts.includeUserIds } : {}),
                ...(opts.excludeUserIds?.length ? { excludeUserIds: opts.excludeUserIds } : {}),
            })
            : undefined,
        audienceType: opts.audienceType,
        audienceRef: opts.audienceGroupId,
        templateKey: (opts.templateKey || 'CUSTOM').toUpperCase(),
        payloadOverrides: opts.vars,
        customBody: opts.customBody,
        customSubject: opts.customSubject,
        recipientMode: normalizeRecipientMode(opts.recipientMode),
        guardianTargeted: opts.guardianTargeted ?? false,
        scheduledAtUTC: state.scheduledAtUTC,
        totalTargets: state.recipientsCount,
        sentCount: 0,
        failedCount: 0,
        estimatedCost: state.estimatedCost,
        actualCost: 0,
        triggerKey: opts.triggerKey,
        originModule: resolveOriginModule(opts),
        originEntityId: String(opts.originEntityId || '').trim(),
        originAction: String(opts.originAction || '').trim(),
        quietHoursApplied: Boolean(state.quietHoursApplied),
        createdByAdminId: actorObjectId,
        errorMessage: state.errorMessage,
        isTestSend: Boolean(opts.testSend),
        lastAttemptedAtUTC: state.status === 'processing' ? new Date() : undefined,
        nextRetryAtUTC: state.status === 'queued' ? state.scheduledAtUTC : undefined,
    });
}

async function finalizeNotificationJob(
    jobId: mongoose.Types.ObjectId,
    opts: CampaignSendOptions,
    settings: INotificationSettings,
    stats: {
        recipientsCount: number;
        sent: number;
        failed: number;
        skipped: number;
        smsSentCount: number;
        emailSentCount: number;
        smsCost: number;
        emailCost: number;
    },
): Promise<void> {
    const actorObjectId = await resolveActorObjectId(opts.adminId);
    const actualCost = stats.smsSentCount * stats.smsCost + stats.emailSentCount * stats.emailCost;
    const totalAttempts = stats.sent + stats.failed;
    const finalStatus =
        totalAttempts === 0
            ? 'done'
            : stats.sent === 0 && stats.failed > 0
                ? 'failed'
                : stats.failed > 0
                    ? 'partial'
                    : 'done';

    await NotificationJob.findByIdAndUpdate(jobId, {
        status: finalStatus,
        sentCount: stats.sent,
        failedCount: stats.failed,
        actualCost,
        processedAtUTC: new Date(),
        nextRetryAtUTC: undefined,
        errorMessage: undefined,
    });

    if (settings.autoSyncCostToFinance && !opts.testSend) {
        const sourceType = opts.triggerKey
            ? 'auto_notification_cost'
            : opts.guardianTargeted
                ? 'guardian_notification_cost'
                : normalizeChannels(opts.channels).includes('sms')
                    ? 'sms_campaign_cost'
                    : 'email_campaign_cost';

        if (stats.smsSentCount > 0) {
            await syncCostToFinance('sms', stats.smsSentCount, stats.smsCost, sourceType, String(jobId), opts.adminId, `SMS campaign: ${opts.campaignName}`);
        }
        if (stats.emailSentCount > 0) {
            await syncCostToFinance('email', stats.emailSentCount, stats.emailCost, sourceType, String(jobId), opts.adminId, `Email campaign: ${opts.campaignName}`);
        }
    }

    await AuditLog.create({
        actor_id: actorObjectId,
        action: opts.testSend ? 'notification_test_send' : 'notification_campaign_sent',
        target_id: jobId,
        target_type: 'NotificationJob',
        details: {
            campaignName: opts.campaignName,
            channels: normalizeChannels(opts.channels),
            recipientCount: stats.recipientsCount,
            sent: stats.sent,
            failed: stats.failed,
            skipped: stats.skipped,
            actualCost,
            originModule: resolveOriginModule(opts),
            originEntityId: String(opts.originEntityId || '').trim(),
            originAction: String(opts.originAction || '').trim(),
        },
    });
}

async function dispatchNotificationJob(
    jobId: mongoose.Types.ObjectId,
    opts: CampaignSendOptions,
    settings: INotificationSettings,
): Promise<{ sent: number; failed: number; skipped: number }> {
    const recipients = await resolveAudienceForCampaign(opts);
    const channels = normalizeChannels(opts.channels);
    const recipientMode = normalizeRecipientMode(opts.recipientMode);
    const financeSettings = await FinanceSettings.findOne().lean();
    const smsCost = financeSettings?.smsCostPerMessageBDT ?? 0.35;
    const emailCost = financeSettings?.emailCostPerMessageBDT ?? 0.05;
    const template = await resolveTemplateForCampaign(opts);
    if (template?._id) {
        await NotificationJob.updateOne(
            { _id: jobId },
            { $set: { templateIds: [template._id], templateKey: template.key } },
        );
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let smsSentCount = 0;
    let emailSentCount = 0;

    for (const recipient of recipients) {
        const targets = buildDeliveryTargets(recipient, channels, recipientMode);
        for (const target of targets) {
            if (!opts.testSend && settings.duplicatePreventionWindowMinutes > 0) {
                const duplicate = await isDuplicate({
                    studentId: recipient.userId,
                    channel: target.channel,
                    templateKey: opts.templateKey ?? opts.campaignName,
                    windowMinutes: settings.duplicatePreventionWindowMinutes,
                    to: target.to,
                    guardianTargeted: target.isGuardian,
                });
                if (duplicate) {
                    skipped++;
                    continue;
                }
            }

            const provider = await getActiveProvider(target.channel);
            if (!provider) {
                failed++;
                continue;
            }

            const rendered = renderCampaignContent(template, opts, recipient);
            let result: SendResult;
            try {
                if (target.channel === 'sms') {
                    result = await sendSMS({ to: target.to, body: rendered.body }, provider);
                } else {
                    result = await sendEmail({ to: target.to, subject: rendered.subject, html: rendered.body, text: rendered.body }, provider);
                }
            } catch (error: unknown) {
                result = { success: false, error: error instanceof Error ? error.message : String(error) };
            }

            await NotificationDeliveryLog.create({
                jobId,
                campaignId: jobId,
                studentId: recipient.userId,
                guardianTargeted: target.isGuardian,
                channel: target.channel,
                providerUsed: provider.provider,
                templateKey: template?.key || '',
                templateId: template?._id || undefined,
                to: target.to,
                status: result.success ? 'sent' : 'failed',
                providerMessageId: result.messageId,
                errorMessage: result.error,
                originModule: resolveOriginModule(opts),
                originEntityId: String(opts.originEntityId || '').trim(),
                originAction: String(opts.originAction || '').trim(),
                sentAtUTC: result.success ? new Date() : undefined,
                costAmount: result.success ? (target.channel === 'sms' ? smsCost : emailCost) : 0,
                recipientMode,
                messageMode: template ? 'template' : 'custom',
                recipientDisplay: target.isGuardian
                    ? (recipient.guardianName || recipient.fullName || target.to)
                    : (recipient.fullName || target.to),
                renderedPreview: target.channel === 'email'
                    ? `${rendered.subject}\n\n${rendered.body}`.slice(0, 1200)
                    : rendered.body.slice(0, 600),
            });

            if (result.success) {
                sent++;
                if (target.channel === 'sms') smsSentCount++;
                else emailSentCount++;
            } else {
                failed++;
            }
        }
    }

    await finalizeNotificationJob(jobId, opts, settings, {
        recipientsCount: recipients.length,
        sent,
        failed,
        skipped,
        smsSentCount,
        emailSentCount,
        smsCost,
        emailCost,
    });

    return { sent, failed, skipped };
}
/* ================================================================
   Core campaign execution
   ================================================================ */

export async function executeCampaign(
    opts: CampaignSendOptions,
): Promise<{ jobId: string; sent: number; failed: number; skipped: number }> {
    const settings = await getSettings();
    const normalizedOptions: CampaignSendOptions = {
        ...opts,
        channels: normalizeChannels(opts.channels),
        recipientMode: normalizeRecipientMode(opts.recipientMode),
    };

    const quietHoursState = !normalizedOptions.testSend && normalizedOptions.quietHoursMode !== 'bypass' && !normalizedOptions.scheduledAtUTC
        ? getQuietHoursState(settings)
        : { active: false };

    if (quietHoursState.active) {
        const job = await createNotificationJobRecord(normalizedOptions, {
            status: 'queued',
            scheduledAtUTC: quietHoursState.nextAllowedAtUTC,
            quietHoursApplied: true,
            recipientsCount: 0,
            estimatedCost: 0,
        });
        return { jobId: String(job._id), sent: 0, failed: 0, skipped: 0 };
    }

    if (normalizedOptions.scheduledAtUTC && normalizedOptions.scheduledAtUTC.getTime() > Date.now()) {
        const job = await createNotificationJobRecord(normalizedOptions, {
            status: 'queued',
            scheduledAtUTC: normalizedOptions.scheduledAtUTC,
            quietHoursApplied: false,
            recipientsCount: 0,
            estimatedCost: 0,
        });
        return { jobId: String(job._id), sent: 0, failed: 0, skipped: 0 };
    }

    const recipients = await resolveAudienceForCampaign(normalizedOptions);
    const financeSettings = await FinanceSettings.findOne().lean();
    const smsCost = financeSettings?.smsCostPerMessageBDT ?? 0.35;
    const emailCost = financeSettings?.emailCostPerMessageBDT ?? 0.05;
    const estimatedCost = estimateNotificationCost(
        recipients,
        normalizeChannels(normalizedOptions.channels),
        normalizeRecipientMode(normalizedOptions.recipientMode),
        smsCost,
        emailCost,
    );

    const job = await createNotificationJobRecord(normalizedOptions, {
        status: 'processing',
        recipientsCount: recipients.length,
        estimatedCost,
    });

    const result = await dispatchNotificationJob(job._id as mongoose.Types.ObjectId, normalizedOptions, settings);
    return { jobId: String(job._id), ...result };
}

export async function processQueuedNotificationJobs(limit = 10): Promise<{ processed: number; failed: number }> {
    const settings = await getSettings();
    const now = new Date();
    const jobs = await NotificationJob.find({
        status: 'queued',
        $and: [
            {
                $or: [
                    { scheduledAtUTC: { $exists: false } },
                    { scheduledAtUTC: null },
                    { scheduledAtUTC: { $lte: now } },
                ],
            },
            {
                $or: [
                    { nextRetryAtUTC: { $exists: false } },
                    { nextRetryAtUTC: null },
                    { nextRetryAtUTC: { $lte: now } },
                ],
            },
        ],
    })
        .sort({ scheduledAtUTC: 1, createdAt: 1 })
        .limit(limit)
        .lean();

    let processed = 0;
    let failed = 0;
    for (const job of jobs as unknown as StoredNotificationJobShape[]) {
        const locked = await NotificationJob.findOneAndUpdate(
            { _id: job._id, status: 'queued' },
            {
                status: 'processing',
                lastAttemptedAtUTC: new Date(),
                errorMessage: undefined,
                nextRetryAtUTC: undefined,
            },
            { new: true },
        ).lean();
        if (!locked) continue;

        try {
            const jobOptions = buildCampaignOptionsFromJob(locked as unknown as StoredNotificationJobShape);
            await dispatchNotificationJob(locked._id as mongoose.Types.ObjectId, jobOptions, settings);
            processed++;
        } catch (error: unknown) {
            failed++;
            await NotificationJob.findByIdAndUpdate(locked._id, {
                status: 'queued',
                errorMessage: error instanceof Error ? error.message : String(error),
                nextRetryAtUTC: new Date(Date.now() + settings.retryDelayMinutes * 60_000),
            });
        }
    }

    return { processed, failed };
}

/* ================================================================
   Retry failed deliveries
   ================================================================ */

export async function retryFailedDeliveries(
    jobId: string,
    adminId: string,
): Promise<{ retried: number; succeeded: number; failed: number }> {
    const settings = await getSettings();
    const job = await NotificationJob.findById(jobId).lean();
    if (!job) {
        throw new Error('Notification job not found');
    }

    const opts = buildCampaignOptionsFromJob(job as unknown as StoredNotificationJobShape);
    const template = await resolveTemplateForCampaign(opts);
    const failedLogs = await NotificationDeliveryLog.find({
        jobId: new mongoose.Types.ObjectId(jobId),
        status: 'failed',
        retryCount: { $lt: settings.maxRetryCount },
    }).lean();

    let retried = 0;
    let succeeded = 0;
    let failedCount = 0;

    for (const log of failedLogs) {
        const provider = await getActiveProvider(log.channel as 'sms' | 'email');
        if (!provider) {
            failedCount++;
            continue;
        }

        const [recipient] = await resolveAudience('manual', {
            manualStudentIds: [String(log.studentId)],
        });
        if (!recipient) {
            failedCount++;
            continue;
        }

        const rendered = renderCampaignContent(template, opts, recipient);
        let result: SendResult;
        try {
            if (log.channel === 'sms') {
                result = await sendSMS({ to: log.to, body: rendered.body }, provider);
            } else {
                result = await sendEmail({ to: log.to, subject: rendered.subject, html: rendered.body, text: rendered.body }, provider);
            }
        } catch (error: unknown) {
            result = { success: false, error: error instanceof Error ? error.message : String(error) };
        }

        retried++;
        await NotificationDeliveryLog.findByIdAndUpdate(log._id, {
            status: result.success ? 'sent' : 'failed',
            providerMessageId: result.messageId,
            errorMessage: result.error,
            sentAtUTC: result.success ? new Date() : undefined,
            $inc: { retryCount: 1 },
        });

        if (result.success) succeeded++;
        else failedCount++;
    }

    const [sentTotal, failedTotal] = await Promise.all([
        NotificationDeliveryLog.countDocuments({ jobId: job._id, status: 'sent' }),
        NotificationDeliveryLog.countDocuments({ jobId: job._id, status: 'failed' }),
    ]);

    await NotificationJob.findByIdAndUpdate(job._id, {
        status: failedTotal === 0 ? 'done' : sentTotal > 0 ? 'partial' : 'failed',
        sentCount: sentTotal,
        failedCount: failedTotal,
        processedAtUTC: new Date(),
        lastAttemptedAtUTC: new Date(),
        nextRetryAtUTC: failedTotal > 0 ? new Date(Date.now() + settings.retryDelayMinutes * 60_000) : undefined,
    });

    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(adminId),
        action: 'notification_retry',
        target_id: new mongoose.Types.ObjectId(jobId),
        target_type: 'NotificationJob',
        details: { retried, succeeded, failed: failedCount },
    });

    return { retried, succeeded, failed: failedCount };
}

/* ================================================================
   Trigger-based auto send (called by cron / hooks)
   ================================================================ */

export async function triggerAutoSend(
    triggerKey: string,
    studentIds: string[],
    vars: Record<string, string>,
    adminId: string,
): Promise<{ jobId: string; sent: number; failed: number }> {
    const settings = await getSettings();
    const trigger = settings.triggers.find((t) => t.triggerKey === triggerKey);
    if (!trigger || !trigger.enabled) {
        return { jobId: '', sent: 0, failed: 0 };
    }

    return executeCampaign({
        campaignName: `Auto: ${triggerKey}`,
        channels: trigger.channels,
        templateKey: String(trigger.templateKey || triggerKey).toUpperCase(),
        vars,
        audienceType: trigger.audienceMode === 'subscription_active' || trigger.audienceMode === 'subscription_renewal_due' ? 'filter' : 'manual',
        audienceFilters: trigger.audienceMode === 'subscription_active'
            ? { bucket: 'active' }
            : trigger.audienceMode === 'subscription_renewal_due'
                ? { bucket: 'renewal_due' }
                : undefined,
        manualStudentIds: trigger.audienceMode === 'subscription_active' || trigger.audienceMode === 'subscription_renewal_due'
            ? undefined
            : studentIds,
        guardianTargeted: trigger.guardianIncluded,
        recipientMode: trigger.guardianIncluded ? 'both' : 'student',
        scheduledAtUTC: Number(trigger.delayMinutes || 0) > 0
            ? new Date(Date.now() + Number(trigger.delayMinutes || 0) * 60_000)
            : undefined,
        quietHoursMode: trigger.quietHoursMode === 'bypass' ? 'bypass' : 'respect',
        adminId,
        triggerKey,
    });
}

/* ================================================================
   Campaign Delivery Integration (Hub Integration C9)
   Accepts campaign send requests from campaignEngineService and routes
   them through the existing notification delivery pipeline.
   ================================================================ */

export async function processCampaignDelivery(opts: {
    campaignId: string;
    campaignName: string;
    channel: 'sms' | 'email';
    content: { body: string; subject?: string };
    recipientUserIds: string[];
    adminId: string;
}): Promise<{ jobId: string; sent: number; failed: number; skipped: number }> {
    return executeCampaign({
        campaignName: opts.campaignName,
        channels: [opts.channel],
        templateKey: '',
        customBody: opts.content.body,
        customSubject: opts.content.subject,
        audienceType: 'manual',
        manualStudentIds: opts.recipientUserIds,
        recipientMode: 'student',
        adminId: opts.adminId,
    });
}







