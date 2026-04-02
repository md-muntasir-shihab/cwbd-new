import { Request, Response } from 'express';
import { escapeRegex } from '../utils/escapeRegex';
import ExcelJS from 'exceljs';
import slugify from 'slugify';
import HomeSettings from '../models/HomeSettings';
import HomeConfig from '../models/HomeConfig';
import University from '../models/University';
import UniversityCategory from '../models/UniversityCategory';
import UniversityCluster from '../models/UniversityCluster';
import { ALLOWED_CATEGORIES, ensureUniversitySettings } from '../models/UniversitySettings';
import { broadcastStudentDashboardEvent } from '../realtime/studentDashboardStream';
import { broadcastHomeStreamEvent } from '../realtime/homeStream';
import {
    backfillUniversityTaxonomyIfNeeded,
    ensureUniversityCategoryByName,
    ensureUniversityClusterByName,
    normalizeExamCenters,
    reconcileUniversityClusterAssignments,
    serializeExamCenters,
    syncManualClusterMembership,
} from '../services/universitySyncService';
import {
    DEFAULT_UNIVERSITY_CATEGORY,
    UNIVERSITY_CATEGORY_ORDER,
    getUniversityCategoryOrderIndex,
    isAllUniversityCategoryToken,
    normalizeUniversityCategory,
    normalizeUniversityCategoryStrict,
} from '../utils/universityCategories';
import {
    buildPublicUniversityExclusionQuery,
    combineMongoFilters,
    sanitizePublicFixtureText,
} from '../utils/publicFixtureFilters';

type UniversityStatusFilter = 'active' | 'inactive' | 'archived' | 'all';

const SORT_WHITELIST: Record<string, string> = {
    name: 'name',
    shortForm: 'shortForm',
    category: 'category',
    clusterGroup: 'clusterGroup',
    applicationStartDate: 'applicationStartDate',
    applicationEndDate: 'applicationEndDate',
    examDateScience: 'scienceExamDate',
    examDateArts: 'artsExamDate',
    examDateBusiness: 'businessExamDate',
    establishedYear: 'established',
    totalSeats: 'totalSeats',
    seatsScienceEng: 'seatsScienceEng',
    seatsArtsHum: 'seatsArtsHum',
    seatsBusiness: 'seatsBusiness',
    contactNumber: 'contactNumber',
    address: 'address',
    email: 'email',
    websiteUrl: 'website',
    admissionUrl: 'admissionWebsite',
    examCenters: 'examCenters',
    logoUrl: 'logoUrl',
    featured: 'featured',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
};

const PUBLIC_UNIVERSITY_LIST_PROJECTION = [
    'name',
    'shortForm',
    'shortDescription',
    'description',
    'category',
    'clusterGroup',
    'established',
    'establishedYear',
    'address',
    'contactNumber',
    'email',
    'website',
    'websiteUrl',
    'admissionWebsite',
    'admissionUrl',
    'totalSeats',
    'scienceSeats',
    'seatsScienceEng',
    'artsSeats',
    'seatsArtsHum',
    'businessSeats',
    'seatsBusiness',
    'logoUrl',
    'applicationStartDate',
    'applicationEndDate',
    'scienceExamDate',
    'examDateScience',
    'artsExamDate',
    'examDateArts',
    'businessExamDate',
    'examDateBusiness',
    'isActive',
    'featured',
    'featuredOrder',
    'examCenters',
    'clusterId',
    'clusterName',
    'clusterCount',
    'categorySyncLocked',
    'clusterSyncLocked',
    'slug',
].join(' ');

function asStatusFilter(value: unknown): UniversityStatusFilter {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'active' || raw === 'inactive' || raw === 'archived' || raw === 'all') return raw;
    return 'all';
}

function toBool(value: unknown, fallback = false): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const lowered = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lowered)) return true;
    if (['0', 'false', 'no', 'off'].includes(lowered)) return false;
    return fallback;
}

function normalizeSort(sortBy: unknown, sortOrder: unknown, legacySort: unknown): Record<string, 1 | -1> {
    const sortParam = String(sortBy || legacySort || '').trim().toLowerCase();
    if (sortParam === 'deadline' || sortParam === 'nearest_application_deadline') return { applicationEndDate: 1, name: 1 };
    if (sortParam === 'alphabetical') return { name: 1 };
    if (sortParam === 'name_asc') return { name: 1 };
    if (sortParam === 'name_desc') return { name: -1 };
    if (sortParam === 'closing_soon' || sortParam === 'nearest_deadline') return { applicationEndDate: 1, name: 1 };
    if (sortParam === 'exam_soon') return { scienceExamDate: 1, artsExamDate: 1, businessExamDate: 1, name: 1 };

    const legacy = String(legacySort || '').trim();
    if (legacy.startsWith('-') && SORT_WHITELIST[legacy.slice(1)]) return { [SORT_WHITELIST[legacy.slice(1)]]: -1 };
    if (SORT_WHITELIST[legacy]) return { [SORT_WHITELIST[legacy]]: 1 };

    const key = SORT_WHITELIST[String(sortBy || '').trim()] || 'createdAt';
    const order = String(sortOrder || '').trim().toLowerCase() === 'asc' ? 1 : -1;
    return { [key]: order };
}

function normalizeSlug(name: string, existingSlug?: string): string {
    const fallback = slugify(name || existingSlug || '', { lower: true, strict: true });
    return fallback || `university-${Date.now()}`;
}

function normalizeClusterSlugValue(value: unknown): string {
    const fallback = slugify(String(value || '').trim(), { lower: true, strict: true });
    return fallback || '';
}

function resolveUniversityCategoryFilterValue(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_UNIVERSITY_CATEGORY;
    if (isAllUniversityCategoryToken(raw)) return DEFAULT_UNIVERSITY_CATEGORY;
    return normalizeUniversityCategoryStrict(raw);
}

function csvEscape(value: unknown): string {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes(',') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function toDateString(value: unknown): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
}

