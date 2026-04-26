import { useState, useEffect } from 'react';
import { Users, FileText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import { usePendingApprovals, approvalKeys } from '../../../hooks/useApprovalQueries';
import RegistrationApprovalTable from '../../../components/admin/students/RegistrationApprovalTable';
import ProfileChangeReviewPanel from '../../../components/admin/students/ProfileChangeReviewPanel';
import { getAdminLiveStreamUrl } from '../../../services/api';

type Tab = 'registrations' | 'profile-changes';

function TabButton({
    active,
    onClick,
    icon: Icon,
    label,
    count,
}: {
    active: boolean;
    onClick: () => void;
    icon: typeof Users;
    label: string;
    count?: number;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
        >
            <Icon size={16} />
            {label}
            {typeof count === 'number' && count > 0 && (
                <span className={`ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                    {count}
                </span>
            )}
        </button>
    );
}

export default function PendingApprovalsPage() {
    const [tab, setTab] = useState<Tab>('registrations');
    const { data, isLoading } = usePendingApprovals();
    const queryClient = useQueryClient();

    // Listen for SSE approval-queue-updated events and invalidate cache (Requirement 10.7)
    useEffect(() => {
        let cancelled = false;
        let source: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let backoffMs = 1000;

        const connect = () => {
            if (cancelled) return;
            try {
                source = new EventSource(getAdminLiveStreamUrl(), { withCredentials: true });
                source.addEventListener('approval-queue-updated', () => {
                    queryClient.invalidateQueries({ queryKey: approvalKeys.pendingApprovals() });
                    queryClient.invalidateQueries({ queryKey: approvalKeys.profileRequests() });
                });
                source.onopen = () => { backoffMs = 1000; };
                source.onerror = () => {
                    source?.close();
                    if (cancelled) return;
                    reconnectTimer = setTimeout(connect, backoffMs);
                    backoffMs = Math.min(backoffMs * 2, 30000);
                };
            } catch {
                // SSE connection failure is non-critical — retry with backoff
                if (!cancelled) {
                    reconnectTimer = setTimeout(connect, backoffMs);
                    backoffMs = Math.min(backoffMs * 2, 30000);
                }
            }
        };

        connect();

        return () => {
            cancelled = true;
            source?.close();
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };
    }, [queryClient]);

    const registrationCount = data?.registrationCount ?? 0;
    const profileChangeCount = data?.profileChangeCount ?? 0;

    return (
        <AdminGuardShell
            title="Pending Approvals"
            description="Review and manage student registration approvals and profile change requests."
        >
            <div className="space-y-4">
                {/* Tab bar */}
                <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
                    <TabButton
                        active={tab === 'registrations'}
                        onClick={() => setTab('registrations')}
                        icon={Users}
                        label="New Registrations"
                        count={registrationCount}
                    />
                    <TabButton
                        active={tab === 'profile-changes'}
                        onClick={() => setTab('profile-changes')}
                        icon={FileText}
                        label="Profile Changes"
                        count={profileChangeCount}
                    />
                </div>

                {/* Tab content */}
                {isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
                        ))}
                    </div>
                ) : tab === 'registrations' ? (
                    <RegistrationApprovalTable registrations={data?.registrations ?? []} />
                ) : (
                    <ProfileChangeReviewPanel requests={data?.profileChanges ?? []} />
                )}
            </div>
        </AdminGuardShell>
    );
}
