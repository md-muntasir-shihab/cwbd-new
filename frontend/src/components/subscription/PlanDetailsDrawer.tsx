import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CheckCircle, MessageSquare, Shield, Tag, X, XCircle, Zap } from 'lucide-react';
import type { SubscriptionPlanPublic } from '../../services/api';
import {
    resolveSubscriptionPlanContactTarget,
    resolveSubscriptionPlanPrimaryLabel,
    resolveSubscriptionPlanTarget,
} from './subscriptionAction';
import {
    formatSubscriptionPlanPrice,
    getSubscriptionPlanAccessPermissions,
    getSubscriptionPlanDashboardPrivileges,
    getSubscriptionPlanFeatureList,
    getSubscriptionPlanIncludedModules,
    getSubscriptionPlanMetaItems,
    getSubscriptionPlanPriceSuffix,
    getSubscriptionPlanTags,
    paragraphBlocks,
} from './subscriptionContent';
import { getSubscriptionTheme } from './subscriptionTheme';

type Props = {
    open: boolean;
    plan: SubscriptionPlanPublic | null;
    defaultBannerUrl?: string | null;
    onClose: () => void;
    onDismissToContact?: (plan: SubscriptionPlanPublic) => void;
    onPrimaryAction: (plan: SubscriptionPlanPublic) => void;
};

function MetaPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-full border border-white/12 bg-white/10 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</span>
            <span className="ml-2 text-sm font-medium text-white">{value}</span>
        </div>
    );
}

