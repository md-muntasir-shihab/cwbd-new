/**
 * Provider Router Service
 *
 * Routing engine that selects primary/secondary providers per channel,
 * manages optional channel fallback chains (e.g. SMS → Email), and
 * implements a circuit breaker with exponential retry backoff.
 *
 * Circuit breaker states (in-memory, keyed by provider ID string):
 *   - closed:    Normal operation — traffic flows to the provider.
 *   - open:      All traffic routed away after failure threshold exceeded.
 *   - half_open: After backoff interval, a single probe request is allowed
 *                to test provider health. Success → closed, failure → open.
 *
 * The actual send is abstracted behind `sendViaProvider()` so it can be
 * replaced / mocked in tests.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import mongoose from 'mongoose';
import NotificationProvider, { INotificationProvider } from '../models/NotificationProvider';
import { ProviderRoutingConfig } from '../types/campaignSettings';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SendPayload {
    to: string;
    channel: 'sms' | 'email';
    subject?: string;
    body: string;
    meta?: Record<string, unknown>;
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    providerId?: string;
    channel: 'sms' | 'email';
    attempts: number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerEntry {
    state: CircuitState;
    failures: number[];          // timestamps of failures within rolling window
    successes: number[];         // timestamps of successes within rolling window
    lastFailureAt: number;       // epoch ms of last failure (used for backoff)
    openedAt: number;            // epoch ms when circuit was opened
}

export interface ProviderHealthInfo {
    status: CircuitState;
    failureRate: number;
    avgLatencyMs: number;
}

// ─── In-Memory Circuit Breaker State ─────────────────────────────────────────

const circuitBreakers = new Map<string, CircuitBreakerEntry>();
const latencyRecords = new Map<string, number[]>(); // provider id → latency ms array

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateBreaker(providerId: string): CircuitBreakerEntry {
    let entry = circuitBreakers.get(providerId);
    if (!entry) {
        entry = {
            state: 'closed',
            failures: [],
            successes: [],
            lastFailureAt: 0,
            openedAt: 0,
        };
        circuitBreakers.set(providerId, entry);
    }
    return entry;
}

/**
 * Prune timestamps outside the rolling window.
 */
function pruneWindow(timestamps: number[], windowMs: number, now: number): number[] {
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t >= cutoff);
}

/**
 * Compute failure rate as a percentage (0-100) within the rolling window.
 */
function computeFailureRate(breaker: CircuitBreakerEntry, windowMs: number, now: number): number {
    const failures = pruneWindow(breaker.failures, windowMs, now);
    const successes = pruneWindow(breaker.successes, windowMs, now);
    const total = failures.length + successes.length;
    if (total === 0) return 0;
    return (failures.length / total) * 100;
}

/**
 * Record a success for a provider's circuit breaker.
 */
function recordSuccess(providerId: string, now: number): void {
    const breaker = getOrCreateBreaker(providerId);
    breaker.successes.push(now);

    if (breaker.state === 'half_open') {
        // Health check passed — close the circuit
        breaker.state = 'closed';
        breaker.failures = [];
        breaker.openedAt = 0;
    }
}

/**
 * Record a failure for a provider's circuit breaker.
 * If the failure rate exceeds the threshold, open the circuit.
 */
function recordFailure(
    providerId: string,
    config: ProviderRoutingConfig['circuitBreaker'],
    now: number,
): void {
    const breaker = getOrCreateBreaker(providerId);
    breaker.failures.push(now);
    breaker.lastFailureAt = now;

    if (breaker.state === 'half_open') {
        // Health check failed — re-open the circuit
        breaker.state = 'open';
        breaker.openedAt = now;
        return;
    }

    // Check if failure rate exceeds threshold within rolling window
    const rate = computeFailureRate(breaker, config.rollingWindowMs, now);
    if (rate >= config.failureThreshold) {
        breaker.state = 'open';
        breaker.openedAt = now;
    }
}

/**
 * Record latency for a provider (used in getProviderHealth).
 */
function recordLatency(providerId: string, latencyMs: number): void {
    let records = latencyRecords.get(providerId);
    if (!records) {
        records = [];
        latencyRecords.set(providerId, records);
    }
    records.push(latencyMs);
    // Keep only last 100 records to bound memory
    if (records.length > 100) {
        records.splice(0, records.length - 100);
    }
}

