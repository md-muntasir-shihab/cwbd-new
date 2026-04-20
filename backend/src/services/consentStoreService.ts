/**
 * Consent Store Service
 *
 * Manages per-user, per-channel consent preferences with purpose-based
 * granularity (transactional vs promotional). Supports global and
 * category-level unsubscribe, and batch filtering for the send path.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 19.3
 */

import mongoose from 'mongoose';
import ConsentRecord from '../models/ConsentRecord';

// ─── Channels and purposes ───────────────────────────────────────────────────

const ALL_CHANNELS: readonly string[] = ['sms', 'email'] as const;
const ALL_PURPOSES: readonly string[] = ['transactional', 'promotional'] as const;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the consent record for a specific user/channel/purpose combo.
 * Returns null if no record exists (no explicit consent decision recorded).
 */
export async function getConsent(
    userId: mongoose.Types.ObjectId,
    channel: string,
    purpose: string,
) {
    return ConsentRecord.findOne({ userId, channel, purpose }).lean();
}

/**
 * Set (upsert) the consent status for a user/channel/purpose combo.
 * Records the change timestamp, source, and actor. Req 2.1, 2.2, 2.6
 */
export async function setConsent(
    userId: mongoose.Types.ObjectId,
    channel: string,
    purpose: string,
    optedIn: boolean,
    source: string,
    actorId: mongoose.Types.ObjectId,
): Promise<void> {
    await ConsentRecord.updateOne(
        { userId, channel, purpose },
        {
            $set: {
                optedIn,
                changedAt: new Date(),
                source,
                actorId,
            },
        },
        { upsert: true },
    );
}

/**
 * Global unsubscribe: marks ALL channels and ALL purposes as opted-out
 * for the given user. Req 2.3
 */
export async function globalUnsubscribe(
    userId: mongoose.Types.ObjectId,
    source: string,
    actorId: mongoose.Types.ObjectId,
): Promise<void> {
    const now = new Date();
    const ops = [];

    for (const channel of ALL_CHANNELS) {
        for (const purpose of ALL_PURPOSES) {
            ops.push({
                updateOne: {
                    filter: { userId, channel, purpose },
                    update: {
                        $set: {
                            optedIn: false,
                            changedAt: now,
                            source,
                            actorId,
                        },
                    },
                    upsert: true,
                },
            });
        }
    }

    await ConsentRecord.bulkWrite(ops);
}

/**
 * Category-level unsubscribe: marks only the specified purpose as opted-out
 * across ALL channels, preserving other consent records. Req 2.4
 */
export async function categoryUnsubscribe(
    userId: mongoose.Types.ObjectId,
    purpose: string,
    source: string,
    actorId: mongoose.Types.ObjectId,
): Promise<void> {
    const now = new Date();
    const ops = [];

    for (const channel of ALL_CHANNELS) {
        ops.push({
            updateOne: {
                filter: { userId, channel, purpose },
                update: {
                    $set: {
                        optedIn: false,
                        changedAt: now,
                        source,
                        actorId,
                    },
                },
                upsert: true,
            },
        });
    }

    await ConsentRecord.bulkWrite(ops);
}

/**
 * Filter a list of userIds to only those who have opted-in for the given
 * channel + purpose combination. Users without a consent record are
 * excluded (no implicit opt-in). Req 2.5, 19.3
 */
export async function filterOptedIn(
    userIds: mongoose.Types.ObjectId[],
    channel: string,
    purpose: string,
): Promise<mongoose.Types.ObjectId[]> {
    if (userIds.length === 0) return [];

    const records = await ConsentRecord.find({
        userId: { $in: userIds },
        channel,
        purpose,
        optedIn: true,
    })
        .select('userId')
        .lean();

    return records.map((r) => r.userId);
}
