import mongoose, { Document, Schema } from 'mongoose';

export type NotificationChannel = 'sms' | 'email';
export type NotificationTemplateCategory =
    | 'account' | 'password' | 'subscription' | 'payment'
    | 'exam' | 'result' | 'news' | 'resource' | 'support'
    | 'campaign' | 'guardian' | 'other';

export interface INotificationTemplate extends Document {
    key: string;
    channel: NotificationChannel;
    category: NotificationTemplateCategory;
    subject?: string;
    body: string;
    htmlBody?: string;
    bodyFormat: 'plain' | 'html';
    designPreset?: string;
    placeholdersAllowed: string[];
    isEnabled: boolean;
    versionNo: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Seeded notification templates (not auto-seeded, for reference):
 *
 * SUB_EXPIRY_7D  (sms+email): "Your subscription expires in 7 days. Renew now to keep access."
 *   Placeholders: {student_name}, {expiry_date}, {plan_name}, {renewal_url}
 *
 * SUB_EXPIRY_3D  (sms+email): "Reminder: Your subscription expires in 3 days."
 *   Placeholders: {student_name}, {expiry_date}, {plan_name}, {renewal_url}
 *
 * SUB_EXPIRY_1D  (sms+email): "Last chance! Your subscription expires tomorrow."
 *   Placeholders: {student_name}, {expiry_date}, {plan_name}, {renewal_url}
 *
 * SUB_EXPIRED    (sms+email): "Your subscription has expired. Contact admin to renew."
 *   Placeholders: {student_name}, {expiry_date}, {plan_name}
 *
 * NEWS_PUBLISHED (sms+email): "New article published: {title}. Read it at {url}."
 *   Placeholders: {student_name}, {title}, {url}, {category}
 *
 * EXAM_PUBLISHED (sms+email): "A new exam is available: {exam_title}. Start at {url}."
 *   Placeholders: {student_name}, {exam_title}, {url}, {exam_date}
 */

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
    {
        key: { type: String, required: true, unique: true, trim: true, uppercase: true },
        channel: {
            type: String,
            enum: ['sms', 'email'],
            required: true,
            index: true,
        },
        category: {
            type: String,
            enum: ['account', 'password', 'subscription', 'payment', 'exam', 'result', 'news', 'resource', 'support', 'campaign', 'guardian', 'other'],
            default: 'other',
            index: true,
        },
        subject: { type: String, trim: true },
        body: { type: String, required: true },
        htmlBody: { type: String, trim: true, default: '' },
        bodyFormat: { type: String, enum: ['plain', 'html'], default: 'plain' },
        designPreset: { type: String, trim: true, default: '' },
        placeholdersAllowed: {
            type: [String],
            default: [],
        },
        isEnabled: { type: Boolean, default: true, index: true },
        versionNo: { type: Number, default: 1, min: 1 },
    },
    { timestamps: true, collection: 'notification_templates' }
);

NotificationTemplateSchema.index({ key: 1, channel: 1 });

export default mongoose.model<INotificationTemplate>('NotificationTemplate', NotificationTemplateSchema);
