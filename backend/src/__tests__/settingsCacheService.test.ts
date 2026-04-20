import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsCacheService } from '../services/settingsCacheService';
import type { INotificationSettings } from '../models/NotificationSettings';

/**
 * Unit tests for SettingsCacheService
 * Validates: Requirements 19.1
 */

function makeFakeSettings(overrides: Partial<INotificationSettings> = {}): INotificationSettings {
    return {
        dailySmsLimit: 500,
        dailyEmailLimit: 2000,
        schemaVersion: 2,
        ...overrides,
    } as INotificationSettings;
}

describe('SettingsCacheService', () => {
    let cache: SettingsCacheService;

    beforeEach(() => {
        cache = new SettingsCacheService();
        vi.useRealTimers();
    });

    // ─── 1. get() returns null when cache is empty ──────────────────────

    it('returns null when cache is empty', () => {
        expect(cache.get()).toBeNull();
    });

    // ─── 2. set() + get() returns the cached settings ──────────────────

    it('returns cached settings after set()', () => {
        const settings = makeFakeSettings({ dailySmsLimit: 100 });
        cache.set(settings);

        const result = cache.get();
        expect(result).not.toBeNull();
        expect(result!.dailySmsLimit).toBe(100);
    });

    // ─── 3. get() returns null after TTL expires ────────────────────────

    it('returns null after TTL expires', () => {
        vi.useFakeTimers();

        const settings = makeFakeSettings();
        cache.set(settings, 5000); // 5 second TTL

        // Still valid before TTL
        expect(cache.get()).not.toBeNull();

        // Advance past TTL
        vi.advanceTimersByTime(5001);

        expect(cache.get()).toBeNull();
    });

    it('returns cached value just before TTL expires', () => {
        vi.useFakeTimers();

        const settings = makeFakeSettings();
        cache.set(settings, 10_000);

        vi.advanceTimersByTime(9999);
        expect(cache.get()).not.toBeNull();
    });

    // ─── 4. invalidate() clears the cache ───────────────────────────────

    it('invalidate() clears the cache so get() returns null', () => {
        const settings = makeFakeSettings();
        cache.set(settings);

        expect(cache.get()).not.toBeNull();

        cache.invalidate();

        expect(cache.get()).toBeNull();
    });

    it('invalidate() on empty cache does not throw', () => {
        expect(() => cache.invalidate()).not.toThrow();
    });

    // ─── 5. set() overwrites previous entry ─────────────────────────────

    it('set() overwrites previous cached settings', () => {
        const first = makeFakeSettings({ dailySmsLimit: 100 });
        const second = makeFakeSettings({ dailySmsLimit: 999 });

        cache.set(first);
        expect(cache.get()!.dailySmsLimit).toBe(100);

        cache.set(second);
        expect(cache.get()!.dailySmsLimit).toBe(999);
    });

    // ─── 6. Concurrent access: multiple set/get calls work correctly ────

    it('handles rapid sequential set/get calls correctly', () => {
        for (let i = 0; i < 100; i++) {
            const settings = makeFakeSettings({ dailySmsLimit: i });
            cache.set(settings);
            expect(cache.get()!.dailySmsLimit).toBe(i);
        }
    });

    it('last writer wins with multiple sets', () => {
        const a = makeFakeSettings({ dailySmsLimit: 1 });
        const b = makeFakeSettings({ dailySmsLimit: 2 });
        const c = makeFakeSettings({ dailySmsLimit: 3 });

        cache.set(a);
        cache.set(b);
        cache.set(c);

        expect(cache.get()!.dailySmsLimit).toBe(3);
    });

    // ─── Default TTL behavior ───────────────────────────────────────────

    it('uses default 60s TTL when none specified', () => {
        vi.useFakeTimers();

        cache.set(makeFakeSettings());

        // Still valid at 59s
        vi.advanceTimersByTime(59_000);
        expect(cache.get()).not.toBeNull();

        // Expired at 61s
        vi.advanceTimersByTime(2_000);
        expect(cache.get()).toBeNull();
    });
});
