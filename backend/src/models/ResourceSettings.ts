import mongoose, { Document, Schema } from 'mongoose';

export const RESOURCE_ALLOWED_TYPES = ['pdf', 'link', 'video', 'audio', 'image', 'note'] as const;
export const RESOURCE_DEFAULT_ALLOWED_CATEGORIES = [
    'Question Banks',
    'Study Materials',
    'Official Links',
    'Tips & Tricks',
    'Scholarships',
    'Admit Cards',
] as const;

export const RESOURCE_SETTINGS_DEFAULTS = {
    pageTitle: 'Student Resources',
    pageSubtitle: 'Access PDFs, question banks, video tutorials, links, and notes in one searchable library.',
    heroBadgeLabel: 'Study Smart',
    searchPlaceholder: 'Search resources, question banks, and notes...',
    defaultThumbnailUrl: '',
    publicPageEnabled: true,
    studentHubEnabled: true,
    showHero: true,
    showStats: true,
    showFeatured: true,
    featuredLimit: 4,
    defaultSort: 'latest',
    defaultType: 'all',
    defaultCategory: 'All',
    itemsPerPage: 12,
    showSearch: true,
    showTypeFilter: true,
    showCategoryFilter: true,
    trackingEnabled: true,
    allowUserUploads: false,
    requireAdminApproval: true,
    maxFileSizeMB: 50,
    allowedCategories: [...RESOURCE_DEFAULT_ALLOWED_CATEGORIES],
    allowedTypes: [...RESOURCE_ALLOWED_TYPES],
    openLinksInNewTab: true,
    featuredSectionTitle: 'Featured Resources',
    emptyStateMessage: 'No resources found. Try adjusting your filters or search query.',
} as const;

export type ResourceSettingsSort = 'latest' | 'downloads' | 'views';
export type ResourceSettingsDefaultType = 'all' | (typeof RESOURCE_ALLOWED_TYPES)[number];

export interface IResourceSettings extends Document {
    pageTitle: string;
    pageSubtitle: string;
    heroBadgeLabel: string;
    searchPlaceholder: string;
    defaultThumbnailUrl: string;
    publicPageEnabled: boolean;
    studentHubEnabled: boolean;
    showHero: boolean;
    showStats: boolean;
    showFeatured: boolean;
    featuredLimit: number;
    defaultSort: ResourceSettingsSort;
    defaultType: ResourceSettingsDefaultType;
    defaultCategory: string;
    itemsPerPage: number;
    showSearch: boolean;
    showTypeFilter: boolean;
    showCategoryFilter: boolean;
    trackingEnabled: boolean;
    allowUserUploads: boolean;
    requireAdminApproval: boolean;
    maxFileSizeMB: number;
    allowedCategories: string[];
    allowedTypes: string[];
    openLinksInNewTab: boolean;
    featuredSectionTitle: string;
    emptyStateMessage: string;
    createdAt: Date;
    updatedAt: Date;
}

const ResourceSettingsSchema = new Schema<IResourceSettings>({
    pageTitle: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.pageTitle },
    pageSubtitle: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.pageSubtitle },
    heroBadgeLabel: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.heroBadgeLabel },
    searchPlaceholder: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.searchPlaceholder },
    defaultThumbnailUrl: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.defaultThumbnailUrl },
    publicPageEnabled: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.publicPageEnabled },
    studentHubEnabled: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.studentHubEnabled },
    showHero: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showHero },
    showStats: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showStats },
    showFeatured: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showFeatured },
    featuredLimit: { type: Number, default: RESOURCE_SETTINGS_DEFAULTS.featuredLimit, min: 0, max: 24 },
    defaultSort: {
        type: String,
        enum: ['latest', 'downloads', 'views'],
        default: RESOURCE_SETTINGS_DEFAULTS.defaultSort,
    },
    defaultType: {
        type: String,
        enum: ['all', ...RESOURCE_ALLOWED_TYPES],
        default: RESOURCE_SETTINGS_DEFAULTS.defaultType,
    },
    defaultCategory: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.defaultCategory, trim: true },
    itemsPerPage: { type: Number, default: RESOURCE_SETTINGS_DEFAULTS.itemsPerPage, min: 4, max: 48 },
    showSearch: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showSearch },
    showTypeFilter: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showTypeFilter },
    showCategoryFilter: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.showCategoryFilter },
    trackingEnabled: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.trackingEnabled },
    allowUserUploads: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.allowUserUploads },
    requireAdminApproval: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.requireAdminApproval },
    maxFileSizeMB: { type: Number, default: RESOURCE_SETTINGS_DEFAULTS.maxFileSizeMB, min: 1, max: 500 },
    allowedCategories: { type: [String], default: [...RESOURCE_SETTINGS_DEFAULTS.allowedCategories] },
    allowedTypes: { type: [String], default: [...RESOURCE_SETTINGS_DEFAULTS.allowedTypes] },
    openLinksInNewTab: { type: Boolean, default: RESOURCE_SETTINGS_DEFAULTS.openLinksInNewTab },
    featuredSectionTitle: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.featuredSectionTitle },
    emptyStateMessage: { type: String, default: RESOURCE_SETTINGS_DEFAULTS.emptyStateMessage },
}, { timestamps: true });

export default mongoose.model<IResourceSettings>('ResourceSettings', ResourceSettingsSchema);
