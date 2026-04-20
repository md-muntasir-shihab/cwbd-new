import mongoose, { Schema, Document } from 'mongoose';

// ─── Experiment Assignment Interface ─────────────────────────────────────────

export interface IEngagement {
    metric: 'open' | 'click' | 'conversion';
    recordedAt: Date;
}

export interface IExperimentAssignment extends Document {
    experimentId: mongoose.Types.ObjectId;
    recipientId: mongoose.Types.ObjectId;
    variantId: string | null;
    isHoldout: boolean;
    assignedAt: Date;
    engagements: IEngagement[];
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const EngagementSchema = new Schema<IEngagement>(
    {
        metric: { type: String, enum: ['open', 'click', 'conversion'], required: true },
        recordedAt: { type: Date, required: true, default: Date.now },
    },
    { _id: false },
);

const ExperimentAssignmentSchema = new Schema<IExperimentAssignment>(
    {
        experimentId: { type: Schema.Types.ObjectId, required: true },
        recipientId: { type: Schema.Types.ObjectId, required: true },
        variantId: { type: String, default: null },
        isHoldout: { type: Boolean, required: true, default: false },
        assignedAt: { type: Date, required: true, default: Date.now },
        engagements: { type: [EngagementSchema], default: [] },
    },
    {
        timestamps: false,
        collection: 'experiment_assignments',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Compound unique index — one assignment per experiment + recipient.
ExperimentAssignmentSchema.index({ experimentId: 1, recipientId: 1 }, { unique: true });

export default mongoose.model<IExperimentAssignment>(
    'ExperimentAssignment',
    ExperimentAssignmentSchema,
);
