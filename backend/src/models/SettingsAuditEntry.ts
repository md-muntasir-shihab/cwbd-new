import mongoose, { Schema, Document } from 'mongoose';

// ─── Diff Item Interface ─────────────────────────────────────────────────────

export interface IDiffItem {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}

// ─── Settings Audit Entry Interface ──────────────────────────────────────────

export interface ISettingsAuditEntry extends Document {
    actorId: mongoose.Types.ObjectId;
    actorRole: string;
    timestamp: Date;
    ipAddress: string;
    section: string;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    diff: IDiffItem[];
    version: number;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const DiffItemSchema = new Schema<IDiffItem>(
    {
        field: { type: String, required: true },
        oldValue: { type: Schema.Types.Mixed },
        newValue: { type: Schema.Types.Mixed },
    },
    { _id: false },
);

const SettingsAuditEntrySchema = new Schema<ISettingsAuditEntry>(
    {
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        actorRole: { type: String, required: true, trim: true },
        timestamp: { type: Date, required: true, default: Date.now },
        ipAddress: { type: String, required: false, default: '' },
        section: { type: String, required: true, trim: true },
        beforeSnapshot: { type: Schema.Types.Mixed, default: {} },
        afterSnapshot: { type: Schema.Types.Mixed, default: {} },
        diff: { type: [DiffItemSchema], default: [] },
        version: { type: Number, required: true },
    },
    {
        timestamps: false,
        collection: 'settings_audit_entries',
    },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

SettingsAuditEntrySchema.index({ section: 1, timestamp: -1 });
SettingsAuditEntrySchema.index({ version: 1 }, { unique: true });
SettingsAuditEntrySchema.index({ actorId: 1, timestamp: -1 });

export default mongoose.model<ISettingsAuditEntry>(
    'SettingsAuditEntry',
    SettingsAuditEntrySchema,
);
