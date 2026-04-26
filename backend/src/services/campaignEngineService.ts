/**
 * Campaign Engine Orchestrator Service
 *
 * Composes all subsystem services into the send-path pipeline:
 *   Idempotency → Consent → Suppression → FrequencyCap → Budget →
 *   ContentLint → SendTime → Approval → ProviderRouter
 *
 * Uses SettingsCache for cached config reads on the send path.
 * Defers non-critical operations (audit logging, finance sync, analytics)
 * to async background processing via setImmediate.
 *
 * Requirements: 2.5, 3.6, 4.2, 6.1, 7.5, 15.1, 17.1, 19.1, 19.5
 */

import mongoose from 'mongoose';
import NotificationSettings, { INotificationSettings } from '../models/NotificationSettings';
import { settingsCacheService } from './settingsCacheService';
import * as idempotencyGuardService from './idempotencyGuardService';
import * as consentStoreService from './consentStoreService';
import * as suppressionEngineService from './suppressionEngineService';
import * as frequencyCapEvaluatorService from './frequencyCapEvaluatorService';
import * as budgetGuardService from './budgetGuardService';
import * as contentLinterService from './contentLinterService';
import * as sendTimeOptimizerService from './sendTimeOptimizerService';
import * as approvalWorkflowService from './approvalWorkflowService';
import * as providerRouterService from './providerRouterService';
import { log as auditLog } from './settingsAuditLoggerService';
import { executeCampaign as executeNotificationCampaign } from './notificationOrchestrationService';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import UserSubscription from '../models/UserSubscription';
import User from '../models/User';
import type { BudgetEvaluationResult } from './budgetGuardService';
import type { ContentLintResult } from './contentLinterService';
import type { SendResult } from './providerRouterService';
import type { CampaignApprovalStatus } from './approvalWorkflowService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CampaignRecipient {
    userId: mongoose.Types.ObjectId;
    contactIdentifier: string;
}

export interface CampaignSendRequest {
    campaignId: mongoose.Types.ObjectId;
    recipients: CampaignRecipient[];
    channel: 'sms' | 'email';
    content: { body: string; subject?: string };
    campaignType: string;
    isCritical: boolean;
    estimatedCost: number;
    segmentIds: string[];
    scheduledAt?: Date;
    dataFields?: Record<string, string>;
    recipientTimezone?: string;
}

export interface PolicyResult {
    policy: string;
    status: 'pass' | 'warn' | 'block' | 'skip';
    reason: string;
    detail?: unknown;
}

export interface CampaignSendResult {
    sent: number;
    blocked: number;
    deferred: number;
    errors: string[];
    policyResults: PolicyResult[];
}

// ─── Settings Loader (Req 19.1) ─────────────────────────────────────────────

/**
 * Load settings from cache, falling back to DB on cache miss.
 */
async function loadSettings(): Promise<INotificationSettings> {
    const cached = settingsCacheService.get();
    if (cached) return cached;

    const settings = await NotificationSettings.findOne().lean<INotificationSettings>();
    if (!settings) {
        throw new Error('NotificationSettings document not found');
    }

    settingsCacheService.set(settings);
    return settings;
}


// ─── Async Background Deferral (Req 19.5) ───────────────────────────────────

/**
 * Defer a non-critical operation to the next tick of the event loop.
 * Errors are caught and logged to prevent crashing the send path.
 */
function deferAsync(label: string, fn: () => Promise<void>): void {
    setImmediate(async () => {
        try {
            await fn();
        } catch (err) {
            console.error(`[CampaignEngine] Deferred ${label} failed:`, err);
        }
    });
}

// ─── Subscription Audience Resolution (Hub Integration C9) ──────────────────

/**
 * Resolve campaign audience from UserSubscription collection for
 * subscription-based targeting. Returns user IDs with active subscriptions
 * matching the given plan codes or statuses.
 */
