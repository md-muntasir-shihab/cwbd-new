import mongoose, { Document, Schema } from 'mongoose';

export type HomeAnimationLevel = 'off' | 'minimal' | 'normal';
export type LockedExamVisibility = 'show_locked' | 'hide';
export type UniversityCardDensity = 'compact' | 'comfortable';
export type UniversityCardSort = 'nearest_deadline' | 'alphabetical';

export interface HomeCta {
    label: string;
    url: string;
}

export interface HomeShortcutChip {
    label: string;
    actionType: 'route' | 'search' | 'external';
    actionValue: string;
}

export interface HomeLinkItem {
    label: string;
    url: string;
}

export interface HomeAdsSection {
    enabled: boolean;
    title: string;
}

export interface HomeHighlightedCategory {
    category: string;
    order: number;
    enabled: boolean;
    badgeText?: string;
}

export interface HomeFeaturedUniversityItem {
    universityId: string;
    order: number;
    badgeText: string;
    enabled: boolean;
}

export interface UniversityCardConfig {
    defaultUniversityLogo: string;
    showExamCentersPreview: boolean;
    closingSoonDays: number;
    showAddress: boolean;
    showEmail: boolean;
    showSeats: boolean;
    showApplicationProgress: boolean;
    showExamDates: boolean;
    showExamCenters: boolean;
    cardDensity: UniversityCardDensity;
    defaultSort: UniversityCardSort;
    showProgressBar: boolean;
    showCategoryBadge: boolean;
    showClusterBadge: boolean;
    showExamCentersOnHomeCards: boolean;
}

export interface HomeSettingsShape {
    sectionVisibility: {
        hero: boolean;
        subscriptionBanner: boolean;
        stats: boolean;
        timeline: boolean;
        universityDashboard: boolean;
        closingExamWidget: boolean;
        examsWidget: boolean;
        newsPreview: boolean;
        resourcesPreview: boolean;
        socialStrip: boolean;
        adsSection: boolean;
        footer: boolean;
    };
    universityPreview: {
        enabled: boolean;
        useHighlightedCategoriesOnly: boolean;
        defaultActiveCategory: string;
        enableClusterFilter: boolean;
        maxFeaturedItems: number;
        maxDeadlineItems: number;
        maxExamItems: number;
        deadlineWithinDays: number;
        examWithinDays: number;
        featuredMode: 'manual' | 'auto';
    };
    hero: {
        pillText: string;
        title: string;
        subtitle: string;
        showSearch: boolean;
        searchPlaceholder: string;
        showNextDeadlineCard: boolean;
        primaryCTA: HomeCta;
        secondaryCTA: HomeCta;
        heroImageUrl: string;
        shortcutChips: HomeShortcutChip[];
    };
    subscriptionBanner: {
        enabled: boolean;
        title: string;
        subtitle: string;
        loginMessage: string;
        noPlanMessage: string;
        activePlanMessage: string;
        bannerImageUrl: string;
        primaryCTA: HomeCta;
        secondaryCTA: HomeCta;
        showPlanCards: boolean;
        planIdsToShow: string[];
    };
    topBanner: {
        enabled: boolean;
        imageUrl: string;
        linkUrl: string;
    };
    middleBanner: {
        enabled: boolean;
        imageUrl: string;
        linkUrl: string;
    };
    bottomBanner: {
        enabled: boolean;
        imageUrl: string;
        linkUrl: string;
    };
    adsSection: HomeAdsSection;
    stats: {
        enabled: boolean;
        title: string;
        subtitle: string;
        items: Array<{ key: string; label: string; enabled: boolean }>;
    };
    timeline: {
        enabled: boolean;
        title: string;
        subtitle: string;
        closingSoonDays: number;
        examSoonDays: number;
        maxClosingItems: number;
        maxExamItems: number;
    };
    universityDashboard: {
        enabled: boolean;
        title: string;
        subtitle: string;
        showFilters: boolean;
        defaultCategory: string;
        showAllCategories: boolean;
        showPlaceholderText: boolean;
        placeholderNote: string;
    };
    universityCardConfig: UniversityCardConfig;
    highlightedCategories: HomeHighlightedCategory[];
    featuredUniversities: HomeFeaturedUniversityItem[];
    closingExamWidget: {
        enabled: boolean;
        title: string;
        subtitle: string;
        maxClosing: number;
        maxExamsThisWeek: number;
    };
    examsWidget: {
        enabled: boolean;
        title: string;
        subtitle: string;
        maxLive: number;
        maxUpcoming: number;
        showLockedExamsToUnsubscribed: LockedExamVisibility;
        loginRequiredText: string;
        subscriptionRequiredText: string;
    };
    newsPreview: {
        enabled: boolean;
        title: string;
        subtitle: string;
        maxItems: number;
        ctaLabel: string;
        ctaUrl: string;
    };
    resourcesPreview: {
        enabled: boolean;
        title: string;
        subtitle: string;
        maxItems: number;
        ctaLabel: string;
        ctaUrl: string;
    };
    socialStrip: {
        enabled: boolean;
        title: string;
        subtitle: string;
        ctaLabel: string;
    };
    footer: {
        enabled: boolean;
        aboutText: string;
        quickLinks: HomeLinkItem[];
        contactInfo: {
            email: string;
            phone: string;
            address: string;
        };
        legalLinks: HomeLinkItem[];
        showFounderButton: boolean;
    };
    campaignBanners: {
        enabled: boolean;
        title: string;
        subtitle: string;
        autoRotateInterval: number;
    };
    ui: {
        animationLevel: HomeAnimationLevel;
    };
}

