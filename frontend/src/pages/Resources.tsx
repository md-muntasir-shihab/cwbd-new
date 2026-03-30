import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, Link2, Video, Download, Eye, Search, Filter,
    BookOpen, Image, StickyNote, Star, Share2,
    ChevronLeft, ChevronRight, ExternalLink, CheckCircle, X,
    Headphones, Loader2, AlertCircle,
} from 'lucide-react';
import { getResources, trackAnalyticsEvent } from '../services/api';
import { isExternalUrl, normalizeInternalOrExternalUrl } from '../utils/url';

type ResourceType = 'all' | 'pdf' | 'link' | 'video' | 'audio' | 'image' | 'note';
type SortKey = 'latest' | 'downloads' | 'views';

interface Resource {
    _id: string; title: string; description: string;
    slug?: string;
    type: Exclude<ResourceType, 'all'>; category: string; tags: string[];
    fileUrl?: string; externalUrl?: string; thumbnailUrl?: string;
    isPublic: boolean; isFeatured: boolean;
    views: number; downloads: number; publishDate: string; expiryDate?: string;
}

const TYPE_CONFIG: Record<Exclude<ResourceType, 'all'>, {
    label: string; icon: React.FC<{ className?: string }>; badge: string; action: string;
}> = {
    pdf: { label: 'PDF', icon: FileText, badge: 'bg-danger/10 text-danger dark:bg-danger/20', action: 'Download' },
    link: { label: 'Link', icon: Link2, badge: 'bg-primary/10 text-primary dark:bg-primary/20', action: 'Visit' },
    video: { label: 'Video', icon: Video, badge: 'bg-accent/10 text-accent dark:bg-accent/20', action: 'Watch' },
    audio: { label: 'Audio', icon: Headphones, badge: 'bg-warning/10 text-warning dark:bg-warning/20', action: 'Listen' },
    image: { label: 'Image', icon: Image, badge: 'bg-success/10 text-success dark:bg-success/20', action: 'View' },
    note: { label: 'Note', icon: StickyNote, badge: 'bg-primary/5 text-primary dark:bg-primary/10', action: 'Read' },
};

const SUBJECTS = ['All', 'Question Banks', 'Study Materials', 'Official Links', 'Tips & Tricks', 'Scholarships', 'Admit Cards'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'latest', label: 'Latest' },
    { key: 'downloads', label: 'Most Downloaded' },
    { key: 'views', label: 'Most Viewed' },
];
const PAGE_SIZE = 12;

