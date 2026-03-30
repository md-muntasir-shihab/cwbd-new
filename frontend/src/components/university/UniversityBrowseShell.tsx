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
} from '../../hooks/useUniversityQueries';
import type { UniversityCardSort } from '../../services/api';
import type { UniversityCategoryDetail } from '../../lib/apiClient';
import type { UniversityCardVisualVariant } from './UniversityCard';

function sortCategories(items: UniversityCategoryDetail[]): UniversityCategoryDetail[] {
    return [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
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
    if (normalized === 'nearest_deadline' || normalized === 'closing_soon') {
        return 'name_asc';
    }
    if (normalized === 'alphabetical') {
        return 'name_asc';
    }
    return normalized;
}

interface UniversityBrowseShellProps {
    /** Lock category (category browse page) */
    fixedCategory?: string;
    /** Lock cluster group (cluster browse page) */
    fixedCluster?: string;
    /** Page header */
    title?: string;
    subtitle?: string;
    /** Hide category chip tabs (e.g. on a category-specific page) */
    hideCategoryTabs?: boolean;
    cardVariant?: UniversityCardVisualVariant;
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
    const categoryFromUrl = searchParams.get('category') || '';
    const clusterFromUrl = searchParams.get('cluster') || '';
    const searchFromUrl = searchParams.get('q') || '';

    const homeSettingsQuery = usePublicHomeSettings();
    const categoriesQuery = useUniversityCategories();

    const categories = useMemo(() => sortCategories(categoriesQuery.data || []), [categoriesQuery.data]);
    const defaultCategoryFromAdmin = String(homeSettingsQuery.data?.universityDashboard?.defaultCategory || '').trim();
    const adminDefaultSort: UniversityCardSort = resolvePublicDefaultSort(
        homeSettingsQuery.data?.universityCardConfig?.defaultSort,
    );
    const sortFromUrl = normalizeUniversitySort(searchParams.get('sort') || '', adminDefaultSort);

    const [search, setSearch] = useState(searchFromUrl);
    const [debouncedSearch, setDebouncedSearch] = useState(searchFromUrl);
    const [selectedCategory, setSelectedCategory] = useState(fixedCategory || categoryFromUrl || 'all');
    const [selectedCluster, setSelectedCluster] = useState(fixedCluster || clusterFromUrl || '');
    const [sort, setSort] = useState<UniversityCardSort>(sortFromUrl);
    const [filterOpen, setFilterOpen] = useState(false);

    const syncUrlState = useCallback((next: {
        category?: string;
        cluster?: string;
        q?: string;
        sort?: string;
    }) => {
        const params = new URLSearchParams(searchParams);
        const categoryValue = fixedCategory ? fixedCategory : (next.category ?? selectedCategory);
        const clusterValue = fixedCluster ? fixedCluster : (next.cluster ?? selectedCluster);
        const searchValue = next.q ?? search;
        const sortValue = next.sort ?? sort;

        if (!fixedCategory && categoryValue && categoryValue.toLowerCase() !== 'all') params.set('category', categoryValue);
        else params.delete('category');

        if (!fixedCluster && clusterValue) params.set('cluster', clusterValue);
        else params.delete('cluster');

        if (searchValue.trim()) params.set('q', searchValue.trim());
        else params.delete('q');

        if (sortValue && sortValue !== adminDefaultSort) params.set('sort', sortValue);
        else params.delete('sort');

        const nextParams = params.toString();
        const currentParams = searchParams.toString();
        if (nextParams === currentParams) return;

        setSearchParams(params, { replace: true });
    }, [adminDefaultSort, fixedCategory, fixedCluster, searchParams, selectedCategory, selectedCluster, search, sort, setSearchParams]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(search);
        }, 350);
        return () => window.clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        setSearch((current) => current === searchFromUrl ? current : searchFromUrl);
    }, [searchFromUrl]);

    useEffect(() => {
        setSort((current) => current === sortFromUrl ? current : sortFromUrl);
    }, [sortFromUrl]);

    useEffect(() => {
        if (fixedCluster) {
            setSelectedCluster((current) => current === fixedCluster ? current : fixedCluster);
            return;
        }
        setSelectedCluster((current) => current === clusterFromUrl ? current : clusterFromUrl);
    }, [clusterFromUrl, fixedCluster]);

    useEffect(() => {
        if (!categories.length) return;
        if (fixedCluster) {
            const parent = categories.find((c) => c.clusterGroups.includes(fixedCluster));
            const nextCategory = parent?.categoryName || categories[0]?.categoryName || '';
            if (nextCategory) {
                setSelectedCategory((current) => current === nextCategory ? current : nextCategory);
            }
            return;
        }
        if (fixedCategory) {
            setSelectedCategory((current) => current === fixedCategory ? current : fixedCategory);
            return;
        }
        if (categoryFromUrl) {
            if (categoryFromUrl.trim().toLowerCase() === 'all') {
                setSelectedCategory((current) => current === 'all' ? current : 'all');
                return;
            }
            const match = categories.find((c) => c.categoryName === categoryFromUrl);
            if (match) {
                setSelectedCategory((current) => current === match.categoryName ? current : match.categoryName);
                return;
            }
        }
        setSelectedCategory((current) => current === 'all' ? current : 'all');
    }, [categories, categoryFromUrl, fixedCategory, fixedCluster]);

    const handleCategoryChange = useCallback((cat: string) => {
        if (fixedCategory) return;
        setSelectedCategory(cat);
        setSelectedCluster('');
        syncUrlState({ category: cat, cluster: '' });
    }, [syncUrlState, fixedCategory]);

    // Fallback if selected category doesn't exist
    useEffect(() => {
        if (fixedCategory || !categories.length) return;
        const normalizedCategory = selectedCategory.trim().toLowerCase();
        if (!normalizedCategory) {
            setSelectedCategory('all');
            return;
        }
        if (normalizedCategory === 'all') {
            return;
        }
        const exists = categories.some((c) => c.categoryName === selectedCategory);
        if (!exists) setSelectedCategory('all');
    }, [categories, selectedCategory, fixedCategory]);

    const activeCategory = useMemo(() => {
        if (fixedCategory) return fixedCategory;
        if (selectedCategory.trim()) return selectedCategory;
        if (categoryFromUrl.trim().toLowerCase() === 'all') return 'all';
        if (defaultCategoryFromAdmin && categories.some((item) => item.categoryName === defaultCategoryFromAdmin)) {
            return defaultCategoryFromAdmin;
        }
        return 'all';
    }, [categories, categoryFromUrl, defaultCategoryFromAdmin, fixedCategory, selectedCategory]);
    const activeCategoryMeta = useMemo(
        () => activeCategory === 'all' ? null : categories.find((item) => item.categoryName === activeCategory) || null,
        [categories, activeCategory],
    );
    const clusters = useMemo(
        () => (activeCategoryMeta?.clusterGroups || []).filter(Boolean),
        [activeCategoryMeta],
    );

    const effectiveCluster = useMemo(() => {
        if (fixedCluster) return fixedCluster;
        if (!selectedCluster) return '';
        if (!activeCategoryMeta) return '';
        return clusters.includes(selectedCluster) ? selectedCluster : '';
    }, [activeCategoryMeta, clusters, fixedCluster, selectedCluster]);

    useEffect(() => {
        if (!selectedCluster || fixedCluster || !activeCategoryMeta) return;
        if (!effectiveCluster) {
            setSelectedCluster('');
        }
    }, [activeCategoryMeta, effectiveCluster, fixedCluster, selectedCluster]);

    useEffect(() => {
        syncUrlState({});
    }, [search, selectedCluster, sort, selectedCategory, syncUrlState]);

    const universitiesQuery = useUniversities({
        category: activeCategory || 'all',
        clusterGroup: effectiveCluster || undefined,
        q: debouncedSearch.trim() || undefined,
        sort,
    });

    const mappedItems = useMemo(
        () => {
            const seen = new Set<string>();
            return (universitiesQuery.data || []).filter((item) => {
                const candidate = item as unknown as { id?: string; _id?: string; slug?: string; title?: string };
                const key = String(candidate.id || candidate._id || candidate.slug || candidate.title || '').trim();
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        },
        [universitiesQuery.data],
    );
    const animationLevel = homeSettingsQuery.data?.ui?.animationLevel || 'minimal';
    const cardConfig = homeSettingsQuery.data?.universityCardConfig;
    const hasActiveFilters = Boolean(search.trim() || effectiveCluster);

    return (
        <div className="section-container py-6 sm:py-8 overflow-x-hidden">
            {/* Page title */}
            <div className="mb-4">
                <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-text dark:text-dark-text">{title}</h1>
                <p className="mt-1 text-xs sm:text-sm text-text-muted dark:text-dark-text/70">{subtitle}</p>
            </div>

            {/* Filter bar */}
            <UniversityFilterBar
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
                search={search}
                setSearch={setSearch}
                sort={sort}
                setSort={setSort}
                clusters={clusters}
                selectedCluster={effectiveCluster}
                setSelectedCluster={setSelectedCluster}
                hasActiveFilters={hasActiveFilters}
                onOpenMobileFilters={() => setFilterOpen(true)}
                onClearFilters={() => {
                    setSearch('');
                    setSelectedCluster('');
                    setSort(adminDefaultSort);
                    syncUrlState({ cluster: '', q: '', sort: adminDefaultSort });
                }}
                hideCategoryTabs={hideCategoryTabs}
            />

            {/* University grid */}
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
                    loading={universitiesQuery.isLoading || (universitiesQuery.isFetching && universitiesQuery.isPlaceholderData)}
                    emptyText="No universities in this category."
                    sort={sort}
                    cardVariant={cardVariant}
                />
            </div>

            {/* Mobile bottom sheet */}
            <FilterBottomSheet
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                search={search}
                setSearch={setSearch}
                sort={sort}
                setSort={setSort}
                clusters={clusters}
                selectedCluster={effectiveCluster}
                setSelectedCluster={setSelectedCluster}
            />
        </div>
    );
}
