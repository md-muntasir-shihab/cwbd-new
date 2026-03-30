import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, RefreshCw, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    useMySubscription,
    useSubscriptionPlansQuery,
} from '../hooks/useSubscriptionPlans';
import type { SubscriptionPlanPublic } from '../services/api';
import PlanCard from '../components/subscription/PlanCard';
import PlanDetailsDrawer from '../components/subscription/PlanDetailsDrawer';
import {
    resolveSubscriptionPlanContactTarget,
    resolveSubscriptionPlanTarget,
    shouldOpenSubscriptionPlanTargetInNewTab,
} from '../components/subscription/subscriptionAction';
import SubscriptionComparisonTable from '../components/subscription/SubscriptionComparisonTable';
import SubscriptionFaqBlock from '../components/subscription/SubscriptionFaqBlock';
import { isExternalUrl } from '../utils/url';

type PlanFilter = 'all' | 'free' | 'paid';

export default function SubscriptionPlansPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const plansQuery = useSubscriptionPlansQuery();
    const mySubscriptionQuery = useMySubscription(Boolean(user));

    const [filter, setFilter] = useState<PlanFilter>('all');
    const [search, setSearch] = useState('');
    const [activePlan, setActivePlan] = useState<SubscriptionPlanPublic | null>(null);

    const plans = plansQuery.data?.items || [];
    const settings = plansQuery.data?.settings;
    const currentPlanId = mySubscriptionQuery.data?.planId || undefined;
    const allowFreePlans = settings?.allowFreePlans !== false;
    const detailsDrawerEnabled = settings?.sectionToggles?.detailsDrawer !== false;
    const filterOptions = (allowFreePlans ? ['all', 'free', 'paid'] : ['all', 'paid']) as PlanFilter[];

    const availablePlans = useMemo(() => {
        const basePlans = allowFreePlans
            ? plans
            : plans.filter((plan) => !(plan.isFree || plan.type === 'free'));

        if (settings?.showFeaturedFirst) {
            return [...basePlans].sort((left, right) => {
                if (Boolean(left.isFeatured) === Boolean(right.isFeatured)) {
                    return Number(left.displayOrder || 100) - Number(right.displayOrder || 100);
                }
                return left.isFeatured ? -1 : 1;
            });
        }

        return basePlans;
    }, [allowFreePlans, plans, settings?.showFeaturedFirst]);

    const effectiveFilter = allowFreePlans ? filter : (filter === 'free' ? 'all' : filter);

    const filteredPlans = useMemo(() => {
        const term = search.trim().toLowerCase();
        return availablePlans.filter((plan) => {
            if (effectiveFilter !== 'all' && plan.type !== effectiveFilter) return false;
            if (!term) return true;
            return [
                plan.name,
                plan.shortDescription,
                plan.tagline,
                ...(plan.visibleFeatures || []),
            ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
        });
    }, [availablePlans, effectiveFilter, search]);

    const handlePrimaryAction = (plan: SubscriptionPlanPublic) => {
        const target = resolveSubscriptionPlanTarget(plan);
        if (shouldOpenSubscriptionPlanTargetInNewTab(plan)) {
            window.open(target, '_blank', 'noopener,noreferrer');
            return;
        }
        navigate(target);
    };

    const handleViewDetails = (plan: SubscriptionPlanPublic) => {
        if (detailsDrawerEnabled) {
            setActivePlan(plan);
            return;
        }

        const planIdentifier = plan.id || plan._id || plan.slug || plan.code;
        if (planIdentifier) {
            navigate(`/subscription-plans/${planIdentifier}`);
        }
    };

    const handleDismissToContact = (plan: SubscriptionPlanPublic) => {
        const target = resolveSubscriptionPlanContactTarget(plan);
        if (isExternalUrl(target)) {
            window.open(target, '_blank', 'noopener,noreferrer');
            return;
        }
        navigate(target);
    };

    const hasHardLoadError = plansQuery.isError && plans.length === 0;

    return (
        <div className="bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_34%)] py-8 sm:py-10">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
                <section className="relative overflow-hidden rounded-[2.4rem] border border-slate-200/80 bg-white/92 px-6 py-8 shadow-[0_26px_70px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-slate-950/86 sm:px-8 sm:py-10">
                    {settings?.headerBannerUrl ? (
                        <img
                            src={settings.headerBannerUrl}
                            alt="Subscription page banner"
                            className="absolute inset-0 h-full w-full object-cover opacity-[0.12]"
                        />
                    ) : null}
                    <div className="absolute inset-0 bg-white/65 dark:bg-slate-950/70" />
                    <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.18),_transparent_58%)] lg:block" />
                    <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr,0.8fr] lg:items-end">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white dark:bg-white dark:text-slate-950">
                                <Sparkles className="h-3.5 w-3.5" />
                                {settings?.heroEyebrow || 'CampusWay Memberships'}
                            </div>
                            <div className="max-w-3xl space-y-3">
                                <h1 className="text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                                    {settings?.pageTitle || 'Subscription Plans'}
                                </h1>
                                <p className="max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
                                    {settings?.pageSubtitle || 'Choose the right plan for your CampusWay journey.'}
                                </p>
                                {settings?.heroNote ? (
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{settings.heroNote}</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-slate-200/80 bg-slate-50/90 p-5 dark:border-slate-800 dark:bg-slate-900/80">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Your Status</p>
                            <div className="mt-4 flex items-center gap-3">
                                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                                    <Crown className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                        {mySubscriptionQuery.data?.planName || 'No active plan'}
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {mySubscriptionQuery.data?.isActive
                                            ? `${mySubscriptionQuery.data.daysLeft ?? 0} day${mySubscriptionQuery.data?.daysLeft === 1 ? '' : 's'} left`
                                            : 'Explore plans and choose your best fit'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[2rem] border border-slate-200/80 bg-white/92 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/86">
                    <div className="grid gap-3 lg:grid-cols-[auto,1fr]">
                        <div className="flex flex-wrap gap-2">
                            {filterOptions.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setFilter(option)}
                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                        effectiveFilter === option
                                            ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {option === 'all' ? 'All Plans' : option === 'free' ? 'Free Plans' : 'Paid Plans'}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search plan names, features, and highlights"
                                className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                </section>

                {plansQuery.isError ? (
                    <section className="rounded-[2rem] border border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-900 shadow-[0_18px_40px_rgba(120,53,15,0.10)] dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
                        <p className="inline-flex items-center gap-2 font-semibold">
                            <TriangleAlert className="h-4 w-4" />
                            Subscription plans could not be loaded from the API.
                        </p>
                        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                            Pricing data is not trustworthy right now, so this page is showing an explicit load failure instead of an empty-state fallback.
                        </p>
                        <button
                            type="button"
                            onClick={() => plansQuery.refetch()}
                            className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-100 dark:hover:bg-amber-900/20"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${plansQuery.isFetching ? 'animate-spin' : ''}`} />
                            Retry pricing sync
                        </button>
                    </section>
                ) : null}

                {plansQuery.isLoading ? (
                    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="h-[640px] animate-pulse rounded-[2rem] bg-slate-200/70 dark:bg-slate-800/70" />
                        ))}
                    </section>
                ) : hasHardLoadError ? null : (
                    <motion.section
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
                        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
                    >
                        {filteredPlans.map((plan) => (
                            <PlanCard
                                key={plan.id || plan._id}
                                plan={plan}
                                currencyLabel={settings?.currencyLabel || plan.currency || 'BDT'}
                                onPrimaryAction={handlePrimaryAction}
                                onViewDetails={handleViewDetails}
                                isCurrentPlan={Boolean(currentPlanId && currentPlanId === plan.id)}
                            />
                        ))}
                    </motion.section>
                )}

                {!plansQuery.isLoading && !plansQuery.isError && !filteredPlans.length ? (
                    <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-400">
                        No plans matched your current filters.
                    </section>
                ) : null}

                {!hasHardLoadError && settings?.sectionToggles?.comparisonTable !== false ? (
                    <SubscriptionComparisonTable plans={availablePlans} settings={settings} />
                ) : null}
                {!hasHardLoadError && settings?.sectionToggles?.faqBlock !== false ? (
                    <SubscriptionFaqBlock settings={settings} />
                ) : null}
            </div>

            <PlanDetailsDrawer
                open={Boolean(activePlan)}
                plan={activePlan}
                defaultBannerUrl={settings?.defaultPlanBannerUrl}
                onClose={() => setActivePlan(null)}
                onDismissToContact={handleDismissToContact}
                onPrimaryAction={handlePrimaryAction}
            />
        </div>
    );
}
