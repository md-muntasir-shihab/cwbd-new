import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ExperimentAssignment from '../models/ExperimentAssignment';
import NotificationSettings from '../models/NotificationSettings';
import {
    assignVariant,
    recordEngagement,
    getResults,
    pickVariant,
} from '../services/experimentEngineService';

/**
 * Unit tests for ExperimentEngine service
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

let mongoServer: MongoMemoryServer;

const experimentId = new mongoose.Types.ObjectId();
const recipientId1 = new mongoose.Types.ObjectId();
const recipientId2 = new mongoose.Types.ObjectId();
const recipientId3 = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await ExperimentAssignment.deleteMany({});
    await NotificationSettings.deleteMany({});
});

describe('ExperimentEngine Service', () => {
    // ─── 1. pickVariant assigns to holdout when random falls in holdout range ──

    it('pickVariant assigns to holdout when random falls in holdout range', () => {
        const config = {
            variants: [
                { id: 'A', splitPercent: 50 },
                { id: 'B', splitPercent: 40 },
            ],
            holdoutPercent: 10,
            observationWindowHours: 24,
            primaryMetric: 'open' as const,
        };

        // Mock Math.random to return 0.05 → rand = 5, which is < holdoutPercent (10)
        vi.spyOn(Math, 'random').mockReturnValue(0.05);

        const result = pickVariant(config);
        expect(result.variantId).toBeNull();
        expect(result.isHoldout).toBe(true);

        vi.restoreAllMocks();
    });

    // ─── 2. pickVariant assigns to correct variant based on split percentages ──

    it('pickVariant assigns to variant A when random falls in variant A range', () => {
        const config = {
            variants: [
                { id: 'A', splitPercent: 50 },
                { id: 'B', splitPercent: 40 },
            ],
            holdoutPercent: 10,
            observationWindowHours: 24,
            primaryMetric: 'open' as const,
        };

        // Mock Math.random to return 0.30 → rand = 30, holdout ends at 10, A covers 10-60
        vi.spyOn(Math, 'random').mockReturnValue(0.30);

        const result = pickVariant(config);
        expect(result.variantId).toBe('A');
        expect(result.isHoldout).toBe(false);

        vi.restoreAllMocks();
    });

    it('pickVariant assigns to variant B when random falls in variant B range', () => {
        const config = {
            variants: [
                { id: 'A', splitPercent: 50 },
                { id: 'B', splitPercent: 40 },
            ],
            holdoutPercent: 10,
            observationWindowHours: 24,
            primaryMetric: 'open' as const,
        };

        // Mock Math.random to return 0.75 → rand = 75, A covers 10-60, B covers 60-100
        vi.spyOn(Math, 'random').mockReturnValue(0.75);

        const result = pickVariant(config);
        expect(result.variantId).toBe('B');
        expect(result.isHoldout).toBe(false);

        vi.restoreAllMocks();
    });

    // ─── 3. assignVariant creates a new assignment and returns it ───────────

    it('assignVariant creates a new assignment and returns it', async () => {
        await NotificationSettings.create({
            experiment: {
                variants: [
                    { id: 'A', splitPercent: 50 },
                    { id: 'B', splitPercent: 40 },
                ],
                holdoutPercent: 10,
                observationWindowHours: 24,
                primaryMetric: 'open',
            },
        });

        // Force assignment to variant A
        vi.spyOn(Math, 'random').mockReturnValue(0.30);

        const result = await assignVariant(experimentId, recipientId1);
        expect(result.variantId).toBe('A');
        expect(result.isHoldout).toBe(false);

        // Verify the assignment was persisted
        const assignment = await ExperimentAssignment.findOne({
            experimentId,
            recipientId: recipientId1,
        }).lean();
        expect(assignment).not.toBeNull();
        expect(assignment!.variantId).toBe('A');
        expect(assignment!.isHoldout).toBe(false);
        expect(assignment!.engagements).toHaveLength(0);

        vi.restoreAllMocks();
    });

    // ─── 4. assignVariant returns existing assignment if already assigned (idempotent) ──

    it('assignVariant returns existing assignment if already assigned (idempotent)', async () => {
        await NotificationSettings.create({
            experiment: {
                variants: [
                    { id: 'A', splitPercent: 50 },
                    { id: 'B', splitPercent: 40 },
                ],
                holdoutPercent: 10,
                observationWindowHours: 24,
                primaryMetric: 'open',
            },
        });

        // First assignment → variant A
        vi.spyOn(Math, 'random').mockReturnValue(0.30);
        const first = await assignVariant(experimentId, recipientId1);
        vi.restoreAllMocks();

        // Second call with different random → should still return variant A (existing)
        vi.spyOn(Math, 'random').mockReturnValue(0.75);
        const second = await assignVariant(experimentId, recipientId1);
        vi.restoreAllMocks();

        expect(second.variantId).toBe(first.variantId);
        expect(second.isHoldout).toBe(first.isHoldout);

        // Only one assignment document should exist
        const count = await ExperimentAssignment.countDocuments({
            experimentId,
            recipientId: recipientId1,
        });
        expect(count).toBe(1);
    });

    // ─── 5. recordEngagement adds engagement to existing assignment ─────────

    it('recordEngagement adds engagement to existing assignment', async () => {
        // Create an assignment directly
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId1,
            variantId: 'A',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [],
        });

        await recordEngagement(experimentId, recipientId1, 'open');
        await recordEngagement(experimentId, recipientId1, 'click');

        const assignment = await ExperimentAssignment.findOne({
            experimentId,
            recipientId: recipientId1,
        }).lean();

        expect(assignment!.engagements).toHaveLength(2);
        expect(assignment!.engagements[0].metric).toBe('open');
        expect(assignment!.engagements[1].metric).toBe('click');
    });

    // ─── 6. recordEngagement throws when no assignment exists ───────────────

    it('recordEngagement throws when no assignment exists', async () => {
        const noAssignmentRecipient = new mongoose.Types.ObjectId();

        await expect(
            recordEngagement(experimentId, noAssignmentRecipient, 'open'),
        ).rejects.toThrow(/No assignment found/);
    });

    // ─── 7. getResults calculates correct engagement rates per variant ──────

    it('getResults calculates correct engagement rates per variant', async () => {
        await NotificationSettings.create({
            experiment: {
                variants: [
                    { id: 'A', splitPercent: 50 },
                    { id: 'B', splitPercent: 40 },
                ],
                holdoutPercent: 10,
                observationWindowHours: 24,
                primaryMetric: 'open',
            },
        });

        // Create assignments: 2 in variant A, 1 in variant B
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId1,
            variantId: 'A',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [{ metric: 'open', recordedAt: new Date() }],
        });
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId2,
            variantId: 'A',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [],
        });
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId3,
            variantId: 'B',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [
                { metric: 'open', recordedAt: new Date() },
                { metric: 'click', recordedAt: new Date() },
            ],
        });

        const results = await getResults(experimentId);

        const variantA = results.variants.find((v) => v.id === 'A')!;
        expect(variantA.sampleSize).toBe(2);
        expect(variantA.openRate).toBe(0.5); // 1 out of 2
        expect(variantA.clickRate).toBe(0);
        expect(variantA.conversionRate).toBe(0);

        const variantB = results.variants.find((v) => v.id === 'B')!;
        expect(variantB.sampleSize).toBe(1);
        expect(variantB.openRate).toBe(1); // 1 out of 1
        expect(variantB.clickRate).toBe(1); // 1 out of 1
        expect(variantB.conversionRate).toBe(0);
    });

    // ─── 8. getResults recommends winner based on primaryMetric ─────────────

    it('getResults recommends winner based on primaryMetric', async () => {
        await NotificationSettings.create({
            experiment: {
                variants: [
                    { id: 'A', splitPercent: 50 },
                    { id: 'B', splitPercent: 40 },
                ],
                holdoutPercent: 10,
                observationWindowHours: 24,
                primaryMetric: 'open',
            },
        });

        // Variant A: 1/2 open rate = 0.5
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId1,
            variantId: 'A',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [{ metric: 'open', recordedAt: new Date() }],
        });
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId2,
            variantId: 'A',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [],
        });

        // Variant B: 1/1 open rate = 1.0
        await ExperimentAssignment.create({
            experimentId,
            recipientId: recipientId3,
            variantId: 'B',
            isHoldout: false,
            assignedAt: new Date(),
            engagements: [{ metric: 'open', recordedAt: new Date() }],
        });

        const results = await getResults(experimentId);

        // B has higher open rate (1.0 vs 0.5), so B should be recommended
        expect(results.recommendedWinner).toBe('B');
    });
});
