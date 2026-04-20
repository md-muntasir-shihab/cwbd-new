import { useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
    BookOpen,
    Eye,
    FileStack,
    Globe,
    RefreshCw,
    Save,
    Search,
    Shield,
    Type,
} from 'lucide-react';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import { ADMIN_PATHS } from '../routes/adminPaths';
import {
    adminGetResourceSettings,
    adminUpdateResourceSettings,
    type AdminResourceSettings,
    type ResourceSettingsSort,
    type ResourceSettingsType,
} from '../services/api';

const DEFAULT_RESOURCE_SETTINGS: AdminResourceSettings = {
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
    allowUserUploads: false,
    requireAdminApproval: true,
    maxFileSizeMB: 50,
    allowedCategories: ['Question Banks', 'Study Materials', 'Official Links', 'Tips & Tricks', 'Scholarships', 'Admit Cards'],
    allowedTypes: ['pdf', 'link', 'video', 'audio', 'image', 'note'],
    openLinksInNewTab: true,
    featuredSectionTitle: 'Featured Resources',
    emptyStateMessage: 'No resources found. Try adjusting your filters or search query.',
};

const SORT_OPTIONS: Array<{ value: ResourceSettingsSort; label: string }> = [
    { value: 'latest', label: 'Latest first' },
    { value: 'downloads', label: 'Most downloaded' },
    { value: 'views', label: 'Most viewed' },
];

