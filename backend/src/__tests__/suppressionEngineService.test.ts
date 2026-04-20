import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import SuppressionEntry from '../models/SuppressionEntry';
import '../models/SettingsAuditEntry'; // required by removeSuppression → settingsAuditLoggerService.log()
import {
    addSuppression,
    removeSuppression,
    isSuppressed,
    filterSuppressed,
} from '../services/suppressionEngineService';

/**
 * Unit tests for SuppressionEngine service
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

let mongoServer: MongoMemoryServer;

const actorId = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await SuppressionEntry.deleteMany({});
});

describe('SuppressionEngine Service', () => {
    // ─── 1. addSuppression creates a new suppression entry ──────────────

    it('addSuppression creates a new suppression entry', async () => {
        await addSuppression({
            contactIdentifier: 'user@example.com',
            channel: 'email',
            reason: 'hard_bounce',
            source: 'delivery_system',
        });

        const entry = await SuppressionEntry.findOne({
            contactIdentifier: 'user@example.com',
            channel: 'email',
        }).lean();

        expect(entry).not.toBeNull();
        expect(entry!.reason).toBe('hard_bounce');
        expect(entry!.source).toBe('delivery_system');
        expect(entry!.suppressedAt).toBeInstanceOf(Date);
    });

    // ─── 2. addSuppression upserts existing entry (updates reason) ──────

    it('addSuppression upserts existing entry instead of creating a duplicate', async () => {
        await addSuppression({
            contactIdentifier: '+8801700000000',
            channel: 'sms',
            reason: 'hard_bounce',
            source: 'delivery_system',
        });

        await addSuppression({
            contactIdentifier: '+8801700000000',
            channel: 'sms',
            reason: 'complaint',
            source: 'user_report',
        });

        const entries = await SuppressionEntry.find({
            contactIdentifier: '+8801700000000',
            channel: 'sms',
        }).lean();

        expect(entries).toHaveLength(1);
        expect(entries[0].reason).toBe('complaint');
        expect(entries[0].source).toBe('user_report');
    });

    // ─── 3. isSuppressed returns true for suppressed contact ────────────

    it('isSuppressed returns true for a suppressed contact', async () => {
        await addSuppression({
            contactIdentifier: 'blocked@example.com',
            channel: 'email',
            reason: 'invalid_contact',
            source: 'validation',
        });

        const result = await isSuppressed('blocked@example.com', 'email');
        expect(result).toBe(true);
    });

    // ─── 4. isSuppressed returns false for non-suppressed contact ───────

    it('isSuppressed returns false for a non-suppressed contact', async () => {
        const result = await isSuppressed('clean@example.com', 'email');
        expect(result).toBe(false);
    });

    // ─── 5. removeSuppression throws when confirmationToken is not 'confirmed' ──

    it('removeSuppression throws when confirmationToken is not "confirmed"', async () => {
        await addSuppression({
            contactIdentifier: 'user@example.com',
            channel: 'email',
            reason: 'manual_blacklist',
            source: 'admin',
        });

        await expect(
            removeSuppression('user@example.com', 'email', actorId, 'wrong_token'),
        ).rejects.toThrow('Elevated confirmation required');
    });

    // ─── 6. removeSuppression deletes entry when confirmationToken is 'confirmed' ──

    it('removeSuppression deletes entry when confirmationToken is "confirmed"', async () => {
        await addSuppression({
            contactIdentifier: 'user@example.com',
            channel: 'email',
            reason: 'complaint',
            source: 'delivery_system',
        });

        await removeSuppression('user@example.com', 'email', actorId, 'confirmed');

        const entry = await SuppressionEntry.findOne({
            contactIdentifier: 'user@example.com',
            channel: 'email',
        }).lean();

        expect(entry).toBeNull();
    });

    // ─── 7. filterSuppressed returns only non-suppressed contact IDs ────

    it('filterSuppressed returns only non-suppressed contact IDs', async () => {
        const id1 = new mongoose.Types.ObjectId();
        const id2 = new mongoose.Types.ObjectId();
        const id3 = new mongoose.Types.ObjectId();

        await addSuppression({
            contactIdentifier: 'bounced@example.com',
            channel: 'email',
            reason: 'hard_bounce',
            source: 'delivery_system',
        });

        const contacts = [
            { id: id1, identifier: 'clean@example.com' },
            { id: id2, identifier: 'bounced@example.com' },
            { id: id3, identifier: 'also-clean@example.com' },
        ];

        const result = await filterSuppressed(contacts, 'email');
        const resultStrings = result.map((id) => id.toString());

        expect(resultStrings).toHaveLength(2);
        expect(resultStrings).toContain(id1.toString());
        expect(resultStrings).toContain(id3.toString());
        expect(resultStrings).not.toContain(id2.toString());
    });

    // ─── 8. filterSuppressed returns all IDs when none are suppressed ───

    it('filterSuppressed returns all IDs when none are suppressed', async () => {
        const id1 = new mongoose.Types.ObjectId();
        const id2 = new mongoose.Types.ObjectId();

        const contacts = [
            { id: id1, identifier: 'a@example.com' },
            { id: id2, identifier: 'b@example.com' },
        ];

        const result = await filterSuppressed(contacts, 'email');
        expect(result).toHaveLength(2);
    });

    // ─── 9. filterSuppressed returns empty array for empty input ────────

    it('filterSuppressed returns empty array for empty input', async () => {
        const result = await filterSuppressed([], 'email');
        expect(result).toHaveLength(0);
    });
});