function asStringIdList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    const raw = String(value || '').trim();
    if (!raw) return [];
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

async function getActivePublicUniversityTaxonomy(): Promise<{
    activeCategoryNames: string[];
    activeCategorySet: Set<string>;
    activeClusterIdSet: Set<string>;
    activeClusterNameSet: Set<string>;
}> {
    const [activeCategories, activeClusters] = await Promise.all([
        UniversityCategory.find({ isActive: true }).select('name').lean(),
        UniversityCluster.find({ isActive: true }).select('_id name').lean(),
    ]);

    const activeCategoryNames = activeCategories
        .map((item) => normalizeUniversityCategory(item.name))
        .filter(Boolean);

    return {
        activeCategoryNames,
        activeCategorySet: new Set(activeCategoryNames),
        activeClusterIdSet: new Set(activeClusters.map((item) => String(item._id || ''))),
        activeClusterNameSet: new Set(activeClusters.map((item) => String(item.name || '').trim()).filter(Boolean)),
    };
}

function stripInactiveClusterFromUniversityRecord(
    input: Record<string, unknown>,
    taxonomy: {
        activeClusterIdSet: Set<string>;
        activeClusterNameSet: Set<string>;
    },
): Record<string, unknown> {
    const clusterId = String(input.clusterId || '').trim();
    const clusterName = String(input.clusterGroup || input.clusterName || '').trim();
    const hasActiveCluster = (
        (clusterId && taxonomy.activeClusterIdSet.has(clusterId))
        || (clusterName && taxonomy.activeClusterNameSet.has(clusterName))
    );

    if (hasActiveCluster) return input;
    return {
        ...input,
        clusterId: null,
        clusterGroup: '',
        clusterName: '',
    };
}

function normalizeClusterGroupValue(data: Record<string, unknown>): void {
    const rawGroup = String(data.clusterGroup || '').trim();
    data.clusterGroup = rawGroup || String(data.clusterName || '').trim() || '';
}

function hasAnyDefined(source: Record<string, unknown>, keys: string[]): boolean {
    return keys.some((key) => source[key] !== undefined);
}

function buildUniversityMutationPayload(
    input: Record<string, unknown>,
    opts?: { partial?: boolean },
): Record<string, unknown> {
    const partial = Boolean(opts?.partial);
    const output: Record<string, unknown> = partial
        ? Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
        : { ...input };

    const name = String(input.name || '').trim();
    const shortForm = String(input.shortForm || '').trim();
    const shortDescription = sanitizePublicFixtureText(input.shortDescription);
    const description = sanitizePublicFixtureText(input.description);
    const website = String(input.website || input.websiteUrl || '').trim();
    const admissionWebsite = String(input.admissionWebsite || input.admissionUrl || '').trim();
    const established = Number(input.establishedYear ?? input.established ?? 0);
    const applicationStartDate = input.applicationStartDate || input.applicationStart || null;
    const applicationEndDate = input.applicationEndDate || input.applicationEnd || null;
    const examDateScience = String(input.examDateScience || input.scienceExamDate || '').trim();
    const examDateArts = String(input.examDateArts || input.artsExamDate || '').trim();
    const examDateBusiness = String(input.examDateBusiness || input.businessExamDate || '').trim();
    const seatsScienceEng = String(input.seatsScienceEng || input.scienceSeats || '').trim();
    const seatsArtsHum = String(input.seatsArtsHum || input.artsSeats || '').trim();
    const seatsBusiness = String(input.seatsBusiness || input.businessSeats || '').trim();
    const clusterGroup = String(input.clusterGroup || input.clusterName || '').trim();

    if (!partial || input.name !== undefined) {
        output.name = name;
    }
    if (!partial || input.shortForm !== undefined) {
        output.shortForm = shortForm;
    }
    if (!partial || input.shortDescription !== undefined) {
        output.shortDescription = shortDescription;
    }
    if (!partial || input.description !== undefined) {
        output.description = description;
    }
    if (!partial || hasAnyDefined(input, ['category', 'categoryId'])) {
        output.category = normalizeUniversityCategory(input.category || DEFAULT_UNIVERSITY_CATEGORY);
    }
    if (!partial || hasAnyDefined(input, ['website', 'websiteUrl'])) {
        output.website = website;
        output.websiteUrl = website;
    }
    if (!partial || hasAnyDefined(input, ['admissionWebsite', 'admissionUrl'])) {
        output.admissionWebsite = admissionWebsite;
        output.admissionUrl = admissionWebsite;
    }
    if (!partial || hasAnyDefined(input, ['established', 'establishedYear'])) {
        output.established = Number.isFinite(established) && established > 0 ? established : undefined;
        output.establishedYear = Number.isFinite(established) && established > 0 ? established : undefined;
    }
    if (!partial || hasAnyDefined(input, ['applicationStartDate', 'applicationStart'])) {
        output.applicationStartDate = applicationStartDate || null;
        output.applicationStart = applicationStartDate || null;
    }
    if (!partial || hasAnyDefined(input, ['applicationEndDate', 'applicationEnd'])) {
        output.applicationEndDate = applicationEndDate || null;
        output.applicationEnd = applicationEndDate || null;
    }
    if (!partial || hasAnyDefined(input, ['scienceExamDate', 'examDateScience'])) {
        output.scienceExamDate = examDateScience;
        output.examDateScience = examDateScience;
    }
    if (!partial || hasAnyDefined(input, ['artsExamDate', 'examDateArts'])) {
        output.artsExamDate = examDateArts;
        output.examDateArts = examDateArts;
    }
    if (!partial || hasAnyDefined(input, ['businessExamDate', 'examDateBusiness'])) {
        output.businessExamDate = examDateBusiness;
        output.examDateBusiness = examDateBusiness;
    }
    if (!partial || hasAnyDefined(input, ['scienceSeats', 'seatsScienceEng'])) {
        output.scienceSeats = seatsScienceEng;
        output.seatsScienceEng = seatsScienceEng;
    }
    if (!partial || hasAnyDefined(input, ['artsSeats', 'seatsArtsHum'])) {
        output.artsSeats = seatsArtsHum;
        output.seatsArtsHum = seatsArtsHum;
    }
    if (!partial || hasAnyDefined(input, ['businessSeats', 'seatsBusiness'])) {
        output.businessSeats = seatsBusiness;
        output.seatsBusiness = seatsBusiness;
    }
    if (!partial || hasAnyDefined(input, ['totalSeats'])) {
        output.totalSeats = String(input.totalSeats || '').trim() || 'N/A';
    }
    if (!partial || hasAnyDefined(input, ['clusterGroup', 'clusterName'])) {
        output.clusterGroup = clusterGroup;
        output.clusterName = String(input.clusterName || clusterGroup).trim();
    }
    if (!partial || input.isActive !== undefined) {
        output.isActive = toBool(input.isActive, true);
    }
    if (!partial || input.featured !== undefined) {
        output.featured = toBool(input.featured, false);
    }
    if (!partial || input.categorySyncLocked !== undefined) {
        output.categorySyncLocked = toBool(input.categorySyncLocked, false);
    }
    if (!partial || input.clusterSyncLocked !== undefined) {
        output.clusterSyncLocked = toBool(input.clusterSyncLocked, false);
    }
    if (!partial || input.examCenters !== undefined) {
        output.examCenters = normalizeExamCenters(input.examCenters);
    }

    return output;
}