/**
 * Determine whether a provider's circuit allows traffic.
 * - closed → allow
 * - open → allow only if backoff interval has elapsed (transition to half_open)
 * - half_open → allow (single probe)
 */
function isProviderAvailable(
    providerId: string,
    config: ProviderRoutingConfig['circuitBreaker'],
    now: number,
): boolean {
    const breaker = getOrCreateBreaker(providerId);

    if (breaker.state === 'closed') return true;

    if (breaker.state === 'open') {
        // Check if backoff interval has elapsed → transition to half_open
        if (now - breaker.openedAt >= config.backoffIntervalMs) {
            breaker.state = 'half_open';
            return true;
        }
        return false;
    }

    // half_open — allow the single probe request
    return true;
}

// ─── Pluggable Send Function ─────────────────────────────────────────────────

/**
 * Default send implementation that delegates to the actual provider.
 * This is the function that gets called for each delivery attempt.
 * It can be replaced via `setSendFunction()` for testing.
 */
export type SendViaProviderFn = (
    provider: INotificationProvider,
    payload: SendPayload,
) => Promise<{ success: boolean; messageId?: string; error?: string }>;

let sendViaProviderFn: SendViaProviderFn = async (_provider, _payload) => {
    return { success: false, error: 'sendViaProvider not configured' };
};

/**
 * Replace the send function. Used for dependency injection / testing.
 */
export function setSendFunction(fn: SendViaProviderFn): void {
    sendViaProviderFn = fn;
}

// ─── Provider Lookup ─────────────────────────────────────────────────────────

async function fetchProvider(
    providerId: mongoose.Types.ObjectId | string,
): Promise<INotificationProvider | null> {
    const id = typeof providerId === 'string'
        ? new mongoose.Types.ObjectId(providerId)
        : providerId;
    return NotificationProvider.findOne({ _id: id, isEnabled: true })
        .select('+credentialsEncrypted')
        .lean<INotificationProvider>()
        .exec();
}

// ─── Retry with Exponential Backoff ──────────────────────────────────────────

/**
 * Sleep helper (returns a promise that resolves after `ms` milliseconds).
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to send via a single provider with exponential retry backoff.
 * Returns the result of the last attempt.
 * Req 8.6
 */
async function attemptWithRetry(
    provider: INotificationProvider,
    payload: SendPayload,
    retryConfig: ProviderRoutingConfig['retry'],
    cbConfig: ProviderRoutingConfig['circuitBreaker'],
): Promise<{ success: boolean; messageId?: string; error?: string; attempts: number }> {
    const providerId = (provider._id as mongoose.Types.ObjectId).toString();
    let lastError: string | undefined;

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
        if (attempt > 0) {
            // Exponential backoff: baseDelay * 2^(attempt-1)
            const delay = retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
            await sleep(delay);
        }

        const start = Date.now();
        try {
            const result = await sendViaProviderFn(provider, payload);
            const latency = Date.now() - start;
            recordLatency(providerId, latency);

            if (result.success) {
                recordSuccess(providerId, Date.now());
                return { success: true, messageId: result.messageId, attempts: attempt + 1 };
            }

            lastError = result.error;
            recordFailure(providerId, cbConfig, Date.now());
        } catch (err: unknown) {
            const latency = Date.now() - start;
            recordLatency(providerId, latency);
            lastError = err instanceof Error ? err.message : String(err);
            recordFailure(providerId, cbConfig, Date.now());
        }
    }

    return { success: false, error: lastError, attempts: retryConfig.maxAttempts };
}

// ─── Core Routing Logic ──────────────────────────────────────────────────────

/**
 * Try to send via a specific provider (by ID). Checks circuit breaker
 * availability first, then attempts with retry backoff.
 */
