/**
 * Idempotency Guard Service
 *
 * Prevents duplicate message deliveries by generating deterministic
 * idempotency keys from campaignId + recipientId + scheduledAt, checking
 * for existing keys, and recording results with a configurable TTL.
 * Expired keys are auto-purged via MongoDB TTL index.
 *
 * Requirements: 17.1, 17.2, 17.3
 */

import * as crypto from 'crypto';
import mongoose from 'mongoose';
import IdempotencyKey from '../models/IdempotencyKey';

/** Default TTL: 24 hours in seconds */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a deterministic idempotency key from campaign ID, recipient ID,
 * and scheduled timestamp. Uses SHA-256 to produce a fixed-length key.
 * Req 17.1
 */
export function generateKey(
    campaignId: mongoose.Types.ObjectId,
    recipientId: mongoose.Types.ObjectId,
    scheduledAt: Date,
): string {
    const raw = `${campaignId.toHexString()}:${recipientId.toHexString()}:${scheduledAt.toISOString()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Check whether an idempotency key already exists (i.e. the send was
 * already processed). Returns isDuplicate: true with the original result
 * if found, otherwise isDuplicate: false.
 * Req 17.2
 */
export async function check(
    key: string,
): Promise<{ isDuplicate: boolean; originalResult?: Record<string, unknown> }> {
    const existing = await IdempotencyKey.findOne({ key }).lean();

    if (existing) {
        return { isDuplicate: true, originalResult: existing.result as Record<string, unknown> };
    }

    return { isDuplicate: false };
}

/**
 * Record an idempotency key with the send result and a TTL.
 * The key will be automatically purged by MongoDB after the TTL expires.
 * Req 17.2, 17.3
 */
export async function record(
    key: string,
    result: Record<string, unknown>,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await IdempotencyKey.findOneAndUpdate(
        { key },
        { $set: { result, expiresAt } },
        { upsert: true },
    );
}
