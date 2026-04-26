import type { SubscriptionPlanPublic } from '../../services/api';

export function paragraphBlocks(value: string): string[] {
    const source = String(value || '').trim();
    if (!source) return [];

    const explicitBlocks = source.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    if (explicitBlocks.length > 1) return explicitBlocks;

    const sentences = source.split(/(?<=[.!?\u0964])\s+/).map((item) => item.trim()).filter(Boolean);
    if (sentences.length <= 2) return [source];

    const blocks: string[] = [];
    for (let index = 0; index < sentences.length; index += 2) {
        blocks.push(sentences.slice(index, index + 2).join(' '));
    }
    return blocks;
}

export function formatSubscriptionPlanPrice(
    plan: SubscriptionPlanPublic,
    currencyLabel?: string,
): string {
    if (plan.isFree || plan.priceBDT <= 0) return 'Free';
    const label = currencyLabel || plan.currency || 'BDT';
    // Add trailing space for alphabetic currency codes (e.g. "BDT" → "BDT "), skip for symbols (e.g. "৳")
    const formattedLabel = /^[A-Za-z]+$/.test(label.trim()) ? `${label.trim()} ` : label.trim();
    return `${formattedLabel}${Number(plan.priceBDT || 0).toLocaleString()}`;
}

export function getSubscriptionPlanPriceSuffix(plan: SubscriptionPlanPublic): string {
    return plan.billingCycle === 'one_time' ? 'one time' : (plan.billingCycle || 'monthly');
}

export function getSubscriptionPlanSummary(plan: SubscriptionPlanPublic): string {
    return plan.tagline || plan.shortDescription || plan.highlightText || 'Plan summary managed from admin.';
}

export function getSubscriptionPlanFeatureList(plan: SubscriptionPlanPublic): string[] {
    if (plan.fullFeatures?.length) return plan.fullFeatures;
    if (plan.visibleFeatures?.length) return plan.visibleFeatures;
    return plan.features || [];
}

export function getSubscriptionPlanMetaItems(plan: SubscriptionPlanPublic): Array<{ label: string; value: string }> {
    const items: Array<{ label: string; value: string }> = [
        { label: 'Billing', value: plan.billingCycle === 'one_time' ? 'One time' : (plan.billingCycle || 'Monthly') },
        { label: 'Validity', value: plan.validityLabel || plan.durationLabel || 'Admin managed' },
        { label: 'Support', value: plan.supportLevel || 'Standard' },
    ];
    if (plan.planType && plan.planType !== 'free' && plan.planType !== 'paid') {
        items.push({ label: 'Plan Type', value: plan.planType.charAt(0).toUpperCase() + plan.planType.slice(1) });
    }
    if (plan.accessScope) {
        items.push({ label: 'Access', value: plan.accessScope });
    }
    if (plan.maxAttempts !== null && plan.maxAttempts !== undefined) {
        items.push({ label: 'Max Attempts', value: plan.maxAttempts === 0 ? 'Unlimited' : String(plan.maxAttempts) });
    }
    return items;
}

export function getSubscriptionPlanAccessPermissions(plan: SubscriptionPlanPublic): Array<{ label: string; allowed: boolean }> {
    return [
        { label: 'Exams', allowed: plan.allowsExams ?? true },
        { label: 'Premium Resources', allowed: plan.allowsPremiumResources ?? false },
        { label: 'SMS Updates', allowed: plan.allowsSMSUpdates ?? false },
        { label: 'Email Updates', allowed: plan.allowsEmailUpdates ?? true },
        { label: 'Guardian Alerts', allowed: plan.allowsGuardianAlerts ?? false },
        { label: 'Special Groups', allowed: plan.allowsSpecialGroups ?? false },
    ];
}

export function getSubscriptionPlanIncludedModules(plan: SubscriptionPlanPublic): string[] {
    return plan.includedModules || [];
}

export function getSubscriptionPlanDashboardPrivileges(plan: SubscriptionPlanPublic): string[] {
    return plan.dashboardPrivileges || [];
}

export function getSubscriptionPlanTags(plan: SubscriptionPlanPublic): string[] {
    return plan.tags || [];
}
