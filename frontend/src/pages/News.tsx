import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Filter,
    RefreshCw,
    Search,
    Share2,
    Tag,
    ArrowRight,
    X,
    Sparkles,
    Globe2,
    Layers,
} from 'lucide-react';
import PageHeroBanner from '../components/common/PageHeroBanner';
import HeroSearchInput from '../components/common/HeroSearchInput';
import { usePageHeroSettings } from '../hooks/usePageHeroSettings';
import toast from 'react-hot-toast';
import {
    ApiNews,
    ApiNewsPublicSettings,
    getPublicNewsSettings,
    getPublicNewsSources,
    getPublicNewsV2List,
    getPublicNewsV2Widgets,
    trackPublicNewsV2Share,
} from '../services/api';
import { buildMediaUrl } from '../utils/mediaUrl';

const DEFAULT_SETTINGS: ApiNewsPublicSettings = {
    pageTitle: 'Admission News & Updates',
    pageSubtitle: 'Live updates from verified CampusWay RSS feeds.',
    headerBannerUrl: '',
    defaultBannerUrl: '',
    defaultThumbUrl: '',
    defaultSourceIconUrl: '',
    appearance: {
        layoutMode: 'rss_reader',
        density: 'comfortable',
        cardDensity: 'comfortable',
        paginationMode: 'pages',
        showWidgets: {
            trending: true,
            latest: true,
            sourceSidebar: true,
            tagChips: true,
            previewPanel: true,
            breakingTicker: false,
        },
        showSourceIcons: true,
        showTrendingWidget: true,
        showCategoryWidget: true,
        showShareButtons: true,
        animationLevel: 'normal',
        thumbnailFallbackUrl: '',
    },
    shareTemplates: {},
    shareButtons: {
        whatsapp: true,
        facebook: true,
        messenger: true,
        telegram: true,
        copyLink: true,
        copyText: true,
    },
    workflow: {
        allowScheduling: true,
        openOriginalWhenExtractionIncomplete: true,
    },
};

function getArticleImage(news: ApiNews, settings: ApiNewsPublicSettings): string {
    const fallback =
        settings.defaultBannerUrl
        || settings.defaultThumbUrl
        || settings.appearance.thumbnailFallbackUrl
        || '/logo.svg';
    const forceDefault = String(news.coverImageSource || news.coverSource || '').toLowerCase() === 'default';
    if (forceDefault) return buildMediaUrl(fallback);
    return buildMediaUrl(
        news.coverImageUrl
        || news.coverImage
        || news.thumbnailImage
        || news.featuredImage
        || news.fallbackBanner
        || fallback
    );
}

function renderDate(value?: string): string {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
}

function getOriginalArticleUrl(news: ApiNews): string {
    return String(news.originalArticleUrl || news.originalLink || '').trim();
}

function shouldOpenOriginalSource(news: ApiNews, settings: ApiNewsPublicSettings): boolean {
    const sourceType = String(news.sourceType || '').toLowerCase();
    const hasOriginalUrl = Boolean(getOriginalArticleUrl(news));
    const allowFallback = settings.workflow?.openOriginalWhenExtractionIncomplete !== false;
    return (
        allowFallback
        && hasOriginalUrl
        && (sourceType === 'rss' || sourceType === 'ai_assisted')
        && news.fetchedFullText === false
    );
}

