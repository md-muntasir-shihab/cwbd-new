import BannerPanel from '../components/admin/BannerPanel';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import { Home, Image, Megaphone, Settings } from 'lucide-react';
import { ADMIN_PATHS } from '../routes/adminPaths';
import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminGetNewsSettings, adminNewsV2UploadMedia, adminUpdateNewsSettings } from '../services/api';
import { extractUploadUrl, extractUploadError } from '../components/common/CompressedImageInput';

const WEBSITE_CONTROL_TABS = [
    { key: 'home', label: 'Home Settings', path: ADMIN_PATHS.homeControl, icon: Home },
    { key: 'banners', label: 'Banner Manager', path: ADMIN_PATHS.bannerManager, icon: Image },
    { key: 'campaign', label: 'Campaign Banners', path: ADMIN_PATHS.campaignBanners, icon: Megaphone },
    { key: 'site', label: 'Site Settings', path: ADMIN_PATHS.siteSettings, icon: Settings },
];

export default function AdminSettingsBannersPage() {
    return (
        <AdminGuardShell
            title="Banner Manager"
            description="Create, update, and publish banner content used across the site, including News fallback banners."
        >
            <AdminTabNav tabs={WEBSITE_CONTROL_TABS} />
            <div className="space-y-6">
                <BannerPanel />
                <NewsBannerDefaultsCard />
            </div>
        </AdminGuardShell>
    );
}

function NewsBannerDefaultsCard() {
    const queryClient = useQueryClient();
    const [defaultBannerUrl, setDefaultBannerUrl] = useState('');
    const [defaultThumbUrl, setDefaultThumbUrl] = useState('');
    const [defaultSourceIconUrl, setDefaultSourceIconUrl] = useState('');
    const [uploading, setUploading] = useState<'banner' | 'thumb' | 'icon' | null>(null);

    const settingsQuery = useQuery({
        queryKey: ['adminNewsSettings', 'banner-manager'],
        queryFn: async () => (await adminGetNewsSettings()).data,
    });

    useEffect(() => {
        const settings = settingsQuery.data?.settings;
        if (!settings) return;
        setDefaultBannerUrl(settings.defaultBannerUrl || '');
        setDefaultThumbUrl(settings.defaultThumbUrl || '');
        setDefaultSourceIconUrl(settings.defaultSourceIconUrl || '');
    }, [settingsQuery.data?.settings]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            return (await adminUpdateNewsSettings({
                defaultBannerUrl,
                defaultThumbUrl,
                defaultSourceIconUrl,
            })).data;
        },
        onSuccess: () => {
            toast.success('News banner defaults updated');
            queryClient.invalidateQueries({ queryKey: ['adminNewsSettings'] });
            queryClient.invalidateQueries({ queryKey: ['newsSettings'] });
            queryClient.invalidateQueries({ queryKey: ['newsList'] });
            queryClient.invalidateQueries({ queryKey: ['newsDetail'] });
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Failed to update banner defaults');
        },
    });

    async function uploadAndSet(type: 'banner' | 'thumb' | 'icon', file?: File | null) {
        if (!file) return;
        setUploading(type);
        try {
            const response = await adminNewsV2UploadMedia(file, { altText: `news-${type}` });
            const url = extractUploadUrl(response.data);
            if (!url) throw new Error('Upload returned empty URL');
            if (type === 'banner') setDefaultBannerUrl(url);
            if (type === 'thumb') setDefaultThumbUrl(url);
            if (type === 'icon') setDefaultSourceIconUrl(url);
            toast.success('Uploaded');
        } catch (error: unknown) {
            toast.error(extractUploadError(error));
        } finally {
            setUploading(null);
        }
    }

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        saveMutation.mutate();
    }

    return (
        <form onSubmit={onSubmit} className="card-flat border border-cyan-500/20 p-4">
            <h2 className="text-xl font-semibold">News Banner Defaults</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                Controls fallback visuals for all news cards and articles that do not have source images.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
                <MediaInput
                    label="Default Banner URL"
                    value={defaultBannerUrl}
                    onChange={setDefaultBannerUrl}
                    onUpload={(file) => uploadAndSet('banner', file)}
                    uploading={uploading === 'banner'}
                />
                <MediaInput
                    label="Default Thumb URL"
                    value={defaultThumbUrl}
                    onChange={setDefaultThumbUrl}
                    onUpload={(file) => uploadAndSet('thumb', file)}
                    uploading={uploading === 'thumb'}
                />
                <MediaInput
                    label="Default Source Icon URL"
                    value={defaultSourceIconUrl}
                    onChange={setDefaultSourceIconUrl}
                    onUpload={(file) => uploadAndSet('icon', file)}
                    uploading={uploading === 'icon'}
                />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving...' : 'Save Defaults'}
                </button>
                <button type="button" className="btn-outline" onClick={() => settingsQuery.refetch()}>
                    Reload
                </button>
            </div>
        </form>
    );
}

function MediaInput({
    label,
    value,
    onChange,
    onUpload,
    uploading,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onUpload: (file?: File | null) => void;
    uploading: boolean;
}) {
    return (
        <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
            <input className="input-field" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste image URL or upload" />
            <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-cyan-500/60 dark:border-slate-700 dark:text-slate-200">
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            onUpload(file);
                            event.currentTarget.value = '';
                        }}
                    />
                    {uploading ? 'Uploading...' : 'Upload'}
                </label>
                {value ? <img src={value} alt={label} className="h-9 w-14 rounded-md border border-slate-300/60 object-cover dark:border-slate-700/60" /> : null}
            </div>
        </div>
    );
}
