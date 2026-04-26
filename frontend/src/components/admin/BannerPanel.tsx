import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Image, RefreshCw } from 'lucide-react';
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

interface BannerItem {
    _id: string;
    title?: string;
    subtitle?: string;
    imageUrl: string;
    mobileImageUrl?: string;
    linkUrl?: string;
    altText?: string;
    isActive: boolean;
    status: 'draft' | 'published';
    slot: 'top' | 'middle' | 'footer';
    priority: number;
    order: number;
    startDate?: string;
    endDate?: string;
}

const EMPTY_FORM = {
    title: '',
    subtitle: '',
    imageUrl: '',
    mobileImageUrl: '',
    linkUrl: '',
    altText: '',
    isActive: true,
    status: 'draft' as 'draft' | 'published',
    slot: 'top' as 'top' | 'middle' | 'footer' | 'home_ads',
    priority: 0,
    order: 0,
    startDate: '',
    endDate: '',
};

export default function BannerPanel() {
    const [banners, setBanners] = useState<BannerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editModal, setEditModal] = useState<null | 'create' | BannerItem>(null);
    const [form, setForm] = useState(EMPTY_FORM);

    const grouped = useMemo(() => {
        return {
            top: banners.filter((banner) => banner.slot === 'top').sort((a, b) => b.priority - a.priority || a.order - b.order),
            middle: banners.filter((banner) => banner.slot === 'middle').sort((a, b) => b.priority - a.priority || a.order - b.order),
            footer: banners.filter((banner) => banner.slot === 'footer').sort((a, b) => b.priority - a.priority || a.order - b.order),
            home_ads: banners.filter((banner) => (banner.slot as string) === 'home_ads').sort((a, b) => b.priority - a.priority || a.order - b.order),
        };
    }, [banners]);

    const fetchBanners = async () => {
        setLoading(true);
        try {
            const { data } = await adminGetBanners();
            setBanners(data.banners || []);
        } catch {
            toast.error('Failed to load banners');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchBanners();
    }, []);

    const openCreate = () => {
        setForm({ ...EMPTY_FORM, order: banners.length });
        setEditModal('create');
    };

    const openEdit = (banner: BannerItem) => {
        setForm({
            title: banner.title || '',
            subtitle: banner.subtitle || '',
            imageUrl: banner.imageUrl || '',
            mobileImageUrl: banner.mobileImageUrl || '',
            linkUrl: banner.linkUrl || '',
            altText: banner.altText || '',
            isActive: banner.isActive,
            status: banner.status || 'draft',
            slot: banner.slot || 'top',
            priority: Number(banner.priority || 0),
            order: Number(banner.order || 0),
            startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : '',
            endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : '',
        });
        setEditModal(banner);
    };

    const saveBanner = async () => {
        if (!form.imageUrl.trim()) {
            toast.error('Banner image is required');
            return;
        }
        if (form.startDate && form.endDate && new Date(form.startDate) >= new Date(form.endDate)) {
            toast.error('End date must be after start date');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                priority: Number(form.priority),
                order: Number(form.order),
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
            };
            if (editModal === 'create') {
                await adminCreateBanner(payload);
                toast.success('Banner created');
            } else if (editModal) {
                await adminUpdateBanner(editModal._id, payload);
                toast.success('Banner updated');
            }
            setEditModal(null);
            await fetchBanners();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to save banner');
        } finally {
            setSaving(false);
        }
    };

    const removeBanner = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: 'Delete banner',
            message: 'Delete this banner?',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteBanner(id);
            toast.success('Banner deleted');
            await fetchBanners();
        } catch {
            toast.error('Failed to delete banner');
        }
    };

    const togglePublish = async (banner: BannerItem) => {
        try {
            await adminPublishBanner(banner._id, banner.status !== 'published');
            await fetchBanners();
        } catch {
            toast.error('Failed to update publish state');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-white">Banner Management</h2>
                    <p className="text-xs text-slate-500">Slot-aware, scheduled banners with publish control</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => void fetchBanners()} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-xl transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={openCreate} className="bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 shadow-lg shadow-indigo-500/20">
                        <Plus className="w-4 h-4" /> Create Banner
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {(['top', 'middle', 'footer', 'home_ads'] as const).map((slot) => (
                    <div key={slot} className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-indigo-500/10">
                            <h3 className="text-sm font-semibold text-white capitalize">{slot} Slot</h3>
                        </div>
                        <div className="divide-y divide-indigo-500/10">
                            {loading ? (
                                <div className="p-6 text-center text-slate-500 text-sm">Loading...</div>
                            ) : grouped[slot].length === 0 ? (
                                <div className="p-6 text-center text-slate-500 text-sm">No banners</div>
                            ) : (
                                grouped[slot].map((banner) => (
                                    <article key={banner._id} className="p-4 space-y-2">
                                        <div className="h-24 rounded-xl overflow-hidden bg-slate-950/65">
                                            {banner.imageUrl ? <img src={buildMediaUrl(banner.imageUrl)} alt={banner.altText || banner.title || 'Banner'} className="w-full h-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Image className="w-5 h-5 text-slate-500" /></div>}
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm text-white font-medium truncate max-w-[180px]">{banner.title || 'Untitled'}</p>
                                                <p className="text-[11px] text-slate-400">Priority {banner.priority}</p>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${banner.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-300'}`}>
                                                {banner.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => void togglePublish(banner)} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                                                {banner.status === 'published' ? 'Unpublish' : 'Publish'}
                                            </button>
                                            <button onClick={() => openEdit(banner)} className="p-1.5 hover:bg-amber-500/10 rounded-lg" title="Edit">
                                                <Edit className="w-4 h-4 text-amber-400" />
                                            </button>
                                            <button onClick={() => void removeBanner(banner._id)} className="p-1.5 hover:bg-red-500/10 rounded-lg" title="Delete">
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </button>
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {editModal ? (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
                    <div className="bg-slate-900/65 border border-indigo-500/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between">
                            <h3 className="font-bold text-white">{editModal === 'create' ? 'Create Banner' : 'Edit Banner'}</h3>
                            <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white text-xl">×</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <AdminImageUploadField
                                label="Banner Image"
                                value={form.imageUrl}
                                onChange={(nextValue) => setForm((prev) => ({ ...prev, imageUrl: nextValue }))}
                                helper="Uses the existing signed banner upload flow with local fallback."
                                required
                                previewAlt={form.altText || form.title || 'Banner preview'}
                                onUpload={uploadSignedBannerAsset}
                                uploadSuccessMessage="Banner uploaded"
                                uploadErrorMessage="Failed to upload banner"
                                panelClassName="bg-slate-950/65 border-indigo-500/10"
                                previewClassName="min-h-[180px] bg-slate-950/80"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Slot</label>
                                    <select value={form.slot} onChange={(event) => setForm({ ...form, slot: event.target.value as 'top' | 'middle' | 'footer' })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none">
                                        <option value="top">Top</option>
                                        <option value="middle">Middle</option>
                                        <option value="footer">Footer</option>
                                        <option value="home_ads">Home Ads (Scrollable)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Priority</label>
                                    <input type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Title</label>
                                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/30 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Target Link</label>
                                <input value={form.linkUrl} onChange={(event) => setForm({ ...form, linkUrl: event.target.value })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/30 outline-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
                                    <input type="datetime-local" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">End Date</label>
                                    <input type="datetime-local" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="text-xs text-slate-400">Enabled</label>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${form.isActive ? 'bg-indigo-500' : 'bg-slate-600'}`}
                                >
                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'left-5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-indigo-500/10 flex gap-3 justify-end">
                            <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors">Cancel</button>
                            <button onClick={() => void saveBanner()} disabled={saving} className="px-6 py-2 text-sm bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl hover:opacity-90 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                                {saving ? 'Saving...' : editModal === 'create' ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
