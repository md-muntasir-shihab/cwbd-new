import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Globe, Mail, Phone, Upload, FileText } from 'lucide-react';
import { adminUpdateWebsiteSettings, getPublicSettings, type WebsiteStaticPagesConfig } from '../../services/api';
import SocialLinksManager from './SocialLinksManager';
import { invalidateQueryGroup, invalidationGroups, queryKeys } from '../../lib/queryKeys';
import { useAdminRuntimeFlags } from '../../hooks/useAdminRuntimeFlags';
import InfoHint from '../ui/InfoHint';
import StaticPagesEditor from './StaticPagesEditor';
import AdminImageUploadField from './AdminImageUploadField';
import CompressedImageInput from '../common/CompressedImageInput';
import PageHeroSettingsEditor from './PageHeroSettingsEditor';
import { createDefaultWebsiteStaticPages, mergeWebsiteStaticPages } from '../../lib/websiteStaticPages';

const WEBSITE_SETTINGS_CACHE_KEY = 'cw_public_website_settings_cache';

type SiteSettingsForm = {
    websiteName: string;
    motto: string;
    metaTitle: string;
    metaDescription: string;
    contactEmail: string;
    contactPhone: string;
    subscriptionPageTitle: string;
    subscriptionPageSubtitle: string;
    subscriptionDefaultBannerUrl: string;
    subscriptionLoggedOutCtaMode: 'login' | 'contact';
    staticPages: WebsiteStaticPagesConfig;
    socialPreview: {
        ogTitle: string;
        ogDescription: string;
        ogImageUrl: string;
        ogType: 'website' | 'article';
        twitterCard: 'summary' | 'summary_large_image';
        twitterSite: string;
    };
    socialLinks: {
        facebook: string;
        whatsapp: string;
        messenger: string;
        telegram: string;
        twitter: string;
        youtube: string;
        instagram: string;
    };
};

const defaultSettings: SiteSettingsForm = {
    websiteName: '',
    motto: '',
    metaTitle: '',
    metaDescription: '',
    contactEmail: '',
    contactPhone: '',
    subscriptionPageTitle: 'Subscription Plans',
    subscriptionPageSubtitle: 'Choose free or paid plans to unlock premium exam access.',
    subscriptionDefaultBannerUrl: '',
    subscriptionLoggedOutCtaMode: 'contact',
    staticPages: createDefaultWebsiteStaticPages(),
    socialPreview: {
        ogTitle: '',
        ogDescription: '',
        ogImageUrl: '',
        ogType: 'website',
        twitterCard: 'summary_large_image',
        twitterSite: '',
    },
    socialLinks: {
        facebook: '',
        whatsapp: '',
        messenger: '',
        telegram: '',
        twitter: '',
        youtube: '',
        instagram: '',
    },
};

function revokeBlobUrl(value: string) {
    if (value && value.startsWith('blob:')) {
        URL.revokeObjectURL(value);
    }
}