export interface IHomeSettings extends Document, HomeSettingsShape {
    createdAt: Date;
    updatedAt: Date;
}

const ctaSchema = new Schema<HomeCta>(
    {
        label: { type: String, default: '' },
        url: { type: String, default: '' },
    },
    { _id: false }
);

const shortcutChipSchema = new Schema<HomeShortcutChip>(
    {
        label: { type: String, default: '' },
        actionType: {
            type: String,
            enum: ['route', 'search', 'external'],
            default: 'route',
        },
        actionValue: { type: String, default: '' },
    },
    { _id: false }
);

const linkItemSchema = new Schema<HomeLinkItem>(
    {
        label: { type: String, default: '' },
        url: { type: String, default: '' },
    },
    { _id: false }
);

const highlightedCategorySchema = new Schema<HomeHighlightedCategory>(
    {
        category: { type: String, default: '' },
        order: { type: Number, default: 0 },
        enabled: { type: Boolean, default: true },
        badgeText: { type: String, default: '' },
    },
    { _id: false }
);

const featuredUniversitySchema = new Schema<HomeFeaturedUniversityItem>(
    {
        universityId: { type: String, default: '' },
        order: { type: Number, default: 0 },
        badgeText: { type: String, default: '' },
        enabled: { type: Boolean, default: true },
    },
    { _id: false }
);

