import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    ArrowRight,
    BellRing,
    BarChart3,
    BookOpen,
    CheckCircle2,
    GripVertical,
    Home,
    Image,
    LayoutPanelLeft,
    RotateCcw,
    Save,
    ScrollText,
    Settings,
    Shield,
    SlidersHorizontal,
    Plug,
    User,
} from 'lucide-react';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import { useAuth } from '../hooks/useAuth';
import { ADMIN_MENU_ITEMS } from '../routes/adminPaths';
import { adminGetAdminUiLayout, adminUpdateAdminUiLayout, type AdminUiLayoutSettings } from '../services/api';


const settingsCards = [
    { key: 'settings-home', title: 'Home Control', description: 'Manage home sections, visibility, timeline, and live sync.', icon: Home, to: '/__cw_admin__/settings/home-control' },
    { key: 'settings-university', title: 'University Settings', description: 'Browse defaults, home university sections, featured content, cluster feed order, and display defaults.', icon: SlidersHorizontal, to: '/__cw_admin__/settings/university-settings' },
    { key: 'settings-reports', title: 'Reports', description: 'View KPI reports, exam insights, and exports.', icon: BarChart3, to: '/__cw_admin__/reports' },
    { key: 'settings-notifications', title: 'Notifications', description: 'Set automation triggers and reminder timing.', icon: BellRing, to: '/__cw_admin__/settings/notifications' },
    { key: 'settings-analytics', title: 'Analytics', description: 'Toggle event tracking and analytics privacy controls.', icon: BarChart3, to: '/__cw_admin__/settings/analytics' },
    { key: 'settings-integrations', title: 'Integrations', description: 'Configure search, image, email, marketing, notification, analytics and backup services.', icon: Plug, to: '/__cw_admin__/settings/integrations' },
    { key: 'settings-all', title: 'All Settings (Unified)', description: 'View and edit all 12 application settings categories from a single panel.', icon: LayoutPanelLeft, to: '/__cw_admin__/settings/all' },
    { key: 'settings-banners', title: 'Banner Manager', description: 'Control banner settings, campaign blocks, and News fallback media.', icon: Image, to: '/__cw_admin__/settings/banner-manager' },
    { key: 'settings-news', title: 'News Settings', description: 'Configure news appearance, AI, share templates, and workflow controls.', icon: Settings, to: '/__cw_admin__/settings/news' },
    { key: 'settings-resources', title: 'Resource Settings', description: 'Configure the resources page title, featured section, and view tracking.', icon: BookOpen, to: '/__cw_admin__/settings/resource-settings' },
    { key: 'settings-security', title: 'Security Center', description: 'Authentication, session, and security policy controls.', icon: Shield, to: '/__cw_admin__/settings/security-center' },
    { key: 'settings-logs', title: 'System Logs', description: 'Review audit and system-level logs from one place.', icon: ScrollText, to: '/__cw_admin__/settings/system-logs' },
    { key: 'settings-site', title: 'Site Settings', description: 'Global branding, contact, social links, and metadata controls.', icon: Settings, to: '/__cw_admin__/settings/site-settings' },
    { key: 'settings-profile', title: 'Admin Profile', description: 'Update admin profile and account preferences.', icon: User, to: '/__cw_admin__/settings/admin-profile' },
];

const DEFAULT_SETTINGS_CARD_ORDER = settingsCards.map((card) => card.key);
const DEFAULT_SIDEBAR_ORDER = ADMIN_MENU_ITEMS.map((item) => item.key);

function mergeOrder(defaultKeys: string[], savedKeys: string[]): string[] {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const key of savedKeys) {
        if (!defaultKeys.includes(key) || seen.has(key)) continue;
        seen.add(key);
        next.push(key);
    }
    for (const key of defaultKeys) {
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(key);
    }
    return next;
}

function moveKey(order: string[], draggedKey: string, targetKey: string): string[] {
    if (!draggedKey || !targetKey || draggedKey === targetKey) return order;
    const from = order.indexOf(draggedKey);
    const to = order.indexOf(targetKey);
    if (from < 0 || to < 0) return order;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, draggedKey);
    return next;
}

