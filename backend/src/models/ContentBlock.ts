import mongoose, { Document, Schema } from 'mongoose';

export type ContentBlockType = 'cta_strip' | 'info_banner' | 'campaign_card' | 'notice_ribbon' | 'hero_card';

export type ContentBlockPlacement =
    | 'HOME_TOP'
    | 'HOME_MID'
    | 'HOME_BOTTOM'
    | 'EXAM_LIST'
    | 'STUDENT_DASHBOARD'
    | 'NEWS_PAGE'
    | 'UNIVERSITY_LIST'
    | 'PRICING_PAGE';

export interface IAudienceRules {
    roles?: string[];
    hasActiveSubscription?: boolean;
    groups?: string[];
}

export interface IContentBlock extends Document {
    title: string;
    subtitle?: string;
    body?: string;
    imageUrl?: string;
    ctaText?: string;
    ctaUrl?: string;
    type: ContentBlockType;
    placements: ContentBlockPlacement[];
    styleVariant?: string;
    isEnabled: boolean;
    startAtUTC?: Date;
    endAtUTC?: Date;
    priority: number;
    dismissible: boolean;
    audienceRules?: IAudienceRules;
    impressionCount: number;
    clickCount: number;
    createdByAdminId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ContentBlockSchema = new Schema<IContentBlock>(
    {
        title: { type: String, required: true, maxlength: 200 },
        subtitle: { type: String, maxlength: 300 },
        body: { type: String, maxlength: 5000 },
        imageUrl: { type: String, maxlength: 500 },
        ctaText: { type: String, maxlength: 60 },
        ctaUrl: { type: String, maxlength: 500 },
        type: {
            type: String,
            required: true,
            enum: ['cta_strip', 'info_banner', 'campaign_card', 'notice_ribbon', 'hero_card'],
        },
        placements: [{
            type: String,
            enum: [
                'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
                'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
                'EXAM_LIST', 'STUDENT_DASHBOARD', 'NEWS_PAGE',
                'UNIVERSITY_LIST', 'PRICING_PAGE',
            ],
        }],
        styleVariant: { type: String, maxlength: 50 },
        isEnabled: { type: Boolean, default: true },
        startAtUTC: { type: Date },
        endAtUTC: { type: Date },
        priority: { type: Number, default: 0 },
        dismissible: { type: Boolean, default: true },
        audienceRules: {
            roles: [String],
            hasActiveSubscription: Boolean,
            groups: [String],
        },
        impressionCount: { type: Number, default: 0 },
        clickCount: { type: Number, default: 0 },
        createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true, collection: 'content_blocks' },
);

ContentBlockSchema.index({ isEnabled: 1, placements: 1, priority: -1 });
ContentBlockSchema.index({ startAtUTC: 1, endAtUTC: 1 });

export default mongoose.model<IContentBlock>('ContentBlock', ContentBlockSchema);
