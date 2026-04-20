import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Loader2, Palette, Save, Sparkles } from 'lucide-react';
import { adminUpdatePageHeroSettings, getPublicSettings, type PageHeroConfig, type PageHeroKey, type PageHeroVantaEffect } from '../../services/api';
import { DEFAULT_HERO_CONFIGS } from '../../hooks/usePageHeroSettings';

export const PAGE_KEYS: Array<{ key: PageHeroKey; label: string; icon: string }> = [
    { key: 'home', label: 'Home Page', icon: '🏠' },
    { key: 'universities', label: 'Universities', icon: '🎓' },
    { key: 'news', label: 'News', icon: '📰' },
    { key: 'exams', label: 'Exams', icon: '📝' },
    { key: 'resources', label: 'Resources', icon: '📚' },
    { key: 'subscriptionPlans', label: 'Subscription Plans', icon: '💰' },
    { key: 'contact', label: 'Contact', icon: '📞' },
    { key: 'about', label: 'About', icon: 'ℹ️' },
    { key: 'helpCenter', label: 'Help Center', icon: '🆘' },
    { key: 'privacy', label: 'Privacy', icon: '🔒' },
    { key: 'terms', label: 'Terms', icon: '📄' },
];

const VANTA_EFFECTS: Array<{ value: PageHeroVantaEffect; label: string }> = [
    { value: 'none', label: 'None (Gradient Only)' },
    { value: 'birds', label: 'Birds' },
    { value: 'net', label: 'Net' },
    { value: 'globe', label: 'Globe' },
    { value: 'waves', label: 'Waves' },
    { value: 'fog', label: 'Fog' },
    { value: 'clouds', label: 'Clouds' },
    { value: 'cells', label: 'Cells' },
    { value: 'trunk', label: 'Trunk' },
    { value: 'halo', label: 'Halo' },
    { value: 'dots', label: 'Dots' },
    { value: 'rings', label: 'Rings' },
    { value: 'topology', label: 'Topology' },
];

type Draft = Record<PageHeroKey, PageHeroConfig>;

function buildInitialDraft(serverData?: Record<string, Partial<PageHeroConfig>>): Draft {
    const draft = {} as Draft;
    for (const { key } of PAGE_KEYS) {
        const defaults = DEFAULT_HERO_CONFIGS[key];
        const server = serverData?.[key];
        draft[key] = {
            enabled: server?.enabled ?? defaults.enabled,
            title: server?.title || defaults.title,
            subtitle: server?.subtitle || defaults.subtitle,
            pillText: server?.pillText || defaults.pillText,
            vantaEffect: (server?.vantaEffect || defaults.vantaEffect) as PageHeroVantaEffect,
            vantaColor: server?.vantaColor || defaults.vantaColor,
            vantaBackgroundColor: server?.vantaBackgroundColor || defaults.vantaBackgroundColor,
            gradientFrom: server?.gradientFrom || defaults.gradientFrom,
            gradientTo: server?.gradientTo || defaults.gradientTo,
            showSearch: server?.showSearch ?? defaults.showSearch,
            searchPlaceholder: server?.searchPlaceholder || defaults.searchPlaceholder,
            primaryCTA: {
                label: server?.primaryCTA?.label ?? defaults.primaryCTA.label,
                url: server?.primaryCTA?.url ?? defaults.primaryCTA.url,
            },
            secondaryCTA: {
                label: server?.secondaryCTA?.label ?? defaults.secondaryCTA.label,
                url: server?.secondaryCTA?.url ?? defaults.secondaryCTA.url,
            },
        };
    }
    return draft;
}

function HeroField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label}</label>
            {children}
        </div>
    );
}

const inputClass = 'w-full rounded-xl bg-slate-950/50 border border-slate-700/40 px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all';
const selectClass = inputClass;

