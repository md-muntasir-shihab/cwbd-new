import mongoose, { Document, Schema } from 'mongoose';

export type DeliveryLogStatus = 'sent' | 'failed' | 'queued';

export interface INotificationDeliveryLog extends Document {
    jobId: mongoose.Types.ObjectId;
    campaignId?: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
    guardianTargeted: boolean;
    channel: 'sms' | 'email';
    providerUsed: string;
    templateKey?: string;
    templateId?: mongoose.Types.ObjectId;
    to: string;
    status: DeliveryLogStatus;
    providerMessageId?: string;
    errorMessage?: string;
    originModule?: 'campaign' | 'news' | 'notice' | 'trigger';
    originEntityId?: string;
    originAction?: string;
    sentAtUTC?: Date;
    costAmount: number;
    retryCount: number;
    isTestSend?: boolean;
    recipientMode?: string;
    messageMode?: string;
    recipientDisplay?: string;
    renderedPreview?: string;
    financeSynced?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationDeliveryLogSchema = new Schema<INotificationDeliveryLog>(
    {
        jobId: { type: Schema.Types.ObjectId, ref: 'NotificationJob', required: true },
        campaignId: { type: Schema.Types.ObjectId, ref: 'NotificationJob', default: null },
        studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        guardianTargeted: { type: Boolean, default: false },
        channel: {
            type: String,
            enum: ['sms', 'email'],
            required: true,
        },
        providerUsed: { type: String, required: true, trim: true },
        templateKey: { type: String, trim: true, default: '' },
        templateId: { type: Schema.Types.ObjectId, ref: 'NotificationTemplate', default: null },
        to: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ['sent', 'failed', 'queued'],
            required: true,
            default: 'queued',
        },
        providerMessageId: { type: String, trim: true },
        errorMessage: { type: String },
        originModule: { type: String, enum: ['campaign', 'news', 'notice', 'trigger'], default: 'campaign', index: true },
        originEntityId: { type: String, trim: true, default: '' },
        originAction: { type: String, trim: true, default: '' },
        sentAtUTC: { type: Date },
        costAmount: { type: Number, default: 0, min: 0 },
        retryCount: { type: Number, default: 0, min: 0 },
        isTestSend: { type: Boolean, default: false, index: true },
        recipientMode: { type: String, trim: true },
        messageMode: { type: String, trim: true },
        recipientDisplay: { type: String, trim: true },
        renderedPreview: { type: String },
        financeSynced: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'notification_delivery_logs' }
);

NotificationDeliveryLogSchema.index({ studentId: 1, sentAtUTC: -1 });
NotificationDeliveryLogSchema.index({ jobId: 1 });
NotificationDeliveryLogSchema.index({ status: 1 });
NotificationDeliveryLogSchema.index({ originModule: 1, originEntityId: 1, createdAt: -1 });
NotificationDeliveryLogSchema.index({ studentId: 1, createdAt: 1 }); // frequency cap lookups

export default mongoose.model<INotificationDeliveryLog>('NotificationDeliveryLog', NotificationDeliveryLogSchema);
