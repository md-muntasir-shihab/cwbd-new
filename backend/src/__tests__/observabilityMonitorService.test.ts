import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationJob from '../models/NotificationJob';
import {
    checkDeliverySLO,
    checkQueueLag,
    checkProviderHealth,
    checkCostAnomaly,
} from '../services/observabilityMonitorService';
import { ObservabilityConfig } from '../types/campaignSettings';

/**
 * Unit tests for ObservabilityMonitor service
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
 */

let mongoServer: MongoMemoryServer;

const adminId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

const defaultConfig: ObservabilityConfig = {
    sloTargetPercent: 99,
    queueLagThresholdMinutes: 5,
    failureSurgeThresholdPercent: 10,
    costAnomalyThresholdPercent: 200,
    rollingWindowMinutes: 15,
};

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await NotificationDeliveryLog.deleteMany({});
    await NotificationJob.deleteMany({});
});

/** Helper: create a NotificationJob and return its _id */
async function createJob(
    overrides: Partial<{ status: string; createdAt: Date }> = {},
): Promise<mongoose.Types.ObjectId> {
    const job = await NotificationJob.create({
        type: 'bulk',
        channel: 'sms',
        target: 'single',
        templateKey: 'TEST',
        createdByAdminId: adminId,
        status: overrides.status ?? 'done',
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    });
    return job._id as mongoose.Types.ObjectId;
}

/** Helper: create a delivery log */
async function createLog(opts: {
    jobId: mongoose.Types.ObjectId;
    status: 'sent' | 'failed';
    providerUsed?: string;
    costAmount?: number;
    createdAt?: Date;
    sentAtUTC?: Date;
}): Promise<void> {
    await NotificationDeliveryLog.create({
        jobId: opts.jobId,
        studentId,
        channel: 'sms',
        providerUsed: opts.providerUsed ?? 'test-provider',
        to: '+8801700000000',
        status: opts.status,
        costAmount: opts.costAmount ?? 0,
        createdAt: opts.createdAt ?? new Date(),
        ...(opts.sentAtUTC ? { sentAtUTC: opts.sentAtUTC } : {}),
    });
}

