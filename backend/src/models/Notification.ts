import mongoose, { Document, Schema } from 'mongoose';

export type NotificationCategory = 'general' | 'exam' | 'update';
export type NotificationTargetRole = 'student' | 'admin' | 'moderator' | 'all';
export type NotificationType =
    | 'contact_new'
    | 'support_ticket_new'
    | 'support_reply_new'
    | 'support_status_changed'
    | 'profile_update_request'
    | 'payment_review'
    | 'payment_verified'
    | 'payment_rejected'
    | 'campaign_failure'
    | 'provider_failure'
    | 'trigger_failure'
    | 'system_alert'
    | '';
export type NotificationPriority = 'normal' | 'high' | 'urgent';

export interface INotification extends Document {
    title: string;
    message: string;
    type?: NotificationType;
    messagePreview?: string;
    category: NotificationCategory;
    publishAt?: Date;
    expireAt?: Date;
    isActive: boolean;
    linkUrl?: string;
    sourceType?: string;
    sourceId?: string;
    targetRoute?: string;
    targetEntityId?: string;
    priority?: NotificationPriority;
    actorUserId?: mongoose.Types.ObjectId;
    actorNameSnapshot?: string;
    dedupeKey?: string;
    attachmentUrl?: string;
    targetRole: NotificationTargetRole;
    reminderKey?: string;
    targetUserIds?: mongoose.Types.ObjectId[];
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: [
            'contact_new',
            'support_ticket_new',
            'support_reply_new',
            'support_status_changed',
            'profile_update_request',
            'payment_review',
            'payment_verified',
            'payment_rejected',
            'campaign_failure',
            'provider_failure',
            'trigger_failure',
            'system_alert',
            '',
        ],
        default: '',
        index: true,
    },
    messagePreview: { type: String, trim: true, default: '' },
    category: { type: String, enum: ['general', 'exam', 'update'], default: 'general' },
    publishAt: { type: Date, default: null },
    expireAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    linkUrl: { type: String, default: '' },
    sourceType: { type: String, trim: true, default: '', index: true },
    sourceId: { type: String, trim: true, default: '', index: true },
    targetRoute: { type: String, trim: true, default: '' },
    targetEntityId: { type: String, trim: true, default: '', index: true },
    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorNameSnapshot: { type: String, trim: true, default: '' },
    dedupeKey: { type: String, trim: true, default: undefined },
    attachmentUrl: { type: String, default: '' },
    targetRole: { type: String, enum: ['student', 'admin', 'moderator', 'all'], default: 'student' },
    reminderKey: { type: String, default: undefined },
    targetUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

NotificationSchema.index({ isActive: 1, publishAt: -1, createdAt: -1 });
NotificationSchema.index({ category: 1, isActive: 1 });
NotificationSchema.index({ targetRole: 1, createdAt: -1 });
NotificationSchema.index({ reminderKey: 1 }, { unique: true, sparse: true });
NotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
NotificationSchema.index({ sourceId: 1, createdAt: -1 });
NotificationSchema.index({ targetEntityId: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
