import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck as ShieldCheckIcon,
    BarChart3 as ChartBarIcon,
    Clock as ClockIcon,
    BellRing as BellAlertIcon,
    FileText as DocumentTextIcon,
    Settings as Cog6ToothIcon,
    AlertTriangle as ExclamationTriangleIcon,
    CheckCircle as CheckCircleIcon,
    Users as UserGroupIcon,
    Lock as LockClosedIcon,
    Server as ServerIcon,
    Eye as EyeIcon,
    RotateCcw as ArrowPathIcon,
    Info as InformationCircleIcon,
} from 'lucide-react';
import {
    adminGetSecurityDashboard,
    adminGetSecurityAuditLogs,
    adminGetSecurityAlertsList,
    adminGetSecurityAlertsSummary,
    adminMarkSecurityAlertRead,
    adminMarkAllSecurityAlertsRead,
    adminResolveSecurityAlert,
    type SecurityDashboardMetrics,
    type AdminAuditLogItem,
    type AdminSecurityAlertItem,
} from '../../services/api';
import SharedSecurityHelpButton, { type SecurityHelpButtonProps as SharedSecurityHelpButtonProps } from './SecurityHelpButton';
import SecuritySettingsPanel from './SecuritySettingsPanel';

/* ═══════════════════════════════════════════════════════════════
   SECURITY HELP BUTTON — Reusable info/help popup for settings
   ═══════════════════════════════════════════════════════════════ */

interface SecurityHelpButtonProps extends SharedSecurityHelpButtonProps {}

