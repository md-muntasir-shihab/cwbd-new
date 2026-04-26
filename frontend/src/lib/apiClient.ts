/**
 * Canonical API client for the Universities module.
 *
 * - Axios wrapper with auth token + fingerprint injection (delegates to main api instance)
 * - Mock interceptor registry for `VITE_USE_MOCK_API=true`
 * - Typed request/response helpers + response normalisation for both legacy and new backend shapes
 */

import api from '../services/api';
import type {
    ApiUniversity,
    ApiUniversityCardPreview,
    UniversityCategorySummary,
} from '../services/api';
import type { AxiosResponse } from 'axios';
import {
    buildUniversityLogoFallback,
    daysUntilUniversityDate,
    parseUniversityDate,
    pickText,
    toUniversitySlug,
} from './universityPresentation';

/* ── Public types re-exported for convenience ── */

export type { ApiUniversity, ApiUniversityCardPreview, UniversityCategorySummary };

export type UrgencyState = 'open' | 'closing_soon' | 'closed' | 'upcoming' | 'unknown';

export interface UniversityCard {
    id: string;
    name: string;
    shortForm: string;
    slug: string;
    category: string;
    categorySlug: string;
    clusterGroup: string;
    clusterSlug: string;
    contactNumber: string;
    established: number | null;
    address: string;
    email: string;
    website: string;
    admissionWebsite: string;
    totalSeats: string;
    scienceSeats: string;
    artsSeats: string;
    businessSeats: string;
    applicationStartDate: string;
    applicationEndDate: string;
    scienceExamDate: string;
    artsExamDate: string;
    businessExamDate: string;
    examCentersPreview: string[];
    shortDescription: string;
    logoUrl: string;
    /* ── Computed fields ── */
    logoFallbackText: string;
    daysLeft: number | null;
    urgencyState: UrgencyState;
    deadlinePassed: boolean;
    applicationProgress: number | null;
    scienceExamDaysLeft: number | null;
    artsExamDaysLeft: number | null;
    businessExamDaysLeft: number | null;
}

export interface UniversityCategoryDetail {
    categoryName: string;
    categorySlug: string;
    order: number;
    count: number;
    clusterGroups: string[];
}

export interface UniversityClusterSummary {
    name: string;
    slug: string;
    categoryName: string;
    categorySlug: string;
    memberCount: number;
}

export interface UniversityDetail extends UniversityCard {
    description: string;
    heroImageUrl: string;
    examCenters: { city: string; address: string }[];
    units: {
        name: string;
        seats: number;
        examDates: string[];
        applicationStart: string;
        applicationEnd: string;
        examCenters: { city: string; address: string }[];
    }[];
    socialLinks: { platform: string; url: string }[];
    isActive: boolean;
}

export interface UniversityListResponse {
    universities: UniversityCard[];
    pagination: { total: number; page: number; limit: number; pages: number };
}

/* ── Mock interceptor registry ── */

export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_API === 'true';

type MockHandler = (url: string, config?: unknown) => AxiosResponse | Promise<AxiosResponse>;

const _mockRegistry = new Map<RegExp, MockHandler>();

/**
 * Register a mock handler for URLs matching a regex pattern.
 * No-op when mock mode is off.
 */
export function registerMock(pattern: RegExp, handler: MockHandler): void {
    if (!IS_MOCK_MODE) return;
    _mockRegistry.set(pattern, handler);
}

// Install a request interceptor that short-circuits matching URLs in mock mode
if (IS_MOCK_MODE) {
    api.interceptors.request.use((config) => {
        const url = config.url || '';
        for (const [pattern, handler] of _mockRegistry) {
            if (pattern.test(url)) {
                // Return a resolved adapter response to skip the real request
                const result = handler(url, config);
                return Promise.reject({
                    __isMock: true,
                    response: result instanceof Promise ? undefined : result,
                    responsePromise: result instanceof Promise ? result : undefined,
                    config,
                });
            }
        }
        return config;
    });

    api.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error?.__isMock) {
                if (error.response) return Promise.resolve(error.response);
                if (error.responsePromise) return error.responsePromise;
            }
            return Promise.reject(error);
        },
    );
}

/* ── Response normalisation helpers ── */

export function toSlug(value: string): string {
    return toUniversitySlug(value);
}

function safeDaysDiff(dateStr: string): number | null {
    return daysUntilUniversityDate(dateStr);
}

function computeUrgency(startStr: string, endStr: string, closingSoonDays = 7): {
    urgencyState: UrgencyState;
    daysLeft: number | null;
    deadlinePassed: boolean;
    applicationProgress: number | null;
} {
    const start = parseUniversityDate(startStr);
    const end = parseUniversityDate(endStr);
    if (!start || !end) {
        return { urgencyState: 'unknown', daysLeft: null, deadlinePassed: false, applicationProgress: null };
    }
    const now = Date.now();
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (now < startMs) {
        return { urgencyState: 'upcoming', daysLeft: safeDaysDiff(endStr), deadlinePassed: false, applicationProgress: 0 };
    }
    if (now > endMs) {
        return { urgencyState: 'closed', daysLeft: 0, deadlinePassed: true, applicationProgress: 100 };
    }
    const total = Math.max(1, endMs - startMs);
    const elapsed = Math.min(Math.max(now - startMs, 0), total);
    const progress = Math.round((elapsed / total) * 100);
    const daysLeft = safeDaysDiff(endStr);
    const closingSoon = daysLeft !== null && daysLeft <= closingSoonDays;
    return {
        urgencyState: closingSoon ? 'closing_soon' : 'open',
        daysLeft,
        deadlinePassed: false,
        applicationProgress: progress,
    };
}

