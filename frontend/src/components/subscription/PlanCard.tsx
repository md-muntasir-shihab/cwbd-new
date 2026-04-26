import { motion } from 'framer-motion';
import { ArrowRight, Check, Crown, Eye, Sparkles, X } from 'lucide-react';
import type { SubscriptionPlanPublic } from '../../services/api';
import { resolveSubscriptionPlanPrimaryLabel } from './subscriptionAction';
import { getSubscriptionTheme } from './subscriptionTheme';

type Props = {
    plan: SubscriptionPlanPublic;
    currencyLabel?: string;
    onPrimaryAction: (plan: SubscriptionPlanPublic) => void;
    onViewDetails: (plan: SubscriptionPlanPublic) => void;
    isCurrentPlan?: boolean;
    compact?: boolean;
};

function formatCurrencyLabel(label: string): string {
    const trimmed = label.trim();
    if (!trimmed) return '';
    // Add trailing space for alphabetic currency codes (e.g. "BDT" → "BDT "), skip for symbols (e.g. "৳")
    if (/^[A-Za-z]+$/.test(trimmed)) return `${trimmed} `;
    return trimmed;
}

function formatPrice(plan: SubscriptionPlanPublic, currencyLabel: string): string {
    if (plan.isFree || plan.priceBDT <= 0) return 'Free';
    return `${formatCurrencyLabel(currencyLabel)}${Number(plan.priceBDT || 0).toLocaleString()}`;
}

export default function PlanCard({
    plan,
    currencyLabel = `${plan.currency || 'BDT'} `,
    onPrimaryAction,
    onViewDetails,
    isCurrentPlan = false,
    compact = false,
}: Props) {
    const theme = getSubscriptionTheme(plan.themeKey);
    const visibleFeatures = (plan.visibleFeatures?.length ? plan.visibleFeatures : plan.features || []).slice(0, 2);
    const excludedFeatures = compact ? [] : (plan.excludedFeatures || []).slice(0, 1);
    const summary = plan.tagline || plan.shortDescription || plan.highlightText || 'Plan summary managed from admin.';
    const metaPills = [
        plan.validityLabel || plan.durationLabel,
        plan.supportLevel ? `Support: ${plan.supportLevel}` : '',
        plan.accessScope || '',
    ].filter(Boolean);
    const primaryLabel = resolveSubscriptionPlanPrimaryLabel(plan);

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            whileHover={{ y: -3 }}
            className={`group relative flex h-full min-h-[24rem] flex-col overflow-hidden rounded-[1.55rem] border border-white/10 bg-slate-950/92 shadow-[0_18px_55px_rgba(2,6,23,0.34)] backdrop-blur-xl ${theme.glow}`}
            data-testid="subscription-plan-card"
        >
            <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${theme.shell} opacity-70`} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(2,6,23,0.78)_38%,rgba(2,6,23,0.98))]" />

            <div className="relative flex flex-1 flex-col p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {plan.badgeText ? (
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${theme.badge}`}>
                                {plan.badgeText}
                            </span>
                        ) : null}
                        {isCurrentPlan ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                                <Crown className="h-3 w-3" />
                                Current
                            </span>
                        ) : null}
                    </div>
                    {plan.isFeatured ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                            Most Popular
                        </span>
                    ) : null}
                </div>

                <div className="mt-4 grid gap-3">
                    <div className="space-y-2">
                        <h3 className={`font-black tracking-tight text-white ${compact ? 'text-[1.35rem]' : 'text-[1.6rem]'}`}>{plan.name}</h3>
                        <p className="max-w-[26rem] text-sm leading-6 text-slate-200/88 line-clamp-2">{summary}</p>
                    </div>

                    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] px-4 py-3.5">
                        <div className="flex flex-wrap items-end gap-2">
                            <p className={`font-black tracking-[-0.05em] text-white ${compact ? 'text-[1.9rem]' : 'text-[2.15rem]'}`}>
                                {formatPrice(plan, currencyLabel)}
                            </p>
                            <span className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                / {plan.billingCycle === 'one_time' ? 'one time' : (plan.billingCycle || 'monthly')}
                            </span>
                        </div>
                        {plan.oldPrice ? (
                            <p className="mt-1 text-xs font-medium text-slate-500 line-through">
                                {formatCurrencyLabel(currencyLabel)}{Number(plan.oldPrice).toLocaleString()}
                            </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                            {metaPills.map((pill) => (
                                <span
                                    key={pill}
                                    className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200"
                                >
                                    {pill}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {(plan.highlightText || plan.shortDescription) ? (
                    <div className="mt-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3">
                        {plan.highlightText ? (
                            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                                {plan.highlightText}
                            </p>
                        ) : null}
                        {plan.shortDescription ? (
                            <p className="mt-2 text-sm leading-6 text-slate-300 line-clamp-2">
                                {plan.shortDescription}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                <div className="mt-4 flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Plan features</p>
                        {plan.recommendedFor ? (
                            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                                {plan.recommendedFor}
                            </span>
                        ) : null}
                    </div>
                    <ul className="mt-3 grid gap-2">
                        {visibleFeatures.length > 0 ? visibleFeatures.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-3 rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/14 text-emerald-300">
                                    <Check className="h-3.5 w-3.5" />
                                </span>
                                <span className="text-sm leading-5 text-slate-200 line-clamp-2">{feature}</span>
                            </li>
                        )) : (
                            <li className="rounded-[0.95rem] border border-dashed border-white/10 px-3 py-3 text-sm text-slate-400">
                                Admin will add features soon.
                            </li>
                        )}
                        {excludedFeatures.map((feature, idx) => (
                            <li key={`excluded-${idx}`} className="flex items-start gap-3 rounded-[0.95rem] border border-white/5 bg-black/10 px-3 py-2.5 opacity-75">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-slate-400">
                                    <X className="h-3.5 w-3.5" />
                                </span>
                                <span className="text-sm leading-6 text-slate-400 line-through">{feature}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                        type="button"
                        onClick={() => onPrimaryAction(plan)}
                        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.01] ${theme.cta}`}
                    >
                        {primaryLabel}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onViewDetails(plan)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08] sm:px-5"
                    >
                        <Eye className="h-4 w-4" />
                        View details
                    </button>
                </div>
            </div>
        </motion.article>
    );
}
