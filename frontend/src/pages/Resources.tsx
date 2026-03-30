import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, BookOpen, CheckCircle, ChevronLeft, ChevronRight, Download, ExternalLink, Eye,
    FileText, Filter, Headphones, Image, Link2, Loader2, Search, Share2, Star, StickyNote, Video, X,
} from 'lucide-react';
import {
    getPublicResourceSettings, getResources, trackAnalyticsEvent,
    type PublicResourceSettings, type ResourceSettingsSort, type ResourceSettingsType,
} from '../services/api';
import { isExternalUrl, normalizeInternalOrExternalUrl } from '../utils/url';

type ResourceType = ResourceSettingsType;
type SortKey = ResourceSettingsSort;
type CardResource = {
    _id: string;
    title: string;
    description: string;
    slug?: string;
    type: Exclude<ResourceType, 'all'>;
    category: string;
    tags: string[];
    fileUrl?: string;
    externalUrl?: string;
    isPublic: boolean;
    isFeatured: boolean;
    views: number;
    downloads: number;
    publishDate: string;
    expiryDate?: string;
};

const DEFAULT_SETTINGS: PublicResourceSettings = {
    pageTitle: 'Student Resources',
    pageSubtitle: 'Access PDFs, question banks, video tutorials, links, and notes in one searchable library.',
    heroBadgeLabel: 'Study Smart',
    searchPlaceholder: 'Search resources, question banks, and notes...',
    defaultThumbnailUrl: '',
    publicPageEnabled: true,
    studentHubEnabled: true,
    showHero: true,
    showStats: true,
    showFeatured: true,
    featuredLimit: 4,
    defaultSort: 'latest',
    defaultType: 'all',
    defaultCategory: 'All',
    itemsPerPage: 12,
    showSearch: true,
    showTypeFilter: true,
    showCategoryFilter: true,
    trackingEnabled: true,
    allowedCategories: ['Question Banks', 'Study Materials', 'Official Links', 'Tips & Tricks', 'Scholarships', 'Admit Cards'],
    allowedTypes: ['pdf', 'link', 'video', 'audio', 'image', 'note'],
    openLinksInNewTab: true,
    featuredSectionTitle: 'Featured Resources',
    emptyStateMessage: 'No resources found. Try adjusting your filters or search query.',
};

const TYPE_CONFIG: Record<Exclude<ResourceType, 'all'>, {
    label: string;
    icon: ComponentType<{ className?: string }>;
    badge: string;
    action: string;
}> = {
    pdf: { label: 'PDF', icon: FileText, badge: 'bg-danger/10 text-danger dark:bg-danger/20', action: 'Download' },
    link: { label: 'Link', icon: Link2, badge: 'bg-primary/10 text-primary dark:bg-primary/20', action: 'Visit' },
    video: { label: 'Video', icon: Video, badge: 'bg-accent/10 text-accent dark:bg-accent/20', action: 'Watch' },
    audio: { label: 'Audio', icon: Headphones, badge: 'bg-warning/10 text-warning dark:bg-warning/20', action: 'Listen' },
    image: { label: 'Image', icon: Image, badge: 'bg-success/10 text-success dark:bg-success/20', action: 'View' },
    note: { label: 'Note', icon: StickyNote, badge: 'bg-primary/5 text-primary dark:bg-primary/10', action: 'Read' },
};
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
    { key: 'latest', label: 'Latest' },
    { key: 'downloads', label: 'Most Downloaded' },
    { key: 'views', label: 'Most Viewed' },
];

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    useEffect(() => {
        const timeoutId = window.setTimeout(onDismiss, 2500);
        return () => window.clearTimeout(timeoutId);
    }, [onDismiss]);
    return (
        <div className="animate-slide-up fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-text px-5 py-3 text-sm font-medium text-surface shadow-elevated dark:bg-dark-text dark:text-dark-bg">
            <CheckCircle className="h-4 w-4 text-success" /> {message}
        </div>
    );
}

