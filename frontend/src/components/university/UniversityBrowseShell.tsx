import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import UniversityGrid from './UniversityGrid';
import UniversityFilterBar from './UniversityFilterBar';
import FilterBottomSheet from './FilterBottomSheet';
import {
    useUniversityCategories,
    useUniversities,
    usePublicHomeSettings,
    usePublicUniversityBrowseSettings,
} from '../../hooks/useUniversityQueries';
import type { UniversityCardSort } from '../../services/api';
import { toSlug, type UniversityCategoryDetail } from '../../lib/apiClient';
import type { UniversityCardVisualVariant } from './UniversityCard';

function sortCategories(items: UniversityCategoryDetail[]): UniversityCategoryDetail[] {
    const deduped = new Map<string, UniversityCategoryDetail>();
    items.forEach((item) => {
        const key = String(item.categorySlug || toSlug(item.categoryName || '')).trim() || String(item.categoryName || '').trim();
        if (!key) return;
        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, {
                ...item,
                categorySlug: item.categorySlug || toSlug(item.categoryName || ''),
                clusterGroups: Array.from(new Set((item.clusterGroups || []).filter(Boolean))),
            });
            return;
        }
        deduped.set(key, {
            ...existing,
            order: Math.min(Number(existing.order || 0), Number(item.order || 0)) || Number(existing.order || item.order || 0),
            count: Math.max(Number(existing.count || 0), Number(item.count || 0)),
            clusterGroups: Array.from(new Set([...(existing.clusterGroups || []), ...(item.clusterGroups || [])].filter(Boolean))),
        });
    });
    return [...deduped.values()].sort((a, b) => {
        const orderDiff = Number(a.order || 0) - Number(b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
    });
}

const UNIVERSITY_SORT_OPTIONS: UniversityCardSort[] = [
    'nearest_deadline',
    'alphabetical',
    'name_asc',
    'name_desc',
    'closing_soon',
    'exam_soon',
];

function normalizeUniversitySort(value: string, fallback: UniversityCardSort = 'name_asc'): UniversityCardSort {
    return UNIVERSITY_SORT_OPTIONS.includes(value as UniversityCardSort)
        ? (value as UniversityCardSort)
        : fallback;
}

function resolvePublicDefaultSort(value: string | undefined): UniversityCardSort {
    const normalized = normalizeUniversitySort(value || '', 'name_asc');
    if (normalized === 'alphabetical') return 'name_asc';
    if (normalized === 'nearest_deadline') return 'closing_soon';
    return normalized;
}

function resolveCategorySlug(value: string, categories: UniversityCategoryDetail[]): string {
    const normalized = String(value || '').trim();
    if (!normalized) return 'all';
    if (normalized.toLowerCase() === 'all') return 'all';
    const directSlugMatch = categories.find((item) => item.categorySlug === normalized);
    if (directSlugMatch) return directSlugMatch.categorySlug || normalized;
    const directNameMatch = categories.find((item) => item.categoryName.toLowerCase() === normalized.toLowerCase());
    if (directNameMatch) return directNameMatch.categorySlug || toSlug(directNameMatch.categoryName);
    const slugified = toSlug(normalized);
    const slugMatch = categories.find((item) => item.categorySlug === slugified);
    return slugMatch?.categorySlug || slugified;
}

interface UniversityBrowseShellProps {
    fixedCategory?: string;
    fixedCluster?: string;
    title?: string;
    subtitle?: string;
    hideCategoryTabs?: boolean;
    cardVariant?: UniversityCardVisualVariant;
}

interface ParsedBrowseState {
    category: string;
    cluster: string;
    search: string;
    sort: UniversityCardSort;
}

function parseBrowseState(args: {
    searchParams: URLSearchParams;
    categories: UniversityCategoryDetail[];
    fixedCategory?: string;
    fixedCluster?: string;
    adminDefaultCategory?: string;
    adminDefaultSort: UniversityCardSort;
}): ParsedBrowseState {
    const {
        searchParams,
        categories,
        fixedCategory,
        fixedCluster,
        adminDefaultCategory,
        adminDefaultSort,
    } = args;

    const category = fixedCategory
        ? resolveCategorySlug(fixedCategory, categories)
        : searchParams.has('category')
            ? resolveCategorySlug(searchParams.get('category') || 'all', categories)
            : adminDefaultCategory
                ? resolveCategorySlug(adminDefaultCategory, categories)
                : 'all';

    return {
        category,
        cluster: fixedCluster || searchParams.get('cluster') || '',
        search: searchParams.get('q') || '',
        sort: normalizeUniversitySort(searchParams.get('sort') || '', adminDefaultSort),
    };
}

