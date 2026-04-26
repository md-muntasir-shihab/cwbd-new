import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowUp,
    Check,
    GraduationCap,
    Home,
    Layers3,
    Loader2,
    RefreshCw,
    Save,
    Settings2,
    Star,
    X,
} from 'lucide-react';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import { ADMIN_PATHS } from '../routes/adminPaths';
import AdminImageUploadField from '../components/admin/AdminImageUploadField';
import {
    adminGetHomeConfig,
    adminGetHomeSettings,
    adminGetUniversities,
    adminGetUniversityCategoryMaster,
    adminGetUniversityClusters,
    adminGetUniversitySettings,
    adminUpdateHomeConfig,
    adminUpdateHomeSettings,
    adminUpdateUniversityCategory,
    adminUpdateUniversityCluster,
    adminUpdateUniversitySettings,
    type AdminUniversityCategoryItem,
    type AdminUniversityCluster,
    type AdminUniversitySettingsData,
    type ApiUniversity,
    type HomeConfigSection,
    type HomeSettingsConfig,
} from '../services/api';
import { invalidateQueryGroup, invalidationGroups, queryKeys } from '../lib/queryKeys';

const ALLOWED_CATEGORIES = [
    'Individual Admission',
    'Science & Technology',
    'GST (General/Public)',
    'GST (Science & Technology)',
    'Medical College',
    'AGRI Cluster',
    'Under Army',
    'DCU',
    'Specialized University',
    'Affiliate College',
    'Dental College',
    'Nursing Colleges',
];

const HOME_UNIVERSITY_SECTION_DEFAULTS: HomeConfigSection[] = [
    { id: 'featured', title: 'Featured Universities', isActive: true, order: 4 },
    { id: 'category_filter', title: 'Category & Cluster Filter', isActive: true, order: 5 },
    { id: 'deadlines', title: 'Admission Deadlines', isActive: true, order: 6 },
    { id: 'upcoming_exams', title: 'Upcoming Exams', isActive: true, order: 7 },
];

const DEFAULT_SETTINGS: AdminUniversitySettingsData = {
    categoryOrder: [...ALLOWED_CATEGORIES],
    highlightedCategories: [],
    defaultCategory: 'Individual Admission',
    featuredUniversitySlugs: [],
    maxFeaturedItems: 12,
    enableClusterFilterOnHome: true,
    enableClusterFilterOnUniversities: true,
    defaultUniversityLogoUrl: null,
    allowCustomCategories: false,
};

const DEFAULT_HOME_UNIVERSITY: Pick<
    HomeSettingsConfig,
    'universityPreview' | 'universityCardConfig' | 'highlightedCategories' | 'featuredUniversities' | 'universityDashboard'
> = {
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
    universityCardConfig: {
        defaultUniversityLogo: '',
        showExamCentersPreview: true,
        closingSoonDays: 7,
        showAddress: true,
        showEmail: true,
        showApplicationProgress: true,
        showExamDates: true,
        defaultSort: 'alphabetical',
    },
    highlightedCategories: [],
    featuredUniversities: [],
    universityDashboard: {
        enabled: true,
        title: '',
        subtitle: '',
        showFilters: true,
        defaultCategory: 'Individual Admission',
        showAllCategories: false,
        showPlaceholderText: false,
        placeholderNote: '',
    },
};

type QuickClusterState = Pick<AdminUniversityCluster, '_id' | 'name' | 'homeVisible' | 'homeOrder' | 'homeFeedMode'> & { memberCount: number };

type UniversitySettingsDraft = {
    settings: AdminUniversitySettingsData;
    home: Pick<
        HomeSettingsConfig,
        'universityPreview' | 'universityCardConfig' | 'highlightedCategories' | 'featuredUniversities' | 'universityDashboard'
    >;
    clusters: QuickClusterState[];
    homeSections: HomeConfigSection[];
};

type UniversitySettingsPageData = {
    settings: AdminUniversitySettingsData;
    homeSettings: HomeSettingsConfig;
    categories: AdminUniversityCategoryItem[];
    universities: ApiUniversity[];
    clusters: AdminUniversityCluster[];
    homeConfigSections: HomeConfigSection[];
};