function toCanonicalUniversityRecord(input: Record<string, unknown>): Record<string, unknown> {
    const name = String(input.name || '').trim();
    const shortForm = String(input.shortForm || '').trim();
    const shortDescription = String(input.shortDescription || '').trim();
    const description = String(input.description || '').trim();
    const website = String(input.website || input.websiteUrl || '').trim();
    const admissionWebsite = String(input.admissionWebsite || input.admissionUrl || '').trim();
    const established = Number(input.establishedYear ?? input.established ?? 0);
    const applicationStartDate = input.applicationStartDate || input.applicationStart || null;
    const applicationEndDate = input.applicationEndDate || input.applicationEnd || null;
    const examDateScience = String(input.examDateScience || input.scienceExamDate || '').trim();
    const examDateArts = String(input.examDateArts || input.artsExamDate || '').trim();
    const examDateBusiness = String(input.examDateBusiness || input.businessExamDate || '').trim();
    const seatsScienceEng = String(input.seatsScienceEng || input.scienceSeats || '').trim();
    const seatsArtsHum = String(input.seatsArtsHum || input.artsSeats || '').trim();
    const seatsBusiness = String(input.seatsBusiness || input.businessSeats || '').trim();
    const clusterGroup = String(input.clusterGroup || input.clusterName || '').trim();
    const clusterSlug = normalizeClusterSlugValue(input.clusterSlug || clusterGroup);

    return {
        ...input,
        name,
        shortForm,
        shortDescription,
        description,
        category: normalizeUniversityCategory(input.category || DEFAULT_UNIVERSITY_CATEGORY),
        website,
        websiteUrl: website,
        admissionWebsite,
        admissionUrl: admissionWebsite,
        established: Number.isFinite(established) && established > 0 ? established : undefined,
        establishedYear: Number.isFinite(established) && established > 0 ? established : undefined,
        applicationStartDate: applicationStartDate || null,
        applicationStart: applicationStartDate || null,
        applicationEndDate: applicationEndDate || null,
        applicationEnd: applicationEndDate || null,
        scienceExamDate: examDateScience,
        artsExamDate: examDateArts,
        businessExamDate: examDateBusiness,
        examDateScience,
        examDateArts,
        examDateBusiness,
        scienceSeats: seatsScienceEng,
        artsSeats: seatsArtsHum,
        businessSeats: seatsBusiness,
        seatsScienceEng,
        seatsArtsHum,
        seatsBusiness,
        totalSeats: String(input.totalSeats || '').trim() || 'N/A',
        clusterGroup,
        clusterName: String(input.clusterName || clusterGroup).trim(),
        clusterSlug,
        isActive: toBool(input.isActive, true),
        featured: toBool(input.featured, false),
        categorySyncLocked: toBool(input.categorySyncLocked, false),
        clusterSyncLocked: toBool(input.clusterSyncLocked, false),
        examCenters: normalizeExamCenters(input.examCenters),
    };
}

async function attachClusterSlugs<T extends Record<string, unknown>>(items: T[]): Promise<Array<T & { clusterSlug: string }>> {
    if (!Array.isArray(items) || items.length === 0) return [];

    const clusterIds = Array.from(new Set(
        items
            .map((item) => String(item.clusterId || '').trim())
            .filter(Boolean),
    ));
    const clusterNames = Array.from(new Set(
        items
            .map((item) => String(item.clusterGroup || item.clusterName || '').trim())
            .filter(Boolean),
    ));

    if (clusterIds.length === 0 && clusterNames.length === 0) {
        return items.map((item) => ({
            ...item,
            clusterSlug: normalizeClusterSlugValue(item.clusterSlug || item.clusterGroup || item.clusterName),
        }));
    }

    const query: Record<string, unknown> = {
        $or: [
            ...(clusterIds.length > 0 ? [{ _id: { $in: clusterIds } }] : []),
            ...(clusterNames.length > 0 ? [{ name: { $in: clusterNames } }] : []),
        ],
    };
    const clusters = await UniversityCluster.find(query).select('_id name slug').lean();
    const slugById = new Map<string, string>();
    const slugByName = new Map<string, string>();
    clusters.forEach((cluster) => {
        const computedSlug = normalizeClusterSlugValue(cluster.slug || cluster.name);
        if (!computedSlug) return;
        slugById.set(String(cluster._id), computedSlug);
        const name = String(cluster.name || '').trim();
        if (name) slugByName.set(name, computedSlug);
    });

    return items.map((item) => {
        const clusterId = String(item.clusterId || '').trim();
        const clusterName = String(item.clusterGroup || item.clusterName || '').trim();
        const clusterSlug = slugById.get(clusterId)
            || slugByName.get(clusterName)
            || normalizeClusterSlugValue(item.clusterSlug || clusterName);
        return {
            ...item,
            clusterSlug,
        };
    });
}

