import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    useRequestSubscriptionPaymentMutation,
    useSubscriptionPlanById,
} from '../hooks/useSubscriptionPlans';
import type { SubscriptionPlanPublic } from '../services/api';
import PlanDetailsDrawer from '../components/subscription/PlanDetailsDrawer';
import { isExternalUrl } from '../utils/url';
import {
    resolveSubscriptionPlanTarget,
    shouldOpenSubscriptionPlanTargetInNewTab,
} from '../components/subscription/subscriptionAction';

function resolveTarget(plan: SubscriptionPlanPublic): string {
    return resolveSubscriptionPlanTarget(plan);
}

export default function SubscriptionPlanCheckoutPage() {
    const navigate = useNavigate();
    const { slug } = useParams<{ slug: string }>();
    const { user } = useAuth();
    const planQuery = useSubscriptionPlanById(slug || '');
    const requestPaymentMutation = useRequestSubscriptionPaymentMutation();
    const [showDrawer, setShowDrawer] = useState(false);

    const plan = planQuery.data;
    const ctaTarget = useMemo(() => (plan ? resolveTarget(plan) : '/contact'), [plan]);

    const handlePrimaryAction = async () => {
        if (!plan) return;

        if (plan.ctaMode === 'request_payment') {
            if (!user) {
                toast.error('Please log in first to request payment approval.');
                navigate('/login');
                return;
            }
            try {
                await requestPaymentMutation.mutateAsync({ planId: plan.id || plan._id, method: 'manual' });
                toast.success('Payment request submitted');
            } catch (error: any) {
                toast.error(error?.response?.data?.message || 'Could not submit payment request');
            }
            return;
        }

        if (shouldOpenSubscriptionPlanTargetInNewTab(plan)) {
            window.open(ctaTarget, '_blank', 'noopener,noreferrer');
            return;
        }

        navigate(ctaTarget);
    };

    if (planQuery.isLoading) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="h-[28rem] animate-pulse rounded-[2rem] bg-slate-200/70 dark:bg-slate-800/70" />
            </div>
        );
    }

    if (!plan) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Plan not found</h1>
                <Link to="/subscription-plans" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                    Back to plans
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 pb-24 sm:pb-8">
            <Link to="/subscription-plans" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Back to subscription plans
            </Link>

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
                <section className="rounded-[2rem] border border-slate-200/80 bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/86">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Selected Plan</p>
                    <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 dark:text-white">{plan.name}</h1>
                    <p className="mt-3 text-base leading-8 text-slate-600 dark:text-slate-300">{plan.shortDescription || plan.tagline || plan.fullDescription}</p>

                    <div className="mt-6 rounded-[1.75rem] bg-slate-100 p-5 dark:bg-slate-900">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Price</p>
                                <p className="mt-2 text-4xl font-black text-slate-950 dark:text-white">
                                    {plan.isFree || plan.priceBDT <= 0 ? 'Free' : `${plan.currency || 'BDT'} ${Number(plan.priceBDT || 0).toLocaleString()}`}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                                {plan.billingCycle === 'one_time' ? 'One time' : plan.billingCycle}
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Validity</p>
                                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{plan.validityLabel || plan.durationLabel}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Support</p>
                                <p className="mt-1 text-sm font-medium capitalize text-slate-900 dark:text-white">{plan.supportLevel || 'basic'}</p>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowDrawer(true)}
                        className="mt-4 inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                        View full plan details
                    </button>
                </section>

                <section className="rounded-[2rem] border border-slate-200/80 bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/86">
                    <div className="flex items-center gap-3">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-700 dark:text-cyan-200">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Action Entry</p>
                            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{plan.ctaLabel || 'Continue with this plan'}</h2>
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div className="rounded-[1.5rem] bg-slate-100 p-4 text-sm leading-7 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {plan.ctaMode === 'request_payment' && 'CampusWay will create a payment request for this plan. After admin approval, your subscription will appear in your account.'}
                            {plan.ctaMode === 'contact' && 'This plan uses the manual/contact flow. Continue to the configured destination and share your details with the CampusWay team.'}
                            {plan.ctaMode === 'internal' && 'This plan continues to another internal CampusWay screen configured by admin.'}
                            {plan.ctaMode === 'external' && 'This plan continues to an external destination configured by admin.'}
                        </div>

                        <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Target</p>
                            <p className="mt-2 break-all text-sm text-slate-700 dark:text-slate-300">{plan.ctaMode === 'request_payment' ? 'Creates a payment request in CampusWay' : ctaTarget}</p>
                        </div>

                        <button
                            type="button"
                            onClick={handlePrimaryAction}
                            disabled={requestPaymentMutation.isPending}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                        >
                            {requestPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {plan.ctaLabel || 'Continue'}
                            {plan.ctaMode !== 'request_payment' && isExternalUrl(ctaTarget) ? <ExternalLink className="h-4 w-4" /> : null}
                        </button>
                    </div>
                </section>
            </div>

            {/* Sticky price footer on mobile (≤414px) — Bug 1.27 */}
            <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden dark:border-slate-800 dark:bg-slate-950/95">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</p>
                        <p className="text-lg font-black text-slate-950 dark:text-white">
                            {plan.isFree || plan.priceBDT <= 0 ? 'Free' : `${plan.currency || 'BDT'} ${Number(plan.priceBDT || 0).toLocaleString()}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handlePrimaryAction}
                        disabled={requestPaymentMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                    >
                        {requestPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {plan.ctaLabel || 'Continue'}
                    </button>
                </div>
            </div>

            <PlanDetailsDrawer
                open={showDrawer}
                plan={plan}
                onClose={() => setShowDrawer(false)}
                onDismissToContact={() => navigate('/contact')}
                onPrimaryAction={() => {
                    setShowDrawer(false);
                    void handlePrimaryAction();
                }}
            />
        </div>
    );
}
