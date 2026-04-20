import { describe, it, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
    _consumeForTesting as consume,
    _bucketsForTesting as buckets,
} from '../middlewares/securityRateLimit';

/**
 * Property 10: Rate Limiter Bucket Consistency
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7
 *
 * For any rate limit configuration (max, windowMs) and any sequence of consume calls,
 * bucket count never exceeds max, and after window reset the next consume starts count from 1.
 */
describe('Property 10: Rate Limiter Bucket Consistency', () => {
    beforeEach(() => {
        buckets.clear();
    });

    it('bucket count never exceeds max after any number of consume calls', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 200 }),
                fc.integer({ min: 1, max: 50 }),
                (callCount, max) => {
                    buckets.clear();
                    const key = `prop-test-${callCount}-${max}`;
                    const windowMs = 60_000; // 1 minute window (won't expire during test)

                    for (let i = 0; i < callCount; i++) {
                        consume(key, max, windowMs);
                    }

                    const bucket = buckets.get(key);
                    if (!bucket) return false; // bucket must exist after at least 1 call
                    return bucket.count <= max;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('after window reset, next consume starts count from 1', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 200 }),
                fc.integer({ min: 1, max: 50 }),
                (callCount, max) => {
                    buckets.clear();
                    const key = `prop-reset-${callCount}-${max}`;
                    const windowMs = 1; // 1ms window — will expire almost immediately

                    // Fill the bucket
                    for (let i = 0; i < callCount; i++) {
                        consume(key, max, windowMs);
                    }

                    // Force the bucket's resetAt into the past to simulate window expiry
                    const bucket = buckets.get(key);
                    if (bucket) {
                        bucket.resetAt = Date.now() - 1;
                    }

                    // Next consume after window reset should start count from 1
                    consume(key, max, windowMs);
                    const resetBucket = buckets.get(key);
                    if (!resetBucket) return false;
                    return resetBucket.count === 1;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('consume returns allowed=false only when count reaches max', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),
                (max) => {
                    buckets.clear();
                    const key = `prop-allowed-${max}`;
                    const windowMs = 60_000;

                    // First max calls should all be allowed
                    for (let i = 0; i < max; i++) {
                        const result = consume(key, max, windowMs);
                        if (!result.allowed) return false;
                    }

                    // The (max+1)th call should be rejected
                    const rejected = consume(key, max, windowMs);
                    return rejected.allowed === false;
                },
            ),
            { numRuns: 20 },
        );
    });
});
