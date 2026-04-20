import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import AdminGuardShell from '../AdminGuardShell';
import { adminUi } from '../../../lib/appRoutes';
import {
    LayoutDashboard, ArrowLeftRight, FileText, Wallet,
    RefreshCw, Users, ReceiptText, Download, Upload, Settings, ClipboardList,
    Receipt,
} from 'lucide-react';

const TABS = [
    { to: adminUi('finance/dashboard'), label: 'Dashboard', icon: LayoutDashboard },
    { to: adminUi('finance/transactions'), label: 'Transactions', icon: ArrowLeftRight },
    { to: adminUi('finance/invoices'), label: 'Invoices', icon: FileText },
    { to: adminUi('finance/expenses'), label: 'Expenses', icon: Receipt },
    { to: adminUi('finance/budgets'), label: 'Budgets', icon: Wallet },
    { to: adminUi('finance/recurring'), label: 'Recurring', icon: RefreshCw },
    { to: adminUi('finance/vendors'), label: 'Vendors', icon: Users },
    { to: adminUi('finance/refunds'), label: 'Refunds', icon: ReceiptText },
    { to: adminUi('finance/export'), label: 'Export', icon: Download },
    { to: adminUi('finance/import'), label: 'Import', icon: Upload },
    { to: adminUi('finance/audit-log'), label: 'Audit Log', icon: ClipboardList },
    { to: adminUi('finance/settings'), label: 'Settings', icon: Settings },
] as const;

const baseCls =
    'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ' +
    'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800';
const activeCls =
    '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-900/30 dark:!text-indigo-300';

export default function FinanceLayout() {
    return (
        <AdminGuardShell
            title="Finance Center"
            description="Manage transactions, invoices, budgets, and financial operations."
            allowedRoles={['superadmin', 'admin', 'moderator', 'finance_agent']}
            requiredLegacyPermission="canManageFinance"
        >
            <div className="space-y-4">
                {/* Horizontal tab strip */}
                <nav className="hide-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
                    {TABS.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={label === 'Dashboard'}
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