export default function UniversityBrowseShell({
    fixedCategory,
    fixedCluster,
    title = 'Universities',
    subtitle = 'Browse universities grouped by category. Tap a category to filter.',
    hideCategoryTabs = false,
    cardVariant = 'modern',
}: UniversityBrowseShellProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const homeSettingsQuery = usePublicHomeSettings();
    const browseSettingsQuery = usePublicUniversityBrowseSettings();
    const categoriesQuery = useUniversityCategories();

    const categories = useMemo(() => sortCategories(categoriesQuery.data || []), [categoriesQuery.data]);
    const defaultCategoryFromAdmin = String(browseSettingsQuery.data?.defaultCategory || '').trim();
    const showClusterFilter = browseSettingsQuery.data?.enableClusterFilterOnUniversities !== false;
    const adminDefaultSort: UniversityCardSort = resolvePublicDefaultSort(
        homeSettingsQuery.data?.universityCardConfig?.defaultSort,
    );
    const filtersReady = categoriesQuery.isFetched && homeSettingsQuery.isFetched && browseSettingsQuery.isFetched;

    const parsedState = useMemo(() => {
        if (!filtersReady) return null;
        return parseBrowseState({
            searchParams,
            categories,
            fixedCategory,
            fixedCluster,
            adminDefaultCategory: defaultCategoryFromAdmin,
            adminDefaultSort,
        });
    }, [
        adminDefaultSort,
        categories,
        defaultCategoryFromAdmin,
        filtersReady,
        fixedCategory,
        fixedCluster,
        searchParams,
    ]);

    const [activeCategory, setActiveCategory] = useState('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCluster, setSelectedCluster] = useState('');
    const [sort, setSort] = useState<UniversityCardSort>(adminDefaultSort);
    const [filterOpen, setFilterOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        if (!parsedState) return;
        setActiveCategory((current) => (current === parsedState.category ? current : parsedState.category));
        setSelectedCluster((current) => (current === parsedState.cluster ? current : parsedState.cluster));
        setSearch((current) => (current === parsedState.search ? current : parsedState.search));
        setDebouncedSearch((current) => (current === parsedState.search ? current : parsedState.search));
        setSort((current) => (current === parsedState.sort ? current : parsedState.sort));
        setIsHydrated(true);
    }, [parsedState]);

    const updateUrlState = useCallback((next: {
        category?: string;
        cluster?: string;
        q?: string;
        sort?: UniversityCardSort;
        replace?: boolean;
    }) => {
        const params = new URLSearchParams(searchParams);

        if (!fixedCategory) {
            const nextCategory = next.category ?? activeCategory;
            if (nextCategory) params.set('category', nextCategory);
            else params.delete('category');
        }

        if (!fixedCluster) {
            const nextCluster = next.cluster ?? selectedCluster;
            if (nextCluster) params.set('cluster', nextCluster);
            else params.delete('cluster');
        }

        const nextSearch = String(next.q ?? debouncedSearch).trim();
        if (nextSearch) params.set('q', nextSearch);
        else params.delete('q');

        const nextSort = next.sort ?? sort;
        if (nextSort && nextSort !== adminDefaultSort) params.set('sort', nextSort);
        else params.delete('sort');

        const nextParams = params.toString();
        if (nextParams === searchParams.toString()) return;
        setSearchParams(params, { replace: Boolean(next.replace) });
    }, [activeCategory, adminDefaultSort, debouncedSearch, fixedCategory, fixedCluster, searchParams, selectedCluster, setSearchParams, sort]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(search);
        }, 350);
        return () => window.clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        if (!isHydrated) return;
        const currentSearch = String(searchParams.get('q') || '').trim();
        const nextSearch = debouncedSearch.trim();
        if (currentSearch === nextSearch) return;
        updateUrlState({ q: nextSearch, replace: true });
    }, [debouncedSearch, isHydrated, searchParams, updateUrlState]);

    const activeCategoryMeta = useMemo(
        () => activeCategory === 'all'
            ? null
            : categories.find((item) => item.categorySlug === activeCategory || item.categoryName === activeCategory) || null,
        [categories, activeCategory],
    );

    const activeCategoryQueryValue = activeCategory === 'all'
        ? 'all'
        : activeCategoryMeta?.categoryName || activeCategory;

    const clusters = useMemo(() => {
        if (activeCategory === 'all') {
            return Array.from(
                new Set(categories.flatMap((item) => item.clusterGroups || []).filter(Boolean)),
            ).sort((left, right) => left.localeCompare(right));
        }
        return Array.from(new Set((activeCategoryMeta?.clusterGroups || []).filter(Boolean)));
    }, [activeCategory, activeCategoryMeta, categories]);

    const effectiveCluster = useMemo(() => {
        if (fixedCluster) return fixedCluster;
        if (!selectedCluster) return '';
        return clusters.includes(selectedCluster) ? selectedCluster : '';
    }, [clusters, fixedCluster, selectedCluster]);

    useEffect(() => {
        if (!isHydrated || fixedCluster || !selectedCluster) return;
        if (!effectiveCluster) {
            setSelectedCluster('');
            updateUrlState({ cluster: '', replace: true });
        }
    }, [effectiveCluster, fixedCluster, isHydrated, selectedCluster, updateUrlState]);

    useEffect(() => {
        if (showClusterFilter || !isHydrated || !selectedCluster) return;
        setSelectedCluster('');
        updateUrlState({ cluster: '', replace: true });
    }, [isHydrated, selectedCluster, showClusterFilter, updateUrlState]);

    const handleCategoryChange = useCallback((categorySlug: string) => {
        if (fixedCategory) return;
        const nextCategory = resolveCategorySlug(categorySlug || 'all', categories);
        setActiveCategory(nextCategory);
        setSelectedCluster('');
        updateUrlState({ category: nextCategory, cluster: '' });
    }, [categories, fixedCategory, updateUrlState]);

    const handleClusterChange = useCallback((nextCluster: string) => {
        setSelectedCluster(nextCluster);
        updateUrlState({ cluster: nextCluster });
    }, [updateUrlState]);

    const handleSortChange = useCallback((nextSort: UniversityCardSort) => {
        setSort(nextSort);
        updateUrlState({ sort: nextSort });
    }, [updateUrlState]);

    const universitiesQuery = useUniversities({
        category: activeCategoryQueryValue,
        clusterGroup: effectiveCluster || undefined,
        q: debouncedSearch.trim() || undefined,
        sort,
        enabled: filtersReady && isHydrated && Boolean(activeCategoryQueryValue),
    });

    const mappedItems = useMemo(() => {
        const seen = new Set<string>();
        return (universitiesQuery.data || []).filter((item) => {
            const candidate = item as unknown as { id?: string; _id?: string; slug?: string; title?: string };
            const key = String(candidate.id || candidate._id || candidate.slug || candidate.title || '').trim();
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [universitiesQuery.data]);

    const animationLevel = homeSettingsQuery.data?.ui?.animationLevel || 'minimal';
    const cardConfig = homeSettingsQuery.data?.universityCardConfig;
    const hasActiveFilters = Boolean(search.trim() || effectiveCluster || sort !== adminDefaultSort);
    const loading = !isHydrated
        || categoriesQuery.isLoading
        || homeSettingsQuery.isLoading
        || browseSettingsQuery.isLoading
        || universitiesQuery.isLoading
        || (universitiesQuery.isFetching && universitiesQuery.isPlaceholderData);

    return (
        <div className="section-container py-6 sm:py-8 lg:py-10 overflow-x-hidden">
            <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-text dark:text-dark-text">{title}</h1>
                    <p className="mt-1 text-xs sm:text-sm text-text-muted dark:text-dark-text/60">{subtitle}</p>
                </div>
                <p className="text-xs font-medium text-text-muted dark:text-dark-text/50 tabular-nums">
                    {mappedItems.length} {mappedItems.length === 1 ? 'university' : 'universities'}
                </p>
            </div>

            <UniversityFilterBar
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
                search={search}
                setSearch={setSearch}
                sort={sort}
                setSort={handleSortChange}
                clusters={clusters}
                showClusterFilter={showClusterFilter}
                selectedCluster={effectiveCluster}
                setSelectedCluster={handleClusterChange}
                hasActiveFilters={hasActiveFilters}
                onOpenMobileFilters={() => setFilterOpen(true)}
                onClearFilters={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setSelectedCluster('');
                    setSort(adminDefaultSort);
                    updateUrlState({ cluster: '', q: '', sort: adminDefaultSort, replace: true });
                }}
                hideCategoryTabs={hideCategoryTabs}
            />

            <div className="mt-5 sm:mt-6">
                {universitiesQuery.isError ? (
                    <div className="mb-4 card-flat p-4 text-sm">
                        <p className="inline-flex items-center gap-2 font-semibold text-danger">
                            <TriangleAlert className="h-4 w-4" />
                            Failed to load universities
                        </p>
                        <button
                            type="button"
                            onClick={() => universitiesQuery.refetch()}
                            className="btn-secondary mt-3"
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                        </button>
                    </div>
                ) : null}
                <UniversityGrid
                    items={mappedItems as unknown as Record<string, unknown>[]}
                    config={cardConfig}
                    animationLevel={animationLevel}
                    loading={loading}
                    emptyText="No universities in this category."
                    sort={sort}
                    cardVariant={cardVariant}
                />
            </div>

            <FilterBottomSheet
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                search={search}
                setSearch={setSearch}
                sort={sort}
                setSort={handleSortChange}
                clusters={clusters}
                showClusterFilter={showClusterFilter}
                selectedCluster={effectiveCluster}
                setSelectedCluster={handleClusterChange}
            />
        </div>
    );
}
