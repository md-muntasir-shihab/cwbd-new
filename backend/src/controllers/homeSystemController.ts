import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import WebsiteSettings, { normalizeWebsiteStaticPages } from '../models/WebsiteSettings';
import HomePage from '../models/HomePage';
import User from '../models/User';
import Exam from '../models/Exam';
import University from '../models/University';
import UniversityCluster from '../models/UniversityCluster';
import ExamResult from '../models/ExamResult';
import News from '../models/News';
import Service from '../models/Service';
import HomeConfig from '../models/HomeConfig';
import Banner from '../models/Banner';
import SiteSettings from '../models/Settings';
import { addHomeStreamClient, broadcastHomeStreamEvent } from '../realtime/homeStream';
import { getAggregatedHomeData as getStrictAggregatedHomeData } from './homeAggregateController';
import { PUBLIC_BRAND_ASSETS, resolveStoredBrandAsset } from '../utils/brandAssets';

const DEFAULT_SOCIAL_LINKS = {
    facebook: '',
    whatsapp: '',
    messenger: '',
    telegram: '',
    twitter: '',
    youtube: '',
    instagram: '',
};

const DEFAULT_THEME_SETTINGS = {
    modeDefault: 'system',
    allowSystemMode: true,
    switchVariant: 'pro',
    animationLevel: 'subtle',
    brandGradients: [
        'linear-gradient(135deg,#0D5FDB 0%,#0EA5E9 55%,#22D3EE 100%)',
        'linear-gradient(135deg,#0891B2 0%,#2563EB 100%)',
    ],
};

const DEFAULT_SOCIAL_UI = {
    clusterEnabled: true,
    buttonVariant: 'squircle',
    showLabels: false,
    platformOrder: ['facebook', 'whatsapp', 'messenger', 'telegram', 'twitter', 'youtube', 'instagram'],
};

const DEFAULT_PRICING_UI = {
    currencyCode: 'BDT',
    currencySymbol: '\\u09F3',
    currencyLocale: 'bn-BD',
    displayMode: 'symbol',
    thousandSeparator: true,
};

const CANONICAL_BRAND_ASSETS = PUBLIC_BRAND_ASSETS;

const LEGACY_BRAND_PATHS = new Set(['', PUBLIC_BRAND_ASSETS.logo, PUBLIC_BRAND_ASSETS.favicon]);
const BRAND_UPLOAD_PATTERN = /^(logo|favicon|icon)[-_].+/i;

function getLocalUploadAsset(value: unknown): string | null {
    const normalized = String(value || '').trim();
    return normalized.startsWith('/uploads/') ? normalized : null;
}

async function resolveBrandSettingsAssets(settings: { logo?: unknown; favicon?: unknown }) {
    const [logo, favicon] = await Promise.all([
        resolveStoredBrandAsset(settings.logo, 'logo'),
        resolveStoredBrandAsset(settings.favicon, 'favicon'),
    ]);

    return { logo, favicon };
}

async function cleanupBrandLikeUploads(activeAssets: Array<string | null | undefined>) {
    const uploadDir = path.resolve(__dirname, '../../public/uploads');
    const activeFileNames = new Set(
        activeAssets
            .map((asset) => getLocalUploadAsset(asset))
            .filter((asset): asset is string => Boolean(asset))
            .map((asset) => path.basename(asset))
    );

    try {
        const files = await fs.readdir(uploadDir);
        const deletions = files
            .filter((fileName) => BRAND_UPLOAD_PATTERN.test(fileName) && !activeFileNames.has(fileName))
            .map(async (fileName) => {
                try {
                    await fs.unlink(path.join(uploadDir, fileName));
                } catch {
                    // Ignore individual cleanup failures so settings save does not fail.
                }
            });
        await Promise.all(deletions);
    } catch {
        // Ignore cleanup failures; settings persistence remains the primary concern.
    }
}

// Helper to ensure configs exist
const ensureConfigs = async () => {
    let settings = await WebsiteSettings.findOne();
    if (!settings) settings = await WebsiteSettings.create({
        logo: CANONICAL_BRAND_ASSETS.logo,
        favicon: CANONICAL_BRAND_ASSETS.favicon,
    });
    let settingsUpdated = false;
    const { logo: nextLogo, favicon: nextFavicon } = await resolveBrandSettingsAssets(settings);
    if (settings.logo !== nextLogo) {
        settings.logo = nextLogo;
        settingsUpdated = true;
    }
    if (settings.favicon !== nextFavicon) {
        settings.favicon = nextFavicon;
        settingsUpdated = true;
    }
    const nextStaticPages = normalizeWebsiteStaticPages(settings.staticPages);
    if (JSON.stringify(settings.staticPages || null) !== JSON.stringify(nextStaticPages)) {
        settings.staticPages = nextStaticPages as any;
        settingsUpdated = true;
    }
    if (settingsUpdated) await settings.save();
    let home = await HomePage.findOne();
    if (!home) home = await HomePage.create({});
    return { settings, home };
};

