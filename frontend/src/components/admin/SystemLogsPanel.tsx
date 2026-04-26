import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ScrollText,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Info,
    Clock,
    Server,
    Database,
    Globe,
} from 'lucide-react';
import api, { AdminJobHealthSnapshot, AdminJobRunItem, adminGetAuditLogs, adminGetJobHealth, adminGetJobRuns } from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { useAuth } from '../../hooks/useAuth';

const ADMIN_API_PATH = (
    String(import.meta.env.VITE_ADMIN_PATH || 'campusway-secure-admin').trim().replace(/^\/+|\/+$/g, '')
    || 'campusway-secure-admin'
);

interface LogEntry {
    _id: string;
    timestamp: string;
    action: string;
    actor_id: any;
    actor_role: string;
    target_id: string;
    target_type: string;
    ip_address: string;
    details: any;
}

type NewsAuditLogEntry = {
    _id: string;
    createdAt?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorId?: {
        _id?: string;
        full_name?: string;
        fullName?: string;
        username?: string;
        email?: string;
        role?: string;
    } | string | null;
    meta?: Record<string, unknown>;
    ip?: string;
};

export default function SystemLogsPanel() {
    const { user } = useAuth();
    const [filterAction, setFilterAction] = useState('');
    const [filterActor, setFilterActor] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [logsPage, setLogsPage] = useState(1);
    const LOGS_PER_PAGE = 50;
    const isSuperAdmin = String(user?.role || '').toLowerCase() === 'superadmin';

    const logsQuery = useQuery({
        queryKey: [
            ...queryKeys.auditLogs,
            filterAction,
            filterActor,
            filterFrom,
            filterTo,
            logsPage,
            isSuperAdmin ? 'system' : 'news',
        ],
        queryFn: async () => {
            const res = await adminGetAuditLogs({
                page: logsPage,
                limit: LOGS_PER_PAGE,
                action: filterAction || undefined,
                actor: filterActor || undefined,
                dateFrom: filterFrom || undefined,
                dateTo: filterTo || undefined,
                scope: isSuperAdmin ? undefined : 'news',
            });
            const data = res.data as { logs?: LogEntry[]; items?: NewsAuditLogEntry[] };
            if (Array.isArray(data.logs)) {
                return data.logs as LogEntry[];
            }
            if (Array.isArray(data.items)) {
                return data.items.map((item) => {
                    const actor = item.actorId;
                    const actorRecord =
                        actor && typeof actor === 'object' && !Array.isArray(actor)
                            ? actor
                            : null;
                    return {
                        _id: String(item._id),
                        timestamp: String(item.createdAt || new Date().toISOString()),
                        action: String(item.action || 'news.audit'),
                        actor_id: actorRecord
                            ? {
                                _id: actorRecord._id,
                                full_name: actorRecord.full_name || actorRecord.fullName || '',
                                username: actorRecord.username || '',
                                email: actorRecord.email || '',
                            }
                            : (actor ? String(actor) : 'System'),
                        actor_role: String(actorRecord?.role || 'news'),
                        target_id: String(item.entityId || ''),
                        target_type: String(item.entityType || 'news'),
                        ip_address: String(item.ip || ''),
                        details: item.meta || {},
                    } satisfies LogEntry;
                });
            }
            return [] as LogEntry[];
        },
        refetchInterval: 30000,
    });

    const healthQuery = useQuery({
        queryKey: ['admin', 'health'],
        queryFn: async () => {
            const res = await api.get(`/${ADMIN_API_PATH}/health`);
            return res.status === 200;
        },
        retry: 0,
        refetchInterval: 30000,
    });
    const jobRunsQuery = useQuery({
        queryKey: queryKeys.jobRuns,
        queryFn: async () => (await adminGetJobRuns({ limit: 40 })).data.items,
        refetchInterval: 30000,
    });
    const jobHealthQuery = useQuery({
        queryKey: queryKeys.jobHealth,
        queryFn: async () => (await adminGetJobHealth({ hours: 24 })).data,
        refetchInterval: 30000,
    });

    const logs = logsQuery.data || [];
    const jobRuns: AdminJobRunItem[] = jobRunsQuery.data || [];
    const jobHealth: AdminJobHealthSnapshot | null = jobHealthQuery.data || null;
    const loading = logsQuery.isLoading;
    const apiStatus = healthQuery.isLoading
        ? 'checking'
        : healthQuery.data
            ? 'online'
            : 'offline';
    const dbStatus = apiStatus;

    const statusCards = useMemo(
        () => [
            { label: 'API Server', status: apiStatus, icon: Server, port: ':5000' },
            { label: 'MongoDB', status: dbStatus, icon: Database, port: ':27017' },
            { label: 'Frontend (Vite)', status: 'online' as const, icon: Globe, port: ':5173' },
        ],
        [apiStatus, dbStatus],
    );

    const refreshAll = () => {
        void Promise.all([logsQuery.refetch(), healthQuery.refetch(), jobRunsQuery.refetch(), jobHealthQuery.refetch()]);
    };

    const getLevelFromAction = (action: string) => {
        const lower = action.toLowerCase();
        if (lower.includes('delete') || lower.includes('suspend') || lower.includes('failed')) return 'error';
        if (lower.includes('update') || lower.includes('change')) return 'warn';
        if (lower.includes('create') || lower.includes('register') || lower.includes('grant')) return 'success';
        return 'info';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ScrollText className="w-5 h-5 text-cyan-400" />
                        System Logs
                    </h2>
                    <p className="text-xs text-slate-500">Monitor system health, API status, and recent events</p>
                    {!isSuperAdmin ? (
                        <p className="mt-1 text-[11px] text-amber-300/90">
                            Viewing news audit scope (superadmin required for full system audit logs).
                        </p>
                    ) : null}
                </div>
                <button onClick={refreshAll} disabled={logsQuery.isFetching || healthQuery.isFetching}
                    className="px-3 py-2 text-sm text-slate-400 hover:text-white bg-white/5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${(logsQuery.isFetching || healthQuery.isFetching) ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {statusCards.map((s) => (
                    <div key={s.label} className="bg-slate-900/60 backdrop-blur-sm rounded-2xl p-5 border border-indigo-500/10">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.status === 'online' ? 'bg-emerald-500/15' : s.status === 'checking' ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
                                <s.icon className={`w-5 h-5 ${s.status === 'online' ? 'text-emerald-400' : s.status === 'checking' ? 'text-amber-400' : 'text-red-400'}`} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">{s.label}</p>
                                <p className="text-[10px] text-slate-500">{s.port}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`relative flex h-2.5 w-2.5 ${s.status === 'online' ? '' : 'hidden'}`}>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span className={`text-xs uppercase tracking-wider font-semibold ${s.status === 'online' ? 'text-emerald-400' : s.status === 'checking' ? 'text-amber-400' : 'text-red-400'}`}>
                                {s.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-indigo-500/10 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Security & Audit Log</h3>
                    <span className="text-[10px] text-slate-500">{logs.length} entries</span>
                </div>
                <div className="grid grid-cols-1 gap-3 border-b border-indigo-500/10 px-5 py-3 md:grid-cols-4">
                    <input
                        value={filterAction}
                        onChange={(event) => { setFilterAction(event.target.value); setLogsPage(1); }}
                        placeholder="Filter action"
                        className="rounded-lg border border-indigo-500/20 bg-slate-950/70 px-3 py-2 text-xs text-white"
                    />
                    <input
                        value={filterActor}
                        onChange={(event) => { setFilterActor(event.target.value); setLogsPage(1); }}
                        placeholder="Actor ID"
                        className="rounded-lg border border-indigo-500/20 bg-slate-950/70 px-3 py-2 text-xs text-white"
                    />
                    <input
                        type="date"
                        value={filterFrom}
                        onChange={(event) => { setFilterFrom(event.target.value); setLogsPage(1); }}
                        className="rounded-lg border border-indigo-500/20 bg-slate-950/70 px-3 py-2 text-xs text-white"
                    />
                    <input
                        type="date"
                        value={filterTo}
                        onChange={(event) => { setFilterTo(event.target.value); setLogsPage(1); }}
                        className="rounded-lg border border-indigo-500/20 bg-slate-950/70 px-3 py-2 text-xs text-white"
                    />
                </div>
                <div className="divide-y divide-indigo-500/5 max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Loading logs...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No audit logs found.</div>
                    ) : logs.map((log) => {
                        const lvl = getLevelFromAction(log.action) as 'info' | 'warn' | 'error' | 'success';
                        const actorName = log.actor_id?.username || log.actor_id?.email || log.actor_id || 'System';

                        return (
                            <div key={log._id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                                <div className="mt-0.5">
                                    {lvl === 'info' && <Info className="w-3.5 h-3.5 text-blue-400" />}
                                    {lvl === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                                    {lvl === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                                    {lvl === 'success' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-medium">
                                        <span className="text-indigo-300">{actorName}</span>{' '}
                                        <span className="text-slate-400">({log.actor_role})</span> {log.action}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                        Target: {log.target_type} ({log.target_id})
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(log.timestamp).toLocaleString()}
                                        </span>
                                        <span className="text-[10px] text-slate-600">·</span>
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Globe className="w-3 h-3" />
                                            IP: {log.ip_address}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* Pagination Controls */}
                <div className="px-5 py-3 border-t border-indigo-500/10 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Page {logsPage}</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                            disabled={logsPage <= 1}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            ← Previous
                        </button>
                        <button
                            onClick={() => setLogsPage((p) => p + 1)}
                            disabled={logs.length < LOGS_PER_PAGE}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                    <div className="px-5 py-3 border-b border-indigo-500/10 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Job Health (24h)</h3>
                        <span className="text-[10px] text-slate-500">
                            {jobHealth ? `${jobHealth.totals.success} success / ${jobHealth.totals.failed} failed` : 'loading'}
                        </span>
                    </div>
                    <div className="p-4">
                        {jobHealthQuery.isLoading ? (
                            <p className="text-sm text-slate-500">Loading job health...</p>
                        ) : !jobHealth ? (
                            <p className="text-sm text-slate-500">No job health snapshot available.</p>
                        ) : (
                            <div className="space-y-3">
                                {jobHealth.byJob.length === 0 ? (
                                    <p className="text-sm text-slate-500">No cron runs recorded yet.</p>
                                ) : jobHealth.byJob.map((item) => (
                                    <div key={item.jobName} className="rounded-xl border border-indigo-500/15 bg-slate-950/70 px-3 py-2">
                                        <p className="text-sm font-medium text-white">{item.jobName}</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            success: {item.success} · failed: {item.failed} · running: {item.running}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            last run: {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : 'N/A'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                    <div className="px-5 py-3 border-b border-indigo-500/10 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Recent Job Runs</h3>
                        <span className="text-[10px] text-slate-500">{jobRuns.length} runs</span>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto divide-y divide-indigo-500/5">
                        {jobRunsQuery.isLoading ? (
                            <p className="p-4 text-sm text-slate-500">Loading job runs...</p>
                        ) : jobRuns.length === 0 ? (
                            <p className="p-4 text-sm text-slate-500">No job runs found.</p>
                        ) : jobRuns.map((run) => (
                            <div key={run._id} className="px-4 py-3">
                                <p className="text-sm font-medium text-white">{run.jobName}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    status: {run.status} · duration: {run.durationMs ?? 0}ms
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    started: {new Date(run.startedAt).toLocaleString()}
                                </p>
                                {run.errorMessage ? (
                                    <p className="mt-1 text-[11px] text-rose-300">{run.errorMessage}</p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
