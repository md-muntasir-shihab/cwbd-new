import { useQuery } from '@tanstack/react-query';
import { ApiWebsiteSettings, getPublicSettings } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

const WEBSITE_SETTINGS_CACHE_KEY = 'cw_public_website_settings_cache';
const IS_MOCK_MODE = String(import.meta.env.VITE_USE_MOCK_API || '').toLowerCase() === 'true';
const MOCK_SETTINGS: ApiWebsiteSettings = {
    websiteName: 'CampusWay',
    logoUrl: '',
    contactEmail: 'support@campusway.local',
    contactPhone: '',
    motto: 'Plan. Explore. Achieve.',
};

function normalizeSettingsPayload(raw: unknown): ApiWebsiteSettings | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const payload = raw as Record<string, unknown>;
    const inner = typeof payload.settings === 'object' && payload.settings !== null
        ? (payload.settings as Record<string, unknown>)
        : null;

    const merged: Record<string, unknown> = {
        ...(inner || {}),
        ...payload,
    };

    const normalized: Partial<ApiWebsiteSettings> & { settings?: unknown } = merged;
    if (!normalized.logo && normalized.logoUrl) normalized.logo = normalized.logoUrl;
    if (!normalized.logoUrl && normalized.logo) normalized.logoUrl = normalized.logo;
    delete normalized.settings;

    return {
        websiteName: String(normalized.websiteName || normalized.siteName || 'CampusWay'),
        ...normalized,
    } as ApiWebsiteSettings;
}

/** Read localStorage cache and normalize it for use as initialData. */
function getCachedSettings(): ApiWebsiteSettings | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(WEBSITE_SETTINGS_CACHE_KEY);
        if (!raw) return null;
        return normalizeSettingsPayload(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function useWebsiteSettings() {
    return useQuery<ApiWebsiteSettings | null>({
        queryKey: queryKeys.websiteSettings,
        queryFn: async () => {
            if (IS_MOCK_MODE) return MOCK_SETTINGS;
            try {
                const { data } = await getPublicSettings();
                const normalized = normalizeSettingsPayload(data);
                if (normalized && typeof window !== 'undefined') {
                    window.localStorage.setItem(WEBSITE_SETTINGS_CACHE_KEY, JSON.stringify(normalized));
                }
                return normalized;
            } catch {
                if (typeof window === 'undefined') return null;
                const cached = window.localStorage.getItem(WEBSITE_SETTINGS_CACHE_KEY);
                if (!cached) return null;
                try {
                    return normalizeSettingsPayload(JSON.parse(cached));
                } catch {
                    return null;
                }
            }
        },
        staleTime: 60_000, // 1 minute — reduced from 5 min to pick up admin updates faster
        initialData: getCachedSettings() ?? undefined,
    });
}
