import { Request, Response } from 'express';
import HomeConfig from '../models/HomeConfig';
import { broadcastHomeStreamEvent } from '../realtime/homeStream';

type HomeSectionRecord = {
    id: string;
    title: string;
    isActive: boolean;
    order: number;
    config?: Record<string, unknown>;
};

// Default layout if none exists
const DEFAULT_SECTIONS: HomeSectionRecord[] = [
    { id: 'search', title: 'Search Bar', isActive: true, order: 0 },
    { id: 'hero', title: 'Hero Banner', isActive: true, order: 1 },
    { id: 'subscription_banner', title: 'Subscription Preview', isActive: true, order: 2 },
    { id: 'campaign_banners', title: 'Campaign Banners', isActive: true, order: 3 },
    { id: 'featured', title: 'Featured Universities', isActive: true, order: 4 },
    { id: 'category_filter', title: 'Category & Cluster Filter', isActive: true, order: 5 },
    { id: 'deadlines', title: 'Admission Deadlines', isActive: true, order: 6 },
    { id: 'upcoming_exams', title: 'Upcoming Exams', isActive: true, order: 7 },
    { id: 'online_exam_preview', title: 'Online Exam Preview', isActive: true, order: 8 },
    { id: 'news', title: 'Latest News', isActive: true, order: 9 },
    { id: 'resources', title: 'Resources Preview', isActive: true, order: 10 },
    { id: 'content_blocks', title: 'Global CTA / Content Block', isActive: true, order: 11 },
    { id: 'stats', title: 'Quick Stats', isActive: true, order: 12 },
    { id: 'home_hero', title: 'Home Hero CMS Block', isActive: true, order: 13 },
    { id: 'home_features', title: 'Home Features CMS Block', isActive: true, order: 14 },
    { id: 'home_testimonials', title: 'Home Testimonials CMS Block', isActive: true, order: 15 },
    { id: 'home_cta', title: 'Home CTA CMS Block', isActive: true, order: 16 },
];

const SECTION_ID_ALIAS_MAP: Record<string, string> = {
    search: 'search',
    searchbar: 'search',
    hero: 'hero',
    herobanner: 'hero',
    subscriptionbanner: 'subscription_banner',
    subscriptionplans: 'subscription_banner',
    planspreview: 'subscription_banner',
    campaignbanners: 'campaign_banners',
    campaignbanner: 'campaign_banners',
    featured: 'featured',
    featureduniversities: 'featured',
    featureduniversity: 'featured',
    categoryfilter: 'category_filter',
    categoryclusterfilter: 'category_filter',
    categoryandclusterfilter: 'category_filter',
    deadlines: 'deadlines',
    admissiondeadlines: 'deadlines',
    applicationdeadlines: 'deadlines',
    upcomingexams: 'upcoming_exams',
    upcomingexam: 'upcoming_exams',
    onlineexampreview: 'online_exam_preview',
    onlineexamspreview: 'online_exam_preview',
    onlineexam: 'online_exam_preview',
    news: 'news',
    latestnews: 'news',
    newspreview: 'news',
    resources: 'resources',
    resource: 'resources',
    resourcespreview: 'resources',
    resourcepreview: 'resources',
    contentblocks: 'content_blocks',
    contentblock: 'content_blocks',
    globalcta: 'content_blocks',
    globalcontentblock: 'content_blocks',
    globalctacontentblock: 'content_blocks',
    stats: 'stats',
    quickstats: 'stats',
    home_hero: 'home_hero',
    homehero: 'home_hero',
    homeherocmsblock: 'home_hero',
    home_features: 'home_features',
    homefeatures: 'home_features',
    homefeaturescmsblock: 'home_features',
    home_testimonials: 'home_testimonials',
    hometestimonials: 'home_testimonials',
    hometestimonialscmsblock: 'home_testimonials',
    home_cta: 'home_cta',
    homecta: 'home_cta',
    homectacmsblock: 'home_cta',
};