function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function pickText(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizePositiveInt(value: number, fallback: number, min = 1, max = 50): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function moveItem<T>(items: T[], index: number, direction: 'up' | 'down'): T[] {
    const next = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= next.length) return items;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function normalizeHomeUniversitySections(input: HomeConfigSection[] = []): HomeConfigSection[] {
    const storedById = new Map(
        input
            .map((section) => ({
                ...section,
                id: pickText(section.id),
                title: pickText(section.title),
                isActive: section.isActive !== false,
                order: Number.isFinite(Number(section.order)) ? Number(section.order) : 0,
            }))
            .filter((section) => section.id)
            .map((section) => [section.id, section] as const),
    );

    return HOME_UNIVERSITY_SECTION_DEFAULTS.map((fallback) => {
        const stored = storedById.get(fallback.id);
        return {
            ...fallback,
            ...(stored || {}),
            id: fallback.id,
            title: pickText(stored?.title, fallback.title),
            isActive: stored?.isActive !== false,
            order: Number.isFinite(Number(stored?.order)) ? Number(stored?.order) : fallback.order,
        };
    }).sort((left, right) => left.order - right.order);
}

function mergeHomeSections(baseSections: HomeConfigSection[] = [], universitySections: HomeConfigSection[]): HomeConfigSection[] {
    const universityById = new Map(universitySections.map((section) => [section.id, section] as const));
    const working = [...baseSections.map((section) => ({ ...section }))];

    HOME_UNIVERSITY_SECTION_DEFAULTS.forEach((fallback) => {
        if (!working.some((section) => section.id === fallback.id)) {
            working.push({ ...fallback });
        }
    });

    const ordered = working.sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const next = ordered.map((section) => {
        const replacement = universityById.get(section.id);
        if (!replacement) return { ...section };
        return {
            ...section,
            ...replacement,
            id: replacement.id,
            title: pickText(replacement.title, section.title),
            isActive: replacement.isActive !== false,
        };
    });

    return next.map((section, index) => ({ ...section, order: index }));
}

function buildInitialDraft(data: UniversitySettingsPageData): UniversitySettingsDraft {
    const settings = {
        ...DEFAULT_SETTINGS,
        ...(data.settings || {}),
    };

    const home = {
        universityPreview: {
            ...DEFAULT_HOME_UNIVERSITY.universityPreview,
            ...(data.homeSettings?.universityPreview || {}),
        },
        universityCardConfig: {
            ...DEFAULT_HOME_UNIVERSITY.universityCardConfig,
            ...(data.homeSettings?.universityCardConfig || {}),
        },
        highlightedCategories: [...(data.homeSettings?.highlightedCategories || [])],
        featuredUniversities: [...(data.homeSettings?.featuredUniversities || [])],
        universityDashboard: {
            ...DEFAULT_HOME_UNIVERSITY.universityDashboard,
            ...(data.homeSettings?.universityDashboard || {}),
        },
    };

    const badgeMetaByCategory = new Map(
        (home.highlightedCategories || [])
            .map((item) => ({
                category: pickText(item.category),
                enabled: item.enabled !== false,
                badgeText: pickText(item.badgeText),
            }))
            .filter((item) => item.category)
            .map((item) => [item.category, item] as const),
    );

    const highlightedFromCategoryMaster = (data.categories || [])
        .filter((item) => item.homeHighlight)
        .sort((left, right) => Number(left.homeOrder || 0) - Number(right.homeOrder || 0))
        .map((item, index) => {
            const categoryName = pickText(item.name);
            const meta = badgeMetaByCategory.get(categoryName);
            return {
                category: categoryName,
                order: index + 1,
                enabled: meta?.enabled ?? true,
                badgeText: meta?.badgeText || pickText(item.labelBn) || 'Highlight',
            };
        });

    if (highlightedFromCategoryMaster.length > 0) {
        home.highlightedCategories = highlightedFromCategoryMaster;
    } else {
        home.highlightedCategories = (home.highlightedCategories || [])
            .map((item, index) => ({
                category: pickText(item.category),
                order: index + 1,
                enabled: item.enabled !== false,
                badgeText: pickText(item.badgeText) || 'Highlight',
            }))
            .filter((item) => item.category);
    }

    const universityBySlug = new Map(
        (data.universities || [])
            .map((item) => [pickText(item.slug).toLowerCase(), pickText(item._id)] as const)
            .filter(([slug, id]) => Boolean(slug && id)),
    );

    if ((home.featuredUniversities || []).length === 0 && Array.isArray(settings.featuredUniversitySlugs) && settings.featuredUniversitySlugs.length > 0) {
        home.featuredUniversities = settings.featuredUniversitySlugs
            .map((slug, index) => {
                const universityId = universityBySlug.get(pickText(slug).toLowerCase());
                if (!universityId) return null;
                return {
                    universityId,
                    order: index + 1,
                    badgeText: 'Featured',
                    enabled: true,
                };
            })
            .filter((item): item is HomeSettingsConfig['featuredUniversities'][number] => item !== null);
    } else {
        home.featuredUniversities = (home.featuredUniversities || [])
            .map((item, index) => ({
                universityId: pickText(item.universityId),
                order: index + 1,
                badgeText: pickText(item.badgeText) || 'Featured',
                enabled: item.enabled !== false,
            }))
            .filter((item) => item.universityId);
    }

    const clusters = (data.clusters || [])
        .map((item) => ({
            _id: pickText(item._id),
            name: pickText(item.name),
            homeVisible: Boolean(item.homeVisible),
            homeOrder: Number(item.homeOrder || 0),
            homeFeedMode: (item as any).homeFeedMode || 'both' as const,
            memberCount: Number(item.memberCount || 0),
        }))
        .filter((item) => item._id && item.name)
        .sort((left, right) => {
            if (left.homeVisible !== right.homeVisible) return left.homeVisible ? -1 : 1;
            if (left.homeOrder !== right.homeOrder) return left.homeOrder - right.homeOrder;
            return left.name.localeCompare(right.name);
        });

    return {
        settings: {
            ...settings,
            maxFeaturedItems: home.universityPreview.maxFeaturedItems || settings.maxFeaturedItems || DEFAULT_SETTINGS.maxFeaturedItems,
            defaultUniversityLogoUrl: pickText(home.universityCardConfig.defaultUniversityLogo) || settings.defaultUniversityLogoUrl || null,
            defaultCategory: pickText(settings.defaultCategory, pickText(home.universityDashboard.defaultCategory, DEFAULT_SETTINGS.defaultCategory)),
        },
        home: {
            ...home,
            universityDashboard: {
                ...home.universityDashboard,
                defaultCategory: pickText(settings.defaultCategory, pickText(home.universityDashboard.defaultCategory, DEFAULT_SETTINGS.defaultCategory)),
            },
        },
        clusters,
        homeSections: normalizeHomeUniversitySections(data.homeConfigSections || []),
    };
}

function ToggleCard({
    label,
    hint,
    checked,
    onToggle,
}: {
    label: string;
    hint: string;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-700/30 bg-surface/60 px-4 py-3 shadow-sm shadow-black/5 ring-1 ring-white/[0.03] transition-colors hover:border-primary/30">
            <div>
                <p className="text-sm font-semibold cw-text">{label}</p>
                <p className="mt-1 text-xs cw-muted">{hint}</p>
            </div>
            <button
                type="button"
                onClick={onToggle}
                role="switch"
                aria-checked={checked}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-slate-600'}`}
            >
                <span className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
        </label>
    );
}

function TextInput({
    label,
    value,
    onChange,
    helper,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    helper?: string;
}) {
    return (
        <div>
            <label className="text-xs text-slate-400">{label}</label>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
            />
            {helper ? <p className="mt-1 text-[11px] text-slate-500">{helper}</p> : null}
        </div>
    );
}

function NumberInput({
    label,
    value,
    onChange,
    helper,
}: {
    label: string;
    value: number;
    onChange: (next: number) => void;
    helper?: string;
}) {
    return (
        <div>
            <label className="text-xs text-slate-400">{label}</label>
            <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                onChange={(event) => onChange(Number(event.target.value || 0))}
                className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
            />
            {helper ? <p className="mt-1 text-[11px] text-slate-500">{helper}</p> : null}
        </div>
    );
}

export default function AdminUniversitySettingsPage() {
    const queryClient = useQueryClient();
    const [local, setLocal] = useState<UniversitySettingsDraft | null>(null);
    const [categoryToAdd, setCategoryToAdd] = useState('');
    const [featuredUniversityToAdd, setFeaturedUniversityToAdd] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [pageError, setPageError] = useState('');
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const originalRef = useRef<UniversitySettingsDraft | null>(null);

    const pageQuery = useQuery({
        queryKey: ['admin-university-settings-page'],
        queryFn: async (): Promise<UniversitySettingsPageData> => {
            const [settingsRes, homeSettingsRes, categoriesRes, universitiesRes, clustersRes, homeConfigRes] = await Promise.all([
                adminGetUniversitySettings(),
                adminGetHomeSettings(),
                adminGetUniversityCategoryMaster({ status: 'all' }),
                adminGetUniversities({ page: 1, limit: 1000, status: 'all', sortBy: 'name', sortOrder: 'asc' }),
                adminGetUniversityClusters({ status: 'active' }),
                adminGetHomeConfig(),
            ]);

            return {
                settings: { ...DEFAULT_SETTINGS, ...(settingsRes.data?.data || {}) },
                homeSettings: homeSettingsRes.data?.homeSettings,
                categories: categoriesRes.data?.categories || [],
                universities: universitiesRes.data?.universities || [],
                clusters: clustersRes.data?.clusters || [],
                homeConfigSections: homeConfigRes.data?.sections || [],
            };
        },
    });

    useEffect(() => {
        if (!pageQuery.data) return;
        const next = buildInitialDraft(pageQuery.data);
        setLocal(next);
        originalRef.current = next;
        setPageError('');
    }, [pageQuery.data]);

    useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
    }, []);

    const categoryOptions = useMemo(() => {
        const names = new Set<string>();
        (pageQuery.data?.categories || []).forEach((item) => {
            const name = pickText(item.name);
            if (name) names.add(name);
        });
        (local?.settings.categoryOrder || []).forEach((item) => {
            const name = pickText(item);
            if (name) names.add(name);
        });
        return Array.from(names).sort((left, right) => left.localeCompare(right));
    }, [local?.settings.categoryOrder, pageQuery.data?.categories]);

    const defaultCategoryOptions = useMemo(() => {
        const names = new Set<string>(['all']);
        categoryOptions.forEach((item) => names.add(item));
        return Array.from(names);
    }, [categoryOptions]);

    const universityOptions = useMemo(() => {
        return (pageQuery.data?.universities || [])
            .map((item) => ({
                id: pickText(item._id),
                name: pickText(item.name, 'University'),
                shortForm: pickText(item.shortForm, 'N/A'),
                slug: pickText(item.slug),
            }))
            .filter((item) => item.id);
    }, [pageQuery.data?.universities]);

    const universityLabelMap = useMemo(
        () => new Map(universityOptions.map((item) => [item.id, `${item.name} (${item.shortForm})`])),
        [universityOptions],
    );

    const universitySlugById = useMemo(
        () => new Map(universityOptions.map((item) => [item.id, item.slug])),
        [universityOptions],
    );

    function showToast(msg: string, type: 'success' | 'error') {
        setToast({ msg, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }

    const mutation = useMutation({
        mutationFn: async (draft: UniversitySettingsDraft) => {
            const normalizedHighlightedEntries = draft.home.highlightedCategories
                .map((item, index) => ({
                    category: pickText(item.category),
                    order: index + 1,
                    enabled: item.enabled !== false,
                    badgeText: pickText(item.badgeText) || 'Highlight',
                }))
                .filter((item) => item.category);

            const enabledHighlightedEntries = normalizedHighlightedEntries.filter((item) => item.enabled);
            const normalizedFeaturedEntries = draft.home.featuredUniversities
                .map((item, index) => ({
                    universityId: pickText(item.universityId),
                    order: index + 1,
                    badgeText: pickText(item.badgeText) || 'Featured',
                    enabled: item.enabled !== false,
                }))
                .filter((item) => item.universityId);
            const enabledFeaturedSlugs = normalizedFeaturedEntries
                .filter((item) => item.enabled)
                .map((item) => pickText(universitySlugById.get(item.universityId)))
                .filter(Boolean);

            const highlightedOrderMap = new Map(
                enabledHighlightedEntries.map((item, index) => [pickText(item.category), index + 1] as const),
            );

            const normalizedDefaultCategory = pickText(draft.settings.defaultCategory, DEFAULT_SETTINGS.defaultCategory);
            const universitySettingsPayload: Partial<AdminUniversitySettingsData> = {
                categoryOrder: draft.settings.categoryOrder.map((item) => pickText(item)).filter(Boolean),
                defaultCategory: normalizedDefaultCategory,
                highlightedCategories: enabledHighlightedEntries.map((item) => item.category),
                featuredUniversitySlugs: enabledFeaturedSlugs,
                maxFeaturedItems: normalizePositiveInt(draft.home.universityPreview.maxFeaturedItems, DEFAULT_SETTINGS.maxFeaturedItems),
                enableClusterFilterOnHome: draft.settings.enableClusterFilterOnHome !== false,
                enableClusterFilterOnUniversities: draft.settings.enableClusterFilterOnUniversities !== false,
                defaultUniversityLogoUrl: pickText(draft.home.universityCardConfig.defaultUniversityLogo) || null,
                allowCustomCategories: draft.settings.allowCustomCategories === true,
            };

            const homeSettingsPayload: Partial<HomeSettingsConfig> = {
                universityPreview: {
                    ...draft.home.universityPreview,
                    defaultActiveCategory: normalizedDefaultCategory,
                    enableClusterFilter: draft.settings.enableClusterFilterOnHome !== false,
                    maxFeaturedItems: normalizePositiveInt(
                        draft.home.universityPreview.maxFeaturedItems,
                        DEFAULT_HOME_UNIVERSITY.universityPreview.maxFeaturedItems,
                    ),
                    maxDeadlineItems: normalizePositiveInt(
                        draft.home.universityPreview.maxDeadlineItems,
                        DEFAULT_HOME_UNIVERSITY.universityPreview.maxDeadlineItems,
                    ),
                    maxExamItems: normalizePositiveInt(
                        draft.home.universityPreview.maxExamItems,
                        DEFAULT_HOME_UNIVERSITY.universityPreview.maxExamItems,
                    ),
                    deadlineWithinDays: normalizePositiveInt(
                        draft.home.universityPreview.deadlineWithinDays,
                        DEFAULT_HOME_UNIVERSITY.universityPreview.deadlineWithinDays,
                    ),
                    examWithinDays: normalizePositiveInt(
                        draft.home.universityPreview.examWithinDays,
                        DEFAULT_HOME_UNIVERSITY.universityPreview.examWithinDays,
                    ),
                },
                universityCardConfig: {
                    ...draft.home.universityCardConfig,
                    defaultUniversityLogo: pickText(draft.home.universityCardConfig.defaultUniversityLogo),
                    closingSoonDays: normalizePositiveInt(
                        draft.home.universityCardConfig.closingSoonDays,
                        DEFAULT_HOME_UNIVERSITY.universityCardConfig.closingSoonDays,
                    ),
                },
                universityDashboard: {
                    ...draft.home.universityDashboard,
                    defaultCategory: normalizedDefaultCategory,
                    showAllCategories: draft.home.universityDashboard.showAllCategories === true,
                },
                highlightedCategories: normalizedHighlightedEntries,
                featuredUniversities: normalizedFeaturedEntries,
            };

            const mergedHomeSections = mergeHomeSections(
                pageQuery.data?.homeConfigSections || [],
                draft.homeSections.map((section, index) => ({ ...section, order: index })),
            );

            await adminUpdateUniversitySettings(universitySettingsPayload);
            await adminUpdateHomeSettings(homeSettingsPayload);
            await adminUpdateHomeConfig({ sections: mergedHomeSections });

            const categoryUpdates = (pageQuery.data?.categories || [])
                .map((item) => {
                    const categoryName = pickText(item.name);
                    const homeOrder = highlightedOrderMap.get(categoryName) || 0;
                    const homeHighlight = highlightedOrderMap.has(categoryName);
                    if (Boolean(item.homeHighlight) === homeHighlight && Number(item.homeOrder || 0) === homeOrder) {
                        return null;
                    }
                    return adminUpdateUniversityCategory(item._id, { homeHighlight, homeOrder });
                })
                .filter((task): task is ReturnType<typeof adminUpdateUniversityCategory> => task !== null);

            const originalClusters = new Map(
                (originalRef.current?.clusters || []).map((item) => [item._id, item] as const),
            );
            const clusterUpdates = draft.clusters
                .map((item) => {
                    const original = originalClusters.get(item._id);
                    if (
                        original
                        && original.homeVisible === item.homeVisible
                        && Number(original.homeOrder || 0) === Number(item.homeOrder || 0)
                    ) {
                        return null;
                    }
                    return adminUpdateUniversityCluster(item._id, {
                        homeVisible: item.homeVisible,
                        homeOrder: Number(item.homeOrder || 0),
                    });
                })
                .filter((task): task is ReturnType<typeof adminUpdateUniversityCluster> => task !== null);

            if (categoryUpdates.length > 0) await Promise.all(categoryUpdates);
            if (clusterUpdates.length > 0) await Promise.all(clusterUpdates);
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['admin-university-settings'] }),
                queryClient.invalidateQueries({ queryKey: ['admin-university-settings-page'] }),
                queryClient.invalidateQueries({ queryKey: ['admin-home-config'] }),
                queryClient.invalidateQueries({ queryKey: ['university-browse-settings-public'] }),
                queryClient.invalidateQueries({ queryKey: ['home-settings'] }),
                queryClient.invalidateQueries({ queryKey: ['home-settings-defaults'] }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                queryClient.invalidateQueries({ queryKey: queryKeys.universities }),
                queryClient.invalidateQueries({ queryKey: queryKeys.universityCategories }),
                queryClient.invalidateQueries({ queryKey: queryKeys.universityCategoriesLegacy }),
                invalidateQueryGroup(queryClient, invalidationGroups.homeSave),
                invalidateQueryGroup(queryClient, invalidationGroups.universitySave),
            ]);
            const fresh = await pageQuery.refetch();
            if (fresh.data) {
                const next = buildInitialDraft(fresh.data);
                setLocal(next);
                originalRef.current = next;
            }
            showToast('University settings saved.', 'success');
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setPageError(message || 'Failed to save university settings.');
            showToast(message || 'Failed to save university settings.', 'error');
        },
    });

    function handleReset() {
        if (!originalRef.current) return;
        setLocal(JSON.parse(JSON.stringify(originalRef.current)) as UniversitySettingsDraft);
        setCategoryToAdd('');
        setFeaturedUniversityToAdd('');
        setPageError('');
    }

    const isDirty = !deepEqual(local, originalRef.current);

    if (pageQuery.isLoading || !local) {
        return (
            <AdminGuardShell title="University Settings" description="Loading university browse and home university controls.">
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </AdminGuardShell>
        );
    }

    if (pageQuery.isError) {
        return (
            <AdminGuardShell title="University Settings" description="Failed to load university browse and home university controls.">
                <div className="card-flat space-y-3 p-6 text-center">
                    <p className="text-rose-400">University settings could not be loaded.</p>
                    <button onClick={() => void pageQuery.refetch()} className="btn-outline inline-flex items-center gap-2 text-sm">
                        <RefreshCw className="h-4 w-4" />
                        Retry
                    </button>
                </div>
            </AdminGuardShell>
        );
    }

    const enabledHighlightedCount = local.home.highlightedCategories.filter((item) => item.enabled !== false).length;
    const enabledFeaturedCount = local.home.featuredUniversities.filter((item) => item.enabled !== false).length;
    const homeVisibleClusterCount = local.clusters.filter((item) => item.homeVisible).length;
    const activeHomeSectionCount = local.homeSections.filter((item) => item.isActive !== false).length;

    return (
        <AdminGuardShell
            title="University Settings"
            description="Canonical control for university browse defaults, home section visibility, featured content, category highlights, cluster feed order, and university card display rules."
        >
            <AdminTabNav tabs={[
                { key: 'list', label: 'All Universities', path: ADMIN_PATHS.universities, icon: GraduationCap },
                { key: 'settings', label: 'University Settings', path: ADMIN_PATHS.universitySettings, icon: Settings2 },
            ]} />
            {toast ? (
                <div
                    className={`fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-sm ${toast.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700 shadow-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'border-rose-200 bg-rose-50/95 text-rose-700 shadow-rose-500/10 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400'
                        }`}
                >
                    {toast.type === 'success' ? '✅' : '❌'}
                    {toast.msg}
                </div>
            ) : null}

            <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-lg shadow-black/5 dark:border-slate-700/30 dark:bg-slate-900 dark:ring-1 dark:ring-white/[0.03]">
                    <div className="space-y-1">
                        <p className={`text-sm font-medium ${isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {isDirty ? '⚠️ You have unsaved university-setting changes.' : '✅ University settings are up to date.'}
                        </p>
                        {pageError ? <p className="text-xs text-rose-600 dark:text-rose-400">{pageError}</p> : null}
                    </div>
                    <div className="flex gap-2">
                        {isDirty ? (
                            <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">
                                <RefreshCw className="h-4 w-4" />
                                Discard
                            </button>
                        ) : null}
                        <button
                            onClick={() => mutation.mutate(local)}
                            disabled={!isDirty || mutation.isPending}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl disabled:opacity-50 transition-all"
                        >
                            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Changes
                        </button>
                    </div>
                </div>

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {[
                        { label: 'Categories', value: local.settings.categoryOrder.length, desc: 'Ordered browse tabs and category priority', Icon: Layers3, bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
                        { label: 'Home Sections', value: activeHomeSectionCount, desc: 'University-related home sections currently visible', Icon: Home, bg: 'bg-sky-50 dark:bg-sky-950/30' },
                        { label: 'Highlights', value: enabledHighlightedCount, desc: 'Home category spotlights currently enabled', Icon: Star, bg: 'bg-amber-50 dark:bg-amber-950/30' },
                        { label: 'Featured Universities', value: enabledFeaturedCount, desc: 'Manual home-featured university picks', Icon: GraduationCap, bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                        { label: 'Featured Clusters', value: homeVisibleClusterCount, desc: 'Active clusters visible in Home featured feed', Icon: Layers3, bg: 'bg-violet-50 dark:bg-violet-950/30' },
                    ].map(s => (
                        <div key={s.label} className={`group relative overflow-hidden rounded-2xl ${s.bg} p-5 transition-all hover:shadow-md border border-slate-200/50 dark:border-slate-700/30 dark:ring-1 dark:ring-white/[0.03]`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{s.label}</p>
                                    <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{s.desc}</p>
                                </div>
                                <s.Icon className="h-6 w-6 opacity-40 group-hover:scale-110 transition-transform text-slate-500 dark:text-slate-400" />
                            </div>
                        </div>
                    ))}
                </section>

                <section className="rounded-2xl border border-indigo-200/50 bg-gradient-to-r from-indigo-50 to-indigo-100/50 p-5 shadow-sm dark:border-slate-700/30 dark:from-indigo-950/30 dark:to-indigo-900/20 dark:ring-1 dark:ring-white/[0.03]">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                            <Settings2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800 dark:text-white">Canonical Ownership</h2>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                This page now owns the working university-related website controls. Home Control keeps only global layout and non-university sections.
                                Duplicate university widgets there are removed from the visible admin surface, while backend compatibility stays intact.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Category Order</h2>
                            <p className="mt-1 text-sm cw-muted">This order drives public university browse tabs and admin-facing category priority.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {local.settings.categoryOrder.map((category, index) => (
                            <div key={category} className="flex items-center gap-3 rounded-xl border border-card-border bg-surface/60 px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => setLocal((prev) => prev ? ({
                                        ...prev,
                                        settings: {
                                            ...prev.settings,
                                            categoryOrder: moveItem(prev.settings.categoryOrder, index, 'up'),
                                        },
                                    }) : prev)}
                                    disabled={index === 0}
                                    className="rounded p-0.5 text-slate-400 transition hover:text-primary disabled:opacity-30"
                                    title="Move up"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLocal((prev) => prev ? ({
                                        ...prev,
                                        settings: {
                                            ...prev.settings,
                                            categoryOrder: moveItem(prev.settings.categoryOrder, index, 'down'),
                                        },
                                    }) : prev)}
                                    disabled={index === local.settings.categoryOrder.length - 1}
                                    className="rounded p-0.5 text-slate-400 transition hover:text-primary disabled:opacity-30"
                                    title="Move down"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                                <span className="w-6 text-center text-xs cw-muted">{index + 1}</span>
                                <span className="flex-1 text-sm font-medium cw-text">{category}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="card-flat p-5">
                        <h2 className="text-base font-semibold cw-text">Default Browse Category</h2>
                        <p className="mt-1 text-sm cw-muted">
                            Public `/universities` pages will use this category when the route does not force another one.
                        </p>
                        <div className="mt-4">
                            <label className="text-xs text-slate-400">Default Category</label>
                            <select
                                value={local.settings.defaultCategory}
                                onChange={(event) => setLocal((prev) => prev ? ({
                                    ...prev,
                                    settings: {
                                        ...prev.settings,
                                        defaultCategory: event.target.value,
                                    },
                                    home: {
                                        ...prev.home,
                                        universityDashboard: {
                                            ...prev.home.universityDashboard,
                                            defaultCategory: event.target.value,
                                        },
                                    },
                                }) : prev)}
                                className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
                            >
                                {defaultCategoryOptions.map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                ))}
                            </select>
                            <p className="mt-2 text-[11px] text-slate-500">
                                `all` keeps the general browse view open. Specific categories lock the initial public browse tab.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <ToggleCard
                            label="Show Cluster Filter on Universities Page"
                            hint="Controls the public `/universities` cluster selector."
                            checked={local.settings.enableClusterFilterOnUniversities}
                            onToggle={() => setLocal((prev) => prev ? ({
                                ...prev,
                                settings: {
                                    ...prev.settings,
                                    enableClusterFilterOnUniversities: !prev.settings.enableClusterFilterOnUniversities,
                                },
                            }) : prev)}
                        />
                        <ToggleCard
                            label="Show Cluster Filter on Home"
                            hint="Controls the Home featured university cluster selector."
                            checked={local.settings.enableClusterFilterOnHome}
                            onToggle={() => setLocal((prev) => prev ? ({
                                ...prev,
                                settings: {
                                    ...prev.settings,
                                    enableClusterFilterOnHome: !prev.settings.enableClusterFilterOnHome,
                                },
                            }) : prev)}
                        />
                        <ToggleCard
                            label="Allow Custom Categories"
                            hint="Keeps import and admin validation flexible for non-standard categories."
                            checked={local.settings.allowCustomCategories}
                            onToggle={() => setLocal((prev) => prev ? ({
                                ...prev,
                                settings: {
                                    ...prev.settings,
                                    allowCustomCategories: !prev.settings.allowCustomCategories,
                                },
                            }) : prev)}
                        />
                        <ToggleCard
                            label="Allow All Universities View"
                            hint="Preserves the legacy all-category browse mode for routes still using dashboard-category config."
                            checked={local.home.universityDashboard.showAllCategories === true}
                            onToggle={() => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityDashboard: {
                                        ...prev.home.universityDashboard,
                                        showAllCategories: prev.home.universityDashboard.showAllCategories !== true,
                                    },
                                },
                            }) : prev)}
                        />
                    </div>
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Home University Sections</h2>
                            <p className="mt-1 text-sm cw-muted">
                                University-related section visibility and order from Home Control now lives here.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {local.homeSections.map((section, index) => (
                            <div key={section.id} className="rounded-xl border border-card-border bg-surface/60 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setLocal((prev) => prev ? ({
                                            ...prev,
                                            homeSections: moveItem(prev.homeSections, index, 'up').map((item, nextIndex) => ({ ...item, order: nextIndex })),
                                        }) : prev)}
                                        disabled={index === 0}
                                        className="rounded p-0.5 text-slate-400 transition hover:text-primary disabled:opacity-30"
                                        title="Move up"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLocal((prev) => prev ? ({
                                            ...prev,
                                            homeSections: moveItem(prev.homeSections, index, 'down').map((item, nextIndex) => ({ ...item, order: nextIndex })),
                                        }) : prev)}
                                        disabled={index === local.homeSections.length - 1}
                                        className="rounded p-0.5 text-slate-400 transition hover:text-primary disabled:opacity-30"
                                        title="Move down"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </button>
                                    <span className="w-6 text-center text-xs cw-muted">{index + 1}</span>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium cw-text">{section.title}</p>
                                        <p className="text-xs cw-muted">{section.id}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setLocal((prev) => prev ? ({
                                            ...prev,
                                            homeSections: prev.homeSections.map((item, itemIndex) => (
                                                itemIndex === index ? { ...item, isActive: item.isActive === false } : item
                                            )),
                                        }) : prev)}
                                        className={`rounded-full border px-3 py-1 text-xs font-medium ${section.isActive !== false
                                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                            : 'border-slate-600 bg-slate-800/70 text-slate-300'
                                            }`}
                                    >
                                        {section.isActive !== false ? 'Visible' : 'Hidden'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Home University Windows</h2>
                            <p className="mt-1 text-sm cw-muted">
                                Controls the live home university feed sizes and the featured/deadline/exam windows. Duplicate category and cluster controls were removed from Home Control.
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <NumberInput
                            label="Featured Max Items"
                            value={local.home.universityPreview.maxFeaturedItems}
                            onChange={(value) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityPreview: {
                                        ...prev.home.universityPreview,
                                        maxFeaturedItems: value,
                                    },
                                },
                            }) : prev)}
                        />
                        <NumberInput
                            label="Deadline Max Items"
                            value={local.home.universityPreview.maxDeadlineItems}
                            onChange={(value) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityPreview: {
                                        ...prev.home.universityPreview,
                                        maxDeadlineItems: value,
                                    },
                                },
                            }) : prev)}
                        />
                        <NumberInput
                            label="Exam Max Items"
                            value={local.home.universityPreview.maxExamItems}
                            onChange={(value) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityPreview: {
                                        ...prev.home.universityPreview,
                                        maxExamItems: value,
                                    },
                                },
                            }) : prev)}
                        />
                        <NumberInput
                            label="Deadline Within Days"
                            value={local.home.universityPreview.deadlineWithinDays}
                            onChange={(value) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityPreview: {
                                        ...prev.home.universityPreview,
                                        deadlineWithinDays: value,
                                    },
                                },
                            }) : prev)}
                        />
                        <NumberInput
                            label="Exam Within Days"
                            value={local.home.universityPreview.examWithinDays}
                            onChange={(value) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityPreview: {
                                        ...prev.home.universityPreview,
                                        examWithinDays: value,
                                    },
                                },
                            }) : prev)}
                        />
                        <div>
                            <label className="text-xs text-slate-400">Featured Mode</label>
                            <select
                                value={local.home.universityPreview.featuredMode}
                                onChange={(event) => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityPreview: {
                                            ...prev.home.universityPreview,
                                            featuredMode: event.target.value as HomeSettingsConfig['universityPreview']['featuredMode'],
                                        },
                                    },
                                }) : prev)}
                                className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
                            >
                                <option value="manual">Manual Featured Picks</option>
                                <option value="auto">Auto from Active Universities</option>
                            </select>
                        </div>
                    </div>
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Layers3 className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Highlighted Categories</h2>
                            <p className="mt-1 text-sm cw-muted">Controls the highlighted category chips and their badge text for Home featured browsing.</p>
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <select
                            value={categoryToAdd}
                            onChange={(event) => setCategoryToAdd(event.target.value)}
                            className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
                        >
                            <option value="">Select category to add</option>
                            {categoryOptions.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => {
                                const next = pickText(categoryToAdd);
                                if (!next) return;
                                setLocal((prev) => {
                                    if (!prev) return prev;
                                    if (prev.home.highlightedCategories.some((item) => pickText(item.category) === next)) return prev;
                                    return {
                                        ...prev,
                                        home: {
                                            ...prev.home,
                                            highlightedCategories: [
                                                ...prev.home.highlightedCategories,
                                                {
                                                    category: next,
                                                    order: prev.home.highlightedCategories.length + 1,
                                                    enabled: true,
                                                    badgeText: 'Highlight',
                                                },
                                            ],
                                        },
                                    };
                                });
                                setCategoryToAdd('');
                            }}
                            disabled={!pickText(categoryToAdd)}
                            className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>
                    {local.home.highlightedCategories.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No highlighted categories selected.</p>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {local.home.highlightedCategories.map((item, index) => (
                                <div key={`${item.category}-${index}`} className="rounded-xl border border-slate-700/20 bg-slate-950/30 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-indigo-500/25 px-2 py-0.5 text-[11px] text-indigo-200">#{index + 1}</span>
                                        <p className="text-sm font-medium text-white">{item.category}</p>
                                        <div className="ml-auto flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        highlightedCategories: moveItem(prev.home.highlightedCategories, index, 'up').map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                disabled={index === 0}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        highlightedCategories: moveItem(prev.home.highlightedCategories, index, 'down').map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                disabled={index === local.home.highlightedCategories.length - 1}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Down
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        highlightedCategories: prev.home.highlightedCategories
                                                            .filter((entry) => entry.category !== item.category)
                                                            .map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <TextInput
                                            label="Badge Text"
                                            value={pickText(item.badgeText)}
                                            onChange={(value) => setLocal((prev) => prev ? ({
                                                ...prev,
                                                home: {
                                                    ...prev.home,
                                                    highlightedCategories: prev.home.highlightedCategories.map((entry, entryIndex) => (
                                                        entryIndex === index ? { ...entry, badgeText: value } : entry
                                                    )),
                                                },
                                            }) : prev)}
                                        />
                                        <ToggleCard
                                            label="Enabled"
                                            hint="Disabled categories stay in draft order but do not appear on Home."
                                            checked={item.enabled !== false}
                                            onToggle={() => setLocal((prev) => prev ? ({
                                                ...prev,
                                                home: {
                                                    ...prev.home,
                                                    highlightedCategories: prev.home.highlightedCategories.map((entry, entryIndex) => (
                                                        entryIndex === index ? { ...entry, enabled: entry.enabled === false } : entry
                                                    )),
                                                },
                                            }) : prev)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Star className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Featured Universities</h2>
                            <p className="mt-1 text-sm cw-muted">Manual list used by the Home featured university carousel when featured mode is manual.</p>
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <select
                            value={featuredUniversityToAdd}
                            onChange={(event) => setFeaturedUniversityToAdd(event.target.value)}
                            className="w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
                        >
                            <option value="">Select university to add</option>
                            {universityOptions.map((item) => (
                                <option key={item.id} value={item.id}>{item.name} ({item.shortForm})</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => {
                                const next = pickText(featuredUniversityToAdd);
                                if (!next) return;
                                setLocal((prev) => {
                                    if (!prev) return prev;
                                    if (prev.home.featuredUniversities.some((item) => pickText(item.universityId) === next)) return prev;
                                    return {
                                        ...prev,
                                        home: {
                                            ...prev.home,
                                            featuredUniversities: [
                                                ...prev.home.featuredUniversities,
                                                {
                                                    universityId: next,
                                                    order: prev.home.featuredUniversities.length + 1,
                                                    badgeText: 'Featured',
                                                    enabled: true,
                                                },
                                            ],
                                        },
                                    };
                                });
                                setFeaturedUniversityToAdd('');
                            }}
                            disabled={!pickText(featuredUniversityToAdd)}
                            className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>
                    {local.home.featuredUniversities.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No featured universities selected.</p>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {local.home.featuredUniversities.map((item, index) => (
                                <div key={`${item.universityId}-${index}`} className="rounded-xl border border-slate-700/20 bg-slate-950/30 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-indigo-500/25 px-2 py-0.5 text-[11px] text-indigo-200">#{index + 1}</span>
                                        <p className="text-sm font-medium text-white">{universityLabelMap.get(item.universityId) || item.universityId}</p>
                                        <div className="ml-auto flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        featuredUniversities: moveItem(prev.home.featuredUniversities, index, 'up').map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                disabled={index === 0}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        featuredUniversities: moveItem(prev.home.featuredUniversities, index, 'down').map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                disabled={index === local.home.featuredUniversities.length - 1}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Down
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    home: {
                                                        ...prev.home,
                                                        featuredUniversities: prev.home.featuredUniversities
                                                            .filter((entry) => entry.universityId !== item.universityId)
                                                            .map((entry, idx) => ({ ...entry, order: idx + 1 })),
                                                    },
                                                }) : prev)}
                                                className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <TextInput
                                            label="Badge Text"
                                            value={pickText(item.badgeText)}
                                            onChange={(value) => setLocal((prev) => prev ? ({
                                                ...prev,
                                                home: {
                                                    ...prev.home,
                                                    featuredUniversities: prev.home.featuredUniversities.map((entry, entryIndex) => (
                                                        entryIndex === index ? { ...entry, badgeText: value } : entry
                                                    )),
                                                },
                                            }) : prev)}
                                        />
                                        <ToggleCard
                                            label="Enabled"
                                            hint="Disabled universities stay in draft order but do not render on Home."
                                            checked={item.enabled !== false}
                                            onToggle={() => setLocal((prev) => prev ? ({
                                                ...prev,
                                                home: {
                                                    ...prev.home,
                                                    featuredUniversities: prev.home.featuredUniversities.map((entry, entryIndex) => (
                                                        entryIndex === index ? { ...entry, enabled: entry.enabled === false } : entry
                                                    )),
                                                },
                                            }) : prev)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Layers3 className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">Featured Clusters on Home</h2>
                            <p className="mt-1 text-sm cw-muted">Controls which active clusters appear first in the Home featured cluster feed and in what order.</p>
                        </div>
                    </div>
                    {local.clusters.length === 0 ? (
                        <p className="text-xs text-slate-500">No active clusters found.</p>
                    ) : (
                        <div className="space-y-2">
                            {local.clusters.map((cluster, index) => (
                                <div key={cluster._id} className="rounded-xl border border-slate-700/20 bg-slate-950/30 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-indigo-500/25 px-2 py-0.5 text-[11px] text-indigo-200">#{index + 1}</span>
                                        <p className="text-sm font-medium text-white">{cluster.name}</p>
                                        <span className="rounded-full border border-slate-600/40 px-2 py-0.5 text-[10px] text-indigo-200">
                                            {cluster.memberCount} members
                                        </span>
                                        <div className="ml-auto flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    clusters: moveItem(prev.clusters, index, 'up'),
                                                }) : prev)}
                                                disabled={index === 0}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    clusters: moveItem(prev.clusters, index, 'down'),
                                                }) : prev)}
                                                disabled={index === local.clusters.length - 1}
                                                className="rounded-lg border border-slate-600/40 bg-slate-800/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-40"
                                            >
                                                Down
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_140px]">
                                        <ToggleCard
                                            label="Show on Home"
                                            hint="Hidden clusters stay active in taxonomy but are excluded from the Home featured cluster feed."
                                            checked={cluster.homeVisible}
                                            onToggle={() => setLocal((prev) => prev ? ({
                                                ...prev,
                                                clusters: prev.clusters.map((entry, entryIndex) => (
                                                    entryIndex === index
                                                        ? { ...entry, homeVisible: !entry.homeVisible, homeOrder: !entry.homeVisible ? Math.max(1, entry.homeOrder || index + 1) : 0 }
                                                        : entry
                                                )),
                                            }) : prev)}
                                        />
                                        <NumberInput
                                            label="Home Order"
                                            value={cluster.homeOrder}
                                            onChange={(value) => setLocal((prev) => prev ? ({
                                                ...prev,
                                                clusters: prev.clusters.map((entry, entryIndex) => (
                                                    entryIndex === index ? { ...entry, homeOrder: value } : entry
                                                )),
                                            }) : prev)}
                                        />
                                        <div className="col-span-full">
                                            <label className="text-xs font-medium cw-muted mb-1 block">Feed Mode</label>
                                            <select
                                                value={cluster.homeFeedMode || 'both'}
                                                onChange={(e) => setLocal((prev) => prev ? ({
                                                    ...prev,
                                                    clusters: prev.clusters.map((entry, entryIndex) => (
                                                        entryIndex === index ? { ...entry, homeFeedMode: e.target.value as 'cluster_only' | 'members_only' | 'both' } : entry
                                                    )),
                                                }) : prev)}
                                                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm cw-text"
                                            >
                                                <option value="both">Both (Cluster + Members)</option>
                                                <option value="cluster_only">Cluster Only (গুচ্ছ)</option>
                                                <option value="members_only">Members Only</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card-flat p-5">
                    <div className="mb-4 flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-primary" />
                        <div>
                            <h2 className="text-base font-semibold cw-text">University Card Defaults</h2>
                            <p className="mt-1 text-sm cw-muted">Only settings with live frontend effect stay here. Inert legacy card toggles were removed from the admin surface.</p>
                        </div>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <AdminImageUploadField
                            label="Default University Logo"
                            value={pickText(local.home.universityCardConfig.defaultUniversityLogo)}
                            onChange={(nextValue) => setLocal((prev) => prev ? ({
                                ...prev,
                                home: {
                                    ...prev.home,
                                    universityCardConfig: {
                                        ...prev.home.universityCardConfig,
                                        defaultUniversityLogo: nextValue,
                                    },
                                },
                            }) : prev)}
                            helper="Shown when a university does not have its own uploaded logo."
                            category="admin_upload"
                            previewAlt="Fallback university logo"
                            fit="contain"
                            previewClassName="min-h-[170px]"
                            panelClassName="bg-slate-950/30 dark:bg-slate-950/55"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <NumberInput
                                label="Closing Soon Days Threshold"
                                value={local.home.universityCardConfig.closingSoonDays}
                                onChange={(value) => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            closingSoonDays: value,
                                        },
                                    },
                                }) : prev)}
                            />
                            <div>
                                <label className="text-xs text-slate-400">Default Sort</label>
                                <select
                                    value={local.home.universityCardConfig.defaultSort}
                                    onChange={(event) => setLocal((prev) => prev ? ({
                                        ...prev,
                                        home: {
                                            ...prev.home,
                                            universityCardConfig: {
                                                ...prev.home.universityCardConfig,
                                                defaultSort: event.target.value as HomeSettingsConfig['universityCardConfig']['defaultSort'],
                                            },
                                        },
                                    }) : prev)}
                                    className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white transition-all focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20"
                                >
                                    <option value="alphabetical">Name (A-Z)</option>
                                    <option value="nearest_deadline">Nearest Deadline</option>
                                </select>
                            </div>
                            <ToggleCard
                                label="Show Exam Centers Preview"
                                hint="Shows the short exam center preview line on cards."
                                checked={local.home.universityCardConfig.showExamCentersPreview}
                                onToggle={() => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            showExamCentersPreview: !prev.home.universityCardConfig.showExamCentersPreview,
                                        },
                                    },
                                }) : prev)}
                            />
                            <ToggleCard
                                label="Show Address"
                                hint="Shows the compact address block and enables click-to-copy address behavior."
                                checked={local.home.universityCardConfig.showAddress}
                                onToggle={() => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            showAddress: !prev.home.universityCardConfig.showAddress,
                                        },
                                    },
                                }) : prev)}
                            />
                            <ToggleCard
                                label="Show Email"
                                hint="Shows the direct email action on non-home university cards."
                                checked={local.home.universityCardConfig.showEmail}
                                onToggle={() => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            showEmail: !prev.home.universityCardConfig.showEmail,
                                        },
                                    },
                                }) : prev)}
                            />
                            <ToggleCard
                                label="Show Application Progress"
                                hint="Shows the deadline bar and remaining-day message inside the application block."
                                checked={local.home.universityCardConfig.showApplicationProgress}
                                onToggle={() => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            showApplicationProgress: !prev.home.universityCardConfig.showApplicationProgress,
                                        },
                                    },
                                }) : prev)}
                            />
                            <ToggleCard
                                label="Show Exam Dates"
                                hint="Shows science, arts, and business exam date boxes on university cards."
                                checked={local.home.universityCardConfig.showExamDates}
                                onToggle={() => setLocal((prev) => prev ? ({
                                    ...prev,
                                    home: {
                                        ...prev.home,
                                        universityCardConfig: {
                                            ...prev.home.universityCardConfig,
                                            showExamDates: !prev.home.universityCardConfig.showExamDates,
                                        },
                                    },
                                }) : prev)}
                            />
                        </div>
                    </div>
                </section>

                <div className="flex justify-end gap-3 pb-4">
                    {isDirty ? (
                        <button onClick={handleReset} className="btn-outline inline-flex items-center gap-2 text-sm">
                            <RefreshCw className="h-4 w-4" />
                            Discard Changes
                        </button>
                    ) : null}
                    <button
                        onClick={() => mutation.mutate(local)}
                        disabled={!isDirty || mutation.isPending}
                        className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Settings
                    </button>
                </div>
            </div>
        </AdminGuardShell>
    );
}
