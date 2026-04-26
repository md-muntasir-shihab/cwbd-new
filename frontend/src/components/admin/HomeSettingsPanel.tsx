import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Eye, GripVertical, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    adminGetHomeSettings,
    adminGetHomeSettingsDefaults,
    adminGetUniversityClusters,
    adminGetSubscriptionPlans,
    adminGetUniversities,
    adminGetUniversityCategories,
    adminUpdateUniversityCluster,
    adminGetHomeConfig,
    adminResetHomeSettingsSection,
    adminUpdateHomeConfig,
    adminUpdateHomeSettings,
    getHome,
    type HomeConfigSection,
    type AdminUniversityCluster,
    type AdminSubscriptionPlan,
    type HomeApiResponse,
    type HomeSettingsConfig,
} from '../../services/api';
import ModernToggle from '../ui/ModernToggle';
import { invalidateQueryGroup, invalidationGroups, queryKeys } from '../../lib/queryKeys';

import AdminImageUploadField from './AdminImageUploadField';

type SectionKey = keyof HomeSettingsConfig;
type QuickClusterState = Pick<AdminUniversityCluster, '_id' | 'name' | 'homeVisible' | 'homeOrder'> & { memberCount: number };

const UNIVERSITY_SETTINGS_ROUTE = '/__cw_admin__/settings/university-settings';
const SHOW_LEGACY_UNIVERSITY_HOME_CONTROLS = false;
const HOME_UNIVERSITY_SECTION_IDS = new Set(['featured', 'category_filter', 'deadlines', 'upcoming_exams']);


const sectionHelp: Record<SectionKey, string> = {
    sectionVisibility: 'Show or hide each Home section in strict order.',
    hero: 'Hero text, CTAs, search visibility, and image.',
    universityPreview: 'Controls featured/deadline/exam windows and limits for Home university cards.',
    subscriptionBanner: 'Plan upsell strip directly under hero.',
    topBanner: 'Top promotional banner block.',
    middleBanner: 'Middle promotional banner block.',
    bottomBanner: 'Bottom promotional banner block.',
    stats: 'Platform metrics strip and displayed stat keys.',
    timeline: 'Closing soon and exam soon windows and limits.',
    universityDashboard: 'Placeholder dashboard filters and labels.',
    universityCardConfig: 'University card layout, block visibility, default logo, and sorting behavior.',
    highlightedCategories: 'Ordered highlighted university categories for Home chips.',
    featuredUniversities: 'Ordered featured university IDs and badges for Home block.',
    closingExamWidget: 'Compact closing/exams-this-week widget limits.',
    examsWidget: 'Live/upcoming exam tab behavior and lock policy.',
    newsPreview: 'News preview labels and item cap.',
    resourcesPreview: 'Resources preview labels and item cap.',
    socialStrip: 'Social/community strip headline and CTA label.',
    campaignBanners: 'Campaign banner carousel auto-rotation and labeling.',
    adsSection: 'Scrollable ad section on Home page.',
    footer: 'Global footer visibility and content.',
    ui: 'Animation behavior: off/minimal/normal.',
};

const visibilityToggles: Array<{ key: keyof HomeSettingsConfig['sectionVisibility']; label: string }> = [
    { key: 'hero', label: 'Hero' },
    { key: 'subscriptionBanner', label: 'Subscription Banner' },
    { key: 'stats', label: 'Stats Strip' },
    { key: 'timeline', label: "What's Happening Now" },
    { key: 'closingExamWidget', label: 'Closing + Week Widget' },
    { key: 'examsWidget', label: 'Live/Upcoming Exams' },
    { key: 'newsPreview', label: 'News Preview' },
    { key: 'resourcesPreview', label: 'Resources Preview' },
    { key: 'socialStrip', label: 'Social Strip' },
    { key: 'adsSection', label: 'Scrollable Ads' },
    { key: 'footer', label: 'Footer' },
];

const sectionTitleOverrides: Partial<Record<SectionKey, string>> = {
    universityPreview: 'University Preview',
    universityDashboard: 'University Dashboard',
    universityCardConfig: 'University Card Config',
    closingExamWidget: 'Closing + Week Widget',
    examsWidget: 'Exams + News + Resources',
    adsSection: 'Scrollable Ads',
};



const FALLBACK_HOME_SETTINGS: HomeSettingsConfig = {
    sectionVisibility: {
        hero: true,
        subscriptionBanner: true,
        stats: true,
        timeline: true,
        universityDashboard: true,
        closingExamWidget: true,
        examsWidget: true,
        newsPreview: true,
        resourcesPreview: true,
        socialStrip: true,
        adsSection: true,
        footer: true,
    },
    hero: {
        pillText: 'CampusWay',
        title: '',
        subtitle: '',
        showSearch: true,
        searchPlaceholder: 'Search universities, exams, news...',
        showNextDeadlineCard: true,
        primaryCTA: { label: '', url: '' },
        secondaryCTA: { label: '', url: '' },
        heroImageUrl: '',
        shortcutChips: [],
    },
    universityPreview: {
        enabled: true,
        useHighlightedCategoriesOnly: true,
        defaultActiveCategory: 'Individual Admission',
        enableClusterFilter: true,
        maxFeaturedItems: 12,
        maxDeadlineItems: 6,
        maxExamItems: 6,
        deadlineWithinDays: 15,
        examWithinDays: 15,
        featuredMode: 'manual',
    },
    subscriptionBanner: {
        enabled: true,
        title: '',
        subtitle: '',
        loginMessage: '',
        noPlanMessage: '',
        activePlanMessage: '',
        bannerImageUrl: '',
        primaryCTA: { label: '', url: '' },
        secondaryCTA: { label: '', url: '' },
        showPlanCards: true,
        planIdsToShow: [],
    },
    topBanner: {
        enabled: false,
        imageUrl: '',
        linkUrl: '',
    },
    middleBanner: {
        enabled: false,
        imageUrl: '',
        linkUrl: '',
    },
    bottomBanner: {
        enabled: false,
        imageUrl: '',
        linkUrl: '',
    },
    adsSection: {
        enabled: false,
        title: '',
    },
    stats: {
        enabled: true,
        title: '',
        subtitle: '',
        items: [],
    },
    timeline: {
        enabled: true,
        title: '',
        subtitle: '',
        closingSoonDays: 7,
        examSoonDays: 7,
        maxClosingItems: 6,
        maxExamItems: 6,
    },
    universityDashboard: {
        enabled: true,
        title: '',
        subtitle: '',
        showFilters: true,
        defaultCategory: 'Individual Admission',
        showAllCategories: false,
        showPlaceholderText: true,
        placeholderNote: '',
    },
    universityCardConfig: {
        defaultUniversityLogo: '',
        showExamCentersPreview: true,
        closingSoonDays: 7,
        showAddress: true,
        showEmail: true,
        showApplicationProgress: true,
        showExamDates: true,
        defaultSort: 'alphabetical',
    },
    highlightedCategories: [],
    featuredUniversities: [],
    closingExamWidget: {
        enabled: true,
        title: '',
        subtitle: '',
        maxClosing: 5,
        maxExamsThisWeek: 5,
    },
    examsWidget: {
        enabled: true,
        title: '',
        subtitle: '',
        maxLive: 4,
        maxUpcoming: 6,
        showLockedExamsToUnsubscribed: 'show_locked',
        loginRequiredText: '',
        subscriptionRequiredText: '',
    },
    newsPreview: {
        enabled: true,
        title: '',
        subtitle: '',
        maxItems: 4,
        ctaLabel: 'View all news',
        ctaUrl: '/news',
    },
    resourcesPreview: {
        enabled: true,
        title: '',
        subtitle: '',
        maxItems: 4,
        ctaLabel: 'View all resources',
        ctaUrl: '/resources',
    },
    socialStrip: {
        enabled: true,
        title: '',
        subtitle: '',
        ctaLabel: '',
    },
    footer: {
        enabled: true,
        aboutText: '',
        quickLinks: [],
        contactInfo: { email: '', phone: '', address: '' },
        legalLinks: [],
        showFounderButton: true,
    },
    ui: {
        animationLevel: 'normal',
    },
};