function isSameOrder(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function normalizeLayout(layout?: Partial<AdminUiLayoutSettings> | null): AdminUiLayoutSettings {
    return {
        sidebarOrder: mergeOrder(DEFAULT_SIDEBAR_ORDER, Array.isArray(layout?.sidebarOrder) ? layout?.sidebarOrder || [] : []),
        settingsCardOrder: mergeOrder(DEFAULT_SETTINGS_CARD_ORDER, Array.isArray(layout?.settingsCardOrder) ? layout?.settingsCardOrder || [] : []),
    };
}

export default function AdminSettingsCenterPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const canManageLayout = ['superadmin', 'admin'].includes(String(user?.role || '').toLowerCase());
    const [settingsCardOrder, setSettingsCardOrder] = useState<string[]>(DEFAULT_SETTINGS_CARD_ORDER);
    const [sidebarOrder, setSidebarOrder] = useState<string[]>(DEFAULT_SIDEBAR_ORDER);
    const [draggingSettingsCard, setDraggingSettingsCard] = useState<string | null>(null);
    const [draggingSidebarItem, setDraggingSidebarItem] = useState<string | null>(null);

    const layoutQuery = useQuery({
        queryKey: ['admin', 'ui-layout'],
        queryFn: async () => (await adminGetAdminUiLayout()).data,
    });
    const persistedLayout = useMemo(() => normalizeLayout(layoutQuery.data?.layout), [layoutQuery.data?.layout]);

    useEffect(() => {
        setSettingsCardOrder(persistedLayout.settingsCardOrder);
        setSidebarOrder(persistedLayout.sidebarOrder);
    }, [persistedLayout]);

    const updateLayoutMutation = useMutation({
        mutationFn: async (layout: Partial<AdminUiLayoutSettings>) => (await adminUpdateAdminUiLayout(layout)).data,
        onSuccess: () => {
            toast.success('Admin layout order saved');
            queryClient.invalidateQueries({ queryKey: ['admin', 'ui-layout'] });
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Failed to save admin layout order');
        },
    });

    const orderedSettingsCards = useMemo(() => {
        const map = new Map(settingsCards.map((card) => [card.key, card]));
        return settingsCardOrder
            .map((key) => map.get(key))
            .filter(Boolean) as typeof settingsCards;
    }, [settingsCardOrder]);

    const orderedSidebarItems = useMemo(() => {
        const map = new Map(ADMIN_MENU_ITEMS.map((item) => [item.key, item]));
        return sidebarOrder
            .map((key) => map.get(key))
            .filter((item): item is (typeof ADMIN_MENU_ITEMS)[number] => Boolean(item))
            .map((item) => ({ key: item.key, label: item.label, icon: item.icon, path: item.path }));
    }, [sidebarOrder]);
    const hasUnsavedLayout = useMemo(() => {
        return !isSameOrder(settingsCardOrder, persistedLayout.settingsCardOrder)
            || !isSameOrder(sidebarOrder, persistedLayout.sidebarOrder);
    }, [persistedLayout.settingsCardOrder, persistedLayout.sidebarOrder, settingsCardOrder, sidebarOrder]);

    function saveLayoutOrder() {
        if (!canManageLayout) return;
        updateLayoutMutation.mutate({
            settingsCardOrder,
            sidebarOrder,
        });
    }

    function resetLayoutOrder() {
        setSettingsCardOrder(DEFAULT_SETTINGS_CARD_ORDER);
        setSidebarOrder(DEFAULT_SIDEBAR_ORDER);
    }

    return (
        <AdminGuardShell
            title="Settings Center"
            description="All admin settings are categorized here for faster control and live sync."
        >
            <div className="space-y-5">
                <div className="card-flat overflow-hidden border border-cyan-500/20 p-0">
                    <div className="flex flex-col gap-4 border-b border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 via-transparent to-indigo-500/10 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Layout Order Control</h2>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    hasUnsavedLayout
                                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                }`}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {hasUnsavedLayout ? 'Unsaved changes' : 'Saved'}
                                </span>
                            </div>
                            <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                                Reorder settings cards and main admin sidebar groups. Saved layout is reused by the admin shell without changing any route, path, or internal link target.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn-outline inline-flex items-center gap-2"
                                onClick={resetLayoutOrder}
                                disabled={!canManageLayout || (!hasUnsavedLayout && !layoutQuery.isLoading)}
                            >
                                <RotateCcw className="h-4 w-4" />
                                Reset to default
                            </button>
                            <button
                                type="button"
                                className="btn-primary inline-flex items-center gap-2"
                                onClick={saveLayoutOrder}
                                disabled={!canManageLayout || updateLayoutMutation.isPending || !hasUnsavedLayout}
                            >
                                <Save className="h-4 w-4" />
                                {updateLayoutMutation.isPending ? 'Saving...' : 'Save order'}
                            </button>
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        {!canManageLayout ? (
                            <p className="text-xs text-amber-600 dark:text-amber-300">
                                Read-only for your role. Only superadmin/admin can save order changes.
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Drag by the handle to reorder. Changes stay local until you press Save.
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                    <section className="card-flat border border-cyan-500/20 p-4">
                        <div className="flex items-center gap-2">
                            <LayoutPanelLeft className="h-4 w-4 text-cyan-500" />
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Settings cards order</h3>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Drag cards to reorder the Settings Center tiles.</p>
                        <div className="mt-4 space-y-2">
                            {orderedSettingsCards.map((card, index) => (
                                <div
                                    key={card.key}
                                    draggable={canManageLayout}
                                    onDragStart={() => setDraggingSettingsCard(card.key)}
                                    onDragEnd={() => setDraggingSettingsCard(null)}
                                    onDragOver={(event) => {
                                        if (!canManageLayout) return;
                                        event.preventDefault();
                                    }}
                                    onDrop={() => {
                                        if (!canManageLayout || !draggingSettingsCard) return;
                                        setSettingsCardOrder((prev) => moveKey(prev, draggingSettingsCard, card.key));
                                        setDraggingSettingsCard(null);
                                    }}
                                    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
                                        draggingSettingsCard === card.key
                                            ? 'border-cyan-400/40 bg-cyan-500/10'
                                            : 'border-slate-200/80 bg-slate-50/80 dark:border-slate-800/70 dark:bg-slate-900/45'
                                    }`}
                                >
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">
                                        {index + 1}
                                    </span>
                                    <GripVertical className="h-4 w-4 text-slate-400" />
                                    <card.icon className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{card.title}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{card.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="card-flat border border-cyan-500/20 p-4">
                        <div className="flex items-center gap-2">
                            <LayoutPanelLeft className="h-4 w-4 text-cyan-500" />
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Admin sidebar group order</h3>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Preview matches the main sidebar ordering used in the admin shell.</p>
                        <div className="mt-4 space-y-2">
                            {orderedSidebarItems.map((item, index) => {
                                const ItemIcon = item.icon;
                                return (
                                    <div
                                        key={item.key}
                                        draggable={canManageLayout}
                                        onDragStart={() => setDraggingSidebarItem(item.key)}
                                        onDragEnd={() => setDraggingSidebarItem(null)}
                                        onDragOver={(event) => {
                                            if (!canManageLayout) return;
                                            event.preventDefault();
                                        }}
                                        onDrop={() => {
                                            if (!canManageLayout || !draggingSidebarItem) return;
                                            setSidebarOrder((prev) => moveKey(prev, draggingSidebarItem, item.key));
                                            setDraggingSidebarItem(null);
                                        }}
                                        className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
                                            draggingSidebarItem === item.key
                                                ? 'border-cyan-400/40 bg-cyan-500/10'
                                                : 'border-slate-200/80 bg-slate-50/80 dark:border-slate-800/70 dark:bg-slate-900/45'
                                        }`}
                                    >
                                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">
                                            {index + 1}
                                        </span>
                                        <GripVertical className="h-4 w-4 text-slate-400" />
                                        {ItemIcon ? <ItemIcon className="h-4 w-4 text-slate-500 dark:text-slate-300" /> : null}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.path}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {orderedSettingsCards.map((card) => (
                        <Link key={card.key} to={card.to} className="card-flat group p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50">
                            <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                                    <card.icon className="w-5 h-5" />
                                </span>
                                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                            </div>
                            <h2 className="mt-4 text-lg font-semibold cw-text">{card.title}</h2>
                            <p className="mt-3 text-sm cw-muted">{card.description}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </AdminGuardShell>
    );
}
