import mongoose, { Schema, Document } from 'mongoose';

export interface INews extends Document {
    title: string;
    slug: string;
    displayType?: 'news' | 'update';
    shortSummary?: string;
    shortDescription?: string;
    fullContent?: string;
    content: string;
    coverImageUrl?: string;
    coverImageSource?: 'rss' | 'admin' | 'default';
    featuredImage?: string;
    coverImage?: string;
    category: string;
    tags: string[];
    publicTags?: string[];
    isPublished: boolean;
    status:
    | 'published'
    | 'draft'
    | 'archived'
    | 'trash'
    | 'pending_review'
    | 'duplicate_review'
    | 'approved'
    | 'rejected'
    | 'scheduled'
    | 'fetch_failed';
    sourceType?: 'manual' | 'rss' | 'ai_assisted';
    sourceId?: mongoose.Types.ObjectId;
    sourceName?: string;
    sourceIconUrl?: string;
    sourceUrl?: string;
    originalArticleUrl?: string;
    originalLink?: string;
    rssGuid?: string;
    rssPublishedAt?: Date;
    rssRawTitle?: string;
    rssRawDescription?: string;
    rssRawContent?: string;
    fetchedFullText?: boolean;
    fetchedFullTextAt?: Date;
    thumbnailImage?: string;
    fallbackBanner?: string;
    aiUsed?: boolean;
    aiSelected?: boolean;
    aiModel?: string;
    aiPromptVersion?: string;
    aiLanguage?: string;
    aiGeneratedAt?: Date;
    aiNotes?: string;
    aiMeta?: {
        provider?: string;
        model?: string;
        promptVersion?: string;
        confidence?: number;
        citations?: string[];
        noHallucinationPassed?: boolean;
        warning?: string;
    };
    aiEnrichment?: {
        shortSummary?: string;
        detailedExplanation?: string;
        studentFriendlyExplanation?: string;
        keyPoints?: string[];
        suggestedCategory?: string;
        suggestedTags?: string[];
        importanceHint?: 'low' | 'normal' | 'high' | 'urgent';
        suggestedAudience?: string;
        smsText?: string;
        emailSubject?: string;
        emailBody?: string;
        importantDates?: string[];
        confidence?: number;
        citations?: string[];
        provider?: string;
        model?: string;
        warning?: string;
    };
    reviewMeta?: {
        reviewerId?: mongoose.Types.ObjectId;
        reviewedAt?: Date;
        rejectReason?: string;
    };
    deletedAt?: Date;
    deletedBy?: mongoose.Types.ObjectId;
    deletedFromStatus?: string;
    purgeAt?: Date;
    archivedAt?: Date;
    archivedBy?: mongoose.Types.ObjectId;
    archivedFromStatus?: string;
    classification?: {
        primaryCategory?: string;
        tags?: string[];
        universityIds?: mongoose.Types.ObjectId[];
        clusterIds?: mongoose.Types.ObjectId[];
        groupIds?: mongoose.Types.ObjectId[];
    };
    priority?: 'normal' | 'priority' | 'breaking';
    isManual?: boolean;
    scheduledAt?: Date;
    scheduleAt?: Date;
    publishedAt?: Date;
    dedupe?: {
        hash?: string;
        duplicateScore?: number;
        duplicateOfNewsId?: mongoose.Types.ObjectId;
        duplicateFlag?: boolean;
    };
    duplicateKeyHash?: string;
    duplicateOfNewsId?: mongoose.Types.ObjectId;
    duplicateReasons?: string[];
    createdByAdminId?: mongoose.Types.ObjectId;
    approvedByAdminId?: mongoose.Types.ObjectId;
    shareMeta?: {
        canonicalUrl?: string;
        shortUrl?: string;
        templateId?: string;
    };
    publishOutcome?: {
        type?: 'news' | 'notice' | 'update';
        targetId?: string;
        publishedAt?: Date;
        publishedBy?: mongoose.Types.ObjectId;
    };
    deliveryMeta?: {
        lastJobId?: mongoose.Types.ObjectId;
        lastChannel?: 'sms' | 'email' | 'both';
        lastAudienceSummary?: string;
        lastSentAt?: Date;
    };
    appearanceOverrides?: {
        layoutMode?: 'rss_reader' | 'grid' | 'list';
        showSourceIcons?: boolean;
        showShareButtons?: boolean;
        animationLevel?: 'none' | 'subtle' | 'rich';
        cardDensity?: 'compact' | 'comfortable';
    };
    auditVersion?: number;
    isFeatured: boolean;
    publishDate: Date;
    createdBy?: mongoose.Types.ObjectId;
    seoTitle?: string;
    seoDescription?: string;
    views: number;
    shareCount?: number;
    isEdited?: boolean;
    editedAt?: Date;
    createdAt: Date;
    updatedAt: Date;