function SectionHeader({
    title,
    section,
    onReset,
    resetting,
}: {
    title: string;
    section: SectionKey;
    onReset: (section: SectionKey) => void;
    resetting: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{title}</h3>
                <span className="text-[10px] text-slate-500">{sectionHelp[section]}</span>
            </div>
            <button
                type="button"
                onClick={() => onReset(section)}
                disabled={resetting}
                className="text-xs rounded-lg border border-indigo-500/30 px-2.5 py-1.5 text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-60"
            >
                {resetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span className="inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />Reset</span>}
            </button>
        </div>
    );
}

function Toggle({
    label,
    value,
    onChange,
    helper,
}: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    helper?: string;
}) {
    return (
        <label className="rounded-xl border border-indigo-500/15 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3 cursor-pointer group hover:bg-indigo-500/5 transition-all">
            <div className="flex-1">
                <span className="text-sm font-medium text-slate-200 group-hover:text-indigo-400 transition-colors">
                    {label}
                </span>
                {helper ? <span className="block text-[11px] text-slate-500 mt-0.5">{helper}</span> : null}
            </div>
            <ModernToggle checked={value} onChange={onChange} />
        </label>
    );
}

function Input({
    label,
    value,
    onChange,
    helper,
}: {
    label: string;
    value: string | number;
    onChange: (value: string) => void;
    helper?: string;
}) {
    return (
        <div>
            <label className="text-xs text-slate-400">{label}</label>
            <input
                value={String(value ?? '')}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none transition-all"
            />
            {helper ? <p className="text-[11px] text-slate-500 mt-1">{helper}</p> : null}
        </div>
    );
}

function NumberInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <div>
            <label className="text-xs text-slate-400">{label}</label>
            <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                onChange={(event) => onChange(Number(event.target.value || 0))}
                className="mt-1 w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white focus:border-indigo-500/50 outline-none transition-all"
            />
        </div>
    );
}

function LinkListEditor({
    label,
    links,
    onChange,
}: {
    label: string;
    links: Array<{ label: string; url: string }>;
    onChange: (links: Array<{ label: string; url: string }>) => void;
}) {
    const [newLink, setNewLink] = useState({ label: '', url: '' });

    const addLink = () => {
        if (!newLink.label.trim() || !newLink.url.trim()) return;
        onChange([...links, { ...newLink }]);
        setNewLink({ label: '', url: '' });
    };

    const removeLink = (index: number) => {
        onChange(links.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">{label}</label>
            <div className="space-y-2">
                {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-950/40 rounded-xl border border-indigo-500/10 p-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{link.label}</p>
                            <p className="text-[10px] text-slate-500 truncate">{link.url}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeLink(index)}
                            className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5 rotate-45" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <input
                    placeholder="Label"
                    value={newLink.label}
                    onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                    className="w-full rounded-lg bg-slate-950/65 border border-indigo-500/15 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                    placeholder="URL"
                    value={newLink.url}
                    onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                    className="w-full rounded-lg bg-slate-950/65 border border-indigo-500/15 px-2.5 py-1.5 text-xs text-white"
                />
            </div>
            <button
                type="button"
                onClick={addLink}
                disabled={!newLink.label.trim() || !newLink.url.trim()}
                className="w-full py-1.5 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs rounded-lg border border-indigo-500/20 transition-all disabled:opacity-50"
            >
                Add Link
            </button>
        </div>
    );
}

function cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefined<T>(base: T, patch: unknown): T {
    if (patch === undefined || patch === null) return base;
    if (Array.isArray(base)) {
        return (Array.isArray(patch) ? patch : base) as T;
    }
    if (!isRecord(base) || !isRecord(patch)) {
        return patch as T;
    }

    const next: UnknownRecord = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        const current = next[key];
        if (Array.isArray(current)) {
            next[key] = Array.isArray(value) ? value : current;
            continue;
        }
        if (isRecord(current) && isRecord(value)) {
            next[key] = mergeDefined(current, value);
            continue;
        }
        next[key] = value;
    }
    return next as T;
}