describe('ObservabilityMonitor Service', () => {
    // ─── checkDeliverySLO ────────────────────────────────────────────────

    describe('checkDeliverySLO', () => {
        it('returns breached:false when success rate is above target', async () => {
            const jobId = await createJob();
            const now = new Date();

            // 100 sent, 0 failed → 100% success rate, above 99% target
            for (let i = 0; i < 100; i++) {
                await createLog({ jobId, status: 'sent', createdAt: now });
            }

            const result = await checkDeliverySLO(defaultConfig);
            expect(result.breached).toBe(false);
            expect(result.currentRate).toBe(100);
            expect(result.target).toBe(99);
        });

        it('returns breached:true when success rate is below target', async () => {
            const jobId = await createJob();
            const now = new Date();

            // 90 sent, 10 failed → 90% success rate, below 99% target
            for (let i = 0; i < 90; i++) {
                await createLog({ jobId, status: 'sent', createdAt: now });
            }
            for (let i = 0; i < 10; i++) {
                await createLog({ jobId, status: 'failed', createdAt: now });
            }

            const result = await checkDeliverySLO(defaultConfig);
            expect(result.breached).toBe(true);
            expect(result.currentRate).toBe(90);
            expect(result.target).toBe(99);
        });

        it('returns breached:false with 100% rate when no logs exist', async () => {
            const result = await checkDeliverySLO(defaultConfig);
            expect(result.breached).toBe(false);
            expect(result.currentRate).toBe(100);
        });
    });

    // ─── checkQueueLag ───────────────────────────────────────────────────

    describe('checkQueueLag', () => {
        it('returns breached:false when no queued jobs exist', async () => {
            const result = await checkQueueLag(defaultConfig);
            expect(result.breached).toBe(false);
            expect(result.lagMinutes).toBe(0);
            expect(result.threshold).toBe(5);
        });

        it('returns breached:true when oldest queued job exceeds threshold', async () => {
            // Create a queued job from 10 minutes ago (exceeds 5-minute threshold)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            await createJob({ status: 'queued', createdAt: tenMinutesAgo });

            const result = await checkQueueLag(defaultConfig);
            expect(result.breached).toBe(true);
            expect(result.lagMinutes).toBeGreaterThanOrEqual(9.9);
            expect(result.threshold).toBe(5);
        });

        it('returns breached:false when queued job is within threshold', async () => {
            // Create a queued job from 1 minute ago (within 5-minute threshold)
            const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
            await createJob({ status: 'queued', createdAt: oneMinuteAgo });

            const result = await checkQueueLag(defaultConfig);
            expect(result.breached).toBe(false);
            expect(result.lagMinutes).toBeLessThan(5);
        });
    });

    // ─── checkProviderHealth ─────────────────────────────────────────────

    describe('checkProviderHealth', () => {
        it('returns surgeDetected:false when failure rate is low', async () => {
            const jobId = await createJob();
            const now = new Date();
            const provider = 'healthy-provider';

            // 95 sent, 5 failed → ~5% failure rate, below 10% threshold
            for (let i = 0; i < 95; i++) {
                await createLog({ jobId, status: 'sent', providerUsed: provider, createdAt: now });
            }
            for (let i = 0; i < 5; i++) {
                await createLog({ jobId, status: 'failed', providerUsed: provider, createdAt: now });
            }

            const result = await checkProviderHealth(provider, defaultConfig);
            expect(result.surgeDetected).toBe(false);
            expect(result.successRate).toBe(95);
            expect(result.errorCount).toBe(5);
        });

        it('returns surgeDetected:true when failure rate exceeds threshold', async () => {
            const jobId = await createJob();
            const now = new Date();
            const provider = 'unhealthy-provider';

            // 80 sent, 20 failed → 20% failure rate, above 10% threshold
            for (let i = 0; i < 80; i++) {
                await createLog({ jobId, status: 'sent', providerUsed: provider, createdAt: now });
            }
            for (let i = 0; i < 20; i++) {
                await createLog({ jobId, status: 'failed', providerUsed: provider, createdAt: now });
            }

            const result = await checkProviderHealth(provider, defaultConfig);
            expect(result.surgeDetected).toBe(true);
            expect(result.successRate).toBe(80);
            expect(result.errorCount).toBe(20);
        });

        it('returns surgeDetected:false with 100% success when no logs exist for provider', async () => {
            const result = await checkProviderHealth('nonexistent-provider', defaultConfig);
            expect(result.surgeDetected).toBe(false);
            expect(result.successRate).toBe(100);
            expect(result.errorCount).toBe(0);
        });
    });

    // ─── checkCostAnomaly ────────────────────────────────────────────────

    describe('checkCostAnomaly', () => {
        it('returns anomalyDetected:false when current spend is within normal range', async () => {
            const jobId = await createJob();
            const windowMs = defaultConfig.rollingWindowMinutes * 60 * 1000;

            // Preceding window: spend 100
            const precedingTime = new Date(Date.now() - windowMs - 1 * 60 * 1000);
            await createLog({ jobId, status: 'sent', costAmount: 100, createdAt: precedingTime });

            // Current window: spend 100 (100% of avg, below 200% threshold)
            const currentTime = new Date();
            await createLog({ jobId, status: 'sent', costAmount: 100, createdAt: currentTime });

            const result = await checkCostAnomaly(defaultConfig);
            expect(result.anomalyDetected).toBe(false);
        });

        it('returns anomalyDetected:true when current spend exceeds threshold vs rolling avg', async () => {
            const jobId = await createJob();
            const windowMs = defaultConfig.rollingWindowMinutes * 60 * 1000;

            // Preceding window: spend 50
            const precedingTime = new Date(Date.now() - windowMs - 1 * 60 * 1000);
            await createLog({ jobId, status: 'sent', costAmount: 50, createdAt: precedingTime });

            // Current window: spend 150 → 300% of avg, above 200% threshold
            const currentTime = new Date();
            await createLog({ jobId, status: 'sent', costAmount: 150, createdAt: currentTime });

            const result = await checkCostAnomaly(defaultConfig);
            expect(result.anomalyDetected).toBe(true);
        });

        it('returns anomalyDetected:false when no preceding spend exists', async () => {
            const jobId = await createJob();

            // Only current window spend, no preceding → can't detect anomaly
            await createLog({ jobId, status: 'sent', costAmount: 500, createdAt: new Date() });

            const result = await checkCostAnomaly(defaultConfig);
            expect(result.anomalyDetected).toBe(false);
            expect(result.rollingAvg).toBe(0);
        });
    });
});
