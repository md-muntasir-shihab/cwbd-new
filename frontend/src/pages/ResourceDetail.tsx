import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
    FileText, Link2, Video, Headphones, Image, StickyNote,
    Download, Eye, ExternalLink, ArrowLeft, Star, Tag,
    BookOpen, Loader2, AlertCircle, Share2, CheckCircle,
} from 'lucide-react';
import { getResourceBySlug, trackAnalyticsEvent } from '../services/api';
import { isExternalUrl, normalizeInternalOrExternalUrl } from '../utils/url';
import { buildYouTubeEmbedUrl } from '../utils/youtube';

type ResourceType = 'pdf' | 'link' | 'video' | 'audio' | 'image' | 'note';

interface Resource {
    _id: string; title: string; description: string; slug?: string;
    type: ResourceType; category: string; tags: string[];
    fileUrl?: string; externalUrl?: string; thumbnailUrl?: string;
    isPublic: boolean; isFeatured: boolean;
    views: number; downloads: number; publishDate: string; expiryDate?: string;
}

const TYPE_CONFIG: Record<ResourceType, {
    label: string; icon: React.FC<{ className?: string }>; badge: string; action: string;
}> = {
    pdf: { label: 'PDF', icon: FileText, badge: 'bg-danger/10 text-danger dark:bg-danger/20', action: 'Download' },
    link: { label: 'Link', icon: Link2, badge: 'bg-primary/10 text-primary dark:bg-primary/20', action: 'Visit' },
    video: { label: 'Video', icon: Video, badge: 'bg-accent/10 text-accent dark:bg-accent/20', action: 'Watch' },
    audio: { label: 'Audio', icon: Headphones, badge: 'bg-warning/10 text-warning dark:bg-warning/20', action: 'Listen' },
    image: { label: 'Image', icon: Image, badge: 'bg-success/10 text-success dark:bg-success/20', action: 'View' },
    note: { label: 'Note', icon: StickyNote, badge: 'bg-primary/5 text-primary dark:bg-primary/10', action: 'Read' },
};

function RelatedCard({ r }: { r: Resource }) {
    const navigate = useNavigate();
    const cfg = TYPE_CONFIG[r.type];
    const Icon = cfg.icon;
    return (
        <button
            type="button"
            onClick={() => r.slug && navigate(`/resources/${r.slug}`)}
            className="card p-4 text-left flex items-start gap-3 hover:border-primary/40 transition-colors group w-full"
        >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                <Icon className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                <p className="text-sm font-semibold dark:text-dark-text line-clamp-2 leading-snug mt-1 group-hover:text-primary transition-colors">{r.title}</p>
                <p className="text-xs text-text-muted dark:text-dark-text/50 mt-0.5 flex items-center gap-1">
                    <Eye className="w-3 h-3" />{r.views}
                </p>
            </div>
        </button>
    );
}