function Skeleton() {
    return (
        <div className="card p-4 sm:p-5">
            <div className="mb-3 flex gap-3"><div className="skeleton h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-4 w-3/4 rounded" /></div></div>
            <div className="skeleton mb-1 h-3 w-full rounded" /><div className="skeleton mb-3 h-3 w-2/3 rounded" />
            <div className="mb-3 flex gap-1"><div className="skeleton h-4 w-12 rounded-full" /><div className="skeleton h-4 w-10 rounded-full" /></div>
            <div className="skeleton mb-3 h-px w-full" /><div className="flex justify-between"><div className="skeleton h-3 w-20 rounded" /><div className="skeleton h-6 w-16 rounded" /></div>
        </div>
    );
}

function ResourceActionLink({
    resource, href, detailHref, actionLabel, openLinksInNewTab, onAction,
}: {
    resource: CardResource;
    href: string;
    detailHref: string;
    actionLabel: string;
    openLinksInNewTab: boolean;
    onAction: (resource: CardResource, action: string) => void;
}) {
    const external = !detailHref && isExternalUrl(href || '');
    const newTab = !detailHref && openLinksInNewTab;
    return (
        <a
            href={href}
            target={external || newTab ? '_blank' : undefined}
            rel={external || newTab ? 'noopener noreferrer' : undefined}
            onClick={() => onAction(resource, actionLabel)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-accent dark:text-primary-300"
        >
            {detailHref ? <Eye className="h-3 w-3" /> : resource.type === 'link' ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
            {actionLabel}
        </a>
    );
}

function ResourceCard({
    resource, openLinksInNewTab, onShare, onAction, onNavigate,
}: {
    resource: CardResource;
    openLinksInNewTab: boolean;
    onShare: (resource: CardResource) => void;
    onAction: (resource: CardResource, action: string) => void;
    onNavigate: (resource: CardResource) => void;
}) {
    const config = TYPE_CONFIG[resource.type];
    const Icon = config.icon;
    const detailHref = resource.slug ? `/resources/${resource.slug}` : '';
    const href = detailHref || normalizeInternalOrExternalUrl(resource.fileUrl || resource.externalUrl || '');
    const actionLabel = detailHref ? 'View' : config.action;
    return (
        <div className="card relative flex flex-col gap-3 overflow-hidden p-4 sm:p-5 group">
            {resource.isFeatured ? <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-xl bg-accent px-3 py-1 text-[9px] font-bold text-white"><Star className="h-2.5 w-2.5 fill-current" /> Featured</span> : null}
            <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${config.badge}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                    <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badge}`}>{config.label}</span>
                    <h3 onClick={() => onNavigate(resource)} className="line-clamp-2 cursor-pointer text-sm font-semibold leading-snug transition-colors hover:text-primary dark:text-dark-text">{resource.title}</h3>
                </div>
            </div>
            <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-text-muted dark:text-dark-text/60">{resource.description}</p>
            {resource.tags.length > 0 ? <div className="flex flex-wrap gap-1">{resource.tags.slice(0, 3).map((tag, index) => <span key={`${tag}-${index}`} className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] text-primary dark:bg-primary/10 dark:text-primary-300">{tag}</span>)}</div> : null}
            <div className="flex items-center justify-between border-t border-card-border pt-3 dark:border-dark-border">
                <div className="flex items-center gap-3 text-xs text-text-muted dark:text-dark-text/50">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{resource.views >= 1000 ? `${(resource.views / 1000).toFixed(1)}K` : resource.views}</span>
                    {resource.downloads > 0 ? <span className="flex items-center gap-1"><Download className="h-3 w-3" />{resource.downloads}</span> : null}
                    <span className="text-[10px]">{new Date(resource.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onShare(resource)} className="btn-ghost min-h-[34px] rounded-lg p-2 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Copy link"><Share2 className="h-3.5 w-3.5" /></button>
                    {href ? <ResourceActionLink resource={resource} href={href} detailHref={detailHref} actionLabel={actionLabel} openLinksInNewTab={openLinksInNewTab} onAction={onAction} /> : <button type="button" disabled className="inline-flex min-h-[34px] cursor-not-allowed items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500"><AlertCircle className="h-3 w-3" />Unavailable</button>}
                </div>
            </div>
        </div>
    );
}

function FeaturedCard(props: {
    resource: CardResource;
    openLinksInNewTab: boolean;
    onShare: (resource: CardResource) => void;
    onAction: (resource: CardResource, action: string) => void;
    onNavigate: (resource: CardResource) => void;
}) {
    const { resource, openLinksInNewTab, onShare, onAction, onNavigate } = props;
    const config = TYPE_CONFIG[resource.type];
    const Icon = config.icon;
    const detailHref = resource.slug ? `/resources/${resource.slug}` : '';
    const href = detailHref || normalizeInternalOrExternalUrl(resource.fileUrl || resource.externalUrl || '');
    const actionLabel = detailHref ? 'View' : config.action;
    return (
        <div className="card group flex flex-col items-start gap-4 p-4 hover:border-accent/40 sm:flex-row sm:p-5">
            <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${config.badge}`}><Icon className="h-6 w-6" /></div>
            <div className="min-w-0 w-full flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badge}`}>{config.label}</span>
                    <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"><Star className="h-2.5 w-2.5 fill-current" /> Featured</span>
                    <span className="order-last mt-1 w-full text-[10px] text-text-muted dark:text-dark-text/50 sm:order-none sm:ml-auto sm:mt-0 sm:w-auto">{resource.category}</span>
                </div>
                <h3 onClick={() => onNavigate(resource)} className="line-clamp-2 cursor-pointer text-base font-bold transition-colors hover:text-primary sm:line-clamp-1 sm:text-sm dark:text-dark-text">{resource.title}</h3>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-text-muted dark:text-dark-text/60 sm:line-clamp-1">{resource.description}</p>
            </div>
            <div className="mt-3 flex w-full flex-shrink-0 items-center justify-between gap-3 border-t border-card-border pt-3 sm:mt-0 sm:w-auto sm:justify-end sm:border-0 sm:pt-0 dark:border-dark-border">
                <button type="button" onClick={() => onShare(resource)} className="btn-ghost rounded-lg bg-card-border/20 p-2.5 transition-opacity sm:bg-transparent sm:p-2 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Share"><Share2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" /></button>
                {href ? <a href={href} target={!detailHref && openLinksInNewTab ? '_blank' : undefined} rel={!detailHref && openLinksInNewTab ? 'noopener noreferrer' : undefined} onClick={() => onAction(resource, actionLabel)} className="btn-primary flex flex-1 items-center justify-center gap-1.5 px-5 py-2.5 text-sm sm:flex-none sm:px-3 sm:text-xs">{actionLabel}{detailHref ? <Eye className="h-4 w-4 sm:h-3 sm:w-3" /> : resource.type === 'link' ? <ExternalLink className="h-4 w-4 sm:h-3 sm:w-3" /> : <Download className="h-4 w-4 sm:h-3 sm:w-3" />}</a> : <button type="button" disabled className="btn-outline flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 px-5 py-2.5 text-sm opacity-60 sm:flex-none sm:px-3 sm:text-xs">Unavailable</button>}
            </div>
        </div>
    );
}

function buildCategories(resources: CardResource[], settings: PublicResourceSettings) {
    const ordered = new Set<string>(['All']);
    settings.allowedCategories.forEach((item) => item.trim() && ordered.add(item.trim()));
    resources.forEach((item) => item.category?.trim() && ordered.add(item.category.trim()));
    if (settings.defaultCategory && settings.defaultCategory !== 'All') ordered.add(settings.defaultCategory);
    return Array.from(ordered);
}

export default function ResourcesPage() {
    const navigate = useNavigate();
    const defaultsApplied = useRef(false);
    const [settings, setSettings] = useState<PublicResourceSettings>(DEFAULT_SETTINGS);
    const [resources, setResources] = useState<CardResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [type, setType] = useState<ResourceType>('all');
    const [subject, setSubject] = useState('All');
    const [sort, setSort] = useState<SortKey>('latest');
    const [page, setPage] = useState(1);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        setLoading(true);
        void Promise.all([getResources(), getPublicResourceSettings().catch(() => ({ data: { settings: DEFAULT_SETTINGS } }))])
            .then(([resourceRes, settingsRes]) => {
                setResources(Array.isArray(resourceRes.data?.resources) ? resourceRes.data.resources as CardResource[] : []);
                setSettings(settingsRes.data?.settings ? { ...DEFAULT_SETTINGS, ...settingsRes.data.settings } : DEFAULT_SETTINGS);
                setError(!Array.isArray(resourceRes.data?.resources));
            })
            .catch((fetchError) => {
                console.error('ResourcesPage load error:', fetchError);
                setResources([]);
                setSettings(DEFAULT_SETTINGS);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (defaultsApplied.current) return;
        defaultsApplied.current = true;
        setType(settings.defaultType || 'all');
        setSubject(settings.defaultCategory || 'All');
        setSort(settings.defaultSort || 'latest');
    }, [settings.defaultCategory, settings.defaultSort, settings.defaultType]);

    const categoryOptions = useMemo(() => buildCategories(resources, settings), [resources, settings]);
    const typeOptions = useMemo<ResourceType[]>(() => ['all', ...settings.allowedTypes], [settings.allowedTypes]);
    const now = Date.now();
    const filtered = useMemo(() => resources
        .filter((resource) => resource.isPublic)
        .filter((resource) => !resource.expiryDate || new Date(resource.expiryDate).getTime() > now)
        .filter((resource) => type === 'all' || resource.type === type)
        .filter((resource) => subject === 'All' || resource.category === subject)
        .filter((resource) => !settings.showSearch || !search.trim() || resource.title?.toLowerCase().includes(search.toLowerCase()) || resource.description?.toLowerCase().includes(search.toLowerCase()) || resource.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase())))
        .sort((a, b) => sort === 'downloads' ? b.downloads - a.downloads : sort === 'views' ? b.views - a.views : new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()), [now, resources, search, settings.showSearch, sort, subject, type]);
    const featured = useMemo(() => settings.showFeatured && type === 'all' && subject === 'All' && (!settings.showSearch || !search.trim()) ? filtered.filter((resource) => resource.isFeatured).slice(0, settings.featuredLimit) : [], [filtered, search, settings.featuredLimit, settings.showFeatured, settings.showSearch, subject, type]);
    const pageSize = Math.max(4, settings.itemsPerPage || 12);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
    const totals = useMemo(() => ({
        total: resources.filter((resource) => resource.isPublic).length,
        pdfs: resources.filter((resource) => resource.isPublic && resource.type === 'pdf').length,
        videos: resources.filter((resource) => resource.isPublic && resource.type === 'video').length,
        featured: resources.filter((resource) => resource.isPublic && resource.isFeatured).length,
    }), [resources]);

    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const resetFilters = () => {
        setSearch('');
        setType(settings.defaultType || 'all');
        setSubject(settings.defaultCategory || 'All');
        setPage(1);
    };
    const handleShare = async (resource: CardResource) => {
        const url = resource.slug
            ? `${window.location.origin}/resources/${resource.slug}`
            : normalizeInternalOrExternalUrl(resource.fileUrl || resource.externalUrl || window.location.href) || window.location.href;
        try { await navigator.clipboard.writeText(url); setToast('Link copied!'); } catch { /* ignore */ }
    };
    const handleAction = (resource: CardResource, action: string) => {
        if (!settings.trackingEnabled) return;
        void trackAnalyticsEvent({ eventName: 'resource_download', module: 'resources', source: 'public', meta: { resourceId: resource._id, type: resource.type, action } }).catch(() => undefined);
    };
    const handleNavigate = (resource: CardResource) => { if (resource.slug) navigate(`/resources/${resource.slug}`); };

    if (!settings.publicPageEnabled) {
        return <div className="section-container py-16 sm:py-20"><div className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white/95 p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/80"><BookOpen className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Resources page is currently hidden</h1><p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">The resource library is temporarily unavailable from the public website.</p></div></div>;
    }

    return (
        <div className="min-h-screen">
            {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}
            {settings.showHero ? (
                <section className="page-hero">
                    <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute left-1/2 top-20 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" /><div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-white/5 blur-2xl" /></div>
                    <div className="section-container relative py-12 sm:py-16 lg:py-20">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 backdrop-blur-sm"><BookOpen className="h-4 w-4 text-accent" /><span className="text-sm text-white/90">{settings.heroBadgeLabel}</span></div>
                        <h1 className="text-3xl font-heading font-bold sm:text-4xl lg:text-5xl">{settings.pageTitle}</h1>
                        <p className="mb-8 mt-3 max-w-xl text-base text-white/70 sm:text-lg">{settings.pageSubtitle}</p>
                        {settings.showSearch ? <div className="group/search relative mb-10 max-w-xl"><div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-accent/50 to-primary/50 opacity-25 blur transition duration-1000 group-focus-within/search:opacity-100 group-focus-within/search:duration-200" /><div className="relative flex items-center"><Search className="absolute left-5 h-5 w-5 text-indigo-400 transition-colors group-focus-within/search:text-accent" /><input type="search" placeholder={settings.searchPlaceholder} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="w-full rounded-2xl border border-white/20 bg-white/95 py-5 pl-14 pr-4 text-base text-text shadow-2xl backdrop-blur-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 dark:bg-[#0f172a]/90 dark:text-white" /></div></div> : null}
                        {settings.showStats ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
                            { value: loading ? '...' : `${totals.total}+`, label: 'Total Resources', icon: BookOpen },
                            { value: loading ? '...' : totals.pdfs, label: 'PDFs', icon: FileText },
                            { value: loading ? '...' : totals.videos, label: 'Videos', icon: Video },
                            { value: loading ? '...' : totals.featured, label: 'Featured', icon: Star },
                        ].map((stat) => <div key={stat.label} className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur-sm transition-colors hover:bg-white/15 sm:p-4"><stat.icon className="mx-auto mb-1.5 h-5 w-5 text-accent" /><p className="text-xl font-bold sm:text-2xl">{stat.value}</p><p className="text-xs text-white/60">{stat.label}</p></div>)}</div> : null}
                    </div>
                </section>
            ) : null}

            <section className="sticky top-16 z-30 border-b border-card-border bg-surface dark:border-dark-border dark:bg-dark-surface">
                <div className="section-container space-y-2 py-2.5">
                    <div className="flex items-center gap-2">
                        {settings.showSearch ? <div className="relative max-w-xs flex-1 sm:hidden"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input type="search" placeholder={settings.searchPlaceholder} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-field min-h-[40px] py-2 pl-9 text-xs" /></div> : null}
                        <button type="button" className="btn-ghost flex min-h-[40px] items-center gap-2 rounded-xl border border-card-border p-2.5 sm:hidden dark:border-dark-border" onClick={() => setMobileFilterOpen((current) => !current)} aria-expanded={mobileFilterOpen}><Filter className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-widest">Filters</span></button>
                        {settings.showTypeFilter ? <div className="relative hidden flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-12 after:bg-gradient-to-l after:from-surface after:to-transparent dark:after:from-dark-surface sm:flex">{typeOptions.map((item) => { const config = item === 'all' ? null : TYPE_CONFIG[item]; return <button key={item} type="button" onClick={() => { setType(item); setPage(1); }} className={`tab-pill flex-shrink-0 gap-1 text-xs ${type === item ? 'tab-pill-active' : 'tab-pill-inactive'}`}>{config ? <config.icon className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}{item === 'all' ? 'All Types' : config!.label}</button>; })}</div> : <div className="flex-1" />}
                        <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }} className="input-field min-h-[40px] w-auto flex-shrink-0 py-2 text-xs" aria-label="Sort resources">{SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
                    </div>
                    {settings.showCategoryFilter ? <div className="relative hidden items-center gap-1.5 overflow-x-auto scrollbar-hide after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-16 after:bg-gradient-to-l after:from-surface after:to-transparent dark:after:from-dark-surface sm:flex">{categoryOptions.map((item) => <button key={item} type="button" onClick={() => { setSubject(item); setPage(1); }} className={`tab-pill flex-shrink-0 text-xs ${subject === item ? 'tab-pill-active' : 'tab-pill-inactive'}`}>{item}</button>)}{(type !== settings.defaultType || subject !== settings.defaultCategory || search) ? <button type="button" onClick={resetFilters} className="ml-2 flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 hover:text-danger/80"><X className="h-3 w-3" />Clear</button> : null}</div> : null}
                    {mobileFilterOpen ? <div className="space-y-2 pb-1 sm:hidden">{settings.showTypeFilter ? <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">{typeOptions.map((item) => { const config = item === 'all' ? null : TYPE_CONFIG[item]; return <button key={item} type="button" onClick={() => { setType(item); setPage(1); setMobileFilterOpen(false); }} className={`tab-pill flex-shrink-0 gap-1 text-xs ${type === item ? 'tab-pill-active' : 'tab-pill-inactive'}`}>{config ? <config.icon className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}{item === 'all' ? 'All' : config!.label}</button>; })}</div> : null}{settings.showCategoryFilter ? <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">{categoryOptions.map((item) => <button key={item} type="button" onClick={() => { setSubject(item); setPage(1); setMobileFilterOpen(false); }} className={`tab-pill flex-shrink-0 text-xs ${subject === item ? 'tab-pill-active' : 'tab-pill-inactive'}`}>{item}</button>)}</div> : null}</div> : null}
                </div>
            </section>

            <section className="section-container space-y-8 py-8 sm:py-10">
                {error ? <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning"><AlertCircle className="h-4 w-4 flex-shrink-0" />Showing fallback page state. Live resource data could not be loaded.</div> : null}
                {featured.length > 0 ? <div><div className="mb-4 flex items-center gap-2"><Star className="h-4 w-4 fill-accent text-accent" /><h2 className="text-lg font-heading font-bold dark:text-dark-text">{settings.featuredSectionTitle}</h2></div><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{featured.map((resource) => <FeaturedCard key={resource._id} resource={resource} openLinksInNewTab={settings.openLinksInNewTab} onShare={handleShare} onAction={handleAction} onNavigate={handleNavigate} />)}</div></div> : null}
                <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-heading font-bold dark:text-dark-text">{settings.showSearch && search ? `Results for "${search}"` : subject !== 'All' ? subject : type !== 'all' ? `${TYPE_CONFIG[type as Exclude<ResourceType, 'all'>].label}s` : 'All Resources'}</h2>
                            <p className="mt-0.5 text-xs text-text-muted dark:text-dark-text/50">{loading ? 'Loading...' : `${filtered.length} resource${filtered.length !== 1 ? 's' : ''} found`}</p>
                        </div>
                        {settings.showSearch ? <div className="hidden items-center gap-2 sm:flex"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input type="search" placeholder={settings.searchPlaceholder} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-field min-h-[40px] w-52 py-2 pl-9 text-xs" />{search ? <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear resource search"><X className="h-3.5 w-3.5 text-text-muted hover:text-danger" /></button> : null}</div></div> : null}
                    </div>
                    {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} />)}</div> : paginated.length === 0 ? <div className="py-16 text-center sm:py-24"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5"><BookOpen className="h-8 w-8 text-primary/30" /></div><h3 className="mb-2 text-lg font-semibold dark:text-dark-text">No resources found</h3><p className="mb-5 text-sm text-text-muted dark:text-dark-text/50">{settings.emptyStateMessage}</p><button type="button" onClick={resetFilters} className="btn-outline gap-2 text-sm"><X className="h-4 w-4" />Reset filters</button></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{paginated.map((resource) => <ResourceCard key={resource._id} resource={resource} openLinksInNewTab={settings.openLinksInNewTab} onShare={handleShare} onAction={handleAction} onNavigate={handleNavigate} />)}</div>}
                    {totalPages > 1 ? <><div className="mt-10 flex items-center justify-center gap-2" role="navigation" aria-label="Pagination"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="btn-ghost rounded-xl border border-card-border p-2 disabled:opacity-40 dark:border-dark-border" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: Math.min(totalPages, 7) }, (_, index) => { const pageNumber = totalPages <= 7 ? index + 1 : page <= 4 ? index + 1 : page >= totalPages - 3 ? totalPages - 6 + index : page - 3 + index; return <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} aria-current={pageNumber === page ? 'page' : undefined} className={`h-9 w-9 rounded-xl text-sm font-medium transition-all ${pageNumber === page ? 'bg-primary text-white shadow-md' : 'btn-ghost border border-card-border dark:border-dark-border'}`}>{pageNumber}</button>; })}<button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="btn-ghost rounded-xl border border-card-border p-2 disabled:opacity-40 dark:border-dark-border" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button></div><p className="mt-3 text-center text-xs text-text-muted dark:text-dark-text/40">Page {page} of {totalPages} · {filtered.length} total results</p></> : null}
                </div>
            </section>
            {loading ? <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" /></div> : null}
        </div>
    );
}
