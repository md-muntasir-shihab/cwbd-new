/**
 * Cache service — Upstash Redis (primary) with in-memory Map fallback.
 *
 * Uses @upstash/redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set; otherwise falls back to a TTL-based in-memory Map.
 * All operations are wrapped in try/catch — never throws.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9, 2.10, 6.5
 */

import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = process.env.CACHE_PREFIX ?? 'cw:';

function isCacheEnabled(): boolean {
    return process.env.CACHE_ENABLED?.toLowerCase() !== 'false';
}

export function isRedisConfigured(): boolean {
    return Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    );
}

// ---------------------------------------------------------------------------
// Upstash Redis client (lazy init)
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
    if (redisClient) return redisClient;

    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (!url || !token) return null;

    try {
        redisClient = new Redis({ url, token });
        return redisClient;
    } catch {
        return null;
    }
}

export async function checkRedisConnection(): Promise<{ configured: boolean; connected: boolean }> {
    const configured = isRedisConfigured();
    const redis = getRedisClient();
    if (!configured || !redis) {
        return { configured, connected: false };
    }

    const key = `${CACHE_PREFIX}health:${Date.now()}`;
    try {
        await redis.set(key, 'ok', { ex: 10 });
        const value = await redis.get<string>(key);
        await redis.del(key).catch(() => undefined);
        return { configured: true, connected: value === 'ok' };
    } catch {
        return { configured: true, connected: false };
    }
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------

interface CacheEntry {
    value: string;
    expiresAt: number;
}

const store = new Map<string, CacheEntry>();

// Periodic cleanup: evict expired entries every 60 seconds
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now >= entry.expiresAt) {
            store.delete(key);
        }
    }
}, 60_000);
cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const KEY_SEP = '::';

export function buildKey(
    method: string,
    path: string,
    query: Record<string, string> = {},
): string {
    const sortedEntries = Object.keys(query)
        .sort()
        .filter((k) => query[k] !== undefined && query[k] !== '')
        .map((k) => `${k}=${query[k]}`);

    const queryPart = sortedEntries.length > 0 ? `${KEY_SEP}${sortedEntries.join('&')}` : '';
    return `${CACHE_PREFIX}${method.toUpperCase()}${KEY_SEP}${path}${queryPart}`;
}

export function parseKey(key: string): {
    method: string;
    path: string;
    query: Record<string, string>;
} {
    const body = key.startsWith(CACHE_PREFIX) ? key.slice(CACHE_PREFIX.length) : key;
    const parts = body.split(KEY_SEP);
    const method = parts[0] ?? '';
    const path = parts[1] ?? '';
    const queryStr = parts.slice(2).join(KEY_SEP);

    const query: Record<string, string> = {};
    if (queryStr) {
        for (const pair of queryStr.split('&')) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
                query[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
            }
        }
    }

    return { method, path, query };
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function get<T>(key: string): Promise<T | null> {
    if (!isCacheEnabled()) return null;

    const redis = getRedisClient();
    if (redis) {
        try {
            const val = await redis.get<T>(key);
            return val ?? null;
        } catch {
            // fall through to in-memory
        }
    }

    try {
        const entry = store.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiresAt) {
            store.delete(key);
            return null;
        }
        return JSON.parse(entry.value) as T;
    } catch {
        return null;
    }
}

export async function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!isCacheEnabled()) return;

    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(key, value, { ex: ttlSeconds });
            return;
        } catch {
            // fall through to in-memory
        }
    }

    try {
        store.set(key, {
            value: JSON.stringify(value),
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    } catch (err) {
        console.error('[CacheService] set failed:', err);
    }
}

export async function del(key: string): Promise<void> {
    if (!isCacheEnabled()) return;

    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.del(key);
            return;
        } catch {
            // fall through to in-memory
        }
    }

    try {
        store.delete(key);
    } catch (err) {
        console.error('[CacheService] del failed:', err);
    }
}

export async function delByPattern(pattern: string): Promise<number> {
    if (!isCacheEnabled()) return 0;

    const redis = getRedisClient();
    if (redis) {
        try {
            // Upstash supports SCAN-based pattern delete
            let cursor = 0;
            let deleted = 0;
            do {
                const [nextCursor, keys] = await redis.scan(cursor, {
                    match: pattern,
                    count: 100,
                });
                cursor = Number(nextCursor);
                if (keys.length > 0) {
                    await redis.del(...keys);
                    deleted += keys.length;
                }
            } while (cursor !== 0);
            return deleted;
        } catch {
            // fall through to in-memory
        }
    }

    try {
        const escaped = pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1');
        const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`);

        let deleted = 0;
        for (const key of store.keys()) {
            if (regex.test(key)) {
                store.delete(key);
                deleted++;
            }
        }
        return deleted;
    } catch (err) {
        console.error('[CacheService] delByPattern failed:', err);
        return 0;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const cacheService = {
    get,
    set,
    del,
    delByPattern,
    buildKey,
    parseKey,
    isRedisConfigured,
    checkRedisConnection,
};

export default cacheService;
