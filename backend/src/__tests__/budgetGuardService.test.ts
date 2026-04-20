import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationJob from '../models/NotificationJob';
import { evaluate, getCurrentSpend } from '../services/budgetGuardService';
import { BudgetGuardrailConfig } from '../types/campaignSettings';

/**
 * Unit tests for BudgetGuard service
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

let mongoServer: MongoMemoryServer;

const adminId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

const defaultConfig: BudgetGuardrailConfig = {
    softLimitPercent: 80,
    hardLimitEnabled: true,
    anomalySpikeThresholdPercent: 200,
};

const MONTHLY_BUDGET = 10000;

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
async function createJob(): Promise<mongoose.Types.ObjectId> {
    const job = await NotificationJob.create({
        type: 'bulk',
        channel: 'sms',
        target: 'single',
        templateKey: 'TEST',
        createdByAdminId: adminId,
    });
    return job._id as mongoose.Types.ObjectId;
}

/** Helper: create a delivery log with a given cost and date */
async function createLog(
    jobId: mongoose.Types.ObjectId,
    costAmount: number,
    createdAt: Date,
    channel: 'sms' | 'email' = 'sms',
): Promise<void> {
    await NotificationDeliveryLog.create({
        jobId,
        studentId,
        channel,
        providerUsed: 'test-provider',
        to: '+8801700000000',
        status: 'sent',
        costAmount,
        createdAt,
    });
}

describe('BudgetGuard Service', () => {
    // ─── getCurrentSpend ─────────────────────────────────────────────────

    describe('getCurrentSpend', () => {
        it('returns 0 when no delivery logs exist', async () => {
            const spend = await getCurrentSpend('sms');
            expect(spend).toBe(0);
        });

        it('aggregates costAmount for current month sent logs', async () => {
            const jobId = await createJob();
            const now = new Date();

            await createLog(jobId, 100, now);
            await createLog(jobId, 250, now);
            await createLog(jobId, 50, now);

            const spend = await getCurrentSpend('sms');
            expect(spend).toBe(400);
        });

        it('excludes logs from previous months', async () => {
            const jobId = await createJob();
            const now = new Date();
            const lastMonth = new Date(now);
            lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);

            await createLog(jobId, 500, lastMonth);
            await createLog(jobId, 200, now);

            const spend = await getCurrentSpend('sms');
            expect(spend).toBe(200);
        });

        it('excludes logs with non-sent status', async () => {
            const jobId = await createJob();
            const now = new Date();

            await createLog(jobId, 100, now);
            // Create a failed log directly
            await NotificationDeliveryLog.create({
                jobId,
                studentId,
                channel: 'sms',
                providerUsed: 'test-provider',
                to: '+8801700000000',
                status: 'failed',
                costAmount: 999,
                createdAt: now,
            });

            const spend = await getCurrentSpend('sms');
            expect(spend).toBe(100);
        });

        it('only aggregates for the requested channel', async () => {
            const jobId = await createJob();
            const now = new Date();

            await createLog(jobId, 100, now, 'sms');
            await createLog(jobId, 300, now, 'email');

            const smsSpend = await getCurrentSpend('sms');
            const emailSpend = await getCurrentSpend('email');
            expect(smsSpend).toBe(100);
            expect(emailSpend).toBe(300);
        });
    });

    // ─── evaluate ────────────────────────────────────────────────────────

    describe('evaluate', () => {
        it('returns ok when projected total is under soft limit', async () => {
            // No existing spend, projecting 1000 on a 10000 budget → 10%, well under 80% soft limit
            const result = await evaluate(1000, 'sms', MONTHLY_BUDGET, defaultConfig);
            expect(result.status).toBe('ok');
            expect(result.remainingBudget).toBe(9000);
        });

        it('returns warn when projected total exceeds soft limit but not hard limit', async () => {
            const jobId = await createJob();
            const now = new Date();

            // Existing spend: 7500
            await createLog(jobId, 7500, now);

            // Projected cost: 600 → total = 8100, which is 81% of 10000 → exceeds 80% soft limit
            const result = await evaluate(600, 'sms', MONTHLY_BUDGET, defaultConfig);
            expect(result.status).toBe('warn');
            expect(result.remainingBudget).toBe(1900);
            expect(result.message).toContain('warning');
        });

        it('returns block when projected total exceeds monthly budget (hard limit)', async () => {
            const jobId = await createJob();
            const now = new Date();

            // Existing spend: 9500
            await createLog(jobId, 9500, now);

            // Projected cost: 600 → total = 10100, exceeds 10000 budget
            const result = await evaluate(600, 'sms', MONTHLY_BUDGET, defaultConfig);
            expect(result.status).toBe('block');
            expect(result.remainingBudget).toBe(500);
            expect(result.message).toContain('blocked');
        });

        it('returns ok when hard limit is disabled and projected total exceeds budget', async () => {
            const jobId = await createJob();
            const now = new Date();

            // Existing spend: 9500
            await createLog(jobId, 9500, now);

            const configNoHardLimit: BudgetGuardrailConfig = {
                ...defaultConfig,
                hardLimitEnabled: false,
            };

            // Projected cost: 600 → total = 10100, exceeds budget but hard limit disabled
            // Should still warn (exceeds soft limit) but NOT block
            const result = await evaluate(600, 'sms', MONTHLY_BUDGET, configNoHardLimit);
            expect(result.status).not.toBe('block');
            // It should be 'warn' since 10100/10000 = 101% which exceeds 80% soft limit
            expect(result.status).toBe('warn');
        });
    });
});