export function createHomeSettingsDefaults(): HomeSettingsShape {
    return {
        sectionVisibility: {
            hero: true,
            subscriptionBanner: true,
            stats: true,
            timeline: true,
            universityDashboard: true,
            closingExamWidget: true,
            examsWidget: true,
            newsPreview: true,
            resourcesPreview: true,
            socialStrip: true,
            adsSection: true,
            footer: true,
        },
        universityPreview: {
            enabled: true,
            useHighlightedCategoriesOnly: true,
            defaultActiveCategory: 'Individual Admission',
            enableClusterFilter: true,
            maxFeaturedItems: 12,
            maxDeadlineItems: 6,
            maxExamItems: 6,
            deadlineWithinDays: 15,
            examWithinDays: 15,
            featuredMode: 'manual',
        },
        hero: {
            pillText: 'CampusWay',
            title: 'Bangladesh University Admission Hub',
            subtitle: 'Track admissions, online exams, resources, and live updates from one place.',
            showSearch: true,
            searchPlaceholder: 'Search universities, exams, news...',
            showNextDeadlineCard: true,
            primaryCTA: { label: 'Explore Universities', url: '/universities' },
            secondaryCTA: { label: 'View Exams', url: '/exams' },
            heroImageUrl: '',
            shortcutChips: [
                { label: 'Public Universities', actionType: 'search', actionValue: 'public' },
                { label: 'Exam Routine', actionType: 'route', actionValue: '/exams' },
                { label: 'Latest News', actionType: 'route', actionValue: '/news' },
            ],
        },
        subscriptionBanner: {
            enabled: true,
            title: 'Unlock Premium Exam Access',
            subtitle: 'Choose a plan to access live exams, smart practice, and result analytics.',
            loginMessage: 'Contact admin to subscribe and unlock online exams.',
            noPlanMessage: 'Subscription required to start online exams.',
            activePlanMessage: 'Plan Active',
            bannerImageUrl: '',
            primaryCTA: { label: 'See Plans', url: '/subscription-plans' },
            secondaryCTA: { label: 'Contact Admin', url: '/contact' },
            showPlanCards: true,
            planIdsToShow: [],
        },
        topBanner: {
            enabled: false,
            imageUrl: '',
            linkUrl: '',
        },
        middleBanner: {
            enabled: false,
            imageUrl: '',
            linkUrl: '',
        },
        bottomBanner: {
            enabled: false,
            imageUrl: '',
            linkUrl: '',
        },
        adsSection: {
            enabled: false,
            title: '',
        },
        stats: {
            enabled: true,
            title: 'Live Platform Stats',
            subtitle: 'Updated directly from the latest database records.',
            items: [
                { key: 'universities', label: 'Universities', enabled: true },
                { key: 'students', label: 'Students', enabled: true },
                { key: 'exams', label: 'Exams', enabled: true },
                { key: 'resources', label: 'Resources', enabled: true },
            ],
        },
        timeline: {
            enabled: true,
            title: "What's Happening Now",
            subtitle: 'Deadlines and exams happening soon.',
            closingSoonDays: 10,
            examSoonDays: 10,
            maxClosingItems: 6,
            maxExamItems: 6,
        },
        universityDashboard: {
            enabled: true,
            title: 'University Dashboard',
            subtitle: 'Search and filter universities with complete admission card details.',
            showFilters: true,
            defaultCategory: 'Individual Admission',
            showAllCategories: false,
            showPlaceholderText: false,
            placeholderNote: '',
        },
        universityCardConfig: {
            defaultUniversityLogo: '',
            showExamCentersPreview: true,
            closingSoonDays: 7,
            showAddress: true,
            showEmail: true,
            showSeats: true,
            showApplicationProgress: true,
            showExamDates: true,
            showExamCenters: true,
            cardDensity: 'comfortable',
            defaultSort: 'alphabetical',
            showProgressBar: true,
            showCategoryBadge: true,
            showClusterBadge: false,
            showExamCentersOnHomeCards: false,
        },
        highlightedCategories: [],
        featuredUniversities: [],
        closingExamWidget: {
            enabled: true,
            title: 'Closing Soon & Exams This Week',
            subtitle: 'Compact quick view for urgent items.',
            maxClosing: 5,
            maxExamsThisWeek: 5,
        },
        examsWidget: {
            enabled: true,
            title: 'Live & Upcoming Online Exams',
            subtitle: 'Join live exams and prepare for upcoming schedules.',
            maxLive: 4,
            maxUpcoming: 6,
            showLockedExamsToUnsubscribed: 'show_locked',
            loginRequiredText: 'Login required to access exam portal.',
            subscriptionRequiredText: 'Subscription required to start these exams.',
        },
        newsPreview: {
            enabled: true,
            title: 'Latest News',
            subtitle: 'Recent published updates from trusted sources.',
            maxItems: 4,
            ctaLabel: 'View all news',
            ctaUrl: '/news',
        },
        resourcesPreview: {
            enabled: true,
            title: 'Resources',
            subtitle: 'Featured learning materials and downloads.',
            maxItems: 4,
            ctaLabel: 'View all resources',
            ctaUrl: '/resources',
        },
        socialStrip: {
            enabled: true,
            title: 'Social & Community',
            subtitle: 'Join our communities for instant updates.',
            ctaLabel: 'Join now',
        },
        footer: {
            enabled: true,
            aboutText: 'CampusWay helps students manage admissions, exams, and preparation in one platform.',
            quickLinks: [
                { label: 'Home', url: '/' },
                { label: 'Universities', url: '/universities' },
                { label: 'Exams', url: '/exams' },
                { label: 'Resources', url: '/resources' },
                { label: 'Contact', url: '/contact' },
            ],
            contactInfo: {
                email: '',
                phone: '',
                address: '',
            },
            legalLinks: [
                { label: 'About', url: '/about' },
                { label: 'Terms', url: '/terms' },
                { label: 'Privacy', url: '/privacy' },
            ],
            showFounderButton: true,
        },
        campaignBanners: {
            enabled: true,
            title: 'Promotions & Campaigns',
            subtitle: 'Latest offers and announcements',
            autoRotateInterval: 5000,
        },
        ui: {
            animationLevel: 'normal',
        },
    };
}

