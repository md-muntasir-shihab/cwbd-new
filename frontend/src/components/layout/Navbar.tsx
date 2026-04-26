import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWebsiteSettings } from '../../hooks/useWebsiteSettings';
import ThemeSwitchPro from '../ui/ThemeSwitchPro';
import GlobalSearchModal from '../common/GlobalSearchModal';
import FocusTrap from '../common/FocusTrap';
import { getStudentMeNotifications } from '../../services/api';
import { buildMediaUrl } from '../../utils/mediaUrl';

const BASE_LINKS = [
    { name: 'Home', path: '/' },
    { name: 'Universities', path: '/universities' },
    { name: 'Exams', path: '/exams' },
    { name: 'News', path: '/news' },
    { name: 'Resources', path: '/resources' },
    { name: 'Testimonials', path: '/testimonials' },
    { name: 'Contact', path: '/contact' },
];

export default function Navbar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [logoLoadFailed, setLogoLoadFailed] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const { user, logout, isLoading: authLoading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Student app routes have their own navigation — hide the main hamburger menu there
    const isStudentAppRoute = ['/student/', '/dashboard', '/profile', '/results', '/payments', '/notifications', '/support']
        .some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
    const { data: settings, isLoading: isSettingsLoading } = useWebsiteSettings();
    const hasResolvedSettings = Boolean(settings) || !isSettingsLoading;
    const brandName = hasResolvedSettings
        ? (String(settings?.websiteName || 'CampusWay').trim() || 'CampusWay')
        : '';
    // Build media URL that supports both local and production deployments
    const brandLogo = buildMediaUrl(settings?.logoUrl || '/logo.svg');
    const brandMotto = String(settings?.motto || settings?.metaDescription || '').trim();
    const isStudentUser = user?.role === 'student';
    const isAdminUser = Boolean(user && user.role !== 'student' && user.role !== 'chairman');
    const dashboardPath = user?.role === 'student'
        ? '/dashboard'
        : user?.role === 'chairman'
            ? '/chairman/dashboard'
            : isAdminUser
                ? '/__cw_admin__/dashboard'
                : null;
    const studentNotificationsQuery = useQuery({
        queryKey: ['student-hub', 'notifications', 'all'],
        queryFn: async () => (await getStudentMeNotifications('all')).data,
        enabled: isStudentUser && !authLoading,
        staleTime: 30_000,
    });
    const unreadCount = Number(studentNotificationsQuery.data?.unreadCount || 0);

    const navLinks = useMemo(() => BASE_LINKS, []);

    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileOpen) return;
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileOpen(false);
        };
        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [mobileOpen]);

    useEffect(() => {
        setLogoLoadFailed(false);
    }, [brandLogo]);

    // Keyboard shortcut: Ctrl/Cmd+K opens global search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const openSearch = useCallback(() => setSearchOpen(true), []);
    const closeSearch = useCallback(() => setSearchOpen(false), []);

    // Preload the logo image so the browser starts fetching it before React renders the <img>
    const shouldPreloadLogo = Boolean(brandLogo && !brandLogo.startsWith('data:'));

    return (
        <>
            {shouldPreloadLogo && (
                <Helmet>
                    <link rel="preload" as="image" href={brandLogo} />
                </Helmet>
            )}
            <header className="sticky top-0 z-50 bg-surface/85 dark:bg-dark-surface/85 backdrop-blur-xl border-b border-card-border/70 dark:border-dark-border/70">
                <nav aria-label="Main navigation" className="section-container h-16 flex items-center justify-between gap-3">
                    <Link to="/" className="flex items-center gap-2.5 min-w-0 flex-1 lg:flex-none" aria-label={`${brandName} home`}>
                        <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 overflow-hidden rounded-lg flex items-center justify-center">
                            {!logoLoadFailed && hasResolvedSettings ? (
                                <img
                                    src={brandLogo}
                                    alt={brandName}
                                    className="h-full w-full object-contain"
                                    onError={() => setLogoLoadFailed(true)}
                                />
                            ) : hasResolvedSettings ? (
                                <span className="text-xs font-heading font-bold text-text dark:text-dark-text">
                                    {brandName.slice(0, 2).toUpperCase()}
                                </span>
                            ) : (
                                <div className="h-full w-full animate-pulse rounded-lg bg-card-border/70 dark:bg-dark-border/70" />
                            )}
                        </div>
                        <div className="min-w-0">
                            {hasResolvedSettings ? (
                                <>
                                    <p className="truncate text-sm sm:text-base font-heading font-semibold text-text dark:text-dark-text">
                                        {brandName}
                                    </p>
                                    {brandMotto && !isStudentAppRoute ? (
                                        <p className="truncate text-[10px] sm:text-[11px] text-text-muted dark:text-dark-text/70">
                                            {brandMotto}
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <div className="space-y-1">
                                    <div className="h-3 w-24 animate-pulse rounded bg-card-border/70 dark:bg-dark-border/70" />
                                    <div className="h-2.5 w-32 animate-pulse rounded bg-card-border/60 dark:bg-dark-border/60" />
                                </div>
                            )}
                        </div>
                    </Link>

                    <div className="hidden lg:flex items-center gap-1">
                        {navLinks.map((link) => {
                            const active = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    aria-current={active ? 'page' : undefined}
                                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${active
                                        ? 'bg-primary text-white'
                                        : 'text-text-muted dark:text-dark-text/70 hover:text-primary hover:bg-primary/5 dark:hover:text-dark-text'
                                        }`}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                            type="button"
                            onClick={openSearch}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-border/70 dark:border-dark-border/70 px-2.5 text-text-muted dark:text-dark-text/70 hover:bg-primary/5 hover:text-primary transition-colors"
                            aria-label="Open search (Ctrl+K)"
                        >
                            <Search className="w-4 h-4" />
                            <span className="hidden sm:inline text-xs">Search</span>
                            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-card-border/50 dark:border-dark-border/50 bg-surface/50 dark:bg-dark-surface/50 px-1 py-0.5 text-[10px] text-text-muted/60 dark:text-dark-text/40">
                                ⌘K
                            </kbd>
                        </button>
                        <ThemeSwitchPro />
                        <Link to="/subscription-plans" className="hidden sm:inline-flex btn-outline text-sm py-2 px-3 rounded-full" aria-label="View subscription plans">
                            Plans
                        </Link>
                        {isStudentUser && (
                            <Link
                                to="/notifications"
                                className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${location.pathname === '/notifications' || location.pathname.startsWith('/notifications/')
                                    ? 'border-primary/60 bg-primary/10 text-primary'
                                    : 'border-card-border/70 dark:border-dark-border/70 text-text-muted dark:text-dark-text/70 hover:bg-primary/5 hover:text-primary'
                                    }`}
                                aria-label="Open notifications"
                                title="Notifications"
                            >
                                <Bell className="h-4 w-4" />
                                {unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </Link>
                        )}

                        {authLoading ? (
                            <Link to="/login" className="btn-primary text-sm py-2 px-4 rounded-full">Login</Link>
                        ) : user ? (
                            <div className="relative group">
                                <div
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full p-0.5 pr-1 sm:p-1 sm:pr-2 hover:bg-primary/5"
                                    role="button"
                                    aria-label="User menu"
                                    aria-haspopup="true"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (isAdminUser && dashboardPath) {
                                            navigate(dashboardPath);
                                        }
                                    }}
                                >
                                    <div className="h-8 w-8 rounded-full aspect-square overflow-hidden border border-card-border/70 dark:border-dark-border/70 bg-surface dark:bg-dark-surface flex items-center justify-center">
                                        {user.profile_photo ? (
                                            <img src={buildMediaUrl(user.profile_photo)} alt={user.fullName || user.username} className="h-full w-full rounded-full aspect-square object-cover" />
                                        ) : (
                                            <UserIcon className="w-4 h-4 text-primary" aria-hidden="true" />
                                        )}
                                    </div>
                                    <ChevronDown className="hidden sm:block w-4 h-4 text-text-muted dark:text-dark-text/70" aria-hidden="true" />
                                </div>

                                <div role="menu" className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-card-border/70 dark:border-dark-border/70 bg-surface dark:bg-dark-surface shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                                    {dashboardPath ? (
                                        <Link
                                            to={dashboardPath}
                                            role="menuitem"
                                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-primary/10"
                                        >
                                            <Settings className="w-4 h-4" aria-hidden="true" />
                                            Dashboard
                                        </Link>
                                    ) : null}
                                    {user.role === 'student' && (
                                        <Link to="/student/profile" role="menuitem" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-primary/10">
                                            <UserIcon className="w-4 h-4" aria-hidden="true" />
                                            Profile
                                        </Link>
                                    )}
                                    <button
                                        type="button"
                                        onClick={logout}
                                        role="menuitem"
                                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10"
                                    >
                                        <LogOut className="w-4 h-4" aria-hidden="true" />
                                        Logout
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <Link to="/login" className="btn-primary text-sm py-2 px-4 rounded-full">Login</Link>
                        )}

                        {!isStudentAppRoute && (
                            <button
                                type="button"
                                onClick={() => setMobileOpen((prev) => !prev)}
                                className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-card-border dark:border-dark-border"
                                aria-label="Toggle menu"
                                aria-expanded={mobileOpen}
                            >
                                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                            </button>
                        )}
                    </div>
                </nav>

                {mobileOpen && !isStudentAppRoute && (
                    <FocusTrap active={mobileOpen}>
                        <div className="lg:hidden border-t border-card-border/70 dark:border-dark-border/70 bg-surface dark:bg-dark-surface" role="navigation" aria-label="Mobile navigation">
                            <div className="section-container py-3 space-y-1">
                                <Link
                                    to="/subscription-plans"
                                    aria-current={location.pathname === '/subscription-plans' || location.pathname === '/pricing' ? 'page' : undefined}
                                    className={`block rounded-xl px-3 py-2 text-sm ${location.pathname === '/subscription-plans' || location.pathname === '/pricing'
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-text-muted dark:text-dark-text/70 hover:bg-primary/5'
                                        }`}
                                >
                                    Subscription Plans
                                </Link>
                                {navLinks.map((link) => {
                                    const active = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
                                    return (
                                        <Link
                                            key={link.path}
                                            to={link.path}
                                            aria-current={active ? 'page' : undefined}
                                            className={`block rounded-xl px-3 py-2 text-sm ${active ? 'bg-primary/10 text-primary' : 'text-text-muted dark:text-dark-text/70 hover:bg-primary/5'
                                                }`}
                                        >
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </FocusTrap>
                )}
            </header>
            <GlobalSearchModal open={searchOpen} onClose={closeSearch} />
        </>
    );
}
