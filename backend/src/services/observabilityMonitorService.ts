/**
 * Observability Monitor Service
 *
 * Tracks delivery SLOs, queue lag, provider health, and cost anomalies.
 * Triggers alerts when configurable thresholds are breached.
 *
 * - checkDeliverySLO(): compares delivery success rate against SLO target
 * - checkQueueLag(): finds oldest queued job and computes lag in minutes
 * - checkProviderHealth(): tracks per-provider success rate, latency, errors
 * - checkCostAnomaly(): compares current spend rate against rolling average
 *
 * All functions accept an ObservabilityConfig for thresholds and rolling windows.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

import mongoose from 'mongoose';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationJob from '../models/NotificationJob';
import { ObservabilityConfig } from '../types/campaignSettings';

// ─── Result Types ────────────────────────────────────────────────────────────

export interface DeliverySLOResult {
    currentRate: number;
    target: number;
    breached: boolean;
}

export interface QueueLagResult {
    lagMinutes: number;
    threshold: number;
    breached: boolean;
}

export interface ProviderHealthResult {
    successRate: number;
    avgLatencyMs: number;
    errorCount: number;
    surgeDetected: boolean;
}

export interface CostAnomalyResult {
    currentRate: number;
    rollingAvg: number;
    anomalyDetected: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rollingWindowStart(now: Date, windowMinutes: number): Date {
    return new Date(now.getTime() - windowMinutes * 60 * 1000);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check delivery SLO by counting sent vs total (sent + failed) delivery logs
 * within the rolling window. Queued logs are excluded since they haven't
 * completed delivery yet.
 *
 * Breached when currentRate < sloTargetPercent.
 *
 * Req 13.1, 13.2
 */
export async function checkDeliverySLO(
    config: ObservabilityConfig,
): Promise<DeliverySLOResult> {
    const now = new Date();
    const windowStart = rollingWindowStart(now, config.rollingWindowMinutes);

    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                createdAt: { $gte: windowStart },
                status: { $in: ['sent', 'failed'] },
            },
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                sent: {
                    $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] },
                },
            },
        },
    ]);

    if (result.length === 0 || result[0].total === 0) {
        // No deliveries in window — treat as not breached (no data to evaluate)
        return { currentRate: 100, target: config.sloTargetPercent, breached: false };
    }

    const { total, sent } = result[0];
    const currentRate = (sent / total) * 100;
    const breached = currentRate < config.sloTargetPercent;

    return { currentRate, target: config.sloTargetPercent, breached };
}

/**
 * Check queue lag by finding the oldest NotificationJob still in 'queued'
 * status and computing how many minutes it has been waiting.
 *
 * Breached when lagMinutes > queueLagThresholdMinutes.
 *
 * Req 13.3, 13.4
 */
export async function checkQueueLag(
    config: ObservabilityConfig,
): Promise<QueueLagResult> {
    const now = new Date();

    const oldestQueued = await NotificationJob.findOne({ status: 'queued' })
        .sort({ createdAt: 1 })
        .select('createdAt')
        .lean();

    if (!oldestQueued) {
        // No queued jobs — no lag
        return { lagMinutes: 0, threshold: config.queueLagThresholdMinutes, breached: false };
    }

    const lagMs = now.getTime() - new Date(oldestQueued.createdAt).getTime();
    const lagMinutes = Math.max(0, lagMs / (60 * 1000));
    const breached = lagMinutes > config.queueLagThresholdMinutes;

    return { lagMinutes, threshold: config.queueLagThresholdMinutes, breached };
}

/**
 * Check per-provider health metrics within the rolling window.
 * Counts sent/failed deliveries, computes success rate and average latency.
 *
 * Surge detected when failure rate exceeds failureSurgeThresholdPercent.
 *
 * Latency is estimated as the difference between sentAtUTC and createdAt
 * for successfully sent logs. Falls back to 0 if no sent logs exist.
 *
 * Req 13.5, 13.6
 */
export async function checkProviderHealth(
    providerId: mongoose.Types.ObjectId | string,
    config: ObservabilityConfig,
): Promise<ProviderHealthResult> {
    const now = new Date();
    const windowStart = rollingWindowStart(now, config.rollingWindowMinutes);
    const providerStr = String(providerId);

    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                providerUsed: providerStr,
                createdAt: { $gte: windowStart },
                status: { $in: ['sent', 'failed'] },
            },
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                sent: {
                    $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] },
                },
                failed: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
                },
                avgLatencyMs: {
                    $avg: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ['$status', 'sent'] },
                                    { $ne: ['$sentAtUTC', null] },
                                ],
                            },
                            { $subtract: ['$sentAtUTC', '$createdAt'] },
                            null,
                        ],
                    },
                },
            },
        },
    ]);

    if (result.length === 0 || result[0].total === 0) {
        return { successRate: 100, avgLatencyMs: 0, errorCount: 0, surgeDetected: false };
    }

    const { total, sent, failed, avgLatencyMs } = result[0];
    const successRate = (sent / total) * 100;
    const failureRate = (failed / total) * 100;
    const surgeDetected = failureRate >= config.failureSurgeThresholdPercent;

    return {
        successRate,
        avgLatencyMs: avgLatencyMs ?? 0,
        errorCount: failed,
        surgeDetected,
    };
}

/**
 * Check for cost anomalies by comparing the current spend rate (within the
 * rolling window) against the rolling average spend rate from the preceding
 * period of equal length.
 *
 * The "current window" is [now - rollingWindowMinutes, now].
 * The "preceding window" is [now - 2*rollingWindowMinutes, now - rollingWindowMinutes].
 *
 * Anomaly detected when currentRate exceeds rollingAvg by more than
 * costAnomalyThresholdPercent.
 *
 * Req 13.7
 */
export async function checkCostAnomaly(
    config: ObservabilityConfig,
): Promise<CostAnomalyResult> {
    const now = new Date();
    const currentWindowStart = rollingWindowStart(now, config.rollingWindowMinutes);
    const precedingWindowStart = rollingWindowStart(now, config.rollingWindowMinutes * 2);

    // Aggregate cost for both windows in a single query
    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                createdAt: { $gte: precedingWindowStart },
                status: 'sent',
            },
        },
        {
            $group: {
                _id: null,
                currentCost: {
                    $sum: {
                        $cond: [
                            { $gte: ['$createdAt', currentWindowStart] },
                            '$costAmount',
                            0,
                        ],
                    },
                },
                precedingCost: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $gte: ['$createdAt', precedingWindowStart] },
                                    { $lt: ['$createdAt', currentWindowStart] },
                                ],
                            },
                            '$costAmount',
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    if (result.length === 0) {
        return { currentRate: 0, rollingAvg: 0, anomalyDetected: false };
    }

    const { currentCost, precedingCost } = result[0];
    const rollingAvg = precedingCost; // same-length window, so cost = rate

    if (rollingAvg <= 0) {
        // No preceding spend — can't detect anomaly relative to zero
        return { currentRate: currentCost, rollingAvg: 0, anomalyDetected: false };
    }

    const percentOfAvg = (currentCost / rollingAvg) * 100;
    const anomalyDetected = percentOfAvg >= config.costAnomalyThresholdPercent;

    return { currentRate: currentCost, rollingAvg, anomalyDetected };
}
