import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import SettingsAuditEntry from '../models/SettingsAuditEntry';
import { evaluate, transition, getValidTransitions } from '../services/approvalWorkflowService';
import type { ApprovalPolicy } from '../types/campaignSettings';

/**
 * Unit tests for ApprovalWorkflow service
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

let mongoServer: MongoMemoryServer;

const defaultPolicy: ApprovalPolicy = {
    audienceSizeThreshold: 1000,
    estimatedCostThreshold: 5000,
    sensitiveSegmentIds: ['seg-vip', 'seg-minors'],
};

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

// ─── evaluate() ──────────────────────────────────────────────────────────────

describe('evaluate()', () => {
    /** Validates: Requirement 5.1 — no thresholds exceeded → scheduled */
    it('returns "scheduled" when no thresholds are exceeded', () => {
        const result = evaluate(
            { audienceSize: 500, estimatedCost: 2000, segmentIds: ['seg-normal'] },
            defaultPolicy,
        );
        expect(result).toBe('scheduled');
    });

    /** Validates: Requirement 5.2 — audience size exceeds threshold */
    it('returns "pending_approval" when audience size exceeds threshold', () => {
        const result = evaluate(
            { audienceSize: 1500, estimatedCost: 2000, segmentIds: [] },
            defaultPolicy,
        );
        expect(result).toBe('pending_approval');
    });

    /** Validates: Requirement 5.3 — estimated cost exceeds threshold */
    it('returns "pending_approval" when estimated cost exceeds threshold', () => {
        const result = evaluate(
            { audienceSize: 500, estimatedCost: 6000, segmentIds: [] },
            defaultPolicy,
        );
        expect(result).toBe('pending_approval');
    });

    /** Validates: Requirement 5.4 — sensitive segment targeted */
    it('returns "pending_approval" when a sensitive segment is targeted', () => {
        const result = evaluate(
            { audienceSize: 100, estimatedCost: 100, segmentIds: ['seg-vip'] },
            defaultPolicy,
        );
        expect(result).toBe('pending_approval');
    });
});


// ─── transition() — valid transitions ────────────────────────────────────────

describe('transition()', () => {
    const actorId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();

    /** Validates: Requirement 5.5 — draft → pending_approval */
    it('succeeds for draft → pending_approval', async () => {
        await expect(
            transition(campaignId, 'draft', 'pending_approval', actorId, 'Threshold exceeded'),
        ).resolves.toBeUndefined();
    });

    /** Validates: Requirement 5.5 — draft → scheduled */
    it('succeeds for draft → scheduled', async () => {
        await expect(
            transition(campaignId, 'draft', 'scheduled', actorId, 'No threshold exceeded'),
        ).resolves.toBeUndefined();
    });

    /** Validates: Requirement 5.6 — pending_approval → approved */
    it('succeeds for pending_approval → approved', async () => {
        await expect(
            transition(campaignId, 'pending_approval', 'approved', actorId, 'Looks good'),
        ).resolves.toBeUndefined();
    });

    /** Validates: Requirement 5.7 — pending_approval → draft (rejection) */
    it('succeeds for pending_approval → draft (rejection)', async () => {
        await expect(
            transition(campaignId, 'pending_approval', 'draft', actorId, 'Needs revision'),
        ).resolves.toBeUndefined();
    });

    /** Validates: Requirement 5.5 — approved → scheduled */
    it('succeeds for approved → scheduled', async () => {
        await expect(
            transition(campaignId, 'approved', 'scheduled', actorId, 'Schedule confirmed'),
        ).resolves.toBeUndefined();
    });

    // ─── Invalid transitions ─────────────────────────────────────────────

    /** Validates: Requirement 5.5 — draft → approved is invalid */
    it('throws for draft → approved (invalid transition)', async () => {
        await expect(
            transition(campaignId, 'draft', 'approved', actorId, 'Skip approval'),
        ).rejects.toThrow('Invalid approval transition');
    });

    /** Validates: Requirement 5.5 — scheduled → draft is invalid */
    it('throws for scheduled → draft (invalid transition)', async () => {
        await expect(
            transition(campaignId, 'scheduled', 'draft', actorId, 'Undo schedule'),
        ).rejects.toThrow('Invalid approval transition');
    });
});

// ─── getValidTransitions() ───────────────────────────────────────────────────

describe('getValidTransitions()', () => {
    /** Validates: Requirement 5.5 */
    it('returns correct transitions for each status', () => {
        expect(getValidTransitions('draft')).toEqual(
            expect.arrayContaining(['pending_approval', 'scheduled']),
        );
        expect(getValidTransitions('draft')).toHaveLength(2);

        expect(getValidTransitions('pending_approval')).toEqual(
            expect.arrayContaining(['approved', 'draft']),
        );
        expect(getValidTransitions('pending_approval')).toHaveLength(2);

        expect(getValidTransitions('approved')).toEqual(['scheduled']);

        expect(getValidTransitions('scheduled')).toEqual([]);

        expect(getValidTransitions('rejected')).toEqual([]);
    });
});

// ─── Audit logging ───────────────────────────────────────────────────────────

describe('transition() audit logging', () => {
    /** Validates: Requirements 5.6, 5.7 — transitions create audit entries */
    it('creates an audit entry in SettingsAuditEntry collection', async () => {
        const actorId = new mongoose.Types.ObjectId();
        const campaignId = new mongoose.Types.ObjectId();

        await transition(campaignId, 'pending_approval', 'approved', actorId, 'Approved by manager');

        const entries = await SettingsAuditEntry.find().lean();
        expect(entries).toHaveLength(1);

        const entry = entries[0];
        expect(entry.section).toBe('approval_workflow');
        expect(entry.actorRole).toBe('approver');
        expect(entry.beforeSnapshot).toMatchObject({ status: 'pending_approval' });
        expect(entry.afterSnapshot).toMatchObject({ status: 'approved' });
        expect(entry.diff).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'status', oldValue: 'pending_approval', newValue: 'approved' }),
                expect.objectContaining({ field: 'reason', newValue: 'Approved by manager' }),
            ]),
        );
    });
});
