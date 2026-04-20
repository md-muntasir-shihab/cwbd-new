import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationSettings from '../models/NotificationSettings';
import ConsentRecord from '../models/ConsentRecord';
import NotificationProvider from '../models/NotificationProvider';
import IdempotencyKey from '../models/IdempotencyKey';
import { settingsCacheService } from '../services/settingsCacheService';
import { setSendFunction, _resetState } from '../services/providerRouterService';
import { processSend, simulate } from '../services/campaignEngineService';
import type { CampaignSendRequest } from '../services/campaignEngineService';

/**
 * Unit tests for Campaign Engine orchestrator service
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 19.5
 */

let mongoServer: MongoMemoryServer;
let smsProviderId: mongoose.Types.ObjectId;

const userId1 = new mongoose.Types.ObjectId();
const userId2 = new mongoose.Types.ObjectId();
const actorId = new mongoose.Types.ObjectId();
const campaignId = new mongoose.Types.ObjectId();

function makeRequest(overrides?: Partial<CampaignSendRequest>): CampaignSendRequest {
    return {
        campaignId,
        recipients: [
            { userId: userId1, contactIdentifier: '+8801700000001' },
            { userId: userId2, contactIdentifier: '+8801700000002' },
        ],
        channel: 'sms',
        content: { body: 'Hello from CampusWay' },
        campaignType: 'general',
        isCritical: false,
        estimatedCost: 10,
        segmentIds: [],
        scheduledAt: new Date(),
        ...overrides,
    };
}

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create an SMS provider for the provider router
    const provider = await NotificationProvider.create({
        type: 'sms',
        provider: 'twilio',
        displayName: 'SMS Primary',
        isEnabled: true,
        credentialsEncrypted: 'dummy-encrypted-creds',
    });
    smsProviderId = provider._id as mongoose.Types.ObjectId;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clean collections
    await NotificationSettings.deleteMany({});
    await ConsentRecord.deleteMany({});
    await IdempotencyKey.deleteMany({});

    // Reset provider router circuit breaker state
    _resetState();

    // Invalidate settings cache so each test gets fresh settings
    settingsCacheService.invalidate();

    // Mock the send function to succeed
    setSendFunction(async () => ({ success: true, messageId: 'msg-ok' }));

    // Create default NotificationSettings with the SMS provider configured
    await NotificationSettings.create({
        dailySmsLimit: 500,
        dailyEmailLimit: 2000,
        monthlySmsBudgetBDT: 5000,
        monthlyEmailBudgetBDT: 1000,
        schemaVersion: 2,
        providerRouting: {
            sms: { primary: smsProviderId },
            email: { primary: smsProviderId },
            circuitBreaker: {
                failureThreshold: 50,
                rollingWindowMs: 60_000,
                backoffIntervalMs: 30_000,
            },
            retry: {
                baseDelayMs: 1,
                maxAttempts: 1,
            },
        },
    });
});

describe('Campaign Engine Orchestrator', () => {
    // ─── 1. processSend returns sent > 0 when all policies pass ─────────

    it('processSend returns sent > 0 when all policies pass', async () => {
        // Set up consent records — both users opted in for sms/promotional
        await ConsentRecord.create([
            {
                userId: userId1,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
            {
                userId: userId2,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
        ]);

        const result = await processSend(makeRequest());

        expect(result.sent).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);

        // Verify pipeline ran through all policies
        const policyNames = result.policyResults.map((p) => p.policy);
        expect(policyNames).toContain('idempotency');
        expect(policyNames).toContain('consent');
        expect(policyNames).toContain('suppression');
        expect(policyNames).toContain('frequency_cap');
        expect(policyNames).toContain('budget');
        expect(policyNames).toContain('content_lint');
        expect(policyNames).toContain('provider_routing');
    });

    // ─── 2. processSend short-circuits when all recipients lack consent ──

    it('processSend short-circuits when all recipients lack consent', async () => {
        // Set up consent records — both users opted OUT
        await ConsentRecord.create([
            {
                userId: userId1,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: false,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
            {
                userId: userId2,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: false,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
        ]);

        const result = await processSend(makeRequest());

        expect(result.sent).toBe(0);
        expect(result.blocked).toBe(2);

        // Should have a consent block policy result
        const consentBlock = result.policyResults.find(
            (p) => p.policy === 'consent' && p.status === 'block',
        );
        expect(consentBlock).toBeDefined();
        expect(consentBlock!.reason).toContain('No recipients with valid consent');

        // Pipeline should NOT have reached provider_routing (short-circuited)
        const routingResult = result.policyResults.find(
            (p) => p.policy === 'provider_routing',
        );
        expect(routingResult).toBeUndefined();
    });

    // ─── 3. simulate returns structured decision path with all policy results ──

    it('simulate returns structured decision path with all policy results', async () => {
        // Set up consent — both users opted in
        await ConsentRecord.create([
            {
                userId: userId1,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
            {
                userId: userId2,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
        ]);

        const simResult = await simulate(makeRequest());

        // Should include all policy evaluations in the decision path
        const policyNames = simResult.policyResults.map((p) => p.policy);
        expect(policyNames).toContain('consent');
        expect(policyNames).toContain('suppression');
        expect(policyNames).toContain('frequency_cap');
        expect(policyNames).toContain('budget');
        expect(policyNames).toContain('content_lint');
        expect(policyNames).toContain('send_time');
        expect(policyNames).toContain('approval');
        expect(policyNames).toContain('provider_routing');

        // Structured result fields (Req 15.2, 15.3)
        expect(simResult.eligible).toBeGreaterThan(0);
        expect(simResult.estimatedCost).toBe(10);
        expect(typeof simResult.selectedProviderRoute).toBe('string');
        expect(simResult.blocked).toBe(false);
    });

    // ─── 4. simulate indicates blocking policy when budget is exceeded ───

    it('simulate indicates blocking policy when budget is exceeded', async () => {
        // Set up consent — both users opted in
        await ConsentRecord.create([
            {
                userId: userId1,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
            {
                userId: userId2,
                channel: 'sms',
                purpose: 'promotional',
                optedIn: true,
                changedAt: new Date(),
                source: 'user',
                actorId,
            },
        ]);

        // Request with cost exceeding the monthly budget (5000 BDT)
        const simResult = await simulate(
            makeRequest({ estimatedCost: 6000 }),
        );

        // Should be blocked by budget policy (Req 15.4)
        expect(simResult.blocked).toBe(true);
        expect(simResult.blockingPolicy).toBe('budget');
        expect(simResult.blockingReason).toBeDefined();
        expect(simResult.blockingReason!.length).toBeGreaterThan(0);

        // Budget policy result should show block status
        const budgetResult = simResult.policyResults.find(
            (p) => p.policy === 'budget',
        );
        expect(budgetResult).toBeDefined();
        expect(budgetResult!.status).toBe('block');
    });
});
