import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Copy,
    Download,
    Eye,
    Loader2,
    Pencil,
    Plus,
    Save,
    Sparkles,
    Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminGuardShell from '../components/admin/AdminGuardShell';
import AdminTabNav from '../components/admin/AdminTabNav';
import { ADMIN_PATHS } from '../routes/adminPaths';
import { CreditCard, Users } from 'lucide-react';
import PlanCard from '../components/subscription/PlanCard';
import PlanDetailsDrawer from '../components/subscription/PlanDetailsDrawer';
import { useAdminSubscriptionPlan, useAdminSubscriptionPlans, useCreateSubscriptionPlanMutation, useDeleteSubscriptionPlanMutation, useDuplicateSubscriptionPlanMutation, useReorderSubscriptionPlansMutation, useSubscriptionSettings, useToggleSubscriptionPlanFeaturedMutation, useToggleSubscriptionPlanMutation, useUpdateSubscriptionPlanMutation, useUpdateSubscriptionSettingsMutation } from '../hooks/useSubscriptionPlans';
import { showConfirmDialog } from '../lib/appDialog';
import { adminExportSubscriptionPlans, adminExportSubscriptions, type AdminSubscriptionPlan, type SubscriptionPlansPublicSettings } from '../services/api';
import { downloadFile } from '../utils/download';

type ThemeKey = NonNullable<AdminSubscriptionPlan['themeKey']>;
type BillingCycle = NonNullable<AdminSubscriptionPlan['billingCycle']>;
type PlanType = NonNullable<AdminSubscriptionPlan['planType']>;
type SupportLevel = NonNullable<AdminSubscriptionPlan['supportLevel']>;
type CtaMode = NonNullable<AdminSubscriptionPlan['ctaMode']>;
type DurationMode = 'days' | 'months';

type FaqDraft = { id: string; question: string; answer: string };
type ComparisonRowDraft = { id: string; key: string; label: string };

type PlanFormState = {
    name: string;
    slug: string;
    code: string;
    shortTitle: string;
    tagline: string;
    shortDescription: string;
    fullDescription: string;
    priceBDT: string;
    oldPrice: string;
    currency: string;
    billingCycle: BillingCycle;
    durationMode: DurationMode;
    durationDays: string;
    durationMonths: string;
    validityLabel: string;
    sortOrder: string;
    themeKey: ThemeKey;
    badgeText: string;
    highlightText: string;
    isFeatured: boolean;
    isActive: boolean;
    showOnHome: boolean;
    showOnPricingPage: boolean;
    visibleFeaturesText: string;
    fullFeaturesText: string;
    excludedFeaturesText: string;
    recommendedFor: string;
    comparisonNote: string;
    supportLevel: SupportLevel;
    accessScope: string;
    allowsExams: boolean;
    allowsPremiumResources: boolean;
    allowsSMSUpdates: boolean;
    allowsEmailUpdates: boolean;
    allowsGuardianAlerts: boolean;
    allowsSpecialGroups: boolean;
    dashboardPrivilegesText: string;
    maxAttempts: string;
    planType: PlanType;
    ctaLabel: string;
    ctaUrl: string;
    ctaMode: CtaMode;
    renewalNotes: string;
    policyNote: string;
    faqItems: FaqDraft[];
};

type SettingsFormState = {
    pageTitle: string;
    pageSubtitle: string;
    heroEyebrow: string;
    heroNote: string;
    headerBannerUrl: string;
    defaultPlanBannerUrl: string;
    currencyLabel: string;
    showFeaturedFirst: boolean;
    allowFreePlans: boolean;
    comparisonEnabled: boolean;
    comparisonTitle: string;
    comparisonSubtitle: string;
    comparisonRows: ComparisonRowDraft[];
    pageFaqEnabled: boolean;
    pageFaqTitle: string;
    pageFaqItems: FaqDraft[];
    sectionToggles: {
        detailsDrawer: boolean;
        comparisonTable: boolean;
        faqBlock: boolean;
        homePreview: boolean;
    };
    defaultCtaMode: CtaMode;
};

const THEMES: Array<{ value: ThemeKey; label: string }> = [
    { value: 'basic', label: 'Basic / Purple-Pink' },
    { value: 'standard', label: 'Standard / Orange-Red' },
    { value: 'premium', label: 'Premium / Cyan-Green' },
    { value: 'enterprise', label: 'Enterprise / Gold-Dark' },
    { value: 'custom', label: 'Custom / Flexible' },
];
const CYCLES: Array<{ value: BillingCycle; label: string }> = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'one_time', label: 'One Time' },
    { value: 'custom', label: 'Custom' },
];
const PLAN_TYPES: Array<{ value: PlanType; label: string }> = [
    { value: 'free', label: 'Free' },
    { value: 'paid', label: 'Paid' },
    { value: 'custom', label: 'Custom' },
    { value: 'enterprise', label: 'Enterprise' },
];
const SUPPORT_LEVELS: Array<{ value: SupportLevel; label: string }> = [
    { value: 'basic', label: 'Basic Support' },
    { value: 'priority', label: 'Priority Support' },
    { value: 'premium', label: 'Premium Support' },
    { value: 'enterprise', label: 'Enterprise Support' },
];
const CTA_MODES: Array<{ value: CtaMode; label: string }> = [
    { value: 'contact', label: 'Contact Flow' },
    { value: 'request_payment', label: 'Request Payment' },
    { value: 'internal', label: 'Internal Route' },
    { value: 'external', label: 'External URL' },
];

