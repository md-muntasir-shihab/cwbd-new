/**
 * Unified rate-limiting service.
 *
 * Redis-backed (via CacheService / Upstash) when available; falls back to an
 * in-memory Map with a console warning.  Supports per-user (authenticated) and
 * per-IP identifiers, configurable per-route group limits, and sets standard
 * X-RateLimit-* response headers.
 *
 * Route-group presets:
 *   auth   – 20 requests / 15 min
 *   admin  – 100 requests / 15 min
 *   public – 500 requests / 15 min
 *   upload – 10 requests / 1 min
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { Request, Response, NextFunction } from 'express';
import * as cacheService from './cacheService';
import { AppError, ErrorCode } from '../utils/appError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
    /** Window length in milliseconds */
    windowMs: number;
    /** Maximum requests allowed within the window */
    maxRequests: number;
    /** Derive the rate-limit key from the request (user ID or IP) */
    keyGenerator: (req: Request) => string;
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: Date;
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------

interface MemoryEntry {
    count: number;
    resetAt: number; // epoch ms
}

const memoryStore = new Map<string, MemoryEntry>();
let memoryFallbackWarned = false;
let lastFallbackLogTime = 0;
const FALLBACK_LOG_THROTTLE_MS = 60_000;

/** Periodic cleanup of expired in-memory entries (every 60 s) */
const CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of memoryStore) {
            if (entry.resetAt <= now) memoryStore.delete(key);
        }
    }, CLEANUP_INTERVAL_MS);
    // Allow Node to exit even if the timer is still running
    if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
        cleanupTimer.unref();
    }
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const RL_PREFIX = process.env.CACHE_PREFIX ?? 'cw:';
const RL_NAMESPACE = 'rl:';

function redisKey(scope: string, identifier: string): string {
    return `${RL_PREFIX}${RL_NAMESPACE}${scope}:${identifier}`;
}

// ---------------------------------------------------------------------------
// Core check logic
// ---------------------------------------------------------------------------

async function checkRedis(
    key: string,
    config: RateLimitConfig,
): Promise<RateLimitResult | null> {
    try {
        const raw = await cacheService.get<{ count: number; resetAt: number }>(key);
        const now = Date.now();

        if (raw && raw.resetAt > now) {
            // Existing window
            const newCount = raw.count + 1;
            const remaining = Math.max(0, config.maxRequests - newCount);
            const ttlSeconds = Math.ceil((raw.resetAt - now) / 1000);
            await cacheService.set(key, { count: newCount, resetAt: raw.resetAt }, ttlSeconds);
            return {
                allowed: newCount <= config.maxRequests,
                limit: config.maxRequests,
                remaining,
                resetAt: new Date(raw.resetAt),
            };
        }

        // New window
        const resetAt = now + config.windowMs;
        const ttlSeconds = Math.ceil(config.windowMs / 1000);
        await cacheService.set(key, { count: 1, resetAt }, ttlSeconds);
        return {
            allowed: true,
            limit: config.maxRequests,
            remaining: config.maxRequests - 1,
            resetAt: new Date(resetAt),
        };
    } catch {
        // Redis unavailable — signal caller to use memory fallback
        return null;
    }
}

function checkMemory(key: string, config: RateLimitConfig): RateLimitResult {
    ensureCleanupTimer();

    // Log on every request, throttled to once per 60s (Bug 1.29)
    const now = Date.now();
    if (now - lastFallbackLogTime >= FALLBACK_LOG_THROTTLE_MS) {
        console.warn(
            '[RateLimitService] Redis unavailable — falling back to in-memory rate limiting (conservative mode)',
        );
        lastFallbackLogTime = now;
    }

    // Reduce maxRequests by 50% in fallback mode (Bug 1.29)
    const effectiveMax = Math.ceil(config.maxRequests * 0.5);

    const entry = memoryStore.get(key);

    if (entry && entry.resetAt > now) {
        entry.count += 1;
        const remaining = Math.max(0, effectiveMax - entry.count);
        return {
            allowed: entry.count <= effectiveMax,
            limit: effectiveMax,
            remaining,
            resetAt: new Date(entry.resetAt),
        };
    }

    // New window
    const resetAt = now + config.windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return {
        allowed: true,
        limit: effectiveMax,
        remaining: effectiveMax - 1,
        resetAt: new Date(resetAt),
    };
}

