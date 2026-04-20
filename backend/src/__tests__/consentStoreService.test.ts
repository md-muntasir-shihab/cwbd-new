import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ConsentRecord from '../models/ConsentRecord';
import {
    getConsent,
    setConsent,
    globalUnsubscribe,
    categoryUnsubscribe,
    filterOptedIn,
} from '../services/consentStoreService';

/**
 * Unit tests for ConsentStore service
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

let mongoServer: MongoMemoryServer;

const userId1 = new mongoose.Types.ObjectId();
const userId2 = new mongoose.Types.ObjectId();
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
    await ConsentRecord.deleteMany({});
});

describe('ConsentStore Service', () => {
    // ─── 1. setConsent creates a new consent record ─────────────────────

    it('setConsent creates a new consent record', async () => {
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);

        const record = await ConsentRecord.findOne({ userId: userId1, channel: 'sms', purpose: 'transactional' }).lean();
        expect(record).not.toBeNull();
        expect(record!.optedIn).toBe(true);
        expect(record!.source).toBe('user');
        expect(record!.actorId.toString()).toBe(actorId.toString());
        expect(record!.changedAt).toBeInstanceOf(Date);
    });

    // ─── 2. getConsent retrieves the correct record ─────────────────────

    it('getConsent retrieves the correct record', async () => {
        await setConsent(userId1, 'email', 'promotional', true, 'api', actorId);

        const record = await getConsent(userId1, 'email', 'promotional');
        expect(record).not.toBeNull();
        expect(record!.optedIn).toBe(true);
        expect(record!.channel).toBe('email');
        expect(record!.purpose).toBe('promotional');
    });

    // ─── 3. setConsent upserts (updates existing record) ────────────────

    it('setConsent upserts an existing record instead of creating a duplicate', async () => {
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId1, 'sms', 'transactional', false, 'admin_override', actorId);

        const records = await ConsentRecord.find({ userId: userId1, channel: 'sms', purpose: 'transactional' }).lean();
        expect(records).toHaveLength(1);
        expect(records[0].optedIn).toBe(false);
        expect(records[0].source).toBe('admin_override');
    });

    // ─── 4. globalUnsubscribe marks all channels and purposes as opted-out ──

    it('globalUnsubscribe marks all channels and purposes as opted-out', async () => {
        // Opt in to all combos first
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId1, 'sms', 'promotional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'transactional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'promotional', true, 'user', actorId);

        await globalUnsubscribe(userId1, 'user', actorId);

        const records = await ConsentRecord.find({ userId: userId1 }).lean();
        expect(records).toHaveLength(4);
        records.forEach((r) => {
            expect(r.optedIn).toBe(false);
        });
    });

    // ─── 5. globalUnsubscribe preserves records for other users ─────────

    it('globalUnsubscribe preserves records for other users', async () => {
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId2, 'sms', 'transactional', true, 'user', actorId);

        await globalUnsubscribe(userId1, 'user', actorId);

        const user1Record = await getConsent(userId1, 'sms', 'transactional');
        expect(user1Record!.optedIn).toBe(false);

        const user2Record = await getConsent(userId2, 'sms', 'transactional');
        expect(user2Record!.optedIn).toBe(true);
    });

    // ─── 6. categoryUnsubscribe marks only specified purpose as opted-out ──

    it('categoryUnsubscribe marks only specified purpose as opted-out across all channels', async () => {
        await setConsent(userId1, 'sms', 'promotional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'promotional', true, 'user', actorId);
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'transactional', true, 'user', actorId);

        await categoryUnsubscribe(userId1, 'promotional', 'user', actorId);

        const smsPromo = await getConsent(userId1, 'sms', 'promotional');
        const emailPromo = await getConsent(userId1, 'email', 'promotional');
        expect(smsPromo!.optedIn).toBe(false);
        expect(emailPromo!.optedIn).toBe(false);
    });

    // ─── 7. categoryUnsubscribe preserves other purpose records ─────────

    it('categoryUnsubscribe preserves other purpose records', async () => {
        await setConsent(userId1, 'sms', 'promotional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'promotional', true, 'user', actorId);
        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId1, 'email', 'transactional', true, 'user', actorId);

        await categoryUnsubscribe(userId1, 'promotional', 'user', actorId);

        const smsTx = await getConsent(userId1, 'sms', 'transactional');
        const emailTx = await getConsent(userId1, 'email', 'transactional');
        expect(smsTx!.optedIn).toBe(true);
        expect(emailTx!.optedIn).toBe(true);
    });

    // ─── 8. filterOptedIn returns only opted-in users ───────────────────

    it('filterOptedIn returns only opted-in users', async () => {
        const userId3 = new mongoose.Types.ObjectId();

        await setConsent(userId1, 'sms', 'transactional', true, 'user', actorId);
        await setConsent(userId2, 'sms', 'transactional', false, 'user', actorId);
        await setConsent(userId3, 'sms', 'transactional', true, 'user', actorId);

        const result = await filterOptedIn([userId1, userId2, userId3], 'sms', 'transactional');
        const resultStrings = result.map((id) => id.toString());

        expect(resultStrings).toHaveLength(2);
        expect(resultStrings).toContain(userId1.toString());
        expect(resultStrings).toContain(userId3.toString());
        expect(resultStrings).not.toContain(userId2.toString());
    });

    // ─── 9. filterOptedIn returns empty array when no users are opted-in ──

    it('filterOptedIn returns empty array when no users are opted-in', async () => {
        await setConsent(userId1, 'sms', 'transactional', false, 'user', actorId);
        await setConsent(userId2, 'sms', 'transactional', false, 'user', actorId);

        const result = await filterOptedIn([userId1, userId2], 'sms', 'transactional');
        expect(result).toHaveLength(0);
    });

    // ─── 10. filterOptedIn returns empty array for empty input ──────────

    it('filterOptedIn returns empty array for empty input', async () => {
        const result = await filterOptedIn([], 'sms', 'transactional');
        expect(result).toHaveLength(0);
    });
});
