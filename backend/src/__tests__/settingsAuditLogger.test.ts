import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import SettingsAuditEntry from '../models/SettingsAuditEntry';
import { log, getHistory, getVersionSnapshot } from '../services/settingsAuditLoggerService';
import type { SettingsAuditEntryInput } from '../services/settingsAuditLoggerService';

/**
 * Unit tests for SettingsAuditLogger service
 * Validates: Requirements 12.4, 18.1, 18.2
 */

let mongoServer: MongoMemoryServer;

function makeEntry(overrides: Partial<SettingsAuditEntryInput> = {}): SettingsAuditEntryInput {
    return {
        actorId: new mongoose.Types.ObjectId(),
        actorRole: 'admin',
        timestamp: new Date(),
        ipAddress: '127.0.0.1',
        section: 'General',
        beforeSnapshot: { dailySmsLimit: 500 },
        afterSnapshot: { dailySmsLimit: 1000 },
        diff: [{ field: 'dailySmsLimit', oldValue: 500, newValue: 1000 }],
        ...overrides,
    };
}

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await SettingsAuditEntry.deleteMany({});
});

describe('SettingsAuditLogger', () => {
    // ─── 1. log() creates an audit entry with auto-incremented version ──

    it('creates an audit entry with version 1 when collection is empty', async () => {
        await log(makeEntry());

        const entries = await SettingsAuditEntry.find().lean();
        expect(entries).toHaveLength(1);
        expect(entries[0].version).toBe(1);
        expect(entries[0].section).toBe('General');
        expect(entries[0].actorRole).toBe('admin');
        expect(entries[0].diff).toHaveLength(1);
        expect(entries[0].diff[0].field).toBe('dailySmsLimit');
    });

    // ─── 2. log() creates multiple entries with sequential versions ─────

    it('auto-increments version for sequential entries', async () => {
        await log(makeEntry({ section: 'General' }));
        await log(makeEntry({ section: 'Budget' }));
        await log(makeEntry({ section: 'Consent' }));

        const entries = await SettingsAuditEntry.find().sort({ version: 1 }).lean();
        expect(entries).toHaveLength(3);
        expect(entries[0].version).toBe(1);
        expect(entries[1].version).toBe(2);
        expect(entries[2].version).toBe(3);
    });

    // ─── 3. getHistory() returns entries ordered by timestamp descending ─

    it('returns entries ordered by timestamp descending', async () => {
        const t1 = new Date('2024-01-01T10:00:00Z');
        const t2 = new Date('2024-01-01T11:00:00Z');
        const t3 = new Date('2024-01-01T12:00:00Z');

        await log(makeEntry({ timestamp: t1 }));
        await log(makeEntry({ timestamp: t3 }));
        await log(makeEntry({ timestamp: t2 }));

        const history = await getHistory();
        expect(history).toHaveLength(3);
        expect(new Date(history[0].timestamp).getTime()).toBe(t3.getTime());
        expect(new Date(history[1].timestamp).getTime()).toBe(t2.getTime());
        expect(new Date(history[2].timestamp).getTime()).toBe(t1.getTime());
    });

    // ─── 4. getHistory() filters by section when provided ───────────────

    it('filters history by section', async () => {
        await log(makeEntry({ section: 'General' }));
        await log(makeEntry({ section: 'Budget' }));
        await log(makeEntry({ section: 'General' }));
        await log(makeEntry({ section: 'Consent' }));

        const generalHistory = await getHistory('General');
        expect(generalHistory).toHaveLength(2);
        generalHistory.forEach((entry) => {
            expect(entry.section).toBe('General');
        });

        const budgetHistory = await getHistory('Budget');
        expect(budgetHistory).toHaveLength(1);
        expect(budgetHistory[0].section).toBe('Budget');
    });

    // ─── 5. getHistory() respects limit and offset ──────────────────────

    it('respects limit and offset parameters', async () => {
        for (let i = 0; i < 5; i++) {
            await log(makeEntry({ timestamp: new Date(Date.now() + i * 1000) }));
        }

        const limited = await getHistory(undefined, 2);
        expect(limited).toHaveLength(2);

        const offset = await getHistory(undefined, 2, 2);
        expect(offset).toHaveLength(2);

        // Offset entries should be different from the first page
        expect(offset[0].version).not.toBe(limited[0].version);
        expect(offset[1].version).not.toBe(limited[1].version);
    });

    // ─── 6. getVersionSnapshot() returns afterSnapshot for a version ────

    it('returns afterSnapshot for a given version', async () => {
        const snapshot = { dailySmsLimit: 750, quietHoursEnabled: true };
        await log(makeEntry({ afterSnapshot: snapshot }));

        const result = await getVersionSnapshot(1);
        expect(result).not.toBeNull();
        expect(result).toMatchObject(snapshot);
    });

    // ─── 7. getVersionSnapshot() returns null for non-existent version ──

    it('returns null for a non-existent version', async () => {
        const result = await getVersionSnapshot(999);
        expect(result).toBeNull();
    });
});