function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export default function SiteSettingsPanel() {
    const queryClient = useQueryClient();
    const runtimeFlags = useAdminRuntimeFlags();
    const [settings, setSettings] = useState<SiteSettingsForm>(defaultSettings);

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [previewLogo, setPreviewLogo] = useState('');
    const [previewFavicon, setPreviewFavicon] = useState('');
    const originalSettingsRef = useRef<SiteSettingsForm>(defaultSettings);
    const originalLogoRef = useRef('');
    const originalFaviconRef = useRef('');
    const logoBlobUrlRef = useRef('');
    const faviconBlobUrlRef = useRef('');

    const logoRef = useRef<HTMLInputElement>(null);
    const faviconRef = useRef<HTMLInputElement>(null);
    const settingsQuery = useQuery({
        queryKey: queryKeys.siteSettings,
        queryFn: async () => (await getPublicSettings()).data,
    });

    useEffect(() => {
        if (!settingsQuery.data) return;
        const data = settingsQuery.data;

        revokeBlobUrl(logoBlobUrlRef.current);
        revokeBlobUrl(faviconBlobUrlRef.current);
        logoBlobUrlRef.current = '';
        faviconBlobUrlRef.current = '';

        const nextSettings = {
            ...defaultSettings,
            ...data,
            staticPages: mergeWebsiteStaticPages(data.staticPages),
            socialPreview: {
                ...(defaultSettings as any).socialPreview,
                ...((data as any).socialPreview || {}),
            },
            socialLinks: {
                ...defaultSettings.socialLinks,
                ...(data.socialLinks || {}),
            },
        };
        originalSettingsRef.current = nextSettings;
        originalLogoRef.current = data.logo || '';
        originalFaviconRef.current = data.favicon || '';
        setSettings(nextSettings);
        setPreviewLogo(data.logo || '');
        setPreviewFavicon(data.favicon || '');
        setLogoFile(null);
        setFaviconFile(null);
    }, [settingsQuery.data]);

    useEffect(() => () => {
        revokeBlobUrl(logoBlobUrlRef.current);
        revokeBlobUrl(faviconBlobUrlRef.current);
    }, []);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const formData = new FormData();
            formData.append('websiteName', settings.websiteName);
            formData.append('motto', settings.motto);
            formData.append('metaTitle', settings.metaTitle);
            formData.append('metaDescription', settings.metaDescription);
            formData.append('contactEmail', settings.contactEmail);
            formData.append('contactPhone', settings.contactPhone);
            formData.append('subscriptionPageTitle', settings.subscriptionPageTitle);
            formData.append('subscriptionPageSubtitle', settings.subscriptionPageSubtitle);
            formData.append('subscriptionDefaultBannerUrl', settings.subscriptionDefaultBannerUrl);
            formData.append('subscriptionLoggedOutCtaMode', settings.subscriptionLoggedOutCtaMode);
            formData.append('staticPages', JSON.stringify(settings.staticPages));
            formData.append('socialLinks', JSON.stringify(settings.socialLinks));
            formData.append('socialPreview', JSON.stringify(settings.socialPreview));

            if (logoFile) formData.append('logo', logoFile);
            if (faviconFile) formData.append('favicon', faviconFile);
            return adminUpdateWebsiteSettings(formData);
        },
        onSuccess: async () => {
            toast.success('Website settings saved successfully');
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(WEBSITE_SETTINGS_CACHE_KEY);
            }
            await invalidateQueryGroup(queryClient, invalidationGroups.siteSave);
            await invalidateQueryGroup(queryClient, invalidationGroups.plansSave);
            await settingsQuery.refetch();
        },
        onError: () => {
            toast.error('Failed to save settings');
        },
    });

    const handleFileChange = (file: File | null, type: 'logo' | 'favicon') => {
        if (!file) return;
        if (type === 'logo') {
            revokeBlobUrl(logoBlobUrlRef.current);
            setLogoFile(file);
            const nextBlobUrl = URL.createObjectURL(file);
            logoBlobUrlRef.current = nextBlobUrl;
            setPreviewLogo(nextBlobUrl);
        } else {
            revokeBlobUrl(faviconBlobUrlRef.current);
            setFaviconFile(file);
            const nextBlobUrl = URL.createObjectURL(file);
            faviconBlobUrlRef.current = nextBlobUrl;
            setPreviewFavicon(nextBlobUrl);
        }
    };

    const onSave = async () => {
        await saveMutation.mutateAsync();
    };

    const handleReset = () => {
        revokeBlobUrl(logoBlobUrlRef.current);
        revokeBlobUrl(faviconBlobUrlRef.current);
        logoBlobUrlRef.current = '';
        faviconBlobUrlRef.current = '';
        setSettings(originalSettingsRef.current);
        setPreviewLogo(originalLogoRef.current);
        setPreviewFavicon(originalFaviconRef.current);
        setLogoFile(null);
        setFaviconFile(null);
    };

    if (settingsQuery.isLoading) {

        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-indigo-500/15 bg-slate-900/60 p-6">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="h-5 w-5 animate-spin text-indigo-300" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Loading Website Settings</h2>
                            <p className="text-xs text-slate-400">
                                Branding and global configuration are loading...
                            </p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl border border-indigo-500/10 bg-slate-900/40" />
                    ))}
                </div>
            </div>
        );
    }

    const isDirty = !deepEqual(settings, originalSettingsRef.current) || Boolean(logoFile) || Boolean(faviconFile);
    const summaryCards = [
        {
            title: 'Branding',
            value: settings.websiteName || 'Not set',
            detail: previewLogo ? 'Logo ready' : 'Logo missing',
        },
        {
            title: 'Contact',
            value: settings.contactEmail || 'Email missing',
            detail: settings.contactPhone || 'Phone missing',
        },
        {
            title: 'Subscription CTA',
            value: settings.subscriptionLoggedOutCtaMode === 'login' ? 'Login' : 'Contact',
            detail: settings.subscriptionPageTitle || 'Subscription Plans',
        },
    ];

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Premium Header Hero */}
            <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 p-6 shadow-[0_24px_70px_rgba(6,10,24,0.3)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200/85">Global Configuration</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Website Settings
                            {runtimeFlags.trainingMode ? (
                                <InfoHint
                                    className="ml-2"
                                    title="Branding Tip"
                                    description="Changes to logo, website name, social links, and subscription texts update public pages immediately after save."
                                />
                            ) : null}
                        </h2>
                        <p className="mt-3 text-sm leading-7 text-slate-300">Identity, contact, subscription copy, and static page controls in one save cycle.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-end">
                        {isDirty ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                                Unsaved changes
                            </span>
                        ) : (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                                Saved state
                            </span>
                        )}
                        {isDirty ? (
                            <button
                                onClick={handleReset}
                                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur transition hover:bg-white/10"
                            >
                                Reset
                            </button>
                        ) : null}
                        <button onClick={onSave} disabled={saveMutation.isPending || !isDirty} className="rounded-xl bg-white/10 border border-white/20 text-white text-sm px-6 py-2.5 flex items-center gap-2 font-semibold backdrop-blur transition hover:bg-white/15 disabled:opacity-50">
                            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isDirty ? 'Save Changes' : 'Saved'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card, idx) => {
                    const IconComponents = [Globe, Mail, FileText];
                    const bgs = ['bg-indigo-50 dark:bg-indigo-950/30', 'bg-emerald-50 dark:bg-emerald-950/30', 'bg-violet-50 dark:bg-violet-950/30'];
                    const IconComp = IconComponents[idx];
                    return (
                        <div key={card.title} className={`group relative overflow-hidden rounded-2xl border border-slate-200/50 ${bgs[idx]} p-5 transition-all duration-300 hover:shadow-md dark:border-slate-800/50`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{card.title}</p>
                                    <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">{card.value}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.detail}</p>
                                </div>
                                {IconComp && <IconComp className="h-6 w-6 opacity-40 group-hover:scale-110 transition-transform text-slate-500 dark:text-slate-400" />}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Workspace Info Bar */}
            <div className="rounded-[1.5rem] border border-slate-700/30 bg-slate-950/40 ring-1 ring-white/[0.03] px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-white">Global settings workspace</p>
                        <p className="text-xs text-slate-400">
                            Branding, public contact, subscription copy, and static pages stay in one save cycle.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-indigo-500/15 bg-slate-900/70 px-3 py-1.5 font-medium">No route changes</span>
                        <span className="rounded-full border border-indigo-500/15 bg-slate-900/70 px-3 py-1.5 font-medium">Public-facing impact</span>
                        <span className="rounded-full border border-indigo-500/15 bg-slate-900/70 px-3 py-1.5 font-medium">Save required</span>
                    </div>
                </div>
            </div>

            {/* ── Identity & Branding + Contact ── */}
            <div className="grid gap-6 xl:grid-cols-2">
                <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-400" /> Identity & Branding</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 font-medium block mb-2">Primary Logo</label>
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-xl bg-slate-950/50 border border-slate-700/40 flex items-center justify-center overflow-hidden">
                                    {previewLogo ? <img src={previewLogo} alt="Logo preview" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-slate-500">No Logo</span>}
                                </div>
                                <CompressedImageInput ref={logoRef} hidden accept="image/*" onChange={(file) => handleFileChange(file, 'logo')} />
                                <button onClick={() => logoRef.current?.click()} className="text-xs flex items-center gap-2 bg-indigo-500/15 text-indigo-300 px-3 py-2 rounded-lg hover:bg-indigo-500/25 transition-colors">
                                    <Upload className="w-3 h-3" /> Upload
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-medium block mb-2">Favicon</label>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-950/50 border border-slate-700/40 flex items-center justify-center overflow-hidden">
                                    {previewFavicon ? <img src={previewFavicon} alt="Favicon preview" className="w-6 h-6 object-contain" /> : <span className="text-[10px] text-slate-500">Icon</span>}
                                </div>
                                <CompressedImageInput ref={faviconRef} hidden accept="image/*" onChange={(file) => handleFileChange(file, 'favicon')} />
                                <button onClick={() => faviconRef.current?.click()} className="text-xs flex items-center gap-2 bg-indigo-500/15 text-indigo-300 px-3 py-2 rounded-lg hover:bg-indigo-500/25 transition-colors">
                                    <Upload className="w-3 h-3" /> Upload
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-slate-400 font-medium">Website Name</label>
                            <input value={settings.websiteName} onChange={e => setSettings({ ...settings, websiteName: e.target.value })}
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-medium">Motto</label>
                            <input value={settings.motto} onChange={e => setSettings({ ...settings, motto: e.target.value })}
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 font-medium">Meta Title</label>
                        <input value={settings.metaTitle} onChange={e => setSettings({ ...settings, metaTitle: e.target.value })}
                            className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 font-medium">Meta Description</label>
                        <textarea rows={3} value={settings.metaDescription} onChange={e => setSettings({ ...settings, metaDescription: e.target.value })}
                            className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y" />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-400" /> Contact Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                                <input value={settings.contactEmail} onChange={e => setSettings({ ...settings, contactEmail: e.target.value })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</label>
                                <input value={settings.contactPhone} onChange={e => setSettings({ ...settings, contactPhone: e.target.value })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-violet-400" /> Subscription Page</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="text-xs text-slate-400">Page Title</label>
                                <input value={settings.subscriptionPageTitle} onChange={(e) => setSettings({ ...settings, subscriptionPageTitle: e.target.value })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400">Page Subtitle</label>
                                <textarea rows={2} value={settings.subscriptionPageSubtitle} onChange={(e) => setSettings({ ...settings, subscriptionPageSubtitle: e.target.value })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y" />
                            </div>
                            <AdminImageUploadField
                                label="Default Plan Banner"
                                value={settings.subscriptionDefaultBannerUrl}
                                onChange={(nextValue) => setSettings({ ...settings, subscriptionDefaultBannerUrl: nextValue })}
                                helper="Fallback banner used on the subscription page when a plan-specific banner is missing."
                                category="admin_upload"
                                previewAlt="Default subscription banner"
                                previewClassName="min-h-[170px]"
                                panelClassName="bg-slate-950/35 dark:bg-slate-950/65"
                            />
                            <div>
                                <label className="text-xs text-slate-400">Logged-out CTA Behavior</label>
                                <select value={settings.subscriptionLoggedOutCtaMode} onChange={(e) => setSettings({ ...settings, subscriptionLoggedOutCtaMode: e.target.value as 'login' | 'contact' })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                                    <option value="login">Send to Login</option>
                                    <option value="contact">Send to Contact</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Social Preview (Open Graph) ── */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-4">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Globe className="w-4 h-4 text-violet-400" /> Social Preview (Open Graph)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Controls what appears when your link is shared on Facebook, Twitter, WhatsApp, etc.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-slate-400 font-medium">OG Title</label>
                            <input value={settings.socialPreview.ogTitle} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, ogTitle: e.target.value } })}
                                placeholder="Leave empty to use Meta Title"
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-medium">OG Description</label>
                            <textarea rows={2} value={settings.socialPreview.ogDescription} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, ogDescription: e.target.value } })}
                                placeholder="Leave empty to use Meta Description"
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-y" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-medium">Twitter @site handle</label>
                            <input value={settings.socialPreview.twitterSite} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, twitterSite: e.target.value } })}
                                placeholder="@campusway"
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 font-medium">OG Type</label>
                                <select value={settings.socialPreview.ogType} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, ogType: e.target.value as 'website' | 'article' } })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                                    <option value="website">website</option>
                                    <option value="article">article</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 font-medium">Twitter Card</label>
                                <select value={settings.socialPreview.twitterCard} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, twitterCard: e.target.value as 'summary' | 'summary_large_image' } })}
                                    className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all">
                                    <option value="summary_large_image">Large Image</option>
                                    <option value="summary">Summary</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-slate-400 font-medium">OG Image URL</label>
                            <input value={settings.socialPreview.ogImageUrl} onChange={e => setSettings({ ...settings, socialPreview: { ...settings.socialPreview, ogImageUrl: e.target.value } })}
                                placeholder="https://... (1200×630 recommended)"
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all" />
                        </div>
                        {settings.socialPreview.ogImageUrl ? (
                            <div className="rounded-xl border border-slate-700/30 bg-slate-950/30 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Preview</p>
                                <img src={settings.socialPreview.ogImageUrl} alt="OG preview" className="rounded-lg max-h-40 w-full object-cover border border-slate-700/20" />
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-slate-700/30 bg-slate-950/20 p-8 text-center">
                                <p className="text-xs text-slate-500">No OG image set. Add a URL above to see a preview.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Standard Social Links ── */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-400" /> Standard Social Links</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {['facebook', 'whatsapp', 'messenger', 'telegram', 'twitter', 'youtube', 'instagram'].map((platform) => (
                        <div key={platform}>
                            <label className="text-xs text-slate-400 capitalize font-medium">{platform}</label>
                            <input
                                value={settings.socialLinks[platform as keyof typeof settings.socialLinks] || ''}
                                onChange={e => setSettings({ ...settings, socialLinks: { ...settings.socialLinks, [platform]: e.target.value } })}
                                className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                                placeholder={['whatsapp', 'phone'].includes(platform) ? 'Number or Link' : `https://${platform}.com/...`}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            Static Pages
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                            Control the public About, Terms, and Privacy pages, including About-page founder information.
                        </p>
                    </div>

                </div>

                <StaticPagesEditor
                    value={settings.staticPages}
                    onChange={(staticPages) => setSettings((current) => ({ ...current, staticPages }))}
                />
            </div>

            <SocialLinksManager />

            <PageHeroSettingsEditor />

            {/* ── Custom Legal Pages (merged from separate page) ── */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-5">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Custom Legal Pages
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                        About, Terms ও Privacy উপরের Static Pages থেকে ম্যানেজ হয়। এখানে অতিরিক্ত legal pages (Refund Policy, Cookie Policy ইত্যাদি) তৈরি করতে পারবেন।
                    </p>
                    <a
                        href="/__cw_admin__/legal-pages"
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                    >
                        <FileText className="h-3.5 w-3.5" />
                        Open Legal Pages Editor
                    </a>
                </div>
            </div>
        </div>
    );
}
