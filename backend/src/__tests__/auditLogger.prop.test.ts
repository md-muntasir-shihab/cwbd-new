import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
    logAdminAction,
    _resetLogLevelCache,
} from '../services/securityAuditLogger';
import type { AdminActionParams } from '../services/securityAuditLogger';

/**
 * Property 12: Audit Log Completeness
 *
 * Validates: Requirements 11.3, 12.4, 12.5
 *
 * For any security settings update operation, exactly one new audit log
 * entry is created containing before/after snapshot, actor ID, IP, and
 * timestamp.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../models/SecurityAuditLog', () => {
    const create = vi.fn().mockResolvedValue({});
    return { default: { create } };
});

vi.mock('../models/SecuritySettings', () => {
    const findOne = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
    });
    return { default: { findOne } };
});

import SecurityAuditLog from '../models/SecurityAuditLog';
import SecuritySettings from '../models/SecuritySettings';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

const ipArb = fc.tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 }),
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

const roleArb = fc.constantFrom('superadmin', 'admin');

const settingsSnapshotArb = fc.record({
    tabSwitchLimit: fc.integer({ min: 1, max: 100 }),
    copyPasteViolationLimit: fc.integer({ min: 1, max: 50 }),
    requireFullscreen: fc.boolean(),
    violationAction: fc.constantFrom('warn', 'lock', 'submit'),
    warningCooldownSeconds: fc.integer({ min: 0, max: 300 }),
    maxFullscreenExitLimit: fc.integer({ min: 1, max: 50 }),
});

const adminActionParamsArb = fc.record({
    correlationId: nonEmptyString,
    actorId: nonEmptyString,
    actorRole: roleArb,
    ipAddress: ipArb,
    userAgent: nonEmptyString,
    actionType: fc.constantFrom('security_settings_change', 'anti_cheat_policy_update'),
    before: settingsSnapshotArb,
    after: settingsSnapshotArb,
}) as fc.Arbitrary<AdminActionParams>;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    _resetLogLevelCache();
    (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
    });
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 12: Audit Log Completeness', () => {
    it('exactly one audit log entry is created per admin action', async () => {
        await fc.assert(
            fc.asyncProperty(adminActionParamsArb, async (params) => {
                vi.clearAllMocks();
                _resetLogLevelCache();
                (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
                });

                await logAdminAction(params);

                expect(SecurityAuditLog.create).toHaveBeenCalledTimes(1);
            }),
            { numRuns: 20 },
        );
    });

    it('audit log entry contains before/after snapshot', async () => {
        await fc.assert(
            fc.asyncProperty(adminActionParamsArb, async (params) => {
                vi.clearAllMocks();
                _resetLogLevelCache();
                (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
                });

                await logAdminAction(params);

                const arg = (SecurityAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
                expect(arg.details.before).toEqual(params.before);
                expect(arg.details.after).toEqual(params.after);
            }),
            { numRuns: 20 },
        );
    });

    it('audit log entry contains actor ID and IP address', async () => {
        await fc.assert(
            fc.asyncProperty(adminActionParamsArb, async (params) => {
                vi.clearAllMocks();
                _resetLogLevelCache();
                (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
                });

                await logAdminAction(params);

                const arg = (SecurityAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
                expect(arg.actorId).toBe(params.actorId);
                expect(arg.ipAddress).toBe(params.ipAddress);
            }),
            { numRuns: 20 },
        );
    });

    it('audit log entry has admin eventCategory and correct eventType', async () => {
        await fc.assert(
            fc.asyncProperty(adminActionParamsArb, async (params) => {
                vi.clearAllMocks();
                _resetLogLevelCache();
                (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
                });

                await logAdminAction(params);

                const arg = (SecurityAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
                expect(arg.eventCategory).toBe('admin');
                expect(arg.eventType).toBe(params.actionType);
            }),
            { numRuns: 20 },
        );
    });

    it('audit log entry contains correlationId and actorRole', async () => {
        await fc.assert(
            fc.asyncProperty(adminActionParamsArb, async (params) => {
                vi.clearAllMocks();
                _resetLogLevelCache();
                (SecuritySettings.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ logging: { logLevel: 'info' } }),
                });

                await logAdminAction(params);

                const arg = (SecurityAuditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
                expect(arg.correlationId).toBe(params.correlationId);
                expect(arg.actorRole).toBe(params.actorRole);
            }),
            { numRuns: 20 },
        );
    });
});