export async function resolveSubscriptionAudience(opts: {
    planCodes?: string[];
    statuses?: string[];
    limit?: number;
}): Promise<CampaignRecipient[]> {
    const filter: Record<string, unknown> = {};
    if (opts.statuses && opts.statuses.length > 0) {
        filter.status = { $in: opts.statuses };
    } else {
        filter.status = 'active';
    }

    const subscriptions = await UserSubscription.find(filter)
        .limit(opts.limit ?? 1000)
        .select('userId')
        .lean();

    const userIds = [...new Set(subscriptions.map((s) => String(s.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
        .select('_id phone email')
        .lean();

    return users.map((u) => ({
        userId: u._id as mongoose.Types.ObjectId,
        contactIdentifier: (u as Record<string, unknown>).phone as string || (u as Record<string, unknown>).email as string || '',
    }));
}

// ─── Send-Path Pipeline (Req 2.5, 3.6, 4.2, 6.1, 7.5, 15.1, 17.1, 19.1, 19.5) ─

/**
 * Process a campaign send request through the full policy pipeline.
 *
 * Pipeline order:
 *  1. Idempotency check (Req 17.1)
 *  2. Load settings from cache (Req 19.1)
 *  3. Filter recipients by consent (Req 2.5)
 *  4. Filter recipients by suppression (Req 3.6)
 *  5. Filter recipients by frequency caps (Req 4.2)
 *  6. Evaluate budget guard (Req 6.1)
 *  7. Lint content (Req 15.1 — content validation)
 *  8. Compute send times
 *  9. Check approval workflow
 * 10. Route to provider
 * 11. Record idempotency key (Req 17.1)
 * 12. Defer audit logging to async (Req 19.5)
 */
export async function processSend(
    request: CampaignSendRequest,
): Promise<CampaignSendResult> {
    const BATCH_SIZE = 50;
    const BATCH_DELAY_MS = 1000;
    const policyResults: PolicyResult[] = [];
    const errors: string[] = [];
    let sent = 0;
    let blocked = 0;
    let deferred = 0;

    const scheduledAt = request.scheduledAt ?? new Date();

    // ── Step 1: Idempotency check (Req 17.1) ────────────────────────────
    const idempotencyKey = idempotencyGuardService.generateKey(
        request.campaignId,
        // Use first recipient as representative for campaign-level idempotency
        request.recipients[0]?.userId ?? request.campaignId,
        scheduledAt,
    );

    const idempotencyCheck = await idempotencyGuardService.check(idempotencyKey);
    if (idempotencyCheck.isDuplicate) {
        policyResults.push({
            policy: 'idempotency',
            status: 'skip',
            reason: 'Duplicate send request detected; returning original result',
            detail: idempotencyCheck.originalResult,
        });
        return {
            sent: 0,
            blocked: request.recipients.length,
            deferred: 0,
            errors: [],
            policyResults,
        };
    }
    policyResults.push({
        policy: 'idempotency',
        status: 'pass',
        reason: 'New send request; no duplicate detected',
    });

    // ── Step 2: Load settings from cache (Req 19.1) ─────────────────────
    const settings = await loadSettings();

    // ── Step 3: Filter recipients by consent (Req 2.5) ──────────────────
    const purpose = request.isCritical ? 'transactional' : 'promotional';
    const userIds = request.recipients.map((r) => r.userId);

    const consentedUserIds = await consentStoreService.filterOptedIn(
        userIds,
        request.channel,
        purpose,
    );

    const consentBlockedCount = userIds.length - consentedUserIds.length;
    blocked += consentBlockedCount;

    policyResults.push({
        policy: 'consent',
        status: consentBlockedCount > 0 ? 'warn' : 'pass',
        reason: consentBlockedCount > 0
            ? `${consentBlockedCount} recipient(s) opted out of ${request.channel}/${purpose}`
            : 'All recipients have valid consent',
        detail: { eligible: consentedUserIds.length, blocked: consentBlockedCount },
    });

    if (consentedUserIds.length === 0) {
        policyResults.push({
            policy: 'consent',
            status: 'block',
            reason: 'No recipients with valid consent remain',
        });
        return { sent, blocked, deferred, errors, policyResults };
    }

    // Build a filtered recipient list for subsequent steps
    const consentedSet = new Set(consentedUserIds.map((id) => id.toString()));
    let activeRecipients = request.recipients.filter(
        (r) => consentedSet.has(r.userId.toString()),
    );

    // ── Step 4: Filter recipients by suppression (Req 3.6) ──────────────
    const contacts = activeRecipients.map((r) => ({
        id: r.userId,
        identifier: r.contactIdentifier,
    }));

    const nonSuppressedIds = await suppressionEngineService.filterSuppressed(
        contacts,
        request.channel,
    );

    const suppressionBlockedCount = activeRecipients.length - nonSuppressedIds.length;
    blocked += suppressionBlockedCount;

    policyResults.push({
        policy: 'suppression',
        status: suppressionBlockedCount > 0 ? 'warn' : 'pass',
        reason: suppressionBlockedCount > 0
            ? `${suppressionBlockedCount} recipient(s) suppressed`
            : 'No recipients suppressed',
        detail: { eligible: nonSuppressedIds.length, suppressed: suppressionBlockedCount },
    });

    if (nonSuppressedIds.length === 0) {
        policyResults.push({
            policy: 'suppression',
            status: 'block',
            reason: 'All remaining recipients are suppressed',
        });
        return { sent, blocked, deferred, errors, policyResults };
    }

    const nonSuppressedSet = new Set(nonSuppressedIds.map((id) => id.toString()));
    activeRecipients = activeRecipients.filter(
        (r) => nonSuppressedSet.has(r.userId.toString()),
    );

    // ── Step 5: Filter recipients by frequency caps (Req 4.2) ───────────
    const capResult = await frequencyCapEvaluatorService.filterCapped(
        activeRecipients.map((r) => r.userId),
        settings.frequencyCap,
        request.isCritical,
    );

    const cappedCount = capResult.capped.length;
    const deferredCount = capResult.deferred.length;
    blocked += cappedCount;
    deferred += deferredCount;

    policyResults.push({
        policy: 'frequency_cap',
        status: cappedCount > 0 || deferredCount > 0 ? 'warn' : 'pass',
        reason: cappedCount > 0 || deferredCount > 0
            ? `${cappedCount} capped, ${deferredCount} deferred`
            : 'All recipients within frequency caps',
        detail: {
            eligible: capResult.eligible.length,
            capped: cappedCount,
            deferred: deferredCount,
        },
    });

    if (capResult.eligible.length === 0) {
        policyResults.push({
            policy: 'frequency_cap',
            status: 'block',
            reason: 'All remaining recipients are frequency-capped or deferred',
        });
        return { sent, blocked, deferred, errors, policyResults };
    }

    const eligibleSet = new Set(capResult.eligible.map((id) => id.toString()));
    activeRecipients = activeRecipients.filter(
        (r) => eligibleSet.has(r.userId.toString()),
    );

    // ── Step 6: Evaluate budget guard (Req 6.1) ─────────────────────────
    const monthlyBudget = request.channel === 'sms'
        ? settings.monthlySmsBudgetBDT
        : settings.monthlyEmailBudgetBDT;

    const budgetResult: BudgetEvaluationResult = await budgetGuardService.evaluate(
        request.estimatedCost,
        request.channel,
        monthlyBudget,
        settings.budgetGuardrails,
    );

    policyResults.push({
        policy: 'budget',
        status: budgetResult.status === 'ok' ? 'pass'
            : budgetResult.status === 'warn' ? 'warn'
                : 'block',
        reason: budgetResult.message,
        detail: { remainingBudget: budgetResult.remainingBudget },
    });

    if (budgetResult.status === 'block' || budgetResult.status === 'anomaly') {
        blocked += activeRecipients.length;
        return { sent, blocked, deferred, errors, policyResults };
    }

    // ── Step 7: Lint content ─────────────────────────────────────────────
    const dataFields = request.dataFields ?? {};
    const lintResult: ContentLintResult = contentLinterService.lint(
        request.content,
        request.channel,
        dataFields,
        settings.contentLint,
    );

    policyResults.push({
        policy: 'content_lint',
        status: lintResult.decision === 'pass' ? 'pass'
            : lintResult.decision === 'warn' ? 'warn'
                : 'block',
        reason: lintResult.decision === 'block'
            ? `Content blocked: policy score ${lintResult.policyScore}`
            : lintResult.decision === 'warn'
                ? `Content warning: policy score ${lintResult.policyScore}`
                : 'Content passed all lint checks',
        detail: lintResult,
    });

    if (lintResult.decision === 'block') {
        blocked += activeRecipients.length;
        errors.push(`Content lint blocked send: score ${lintResult.policyScore}`);
        return { sent, blocked, deferred, errors, policyResults };
    }

    // ── Step 8: Compute send times ──────────────────────────────────────
    const recipientTimezone = request.recipientTimezone ?? settings.quietHours.timezone ?? 'UTC';
    let computedSendTime: Date;
    try {
        computedSendTime = await sendTimeOptimizerService.computeSendTime(
            recipientTimezone,
            request.campaignType,
            settings.sendTime,
            settings.quietHours,
        );
        policyResults.push({
            policy: 'send_time',
            status: 'pass',
            reason: `Scheduled for ${computedSendTime.toISOString()}`,
            detail: { sendTime: computedSendTime },
        });
    } catch (err) {
        // Fall back to now if send time computation fails
        computedSendTime = new Date();
        policyResults.push({
            policy: 'send_time',
            status: 'warn',
            reason: 'Send time computation failed; using current time',
            detail: { error: err instanceof Error ? err.message : String(err) },
        });
    }

    // ── Step 9: Check approval workflow ──────────────────────────────────
    const approvalStatus: CampaignApprovalStatus = approvalWorkflowService.evaluate(
        {
            audienceSize: activeRecipients.length,
            estimatedCost: request.estimatedCost,
            segmentIds: request.segmentIds,
        },
        settings.approvalPolicy,
    );

    policyResults.push({
        policy: 'approval',
        status: approvalStatus === 'scheduled' ? 'pass' : 'block',
        reason: approvalStatus === 'scheduled'
            ? 'No approval required; campaign can proceed'
            : 'Campaign requires approval before sending',
        detail: { approvalStatus },
    });

    if (approvalStatus === 'pending_approval') {
        deferred += activeRecipients.length;
        return { sent, blocked, deferred, errors, policyResults };
    }

    // ── Step 10: Route to provider (with batching for large audiences) ──
    const batchResults: Array<{ batchIndex: number; sent: number; failed: number; errors: string[] }> = [];

    // Chunk recipients into batches of BATCH_SIZE
    const batches: typeof activeRecipients[] = [];
    for (let i = 0; i < activeRecipients.length; i += BATCH_SIZE) {
        batches.push(activeRecipients.slice(i, i + BATCH_SIZE));
    }

    let routeResult: SendResult | undefined;
    const failedBatches: number[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResult = { batchIndex, sent: 0, failed: 0, errors: [] as string[] };

        try {
            const payload = {
                to: batch[0]?.contactIdentifier ?? '',
                channel: request.channel,
                subject: request.content.subject,
                body: request.content.body,
            };

            routeResult = await providerRouterService.route(
                request.channel,
                payload,
                settings.providerRouting,
            );

            if (routeResult.success) {
                batchResult.sent = batch.length;
                sent += batch.length;
            } else {
                batchResult.failed = batch.length;
                blocked += batch.length;
                batchResult.errors.push(routeResult.error ?? 'Provider routing failed');
                errors.push(routeResult.error ?? `Batch ${batchIndex} failed`);
                failedBatches.push(batchIndex);
            }
        } catch (err) {
            batchResult.failed = batch.length;
            blocked += batch.length;
            const errMsg = err instanceof Error ? err.message : String(err);
            batchResult.errors.push(errMsg);
            errors.push(errMsg);
            failedBatches.push(batchIndex);
        }

        batchResults.push(batchResult);

        // Delay between batches (except after the last one)
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }

    // Retry failed batches once
    for (const failedIdx of failedBatches) {
        const batch = batches[failedIdx];
        try {
            const payload = {
                to: batch[0]?.contactIdentifier ?? '',
                channel: request.channel,
                subject: request.content.subject,
                body: request.content.body,
            };
            routeResult = await providerRouterService.route(
                request.channel,
                payload,
                settings.providerRouting,
            );
            if (routeResult.success) {
                sent += batch.length;
                blocked -= batch.length;
                batchResults[failedIdx].sent = batch.length;
                batchResults[failedIdx].failed = 0;
            }
        } catch {
            // Retry failed — keep original failure
        }
    }

    policyResults.push({
        policy: 'provider_routing',
        status: sent > 0 ? 'pass' : 'block',
        reason: sent > 0
            ? `Delivered ${sent} via ${batches.length} batch(es)`
            : 'All batches failed',
        detail: { batchResults, totalBatches: batches.length },
    });

    // ── Step 11: Record idempotency key (Req 17.1) ──────────────────────
    const sendResult: CampaignSendResult = { sent, blocked, deferred, errors, policyResults };

    await idempotencyGuardService.record(idempotencyKey, sendResult as unknown as Record<string, unknown>);

    // ── Step 12: Defer non-critical operations (Req 19.5) ───────────────
    deferAsync('audit_log', async () => {
        await auditLog({
            actorId: request.campaignId,
            actorRole: 'campaign_engine',
            timestamp: new Date(),
            ipAddress: 'system',
            section: 'campaign_send',
            beforeSnapshot: { campaignId: request.campaignId.toString() },
            afterSnapshot: {
                sent,
                blocked,
                deferred,
                errors,
            },
            diff: policyResults.map((pr) => ({
                field: pr.policy,
                oldValue: null,
                newValue: pr.status,
            })),
        });
    });

    deferAsync('finance_sync', async () => {
        // Placeholder for finance cost sync — deferred to background
        if (settings.autoSyncCostToFinance && sent > 0) {
            console.log(
                `[CampaignEngine] Finance sync: campaign ${request.campaignId.toString()}, cost ${request.estimatedCost}`,
            );
        }
    });

    // ── Step 13: Connect to notification orchestration for delivery (Hub Integration C9) ──
    if (sent > 0) {
        deferAsync('notification_delivery', async () => {
            try {
                await executeNotificationCampaign({
                    campaignName: `Campaign ${request.campaignId.toString()}`,
                    channels: [request.channel],
                    templateKey: '',
                    customBody: request.content.body,
                    customSubject: request.content.subject,
                    audienceType: 'manual',
                    manualStudentIds: activeRecipients.map((r) => r.userId.toString()),
                    recipientMode: 'student',
                    adminId: request.campaignId.toString(),
                });
            } catch (err) {
                console.error('[CampaignEngine] Notification delivery integration failed:', err);
            }
        });

        // ── Step 14: Write delivery logs for tracking (Hub Integration C9) ──
        deferAsync('delivery_log', async () => {
            try {
                const logEntries = activeRecipients.map((r) => ({
                    jobId: request.campaignId,
                    campaignId: request.campaignId,
                    studentId: r.userId,
                    channel: request.channel,
                    providerUsed: routeResult?.providerId ?? 'unknown',
                    to: r.contactIdentifier,
                    status: routeResult?.success ? 'sent' : 'failed',
                    originModule: 'campaign' as const,
                    sentAtUTC: routeResult?.success ? new Date() : undefined,
                    costAmount: request.estimatedCost / Math.max(activeRecipients.length, 1),
                    recipientMode: 'student',
                    messageMode: 'custom',
                }));
                await NotificationDeliveryLog.insertMany(logEntries);
            } catch (err) {
                console.error('[CampaignEngine] Delivery log write failed:', err);
            }
        });
    }

    return sendResult;
}

// ─── Simulation Types (Req 15.1, 15.2, 15.3, 15.4) ─────────────────────────

export interface SimulationResult {
    eligible: number;
    suppressed: number;
    capped: number;
    deferred: number;
    estimatedCost: number;
    selectedProviderRoute: string;
    policyResults: PolicyResult[];
    blocked: boolean;
    blockingPolicy?: string;
    blockingReason?: string;
}

// ─── Test Configuration Simulation (Req 15.1, 15.2, 15.3, 15.4) ─────────────

/**
 * Simulate a campaign send through the full policy pipeline without
 * actually sending messages, recording idempotency keys, or deferring
 * async operations.
 *
 * Returns a structured SimulationResult with the decision path showing
 * each policy evaluation result (pass/fail/warn + reason), estimated cost,
 * eligible/suppressed/capped counts, selected provider route, and any
 * blocking policy with its specific reason.
 *
 * Pipeline mirrors processSend() but skips:
 *  - Actual provider routing (no message sent)
 *  - Idempotency key recording
 *  - Deferred async operations (audit logging, finance sync)
 */
export async function simulate(
    request: CampaignSendRequest,
): Promise<SimulationResult> {
    const policyResults: PolicyResult[] = [];
    let eligible = request.recipients.length;
    let suppressed = 0;
    let capped = 0;
    let deferred = 0;
    let blocked = false;
    let blockingPolicy: string | undefined;
    let blockingReason: string | undefined;
    let selectedProviderRoute = 'none';

    // ── Step 1: Load settings from cache (Req 19.1) ─────────────────────
    const settings = await loadSettings();

    // ── Step 2: Filter recipients by consent (Req 2.5, 15.1) ────────────
    const purpose = request.isCritical ? 'transactional' : 'promotional';
    const userIds = request.recipients.map((r) => r.userId);

    const consentedUserIds = await consentStoreService.filterOptedIn(
        userIds,
        request.channel,
        purpose,
    );

    const consentBlockedCount = userIds.length - consentedUserIds.length;

    policyResults.push({
        policy: 'consent',
        status: consentBlockedCount > 0 ? 'warn' : 'pass',
        reason: consentBlockedCount > 0
            ? `${consentBlockedCount} recipient(s) opted out of ${request.channel}/${purpose}`
            : 'All recipients have valid consent',
        detail: { eligible: consentedUserIds.length, blocked: consentBlockedCount },
    });

    if (consentedUserIds.length === 0) {
        return {
            eligible: 0,
            suppressed: 0,
            capped: 0,
            deferred: 0,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults: [...policyResults, {
                policy: 'consent',
                status: 'block',
                reason: 'No recipients with valid consent remain',
            }],
            blocked: true,
            blockingPolicy: 'consent',
            blockingReason: 'No recipients with valid consent remain',
        };
    }

    eligible = consentedUserIds.length;

    // Build filtered recipient list for subsequent steps
    const consentedSet = new Set(consentedUserIds.map((id) => id.toString()));
    let activeRecipients = request.recipients.filter(
        (r) => consentedSet.has(r.userId.toString()),
    );

    // ── Step 3: Filter recipients by suppression (Req 3.6, 15.1) ────────
    const contacts = activeRecipients.map((r) => ({
        id: r.userId,
        identifier: r.contactIdentifier,
    }));

    const nonSuppressedIds = await suppressionEngineService.filterSuppressed(
        contacts,
        request.channel,
    );

    suppressed = activeRecipients.length - nonSuppressedIds.length;

    policyResults.push({
        policy: 'suppression',
        status: suppressed > 0 ? 'warn' : 'pass',
        reason: suppressed > 0
            ? `${suppressed} recipient(s) suppressed`
            : 'No recipients suppressed',
        detail: { eligible: nonSuppressedIds.length, suppressed },
    });

    if (nonSuppressedIds.length === 0) {
        return {
            eligible: 0,
            suppressed,
            capped: 0,
            deferred: 0,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults: [...policyResults, {
                policy: 'suppression',
                status: 'block',
                reason: 'All remaining recipients are suppressed',
            }],
            blocked: true,
            blockingPolicy: 'suppression',
            blockingReason: 'All remaining recipients are suppressed',
        };
    }

    const nonSuppressedSet = new Set(nonSuppressedIds.map((id) => id.toString()));
    activeRecipients = activeRecipients.filter(
        (r) => nonSuppressedSet.has(r.userId.toString()),
    );
    eligible = nonSuppressedIds.length;

    // ── Step 4: Filter recipients by frequency caps (Req 4.2, 15.1) ─────
    const capResult = await frequencyCapEvaluatorService.filterCapped(
        activeRecipients.map((r) => r.userId),
        settings.frequencyCap,
        request.isCritical,
    );

    capped = capResult.capped.length;
    deferred = capResult.deferred.length;

    policyResults.push({
        policy: 'frequency_cap',
        status: capped > 0 || deferred > 0 ? 'warn' : 'pass',
        reason: capped > 0 || deferred > 0
            ? `${capped} capped, ${deferred} deferred`
            : 'All recipients within frequency caps',
        detail: {
            eligible: capResult.eligible.length,
            capped,
            deferred,
        },
    });

    if (capResult.eligible.length === 0) {
        return {
            eligible: 0,
            suppressed,
            capped,
            deferred,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults: [...policyResults, {
                policy: 'frequency_cap',
                status: 'block',
                reason: 'All remaining recipients are frequency-capped or deferred',
            }],
            blocked: true,
            blockingPolicy: 'frequency_cap',
            blockingReason: 'All remaining recipients are frequency-capped or deferred',
        };
    }

    eligible = capResult.eligible.length;
    activeRecipients = activeRecipients.filter(
        (r) => new Set(capResult.eligible.map((id) => id.toString())).has(r.userId.toString()),
    );

    // ── Step 5: Evaluate budget guard (Req 6.1, 15.1) ───────────────────
    const monthlyBudget = request.channel === 'sms'
        ? settings.monthlySmsBudgetBDT
        : settings.monthlyEmailBudgetBDT;

    const budgetResult: BudgetEvaluationResult = await budgetGuardService.evaluate(
        request.estimatedCost,
        request.channel,
        monthlyBudget,
        settings.budgetGuardrails,
    );

    policyResults.push({
        policy: 'budget',
        status: budgetResult.status === 'ok' ? 'pass'
            : budgetResult.status === 'warn' ? 'warn'
                : 'block',
        reason: budgetResult.message,
        detail: { remainingBudget: budgetResult.remainingBudget },
    });

    if (budgetResult.status === 'block' || budgetResult.status === 'anomaly') {
        return {
            eligible: 0,
            suppressed,
            capped,
            deferred,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults,
            blocked: true,
            blockingPolicy: 'budget',
            blockingReason: budgetResult.message,
        };
    }

    // ── Step 6: Lint content (Req 15.1) ─────────────────────────────────
    const dataFields = request.dataFields ?? {};
    const lintResult: ContentLintResult = contentLinterService.lint(
        request.content,
        request.channel,
        dataFields,
        settings.contentLint,
    );

    policyResults.push({
        policy: 'content_lint',
        status: lintResult.decision === 'pass' ? 'pass'
            : lintResult.decision === 'warn' ? 'warn'
                : 'block',
        reason: lintResult.decision === 'block'
            ? `Content blocked: policy score ${lintResult.policyScore}`
            : lintResult.decision === 'warn'
                ? `Content warning: policy score ${lintResult.policyScore}`
                : 'Content passed all lint checks',
        detail: lintResult,
    });

    if (lintResult.decision === 'block') {
        return {
            eligible: 0,
            suppressed,
            capped,
            deferred,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults,
            blocked: true,
            blockingPolicy: 'content_lint',
            blockingReason: `Content blocked: policy score ${lintResult.policyScore}`,
        };
    }

    // ── Step 7: Compute send times (Req 15.1) ──────────────────────────
    const recipientTimezone = request.recipientTimezone ?? settings.quietHours.timezone ?? 'UTC';
    try {
        const computedSendTime = await sendTimeOptimizerService.computeSendTime(
            recipientTimezone,
            request.campaignType,
            settings.sendTime,
            settings.quietHours,
        );
        policyResults.push({
            policy: 'send_time',
            status: 'pass',
            reason: `Scheduled for ${computedSendTime.toISOString()}`,
            detail: { sendTime: computedSendTime },
        });
    } catch (err) {
        policyResults.push({
            policy: 'send_time',
            status: 'warn',
            reason: 'Send time computation failed; would use current time',
            detail: { error: err instanceof Error ? err.message : String(err) },
        });
    }

    // ── Step 8: Check approval workflow (Req 15.1) ──────────────────────
    const approvalStatus: CampaignApprovalStatus = approvalWorkflowService.evaluate(
        {
            audienceSize: activeRecipients.length,
            estimatedCost: request.estimatedCost,
            segmentIds: request.segmentIds,
        },
        settings.approvalPolicy,
    );

    policyResults.push({
        policy: 'approval',
        status: approvalStatus === 'scheduled' ? 'pass' : 'block',
        reason: approvalStatus === 'scheduled'
            ? 'No approval required; campaign can proceed'
            : 'Campaign requires approval before sending',
        detail: { approvalStatus },
    });

    if (approvalStatus === 'pending_approval') {
        return {
            eligible,
            suppressed,
            capped,
            deferred: deferred + activeRecipients.length,
            estimatedCost: request.estimatedCost,
            selectedProviderRoute: 'none',
            policyResults,
            blocked: true,
            blockingPolicy: 'approval',
            blockingReason: 'Campaign requires approval before sending',
        };
    }

    // ── Step 9: Determine provider route (without sending) (Req 15.3) ───
    const routingConfig = settings.providerRouting;
    const channelConfig = routingConfig[request.channel];
    const primaryProviderId = channelConfig.primary.toString();

    // Check primary provider health to determine the selected route
    const primaryHealth = providerRouterService.getProviderHealth(
        primaryProviderId,
        routingConfig,
    );

    if (primaryHealth.status === 'closed' || primaryHealth.status === 'half_open') {
        selectedProviderRoute = `primary:${primaryProviderId}`;
    } else if (channelConfig.secondary) {
        selectedProviderRoute = `secondary:${channelConfig.secondary.toString()}`;
    } else if (routingConfig.channelFallback?.[request.channel]) {
        const fallbackChannel = routingConfig.channelFallback[request.channel]!;
        const fallbackConfig = routingConfig[fallbackChannel];
        selectedProviderRoute = `fallback:${fallbackChannel}:${fallbackConfig.primary.toString()}`;
    } else {
        selectedProviderRoute = `primary:${primaryProviderId} (circuit open, no fallback)`;
    }

    policyResults.push({
        policy: 'provider_routing',
        status: primaryHealth.status === 'open' ? 'warn' : 'pass',
        reason: primaryHealth.status === 'open'
            ? `Primary provider circuit open (failure rate: ${(primaryHealth.failureRate * 100).toFixed(1)}%); would route to fallback`
            : `Primary provider healthy (failure rate: ${(primaryHealth.failureRate * 100).toFixed(1)}%)`,
        detail: {
            selectedRoute: selectedProviderRoute,
            primaryHealth: {
                status: primaryHealth.status,
                failureRate: primaryHealth.failureRate,
                avgLatencyMs: primaryHealth.avgLatencyMs,
            },
        },
    });

    // ── Build final simulation result (Req 15.2, 15.3) ─────────────────
    return {
        eligible,
        suppressed,
        capped,
        deferred,
        estimatedCost: request.estimatedCost,
        selectedProviderRoute,
        policyResults,
        blocked,
        blockingPolicy,
        blockingReason,
    };
}