// ---------------------------------------------------------------------------
// Public API — RateLimitService
// ---------------------------------------------------------------------------

export class RateLimitService {
    /**
     * Check (and consume) a rate-limit token for the given key + config.
     * Tries Redis first; falls back to in-memory on failure.
     */
    async check(key: string, config: RateLimitConfig): Promise<RateLimitResult & { isFallback?: boolean }> {
        const redisResult = await checkRedis(key, config);
        if (redisResult) return { ...redisResult, isFallback: false };
        return { ...checkMemory(key, config), isFallback: true };
    }
}

// Singleton for convenience
export const rateLimitService = new RateLimitService();

// ---------------------------------------------------------------------------
// Route-group presets
// ---------------------------------------------------------------------------

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

export type RouteGroup = 'auth' | 'admin' | 'public' | 'upload';

export const ROUTE_GROUP_CONFIGS: Record<RouteGroup, Omit<RateLimitConfig, 'keyGenerator'>> = {
    auth: { windowMs: FIFTEEN_MINUTES, maxRequests: 20 },
    admin: { windowMs: FIFTEEN_MINUTES, maxRequests: 100 },
    public: { windowMs: FIFTEEN_MINUTES, maxRequests: 500 },
    upload: { windowMs: ONE_MINUTE, maxRequests: 10 },
};

// ---------------------------------------------------------------------------
// Default key generator — user ID when authenticated, else IP
// ---------------------------------------------------------------------------

export function defaultKeyGenerator(req: Request): string {
    const user = (req as any).user;
    if (user && (user._id || user.id)) {
        return `user:${user._id ?? user.id}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
        (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
        req.ip ??
        req.socket?.remoteAddress ??
        'unknown';
    return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Express middleware factory
// ---------------------------------------------------------------------------

/**
 * Create an Express middleware that enforces rate limiting for a route group.
 *
 * Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
 * on every response. Returns 429 when the limit is exceeded.
 */
export function rateLimitMiddleware(
    group: RouteGroup,
    keyGenerator: (req: Request) => string = defaultKeyGenerator,
) {
    const groupConfig = ROUTE_GROUP_CONFIGS[group];

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const identifier = keyGenerator(req);
            const key = redisKey(group, identifier);

            const result = await rateLimitService.check(key, {
                ...groupConfig,
                keyGenerator,
            });

            // Always set rate-limit headers
            res.setHeader('X-RateLimit-Limit', result.limit);
            res.setHeader('X-RateLimit-Remaining', result.remaining);
            res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

            // Set fallback header when using in-memory rate limiting (Bug 1.29)
            if (result.isFallback) {
                res.setHeader('X-RateLimit-Fallback', 'memory');
            }

            if (!result.allowed) {
                const retryAfterSec = Math.ceil(
                    (result.resetAt.getTime() - Date.now()) / 1000,
                );
                res.setHeader('Retry-After', Math.max(1, retryAfterSec));
                next(
                    new AppError(
                        429,
                        ErrorCode.RATE_LIMIT_EXCEEDED,
                        'Too many requests. Please try again later.',
                    ),
                );
                return;
            }

            next();
        } catch (err) {
            // Never block a request because of rate-limiter internal errors
            console.error('[RateLimitService] middleware error — allowing request:', err);
            next();
        }
    };
}

// ---------------------------------------------------------------------------
// Testing helpers (exported for unit / property tests)
// ---------------------------------------------------------------------------

/** @internal — reset in-memory store (for tests) */
export function _resetMemoryStore(): void {
    memoryStore.clear();
    memoryFallbackWarned = false;
}

/** @internal — expose memory store size (for tests) */
export function _memoryStoreSize(): number {
    return memoryStore.size;
}
