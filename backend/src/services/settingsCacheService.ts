/**
 * In-memory settings cache service for the Campaign Engine send path.
 * Stores the active INotificationSettings document with configurable TTL
 * to avoid database reads on every send evaluation.
 *
 * Requirement 19.1: Cache active settings in memory with configurable TTL (default 60s).
 * Invalidated on every settings write.
 */

import type { INotificationSettings } from '../models/NotificationSettings';

interface CacheEntry {
    value: INotificationSettings;
    expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 seconds

class SettingsCacheService {
    private cache: Map<string, CacheEntry> = new Map();
    private static readonly SETTINGS_KEY = 'active_settings';

    /**
     * Retrieve the cached settings document.
     * Returns null if no entry exists or the entry has expired.
     */
    get(): INotificationSettings | null {
        const entry = this.cache.get(SettingsCacheService.SETTINGS_KEY);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(SettingsCacheService.SETTINGS_KEY);
            return null;
        }
        return entry.value;
    }

    /**
     * Store a settings document in the cache with a TTL.
     * @param settings - The settings document to cache.
     * @param ttlMs - Time-to-live in milliseconds (default 60s).
     */
    set(settings: INotificationSettings, ttlMs: number = DEFAULT_TTL_MS): void {
        this.cache.set(SettingsCacheService.SETTINGS_KEY, {
            value: settings,
            expiresAt: Date.now() + ttlMs,
        });
    }

    /**
     * Invalidate the cached settings entry.
     * Must be called on every settings write to ensure consistency.
     */
    invalidate(): void {
        this.cache.delete(SettingsCacheService.SETTINGS_KEY);
    }
}

/** Shared singleton instance — import this in services that need cached settings. */
export const settingsCacheService = new SettingsCacheService();

/** Export the class for testing purposes. */
export { SettingsCacheService };
