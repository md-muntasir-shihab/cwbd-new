import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    CheckCircle2,
    Loader2,
    Plug,
    RefreshCw,
    Save,
    ShieldAlert,
    XCircle,
} from 'lucide-react';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import {
    listIntegrations,
    testIntegration,
    toggleIntegration,
    updateIntegration,
    type IntegrationCategory,
    type IntegrationItem,
} from '../services/integrationsApi';

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
    search: 'Search',
    images: 'Images',
    email: 'Email',
    marketing: 'Marketing',
    notifications: 'Notifications',
    analytics: 'Analytics',
    backup: 'Backup',
};

function formatRelative(iso: string | null): string {
    if (!iso) return 'never';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'never';
    const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function StatusBadge({ status }: { status: 'success' | 'failed' | 'unknown' | 'skipped' }) {
    if (status === 'success') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
            </span>
        );
    }
    if (status === 'failed') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                <XCircle className="h-3.5 w-3.5" /> Failing
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <ShieldAlert className="h-3.5 w-3.5" /> Untested
        </span>
    );
}

type DraftState = {
    enabled: boolean;
    config: Record<string, string>;
    secrets: Record<string, string>;
};

function buildInitialDraft(item: IntegrationItem): DraftState {
    const config: Record<string, string> = {};
    for (const field of item.configFields) {
        const raw = item.state.config?.[field.name];
        config[field.name] =
            raw === null || raw === undefined ? '' : typeof raw === 'string' ? raw : String(raw);
    }
    const secrets: Record<string, string> = {};
    for (const field of item.secretFields) {
        secrets[field.name] = '';
    }
    return { enabled: item.state.enabled, config, secrets };
}