/* ============================================================== */
/*  Section Reorder Panel (uses HomeConfig API)                    */
/* ============================================================== */
function SectionReorderPanel() {
    const queryClient = useQueryClient();
    const [sections, setSections] = useState<HomeConfigSection[]>([]);
    const [savedSections, setSavedSections] = useState<HomeConfigSection[]>([]);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const configQuery = useQuery({
        queryKey: ['admin-home-config'],
        queryFn: async () => (await adminGetHomeConfig()).data,
    });

    const allSections = useMemo(
        () => [...(configQuery.data?.sections || [])].sort((a, b) => a.order - b.order),
        [configQuery.data?.sections],
    );

    useEffect(() => {
        if (configQuery.data?.sections?.length) {
            const normalized = [...configQuery.data.sections]
                .sort((a, b) => a.order - b.order)
                .filter((section) => !HOME_UNIVERSITY_SECTION_IDS.has(section.id));
            setSections(normalized);
            setSavedSections(normalized);
        }
    }, [configQuery.data]);

    const saveMut = useMutation({
        mutationFn: async (updated: HomeConfigSection[]) => {
            const reorderedVisible = updated.map((section) => ({ ...section }));
            const merged = allSections.map((section) => ({ ...section }));
            const visiblePositions = merged.reduce<number[]>((acc, section, index) => {
                if (!HOME_UNIVERSITY_SECTION_IDS.has(section.id)) acc.push(index);
                return acc;
            }, []);

            visiblePositions.forEach((position, index) => {
                const replacement = reorderedVisible[index];
                if (!replacement) return;
                merged[position] = {
                    ...merged[position],
                    ...replacement,
                    id: replacement.id,
                    title: replacement.title,
                    isActive: replacement.isActive,
                };
            });

            const reordered = merged.map((section, index) => ({ ...section, order: index }));
            return (await adminUpdateHomeConfig({ sections: reordered })).data;
        },
        onSuccess: (_data, updated) => {
            toast.success('Section order saved');
            queryClient.invalidateQueries({ queryKey: ['admin-home-config'] });
            queryClient.invalidateQueries({ queryKey: ['home'] });
            setSavedSections(updated.map((section, index) => ({ ...section, order: index })));
        },
        onError: () => toast.error('Failed to save section order'),
    });

    const hasUnsavedChanges = useMemo(() => {
        const serialize = (items: HomeConfigSection[]) => JSON.stringify(
            items.map((item, index) => ({
                id: item.id,
                isActive: item.isActive,
                order: index,
            })),
        );
        return serialize(sections) !== serialize(savedSections);
    }, [savedSections, sections]);

    const move = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= sections.length) return;
        const next = [...sections];
        [next[idx], next[target]] = [next[target], next[idx]];
        setSections(next.map((s, i) => ({ ...s, order: i })));
    };

    const toggleActive = (idx: number) => {
        setSections(prev => prev.map((s, i) => i === idx ? { ...s, isActive: !s.isActive } : s));
    };

    if (configQuery.isLoading) {
        return (
            <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" /></div>
            </section>
        );
    }

    return (
        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-bold text-white">Home Section Order</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Drag or use arrows to reorder sections. Toggle to enable, hide, or restore them.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setSections(savedSections.map((section) => ({ ...section })))}
                        disabled={saveMut.isPending || !hasUnsavedChanges}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/70 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-40"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={() => saveMut.mutate(sections)}
                        disabled={saveMut.isPending || !hasUnsavedChanges}
                        className="bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                    </button>
                </div>
            </div>
            <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${hasUnsavedChanges
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                : 'border-emerald-500/15 bg-emerald-500/10 text-emerald-200'
                }`}>
                <span className="inline-flex items-center gap-2 font-medium">
                    {hasUnsavedChanges ? <AlertTriangle className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {hasUnsavedChanges
                        ? 'You have unsaved section visibility or order changes.'
                        : 'Public home order is in sync with the saved admin configuration.'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                    Save to update the live home layout
                </span>
            </div>
            <div className="space-y-1.5">
                {sections.map((section, idx) => (
                    <div
                        key={section.id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                            if (dragIdx === null || dragIdx === idx) return;
                            const next = [...sections];
                            const [moved] = next.splice(dragIdx, 1);
                            next.splice(idx, 0, moved);
                            setSections(next.map((s, i) => ({ ...s, order: i })));
                            setDragIdx(null);
                        }}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-grab active:cursor-grabbing transition-colors ${section.isActive
                            ? 'border-indigo-500/20 bg-slate-950/50'
                            : 'border-slate-700/30 bg-slate-950/20 opacity-50'
                            }`}
                    >
                        <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-[10px] text-slate-500 w-5">{idx + 1}</span>
                        <span className="text-sm text-white flex-1">{section.title}</span>
                        <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/20 text-indigo-300 disabled:opacity-30 hover:bg-indigo-500/10">▲</button>
                            <button type="button" onClick={() => move(idx, 1)} disabled={idx === sections.length - 1}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/20 text-indigo-300 disabled:opacity-30 hover:bg-indigo-500/10">▼</button>
                        </div>
                        <ModernToggle
                            checked={section.isActive}
                            onChange={() => toggleActive(idx)}
                            size="sm"
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function HomeSettingsPanel() {
    const queryClient = useQueryClient();
    const [draft, setDraftState] = useState<HomeSettingsConfig | null>(null);
    const [livePreview, setLivePreview] = useState(false);
    const [resettingSection, setResettingSection] = useState<string>('');
    const [categoryToAdd, setCategoryToAdd] = useState('');
    const [featuredUniversityToAdd, setFeaturedUniversityToAdd] = useState('');
    const [quickClusters, setQuickClusters] = useState<QuickClusterState[]>([]);
    const [savingQuickClusters, setSavingQuickClusters] = useState(false);

    const defaultsQuery = useQuery<HomeSettingsConfig>({
        queryKey: ['home-settings-defaults'],
        queryFn: async () => (await adminGetHomeSettingsDefaults()).data.defaults,
    });

    const normalizeSettings = (source: HomeSettingsConfig): HomeSettingsConfig => {
        const baseDefaults = defaultsQuery.data
            ? mergeDefined(cloneValue(FALLBACK_HOME_SETTINGS), defaultsQuery.data)
            : cloneValue(FALLBACK_HOME_SETTINGS);
        return mergeDefined(baseDefaults, source);
    };

    const settingsQuery = useQuery<HomeSettingsConfig>({
        queryKey: queryKeys.homeSettingsLegacy,
        queryFn: async () => (await adminGetHomeSettings()).data.homeSettings,
    });

    useEffect(() => {
        if (settingsQuery.data) {
            setDraftState((prev) => {
                if (!prev) return normalizeSettings(settingsQuery.data);
                return normalizeSettings(prev);
            });
        }
    }, [settingsQuery.data, defaultsQuery.data]);

    const categoryOptionsQuery = useQuery({
        queryKey: ['home-settings-category-options'],
        queryFn: async () => (await adminGetUniversityCategories({ status: 'all' })).data.categories || [],
    });

    const universitiesOptionsQuery = useQuery({
        queryKey: ['home-settings-university-options'],
        queryFn: async () => (await adminGetUniversities({ page: 1, limit: 1000, status: 'all', sortBy: 'name', sortOrder: 'asc' })).data.universities || [],
    });
    const homeConfigQuery = useQuery({
        queryKey: ['home-settings-featured-config'],
        queryFn: async () => (await adminGetHomeConfig()).data,
    });
    const clusterQuickQuery = useQuery({
        queryKey: ['home-settings-featured-clusters'],
        queryFn: async () => (await adminGetUniversityClusters({ status: 'active' })).data.clusters || [],
    });
    const homeDiagnosticsQuery = useQuery<HomeApiResponse>({
        queryKey: ['home-settings-diagnostics'],
        queryFn: async () => (await getHome()).data,
        staleTime: 15_000,
    });
    const subscriptionPlansQuery = useQuery({
        queryKey: ['home-settings-subscription-plans'],
        queryFn: async () => (await adminGetSubscriptionPlans()).data.items || [],
    });

    const previewQuery = useQuery<HomeApiResponse>({
        queryKey: ['home-preview'],
        queryFn: async () => (await getHome()).data,
        enabled: livePreview,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        const source = Array.isArray(clusterQuickQuery.data) ? clusterQuickQuery.data : [];
        setQuickClusters(
            source
                .map((item) => ({
                    _id: String(item._id || ''),
                    name: String(item.name || '').trim(),
                    homeVisible: Boolean(item.homeVisible),
                    homeOrder: Number(item.homeOrder || 0),
                    memberCount: Number(item.memberCount || 0),
                }))
                .filter((item) => item._id && item.name)
                .sort((a, b) => {
                    if (a.homeVisible !== b.homeVisible) return a.homeVisible ? -1 : 1;
                    if (a.homeOrder !== b.homeOrder) return a.homeOrder - b.homeOrder;
                    return a.name.localeCompare(b.name);
                }),
        );
    }, [clusterQuickQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (payload: HomeSettingsConfig) => (await adminUpdateHomeSettings(payload)).data,
        onSuccess: async () => {
            toast.success('Home settings saved');
            await invalidateQueryGroup(queryClient, invalidationGroups.homeSave);
            await invalidateQueryGroup(queryClient, invalidationGroups.plansSave);
            await queryClient.invalidateQueries({ queryKey: queryKeys.universities });
            if (livePreview) {
                await previewQuery.refetch();
            }
        },
        onError: () => toast.error('Failed to save Home settings'),
    });

    const resetSection = async (section: SectionKey) => {
        try {
            setResettingSection(section);
            const response = await adminResetHomeSettingsSection(section);
            toast.success(response.data.message || 'Section reset');
            await invalidateQueryGroup(queryClient, invalidationGroups.homeSave);
            await invalidateQueryGroup(queryClient, invalidationGroups.plansSave);
            await queryClient.invalidateQueries({ queryKey: queryKeys.universities });
            const fresh = await settingsQuery.refetch();
            if (fresh.data) setDraftState(normalizeSettings(fresh.data));
            if (livePreview) await previewQuery.refetch();
        } catch {
            toast.error('Failed to reset section');
        } finally {
            setResettingSection('');
        }
    };

    const updateDraft = (updater: (prev: HomeSettingsConfig) => HomeSettingsConfig) => {
        setDraftState((prev) => (prev ? updater(prev) : prev));
    };

    const categoryOptions = useMemo(() => {
        const fromApi = Array.isArray(categoryOptionsQuery.data) ? categoryOptionsQuery.data : [];
        const apiNames = fromApi.map((item) => String(item.name || '').trim()).filter(Boolean);
        const selected = (draft?.highlightedCategories || []).map((item) => String(item.category || '').trim()).filter(Boolean);
        return Array.from(new Set([...apiNames, ...selected])).sort((a, b) => a.localeCompare(b));
    }, [categoryOptionsQuery.data, draft?.highlightedCategories]);

    const universityOptions = useMemo(() => {
        const list = Array.isArray(universitiesOptionsQuery.data) ? universitiesOptionsQuery.data : [];
        return list
            .map((item: Record<string, unknown>) => ({
                id: String(item._id || ''),
                name: String(item.name || 'University'),
                shortForm: String(item.shortForm || 'N/A'),
            }))
            .filter((item) => Boolean(item.id));
    }, [universitiesOptionsQuery.data]);

    const universityLabelMap = useMemo(() => {
        return new Map(universityOptions.map((item) => [item.id, `${item.name} (${item.shortForm})`]));
    }, [universityOptions]);
    const subscriptionPlanOptions = useMemo(() => {
        const plans = Array.isArray(subscriptionPlansQuery.data) ? subscriptionPlansQuery.data : [];
        return plans
            .map((plan: AdminSubscriptionPlan) => ({
                id: String(plan._id || ''),
                label: `${plan.name} (${plan.type === 'free' ? 'Free' : `BDT ${Number(plan.priceBDT ?? plan.price ?? 0)}`})`,
            }))
            .filter((item) => Boolean(item.id));
    }, [subscriptionPlansQuery.data]);

    const featuredSectionEnabled = useMemo(() => {
        const sections = homeConfigQuery.data?.sections || [];
        const featured = sections.find((item) => String(item.id || '').toLowerCase() === 'featured');
        return featured?.isActive !== false;
    }, [homeConfigQuery.data?.sections]);

    const defaultCategory = useMemo(() => {
        return String(
            homeDiagnosticsQuery.data?.uniSettings?.defaultCategory
            || homeDiagnosticsQuery.data?.universityDashboardData?.filtersMeta?.defaultCategory
            || draft?.universityDashboard?.defaultCategory
            || '',
        ).trim();
    }, [homeDiagnosticsQuery.data?.uniSettings?.defaultCategory, homeDiagnosticsQuery.data?.universityDashboardData?.filtersMeta?.defaultCategory, draft?.universityDashboard?.defaultCategory]);

    const visibleHomeClusters = useMemo(
        () => quickClusters.filter((cluster) => cluster.homeVisible && cluster.memberCount > 0),
        [quickClusters],
    );

    const hiddenByDefaultCategoryClusters = useMemo(() => {
        if (!defaultCategory || defaultCategory.toLowerCase() === 'all') return [];
        const categories = homeDiagnosticsQuery.data?.universityCategories || [];
        const defaultCategoryMeta = categories.find(
            (item) => String(item.categoryName || '').trim().toLowerCase() === defaultCategory.toLowerCase(),
        );
        const allowedClusterSet = new Set((defaultCategoryMeta?.clusterGroups || []).map((name) => String(name || '').trim().toLowerCase()));
        if (allowedClusterSet.size === 0) return visibleHomeClusters.map((cluster) => cluster.name);
        return visibleHomeClusters
            .map((cluster) => cluster.name)
            .filter((name) => !allowedClusterSet.has(name.toLowerCase()));
    }, [defaultCategory, homeDiagnosticsQuery.data?.universityCategories, visibleHomeClusters]);

    const homeDiagnostics = useMemo(() => {
        const messages: string[] = [];
        if (!featuredSectionEnabled) {
            messages.push('Featured section is OFF in Home Section Order. Turn ON "Featured Universities" to show cards on Home.');
        }
        if (featuredSectionEnabled && visibleHomeClusters.length === 0) {
            messages.push('No Featured Cluster card can render now. Ensure at least one active cluster has Home Visible ON and has members.');
        }
        if (featuredSectionEnabled && hiddenByDefaultCategoryClusters.length > 0 && defaultCategory && defaultCategory.toLowerCase() !== 'all') {
            messages.push(`Default category "${defaultCategory}" currently hides ${hiddenByDefaultCategoryClusters.length} home-visible cluster(s): ${hiddenByDefaultCategoryClusters.join(', ')}`);
        }
        return messages;
    }, [defaultCategory, featuredSectionEnabled, hiddenByDefaultCategoryClusters, visibleHomeClusters.length]);

    const hasQuickClusterChanges = useMemo(() => {
        const source = Array.isArray(clusterQuickQuery.data) ? clusterQuickQuery.data : [];
        const sourceMap = new Map(source.map((item) => [String(item._id || ''), item]));
        return quickClusters.some((cluster) => {
            const original = sourceMap.get(cluster._id);
            if (!original) return false;
            return Boolean(original.homeVisible) !== cluster.homeVisible
                || Number(original.homeOrder || 0) !== Number(cluster.homeOrder || 0);
        });
    }, [clusterQuickQuery.data, quickClusters]);

    const updateQuickCluster = (clusterId: string, patch: Partial<QuickClusterState>) => {
        setQuickClusters((prev) => prev.map((cluster) => (
            cluster._id === clusterId
                ? {
                    ...cluster,
                    ...patch,
                    homeOrder: Number(patch.homeOrder ?? cluster.homeOrder ?? 0),
                }
                : cluster
        )));
    };

    const saveQuickClusters = async () => {
        if (!hasQuickClusterChanges) {
            toast.success('No cluster changes to save');
            return;
        }
        setSavingQuickClusters(true);
        try {
            const source = Array.isArray(clusterQuickQuery.data) ? clusterQuickQuery.data : [];
            const sourceMap = new Map(source.map((item) => [String(item._id || ''), item]));
            const updates = quickClusters.filter((cluster) => {
                const original = sourceMap.get(cluster._id);
                if (!original) return false;
                return Boolean(original.homeVisible) !== cluster.homeVisible
                    || Number(original.homeOrder || 0) !== Number(cluster.homeOrder || 0);
            });
            await Promise.all(
                updates.map((cluster) => adminUpdateUniversityCluster(cluster._id, {
                    homeVisible: cluster.homeVisible,
                    homeOrder: Number(cluster.homeOrder || 0),
                })),
            );
            await Promise.all([
                clusterQuickQuery.refetch(),
                homeDiagnosticsQuery.refetch(),
                previewQuery.refetch(),
                queryClient.invalidateQueries({ queryKey: ['home'] }),
            ]);
            toast.success('Featured cluster switches saved');
        } catch {
            toast.error('Failed to save featured cluster switches');
        } finally {
            setSavingQuickClusters(false);
        }
    };

    const addHighlightedCategory = () => {
        const next = categoryToAdd.trim();
        if (!next) return;
        updateDraft((prev) => {
            if (prev.highlightedCategories.some((item) => item.category === next)) return prev;
            return {
                ...prev,
                highlightedCategories: [
                    ...prev.highlightedCategories,
                    {
                        category: next,
                        order: prev.highlightedCategories.length + 1,
                        enabled: true,
                        badgeText: 'Highlight',
                    },
                ],
            };
        });
        setCategoryToAdd('');
    };

    const moveHighlightedCategory = (index: number, direction: -1 | 1) => {
        updateDraft((prev) => {
            const list = [...prev.highlightedCategories];
            const target = index + direction;
            if (target < 0 || target >= list.length) return prev;
            [list[index], list[target]] = [list[target], list[index]];
            return {
                ...prev,
                highlightedCategories: list.map((item, idx) => ({ ...item, order: idx + 1 })),
            };
        });
    };

    const removeHighlightedCategory = (category: string) => {
        updateDraft((prev) => {
            const list = prev.highlightedCategories.filter((item) => item.category !== category);
            return {
                ...prev,
                highlightedCategories: list.map((item, idx) => ({ ...item, order: idx + 1 })),
            };
        });
    };

    const addFeaturedUniversity = () => {
        const next = featuredUniversityToAdd.trim();
        if (!next) return;
        updateDraft((prev) => {
            if (prev.featuredUniversities.some((item) => item.universityId === next)) return prev;
            return {
                ...prev,
                featuredUniversities: [
                    ...prev.featuredUniversities,
                    {
                        universityId: next,
                        order: prev.featuredUniversities.length + 1,
                        enabled: true,
                        badgeText: 'Featured',
                    },
                ],
            };
        });
        setFeaturedUniversityToAdd('');
    };

    const moveFeaturedUniversity = (index: number, direction: -1 | 1) => {
        updateDraft((prev) => {
            const list = [...prev.featuredUniversities];
            const target = index + direction;
            if (target < 0 || target >= list.length) return prev;
            [list[index], list[target]] = [list[target], list[index]];
            return {
                ...prev,
                featuredUniversities: list.map((item, idx) => ({ ...item, order: idx + 1 })),
            };
        });
    };

    const removeFeaturedUniversity = (universityId: string) => {
        updateDraft((prev) => {
            const list = prev.featuredUniversities.filter((item) => item.universityId !== universityId);
            return {
                ...prev,
                featuredUniversities: list.map((item, idx) => ({ ...item, order: idx + 1 })),
            };
        });
    };

    if (settingsQuery.isError || defaultsQuery.isError) {
        const errorMessage =
            (settingsQuery.error as { response?: { data?: { message?: string } } })?.response?.data?.message
            || (settingsQuery.error as Error)?.message
            || (defaultsQuery.error as Error)?.message
            || 'Failed to load Home Settings';
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 p-5">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-white">Failed to Load Home Settings</h2>
                            <p className="text-xs text-slate-400 mt-0.5">{errorMessage}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                settingsQuery.refetch();
                                defaultsQuery.refetch();
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (settingsQuery.isLoading || !draft) {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-indigo-500/15 bg-slate-900/60 p-5">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="h-5 w-5 animate-spin text-indigo-300" />
                        <div>
                            <h2 className="text-lg font-bold text-white">Loading Home Settings</h2>
                            <p className="text-xs text-slate-400">
                                Controls are loading. Please wait while live data syncs.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),340px] gap-6 pb-10">
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-white">Home Settings</h2>
                        <p className="text-xs text-slate-500">All Home sections are editable and toggleable from here.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setLivePreview((prev) => !prev)}
                            className={`text-sm px-3 py-2 rounded-xl border ${livePreview ? 'border-cyan-500/40 text-cyan-200 bg-cyan-500/10' : 'border-indigo-500/20 text-slate-300'}`}
                        >
                            <span className="inline-flex items-center gap-2"><Eye className="w-4 h-4" />Live Preview</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => saveMutation.mutate(draft)}
                            disabled={saveMutation.isPending}
                            className="bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-sm px-4 py-2 rounded-xl inline-flex items-center gap-2 disabled:opacity-60"
                        >
                            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                </div>

                <SectionReorderPanel />

                <section className="bg-slate-900/60 rounded-2xl border border-cyan-500/15 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-bold text-white">University Controls Moved</h3>
                            <p className="mt-1 text-xs text-slate-400">
                                Home featured universities, category highlights, cluster feed switches, university section visibility, and card defaults are now managed from University Settings.
                            </p>
                        </div>
                        <Link
                            to={UNIVERSITY_SETTINGS_ROUTE}
                            className="rounded-xl border border-cyan-500/30 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/10"
                        >
                            Open University Settings
                        </Link>
                    </div>
                </section>

                {SHOW_LEGACY_UNIVERSITY_HOME_CONTROLS ? (
                    <>
                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-white">Featured Clusters Quick Switch</h3>
                                    <p className="text-xs text-slate-400 mt-1">Single Featured section toggle stays in Home Section Order. Use this list to quickly show/hide clusters on Home and set order.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void saveQuickClusters()}
                                    disabled={savingQuickClusters || !hasQuickClusterChanges}
                                    className="rounded-xl border border-cyan-500/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                                >
                                    {savingQuickClusters ? <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Saving...</span> : 'Save Cluster Switches'}
                                </button>
                            </div>

                            {homeDiagnostics.length > 0 && (
                                <div className="mt-4 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                                    {homeDiagnostics.map((message, index) => (
                                        <div key={`${message}-${index}`} className="flex items-start gap-2 text-xs text-amber-100">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                            <span>{message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 space-y-2">
                                {clusterQuickQuery.isLoading && (
                                    <div className="flex justify-center py-5">
                                        <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                                    </div>
                                )}
                                {!clusterQuickQuery.isLoading && quickClusters.length === 0 && (
                                    <p className="text-xs text-slate-500">No active clusters found.</p>
                                )}
                                {quickClusters.map((cluster) => (
                                    <div key={cluster._id} className="rounded-xl border border-indigo-500/15 bg-slate-950/55 p-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium text-white">{cluster.name}</p>
                                            <span className="rounded-full border border-indigo-500/25 px-2 py-0.5 text-[10px] text-indigo-200">
                                                {cluster.memberCount} members
                                            </span>
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cluster.homeVisible ? 'border-emerald-500/30 text-emerald-200' : 'border-slate-600 text-slate-400'}`}>
                                                {cluster.homeVisible ? 'Visible on Home' : 'Hidden on Home'}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-[auto,140px] gap-3">
                                            <Toggle
                                                label="Home Visible"
                                                value={cluster.homeVisible}
                                                onChange={(value) => updateQuickCluster(cluster._id, { homeVisible: value })}
                                            />
                                            <NumberInput
                                                label="Home Order"
                                                value={cluster.homeOrder}
                                                onChange={(value) => updateQuickCluster(cluster._id, { homeOrder: value })}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Section Visibility" section="sectionVisibility" onReset={resetSection} resetting={resettingSection === 'sectionVisibility'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {visibilityToggles.map((item) => (
                                    <Toggle
                                        key={item.key}
                                        label={item.label}
                                        value={draft.sectionVisibility[item.key]}
                                        onChange={(value) => updateDraft((prev) => ({ ...prev, sectionVisibility: { ...prev.sectionVisibility, [item.key]: value } }))}
                                    />
                                ))}
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Hero" section="hero" onReset={resetSection} resetting={resettingSection === 'hero'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Pill Text" value={draft.hero.pillText} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, pillText: value } }))} />
                                <AdminImageUploadField
                                    label="Hero Image"
                                    value={draft.hero.heroImageUrl}
                                    onChange={(nextValue) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, heroImageUrl: nextValue } }))}
                                    helper="Primary visual shown in the home hero section."
                                    category="admin_upload"
                                    previewAlt="Home hero image"
                                    previewClassName="min-h-[190px]"
                                    panelClassName="bg-slate-950/30 dark:bg-slate-950/55"
                                />
                            </div>
                            <div className="mt-3 space-y-3">
                                <Input label="Title" value={draft.hero.title} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, title: value } }))} />
                                <Input label="Subtitle" value={draft.hero.subtitle} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, subtitle: value } }))} />
                                <Input label="Search Placeholder" value={draft.hero.searchPlaceholder} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, searchPlaceholder: value } }))} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Input label="Primary CTA Label" value={draft.hero.primaryCTA.label} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, primaryCTA: { ...prev.hero.primaryCTA, label: value } } }))} />
                                    <Input label="Primary CTA URL" value={draft.hero.primaryCTA.url} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, primaryCTA: { ...prev.hero.primaryCTA, url: value } } }))} />
                                    <Input label="Secondary CTA Label" value={draft.hero.secondaryCTA.label} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, secondaryCTA: { ...prev.hero.secondaryCTA, label: value } } }))} />
                                    <Input label="Secondary CTA URL" value={draft.hero.secondaryCTA.url} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, secondaryCTA: { ...prev.hero.secondaryCTA, url: value } } }))} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Toggle label="Show Search Box" value={draft.hero.showSearch} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, showSearch: value } }))} />
                                    <Toggle label="Show Next Deadline Card" value={draft.hero.showNextDeadlineCard} onChange={(value) => updateDraft((prev) => ({ ...prev, hero: { ...prev.hero, showNextDeadlineCard: value } }))} />
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Subscription Banner" section="subscriptionBanner" onReset={resetSection} resetting={resettingSection === 'subscriptionBanner'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Title" value={draft.subscriptionBanner.title} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, title: value } }))} />
                                <Input label="Subtitle" value={draft.subscriptionBanner.subtitle} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, subtitle: value } }))} />
                                <Input label="Login Message" value={draft.subscriptionBanner.loginMessage} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, loginMessage: value } }))} />
                                <Input label="No Plan Message" value={draft.subscriptionBanner.noPlanMessage} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, noPlanMessage: value } }))} />
                                <Input label="Primary CTA Label" value={draft.subscriptionBanner.primaryCTA.label} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, primaryCTA: { ...prev.subscriptionBanner.primaryCTA, label: value } } }))} />
                                <Input label="Primary CTA URL" value={draft.subscriptionBanner.primaryCTA.url} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, primaryCTA: { ...prev.subscriptionBanner.primaryCTA, url: value } } }))} />
                            </div>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                <Toggle label="Banner Enabled" value={draft.subscriptionBanner.enabled} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, enabled: value } }))} />
                                <Toggle label="Show Plan Cards" value={draft.subscriptionBanner.showPlanCards} onChange={(value) => updateDraft((prev) => ({ ...prev, subscriptionBanner: { ...prev.subscriptionBanner, showPlanCards: value } }))} />
                            </div>
                            <div className="mt-3">
                                <p className="text-xs text-slate-400 mb-2">Plans to show on Home banner (recommended 2-3)</p>
                                {subscriptionPlanOptions.length === 0 ? (
                                    <p className="text-xs text-slate-500">No subscription plans found yet. Create plans first.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {subscriptionPlanOptions.map((plan) => {
                                            const checked = draft.subscriptionBanner.planIdsToShow.includes(plan.id);
                                            return (
                                                <label key={plan.id} className="rounded-xl border border-indigo-500/15 bg-slate-950/55 px-3 py-2 text-xs text-slate-200 inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(event) => updateDraft((prev) => {
                                                            const current = prev.subscriptionBanner.planIdsToShow || [];
                                                            const next = event.target.checked
                                                                ? Array.from(new Set([...current, plan.id]))
                                                                : current.filter((id) => id !== plan.id);
                                                            return {
                                                                ...prev,
                                                                subscriptionBanner: {
                                                                    ...prev.subscriptionBanner,
                                                                    planIdsToShow: next,
                                                                },
                                                            };
                                                        })}
                                                    />
                                                    <span>{plan.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Timeline + Widgets" section="timeline" onReset={resetSection} resetting={resettingSection === 'timeline'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <NumberInput label="Closing Soon Days" value={draft.timeline.closingSoonDays} onChange={(value) => updateDraft((prev) => ({ ...prev, timeline: { ...prev.timeline, closingSoonDays: value } }))} />
                                <NumberInput label="Exam Soon Days" value={draft.timeline.examSoonDays} onChange={(value) => updateDraft((prev) => ({ ...prev, timeline: { ...prev.timeline, examSoonDays: value } }))} />
                                <NumberInput label="Timeline Max Closing" value={draft.timeline.maxClosingItems} onChange={(value) => updateDraft((prev) => ({ ...prev, timeline: { ...prev.timeline, maxClosingItems: value } }))} />
                                <NumberInput label="Timeline Max Exams" value={draft.timeline.maxExamItems} onChange={(value) => updateDraft((prev) => ({ ...prev, timeline: { ...prev.timeline, maxExamItems: value } }))} />
                                <NumberInput label="Widget Max Closing" value={draft.closingExamWidget.maxClosing} onChange={(value) => updateDraft((prev) => ({ ...prev, closingExamWidget: { ...prev.closingExamWidget, maxClosing: value } }))} />
                                <NumberInput label="Widget Max Exams/Week" value={draft.closingExamWidget.maxExamsThisWeek} onChange={(value) => updateDraft((prev) => ({ ...prev, closingExamWidget: { ...prev.closingExamWidget, maxExamsThisWeek: value } }))} />
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="University Preview Windows" section="universityPreview" onReset={resetSection} resetting={resettingSection === 'universityPreview'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Toggle label="University Preview Enabled" value={draft.universityPreview.enabled} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, enabled: value } }))} />
                                <NumberInput label="Featured Max Items" value={draft.universityPreview.maxFeaturedItems} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, maxFeaturedItems: value } }))} />
                                <NumberInput label="Deadline Max Items" value={draft.universityPreview.maxDeadlineItems} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, maxDeadlineItems: value } }))} />
                                <NumberInput label="Exam Max Items" value={draft.universityPreview.maxExamItems} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, maxExamItems: value } }))} />
                                <NumberInput label="Deadline Within Days" value={draft.universityPreview.deadlineWithinDays} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, deadlineWithinDays: value } }))} />
                                <NumberInput label="Exam Within Days" value={draft.universityPreview.examWithinDays} onChange={(value) => updateDraft((prev) => ({ ...prev, universityPreview: { ...prev.universityPreview, examWithinDays: value } }))} />
                            </div>
                            <div className="mt-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 text-xs leading-6 text-indigo-200/80">
                                Default category and cluster-filter visibility are now managed from <strong>University Settings</strong> to avoid duplicate controls.
                                This section only controls home preview windows and item limits.
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Featured Mode</label>
                                    <select
                                        value={draft.universityPreview.featuredMode}
                                        onChange={(event) => updateDraft((prev) => ({
                                            ...prev,
                                            universityPreview: {
                                                ...prev.universityPreview,
                                                featuredMode: event.target.value as HomeSettingsConfig['universityPreview']['featuredMode'],
                                            },
                                        }))}
                                        className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                                    >
                                        <option value="manual">Manual</option>
                                        <option value="auto">Auto</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="University Dashboard" section="universityDashboard" onReset={resetSection} resetting={resettingSection === 'universityDashboard'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Toggle
                                    label="Show Dashboard Filters"
                                    value={draft.universityDashboard.showFilters}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, showFilters: value } }))}

                                />
                                <Toggle
                                    label="Show Placeholder Note"
                                    value={draft.universityDashboard.showPlaceholderText}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, showPlaceholderText: value } }))}

                                />
                                <Toggle
                                    label="Enable All Universities Tab"
                                    value={Boolean(draft.universityDashboard.showAllCategories)}
                                    helper="Default is OFF. When OFF, public universities page requires a selected category."
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, showAllCategories: value } }))}

                                />
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Dashboard Title" value={draft.universityDashboard.title} onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, title: value } }))} />
                                <Input label="Dashboard Subtitle" value={draft.universityDashboard.subtitle} onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, subtitle: value } }))} />
                                <Input label="Default Category" value={draft.universityDashboard.defaultCategory} onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, defaultCategory: value } }))} />
                                <Input label="Placeholder Note" value={draft.universityDashboard.placeholderNote} onChange={(value) => updateDraft((prev) => ({ ...prev, universityDashboard: { ...prev.universityDashboard, placeholderNote: value } }))} />
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Highlighted Categories" section="highlightedCategories" onReset={resetSection} resetting={resettingSection === 'highlightedCategories'} />
                            <p className="mb-3 text-xs text-slate-400">Select ordered categories for Home highlights. These appear as highlighted filter chips.</p>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                                <select
                                    value={categoryToAdd}
                                    onChange={(event) => setCategoryToAdd(event.target.value)}
                                    className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                                >
                                    <option value="">Select category to add</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={addHighlightedCategory}
                                    disabled={!categoryToAdd.trim()}
                                    className="rounded-xl border border-cyan-500/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                            {draft.highlightedCategories.length === 0 ? (
                                <p className="mt-3 text-xs text-slate-500">No highlighted categories selected.</p>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    {draft.highlightedCategories
                                        .sort((a, b) => a.order - b.order)
                                        .map((item, index) => (
                                            <div key={item.category} className="rounded-xl border border-indigo-500/15 bg-slate-950/55 p-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-200">#{index + 1}</span>
                                                    <p className="text-sm font-medium text-white">{item.category}</p>
                                                    <div className="ml-auto flex items-center gap-2">
                                                        <button type="button" onClick={() => moveHighlightedCategory(index, -1)} disabled={index === 0} className="rounded-lg border border-indigo-500/25 px-2 py-1 text-xs text-indigo-200 disabled:opacity-40">Up</button>
                                                        <button type="button" onClick={() => moveHighlightedCategory(index, 1)} disabled={index === draft.highlightedCategories.length - 1} className="rounded-lg border border-indigo-500/25 px-2 py-1 text-xs text-indigo-200 disabled:opacity-40">Down</button>
                                                        <button type="button" onClick={() => removeHighlightedCategory(item.category)} className="rounded-lg border border-rose-500/25 px-2 py-1 text-xs text-rose-200">Remove</button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    <Input
                                                        label="Badge Text"
                                                        value={item.badgeText || ''}
                                                        onChange={(value) => updateDraft((prev) => ({
                                                            ...prev,
                                                            highlightedCategories: prev.highlightedCategories.map((entry) => entry.category === item.category ? { ...entry, badgeText: value } : entry),
                                                        }))}
                                                    />
                                                    <Toggle
                                                        label="Enabled"
                                                        value={item.enabled !== false}
                                                        onChange={(value) => updateDraft((prev) => ({
                                                            ...prev,
                                                            highlightedCategories: prev.highlightedCategories.map((entry) => entry.category === item.category ? { ...entry, enabled: value } : entry),
                                                        }))}

                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Featured Universities" section="featuredUniversities" onReset={resetSection} resetting={resettingSection === 'featuredUniversities'} />
                            <p className="mb-3 text-xs text-slate-400">Select ordered universities for Home featured block. Changes are reflected on Home after save.</p>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                                <select
                                    value={featuredUniversityToAdd}
                                    onChange={(event) => setFeaturedUniversityToAdd(event.target.value)}
                                    className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                                >
                                    <option value="">Select university to add</option>
                                    {universityOptions.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.shortForm})</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={addFeaturedUniversity}
                                    disabled={!featuredUniversityToAdd.trim()}
                                    className="rounded-xl border border-cyan-500/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                            {draft.featuredUniversities.length === 0 ? (
                                <p className="mt-3 text-xs text-slate-500">No featured universities selected.</p>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    {draft.featuredUniversities
                                        .sort((a, b) => a.order - b.order)
                                        .map((item, index) => (
                                            <div key={item.universityId} className="rounded-xl border border-indigo-500/15 bg-slate-950/55 p-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-200">#{index + 1}</span>
                                                    <p className="text-sm font-medium text-white">{universityLabelMap.get(item.universityId) || item.universityId}</p>
                                                    <div className="ml-auto flex items-center gap-2">
                                                        <button type="button" onClick={() => moveFeaturedUniversity(index, -1)} disabled={index === 0} className="rounded-lg border border-indigo-500/25 px-2 py-1 text-xs text-indigo-200 disabled:opacity-40">Up</button>
                                                        <button type="button" onClick={() => moveFeaturedUniversity(index, 1)} disabled={index === draft.featuredUniversities.length - 1} className="rounded-lg border border-indigo-500/25 px-2 py-1 text-xs text-indigo-200 disabled:opacity-40">Down</button>
                                                        <button type="button" onClick={() => removeFeaturedUniversity(item.universityId)} className="rounded-lg border border-rose-500/25 px-2 py-1 text-xs text-rose-200">Remove</button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    <Input
                                                        label="Badge Text"
                                                        value={item.badgeText || ''}
                                                        onChange={(value) => updateDraft((prev) => ({
                                                            ...prev,
                                                            featuredUniversities: prev.featuredUniversities.map((entry) => entry.universityId === item.universityId ? { ...entry, badgeText: value } : entry),
                                                        }))}
                                                    />
                                                    <Toggle
                                                        label="Enabled"
                                                        value={item.enabled !== false}
                                                        onChange={(value) => updateDraft((prev) => ({
                                                            ...prev,
                                                            featuredUniversities: prev.featuredUniversities.map((entry) => entry.universityId === item.universityId ? { ...entry, enabled: value } : entry),
                                                        }))}

                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="Scrollable Ads" section="adsSection" onReset={resetSection} resetting={resettingSection === 'adsSection'} />
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Toggle
                                        label="Ads Section Enabled"
                                        value={draft.adsSection.enabled}
                                        onChange={(value) => updateDraft((prev) => ({ ...prev, adsSection: { ...prev.adsSection, enabled: value } }))}
                                        helper="Toggle the scrollable ad section on Home page."

                                    />
                                    <Input
                                        label="Section Title (Optional)"
                                        value={draft.adsSection.title}
                                        onChange={(value) => updateDraft((prev) => ({ ...prev, adsSection: { ...prev.adsSection, title: value } }))}
                                        helper="Headline displayed above ads."
                                    />
                                </div>
                                <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/10 p-4">
                                    <p className="text-xs text-indigo-200/70 leading-relaxed mb-3">
                                        This section displays banners from the <strong>Home Ads (Scrollable)</strong> slot.
                                        You can manage these banners in the Banner Management panel.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const bannerTab = document.querySelector('[data-tab-id="banners"]') as HTMLElement;
                                            if (bannerTab) bannerTab.click();
                                        }}
                                        className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                        Go to Banner Management
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                            <SectionHeader title="University Card Config" section="universityCardConfig" onReset={resetSection} resetting={resettingSection === 'universityCardConfig'} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <AdminImageUploadField
                                    label="Default University Logo"
                                    value={draft.universityCardConfig.defaultUniversityLogo}
                                    onChange={(nextValue) => updateDraft((prev) => ({
                                        ...prev,
                                        universityCardConfig: {
                                            ...prev.universityCardConfig,
                                            defaultUniversityLogo: nextValue,
                                        },
                                    }))}
                                    helper="Shown when a university does not have its own uploaded logo."
                                    category="admin_upload"
                                    previewAlt="Fallback university logo"
                                    fit="contain"
                                    previewClassName="min-h-[170px]"
                                    panelClassName="bg-slate-950/30 dark:bg-slate-950/55"
                                />
                                <NumberInput
                                    label="Closing Soon Days Threshold"
                                    value={draft.universityCardConfig.closingSoonDays}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, closingSoonDays: value } }))}
                                />
                                <Toggle
                                    label="Show Exam Centers Preview"
                                    value={draft.universityCardConfig.showExamCentersPreview}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, showExamCentersPreview: value } }))}

                                />
                                <Toggle
                                    label="Show Address"
                                    value={draft.universityCardConfig.showAddress}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, showAddress: value } }))}

                                />
                                <Toggle
                                    label="Show Email"
                                    value={draft.universityCardConfig.showEmail}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, showEmail: value } }))}

                                />
                                <Toggle
                                    label="Show Application Progress"
                                    value={draft.universityCardConfig.showApplicationProgress}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, showApplicationProgress: value } }))}

                                />
                                <Toggle
                                    label="Show Exam Dates"
                                    value={draft.universityCardConfig.showExamDates}
                                    onChange={(value) => updateDraft((prev) => ({ ...prev, universityCardConfig: { ...prev.universityCardConfig, showExamDates: value } }))}

                                />
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400">Default Sort</label>
                                    <select
                                        value={draft.universityCardConfig.defaultSort}
                                        onChange={(event) => updateDraft((prev) => ({
                                            ...prev,
                                            universityCardConfig: {
                                                ...prev.universityCardConfig,
                                                defaultSort: event.target.value as HomeSettingsConfig['universityCardConfig']['defaultSort'],
                                            },
                                        }))}
                                        className="mt-1 w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                                    >
                                        <option value="alphabetical">Name (A-Z)</option>
                                        <option value="nearest_deadline">Nearest Deadline</option>
                                    </select>
                                </div>
                            </div>
                        </section>
                    </>
                ) : null}

                <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                    <SectionHeader title="Exams + News + Resources" section="examsWidget" onReset={resetSection} resetting={resettingSection === 'examsWidget'} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <NumberInput label="Max Live Exams" value={draft.examsWidget.maxLive} onChange={(value) => updateDraft((prev) => ({ ...prev, examsWidget: { ...prev.examsWidget, maxLive: value } }))} />
                        <NumberInput label="Max Upcoming Exams" value={draft.examsWidget.maxUpcoming} onChange={(value) => updateDraft((prev) => ({ ...prev, examsWidget: { ...prev.examsWidget, maxUpcoming: value } }))} />
                        <NumberInput label="News Max Items" value={draft.newsPreview.maxItems} onChange={(value) => updateDraft((prev) => ({ ...prev, newsPreview: { ...prev.newsPreview, maxItems: value } }))} />
                        <NumberInput label="Resources Max Items" value={draft.resourcesPreview.maxItems} onChange={(value) => updateDraft((prev) => ({ ...prev, resourcesPreview: { ...prev.resourcesPreview, maxItems: value } }))} />
                        <Input label="News CTA Label" value={draft.newsPreview.ctaLabel} onChange={(value) => updateDraft((prev) => ({ ...prev, newsPreview: { ...prev.newsPreview, ctaLabel: value } }))} />
                        <Input label="Resources CTA Label" value={draft.resourcesPreview.ctaLabel} onChange={(value) => updateDraft((prev) => ({ ...prev, resourcesPreview: { ...prev.resourcesPreview, ctaLabel: value } }))} />
                    </div>
                    <div className="mt-3">
                        <label className="text-xs text-slate-400">Locked Exam Visibility for Unsubscribed Users</label>
                        <select
                            value={draft.examsWidget.showLockedExamsToUnsubscribed}
                            onChange={(event) => updateDraft((prev) => ({
                                ...prev,
                                examsWidget: {
                                    ...prev.examsWidget,
                                    showLockedExamsToUnsubscribed: event.target.value as HomeSettingsConfig['examsWidget']['showLockedExamsToUnsubscribed'],
                                },
                            }))}
                            className="mt-1 w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                        >
                            <option value="show_locked">Show Locked Items</option>
                            <option value="hide">Hide Locked Items</option>
                        </select>
                    </div>
                </section>

                <section className="bg-slate-900/60 rounded-2xl border border-indigo-500/10 p-5">
                    <SectionHeader title="Footer + UI" section="footer" onReset={resetSection} resetting={resettingSection === 'footer'} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Footer About Text" value={draft.footer.aboutText} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, aboutText: value } }))} />
                        <Input label="Footer Contact Email" value={draft.footer.contactInfo.email} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, contactInfo: { ...prev.footer.contactInfo, email: value } } }))} />
                        <Input label="Footer Contact Phone" value={draft.footer.contactInfo.phone} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, contactInfo: { ...prev.footer.contactInfo, phone: value } } }))} />
                        <Input label="Footer Address" value={draft.footer.contactInfo.address} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, contactInfo: { ...prev.footer.contactInfo, address: value } } }))} />
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/40 rounded-2xl border border-indigo-500/10">
                        <LinkListEditor
                            label="Quick Links"
                            links={draft.footer.quickLinks}
                            onChange={(links) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, quickLinks: links } }))}
                        />
                        <LinkListEditor
                            label="Legal Links"
                            links={draft.footer.legalLinks}
                            onChange={(links) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, legalLinks: links } }))}
                        />
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Toggle label="Footer Enabled (Global)" value={draft.footer.enabled} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, enabled: value } }))} />
                        <Toggle label="Show Founder Button" value={draft.footer.showFounderButton} onChange={(value) => updateDraft((prev) => ({ ...prev, footer: { ...prev.footer, showFounderButton: value } }))} helper="Show or hide the Founder button in the footer" />
                        <Toggle label="Social Strip Enabled" value={draft.socialStrip.enabled} onChange={(value) => updateDraft((prev) => ({ ...prev, socialStrip: { ...prev.socialStrip, enabled: value } }))} />
                    </div>
                    <div className="mt-3">
                        <label className="text-xs text-slate-400">Animation Level</label>
                        <select
                            value={draft.ui.animationLevel}
                            onChange={(event) => updateDraft((prev) => ({
                                ...prev,
                                ui: { ...prev.ui, animationLevel: event.target.value as HomeSettingsConfig['ui']['animationLevel'] },
                            }))}
                            className="mt-1 w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2 text-sm text-white"
                        >
                            <option value="off">Off</option>
                            <option value="minimal">Minimal</option>
                            <option value="normal">Normal</option>
                        </select>
                    </div>
                </section>
            </div>

            {livePreview && (
                <aside className="bg-slate-900/60 rounded-2xl border border-cyan-500/20 p-4 h-fit sticky top-20">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-bold text-cyan-200">Live Preview Snapshot</h3>
                        <button
                            type="button"
                            onClick={() => previewQuery.refetch()}
                            className="text-xs rounded-lg border border-cyan-500/40 px-2.5 py-1 text-cyan-200 hover:bg-cyan-500/10"
                        >
                            Refresh
                        </button>
                    </div>
                    {previewQuery.isFetching ? (
                        <div className="text-xs text-slate-400 inline-flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Fetching /api/home</div>
                    ) : (
                        <div className="space-y-2 text-xs text-slate-300">
                            <p>Hero: {previewQuery.data?.homeSettings.hero.title || 'N/A'}</p>
                            <p>Resources Count: {previewQuery.data?.resourcesPreview?.length || 0}</p>
                            <p>News Count: {previewQuery.data?.newsPreview?.length || 0}</p>
                            <p>Timeline Closing: {previewQuery.data?.timeline.closingSoonItems?.length || 0}</p>
                            <p>Live Exams: {previewQuery.data?.examsWidget.liveNow?.length || 0}</p>
                            <p>Footer Enabled: {String(previewQuery.data?.homeSettings.footer.enabled)}</p>
                        </div>
                    )}
                </aside>
            )}
        </div>
    );
}
