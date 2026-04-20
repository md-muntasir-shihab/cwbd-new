/**
 * Frequency Cap Evaluator Service
 *
 * Enforces per-user send limits across day, week, and month windows,
 * including cooldown (minimum interval between sends) and priority
 * bypass for critical transactional alerts.
 *
 * Uses the indexed { studentId, createdAt } compound index on
 * NotificationDeliveryLog for efficient cap lookups.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 19.4
 */

import mongoose from 'mongoose';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import { FrequencyCapConfig } from '../types/campaignSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfDay(now: Date): Date {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function startOfWeek(now: Date): Date {
    const d = new Date(now);
    const day = d.getUTCDay(); // 0 = Sunday
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(now: Date): Date {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

// ─── Core evaluation ─────────────────────────────────────────────────────────

/**
 * Count the number of delivered messages for a user since a given date.
 * Leverages the compound index { studentId: 1, createdAt: 1 }. Req 19.4
 */
async function countMessagesSince(
    userId: mongoose.Types.ObjectId,
    since: Date,
): Promise<number> {
    return NotificationDeliveryLog.countDocuments({
        studentId: userId,
        createdAt: { $gte: since },
        status: { $in: ['sent', 'queued'] },
    });
}

/**
 * Find the most recent message timestamp for a user.
 */
async function lastMessageTime(
    userId: mongoose.Types.ObjectId,
): Promise<Date | null> {
    const doc = await NotificationDeliveryLog.findOne({
        studentId: userId,
        status: { $in: ['sent', 'queued'] },
    })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean();

    return doc ? doc.createdAt : null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface EvaluateResult {
    allowed: boolean;
    reason?: string;
    deferUntil?: Date;
}

export interface FilterCappedResult {
    eligible: mongoose.Types.ObjectId[];
    capped: mongoose.Types.ObjectId[];
    deferred: Array<{ userId: mongoose.Types.ObjectId; deferUntil: Date }>;
}

/**
 * Evaluate whether a single user is allowed to receive a message
 * given the current frequency cap configuration.
 *
 * Order of checks:
 *  1. Critical bypass (Req 4.5)
 *  2. Daily cap (Req 4.2)
 *  3. Weekly cap (Req 4.2)
 *  4. Monthly cap (Req 4.2)
 *  5. Cooldown window (Req 4.3, 4.4)
 */
export async function evaluate(
    userId: mongoose.Types.ObjectId,
    config: FrequencyCapConfig,
    isCritical: boolean,
): Promise<EvaluateResult> {
    // 1. Critical transactional alerts bypass all caps — Req 4.5
    if (isCritical) {
        return { allowed: true };
    }

    const now = new Date();

    // 2-4. Window cap checks — Req 4.1, 4.2
    const [dailyCount, weeklyCount, monthlyCount] = await Promise.all([
        countMessagesSince(userId, startOfDay(now)),
        countMessagesSince(userId, startOfWeek(now)),
        countMessagesSince(userId, startOfMonth(now)),
    ]);

    if (dailyCount >= config.dailyCap) {
        return { allowed: false, reason: 'daily_cap_exceeded' };
    }

    if (weeklyCount >= config.weeklyCap) {
        return { allowed: false, reason: 'weekly_cap_exceeded' };
    }

    if (monthlyCount >= config.monthlyCap) {
        return { allowed: false, reason: 'monthly_cap_exceeded' };
    }

    // 5. Cooldown window — Req 4.3, 4.4
    if (config.cooldownMinutes > 0) {
        const lastSent = await lastMessageTime(userId);

        if (lastSent) {
            const cooldownExpiry = new Date(
                lastSent.getTime() + config.cooldownMinutes * 60_000,
            );

            if (now < cooldownExpiry) {
                return { allowed: false, reason: 'cooldown_active', deferUntil: cooldownExpiry };
            }
        }
    }

    return { allowed: true };
}

/**
 * Batch-evaluate a list of userIds and partition them into
 * eligible / capped / deferred buckets.
 */
export async function filterCapped(
    userIds: mongoose.Types.ObjectId[],
    config: FrequencyCapConfig,
    isCritical: boolean,
): Promise<FilterCappedResult> {
    const eligible: mongoose.Types.ObjectId[] = [];
    const capped: mongoose.Types.ObjectId[] = [];
    const deferred: Array<{ userId: mongoose.Types.ObjectId; deferUntil: Date }> = [];

    if (userIds.length === 0) {
        return { eligible, capped, deferred };
    }

    // Critical bypass — all users are eligible immediately
    if (isCritical) {
        return { eligible: [...userIds], capped, deferred };
    }

    // Evaluate each user concurrently
    const results = await Promise.all(
        userIds.map(async (userId) => {
            const result = await evaluate(userId, config, false);
            return { userId, result };
        }),
    );

    for (const { userId, result } of results) {
        if (result.allowed) {
            eligible.push(userId);
        } else if (result.deferUntil) {
            deferred.push({ userId, deferUntil: result.deferUntil });
        } else {
            capped.push(userId);
        }
    }

    return { eligible, capped, deferred };
}
