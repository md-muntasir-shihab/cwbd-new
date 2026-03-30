import { useMemo, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BookOpen,
    Clock3,
    CreditCard,
    FolderOpen,
    GraduationCap,
    HelpCircle,
    Home,
    KeyRound,
    Megaphone,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    TriangleAlert,
    UserSquare2,
    Users,
} from 'lucide-react';
import { adminGetDashboardSummary, type AdminDashboardSummary } from '../../services/api';
import { useModuleAccess } from '../../hooks/useModuleAccess';

interface DashboardHomeProps {
    universities: any[];
    exams: any[];
    users: any[];
    onTabChange: (tab: string) => void;
}

type SummaryCard = {
    key: string;
    title: string;
    description: string;
    value: string;
    icon: ComponentType<{ className?: string }>;
    actionLabel: string;
    actionTab: string;
    module: string;
};

function valueText(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return new Intl.NumberFormat('en-US').format(value);
}

export default function DashboardHome({ universities, exams, users, onTabChange }: DashboardHomeProps) {
    const { hasAnyAccess } = useModuleAccess();
    const summaryQuery = useQuery({
        queryKey: ['admin-dashboard-summary'],
        queryFn: async () => (await adminGetDashboardSummary()).data as AdminDashboardSummary,
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });

    const fallbackSummary: AdminDashboardSummary = {
        universities: {
            total: universities.length,
            active: universities.length,
            featured: universities.filter((item) => Boolean((item as { featured?: boolean }).featured)).length,
        },
        home: {
            highlightedCategories: 0,
            featuredUniversities: 0,
            enabledSections: 0,
        },
        news: {
            pendingReview: 0,
            publishedToday: 0,
        },
        exams: {
            upcoming: exams.filter((exam) => String((exam as { status?: string }).status || '').toLowerCase() === 'scheduled').length,
            live: exams.filter((exam) => String((exam as { status?: string }).status || '').toLowerCase() === 'live').length,
        },
        questionBank: {
            totalQuestions: 0,
        },
        students: {
            totalActive: users.filter((user) => String((user as { role?: string }).role || '') === 'student').length,
            pendingPayment: 0,
            suspended: 0,
        },
        payments: {
            pendingApprovals: 0,
            paidToday: 0,
        },
        financeCenter: {
            pendingApprovals: 0,
            paidToday: 0,
        },
        subscriptions: {
            activeSubscribers: 0,
            renewalDue: 0,
            activePlans: 0,
        },
        resources: {
            publicResources: 0,
            featuredResources: 0,
        },
        campaigns: {
            totalCampaigns: 0,
            queuedOrProcessing: 0,
            failedToday: 0,
        },
        supportCenter: {
            unreadMessages: 0,
            unreadTickets: 0,
            unreadContactMessages: 0,
        },
        teamAccess: {
            activeStaff: 0,
            pendingInvites: 0,
            activeRoles: 0,
        },
        security: {
            unreadAlerts: 0,
            criticalAlerts: 0,
            db: 'down',
        },
        systemStatus: {
            db: 'down',
            timeUTC: new Date().toISOString(),
        },
    };

    const summary = useMemo<AdminDashboardSummary>(() => {
        const incoming = summaryQuery.data;
        if (!incoming) return fallbackSummary;
        return {
            ...fallbackSummary,
            ...incoming,
            universities: { ...fallbackSummary.universities, ...incoming.universities },
            home: { ...fallbackSummary.home, ...incoming.home },
            news: { ...fallbackSummary.news, ...incoming.news },
            exams: { ...fallbackSummary.exams, ...incoming.exams },
            questionBank: { ...fallbackSummary.questionBank, ...incoming.questionBank },
            students: { ...fallbackSummary.students, ...incoming.students },
            payments: { ...fallbackSummary.payments, ...incoming.payments },
            financeCenter: { ...fallbackSummary.financeCenter, ...incoming.financeCenter },
            subscriptions: { ...fallbackSummary.subscriptions, ...incoming.subscriptions },
            resources: { ...fallbackSummary.resources, ...incoming.resources },
            campaigns: { ...fallbackSummary.campaigns, ...incoming.campaigns },
            supportCenter: { ...fallbackSummary.supportCenter, ...incoming.supportCenter },
            teamAccess: { ...fallbackSummary.teamAccess, ...incoming.teamAccess },
            security: { ...fallbackSummary.security, ...incoming.security },
            systemStatus: { ...fallbackSummary.systemStatus, ...incoming.systemStatus },
        };
    }, [fallbackSummary, summaryQuery.data]);
    const usingFallbackSummary = summaryQuery.isError && !summaryQuery.data;

    const cards = useMemo<SummaryCard[]>(() => {
        return [
            {
                key: 'universities',
                title: 'Universities',
                description: `${valueText(summary.universities.active)} active, ${valueText(summary.universities.featured)} featured`,
                value: valueText(summary.universities.total),
                icon: GraduationCap,
                actionLabel: 'Open Universities',
                actionTab: 'universities',
                module: 'universities',
            },
            {
                key: 'website-control',
                title: 'Website Control',
                description: `${valueText(summary.home.highlightedCategories)} highlighted categories, ${valueText(summary.home.enabledSections)} enabled sections`,
                value: valueText(summary.home.featuredUniversities),
                icon: Home,
                actionLabel: 'Open Website Control',
                actionTab: 'home-control',
                module: 'home_control',
            },
            {
                key: 'news',
                title: 'News Management',
                description: `${valueText(summary.news.publishedToday)} published today`,
                value: valueText(summary.news.pendingReview),
                icon: BookOpen,
                actionLabel: 'Open Review Queue',
                actionTab: 'news',
                module: 'news',
            },
            {
                key: 'exams',
                title: 'Exams',
                description: `${valueText(summary.exams.upcoming)} upcoming`,
                value: valueText(summary.exams.live),
                icon: Clock3,
                actionLabel: 'Open Exams',
                actionTab: 'exams',
                module: 'exams',
            },
            {
                key: 'question-bank',
                title: 'Question Bank',
                description: 'Total questions',
                value: valueText(summary.questionBank.totalQuestions),
                icon: UserSquare2,
                actionLabel: 'Open Question Bank',
                actionTab: 'question-bank',
                module: 'question_bank',
            },
            {
                key: 'students',
                title: 'Student Management',
                description: `${valueText(summary.students.pendingPayment)} pending payment, ${valueText(summary.students.suspended)} suspended`,
                value: valueText(summary.students.totalActive),
                icon: Users,
                actionLabel: 'Open Student Management',
                actionTab: 'student-management',
                module: 'students_groups',
            },
            {
                key: 'subscriptions',
                title: 'Subscription & Payments',
                description: `${valueText(summary.subscriptions.renewalDue)} renewal due, ${valueText(summary.subscriptions.activePlans)} active plans`,
                value: valueText(summary.subscriptions.activeSubscribers),
                icon: CreditCard,
                actionLabel: 'Open Subscriptions',
                actionTab: 'subscriptions',
                module: 'subscription_plans',
            },
            {
                key: 'resources',
                title: 'Resources',
                description: `${valueText(summary.resources.featuredResources)} featured resources`,
                value: valueText(summary.resources.publicResources),
                icon: FolderOpen,
                actionLabel: 'Open Resources',
                actionTab: 'resources',
                module: 'resources',
            },
            {
                key: 'support',
                title: 'Support & Communication',
                description: `${valueText(summary.supportCenter.unreadTickets)} ticket unread, ${valueText(summary.supportCenter.unreadContactMessages)} contact unread`,
                value: valueText(summary.supportCenter.unreadMessages),
                icon: HelpCircle,
                actionLabel: 'Open Support',
                actionTab: 'support-tickets',
                module: 'support_center',
            },
            {
                key: 'campaigns',
                title: 'Campaigns Hub',
                description: `${valueText(summary.campaigns.failedToday)} failed today, ${valueText(summary.campaigns.totalCampaigns)} total campaigns`,
                value: valueText(summary.campaigns.queuedOrProcessing),
                icon: Megaphone,
                actionLabel: 'Open Campaigns Hub',
                actionTab: 'campaigns',
                module: 'notifications',
            },
            {
                key: 'finance',
                title: 'Finance Center',
                description: `${valueText(summary.financeCenter.paidToday)} payments cleared today`,
                value: valueText(summary.financeCenter.pendingApprovals),
                icon: Sparkles,
                actionLabel: 'Open Finance Center',
                actionTab: 'finance',
                module: 'finance_center',
            },
            {
                key: 'team-access',
                title: 'Team & Access Control',
                description: `${valueText(summary.teamAccess.activeStaff)} active staff, ${valueText(summary.teamAccess.activeRoles)} active roles`,
                value: valueText(summary.teamAccess.pendingInvites),
                icon: KeyRound,
                actionLabel: 'Open Team Access',
                actionTab: 'team-access',
                module: 'team_access_control',
            },
            {
                key: 'security',
                title: 'Security & Logs',
                description: `${valueText(summary.security.unreadAlerts)} unread alerts, DB ${summary.security.db.toUpperCase()}`,
                value: valueText(summary.security.criticalAlerts),
                icon: ShieldCheck,
                actionLabel: 'Open Security Center',
                actionTab: 'security',
                module: 'security_logs',
            },
        ];
    }, [summary]);
    const visibleCards = useMemo(() => cards.filter((card) => hasAnyAccess(card.module)), [cards, hasAnyAccess]);

    return (
        <div className="space-y-6">
            {/* Hero / Header Strip */}
            <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-[0_24px_70px_rgba(6,10,24,0.24)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200/85">Admin Control Center</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Admin Summary</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-300">
                            Live snapshot of core modules with quick navigation links. Data refreshes automatically every minute.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => summaryQuery.refetch()}
                        className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
                    >
                        <RefreshCw className={`h-4 w-4 ${summaryQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Summary
                    </button>
                </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleCards.map((card) => (
                    <article
                        key={card.key}
                        className="group relative flex min-h-[15.5rem] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800/80 dark:bg-slate-950/70 dark:hover:border-indigo-500/30"
                    >
                        {/* Decorative gradient blob */}
                        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 blur-2xl transition-all duration-500 group-hover:scale-150 group-hover:from-indigo-500/15 group-hover:to-cyan-500/15 dark:from-indigo-500/8 dark:to-cyan-500/8" />

                        <div className="relative flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{card.title}</p>
                                <p className="mt-2 break-words text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">{card.value}</p>
                            </div>
                            <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 text-indigo-600 ring-1 ring-indigo-500/20 transition-transform duration-300 group-hover:scale-110 dark:from-indigo-500/20 dark:to-cyan-500/15 dark:text-indigo-300 dark:ring-indigo-500/25">
                                <card.icon className="h-5 w-5" />
                            </span>
                        </div>

                        <p className="mt-3 min-h-[2.75rem] text-xs leading-5 text-slate-500 dark:text-slate-400">{card.description}</p>

                        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4 dark:border-slate-800/70">
                            <button
                                type="button"
                                onClick={() => onTabChange(card.actionTab)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300/80 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-500/5 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                            >
                                {card.actionLabel}
                            </button>

                        </div>
                    </article>
                ))}
            </div>

            {/* Fallback Warning */}
            {usingFallbackSummary ? (
                <div className="rounded-[1.75rem] border border-amber-300/60 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/30 dark:to-orange-950/20">
                    <p className="inline-flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-100">
                        <TriangleAlert className="h-4 w-4" />
                        Live summary unavailable
                    </p>
                    <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/80">
                        The dashboard summary API failed, so these cards are showing local fallback values from the current page payload instead of trusted live counts.
                    </p>
                </div>
            ) : null}

            {/* System Health Footer */}
            <div className="rounded-[1.75rem] border border-emerald-500/20 bg-gradient-to-r from-emerald-50 to-cyan-50 p-5 shadow-sm dark:from-emerald-500/5 dark:to-cyan-500/5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-100">
                            <ShieldCheck className="h-4 w-4" />
                            System Health
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-emerald-700 dark:text-emerald-200/80">
                            <span>DB: <b className="font-semibold">{summary.systemStatus.db}</b></span>
                            <span>Security: <b className="font-semibold">{valueText(summary.security.unreadAlerts)}</b> unread, <b className="font-semibold">{valueText(summary.security.criticalAlerts)}</b> critical</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-emerald-600 dark:text-emerald-300/60">
                        <span>Last check: {new Date(summary.systemStatus.timeUTC).toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-white/60 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-slate-900/40 dark:text-emerald-200">
                            {usingFallbackSummary ? 'Fallback snapshot' : 'Live summary'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
