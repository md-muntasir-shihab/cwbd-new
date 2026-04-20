import mongoose, { Schema, Document } from 'mongoose';

// ─── Idempotency Key Interface ───────────────────────────────────────────────

export interface IIdempotencyKey extends Document {
    key: string;
    result: Record<string, unknown>;
    expiresAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
    {
        key: { type: String, required: true },
        result: { type: Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true },
    },
    {
        timestamps: false,
        collection: 'idempotency_keys',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique index on key for fast lookups and duplicate prevention (Req 17.1).
IdempotencyKeySchema.index({ key: 1 }, { unique: true });

// TTL index on expiresAt for automatic purge of expired keys (Req 17.3).
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