export default function NewsPage() {
    const hero = usePageHeroSettings('news');
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [source, setSource] = useState('');
    const [category, setCategory] = useState('All');
    const [tag, setTag] = useState('');
    const [preview, setPreview] = useState<ApiNews | null>(null);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [infiniteItems, setInfiniteItems] = useState<ApiNews[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
            setInfiniteItems([]);
        }, 320);
        return () => window.clearTimeout(timer);
    }, [search]);

    const listFilters = useMemo(
        () => ({
            page,
            limit: 15,
            source,
            category: category.trim().toLowerCase() === 'all' ? '' : category,
            tag,
            q: debouncedSearch,
        }),
        [page, source, category, tag, debouncedSearch]
    );

    const settingsQuery = useQuery({
        queryKey: ['newsSettings'],
        queryFn: async () => (await getPublicNewsSettings()).data,
    });

    const sourcesQuery = useQuery({
        queryKey: ['newsSources'],
        queryFn: async () => (await getPublicNewsSources()).data,
    });

    const widgetsQuery = useQuery({
        queryKey: ['news.public.widgets'],
        queryFn: async () => (await getPublicNewsV2Widgets()).data,
    });

    const listQuery = useQuery({
        queryKey: ['newsList', listFilters],
        queryFn: async () =>
            (
                await getPublicNewsV2List(listFilters)
            ).data,
    });

    const settings = settingsQuery.data || DEFAULT_SETTINGS;
    const pageTitle = settings.pageTitle || settings.newsPageTitle || DEFAULT_SETTINGS.pageTitle;
    const pageSubtitle = settings.pageSubtitle || settings.newsPageSubtitle || DEFAULT_SETTINGS.pageSubtitle;
    const shareButtons = settings.shareButtons || DEFAULT_SETTINGS.shareButtons;
    const items = listQuery.data?.items || [];
    const pages = Math.max(1, listQuery.data?.pages || 1);
    const paginationMode = settings.appearance.paginationMode || 'pages';
    const layoutMode = settings.appearance.layoutMode || 'rss_reader';
    const categories = useMemo(() => {
        const raw = ['All', ...(widgetsQuery.data?.categories || []).map((item) => item._id).filter(Boolean)];
        const seen = new Set<string>();
        return raw.filter((item) => {
            const key = String(item).trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [widgetsQuery.data?.categories]);
    const tags = useMemo(() => {
        if (settings.appearance.showWidgets?.tagChips === false) return [];
        const raw = (widgetsQuery.data?.tags || []).map((item) => item._id).filter(Boolean);
        const seen = new Set<string>();
        return raw.filter((item) => {
            const key = String(item).trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [settings.appearance.showWidgets?.tagChips, widgetsQuery.data?.tags]);
    const sources = sourcesQuery.data?.items || [];
    const isLoading = settingsQuery.isLoading || sourcesQuery.isLoading || widgetsQuery.isLoading || listQuery.isLoading;

    useEffect(() => {
        setPage(1);
        setInfiniteItems([]);
    }, [source, category, tag, debouncedSearch, paginationMode]);

    useEffect(() => {
        if (paginationMode !== 'infinite') {
            setInfiniteItems(items);
            return;
        }
        if (page === 1) {
            setInfiniteItems(items);
            return;
        }
        setInfiniteItems((prev) => {
            const merged = [...prev];
            items.forEach((item) => {
                if (!merged.some((entry) => entry._id === item._id)) {
                    merged.push(item);
                }
            });
            return merged;
        });
    }, [items, page, paginationMode]);

    const renderedItems = paginationMode === 'infinite' ? infiniteItems : items;
    const showSourceSidebar = layoutMode === 'rss_reader' && settings.appearance.showWidgets?.sourceSidebar !== false;
    const showPreviewPanel = layoutMode === 'rss_reader' && settings.appearance.showWidgets?.previewPanel !== false;

    useEffect(() => {
        if (renderedItems.length === 0) {
            setPreview(null);
            return;
        }
        const exists = preview && renderedItems.some((item) => item._id === preview._id);
        if (!exists) setPreview(renderedItems[0]);
    }, [renderedItems, preview]);

    async function handleShare(news: ApiNews, channel: 'whatsapp' | 'facebook' | 'messenger' | 'telegram' | 'copy_link' | 'copy_text') {
        try {
            const newsTarget = news.slug || news._id;
            const shareUrl = news.shareUrl || `${window.location.origin}/news/${newsTarget}`;
            const shareText = news.shareText?.[channel.replace('copy_', '') as 'whatsapp' | 'facebook' | 'messenger' | 'telegram']
                || `${news.title}\n${shareUrl}`;

            if (channel === 'copy_link') {
                await navigator.clipboard.writeText(shareUrl);
            } else if (channel === 'copy_text') {
                await navigator.clipboard.writeText(shareText);
            } else {
                const linkMap: Record<'whatsapp' | 'facebook' | 'messenger' | 'telegram', string> = {
                    whatsapp: news.shareLinks?.whatsapp || `https://wa.me/?text=${encodeURIComponent(shareText)}`,
                    facebook: news.shareLinks?.facebook || `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
                    messenger: news.shareLinks?.messenger || `https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}`,
                    telegram: news.shareLinks?.telegram || `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
                };
                window.open(linkMap[channel], '_blank', 'noopener,noreferrer');
            }
            toast.success('Shared');
        } catch {
            toast.error('Share failed');
            return;
        }

        try {
            const trackChannel = channel === 'copy_link' || channel === 'copy_text' ? 'copy' : channel;
            await trackPublicNewsV2Share(news.slug, trackChannel);
        } catch {
            // Share tracking failures should not block user-facing share action.
        }
    }

    return (
        <>
            {hero.enabled && (
                <PageHeroBanner
                    title={hero.title}
                    subtitle={hero.subtitle}
                    pillText={hero.pillText}
                    vantaEffect={hero.vantaEffect}
                    vantaColor={hero.vantaColor}
                    vantaBackgroundColor={hero.vantaBackgroundColor}
                    gradientFrom={hero.gradientFrom}
                    gradientTo={hero.gradientTo}
                    primaryCTA={hero.primaryCTA}
                    secondaryCTA={hero.secondaryCTA}
                >
                    <HeroSearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="নিউজ খুঁজুন..."
                        className="mt-2"
                    />
                </PageHeroBanner>
            )}
            <div className="min-h-screen bg-background dark:bg-[#081322]">


                <div className={`mx-auto grid w-full grid-cols-1 gap-4 px-5 py-6 sm:px-8 md:px-10 lg:px-16 xl:px-24 2xl:px-32 ${layoutMode === 'rss_reader' ? 'lg:grid-cols-[260px_1fr_320px]' : ''}`}>
                    <aside className={`${showSourceSidebar ? 'hidden lg:block' : 'hidden'} space-y-4`}>
                        <FilterPanel
                            search={search}
                            onSearch={setSearch}
                            category={category}
                            onCategory={setCategory}
                            categories={categories}
                            source={source}
                            onSource={setSource}
                            sources={sources}
                            tag={tag}
                            onTag={setTag}
                            tags={tags}
                        />
                    </aside>

                    <section className="space-y-3">
                        {!showSourceSidebar ? (
                            <FilterPanel
                                search={search}
                                onSearch={setSearch}
                                category={category}
                                onCategory={setCategory}
                                categories={categories}
                                source={source}
                                onSource={setSource}
                                sources={sources}
                                tag={tag}
                                onTag={setTag}
                                tags={tags}
                            />
                        ) : null}
                        {isLoading && (
                            <div className="space-y-3">
                                {Array.from({ length: 6 }).map((_, idx) => (
                                    <div key={idx} className="skeleton h-36 w-full rounded-2xl" />
                                ))}
                            </div>
                        )}

                        {!isLoading && (listQuery.isError || settingsQuery.isError) && (
                            <div className="rounded-2xl border border-dashed border-slate-200/50 bg-white px-6 py-10 text-center dark:border-white/[0.06] dark:bg-slate-900/50">
                                <AlertCircle className="mx-auto h-10 w-10 text-red-400 dark:text-red-300" />
                                <p className="mt-3 text-sm font-medium text-text-muted dark:text-dark-text/75">
                                    Failed to load news
                                </p>
                                <button
                                    type="button"
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                                    onClick={() => {
                                        listQuery.refetch();
                                        settingsQuery.refetch();
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Retry
                                </button>
                            </div>
                        )}

                        {!isLoading && renderedItems.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200/50 bg-white px-6 py-10 text-center text-sm text-text-muted dark:border-white/[0.06] dark:bg-slate-900/50 dark:text-dark-text/75">
                                No news found for this filter.
                            </div>
                        )}

                        {!isLoading && (
                            <motion.div
                                initial="hidden"
                                animate="show"
                                variants={{
                                    hidden: { opacity: 0 },
                                    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
                                }}
                                className={layoutMode === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'space-y-3'}
                            >
                                {renderedItems.map((news) => (
                                    <NewsArticleCard
                                        key={news._id}
                                        news={news}
                                        settings={settings}
                                        isSelected={preview?._id === news._id}
                                        layoutMode={layoutMode}
                                        shareButtons={shareButtons}
                                        onSelect={() => {
                                            if (window.matchMedia('(max-width: 1023px)').matches) {
                                                const target = news.slug || news._id;
                                                if (target) navigate(`/news/${target}`);
                                                return;
                                            }
                                            setPreview(news);
                                        }}
                                        onShare={handleShare}
                                    />
                                ))}
                            </motion.div>
                        )}

                        {paginationMode === 'infinite' ? (
                            <div className="flex items-center justify-center gap-2 pt-2">
                                <button
                                    type="button"
                                    className="btn-outline"
                                    disabled={page >= pages}
                                    onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
                                >
                                    {page >= pages ? 'No More News' : 'Load More'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="btn-outline"
                                    disabled={page <= 1}
                                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-slate-500 dark:text-slate-300">
                                    Page {page} / {pages}
                                </span>
                                <button
                                    type="button"
                                    className="btn-outline"
                                    disabled={page >= pages}
                                    onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </section>

                    <aside className={`${showPreviewPanel ? 'hidden lg:block' : 'hidden'}`}>
                        <motion.div
                            key={preview?._id || 'empty'}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className="sticky top-24 space-y-4 rounded-2xl border border-slate-200/50 bg-white/95 p-5 shadow-lg dark:border-white/[0.06] dark:bg-slate-900/80 backdrop-blur-sm"
                        >
                            {preview ? (
                                <>
                                    <div className="relative overflow-hidden rounded-xl">
                                        <img
                                            src={getArticleImage(preview, settings)}
                                            alt={preview.title || 'News article'}
                                            className="h-48 w-full object-cover"
                                            loading="lazy"
                                            onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                                        />
                                        {preview.category && (
                                            <span className="absolute top-3 left-3 rounded-full bg-white/90 dark:bg-slate-900/90 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)] backdrop-blur-sm shadow-sm">
                                                {preview.category}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-bold text-text dark:text-dark-text leading-snug">{preview.title}</h3>
                                    <p className="text-sm text-text-muted dark:text-dark-text/70 leading-relaxed">
                                        {preview.shortSummary || preview.shortDescription}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-text-muted dark:text-dark-text/60">
                                        <img
                                            src={buildMediaUrl(preview.sourceIconUrl || settings.defaultSourceIconUrl || '/logo.svg')}
                                            alt=""
                                            className="h-4 w-4 rounded-full"
                                            onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                                        />
                                        <span className="font-medium">{preview.sourceName || 'CampusWay'}</span>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span>{renderDate(preview.publishedAt || preview.publishDate || preview.createdAt)}</span>
                                    </div>
                                    {shouldOpenOriginalSource(preview, settings) ? (
                                        <a
                                            href={getOriginalArticleUrl(preview)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 w-full justify-center"
                                        >
                                            Read Original Source
                                            <ArrowRight className="h-4 w-4" />
                                        </a>
                                    ) : (
                                        <Link
                                            to={`/news/${preview.slug || preview._id}`}
                                            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 w-full justify-center"
                                        >
                                            Read full article
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-3 py-8 text-center">
                                    <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                                        <Sparkles className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <p className="text-sm text-text-muted dark:text-dark-text/60">Click an article to preview it here.</p>
                                </div>
                            )}
                        </motion.div>
                    </aside>
                </div>

                {mobileFilterOpen && (
                    <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMobileFilterOpen(false)}>
                        <div
                            className="absolute bottom-0 left-0 right-0 max-h-[84vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl dark:bg-slate-950"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Filter News</h2>
                                <button
                                    type="button"
                                    className="rounded-lg border border-slate-300 p-2 dark:border-white/20"
                                    onClick={() => setMobileFilterOpen(false)}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <FilterPanel
                                search={search}
                                onSearch={setSearch}
                                category={category}
                                onCategory={setCategory}
                                categories={categories}
                                source={source}
                                onSource={setSource}
                                sources={sources}
                                tag={tag}
                                onTag={setTag}
                                tags={tags}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

function FilterPanel({
    search,
    onSearch,
    category,
    onCategory,
    categories,
    source,
    onSource,
    sources,
    tag,
    onTag,
    tags,
}: {
    search: string;
    onSearch: (value: string) => void;
    category: string;
    onCategory: (value: string) => void;
    categories: string[];
    source: string;
    onSource: (value: string) => void;
    sources: Array<{ _id: string; name: string; iconUrl?: string; count: number }>;
    tag: string;
    onTag: (value: string) => void;
    tags: string[];
}) {
    const [sourceSearch, setSourceSearch] = useState('');
    const filteredSources = useMemo(() => {
        const q = sourceSearch.trim().toLowerCase();
        if (!q) return sources;
        return sources.filter((item) => item.name.toLowerCase().includes(q));
    }, [sourceSearch, sources]);

    return (
        <div className="space-y-1 rounded-2xl border border-slate-200/50 bg-white/95 shadow-sm backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/80 overflow-hidden">
            {/* Sources Section */}
            <div className="p-4 pb-3">
                <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    <Globe2 className="h-3.5 w-3.5" />
                    Sources
                </h3>
                <label className="relative block mb-2.5">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                        className="w-full rounded-lg border border-slate-200/60 bg-slate-50 py-1.5 pl-8 pr-2 text-xs outline-none transition focus:border-cyan-500 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:focus:border-cyan-500 dark:focus:bg-white/[0.06]"
                        placeholder="Filter sources..."
                        aria-label="Filter news sources"
                        value={sourceSearch}
                        onChange={(e) => setSourceSearch(e.target.value)}
                    />
                </label>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    <button
                        type="button"
                        onClick={() => onSource('')}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors ${source === '' ? 'bg-cyan-500/12 text-cyan-700 font-medium dark:text-cyan-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                            }`}
                    >
                        <span>All Sources</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">{sources.reduce((a, s) => a + s.count, 0)}</span>
                    </button>
                    {filteredSources.map((item) => (
                        <button
                            key={item._id}
                            type="button"
                            onClick={() => onSource(item._id)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors ${source === item._id ? 'bg-cyan-500/12 text-cyan-700 font-medium dark:text-cyan-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                                }`}
                        >
                            <span className="inline-flex items-center gap-2 truncate">
                                {item.iconUrl ? <img src={buildMediaUrl(item.iconUrl)} alt={item.name} className="h-4 w-4 rounded-full object-cover flex-shrink-0" /> : <span className="h-4 w-4 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex-shrink-0" />}
                                <span className="truncate">{item.name}</span>
                            </span>
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400 flex-shrink-0 ml-2">{item.count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 dark:border-white/5" />

            {/* Categories Section */}
            <div className="p-4 pb-3">
                <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    <Layers className="h-3.5 w-3.5" />
                    Categories
                </h3>
                <div className="flex flex-wrap gap-1.5">
                    {categories.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onCategory(item)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${category === item
                                ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/25'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/12'
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 dark:border-white/5" />

            {/* Tags Section */}
            <div className="p-4 pt-3">
                <h3 className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() => onTag('')}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${tag === '' ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/25' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/12'
                            }`}
                    >
                        All
                    </button>
                    {tags.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onTag(item)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${tag === item
                                ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/25'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/12'
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function NewsArticleCard({
    news,
    settings,
    isSelected,
    layoutMode,
    shareButtons,
    onSelect,
    onShare,
}: {
    news: ApiNews;
    settings: ApiNewsPublicSettings;
    isSelected: boolean;
    layoutMode: string;
    shareButtons: Record<string, boolean>;
    onSelect: () => void;
    onShare: (news: ApiNews, channel: 'whatsapp' | 'facebook' | 'messenger' | 'telegram' | 'copy_link' | 'copy_text') => void;
}) {
    const [shareOpen, setShareOpen] = useState(false);
    const hasAnyShare = shareButtons.whatsapp || shareButtons.facebook || shareButtons.messenger || shareButtons.telegram || shareButtons.copyLink;

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!shareOpen) return;
        const close = () => setShareOpen(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [shareOpen]);

    return (
        <motion.article
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.18 }}
            onClick={onSelect}
            className={`group relative cursor-pointer rounded-2xl border bg-white/95 shadow-sm transition-all duration-200 backdrop-blur-sm dark:bg-slate-900/80 ${isSelected
                ? 'border-cyan-500/60 ring-2 ring-cyan-500/20 shadow-md'
                : 'border-slate-200/50 hover:border-cyan-400/40 hover:shadow-lg dark:border-white/[0.06] dark:hover:border-cyan-500/30'
                }`}
        >
            <div className={`grid grid-cols-1 ${layoutMode === 'list' ? 'sm:grid-cols-[200px_1fr]' : 'sm:grid-cols-[180px_1fr]'}`}>
                {/* Image */}
                <div className="relative overflow-hidden rounded-l-2xl">
                    <img
                        src={getArticleImage(news, settings)}
                        alt={news.title || 'News article'}
                        className="h-40 w-full object-cover sm:h-full transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                    />
                    {news.category && (
                        <span className="absolute top-2.5 left-2.5 rounded-full bg-white/90 dark:bg-slate-900/90 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)] backdrop-blur-sm shadow-sm">
                            {news.category}
                        </span>
                    )}
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col gap-2">
                    <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug text-text dark:text-dark-text group-hover:text-[var(--primary)] transition-colors">
                        {news.title}
                    </h2>
                    <p className="line-clamp-2 text-[13px] text-text-muted dark:text-dark-text/70 leading-relaxed">
                        {news.shortSummary || news.shortDescription}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 text-[11px] text-text-muted dark:text-dark-text/60 mt-auto">
                        {settings.appearance.showSourceIcons && (
                            <img
                                src={buildMediaUrl(news.sourceIconUrl || settings.defaultSourceIconUrl || '/logo.svg')}
                                alt=""
                                className="h-4 w-4 rounded-full object-cover ring-1 ring-slate-200/60 dark:ring-slate-700/60"
                                onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                            />
                        )}
                        <span className="font-medium">{news.sourceName || 'CampusWay'}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>{renderDate(news.publishedAt || news.publishDate || news.createdAt)}</span>
                        {news.aiUsed && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300">
                                <Sparkles className="h-2.5 w-2.5" />
                                AI
                            </span>
                        )}
                    </div>

                    {/* Action row — clean: just Read + Share icon */}
                    <div className="flex items-center gap-2 pt-1">
                        {shouldOpenOriginalSource(news, settings) ? (
                            <a
                                href={getOriginalArticleUrl(news)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                            >
                                Read Source
                                <ArrowRight className="h-3 w-3" />
                            </a>
                        ) : (
                            <Link
                                to={`/news/${news.slug || news._id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                            >
                                Read
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        )}

                        {/* Share dropdown */}
                        {hasAnyShare && (
                            <div className="relative ml-auto">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShareOpen(!shareOpen); }}
                                    className="rounded-lg border border-slate-200/50 p-1.5 text-text-muted hover:border-[var(--primary)]/40 hover:text-[var(--primary)] transition-colors dark:border-white/[0.08] dark:hover:border-cyan-500/30"
                                    aria-label="Share"
                                >
                                    <Share2 className="h-3.5 w-3.5" />
                                </button>
                                {shareOpen && (
                                    <div
                                        className="absolute right-0 bottom-full mb-1 z-50 min-w-[140px] rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-xl dark:border-white/[0.08] dark:bg-slate-900"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {shareButtons.whatsapp && <ShareMenuItem label="WhatsApp" onClick={() => { onShare(news, 'whatsapp'); setShareOpen(false); }} />}
                                        {shareButtons.facebook && <ShareMenuItem label="Facebook" onClick={() => { onShare(news, 'facebook'); setShareOpen(false); }} />}
                                        {shareButtons.messenger && <ShareMenuItem label="Messenger" onClick={() => { onShare(news, 'messenger'); setShareOpen(false); }} />}
                                        {shareButtons.telegram && <ShareMenuItem label="Telegram" onClick={() => { onShare(news, 'telegram'); setShareOpen(false); }} />}
                                        {shareButtons.copyLink && <ShareMenuItem label="Copy Link" onClick={() => { onShare(news, 'copy_link'); setShareOpen(false); }} />}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.article>
    );
}

function ShareMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-slate-50 hover:text-[var(--primary)] transition-colors dark:text-dark-text/75 dark:hover:bg-white/5"
        >
            {label}
        </button>
    );
}
