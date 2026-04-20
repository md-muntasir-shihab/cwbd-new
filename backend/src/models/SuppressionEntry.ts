import mongoose, { Schema, Document } from 'mongoose';

// ─── Suppression Entry Interface ─────────────────────────────────────────────

export interface ISuppressionEntry extends Document {
    contactIdentifier: string;
    channel: 'sms' | 'email';
    reason: 'hard_bounce' | 'complaint' | 'invalid_contact' | 'manual_blacklist';
    suppressedAt: Date;
    source: string;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const SuppressionEntrySchema = new Schema<ISuppressionEntry>(
    {
        contactIdentifier: { type: String, required: true },
        channel: { type: String, enum: ['sms', 'email'], required: true },
        reason: {
            type: String,
            enum: ['hard_bounce', 'complaint', 'invalid_contact', 'manual_blacklist'],
            required: true,
        },
        suppressedAt: { type: Date, required: true, default: Date.now },
        source: { type: String, required: true },
    },
    {
        timestamps: false,
        collection: 'suppression_entries',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique compound index for fast lookups and to prevent duplicate entries (Req 19.2).
SuppressionEntrySchema.index({ contactIdentifier: 1, channel: 1 }, { unique: true });

export default mongoose.model<ISuppressionEntry>('SuppressionEntry', SuppressionEntrySchema);