function IntegrationCard({ item }: { item: IntegrationItem }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<DraftState>(() => buildInitialDraft(item));

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'integrations'] });

    const toggleMutation = useMutation({
        mutationFn: (enabled: boolean) => toggleIntegration(item.key, enabled),
        onSuccess: () => {
            toast.success(`${item.displayName} ${draft.enabled ? 'disabled' : 'enabled'}`);
            refresh();
        },
        onError: (err: unknown) => {
            const message =
                err instanceof Error ? err.message : `Failed to toggle ${item.displayName}`;
            toast.error(message);
        },
    });

    const saveMutation = useMutation({
        mutationFn: () => {
            const cleanedSecrets: Record<string, string> = {};
            for (const [k, v] of Object.entries(draft.secrets)) {
                if (v !== '') cleanedSecrets[k] = v;
            }
            const cleanedConfig: Record<string, unknown> = {};
            for (const field of item.configFields) {
                const raw = draft.config[field.name] ?? '';
                if (field.type === 'number') {
                    if (raw === '') continue;
                    const n = Number(raw);
                    if (!Number.isNaN(n)) cleanedConfig[field.name] = n;
                } else if (field.type === 'boolean') {
                    cleanedConfig[field.name] = raw === 'true';
                } else {
                    cleanedConfig[field.name] = raw;
                }
            }
            return updateIntegration(item.key, {
                config: cleanedConfig,
                ...(Object.keys(cleanedSecrets).length > 0 ? { secrets: cleanedSecrets } : {}),
            });
        },
        onSuccess: () => {
            toast.success(`${item.displayName} saved`);
            setDraft((prev) => ({ ...prev, secrets: Object.fromEntries(Object.keys(prev.secrets).map((k) => [k, ''])) }));
            refresh();
        },
        onError: (err: unknown) => {
            const message =
                err instanceof Error ? err.message : `Failed to save ${item.displayName}`;
            toast.error(message);
        },
    });

    const testMutation = useMutation({
        mutationFn: () => testIntegration(item.key),
        onSuccess: (result) => {
            const latency = typeof result.latencyMs === 'number' ? ` (${result.latencyMs}ms)` : '';
            if (result.status === 'success') {
                toast.success(`${item.displayName}: ${result.message}${latency}`);
            } else {
                toast.error(`${item.displayName}: ${result.message}`);
            }
            refresh();
        },
        onError: (err: unknown) => {
            const message =
                err instanceof Error ? err.message : `Failed to test ${item.displayName}`;
            toast.error(message);
        },
    });

    return (
        <article className="card-flat border border-cyan-500/20 p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-primary" />
                        <h3 className="text-base font-semibold cw-text">{item.displayName}</h3>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                            {CATEGORY_LABELS[item.category]}
                        </span>
                    </div>
                    <p className="mt-1 text-xs cw-muted">{item.description}</p>
                    {item.docsUrl ? (
                        <a
                            href={item.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[11px] text-primary hover:underline"
                        >
                            View docs
                        </a>
                    ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={item.state.lastTestStatus} />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Last test: {formatRelative(item.state.lastTestedAt)}
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                        <span className="font-medium cw-text">{draft.enabled ? 'Enabled' : 'Disabled'}</span>
                        <span className="relative inline-block h-5 w-9">
                            <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={draft.enabled}
                                onChange={(event) => {
                                    const next = event.target.checked;
                                    setDraft((prev) => ({ ...prev, enabled: next }));
                                    toggleMutation.mutate(next);
                                }}
                                disabled={toggleMutation.isPending}
                            />
                            <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 dark:bg-slate-700" />
                            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                        </span>
                    </label>
                </div>
            </header>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {item.configFields.map((field) => (
                    <label key={field.name} className="block text-xs font-medium cw-muted">
                        {field.label}
                        {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
                        <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm cw-text shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                            value={draft.config[field.name] ?? ''}
                            placeholder={field.helpText ?? ''}
                            onChange={(event) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    config: { ...prev.config, [field.name]: event.target.value },
                                }))
                            }
                        />
                        {field.helpText ? <span className="mt-1 block text-[10px] text-slate-500">{field.helpText}</span> : null}
                    </label>
                ))}
                {item.secretFields.map((field) => {
                    const isConfigured = item.state.configuredSecrets.includes(field.name);
                    return (
                        <label key={field.name} className="block text-xs font-medium cw-muted">
                            {field.label}
                            <span
                                className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                                    isConfigured
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}
                            >
                                {isConfigured ? 'set' : 'empty'}
                            </span>
                            <input
                                type="password"
                                autoComplete="new-password"
                                placeholder={isConfigured ? '•••••••• (leave blank to keep)' : 'Paste secret value'}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm cw-text shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                                value={draft.secrets[field.name] ?? ''}
                                onChange={(event) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        secrets: { ...prev.secrets, [field.name]: event.target.value },
                                    }))
                                }
                            />
                            {field.helpText ? <span className="mt-1 block text-[10px] text-slate-500">{field.helpText}</span> : null}
                        </label>
                    );
                })}
            </div>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {item.state.lastTestMessage ? (
                        <span className="max-w-md truncate" title={item.state.lastTestMessage}>
                            {item.state.lastTestMessage}
                        </span>
                    ) : (
                        <span>No connection test recorded yet.</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2 text-xs"
                        onClick={() => testMutation.mutate()}
                        disabled={testMutation.isPending || saveMutation.isPending}
                    >
                        {testMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Test connection
                    </button>
                    <button
                        type="button"
                        className="btn-primary inline-flex items-center gap-2 text-xs"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                    >
                        {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save changes
                    </button>
                </div>
            </footer>
        </article>
    );
}

export default function AdminSettingsIntegrationsPage() {
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'integrations'],
        queryFn: listIntegrations,
        staleTime: 15_000,
    });

    return (
        <AdminGuardShell
            title="Integrations"
            description="Configure and test the 10 supported external services. Secrets are encrypted at rest and never returned to the browser."
            allowedRoles={['superadmin', 'admin']}
        >
            <div className="space-y-4">
                <div className="card-flat flex flex-wrap items-center justify-between gap-3 border border-cyan-500/20 px-5 py-4">
                    <div>
                        <h2 className="text-base font-semibold cw-text">Service registry</h2>
                        <p className="text-xs cw-muted">
                            All integrations default to <strong>disabled</strong>. Enabling without valid configuration will fail-safe to local fallbacks.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2 text-xs"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                    </button>
                </div>

                {isLoading ? (
                    <div className="card-flat flex items-center justify-center gap-2 px-5 py-10 text-sm cw-muted">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
                    </div>
                ) : isError ? (
                    <div className="card-flat border-rose-500/30 px-5 py-6 text-sm text-rose-700 dark:text-rose-300">
                        Failed to load integrations: {error instanceof Error ? error.message : 'unknown error'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {(data ?? []).map((item) => (
                            <IntegrationCard key={item.key} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </AdminGuardShell>
    );
}
