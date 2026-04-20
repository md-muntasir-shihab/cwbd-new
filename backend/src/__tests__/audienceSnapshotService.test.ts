import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AudienceSnapshot from '../models/AudienceSnapshot';
import {
    capture,
    detectDrift,
    getSnapshot,
    computeHash,
} from '../services/audienceSnapshotService';

/**
 * Unit tests for AudienceSnapshot service
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

let mongoServer: MongoMemoryServer;

const campaignId = new mongoose.Types.ObjectId();
const memberId1 = new mongoose.Types.ObjectId();
const memberId2 = new mongoose.Types.ObjectId();
const memberId3 = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await AudienceSnapshot.deleteMany({});
});

describe('AudienceSnapshot Service', () => {
    // ─── 1. capture() creates a snapshot with correct hash ──────────────

    it('capture() creates a snapshot with correct hash', async () => {
        const memberIds = [memberId1, memberId2];
        const snapshot = await capture(campaignId, memberIds);

        expect(snapshot).not.toBeNull();
        expect(snapshot.campaignId.toString()).toBe(campaignId.toString());
        expect(snapshot.memberIds).toHaveLength(2);
        expect(snapshot.hash).toBe(computeHash(memberIds));
        expect(snapshot.capturedAt).toBeInstanceOf(Date);
    });

    // ─── 2. capture() upserts (updates existing snapshot for same campaign) ─

    it('capture() upserts an existing snapshot for the same campaign', async () => {
        await capture(campaignId, [memberId1]);
        await capture(campaignId, [memberId1, memberId2]);

        const docs = await AudienceSnapshot.find({ campaignId }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].memberIds).toHaveLength(2);
        expect(docs[0].hash).toBe(computeHash([memberId1, memberId2]));
    });

    // ─── 3. computeHash() is deterministic regardless of input order ────

    it('computeHash() produces the same hash regardless of input order', () => {
        const hashAB = computeHash([memberId1, memberId2, memberId3]);
        const hashBA = computeHash([memberId3, memberId1, memberId2]);
        const hashCB = computeHash([memberId2, memberId3, memberId1]);

        expect(hashAB).toBe(hashBA);
        expect(hashBA).toBe(hashCB);
        // SHA-256 produces a 64-char hex string
        expect(hashAB).toMatch(/^[a-f0-9]{64}$/);
    });

    // ─── 4. getSnapshot() returns the snapshot for a campaign ───────────

    it('getSnapshot() returns the snapshot for a campaign', async () => {
        await capture(campaignId, [memberId1, memberId2]);

        const snapshot = await getSnapshot(campaignId);
        expect(snapshot).not.toBeNull();
        expect(snapshot!.campaignId.toString()).toBe(campaignId.toString());
        expect(snapshot!.hash).toBe(computeHash([memberId1, memberId2]));
    });

    // ─── 5. getSnapshot() returns null for non-existent campaign ────────

    it('getSnapshot() returns null for a non-existent campaign', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const snapshot = await getSnapshot(nonExistentId);
        expect(snapshot).toBeNull();
    });

    // ─── 6. detectDrift() returns drifted:false when audience unchanged ─

    it('detectDrift() returns drifted:false when audience has not changed', async () => {
        const memberIds = [memberId1, memberId2];
        await capture(campaignId, memberIds);

        const result = await detectDrift(campaignId, memberIds);
        expect(result.drifted).toBe(false);
        expect(result.snapshotHash).toBe(result.currentHash);
    });

    // ─── 7. detectDrift() returns drifted:true when audience changed ────

    it('detectDrift() returns drifted:true when audience has changed', async () => {
        await capture(campaignId, [memberId1, memberId2]);

        const result = await detectDrift(campaignId, [memberId1, memberId3]);
        expect(result.drifted).toBe(true);
        expect(result.snapshotHash).not.toBe(result.currentHash);
    });

    // ─── 8. detectDrift() throws when no snapshot exists ────────────────

    it('detectDrift() throws when no snapshot exists', async () => {
        const unknownCampaign = new mongoose.Types.ObjectId();

        await expect(
            detectDrift(unknownCampaign, [memberId1]),
        ).rejects.toThrow(`No audience snapshot found for campaign ${unknownCampaign.toHexString()}`);
    });
});
