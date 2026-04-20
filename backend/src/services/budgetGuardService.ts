/**
 * Budget Guard Service
 *
 * Pre-send validation subsystem that checks real-time spend against
 * soft and hard budget limits and detects anomaly spend spikes.
 *
 * - getCurrentSpend(): aggregates costAmount from NotificationDeliveryLog
 *   for the current month, filtered by channel.
 * - evaluate(): compares projected cost against remaining monthly budget,
 *   returns warn at soft limit %, block at hard limit, detect anomaly spikes.
 *
 * The caller provides monthlyBudget and guardrail config (from cached settings)
 * so this service never reads from the DB for configuration.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import { BudgetGuardrailConfig } from '../types/campaignSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfMonth(now: Date): Date {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function startOfDay(now: Date): Date {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BudgetStatus = 'ok' | 'warn' | 'block' | 'anomaly';

export interface BudgetEvaluationResult {
    status: BudgetStatus;
    remainingBudget: number;
    message: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Aggregate total costAmount from NotificationDeliveryLog for the current
 * calendar month (UTC), filtered by channel.
 *
 * Only counts successfully sent messages (status = 'sent').
 * Req 6.1
 */
export async function getCurrentSpend(
    channel: 'sms' | 'email',
): Promise<number> {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                channel,
                status: 'sent',
                createdAt: { $gte: monthStart },
            },
        },
        {
            $group: {
                _id: null,
                totalCost: { $sum: '$costAmount' },
            },
        },
    ]);

    return result.length > 0 ? result[0].totalCost : 0;
}


/**
 * Get the average daily spend for the current month up to (but not including)
 * today. Used for anomaly spike detection.
 *
 * Returns 0 if the month just started (no prior days to average).
 * Req 6.4
 */
async function getRollingDailyAverage(
    channel: 'sms' | 'email',
): Promise<number> {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const todayStart = startOfDay(now);

    // Number of complete days elapsed this month before today
    const daysElapsed = Math.floor(
        (todayStart.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysElapsed <= 0) {
        // First day of the month — no rolling average available
        return 0;
    }

    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                channel,
                status: 'sent',
                createdAt: { $gte: monthStart, $lt: todayStart },
            },
        },
        {
            $group: {
                _id: null,
                totalCost: { $sum: '$costAmount' },
            },
        },
    ]);

    const totalPriorSpend = result.length > 0 ? result[0].totalCost : 0;
    return totalPriorSpend / daysElapsed;
}

/**
 * Get today's spend so far for the given channel.
 * Req 6.4
 */
async function getTodaySpend(channel: 'sms' | 'email'): Promise<number> {
    const now = new Date();
    const todayStart = startOfDay(now);

    const result = await NotificationDeliveryLog.aggregate([
        {
            $match: {
                channel,
                status: 'sent',
                createdAt: { $gte: todayStart },
            },
        },
        {
            $group: {
                _id: null,
                totalCost: { $sum: '$costAmount' },
            },
        },
    ]);

    return result.length > 0 ? result[0].totalCost : 0;
}

/**
 * Evaluate whether a projected send cost is within budget guardrails.
 *
 * Checks in order:
 *  1. Anomaly spike detection — compare today's spend rate against rolling
 *     daily average; flag if it exceeds anomalySpikeThresholdPercent. (Req 6.4)
 *  2. Hard limit block — if hardLimitEnabled and projected total would
 *     exceed 100% of monthly budget, block the send. (Req 6.3)
 *  3. Soft limit warning — if projected total would exceed softLimitPercent
 *     of monthly budget, attach a warning. (Req 6.2)
 *  4. OK — budget is within acceptable range. (Req 6.1)
 *
 * @param projectedCost  The estimated cost of the upcoming send batch
 * @param channel        'sms' or 'email'
 * @param monthlyBudget  The monthly budget for this channel (from NotificationSettings)
 * @param config         BudgetGuardrailConfig (from cached settings)
 */
export async function evaluate(
    projectedCost: number,
    channel: 'sms' | 'email',
    monthlyBudget: number,
    config: BudgetGuardrailConfig,
): Promise<BudgetEvaluationResult> {
    const currentSpend = await getCurrentSpend(channel);
    const projectedTotal = currentSpend + projectedCost;
    const remaining = monthlyBudget - projectedTotal;

    // 1. Anomaly spike detection — Req 6.4
    const rollingAvg = await getRollingDailyAverage(channel);
    if (rollingAvg > 0) {
        const todaySpend = await getTodaySpend(channel);
        const todayProjected = todaySpend + projectedCost;
        const spikePercent = (todayProjected / rollingAvg) * 100;

        if (spikePercent >= config.anomalySpikeThresholdPercent) {
            return {
                status: 'anomaly',
                remainingBudget: Math.max(0, monthlyBudget - currentSpend),
                message: `Anomaly detected: today's projected spend (${todayProjected.toFixed(2)}) is ${spikePercent.toFixed(0)}% of the rolling daily average (${rollingAvg.toFixed(2)}), exceeding the ${config.anomalySpikeThresholdPercent}% threshold. Campaign auto-paused.`,
            };
        }
    }

    // 2. Hard limit block — Req 6.3
    if (config.hardLimitEnabled && projectedTotal > monthlyBudget) {
        return {
            status: 'block',
            remainingBudget: Math.max(0, monthlyBudget - currentSpend),
            message: `Budget exhausted: projected total (${projectedTotal.toFixed(2)}) exceeds monthly budget (${monthlyBudget.toFixed(2)}). Send blocked.`,
        };
    }

    // 3. Soft limit warning — Req 6.2
    const softThreshold = (config.softLimitPercent / 100) * monthlyBudget;
    if (projectedTotal >= softThreshold) {
        return {
            status: 'warn',
            remainingBudget: Math.max(0, remaining),
            message: `Budget warning: projected total (${projectedTotal.toFixed(2)}) has reached ${((projectedTotal / monthlyBudget) * 100).toFixed(1)}% of the monthly budget (${monthlyBudget.toFixed(2)}), exceeding the ${config.softLimitPercent}% soft limit.`,
        };
    }

    // 4. OK — Req 6.1
    return {
        status: 'ok',
        remainingBudget: Math.max(0, remaining),
        message: `Budget OK: projected total (${projectedTotal.toFixed(2)}) is within limits. Remaining: ${Math.max(0, remaining).toFixed(2)}.`,
    };
}
