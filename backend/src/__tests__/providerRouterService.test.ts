import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationProvider from '../models/NotificationProvider';
import {
    route,
    getProviderHealth,
    setSendFunction,
    _resetState,
    _getBreaker,
    SendPayload,
} from '../services/providerRouterService';
import { ProviderRoutingConfig } from '../types/campaignSettings';

/**
 * Unit tests for ProviderRouter service
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

let mongoServer: MongoMemoryServer;

let smsPrimaryId: mongoose.Types.ObjectId;
let smsSecondaryId: mongoose.Types.ObjectId;
let emailPrimaryId: mongoose.Types.ObjectId;
let emailSecondaryId: mongoose.Types.ObjectId;

function makeConfig(overrides?: Partial<ProviderRoutingConfig>): ProviderRoutingConfig {
    return {
        sms: { primary: smsPrimaryId, secondary: smsSecondaryId },
        email: { primary: emailPrimaryId, secondary: emailSecondaryId },
        channelFallback: { sms: 'email' },
        circuitBreaker: {
            failureThreshold: 50,
            rollingWindowMs: 60_000,
            backoffIntervalMs: 30_000,
        },
        retry: {
            baseDelayMs: 1,   // 1ms for fast tests
            maxAttempts: 2,
        },
        ...overrides,
    };
}

const smsPayload: SendPayload = {
    to: '+8801700000000',
    channel: 'sms',
    body: 'Test message',
};

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create test providers
    const smsPrimary = await NotificationProvider.create({
        type: 'sms',
        provider: 'twilio',
        displayName: 'SMS Primary',
        isEnabled: true,
        credentialsEncrypted: 'dummy-encrypted-creds',
    });
    smsPrimaryId = smsPrimary._id as mongoose.Types.ObjectId;

    const smsSecondary = await NotificationProvider.create({
        type: 'sms',
        provider: 'local_bd_rest',
        displayName: 'SMS Secondary',
        isEnabled: true,
        credentialsEncrypted: 'dummy-encrypted-creds',
    });
    smsSecondaryId = smsSecondary._id as mongoose.Types.ObjectId;

    const emailPrimary = await NotificationProvider.create({
        type: 'email',
        provider: 'sendgrid',
        displayName: 'Email Primary',
        isEnabled: true,
        credentialsEncrypted: 'dummy-encrypted-creds',
    });
    emailPrimaryId = emailPrimary._id as mongoose.Types.ObjectId;

    const emailSecondary = await NotificationProvider.create({
        type: 'email',
        provider: 'smtp',
        displayName: 'Email Secondary',
        isEnabled: true,
        credentialsEncrypted: 'dummy-encrypted-creds',
    });
    emailSecondaryId = emailSecondary._id as mongoose.Types.ObjectId;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(() => {
    _resetState();
    // Default: all sends succeed
    setSendFunction(async () => ({ success: true, messageId: 'msg-ok' }));
});

describe('ProviderRouter Service', () => {
    // ─── 1. route() succeeds via primary provider (Req 8.1) ─────────────

    it('route() succeeds via primary provider', async () => {
        const config = makeConfig();
        const result = await route('sms', smsPayload, config);

        expect(result.success).toBe(true);
        expect(result.providerId).toBe(smsPrimaryId.toString());
        expect(result.channel).toBe('sms');
        expect(result.messageId).toBe('msg-ok');
    });

    // ─── 2. route() fails over to secondary when primary fails (Req 8.2) ──

    it('route() fails over to secondary when primary fails', async () => {
        let callCount = 0;
        setSendFunction(async (provider) => {
            callCount++;
            const id = (provider._id as mongoose.Types.ObjectId).toString();
            if (id === smsPrimaryId.toString()) {
                return { success: false, error: 'primary down' };
            }
            return { success: true, messageId: 'msg-secondary' };
        });

        const config = makeConfig();
        const result = await route('sms', smsPayload, config);

        expect(result.success).toBe(true);
        expect(result.providerId).toBe(smsSecondaryId.toString());
        expect(result.messageId).toBe('msg-secondary');
        // Primary was attempted (maxAttempts=2) + secondary succeeded on first try
        expect(callCount).toBeGreaterThanOrEqual(3);
    });

    // ─── 3. route() uses channel fallback when both primary and secondary fail (Req 8.3) ──

    it('route() uses channel fallback when both SMS providers fail', async () => {
        setSendFunction(async (provider) => {
            const id = (provider._id as mongoose.Types.ObjectId).toString();
            // Both SMS providers fail, email primary succeeds
            if (id === smsPrimaryId.toString() || id === smsSecondaryId.toString()) {
                return { success: false, error: 'sms provider down' };
            }
            return { success: true, messageId: 'msg-email-fallback' };
        });

        const config = makeConfig();
        const result = await route('sms', smsPayload, config);

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg-email-fallback');
        expect(result.channel).toBe('email'); // fell back to email
        expect(result.providerId).toBe(emailPrimaryId.toString());
    });

    // ─── 4. route() returns failure when all providers exhausted (Req 8.1, 8.2, 8.3) ──

    it('route() returns failure when all providers exhausted', async () => {
        setSendFunction(async () => ({ success: false, error: 'all down' }));

        const config = makeConfig();
        const result = await route('sms', smsPayload, config);

        expect(result.success).toBe(false);
        expect(result.error).toContain('exhausted');
        expect(result.attempts).toBeGreaterThan(0);
    });

    // ─── 5. Circuit breaker opens after failure threshold exceeded (Req 8.4) ──

    it('circuit breaker opens after failure threshold exceeded', async () => {
        // Make all sends fail to push failure rate above threshold
        setSendFunction(async () => ({ success: false, error: 'fail' }));

        const config = makeConfig({
            // No secondary, no fallback — isolate circuit breaker behavior
            sms: { primary: smsPrimaryId },
            channelFallback: undefined,
            circuitBreaker: {
                failureThreshold: 50,
                rollingWindowMs: 60_000,
                backoffIntervalMs: 30_000,
            },
            retry: { baseDelayMs: 1, maxAttempts: 3 },
        });

        // First route: all retries fail, circuit breaker should open
        await route('sms', smsPayload, config);

        const breaker = _getBreaker(smsPrimaryId.toString());
        expect(breaker).toBeDefined();
        expect(breaker!.state).toBe('open');
    });

    // ─── 6. Circuit breaker transitions to half_open after backoff interval (Req 8.5) ──

    it('circuit breaker transitions to half_open after backoff interval', async () => {
        const providerId = smsPrimaryId.toString();

        // Force the circuit open by recording failures
        setSendFunction(async () => ({ success: false, error: 'fail' }));

        const config = makeConfig({
            sms: { primary: smsPrimaryId },
            channelFallback: undefined,
            circuitBreaker: {
                failureThreshold: 50,
                rollingWindowMs: 60_000,
                backoffIntervalMs: 50, // 50ms for fast test
            },
            retry: { baseDelayMs: 1, maxAttempts: 2 },
        });

        // Drive failures to open the circuit
        await route('sms', smsPayload, config);

        const breakerAfterOpen = _getBreaker(providerId);
        expect(breakerAfterOpen!.state).toBe('open');

        // Wait for backoff interval to elapse
        await new Promise((resolve) => setTimeout(resolve, 80));

        // Now make the send succeed — the circuit should transition to half_open then closed
        setSendFunction(async () => ({ success: true, messageId: 'msg-recovered' }));

        const result = await route('sms', smsPayload, config);

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg-recovered');

        // After successful probe, circuit should be closed
        const breakerAfterProbe = _getBreaker(providerId);
        expect(breakerAfterProbe!.state).toBe('closed');
    });

    // ─── 7. getProviderHealth() returns correct status and failure rate (Req 8.4, 8.5) ──

    it('getProviderHealth() returns correct status and failure rate', async () => {
        const config = makeConfig();

        // Fresh provider — should be closed with 0% failure rate
        const healthBefore = getProviderHealth(smsPrimaryId, config);
        expect(healthBefore.status).toBe('closed');
        expect(healthBefore.failureRate).toBe(0);
        expect(healthBefore.avgLatencyMs).toBe(0);

        // Route a successful message to record latency
        setSendFunction(async () => ({ success: true, messageId: 'msg-ok' }));
        await route('sms', smsPayload, config);

        const healthAfterSuccess = getProviderHealth(smsPrimaryId, config);
        expect(healthAfterSuccess.status).toBe('closed');
        expect(healthAfterSuccess.failureRate).toBe(0);
        expect(healthAfterSuccess.avgLatencyMs).toBeGreaterThanOrEqual(0);

        // Reset and drive failures
        _resetState();
        setSendFunction(async () => ({ success: false, error: 'fail' }));

        const failConfig = makeConfig({
            sms: { primary: smsPrimaryId },
            channelFallback: undefined,
            retry: { baseDelayMs: 1, maxAttempts: 2 },
        });
        await route('sms', smsPayload, failConfig);

        const healthAfterFailure = getProviderHealth(smsPrimaryId, failConfig);
        expect(healthAfterFailure.failureRate).toBe(100);
        expect(healthAfterFailure.status).toBe('open');
    });
});