function makeId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function splitLines(value: string, limit = 100): string[] {
    return Array.from(new Set(String(value || '').split('\n').map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function joinLines(items?: string[] | null): string {
    return Array.isArray(items) ? items.filter(Boolean).join('\n') : '';
}

function num(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: string): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function durationLabel(mode: DurationMode, days: number, months: number): string {
    if (mode === 'months') {
        const safeMonths = Math.max(1, months || 1);
        return `${safeMonths} month${safeMonths === 1 ? '' : 's'}`;
    }
    const safeDays = Math.max(1, days || 1);
    return `${safeDays} day${safeDays === 1 ? '' : 's'}`;
}

function formatPrice(plan: AdminSubscriptionPlan): string {
    if (plan.isFree || Number(plan.priceBDT || 0) <= 0) return 'Free';
    return `${plan.currency || 'BDT'} ${Number(plan.priceBDT || 0).toLocaleString()}`;
}

function emptyPlanForm(): PlanFormState {
    return {
        name: '',
        slug: '',
        code: '',
        shortTitle: '',
        tagline: '',
        shortDescription: '',
        fullDescription: '',
        priceBDT: '0',
        oldPrice: '',
        currency: 'BDT',
        billingCycle: 'monthly',
        durationMode: 'days',
        durationDays: '30',
        durationMonths: '',
        validityLabel: '',
        sortOrder: '100',
        themeKey: 'basic',
        badgeText: '',
        highlightText: '',
        isFeatured: false,
        isActive: true,
        showOnHome: false,
        showOnPricingPage: true,
        visibleFeaturesText: '',
        fullFeaturesText: '',
        excludedFeaturesText: '',
        recommendedFor: '',
        comparisonNote: '',
        supportLevel: 'basic',
        accessScope: '',
        allowsExams: true,
        allowsPremiumResources: false,
        allowsSMSUpdates: false,
        allowsEmailUpdates: true,
        allowsGuardianAlerts: false,
        allowsSpecialGroups: false,
        dashboardPrivilegesText: '',
        maxAttempts: '',
        planType: 'paid',
        ctaLabel: 'Subscribe Now',
        ctaUrl: '/contact',
        ctaMode: 'contact',
        renewalNotes: '',
        policyNote: '',
        faqItems: [],
    };
}

function planToForm(plan: AdminSubscriptionPlan): PlanFormState {
    return {
        name: plan.name || '',
        slug: plan.slug || '',
        code: plan.code || '',
        shortTitle: plan.shortTitle || plan.name || '',
        tagline: plan.tagline || '',
        shortDescription: plan.shortDescription || '',
        fullDescription: plan.fullDescription || plan.description || '',
        priceBDT: String(plan.priceBDT ?? plan.price ?? 0),
        oldPrice: plan.oldPrice === null || plan.oldPrice === undefined ? '' : String(plan.oldPrice),
        currency: plan.currency || 'BDT',
        billingCycle: plan.billingCycle || 'monthly',
        durationMode: plan.durationUnit === 'months' || (plan.durationMonths ?? 0) > 0 ? 'months' : 'days',
        durationDays: String(plan.durationDays ?? 30),
        durationMonths: plan.durationMonths === null || plan.durationMonths === undefined ? '' : String(plan.durationMonths),
        validityLabel: plan.validityLabel || '',
        sortOrder: String(plan.sortOrder ?? plan.displayOrder ?? 100),
        themeKey: plan.themeKey || 'basic',
        badgeText: plan.badgeText || '',
        highlightText: plan.highlightText || '',
        isFeatured: Boolean(plan.isFeatured),
        isActive: Boolean(plan.isActive ?? plan.enabled ?? true),
        showOnHome: Boolean(plan.showOnHome),
        showOnPricingPage: Boolean(plan.showOnPricingPage ?? true),
        visibleFeaturesText: joinLines(plan.visibleFeatures?.length ? plan.visibleFeatures : plan.features),
        fullFeaturesText: joinLines(plan.fullFeatures),
        excludedFeaturesText: joinLines(plan.excludedFeatures),
        recommendedFor: plan.recommendedFor || '',
        comparisonNote: plan.comparisonNote || '',
        supportLevel: plan.supportLevel || 'basic',
        accessScope: plan.accessScope || '',
        allowsExams: Boolean(plan.allowsExams ?? true),
        allowsPremiumResources: Boolean(plan.allowsPremiumResources),
        allowsSMSUpdates: Boolean(plan.allowsSMSUpdates),
        allowsEmailUpdates: Boolean(plan.allowsEmailUpdates ?? true),
        allowsGuardianAlerts: Boolean(plan.allowsGuardianAlerts),
        allowsSpecialGroups: Boolean(plan.allowsSpecialGroups),
        dashboardPrivilegesText: joinLines(plan.dashboardPrivileges),
        maxAttempts: plan.maxAttempts === null || plan.maxAttempts === undefined ? '' : String(plan.maxAttempts),
        planType: plan.planType || plan.type || 'paid',
        ctaLabel: plan.ctaLabel || plan.contactCtaLabel || 'Subscribe Now',
        ctaUrl: plan.ctaUrl || plan.contactCtaUrl || '/contact',
        ctaMode: plan.ctaMode || 'contact',
        renewalNotes: plan.renewalNotes || '',
        policyNote: plan.policyNote || '',
        faqItems: (plan.faqItems || []).map((item) => ({ id: makeId('faq'), question: item.question || '', answer: item.answer || '' })),
    };
}

function buildPlanPayload(form: PlanFormState): Partial<AdminSubscriptionPlan> {
    const nextSlug = slugify(form.slug || form.name || form.code || 'plan');
    const nextCode = slugify(form.code || nextSlug);
    const priceBDT = Math.max(0, num(form.priceBDT, 0));
    const durationDays = Math.max(1, num(form.durationDays, 30));
    const durationMonths = form.durationMode === 'months' ? Math.max(1, num(form.durationMonths, 1)) : null;
    const durationValue = form.durationMode === 'months' ? (durationMonths || 1) : durationDays;
    const visibleFeatures = splitLines(form.visibleFeaturesText, 8);
    const fullFeatures = Array.from(new Set(splitLines(form.fullFeaturesText).concat(visibleFeatures)));
    const isFree = form.planType === 'free' || priceBDT <= 0;
    const order = Math.max(1, num(form.sortOrder, 100));

    return {
        name: form.name.trim(),
        slug: nextSlug,
        code: nextCode,
        shortTitle: form.shortTitle.trim() || form.name.trim(),
        tagline: form.tagline.trim(),
        shortDescription: form.shortDescription.trim(),
        fullDescription: form.fullDescription.trim(),
        type: isFree ? 'free' : 'paid',
        planType: form.planType,
        priceBDT: isFree ? 0 : priceBDT,
        price: isFree ? 0 : priceBDT,
        oldPrice: nullableNum(form.oldPrice),
        currency: form.currency.trim() || 'BDT',
        billingCycle: form.billingCycle,
        durationDays,
        durationMonths,
        durationValue,
        durationUnit: form.durationMode,
        validityLabel: form.validityLabel.trim() || durationLabel(form.durationMode, durationDays, durationMonths || 0),
        themeKey: form.themeKey,
        badgeText: form.badgeText.trim(),
        highlightText: form.highlightText.trim(),
        isFeatured: form.isFeatured,
        enabled: form.isActive,
        isActive: form.isActive,
        showOnHome: form.showOnHome,
        showOnPricingPage: form.showOnPricingPage,
        visibleFeatures,
        features: visibleFeatures,
        fullFeatures,
        includedModules: visibleFeatures,
        excludedFeatures: splitLines(form.excludedFeaturesText),
        recommendedFor: form.recommendedFor.trim(),
        comparisonNote: form.comparisonNote.trim(),
        supportLevel: form.supportLevel,
        accessScope: form.accessScope.trim(),
        allowsExams: form.allowsExams,
        allowsPremiumResources: form.allowsPremiumResources,
        allowsSMSUpdates: form.allowsSMSUpdates,
        allowsEmailUpdates: form.allowsEmailUpdates,
        allowsGuardianAlerts: form.allowsGuardianAlerts,
        allowsSpecialGroups: form.allowsSpecialGroups,
        dashboardPrivileges: splitLines(form.dashboardPrivilegesText, 20),
        maxAttempts: nullableNum(form.maxAttempts),
        displayOrder: order,
        sortOrder: order,
        priority: order,
        ctaLabel: form.ctaLabel.trim() || (isFree ? 'Get Started' : 'Subscribe Now'),
        ctaUrl: form.ctaUrl.trim() || '/contact',
        ctaMode: form.ctaMode,
        contactCtaLabel: form.ctaLabel.trim() || 'Contact to Subscribe',
        contactCtaUrl: form.ctaUrl.trim() || '/contact',
        renewalNotes: form.renewalNotes.trim(),
        policyNote: form.policyNote.trim(),
        faqItems: form.faqItems.map((item) => ({
            question: item.question.trim(),
            answer: item.answer.trim(),
        })).filter((item) => item.question && item.answer),
    };
}

function buildPreviewPlan(form: PlanFormState): AdminSubscriptionPlan {
    const payload = buildPlanPayload(form);
    const priceBDT = Number(payload.priceBDT || 0);
    const durationDays = Number(payload.durationDays || 30);
    const durationMonths = payload.durationMonths === null || payload.durationMonths === undefined ? null : Number(payload.durationMonths || 0);
    const durationUnit = payload.durationUnit === 'months' ? 'months' : 'days';
    const durationValue = durationUnit === 'months' ? (durationMonths || 1) : durationDays;
    const nextDurationLabel = durationLabel(durationUnit, durationDays, durationMonths || 0);

    return {
        _id: 'preview-plan',
        id: 'preview-plan',
        code: String(payload.code || 'preview-plan'),
        slug: String(payload.slug || 'preview-plan'),
        name: String(payload.name || 'Untitled plan'),
        shortTitle: String(payload.shortTitle || payload.name || 'Untitled plan'),
        shortLabel: String(payload.shortTitle || payload.name || 'Untitled plan'),
        tagline: String(payload.tagline || ''),
        type: (payload.type || (priceBDT <= 0 ? 'free' : 'paid')) as 'free' | 'paid',
        planType: (payload.planType || (priceBDT <= 0 ? 'free' : 'paid')) as PlanType,
        priceBDT,
        oldPrice: payload.oldPrice === null || payload.oldPrice === undefined ? null : Number(payload.oldPrice || 0),
        currency: String(payload.currency || 'BDT'),
        billingCycle: (payload.billingCycle || 'monthly') as BillingCycle,
        durationDays,
        durationMonths,
        durationValue,
        durationUnit,
        durationLabel: nextDurationLabel,
        validityLabel: String(payload.validityLabel || nextDurationLabel),
        price: priceBDT,
        priceLabel: priceBDT <= 0 ? 'Free' : `${payload.currency || 'BDT'} ${priceBDT.toLocaleString()}`,
        isFree: priceBDT <= 0,
        isPaid: priceBDT > 0,
        bannerImageUrl: null,
        shortDescription: String(payload.shortDescription || ''),
        fullDescription: String(payload.fullDescription || ''),
        description: String(payload.fullDescription || payload.shortDescription || ''),
        features: (payload.features || []) as string[],
        visibleFeatures: (payload.visibleFeatures || payload.features || []) as string[],
        fullFeatures: (payload.fullFeatures || payload.visibleFeatures || payload.features || []) as string[],
        excludedFeatures: (payload.excludedFeatures || []) as string[],
        tags: [],
        includedModules: (payload.includedModules || payload.visibleFeatures || payload.features || []) as string[],
        recommendedFor: String(payload.recommendedFor || ''),
        comparisonNote: String(payload.comparisonNote || ''),
        supportLevel: (payload.supportLevel || 'basic') as SupportLevel,
        accessScope: String(payload.accessScope || ''),
        renewalNotes: String(payload.renewalNotes || ''),
        policyNote: String(payload.policyNote || ''),
        faqItems: (payload.faqItems || []) as Array<{ question: string; answer: string }>,
        themeKey: (payload.themeKey || 'basic') as ThemeKey,
        badgeText: String(payload.badgeText || ''),
        highlightText: String(payload.highlightText || ''),
        allowsExams: Boolean(payload.allowsExams ?? true),
        allowsPremiumResources: Boolean(payload.allowsPremiumResources),
        allowsSMSUpdates: Boolean(payload.allowsSMSUpdates),
        allowsEmailUpdates: Boolean(payload.allowsEmailUpdates ?? true),
        allowsGuardianAlerts: Boolean(payload.allowsGuardianAlerts),
        allowsSpecialGroups: Boolean(payload.allowsSpecialGroups),
        dashboardPrivileges: (payload.dashboardPrivileges || []) as string[],
        maxAttempts: payload.maxAttempts === null || payload.maxAttempts === undefined ? null : Number(payload.maxAttempts || 0),
        enabled: Boolean(payload.enabled ?? payload.isActive ?? true),
        isActive: Boolean(payload.isActive ?? payload.enabled ?? true),
        isArchived: false,
        isFeatured: Boolean(payload.isFeatured),
        showOnHome: Boolean(payload.showOnHome),
        showOnPricingPage: Boolean(payload.showOnPricingPage ?? true),
        displayOrder: Number(payload.displayOrder || payload.sortOrder || 100),
        priority: Number(payload.priority || payload.sortOrder || 100),
        sortOrder: Number(payload.sortOrder || payload.displayOrder || 100),
        ctaLabel: String(payload.ctaLabel || 'Subscribe Now'),
        ctaUrl: String(payload.ctaUrl || '/contact'),
        ctaMode: (payload.ctaMode || 'contact') as CtaMode,
        contactCtaLabel: String(payload.contactCtaLabel || payload.ctaLabel || 'Contact to Subscribe'),
        contactCtaUrl: String(payload.contactCtaUrl || payload.ctaUrl || '/contact'),
    };
}

function settingsToForm(settings?: SubscriptionPlansPublicSettings): SettingsFormState {
    return {
        pageTitle: settings?.pageTitle || 'Subscription Plans',
        pageSubtitle: settings?.pageSubtitle || 'Choose the right plan for your CampusWay journey.',
        heroEyebrow: settings?.heroEyebrow || 'CampusWay Memberships',
        heroNote: settings?.heroNote || 'Premium access, clear comparisons, and one-click plan details.',
        headerBannerUrl: settings?.headerBannerUrl || '',
        defaultPlanBannerUrl: settings?.defaultPlanBannerUrl || '',
        currencyLabel: settings?.currencyLabel || 'BDT',
        showFeaturedFirst: settings?.showFeaturedFirst ?? true,
        allowFreePlans: settings?.allowFreePlans ?? true,
        comparisonEnabled: settings?.comparisonEnabled ?? true,
        comparisonTitle: settings?.comparisonTitle || 'Compare Plans',
        comparisonSubtitle: settings?.comparisonSubtitle || 'See what changes as you upgrade.',
        comparisonRows: (settings?.comparisonRows || []).map((item) => ({ id: makeId('comparison'), key: item.key || '', label: item.label || '' })),
        pageFaqEnabled: settings?.pageFaqEnabled ?? true,
        pageFaqTitle: settings?.pageFaqTitle || 'Frequently Asked Questions',
        pageFaqItems: (settings?.pageFaqItems || []).map((item) => ({ id: makeId('settings-faq'), question: item.question || '', answer: item.answer || '' })),
        sectionToggles: {
            detailsDrawer: settings?.sectionToggles?.detailsDrawer ?? true,
            comparisonTable: settings?.sectionToggles?.comparisonTable ?? true,
            faqBlock: settings?.sectionToggles?.faqBlock ?? true,
            homePreview: settings?.sectionToggles?.homePreview ?? true,
        },
        defaultCtaMode: settings?.defaultCtaMode || 'contact',
    };
}

function buildSettingsPayload(form: SettingsFormState): SubscriptionPlansPublicSettings {
    return {
        pageTitle: form.pageTitle.trim(),
        pageSubtitle: form.pageSubtitle.trim(),
        heroEyebrow: form.heroEyebrow.trim(),
        heroNote: form.heroNote.trim(),
        headerBannerUrl: form.headerBannerUrl.trim() || null,
        defaultPlanBannerUrl: form.defaultPlanBannerUrl.trim() || null,
        currencyLabel: form.currencyLabel.trim() || 'BDT',
        showFeaturedFirst: form.showFeaturedFirst,
        allowFreePlans: form.allowFreePlans,
        comparisonEnabled: form.comparisonEnabled,
        comparisonTitle: form.comparisonTitle.trim(),
        comparisonSubtitle: form.comparisonSubtitle.trim(),
        comparisonRows: form.comparisonRows.map((item) => ({ key: item.key.trim(), label: item.label.trim() })).filter((item) => item.key && item.label),
        pageFaqEnabled: form.pageFaqEnabled,
        pageFaqTitle: form.pageFaqTitle.trim(),
        pageFaqItems: form.pageFaqItems.map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })).filter((item) => item.question && item.answer),
        sectionToggles: { ...form.sectionToggles },
        defaultCtaMode: form.defaultCtaMode,
    };
}