const homeSettingsSchema = new Schema<IHomeSettings>(
    {
        sectionVisibility: {
            hero: { type: Boolean, default: true },
            subscriptionBanner: { type: Boolean, default: true },
            stats: { type: Boolean, default: true },
            timeline: { type: Boolean, default: true },
            universityDashboard: { type: Boolean, default: true },
            closingExamWidget: { type: Boolean, default: true },
            examsWidget: { type: Boolean, default: true },
            newsPreview: { type: Boolean, default: true },
            resourcesPreview: { type: Boolean, default: true },
            socialStrip: { type: Boolean, default: true },
            adsSection: { type: Boolean, default: true },
            footer: { type: Boolean, default: true },
        },
        universityPreview: {
            enabled: { type: Boolean, default: true },
            useHighlightedCategoriesOnly: { type: Boolean, default: true },
            defaultActiveCategory: { type: String, default: 'Individual Admission' },
            enableClusterFilter: { type: Boolean, default: true },
            maxFeaturedItems: { type: Number, default: 12, min: 1, max: 50 },
            maxDeadlineItems: { type: Number, default: 6, min: 1, max: 50 },
            maxExamItems: { type: Number, default: 6, min: 1, max: 50 },
            deadlineWithinDays: { type: Number, default: 15, min: 1, max: 60 },
            examWithinDays: { type: Number, default: 15, min: 1, max: 60 },
            featuredMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
        },
        hero: {
            pillText: { type: String, default: 'CampusWay' },
            title: { type: String, default: 'Bangladesh University Admission Hub' },
            subtitle: { type: String, default: 'Track admissions, online exams, resources, and live updates from one place.' },
            showSearch: { type: Boolean, default: true },
            searchPlaceholder: { type: String, default: 'Search universities, exams, news...' },
            showNextDeadlineCard: { type: Boolean, default: true },
            primaryCTA: { type: ctaSchema, default: () => ({ label: 'Explore Universities', url: '/universities' }) },
            secondaryCTA: { type: ctaSchema, default: () => ({ label: 'View Exams', url: '/exam-portal' }) },
            heroImageUrl: { type: String, default: '' },
            shortcutChips: { type: [shortcutChipSchema], default: () => [] },
        },
        subscriptionBanner: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Unlock Premium Exam Access' },
            subtitle: { type: String, default: 'Choose a plan to access live exams, smart practice, and result analytics.' },
            loginMessage: { type: String, default: 'Contact admin to subscribe and unlock online exams.' },
            noPlanMessage: { type: String, default: 'Subscription required to start online exams.' },
            activePlanMessage: { type: String, default: 'Plan Active' },
            bannerImageUrl: { type: String, default: '' },
            primaryCTA: { type: ctaSchema, default: () => ({ label: 'See Plans', url: '/subscription-plans' }) },
            secondaryCTA: { type: ctaSchema, default: () => ({ label: 'Contact Admin', url: '/contact' }) },
            showPlanCards: { type: Boolean, default: true },
            planIdsToShow: { type: [String], default: () => [] },
        },
        topBanner: {
            enabled: { type: Boolean, default: false },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' },
        },
        middleBanner: {
            enabled: { type: Boolean, default: false },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' },
        },
        bottomBanner: {
            enabled: { type: Boolean, default: false },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' },
        },
        adsSection: {
            enabled: { type: Boolean, default: false },
            title: { type: String, default: '' },
        },
        stats: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Live Platform Stats' },
            subtitle: { type: String, default: 'Updated directly from the latest database records.' },
            items: {
                type: [{
                    key: { type: String, default: '' },
                    label: { type: String, default: '' },
                    enabled: { type: Boolean, default: true },
                }],
                default: () => [],
            },
        },
        timeline: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: "What's Happening Now" },
            subtitle: { type: String, default: 'Deadlines and exams happening soon.' },
            closingSoonDays: { type: Number, default: 10, min: 1, max: 60 },
            examSoonDays: { type: Number, default: 10, min: 1, max: 60 },
            maxClosingItems: { type: Number, default: 6, min: 1, max: 20 },
            maxExamItems: { type: Number, default: 6, min: 1, max: 20 },
        },
        universityDashboard: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'University Dashboard' },
            subtitle: { type: String, default: 'Search and filter universities with complete admission card details.' },
            showFilters: { type: Boolean, default: true },
            defaultCategory: { type: String, default: 'Individual Admission' },
            showAllCategories: { type: Boolean, default: false },
            showPlaceholderText: { type: Boolean, default: false },
            placeholderNote: { type: String, default: '' },
        },
        universityCardConfig: {
            defaultUniversityLogo: { type: String, default: '' },
            showExamCentersPreview: { type: Boolean, default: true },
            closingSoonDays: { type: Number, default: 7, min: 1, max: 30 },
            showAddress: { type: Boolean, default: true },
            showEmail: { type: Boolean, default: true },
            showSeats: { type: Boolean, default: true },
            showApplicationProgress: { type: Boolean, default: true },
            showExamDates: { type: Boolean, default: true },
            showExamCenters: { type: Boolean, default: true },
            cardDensity: {
                type: String,
                enum: ['compact', 'comfortable'],
                default: 'comfortable',
            },
            defaultSort: {
                type: String,
                enum: ['nearest_deadline', 'alphabetical'],
                default: 'alphabetical',
            },
            showProgressBar: { type: Boolean, default: true },
            showCategoryBadge: { type: Boolean, default: true },
            showClusterBadge: { type: Boolean, default: false },
            showExamCentersOnHomeCards: { type: Boolean, default: false },
        },
        highlightedCategories: {
            type: [highlightedCategorySchema],
            default: () => [],
        },
        featuredUniversities: {
            type: [featuredUniversitySchema],
            default: () => [],
        },
        closingExamWidget: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Closing Soon & Exams This Week' },
            subtitle: { type: String, default: 'Compact quick view for urgent items.' },
            maxClosing: { type: Number, default: 5, min: 1, max: 20 },
            maxExamsThisWeek: { type: Number, default: 5, min: 1, max: 20 },
        },
        examsWidget: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Live & Upcoming Online Exams' },
            subtitle: { type: String, default: 'Join live exams and prepare for upcoming schedules.' },
            maxLive: { type: Number, default: 4, min: 1, max: 20 },
            maxUpcoming: { type: Number, default: 6, min: 1, max: 20 },
            showLockedExamsToUnsubscribed: {
                type: String,
                enum: ['show_locked', 'hide'],
                default: 'show_locked',
            },
            loginRequiredText: { type: String, default: 'Login required to access exam portal.' },
            subscriptionRequiredText: { type: String, default: 'Subscription required to start these exams.' },
        },
        newsPreview: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Latest News' },
            subtitle: { type: String, default: 'Recent published updates from trusted sources.' },
            maxItems: { type: Number, default: 4, min: 1, max: 12 },
            ctaLabel: { type: String, default: 'View all news' },
            ctaUrl: { type: String, default: '/news' },
        },
        resourcesPreview: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Resources' },
            subtitle: { type: String, default: 'Featured learning materials and downloads.' },
            maxItems: { type: Number, default: 4, min: 1, max: 12 },
            ctaLabel: { type: String, default: 'View all resources' },
            ctaUrl: { type: String, default: '/resources' },
        },
        socialStrip: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Social & Community' },
            subtitle: { type: String, default: 'Join our communities for instant updates.' },
            ctaLabel: { type: String, default: 'Join now' },
        },
        footer: {
            enabled: { type: Boolean, default: true },
            aboutText: { type: String, default: 'CampusWay helps students manage admissions, exams, and preparation in one platform.' },
            quickLinks: { type: [linkItemSchema], default: () => [] },
            contactInfo: {
                email: { type: String, default: '' },
                phone: { type: String, default: '' },
                address: { type: String, default: '' },
            },
            legalLinks: { type: [linkItemSchema], default: () => [] },
            showFounderButton: { type: Boolean, default: true },
        },
        campaignBanners: {
            enabled: { type: Boolean, default: true },
            title: { type: String, default: 'Promotions & Campaigns' },
            subtitle: { type: String, default: 'Latest offers and announcements' },
            autoRotateInterval: { type: Number, default: 5000, min: 2000, max: 15000 },
        },
        ui: {
            animationLevel: {
                type: String,
                enum: ['off', 'minimal', 'normal'],
                default: 'normal',
            },
        },
    },
    {
        timestamps: true,
        collection: 'home_settings',
    }
);

export default mongoose.model<IHomeSettings>('HomeSettings', homeSettingsSchema);
