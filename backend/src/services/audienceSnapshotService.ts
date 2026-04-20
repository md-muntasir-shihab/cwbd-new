/**
 * Audience Snapshot Service
 *
 * Captures audience composition at preview time, generates a deterministic
 * SHA-256 hash of sorted member IDs, and detects drift at send time by
 * comparing the stored hash against a recomputed hash of the current audience.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import * as crypto from 'crypto';
import mongoose from 'mongoose';
import AudienceSnapshot, { IAudienceSnapshot } from '../models/AudienceSnapshot';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic SHA-256 hash from an array of ObjectIds.
 * IDs are sorted lexicographically (as hex strings) before hashing
 * to ensure the same set always produces the same hash regardless of order.
 */
export function computeHash(memberIds: mongoose.Types.ObjectId[]): string {
    const sorted = memberIds.map((id) => id.toHexString()).sort();
    return crypto.createHash('sha256').update(sorted.join(',')).digest('hex');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Capture (create or upsert) an audience snapshot for a campaign.
 * Stores the sorted memberIds and their deterministic hash.
 * Req 7.1
 */
export async function capture(
    campaignId: mongoose.Types.ObjectId,
    memberIds: mongoose.Types.ObjectId[],
): Promise<IAudienceSnapshot> {
    const hash = computeHash(memberIds);
    const sortedIds = [...memberIds].sort((a, b) =>
        a.toHexString().localeCompare(b.toHexString()),
    );

    const snapshot = await AudienceSnapshot.findOneAndUpdate(
        { campaignId },
        {
            $set: {
                memberIds: sortedIds,
                hash,
                capturedAt: new Date(),
            },
        },
        { upsert: true, new: true },
    );

    return snapshot;
}

/**
 * Detect whether the current audience has drifted from the stored snapshot.
 * Recomputes the hash of currentMemberIds and compares it against the
 * stored snapshot hash.
 * Req 7.2, 7.3
 */
export async function detectDrift(
    campaignId: mongoose.Types.ObjectId,
    currentMemberIds: mongoose.Types.ObjectId[],
): Promise<{ drifted: boolean; snapshotHash: string; currentHash: string }> {
    const snapshot = await AudienceSnapshot.findOne({ campaignId }).lean();

    if (!snapshot) {
        throw new Error(`No audience snapshot found for campaign ${campaignId.toHexString()}`);
    }

    const currentHash = computeHash(currentMemberIds);

    return {
        drifted: snapshot.hash !== currentHash,
        snapshotHash: snapshot.hash,
        currentHash,
    };
}

/**
 * Retrieve the stored audience snapshot for a campaign.
 * Returns null if no snapshot exists.
 */
export async function getSnapshot(
    campaignId: mongoose.Types.ObjectId,
): Promise<IAudienceSnapshot | null> {
    return AudienceSnapshot.findOne({ campaignId });
}