export default function PlanDetailsDrawer({
    open,
    plan,
    defaultBannerUrl,
    onClose,
    onDismissToContact,
    onPrimaryAction,
}: Props) {
    const theme = getSubscriptionTheme(plan?.themeKey);
    const descriptionBlocks = paragraphBlocks(plan?.fullDescription || plan?.shortDescription || '').slice(0, 3);
    const visibleFeatures = plan ? getSubscriptionPlanFeatureList(plan) : [];
    const featurePreview = visibleFeatures.slice(0, 8);
    const excludedFeatures = (plan?.excludedFeatures || []).slice(0, 4);
    const faqItems = (plan?.faqItems || []).filter((item) => item?.question && item?.answer).slice(0, 4);
    const primaryLabel = plan ? resolveSubscriptionPlanPrimaryLabel(plan) : 'Continue';
    const priceText = plan ? formatSubscriptionPlanPrice(plan) : '';
    const priceSuffix = plan ? getSubscriptionPlanPriceSuffix(plan) : '';
    const metaItems = plan ? getSubscriptionPlanMetaItems(plan) : [];
    const accessPermissions = plan ? getSubscriptionPlanAccessPermissions(plan) : [];
    const includedModules = plan ? getSubscriptionPlanIncludedModules(plan) : [];
    const dashboardPrivileges = plan ? getSubscriptionPlanDashboardPrivileges(plan) : [];
    const tags = plan ? getSubscriptionPlanTags(plan) : [];
    const contactLabel = plan?.contactCtaLabel || 'Talk to admissions';
    const resolvedContactLabel = contactLabel !== primaryLabel ? contactLabel : 'Contact admin';
    const bannerUrl = plan?.bannerImageUrl || defaultBannerUrl || null;
    const showContactAction = Boolean(
        plan
        && onDismissToContact
        && resolveSubscriptionPlanContactTarget(plan) !== resolveSubscriptionPlanTarget(plan)
    );

    return (
        <AnimatePresence>
            {open && plan ? (
                <motion.div
                    className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-slate-950/64 sm:p-4 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.section
                        initial={{ opacity: 0, y: 24, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 18, scale: 0.985 }}
                        transition={{ duration: 0.22 }}
                        onClick={(event) => event.stopPropagation()}
                        className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2.2rem] border border-slate-900/10 bg-[#fbf4e9]/96 text-slate-950 shadow-[0_50px_160px_rgba(2,6,23,0.45)] dark:border-white/10 dark:bg-[#020617]/96 dark:text-white"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(15,23,42,0.07),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.34),_rgba(255,255,255,0.92)_22%,_rgba(255,255,255,0.78)_100%)] dark:bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.1),_transparent_26%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0.04)_22%,_rgba(255,255,255,0.03)_100%)]" />

                        <div className="relative flex items-center justify-between gap-3 border-b border-slate-900/10 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                    Plan details
                                </p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                    Review the exact pricing flow before continuing.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                {showContactAction ? (
                                    <button
                                        type="button"
                                        onClick={() => onDismissToContact?.(plan)}
                                        className="hidden items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1] sm:inline-flex"
                                    >
                                        <MessageSquare className="h-4 w-4" />
                                        {resolvedContactLabel}
                                    </button>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-900/10 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1]"
                                    aria-label="Close plan details"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="relative flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                            <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.02fr,0.98fr]">
                                <div className="space-y-5">
                                    <section className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[1.9rem] border border-slate-900/10 bg-[#0d172a] px-4 py-4 text-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] dark:border-white/10 sm:px-6 sm:py-5">
                                        {bannerUrl ? (
                                            <img
                                                src={bannerUrl}
                                                alt={`${plan.name} banner`}
                                                className="absolute inset-0 h-full w-full object-cover opacity-[0.18]"
                                            />
                                        ) : null}
                                        <div className={`absolute inset-0 bg-gradient-to-br ${theme.shell} opacity-[0.28]`} />
                                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.64)_44%,rgba(2,6,23,0.92))]" />

                                        <div className="relative">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {plan.badgeText ? (
                                                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${theme.badge}`}>
                                                        {plan.badgeText}
                                                    </span>
                                                ) : null}
                                                {plan.isFeatured ? (
                                                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                                                        Popular
                                                    </span>
                                                ) : null}
                                            </div>

                                            <div className="mt-5 grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr),auto] lg:items-end">
                                                <div>
                                                    <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.04em] text-white lg:text-[2.5rem]">{plan.name}</h2>
                                                    <p className="mt-2 sm:mt-3 max-w-2xl text-sm leading-6 sm:leading-7 text-white/78 sm:text-base">
                                                        {plan.tagline || plan.shortDescription || 'Plan details are managed from the admin pricing center.'}
                                                    </p>
                                                </div>

                                                <div className="rounded-[1.3rem] sm:rounded-[1.55rem] border border-white/12 bg-white/8 px-3.5 sm:px-4 py-3 sm:py-4 backdrop-blur-xl">
                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Price</p>
                                                    <div className="mt-1.5 sm:mt-2 flex flex-wrap items-end gap-2">
                                                        <p className="text-[1.75rem] sm:text-[2.15rem] font-black tracking-[-0.05em] text-white">{priceText}</p>
                                                        <span className="pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                                                            / {priceSuffix}
                                                        </span>
                                                    </div>
                                                    {plan.oldPrice ? (
                                                        <p className="mt-1 text-xs text-white/45 line-through">
                                                            {/^[A-Za-z]+$/.test((plan.currency || 'BDT').trim()) ? `${(plan.currency || 'BDT').trim()} ` : (plan.currency || 'BDT').trim()}{Number(plan.oldPrice).toLocaleString()}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="mt-5 flex flex-wrap gap-2.5">
                                                {metaItems.map((item) => (
                                                    <MetaPill key={item.label} label={item.label} value={item.value} />
                                                ))}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/10 dark:bg-white/[0.04]">
                                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Overview</h3>
                                        <div className="mt-4 space-y-3">
                                            {descriptionBlocks.length > 0 ? descriptionBlocks.map((block, index) => (
                                                <p
                                                    key={index}
                                                    className={`${index === 0 ? 'text-base text-slate-800 dark:text-slate-100' : 'text-[15px] text-slate-600 dark:text-slate-300'} leading-8`}
                                                >
                                                    {block}
                                                </p>
                                            )) : (
                                                <p className="text-[15px] leading-8 text-slate-600 dark:text-slate-300">
                                                    Full plan description will be managed from admin.
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    {(plan.renewalNotes || plan.policyNote) ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-[#fff7df] p-5 dark:border-white/10 dark:bg-white/[0.035]">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Activation notes</h3>
                                            <div className="mt-4 grid gap-3">
                                                {plan.renewalNotes ? (
                                                    <div className="rounded-[1.2rem] border border-slate-900/10 bg-white/72 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Renewal</p>
                                                        <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{plan.renewalNotes}</p>
                                                    </div>
                                                ) : null}
                                                {plan.policyNote ? (
                                                    <div className="rounded-[1.2rem] border border-slate-900/10 bg-white/72 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Policy</p>
                                                        <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{plan.policyNote}</p>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </section>
                                    ) : null}

                                    {faqItems.length > 0 ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                Plan FAQ
                                            </h3>
                                            <div className="mt-4 space-y-3">
                                                {faqItems.map((item, index) => (
                                                    <details
                                                        key={`${item.question}-${index}`}
                                                        className="rounded-[1.15rem] border border-slate-900/10 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/45"
                                                    >
                                                        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                            {item.question}
                                                        </summary>
                                                        <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                                                            {item.answer}
                                                        </p>
                                                    </details>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}
                                </div>

                                <div className="space-y-5">
                                    <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/10 dark:bg-white/[0.04]">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                Included features
                                            </h3>
                                            {visibleFeatures.length > featurePreview.length ? (
                                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                    +{visibleFeatures.length - featurePreview.length} more after activation
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 grid gap-2.5">
                                            {featurePreview.length > 0 ? featurePreview.map((feature) => (
                                                <div
                                                    key={`${plan.id || plan._id}-${feature}`}
                                                    className="flex items-start gap-3 rounded-[1.15rem] border border-slate-900/[0.08] bg-white/72 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.035]"
                                                >
                                                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/14 text-emerald-600 dark:text-emerald-300">
                                                        <Check className="h-3.5 w-3.5" />
                                                    </span>
                                                    <span className="text-sm leading-6 text-slate-700 dark:text-slate-100">{feature}</span>
                                                </div>
                                            )) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">No detailed features added yet.</p>
                                            )}
                                        </div>
                                    </section>

                                    {excludedFeatures.length > 0 ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                Not included
                                            </h3>
                                            <div className="mt-4 grid gap-2.5">
                                                {excludedFeatures.map((feature) => (
                                                    <div
                                                        key={`${plan.id || plan._id}-excluded-${feature}`}
                                                        className="flex items-start gap-3 rounded-[1.15rem] border border-dashed border-slate-300 bg-slate-50/82 px-4 py-3 dark:border-white/10 dark:bg-white/[0.025]"
                                                    >
                                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
                                                            <X className="h-3.5 w-3.5" />
                                                        </span>
                                                        <span className="text-sm leading-6 text-slate-500 line-through dark:text-slate-400">{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}

                                    {accessPermissions.length > 0 ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                <Shield className="h-3.5 w-3.5" />
                                                Access permissions
                                            </h3>
                                            <div className="mt-4 grid gap-2">
                                                {accessPermissions.map((perm) => (
                                                    <div
                                                        key={perm.label}
                                                        className="flex items-center justify-between rounded-[1rem] border border-slate-900/[0.06] bg-white/60 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]"
                                                    >
                                                        <span className="text-sm text-slate-700 dark:text-slate-200">{perm.label}</span>
                                                        {perm.allowed ? (
                                                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                                                        ) : (
                                                            <XCircle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}

                                    {includedModules.length > 0 ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                <Zap className="h-3.5 w-3.5" />
                                                Included modules
                                            </h3>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {includedModules.map((mod) => (
                                                    <span
                                                        key={mod}
                                                        className="rounded-full border border-slate-900/[0.08] bg-slate-100/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200"
                                                    >
                                                        {mod}
                                                    </span>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}

                                    {dashboardPrivileges.length > 0 ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                Dashboard privileges
                                            </h3>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {dashboardPrivileges.map((priv) => (
                                                    <span
                                                        key={priv}
                                                        className="rounded-full border border-violet-200/60 bg-violet-50/80 px-3 py-1.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200"
                                                    >
                                                        {priv}
                                                    </span>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null}

                                    {(plan.recommendedFor || plan.comparisonNote || tags.length > 0) ? (
                                        <section className="rounded-[1.7rem] border border-slate-900/10 bg-white/82 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                                Additional info
                                            </h3>
                                            <div className="mt-4 grid gap-3">
                                                {plan.recommendedFor ? (
                                                    <div className="rounded-[1.2rem] border border-slate-900/[0.06] bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-slate-950/40">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Recommended for</p>
                                                        <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{plan.recommendedFor}</p>
                                                    </div>
                                                ) : null}
                                                {plan.comparisonNote ? (
                                                    <div className="rounded-[1.2rem] border border-slate-900/[0.06] bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-slate-950/40">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Comparison note</p>
                                                        <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{plan.comparisonNote}</p>
                                                    </div>
                                                ) : null}
                                                {tags.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {tags.map((tag) => (
                                                            <span
                                                                key={tag}
                                                                className="inline-flex items-center gap-1 rounded-full border border-slate-900/[0.06] bg-slate-100/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-300"
                                                            >
                                                                <Tag className="h-3 w-3" />
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </section>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="relative border-t border-slate-900/10 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
                            <div className="flex flex-col gap-2.5 sm:gap-3 rounded-[1.3rem] sm:rounded-[1.5rem] border border-slate-900/10 bg-white/82 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.04] lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{primaryLabel}</p>
                                    <p className="mt-0.5 sm:mt-1 text-xs leading-5 sm:leading-6 text-slate-500 dark:text-slate-400">
                                        Routing stays exactly as configured. Continue to contact, internal flow, checkout, or external payment path.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    {showContactAction ? (
                                        <button
                                            type="button"
                                            onClick={() => onDismissToContact?.(plan)}
                                            className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] border border-slate-900/10 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100 dark:hover:bg-white/[0.08]"
                                        >
                                            <MessageSquare className="h-4 w-4" />
                                            {resolvedContactLabel}
                                        </button>
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => onPrimaryAction(plan)}
                                        className={`inline-flex items-center justify-center gap-2 rounded-[1.2rem] px-4 py-3 text-sm font-semibold transition hover:scale-[1.01] ${theme.cta}`}
                                    >
                                        {primaryLabel}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                                Back to plans
                            </button>
                        </div>
                    </motion.section>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
