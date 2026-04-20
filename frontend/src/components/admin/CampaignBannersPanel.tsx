import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    Plus, Edit, Trash2, Image, RefreshCw, Eye, EyeOff,
    Calendar, Clock, ExternalLink, X, ChevronUp, ChevronDown,
    Megaphone, Zap, Timer, Users, AlertCircle,
} from 'lucide-react';
import {
    adminGetBanners,
    adminCreateBanner,
    adminUpdateBanner,
    adminDeleteBanner,
    adminPublishBanner,
} from '../../services/api';
import { showConfirmDialog } from '../../lib/appDialog';
import AdminImageUploadField from './AdminImageUploadField';
import { uploadSignedBannerAsset } from './bannerUpload';
import { buildMediaUrl } from '../../utils/mediaUrl';

/* ── Types ── */
interface PopupConfig {
    autoCloseAfterSeconds: number;
    closeButtonDelaySeconds: number;
    maxViewsPerDay: number;
    cooldownHours: number;
    ctaText: string;
    homePageOnly: boolean;
    targetAudience: 'all' | 'guests' | 'logged_in';
    showOnMobile: boolean;
    showOnDesktop: boolean;
}

interface CampaignBanner {
    _id: string;
    title?: string;
    subtitle?: string;
    imageUrl: string;
    mobileImageUrl?: string;
    linkUrl?: string;
    altText?: string;
    isActive: boolean;
    status: 'draft' | 'published';
    slot: string;
    priority: number;
    order: number;
    startDate?: string;
    endDate?: string;
    popupConfig?: PopupConfig;
}

type ScheduleState = 'live' | 'scheduled' | 'expired' | 'draft';
type PanelTab = 'home_ads' | 'popup';

const DEFAULT_POPUP_CONFIG: PopupConfig = {
    autoCloseAfterSeconds: 0,
    closeButtonDelaySeconds: 5,
    maxViewsPerDay: 1,
    cooldownHours: 24,
    ctaText: 'Learn More',
    homePageOnly: true,
    targetAudience: 'all',
    showOnMobile: true,
    showOnDesktop: true,
};

const EMPTY_FORM = {
    title: '',
    subtitle: '',
    imageUrl: '',
    mobileImageUrl: '',
    linkUrl: '',
    altText: '',
    isActive: true,
    priority: 0,
    order: 0,
    startDate: '',
    endDate: '',
    popupConfig: { ...DEFAULT_POPUP_CONFIG },
};

/* ── Helpers ── */
function getScheduleState(b: CampaignBanner): ScheduleState {
    if (b.status !== 'published' || !b.isActive) return 'draft';
    const now = Date.now();
    if (b.startDate && new Date(b.startDate).getTime() > now) return 'scheduled';
    if (b.endDate && new Date(b.endDate).getTime() < now) return 'expired';
    return 'live';
}

const SCHEDULE_BADGE: Record<ScheduleState, { bg: string; text: string; label: string }> = {
    live: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Live' },
    scheduled: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Scheduled' },
    expired: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Expired' },
    draft: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Draft' },
};

function NumInput({
    label, value, onChange, min = 0, helper,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; helper?: string }) {
    return (
        <div>
            <label className="text-xs text-slate-400 mb-1 block">{label}</label>
            <input
                type="number"
                min={min}
                value={value}
                onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
                className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            {helper && <p className="text-[10px] text-slate-500 mt-0.5">{helper}</p>}
        </div>
    );
}