    /* ── Open Graph metadata for social sharing ── */
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
}

const NewsSchema = new Schema<INews>({
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    displayType: { type: String, enum: ['news', 'update'], default: 'news' },
    shortSummary: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    fullContent: { type: String, default: '' },
    content: { type: String, required: true },
    coverImageUrl: { type: String, default: '' },
    coverImageSource: { type: String, enum: ['rss', 'admin', 'default'], default: 'default' },
    featuredImage: { type: String },
    coverImage: { type: String },
    category: { type: String, required: true },
    tags: [{ type: String }],
    publicTags: [{ type: String }],
    isPublished: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['published', 'draft', 'archived', 'trash', 'pending_review', 'duplicate_review', 'approved', 'rejected', 'scheduled', 'fetch_failed'],
        default: 'draft'
    },
    sourceType: {
        type: String,
        enum: ['manual', 'rss', 'ai_assisted'],
        default: 'manual',
    },
    sourceId: { type: Schema.Types.ObjectId, ref: 'NewsSource' },
    sourceName: { type: String, default: '' },
    sourceIconUrl: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
    originalArticleUrl: { type: String, default: '' },
    originalLink: { type: String, default: '' },
    rssGuid: { type: String, default: '' },
    rssPublishedAt: { type: Date },
    rssRawTitle: { type: String, default: '' },
    rssRawDescription: { type: String, default: '' },
    rssRawContent: { type: String, default: '' },
    fetchedFullText: { type: Boolean, default: false },
    fetchedFullTextAt: { type: Date },
    thumbnailImage: { type: String, default: '' },
    fallbackBanner: { type: String, default: '' },
    aiUsed: { type: Boolean, default: false },
    aiSelected: { type: Boolean, default: false },
    aiModel: { type: String, default: '' },
    aiPromptVersion: { type: String, default: '' },
    aiLanguage: { type: String, default: '' },
    aiGeneratedAt: { type: Date },
    aiNotes: { type: String, default: '' },
    aiMeta: {
        provider: { type: String, default: '' },
        model: { type: String, default: '' },
        promptVersion: { type: String, default: '' },
        confidence: { type: Number, default: 0 },
        citations: [{ type: String }],
        noHallucinationPassed: { type: Boolean, default: false },
        warning: { type: String, default: '' },
    },
    aiEnrichment: {
        shortSummary: { type: String, default: '' },
        detailedExplanation: { type: String, default: '' },
        studentFriendlyExplanation: { type: String, default: '' },
        keyPoints: [{ type: String }],
        suggestedCategory: { type: String, default: '' },
        suggestedTags: [{ type: String }],
        importanceHint: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
        suggestedAudience: { type: String, default: '' },
        smsText: { type: String, default: '' },
        emailSubject: { type: String, default: '' },
        emailBody: { type: String, default: '' },
        importantDates: [{ type: String }],
        confidence: { type: Number, default: 0 },
        citations: [{ type: String }],
        provider: { type: String, default: '' },
        model: { type: String, default: '' },
        warning: { type: String, default: '' },
    },
    reviewMeta: {
        reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        rejectReason: { type: String, default: '' },
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedFromStatus: { type: String, default: '' },
    purgeAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedFromStatus: { type: String, default: '' },
    classification: {
        primaryCategory: { type: String, default: '' },
        tags: [{ type: String }],
        universityIds: [{ type: Schema.Types.ObjectId }],
        clusterIds: [{ type: Schema.Types.ObjectId }],
        groupIds: [{ type: Schema.Types.ObjectId }],
    },
    priority: { type: String, enum: ['normal', 'priority', 'breaking'], default: 'normal' },
    isManual: { type: Boolean, default: true },
    scheduledAt: { type: Date },
    scheduleAt: { type: Date },
    publishedAt: { type: Date },
    dedupe: {
        hash: { type: String, default: '' },
        duplicateScore: { type: Number, default: 0 },
        duplicateOfNewsId: { type: Schema.Types.ObjectId, ref: 'News' },
        duplicateFlag: { type: Boolean, default: false },
    },
    duplicateKeyHash: { type: String, default: '' },
    duplicateOfNewsId: { type: Schema.Types.ObjectId, ref: 'News' },
    duplicateReasons: [{ type: String }],
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    shareMeta: {
        canonicalUrl: { type: String, default: '' },
        shortUrl: { type: String, default: '' },
        templateId: { type: String, default: '' },
    },
    publishOutcome: {
        type: { type: String, enum: ['news', 'notice', 'update'], default: 'news' },
        targetId: { type: String, default: '' },
        publishedAt: { type: Date, default: null },
        publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    deliveryMeta: {
        lastJobId: { type: Schema.Types.ObjectId, ref: 'NotificationJob' },
        lastChannel: { type: String, enum: ['sms', 'email', 'both'], default: undefined },
        lastAudienceSummary: { type: String, default: '' },
        lastSentAt: { type: Date, default: null },
    },
    appearanceOverrides: {
        layoutMode: { type: String, enum: ['rss_reader', 'grid', 'list'], default: undefined },
        showSourceIcons: { type: Boolean, default: undefined },
        showShareButtons: { type: Boolean, default: undefined },
        animationLevel: { type: String, enum: ['none', 'subtle', 'rich'], default: undefined },
        cardDensity: { type: String, enum: ['compact', 'comfortable'], default: undefined },
    },
    auditVersion: { type: Number, default: 1 },
    isFeatured: { type: Boolean, default: false },
    publishDate: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    views: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },

    /* ── Open Graph metadata for social sharing ── */
    ogTitle: { type: String, default: '' },
    ogDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
}, { timestamps: true });