async function resolveCategoryFields(source: Record<string, unknown>): Promise<{ category: string; categoryId: string | null }> {
    const categoryIdRaw = String(source.categoryId || '').trim();
    if (categoryIdRaw) {
        const byId = await UniversityCategory.findById(categoryIdRaw).select('_id name').lean();
        if (byId) return { category: normalizeUniversityCategory(byId.name), categoryId: String(byId._id) };
    }
    const categoryName = normalizeUniversityCategory(source.category || DEFAULT_UNIVERSITY_CATEGORY);
    const byName = await ensureUniversityCategoryByName(categoryName);
    return { category: categoryName, categoryId: byName ? String(byName._id) : null };
}

async function resolveClusterFields(source: Record<string, unknown>): Promise<{ clusterId: string | null; clusterName: string; clusterGroup: string }> {
    const clusterIdRaw = String(source.clusterId || '').trim();
    if (clusterIdRaw) {
        const byId = await UniversityCluster.findById(clusterIdRaw).select('_id name').lean();
        if (byId) {
            return {
                clusterId: String(byId._id),
                clusterName: String(byId.name || '').trim(),
                clusterGroup: String(byId.name || '').trim(),
            };
        }
    }

    const clusterName = String(source.clusterGroup || source.clusterName || '').trim();
    if (!clusterName) return { clusterId: null, clusterName: '', clusterGroup: '' };
    const cluster = await ensureUniversityClusterByName(clusterName);
    return {
        clusterId: String(cluster._id),
        clusterName: cluster.name,
        clusterGroup: cluster.name,
    };
}

async function getUniversityDashboardConfig(): Promise<{ defaultCategory: string; showAllCategories: boolean }> {
    const [homeSettings, universitySettings] = await Promise.all([
        HomeSettings.findOne().select('universityDashboard').lean(),
        ensureUniversitySettings(),
    ]);
    const showAllCategories = Boolean(homeSettings?.universityDashboard?.showAllCategories);
    const rawDefault = String(
        universitySettings?.defaultCategory
        || homeSettings?.universityDashboard?.defaultCategory
        || '',
    ).trim();
    const normalizedDefault = isAllUniversityCategoryToken(rawDefault)
        ? DEFAULT_UNIVERSITY_CATEGORY
        : normalizeUniversityCategory(rawDefault || DEFAULT_UNIVERSITY_CATEGORY);

    return {
        defaultCategory: normalizedDefault,
        showAllCategories,
    };
}

function buildUniversityFilter(
    query: Record<string, unknown>,
    opts?: { includeArchivedDefault?: boolean; requireCategory?: boolean; allowAllCategories?: boolean },
): { filter: Record<string, unknown>; categoryMissing: boolean } {
    const includeArchivedDefault = Boolean(opts?.includeArchivedDefault);
    const requireCategory = Boolean(opts?.requireCategory);
    const allowAllCategories = Boolean(opts?.allowAllCategories);
    const { q, search, category, status, clusterId, clusterGroup, activeOnly } = query;

    const filter: Record<string, unknown> = {};
    const statusFilter = asStatusFilter(status);

    if (statusFilter === 'archived') filter.isArchived = true;
    else if (statusFilter === 'active') { filter.isArchived = { $ne: true }; filter.isActive = true; }
    else if (statusFilter === 'inactive') { filter.isArchived = { $ne: true }; filter.isActive = false; }
    else if (!includeArchivedDefault) filter.isArchived = { $ne: true };

    if (activeOnly !== undefined) filter.isActive = toBool(activeOnly, true);

    let categoryMissing = false;
    const categoryRaw = String(category || '').trim();
    if (categoryRaw && !isAllUniversityCategoryToken(categoryRaw)) {
        filter.category = resolveUniversityCategoryFilterValue(categoryRaw);
    } else if (categoryRaw && isAllUniversityCategoryToken(categoryRaw) && requireCategory && !allowAllCategories) {
        categoryMissing = true;
    } else if (!categoryRaw && requireCategory && !allowAllCategories) {
        categoryMissing = true;
    }

    if (clusterId) filter.clusterId = clusterId;
    if (clusterGroup && String(clusterGroup).trim()) filter.clusterGroup = String(clusterGroup).trim();

    const searchTerm = String(search || q || '').trim();
    if (searchTerm) {
        const safeTerm = escapeRegex(searchTerm);
        filter.$or = [
            { name: { $regex: safeTerm, $options: 'i' } },
            { shortForm: { $regex: safeTerm, $options: 'i' } },
            { address: { $regex: safeTerm, $options: 'i' } },
            { description: { $regex: safeTerm, $options: 'i' } },
            { shortDescription: { $regex: safeTerm, $options: 'i' } },
        ];
    }
    return { filter, categoryMissing };
}

async function resolveBulkTargetFilter(req: Request): Promise<Record<string, unknown>> {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)).filter(Boolean) : [];
    if (ids.length > 0) {
        return { _id: { $in: ids } };
    }

    const applyToFiltered = Boolean(req.body?.applyToFiltered);
    const filterPayload = (req.body?.filter && typeof req.body.filter === 'object')
        ? (req.body.filter as Record<string, unknown>)
        : {};
    if (!applyToFiltered) return {};

    const { filter } = buildUniversityFilter(filterPayload, { includeArchivedDefault: false });
    return filter;
}

/* ------------------------------- PUBLIC ------------------------------- */

