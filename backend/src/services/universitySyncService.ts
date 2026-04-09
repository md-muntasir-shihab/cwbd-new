import mongoose from 'mongoose';
import slugify from 'slugify';
import HomeSettings from '../models/HomeSettings';
import University, { type IExamCenter } from '../models/University';
import UniversityCategory from '../models/UniversityCategory';
import UniversityCluster from '../models/UniversityCluster';
import UniversitySettings from '../models/UniversitySettings';
import { DEFAULT_UNIVERSITY_CATEGORY, normalizeUniversityCategory } from '../utils/universityCategories';

type SharedSyncConfig = {
    applicationStartDate?: Date | null;
    applicationEndDate?: Date | null;
    scienceExamDate?: string;
    artsExamDate?: string;
    businessExamDate?: string;
    commerceExamDate?: string;
    admissionWebsite?: string;
    examCenters?: IExamCenter[];
};

export interface UniversitySyncSummary {
    synced: number;
    skipped: number;
}

export interface UniversityClusterResolutionWarning {
    universityId: string;
    universityName: string;
    clusterIds: string[];
    clusterNames: string[];
    winnerClusterId: string;
    winnerClusterName: string;
    reason: 'multiple_clusters' | 'multiple_manual_clusters';
}

export interface UniversityClusterResolutionSummary {
    resolvedCount: number;
    detachedCount: number;
    warnings: UniversityClusterResolutionWarning[];
    clusterMemberCounts: Record<string, number>;
}

type ClusterCandidate = {
    clusterId: string;
    clusterName: string;
    orderIndex: number;
    manual: boolean;
};

const BACKFILL_TTL_MS = 5 * 60 * 1000;
let lastBackfillAt = 0;
let backfillPromise: Promise<void> | null = null;

