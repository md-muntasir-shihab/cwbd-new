import mongoose, { Schema, Document } from 'mongoose';

// ─── Consent Record Interface ────────────────────────────────────────────────

export interface IConsentRecord extends Document {
    userId: mongoose.Types.ObjectId;
    channel: 'sms' | 'email';
    purpose: 'transactional' | 'promotional';
    optedIn: boolean;
    changedAt: Date;
    source: 'user' | 'admin_override' | 'api';
    actorId: mongoose.Types.ObjectId;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const ConsentRecordSchema = new Schema<IConsentRecord>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        channel: { type: String, enum: ['sms', 'email'], required: true },
        purpose: { type: String, enum: ['transactional', 'promotional'], required: true },
        optedIn: { type: Boolean, required: true, default: true },
        changedAt: { type: Date, required: true, default: Date.now },
        source: { type: String, enum: ['user', 'admin_override', 'api'], required: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    {
        timestamps: false,
        collection: 'consent_records',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique compound index ensures one record per user/channel/purpose combo.
// Also serves as the fast-lookup index for consent checks (Req 19.3).
ConsentRecordSchema.index({ userId: 1, channel: 1, purpose: 1 }, { unique: true });

export default mongoose.model<IConsentRecord>('ConsentRecord', ConsentRecordSchema);
