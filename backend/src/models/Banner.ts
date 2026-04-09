import mongoose, { Schema, Document } from 'mongoose';

export interface IPopupConfig {
    /** Seconds after which popup auto-closes. 0 = does not auto-close. */
    autoCloseAfterSeconds: number;
    /** Seconds before the X / close button becomes visible. 0 = immediately. */
    closeButtonDelaySeconds: number;
    /** Max times to show to the same browser per day (localStorage). 0 = unlimited. */
    maxViewsPerDay: number;
    /** Min hours between shows for the same browser. 0 = no cooldown. */
    cooldownHours: number;
}

export interface IBanner extends Document {
    title?: string;
    subtitle?: string;
    imageUrl: string;
    mobileImageUrl?: string;
    linkUrl?: string;
    altText?: string;
    isActive: boolean;
    status: 'draft' | 'published';
    slot: 'top' | 'middle' | 'footer' | 'home_ads' | 'popup';
    priority: number;
    order: number;
    /* ── Scheduled visibility ── */
    startDate?: Date;
    endDate?: Date;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    /* ── Popup-specific settings (only relevant when slot === 'popup') ── */
    popupConfig?: IPopupConfig;
}

const PopupConfigSchema = new Schema<IPopupConfig>({
    autoCloseAfterSeconds: { type: Number, default: 0 },
    closeButtonDelaySeconds: { type: Number, default: 0 },
    maxViewsPerDay: { type: Number, default: 1 },
    cooldownHours: { type: Number, default: 24 },
}, { _id: false });

const BannerSchema = new Schema<IBanner>({
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    mobileImageUrl: String,
    linkUrl: { type: String, default: '' },
    altText: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    slot: { type: String, enum: ['top', 'middle', 'footer', 'home_ads', 'popup'], default: 'top' },
    priority: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    startDate: Date,
    endDate: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    popupConfig: { type: PopupConfigSchema, default: undefined },
}, { timestamps: true });

BannerSchema.index({ isActive: 1, order: 1 });
BannerSchema.index({ slot: 1, status: 1, startDate: 1, endDate: 1, priority: -1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
