import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, Shield, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import ThemeSwitchPro from '../ui/ThemeSwitchPro';
import LanguageToggle from './LanguageToggle';
import { ADMIN_MENU_ITEMS, ADMIN_PATHS, isAdminPathActive, type AdminMenuItem } from '../../routes/adminPaths';
import { adminGetActionableAlerts, adminGetAdminUiLayout, adminMarkActionableAlertsRead } from '../../services/api';


type AdminShellProps = {
    title: string;
    description?: string;
    children: ReactNode;
};

const ACTIONABLE_ALERT_ROLES = new Set([
    'superadmin',
    'admin',
    'moderator',
    'viewer',
    'support_agent',
    'finance_agent',
]);

export default function AdminShell({ title, description, children }: AdminShellProps) {
    const queryClient = useQueryClient();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
    const [notifOpen, setNotifOpen] = useState(false);

    const notifRef = useRef<HTMLDivElement>(null);

    const { user, logout } = useAuth();
    const { hasAnyAccess } = useModuleAccess();
    const location = useLocation();
    const navigate = useNavigate();
    const canReadActionableAlerts = ACTIONABLE_ALERT_ROLES.has(String(user?.role || '').toLowerCase());

    const alertsQuery = useQuery({
        queryKey: ['admin', 'actionable-alerts', 'shell'],
        queryFn: async () => (await adminGetActionableAlerts({ page: 1, limit: 8 })).data,
        staleTime: 30_000,
        enabled: canReadActionableAlerts,
    });
    const adminUiLayoutQuery = useQuery({
        queryKey: ['admin', 'ui-layout'],
        queryFn: async () => (await adminGetAdminUiLayout()).data,
        staleTime: 60_000,
        enabled: Boolean(user),
    });
    const markReadMutation = useMutation({
        mutationFn: async (ids?: string[]) => (await adminMarkActionableAlertsRead(ids)).data,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['admin', 'actionable-alerts'] }),
                queryClient.invalidateQueries({ queryKey: ['admin', 'actionable-alerts', 'shell'] }),
            ]);
        },
    });
    const profilePhoto = String(user?.profile_photo || '').trim();

    const visibleMenuItems = useMemo(() => {
        return ADMIN_MENU_ITEMS.filter((item) => {
            if (item.allowedRoles && !item.allowedRoles.includes(String(user?.role || '') as typeof item.allowedRoles[number])) {
                return false;
            }
            if (!item.module) {
                if (item.requiredLegacyPermission && user?.role !== 'superadmin' && !user?.permissions?.[item.requiredLegacyPermission]) {
                    return false;
                }
                return true;
            }
            if (item.module === 'dashboard' || item.module === 'admin_profile') return true;
            const moduleVisible = hasAnyAccess(item.module);
            if (!moduleVisible) return false;
            // Legacy permission bits are kept for backward compatibility,
            // but module ACL is the canonical source for menu visibility.
            return true;
        });
    }, [hasAnyAccess, user]);

    const orderedVisibleMenuItems = useMemo(() => {
        const sidebarOrder = adminUiLayoutQuery.data?.layout?.sidebarOrder || [];
        if (!Array.isArray(sidebarOrder) || sidebarOrder.length === 0) {
            return visibleMenuItems;
        }

        const preferredIndex = new Map<string, number>();
        sidebarOrder.forEach((key, index) => {
            if (!preferredIndex.has(key)) {
                preferredIndex.set(String(key), index);
            }
        });
        const fallbackIndex = new Map<string, number>();
        visibleMenuItems.forEach((item, index) => {
            fallbackIndex.set(item.key, index);
        });

        return [...visibleMenuItems].sort((a, b) => {
            const aPreferred = preferredIndex.has(a.key) ? preferredIndex.get(a.key)! : Number.MAX_SAFE_INTEGER;
            const bPreferred = preferredIndex.has(b.key) ? preferredIndex.get(b.key)! : Number.MAX_SAFE_INTEGER;
            if (aPreferred !== bPreferred) return aPreferred - bPreferred;
            return (fallbackIndex.get(a.key) || 0) - (fallbackIndex.get(b.key) || 0);
        });
    }, [adminUiLayoutQuery.data?.layout?.sidebarOrder, visibleMenuItems]);

    const breadcrumb = useMemo(() => {
        if (location.pathname === '/__cw_admin__/settings') return 'Admin / Settings';
        if (location.pathname.startsWith('/__cw_admin__/settings/')) return `Admin / Settings / ${title}`;
        if (location.pathname.startsWith('/__cw_admin__/reports')) return 'Admin / Reports';
        if (location.pathname.startsWith('/__cw_admin__/finance')) return `Admin / Finance / ${title}`;
        if (location.pathname.startsWith('/__cw_admin__/news')) return `Admin / News / ${title}`;
        return `Admin / ${title}`;
    }, [location.pathname, title]);

    const currentRoute = `${location.pathname}${location.search}`;
    const alertItems = canReadActionableAlerts ? (alertsQuery.data?.items || []) : [];
    const unreadAlertCount = canReadActionableAlerts ? Number(alertsQuery.data?.unreadCount || 0) : 0;

    const matchesMenuPath = (targetPath: string): boolean => {
        if (!targetPath) return false;
        if (targetPath.includes('?')) {
            return currentRoute === targetPath;
        }
        return location.pathname === targetPath || location.pathname.startsWith(`${targetPath}/`);
    };

    // Auto-expand parent menus that contain the current route
    useEffect(() => {
        setExpandedMenus((prev) => {
            const next = { ...prev };
            for (const item of ADMIN_MENU_ITEMS) {
                if (!item.children) continue;
                const shouldExpand =
                    isAdminPathActive(location.pathname, item) ||
                    item.children.some((child) => matchesMenuPath(child.path));
                if (shouldExpand) next[item.key] = true;
            }
            return next;
        });
    }, [currentRoute, location.pathname]);

    useEffect(() => {
        const handleOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/__cw_admin__/login');
    };

    const toggleMenu = (key: string) => {
        setExpandedMenus((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const openAlert = async (id: string, linkUrl?: string) => {
        if (!canReadActionableAlerts) return;
        await markReadMutation.mutateAsync([id]);
        setNotifOpen(false);
        navigate(linkUrl || ADMIN_PATHS.campaignsNotifications);
    };

    const renderSidebarItem = (item: AdminMenuItem) => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedMenus[item.key];
        const active = isAdminPathActive(location.pathname, item) || matchesMenuPath(item.path);
        const Icon = item.icon;

        // Unread badge for Support & Communication
        const unreadCount = item.key === 'support' ? (alertsQuery.data?.unreadCount || 0) : 0;

        return (
            <div key={item.key} className="space-y-1">
                {hasChildren ? (
                    <div
                        className={`
                            flex items-center overflow-hidden rounded-2xl text-sm font-medium transition-all duration-200
                            ${active
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/10'
                                : 'text-slate-600 hover:bg-slate-100/90 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-indigo-300'
                            }
                        `}
                    >
                        <Link
                            to={item.path}
                            onClick={() => {
                                if (collapsed) {
                                    setCollapsed(false);
                                }
                                setDrawerOpen(false);
                            }}
                            title={collapsed ? item.label : undefined}
                            className={`
                                flex min-w-0 flex-1 items-center gap-3
                                ${collapsed ? 'justify-center px-2 py-3.5' : 'px-3.5 py-3'}
                            `}
                        >
                            <span className="relative flex-shrink-0">
                                {Icon && <Icon className="h-[18px] w-[18px]" />}
                                {collapsed && unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                            </span>
                            {!collapsed && (
                                <>
                                    <span className="truncate">{item.label}</span>
                                    {unreadCount > 0 && (
                                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm animate-pulse-slow">{unreadCount > 99 ? '99+' : unreadCount}</span>
                                    )}
                                </>
                            )}
                        </Link>
                        {!collapsed && (
                            <button
                                type="button"
                                onClick={() => toggleMenu(item.key)}
                                aria-label={`Toggle ${item.label}`}
                                className={`
                                    inline-flex items-center justify-center self-stretch px-3 text-current/70 transition-colors
                                    ${active ? 'hover:text-white' : 'hover:text-indigo-600 dark:hover:text-indigo-300'}
                                `}
                            >
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                        )}
                    </div>
                ) : (
                    <div
                        className={`
                            flex items-center overflow-hidden rounded-2xl text-sm font-medium transition-all duration-200
                            ${active
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/10'
                                : 'text-slate-600 hover:bg-slate-100/90 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-indigo-300'
                            }
                        `}
                    >
                        <Link
                            to={item.path}
                            onClick={() => setDrawerOpen(false)}
                            title={collapsed ? item.label : undefined}
                            className={`
                                flex min-w-0 flex-1 items-center gap-3
                                ${collapsed ? 'justify-center px-2 py-3.5' : 'px-3.5 py-3'}
                            `}
                        >
                            <span className="relative flex-shrink-0">
                                {Icon && <Icon className="h-[18px] w-[18px]" />}
                                {collapsed && unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                            </span>
                            {!collapsed && (
                                <>
                                    <span className="truncate">{item.label}</span>
                                    {unreadCount > 0 && (
                                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm animate-pulse-slow">{unreadCount > 99 ? '99+' : unreadCount}</span>
                                    )}
                                </>
                            )}
                        </Link>
                    </div>
                )}

                {!collapsed && hasChildren && isExpanded && (
                    <div className="ml-7 space-y-1 border-l border-indigo-500/15 pl-4 dark:border-indigo-500/20">
                        {item.children!.map((child) => {
                            const childActive = matchesMenuPath(child.path);
                            const ChildIcon = child.icon;
                            return (
                                <div
                                    key={child.key}
                                    className={`
                                        flex items-center gap-2 rounded-xl text-[13px] transition-all duration-200
                                        ${childActive
                                            ? 'bg-indigo-500/10 font-medium text-indigo-600 shadow-sm dark:bg-indigo-500/15 dark:text-indigo-300'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-indigo-300'
                                        }
                                    `}
                                >
                                    <Link
                                        to={child.path}
                                        onClick={() => setDrawerOpen(false)}
                                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
                                    >
                                        {ChildIcon && <ChildIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                                        <span className="truncate">{child.label}</span>
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.16),_transparent_24%),rgb(2,6,23)] dark:text-white">
            <div className="flex min-h-screen">
                {/* Mobile backdrop */}
                {drawerOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                        onClick={() => setDrawerOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside
                    className={`
                        fixed inset-y-0 left-0 z-50 flex flex-col
                        bg-white/95 shadow-2xl shadow-slate-900/5 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80
                        border-r border-slate-200 dark:border-indigo-500/10
                        transition-all duration-300 ease-in-out
                        w-64 ${collapsed ? 'lg:w-[72px]' : ''}
                        ${drawerOpen ? 'translate-x-0 visible pointer-events-auto' : '-translate-x-full invisible pointer-events-none'}
                        lg:translate-x-0 lg:visible lg:pointer-events-auto lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0
                    `}
                >
                    {/* Logo / Brand */}
                    <div className={`flex items-center border-b border-slate-200 px-4 py-5 dark:border-indigo-500/10 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                        <Link to="/__cw_admin__/dashboard" className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/20">
                                <Shield className="h-5 w-5 text-white" />
                            </div>
                            {!collapsed && (
                                <div className="overflow-hidden">
                                    <p className="text-sm font-bold tracking-wide text-slate-900 dark:text-white">CampusWay</p>
                                    <p className="text-[10px] uppercase tracking-widest text-indigo-600/70 dark:text-indigo-300/60">Admin Panel</p>
                                </div>
                            )}
                        </Link>
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(false)}
                            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden"
                        >
                            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        </button>
                    </div>

                    {/* Desktop collapse toggle */}
                    <button
                        type="button"
                        onClick={() => setCollapsed(!collapsed)}
                        className="absolute -right-3 top-24 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md transition-colors hover:bg-indigo-500/10 dark:border-indigo-500/20 dark:bg-slate-900/95 dark:hover:bg-indigo-500/20 lg:flex"
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed
                            ? <ChevronRight className="h-3 w-3 text-indigo-500 dark:text-indigo-300" />
                            : <ChevronLeft className="h-3 w-3 text-indigo-500 dark:text-indigo-300" />}
                    </button>

                    {/* Navigation */}
                    <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {orderedVisibleMenuItems.map(renderSidebarItem)}
                    </nav>

                    {/* User info + Logout */}
                    <div className={`border-t border-slate-200 bg-slate-50/70 p-3 dark:border-indigo-500/10 dark:bg-slate-950/65 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
                        {!collapsed && (
                            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-indigo-500/10 dark:bg-slate-900/55">
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-md">
                                    {profilePhoto ? (
                                        <img src={profilePhoto} alt={user?.fullName || user?.username || 'Admin'} className="h-full w-full object-cover" />
                                    ) : (
                                        (user?.fullName || user?.username || 'A').charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{user?.fullName || user?.username || 'Admin'}</p>
                                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{user?.email}</p>
                                </div>
                            </div>
                        )}
                        {collapsed && (
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white">
                                {profilePhoto ? (
                                    <img src={profilePhoto} alt={user?.fullName || user?.username || 'Admin'} className="h-full w-full object-cover" />
                                ) : (
                                    (user?.fullName || user?.username || 'A').charAt(0).toUpperCase()
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleLogout}
                            title="Sign Out"
                            className={`
                                flex items-center justify-center gap-2 rounded-xl py-2 text-sm text-red-500
                                transition-colors hover:bg-red-500/10
                                ${collapsed ? 'h-10 w-10' : 'w-full'}
                            `}
                        >
                            <LogOut className="h-4 w-4" />
                            {!collapsed && <span>Sign Out</span>}
                        </button>
                    </div>
                </aside>

                {/* Main content */}
                <main className="min-w-0 flex-1 overflow-x-hidden">
                    {/* Header */}
                    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 backdrop-blur dark:border-slate-800 dark:bg-slate-950/88">
                        <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
                            <div className="flex min-w-0 items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400 lg:hidden"
                                    onClick={() => setDrawerOpen(true)}
                                    aria-label="Open admin menu"
                                >
                                    <Menu className="h-4 w-4" />
                                </button>
                                <div className="min-w-0">
                                    <p className="truncate text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">{breadcrumb}</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">{title}</h1>
                                    </div>
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">

                                <LanguageToggle />
                                <ThemeSwitchPro />
                                {canReadActionableAlerts && (
                                    <div ref={notifRef} className="relative">
                                        <button
                                            type="button"
                                            aria-label="Notifications"
                                            onClick={() => setNotifOpen((prev) => !prev)}
                                            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                                        >
                                            <Bell className="h-4 w-4" />
                                            {unreadAlertCount > 0 && (
                                                <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                                                    {unreadAlertCount}
                                                </span>
                                            )}
                                        </button>
                                        {notifOpen && (
                                            <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                                                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950/70">
                                                    <span>Admin Alerts</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(ADMIN_PATHS.campaignsNotifications)}
                                                        className="text-xs text-indigo-600 dark:text-indigo-300"
                                                    >
                                                        Open center
                                                    </button>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto">
                                                    {alertItems.length === 0 ? (
                                                        <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                                                            No actionable alerts right now.
                                                        </div>
                                                    ) : alertItems.map((item) => (
                                                        <button
                                                            key={item._id}
                                                            type="button"
                                                            onClick={() => void openAlert(item._id, item.linkUrl)}
                                                            className={`block w-full border-b border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 ${item.isRead ? '' : 'bg-indigo-50/70 dark:bg-indigo-500/10'
                                                                }`}
                                                        >
                                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.message}</p>
                                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                                {new Date(item.publishAt).toLocaleString()}
                                                            </p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2 py-1 text-xs dark:border-slate-700"
                                    onClick={() => navigate(ADMIN_PATHS.adminProfile)}
                                >
                                    <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white">
                                        {profilePhoto ? (
                                            <img src={profilePhoto} alt={user?.fullName || user?.username || 'Admin'} className="h-full w-full object-cover" />
                                        ) : (
                                            (user?.fullName || user?.username || 'A').slice(0, 1).toUpperCase()
                                        )}
                                    </span>
                                    <span className="hidden max-w-[110px] truncate sm:inline text-slate-700 dark:text-slate-300">{user?.fullName || user?.username || 'Admin'}</span>
                                </button>
                            </div>
                        </div>

                    </header>

                    <div className="px-4 py-6 sm:px-6 lg:px-7">
                        {description ? <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
