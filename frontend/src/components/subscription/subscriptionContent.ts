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
    return `${label}${Number(plan.priceBDT || 0).toLocaleString()}`;
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
    return [
        { label: 'Billing', value: plan.billingCycle === 'one_time' ? 'One time' : (plan.billingCycle || 'Monthly') },
        { label: 'Validity', value: plan.validityLabel || plan.durationLabel || 'Admin managed' },
        { label: 'Support', value: plan.supportLevel || 'Standard' },
    ];
}