export async function getUniversities(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const { page = '1', limit = '24', featured, sort = 'alphabetical', sortBy, sortOrder } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 24));
        const dashboardConfig = await getUniversityDashboardConfig();
        const { filter, categoryMissing } = buildUniversityFilter(req.query, { requireCategory: true, allowAllCategories: true });
        const taxonomy = await getActivePublicUniversityTaxonomy();
        const featuredRaw = String(req.query.featured || '').trim().toLowerCase();
        const featuredMode = ['true', '1', 'yes', 'on'].includes(featuredRaw);

        if (categoryMissing && !featuredMode) {
            res.status(400).json({
                message: 'Category is required for this endpoint.',
                code: 'CATEGORY_REQUIRED',
                defaultCategory: dashboardConfig.defaultCategory,
            });
            return;
        }

        const requestedCategory = typeof filter.category === 'string'
            ? normalizeUniversityCategory(filter.category)
            : '';
        if (taxonomy.activeCategoryNames.length > 0) {
            if (requestedCategory) {
                if (!taxonomy.activeCategorySet.has(requestedCategory)) {
                    res.json({
                        items: [],
                        page: pageNum,
                        limit: limitNum,
                        total: 0,
                    });
                    return;
                }
                filter.category = requestedCategory;
            } else {
                filter.category = { $in: taxonomy.activeCategoryNames };
            }
        }

        filter.isActive = true;
        if (featuredMode) filter.featured = true;
        const publicFilter = combineMongoFilters(filter, buildPublicUniversityExclusionQuery());

        const sortOption = featuredMode
            ? ({ featuredOrder: 1, name: 1 } as Record<string, 1 | -1>)
            : normalizeSort(sortBy, sortOrder, sort);
        const total = await University.countDocuments(publicFilter);
        const rows = await University.find(publicFilter)
            .select(PUBLIC_UNIVERSITY_LIST_PROJECTION)
            .sort(sortOption)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();
        const canonicalRows = rows.map((item) => toCanonicalUniversityRecord(
            stripInactiveClusterFromUniversityRecord(item as unknown as Record<string, unknown>, taxonomy),
        ));
        const rowsWithClusterSlugs = await attachClusterSlugs(canonicalRows);
        res.json({
            items: rowsWithClusterSlugs,
            page: pageNum,
            limit: limitNum,
            total,
        });
    } catch (error) {
        console.error('Get universities error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getUniversityCategories(_req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const publicUniversityMatch = combineMongoFilters(
            { isActive: true, isArchived: { $ne: true } },
            buildPublicUniversityExclusionQuery(),
        );
        const [categoryDocs, activeClusters, rows] = await Promise.all([
            UniversityCategory.find({ isActive: true }).select('name').sort({ homeOrder: 1, name: 1 }).lean(),
            UniversityCluster.find({ isActive: true }).select('name').lean(),
            University.aggregate([
                { $match: publicUniversityMatch },
                { $group: { _id: '$category', count: { $sum: 1 }, clusterGroups: { $addToSet: '$clusterGroup' } } },
            ]),
        ]);
        const activeClusterNames = new Set(activeClusters.map((item) => String(item.name || '').trim()).filter(Boolean));
        const activeCategoryNames = categoryDocs
            .map((item) => normalizeUniversityCategory(item.name))
            .filter(Boolean);
        const allowedCategorySet = new Set(activeCategoryNames);

        const map = new Map<string, { count: number; clusterGroups: Set<string> }>();
        rows.forEach((row) => {
            const name = normalizeUniversityCategory(row._id || DEFAULT_UNIVERSITY_CATEGORY);
            if (allowedCategorySet.size > 0 && !allowedCategorySet.has(name)) return;
            const existing = map.get(name) || { count: 0, clusterGroups: new Set<string>() };
            existing.count += Number(row.count || 0);
            if (Array.isArray(row.clusterGroups)) {
                row.clusterGroups
                    .map((value: unknown) => String(value || '').trim())
                    .filter(Boolean)
                    .filter((group: string) => activeClusterNames.has(group))
                    .forEach((group: string) => existing.clusterGroups.add(group));
            }
            map.set(name, existing);
        });

        const extra = activeCategoryNames.filter((name) => !UNIVERSITY_CATEGORY_ORDER.includes(name as (typeof UNIVERSITY_CATEGORY_ORDER)[number]));
        const ordered = [...UNIVERSITY_CATEGORY_ORDER, ...extra.sort((a, b) => a.localeCompare(b))]
            .filter((name, index, arr) => arr.indexOf(name) === index)
            .filter((name) => allowedCategorySet.size === 0 || allowedCategorySet.has(name));
        const categories = ordered.map((categoryName, index) => ({
            categoryName,
            categorySlug: normalizeSlug(categoryName),
            order: index + 1,
            count: map.get(categoryName)?.count || 0,
            clusterGroups: Array.from(map.get(categoryName)?.clusterGroups || []).sort(),
        }));
        res.json(categories);
    } catch (error) {
        console.error('Get university categories error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getUniversityBySlug(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const taxonomy = await getActivePublicUniversityTaxonomy();
        const row = await University.findOne({ slug: req.params.slug, isActive: true, isArchived: { $ne: true } }).lean();
        if (!row) { res.status(404).json({ message: 'University not found' }); return; }
        const categoryName = normalizeUniversityCategory(String(row.category || DEFAULT_UNIVERSITY_CATEGORY));
        if (taxonomy.activeCategoryNames.length > 0 && !taxonomy.activeCategorySet.has(categoryName)) {
            res.status(404).json({ message: 'University not found' });
            return;
        }
        const [withClusterSlug] = await attachClusterSlugs([toCanonicalUniversityRecord(
            stripInactiveClusterFromUniversityRecord(row as unknown as Record<string, unknown>, taxonomy),
        )]);
        res.json(withClusterSlug);
    } catch (error) {
        console.error('Get university error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

/* -------------------------------- ADMIN -------------------------------- */

export async function adminGetAllUniversities(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const { page = '1', limit = '25', sort, sortBy, sortOrder, fields } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 25));
        const { filter } = buildUniversityFilter(req.query, { includeArchivedDefault: false });
        const selectedIds = asStringIdList(req.query.selectedIds);
        if (selectedIds.length > 0) filter._id = { $in: selectedIds };
        const sortOption = normalizeSort(sortBy, sortOrder, sort);

        let projection = '';
        if (fields) projection = String(fields).split(',').map((item) => item.trim()).filter(Boolean).join(' ');

        const total = await University.countDocuments(filter);
        const query = University.find(filter).sort(sortOption).skip((pageNum - 1) * limitNum).limit(limitNum);
        if (projection) query.select(projection);
        const rows = await query.lean();
        const canonicalRows = rows.map((item) => toCanonicalUniversityRecord(item as unknown as Record<string, unknown>));
        const rowsWithClusterSlugs = await attachClusterSlugs(canonicalRows);

        res.json({
            universities: rowsWithClusterSlugs,
            pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        });
    } catch (err) {
        console.error('adminGetAllUniversities error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetUniversityCategories(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const statusFilter = asStatusFilter(req.query.status);
        const baseFilter: Record<string, unknown> = {};
        if (statusFilter === 'archived') baseFilter.isArchived = true;
        else if (statusFilter === 'active') { baseFilter.isArchived = { $ne: true }; baseFilter.isActive = true; }
        else if (statusFilter === 'inactive') { baseFilter.isArchived = { $ne: true }; baseFilter.isActive = false; }
        else baseFilter.isArchived = { $ne: true };

        const counts = await University.aggregate([
            { $match: baseFilter },
            { $group: { _id: '$category', count: { $sum: 1 }, clusterGroups: { $addToSet: '$clusterGroup' } } },
        ]);

        const normalizedMap = new Map<string, { count: number; clusterGroups: Set<string> }>();

        counts.forEach((row) => {
            const name = normalizeUniversityCategory(row._id || DEFAULT_UNIVERSITY_CATEGORY);
            const existing = normalizedMap.get(name) || { count: 0, clusterGroups: new Set<string>() };
            existing.count += Number(row.count || 0);
            if (Array.isArray(row.clusterGroups)) {
                row.clusterGroups
                    .map((v: unknown) => String(v || '').trim())
                    .filter(Boolean)
                    .forEach((group: string) => existing.clusterGroups.add(group));
            }
            normalizedMap.set(name, existing);
        });

        const categories = Array.from(normalizedMap.entries())
            .map(([name, meta]) => ({
                name,
                categorySlug: normalizeSlug(name),
                count: meta.count,
                clusterGroups: Array.from(meta.clusterGroups).sort(),
            }))
            .sort((a, b) => {
                const ai = getUniversityCategoryOrderIndex(a.name);
                const bi = getUniversityCategoryOrderIndex(b.name);
                if (ai !== bi) return ai - bi;
                return a.name.localeCompare(b.name);
            });

        res.json({ categories });
    } catch (err) {
        console.error('adminGetUniversityCategories error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetUniversityById(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const row = await University.findById(req.params.id).lean();
        if (!row) { res.status(404).json({ message: 'University not found' }); return; }
        const [university] = await attachClusterSlugs([toCanonicalUniversityRecord(row as unknown as Record<string, unknown>)]);
        res.json({ university });
    } catch (err) {
        console.error('adminGetUniversityById error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCreateUniversity(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const payload = buildUniversityMutationPayload((req.body || {}) as Record<string, unknown>);
        if (!payload.name || !String(payload.name).trim()) { res.status(400).json({ message: 'University name is required' }); return; }

        // Category validation against allowed list
        const catName = String(payload.category || '').trim();
        if (catName) {
            const settings = await ensureUniversitySettings();
            const isAllowed = (ALLOWED_CATEGORIES as readonly string[]).some((c) => c.toLowerCase() === catName.toLowerCase());
            if (!isAllowed && !settings.allowCustomCategories) {
                res.status(400).json({ message: `Category "${catName}" is not in the allowed list.`, code: 'INVALID_CATEGORY', allowedCategories: [...ALLOWED_CATEGORIES] });
                return;
            }
        }

        if (!payload.slug) payload.slug = normalizeSlug(String(payload.name || ''));
        const existing = await University.findOne({ slug: payload.slug });
        if (existing) payload.slug = `${payload.slug}-${Date.now()}`;
        const categoryFields = await resolveCategoryFields(payload);
        payload.category = categoryFields.category;
        payload.categoryId = categoryFields.categoryId;
        const clusterFields = await resolveClusterFields(payload);
        payload.clusterId = clusterFields.clusterId;
        payload.clusterName = clusterFields.clusterName;
        payload.clusterGroup = clusterFields.clusterGroup;
        normalizeClusterGroupValue(payload);
        payload.isArchived = false;
        payload.archivedAt = null;
        payload.archivedBy = null;
        const created = await University.create(payload);
        await syncManualClusterMembership([created._id], payload.clusterId ? String(payload.clusterId) : null);
        await reconcileUniversityClusterAssignments((req as Request & { user?: { _id?: string } }).user?._id || null);
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'create', universityId: String(created._id) } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'create', universityId: String(created._id) } });
        const [university] = await attachClusterSlugs([toCanonicalUniversityRecord(created.toObject() as unknown as Record<string, unknown>)]);
        res.status(201).json({ university, message: 'University created successfully' });
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) { res.status(400).json({ message: 'A university with this name or slug already exists' }); return; }
        console.error('adminCreateUniversity error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminUpdateUniversity(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const payload = buildUniversityMutationPayload((req.body || {}) as Record<string, unknown>, { partial: true });
        const existing = await University.findById(req.params.id).select('_id clusterId').lean();
        if (!existing) { res.status(404).json({ message: 'University not found' }); return; }

        // Category validation against allowed list
        const catName = String(payload.category || '').trim();
        if (catName) {
            const settings = await ensureUniversitySettings();
            const isAllowed = (ALLOWED_CATEGORIES as readonly string[]).some((c) => c.toLowerCase() === catName.toLowerCase());
            if (!isAllowed && !settings.allowCustomCategories) {
                res.status(400).json({ message: `Category "${catName}" is not in the allowed list.`, code: 'INVALID_CATEGORY', allowedCategories: [...ALLOWED_CATEGORIES] });
                return;
            }
        }

        if (payload.name && !payload.slug) payload.slug = normalizeSlug(String(payload.name || ''));
        if (payload.category !== undefined || payload.categoryId !== undefined) {
            const categoryFields = await resolveCategoryFields(payload);
            payload.category = categoryFields.category;
            payload.categoryId = categoryFields.categoryId;
        }
        if (payload.clusterGroup !== undefined || payload.clusterName !== undefined || payload.clusterId !== undefined) {
            const clusterFields = await resolveClusterFields(payload);
            payload.clusterId = clusterFields.clusterId;
            payload.clusterName = clusterFields.clusterName;
            payload.clusterGroup = clusterFields.clusterGroup;
            normalizeClusterGroupValue(payload);
        }
        const updated = await University.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
        if (!updated) { res.status(404).json({ message: 'University not found' }); return; }
        if (payload.clusterGroup !== undefined || payload.clusterName !== undefined || payload.clusterId !== undefined) {
            await syncManualClusterMembership([existing._id], updated.clusterId ? String(updated.clusterId) : null);
        }
        await reconcileUniversityClusterAssignments((req as Request & { user?: { _id?: string } }).user?._id || null);
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'update', universityId: String(updated._id) } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'update', universityId: String(updated._id) } });
        const [university] = await attachClusterSlugs([toCanonicalUniversityRecord(updated.toObject() as unknown as Record<string, unknown>)]);
        res.json({ university, message: 'University updated successfully' });
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) { res.status(400).json({ message: 'Slug or name already taken by another university' }); return; }
        console.error('adminUpdateUniversity error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminDeleteUniversity(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const mode = String(req.query.mode || 'hard').toLowerCase() === 'soft' ? 'soft' : 'hard';
        const actorId = (req as Request & { user?: { _id?: string } }).user?._id || null;
        if (mode === 'soft') {
            const updated = await University.findByIdAndUpdate(req.params.id, { $set: { isArchived: true, isActive: false, archivedAt: new Date(), archivedBy: actorId } }, { new: true });
            if (!updated) { res.status(404).json({ message: 'University not found' }); return; }
        } else {
            const removed = await University.findByIdAndDelete(req.params.id);
            if (!removed) { res.status(404).json({ message: 'University not found' }); return; }
        }
        await reconcileUniversityClusterAssignments(actorId || null);
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'delete', universityId: req.params.id, mode } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'delete', universityId: req.params.id, mode } });
        res.json({ message: mode === 'soft' ? 'University archived successfully' : 'University deleted successfully' });
    } catch (err) {
        console.error('adminDeleteUniversity error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminBulkDeleteUniversities(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const targetFilter = await resolveBulkTargetFilter(req);
        const mode = String(req.body?.mode || 'soft').toLowerCase() === 'hard' ? 'hard' : 'soft';
        const taxonomyScope = String(req.body?.taxonomyScope || 'none').toLowerCase() === 'uni-taxonomy'
            ? 'uni-taxonomy'
            : 'none';
        if (Object.keys(targetFilter).length === 0) { res.status(400).json({ message: 'Invalid or empty target selection provided.' }); return; }
        const actorId = (req as Request & { user?: { _id?: string } }).user?._id || null;
        let affected = 0;
        let taxonomyPruned = false;
        if (mode === 'hard') {
            const result = await University.deleteMany(targetFilter);
            affected = Number(result.deletedCount || 0);
        } else {
            const result = await University.updateMany(
                targetFilter,
                { $set: { isArchived: true, archivedAt: new Date(), archivedBy: actorId, isActive: false } },
            );
            affected = Number(result.modifiedCount || 0);
        }
        if (taxonomyScope === 'uni-taxonomy' && affected > 0) {
            const remainingActiveUniversities = await University.countDocuments({ isArchived: { $ne: true } });
            if (remainingActiveUniversities === 0) {
                await Promise.all([
                    UniversityCategory.deleteMany({}),
                    UniversityCluster.deleteMany({}),
                    HomeSettings.updateMany({}, { $set: { highlightedCategories: [], featuredUniversities: [] } }),
                    HomeConfig.updateMany({}, { $set: { selectedUniversityCategories: [], highlightCategoryIds: [] } }),
                ]);
                taxonomyPruned = true;
            }
        }
        await reconcileUniversityClusterAssignments(actorId || null);
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'bulk_delete', mode, affected } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'bulk_delete', mode, affected } });
        res.json({
            message: mode === 'hard' ? `${affected} universities permanently deleted.` : `${affected} universities archived.`,
            affected,
            mode,
            taxonomyScope,
            taxonomyPruned,
            skipped: [],
            errors: [],
        });
    } catch (err) {
        console.error('adminBulkDeleteUniversities error:', err);
        res.status(500).json({ message: 'Server error during bulk deletion.' });
    }
}