/* ─── Resource card ─── */
function ResourceCard({ r, onShare, onAction, onNavigate }: { r: Resource; onShare: (r: Resource) => void; onAction: (r: Resource, action: string) => void; onNavigate?: (r: Resource) => void }) {
    const cfg = TYPE_CONFIG[r.type];
    const Icon = cfg.icon;
    const detailHref = r.slug ? `/resources/${r.slug}` : '';
    const href = detailHref || normalizeInternalOrExternalUrl(r.fileUrl || r.externalUrl || '');
    const isExternal = !detailHref && isExternalUrl(href || '');
    const actionLabel = detailHref ? 'View' : cfg.action;

    return (
        <div className="card p-4 sm:p-5 flex flex-col gap-3 relative overflow-hidden group">
            {/* Featured badge */}
            {r.isFeatured && (
                <span className="absolute top-0 right-0 inline-flex items-center gap-1 px-3 py-1 bg-accent text-white text-[9px] font-bold rounded-bl-xl">
                    <Star className="w-2.5 h-2.5 fill-current" /> Featured
                </span>
            )}

            {/* Type + title */}
            <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                    <Icon className="w-5 h-5" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 ${cfg.badge}`}>
                        {cfg.label}
                    </span>
                    <h3 onClick={() => onNavigate?.(r)} className="text-sm font-semibold dark:text-dark-text line-clamp-2 leading-snug cursor-pointer hover:text-primary transition-colors">{r.title}</h3>
                </div>
            </div>

            {/* Description */}
            <p className="text-xs text-text-muted dark:text-dark-text/60 line-clamp-2 flex-1 leading-relaxed">{r.description}</p>

            {/* Tags */}
            {r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((tag, idx) => (
                        <span key={`${tag}-${idx}`} className="text-[10px] px-2 py-0.5 bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary-300 rounded-full">{tag}</span>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-card-border dark:border-dark-border">
                <div className="flex items-center gap-3 text-xs text-text-muted dark:text-dark-text/50">
                    <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />{r.views >= 1000 ? `${(r.views / 1000).toFixed(1)}K` : r.views}
                    </span>
                    {r.downloads > 0 && (
                        <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />{r.downloads}
                        </span>
                    )}
                    <span className="text-[10px]">{new Date(r.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onShare(r)}
                        className="btn-ghost p-2 min-h-[34px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Copy link">
                        <Share2 className="w-3.5 h-3.5" />
                    </button>
                    {href ? (
                        <a href={href} target={isExternal ? '_blank' : undefined}
                            rel={isExternal ? 'noopener noreferrer' : undefined}
                            onClick={() => onAction(r, actionLabel)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-primary-300 hover:text-accent transition-colors min-h-[34px] px-2 rounded-lg hover:bg-primary/5">
                            {detailHref ? <Eye className="w-3 h-3" /> : (r.type === 'pdf' ? <Download className="w-3 h-3" /> : r.type === 'link' ? <ExternalLink className="w-3 h-3" /> : <Eye className="w-3 h-3" />)}
                            {actionLabel}
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 min-h-[34px] px-2 rounded-lg cursor-not-allowed"
                        >
                            <AlertCircle className="w-3 h-3" />
                            Unavailable
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Featured card (horizontal on desktop, vertical on mobile) ─── */
function FeaturedCard({ r, onShare, onAction, onNavigate }: { r: Resource; onShare: (r: Resource) => void; onAction: (r: Resource, action: string) => void; onNavigate?: (r: Resource) => void }) {
    const cfg = TYPE_CONFIG[r.type];
    const Icon = cfg.icon;
    const detailHref = r.slug ? `/resources/${r.slug}` : '';
    const href = detailHref || normalizeInternalOrExternalUrl(r.fileUrl || r.externalUrl || '');
    const isExternal = !detailHref && isExternalUrl(href || '');
    const actionLabel = detailHref ? 'View' : cfg.action;
    return (
        <div className="card p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4 group hover:border-accent/40 relative">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                <Icon className="w-6 h-6" aria-hidden />
            </div>
            <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-semibold flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-current" /> Featured
                    </span>
                    <span className="text-[10px] text-text-muted dark:text-dark-text/50 sm:ml-auto order-last sm:order-none w-full sm:w-auto mt-1 sm:mt-0">{r.category}</span>
                </div>
                <h3 onClick={() => onNavigate?.(r)} className="text-base sm:text-sm font-bold dark:text-dark-text line-clamp-2 sm:line-clamp-1 cursor-pointer hover:text-primary transition-colors">{r.title}</h3>
                <p className="text-xs text-text-muted dark:text-dark-text/60 line-clamp-3 sm:line-clamp-1 mt-1 leading-relaxed">{r.description}</p>
            </div>
            <div className="flex items-center gap-3 mt-3 sm:mt-0 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end pt-3 sm:pt-0 border-t sm:border-0 border-card-border dark:border-dark-border">
                <button onClick={() => onShare(r)} className="btn-ghost p-2.5 sm:p-2 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-card-border/20 sm:bg-transparent" aria-label="Share">
                    <Share2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
                {href ? (
                    <a href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}
                        onClick={() => onAction(r, actionLabel)}
                        className="btn-primary py-2.5 px-5 sm:px-3 text-sm sm:text-xs gap-1.5 flex-1 sm:flex-none justify-center">
                        {actionLabel} {detailHref ? <Eye className="w-4 h-4 sm:w-3 sm:h-3" /> : (r.type === 'link' ? <ExternalLink className="w-4 h-4 sm:w-3 sm:h-3" /> : <Download className="w-4 h-4 sm:w-3 sm:h-3" />)}
                    </a>
                ) : (
                    <button
                        type="button"
                        disabled
                        className="btn-outline py-2.5 px-5 sm:px-3 text-sm sm:text-xs gap-1.5 flex-1 sm:flex-none justify-center opacity-60 cursor-not-allowed"
                    >
                        Unavailable
                    </button>
                )}
            </div>
        </div>
    );
}

/* ─── Skeleton ─── */
function Skeleton() {
    return (
        <div className="card p-4 sm:p-5">
            <div className="flex gap-3 mb-3"><div className="skeleton w-10 h-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-4 w-3/4 rounded" /></div></div>
            <div className="skeleton h-3 w-full rounded mb-1" />
            <div className="skeleton h-3 w-2/3 rounded mb-3" />
            <div className="flex gap-1 mb-3"><div className="skeleton h-4 w-12 rounded-full" /><div className="skeleton h-4 w-10 rounded-full" /></div>
            <div className="skeleton h-px w-full mb-3" />
            <div className="flex justify-between"><div className="skeleton h-3 w-20 rounded" /><div className="skeleton h-6 w-16 rounded" /></div>
        </div>
    );
}

/* ─── Toast ─── */
function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
    useEffect(() => { const t = setTimeout(onDismiss, 2500); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-text dark:bg-dark-text text-surface dark:text-dark-bg px-5 py-3 rounded-2xl shadow-elevated flex items-center gap-2 text-sm font-medium animate-slide-up">
            <CheckCircle className="w-4 h-4 text-success" /> {msg}
        </div>
    );
}

/* ─── Main Page ─── */
export default function ResourcesPage() {
    const navigate = useNavigate();
    const [resources, setResources] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [type, setType] = useState<ResourceType>('all');
    const [subject, setSubject] = useState('All');
    const [currentSort, setCurrentSort] = useState<SortKey>('latest');
    const [page, setPage] = useState(1);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        setLoading(true);
        getResources()
            .then((res: { data?: { resources?: Resource[] } }) => {
                if (res.data && Array.isArray(res.data.resources)) {
                    setResources(res.data.resources);
                    setError(false);
                } else {
                    setResources([]);
                    setError(true);
                }
            })
            .catch((err) => {
                console.error('Network or server error while fetching resources:', err);
                setResources([]);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, []);

    // Reset page on filter change
    const setTypeF = (v: ResourceType) => { setType(v); setPage(1); };
    const setSubjectF = (v: string) => { setSubject(v); setPage(1); };
    const setSearchF = (v: string) => { setSearch(v); setPage(1); };

    const handleShare = async (r: Resource) => {
        const url = r.externalUrl || r.fileUrl || window.location.href;
        try { await navigator.clipboard.writeText(url); setToast('Link copied!'); } catch { /* ignore */ }
    };
    const handleResourceAction = (r: Resource, action: string) => {
        void trackAnalyticsEvent({
            eventName: 'resource_download',
            module: 'resources',
            source: 'public',
            meta: { resourceId: r._id, type: r.type, action },
        }).catch(() => undefined);
    };
    const handleNavigate = (r: Resource) => {
        if (r.slug) navigate(`/resources/${r.slug}`);
    };

    const now = Date.now();
    const active = resources.filter(r =>
        r.isPublic &&
        (!r.expiryDate || new Date(r.expiryDate).getTime() > now) &&
        (type === 'all' || r.type === type) &&
        (subject === 'All' || r.category === subject) &&
        (!search ||
            r.title?.toLowerCase().includes(search.toLowerCase()) ||
            r.description?.toLowerCase().includes(search.toLowerCase()) ||
            r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
        )
    ).sort((a: any, b: any) => {
        if (currentSort === 'downloads') return b.downloads - a.downloads;
        if (currentSort === 'views') return b.views - a.views;
        return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });

    const featured = active.filter(r => r.isFeatured).slice(0, 4);
    const totalPages = Math.ceil(active.length / PAGE_SIZE);
    const paginated = active.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const typeKeys: ResourceType[] = ['all', 'pdf', 'link', 'video', 'audio', 'image', 'note'];

    const totals = {
        pdfs: resources.filter(r => r.type === 'pdf').length,
        videos: resources.filter(r => r.type === 'video').length,
        featured: resources.filter(r => r.isFeatured).length,
    };

    return (
        <div className="min-h-screen">
            {toast && <Toast msg={toast} onDismiss={() => setToast('')} />}

            {/* ── Hero ── */}
            <section className="page-hero">
                <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
                    <div className="absolute top-20 left-1/2 w-96 h-96 bg-accent/20 rounded-full blur-3xl -translate-x-1/2" />
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
                </div>
                <div className="section-container relative py-12 sm:py-16 lg:py-20">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4">
                        <BookOpen className="w-4 h-4 text-accent" aria-hidden />
                        <span className="text-sm text-white/90">Study Smart</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-3">Student Resources</h1>
                    <p className="text-base sm:text-lg text-white/70 max-w-xl mb-8">
                        Access PDFs, question banks, video tutorials, links, and notes — all in one searchable library.
                    </p>
                    {/* Hero search */}
                    <div className="relative max-w-xl mb-10 group/search">
                        <div className="absolute -inset-1 bg-gradient-to-r from-accent/50 to-primary/50 rounded-2xl blur opacity-25 group-focus-within/search:opacity-100 transition duration-1000 group-focus-within/search:duration-200"></div>
                        <div className="relative flex items-center">
                            <Search className="absolute left-5 w-5 h-5 text-indigo-400 group-focus-within/search:text-accent transition-colors" aria-hidden />
                            <input type="search" placeholder="Search resources, question banks, and notes..." value={search}
                                onChange={e => setSearchF(e.target.value)}
                                className="w-full pl-14 pr-4 py-5 rounded-2xl bg-white/95 dark:bg-[#0f172a]/90 backdrop-blur-xl text-text dark:text-white placeholder:text-slate-400 border border-white/20 shadow-2xl focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
                                aria-label="Search resources" />
                        </div>
                    </div>
                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { v: loading ? '…' : `${resources.length}+`, l: 'Total Resources', icon: BookOpen },
                            { v: loading ? '…' : totals.pdfs, l: 'PDFs', icon: FileText },
                            { v: loading ? '…' : totals.videos, l: 'Videos', icon: Video },
                            { v: loading ? '…' : totals.featured, l: 'Featured', icon: Star },
                        ].map(s => (
                            <div key={s.l} className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 text-center hover:bg-white/15 transition-colors">
                                <s.icon className="w-5 h-5 mx-auto mb-1.5 text-accent" aria-hidden />
                                <p className="text-xl sm:text-2xl font-bold">{s.v}</p>
                                <p className="text-xs text-white/60">{s.l}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Sticky filter bar ── */}
            <section className="bg-surface dark:bg-dark-surface border-b border-card-border dark:border-dark-border sticky top-16 z-30">
                <div className="section-container py-2.5 space-y-2">
                    {/* Row 1: search (sm) + filter toggle + sort */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-xs sm:hidden">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input type="search" placeholder="Search…" value={search}
                                onChange={e => setSearchF(e.target.value)}
                                className="input-field text-xs py-2 pl-9 min-h-[40px]" />
                        </div>
                        <button className="sm:hidden btn-ghost p-2.5 rounded-xl border border-card-border dark:border-dark-border min-h-[40px] flex items-center gap-2"
                            onClick={() => setMobileFilterOpen(!mobileFilterOpen)} aria-expanded={mobileFilterOpen}>
                            <Filter className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Filters</span>
                        </button>
                        {/* Type pills — always visible lg, hidden mobile */}
                        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1 relative after:absolute after:right-0 after:top-0 after:bottom-0 after:w-12 after:bg-gradient-to-l after:from-surface dark:after:from-dark-surface after:to-transparent after:pointer-events-none">
                            {typeKeys.map(t => {
                                const cfg = t === 'all' ? null : TYPE_CONFIG[t];
                                return (
                                    <button key={t} onClick={() => setTypeF(t)}
                                        className={`tab-pill flex-shrink-0 text-xs gap-1 ${type === t ? 'tab-pill-active' : 'tab-pill-inactive'}`}>
                                        {cfg ? <cfg.icon className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                                        {t === 'all' ? 'All Types' : cfg!.label}
                                    </button>
                                );
                            })}
                        </div>
                        <select value={currentSort} onChange={e => { setCurrentSort(e.target.value as SortKey); setPage(1); }}
                            className="input-field w-auto text-xs py-2 min-h-[40px] flex-shrink-0" aria-label="Sort">
                            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Row 2: Subject pills (desktop) */}
                    <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-hide relative after:absolute after:right-0 after:top-0 after:bottom-0 after:w-16 after:bg-gradient-to-l after:from-surface dark:after:from-dark-surface after:to-transparent after:pointer-events-none">
                        {SUBJECTS.map(s => (
                            <button key={s} onClick={() => setSubjectF(s)}
                                className={`tab-pill flex-shrink-0 text-xs ${subject === s ? 'tab-pill-active' : 'tab-pill-inactive'}`}>
                                {s}
                            </button>
                        ))}
                        {(type !== 'all' || subject !== 'All' || search) && (
                            <button onClick={() => { setTypeF('all'); setSubjectF('All'); setSearchF(''); }}
                                className="flex-shrink-0 flex items-center gap-1 text-xs text-danger hover:text-danger/80 px-2 py-1 rounded-lg hover:bg-danger/10 transition-colors ml-2">
                                <X className="w-3 h-3" /> Clear
                            </button>
                        )}
                    </div>

                    {/* Mobile collapsible filter */}
                    {mobileFilterOpen && (
                        <div className="sm:hidden space-y-2 pb-1">
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                                {typeKeys.map(t => {
                                    const cfg = t === 'all' ? null : TYPE_CONFIG[t];
                                    return (
                                        <button key={t} onClick={() => { setTypeF(t); setMobileFilterOpen(false); }}
                                            className={`tab-pill flex-shrink-0 text-xs gap-1 ${type === t ? 'tab-pill-active' : 'tab-pill-inactive'}`}>
                                            {cfg ? <cfg.icon className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                                            {t === 'all' ? 'All' : cfg!.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                                {SUBJECTS.map(s => (
                                    <button key={s} onClick={() => { setSubjectF(s); setMobileFilterOpen(false); }}
                                        className={`tab-pill flex-shrink-0 text-xs ${subject === s ? 'tab-pill-active' : 'tab-pill-inactive'}`}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="section-container py-8 sm:py-10 space-y-8">
                {/* Error notice if API failed */}
                {error && (
                    <div className="flex items-center gap-3 bg-warning/5 border border-warning/30 rounded-2xl px-4 py-3 text-sm text-warning">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Showing sample resources — live data unavailable.
                    </div>
                )}

                {/* ── Featured resources ── */}
                {!loading && featured.length > 0 && type === 'all' && subject === 'All' && !search && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Star className="w-4 h-4 text-accent fill-accent" />
                            <h2 className="text-lg font-heading font-bold dark:text-dark-text">Featured Resources</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {featured.map(r => <FeaturedCard key={r._id} r={r} onShare={handleShare} onAction={handleResourceAction} onNavigate={handleNavigate} />)}
                        </div>
                    </div>
                )}

                {/* ── All resources grid ── */}
                <div>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                        <div>
                            <h2 className="text-lg font-heading font-bold dark:text-dark-text">
                                {search ? `Results for "${search}"` : subject !== 'All' ? subject : type !== 'all' ? TYPE_CONFIG[type as Exclude<ResourceType, 'all'>].label + 's' : 'All Resources'}
                            </h2>
                            <p className="text-xs text-text-muted dark:text-dark-text/50 mt-0.5">
                                {loading ? 'Loading…' : `${active.length} resource${active.length !== 1 ? 's' : ''} found`}
                            </p>
                        </div>
                        {/* Desktop search */}
                        <div className="hidden sm:flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                <input type="search" placeholder="Search…" value={search}
                                    onChange={e => setSearchF(e.target.value)}
                                    className="input-field text-xs py-2 pl-9 min-h-[40px] w-52" />
                                {search && (
                                    <button onClick={() => setSearchF('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X className="w-3.5 h-3.5 text-text-muted hover:text-danger" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} />)}
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="text-center py-16 sm:py-24">
                            <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <BookOpen className="w-8 h-8 text-primary/30" />
                            </div>
                            <h3 className="text-lg font-semibold dark:text-dark-text mb-2">No resources found</h3>
                            <p className="text-sm text-text-muted dark:text-dark-text/50 mb-5">Try adjusting your filters or search query.</p>
                            <button onClick={() => { setTypeF('all'); setSubjectF('All'); setSearchF(''); }}
                                className="btn-outline gap-2 text-sm">
                                <X className="w-4 h-4" /> Clear all filters
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {paginated.map(r => <ResourceCard key={r._id} r={r} onShare={handleShare} onAction={handleResourceAction} onNavigate={handleNavigate} />)}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-10" role="navigation" aria-label="Pagination">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="btn-ghost p-2 rounded-xl border border-card-border dark:border-dark-border disabled:opacity-40" aria-label="Previous page">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                const n = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                                return (
                                    <button key={n} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}
                                        className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${n === page ? 'bg-primary text-white shadow-md' : 'btn-ghost border border-card-border dark:border-dark-border'}`}>
                                        {n}
                                    </button>
                                );
                            })}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="btn-ghost p-2 rounded-xl border border-card-border dark:border-dark-border disabled:opacity-40" aria-label="Next page">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Page info */}
                    {totalPages > 1 && (
                        <p className="text-center text-xs text-text-muted dark:text-dark-text/40 mt-3">
                            Page {page} of {totalPages} · {active.length} total results
                        </p>
                    )}
                </div>
            </section>

            {/* Loading overlay for spinner */}
            {loading && (
                <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-20">
                    <Loader2 className="w-8 h-8 text-primary animate-spin opacity-30" />
                </div>
            )}
        </div>
    );
}