function SecurityHelpButton({
    title,
    content,
    impact,
    affected,
    enabledNote,
    disabledNote,
    bestPractice,
    variant,
}: SecurityHelpButtonProps) {
    return (
        <SharedSecurityHelpButton
            title={title}
            content={content}
            impact={impact}
            affected={affected}
            enabledNote={enabledNote}
            disabledNote={disabledNote}
            bestPractice={bestPractice}
            variant={variant}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════
   METRIC CARD
   ═══════════════════════════════════════════════════════════════ */

interface MetricCardProps {
    label: string;
    value: number | string;
    icon: React.ElementType;
    color: string;
    help?: SecurityHelpButtonProps;
}

function MetricCard({ label, value, icon: Icon, color }: MetricCardProps) {
    const colorMap: Record<string, string> = {
        blue: 'from-blue-500/10 to-blue-600/5 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        red: 'from-red-500/10 to-red-600/5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
        amber: 'from-amber-500/10 to-amber-600/5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        emerald: 'from-emerald-500/10 to-emerald-600/5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        purple: 'from-purple-500/10 to-purple-600/5 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
        gray: 'from-gray-500/10 to-gray-600/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    };
    const classes = colorMap[color] || colorMap.gray;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative rounded-xl bg-gradient-to-br ${classes} border p-4 flex items-center gap-3`}
        >
            <div className="flex-shrink-0 p-2 rounded-lg bg-white/60 dark:bg-gray-900/40 shadow-sm">
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
                <p className="text-xl font-bold mt-0.5">{value}</p>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SECURITY DASHBOARD TAB
   ═══════════════════════════════════════════════════════════════ */

function SecurityDashboard() {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['securityDashboard'],
        queryFn: () => adminGetSecurityDashboard().then((r) => r.data),
        staleTime: 30_000,
    });

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center py-20">
                <ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    const metrics = data as SecurityDashboardMetrics;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Security Overview</h3>
                    <SecurityHelpButton
                        title="Security Overview"
                        content="This dashboard summarizes login health, session state, alerts, and backup status across the platform."
                        impact="It gives admins one place to detect weak security posture before it becomes an incident."
                        affected="Admins, support staff, finance users, and any account that depends on login or session access."
                        enabledNote="When security controls are enforced, failed logins, unread alerts, and locked accounts should trend down."
                        disabledNote="If controls are relaxed, suspicious logins and stale sessions may increase."
                        bestPractice="Review this dashboard before changing authentication, exports, or backup-related settings."
                        variant="full"
                    />
                </div>
                <button
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                    <ArrowPathIcon className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <MetricCard
                    label="Active Sessions"
                    value={metrics.activeSessions}
                    icon={UserGroupIcon}
                    color="blue"
                    help={{
                        title: 'Active Sessions',
                        content: 'Total user sessions currently active across all platforms.',
                        impact: 'High session counts may indicate concurrent usage or session leaks.',
                        affected: 'Students, admins, and any user with an active login session.',
                        enabledNote: 'Session tracking makes revocation and inactivity cleanup possible.',
                        disabledNote: 'Without session visibility, compromised devices are harder to spot.',
                        bestPractice: 'Monitor regularly and set idle timeouts to auto-expire stale sessions.',
                    }}
                />
                <MetricCard
                    label="Admin Sessions"
                    value={metrics.adminActiveSessions}
                    icon={ShieldCheckIcon}
                    color="purple"
                    help={{
                        title: 'Admin Sessions',
                        content: 'Active sessions from admin, moderator, and staff users.',
                        affected: 'Privileged users who can change security, content, or financial data.',
                        enabledNote: 'You can revoke a specific admin device without logging out everyone.',
                        disabledNote: 'Without tracking, privileged sessions are harder to audit.',
                        bestPractice: 'Ensure admins log out after sessions. Enable 2FA for all admin accounts.',
                    }}
                />
                <MetricCard
                    label="Failed Logins (24h)"
                    value={metrics.failedLogins24h}
                    icon={ExclamationTriangleIcon}
                    color={metrics.failedLogins24h > 20 ? 'red' : 'amber'}
                    help={{
                        title: 'Failed Login Attempts',
                        content: 'Number of unsuccessful login attempts in the last 24 hours.',
                        impact: 'Spikes may indicate brute-force attacks or credential stuffing.',
                        affected: 'All login entry points, including student and admin portals.',
                        enabledNote: 'Lockout and rate-limit settings can automatically reduce abuse.',
                        disabledNote: 'Disabled lockout or throttling makes guessing attacks more likely.',
                        bestPractice: 'Configure lockout policies and enable reCAPTCHA for login protection.',
                    }}
                />
                <MetricCard
                    label="Suspicious Logins (24h)"
                    value={metrics.suspiciousLogins24h}
                    icon={EyeIcon}
                    color={metrics.suspiciousLogins24h > 0 ? 'red' : 'emerald'}
                    help={{
                        title: 'Suspicious Login Activity',
                        content: 'Logins flagged as suspicious based on IP, device, or behavioral patterns.',
                        impact: 'Any suspicious activity should be investigated immediately.',
                        affected: 'Accounts with new devices, unusual IPs, or login anomalies.',
                        enabledNote: 'Alerting can notify admins when suspicious sign-ins appear.',
                        disabledNote: 'If alerts are off, these events stay visible only in logs.',
                        bestPractice: 'Review suspicious logins before approving sensitive access.',
                    }}
                />
                <MetricCard
                    label="Locked Accounts"
                    value={metrics.lockedAccounts}
                    icon={LockClosedIcon}
                    color={metrics.lockedAccounts > 0 ? 'amber' : 'emerald'}
                    help={{
                        title: 'Locked Accounts',
                        content: 'Accounts currently locked due to exceeding max login attempts.',
                        affected: 'Users who repeatedly fail sign-in verification.',
                        enabledNote: 'Lockout protects against repeated password guessing.',
                        disabledNote: 'If account lock is disabled, brute-force attempts face less resistance.',
                        bestPractice: 'Review locked accounts and unlock them if they are legitimate users.',
                    }}
                />
                <MetricCard
                    label="Admins w/o 2FA"
                    value={`${metrics.adminsWithout2FA}/${metrics.totalAdminUsers}`}
                    icon={ShieldCheckIcon}
                    color={metrics.adminsWithout2FA > 0 ? 'red' : 'emerald'}
                    help={{
                        title: 'Admin Two-Factor Authentication',
                        content: 'Number of admin/staff accounts that have NOT enabled 2FA.',
                        impact: 'Accounts without 2FA are vulnerable to credential theft.',
                        affected: 'Super admins, admins, moderators, editors, support, and finance staff.',
                        enabledNote: 'Enforced 2FA reduces the risk from leaked passwords.',
                        disabledNote: 'Without 2FA, a stolen password may be enough to access admin tools.',
                        bestPractice: 'Enforce 2FA for all admin accounts via Security Settings.',
                    }}
                />
                <MetricCard
                    label="Unread Alerts"
                    value={metrics.unreadAlerts}
                    icon={BellAlertIcon}
                    color={metrics.criticalAlerts > 0 ? 'red' : metrics.unreadAlerts > 0 ? 'amber' : 'emerald'}
                    help={{
                        title: 'Security Alerts',
                        content: 'Unread security alerts that require admin attention.',
                        affected: 'Admins reviewing login anomalies, exports, dangerous deletes, and settings changes.',
                        enabledNote: 'Unread alerts stay visible until they are marked read or resolved.',
                        disabledNote: 'If alerting is reduced, critical incidents may be missed.',
                        bestPractice: 'Review and resolve alerts regularly. Critical alerts need immediate action.',
                    }}
                />
                <MetricCard
                    label="Blocked Users"
                    value={metrics.blockedUsers}
                    icon={UserGroupIcon}
                    color={metrics.blockedUsers > 0 ? 'amber' : 'gray'}
                    help={{
                        title: 'Blocked Users',
                        content: 'Accounts that are currently blocked from access or still pending administrative resolution.',
                        impact: 'This count shows where policy enforcement or manual moderation is active.',
                        affected: 'Users who were suspended, blocked, or placed in a restricted state.',
                        enabledNote: 'Blocked accounts remain isolated until the admin changes their status.',
                        disabledNote: 'If blocking is not enforced, risky accounts may remain active longer.',
                        bestPractice: 'Review blocked accounts before restoring access.',
                    }}
                />
            </div>

            {/* Last Backup */}
            {metrics.lastBackup && (
                <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
                    metrics.lastBackup.status === 'completed'
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-800/70'
                        : metrics.lastBackup.status === 'failed'
                        ? 'bg-red-500/10 dark:bg-red-500/10 border-red-200/70 dark:border-red-800/70'
                        : 'bg-sky-500/10 dark:bg-sky-500/10 border-sky-200/70 dark:border-sky-800/70'
                }`}>
                    <ServerIcon className="w-5 h-5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-50">
                            Last Backup: <span className="font-semibold capitalize">{metrics.lastBackup.status}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                            Type: {metrics.lastBackup.type} • Storage: {metrics.lastBackup.storage} • {new Date(metrics.lastBackup.createdAt).toLocaleString()}
                        </p>
                        {metrics.lastBackup.error && (
                            <p className="text-xs text-red-500 mt-1">{metrics.lastBackup.error}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Recent Audit Logs */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                    <DocumentTextIcon className="w-4 h-4" />
                    Recent Security Activity
                </h4>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-auto max-h-80">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Action</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Actor</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Time</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {metrics.recentAuditLogs.map((log) => {
                                const actor = typeof log.actor_id === 'object' && log.actor_id
                                    ? (log.actor_id.full_name || log.actor_id.username || 'Unknown')
                                    : 'System';
                                return (
                                    <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-mono">{log.action}</td>
                                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{actor}</td>
                                        <td className="px-3 py-2 text-gray-500 dark:text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-gray-500 dark:text-gray-500 font-mono">{log.ip_address || '—'}</td>
                                    </tr>
                                );
                            })}
                            {metrics.recentAuditLogs.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No recent activity</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   AUDIT LOGS TAB
   ═══════════════════════════════════════════════════════════════ */

function SecurityAuditLogs() {
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['auditLogs', page, actionFilter, roleFilter],
        queryFn: () => adminGetSecurityAuditLogs({
            page,
            limit: 25,
            action: actionFilter || undefined,
            actor_role: roleFilter || undefined,
        }).then((r) => r.data),
        staleTime: 15_000,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <DocumentTextIcon className="w-5 h-5" /> Audit Logs
                    </h3>
                    <SecurityHelpButton
                        title="Audit Logs"
                        content="Complete audit trail of all admin and security-related actions. Filter by action type or actor role."
                        impact="Audit logs are critical for investigations and compliance."
                        affected="Security admins, auditors, and support staff handling incidents."
                        enabledNote="Every sensitive change leaves a trace when logging is enabled."
                        disabledNote="Reduced audit coverage makes incident review much harder."
                        bestPractice="Review regularly, export for external storage, and set retention policies."
                        variant="full"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        title="Filter by role"
                        aria-label="Filter by role"
                        value={roleFilter}
                        onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                        className="text-xs border rounded-lg px-2 py-1.5 bg-slate-950/70 border-white/10 text-slate-200"
                    >
                        <option value="">All Roles</option>
                        <option value="superadmin">Superadmin</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderator</option>
                        <option value="student">Student</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Filter by action..."
                        value={actionFilter}
                        onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                        className="text-xs border rounded-lg px-2 py-1.5 bg-slate-950/70 border-white/10 text-slate-200 w-48"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><ArrowPathIcon className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
                <>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">Action</th>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">Actor</th>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">Role</th>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">Target</th>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">Time</th>
                                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {(data?.items || []).map((log: AdminAuditLogItem) => {
                                    const actor = typeof log.actor_id === 'object' && log.actor_id
                                        ? (log.actor_id.full_name || log.actor_id.username || '—')
                                        : '—';
                                    return (
                                        <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{log.action}</td>
                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{actor}</td>
                                            <td className="px-3 py-2">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                    {log.actor_role || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-[10px]">{log.target_type || '—'}</td>
                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-500 font-mono">{log.ip_address || '—'}</td>
                                        </tr>
                                    );
                                })}
                                {(!data?.items || data.items.length === 0) && (
                                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No audit logs found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {data && data.pages > 1 && (
                        <div className="flex justify-center gap-2">
                            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 text-xs rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-600 disabled:opacity-40" title="Previous page">Prev</button>
                            <span className="text-xs text-gray-500 self-center">{page} / {data.pages}</span>
                            <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 text-xs rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-600 disabled:opacity-40" title="Next page">Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SECURITY ALERTS TAB
   ═══════════════════════════════════════════════════════════════ */

function SecurityAlertsTab() {
    const [page, setPage] = useState(1);
    const [severityFilter, setSeverityFilter] = useState('');
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['securityAlerts', page, severityFilter],
        queryFn: () => adminGetSecurityAlertsList({
            page,
            limit: 20,
            severity: severityFilter || undefined,
        }).then((r) => r.data),
        staleTime: 15_000,
    });

    const { data: summary } = useQuery({
        queryKey: ['securityAlertsSummary'],
        queryFn: () => adminGetSecurityAlertsSummary().then((r) => r.data),
        staleTime: 30_000,
    });

    const markRead = useMutation({
        mutationFn: adminMarkSecurityAlertRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });
            queryClient.invalidateQueries({ queryKey: ['securityAlertsSummary'] });
        },
    });

    const markAllRead = useMutation({
        mutationFn: adminMarkAllSecurityAlertsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });
            queryClient.invalidateQueries({ queryKey: ['securityAlertsSummary'] });
        },
    });

    const resolveAlert = useMutation({
        mutationFn: adminResolveSecurityAlert,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });
            queryClient.invalidateQueries({ queryKey: ['securityAlertsSummary'] });
        },
    });

    const severityBadge = (severity: string) => {
        const map: Record<string, string> = {
            critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        };
        return map[severity] || map.info;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <BellAlertIcon className="w-5 h-5" /> Security Alerts
                        {summary?.unread ? (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">{summary.unread}</span>
                        ) : null}
                    </h3>
                    <SecurityHelpButton
                        title="Security Alerts"
                        content="Automated alerts generated by the system for security-relevant events like brute-force attempts, unusual login patterns, or system errors."
                        impact="Alerts shorten the time between a security event and admin response."
                        affected="Admins monitoring login abuse, exports, dangerous deletes, and operational failures."
                        enabledNote="Unread alerts stay visible until they are marked read or resolved."
                        disabledNote="Without alerts, event review depends on manual log inspection."
                        bestPractice="Resolve critical alerts immediately and review the rest on a regular schedule."
                        variant="full"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        title="Filter by severity"
                        aria-label="Filter by severity"
                        value={severityFilter}
                        onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                        className="text-xs border rounded-lg px-2 py-1.5 bg-slate-950/70 border-white/10 text-slate-200"
                    >
                        <option value="">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="warning">Warning</option>
                        <option value="info">Info</option>
                    </select>
                    <button
                        onClick={() => markAllRead.mutate()}
                        disabled={markAllRead.isPending || !summary?.unread}
                        className="text-xs px-3 py-1.5 rounded-lg border bg-slate-950/70 border-white/10 text-slate-200 hover:bg-white/8 disabled:opacity-40 transition-colors"
                    >
                        Mark All Read
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="flex gap-3 flex-wrap">
                    {summary.bySeverity.map((s) => (
                        <div key={s._id} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${severityBadge(s._id)}`}>
                            {s._id}: {s.count}
                        </div>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-12"><ArrowPathIcon className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
                <>
                    <div className="space-y-2">
                        {(data?.items || []).map((alert: AdminSecurityAlertItem) => (
                            <motion.div
                                key={alert._id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={`rounded-xl border p-4 transition-colors ${
                                    alert.isRead
                                        ? 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                                        : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${severityBadge(alert.severity)}`}>
                                                {alert.severity}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{alert.type}</span>
                                            {!alert.isRead && (
                                                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                            )}
                                        </div>
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{alert.message}</p>
                                        <p className="text-[10px] text-gray-400 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
                                    </div>
                                    <div className="flex gap-1.5 flex-shrink-0">
                                        {!alert.isRead && (
                                            <button
                                                onClick={() => markRead.mutate(alert._id)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                                title="Mark as read"
                                            >
                                                <EyeIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                        {!alert.resolvedAt && (
                                            <button
                                                onClick={() => resolveAlert.mutate(alert._id)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                                                title="Resolve"
                                            >
                                                <CheckCircleIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {alert.resolvedAt && (
                                    <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3" />
                                        Resolved {new Date(alert.resolvedAt).toLocaleString()}
                                    </p>
                                )}
                            </motion.div>
                        ))}
                        {(!data?.items || data.items.length === 0) && (
                            <div className="text-center py-12 text-gray-400 text-sm">No security alerts</div>
                        )}
                    </div>
                    {data && data.pages > 1 && (
                        <div className="flex justify-center gap-2">
                            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 text-xs rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-600 disabled:opacity-40" title="Previous page">Prev</button>
                            <span className="text-xs text-gray-500 self-center">{page} / {data.pages}</span>
                            <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 text-xs rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-600 disabled:opacity-40" title="Next page">Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SECURITY CENTER LAYOUT — Tabbed Navigation Shell
   ═══════════════════════════════════════════════════════════════ */

type SecurityTab =
    | 'dashboard'
    | 'authentication'
    | 'password-policies'
    | 'two-factor'
    | 'sessions'
    | 'access-control'
    | 'api-route'
    | 'verification'
    | 'uploads'
    | 'alerts'
    | 'audit-logs'
    | 'backup'
    | 'settings'
    | 'help';

const TABS: { id: SecurityTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: ChartBarIcon },
    { id: 'authentication', label: 'Authentication', icon: LockClosedIcon },
    { id: 'password-policies', label: 'Password Policies', icon: ShieldCheckIcon },
    { id: 'two-factor', label: 'Two-Factor', icon: UserGroupIcon },
    { id: 'sessions', label: 'Sessions & Devices', icon: ClockIcon },
    { id: 'access-control', label: 'Access Control', icon: ShieldCheckIcon },
    { id: 'api-route', label: 'API & Routes', icon: ServerIcon },
    { id: 'verification', label: 'Verification', icon: CheckCircleIcon },
    { id: 'uploads', label: 'Uploads', icon: EyeIcon },
    { id: 'audit-logs', label: 'Audit Logs', icon: DocumentTextIcon },
    { id: 'alerts', label: 'Alerts', icon: BellAlertIcon },
    { id: 'backup', label: 'Backup Safety', icon: ServerIcon },
    { id: 'settings', label: 'All Settings', icon: Cog6ToothIcon },
    { id: 'help', label: 'Help', icon: InformationCircleIcon },
];

function SecurityHelpDocs() {
    const items = [
        ['Authentication & Login', 'Controls login attempts, generic errors, verification requirements, and suspicious login handling.'],
        ['Password Policies', 'Sets password rules, expiry, forced reset, and role-specific strength expectations.'],
        ['Two-Factor Authentication', 'Requires authenticator, email, or SMS verification for selected roles and sensitive actions.'],
        ['Sessions & Devices', 'Lets admins and users review active sessions, last activity, and revoke compromised devices.'],
        ['Access Control & Role Security', 'Backs UI restrictions with route and action-level backend permissions and optional approvals.'],
        ['Upload & File Security', 'Defines which file types are accepted, how large they can be, and whether protected delivery is enforced.'],
        ['Audit Logs & Alerts', 'Records who changed what, when it happened, and which events require immediate review.'],
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Security Help</h3>
                <SecurityHelpButton
                    title="Security Help"
                    content="This section explains what each security area controls and how to use the admin settings safely."
                    impact="It reduces accidental misconfiguration by keeping the controls explainable."
                    affected="Admins configuring security, approval, uploads, alerts, and session controls."
                    enabledNote="Help is available inline next to the controls and in the section cards below."
                    disabledNote="Without help, the same settings are easier to misuse or overlook."
                    bestPractice="Use this section before changing high-risk security settings."
                    variant="full"
                />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
            {items.map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-slate-950/65 p-5 shadow-[0_16px_30px_rgba(2,6,23,0.16)]">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                        <InformationCircleIcon className="h-4 w-4 text-blue-500" />
                        {title}
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{description}</p>
                    <p className="mt-3 text-xs text-slate-400">
                        Use the info buttons inside each card to understand who is affected, what risk is reduced, and what changes after enabling a control.
                    </p>
                </div>
            ))}
            </div>
        </div>
    );
}

export default function SecurityCenterLayout() {
    const [activeTab, setActiveTab] = useState<SecurityTab>('dashboard');

    const content = useMemo(() => {
        switch (activeTab) {
            case 'dashboard':
                return <SecurityDashboard />;
            case 'audit-logs':
                return <SecurityAuditLogs />;
            case 'alerts':
                return <SecurityAlertsTab />;
            case 'help':
                return <SecurityHelpDocs />;
            case 'authentication':
            case 'password-policies':
            case 'two-factor':
            case 'sessions':
            case 'access-control':
            case 'api-route':
            case 'verification':
            case 'uploads':
            case 'backup':
            case 'settings':
                return <SecuritySettingsPanel section={activeTab} />;
            default:
                return null;
        }
    }, [activeTab]);

    return (
        <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-slate-950/70 border border-white/8 rounded-2xl overflow-x-auto shadow-[0_12px_28px_rgba(2,6,23,0.18)]">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                                isActive
                                    ? 'bg-white/10 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/6'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {isActive && (
                                <motion.div
                                    layoutId="securityTabIndicator"
                                    className="absolute inset-0 bg-white/10 rounded-lg shadow-sm -z-10"
                                    transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {content}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export { SecurityHelpButton };
