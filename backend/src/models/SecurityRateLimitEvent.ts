import mongoose, { Document, Schema } from 'mongoose';

export type SecurityRateLimitBucket =
    | 'auth_login'
    | 'otp_verify'
    | 'otp_resend'
    | 'upload'
    | 'export'
    | 'admin_action'
    | 'contact_form';

export interface ISecurityRateLimitEvent extends Document {
    bucket: SecurityRateLimitBucket;
    scopeKey: string;
    count: number;
    maxAllowed: number;
    windowStartedAt: Date;
    windowExpiresAt: Date;
    lastSeenAt: Date;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const SecurityRateLimitEventSchema = new Schema<ISecurityRateLimitEvent>(
    {
        bucket: {
            type: String,
            required: true,
            enum: ['auth_login', 'otp_verify', 'otp_resend', 'upload', 'export', 'admin_action', 'contact_form'],
            index: true,
        },
        scopeKey: { type: String, required: true, trim: true, index: true },
        count: { type: Number, default: 0, min: 0 },
        maxAllowed: { type: Number, required: true, min: 1 },
        windowStartedAt: { type: Date, required: true },
        windowExpiresAt: { type: Date, required: true },
        lastSeenAt: { type: Date, default: Date.now },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    {
        timestamps: true,
        collection: 'security_rate_limit_events',
    },
);

SecurityRateLimitEventSchema.index({ bucket: 1, scopeKey: 1 }, { unique: true });
SecurityRateLimitEventSchema.index({ windowExpiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISecurityRateLimitEvent>('SecurityRateLimitEvent', SecurityRateLimitEventSchema);