function surface(title: string, subtitle: string | undefined, children: ReactNode, action?: ReactNode) {
    return (
        <section className="rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
                </div>
                {action}
            </div>
            <div className="mt-5">{children}</div>
        </section>
    );
}

function inputClass(multiline = false): string {
    return `w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-800 ${multiline ? 'min-h-[132px]' : ''}`;
}

function statCard(label: string, value: string, accent = false) {
    return (
        <div className={`group relative overflow-hidden rounded-[1.5rem] border px-5 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${accent ? 'border-cyan-300/60 bg-cyan-50/90 dark:border-cyan-800/60 dark:bg-cyan-950/40' : 'border-slate-200/80 bg-white/90 dark:border-slate-800/80 dark:bg-slate-950/70'}`}>
            <div className={`absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl transition-all duration-500 group-hover:scale-150 ${accent ? 'bg-gradient-to-br from-cyan-400/15 to-indigo-400/10' : 'bg-gradient-to-br from-slate-300/10 to-cyan-300/10 dark:from-slate-600/10 dark:to-cyan-600/10'}`} />
            <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
            <p className="relative mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
        </div>
    );
}

function field(label: string, child: ReactNode, hint?: string, wide = false) {
    return (
        <label className={`space-y-2 ${wide ? 'md:col-span-2' : ''}`}>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
            {child}
            {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </label>
    );
}

function toggleCard(label: string, checked: boolean, onChange: (next: boolean) => void, hint?: string) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-cyan-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-500/60 dark:hover:bg-slate-800"
        >
            <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
            </div>
            <span className={`mt-1 inline-flex h-6 w-11 rounded-full p-1 transition ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
        </button>
    );
}

function grid(children: ReactNode) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

export default function AdminSubscriptionPlansPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams<{ id?: string }>();
    const plansQuery = useAdminSubscriptionPlans();
    const settingsQuery = useSubscriptionSettings();
    const selectedPlanQuery = useAdminSubscriptionPlan(params.id || '');
    const createMutation = useCreateSubscriptionPlanMutation();
    const updateMutation = useUpdateSubscriptionPlanMutation();
    const deleteMutation = useDeleteSubscriptionPlanMutation();
    const toggleMutation = useToggleSubscriptionPlanMutation();
    const toggleFeaturedMutation = useToggleSubscriptionPlanFeaturedMutation();
    const duplicateMutation = useDuplicateSubscriptionPlanMutation();
    const reorderMutation = useReorderSubscriptionPlansMutation();
    const updateSettingsMutation = useUpdateSubscriptionSettingsMutation();

    const basePath = ADMIN_PATHS.subscriptionPlans;
    const pathname = location.pathname;
    const isCreateRoute = pathname === `${basePath}/new`;
    const isEditRoute = Boolean(params.id) && pathname.endsWith('/edit');
    const isPreviewRoute = Boolean(params.id) && !isEditRoute;
    const isListRoute = !isCreateRoute && !params.id;

    const plans = plansQuery.data || [];
    const selectedPlan = useMemo(() => {
        if (!params.id) return null;
        return selectedPlanQuery.data || plans.find((plan) => plan._id === params.id) || null;
    }, [params.id, plans, selectedPlanQuery.data]);

    const [planForm, setPlanForm] = useState<PlanFormState>(() => emptyPlanForm());
    const [settingsForm, setSettingsForm] = useState<SettingsFormState>(() => settingsToForm(undefined));
    const [orderDraft, setOrderDraft] = useState<string[]>([]);
    const [detailsPreviewOpen, setDetailsPreviewOpen] = useState(false);

    useEffect(() => {
        if (!pathname.startsWith('/__cw_admin__/subscription-plans')) return;
        navigate(`${basePath}${pathname.slice('/__cw_admin__/subscription-plans'.length)}${location.search}${location.hash}`, { replace: true });
    }, [basePath, location.hash, location.search, navigate, pathname]);

    useEffect(() => {
        if (!plans.length) {
            setOrderDraft([]);
            return;
        }
        const next = plans.map((plan) => plan._id);
        setOrderDraft((prev) => prev.length === next.length && prev.every((item, index) => item === next[index]) ? prev : next);
    }, [plans]);

    useEffect(() => {
        if (isCreateRoute) setPlanForm(emptyPlanForm());
        else if (selectedPlan) setPlanForm(planToForm(selectedPlan));
    }, [isCreateRoute, selectedPlan]);

    useEffect(() => {
        if (settingsQuery.data) setSettingsForm(settingsToForm(settingsQuery.data));
    }, [settingsQuery.data]);

    const orderedPlans = useMemo(() => {
        const lookup = new Map(plans.map((plan) => [plan._id, plan]));
        return orderDraft.map((id) => lookup.get(id)).filter((item): item is AdminSubscriptionPlan => Boolean(item));
    }, [orderDraft, plans]);

    const previewPlan = useMemo(() => buildPreviewPlan(planForm), [planForm]);
    const drawerPlan = isPreviewRoute && selectedPlan ? selectedPlan : previewPlan;
    const stats = useMemo(() => ({
        total: plans.length,
        active: plans.filter((plan) => plan.isActive).length,
        featured: plans.filter((plan) => plan.isFeatured).length,
        home: plans.filter((plan) => plan.showOnHome).length,
        archived: plans.filter((plan) => plan.isArchived).length,
    }), [plans]);
    const orderChanged = plans.some((plan, index) => plan._id !== orderDraft[index]);

    const savingPlan = createMutation.isPending || updateMutation.isPending;
    const pageTitle = isCreateRoute ? 'Create Subscription Plan' : isEditRoute ? 'Edit Subscription Plan' : isPreviewRoute ? 'Plan Preview' : 'Subscription Plans';
    const pageDescription = isListRoute
        ? 'Manage premium plan cards, ordering, shared CTA behavior, and pricing-page settings from one backend-connected admin module.'
        : isPreviewRoute
            ? 'Review the exact premium card and details experience before publishing.'
            : 'Edit the shared plan record that powers card copy, details, checkout, and dashboard UX.';

    const movePlan = (id: string, direction: 'up' | 'down') => {
        setOrderDraft((prev) => {
            const index = prev.indexOf(id);
            if (index < 0) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(target, 0, item);
            return next;
        });
    };

    const exportData = async (resource: 'plans' | 'subscriptions', format: 'csv' | 'xlsx') => {
        try {
            const response = resource === 'plans' ? await adminExportSubscriptionPlans(format) : await adminExportSubscriptions(format);
            downloadFile(response, { filename: resource === 'plans' ? `subscription_plans.${format}` : `subscriptions.${format}` });
            toast.success(`${resource === 'plans' ? 'Plan' : 'Subscription'} export ready`);
        } catch {
            toast.error('Export failed');
        }
    };

    const savePlan = async () => {
        const payload = buildPlanPayload(planForm);
        if (!payload.name) {
            toast.error('Plan name is required');
            return;
        }
        // Validate BDT pricing for paid plans
        const rawPrice = Number(planForm.priceBDT);
        if (planForm.planType !== 'free' && (!Number.isFinite(rawPrice) || rawPrice < 0)) {
            toast.error('BDT price must be a valid non-negative number');
            return;
        }
        try {
            if (isEditRoute && params.id) {
                const response = await updateMutation.mutateAsync({ id: params.id, payload });
                toast.success('Plan updated');
                navigate(`${basePath}/${response.data?.item?._id || params.id}`, { replace: true });
            } else {
                const response = await createMutation.mutateAsync(payload);
                toast.success('Plan created');
                navigate(`${basePath}/${response.data?.item?._id || ''}`, { replace: true });
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to save plan');
        }
    };

    const archivePlan = async (plan: AdminSubscriptionPlan) => {
        const confirmed = await showConfirmDialog({
            title: 'Archive subscription plan?',
            message: `Archive "${plan.name}" from admin and public plan listings?`,
            description: 'Existing records stay intact, but the plan will no longer be treated as active content.',
            confirmLabel: 'Archive plan',
            cancelLabel: 'Keep plan',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await deleteMutation.mutateAsync(plan._id);
            toast.success('Plan archived');
            if (params.id === plan._id) navigate(basePath, { replace: true });
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Archive failed');
        }
    };

    const toggleActive = async (plan: AdminSubscriptionPlan) => {
        try {
            await toggleMutation.mutateAsync(plan._id);
            toast.success(plan.isActive ? 'Plan disabled' : 'Plan enabled');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Status update failed');
        }
    };

    const toggleFeatured = async (plan: AdminSubscriptionPlan) => {
        try {
            await toggleFeaturedMutation.mutateAsync(plan._id);
            toast.success(plan.isFeatured ? 'Featured flag removed' : 'Plan marked featured');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Feature update failed');
        }
    };

    const duplicatePlan = async (plan: AdminSubscriptionPlan) => {
        try {
            const response = await duplicateMutation.mutateAsync(plan._id);
            toast.success('Plan duplicated');
            navigate(`${basePath}/${response.data?.item?._id || plan._id}/edit`);
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Duplicate failed');
        }
    };

    const saveOrder = async () => {
        try {
            await reorderMutation.mutateAsync(orderDraft);
            toast.success('Plan order updated');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Reorder failed');
        }
    };

    const saveSettings = async () => {
        try {
            await updateSettingsMutation.mutateAsync(buildSettingsPayload(settingsForm));
            toast.success('Subscription settings saved');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Settings save failed');
        }
    };

    return (
        <AdminGuardShell title={pageTitle} description={pageDescription} allowedRoles={['superadmin', 'admin', 'moderator']}>
            <AdminTabNav tabs={[
                { key: 'plans', label: 'Subscription Plans', path: ADMIN_PATHS.subscriptionPlans, icon: CreditCard },
                { key: 'subs', label: 'Subscriptions', path: ADMIN_PATHS.subscriptionsV2, icon: CreditCard },
                { key: 'contact', label: 'Contact Center', path: ADMIN_PATHS.subscriptionContactCenter, icon: Users },
            ]} />
            <div className="space-y-6">
                <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-[0_24px_70px_rgba(6,10,24,0.24)]">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">Subscription & Payments</p>
                            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{pageTitle}</h1>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{pageDescription}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {!isListRoute ? (
                                <button type="button" onClick={() => navigate(basePath)} className="btn-outline border-white/20 bg-white/10 text-sm text-white hover:bg-white/15">
                                    <ArrowLeft className="h-4 w-4" />
                                    Back to Plans
                                </button>
                            ) : null}
                            {isListRoute ? (
                                <Link to={`${basePath}/new`} className="btn-primary text-sm">
                                    <Plus className="h-4 w-4" />
                                    New Plan
                                </Link>
                            ) : null}
                            <button type="button" onClick={() => exportData('plans', 'xlsx')} className="btn-outline border-white/20 bg-white/10 text-sm text-white hover:bg-white/15">
                                <Download className="h-4 w-4" />
                                Plans XLSX
                            </button>
                            <button type="button" onClick={() => exportData('subscriptions', 'csv')} className="btn-outline border-white/20 bg-white/10 text-sm text-white hover:bg-white/15">
                                <Download className="h-4 w-4" />
                                Subscriptions CSV
                            </button>
                        </div>
                    </div>
                </div>

                {isListRoute ? (
                    <>
                        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                            {statCard('Total Plans', String(stats.total))}
                            {statCard('Active', String(stats.active), true)}
                            {statCard('Featured', String(stats.featured))}
                            {statCard('Home Visible', String(stats.home))}
                            {statCard('Archived', String(stats.archived))}
                        </div>

                        {surface(
                            'Subscription Plans',
                            'Compact admin rows with preview, edit, duplicate, activate, feature, archive, and reorder actions.',
                            plansQuery.isLoading ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading subscription plans...
                                </div>
                            ) : orderedPlans.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                    No plans yet. Create the first premium subscription plan.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {orderedPlans.map((plan, index) => (
                                        <div key={plan._id} className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70 transition-all hover:shadow-md">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Link to={`${basePath}/${plan._id}`} className="text-lg font-semibold text-slate-950 hover:text-cyan-700 dark:text-white dark:hover:text-cyan-300">{plan.name}</Link>
                                                            {plan.isFeatured ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Featured</span> : null}
                                                            {plan.isArchived ? <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">Archived</span> : null}
                                                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${plan.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{plan.isActive ? 'Active' : 'Inactive'}</span>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{plan.tagline || plan.shortDescription || 'Plan tagline not added yet.'}</p>

                                                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-5 text-sm text-slate-600 dark:text-slate-300">
                                                            <div className="flex flex-col rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50 sm:bg-transparent sm:p-0"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Price</span><span className="font-medium text-slate-900 dark:text-white">{formatPrice(plan)}</span></div>
                                                            <div className="flex flex-col rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50 sm:bg-transparent sm:p-0"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cycle</span><span className="font-medium text-slate-900 dark:text-white">{plan.billingCycle || 'monthly'}</span></div>
                                                            <div className="flex flex-col rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50 sm:bg-transparent sm:p-0"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Order</span><span className="font-medium text-slate-900 dark:text-white">{plan.sortOrder || plan.displayOrder || 100}</span></div>
                                                            <div className="flex flex-col rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50 sm:bg-transparent sm:p-0"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Home</span><span className="font-medium text-slate-900 dark:text-white">{plan.showOnHome ? 'Visible' : 'Hidden'}</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0 rounded-[1.25rem] bg-slate-50 p-1 dark:bg-slate-900/60 self-start">
                                                        <button type="button" onClick={() => movePlan(plan._id, 'up')} disabled={index === 0} className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white hover:shadow-sm disabled:opacity-40 hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400" title="Move Up"><ArrowUp className="h-4 w-4" /></button>
                                                        <button type="button" onClick={() => movePlan(plan._id, 'down')} disabled={index === orderedPlans.length - 1} className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white hover:shadow-sm disabled:opacity-40 hover:text-cyan-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400" title="Move Down"><ArrowDown className="h-4 w-4" /></button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800/80">
                                                    <Link to={`${basePath}/${plan._id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"><Eye className="h-3 w-3" />Preview</Link>
                                                    <Link to={`${basePath}/${plan._id}/edit`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"><Pencil className="h-3 w-3" />Edit</Link>
                                                    <button type="button" onClick={() => duplicatePlan(plan)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"><Copy className="h-3 w-3" />Duplicate</button>
                                                    <button type="button" onClick={() => toggleActive(plan)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${plan.isActive ? 'border-amber-200/60 text-amber-600 hover:bg-amber-50 dark:border-amber-500/20 dark:text-amber-400' : 'border-emerald-200/60 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/20 dark:text-emerald-400'}`}>{plan.isActive ? 'Deactivate' : 'Activate'}</button>
                                                    <button type="button" onClick={() => toggleFeatured(plan)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${plan.isFeatured ? 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400' : 'border-amber-200/60 text-amber-600 dark:border-amber-500/20 dark:text-amber-400'}`}>
                                                        <Sparkles className="h-3 w-3" />{plan.isFeatured ? 'Unfeature' : 'Feature'}
                                                    </button>
                                                    <div className="flex-1" />
                                                    <button type="button" onClick={() => archivePlan(plan)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200/40 px-3 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/15 dark:text-rose-400"><Trash2 className="h-3 w-3" />Archive</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ),
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => exportData('plans', 'csv')} className="btn-outline text-xs"><Download className="h-4 w-4" />CSV</button>
                                <button type="button" onClick={saveOrder} disabled={!orderChanged || reorderMutation.isPending} className="btn-primary text-xs disabled:opacity-50">
                                    {reorderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Save Order
                                </button>
                            </div>
                        )}

                        {surface(
                            'Pricing Page Settings',
                            'Drive the public pricing hero, comparison table, FAQ block, and shared CTA defaults from one admin-managed record.',
                            <div className="space-y-5">
                                {grid(
                                    <>
                                        {field('Page Title', <input className={inputClass()} value={settingsForm.pageTitle} onChange={(event) => setSettingsForm((prev) => ({ ...prev, pageTitle: event.target.value }))} />)}
                                        {field('Hero Eyebrow', <input className={inputClass()} value={settingsForm.heroEyebrow} onChange={(event) => setSettingsForm((prev) => ({ ...prev, heroEyebrow: event.target.value }))} />)}
                                        {field('Page Subtitle', <textarea className={inputClass(true)} value={settingsForm.pageSubtitle} onChange={(event) => setSettingsForm((prev) => ({ ...prev, pageSubtitle: event.target.value }))} />, undefined, true)}
                                        {field('Hero Note', <textarea className={inputClass(true)} value={settingsForm.heroNote} onChange={(event) => setSettingsForm((prev) => ({ ...prev, heroNote: event.target.value }))} />, undefined, true)}
                                        {field('Header Banner URL', <input className={inputClass()} value={settingsForm.headerBannerUrl} onChange={(event) => setSettingsForm((prev) => ({ ...prev, headerBannerUrl: event.target.value }))} />)}
                                        {field('Default Plan Banner URL', <input className={inputClass()} value={settingsForm.defaultPlanBannerUrl} onChange={(event) => setSettingsForm((prev) => ({ ...prev, defaultPlanBannerUrl: event.target.value }))} />)}
                                        {field('Currency Label', <input className={inputClass()} value={settingsForm.currencyLabel} onChange={(event) => setSettingsForm((prev) => ({ ...prev, currencyLabel: event.target.value }))} />)}
                                        {field('Default CTA Mode', (
                                            <select className={inputClass()} value={settingsForm.defaultCtaMode} onChange={(event) => setSettingsForm((prev) => ({ ...prev, defaultCtaMode: event.target.value as CtaMode }))}>
                                                {CTA_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                        ))}
                                    </>
                                )}
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    {toggleCard('Show featured plans first', settingsForm.showFeaturedFirst, (next) => setSettingsForm((prev) => ({ ...prev, showFeaturedFirst: next })))}
                                    {toggleCard('Allow free plans', settingsForm.allowFreePlans, (next) => setSettingsForm((prev) => ({ ...prev, allowFreePlans: next })))}
                                    {toggleCard('Enable comparison table', settingsForm.comparisonEnabled, (next) => setSettingsForm((prev) => ({ ...prev, comparisonEnabled: next })))}
                                    {toggleCard('Enable page FAQ', settingsForm.pageFaqEnabled, (next) => setSettingsForm((prev) => ({ ...prev, pageFaqEnabled: next })))}
                                    {toggleCard('Details drawer enabled', settingsForm.sectionToggles.detailsDrawer, (next) => setSettingsForm((prev) => ({ ...prev, sectionToggles: { ...prev.sectionToggles, detailsDrawer: next } })))}
                                    {toggleCard('Home preview enabled', settingsForm.sectionToggles.homePreview, (next) => setSettingsForm((prev) => ({ ...prev, sectionToggles: { ...prev.sectionToggles, homePreview: next } })))}
                                    {toggleCard('Comparison section visible', settingsForm.sectionToggles.comparisonTable, (next) => setSettingsForm((prev) => ({ ...prev, sectionToggles: { ...prev.sectionToggles, comparisonTable: next } })))}
                                    {toggleCard('FAQ section visible', settingsForm.sectionToggles.faqBlock, (next) => setSettingsForm((prev) => ({ ...prev, sectionToggles: { ...prev.sectionToggles, faqBlock: next } })))}
                                </div>
                                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                    <div className="space-y-4 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                        <div className="flex items-center justify-between gap-3">
                                            <div><h3 className="text-base font-semibold text-slate-950 dark:text-white">Compare Table Settings</h3><p className="text-sm text-slate-500 dark:text-slate-400">Rows used by the shared comparison table.</p></div>
                                            <button type="button" onClick={() => setSettingsForm((prev) => ({ ...prev, comparisonRows: prev.comparisonRows.concat([{ id: makeId('comparison'), key: '', label: '' }]) }))} className="btn-outline text-xs"><Plus className="h-4 w-4" />Add Row</button>
                                        </div>
                                        {grid(
                                            <>
                                                {field('Comparison Title', <input className={inputClass()} value={settingsForm.comparisonTitle} onChange={(event) => setSettingsForm((prev) => ({ ...prev, comparisonTitle: event.target.value }))} />, undefined, true)}
                                                {field('Comparison Subtitle', <textarea className={inputClass(true)} value={settingsForm.comparisonSubtitle} onChange={(event) => setSettingsForm((prev) => ({ ...prev, comparisonSubtitle: event.target.value }))} />, undefined, true)}
                                            </>
                                        )}
                                        <div className="space-y-3">
                                            {settingsForm.comparisonRows.map((row, index) => (
                                                <div key={row.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                                    <input className={inputClass()} placeholder="Field key" value={row.key} onChange={(event) => setSettingsForm((prev) => ({ ...prev, comparisonRows: prev.comparisonRows.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} />
                                                    <input className={inputClass()} placeholder="Label" value={row.label} onChange={(event) => setSettingsForm((prev) => ({ ...prev, comparisonRows: prev.comparisonRows.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} />
                                                    <button type="button" onClick={() => setSettingsForm((prev) => ({ ...prev, comparisonRows: prev.comparisonRows.filter((item) => item.id !== row.id) }))} className="btn-outline text-xs text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300">Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-4 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                        <div className="flex items-center justify-between gap-3">
                                            <div><h3 className="text-base font-semibold text-slate-950 dark:text-white">Plan FAQ / Notes</h3><p className="text-sm text-slate-500 dark:text-slate-400">Page-level FAQ for the pricing page.</p></div>
                                            <button type="button" onClick={() => setSettingsForm((prev) => ({ ...prev, pageFaqItems: prev.pageFaqItems.concat([{ id: makeId('settings-faq'), question: '', answer: '' }]) }))} className="btn-outline text-xs"><Plus className="h-4 w-4" />Add FAQ</button>
                                        </div>
                                        {field('FAQ Title', <input className={inputClass()} value={settingsForm.pageFaqTitle} onChange={(event) => setSettingsForm((prev) => ({ ...prev, pageFaqTitle: event.target.value }))} />)}
                                        <div className="space-y-3">
                                            {settingsForm.pageFaqItems.map((item, index) => (
                                                <div key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
                                                    <input className={inputClass()} placeholder="Question" value={item.question} onChange={(event) => setSettingsForm((prev) => ({ ...prev, pageFaqItems: prev.pageFaqItems.map((faq, faqIndex) => faqIndex === index ? { ...faq, question: event.target.value } : faq) }))} />
                                                    <textarea className={inputClass(true)} placeholder="Answer" value={item.answer} onChange={(event) => setSettingsForm((prev) => ({ ...prev, pageFaqItems: prev.pageFaqItems.map((faq, faqIndex) => faqIndex === index ? { ...faq, answer: event.target.value } : faq) }))} />
                                                    <button type="button" onClick={() => setSettingsForm((prev) => ({ ...prev, pageFaqItems: prev.pageFaqItems.filter((faq) => faq.id !== item.id) }))} className="btn-outline text-xs text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300">Remove FAQ</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>,
                            <button type="button" onClick={saveSettings} disabled={updateSettingsMutation.isPending} className="btn-primary text-sm disabled:opacity-50">
                                {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Settings
                            </button>
                        )}
                    </>
                ) : null}

                {(isCreateRoute || isEditRoute) ? (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)]">
                        <div className="space-y-6">
                            {surface('Basic Info', 'Plan identity and shared content used across card, drawer, checkout, and dashboard.', grid(
                                <>
                                    {field('Plan Name', <input className={inputClass()} value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="CampusWay Premium" />)}
                                    {field('Short Title', <input className={inputClass()} value={planForm.shortTitle} onChange={(event) => setPlanForm((prev) => ({ ...prev, shortTitle: event.target.value }))} placeholder="Premium" />)}
                                    {field('Slug', <input className={inputClass()} value={planForm.slug} onChange={(event) => setPlanForm((prev) => ({ ...prev, slug: event.target.value }))} placeholder="campusway-premium" />)}
                                    {field('Legacy Code', <input className={inputClass()} value={planForm.code} onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="premium-30" />, 'Kept for backwards compatibility.')}
                                    {field('Tagline', <input className={inputClass()} value={planForm.tagline} onChange={(event) => setPlanForm((prev) => ({ ...prev, tagline: event.target.value }))} placeholder="Best for ambitious students" />, undefined, true)}
                                    {field('Short Description', <textarea className={inputClass(true)} value={planForm.shortDescription} onChange={(event) => setPlanForm((prev) => ({ ...prev, shortDescription: event.target.value }))} />, undefined, true)}
                                    {field('Full Description', <textarea className={inputClass(true)} value={planForm.fullDescription} onChange={(event) => setPlanForm((prev) => ({ ...prev, fullDescription: event.target.value }))} />, undefined, true)}
                                </>
                            ), <button type="button" onClick={savePlan} disabled={savingPlan} className="btn-primary text-sm disabled:opacity-50">{savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Plan</button>)}

                            {surface('Pricing', 'Price stack, billing cycle, and validity details.', grid(
                                <>
                                    {field('Plan Type', <select className={inputClass()} value={planForm.planType} onChange={(event) => setPlanForm((prev) => ({ ...prev, planType: event.target.value as PlanType }))}>{PLAN_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
                                    {field('Billing Cycle', <select className={inputClass()} value={planForm.billingCycle} onChange={(event) => setPlanForm((prev) => ({ ...prev, billingCycle: event.target.value as BillingCycle }))}>{CYCLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
                                    {field('Price', <input type="number" min="0" className={inputClass()} value={planForm.priceBDT} onChange={(event) => setPlanForm((prev) => ({ ...prev, priceBDT: event.target.value }))} />)}
                                    {field('Old Price', <input type="number" min="0" className={inputClass()} value={planForm.oldPrice} onChange={(event) => setPlanForm((prev) => ({ ...prev, oldPrice: event.target.value }))} />)}
                                    {field('Currency', <input className={inputClass()} value={planForm.currency} onChange={(event) => setPlanForm((prev) => ({ ...prev, currency: event.target.value }))} />)}
                                    {field('Sort Order', <input type="number" min="1" className={inputClass()} value={planForm.sortOrder} onChange={(event) => setPlanForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />)}
                                    {field('Duration Mode', <select className={inputClass()} value={planForm.durationMode} onChange={(event) => setPlanForm((prev) => ({ ...prev, durationMode: event.target.value as DurationMode }))}><option value="days">Days</option><option value="months">Months</option></select>)}
                                    {field('Duration Days', <input type="number" min="1" className={inputClass()} value={planForm.durationDays} onChange={(event) => setPlanForm((prev) => ({ ...prev, durationDays: event.target.value }))} />)}
                                    {field('Duration Months', <input type="number" min="1" className={inputClass()} value={planForm.durationMonths} onChange={(event) => setPlanForm((prev) => ({ ...prev, durationMonths: event.target.value }))} />)}
                                    {field('Validity Label', <input className={inputClass()} value={planForm.validityLabel} onChange={(event) => setPlanForm((prev) => ({ ...prev, validityLabel: event.target.value }))} placeholder="3 months full access" />)}
                                </>
                            ))}

                            {surface('Card Display', 'Theme, badge copy, highlight text, and visibility toggles.', (
                                <div className="space-y-5">
                                    {grid(
                                        <>
                                            {field('Theme', <select className={inputClass()} value={planForm.themeKey} onChange={(event) => setPlanForm((prev) => ({ ...prev, themeKey: event.target.value as ThemeKey }))}>{THEMES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
                                            {field('Badge Text', <input className={inputClass()} value={planForm.badgeText} onChange={(event) => setPlanForm((prev) => ({ ...prev, badgeText: event.target.value }))} placeholder="Most Popular" />)}
                                            {field('Highlight Text', <input className={inputClass()} value={planForm.highlightText} onChange={(event) => setPlanForm((prev) => ({ ...prev, highlightText: event.target.value }))} placeholder="Premium choice for exam-focused students" />, undefined, true)}
                                        </>
                                    )}
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                        {toggleCard('Featured plan', planForm.isFeatured, (next) => setPlanForm((prev) => ({ ...prev, isFeatured: next })))}
                                        {toggleCard('Active plan', planForm.isActive, (next) => setPlanForm((prev) => ({ ...prev, isActive: next })))}
                                        {toggleCard('Show on home', planForm.showOnHome, (next) => setPlanForm((prev) => ({ ...prev, showOnHome: next })))}
                                        {toggleCard('Show on pricing page', planForm.showOnPricingPage, (next) => setPlanForm((prev) => ({ ...prev, showOnPricingPage: next })))}
                                    </div>
                                </div>
                            ))}

                            {surface('Features', 'Short visible features on the card and full/excluded lists inside the details drawer.', grid(
                                <>
                                    {field('Short Visible Features', <textarea className={inputClass(true)} value={planForm.visibleFeaturesText} onChange={(event) => setPlanForm((prev) => ({ ...prev, visibleFeaturesText: event.target.value }))} placeholder={'Unlimited exams\nResult analytics\nPremium resource vault'} />, 'One feature per line.', true)}
                                    {field('Full Feature List', <textarea className={inputClass(true)} value={planForm.fullFeaturesText} onChange={(event) => setPlanForm((prev) => ({ ...prev, fullFeaturesText: event.target.value }))} />, undefined, true)}
                                    {field('Excluded Features', <textarea className={inputClass(true)} value={planForm.excludedFeaturesText} onChange={(event) => setPlanForm((prev) => ({ ...prev, excludedFeaturesText: event.target.value }))} />, undefined, true)}
                                </>
                            ))}

                            {surface('Privileges', 'Business logic flags for access, notifications, support, and dashboard capabilities.', (
                                <div className="space-y-5">
                                    {grid(
                                        <>
                                            {field('Recommended For', <input className={inputClass()} value={planForm.recommendedFor} onChange={(event) => setPlanForm((prev) => ({ ...prev, recommendedFor: event.target.value }))} placeholder="Students preparing for multiple competitive exams" />, undefined, true)}
                                            {field('Comparison Note', <textarea className={inputClass(true)} value={planForm.comparisonNote} onChange={(event) => setPlanForm((prev) => ({ ...prev, comparisonNote: event.target.value }))} />, undefined, true)}
                                            {field('Support Level', <select className={inputClass()} value={planForm.supportLevel} onChange={(event) => setPlanForm((prev) => ({ ...prev, supportLevel: event.target.value as SupportLevel }))}>{SUPPORT_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
                                            {field('Access Scope', <input className={inputClass()} value={planForm.accessScope} onChange={(event) => setPlanForm((prev) => ({ ...prev, accessScope: event.target.value }))} placeholder="All mock exams, premium resources, and analytics dashboard" />)}
                                            {field('Dashboard Privileges', <textarea className={inputClass(true)} value={planForm.dashboardPrivilegesText} onChange={(event) => setPlanForm((prev) => ({ ...prev, dashboardPrivilegesText: event.target.value }))} />, 'One privilege per line.', true)}
                                            {field('Max Attempts', <input type="number" min="0" className={inputClass()} value={planForm.maxAttempts} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxAttempts: event.target.value }))} />)}
                                        </>
                                    )}
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                        {toggleCard('Exam access', planForm.allowsExams, (next) => setPlanForm((prev) => ({ ...prev, allowsExams: next })))}
                                        {toggleCard('Premium resources', planForm.allowsPremiumResources, (next) => setPlanForm((prev) => ({ ...prev, allowsPremiumResources: next })))}
                                        {toggleCard('SMS updates', planForm.allowsSMSUpdates, (next) => setPlanForm((prev) => ({ ...prev, allowsSMSUpdates: next })))}
                                        {toggleCard('Email updates', planForm.allowsEmailUpdates, (next) => setPlanForm((prev) => ({ ...prev, allowsEmailUpdates: next })))}
                                        {toggleCard('Guardian alerts', planForm.allowsGuardianAlerts, (next) => setPlanForm((prev) => ({ ...prev, allowsGuardianAlerts: next })))}
                                        {toggleCard('Special groups', planForm.allowsSpecialGroups, (next) => setPlanForm((prev) => ({ ...prev, allowsSpecialGroups: next })))}
                                    </div>
                                </div>
                            ))}

                            {surface('CTA', 'Shared action target used by the card, details drawer, checkout entry, and dashboard widget.', grid(
                                <>
                                    {field('CTA Label', <input className={inputClass()} value={planForm.ctaLabel} onChange={(event) => setPlanForm((prev) => ({ ...prev, ctaLabel: event.target.value }))} placeholder="Subscribe Now" />)}
                                    {field('CTA Mode', <select className={inputClass()} value={planForm.ctaMode} onChange={(event) => setPlanForm((prev) => ({ ...prev, ctaMode: event.target.value as CtaMode }))}>{CTA_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
                                    {field('CTA URL', <input className={inputClass()} value={planForm.ctaUrl} onChange={(event) => setPlanForm((prev) => ({ ...prev, ctaUrl: event.target.value }))} placeholder="/contact" />, 'Relative route or external URL.', true)}
                                </>
                            ))}

                            {surface('FAQ / Notes', 'Renewal guidance, policy note, and plan-specific FAQ entries for the details drawer.', (
                                <div className="space-y-5">
                                    {grid(
                                        <>
                                            {field('Renewal Note', <textarea className={inputClass(true)} value={planForm.renewalNotes} onChange={(event) => setPlanForm((prev) => ({ ...prev, renewalNotes: event.target.value }))} />, undefined, true)}
                                            {field('Policy Note', <textarea className={inputClass(true)} value={planForm.policyNote} onChange={(event) => setPlanForm((prev) => ({ ...prev, policyNote: event.target.value }))} />, undefined, true)}
                                        </>
                                    )}
                                    <div className="flex items-center justify-between gap-3">
                                        <div><h3 className="text-base font-semibold text-slate-950 dark:text-white">Plan FAQ</h3><p className="text-sm text-slate-500 dark:text-slate-400">These appear inside the shared plan details drawer.</p></div>
                                        <button type="button" onClick={() => setPlanForm((prev) => ({ ...prev, faqItems: prev.faqItems.concat([{ id: makeId('faq'), question: '', answer: '' }]) }))} className="btn-outline text-xs"><Plus className="h-4 w-4" />Add FAQ</button>
                                    </div>
                                    <div className="space-y-3">
                                        {planForm.faqItems.map((item, index) => (
                                            <div key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                                <input className={inputClass()} placeholder="Question" value={item.question} onChange={(event) => setPlanForm((prev) => ({ ...prev, faqItems: prev.faqItems.map((faq, faqIndex) => faqIndex === index ? { ...faq, question: event.target.value } : faq) }))} />
                                                <textarea className={inputClass(true)} placeholder="Answer" value={item.answer} onChange={(event) => setPlanForm((prev) => ({ ...prev, faqItems: prev.faqItems.map((faq, faqIndex) => faqIndex === index ? { ...faq, answer: event.target.value } : faq) }))} />
                                                <button type="button" onClick={() => setPlanForm((prev) => ({ ...prev, faqItems: prev.faqItems.filter((faq) => faq.id !== item.id) }))} className="btn-outline text-xs text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300">Remove FAQ</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                            {surface('Preview', 'Live card preview using the same plan DTO shape the public frontend consumes.', (
                                <div className="space-y-4">
                                    <div className="rounded-[2rem] bg-slate-950 p-3">
                                        <PlanCard plan={drawerPlan} onPrimaryAction={() => setDetailsPreviewOpen(true)} onViewDetails={() => setDetailsPreviewOpen(true)} />
                                    </div>
                                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white"><Sparkles className="h-4 w-4 text-cyan-500" />Shared data confirmation</div>
                                        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">This preview uses the same record shape the cards, details drawer, homepage preview, and dashboard subscription widget use.</p>
                                    </div>
                                    <button type="button" onClick={savePlan} disabled={savingPlan} className="btn-primary w-full text-sm disabled:opacity-50">{savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Plan</button>
                                </div>
                            ), <button type="button" onClick={() => setDetailsPreviewOpen(true)} className="btn-outline text-xs"><Eye className="h-4 w-4" />Details Preview</button>)}
                        </div>
                    </div>
                ) : null}

                {isPreviewRoute ? (
                    selectedPlanQuery.isLoading && !selectedPlan ? surface('Plan Preview', 'Loading plan preview...', <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading plan preview...</div>) : !selectedPlan ? surface('Plan Preview', 'Plan not found', <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">This plan could not be found. It may have been archived or removed.</div>) : (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                            {surface('Plan Preview', 'Review the premium card, drawer CTA, and admin-managed content before publishing.', (
                                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                                    <div className="rounded-[2rem] bg-slate-950 p-3">
                                        <PlanCard plan={selectedPlan} onPrimaryAction={() => setDetailsPreviewOpen(true)} onViewDetails={() => setDetailsPreviewOpen(true)} />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Short summary</p>
                                            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{selectedPlan.name}</h3>
                                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selectedPlan.tagline || selectedPlan.shortDescription || 'No short summary yet.'}</p>
                                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                                <span className="rounded-full bg-slate-200 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{formatPrice(selectedPlan)}</span>
                                                <span className="rounded-full bg-slate-200 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selectedPlan.billingCycle || 'monthly'}</span>
                                                <span className="rounded-full bg-slate-200 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selectedPlan.validityLabel || selectedPlan.durationLabel}</span>
                                            </div>
                                        </div>
                                        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Full details snapshot</p>
                                            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{selectedPlan.fullDescription || 'No detailed description added yet.'}</p>
                                            {selectedPlan.recommendedFor ? <p className="mt-4 text-sm text-slate-700 dark:text-slate-200"><strong>Recommended for:</strong> {selectedPlan.recommendedFor}</p> : null}
                                            {selectedPlan.renewalNotes ? <p className="mt-3 text-sm text-slate-700 dark:text-slate-200"><strong>Renewal:</strong> {selectedPlan.renewalNotes}</p> : null}
                                        </div>
                                    </div>
                                </div>
                            ), <div className="flex flex-wrap gap-2"><Link to={`${basePath}/${selectedPlan._id}/edit`} className="btn-primary text-xs"><Pencil className="h-4 w-4" />Edit Plan</Link><button type="button" onClick={() => setDetailsPreviewOpen(true)} className="btn-outline text-xs"><Eye className="h-4 w-4" />Open Drawer</button></div>)}
                            <div className="space-y-6">
                                {surface('Plan Metadata', 'Operational values backing the premium card experience.', <div className="space-y-3 text-sm">
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Slug</span><span className="font-medium text-slate-950 dark:text-white">{selectedPlan.slug}</span></div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Legacy code</span><span className="font-medium text-slate-950 dark:text-white">{selectedPlan.code}</span></div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Support level</span><span className="font-medium capitalize text-slate-950 dark:text-white">{selectedPlan.supportLevel || 'basic'}</span></div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">CTA mode</span><span className="font-medium text-slate-950 dark:text-white">{selectedPlan.ctaMode || 'contact'}</span></div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><span className="text-slate-500 dark:text-slate-400">Visibility</span><span className="font-medium text-slate-950 dark:text-white">{selectedPlan.showOnPricingPage ? 'Pricing page' : 'Hidden'}{selectedPlan.showOnHome ? ' + Home preview' : ''}</span></div>
                                </div>)}
                                {surface('Admin Actions', 'Quick controls for the selected plan.', <div className="grid grid-cols-1 gap-3">
                                    <Link to={`${basePath}/${selectedPlan._id}/edit`} className="btn-primary justify-center text-sm"><Pencil className="h-4 w-4" />Edit Plan</Link>
                                    <button type="button" onClick={() => duplicatePlan(selectedPlan)} className="btn-outline justify-center text-sm"><Copy className="h-4 w-4" />Duplicate Plan</button>
                                    <button type="button" onClick={() => toggleActive(selectedPlan)} className="btn-outline justify-center text-sm">{selectedPlan.isActive ? 'Deactivate Plan' : 'Activate Plan'}</button>
                                    <button type="button" onClick={() => toggleFeatured(selectedPlan)} className="btn-outline justify-center text-sm">{selectedPlan.isFeatured ? 'Remove Featured Badge' : 'Mark Featured'}</button>
                                    <button type="button" onClick={() => archivePlan(selectedPlan)} className="btn-outline justify-center text-sm text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300"><Trash2 className="h-4 w-4" />Archive Plan</button>
                                </div>)}
                            </div>
                        </div>
                    )
                ) : null}

                <PlanDetailsDrawer open={detailsPreviewOpen} plan={drawerPlan} onClose={() => setDetailsPreviewOpen(false)} onPrimaryAction={() => setDetailsPreviewOpen(false)} />
            </div>
        </AdminGuardShell>
    );
}