export function buildLogoFallback(name: string, shortForm?: string): string {
    return buildUniversityLogoFallback(name, shortForm);
}

function normalizeUniversityCard(raw: ApiUniversity | ApiUniversityCardPreview): UniversityCard {
    const r = raw as unknown as Record<string, unknown>;
    const name = pickText(r.name);
    const category = pickText(r.category);
    const clusterGroup = pickText(r.clusterGroup);
    const applicationStartDate = pickText(r.applicationStartDate || r.applicationStart);
    const applicationEndDate = pickText(r.applicationEndDate || r.applicationEnd);
    const scienceExamDate = pickText(r.scienceExamDate || r.examDateScience);
    const artsExamDate = pickText(r.artsExamDate || r.examDateArts);
    const businessExamDate = pickText(r.businessExamDate || r.examDateBusiness);
    const logoUrl = pickText(r.logoUrl);

    const urgency = computeUrgency(applicationStartDate, applicationEndDate);

    return {
        id: String(r._id || r.id || ''),
        name,
        shortForm: pickText(r.shortForm, 'N/A'),
        slug: pickText(r.slug),
        category,
        categorySlug: pickText(r.categorySlug) || toSlug(category),
        clusterGroup,
        clusterSlug: pickText(r.clusterSlug) || toSlug(clusterGroup),
        contactNumber: pickText(r.contactNumber),
        established: typeof r.established === 'number' ? r.established
            : typeof r.establishedYear === 'number' ? r.establishedYear
                : null,
        address: pickText(r.address),
        email: pickText(r.email),
        website: pickText(r.website || r.websiteUrl),
        admissionWebsite: pickText(r.admissionWebsite || r.admissionUrl),
        totalSeats: String(r.totalSeats ?? 'N/A'),
        scienceSeats: String(r.scienceSeats ?? r.seatsScienceEng ?? 'N/A'),
        artsSeats: String(r.artsSeats ?? r.seatsArtsHum ?? 'N/A'),
        businessSeats: String(r.businessSeats ?? r.seatsBusiness ?? 'N/A'),
        applicationStartDate,
        applicationEndDate,
        scienceExamDate,
        artsExamDate,
        businessExamDate,
        examCentersPreview: Array.isArray(r.examCentersPreview) ? r.examCentersPreview as string[]
            : Array.isArray(r.examCenters) ? (r.examCenters as { city: string }[]).map(c => c.city).slice(0, 6)
                : [],
        shortDescription: pickText(r.shortDescription || r.description),
        logoUrl,
        logoFallbackText: buildLogoFallback(name, pickText(r.shortForm)),
        daysLeft: urgency.daysLeft,
        urgencyState: urgency.urgencyState,
        deadlinePassed: urgency.deadlinePassed,
        applicationProgress: urgency.applicationProgress,
        scienceExamDaysLeft: safeDaysDiff(scienceExamDate),
        artsExamDaysLeft: safeDaysDiff(artsExamDate),
        businessExamDaysLeft: safeDaysDiff(businessExamDate),
    };
}

/* ── Public API functions ── */

export { normalizeUniversityCard };

export async function fetchUniversityCategories(): Promise<UniversityCategoryDetail[]> {
    const { data } = await api.get<UniversityCategorySummary[] | { categories?: UniversityCategorySummary[]; data?: UniversityCategorySummary[]; success?: boolean }>('/university-categories');
    const raw = Array.isArray(data) ? data
        : Array.isArray((data as { categories?: UniversityCategorySummary[] }).categories)
            ? (data as { categories: UniversityCategorySummary[] }).categories
            // Handle ResponseBuilder envelope: { success, data: [...] }
            : Array.isArray((data as { data?: UniversityCategorySummary[] }).data)
                ? (data as { data: UniversityCategorySummary[] }).data
                : [];
    return raw.map(c => ({
        categoryName: c.categoryName,
        categorySlug: c.categorySlug || toSlug(c.categoryName),
        order: c.order,
        count: c.count,
        clusterGroups: c.clusterGroups,
    }));
}

export async function fetchUniversities(
    params: Record<string, string | number> = {},
): Promise<UniversityListResponse> {
    const { data } = await api.get<{
        universities: ApiUniversity[];
        pagination: { total: number; page: number; limit: number; pages: number };
    }>('/universities', { params });

    return {
        universities: Array.isArray(data.universities)
            ? data.universities.map(normalizeUniversityCard)
            : [],
        pagination: data.pagination || { total: 0, page: 1, limit: 20, pages: 0 },
    };
}

export async function fetchUniversityBySlug(slug: string): Promise<UniversityDetail | null> {
    const { data } = await api.get<{ university: ApiUniversity }>(`/universities/${encodeURIComponent(slug)}`);
    if (!data.university) return null;

    const raw = data.university as unknown as Record<string, unknown>;
    const card = normalizeUniversityCard(data.university);

    return {
        ...card,
        description: String(raw.description || raw.shortDescription || ''),
        heroImageUrl: String(raw.heroImageUrl || ''),
        examCenters: Array.isArray(raw.examCenters) ? raw.examCenters as { city: string; address: string }[] : [],
        units: Array.isArray(raw.units) ? raw.units as UniversityDetail['units'] : [],
        socialLinks: Array.isArray(raw.socialLinks) ? raw.socialLinks as { platform: string; url: string }[] : [],
        isActive: Boolean(raw.isActive ?? true),
    };
}