/* ── Component ── */
export default function CampaignBannersPanel() {
    const [banners, setBanners] = useState<CampaignBanner[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modal, setModal] = useState<null | 'create' | CampaignBanner>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [activeTab, setActiveTab] = useState<PanelTab>('home_ads');

    const campaigns = useMemo(
        () =>
            banners
                .filter((b) => b.slot === activeTab)
                .sort((a, b) => b.priority - a.priority || a.order - b.order),
        [banners, activeTab],
    );

    const fetchBanners = async () => {
        setLoading(true);
        try {
            const { data } = await adminGetBanners();
            setBanners(data.banners || []);
        } catch {
            toast.error('Failed to load campaign banners');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchBanners(); }, []);

    /* ── Modal helpers ── */
    const openCreate = () => {
        setForm({
            ...EMPTY_FORM,
            order: campaigns.length,
            popupConfig: { ...DEFAULT_POPUP_CONFIG },
        });
        setModal('create');
    };

    const openEdit = (banner: CampaignBanner) => {
        setForm({
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            imageUrl: banner.imageUrl || '',
            mobileImageUrl: banner.mobileImageUrl || '',
            linkUrl: banner.linkUrl || '',
            altText: banner.altText || '',
            isActive: banner.isActive,
            priority: Number(banner.priority || 0),
            order: Number(banner.order || 0),
            startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : '',
            endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : '',
            popupConfig: banner.popupConfig
                ? { ...DEFAULT_POPUP_CONFIG, ...banner.popupConfig }
                : { ...DEFAULT_POPUP_CONFIG },
        });
        setModal(banner);
    };

    const setPopup = (key: keyof PopupConfig, val: number) =>
        setForm((p) => ({ ...p, popupConfig: { ...p.popupConfig, [key]: val } }));

    /* ── Save ── */
    const saveBanner = async () => {
        if (!form.imageUrl.trim()) {
            toast.error('Banner image is required');
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                ...form,
                slot: activeTab,
                status: form.isActive ? 'published' : 'draft',
                priority: Number(form.priority),
                order: Number(form.order),
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
            };

            if (activeTab === 'popup') {
                payload.popupConfig = { ...form.popupConfig };
            } else {
                delete payload.popupConfig;
            }

            if (modal === 'create') {
                await adminCreateBanner(payload);
                toast.success(activeTab === 'popup' ? 'Popup campaign created' : 'Campaign banner created');
            } else if (modal && typeof modal === 'object') {
                await adminUpdateBanner(modal._id, payload);
                toast.success(activeTab === 'popup' ? 'Popup campaign updated' : 'Campaign banner updated');
            }
            setModal(null);
            await fetchBanners();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const removeBanner = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: activeTab === 'popup' ? 'Delete popup campaign' : 'Delete campaign banner',
            message: activeTab === 'popup' ? 'Delete this popup campaign?' : 'Delete this campaign banner?',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteBanner(id);
            toast.success('Deleted');
            await fetchBanners();
        } catch {
            toast.error('Failed to delete');
        }
    };

    const togglePublish = async (banner: CampaignBanner) => {
        try {
            await adminPublishBanner(banner._id, banner.status !== 'published');
            await fetchBanners();
        } catch {
            toast.error('Failed to toggle publish state');
        }
    };

    const moveBanner = async (banner: CampaignBanner, direction: 'up' | 'down') => {
        const idx = campaigns.findIndex((b) => b._id === banner._id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= campaigns.length) return;
        const other = campaigns[swapIdx];
        try {
            await Promise.all([
                adminUpdateBanner(banner._id, { order: other.order }),
                adminUpdateBanner(other._id, { order: banner.order }),
            ]);
            await fetchBanners();
        } catch {
            toast.error('Failed to reorder');
        }
    };

    /* ── Render ── */
    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-[var(--primary)]" /> Campaign Banners
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Manage promotional banners and popup ad campaigns.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => void fetchBanners()}
                        className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-xl transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={openCreate}
                        className="bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 shadow-lg shadow-[var(--primary)]/20"
                    >
                        <Plus className="w-4 h-4" />{activeTab === 'popup' ? 'New Popup' : 'New Campaign'}
                    </button>
                </div>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-slate-900/60 border border-indigo-500/10 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('home_ads')}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${activeTab === 'home_ads'
                        ? 'bg-[var(--primary)] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    <span className="flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Home Banners</span>
                </button>
                <button
                    onClick={() => setActiveTab('popup')}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${activeTab === 'popup'
                        ? 'bg-[var(--primary)] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Popup Campaigns</span>
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['live', 'scheduled', 'draft', 'expired'] as ScheduleState[]).map((st) => {
                    const count = campaigns.filter((b) => getScheduleState(b) === st).length;
                    const badge = SCHEDULE_BADGE[st];
                    return (
                        <div key={st} className="rounded-xl border border-indigo-500/10 bg-slate-900/60 px-4 py-3">
                            <p className="text-2xl font-bold text-white">{count}</p>
                            <p className={`text-xs font-medium ${badge.text}`}>{badge.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Popup explanation banner */}
            {activeTab === 'popup' && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-slate-300">
                    <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-indigo-200 mb-1">Popup Campaigns</p>
                        <p className="text-xs text-slate-400">Popup ads appear as full-screen overlay when visitors land on your public website. You can control the close-button delay, auto-dismiss timer, and how often each visitor sees the popup.</p>
                    </div>
                </div>
            )}

            {/* Banner list */}
            <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin mx-auto" />
                    </div>
                ) : campaigns.length === 0 ? (
                    <div className="p-12 text-center">
                        {activeTab === 'popup'
                            ? <Zap className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                            : <Megaphone className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        }
                        <p className="text-slate-500">
                            {activeTab === 'popup'
                                ? 'No popup campaigns yet. Create one to show full-screen ads to all visitors.'
                                : 'No campaign banners yet. Create one to promote on the home screen.'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-indigo-500/10">
                        {campaigns.map((banner, idx) => {
                            const state = getScheduleState(banner);
                            const badge = SCHEDULE_BADGE[state];
                            return (
                                <article key={banner._id} className="p-4 flex flex-col md:flex-row gap-4">
                                    {/* Preview */}
                                    <div className="w-full md:w-56 h-28 rounded-xl overflow-hidden bg-slate-950/60 shrink-0">
                                        {banner.imageUrl ? (
                                            <img
                                                src={buildMediaUrl(banner.imageUrl)}
                                                alt={banner.altText || banner.title || 'Banner'}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-full flex items-center justify-center">
                                                <Image className="w-6 h-6 text-slate-500" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-semibold text-white truncate">
                                                {banner.title || 'Untitled'}
                                            </p>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${badge.bg} ${badge.text}`}>
                                                {badge.label}
                                            </span>
                                            {activeTab === 'popup' && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 bg-indigo-500/20 text-indigo-400">
                                                    Popup
                                                </span>
                                            )}
                                        </div>
                                        {banner.subtitle && (
                                            <p className="text-xs text-slate-400 truncate mb-1">{banner.subtitle}</p>
                                        )}
                                        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {banner.startDate ? new Date(banner.startDate).toLocaleDateString() : 'No start'}
                                                {' → '}
                                                {banner.endDate ? new Date(banner.endDate).toLocaleDateString() : 'No end'}
                                            </span>
                                            {activeTab === 'popup' && banner.popupConfig && (
                                                <>
                                                    <span className="flex items-center gap-1">
                                                        <Timer className="w-3 h-3 text-amber-400" />
                                                        X after {banner.popupConfig.closeButtonDelaySeconds}s
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Users className="w-3 h-3 text-blue-400" />
                                                        {banner.popupConfig.maxViewsPerDay}×/day
                                                    </span>
                                                </>
                                            )}
                                            {banner.linkUrl && (
                                                <a
                                                    href={banner.linkUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[var(--primary)] hover:underline"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Link
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex md:flex-col items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => void togglePublish(banner)}
                                            className="p-1.5 rounded-lg hover:bg-emerald-500/10"
                                            title={state === 'live' ? 'Unpublish' : 'Publish'}
                                        >
                                            {banner.status === 'published'
                                                ? <Eye className="w-4 h-4 text-emerald-400" />
                                                : <EyeOff className="w-4 h-4 text-slate-400" />
                                            }
                                        </button>
                                        <button
                                            onClick={() => openEdit(banner)}
                                            className="p-1.5 rounded-lg hover:bg-amber-500/10"
                                            title="Edit"
                                        >
                                            <Edit className="w-4 h-4 text-amber-400" />
                                        </button>
                                        <button
                                            onClick={() => void moveBanner(banner, 'up')}
                                            disabled={idx === 0}
                                            className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30"
                                            title="Move up"
                                        >
                                            <ChevronUp className="w-4 h-4 text-slate-400" />
                                        </button>
                                        <button
                                            onClick={() => void moveBanner(banner, 'down')}
                                            disabled={idx === campaigns.length - 1}
                                            className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30"
                                            title="Move down"
                                        >
                                            <ChevronDown className="w-4 h-4 text-slate-400" />
                                        </button>
                                        <button
                                            onClick={() => void removeBanner(banner._id)}
                                            className="p-1.5 rounded-lg hover:bg-red-500/10"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Create / Edit Modal ── */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-indigo-500/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-500/10">
                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                {activeTab === 'popup' ? <Zap className="w-4 h-4 text-indigo-400" /> : <Megaphone className="w-4 h-4 text-[var(--primary)]" />}
                                {modal === 'create'
                                    ? (activeTab === 'popup' ? 'New Popup Campaign' : 'New Campaign Banner')
                                    : (activeTab === 'popup' ? 'Edit Popup Campaign' : 'Edit Campaign Banner')
                                }
                            </h3>
                            <button onClick={() => setModal(null)} className="p-1 hover:bg-white/10 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Title</label>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                                    className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    placeholder={activeTab === 'popup' ? 'e.g. Summer Offer — 30% Off!' : 'Campaign title'}
                                />
                            </div>

                            {/* Subtitle */}
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Subtitle</label>
                                <input
                                    value={form.subtitle}
                                    onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                                    className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    placeholder="Short description"
                                />
                            </div>

                            {/* Desktop image */}
                            <AdminImageUploadField
                                label={activeTab === 'popup' ? 'Popup Image / Banner' : 'Desktop Image'}
                                value={form.imageUrl}
                                onChange={(nextValue) => setForm((p) => ({ ...p, imageUrl: nextValue }))}
                                helper={
                                    activeTab === 'popup'
                                        ? 'Recommended: 800×600 px or 4:3 ratio for popup display.'
                                        : 'Required main creative for the home campaign banner carousel.'
                                }
                                required
                                previewAlt={form.altText || form.title || 'Banner preview'}
                                onUpload={uploadSignedBannerAsset}
                                uploadSuccessMessage="Image uploaded"
                                uploadErrorMessage="Failed to upload image"
                                panelClassName="bg-slate-800/45 border-indigo-500/15"
                                previewClassName="min-h-[170px] bg-slate-900/70"
                            />

                            {/* Mobile image (home banners only) */}
                            {activeTab === 'home_ads' && (
                                <AdminImageUploadField
                                    label="Mobile Image"
                                    value={form.mobileImageUrl}
                                    onChange={(nextValue) => setForm((p) => ({ ...p, mobileImageUrl: nextValue }))}
                                    helper="Optional mobile-specific version. Leave empty to reuse the desktop image."
                                    previewAlt={form.altText || form.title || 'Mobile banner preview'}
                                    onUpload={uploadSignedBannerAsset}
                                    uploadSuccessMessage="Mobile image uploaded"
                                    uploadErrorMessage="Failed to upload mobile image"
                                    panelClassName="bg-slate-800/45 border-indigo-500/15"
                                    previewClassName="min-h-[170px] bg-slate-900/70"
                                />
                            )}

                            {/* Link URL */}
                            <div>
                                <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" />
                                    Click Destination URL
                                </label>
                                <input
                                    value={form.linkUrl}
                                    onChange={(e) => setForm((p) => ({ ...p, linkUrl: e.target.value }))}
                                    className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    placeholder="https://example.com/offer"
                                />
                                {activeTab === 'popup' && (
                                    <p className="text-[10px] text-slate-500 mt-0.5">Where the user is taken when they click the popup. Leave empty to make popup non-clickable.</p>
                                )}
                            </div>

                            {/* Alt text */}
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Alt Text (Accessibility)</label>
                                <input
                                    value={form.altText}
                                    onChange={(e) => setForm((p) => ({ ...p, altText: e.target.value }))}
                                    className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    placeholder="Accessible description of the image"
                                />
                            </div>

                            {/* ── Popup Config Section ── */}
                            {activeTab === 'popup' && (
                                <div className="space-y-4 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15">
                                    <p className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5" /> Popup Behaviour Settings
                                    </p>

                                    {/* CTA Button Text */}
                                    <div>
                                        <label className="text-xs text-slate-400 mb-1 block">CTA Button Text</label>
                                        <input
                                            value={form.popupConfig.ctaText}
                                            onChange={(e) => setForm((p) => ({ ...p, popupConfig: { ...p.popupConfig, ctaText: e.target.value } }))}
                                            className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                            placeholder="Learn More"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-0.5">Text shown on the action button. Only visible when a link URL is set.</p>
                                    </div>

                                    {/* Timing row */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <NumInput
                                            label="Close Button Delay (sec)"
                                            value={form.popupConfig.closeButtonDelaySeconds}
                                            onChange={(v) => setPopup('closeButtonDelaySeconds', v)}
                                            helper="0 = show ✕ immediately"
                                        />
                                        <NumInput
                                            label="Auto-Close After (sec)"
                                            value={form.popupConfig.autoCloseAfterSeconds}
                                            onChange={(v) => setPopup('autoCloseAfterSeconds', v)}
                                            helper="0 = manual close only"
                                        />
                                    </div>

                                    {/* Frequency row */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <NumInput
                                            label="Max Views / Day"
                                            value={form.popupConfig.maxViewsPerDay}
                                            onChange={(v) => setPopup('maxViewsPerDay', v)}
                                            min={0}
                                            helper="0 = unlimited"
                                        />
                                        <NumInput
                                            label="Cooldown (hours)"
                                            value={form.popupConfig.cooldownHours}
                                            onChange={(v) => setPopup('cooldownHours', v)}
                                            min={0}
                                            helper="0 = no cooldown"
                                        />
                                    </div>

                                    {/* Audience + Display */}
                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <label className="text-xs text-slate-400 mb-1 block">Target Audience</label>
                                            <select
                                                value={form.popupConfig.targetAudience}
                                                onChange={(e) => setForm((p) => ({ ...p, popupConfig: { ...p.popupConfig, targetAudience: e.target.value as PopupConfig['targetAudience'] } }))}
                                                className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                            >
                                                <option value="all">Everyone</option>
                                                <option value="guests">Guests only (not logged in)</option>
                                                <option value="logged_in">Logged-in users only</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Toggle row */}
                                    <div className="grid grid-cols-1 gap-2">
                                        {([
                                            { key: 'homePageOnly', label: 'Show on Home Page only', hint: 'Popup will only appear on the home screen' },
                                            { key: 'showOnMobile', label: 'Show on Mobile', hint: 'Display on screens < 768px' },
                                            { key: 'showOnDesktop', label: 'Show on Desktop', hint: 'Display on screens ≥ 768px' },
                                        ] as { key: keyof PopupConfig; label: string; hint: string }[]).map(({ key, label, hint }) => (
                                            <label key={key} className="flex items-center justify-between gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/5">
                                                <div>
                                                    <p className="text-xs text-slate-300 font-medium">{label}</p>
                                                    <p className="text-[10px] text-slate-500">{hint}</p>
                                                </div>
                                                <div
                                                    className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${form.popupConfig[key] ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                                    onClick={() => setForm((p) => ({ ...p, popupConfig: { ...p.popupConfig, [key]: !p.popupConfig[key] } }))}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.popupConfig[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                </div>
                                            </label>
                                        ))}
                                    </div>

                                    {/* Live preview chips */}
                                    <div className="flex flex-wrap gap-2 text-[11px] pt-1 border-t border-indigo-500/10">
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                                            ✕ after {form.popupConfig.closeButtonDelaySeconds}s
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                                            {form.popupConfig.autoCloseAfterSeconds > 0 ? `Auto-close ${form.popupConfig.autoCloseAfterSeconds}s` : 'No auto-close'}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                                            {form.popupConfig.maxViewsPerDay === 0 ? 'Unlimited/day' : `${form.popupConfig.maxViewsPerDay}×/day`}
                                        </span>
                                        {form.popupConfig.homePageOnly && (
                                            <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">Home only</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300">
                                            {form.popupConfig.targetAudience === 'all' ? 'All visitors' : form.popupConfig.targetAudience === 'guests' ? 'Guests only' : 'Logged-in only'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Priority + order */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Priority</label>
                                    <input
                                        type="number"
                                        value={form.priority}
                                        onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                                        className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Order</label>
                                    <input
                                        type="number"
                                        value={form.order}
                                        onChange={(e) => setForm((p) => ({ ...p, order: Number(e.target.value) }))}
                                        className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    />
                                </div>
                            </div>

                            {/* Schedule */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Start Date
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={form.startDate}
                                        onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                                        className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> End Date
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={form.endDate}
                                        onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                                        className="w-full bg-slate-800/60 border border-indigo-500/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                    />
                                </div>
                            </div>

                            {/* Active toggle */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div
                                    className={`w-10 h-5 rounded-full transition-colors relative ${form.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`}
                                    onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                                >
                                    <div
                                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`}
                                    />
                                </div>
                                <span className="text-sm text-slate-300">{form.isActive ? 'Active' : 'Inactive'}</span>
                            </label>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-indigo-500/10">
                            <button
                                onClick={() => setModal(null)}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void saveBanner()}
                                disabled={saving}
                                className="px-5 py-2 text-sm rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 shadow-lg shadow-[var(--primary)]/20"
                            >
                                {saving ? 'Saving…' : modal === 'create' ? 'Create' : 'Update'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