export default function PageHeroSettingsEditor() {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [expandedPage, setExpandedPage] = useState<PageHeroKey | null>(null);

    const settingsQuery = useQuery({
        queryKey: ['public-settings-hero-editor'],
        queryFn: async () => (await getPublicSettings()).data,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!settingsQuery.data) return;
        const serverHero = (settingsQuery.data as any)?.pageHeroSettings || {};
        setDraft(buildInitialDraft(serverHero));
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (data: Draft) => adminUpdatePageHeroSettings(data),
        onSuccess: async () => {
            toast.success('Page hero settings saved');
            await queryClient.invalidateQueries({ queryKey: ['public-settings'] });
            await queryClient.invalidateQueries({ queryKey: ['public-settings-hero-editor'] });
        },
        onError: () => toast.error('Failed to save hero settings'),
    });

    const updateField = (pageKey: PageHeroKey, field: keyof PageHeroConfig, value: unknown) => {
        setDraft((prev) => {
            if (!prev) return prev;
            return { ...prev, [pageKey]: { ...prev[pageKey], [field]: value } };
        });
    };

    const updateCTA = (pageKey: PageHeroKey, ctaKey: 'primaryCTA' | 'secondaryCTA', field: 'label' | 'url', value: string) => {
        setDraft((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                [pageKey]: {
                    ...prev[pageKey],
                    [ctaKey]: { ...prev[pageKey][ctaKey], [field]: value },
                },
            };
        });
    };

    if (settingsQuery.isLoading || !draft) {
        return (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6">
                <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-300" />
                    <p className="text-sm text-slate-400">Loading hero settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700/30 ring-1 ring-white/[0.03] p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        Page Hero Banners
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                        Configure animated Vanta.js hero banners for each public page. Changes apply after save.
                    </p>
                </div>
                <button
                    onClick={() => draft && saveMutation.mutate(draft)}
                    disabled={saveMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all"
                >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All
                </button>
            </div>

            <div className="space-y-2">
                {PAGE_KEYS.map(({ key, label, icon }) => {
                    const config = draft[key];
                    const isExpanded = expandedPage === key;

                    return (
                        <div key={key} className="rounded-xl border border-slate-700/30 bg-slate-950/30 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setExpandedPage(isExpanded ? null : key)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">{icon}</span>
                                    <div>
                                        <p className="text-sm font-semibold text-white">{label}</p>
                                        <p className="text-[10px] text-slate-500">
                                            {config.enabled ? `${config.vantaEffect} effect` : 'Disabled'} · {config.title || 'No title'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); updateField(key, 'enabled', !config.enabled); }}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${config.enabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/30 text-slate-500 border border-slate-700/40'}`}
                                    >
                                        {config.enabled ? 'ON' : 'OFF'}
                                    </button>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="border-t border-slate-700/20 p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <HeroField label="Title">
                                            <input value={config.title} onChange={(e) => updateField(key, 'title', e.target.value)} className={inputClass} />
                                        </HeroField>
                                        <HeroField label="Pill Text">
                                            <input value={config.pillText} onChange={(e) => updateField(key, 'pillText', e.target.value)} className={inputClass} />
                                        </HeroField>
                                    </div>
                                    <HeroField label="Subtitle">
                                        <textarea value={config.subtitle} onChange={(e) => updateField(key, 'subtitle', e.target.value)} rows={2} className={`${inputClass} resize-y`} />
                                    </HeroField>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <HeroField label="Vanta Effect">
                                            <select value={config.vantaEffect} onChange={(e) => updateField(key, 'vantaEffect', e.target.value)} className={selectClass}>
                                                {VANTA_EFFECTS.map((fx) => <option key={fx.value} value={fx.value}>{fx.label}</option>)}
                                            </select>
                                        </HeroField>
                                        <HeroField label="Vanta Color">
                                            <div className="flex items-center gap-2">
                                                <input type="color" value={config.vantaColor} onChange={(e) => updateField(key, 'vantaColor', e.target.value)} className="w-8 h-8 rounded-lg border border-slate-700/40 cursor-pointer" />
                                                <input value={config.vantaColor} onChange={(e) => updateField(key, 'vantaColor', e.target.value)} className={inputClass} />
                                            </div>
                                        </HeroField>
                                        <HeroField label="Background Color">
                                            <div className="flex items-center gap-2">
                                                <input type="color" value={config.vantaBackgroundColor} onChange={(e) => updateField(key, 'vantaBackgroundColor', e.target.value)} className="w-8 h-8 rounded-lg border border-slate-700/40 cursor-pointer" />
                                                <input value={config.vantaBackgroundColor} onChange={(e) => updateField(key, 'vantaBackgroundColor', e.target.value)} className={inputClass} />
                                            </div>
                                        </HeroField>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <HeroField label="Gradient From">
                                            <div className="flex items-center gap-2">
                                                <input type="color" value={config.gradientFrom} onChange={(e) => updateField(key, 'gradientFrom', e.target.value)} className="w-8 h-8 rounded-lg border border-slate-700/40 cursor-pointer" />
                                                <input value={config.gradientFrom} onChange={(e) => updateField(key, 'gradientFrom', e.target.value)} className={inputClass} />
                                            </div>
                                        </HeroField>
                                        <HeroField label="Gradient To">
                                            <div className="flex items-center gap-2">
                                                <input type="color" value={config.gradientTo} onChange={(e) => updateField(key, 'gradientTo', e.target.value)} className="w-8 h-8 rounded-lg border border-slate-700/40 cursor-pointer" />
                                                <input value={config.gradientTo} onChange={(e) => updateField(key, 'gradientTo', e.target.value)} className={inputClass} />
                                            </div>
                                        </HeroField>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={config.showSearch} onChange={(e) => updateField(key, 'showSearch', e.target.checked)} className="rounded" />
                                            <span className="text-xs text-slate-300">Show Search Bar</span>
                                        </label>
                                    </div>
                                    {config.showSearch && (
                                        <HeroField label="Search Placeholder">
                                            <input value={config.searchPlaceholder} onChange={(e) => updateField(key, 'searchPlaceholder', e.target.value)} className={inputClass} />
                                        </HeroField>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Primary CTA</p>
                                            <HeroField label="Label">
                                                <input value={config.primaryCTA.label} onChange={(e) => updateCTA(key, 'primaryCTA', 'label', e.target.value)} className={inputClass} />
                                            </HeroField>
                                            <HeroField label="URL">
                                                <input value={config.primaryCTA.url} onChange={(e) => updateCTA(key, 'primaryCTA', 'url', e.target.value)} className={inputClass} />
                                            </HeroField>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Secondary CTA</p>
                                            <HeroField label="Label">
                                                <input value={config.secondaryCTA.label} onChange={(e) => updateCTA(key, 'secondaryCTA', 'label', e.target.value)} className={inputClass} />
                                            </HeroField>
                                            <HeroField label="URL">
                                                <input value={config.secondaryCTA.url} onChange={(e) => updateCTA(key, 'secondaryCTA', 'url', e.target.value)} className={inputClass} />
                                            </HeroField>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