NewsSchema.index({ publishDate: -1 });
NewsSchema.index({ category: 1, isPublished: 1 });
NewsSchema.index({ status: 1, publishDate: -1, category: 1 });
NewsSchema.index({ sourceId: 1, createdAt: -1 });
NewsSchema.index({ 'dedupe.hash': 1 });
NewsSchema.index({ duplicateKeyHash: 1 });
NewsSchema.index({ duplicateOfNewsId: 1 });
NewsSchema.index({ tags: 1, publishDate: -1 });
NewsSchema.index({ rssGuid: 1 });
NewsSchema.index({ aiSelected: 1, status: 1, createdAt: -1 });
NewsSchema.index({ isFeatured: 1, priority: 1, publishDate: -1 });
NewsSchema.index({ 'classification.primaryCategory': 1, status: 1, publishDate: -1 });
NewsSchema.index({ 'deliveryMeta.lastJobId': 1 });

NewsSchema.pre('validate', function syncSpecCompat(next) {
    const doc = this as INews;
    doc.displayType = doc.displayType === 'update' ? 'update' : 'news';
    const summary = String(doc.shortSummary || doc.shortDescription || '').trim();
    doc.shortSummary = summary;
    doc.shortDescription = summary || String(doc.shortDescription || '').trim();

    const richContent = String(doc.fullContent || doc.content || '').trim();
    doc.fullContent = richContent;
    doc.content = richContent || String(doc.content || '').trim();

    const coverUrl = String(doc.coverImageUrl || doc.coverImage || doc.featuredImage || '').trim();
    doc.coverImageUrl = coverUrl;
    doc.coverImage = coverUrl;

    const original = String(doc.originalArticleUrl || doc.originalLink || '').trim();
    doc.originalArticleUrl = original;
    doc.originalLink = original;

    if (doc.scheduledAt && !doc.scheduleAt) doc.scheduleAt = doc.scheduledAt;
    if (doc.scheduleAt && !doc.scheduledAt) doc.scheduledAt = doc.scheduleAt;

    if (doc.aiMeta?.model && !doc.aiModel) doc.aiModel = String(doc.aiMeta.model);
    if (doc.aiMeta?.promptVersion && !doc.aiPromptVersion) doc.aiPromptVersion = String(doc.aiMeta.promptVersion);
    if (doc.aiMeta?.provider && !doc.aiUsed) doc.aiUsed = true;
    if (!doc.aiEnrichment) {
        doc.aiEnrichment = {};
    }
    if (!doc.aiEnrichment.shortSummary) {
        doc.aiEnrichment.shortSummary = summary;
    }
    if (!doc.aiEnrichment.suggestedCategory) {
        doc.aiEnrichment.suggestedCategory = String(doc.category || '').trim();
    }
    if (!Array.isArray(doc.aiEnrichment.suggestedTags)) {
        doc.aiEnrichment.suggestedTags = Array.isArray(doc.tags) ? [...doc.tags] : [];
    }
    {
        const importanceHint = String(doc.aiEnrichment.importanceHint || '').trim().toLowerCase();
        doc.aiEnrichment.importanceHint =
            importanceHint === 'low' || importanceHint === 'high' || importanceHint === 'urgent'
                ? importanceHint as 'low' | 'high' | 'urgent'
                : 'normal';
    }
    if (!doc.classification) {
        doc.classification = {};
    }
    doc.classification.primaryCategory = String(doc.classification.primaryCategory || doc.category || '').trim();
    if (!Array.isArray(doc.classification.tags) || doc.classification.tags.length === 0) {
        doc.classification.tags = Array.isArray(doc.tags) ? [...doc.tags] : [];
    }
    if (!Array.isArray(doc.publicTags)) {
        doc.publicTags = doc.sourceType === 'manual' ? [...(Array.isArray(doc.tags) ? doc.tags : [])] : [];
    }
    doc.priority = doc.priority === 'breaking' || doc.priority === 'priority' ? doc.priority : 'normal';
    if (!doc.publishOutcome) {
        doc.publishOutcome = {};
    }
    if (!doc.publishOutcome.type) {
        doc.publishOutcome.type = doc.displayType === 'update' ? 'update' : 'news';
    }

    if (doc.sourceType === 'manual') {
        doc.isManual = true;
        if (!doc.coverImageSource) doc.coverImageSource = 'admin';
        if (doc.aiSelected === undefined || doc.aiSelected === null) {
            doc.aiSelected = false;
        }
    } else if (!doc.coverImageSource) {
        doc.coverImageSource = doc.coverImageUrl ? 'rss' : 'default';
        doc.isManual = false;
    }

    if (doc.sourceType === 'ai_assisted' && (doc.aiSelected === undefined || doc.aiSelected === null)) {
        doc.aiSelected = true;
    }

    if (!Array.isArray(doc.tags)) doc.tags = [];

    const duplicateKeyHash = String(doc.duplicateKeyHash || doc.dedupe?.hash || '').trim();
    doc.duplicateKeyHash = duplicateKeyHash;
    if (duplicateKeyHash && doc.dedupe) {
        doc.dedupe.hash = duplicateKeyHash;
    } else if (doc.dedupe?.hash && !duplicateKeyHash) {
        doc.duplicateKeyHash = String(doc.dedupe.hash).trim();
    }

    if (doc.duplicateOfNewsId && doc.dedupe) {
        doc.dedupe.duplicateOfNewsId = doc.duplicateOfNewsId;
        doc.dedupe.duplicateFlag = true;
    } else if (doc.dedupe?.duplicateOfNewsId && !doc.duplicateOfNewsId) {
        doc.duplicateOfNewsId = doc.dedupe.duplicateOfNewsId;
    }

    if (!Array.isArray(doc.duplicateReasons)) {
        doc.duplicateReasons = [];
    }
    next();
});

export default mongoose.model<INews>('News', NewsSchema);