export default function ResourceDetail() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [resource, setResource] = useState<Resource | null>(null);
    const [related, setRelated] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        if (!slug) { setNotFound(true); setLoading(false); return; }
        setLoading(true); setNotFound(false);
        getResourceBySlug(slug)
            .then(res => {
                setResource(res.data.resource ?? res.data);
                setRelated(res.data.relatedResources ?? []);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [slug]);

    const handleAction = (r: Resource) => {
        void trackAnalyticsEvent({
            eventName: 'resource_download',
            module: 'resources',
            source: 'public',
            meta: { resourceId: r._id, type: r.type },
        }).catch(() => undefined);
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => setToast('Link copied!'))
            .catch(() => setToast('Could not copy link'));
        setTimeout(() => setToast(''), 2500);
    };

    if (loading) {
        return (
            <div className="page-container py-16 flex flex-col items-center justify-center gap-4 min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm text-text-muted dark:text-dark-text/50">Loading resource…</p>
            </div>
        );
    }

    if (notFound || !resource) {
        return (
            <div className="page-container py-16 flex flex-col items-center justify-center gap-4 min-h-[60vh] text-center">
                <div className="w-16 h-16 bg-danger/10 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8 text-danger" />
                </div>
                <h1 className="text-2xl font-heading font-bold dark:text-dark-text">Resource Not Found</h1>
                <p className="text-sm text-text-muted dark:text-dark-text/50 max-w-sm">This resource may have been removed or the link is invalid.</p>
                <button onClick={() => navigate('/resources')} className="btn-primary gap-2 mt-2">
                    <ArrowLeft className="w-4 h-4" /> Browse All Resources
                </button>
            </div>
        );
    }

    const cfg = TYPE_CONFIG[resource.type];
    const Icon = cfg.icon;
    const primaryHref = normalizeInternalOrExternalUrl(
        resource.type === 'video'
            ? resource.externalUrl || resource.fileUrl || ''
            : resource.fileUrl || resource.externalUrl || '',
    );
    const primaryIsExternal = isExternalUrl(primaryHref || '');
    const secondaryFileHref =
        resource.type === 'video' && resource.fileUrl
            ? normalizeInternalOrExternalUrl(resource.fileUrl)
            : '';
    const youtubeEmbedUrl = resource.type === 'video' ? buildYouTubeEmbedUrl(resource.externalUrl) : null;

    return (
        <div className="page-container py-8 sm:py-12 max-w-5xl mx-auto">
            {/* Back */}
            <button
                onClick={() => navigate('/resources')}
                className="btn-ghost gap-2 text-sm mb-6 -ml-2"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Resources
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* ── Main content ── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Header card */}
                    <div className="card p-6 sm:p-8">
                        {/* Type badge + featured */}
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${cfg.badge} mr-1`}>
                                <Icon className="w-6 h-6" aria-hidden />
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                            {resource.isFeatured && (
                                <span className="text-xs px-2.5 py-1 bg-accent/10 text-accent rounded-full font-semibold flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-current" /> Featured
                                </span>
                            )}
                            <span className="text-xs text-text-muted dark:text-dark-text/50 ml-auto">{resource.category}</span>
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-heading font-bold dark:text-dark-text leading-tight mb-3">
                            {resource.title}
                        </h1>

                        {resource.description && (
                            <p className="text-sm sm:text-base text-text-muted dark:text-dark-text/70 leading-relaxed mb-5">
                                {resource.description}
                            </p>
                        )}

                        {/* Tags */}
                        {Array.isArray(resource.tags) && resource.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-5">
                                <Tag className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                                {resource.tags.map(tag => (
                                    <span key={tag} className="text-xs px-2 py-0.5 bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary-300 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Meta stats */}
                        <div className="flex items-center gap-4 text-xs text-text-muted dark:text-dark-text/50 pt-4 border-t border-card-border dark:border-dark-border mb-5">
                            <span className="flex items-center gap-1.5">
                                <Eye className="w-3.5 h-3.5" />
                                {resource.views >= 1000 ? `${(resource.views / 1000).toFixed(1)}K` : resource.views} views
                            </span>
                            {resource.downloads > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <Download className="w-3.5 h-3.5" />
                                    {resource.downloads} downloads
                                </span>
                            )}
                            <span>
                                {resource.publishDate ? new Date(resource.publishDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                            </span>
                        </div>

                        {/* CTA buttons */}
                        <div className="flex items-center gap-3 flex-wrap">
                            {primaryHref ? (
                                <a href={primaryHref}
                                    target={primaryIsExternal ? '_blank' : undefined}
                                    rel={primaryIsExternal ? 'noopener noreferrer' : undefined}
                                    onClick={() => handleAction(resource)}
                                    className="btn-primary gap-2 text-sm flex-1 sm:flex-none justify-center"
                                >
                                    {resource.type === 'pdf' ? <Download className="w-4 h-4" /> :
                                        resource.type === 'link' ? <ExternalLink className="w-4 h-4" /> :
                                            <Eye className="w-4 h-4" />}
                                    {cfg.action}
                                </a>
                            ) : (
                                <button type="button" disabled
                                    className="btn-outline gap-2 text-sm flex-1 sm:flex-none justify-center opacity-60 cursor-not-allowed">
                                    <AlertCircle className="w-4 h-4" /> Unavailable
                                </button>
                            )}
                            {secondaryFileHref && secondaryFileHref !== primaryHref ? (
                                <a
                                    href={secondaryFileHref}
                                    onClick={() => handleAction(resource)}
                                    className="btn-outline gap-2 text-sm flex-1 sm:flex-none justify-center"
                                >
                                    <Download className="w-4 h-4" />
                                    Open Attachment
                                </a>
                            ) : null}
                            <button onClick={handleShare} className="btn-ghost gap-2 text-sm border border-card-border dark:border-dark-border px-4 py-2 rounded-xl">
                                <Share2 className="w-4 h-4" /> Share
                            </button>
                        </div>
                    </div>

                    {youtubeEmbedUrl ? (
                        <div className="card overflow-hidden">
                            <div className="aspect-video w-full bg-slate-950">
                                <iframe
                                    src={youtubeEmbedUrl}
                                    title={resource.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    className="h-full w-full"
                                />
                            </div>
                        </div>
                    ) : null}

                    {/* Thumbnail */}
                    {resource.thumbnailUrl && (
                        <div className="card overflow-hidden">
                            <img src={resource.thumbnailUrl} alt={resource.title || 'Resource thumbnail'} className="w-full object-cover max-h-80" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                    )}
                </div>

                {/* ── Sidebar ── */}
                <div className="space-y-6">
                    {/* Related resources */}
                    {related.length > 0 && (
                        <div>
                            <h2 className="text-sm font-heading font-bold dark:text-dark-text mb-3 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-primary" /> Related Resources
                            </h2>
                            <div className="space-y-3">
                                {related.map(r => <RelatedCard key={r._id} r={r} />)}
                            </div>
                        </div>
                    )}

                    {/* Back link */}
                    <button
                        onClick={() => navigate('/resources')}
                        className="btn-ghost gap-2 text-sm w-full justify-center border border-card-border dark:border-dark-border rounded-xl py-2.5"
                    >
                        <ArrowLeft className="w-4 h-4" /> All Resources
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-text dark:bg-dark-text text-surface dark:text-dark-bg px-5 py-3 rounded-2xl shadow-elevated flex items-center gap-2 text-sm font-medium animate-slide-up">
                    <CheckCircle className="w-4 h-4 text-success" /> {toast}
                </div>
            )}
        </div>
    );
}
