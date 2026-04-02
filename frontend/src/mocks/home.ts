import type {
    ApiNews,
    ApiUniversityCardPreview,
    HomeApiResponse,
} from '../services/api';

const nowIso = new Date().toISOString();

const universities: ApiUniversityCardPreview[] = [
    {
        id: 'u1',
        name: 'Dhaka University',
        shortForm: 'DU',
        category: 'Individual Admission',
        clusterGroup: '',
        contactNumber: '',
        established: 1921,
        address: 'Dhaka',
        email: '',
        website: '',
        admissionWebsite: '',
        totalSeats: '1000',
        scienceSeats: '400',
        artsSeats: '300',
        businessSeats: '300',
        applicationStartDate: nowIso,
        applicationEndDate: nowIso,
        applicationStart: nowIso,
        applicationEnd: nowIso,
        scienceExamDate: nowIso,
        artsExamDate: nowIso,
        businessExamDate: nowIso,
        examDateScience: nowIso,
        examDateArts: nowIso,
        examDateBusiness: nowIso,
        examCentersPreview: [],
        shortDescription: 'Top public university',
        logoUrl: '',
        slug: 'dhaka-university',
    },
];

const newsItems: ApiNews[] = [
    {
        _id: 'n1',
        title: 'CampusWay Mock News',
        slug: 'campusway-mock-news',
        shortDescription: 'Mock news summary',
        content: 'Mock content',
        category: 'General',
        tags: [],
        isPublished: true,
        publishDate: nowIso,
        status: 'published',
        isFeatured: true,
        publishedAt: nowIso,
        views: 0,
    },
];

const resources = [
    {
        _id: 'r1',
        title: 'Mock Resource',
        description: 'Sample resource item',
        fileType: 'note',
        resourceCategory: 'General',
        createdAt: nowIso,
        updatedAt: nowIso,
    },
];

export function mockHomeResponse(): HomeApiResponse {
    const response = {
        homeSettings: {
            sectionVisibility: {},
            hero: {
                title: 'CampusWay',
                subtitle: 'Plan. Explore. Achieve.',
                pillText: 'Mock Mode',
                showSearch: true,
                searchPlaceholder: 'Search',
                primaryCTA: { label: 'Universities', url: '/universities' },
                secondaryCTA: { label: 'Plans', url: '/subscription-plans' },
            },
            ui: { animationLevel: 'minimal' },
        },
        globalSettings: {
            websiteName: 'CampusWay',
            logoUrl: '',
            motto: 'Plan. Explore. Achieve.',
            contactEmail: 'support@campusway.local',
            contactPhone: '',
            theme: {},
            socialLinks: {},
        },
        subscriptionPlans: [],
        subscriptionBannerState: {
            loggedIn: false,
            hasActivePlan: false,
            expiry: null,
            reason: 'mock',
        },
        stats: {
            values: { students: 1200, universities: 50 },
            items: [
                { key: 'students', label: 'Students', enabled: true, value: 1200 },
                { key: 'universities', label: 'Universities', enabled: true, value: 50 },
            ],
        },
        timeline: {
            serverNow: nowIso,
            closingSoonItems: [],
            examSoonItems: [],
        },
        universityCategories: [
            { categoryName: 'Individual Admission', count: 1, clusterGroups: [] },
        ],
        featuredUniversities: universities,
        deadlineUniversities: universities,
        upcomingExamUniversities: universities,
        featuredCategories: [],
        featuredClusters: [],
        deadlineCategories: [],
        deadlineClusters: [],
        upcomingExamCategories: [],
        upcomingExamClusters: [],
        uniSettings: {
            enableClusterFilterOnHome: false,
            defaultCategory: '',
        },
        universityDashboardData: {
            categories: [{ key: 'Individual Admission', label: 'Individual Admission', count: 1 }],
            filtersMeta: {
                totalItems: 1,
                statuses: [],
                defaultCategory: '',
                showFilters: true,
            },
            highlightedCategories: [],
            featuredItems: universities,
            itemsPreview: universities,
        },
        examsWidget: { liveNow: [], upcoming: [] },
        onlineExamsPreview: {
            loggedIn: false,
            hasActivePlan: false,
            liveNow: [],
            upcoming: [],
            items: [],
        },
        featuredNews: newsItems,
        featuredNewsItems: newsItems,
        newsPreview: newsItems,
        newsPreviewItems: newsItems,
        resourcesPreview: resources,
        resourcePreviewItems: resources,
        sectionOrder: [],
        campaignBannersActive: [],
        contentBlocksForHome: [],
    };
    return response as unknown as HomeApiResponse;
}
