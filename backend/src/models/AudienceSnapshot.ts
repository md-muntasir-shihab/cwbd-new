import mongoose, { Schema, Document } from 'mongoose';

// ─── Audience Snapshot Interface ─────────────────────────────────────────────

export interface IAudienceSnapshot extends Document {
    campaignId: mongoose.Types.ObjectId;
    memberIds: mongoose.Types.ObjectId[];
    hash: string;
    capturedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const AudienceSnapshotSchema = new Schema<IAudienceSnapshot>(
    {
        campaignId: { type: Schema.Types.ObjectId, required: true },
        memberIds: [{ type: Schema.Types.ObjectId }],
        hash: { type: String, required: true },
        capturedAt: { type: Date, required: true, default: Date.now },
    },
    {
        timestamps: false,
        collection: 'audience_snapshots',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Unique index on campaignId — one snapshot per campaign.
AudienceSnapshotSchema.index({ campaignId: 1 }, { unique: true });

export default mongoose.model<IAudienceSnapshot>('AudienceSnapshot', AudienceSnapshotSchema);