async function tryProvider(
    providerId: mongoose.Types.ObjectId | string,
    payload: SendPayload,
    config: ProviderRoutingConfig,
): Promise<SendResult | null> {
    const idStr = providerId.toString();
    const now = Date.now();

    // Check circuit breaker
    if (!isProviderAvailable(idStr, config.circuitBreaker, now)) {
        return null; // Circuit is open — skip this provider
    }

    const provider = await fetchProvider(providerId);
    if (!provider) {
        return null; // Provider not found or disabled
    }

    const result = await attemptWithRetry(
        provider,
        payload,
        config.retry,
        config.circuitBreaker,
    );

    return {
        ...result,
        providerId: idStr,
        channel: payload.channel,
    };
}

/**
 * Route a message through the configured provider chain for a channel.
 *
 * Order of attempts:
 *   1. Primary provider for the channel (with retry backoff)
 *   2. Secondary provider for the channel (with retry backoff) — Req 8.2
 *   3. Channel fallback (e.g. SMS → Email) primary → secondary — Req 8.3
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export async function route(
    channel: 'sms' | 'email',
    payload: SendPayload,
    config: ProviderRoutingConfig,
): Promise<SendResult> {
    const channelConfig = config[channel];
    let totalAttempts = 0;

    // 1. Try primary provider — Req 8.1
    const primaryResult = await tryProvider(channelConfig.primary, payload, config);
    if (primaryResult) {
        totalAttempts += primaryResult.attempts;
        if (primaryResult.success) return primaryResult;
    }

    // 2. Try secondary provider — Req 8.2
    if (channelConfig.secondary) {
        const secondaryResult = await tryProvider(channelConfig.secondary, payload, config);
        if (secondaryResult) {
            totalAttempts += secondaryResult.attempts;
            if (secondaryResult.success) return secondaryResult;
        }
    }

    // 3. Try channel fallback chain — Req 8.3
    const fallbackChannel = config.channelFallback?.[channel];
    if (fallbackChannel) {
        const fallbackConfig = config[fallbackChannel];
        const fallbackPayload: SendPayload = { ...payload, channel: fallbackChannel };

        // Try fallback primary
        const fbPrimaryResult = await tryProvider(
            fallbackConfig.primary,
            fallbackPayload,
            config,
        );
        if (fbPrimaryResult) {
            totalAttempts += fbPrimaryResult.attempts;
            if (fbPrimaryResult.success) {
                return { ...fbPrimaryResult, channel: fallbackChannel };
            }
        }

        // Try fallback secondary
        if (fallbackConfig.secondary) {
            const fbSecondaryResult = await tryProvider(
                fallbackConfig.secondary,
                fallbackPayload,
                config,
            );
            if (fbSecondaryResult) {
                totalAttempts += fbSecondaryResult.attempts;
                if (fbSecondaryResult.success) {
                    return { ...fbSecondaryResult, channel: fallbackChannel };
                }
            }
        }
    }

    // All providers exhausted
    return {
        success: false,
        error: 'All providers and fallback channels exhausted',
        channel,
        attempts: totalAttempts || 0,
    };
}

// ─── Provider Health ─────────────────────────────────────────────────────────

/**
 * Get the health status of a specific provider.
 * Returns circuit breaker state, failure rate, and average latency.
 * Req 8.4, 8.5
 */
export function getProviderHealth(
    providerId: mongoose.Types.ObjectId | string,
    config: ProviderRoutingConfig,
): ProviderHealthInfo {
    const idStr = providerId.toString();
    const breaker = getOrCreateBreaker(idStr);
    const now = Date.now();

    const failureRate = computeFailureRate(
        breaker,
        config.circuitBreaker.rollingWindowMs,
        now,
    );

    const latencies = latencyRecords.get(idStr) ?? [];
    const avgLatencyMs =
        latencies.length > 0
            ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
            : 0;

    return {
        status: breaker.state,
        failureRate,
        avgLatencyMs,
    };
}

// ─── Test Utilities ──────────────────────────────────────────────────────────

/**
 * Reset all circuit breaker state and latency records.
 * Only intended for use in tests.
 */
export function _resetState(): void {
    circuitBreakers.clear();
    latencyRecords.clear();
}

/**
 * Get the raw circuit breaker entry for a provider (test inspection).
 */
export function _getBreaker(providerId: string): CircuitBreakerEntry | undefined {
    return circuitBreakers.get(providerId);
}
