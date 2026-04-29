import { getOne } from './integrationsService';
import type { IntegrationKey } from '../../models/IntegrationConfig';

/**
 * Feature gate cache: integrations rarely change, so we cache lookups for 30s.
 * This keeps hot-path code (e.g. search, image, notifications) cheap without
 * stale data risk.
 */
const CACHE_TTL_MS = 30_000;
type CacheEntry = {
    value: { enabled: boolean; config: Record<string, unknown>; configuredSecrets: string[] };
    expiresAt: number;
};
const cache = new Map<IntegrationKey, CacheEntry>();

export function clearFeatureGateCache(key?: IntegrationKey): void {
    if (key) cache.delete(key);
    else cache.clear();
}

async function loadCached(key: IntegrationKey): Promise<CacheEntry['value']> {
    const now = Date.now();
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now) return existing.value;
    const state = await getOne(key);
    const value: CacheEntry['value'] = state
        ? {
              enabled: state.enabled,
              config: state.config,
              configuredSecrets: state.configuredSecrets,
          }
        : { enabled: false, config: {}, configuredSecrets: [] };
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
}

/**
 * Returns true only if the integration is explicitly enabled by an admin.
 * Product code should always wrap optional integration calls in this check
 * so the system fails safe to local fallbacks when the integration is off
 * or misconfigured.
 */
export async function isIntegrationEnabled(key: IntegrationKey): Promise<boolean> {
    try {
        const value = await loadCached(key);
        return value.enabled;
    } catch {
        return false;
    }
}

/**
 * Returns the saved non-secret config for an integration, or null if disabled.
 * Always returns null when the integration is disabled so callers cannot
 * accidentally hit a third-party service that an admin has paused.
 */
export async function getIntegrationConfig(
    key: IntegrationKey,
): Promise<Record<string, unknown> | null> {
    try {
        const value = await loadCached(key);
        if (!value.enabled) return null;
        return value.config;
    } catch {
        return null;
    }
}

/**
 * Convenience helper: returns true only if the integration is enabled AND
 * every secret in `requiredSecrets` is configured. Useful for guarding
 * call sites that need a token (e.g. Meilisearch admin key).
 */
export async function isIntegrationReady(
    key: IntegrationKey,
    requiredSecrets: string[] = [],
): Promise<boolean> {
    try {
        const value = await loadCached(key);
        if (!value.enabled) return false;
        return requiredSecrets.every((secret) => value.configuredSecrets.includes(secret));
    } catch {
        return false;
    }
}