const TYPE_OPTIONS: Array<{ value: Exclude<ResourceSettingsType, 'all'>; label: string }> = [
    { value: 'pdf', label: 'PDF' },
    { value: 'link', label: 'Link' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Audio' },
    { value: 'image', label: 'Image' },
    { value: 'note', label: 'Note' },
];

function SectionCard({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: typeof Globe;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-[0_18px_45px_rgba(8,15,40,0.18)]">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-1 text-xs leading-6 text-slate-400">{description}</p>
                </div>
            </div>
            <div className="mt-5 space-y-4">{children}</div>
        </section>
    );
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{children}</label>;
}

function ToggleRow({
    title,
    description,
    checked,
    onChange,
    disabled,
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}) {
    return (
        <label className={`flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 ${disabled ? 'opacity-55' : 'cursor-pointer'}`}>
            <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={title}
                disabled={disabled}
                onClick={onChange}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-700'
                    } ${disabled ? 'cursor-not-allowed' : ''}`}
            >
                <span
                    className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                />
            </button>
        </label>
    );
}

function ResourceSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<AdminResourceSettings>(DEFAULT_RESOURCE_SETTINGS);

    useEffect(() => {
        void adminGetResourceSettings()
            .then((res) => {
                setForm({
                    ...DEFAULT_RESOURCE_SETTINGS,
                    ...res.data.settings,
                    allowedCategories: res.data.settings.allowedCategories?.length
                        ? res.data.settings.allowedCategories
                        : DEFAULT_RESOURCE_SETTINGS.allowedCategories,
                    allowedTypes: res.data.settings.allowedTypes?.length
                        ? res.data.settings.allowedTypes
                        : DEFAULT_RESOURCE_SETTINGS.allowedTypes,
                });
            })
            .catch(() => toast.error('Failed to load resource settings'))
            .finally(() => setLoading(false));
    }, []);

    const categoryCsv = useMemo(() => form.allowedCategories.join(', '), [form.allowedCategories]);

    const setField = <K extends keyof AdminResourceSettings>(key: K, value: AdminResourceSettings[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const toggleAllowedType = (value: Exclude<ResourceSettingsType, 'all'>) => {
        setForm((current) => {
            const next = current.allowedTypes.includes(value)
                ? current.allowedTypes.filter((item) => item !== value)
                : [...current.allowedTypes, value];
            const normalized = next.length > 0 ? next : [...DEFAULT_RESOURCE_SETTINGS.allowedTypes];
            const defaultType = current.defaultType !== 'all' && !normalized.includes(current.defaultType)
                ? 'all'
                : current.defaultType;
            return {
                ...current,
                allowedTypes: normalized,
                defaultType,
            };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await adminUpdateResourceSettings({
                ...form,
                featuredLimit: Math.max(0, Math.min(24, Number(form.featuredLimit) || DEFAULT_RESOURCE_SETTINGS.featuredLimit)),
                itemsPerPage: Math.max(4, Math.min(48, Number(form.itemsPerPage) || DEFAULT_RESOURCE_SETTINGS.itemsPerPage)),
                maxFileSizeMB: Math.max(1, Math.min(500, Number(form.maxFileSizeMB) || DEFAULT_RESOURCE_SETTINGS.maxFileSizeMB)),
                allowedCategories: form.allowedCategories.map((item) => item.trim()).filter(Boolean),
                allowedTypes: form.allowedTypes.length ? form.allowedTypes : [...DEFAULT_RESOURCE_SETTINGS.allowedTypes],
            });
            toast.success('Resource settings saved');
        } catch {
            toast.error('Failed to save resource settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                    icon={Type}
                    title="Branding & Hero"
                    description="Control public and student resource headings, hero copy, badge text, and search messaging."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <FieldLabel>Page Title</FieldLabel>
                            <input
                                value={form.pageTitle}
                                onChange={(event) => setField('pageTitle', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="Student Resources"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Page Subtitle</FieldLabel>
                            <textarea
                                value={form.pageSubtitle}
                                onChange={(event) => setField('pageSubtitle', event.target.value)}
                                rows={3}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="Access curated study materials..."
                            />
                        </div>
                        <div>
                            <FieldLabel>Hero Badge Label</FieldLabel>
                            <input
                                value={form.heroBadgeLabel}
                                onChange={(event) => setField('heroBadgeLabel', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="Study Smart"
                            />
                        </div>
                        <div>
                            <FieldLabel>Search Placeholder</FieldLabel>
                            <input
                                value={form.searchPlaceholder}
                                onChange={(event) => setField('searchPlaceholder', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="Search resources..."
                            />
                        </div>
                    </div>
                </SectionCard>

                <SectionCard
                    icon={Eye}
                    title="Visibility & Layout"
                    description="Decide where the resource hub appears and which high-level sections stay visible."
                >
                    <ToggleRow
                        title="Public Resources Page"
                        description="Keep `/resources` live for public visitors without touching the stored resource records."
                        checked={form.publicPageEnabled}
                        onChange={() => setField('publicPageEnabled', !form.publicPageEnabled)}
                    />
                    <ToggleRow
                        title="Student Hub Page"
                        description="Expose the curated resources page inside the student dashboard experience."
                        checked={form.studentHubEnabled}
                        onChange={() => setField('studentHubEnabled', !form.studentHubEnabled)}
                    />
                    <ToggleRow
                        title="Show Hero Section"
                        description="Display the top hero banner with badge, title, copy, and search box area."
                        checked={form.showHero}
                        onChange={() => setField('showHero', !form.showHero)}
                    />
                    <ToggleRow
                        title="Show Stats Strip"
                        description="Show summary metrics like total resources, PDFs, videos, and featured items."
                        checked={form.showStats}
                        onChange={() => setField('showStats', !form.showStats)}
                    />
                    <ToggleRow
                        title="Show Featured Section"
                        description="Highlight featured or pinned resources before the full listing."
                        checked={form.showFeatured}
                        onChange={() => setField('showFeatured', !form.showFeatured)}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <FieldLabel>Featured Limit</FieldLabel>
                            <input
                                type="number"
                                min={0}
                                max={24}
                                value={form.featuredLimit}
                                onChange={(event) => setField('featuredLimit', Number(event.target.value) || 0)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            />
                        </div>
                        <div>
                            <FieldLabel>Featured Section Title</FieldLabel>
                            <input
                                value={form.featuredSectionTitle}
                                onChange={(event) => setField('featuredSectionTitle', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            />
                        </div>
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                    icon={Search}
                    title="Discovery Defaults"
                    description="Set default filters, pagination, and whether search/type/category controls are visible."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <FieldLabel>Default Sort</FieldLabel>
                            <select
                                value={form.defaultSort}
                                onChange={(event) => setField('defaultSort', event.target.value as ResourceSettingsSort)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            >
                                {SORT_OPTIONS.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <FieldLabel>Default Type</FieldLabel>
                            <select
                                value={form.defaultType}
                                onChange={(event) => setField('defaultType', event.target.value as ResourceSettingsType)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            >
                                <option value="all">All Types</option>
                                {TYPE_OPTIONS.filter((item) => form.allowedTypes.includes(item.value)).map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <FieldLabel>Default Category</FieldLabel>
                            <input
                                value={form.defaultCategory}
                                onChange={(event) => setField('defaultCategory', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="All"
                            />
                        </div>
                        <div>
                            <FieldLabel>Items Per Page</FieldLabel>
                            <input
                                type="number"
                                min={4}
                                max={48}
                                value={form.itemsPerPage}
                                onChange={(event) => setField('itemsPerPage', Number(event.target.value) || DEFAULT_RESOURCE_SETTINGS.itemsPerPage)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            />
                        </div>
                    </div>
                    <div className="grid gap-3">
                        <ToggleRow
                            title="Show Search"
                            description="Expose the search field on public and student resource pages."
                            checked={form.showSearch}
                            onChange={() => setField('showSearch', !form.showSearch)}
                        />
                        <ToggleRow
                            title="Show Type Filter"
                            description="Let visitors switch between PDFs, videos, links, notes, and other resource types."
                            checked={form.showTypeFilter}
                            onChange={() => setField('showTypeFilter', !form.showTypeFilter)}
                        />
                        <ToggleRow
                            title="Show Category Filter"
                            description="Let visitors drill into categories such as question banks, study materials, and scholarships."
                            checked={form.showCategoryFilter}
                            onChange={() => setField('showCategoryFilter', !form.showCategoryFilter)}
                        />
                    </div>
                </SectionCard>

                <SectionCard
                    icon={Shield}
                    title="Access & Policy"
                    description="Define tracking, link behaviour, and the categories/types the CMS should expose to public and student pages."
                >
                    <div className="grid gap-3">
                        <ToggleRow
                            title="Tracking Enabled"
                            description="Count resource views and downloads when visitors interact with public resources."
                            checked={form.trackingEnabled}
                            onChange={() => setField('trackingEnabled', !form.trackingEnabled)}
                        />
                        <ToggleRow
                            title="Open Links In New Tab"
                            description="Use a separate browser tab for external links and downloadable resources."
                            checked={form.openLinksInNewTab}
                            onChange={() => setField('openLinksInNewTab', !form.openLinksInNewTab)}
                        />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <FieldLabel>Allowed Categories</FieldLabel>
                            <input
                                value={categoryCsv}
                                onChange={(event) => setField(
                                    'allowedCategories',
                                    event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                                )}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                                placeholder="Question Banks, Study Materials, Official Links"
                            />
                        </div>
                    </div>
                    <div>
                        <FieldLabel>Allowed Resource Types</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                            {TYPE_OPTIONS.map((item) => {
                                const active = form.allowedTypes.includes(item.value);
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onClick={() => toggleAllowedType(item.value)}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active
                                            ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                                            : 'border-white/10 bg-slate-950/55 text-slate-400 hover:border-indigo-400/30 hover:text-slate-200'
                                            }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard
                icon={FileStack}
                title="Copy & Empty States"
                description="Fine-tune the fallback messaging shown when filters return no resources."
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                        <FieldLabel>Empty State Message</FieldLabel>
                        <textarea
                            value={form.emptyStateMessage}
                            onChange={(event) => setField('emptyStateMessage', event.target.value)}
                            rows={3}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400/60"
                            placeholder="No resources found. Try adjusting your filters."
                        />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Live summary</p>
                        <div className="mt-4 space-y-3 text-sm text-slate-300">
                            <p><span className="text-slate-500">Public page:</span> {form.publicPageEnabled ? 'Enabled' : 'Hidden'}</p>
                            <p><span className="text-slate-500">Student hub:</span> {form.studentHubEnabled ? 'Enabled' : 'Hidden'}</p>
                            <p><span className="text-slate-500">Default view:</span> {form.defaultType} / {form.defaultSort}</p>
                            <p><span className="text-slate-500">Filters:</span> {form.showSearch ? 'Search' : 'No search'}, {form.showTypeFilter ? 'Type' : 'No type'}, {form.showCategoryFilter ? 'Category' : 'No category'}</p>
                            <p><span className="text-slate-500">Allowed categories:</span> {form.allowedCategories.length}</p>
                            <p><span className="text-slate-500">Allowed types:</span> {form.allowedTypes.length}</p>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Resource Settings
                </button>
            </div>
        </div>
    );
}

export default function AdminSettingsResourcesPage() {
    return (
        <AdminGuardShell
            title="Resource Settings"
            description="Control branding, discovery defaults, visibility, and upload policy for the shared resources hub."
            allowedRoles={['superadmin', 'admin', 'moderator']}
        >
            <AdminTabNav tabs={[
                { key: 'list', label: 'All Resources', path: ADMIN_PATHS.resources, icon: FileStack },
                { key: 'settings', label: 'Resource Settings', path: ADMIN_PATHS.resourceSettings, icon: Shield },
            ]} />
            <ResourceSettingsPanel />
        </AdminGuardShell>
    );
}
