import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Bell,
    BookOpenCheck,
    ChevronRight,
    CreditCard,
    Home,
    LifeBuoy,
    Menu,
    MenuSquare,
    NotebookText,
    Shield,
    X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getStudentMeNotifications } from '../../services/api';
import GlobalAlertGate from '../../components/student/GlobalAlertGate';

type NavItem = {
    label: string;
    path: string;
    icon: ReactNode;
};

const NAV_ITEMS: NavItem[] = [
    { label: 'Overview', path: '/dashboard', icon: <Home className="w-4 h-4" /> },
    { label: 'Exams', path: '/student/exams-hub', icon: <BookOpenCheck className="w-4 h-4" /> },
    { label: 'Results', path: '/results', icon: <NotebookText className="w-4 h-4" /> },
    { label: 'Payments', path: '/payments', icon: <CreditCard className="w-4 h-4" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="w-4 h-4" /> },
    { label: 'Security', path: '/profile/security', icon: <Shield className="w-4 h-4" /> },
    { label: 'Resources', path: '/student/resources', icon: <MenuSquare className="w-4 h-4" /> },
    { label: 'Support', path: '/support', icon: <LifeBuoy className="w-4 h-4" /> },
];

const QUICK_NAV_PATHS = ['/dashboard', '/student/exams-hub', '/results', '/profile/security'] as const;

