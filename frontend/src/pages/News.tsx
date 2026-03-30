import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    CalendarDays,
    Filter,
    Search,
    Share2,
    Tag,
    Globe2,
    ArrowRight,
    X,
    Sparkles,
} from 'lucide-react';
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
        || '/logo.png';
    const forceDefault = String(news.coverImageSource || news.coverSource || '').toLowerCase() === 'default';
    if (forceDefault) return fallback;
    return (
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
        <div className="min-h-screen bg-background dark:bg-[#081322]">
            <section
                className="border-b border-card-border/80 bg-gradient-to-r from-cyan-500/10 via-sky-500/8 to-emerald-500/6 py-8 dark:border-dark-border/80 dark:from-cyan-500/8 dark:via-indigo-500/10 dark:to-transparent"
                style={settings.headerBannerUrl ? { backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url(${settings.headerBannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            >
                <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">CampusWay News Hub</p>
                        <h1 className="text-3xl font-black text-text dark:text-dark-text sm:text-4xl">{pageTitle}</h1>
                        <p className="mt-2 max-w-2xl text-sm text-text-muted dark:text-dark-text/75">{pageSubtitle}</p>
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl border border-card-border bg-white px-3 py-2 text-sm font-semibold text-text shadow-sm lg:hidden dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
                        onClick={() => setMobileFilterOpen(true)}
                    >
                        <Filter className="h-4 w-4" />
                        Filters
                    </button>
                </div>
            </section>

            <div className={`mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:px-6 lg:px-8 ${layoutMode === 'rss_reader' ? 'lg:grid-cols-[260px_1fr_320px]' : ''}`}>
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

                    {!isLoading && renderedItems.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-card-border bg-white px-6 py-10 text-center text-sm text-text-muted dark:border-dark-border dark:bg-dark-surface/55 dark:text-dark-text/75">
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
                                <motion.article
                                    key={news._id}
                                    variants={{
                                        hidden: { opacity: 0, y: 12 },
                                        show: { opacity: 1, y: 0 },
                                    }}
                                    whileHover={{ y: -2, scale: 1.003 }}
                                    transition={{ duration: 0.18 }}
                                    onClick={() => {
                                        if (window.matchMedia('(max-width: 1023px)').matches) {
                                            const target = news.slug || news._id;
                                            if (target) {
                                                navigate(`/news/${target}`);
                                            }
                                            return;
                                        }
                                        setPreview(news);
                                    }}
                                    className={`cursor-pointer rounded-2xl border bg-white/95 p-3 shadow-sm transition dark:bg-dark-surface/85 ${
                                        preview?._id === news._id
                                            ? 'border-cyan-500/60 ring-2 ring-cyan-500/20'
                                            : 'border-card-border/80 hover:border-cyan-400/50 dark:border-dark-border/80'
                                    }`}
                                >
                                    <div className={`grid grid-cols-1 gap-3 ${layoutMode === 'list' ? 'sm:grid-cols-[220px_1fr]' : 'sm:grid-cols-[200px_1fr]'}`}>
                                        <img
                                            src={getArticleImage(news, settings)}
                                            alt={news.title}
                                            className="h-36 w-full rounded-xl object-cover sm:h-full"
                                            loading="lazy"
                                        />
                                        <div className="space-y-2">
                                            <h2 className="line-clamp-2 text-lg font-semibold text-text dark:text-dark-text">{news.title}</h2>
                                            <p className="line-clamp-2 text-sm text-text-muted dark:text-dark-text/75">
                                                {news.shortSummary || news.shortDescription}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted dark:text-dark-text/75">
                                                {settings.appearance.showSourceIcons && (
                                                    <img
                                                        src={news.sourceIconUrl || settings.defaultSourceIconUrl || '/logo.png'}
                                                        alt={news.sourceName || 'Source'}
                                                        className="h-4 w-4 rounded-full object-cover"
                                                        onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                                                    />
                                                )}
                                                <span className="inline-flex items-center gap-1">
                                                    <Globe2 className="h-3 w-3" />
                                                    {news.sourceName || 'CampusWay'}
                                                </span>
                                                <span className="text-slate-400 dark:text-slate-500">&middot;</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <CalendarDays className="h-3 w-3" />
                                                    {renderDate(news.publishedAt || news.publishDate || news.createdAt)}
                                                </span>
                                                {(news.sourceType === 'rss' || news.sourceType === 'ai_assisted') ? (
                                                    <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-200">
                                                        RSS
                                                    </span>
                                                ) : null}
                                                {news.aiUsed ? (
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                            news.aiMeta?.noHallucinationPassed
                                                                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                                                                : 'border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200'
                                                        }`}
                                                    >
                                                        <Sparkles className="h-3 w-3" />
                                                        {news.aiMeta?.noHallucinationPassed ? 'AI verified' : 'AI review'}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {news.tags?.length ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {news.tags.slice(0, 4).map((item) => (
                                                        <span key={`${news._id}-${item}`} className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-200">
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                {shouldOpenOriginalSource(news, settings) ? (
                                                    <a
                                                        href={getOriginalArticleUrl(news)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
                                                    >
                                                        Read Source
                                                        <ArrowRight className="h-3 w-3" />
                                                    </a>
                                                ) : (
                                                    <Link
                                                        to={`/news/${news.slug || news._id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
                                                    >
                                                        Read
                                                        <ArrowRight className="h-3 w-3" />
                                                    </Link>
                                                )}
                                                {shareButtons.whatsapp ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'whatsapp');
                                                        }}
                                                    >
                                                        WhatsApp
                                                    </button>
                                                ) : null}
                                                {shareButtons.facebook ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'facebook');
                                                        }}
                                                    >
                                                        Facebook
                                                    </button>
                                                ) : null}
                                                {shareButtons.messenger ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'messenger');
                                                        }}
                                                    >
                                                        Messenger
                                                    </button>
                                                ) : null}
                                                {shareButtons.telegram ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'telegram');
                                                        }}
                                                    >
                                                        Telegram
                                                    </button>
                                                ) : null}
                                                {shareButtons.copyLink ? (
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'copy_link');
                                                        }}
                                                    >
                                                        <Share2 className="h-3 w-3" />
                                                        Copy
                                                    </button>
                                                ) : null}
                                                {shareButtons.copyText ? (
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg border border-card-border px-2 py-1 text-xs text-text-muted hover:border-cyan-500 hover:text-cyan-600 dark:border-dark-border dark:text-dark-text/80"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShare(news, 'copy_text');
                                                        }}
                                                    >
                                                        Copy Text
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </motion.article>
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
                        className="sticky top-24 space-y-3 rounded-2xl border border-card-border/80 bg-white/95 p-4 shadow-sm dark:border-dark-border/80 dark:bg-dark-surface/85"
                    >
                        {preview ? (
                            <>
                                <img
                                    src={getArticleImage(preview, settings)}
                                    alt={preview.title}
                                    className="h-44 w-full rounded-xl object-cover"
                                    loading="lazy"
                                />
                                <h3 className="text-lg font-semibold text-text dark:text-dark-text">{preview.title}</h3>
                                <p className="text-sm text-text-muted dark:text-dark-text/75">
                                    {preview.shortSummary || preview.shortDescription}
                                </p>
                                <div className="text-xs text-text-muted dark:text-dark-text/75">
                                    <p>Source: {preview.sourceName || 'CampusWay'}</p>
                                    <p>{renderDate(preview.publishedAt || preview.publishDate || preview.createdAt)}</p>
                                </div>
                                {shouldOpenOriginalSource(preview, settings) ? (
                                    <a
                                        href={getOriginalArticleUrl(preview)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                                    >
                                        Read Original Source
                                        <ArrowRight className="h-4 w-4" />
                                    </a>
                                ) : (
                                    <Link
                                        to={`/news/${preview.slug || preview._id}`}
                                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                                    >
                                        Read full article
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-text-muted dark:text-dark-text/75">Select a card to preview.</p>
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
        <div className="space-y-4 rounded-2xl border border-card-border/80 bg-white/95 p-3 dark:border-dark-border/80 dark:bg-dark-surface/85">
            <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    className="w-full rounded-xl border border-card-border bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-cyan-500 dark:border-dark-border dark:bg-dark-surface"
                    placeholder="Search headlines..."
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                />
            </label>

            <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Sources</h3>
                <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                        className="w-full rounded-lg border border-card-border bg-white py-1.5 pl-8 pr-2 text-xs outline-none transition focus:border-cyan-500 dark:border-dark-border dark:bg-dark-surface"
                        placeholder="Search sources..."
                        value={sourceSearch}
                        onChange={(e) => setSourceSearch(e.target.value)}
                    />
                </label>
                <div className="space-y-1">
                    <button
                        type="button"
                        onClick={() => onSource('')}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                            source === '' ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'text-text-muted hover:bg-slate-100 dark:text-dark-text/75 dark:hover:bg-white/5'
                        }`}
                    >
                        <span>All Sources</span>
                    </button>
                    {filteredSources.map((item) => (
                        <button
                            key={item._id}
                            type="button"
                            onClick={() => onSource(item._id)}
                            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                                source === item._id ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'text-text-muted hover:bg-slate-100 dark:text-dark-text/75 dark:hover:bg-white/5'
                            }`}
                        >
                            <span className="inline-flex items-center gap-2">
                                {item.iconUrl ? <img src={item.iconUrl} alt={item.name} className="h-4 w-4 rounded-full object-cover" /> : null}
                                {item.name}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-white/10">{item.count}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Categories</h3>
                <div className="flex flex-wrap gap-2">
                    {categories.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onCategory(item)}
                            className={`rounded-full border px-3 py-1 text-xs ${
                                category === item
                                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200'
                                    : 'border-card-border text-text-muted dark:border-dark-border dark:text-dark-text/75'
                            }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    <Tag className="h-3 w-3" />
                    Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => onTag('')}
                        className={`rounded-full border px-3 py-1 text-xs ${
                            tag === '' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-card-border text-text-muted dark:border-dark-border dark:text-dark-text/75'
                        }`}
                    >
                        All
                    </button>
                    {tags.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => onTag(item)}
                            className={`rounded-full border px-3 py-1 text-xs ${
                                tag === item
                                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200'
                                    : 'border-card-border text-text-muted dark:border-dark-border dark:text-dark-text/75'
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