function normalizeSectionId(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.toLowerCase();
    if (SECTION_ID_ALIAS_MAP[direct]) return SECTION_ID_ALIAS_MAP[direct];
    const collapsed = direct.replace(/[^a-z0-9]+/g, '');
    return SECTION_ID_ALIAS_MAP[collapsed] || direct.replace(/[^a-z0-9]+/g, '_');
}

function normalizeHomeSections(input: unknown): HomeSectionRecord[] {
    const defaultsById = new Map(DEFAULT_SECTIONS.map((item) => [item.id, item]));
    const incoming = Array.isArray(input) ? input : [];
    const normalizedIncoming: HomeSectionRecord[] = [];

    incoming.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const row = entry as Record<string, unknown>;
        const id = normalizeSectionId(row.id);
        if (!id) return;
        const fallback = defaultsById.get(id);
        const orderRaw = Number(row.order);
        const isActiveRaw = row.isActive;
        normalizedIncoming.push({
            id,
            title: String(row.title || fallback?.title || id),
            isActive: isActiveRaw === undefined ? (fallback?.isActive ?? true) : Boolean(isActiveRaw),
            order: Number.isFinite(orderRaw) ? orderRaw : (fallback?.order ?? index),
            config: row.config && typeof row.config === 'object' ? (row.config as Record<string, unknown>) : {},
        });
    });

    const byId = new Map<string, HomeSectionRecord>();
    normalizedIncoming.forEach((item) => byId.set(item.id, item));

    const mergedDefaults = DEFAULT_SECTIONS.map((fallback) => {
        const stored = byId.get(fallback.id);
        if (!stored) return { ...fallback };
        return {
            ...fallback,
            ...stored,
            id: fallback.id,
            title: String(stored.title || fallback.title),
            isActive: stored.isActive !== false,
            order: Number.isFinite(Number(stored.order)) ? Number(stored.order) : fallback.order,
        };
    });

    const knownIds = new Set(DEFAULT_SECTIONS.map((item) => item.id));
    const extraSections = normalizedIncoming
        .filter((item) => !knownIds.has(item.id))
        .map((item, index) => ({
            ...item,
            order: Number.isFinite(Number(item.order)) ? Number(item.order) : DEFAULT_SECTIONS.length + index,
        }));

    return [...mergedDefaults, ...extraSections];
}

export const getHomeConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        let config = await HomeConfig.findOne();
        if (!config) {
            config = new HomeConfig({ sections: DEFAULT_SECTIONS, selectedUniversityCategories: [], highlightCategoryIds: [] });
            await config.save();
        } else {
            config.set('sections', normalizeHomeSections(config.sections));
            await config.save();
        }
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching home config', error: error.message });
    }
};

export const updateHomeConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sections, activeTheme, selectedUniversityCategories, highlightCategoryIds } = req.body;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = (req as any).user;

        let config = await HomeConfig.findOne();
        if (!config) {
            config = new HomeConfig({ sections: DEFAULT_SECTIONS, selectedUniversityCategories: [], highlightCategoryIds: [] });
        }

        if (sections) config.set('sections', normalizeHomeSections(sections));
        else config.set('sections', normalizeHomeSections(config.sections));
        if (activeTheme) config.activeTheme = activeTheme;
        if (Array.isArray(selectedUniversityCategories)) {
            config.selectedUniversityCategories = selectedUniversityCategories
                .map((item: unknown) => String(item || '').trim())
                .filter(Boolean);
        }
        if (Array.isArray(highlightCategoryIds)) {
            config.highlightCategoryIds = highlightCategoryIds
                .map((item: unknown) => String(item || '').trim())
                .filter(Boolean);
        }
        if (user) config.updatedBy = user._id;

        await config.save();
        broadcastHomeStreamEvent({
            type: 'category-updated',
            meta: { action: 'home-config' },
        });
        res.json({ message: 'Home config updated successfully', config });
    } catch (error: any) {
        res.status(500).json({ message: 'Error updating home config', error: error.message });
    }
};
