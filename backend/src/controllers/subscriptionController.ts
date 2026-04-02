import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import User from '../models/User';
import SubscriptionPlan from '../models/SubscriptionPlan';
import UserSubscription from '../models/UserSubscription';
import ManualPayment from '../models/ManualPayment';
import WebsiteSettings from '../models/WebsiteSettings';
import SubscriptionSettings from '../models/SubscriptionSettings';
import { AuthRequest } from '../middlewares/auth';
import { ensureHomeSettings } from '../services/homeSettingsService';
import {
    assignSubscriptionLifecycle,
    syncUserSubscriptionCache,
} from '../services/subscriptionLifecycleService';
import { buildSecureUploadUrl, registerSecureUpload } from '../services/secureUploadService';
import {
    buildPublicSubscriptionPlanExclusionQuery,
    combineMongoFilters,
} from '../utils/publicFixtureFilters';

type ExportType = 'csv' | 'xlsx';
type PlanMutationResult = {
    payload?: Record<string, unknown>;
    error?: string;
};
type PlanCtaMode = 'contact' | 'request_payment' | 'internal' | 'external';
type PlanType = 'free' | 'paid' | 'custom' | 'enterprise';
type BillingCycle = 'monthly' | 'yearly' | 'custom' | 'one_time';
type ThemeKey = 'basic' | 'standard' | 'premium' | 'enterprise' | 'custom';
type SupportLevel = 'basic' | 'priority' | 'premium' | 'enterprise';

const PLAN_CTA_MODES: PlanCtaMode[] = ['contact', 'request_payment', 'internal', 'external'];
const PLAN_TYPES: PlanType[] = ['free', 'paid', 'custom', 'enterprise'];
const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly', 'custom', 'one_time'];
const THEME_KEYS: ThemeKey[] = ['basic', 'standard', 'premium', 'enterprise', 'custom'];
const SUPPORT_LEVELS: SupportLevel[] = ['basic', 'priority', 'premium', 'enterprise'];
const PLAN_SORT = { isArchived: 1, displayOrder: 1, sortOrder: 1, priority: 1, code: 1 } as const;

function toBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim().toLowerCase();
    if (!text) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(text);
}

function safeString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeSlug(value: unknown, fallback = 'plan'): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback;
}

function safeStringList(value: unknown, limit = 50): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((item) => safeString(item))
            .filter(Boolean)
    )).slice(0, limit);
}

function safeFaqItems(value: unknown): Array<{ question: string; answer: string }> {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const question = safeString(row.question);
            const answer = safeString(row.answer);
            if (!question || !answer) return null;
            return { question, answer };
        })
        .filter(Boolean) as Array<{ question: string; answer: string }>;
}

function safeComparisonRows(value: unknown): Array<{ key: string; label: string }> {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const key = safeString(row.key);
            const label = safeString(row.label);
            if (!key || !label) return null;
            return { key, label };
        })
        .filter(Boolean) as Array<{ key: string; label: string }>;
}

