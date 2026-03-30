import mongoose, { Document, Schema } from 'mongoose';

export type SecurityTokenPurpose =
    | 'password_reset'
    | 'email_verification'
    | 'phone_verification'
    | 'two_factor_pending'
    | 'step_up_auth'
    | 'set_password'
    | 'recovery';

export interface ISecurityToken extends Document {
    userId: mongoose.Types.ObjectId;
    purpose: SecurityTokenPurpose;
    tokenHash: string;
    tokenHint?: string;
    channel?: 'email' | 'sms' | 'authenticator' | 'system';
    meta?: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    consumedAt?: Date | null;
    invalidatedAt?: Date | null;
    replacedByTokenId?: mongoose.Types.ObjectId | null;
    createdBy?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const SecurityTokenSchema = new Schema<ISecurityToken>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        purpose: {
            type: String,
            required: true,
            enum: [
                'password_reset',
                'email_verification',
                'phone_verification',
                'two_factor_pending',
                'step_up_auth',
                'set_password',
                'recovery',
            ],
            index: true,
        },
        tokenHash: { type: String, required: true, index: true },
        tokenHint: { type: String, trim: true, default: '' },
        channel: { type: String, enum: ['email', 'sms', 'authenticator', 'system'], default: 'system' },
        meta: { type: Schema.Types.Mixed, default: {} },
        attempts: { type: Number, default: 0, min: 0 },
        maxAttempts: { type: Number, default: 5, min: 1, max: 50 },
        expiresAt: { type: Date, required: true },
        consumedAt: { type: Date, default: null },
        invalidatedAt: { type: Date, default: null },
        replacedByTokenId: { type: Schema.Types.ObjectId, ref: 'SecurityToken', default: null },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    {
        timestamps: true,
        collection: 'security_tokens',
    },
);

SecurityTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1, invalidatedAt: 1, createdAt: -1 });
SecurityTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISecurityToken>('SecurityToken', SecurityTokenSchema);