export async function adminBulkUpdateUniversities(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const targetFilter = await resolveBulkTargetFilter(req);
        if (Object.keys(targetFilter).length === 0) { res.status(400).json({ message: 'No university targets provided.' }); return; }
        const updates = buildUniversityMutationPayload((req.body?.updates || {}) as Record<string, unknown>, { partial: true });
        if (updates.category !== undefined || updates.categoryId !== undefined) {
            const categoryFields = await resolveCategoryFields(updates);
            updates.category = categoryFields.category;
            updates.categoryId = categoryFields.categoryId;
        }
        const targetIds = await University.find({ ...targetFilter, isArchived: { $ne: true } }).select('_id').lean();
        if (updates.clusterGroup !== undefined || updates.clusterName !== undefined || updates.clusterId !== undefined) {
            const clusterFields = await resolveClusterFields(updates);
            updates.clusterId = clusterFields.clusterId;
            updates.clusterName = clusterFields.clusterName;
            updates.clusterGroup = clusterFields.clusterGroup;
            normalizeClusterGroupValue(updates);
            await syncManualClusterMembership(
                targetIds.map((item) => item._id),
                updates.clusterId ? String(updates.clusterId) : null,
            );
        }
        const result = await University.updateMany({ ...targetFilter, isArchived: { $ne: true } }, { $set: updates });
        const affected = Number(result.modifiedCount || 0);
        await reconcileUniversityClusterAssignments((req as Request & { user?: { _id?: string } }).user?._id || null);
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'bulk_update', affected } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'bulk_update', affected } });
        res.json({ message: `${affected} universities updated.`, affected });
    } catch (err) {
        console.error('adminBulkUpdateUniversities error:', err);
        res.status(500).json({ message: 'Server error during bulk update.' });
    }
}

