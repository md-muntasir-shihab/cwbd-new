import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import IdempotencyKey from '../models/IdempotencyKey';
import { generateKey, check, record } from '../services/idempotencyGuardService';

/**
 * Unit tests for IdempotencyGuard service
 * Validates: Requirements 17.1, 17.2, 17.3
 */

let mongoServer: MongoMemoryServer;

const campaignId1 = new mongoose.Types.ObjectId();
const campaignId2 = new mongoose.Types.ObjectId();
const recipientId1 = new mongoose.Types.ObjectId();
const recipientId2 = new mongoose.Types.ObjectId();
const scheduledAt1 = new Date('2025-06-01T10:00:00Z');
const scheduledAt2 = new Date('2025-06-01T11:00:00Z');

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await IdempotencyKey.deleteMany({});
});

describe('IdempotencyGuard Service', () => {
    // ─── generateKey ─────────────────────────────────────────────────────

    it('generateKey produces deterministic output (same inputs → same key)', () => {
        const key1 = generateKey(campaignId1, recipientId1, scheduledAt1);
        const key2 = generateKey(campaignId1, recipientId1, scheduledAt1);
        expect(key1).toBe(key2);
    });

    it('generateKey produces different keys for different inputs', () => {
        const keyA = generateKey(campaignId1, recipientId1, scheduledAt1);
        const keyB = generateKey(campaignId2, recipientId1, scheduledAt1);
        const keyC = generateKey(campaignId1, recipientId2, scheduledAt1);
        const keyD = generateKey(campaignId1, recipientId1, scheduledAt2);

        expect(keyA).not.toBe(keyB);
        expect(keyA).not.toBe(keyC);
        expect(keyA).not.toBe(keyD);
    });

    it('generateKey produces a 64-char hex string (SHA-256)', () => {
        const key = generateKey(campaignId1, recipientId1, scheduledAt1);
        expect(key).toHaveLength(64);
        expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    // ─── check ───────────────────────────────────────────────────────────

    it('check returns isDuplicate:false when key does not exist', async () => {
        const result = await check('nonexistent-key');
        expect(result.isDuplicate).toBe(false);
        expect(result.originalResult).toBeUndefined();
    });

    // ─── record + check ──────────────────────────────────────────────────

    it('record + check returns isDuplicate:true with originalResult', async () => {
        const key = generateKey(campaignId1, recipientId1, scheduledAt1);
        const sendResult = { status: 'sent', messageId: 'msg-123' };

        await record(key, sendResult);
        const result = await check(key);

        expect(result.isDuplicate).toBe(true);
        expect(result.originalResult).toEqual(sendResult);
    });

    it('record upserts (updates existing key)', async () => {
        const key = generateKey(campaignId1, recipientId1, scheduledAt1);
        const firstResult = { status: 'sent', messageId: 'msg-001' };
        const secondResult = { status: 'sent', messageId: 'msg-002' };

        await record(key, firstResult);
        await record(key, secondResult);

        const docs = await IdempotencyKey.find({ key }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].result).toEqual(secondResult);
    });
});
