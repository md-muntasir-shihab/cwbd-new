import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import NewsHelpButton from '../../../components/admin/NewsHelpButton';
import {
    ApiNewsV2Source,
    adminNewsV2CreateSource,
    adminNewsV2DeleteSource,
    adminNewsV2GetSources,
    adminNewsV2ReorderSources,
    adminNewsV2TestSource,
    adminNewsV2UploadMedia,
    adminNewsV2UpdateSource,
} from '../../../services/api';
import { buildMediaUrl } from '../../../utils/mediaUrl';
import { extractUploadUrl, extractUploadError } from '../../../components/common/CompressedImageInput';

const EMPTY_SOURCE: Partial<ApiNewsV2Source> = {
    name: '',
    feedUrl: '',
    iconUrl: '',
    fetchIntervalMin: 30,
    maxItemsPerFetch: 20,
    categoryDefault: 'General',
    tagsDefault: [],
    isActive: true,
    enabled: true,
    order: 0,
    language: 'en',
};

export default function AdminNewsSourcesSection() {
    const queryClient = useQueryClient();
    const [form, setForm] = useState<Partial<ApiNewsV2Source>>(EMPTY_SOURCE);
    const [tagsInput, setTagsInput] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [uploadingIcon, setUploadingIcon] = useState(false);

    const sourcesQuery = useQuery({
        queryKey: ['adminRssSources'],
        queryFn: async () => (await adminNewsV2GetSources()).data,
    });

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                ...form,
                tagsDefault: tagsInput.split(',').map((item) => item.trim()).filter(Boolean),
            };
            if (editingId) return (await adminNewsV2UpdateSource(editingId, payload)).data;
            return (await adminNewsV2CreateSource(payload)).data;
        },
        onSuccess: () => {
            toast.success('Source saved');
            setForm(EMPTY_SOURCE);
            setTagsInput('');
            setEditingId(null);
            queryClient.invalidateQueries({ queryKey: ['adminRssSources'] });
            queryClient.invalidateQueries({ queryKey: ['newsSources'] });
            queryClient.invalidateQueries({ queryKey: ['newsList'] });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Source save failed'),
    });

    const actionMutation = useMutation({
        mutationFn: async (payload: { type: 'test' | 'delete' | 'reorder' | 'toggle'; id?: string; ids?: string[]; enabled?: boolean }) => {
            if (payload.type === 'test' && payload.id) return (await adminNewsV2TestSource(payload.id)).data;
            if (payload.type === 'delete' && payload.id) return (await adminNewsV2DeleteSource(payload.id)).data;
            if (payload.type === 'reorder' && payload.ids) return (await adminNewsV2ReorderSources(payload.ids)).data;
            if (payload.type === 'toggle' && payload.id) return (await adminNewsV2UpdateSource(payload.id, { enabled: payload.enabled })).data;
            throw new Error('Unsupported action');
        },
        onSuccess: (data: any, payload) => {
            if (payload.type === 'test') {
                toast.success(`Feed test success (${data?.preview?.length || 0} items)`);
            } else {
                toast.success('Done');
            }
            queryClient.invalidateQueries({ queryKey: ['adminRssSources'] });
            queryClient.invalidateQueries({ queryKey: ['newsSources'] });
            queryClient.invalidateQueries({ queryKey: ['newsList'] });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Source action failed'),
    });

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        saveMutation.mutate();
    }

    async function onUploadIcon(file?: File | null) {
        if (!file) return;
        setUploadingIcon(true);
        try {
            const result = await adminNewsV2UploadMedia(file, { altText: 'source-icon' });
            const mediaUrl = extractUploadUrl(result.data);
            if (!mediaUrl) throw new Error('Upload returned empty URL');
            setForm((prev) => ({ ...prev, iconUrl: mediaUrl, iconType: 'upload' }));
            toast.success('Icon uploaded');
        } catch (error: unknown) {
            toast.error(extractUploadError(error, 'Icon upload failed'));
        } finally {
            setUploadingIcon(false);
        }
    }

    function reorderSource(sourceId: string, direction: 'up' | 'down') {
        const current = (sourcesQuery.data?.items || []).map((item) => String(item._id));
        const index = current.findIndex((id) => id === sourceId);
        if (index < 0) return;
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= current.length) return;
        const next = [...current];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        actionMutation.mutate({ type: 'reorder', ids: next });
    }

    return (
        <div className="space-y-4">
            <form onSubmit={onSubmit} className="card-flat border border-cyan-500/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold">{editingId ? 'Edit Source' : 'Add RSS Source'}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Manage feed health, fetch timing, and source defaults in one place.</p>
                    </div>
                    <NewsHelpButton
                        title="RSS Source Management"
                        content="Add, edit, test, disable, and reorder RSS feeds from this screen."
                        impact="It keeps feed ownership and fetch behavior visible before content reaches review."
                        affected="Admins and editors responsible for RSS ingestion."
                        publishNote="A source only affects published content after its items are reviewed and published."
                        publishSendNote="If source items later enter publish + send, the communication layer will use the chosen audience/template settings."
                        enabledNote="Active sources keep the queue fresh without manual re-entry."
                        disabledNote="Disabled sources stop contributing new items until re-enabled."
                        bestPractice="Keep one source per upstream feed and use source health chips to spot broken feeds early."
                        variant="full"
                    />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input className="input-field" placeholder="Source Name" value={form.name || ''} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
                    <input className="input-field" placeholder="Feed URL" value={form.feedUrl || ''} onChange={(e) => setForm((prev) => ({ ...prev, feedUrl: e.target.value }))} required />
                    <div className="md:col-span-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                        Use a live RSS or Atom feed URL here. Placeholder `example.com` feeds are rejected so broken demo sources do not keep polluting the queue.
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <input
                            className="input-field"
                            placeholder="Icon URL"
                            value={form.iconUrl || ''}
                            onChange={(e) => setForm((prev) => ({ ...prev, iconUrl: e.target.value, iconType: 'url' }))}
                        />
                        <div className="flex items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-cyan-500/60 dark:border-slate-700 dark:text-slate-200">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        onUploadIcon(file);
                                        event.currentTarget.value = '';
                                    }}
                                />
                                {uploadingIcon ? 'Uploading...' : 'Upload Icon'}
                            </label>
                            {form.iconUrl ? <img src={buildMediaUrl(form.iconUrl)} alt="source icon" className="h-9 w-9 rounded-md border border-slate-300/70 object-cover dark:border-slate-700/70" /> : null}
                        </div>
                    </div>
                    <input className="input-field" placeholder="Source Site URL (optional)" value={form.siteUrl || ''} onChange={(e) => setForm((prev) => ({ ...prev, siteUrl: e.target.value }))} />
                    <input className="input-field" placeholder="Default Category" value={form.categoryDefault || ''} onChange={(e) => setForm((prev) => ({ ...prev, categoryDefault: e.target.value }))} />
                    <select className="input-field" value={form.fetchIntervalMin || 30} onChange={(e) => setForm((prev) => ({ ...prev, fetchIntervalMin: Number(e.target.value) }))}>
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={60}>60 min</option>
                        <option value={360}>360 min</option>
                    </select>
                    <input className="input-field" type="number" min={1} max={100} placeholder="Max items per fetch" value={form.maxItemsPerFetch || 20} onChange={(e) => setForm((prev) => ({ ...prev, maxItemsPerFetch: Number(e.target.value) }))} />
                    <input className="input-field md:col-span-2" placeholder="Default tags (comma separated)" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
                    <label className="md:col-span-2 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                        <input
                            type="checkbox"
                            checked={Boolean(form.isActive)}
                            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked, enabled: e.target.checked }))}
                        />
                        Source enabled
                    </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save Source'}</button>
                    {editingId && <button type="button" className="btn-outline" onClick={() => { setEditingId(null); setForm(EMPTY_SOURCE); setTagsInput(''); }}>Cancel Edit</button>}
                </div>
            </form>

            <div className="card-flat border border-cyan-500/20 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <h3 className="text-lg font-semibold">Source List</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Review health, fetch cadence, and quick actions without opening a wide table.</p>
                    </div>
                    <span className="rounded-full border border-slate-300/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                        {sourcesQuery.data?.items?.length || 0} sources
                    </span>
                </div>
                <div className="grid gap-3 lg:hidden">
                    {(sourcesQuery.data?.items || []).map((source) => (
                        <div key={source._id} className="rounded-2xl border border-slate-200/80 bg-slate-100/70 p-3 dark:border-slate-800/70 dark:bg-slate-950/50">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{source.name}</h4>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{source.feedUrl}</p>
                                </div>
                                <StatusPill active={source.isActive} />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <MetaChip label="Interval" value={`${source.fetchIntervalMin}m`} />
                                <MetaChip label="Health" value={formatHealthLabel(source)} />
                                <MetaChip label="Created" value={source.lastCreatedCount ?? 0} />
                                <MetaChip label="Dup Rate" value={formatRate(source.lastDuplicateRate)} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200" onClick={() => { setEditingId(source._id); setForm(source); setTagsInput((source.tagsDefault || []).join(', ')); }}>Edit</button>
                                <button className="rounded border border-cyan-600/60 px-2 py-1 text-xs text-cyan-200" onClick={() => actionMutation.mutate({ type: 'test', id: source._id })}>Test</button>
                                <button className="rounded border border-indigo-600/60 px-2 py-1 text-xs text-indigo-200" onClick={() => actionMutation.mutate({ type: 'toggle', id: source._id, enabled: !source.isActive })}>
                                    {source.isActive ? 'Disable' : 'Enable'}
                                </button>
                                <button className="rounded border border-slate-500/60 px-2 py-1 text-xs text-slate-200" onClick={() => reorderSource(source._id, 'up')}>
                                    Up
                                </button>
                                <button className="rounded border border-slate-500/60 px-2 py-1 text-xs text-slate-200" onClick={() => reorderSource(source._id, 'down')}>
                                    Down
                                </button>
                                <button className="rounded border border-rose-600/60 px-2 py-1 text-xs text-rose-200" onClick={() => actionMutation.mutate({ type: 'delete', id: source._id })}>Delete</button>
                            </div>
                            {renderSourceHealth(source)}
                        </div>
                    ))}
                    {!sourcesQuery.data?.items?.length ? (
                        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            No sources yet.
                        </p>
                    ) : null}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-cyan-500/20 text-left text-xs uppercase tracking-wider text-slate-400">
                                <th className="py-2 pr-3">Name</th>
                                <th className="py-2 pr-3">Feed URL</th>
                                <th className="py-2 pr-3">Interval</th>
                                <th className="py-2 pr-3">Health</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2 pr-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(sourcesQuery.data?.items || []).map((source) => (
                                <tr key={source._id} className="border-b border-slate-200 dark:border-slate-800/60">
                                    <td className="py-2 pr-3">{source.name}</td>
                                    <td className="py-2 pr-3 text-xs text-slate-600 dark:text-slate-300">{source.feedUrl}</td>
                                    <td className="py-2 pr-3">{source.fetchIntervalMin}m</td>
                                    <td className="py-2 pr-3 text-xs text-slate-500 dark:text-slate-400">
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-600">{formatHealthLabel(source)}</span>
                                            <span className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-600">{formatRate(source.lastDuplicateRate)}</span>
                                            <span className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-600">{source.lastCreatedCount ?? 0} created</span>
                                        </div>
                                    </td>
                                    <td className="py-2 pr-3">{source.isActive ? 'Active' : 'Disabled'}</td>
                                    <td className="py-2 pr-3">
                                        <div className="flex flex-wrap gap-1">
                                            <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200" onClick={() => { setEditingId(source._id); setForm(source); setTagsInput((source.tagsDefault || []).join(', ')); }}>Edit</button>
                                            <button className="rounded border border-cyan-600/60 px-2 py-1 text-xs text-cyan-200" onClick={() => actionMutation.mutate({ type: 'test', id: source._id })}>Test</button>
                                            <button className="rounded border border-indigo-600/60 px-2 py-1 text-xs text-indigo-200" onClick={() => actionMutation.mutate({ type: 'toggle', id: source._id, enabled: !source.isActive })}>
                                                {source.isActive ? 'Disable' : 'Enable'}
                                            </button>
                                            <button className="rounded border border-slate-500/60 px-2 py-1 text-xs text-slate-200" onClick={() => reorderSource(source._id, 'up')}>
                                                Up
                                            </button>
                                            <button className="rounded border border-slate-500/60 px-2 py-1 text-xs text-slate-200" onClick={() => reorderSource(source._id, 'down')}>
                                                Down
                                            </button>
                                            <button className="rounded border border-rose-600/60 px-2 py-1 text-xs text-rose-200" onClick={() => actionMutation.mutate({ type: 'delete', id: source._id })}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!sourcesQuery.data?.items?.length && (
                                <tr>
                                    <td colSpan={6} className="py-4 text-center text-slate-500 dark:text-slate-400">No sources yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatusPill({ active }: { active: boolean }) {
    return (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-400/40 bg-slate-500/10 text-slate-300'}`}>
            {active ? 'Active' : 'Disabled'}
        </span>
    );
}

function MetaChip({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-xl border border-slate-200/70 bg-white/70 px-2.5 py-2 dark:border-slate-800/70 dark:bg-slate-950/50">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
        </div>
    );
}

function formatRate(value?: number | null): string {
    if (value === null || value === undefined) return 'n/a';
    if (value <= 1) return `${Math.round(value * 100)}%`;
    return `${value}%`;
}

function renderSourceHealth(source: ApiNewsV2Source) {
    const chips = [
        source.healthState ? `Health: ${formatHealthLabel(source)}` : null,
        source.consecutiveFailureCount ? `Fails: ${source.consecutiveFailureCount}` : null,
        source.lastHttpStatus ? `HTTP ${source.lastHttpStatus}` : null,
        source.lastParseError ? `Parse issue` : null,
        source.lastExtractionMode ? `Mode: ${source.lastExtractionMode}` : null,
    ].filter(Boolean) as string[];

    if (!chips.length) return null;

    return (
        <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                {chips.map((chip) => (
                    <span key={chip} className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-700">
                        {chip}
                    </span>
                ))}
            </div>
            {source.sourceWarnings?.length ? (
                <div className="space-y-1 text-xs text-amber-700 dark:text-amber-200">
                    {source.sourceWarnings.map((warning) => (
                        <p key={warning} className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                            {warning}
                        </p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function formatHealthLabel(source: ApiNewsV2Source): string {
    if (source.healthState === 'invalid_config') return 'invalid config';
    return source.lastFetchStatus || source.healthState || 'unknown';
}