function isActivePath(currentPath: string, targetPath: string): boolean {
    if (targetPath === '/dashboard') {
        return currentPath === '/dashboard' || currentPath === '/student/dashboard' || currentPath === '/profile';
    }
    if (targetPath === '/profile/security') {
        return currentPath === '/profile/security' || currentPath === '/student/security';
    }
    if (targetPath === '/results') {
        return currentPath === '/results' || currentPath.startsWith('/results/');
    }
    if (targetPath === '/student/exams-hub') {
        return currentPath === '/student/exams-hub' || currentPath.startsWith('/exams/');
    }
    if (targetPath === '/student/resources') {
        return currentPath === '/student/resources';
    }
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function StudentNavigation({
    pathname,
    onSelect,
    unreadNotifCount = 0,
}: {
    pathname: string;
    onSelect?: () => void;
    unreadNotifCount?: number;
}) {
    return (
        <div className="space-y-2">
            <div className="px-3 pb-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Navigation
                </h2>
            </div>
            {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.path);
                const showBadge = item.path === '/notifications' && unreadNotifCount > 0;
                return (
                    <Link
                        key={`side-${item.path}`}
                        to={item.path}
                        onClick={onSelect}
                        className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ${active
                            ? 'bg-white dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-indigo-500/20'
                            : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={`relative p-1.5 rounded-lg transition-colors duration-300 ${active
                                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                                    : 'bg-transparent text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                                    }`}
                            >
                                {item.icon}
                                {showBadge && (
                                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
                                        {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                                    </span>
                                )}
                            </div>
                            {item.label}
                        </div>
                        {active ? (
                            <ChevronRight className="w-4 h-4 text-indigo-400 dark:text-indigo-500 opacity-60" />
                        ) : showBadge ? (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[max(10px,0.625rem)] font-bold text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
        </div>
    );
}

export default function StudentLayout() {
    const { isAuthenticated, isLoading, user } = useAuth();
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Fetch unread notification count for badge
    const notifQuery = useQuery({
        queryKey: ['student-hub', 'notifications', 'all'],
        queryFn: async () => (await getStudentMeNotifications('all')).data,
        staleTime: 30_000,
        refetchInterval: 60_000,
        enabled: isAuthenticated && user?.role === 'student',
    });
    const unreadNotifCount = Number(notifQuery.data?.unreadCount || 0);

    const quickNavItems = useMemo(
        () => NAV_ITEMS.filter((item) => QUICK_NAV_PATHS.includes(item.path as (typeof QUICK_NAV_PATHS)[number])),
        [],
    );

    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        if (drawerOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = previousOverflow || '';
        }
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [drawerOpen]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (user && user.role !== 'student') {
        if (user.role === 'chairman') return <Navigate to="/chairman/dashboard" replace />;
        return <Navigate to="/__cw_admin__/dashboard" replace />;
    }

    const activeItem = NAV_ITEMS.find((item) => isActivePath(location.pathname, item.path));
    const moreActive = Boolean(activeItem && !quickNavItems.some((item) => item.path === activeItem.path));

    return (
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans">
            <GlobalAlertGate />

            <div className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-6 py-5 md:py-8 flex gap-6 xl:gap-8">
                <aside className="hidden lg:block w-[260px] shrink-0">
                    <div className="sticky top-[88px] rounded-3xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] p-4">
                        <StudentNavigation pathname={location.pathname} unreadNotifCount={unreadNotifCount} />
                    </div>
                </aside>

                <main className="flex-1 min-w-0 pb-24 lg:pb-6 flex flex-col items-center lg:items-start">
                    <header className="w-full max-w-5xl sticky top-[76px] z-20 mb-6 flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 backdrop-blur-md shadow-sm dark:border-white/10 dark:bg-slate-900/60 transition-all duration-300">
                        <div className="min-w-0 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(true)}
                                className="inline-flex lg:hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                                aria-label="Open student navigation"
                            >
                                <Menu className="w-5 h-5" />
                            </button>
                            <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-cyan-400" />
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                    Student Portal
                                </p>
                                <p className="truncate text-base font-bold text-slate-800 dark:text-slate-100">
                                    {activeItem?.label || 'Overview'}
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-300">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                            Student navigation ready
                        </div>
                    </header>

                    <div className="w-full max-w-5xl">
                        <Outlet />
                    </div>
                </main>
            </div>

            <div
                className={`fixed inset-0 z-50 lg:hidden transition ${drawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
                aria-hidden={!drawerOpen}
            >
                <div
                    className={`absolute inset-0 bg-slate-950/55 backdrop-blur-sm transition-opacity ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
                    onClick={() => setDrawerOpen(false)}
                />
                <aside
                    className={`absolute inset-y-0 left-0 w-full max-w-[320px] bg-[#F8FAFC] px-4 py-5 shadow-2xl transition-transform dark:bg-[#0B1120] ${drawerOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    <div className="flex items-center justify-between pb-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                Student Portal
                            </p>
                            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                                Quick Navigation
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200"
                            aria-label="Close student navigation"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
                        <StudentNavigation pathname={location.pathname} onSelect={() => setDrawerOpen(false)} unreadNotifCount={unreadNotifCount} />
                    </div>
                </aside>
            </div>

            <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/50 dark:border-slate-800/50 bg-white/85 dark:bg-slate-900/88 backdrop-blur-xl px-2 py-2 pb-safe">
                <div className="mx-auto flex max-w-md items-center justify-between gap-1">
                    {quickNavItems.map((item) => {
                        const active = isActivePath(location.pathname, item.path);
                        return (
                            <Link
                                key={`mobile-${item.path}`}
                                to={item.path}
                                className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-2.5 min-h-[44px] transition-all duration-300 ${active
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                    }`}
                            >
                                <div className={`rounded-xl p-1 transition-all duration-300 ${active ? 'scale-110' : 'scale-100'}`}>
                                    {item.icon}
                                </div>
                                <span className={`mt-1 text-[10px] whitespace-nowrap ${active ? 'font-bold' : 'font-medium opacity-80'}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-2.5 min-h-[44px] transition-all duration-300 ${moreActive || drawerOpen
                            ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        aria-label="More student navigation"
                    >
                        <div className={`rounded-xl p-1 transition-all duration-300 ${moreActive || drawerOpen ? 'scale-110' : 'scale-100'}`}>
                            <Menu className="w-4 h-4" />
                        </div>
                        <span className={`mt-1 text-[10px] whitespace-nowrap ${moreActive || drawerOpen ? 'font-bold' : 'font-medium opacity-80'}`}>
                            More
                        </span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
