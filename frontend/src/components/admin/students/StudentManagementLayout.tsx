import { NavLink, Outlet } from 'react-router-dom';
import AdminGuardShell from '../AdminGuardShell';
import { adminUi } from '../../../lib/appRoutes';
import {
    UserCog, UserPlus, Import, ClipboardList,
    MessageSquare, TrendingDown, Settings, CheckSquare,
} from 'lucide-react';

const TABS = [
    { to: adminUi('student-management/list'), label: 'All Students', icon: UserCog },
    { to: adminUi('student-management/create'), label: 'Create Student', icon: UserPlus },
    { to: adminUi('student-management/import-export'), label: 'Import / Export', icon: Import },
    { to: adminUi('student-management/groups'), label: 'Groups', icon: ClipboardList },
    { to: adminUi('student-management/crm-timeline'), label: 'CRM Timeline', icon: MessageSquare },
    { to: adminUi('student-management/weak-topics'), label: 'Weak Topics', icon: TrendingDown },
    { to: adminUi('student-management/profile-requests'), label: 'Profile Requests', icon: CheckSquare },
    { to: adminUi('student-management/settings'), label: 'Settings', icon: Settings },
] as const;

const baseCls =
    'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ' +
    'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800';
const activeCls =
    '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-900/30 dark:!text-indigo-300';

export default function StudentManagementLayout() {
    return (
        <AdminGuardShell title="Student Management" description="Manage students, groups, audiences, CRM, and related operations.">
            <div className="space-y-4">
                {/* Horizontal tab strip */}
                <nav className="hide-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
                    {TABS.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={label === 'All Students'}
                            className={({ isActive }) => `${baseCls} ${isActive ? activeCls : ''}`}
                        >
                            <Icon size={14} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* Child route renders here */}
                <Outlet />
            </div>
        </AdminGuardShell>
    );
}
