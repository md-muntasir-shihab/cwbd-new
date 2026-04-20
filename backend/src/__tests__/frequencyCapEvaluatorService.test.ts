import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationJob from '../models/NotificationJob';
import { evaluate, filterCapped } from '../services/frequencyCapEvaluatorService';
import { FrequencyCapConfig } from '../types/campaignSettings';

/**
 * Unit tests for FrequencyCapEvaluator service
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

let mongoServer: MongoMemoryServer;

const defaultConfig: FrequencyCapConfig = {
    dailyCap: 3,
    weeklyCap: 10,
    monthlyCap: 30,
    cooldownMinutes: 5,
};

const adminId = new mongoose.Types.ObjectId();

/** Helper: create a NotificationJob to satisfy the jobId FK on delivery logs */
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

/** Helper: insert N delivery logs for a user at a given time */
async function insertLogs(
    studentId: mongoose.Types.ObjectId,
    jobId: mongoose.Types.ObjectId,
    count: number,
    createdAt: Date,
): Promise<void> {
    const docs = Array.from({ length: count }, (_, i) => ({
        jobId,
        studentId,
        channel: 'sms' as const,
        providerUsed: 'test-provider',
        to: '+8801700000000',
        status: 'sent' as const,
        createdAt: new Date(createdAt.getTime() + i), // slight offset to avoid identical timestamps
    }));
    await NotificationDeliveryLog.insertMany(docs);
}

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

describe('FrequencyCapEvaluator Service', () => {
    // ─── 1. evaluate returns allowed:true when under all caps ────────────

    it('returns allowed:true when user is under all caps', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Insert 1 log today — well under dailyCap of 3
        await insertLogs(userId, jobId, 1, new Date(Date.now() - 60 * 60_000));

        const result = await evaluate(userId, defaultConfig, false);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    // ─── 2. evaluate returns daily_cap_exceeded ─────────────────────────

    it('returns allowed:false with reason daily_cap_exceeded when daily cap hit', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Insert exactly dailyCap (3) logs today
        await insertLogs(userId, jobId, 3, new Date(Date.now() - 30 * 60_000));

        const result = await evaluate(userId, defaultConfig, false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('daily_cap_exceeded');
    });

    // ─── 3. evaluate returns weekly_cap_exceeded ────────────────────────

    it('returns allowed:false with reason weekly_cap_exceeded when weekly cap hit', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Use a config where daily cap is high so we hit weekly first
        const config: FrequencyCapConfig = { dailyCap: 20, weeklyCap: 10, monthlyCap: 30, cooldownMinutes: 0 };

        // Insert 10 logs spread across the current week (but not all today)
        const twoDaysAgo = new Date();
        twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
        twoDaysAgo.setUTCHours(12, 0, 0, 0);
        await insertLogs(userId, jobId, 10, twoDaysAgo);

        const result = await evaluate(userId, config, false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('weekly_cap_exceeded');
    });

    // ─── 4. evaluate returns monthly_cap_exceeded ───────────────────────

    it('returns allowed:false with reason monthly_cap_exceeded when monthly cap hit', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Use a config where daily and weekly caps are high so we hit monthly first
        const config: FrequencyCapConfig = { dailyCap: 50, weeklyCap: 50, monthlyCap: 5, cooldownMinutes: 0 };

        // Insert 5 logs earlier this month
        const earlier = new Date();
        earlier.setUTCDate(Math.max(1, earlier.getUTCDate() - 2));
        earlier.setUTCHours(10, 0, 0, 0);
        await insertLogs(userId, jobId, 5, earlier);

        const result = await evaluate(userId, config, false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('monthly_cap_exceeded');
    });

    // ─── 5. evaluate returns cooldown deferral with deferUntil ──────────

    it('returns allowed:false with deferUntil when in cooldown window', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Insert 1 log 2 minutes ago — within the 5-minute cooldown
        const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
        await insertLogs(userId, jobId, 1, twoMinutesAgo);

        const result = await evaluate(userId, defaultConfig, false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('cooldown_active');
        expect(result.deferUntil).toBeInstanceOf(Date);
        // deferUntil should be ~3 minutes from now (5 min cooldown - 2 min elapsed)
        expect(result.deferUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    // ─── 6. evaluate returns allowed:true for critical alerts ───────────

    it('returns allowed:true when isCritical is true (bypasses all caps)', async () => {
        const userId = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // Exceed every cap
        await insertLogs(userId, jobId, 30, new Date(Date.now() - 60_000));

        const result = await evaluate(userId, defaultConfig, true);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    // ─── 7. filterCapped partitions users correctly ─────────────────────

    it('filterCapped partitions users into eligible/capped/deferred', async () => {
        const eligibleUser = new mongoose.Types.ObjectId();
        const cappedUser = new mongoose.Types.ObjectId();
        const deferredUser = new mongoose.Types.ObjectId();
        const jobId = await createJob();

        // eligibleUser: 0 logs — under all caps
        // cappedUser: 3 logs today — hits daily cap
        await insertLogs(cappedUser, jobId, 3, new Date(Date.now() - 30 * 60_000));
        // deferredUser: 1 log 1 minute ago — within cooldown, but under caps
        await insertLogs(deferredUser, jobId, 1, new Date(Date.now() - 60_000));

        const result = await filterCapped(
            [eligibleUser, cappedUser, deferredUser],
            defaultConfig,
            false,
        );

        const eligibleIds = result.eligible.map((id) => id.toString());
        const cappedIds = result.capped.map((id) => id.toString());
        const deferredIds = result.deferred.map((d) => d.userId.toString());

        expect(eligibleIds).toContain(eligibleUser.toString());
        expect(cappedIds).toContain(cappedUser.toString());
        expect(deferredIds).toContain(deferredUser.toString());

        // Verify deferred entry has a deferUntil date
        const deferredEntry = result.deferred.find(
            (d) => d.userId.toString() === deferredUser.toString(),
        );
        expect(deferredEntry).toBeDefined();
        expect(deferredEntry!.deferUntil).toBeInstanceOf(Date);
        expect(deferredEntry!.deferUntil.getTime()).toBeGreaterThan(Date.now());
    });
});
