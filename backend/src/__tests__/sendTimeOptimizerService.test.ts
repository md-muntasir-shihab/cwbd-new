import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    computeSendTime,
    shouldBypassQuietHours,
    getTimezoneOffsetHours,
} from '../services/sendTimeOptimizerService';
import type { SendTimeConfig } from '../types/campaignSettings';
import type { IQuietHours } from '../models/NotificationSettings';

/**
 * Unit tests for SendTimeOptimizer service
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQuietHours(overrides: Partial<IQuietHours> = {}): IQuietHours {
    return {
        enabled: true,
        startHour: 22,
        endHour: 7,
        timezone: 'UTC+0',
        ...overrides,
    };
}

function makeConfig(overrides: Partial<SendTimeConfig> = {}): SendTimeConfig {
    return {
        quietHourExceptions: [],
        bestTimeEnabled: false,
        ...overrides,
    };
}

// ─── shouldBypassQuietHours ──────────────────────────────────────────────────

describe('shouldBypassQuietHours', () => {
    it('returns true when campaignType is in exceptions (Req 10.2, 10.3)', () => {
        const exceptions = ['critical_transactional', 'emergency'];
        expect(shouldBypassQuietHours('critical_transactional', exceptions)).toBe(true);
        expect(shouldBypassQuietHours('emergency', exceptions)).toBe(true);
    });

    it('returns false when campaignType is not in exceptions (Req 10.2)', () => {
        const exceptions = ['critical_transactional', 'emergency'];
        expect(shouldBypassQuietHours('promotional', exceptions)).toBe(false);
        expect(shouldBypassQuietHours('newsletter', exceptions)).toBe(false);
    });

    it('returns false when exceptions list is empty', () => {
        expect(shouldBypassQuietHours('critical_transactional', [])).toBe(false);
    });
});

// ─── getTimezoneOffsetHours ──────────────────────────────────────────────────

describe('getTimezoneOffsetHours', () => {
    it('parses UTC+6 correctly (Req 10.1)', () => {
        expect(getTimezoneOffsetHours('UTC+6')).toBe(6);
    });

    it('parses UTC-5 correctly', () => {
        expect(getTimezoneOffsetHours('UTC-5')).toBe(-5);
    });

    it('parses UTC+5.5 correctly', () => {
        expect(getTimezoneOffsetHours('UTC+5.5')).toBe(5.5);
    });

    it('returns 0 for invalid timezone string', () => {
        expect(getTimezoneOffsetHours('InvalidTimezone/Nowhere')).toBe(0);
    });

    it('returns 0 for empty string', () => {
        expect(getTimezoneOffsetHours('')).toBe(0);
    });
});

// ─── computeSendTime ─────────────────────────────────────────────────────────

describe('computeSendTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns a Date (basic smoke test) (Req 10.1)', async () => {
        const config = makeConfig();
        const quietHours = makeQuietHours({ enabled: false });

        const result = await computeSendTime('UTC+0', 'promotional', config, quietHours);
        expect(result).toBeInstanceOf(Date);
    });

    it('bypasses quiet hours for exception campaign types (Req 10.3)', async () => {
        // Set current time to 23:00 UTC — within quiet hours (22-7)
        vi.setSystemTime(new Date('2025-01-15T23:00:00Z'));

        const config = makeConfig({
            quietHourExceptions: ['critical_transactional'],
        });
        const quietHours = makeQuietHours({ enabled: true, startHour: 22, endHour: 7 });

        const result = await computeSendTime('UTC+0', 'critical_transactional', config, quietHours);

        // Should NOT be deferred past quiet hours — should be at or near 23:00
        expect(result.getUTCHours()).toBe(23);
    });

    it('defers send past quiet hours for non-exception campaign types (Req 10.2)', async () => {
        // Set current time to 23:00 UTC — within quiet hours (22-7)
        vi.setSystemTime(new Date('2025-01-15T23:00:00Z'));

        const config = makeConfig({
            quietHourExceptions: [],
        });
        const quietHours = makeQuietHours({ enabled: true, startHour: 22, endHour: 7 });

        const result = await computeSendTime('UTC+0', 'promotional', config, quietHours);

        // Should be deferred to 7:00 (quiet hours end)
        expect(result.getUTCHours()).toBe(7);
        expect(result.getUTCMinutes()).toBe(0);
    });

    it('adds random offset when bestTimeEnabled is true (Req 10.4)', async () => {
        vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

        // Mock Math.random to return a known value
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

        const config = makeConfig({ bestTimeEnabled: true });
        const quietHours = makeQuietHours({ enabled: false });

        const result = await computeSendTime('UTC+0', 'promotional', config, quietHours);

        // Math.floor(0.5 * 60) = 30 minutes offset from 12:00 → 12:30
        expect(result.getUTCHours()).toBe(12);
        expect(result.getUTCMinutes()).toBe(30);

        randomSpy.mockRestore();
    });
});
