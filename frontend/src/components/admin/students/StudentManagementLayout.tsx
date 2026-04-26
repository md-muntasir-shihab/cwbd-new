import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AdminGuardShell from '../AdminGuardShell';
import { adminUi } from '../../../lib/appRoutes';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { usePendingApprovals } from '../../../hooks/useApprovalQueries';
import {
    UserCog, UserPlus, Import, ClipboardList,
    MessageSquare, TrendingDown, Settings, CheckSquare,
    ChevronDown, ShieldCheck,
} from 'lucide-react';

const TABS = [
    { to: adminUi('student-management/list'), label: 'All Students', icon: UserCog, badge: false },
    { to: adminUi('student-management/create'), label: 'Create Student', icon: UserPlus, badge: false },
    { to: adminUi('student-management/import-export'), label: 'Import / Export', icon: Import, badge: false },
    { to: adminUi('student-management/groups'), label: 'Groups', icon: ClipboardList, badge: false },
    { to: adminUi('student-management/crm-timeline'), label: 'CRM Timeline', icon: MessageSquare, badge: false },
    { to: adminUi('student-management/weak-topics'), label: 'Weak Topics', icon: TrendingDown, badge: false },
    { to: adminUi('student-management/profile-requests'), label: 'Profile Requests', icon: CheckSquare, badge: false },
    { to: ADMIN_PATHS.pendingApprovals, label: 'Pending Approvals', icon: ShieldCheck, badge: true },
    { to: adminUi('student-management/settings'), label: 'Settings', icon: Settings, badge: false },
] as const;

const baseCls =
    'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ' +
    'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800';
const activeCls =
    '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-900/30 dark:!text-indigo-300';

export default function StudentManagementLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentTab = TABS.find((t) => location.pathname.startsWith(t.to))?.to ?? TABS[0].to;
    const { data: approvalData } = usePendingApprovals();
    const pendingCount = (approvalData?.registrationCount ?? 0) + (approvalData?.profileChangeCount ?? 0);

    return (
        <AdminGuardShell title="Student Management" description="Manage students, groups, audiences, CRM, and related operations.">
            <div className="space-y-4">
                {/* Mobile: dropdown select */}
                <div className="relative md:hidden">
                    <select
                        value={currentTab}
                        onChange={(e) => navigate(e.target.value)}
                        aria-label="Student management section"
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                        {TABS.map(({ to, label, badge }) => (
                            <option key={to} value={to}>
                                {label}{badge && pendingCount > 0 ? ` (${pendingCount})` : ''}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                {/* Desktop: horizontal tab strip */}
                <nav className="hide-scrollbar hidden gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 md:flex dark:border-slate-700 dark:bg-slate-900">
                    {TABS.map(({ to, label, icon: Icon, badge }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={label === 'All Students'}
                            className={({ isActive }) => `${baseCls} ${isActive ? activeCls : ''}`}
                        >
                            <Icon size={14} />
                            {label}
                            {badge && pendingCount > 0 && (
                                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                                    {pendingCount}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Child route renders here */}
                <Outlet />
            </div>
        </AdminGuardShell>
    );
}