function parseSeatValue(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const text = String(value).replace(/[^\d]/g, '');
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
}

function countUpcomingDateStrings(values: unknown[], windowDays: number): number {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + windowDays);
    return values.reduce<number>((count, value) => {
        if (!value) return count;
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) return count;
        return (date >= start && date <= end) ? count + 1 : count;
    }, 0);
}

function toTime(value: unknown): number {
    if (!value) return 0;
    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) ? time : 0;
}

export const getAggregatedHomeData = async (req: Request, res: Response) => {
    await getStrictAggregatedHomeData(req as any, res);
};

export const getHomeStream = async (_req: Request, res: Response): Promise<void> => {
    addHomeStreamClient(res);
};

export const getSettings = async (req: Request, res: Response) => {
    try {
        const { settings } = await ensureConfigs();
        const siteSettings = await SiteSettings.findOne().lean();

        const socialLinksList = Array.isArray(siteSettings?.socialLinks)
            ? siteSettings.socialLinks
                .filter((item: any) => item?.enabled !== false && item?.url)
                .map((item: any) => ({
                    id: String(item?._id || ''),
                    platformName: String(item?.platform || ''),
                    targetUrl: String(item?.url || ''),
                    iconUploadOrUrl: String(item?.icon || ''),
                    description: String(item?.description || ''),
                    enabled: item?.enabled !== false,
                    placements: Array.isArray(item?.placements) ? item.placements : ['header', 'footer', 'home', 'news', 'contact'],
                }))
            : [];

        const socialLinksFromList = socialLinksList.reduce<Record<string, string>>((acc, item) => {
            const key = String(item.platformName || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
            if (!key || !item.targetUrl) return acc;
            if (['facebook', 'whatsapp', 'messenger', 'telegram', 'twitter', 'youtube', 'instagram'].includes(key)) {
                acc[key] = item.targetUrl;
            } else if (key === 'x') {
                acc.twitter = item.targetUrl;
            }
            return acc;
        }, {});

        const base = settings.toObject();
        res.json({
            ...base,
            siteName: String(base.websiteName || ''),
            logoUrl: String(base.logo || ''),
            staticPages: normalizeWebsiteStaticPages(base.staticPages),
            socialLinks: {
                ...DEFAULT_SOCIAL_LINKS,
                ...(base.socialLinks || {}),
                ...socialLinksFromList,
            },
            socialLinksList,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateSettings = async (req: Request, res: Response) => {
    try {
        const payload = { ...req.body };
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        console.log('Update Settings Body:', req.body);
        console.log('Update Settings Files:', files);

        if (files?.logo?.[0]) payload.logo = `/uploads/${files.logo[0].filename}`;
        if (files?.favicon?.[0]) payload.favicon = `/uploads/${files.favicon[0].filename}`;

        const current = await WebsiteSettings.findOne();

        if (!files?.logo?.[0] && LEGACY_BRAND_PATHS.has(String(current?.logo || '').trim())) {
            payload.logo = CANONICAL_BRAND_ASSETS.logo;
        }
        if (!files?.favicon?.[0] && LEGACY_BRAND_PATHS.has(String(current?.favicon || '').trim())) {
            payload.favicon = CANONICAL_BRAND_ASSETS.favicon;
        }

        // Handle JSON-like payload fields coming through multipart/form-data.
        const parseIfStringifiedObject = (rawValue: unknown) => {
            if (typeof rawValue !== 'string') return rawValue;
            if (!rawValue.trim() || rawValue === '[object Object]') return undefined;
            try {
                return JSON.parse(rawValue);
            } catch {
                return undefined;
            }
        };

        const parsedSocial = parseIfStringifiedObject(payload.socialLinks);
        if (parsedSocial && typeof parsedSocial === 'object') {
            payload.socialLinks = { ...DEFAULT_SOCIAL_LINKS, ...(current?.socialLinks || {}), ...(parsedSocial as Record<string, unknown>) };
        } else if (payload.socialLinks !== undefined) {
            payload.socialLinks = { ...DEFAULT_SOCIAL_LINKS, ...(current?.socialLinks || {}) };
        }

        const parsedTheme = parseIfStringifiedObject(payload.theme);
        if (parsedTheme && typeof parsedTheme === 'object') {
            payload.theme = { ...DEFAULT_THEME_SETTINGS, ...(current?.theme || {}), ...(parsedTheme as Record<string, unknown>) };
        } else if (payload.theme !== undefined) {
            payload.theme = { ...DEFAULT_THEME_SETTINGS, ...(current?.theme || {}) };
        }

        const parsedSocialUi = parseIfStringifiedObject(payload.socialUi);
        if (parsedSocialUi && typeof parsedSocialUi === 'object') {
            payload.socialUi = { ...DEFAULT_SOCIAL_UI, ...(current?.socialUi || {}), ...(parsedSocialUi as Record<string, unknown>) };
        } else if (payload.socialUi !== undefined) {
            payload.socialUi = { ...DEFAULT_SOCIAL_UI, ...(current?.socialUi || {}) };
        }

        const parsedPricingUi = parseIfStringifiedObject(payload.pricingUi);
        if (parsedPricingUi && typeof parsedPricingUi === 'object') {
            payload.pricingUi = { ...DEFAULT_PRICING_UI, ...(current?.pricingUi || {}), ...(parsedPricingUi as Record<string, unknown>) };
        } else if (payload.pricingUi !== undefined) {
            payload.pricingUi = { ...DEFAULT_PRICING_UI, ...(current?.pricingUi || {}) };
        }

        const parsedStaticPages = parseIfStringifiedObject(payload.staticPages);
        if (parsedStaticPages && typeof parsedStaticPages === 'object') {
            payload.staticPages = normalizeWebsiteStaticPages(parsedStaticPages, current?.staticPages as any);
        } else if (payload.staticPages !== undefined) {
            payload.staticPages = normalizeWebsiteStaticPages(current?.staticPages as any);
        }

        // Use findOneAndUpdate to ensure we update the single settings document
        const settings = await WebsiteSettings.findOneAndUpdate(
            {},
            { $set: payload },
            { new: true, upsert: true, runValidators: true }
        );

        if (settings) {
            const { logo: nextLogo, favicon: nextFavicon } = await resolveBrandSettingsAssets(settings);
            if (settings.logo !== nextLogo || settings.favicon !== nextFavicon) {
                settings.logo = nextLogo;
                settings.favicon = nextFavicon;
                await settings.save();
            }
            await cleanupBrandLikeUploads([settings.logo, settings.favicon]);
        }

        console.log('Settings updated in DB:', settings);
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { section: 'website-settings' } });

        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        console.error('Settings save error:', error);
        res.status(500).json({
            message: 'Internal Server Error',
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

export const updateHome = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        let home = await HomePage.findOne();
        if (!home) home = new HomePage();

        Object.assign(home, payload);
        await home.save();
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { section: 'home' } });

        res.json({ message: 'Home page updated successfully', home });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateHero = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        const file = req.file;
        if (file) payload.backgroundImage = `/uploads/${file.filename}`;

        let home = await HomePage.findOne();
        if (!home) home = new HomePage();

        home.heroSection = { ...home.heroSection, ...payload };

        // ensure overlay is boolean
        if (payload.overlay !== undefined) {
            home.heroSection.overlay = payload.overlay === 'true' || payload.overlay === true;
        }

        await home.save();
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { section: 'hero' } });
        res.json({ message: 'Hero section updated', heroSection: home.heroSection });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updatePromotionalBanner = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        const file = req.file;
        if (file) payload.image = `/uploads/${file.filename}`;

        let home = await HomePage.findOne();
        if (!home) home = new HomePage();

        home.promotionalBanner = { ...home.promotionalBanner, ...payload };

        if (payload.enabled !== undefined) {
            home.promotionalBanner.enabled = payload.enabled === 'true' || payload.enabled === true;
        }

        await home.save();
        broadcastHomeStreamEvent({ type: 'banner-updated', meta: { section: 'promotionalBanner' } });
        res.json({ message: 'Banner updated', promotionalBanner: home.promotionalBanner });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateAnnouncement = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        let home = await HomePage.findOne();
        if (!home) home = new HomePage();

        home.announcementBar = { ...home.announcementBar, ...payload };

        if (payload.enabled !== undefined) {
            home.announcementBar.enabled = payload.enabled === 'true' || payload.enabled === true;
        }

        await home.save();
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { section: 'announcement' } });
        res.json({ message: 'Announcement updated', announcementBar: home.announcementBar });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getStats = async (req: Request, res: Response) => {
    try {
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalExams = await Exam.countDocuments();
        const totalUniversities = await University.countDocuments();
        const totalResults = await ExamResult.countDocuments();

        res.json({ totalStudents, totalExams, totalUniversities, totalResults });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateStats = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        let home = await HomePage.findOne();
        if (!home) home = new HomePage();

        home.statistics = { ...home.statistics, ...payload };
        await home.save();
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { section: 'statistics' } });
        res.json({ message: 'Stats updated', statistics: home.statistics });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

