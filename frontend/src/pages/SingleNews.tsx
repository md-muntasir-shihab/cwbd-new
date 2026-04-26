import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import {
    ArrowLeft,
    CalendarDays,
    ExternalLink,
    Globe2,
    Link as LinkIcon,
    Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    ApiNews,
    ApiNewsPublicSettings,
    getPublicNewsSettings,
    getPublicNewsV2BySlug,
    trackAnalyticsEvent,
    trackPublicNewsV2Share,
} from '../services/api';
import InfoHint from '../components/ui/InfoHint';
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
        copyText: false,
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

function normalizeComparableText(value: string): string {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/[^a-z0-9\u0980-\u09ff\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function stripNewsAttributionText(value: string): string {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n?\s*source\s*:\s*[^\n]+/gim, '')
        .replace(/\n?\s*source\s+link\s*:\s*[^\n]+/gim, '')
        .replace(/\n?\s*original\s+(?:link|source|url)\s*:\s*[^\n]+/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function isDuplicateIntro(candidate: string, summary: string): boolean {
    const candidateNorm = normalizeComparableText(candidate);
    const summaryNorm = normalizeComparableText(summary);
    if (!candidateNorm || !summaryNorm) return false;
    if (candidateNorm === summaryNorm) return true;
    if (candidateNorm.length < 40 || summaryNorm.length < 40) return false;
    return candidateNorm.startsWith(summaryNorm) || summaryNorm.startsWith(candidateNorm);
}

function extractNewsBodyParagraphs(rawHtml: string, shortSummary: string): string[] {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = DOMPurify.sanitize(String(rawHtml || ''));
    const rawText = stripNewsAttributionText(wrapper.innerText || wrapper.textContent || '');
    const summary = stripNewsAttributionText(shortSummary || '');
    const summaryNorm = normalizeComparableText(summary);
    const paragraphs = rawText
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    while (paragraphs.length > 0 && isDuplicateIntro(paragraphs[0], summary)) {
        paragraphs.shift();
    }
    if (paragraphs.length > 1 && normalizeComparableText(paragraphs[0]) === normalizeComparableText(paragraphs[1])) {
        paragraphs.shift();
    }
    if (paragraphs.length === 1 && isDuplicateIntro(paragraphs[0], summary)) {
        return [];
    }

    const compactBodyNorm = normalizeComparableText(paragraphs.join(' '));
    if (summaryNorm && compactBodyNorm) {
        if (compactBodyNorm === summaryNorm) return [];
        if (
            compactBodyNorm.startsWith(summaryNorm)
            && compactBodyNorm.length <= Math.max(summaryNorm.length + 48, Math.floor(summaryNorm.length * 1.2))
        ) {
            return [];
        }
    }

    return paragraphs.filter((paragraph) => !isDuplicateIntro(paragraph, summary));
}

function isShareCancelledError(error: unknown): boolean {
    const name = String((error as { name?: string })?.name || '');
    return name === 'AbortError';
}

async function copyTextToClipboard(value: string): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        // Fallback below.
    }
    try {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        return copied;
    } catch {
        return false;
    }
}

export default function SingleNewsPage() {
    const { slug = '' } = useParams<{ slug: string }>();

    const settingsQuery = useQuery({
        queryKey: ['newsSettings'],
        queryFn: async () => (await getPublicNewsSettings()).data,
    });

    const itemQuery = useQuery({
        queryKey: ['newsDetail', slug],
        queryFn: async () => (await getPublicNewsV2BySlug(slug)).data,
        enabled: Boolean(slug),
        retry: (failureCount, error: any) => {
            // Don't retry on 404 — article doesn't exist
            if (error?.response?.status === 404) return false;
            return failureCount < 2;
        },
    });

    const settings = settingsQuery.data || DEFAULT_SETTINGS;
    const shareButtons = settings.shareButtons || DEFAULT_SETTINGS.shareButtons;
    const newsItem = itemQuery.data?.item;
    const relatedNews = itemQuery.data?.related || [];

    useEffect(() => {
        if (!newsItem) {
            document.title = 'News | CampusWay';
            return;
        }
        document.title = `${newsItem.seoTitle || newsItem.title} | CampusWay News`;
        void trackAnalyticsEvent({
            eventName: 'news_view',
            module: 'news',
            source: 'public',
            meta: { slug: newsItem.slug || slug, newsId: newsItem._id, source: newsItem.sourceName || '' },
        }).catch(() => undefined);
    }, [newsItem, slug]);

    async function trackShareAsCopy() {
        if (!newsItem) return;
        try {
            const trackChannel = 'copy';
            if (newsItem.slug) {
                await trackPublicNewsV2Share(newsItem.slug, trackChannel);
            }
            await trackAnalyticsEvent({
                eventName: 'news_share',
                module: 'news',
                source: 'public',
                meta: { slug: newsItem.slug || slug, newsId: newsItem._id, platform: trackChannel },
            });
        } catch {
            // Share tracking failures should not block user-facing share action.
        }
    }

    async function handleNativeShare() {
        if (!newsItem) return;
        const newsTarget = newsItem.slug || newsItem._id;
        const shareUrl = newsItem.shareUrl || `${window.location.origin}/news/${newsTarget}`;
        const shareText = newsItem.shortSummary || newsItem.shortDescription || newsItem.title;

        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: newsItem.title,
                    text: shareText,
                    url: shareUrl,
                });
                await trackShareAsCopy();
                return;
            } catch (error) {
                if (isShareCancelledError(error)) return;
            }
        }

        const copied = await copyTextToClipboard(shareUrl);
        if (!copied) {
            toast.error('Share failed');
            return;
        }
        toast.success('Link copied');
        await trackShareAsCopy();
    }

    if (itemQuery.isLoading || settingsQuery.isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#060f23] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl space-y-4">
                    <div className="skeleton h-12 w-64 rounded-xl" />
                    <div className="skeleton h-[320px] w-full rounded-3xl" />
                    <div className="skeleton h-10 w-full rounded-xl" />
                    <div className="skeleton h-64 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if (!newsItem || itemQuery.isError) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#060f23] px-4 py-16 text-center sm:px-6 lg:px-8">
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">Article not found</h1>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
                    This article is not available or was unpublished.
                </p>
                <Link
                    to="/news"
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to News
                </Link>
            </div>
        );
    }

    const image = getArticleImage(newsItem, settings);
    const sourceName = newsItem.sourceName || 'CampusWay';
    const sourceUrl = newsItem.sourceUrl || '#';
    const originalUrl = newsItem.originalArticleUrl || newsItem.originalLink || '';
    const cleanedArticleParagraphs = extractNewsBodyParagraphs(
        String(newsItem.fullContent || newsItem.content || ''),
        String(newsItem.shortSummary || newsItem.shortDescription || ''),
    );
    const hasBodyContent = cleanedArticleParagraphs.length > 0;
    const showShareAction = Boolean(settings.appearance.showShareButtons)
        && Boolean(
            shareButtons.copyLink
            || shareButtons.whatsapp
            || shareButtons.facebook
            || shareButtons.messenger
            || shareButtons.telegram
        );

    return (
        <div className="min-h-screen bg-slate-50 pb-14 dark:bg-[#060f23]">
            {/* OG Meta Tags for social sharing */}
            <Helmet>
                <title>{newsItem.seoTitle || newsItem.title} | CampusWay News</title>
                <meta property="og:title" content={(newsItem as any).ogTitle || newsItem.seoTitle || newsItem.title} />
                <meta property="og:description" content={(newsItem as any).ogDescription || newsItem.seoDescription || newsItem.shortSummary || newsItem.shortDescription || ''} />
                <meta property="og:image" content={(newsItem as any).ogImage || getArticleImage(newsItem, settings)} />
                <meta property="og:url" content={`${window.location.origin}/news/${newsItem.slug || newsItem._id}`} />
                <meta property="og:type" content="article" />
                <meta name="description" content={newsItem.seoDescription || newsItem.shortSummary || newsItem.shortDescription || ''} />
            </Helmet>
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-4 flex items-center justify-between">
                    <Link
                        to="/news"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to News
                    </Link>
                    <span className="text-xs text-slate-500 dark:text-slate-300">
                        {renderDate(newsItem.publishedAt || newsItem.publishDate || newsItem.createdAt)}
                    </span>
                </div>

                <motion.header
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24 }}
                    className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/60"
                >
                    <div className="relative">
                        <img src={image} alt={newsItem.title || 'News article'} className="h-56 w-full object-cover sm:h-72 lg:h-[400px]" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
                            <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
                                <span className="rounded-full bg-cyan-500 px-2.5 py-1 font-semibold text-white shadow-sm">
                                    {newsItem.category || 'General'}
                                </span>
                                <span className="inline-flex items-center gap-1 text-white/80">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {renderDate(newsItem.publishedAt || newsItem.publishDate || newsItem.createdAt)}
                                </span>
                            </div>
                            <h1 className="text-xl font-black leading-tight text-white sm:text-3xl lg:text-4xl drop-shadow-lg">
                                {newsItem.title}
                            </h1>
                        </div>
                    </div>
                    <div className="space-y-5 p-5 sm:p-7 lg:p-8">
                        {(newsItem.shortSummary || newsItem.shortDescription) && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 sm:text-base lg:text-lg leading-relaxed border-l-4 border-cyan-500/40 pl-4 italic">
                                {newsItem.shortSummary || newsItem.shortDescription}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-slate-600 dark:text-slate-200">
                            <a
                                href={sourceUrl}
                                target={sourceUrl !== '#' ? '_blank' : undefined}
                                rel={sourceUrl !== '#' ? 'noopener noreferrer' : undefined}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-1.5 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/20"
                            >
                                {settings.appearance.showSourceIcons ? (
                                    <img
                                        src={buildMediaUrl(newsItem.sourceIconUrl || settings.defaultSourceIconUrl || image)}
                                        alt={sourceName}
                                        className="h-4 w-4 rounded-full object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                                    />
                                ) : (
                                    <Globe2 className="h-4 w-4" />
                                )}
                                {sourceName}
                                {sourceUrl !== '#' ? <ExternalLink className="h-3.5 w-3.5" /> : null}
                            </a>
                            {originalUrl ? (
                                <a
                                    href={originalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-1.5 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/20"
                                >
                                    <LinkIcon className="h-4 w-4" />
                                    Original Source
                                </a>
                            ) : (
                                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 px-2.5 py-1.5 text-slate-400 dark:border-white/10 dark:text-slate-500">
                                    <LinkIcon className="h-4 w-4" />
                                    Original Source Unavailable
                                </span>
                            )}
                            {showShareAction ? (
                                <button
                                    type="button"
                                    onClick={handleNativeShare}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-1.5 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/20"
                                >
                                    <Share2 className="h-4 w-4" />
                                    Share
                                </button>
                            ) : null}
                            {newsItem.aiUsed ? (
                                <InfoHint
                                    title={newsItem.aiMeta?.noHallucinationPassed ? 'AI Verified Draft' : 'AI Draft'}
                                    description={newsItem.aiMeta?.noHallucinationPassed
                                        ? 'This article passed strict AI verification with source citations.'
                                        : 'This article came from an AI draft workflow and may need admin review.'}
                                />
                            ) : null}
                        </div>
                        {hasBodyContent ? (
                            <div className="space-y-5 border-t border-slate-200 pt-6 text-[15px] leading-[1.85] text-slate-700 dark:border-white/10 dark:text-slate-200 sm:text-base lg:text-[17px] max-w-prose">
                                {cleanedArticleParagraphs.map((paragraph, index) => (
                                    <p key={`${newsItem._id}-paragraph-${index}`}>{paragraph}</p>
                                ))}
                            </div>
                        ) : null}
                        {newsItem.aiEnrichment?.studentFriendlyExplanation ? (
                            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-200">
                                    Student-Friendly Explanation
                                </p>
                                <p>{newsItem.aiEnrichment.studentFriendlyExplanation}</p>
                            </div>
                        ) : null}
                    </div>
                </motion.header>

                {relatedNews.length > 0 ? (
                    <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-7 shadow-sm dark:border-white/10 dark:bg-slate-950/60">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Related Articles</h2>
                            <Link to="/news" className="text-sm font-semibold text-cyan-600 hover:text-cyan-500 transition-colors">
                                View all
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {relatedNews.slice(0, 6).map((item) => (
                                <Link
                                    key={item._id}
                                    to={`/news/${item.slug || item._id}`}
                                    className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-cyan-500/40 dark:border-white/10 dark:bg-slate-900/60"
                                >
                                    <div className="relative overflow-hidden">
                                        <img
                                            src={getArticleImage(item, settings)}
                                            alt={item.title || 'Related article'}
                                            className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                            onError={(e) => { (e.target as HTMLImageElement).src = buildMediaUrl('/logo.svg'); }}
                                        />
                                        {item.category && (
                                            <span className="absolute top-2 left-2 rounded-full bg-black/50 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white">
                                                {item.category}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-2 p-3.5">
                                        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                            {item.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {renderDate(item.publishedAt || item.publishDate || item.createdAt)}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