export async function adminToggleUniversityStatus(req: Request, res: Response): Promise<void> {
    try {
        const university = await University.findById(req.params.id);
        if (!university) { res.status(404).json({ message: 'University not found' }); return; }
        if (university.isArchived) { res.status(400).json({ message: 'Archived university cannot be activated. Restore it first.' }); return; }
        university.isActive = !university.isActive;
        await university.save();
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'toggle', universityId: String(university._id), isActive: university.isActive } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'toggle', universityId: String(university._id), isActive: university.isActive } });
        res.json({ university: toCanonicalUniversityRecord(university.toObject() as unknown as Record<string, unknown>), message: `University ${university.isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
        console.error('adminToggleUniversityStatus error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminReorderFeaturedUniversities(req: Request, res: Response): Promise<void> {
    try {
        const { order } = req.body as { order: { id: string; featuredOrder: number }[] };
        if (!Array.isArray(order)) { res.status(400).json({ message: 'Invalid order format' }); return; }
        if (order.length > 0) await University.bulkWrite(order.map((item) => ({ updateOne: { filter: { _id: item.id, isArchived: { $ne: true } }, update: { $set: { featuredOrder: item.featuredOrder } } } })));
        broadcastStudentDashboardEvent({ type: 'featured_university_updated', meta: { action: 'reorder' } });
        broadcastHomeStreamEvent({ type: 'home-updated', meta: { source: 'university', action: 'reorder' } });
        res.json({ message: 'Featured order updated successfully' });
    } catch (err) {
        console.error('adminReorderFeaturedUniversities error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminExportUniversities(req: Request, res: Response): Promise<void> {
    try {
        await backfillUniversityTaxonomyIfNeeded();
        const format = String(req.query.format || req.query.type || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
        const { filter } = buildUniversityFilter(req.query, { includeArchivedDefault: false });
        const selectedIds = asStringIdList(req.query.selectedIds);
        if (selectedIds.length > 0) filter._id = { $in: selectedIds };
        const rows = await University.find(filter).sort(normalizeSort(req.query.sortBy, req.query.sortOrder, req.query.sort || 'name')).lean();
        const mapped = rows.map((row) => {
            const u = toCanonicalUniversityRecord(row as unknown as Record<string, unknown>);
            return {
                category: String(u.category || ''),
                clusterGroup: String(u.clusterGroup || ''),
                name: String(u.name || ''),
                shortForm: String(u.shortForm || ''),
                shortDescription: String(u.shortDescription || ''),
                description: String(u.description || ''),
                establishedYear: String(u.establishedYear || ''),
                address: String(u.address || ''),
                contactNumber: String(u.contactNumber || ''),
                email: String(u.email || ''),
                websiteUrl: String(u.websiteUrl || ''),
                admissionUrl: String(u.admissionUrl || ''),
                totalSeats: String(u.totalSeats || ''),
                seatsScienceEng: String(u.seatsScienceEng || ''),
                seatsArtsHum: String(u.seatsArtsHum || ''),
                seatsBusiness: String(u.seatsBusiness || ''),
                applicationStartDate: toDateString(u.applicationStartDate),
                applicationEndDate: toDateString(u.applicationEndDate),
                examDateScience: String(u.examDateScience || ''),
                examDateArts: String(u.examDateArts || ''),
                examDateBusiness: String(u.examDateBusiness || ''),
                examCenters: serializeExamCenters(u.examCenters),
                logoUrl: String(u.logoUrl || ''),
                isActive: String(Boolean(u.isActive)),
                featured: String(Boolean(u.featured)),
                featuredOrder: String(u.featuredOrder || ''),
                categorySyncLocked: String(Boolean(u.categorySyncLocked)),
                clusterSyncLocked: String(Boolean(u.clusterSyncLocked)),
                verificationStatus: String(u.verificationStatus || ''),
                remarks: String(u.remarks || ''),
                slug: String(u.slug || ''),
            };
        });

        const headers = Object.keys(mapped[0] || {
            category: '', clusterGroup: '', name: '', shortForm: '', shortDescription: '', description: '', establishedYear: '', address: '', contactNumber: '', email: '',
            websiteUrl: '', admissionUrl: '', totalSeats: '', seatsScienceEng: '', seatsArtsHum: '', seatsBusiness: '',
            applicationStartDate: '', applicationEndDate: '', examDateScience: '', examDateArts: '', examDateBusiness: '',
            examCenters: '', logoUrl: '', isActive: '', featured: '', featuredOrder: '', categorySyncLocked: '', clusterSyncLocked: '', verificationStatus: '', remarks: '', slug: '',
        });

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Universities');
            sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, header.length + 4) }));
            mapped.forEach((row) => sheet.addRow(row));
            res.setHeader('Content-Disposition', 'attachment; filename=universities_export.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        const csvLines = mapped.map((row) => headers.map((header) => csvEscape((row as Record<string, unknown>)[header])).join(','));
        const csv = `${headers.join(',')}\n${csvLines.join('\n')}`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=universities_export.csv');
        res.send(csv);
    } catch (err) {
        console.error('adminExportUniversities error:', err);
        res.status(500).json({ message: 'Failed to export universities.' });
    }
}
