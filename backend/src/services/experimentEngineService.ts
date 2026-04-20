/**
 * Experiment Engine Service
 *
 * Manages A/B variant assignment, holdout/control groups, engagement
 * recording, and auto-winner recommendation based on engagement metrics.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import mongoose from 'mongoose';
import ExperimentAssignment from '../models/ExperimentAssignment';
import NotificationSettings from '../models/NotificationSettings';
import type { ExperimentConfig } from '../types/campaignSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the ExperimentConfig for a given experimentId.
 * In this system the experiment config lives on the singleton NotificationSettings
 * document. The experimentId is used to locate the assignment records; the config
 * is read from settings.
 */
async function getExperimentConfig(experimentId: mongoose.Types.ObjectId): Promise<ExperimentConfig> {
    const settings = await NotificationSettings.findOne().lean();
    if (!settings || !settings.experiment) {
        throw new Error(`No experiment configuration found for experiment ${experimentId.toHexString()}`);
    }
    return settings.experiment as ExperimentConfig;
}

/**
 * Randomly pick a variant (or holdout) based on split percentages.
 *
 * The selection works by building a cumulative distribution from the holdout
 * percentage followed by each variant's splitPercent. A random number [0, 100)
 * is generated and the first bucket whose cumulative boundary exceeds the
 * random value is selected.
 */
export function pickVariant(
    config: ExperimentConfig,
): { variantId: string | null; isHoldout: boolean } {
    const rand = Math.random() * 100;

    // Holdout group occupies the first slice
    if (rand < config.holdoutPercent) {
        return { variantId: null, isHoldout: true };
    }

    // Walk through variants in order
    let cumulative = config.holdoutPercent;
    for (const variant of config.variants) {
        cumulative += variant.splitPercent;
        if (rand < cumulative) {
            return { variantId: variant.id, isHoldout: false };
        }
    }

    // Fallback to last variant (handles floating-point edge cases)
    const last = config.variants[config.variants.length - 1];
    return { variantId: last.id, isHoldout: false };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Assign a recipient to a variant (or holdout) for an experiment.
 * If the recipient is already assigned, returns the existing assignment.
 * Otherwise, randomly assigns based on split percentages + holdout.
 * Req 9.2, 9.3
 */
export async function assignVariant(
    experimentId: mongoose.Types.ObjectId,
    recipientId: mongoose.Types.ObjectId,
): Promise<{ variantId: string | null; isHoldout: boolean }> {
    // Check for existing assignment
    const existing = await ExperimentAssignment.findOne({ experimentId, recipientId }).lean();
    if (existing) {
        return { variantId: existing.variantId, isHoldout: existing.isHoldout };
    }

    const config = await getExperimentConfig(experimentId);
    const { variantId, isHoldout } = pickVariant(config);

    await ExperimentAssignment.create({
        experimentId,
        recipientId,
        variantId,
        isHoldout,
        assignedAt: new Date(),
        engagements: [],
    });

    return { variantId, isHoldout };
}

/**
 * Record an engagement event (open, click, conversion) for a recipient
 * in an experiment.
 * Req 9.4
 */
export async function recordEngagement(
    experimentId: mongoose.Types.ObjectId,
    recipientId: mongoose.Types.ObjectId,
    metric: 'open' | 'click' | 'conversion',
): Promise<void> {
    const result = await ExperimentAssignment.updateOne(
        { experimentId, recipientId },
        {
            $push: {
                engagements: { metric, recordedAt: new Date() },
            },
        },
    );

    if (result.matchedCount === 0) {
        throw new Error(
            `No assignment found for experiment ${experimentId.toHexString()} and recipient ${recipientId.toHexString()}`,
        );
    }
}


/**
 * Get experiment results: engagement rates per variant and recommended winner.
 *
 * For each variant, calculates:
 * - openRate:       # recipients with at least one 'open' / sampleSize
 * - clickRate:      # recipients with at least one 'click' / sampleSize
 * - conversionRate: # recipients with at least one 'conversion' / sampleSize
 * - sampleSize:     total recipients assigned to that variant
 *
 * The recommendedWinner is the variant with the highest rate for the
 * experiment's primaryMetric. Returns null if no assignments exist or
 * all rates are zero.
 *
 * Req 9.4, 9.5
 */
export async function getResults(
    experimentId: mongoose.Types.ObjectId,
): Promise<{
    variants: Array<{
        id: string;
        openRate: number;
        clickRate: number;
        conversionRate: number;
        sampleSize: number;
    }>;
    recommendedWinner: string | null;
}> {
    const config = await getExperimentConfig(experimentId);

    // Aggregate per-variant stats (exclude holdout assignments where variantId is null)
    const assignments = await ExperimentAssignment.find({
        experimentId,
        isHoldout: false,
    }).lean();

    // Group assignments by variantId
    const variantMap = new Map<
        string,
        { sampleSize: number; opens: number; clicks: number; conversions: number }
    >();

    // Initialise all configured variants so they appear even with 0 assignments
    for (const v of config.variants) {
        variantMap.set(v.id, { sampleSize: 0, opens: 0, clicks: 0, conversions: 0 });
    }

    for (const assignment of assignments) {
        const vid = assignment.variantId!;
        const entry = variantMap.get(vid) ?? { sampleSize: 0, opens: 0, clicks: 0, conversions: 0 };
        entry.sampleSize += 1;

        const metrics = new Set(assignment.engagements.map((e: { metric: string }) => e.metric));
        if (metrics.has('open')) entry.opens += 1;
        if (metrics.has('click')) entry.clicks += 1;
        if (metrics.has('conversion')) entry.conversions += 1;

        variantMap.set(vid, entry);
    }

    const variants = Array.from(variantMap.entries()).map(([id, stats]) => ({
        id,
        openRate: stats.sampleSize > 0 ? stats.opens / stats.sampleSize : 0,
        clickRate: stats.sampleSize > 0 ? stats.clicks / stats.sampleSize : 0,
        conversionRate: stats.sampleSize > 0 ? stats.conversions / stats.sampleSize : 0,
        sampleSize: stats.sampleSize,
    }));

    // Determine winner based on primaryMetric
    const metricKey = `${config.primaryMetric}Rate` as 'openRate' | 'clickRate' | 'conversionRate';
    let recommendedWinner: string | null = null;
    let bestRate = 0;

    for (const v of variants) {
        if (v[metricKey] > bestRate) {
            bestRate = v[metricKey];
            recommendedWinner = v.id;
        }
    }

    return { variants, recommendedWinner };
}