function pickString(value: unknown, fallback = ''): string {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function asNullableObjectId(value: string | null | undefined): mongoose.Types.ObjectId | null {
    const raw = pickString(value);
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function normalizeClusterName(name: unknown): string {
    return pickString(name);
}

function normalizeSlug(source: string, fallbackPrefix: string): string {
    const raw = slugify(source || '', { lower: true, strict: true });
    return raw || `${fallbackPrefix}-${Date.now()}`;
}

function parseDateValue(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const raw = pickString(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeExamDateValue(value: unknown): string {
    const raw = pickString(value);
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString();
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = pickString(value).toLowerCase();
    if (['true', '1', 'yes', 'y', 'active', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'inactive', 'off'].includes(normalized)) return false;
    return fallback;
}

function splitDelimitedValues(raw: string): string[] {
    return raw
        .split(/\r?\n|\|/g)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function normalizeExamCenters(value: unknown): IExamCenter[] {
    const seen = new Set<string>();
    const output: IExamCenter[] = [];

    const push = (city: unknown, address: unknown) => {
        const normalizedCity = pickString(city);
        const normalizedAddress = pickString(address);
        if (!normalizedCity) return;
        const key = `${normalizedCity.toLowerCase()}::${normalizedAddress.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({ city: normalizedCity, address: normalizedAddress });
    };

    if (Array.isArray(value)) {
        value.forEach((item) => {
            if (typeof item === 'string') {
                splitDelimitedValues(item).forEach((part) => {
                    const pieces = part.split(/\s+-\s+|\s+:\s+/);
                    push(pieces[0], pieces.slice(1).join(' - '));
                });
                return;
            }
            if (item && typeof item === 'object') {
                push(
                    (item as { city?: unknown; name?: unknown }).city ?? (item as { name?: unknown }).name,
                    (item as { address?: unknown }).address,
                );
            }
        });
        return output;
    }

    const raw = pickString(value);
    if (!raw) return output;
    splitDelimitedValues(raw).forEach((part) => {
        const pieces = part.split(/\s+-\s+|\s+:\s+/);
        push(pieces[0], pieces.slice(1).join(' - '));
    });
    return output;
}

export function serializeExamCenters(value: unknown): string {
    return normalizeExamCenters(value)
        .map((center) => [center.city, center.address].filter(Boolean).join(' - '))
        .join(' | ');
}

function normalizeObjectIdList(values: unknown): mongoose.Types.ObjectId[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const output: mongoose.Types.ObjectId[] = [];
    values.forEach((item) => {
        const raw = pickString(item);
        if (!raw || !mongoose.Types.ObjectId.isValid(raw) || seen.has(raw)) return;
        seen.add(raw);
        output.push(new mongoose.Types.ObjectId(raw));
    });
    return output;
}

function categorySharedConfigToUpdate(config: SharedSyncConfig): Record<string, unknown> {
    const scienceExamDate = normalizeExamDateValue(config.scienceExamDate);
    const artsExamDate = normalizeExamDateValue(config.artsExamDate);
    const businessExamDate = normalizeExamDateValue(config.businessExamDate ?? config.commerceExamDate);
    return {
        applicationStartDate: parseDateValue(config.applicationStartDate),
        applicationEndDate: parseDateValue(config.applicationEndDate),
        scienceExamDate,
        examDateScience: scienceExamDate,
        artsExamDate,
        examDateArts: artsExamDate,
        businessExamDate,
        examDateBusiness: businessExamDate,
        examCenters: normalizeExamCenters(config.examCenters || []),
    };
}

function clusterSharedConfigToUpdate(config: SharedSyncConfig, overrides?: Record<string, unknown> | null): Record<string, unknown> {
    const source = overrides || {};
    const hasOverride = (key: string) => source[key] !== undefined && source[key] !== null && source[key] !== '';
    const scienceExamDate = hasOverride('scienceExamDate')
        ? normalizeExamDateValue(source.scienceExamDate)
        : normalizeExamDateValue(config.scienceExamDate);
    const artsExamDate = hasOverride('artsExamDate')
        ? normalizeExamDateValue(source.artsExamDate)
        : normalizeExamDateValue(config.artsExamDate);
    const businessExamDate = hasOverride('businessExamDate')
        ? normalizeExamDateValue(source.businessExamDate)
        : normalizeExamDateValue(config.businessExamDate ?? config.commerceExamDate);
    const hasAdmissionOverride = hasOverride('admissionWebsite') || hasOverride('admissionUrl');
    const admissionWebsite = hasAdmissionOverride
        ? pickString(source.admissionWebsite || source.admissionUrl)
        : pickString(config.admissionWebsite);
    const update: Record<string, unknown> = {
        applicationStartDate: hasOverride('applicationStartDate')
            ? parseDateValue(source.applicationStartDate)
            : parseDateValue(config.applicationStartDate),
        applicationEndDate: hasOverride('applicationEndDate')
            ? parseDateValue(source.applicationEndDate)
            : parseDateValue(config.applicationEndDate),
        scienceExamDate,
        examDateScience: scienceExamDate,
        artsExamDate,
        examDateArts: artsExamDate,
        businessExamDate,
        examDateBusiness: businessExamDate,
        examCenters: normalizeExamCenters(config.examCenters || []),
    };
    if (admissionWebsite) {
        update.admissionWebsite = admissionWebsite;
        update.admissionUrl = admissionWebsite;
    }
    return update;
}

export async function ensureUniversityCategoryByName(name: unknown): Promise<{ _id: mongoose.Types.ObjectId; name: string }> {
    const normalizedName = normalizeUniversityCategory(name || DEFAULT_UNIVERSITY_CATEGORY);
    const existing = await UniversityCategory.findOne({ name: normalizedName }).select('_id name').lean();
    if (existing) return { _id: existing._id, name: normalizedName };

    let slug = normalizeSlug(normalizedName, 'category');
    const slugExists = await UniversityCategory.findOne({ slug }).select('_id').lean();
    if (slugExists) slug = `${slug}-${Date.now()}`;

    try {
        const created = await UniversityCategory.create({
            name: normalizedName,
            slug,
            isActive: true,
            homeHighlight: false,
            homeOrder: 0,
        });
        return { _id: created._id, name: created.name };
    } catch (error) {
        const fallback = await UniversityCategory.findOne({ name: normalizedName }).select('_id name').lean();
        if (fallback) return { _id: fallback._id, name: normalizedName };
        throw error;
    }
}

export async function ensureUniversityClusterByName(name: unknown): Promise<{ _id: mongoose.Types.ObjectId; name: string }> {
    const normalizedName = normalizeClusterName(name);
    if (!normalizedName) {
        throw new Error('Cluster name is required.');
    }
    const existing = await UniversityCluster.findOne({ name: normalizedName }).select('_id name').lean();
    if (existing) return { _id: existing._id, name: normalizedName };

    let slug = normalizeSlug(normalizedName, 'cluster');
    const slugExists = await UniversityCluster.findOne({ slug }).select('_id').lean();
    if (slugExists) slug = `${slug}-${Date.now()}`;

    try {
        const created = await UniversityCluster.create({
            name: normalizedName,
            slug,
            description: '',
            isActive: true,
            memberUniversityIds: [],
            categoryRules: [],
            categoryRuleIds: [],
            dates: {},
            syncPolicy: 'inherit_with_override',
            homeVisible: false,
            homeOrder: 0,
        });
        return { _id: created._id, name: created.name };
    } catch (error) {
        const fallback = await UniversityCluster.findOne({ name: normalizedName }).select('_id name').lean();
        if (fallback) return { _id: fallback._id, name: normalizedName };
        throw error;
    }
}

async function getClusterCategoryNames(cluster: {
    categoryRules?: unknown;
    categoryRuleIds?: unknown;
}): Promise<string[]> {
    const legacyNames = Array.isArray(cluster.categoryRules)
        ? cluster.categoryRules.map((item) => pickString(item)).filter(Boolean)
        : [];
    const ruleIds = normalizeObjectIdList(cluster.categoryRuleIds);
    if (ruleIds.length === 0) {
        return Array.from(new Set(legacyNames));
    }

    const categories = await UniversityCategory.find({ _id: { $in: ruleIds }, isActive: true })
        .select('name')
        .lean();
    return Array.from(
        new Set([
            ...legacyNames,
            ...categories.map((item) => pickString(item.name)).filter(Boolean),
        ]),
    );
}

export async function syncUniversityCategorySharedConfig(
    categoryId: string,
    actorId?: string | null,
): Promise<UniversitySyncSummary> {
    const category = await UniversityCategory.findById(categoryId);
    if (!category) throw new Error('Category not found.');

    const filter = {
        isArchived: { $ne: true },
        $and: [
            { $or: [{ categoryId: category._id }, { category: category.name }] },
            { $or: [{ clusterId: null }, { clusterId: { $exists: false } }] },
        ],
    };
    const members = await University.find(filter).select('_id categorySyncLocked').lean();
    const targetIds = members
        .filter((item) => !Boolean((item as { categorySyncLocked?: boolean }).categorySyncLocked))
        .map((item) => item._id);
    const skipped = members.length - targetIds.length;

    if (targetIds.length > 0) {
        await University.updateMany(
            { _id: { $in: targetIds } },
            { $set: categorySharedConfigToUpdate(category.sharedConfig) },
        );
    }

    category.syncMeta = {
        lastSyncedAt: new Date(),
        lastSyncedBy: asNullableObjectId(actorId ?? null),
        lastSyncedCount: targetIds.length,
        skippedCount: skipped,
    };
    await category.save();

    return {
        synced: targetIds.length,
        skipped,
    };
}

export async function renameUniversityCategoryReferences(
    categoryId: string,
    previousName: string,
    nextName: string,
): Promise<void> {
    const previous = pickString(previousName);
    const next = pickString(nextName);
    if (!previous || !next || previous === next) return;

    const categoryObjectId = asNullableObjectId(categoryId);
    const universityFilter: Record<string, unknown> = categoryObjectId
        ? { $or: [{ categoryId: categoryObjectId }, { category: previous }] }
        : { category: previous };

    await University.updateMany(
        universityFilter,
        {
            $set: {
                category: next,
                ...(categoryObjectId ? { categoryId: categoryObjectId } : {}),
            },
        },
    );

    const affectedClusters = await UniversityCluster.find({ categoryRules: previous });
    for (const cluster of affectedClusters) {
        const nextRules = Array.from(
            new Set((cluster.categoryRules || []).map((item) => (pickString(item) === previous ? next : pickString(item))).filter(Boolean)),
        );
        cluster.categoryRules = nextRules;
        await cluster.save();
    }

    const homeSettings = await HomeSettings.findOne();
    if (homeSettings) {
        let touched = false;

        if (pickString(homeSettings.universityDashboard?.defaultCategory) === previous) {
            homeSettings.universityDashboard.defaultCategory = next;
            touched = true;
        }
        if (pickString(homeSettings.universityPreview?.defaultActiveCategory) === previous) {
            homeSettings.universityPreview.defaultActiveCategory = next;
            touched = true;
        }
        if (Array.isArray(homeSettings.highlightedCategories)) {
            const nextHighlighted = homeSettings.highlightedCategories.map((item) => {
                if (pickString(item.category) !== previous) return item;
                touched = true;
                return { ...item, category: next };
            });
            homeSettings.highlightedCategories = nextHighlighted;
        }

        if (touched) {
            await homeSettings.save();
        }
    }

    const universitySettings = await UniversitySettings.findOne();
    if (universitySettings) {
        let touched = false;

        if (pickString(universitySettings.defaultCategory) === previous) {
            universitySettings.defaultCategory = next;
            touched = true;
        }

        if (Array.isArray(universitySettings.highlightedCategories)) {
            const nextHighlighted = universitySettings.highlightedCategories.map((item) => {
                if (pickString(item) !== previous) return pickString(item);
                touched = true;
                return next;
            });
            universitySettings.highlightedCategories = Array.from(new Set(nextHighlighted.filter(Boolean)));
        }

        if (touched) {
            await universitySettings.save();
        }
    }
}

export async function syncUniversityClusterSharedConfig(
    clusterId: string,
    actorId?: string | null,
): Promise<UniversitySyncSummary> {
    const cluster = await UniversityCluster.findById(clusterId);
    if (!cluster) throw new Error('Cluster not found.');

    const members = await University.find({ clusterId: cluster._id, isArchived: { $ne: true } })
        .select('_id clusterSyncLocked clusterDateOverrides')
        .lean();

    const ops = members
        .filter((item) => !Boolean((item as { clusterSyncLocked?: boolean }).clusterSyncLocked))
        .map((item) => ({
            updateOne: {
                filter: { _id: item._id },
                update: {
                    $set: clusterSharedConfigToUpdate(
                        cluster.dates as unknown as SharedSyncConfig,
                        (item as { clusterDateOverrides?: Record<string, unknown> }).clusterDateOverrides || {},
                    ),
                },
            },
        }));
    const skipped = members.length - ops.length;

    if (ops.length > 0) {
        await University.bulkWrite(ops);
    }

    cluster.updatedBy = asNullableObjectId(actorId ?? null);
    await cluster.save();

    return {
        synced: ops.length,
        skipped,
    };
}

export async function syncManualClusterMembership(
    universityIds: Array<string | mongoose.Types.ObjectId>,
    clusterId?: string | null,
): Promise<void> {
    const normalizedUniversityIds = normalizeObjectIdList(universityIds);
    if (normalizedUniversityIds.length === 0) return;

    const nextClusterId = asNullableObjectId(clusterId ?? null);
    await UniversityCluster.updateMany(
        {
            memberUniversityIds: { $in: normalizedUniversityIds },
            ...(nextClusterId ? { _id: { $ne: nextClusterId } } : {}),
        },
        {
            $pull: {
                memberUniversityIds: { $in: normalizedUniversityIds },
            },
        },
    );

    if (nextClusterId) {
        await UniversityCluster.updateOne(
            { _id: nextClusterId },
            {
                $addToSet: {
                    memberUniversityIds: { $each: normalizedUniversityIds },
                },
            },
        );
    }
}

export async function reconcileUniversityClusterAssignments(
    actorId?: string | null,
): Promise<UniversityClusterResolutionSummary> {
    const clusters = await UniversityCluster.find({ isActive: true })
        .sort({ homeOrder: 1, createdAt: 1, _id: 1 })
        .lean();

    const clusterIds = clusters.map((cluster) => cluster._id);
    const universities = await University.find({ isArchived: { $ne: true } })
        .select('_id name shortForm category clusterId clusterName clusterGroup')
        .lean();

    const universityById = new Map(
        universities.map((item) => [String(item._id), item as Record<string, unknown>]),
    );
    const universitiesByCategory = new Map<string, string[]>();
    universities.forEach((item) => {
        const category = pickString((item as { category?: unknown }).category);
        const universityId = String(item._id);
        if (!universitiesByCategory.has(category)) universitiesByCategory.set(category, []);
        universitiesByCategory.get(category)!.push(universityId);
    });

    const candidateMap = new Map<string, ClusterCandidate[]>();
    for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        const clusterId = String(cluster._id);
        const clusterName = cluster.name;
        const categoryNames = await getClusterCategoryNames(cluster);
        const categoryMembers = categoryNames.flatMap((name) => universitiesByCategory.get(name) || []);
        const manualMembers = normalizeObjectIdList(cluster.memberUniversityIds).map((item) => String(item));
        const seenForCluster = new Set<string>();

        manualMembers.forEach((universityId) => {
            if (!universityById.has(universityId) || seenForCluster.has(universityId)) return;
            seenForCluster.add(universityId);
            const next = candidateMap.get(universityId) || [];
            next.push({ clusterId, clusterName, orderIndex: index, manual: true });
            candidateMap.set(universityId, next);
        });

        categoryMembers.forEach((universityId) => {
            if (!universityById.has(universityId) || seenForCluster.has(universityId)) return;
            seenForCluster.add(universityId);
            const next = candidateMap.get(universityId) || [];
            next.push({ clusterId, clusterName, orderIndex: index, manual: false });
            candidateMap.set(universityId, next);
        });
    }

    const assignments = new Map<string, ClusterCandidate>();
    const warnings: UniversityClusterResolutionWarning[] = [];

    candidateMap.forEach((candidates, universityId) => {
        const ordered = [...candidates].sort((left, right) => {
            if (left.manual !== right.manual) return left.manual ? -1 : 1;
            return left.orderIndex - right.orderIndex;
        });
        const winner = ordered[0];
        assignments.set(universityId, winner);

        const distinctClusters = Array.from(new Set(ordered.map((item) => item.clusterId)));
        if (distinctClusters.length > 1) {
            const university = universityById.get(universityId);
            warnings.push({
                universityId,
                universityName: pickString(university?.name, pickString(university?.shortForm, 'University')),
                clusterIds: distinctClusters,
                clusterNames: Array.from(new Set(ordered.map((item) => item.clusterName))),
                winnerClusterId: winner.clusterId,
                winnerClusterName: winner.clusterName,
                reason: ordered.filter((item) => item.manual).length > 1 ? 'multiple_manual_clusters' : 'multiple_clusters',
            });
        }
    });

    const clusterMemberCounts: Record<string, number> = {};
    const assignmentEntries = Array.from(assignments.entries());
    assignmentEntries.forEach(([, candidate]) => {
        clusterMemberCounts[candidate.clusterId] = (clusterMemberCounts[candidate.clusterId] || 0) + 1;
    });

    const assignedIds = assignmentEntries.map(([universityId]) => new mongoose.Types.ObjectId(universityId));
    const detachFilter: Record<string, unknown> = {
        isArchived: { $ne: true },
        $or: [
            { clusterId: { $in: clusterIds } },
            { clusterId: { $ne: null } },
            { clusterGroup: { $ne: '' } },
            { clusterName: { $ne: '' } },
        ],
    };
    if (assignedIds.length > 0) {
        detachFilter._id = { $nin: assignedIds };
    }
    const detachResult = await University.updateMany(
        detachFilter,
        { $set: { clusterId: null, clusterName: '', clusterGroup: '', clusterCount: 0 } },
    );

    if (assignmentEntries.length > 0) {
        await University.bulkWrite(
            assignmentEntries.map(([universityId, candidate]) => ({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(universityId) },
                    update: {
                        $set: {
                            clusterId: new mongoose.Types.ObjectId(candidate.clusterId),
                            clusterName: candidate.clusterName,
                            clusterGroup: candidate.clusterName,
                            clusterCount: clusterMemberCounts[candidate.clusterId] || 0,
                        },
                    },
                },
            })),
        );
    }

    if (clusters.length > 0) {
        const liveUniversityIds = new Set(universities.map((item) => String(item._id)));
        await UniversityCluster.bulkWrite(
            clusters.map((cluster) => ({
                updateOne: {
                    filter: { _id: cluster._id },
                    update: {
                        $set: {
                            memberUniversityIds: normalizeObjectIdList(cluster.memberUniversityIds).filter((item) => liveUniversityIds.has(String(item))),
                            updatedBy: asNullableObjectId(actorId ?? null),
                        },
                    },
                },
            })),
        );
    }

    return {
        resolvedCount: assignmentEntries.length,
        detachedCount: Number(detachResult.modifiedCount || 0),
        warnings,
        clusterMemberCounts,
    };
}

async function backfillUniversityTaxonomyInternal(): Promise<void> {
    const universities = await University.find({})
        .select('_id category categoryId clusterGroup clusterId clusterName')
        .lean();

    const categoryNames = Array.from(
        new Set(
            universities
                .map((item) => normalizeUniversityCategory((item as { category?: unknown }).category || DEFAULT_UNIVERSITY_CATEGORY))
                .filter(Boolean),
        ),
    );
    const clusterNames = Array.from(
        new Set(
            universities
                .map((item) => normalizeClusterName((item as { clusterGroup?: unknown }).clusterGroup))
                .filter(Boolean),
        ),
    );

    const [categories, clusters] = await Promise.all([
        UniversityCategory.find({}).select('_id name').lean(),
        UniversityCluster.find({}).select('_id name memberUniversityIds').lean(),
    ]);
    const categoryMap = new Map(categories.map((item) => [item.name, item]));
    const clusterMap = new Map(clusters.map((item) => [item.name, item]));

    const universityOps = universities.flatMap((item) => {
        const update: Record<string, unknown> = {};
        const normalizedCategory = normalizeUniversityCategory(
            (item as { category?: unknown }).category || DEFAULT_UNIVERSITY_CATEGORY,
        );
        const categoryDoc = categoryMap.get(normalizedCategory);
        const currentCategoryId = pickString((item as { categoryId?: unknown }).categoryId);
        if (normalizedCategory !== pickString((item as { category?: unknown }).category)) {
            update.category = normalizedCategory;
        }
        if (categoryDoc && String(categoryDoc._id) !== currentCategoryId) {
            update.categoryId = categoryDoc._id;
        }

        const clusterName = normalizeClusterName((item as { clusterGroup?: unknown }).clusterGroup);
        const clusterDoc = clusterName ? clusterMap.get(clusterName) : null;
        const currentClusterId = pickString((item as { clusterId?: unknown }).clusterId);
        if (clusterDoc) {
            if (String(clusterDoc._id) !== currentClusterId) update.clusterId = clusterDoc._id;
            if (pickString((item as { clusterName?: unknown }).clusterName) !== clusterDoc.name) update.clusterName = clusterDoc.name;
            if (clusterName !== clusterDoc.name) update.clusterGroup = clusterDoc.name;
        } else if (clusterName) {
            update.clusterId = null;
            update.clusterName = '';
            update.clusterGroup = '';
            update.clusterCount = 0;
        }

        if (Object.keys(update).length === 0) return [];
        return [{
            updateOne: {
                filter: { _id: item._id },
                update: { $set: update },
            },
        }];
    });

    if (universityOps.length > 0) {
        await University.bulkWrite(universityOps);
    }

    const clusterMemberOps = clusterNames.flatMap((clusterName) => {
        const cluster = clusterMap.get(clusterName);
        if (!cluster) return [];
        const memberIds = universities
            .filter((item) => normalizeClusterName((item as { clusterGroup?: unknown }).clusterGroup) === clusterName)
            .map((item) => item._id);
        const merged = normalizeObjectIdList([
            ...(Array.isArray(cluster.memberUniversityIds) ? cluster.memberUniversityIds : []),
            ...memberIds,
        ]);
        return [{
            updateOne: {
                filter: { _id: cluster._id },
                update: { $set: { memberUniversityIds: merged } },
            },
        }];
    });

    if (clusterMemberOps.length > 0) {
        await UniversityCluster.bulkWrite(clusterMemberOps);
    }

    await reconcileUniversityClusterAssignments();
}

export async function backfillUniversityTaxonomyIfNeeded(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastBackfillAt < BACKFILL_TTL_MS) return;
    if (backfillPromise) {
        await backfillPromise;
        return;
    }

    backfillPromise = backfillUniversityTaxonomyInternal()
        .then(() => {
            lastBackfillAt = Date.now();
        })
        .finally(() => {
            backfillPromise = null;
        });

    await backfillPromise;
}

export function normalizeUniversityImportRow(input: Record<string, unknown>): Record<string, unknown> {
    const category = normalizeUniversityCategory(input.category || DEFAULT_UNIVERSITY_CATEGORY);
    const clusterGroup = normalizeClusterName(input.clusterGroup);
    return {
        ...input,
        category,
        clusterGroup,
        applicationStartDate: parseDateValue(input.applicationStartDate),
        applicationEndDate: parseDateValue(input.applicationEndDate),
        examDateScience: normalizeExamDateValue(input.examDateScience),
        examDateArts: normalizeExamDateValue(input.examDateArts),
        examDateBusiness: normalizeExamDateValue(input.examDateBusiness),
        isActive: normalizeBoolean(input.isActive, true),
        featured: normalizeBoolean(input.featured, false),
        categorySyncLocked: normalizeBoolean(input.categorySyncLocked, false),
        clusterSyncLocked: normalizeBoolean(input.clusterSyncLocked, false),
        examCenters: normalizeExamCenters(input.examCenters),
    };
}

export async function pruneOrphanedTaxonomy(): Promise<void> {
    const activeUniversities = await University.find({ isArchived: { $ne: true } })
        .select('categoryId clusterId')
        .lean();

    const usedCategoryIds = new Set(
        activeUniversities.map((u) => u.categoryId ? String(u.categoryId) : null).filter(Boolean)
    );
    const usedClusterIds = new Set(
        activeUniversities.map((u) => u.clusterId ? String(u.clusterId) : null).filter(Boolean)
    );

    const categories = await UniversityCategory.find({}).select('_id').lean();
    const categoriesToDelete = categories.filter(c => !usedCategoryIds.has(String(c._id))).map(c => c._id);
    if (categoriesToDelete.length > 0) {
        await UniversityCategory.deleteMany({ _id: { $in: categoriesToDelete } });
    }

    const clusters = await UniversityCluster.find({}).select('_id').lean();
    const clustersToDelete = clusters.filter(c => !usedClusterIds.has(String(c._id))).map(c => c._id);
    if (clustersToDelete.length > 0) {
        await UniversityCluster.deleteMany({ _id: { $in: clustersToDelete } });
    }
}