function isValidRelativeOrAbsoluteUrl(value: unknown): boolean {
    const text = safeString(value);
    if (!text) return true;
    if (text.startsWith('/')) return true;
    try {
        const parsed = new URL(text);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function resolvePlanCtaMode(value: unknown, fallback: PlanCtaMode = 'contact'): PlanCtaMode {
    const text = safeString(value).toLowerCase() as PlanCtaMode;
    return PLAN_CTA_MODES.includes(text) ? text : fallback;
}

function resolvePlanType(value: unknown, priceBDT: number, fallback: PlanType = 'paid'): PlanType {
    const text = safeString(value).toLowerCase() as PlanType;
    if (PLAN_TYPES.includes(text)) {
        if (text === 'free') return 'free';
        return priceBDT <= 0 && text === 'paid' ? 'free' : text;
    }
    if (priceBDT <= 0) return 'free';
    return fallback;
}

function resolveBillingCycle(value: unknown, fallback: BillingCycle = 'monthly'): BillingCycle {
    const text = safeString(value).toLowerCase() as BillingCycle;
    return BILLING_CYCLES.includes(text) ? text : fallback;
}

function resolveThemeKey(value: unknown, planHint: string, fallback: ThemeKey = 'basic'): ThemeKey {
    const text = safeString(value).toLowerCase() as ThemeKey;
    if (THEME_KEYS.includes(text)) return text;

    const hint = planHint.toLowerCase();
    if (hint.includes('premium') || hint.includes('pro')) return 'premium';
    if (hint.includes('standard') || hint.includes('plus')) return 'standard';
    if (hint.includes('enterprise') || hint.includes('elite')) return 'enterprise';
    return fallback;
}

function resolveSupportLevel(value: unknown, fallback: SupportLevel = 'basic'): SupportLevel {
    const text = safeString(value).toLowerCase() as SupportLevel;
    return SUPPORT_LEVELS.includes(text) ? text : fallback;
}

function buildDurationLabel(plan: {
    durationValue: number;
    durationUnit: 'days' | 'months';
    durationDays: number;
}): string {
    if (plan.durationUnit === 'months') {
        const months = Math.max(1, plan.durationValue || 1);
        return `${months} month${months === 1 ? '' : 's'}`;
    }
    const days = Math.max(1, plan.durationDays || plan.durationValue || 1);
    return `${days} day${days === 1 ? '' : 's'}`;
}

function buildDefaultCtaUrl(mode: PlanCtaMode): string {
    if (mode === 'request_payment') return '/subscription-plans/checkout';
    if (mode === 'internal') return '/subscription-plans/checkout';
    if (mode === 'external') return '/contact';
    return '/contact';
}

function getPlanLookupQuery(identifier: string): Record<string, unknown> {
    const trimmed = safeString(identifier);
    const normalized = normalizeSlug(trimmed, trimmed || 'plan');
    const or: Array<Record<string, unknown>> = [
        { slug: normalized },
        { code: normalized },
    ];
    if (mongoose.Types.ObjectId.isValid(trimmed)) {
        or.unshift({ _id: trimmed });
    }
    return { $or: or };
}

function buildPublicPlanFilter(): Record<string, unknown> {
    return combineMongoFilters({
        isArchived: { $ne: true },
        showOnPricingPage: { $ne: false },
        $or: [{ enabled: true }, { isActive: true }],
    }, buildPublicSubscriptionPlanExclusionQuery());
}

function planToDto(plan: Record<string, unknown>) {
    const id = String(plan._id || '');
    const code = normalizeSlug(plan.code || plan.name || id, id ? `plan-${id}` : 'plan');
    const slug = normalizeSlug(plan.slug || code, code);
    const name = safeString(plan.name, 'Subscription Plan');
    const shortTitle = safeString(plan.shortTitle, name);
    const priceBDT = Math.max(0, safeNumber(plan.priceBDT, safeNumber(plan.price, 0)));
    const oldPriceRaw = plan.oldPrice === null || plan.oldPrice === undefined ? null : Math.max(0, safeNumber(plan.oldPrice, 0));
    const durationDays = Math.max(1, safeNumber(plan.durationDays, 30));
    const durationValue = Math.max(1, safeNumber(plan.durationValue, durationDays));
    const durationUnit = safeString(plan.durationUnit, 'days') === 'months' ? 'months' : 'days';
    const durationMonths = plan.durationMonths === null || plan.durationMonths === undefined
        ? null
        : Math.max(0, safeNumber(plan.durationMonths, 0));
    const displayOrder = safeNumber(
        plan.displayOrder,
        safeNumber(plan.sortOrder, safeNumber(plan.priority, 100))
    );
    const isArchived = toBoolean(plan.isArchived, false);
    const enabled = (plan.enabled !== undefined ? toBoolean(plan.enabled, true) : toBoolean(plan.isActive, true)) && !isArchived;
    const includedModules = safeStringList(plan.includedModules);
    const visibleFeatures = safeStringList(
        Array.isArray(plan.visibleFeatures) && plan.visibleFeatures.length
            ? plan.visibleFeatures
            : (Array.isArray(plan.features) && plan.features.length ? plan.features : plan.includedModules),
        8
    );
    const fullFeatures = Array.from(new Set(
        safeStringList(plan.fullFeatures)
            .concat(visibleFeatures)
            .concat(safeStringList(plan.features))
            .concat(includedModules)
    ));
    const excludedFeatures = safeStringList(plan.excludedFeatures);
    const planType = resolvePlanType(plan.planType || plan.type, priceBDT);
    const type = planType === 'free' ? 'free' : 'paid';
    const ctaMode = resolvePlanCtaMode(
        plan.ctaMode,
        type === 'free' ? 'internal' : 'contact'
    );
    const ctaUrl = safeString(
        plan.ctaUrl || plan.contactCtaUrl,
        buildDefaultCtaUrl(ctaMode)
    );
    const contactCtaUrl = safeString(plan.contactCtaUrl || ctaUrl, '/contact');
    const shortDescription = safeString(plan.shortDescription || plan.description);
    const fullDescription = safeString(plan.fullDescription || plan.description || shortDescription);
    const billingCycle = resolveBillingCycle(plan.billingCycle, 'monthly');
    const durationLabel = buildDurationLabel({ durationValue, durationUnit, durationDays });
    const validityLabel = safeString(plan.validityLabel, durationLabel);
    const currency = safeString(plan.currency, 'BDT');

    return {
        id,
        _id: id,
        code,
        slug,
        name,
        shortTitle,
        shortLabel: shortTitle,
        tagline: safeString(plan.tagline),
        type,
        planType,
        priceBDT: type === 'free' ? 0 : priceBDT,
        price: type === 'free' ? 0 : priceBDT,
        oldPrice: oldPriceRaw,
        currency,
        billingCycle,
        durationDays,
        durationMonths,
        durationValue,
        durationUnit,
        durationLabel,
        validityLabel,
        isFree: type === 'free',
        isPaid: type !== 'free',
        bannerImageUrl: safeString(plan.bannerImageUrl) || null,
        shortDescription,
        fullDescription,
        description: fullDescription,
        themeKey: resolveThemeKey(plan.themeKey, `${code} ${name}`),
        badgeText: safeString(plan.badgeText),
        highlightText: safeString(plan.highlightText),
        features: visibleFeatures,
        visibleFeatures,
        fullFeatures,
        excludedFeatures,
        includedModules,
        tags: safeStringList(plan.tags),
        recommendedFor: safeString(plan.recommendedFor),
        comparisonNote: safeString(plan.comparisonNote),
        supportLevel: resolveSupportLevel(plan.supportLevel, 'basic'),
        accessScope: safeString(plan.accessScope),
        renewalNotes: safeString(plan.renewalNotes),
        policyNote: safeString(plan.policyNote),
        faqItems: safeFaqItems(plan.faqItems),
        allowsExams: toBoolean(plan.allowsExams, true),
        allowsPremiumResources: toBoolean(plan.allowsPremiumResources, false),
        allowsSMSUpdates: toBoolean(plan.allowsSMSUpdates, false),
        allowsEmailUpdates: toBoolean(plan.allowsEmailUpdates, true),
        allowsGuardianAlerts: toBoolean(plan.allowsGuardianAlerts, false),
        allowsSpecialGroups: toBoolean(plan.allowsSpecialGroups, false),
        dashboardPrivileges: safeStringList(plan.dashboardPrivileges, 20),
        maxAttempts: plan.maxAttempts === null || plan.maxAttempts === undefined ? null : Math.max(0, safeNumber(plan.maxAttempts, 0)),
        enabled,
        isActive: enabled,
        isArchived,
        isFeatured: toBoolean(plan.isFeatured, false),
        showOnHome: toBoolean(plan.showOnHome, false),
        showOnPricingPage: toBoolean(plan.showOnPricingPage, true),
        displayOrder,
        sortOrder: displayOrder,
        priority: safeNumber(plan.priority, displayOrder || 100),
        ctaLabel: safeString(
            plan.ctaLabel || plan.contactCtaLabel,
            type === 'free' ? 'Get Started' : 'Subscribe Now'
        ),
        ctaUrl,
        ctaMode,
        contactCtaLabel: safeString(plan.contactCtaLabel || plan.ctaLabel, 'Contact to Subscribe'),
        contactCtaUrl,
        priceLabel: type === 'free' ? 'Free' : `${currency} ${priceBDT.toLocaleString()}`,
        createdByAdminId: plan.createdByAdminId ? String(plan.createdByAdminId) : null,
        updatedByAdminId: plan.updatedByAdminId ? String(plan.updatedByAdminId) : null,
        createdAt: plan.createdAt || null,
        updatedAt: plan.updatedAt || null,
    };
}

function buildSettingsDto(
    subscriptionSettings: Record<string, unknown> | null | undefined,
    websiteSettings: Record<string, unknown> | null | undefined
) {
    const pricingUi = (websiteSettings?.pricingUi as Record<string, unknown> | undefined) || {};
    const sectionToggles = (subscriptionSettings?.sectionToggles as Record<string, unknown> | undefined) || {};
    const comparisonRows = safeComparisonRows(subscriptionSettings?.comparisonRows);
    const faqItems = safeFaqItems(subscriptionSettings?.pageFaqItems);
    return {
        pageTitle: safeString(
            subscriptionSettings?.pageTitle || websiteSettings?.subscriptionPageTitle,
            'Subscription Plans'
        ),
        pageSubtitle: safeString(
            subscriptionSettings?.pageSubtitle || websiteSettings?.subscriptionPageSubtitle,
            'Choose the right plan for your CampusWay journey.'
        ),
        heroEyebrow: safeString(subscriptionSettings?.heroEyebrow, 'CampusWay Memberships'),
        heroNote: safeString(
            subscriptionSettings?.heroNote,
            'Premium access, clear comparisons, and one-click plan details.'
        ),
        headerBannerUrl: safeString(subscriptionSettings?.headerBannerUrl) || null,
        defaultPlanBannerUrl: safeString(
            subscriptionSettings?.defaultPlanBannerUrl || websiteSettings?.subscriptionDefaultBannerUrl
        ) || null,
        currencyLabel: safeString(
            subscriptionSettings?.currencyLabel || pricingUi.currencyCode,
            'BDT'
        ),
        showFeaturedFirst: subscriptionSettings?.showFeaturedFirst !== false,
        allowFreePlans: toBoolean(subscriptionSettings?.allowFreePlans, true),
        comparisonEnabled: toBoolean(subscriptionSettings?.comparisonEnabled, comparisonRows.length > 0),
        comparisonTitle: safeString(subscriptionSettings?.comparisonTitle, 'Compare Plans'),
        comparisonSubtitle: safeString(
            subscriptionSettings?.comparisonSubtitle,
            'See what changes as you upgrade.'
        ),
        comparisonRows,
        pageFaqEnabled: toBoolean(subscriptionSettings?.pageFaqEnabled, faqItems.length > 0),
        pageFaqTitle: safeString(subscriptionSettings?.pageFaqTitle, 'Frequently Asked Questions'),
        pageFaqItems: faqItems,
        sectionToggles: {
            detailsDrawer: toBoolean(sectionToggles.detailsDrawer, true),
            comparisonTable: toBoolean(sectionToggles.comparisonTable, true),
            faqBlock: toBoolean(sectionToggles.faqBlock, true),
            homePreview: toBoolean(sectionToggles.homePreview, true),
        },
        defaultCtaMode: resolvePlanCtaMode(subscriptionSettings?.defaultCtaMode, 'contact'),
        updatedAt: subscriptionSettings?.updatedAt || null,
        createdAt: subscriptionSettings?.createdAt || null,
    };
}

function toAdminObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const id = safeString(value);
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function buildPlanMutationPayload(
    body: Record<string, unknown>,
    options: {
        isCreate: boolean;
        existing?: Record<string, unknown> | null;
        defaultCtaMode?: PlanCtaMode;
        adminId?: string | null;
    }
): PlanMutationResult {
    const existing = options.existing || {};
    const name = body.name !== undefined ? safeString(body.name) : safeString(existing.name);
    if (!name) {
        return { error: 'name is required' };
    }

    const nextCode = normalizeSlug(
        body.code !== undefined ? body.code : (existing.code || name),
        normalizeSlug(name, 'plan')
    );
    const nextSlug = normalizeSlug(
        body.slug !== undefined ? body.slug : (existing.slug || nextCode),
        nextCode
    );
    if (!nextCode || !nextSlug) {
        return { error: 'code and slug are required' };
    }

    const priceInput = body.priceBDT !== undefined || body.price !== undefined
        ? safeNumber(body.priceBDT, safeNumber(body.price, 0))
        : safeNumber(existing.priceBDT, safeNumber(existing.price, 0));
    if (priceInput < 0) {
        return { error: 'priceBDT cannot be negative' };
    }

    const durationDays = Math.max(
        1,
        safeNumber(
            body.durationDays !== undefined ? body.durationDays : existing.durationDays,
            30
        )
    );
    if (safeNumber(body.durationDays !== undefined ? body.durationDays : durationDays, durationDays) <= 0) {
        return { error: 'durationDays must be greater than 0' };
    }

    const durationUnit = safeString(
        body.durationUnit !== undefined ? body.durationUnit : existing.durationUnit,
        'days'
    ) === 'months'
        ? 'months'
        : 'days';
    const durationValue = Math.max(
        1,
        safeNumber(
            body.durationValue !== undefined ? body.durationValue : existing.durationValue,
            durationUnit === 'months'
                ? safeNumber(body.durationMonths !== undefined ? body.durationMonths : existing.durationMonths, 1)
                : durationDays
        )
    );
    const durationMonths = durationUnit === 'months'
        ? Math.max(
            1,
            safeNumber(
                body.durationMonths !== undefined ? body.durationMonths : existing.durationMonths,
                durationValue
            )
        )
        : null;

    const planType = resolvePlanType(
        body.planType !== undefined ? body.planType : (body.type !== undefined ? body.type : existing.planType || existing.type),
        priceInput,
        'paid'
    );
    const type = planType === 'free' || priceInput <= 0 ? 'free' : 'paid';
    const priceBDT = type === 'free' ? 0 : Math.max(0, priceInput);
    const oldPrice = body.oldPrice === undefined
        ? (existing.oldPrice === null || existing.oldPrice === undefined ? null : Math.max(0, safeNumber(existing.oldPrice, 0)))
        : (body.oldPrice === null || safeString(body.oldPrice) === '' ? null : Math.max(0, safeNumber(body.oldPrice, 0)));
    if (oldPrice !== null && oldPrice < priceBDT) {
        // keep admin input but avoid a negative-looking discount stack
    }

    const defaultCtaMode = options.defaultCtaMode || 'contact';
    const ctaMode = resolvePlanCtaMode(
        body.ctaMode !== undefined ? body.ctaMode : existing.ctaMode,
        defaultCtaMode
    );

    const ctaUrl = safeString(
        body.ctaUrl !== undefined ? body.ctaUrl : existing.ctaUrl,
        buildDefaultCtaUrl(ctaMode)
    );
    const contactCtaUrl = safeString(
        body.contactCtaUrl !== undefined ? body.contactCtaUrl : existing.contactCtaUrl,
        ctaUrl || '/contact'
    );
    const bannerImageUrl = safeString(
        body.bannerImageUrl !== undefined ? body.bannerImageUrl : existing.bannerImageUrl
    );

    if (!isValidRelativeOrAbsoluteUrl(bannerImageUrl)) {
        return { error: 'bannerImageUrl must be a valid URL or relative path' };
    }
    if (!isValidRelativeOrAbsoluteUrl(ctaUrl)) {
        return { error: 'ctaUrl must be a valid URL or relative path' };
    }
    if (!isValidRelativeOrAbsoluteUrl(contactCtaUrl)) {
        return { error: 'contactCtaUrl must be a valid URL or relative path' };
    }

    const visibleFeatures = safeStringList(
        body.visibleFeatures !== undefined
            ? body.visibleFeatures
            : (body.features !== undefined ? body.features : (existing.visibleFeatures || existing.features || existing.includedModules)),
        8
    );
    const fullFeatures = Array.from(new Set(
        safeStringList(body.fullFeatures !== undefined ? body.fullFeatures : existing.fullFeatures)
            .concat(visibleFeatures)
            .concat(safeStringList(body.features !== undefined ? body.features : existing.features))
            .concat(safeStringList(body.includedModules !== undefined ? body.includedModules : existing.includedModules))
    ));

    const payload: Record<string, unknown> = {
        code: nextCode,
        slug: nextSlug,
        name,
        shortTitle: safeString(
            body.shortTitle !== undefined ? body.shortTitle : existing.shortTitle,
            name
        ),
        tagline: safeString(body.tagline !== undefined ? body.tagline : existing.tagline),
        type,
        planType,
        priceBDT,
        price: priceBDT,
        oldPrice,
        currency: safeString(body.currency !== undefined ? body.currency : existing.currency, 'BDT'),
        billingCycle: resolveBillingCycle(
            body.billingCycle !== undefined ? body.billingCycle : existing.billingCycle,
            'monthly'
        ),
        durationDays,
        durationMonths,
        durationValue,
        durationUnit,
        isFree: type === 'free',
        isPaid: type !== 'free',
        bannerImageUrl: bannerImageUrl || null,
        shortDescription: safeString(
            body.shortDescription !== undefined ? body.shortDescription : (existing.shortDescription || existing.description)
        ),
        fullDescription: safeString(
            body.fullDescription !== undefined
                ? body.fullDescription
                : (body.description !== undefined ? body.description : (existing.fullDescription || existing.description || existing.shortDescription))
        ),
        description: safeString(
            body.fullDescription !== undefined
                ? body.fullDescription
                : (body.description !== undefined ? body.description : (existing.fullDescription || existing.description || existing.shortDescription))
        ),
        themeKey: resolveThemeKey(
            body.themeKey !== undefined ? body.themeKey : existing.themeKey,
            `${nextCode} ${name}`,
            'basic'
        ),
        badgeText: safeString(body.badgeText !== undefined ? body.badgeText : existing.badgeText),
        highlightText: safeString(body.highlightText !== undefined ? body.highlightText : existing.highlightText),
        features: visibleFeatures,
        visibleFeatures,
        fullFeatures,
        excludedFeatures: safeStringList(
            body.excludedFeatures !== undefined ? body.excludedFeatures : existing.excludedFeatures
        ),
        tags: safeStringList(body.tags !== undefined ? body.tags : existing.tags),
        includedModules: safeStringList(
            body.includedModules !== undefined ? body.includedModules : existing.includedModules
        ),
        recommendedFor: safeString(
            body.recommendedFor !== undefined ? body.recommendedFor : existing.recommendedFor
        ),
        comparisonNote: safeString(
            body.comparisonNote !== undefined ? body.comparisonNote : existing.comparisonNote
        ),
        supportLevel: resolveSupportLevel(
            body.supportLevel !== undefined ? body.supportLevel : existing.supportLevel,
            'basic'
        ),
        accessScope: safeString(body.accessScope !== undefined ? body.accessScope : existing.accessScope),
        validityLabel: safeString(
            body.validityLabel !== undefined ? body.validityLabel : existing.validityLabel,
            buildDurationLabel({ durationValue, durationUnit, durationDays })
        ),
        renewalNotes: safeString(
            body.renewalNotes !== undefined ? body.renewalNotes : existing.renewalNotes
        ),
        policyNote: safeString(body.policyNote !== undefined ? body.policyNote : existing.policyNote),
        faqItems: safeFaqItems(body.faqItems !== undefined ? body.faqItems : existing.faqItems),
        allowsExams: toBoolean(
            body.allowsExams !== undefined ? body.allowsExams : existing.allowsExams,
            true
        ),
        allowsPremiumResources: toBoolean(
            body.allowsPremiumResources !== undefined ? body.allowsPremiumResources : existing.allowsPremiumResources,
            false
        ),
        allowsSMSUpdates: toBoolean(
            body.allowsSMSUpdates !== undefined ? body.allowsSMSUpdates : existing.allowsSMSUpdates,
            false
        ),
        allowsEmailUpdates: toBoolean(
            body.allowsEmailUpdates !== undefined ? body.allowsEmailUpdates : existing.allowsEmailUpdates,
            true
        ),
        allowsGuardianAlerts: toBoolean(
            body.allowsGuardianAlerts !== undefined ? body.allowsGuardianAlerts : existing.allowsGuardianAlerts,
            false
        ),
        allowsSpecialGroups: toBoolean(
            body.allowsSpecialGroups !== undefined ? body.allowsSpecialGroups : existing.allowsSpecialGroups,
            false
        ),
        dashboardPrivileges: safeStringList(
            body.dashboardPrivileges !== undefined ? body.dashboardPrivileges : existing.dashboardPrivileges,
            20
        ),
        maxAttempts: body.maxAttempts === undefined
            ? (existing.maxAttempts === null || existing.maxAttempts === undefined ? null : Math.max(0, safeNumber(existing.maxAttempts, 0)))
            : (body.maxAttempts === null || safeString(body.maxAttempts) === '' ? null : Math.max(0, safeNumber(body.maxAttempts, 0))),
        enabled: toBoolean(
            body.enabled !== undefined ? body.enabled : (body.isActive !== undefined ? body.isActive : existing.enabled),
            true
        ),
        isFeatured: toBoolean(
            body.isFeatured !== undefined ? body.isFeatured : existing.isFeatured,
            false
        ),
        isArchived: toBoolean(
            body.isArchived !== undefined ? body.isArchived : existing.isArchived,
            false
        ),
        showOnHome: toBoolean(
            body.showOnHome !== undefined ? body.showOnHome : existing.showOnHome,
            false
        ),
        showOnPricingPage: toBoolean(
            body.showOnPricingPage !== undefined ? body.showOnPricingPage : existing.showOnPricingPage,
            true
        ),
        displayOrder: safeNumber(
            body.displayOrder !== undefined ? body.displayOrder : (body.sortOrder !== undefined ? body.sortOrder : (existing.displayOrder || existing.sortOrder || existing.priority)),
            100
        ),
        sortOrder: safeNumber(
            body.sortOrder !== undefined ? body.sortOrder : (body.displayOrder !== undefined ? body.displayOrder : (existing.sortOrder || existing.displayOrder || existing.priority)),
            100
        ),
        priority: safeNumber(
            body.priority !== undefined ? body.priority : (existing.priority || existing.displayOrder || existing.sortOrder),
            100
        ),
        ctaLabel: safeString(
            body.ctaLabel !== undefined ? body.ctaLabel : (existing.ctaLabel || existing.contactCtaLabel),
            type === 'free' ? 'Get Started' : 'Subscribe Now'
        ),
        ctaUrl,
        ctaMode,
        contactCtaLabel: safeString(
            body.contactCtaLabel !== undefined ? body.contactCtaLabel : (existing.contactCtaLabel || existing.ctaLabel),
            'Contact to Subscribe'
        ),
        contactCtaUrl,
        createdByAdminId: options.isCreate ? toAdminObjectId(options.adminId) : existing.createdByAdminId || null,
        updatedByAdminId: toAdminObjectId(options.adminId),
    };

    payload.isActive = !toBoolean(payload.isArchived, false) && toBoolean(payload.enabled, true);

    return { payload };
}

async function buildUniqueDuplicateIdentity(baseCode: string, baseSlug: string): Promise<{ code: string; slug: string }> {
    const seed = `${baseCode || 'plan'}-copy`;
    const slugSeed = `${baseSlug || baseCode || 'plan'}-copy`;

    for (let index = 1; index <= 1000; index += 1) {
        const suffix = index === 1 ? '' : `-${index}`;
        const code = normalizeSlug(`${seed}${suffix}`, 'plan-copy');
        const slug = normalizeSlug(`${slugSeed}${suffix}`, code);
        const exists = await SubscriptionPlan.exists({
            $or: [{ code }, { slug }],
        });
        if (!exists) {
            return { code, slug };
        }
    }

    const stamp = Date.now();
    return {
        code: normalizeSlug(`${seed}-${stamp}`, 'plan-copy'),
        slug: normalizeSlug(`${slugSeed}-${stamp}`, 'plan-copy'),
    };
}

function getExportType(raw: unknown): ExportType {
    return String(raw || '').trim().toLowerCase() === 'csv' ? 'csv' : 'xlsx';
}

function sendExport(res: Response, type: ExportType, filenameBase: string, rows: Record<string, unknown>[]) {
    if (type === 'csv') {
        const headers = rows.length ? Object.keys(rows[0]) : [];
        const lines = [headers.join(',')];
        for (const row of rows) {
            lines.push(headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
        res.send(lines.join('\n'));
        return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    res.send(buffer);
}

async function ensureSubscriptionSettings() {
    let settings = await SubscriptionSettings.findOne().lean();
    if (settings) return settings;
    const created = await SubscriptionSettings.create({});
    return created.toObject();
}

export async function getPublicSubscriptionPlans(req: Request, res: Response): Promise<void> {
    try {
        const [plans, websiteSettings, subscriptionSettings] = await Promise.all([
            SubscriptionPlan.find(buildPublicPlanFilter())
                .sort(PLAN_SORT)
                .lean(),
            WebsiteSettings.findOne().lean(),
            ensureSubscriptionSettings(),
        ]);

        const settings = buildSettingsDto(
            subscriptionSettings as unknown as Record<string, unknown> | null,
            websiteSettings as unknown as Record<string, unknown> | null
        );
        let items = plans
            .map((plan) => planToDto(plan as unknown as Record<string, unknown>))
            .filter((plan) => settings.allowFreePlans || !plan.isFree);

        if (settings.showFeaturedFirst) {
            items = [...items].sort((a, b) => {
                if (Boolean(a.isFeatured) !== Boolean(b.isFeatured)) return a.isFeatured ? -1 : 1;
                return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
            });
        }

        res.json({
            items,
            settings,
            lastUpdatedAt: subscriptionSettings?.updatedAt || null,
        });
    } catch (error) {
        console.error('getPublicSubscriptionPlans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getPublicSubscriptionPlanById(req: Request, res: Response): Promise<void> {
    try {
        const id = safeString(req.params?.slug || req.params?.id);
        const plan = await SubscriptionPlan.findOne({
            $and: [
                getPlanLookupQuery(id),
                {
                    isArchived: { $ne: true },
                    $or: [{ enabled: true }, { isActive: true }],
                },
            ],
        }).lean();
        if (!plan) {
            res.status(404).json({ message: 'Plan not found' });
            return;
        }
        res.json({ item: planToDto(plan as unknown as Record<string, unknown>) });
    } catch (error) {
        console.error('getPublicSubscriptionPlanById error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getMySubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = String(req.user?._id || '');
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const [latest, user] = await Promise.all([
            UserSubscription.findOne({ userId })
                .sort({ updatedAt: -1, createdAt: -1 })
                .populate('planId')
                .lean(),
            User.findById(userId).select('subscription').lean(),
        ]);

        if (!latest) {
            const cache = user?.subscription || {};
            const expiresAtUTC = cache.expiryDate ? new Date(String(cache.expiryDate)) : null;
            const nowMs = Date.now();
            const isActive = Boolean(cache.isActive && expiresAtUTC && expiresAtUTC.getTime() > nowMs);
            const hasAnyPlanName = Boolean(String(cache.planName || cache.plan || '').trim());
            const daysLeft = isActive && expiresAtUTC
                ? Math.max(0, Math.ceil((expiresAtUTC.getTime() - nowMs) / 86400000))
                : null;
            res.json({
                status: isActive ? 'active' : (hasAnyPlanName ? 'expired' : 'none'),
                isActive,
                planId: cache.planId ? String(cache.planId) : null,
                planSlug: safeString(cache.planSlug) || null,
                planCode: safeString(cache.planCode || cache.plan) || null,
                planName: hasAnyPlanName ? String(cache.planName || cache.plan || '') : undefined,
                ctaLabel: safeString(cache.ctaLabel, 'View Plans'),
                ctaUrl: safeString(cache.ctaUrl, '/subscription-plans'),
                ctaMode: resolvePlanCtaMode(cache.ctaMode, 'contact'),
                expiresAtUTC: expiresAtUTC ? expiresAtUTC.toISOString() : null,
                daysLeft,
            });
            return;
        }

        const plan = latest.planId && typeof latest.planId === 'object'
            ? planToDto(latest.planId as unknown as Record<string, unknown>)
            : null;
        const expiresAtUTC = latest.expiresAtUTC ? new Date(latest.expiresAtUTC) : null;
        const nowMs = Date.now();
        const activeWindow = !!expiresAtUTC && expiresAtUTC.getTime() > nowMs;
        const normalizedStatus = latest.status === 'pending'
            ? 'pending'
            : (latest.status === 'active' && activeWindow ? 'active' : (latest.status === 'active' ? 'expired' : (latest.status === 'expired' ? 'expired' : (latest.status === 'suspended' ? 'pending' : 'none'))));
        const daysLeft = normalizedStatus === 'active' && expiresAtUTC
            ? Math.max(0, Math.ceil((expiresAtUTC.getTime() - nowMs) / 86400000))
            : null;
        res.json({
            status: normalizedStatus,
            isActive: normalizedStatus === 'active',
            rawStatus: latest.status,
            planId: plan?._id || String(latest.planId || ''),
            planSlug: plan?.slug || null,
            planCode: plan?.code || null,
            planName: plan?.name || undefined,
            ctaLabel: plan?.ctaLabel || 'View Plans',
            ctaUrl: plan?.ctaUrl || '/subscription-plans',
            ctaMode: plan?.ctaMode || 'contact',
            startAtUTC: latest.startAtUTC ? new Date(latest.startAtUTC).toISOString() : null,
            expiresAtUTC: expiresAtUTC ? expiresAtUTC.toISOString() : null,
            daysLeft,
            plan,
        });
    } catch (error) {
        console.error('getMySubscription error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getHomeSubscriptionPlans(req: AuthRequest, res: Response): Promise<void> {
    try {
        const [homeSettingsDoc, websiteSettings, subscriptionSettings, plans, user] = await Promise.all([
            ensureHomeSettings(),
            WebsiteSettings.findOne().lean(),
            ensureSubscriptionSettings(),
            SubscriptionPlan.find(buildPublicPlanFilter())
                .sort(PLAN_SORT)
                .lean(),
            req.user?._id ? User.findById(req.user._id).select('subscription').lean() : Promise.resolve(null),
        ]);

        const settings = buildSettingsDto(
            subscriptionSettings as unknown as Record<string, unknown> | null,
            websiteSettings as unknown as Record<string, unknown> | null
        );
        const homeSettings = typeof homeSettingsDoc.toObject === 'function'
            ? homeSettingsDoc.toObject()
            : homeSettingsDoc;
        const curatedIds: string[] = Array.isArray(homeSettings?.subscriptionBanner?.planIdsToShow)
            ? homeSettings.subscriptionBanner.planIdsToShow
                .map((item: unknown) => String(item || '').trim())
                .filter(Boolean)
            : [];
        const availablePlans = plans
            .map((plan) => planToDto(plan as unknown as Record<string, unknown>))
            .filter((plan) => settings.allowFreePlans || !plan.isFree);
        const findPlanByToken = (token: string) => {
            return availablePlans.find((plan) => (
                token === String(plan.id || '').trim()
                || token === String(plan.code || '').trim()
                || token === String(plan.slug || '').trim()
            ));
        };
        const curatedPlans = Array.from(new Set(curatedIds))
            .map((token) => findPlanByToken(token))
            .filter(Boolean);
        const homeTaggedPlans = availablePlans.filter((plan) => Boolean(plan.showOnHome));
        const fallbackPlans = homeTaggedPlans.length > 0 ? homeTaggedPlans : availablePlans;
        const items = curatedPlans.length > 0 ? curatedPlans : fallbackPlans;

        const cache = user?.subscription || {};
        const expiryDate = cache.expiryDate ? new Date(String(cache.expiryDate)) : null;
        const hasActivePlan = Boolean(
            cache.isActive &&
            expiryDate &&
            !Number.isNaN(expiryDate.getTime()) &&
            expiryDate.getTime() > Date.now()
        );

        res.json({
            items,
            settings,
            banner: {
                enabled: toBoolean(homeSettings?.subscriptionBanner?.enabled, true),
                title: safeString(homeSettings?.subscriptionBanner?.title, 'Unlock Premium Exam Access'),
                subtitle: safeString(
                    homeSettings?.subscriptionBanner?.subtitle,
                    'Choose a plan to access live exams, smart practice, and result analytics.'
                ),
                loginMessage: safeString(
                    homeSettings?.subscriptionBanner?.loginMessage,
                    'Contact admin to subscribe and unlock online exams.'
                ),
                noPlanMessage: safeString(
                    homeSettings?.subscriptionBanner?.noPlanMessage,
                    'Subscription required to start online exams.'
                ),
                activePlanMessage: safeString(homeSettings?.subscriptionBanner?.activePlanMessage, 'Plan Active'),
                bannerImageUrl: safeString(homeSettings?.subscriptionBanner?.bannerImageUrl) || null,
                primaryCTA: {
                    label: safeString(homeSettings?.subscriptionBanner?.primaryCTA?.label, 'See Plans'),
                    url: safeString(homeSettings?.subscriptionBanner?.primaryCTA?.url, '/subscription-plans'),
                },
                secondaryCTA: {
                    label: safeString(homeSettings?.subscriptionBanner?.secondaryCTA?.label, 'Contact Admin'),
                    url: safeString(homeSettings?.subscriptionBanner?.secondaryCTA?.url, '/contact'),
                },
                showPlanCards: toBoolean(homeSettings?.subscriptionBanner?.showPlanCards, true),
                planIdsToShow: curatedIds,
            },
            state: {
                loggedIn: Boolean(req.user?._id),
                hasActivePlan,
                expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.toISOString() : null,
                reason: !req.user?._id ? 'not_logged_in' : (hasActivePlan ? 'active_plan' : 'subscription_required'),
            },
        });
    } catch (error) {
        console.error('getHomeSubscriptionPlans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function requestSubscriptionPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = String(req.user?._id || '');
        const planId = String(req.params.planId || '');
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(planId)) {
            res.status(400).json({ message: 'Invalid request' });
            return;
        }

        const plan = await SubscriptionPlan.findOne({
            _id: planId,
            isArchived: { $ne: true },
            $or: [{ enabled: true }, { isActive: true }],
        }).lean();
        if (!plan) {
            res.status(404).json({ message: 'Plan not found' });
            return;
        }

        const planDto = planToDto(plan as unknown as Record<string, unknown>);
        const amount = Math.max(0, safeNumber(planDto.priceBDT, 0));
        const methodRaw = safeString(req.body?.method, 'manual').toLowerCase();
        const method = ['bkash', 'nagad', 'rocket', 'upay', 'cash', 'manual', 'bank', 'card', 'sslcommerz'].includes(methodRaw)
            ? methodRaw
            : 'manual';
        const transactionId = safeString(req.body?.transactionId);
        const proofUrl = safeString(req.body?.proofUrl);
        const notes = safeString(req.body?.notes);

        const result = await assignSubscriptionLifecycle({
            userId,
            planId,
            actorId: userId,
            startAtUTC: new Date(),
            paymentAmount: amount,
            paymentStatus: planDto.type === 'free' ? 'paid' : 'pending',
            paymentMethod: method,
            transactionId,
            proofUrl,
            notes: notes || `Plan request created via public API (${planDto.type === 'free' ? 'active' : 'pending'})`,
            paymentNotes: notes || `Subscription request for ${planDto.name}`,
            recordPayment: false,
        });

        res.status(201).json({
            message: result.subscription.status === 'active' ? 'Free plan activated' : 'Payment request submitted',
            payment: result.payment,
            subscription: result.subscription,
            invoice: result.invoice,
            plan: planDto,
        });
    } catch (error) {
        console.error('requestSubscriptionPayment error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function uploadSubscriptionProof(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = String(req.user?._id || '');
        const planId = String(req.params.planId || '');
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(planId)) {
            res.status(400).json({ message: 'Invalid request' });
            return;
        }

        const payment = await ManualPayment.findOne({
            studentId: userId,
            subscriptionPlanId: planId,
            entryType: 'subscription',
        }).sort({ createdAt: -1 });
        if (!payment) {
            res.status(404).json({ message: 'No payment request found for this plan' });
            return;
        }

        let proofUrl = safeString(req.body?.proofUrl || req.body?.proofFileUrl);
        const transactionId = safeString(req.body?.transactionId);
        const methodRaw = safeString(req.body?.method).toLowerCase();
        if (req.file) {
            const secureUpload = await registerSecureUpload({
                file: req.file,
                category: 'payment_proof',
                visibility: 'protected',
                ownerUserId: userId,
                ownerRole: req.user?.role || 'student',
                uploadedBy: userId,
                accessRoles: ['student', 'superadmin', 'admin', 'finance_agent'],
            });
            proofUrl = buildSecureUploadUrl(secureUpload.storedName);
        }
        if (proofUrl) {
            payment.proofUrl = proofUrl;
            payment.proofFileUrl = proofUrl;
        }
        if (transactionId) {
            payment.transactionId = transactionId;
            payment.reference = transactionId;
        }
        if (methodRaw && ['bkash', 'nagad', 'rocket', 'upay', 'cash', 'manual', 'bank', 'card', 'sslcommerz'].includes(methodRaw)) {
            payment.method = methodRaw as any;
        }
        payment.status = payment.status === 'paid' ? 'paid' : 'pending';
        await payment.save();

        res.json({ message: 'Payment proof uploaded', payment });
    } catch (error) {
        console.error('uploadSubscriptionProof error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetSubscriptionPlans(req: AuthRequest, res: Response): Promise<void> {
    try {
        const items = await SubscriptionPlan.find()
            .sort(PLAN_SORT)
            .lean();
        res.json({
            items: items.map((item) => planToDto(item as unknown as Record<string, unknown>)),
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('adminGetSubscriptionPlans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetSubscriptionPlanById(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = safeString(req.params?.id);
        const item = await SubscriptionPlan.findOne(getPlanLookupQuery(id)).lean();
        if (!item) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }
        res.json({ item: planToDto(item as unknown as Record<string, unknown>) });
    } catch (error) {
        console.error('adminGetSubscriptionPlanById error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCreateSubscriptionPlan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const settings = await ensureSubscriptionSettings();
        const built = buildPlanMutationPayload(body, {
            isCreate: true,
            adminId: safeString(req.user?._id),
            defaultCtaMode: resolvePlanCtaMode(settings?.defaultCtaMode, 'contact'),
        });
        if (built.error || !built.payload) {
            res.status(400).json({ message: built.error || 'Invalid payload' });
            return;
        }

        const duplicate = await SubscriptionPlan.exists({
            $or: [
                { code: safeString(built.payload.code) },
                { slug: safeString(built.payload.slug) },
            ],
        });
        if (duplicate) {
            res.status(400).json({ message: 'Plan code or slug already exists' });
            return;
        }

        const created = await SubscriptionPlan.create(built.payload);

        res.status(201).json({ item: planToDto(created.toObject() as unknown as Record<string, unknown>), message: 'Subscription plan created' });
    } catch (error) {
        console.error('adminCreateSubscriptionPlan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminUpdateSubscriptionPlan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid plan id' });
            return;
        }

        const existing = await SubscriptionPlan.findById(id).lean();
        if (!existing) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }

        const settings = await ensureSubscriptionSettings();
        const built = buildPlanMutationPayload(body, {
            isCreate: false,
            existing: existing as unknown as Record<string, unknown>,
            adminId: safeString(req.user?._id),
            defaultCtaMode: resolvePlanCtaMode(settings?.defaultCtaMode, 'contact'),
        });
        if (built.error || !built.payload) {
            res.status(400).json({ message: built.error || 'Invalid payload' });
            return;
        }

        const duplicate = await SubscriptionPlan.exists({
            _id: { $ne: id },
            $or: [
                { code: safeString(built.payload.code) },
                { slug: safeString(built.payload.slug) },
            ],
        });
        if (duplicate) {
            res.status(400).json({ message: 'Plan code or slug already exists' });
            return;
        }

        const updated = await SubscriptionPlan.findByIdAndUpdate(id, built.payload, { new: true, runValidators: true }).lean();
        if (!updated) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }
        res.json({ item: planToDto(updated as unknown as Record<string, unknown>), message: 'Subscription plan updated' });
    } catch (error) {
        console.error('adminUpdateSubscriptionPlan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminDeleteSubscriptionPlan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid plan id' });
            return;
        }
        const archived = await SubscriptionPlan.findByIdAndUpdate(
            id,
            {
                $set: {
                    isArchived: true,
                    enabled: false,
                    isActive: false,
                    showOnHome: false,
                    showOnPricingPage: false,
                    updatedByAdminId: toAdminObjectId(req.user?._id),
                },
            },
            { new: true }
        ).lean();
        if (!archived) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }
        res.json({
            message: 'Subscription plan archived',
            item: planToDto(archived as unknown as Record<string, unknown>),
        });
    } catch (error) {
        console.error('adminDeleteSubscriptionPlan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminToggleSubscriptionPlan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        const plan = await SubscriptionPlan.findById(id);
        if (!plan) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }
        const enabled = !(plan.enabled !== false && plan.isActive !== false);
        plan.enabled = enabled;
        plan.isArchived = false;
        plan.isActive = enabled && !plan.isArchived;
        plan.updatedByAdminId = toAdminObjectId(req.user?._id);
        await plan.save();
        res.json({ item: planToDto(plan.toObject() as unknown as Record<string, unknown>), message: enabled ? 'Plan enabled' : 'Plan disabled' });
    } catch (error) {
        console.error('adminToggleSubscriptionPlan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminReorderSubscriptionPlans(req: AuthRequest, res: Response): Promise<void> {
    try {
        const rawOrder = req.body?.order || req.body?.ids || req.body?.planIds || [];
        if (!Array.isArray(rawOrder) || rawOrder.length === 0) {
            res.status(400).json({ message: 'order array is required' });
            return;
        }

        const ops = rawOrder
            .map((entry: unknown, index: number) => {
                const text = typeof entry === 'object' && entry !== null
                    ? String((entry as Record<string, unknown>).id || (entry as Record<string, unknown>)._id || '')
                    : String(entry || '').trim();
                if (!mongoose.Types.ObjectId.isValid(text)) return null;
                const explicitOrder = typeof entry === 'object' && entry !== null
                    ? safeNumber((entry as Record<string, unknown>).sortOrder ?? (entry as Record<string, unknown>).displayOrder, index + 1)
                    : index + 1;
                const nextOrder = explicitOrder || index + 1;
                return SubscriptionPlan.updateOne(
                    { _id: text },
                    {
                        $set: {
                            displayOrder: nextOrder,
                            sortOrder: nextOrder,
                            priority: nextOrder,
                            updatedByAdminId: toAdminObjectId(req.user?._id),
                        },
                    }
                );
            })
            .filter(Boolean) as Array<Promise<unknown>>;

        await Promise.all(ops);
        res.json({ message: 'Subscription plans reordered' });
    } catch (error) {
        console.error('adminReorderSubscriptionPlans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminAssignSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = safeString(req.body?.userId);
        const planId = safeString(req.body?.planId);
        const planCode = safeString(req.body?.planCode || req.body?.plan);
        if (!mongoose.Types.ObjectId.isValid(userId) || (!mongoose.Types.ObjectId.isValid(planId) && !planCode)) {
            res.status(400).json({ message: 'userId and a valid planId or planCode are required' });
            return;
        }

        const notes = safeString(req.body?.notes);
        const result = await assignSubscriptionLifecycle({
            userId,
            planId,
            planCode,
            actorId: safeString(req.user?._id),
            startAtUTC: req.body?.startAtUTC || req.body?.startDate,
            expiresAtUTC: req.body?.expiresAtUTC || req.body?.expiryDate || req.body?.endDate,
            subscriptionStatus: req.body?.subscriptionStatus || req.body?.status,
            paymentAmount: req.body?.paymentAmount,
            paymentStatus: req.body?.paymentStatus,
            paymentMethod: req.body?.paymentMethod,
            paymentDate: req.body?.paymentDate,
            transactionId: req.body?.transactionId,
            notes,
            paymentNotes: req.body?.paymentNotes,
            proofUrl: req.body?.proofUrl || req.body?.proofFileUrl,
            recordPayment: req.body?.recordPayment,
            autoRenewEnabled: req.body?.autoRenewEnabled,
            dueDateUTC: req.body?.dueDateUTC,
        });

        const responseStatus = req.params?.id ? 200 : 201;
        res.status(responseStatus).json({
            message: result.subscription.status === 'active' ? 'Subscription assigned' : 'Subscription created in pending state',
            item: result.subscription,
            payment: result.payment,
            invoice: result.invoice,
            cache: result.cache,
        });
    } catch (error) {
        console.error('adminAssignSubscription error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        const statusCode = /not found|required|valid/i.test(message) ? 400 : 500;
        res.status(statusCode).json({ message });
    }
}

export async function adminLegacyAssignStudentSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = safeString(req.params?.id || req.body?.userId);
        const planIdRaw = safeString(req.body?.planId);
        const planCode = safeString(req.body?.planCode || req.body?.plan).toLowerCase();

        let planId = planIdRaw;
        if (!mongoose.Types.ObjectId.isValid(planId) && planCode) {
            const plan = await SubscriptionPlan.findOne({ code: planCode }).select('_id').lean();
            if (plan?._id) {
                planId = String(plan._id);
            }
        }

        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(planId)) {
            res.status(400).json({ message: 'Valid student id and plan reference are required' });
            return;
        }

        const startAtUTC = safeString(req.body?.startAtUTC || req.body?.startDate);
        const expiresAtUTC = safeString(req.body?.expiresAtUTC || req.body?.expiryDate || req.body?.endDate);
        const isActive = req.body?.isActive === undefined ? true : toBoolean(req.body?.isActive, true);

        let status: 'active' | 'expired' | 'pending' | 'suspended' = isActive ? 'active' : 'suspended';
        if (!isActive && expiresAtUTC) {
            const expiresMs = new Date(expiresAtUTC).getTime();
            if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
                status = 'expired';
            }
        }

        req.body = {
            ...(req.body || {}),
            userId,
            planId,
            status,
            startAtUTC: startAtUTC || undefined,
            expiresAtUTC: expiresAtUTC || undefined,
            notes: safeString(req.body?.notes, 'Assigned via legacy student subscription endpoint'),
        };

        await adminAssignSubscription(req, res);
    } catch (error) {
        console.error('adminLegacyAssignStudentSubscription error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminSuspendSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = safeString(req.body?.userId);
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ message: 'userId is required' });
            return;
        }

        const latest = await UserSubscription.findOne({ userId }).sort({ updatedAt: -1, createdAt: -1 });
        if (!latest) {
            res.status(404).json({ message: 'No subscription record found for this user' });
            return;
        }
        latest.status = 'suspended';
        const notes = safeString(req.body?.notes);
        if (notes) latest.notes = notes;
        await latest.save();

        const plan = await SubscriptionPlan.findById(latest.planId).lean();
        await syncUserSubscriptionCache({
            userId,
            plan: plan as unknown as Record<string, unknown> | null,
            status: 'suspended',
            startAtUTC: latest.startAtUTC,
            expiresAtUTC: latest.expiresAtUTC,
        });

        res.json({ message: 'Subscription suspended', item: latest });
    } catch (error) {
        console.error('adminSuspendSubscription error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminExportSubscriptions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const type = getExportType(req.query.format ?? req.query.type);
        const statusFilter = safeString(req.query.status).toLowerCase();
        const filter: Record<string, unknown> = {};
        if (statusFilter && ['active', 'expired', 'pending', 'suspended'].includes(statusFilter)) {
            filter.status = statusFilter;
        }

        const rows = await UserSubscription.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'username email full_name')
            .populate('planId', 'name code')
            .lean();

        const exportRows = rows.map((item) => ({
            userId: String(item.userId && typeof item.userId === 'object' ? (item.userId as any)._id : item.userId || ''),
            username: safeString((item.userId as any)?.username),
            email: safeString((item.userId as any)?.email),
            fullName: safeString((item.userId as any)?.full_name),
            planId: String(item.planId && typeof item.planId === 'object' ? (item.planId as any)._id : item.planId || ''),
            planCode: safeString((item.planId as any)?.code),
            planName: safeString((item.planId as any)?.name),
            status: safeString(item.status),
            startAtUTC: item.startAtUTC ? new Date(item.startAtUTC).toISOString() : '',
            expiresAtUTC: item.expiresAtUTC ? new Date(item.expiresAtUTC).toISOString() : '',
            notes: safeString(item.notes),
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
            updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
        }));

        sendExport(res, type, 'subscriptions_export', exportRows);
    } catch (error) {
        console.error('adminExportSubscriptions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminExportSubscriptionPlans(req: AuthRequest, res: Response): Promise<void> {
    try {
        const type = getExportType(req.query.format ?? req.query.type);
        const plans = await SubscriptionPlan.find().sort(PLAN_SORT).lean();
        const exportRows = plans.map((item) => {
            const plan = planToDto(item as unknown as Record<string, unknown>);
            return {
                id: plan._id,
                code: plan.code,
                slug: plan.slug,
                name: plan.name,
                type: plan.type,
                planType: plan.planType,
                priceBDT: plan.priceBDT,
                oldPrice: plan.oldPrice ?? '',
                billingCycle: plan.billingCycle,
                durationDays: plan.durationDays,
                enabled: plan.enabled,
                isArchived: plan.isArchived,
                isFeatured: plan.isFeatured,
                showOnHome: plan.showOnHome,
                showOnPricingPage: plan.showOnPricingPage,
                displayOrder: plan.displayOrder,
                ctaLabel: plan.ctaLabel,
                ctaUrl: plan.ctaUrl,
                ctaMode: plan.ctaMode,
                shortDescription: plan.shortDescription,
                highlightText: plan.highlightText,
                visibleFeatures: plan.visibleFeatures.join(' | '),
                fullFeatures: plan.fullFeatures.join(' | '),
                tags: plan.tags.join(' | '),
            };
        });
        sendExport(res, type, 'subscription_plans_export', exportRows);
    } catch (error) {
        console.error('adminExportSubscriptionPlans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminToggleSubscriptionPlanFeatured(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid plan id' });
            return;
        }
        const plan = await SubscriptionPlan.findById(id);
        if (!plan) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }
        plan.isFeatured = !Boolean(plan.isFeatured);
        if (plan.isFeatured && !plan.showOnHome) {
            plan.showOnHome = true;
        }
        plan.updatedByAdminId = toAdminObjectId(req.user?._id);
        await plan.save();
        res.json({ item: planToDto(plan.toObject() as unknown as Record<string, unknown>), message: plan.isFeatured ? 'Plan marked as featured' : 'Plan unfeatured' });
    } catch (error) {
        console.error('adminToggleSubscriptionPlanFeatured error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminDuplicateSubscriptionPlan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = safeString(req.params.id);
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid plan id' });
            return;
        }

        const source = await SubscriptionPlan.findById(id).lean();
        if (!source) {
            res.status(404).json({ message: 'Subscription plan not found' });
            return;
        }

        const identity = await buildUniqueDuplicateIdentity(
            safeString(source.code, 'plan'),
            safeString(source.slug || source.code, 'plan')
        );
        const created = await SubscriptionPlan.create({
            ...(source as unknown as Record<string, unknown>),
            _id: undefined,
            code: identity.code,
            slug: identity.slug,
            name: `${safeString(source.name, 'Plan')} Copy`,
            isArchived: false,
            enabled: false,
            isActive: false,
            isFeatured: false,
            createdByAdminId: toAdminObjectId(req.user?._id),
            updatedByAdminId: toAdminObjectId(req.user?._id),
        });

        res.status(201).json({
            item: planToDto(created.toObject() as unknown as Record<string, unknown>),
            message: 'Subscription plan duplicated',
        });
    } catch (error) {
        console.error('adminDuplicateSubscriptionPlan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetSubscriptionSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
        const settings = await ensureSubscriptionSettings();
        res.json({ settings: buildSettingsDto(settings as unknown as Record<string, unknown>, null) });
    } catch (error) {
        console.error('adminGetSubscriptionSettings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminUpdateSubscriptionSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const settings = await ensureSubscriptionSettings();
        const bodySectionToggles = (body.sectionToggles as Record<string, unknown> | undefined) || {};
        const existingSectionToggles = (settings.sectionToggles as Record<string, unknown> | undefined) || {};
        const update: Record<string, unknown> = {
            pageTitle: safeString(body.pageTitle, safeString(settings.pageTitle, 'Subscription Plans')),
            pageSubtitle: safeString(body.pageSubtitle, safeString(settings.pageSubtitle, 'Choose the right plan for your CampusWay journey.')),
            heroEyebrow: safeString(body.heroEyebrow, safeString(settings.heroEyebrow, 'CampusWay Memberships')),
            heroNote: safeString(
                body.heroNote,
                safeString(settings.heroNote, 'Premium access, clear comparisons, and one-click plan details.')
            ),
            headerBannerUrl: safeString(body.headerBannerUrl, safeString(settings.headerBannerUrl)) || null,
            defaultPlanBannerUrl: safeString(body.defaultPlanBannerUrl, safeString(settings.defaultPlanBannerUrl)) || null,
            currencyLabel: safeString(body.currencyLabel, safeString(settings.currencyLabel, 'BDT')),
            showFeaturedFirst: toBoolean(body.showFeaturedFirst, settings.showFeaturedFirst !== false),
            allowFreePlans: toBoolean(body.allowFreePlans, toBoolean(settings.allowFreePlans, true)),
            comparisonEnabled: toBoolean(body.comparisonEnabled, toBoolean(settings.comparisonEnabled, true)),
            comparisonTitle: safeString(body.comparisonTitle, safeString(settings.comparisonTitle, 'Compare Plans')),
            comparisonSubtitle: safeString(
                body.comparisonSubtitle,
                safeString(settings.comparisonSubtitle, 'See what changes as you upgrade.')
            ),
            comparisonRows: safeComparisonRows(
                body.comparisonRows !== undefined ? body.comparisonRows : settings.comparisonRows
            ),
            pageFaqEnabled: toBoolean(body.pageFaqEnabled, toBoolean(settings.pageFaqEnabled, true)),
            pageFaqTitle: safeString(
                body.pageFaqTitle,
                safeString(settings.pageFaqTitle, 'Frequently Asked Questions')
            ),
            pageFaqItems: safeFaqItems(
                body.pageFaqItems !== undefined ? body.pageFaqItems : settings.pageFaqItems
            ),
            sectionToggles: {
                detailsDrawer: toBoolean(
                    bodySectionToggles.detailsDrawer,
                    toBoolean(existingSectionToggles.detailsDrawer, true)
                ),
                comparisonTable: toBoolean(
                    bodySectionToggles.comparisonTable,
                    toBoolean(existingSectionToggles.comparisonTable, true)
                ),
                faqBlock: toBoolean(
                    bodySectionToggles.faqBlock,
                    toBoolean(existingSectionToggles.faqBlock, true)
                ),
                homePreview: toBoolean(
                    bodySectionToggles.homePreview,
                    toBoolean(existingSectionToggles.homePreview, true)
                ),
            },
            defaultCtaMode: resolvePlanCtaMode(
                body.defaultCtaMode,
                resolvePlanCtaMode(settings.defaultCtaMode, 'contact')
            ),
            lastEditedByAdminId: req.user?._id && mongoose.Types.ObjectId.isValid(String(req.user._id))
                ? new mongoose.Types.ObjectId(String(req.user._id))
                : null,
        };

        const updated = await SubscriptionSettings.findByIdAndUpdate(String(settings._id), update, { new: true, runValidators: true }).lean();
        res.json({
            settings: buildSettingsDto(updated as unknown as Record<string, unknown>, null),
            message: 'Subscription settings updated',
        });
    } catch (error) {
        console.error('adminUpdateSubscriptionSettings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetUserSubscriptions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const status = safeString(req.query.status).toLowerCase();
        const q = safeString(req.query.q).toLowerCase();
        const planId = safeString(req.query.planId);
        const page = Math.max(1, safeNumber(req.query.page, 1));
        const limit = Math.min(200, Math.max(1, safeNumber(req.query.limit, 20)));

        const filter: Record<string, unknown> = {};
        if (status && ['active', 'expired', 'pending', 'suspended'].includes(status)) filter.status = status;
        if (planId && mongoose.Types.ObjectId.isValid(planId)) filter.planId = new mongoose.Types.ObjectId(planId);

        const rows = await UserSubscription.find(filter)
            .sort({ updatedAt: -1, createdAt: -1 })
            .populate('userId', 'username email full_name')
            .populate('planId', 'name code durationDays')
            .lean();

        const nowMs = Date.now();
        const shaped = rows.map((row: any) => {
            const expiresAt = row.expiresAtUTC ? new Date(row.expiresAtUTC) : null;
            const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - nowMs) / 86400000) : null;
            return {
                ...row,
                daysLeft,
            };
        }).filter((row: any) => {
            if (!q) return true;
            const username = safeString(row.userId?.username).toLowerCase();
            const email = safeString(row.userId?.email).toLowerCase();
            const fullName = safeString(row.userId?.full_name).toLowerCase();
            const planName = safeString(row.planId?.name).toLowerCase();
            return username.includes(q) || email.includes(q) || fullName.includes(q) || planName.includes(q);
        });

        const total = shaped.length;
        const start = (page - 1) * limit;
        const items = shaped.slice(start, start + limit);

        res.json({
            items,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    } catch (error) {
        console.error('adminGetUserSubscriptions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCreateUserSubscription(req: AuthRequest, res: Response): Promise<void> {
    req.params.id = req.params.id || '';
    await adminAssignSubscription(req, res);
}

export async function adminActivateUserSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid subscription id' });
            return;
        }

        const record = await UserSubscription.findById(id);
        if (!record) {
            res.status(404).json({ message: 'Subscription not found' });
            return;
        }

        const plan = await SubscriptionPlan.findById(record.planId).lean();
        const planDto = plan ? planToDto(plan as unknown as Record<string, unknown>) : null;
        const startAtUTC = new Date();
        const durationDays = Math.max(1, safeNumber(planDto?.durationDays, 30));
        const expiresAtUTC = new Date(startAtUTC.getTime() + durationDays * 24 * 60 * 60 * 1000);

        record.status = 'active';
        record.startAtUTC = startAtUTC;
        record.expiresAtUTC = expiresAtUTC;
        record.activatedByAdminId = req.user?._id && mongoose.Types.ObjectId.isValid(String(req.user._id))
            ? new mongoose.Types.ObjectId(String(req.user._id))
            : record.activatedByAdminId;
        await record.save();

        await syncUserSubscriptionCache({
            userId: String(record.userId),
            plan: plan as unknown as Record<string, unknown> | null,
            status: 'active',
            startAtUTC,
            expiresAtUTC,
        });

        res.json({ message: 'Subscription activated', item: record });
    } catch (error) {
        console.error('adminActivateUserSubscription error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminExpireUserSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid subscription id' });
            return;
        }
        const record = await UserSubscription.findById(id);
        if (!record) {
            res.status(404).json({ message: 'Subscription not found' });
            return;
        }
        record.status = 'expired';
        record.expiresAtUTC = new Date();
        await record.save();

        const plan = await SubscriptionPlan.findById(record.planId).lean();
        await syncUserSubscriptionCache({
            userId: String(record.userId),
            plan: plan as unknown as Record<string, unknown> | null,
            status: 'expired',
            startAtUTC: record.startAtUTC,
            expiresAtUTC: record.expiresAtUTC,
        });

        res.json({ message: 'Subscription expired', item: record });
    } catch (error) {
        console.error('adminExpireUserSubscription error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminSuspendUserSubscriptionById(req: AuthRequest, res: Response): Promise<void> {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid subscription id' });
            return;
        }
        const record = await UserSubscription.findById(id);
        if (!record) {
            res.status(404).json({ message: 'Subscription not found' });
            return;
        }
        record.status = 'suspended';
        await record.save();

        const plan = await SubscriptionPlan.findById(record.planId).lean();
        await syncUserSubscriptionCache({
            userId: String(record.userId),
            plan: plan as unknown as Record<string, unknown> | null,
            status: 'suspended',
            startAtUTC: record.startAtUTC,
            expiresAtUTC: record.expiresAtUTC,
        });

        res.json({ message: 'Subscription suspended', item: record });
    } catch (error) {
        console.error('adminSuspendUserSubscriptionById error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}
