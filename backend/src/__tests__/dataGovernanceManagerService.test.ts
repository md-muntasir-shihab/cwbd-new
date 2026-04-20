import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationJob from '../models/NotificationJob';
import SettingsAuditEntry from '../models/SettingsAuditEntry';
import { purgeExpiredRecords, maskPII, exportData } from '../services/dataGovernanceManagerService';
import { DataGovernanceConfig } from '../types/campaignSettings';

/**
 * Unit tests for DataGovernanceManager service
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */

let mongoServer: MongoMemoryServer;

const adminId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await NotificationDeliveryLog.deleteMany({});
    await NotificationJob.deleteMany({});
    await SettingsAuditEntry.deleteMany({});
});

/** Helper: create a NotificationJob and return its _id */
async function createJob(): Promise<mongoose.Types.ObjectId> {
    const job = await NotificationJob.create({
        type: 'bulk',
        channel: 'sms',
        target: 'single',
        templateKey: 'TEST',
        createdByAdminId: adminId,
    });
    return job._id as mongoose.Types.ObjectId;
}

/** Helper: create a delivery log with a given date */
async function createLog(
    jobId: mongoose.Types.ObjectId,
    createdAt: Date,
    overrides: Partial<{ channel: 'sms' | 'email'; to: string; costAmount: number }> = {},
): Promise<void> {
    await NotificationDeliveryLog.create({
        jobId,
        studentId,
        channel: overrides.channel ?? 'sms',
        providerUsed: 'test-provider',
        to: overrides.to ?? '+8801700000000',
        status: 'sent',
        costAmount: overrides.costAmount ?? 1,
        createdAt,
    });
}

describe('DataGovernanceManager Service', () => {
    // ─── purgeExpiredRecords ─────────────────────────────────────────────

    describe('purgeExpiredRecords', () => {
        it('deletes records older than retention period', async () => {
            const jobId = await createJob();
            const now = new Date();
            const oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

            await createLog(jobId, oldDate);
            await createLog(jobId, oldDate);

            const result = await purgeExpiredRecords(90);
            expect(result.purgedCount).toBe(2);

            const remaining = await NotificationDeliveryLog.countDocuments();
            expect(remaining).toBe(0);
        });

        it('preserves recent records within retention period', async () => {
            const jobId = await createJob();
            const now = new Date();
            const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
            const oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

            await createLog(jobId, recentDate);
            await createLog(jobId, oldDate);

            const result = await purgeExpiredRecords(90);
            expect(result.purgedCount).toBe(1);

            const remaining = await NotificationDeliveryLog.countDocuments();
            expect(remaining).toBe(1);
        });
    });

    // ─── maskPII ─────────────────────────────────────────────────────────

    describe('maskPII', () => {
        it('masks email addresses', () => {
            const data = { contact: 'user@example.com', note: 'Send to admin@test.org' };
            const masked = maskPII(data);
            expect(masked.contact).toBe('***@***.com');
            expect(masked.note).toBe('Send to ***@***.com');
        });

        it('masks phone numbers', () => {
            const data = { phone: '+8801712345678' };
            const masked = maskPII(data);
            expect(masked.phone).not.toBe('+8801712345678');
            expect(masked.phone).toContain('***');
        });

        it('redacts name fields', () => {
            const data = {
                firstName: 'John',
                lastName: 'Doe',
                fullName: 'John Doe',
                studentName: 'Jane Smith',
                email: 'test@test.com',
            };
            const masked = maskPII(data);
            expect(masked.firstName).toBe('[REDACTED]');
            expect(masked.lastName).toBe('[REDACTED]');
            expect(masked.fullName).toBe('[REDACTED]');
            expect(masked.studentName).toBe('[REDACTED]');
            expect(masked.email).toBe('***@***.com');
        });

        it('handles nested objects', () => {
            const data = {
                recipient: {
                    name: 'Alice',
                    email: 'alice@example.com',
                    address: {
                        city: 'Dhaka',
                    },
                },
            };
            const masked = maskPII(data);
            const recipient = masked.recipient as Record<string, unknown>;
            expect(recipient.name).toBe('[REDACTED]');
            expect(recipient.email).toBe('***@***.com');
            const address = recipient.address as Record<string, unknown>;
            expect(address.city).toBe('Dhaka');
        });
    });


    // ─── exportData ──────────────────────────────────────────────────────

    describe('exportData', () => {
        const defaultConfig: DataGovernanceConfig = {
            retentionDays: 365,
            piiMaskingEnabled: false,
            exportPermissionRoles: ['admin', 'superadmin'],
        };

        it('throws when user role is not in exportPermissionRoles', async () => {
            await expect(
                exportData('all', adminId, 'viewer', defaultConfig),
            ).rejects.toThrow('Forbidden: user does not have data_export permission');
        });

        it('returns exportRefId and data buffer when authorized', async () => {
            const jobId = await createJob();
            await createLog(jobId, new Date());

            const result = await exportData('all', adminId, 'admin', defaultConfig);

            expect(result.exportRefId).toBeDefined();
            expect(typeof result.exportRefId).toBe('string');
            expect(result.exportRefId.length).toBeGreaterThan(0);
            expect(Buffer.isBuffer(result.data)).toBe(true);

            const parsed = JSON.parse(result.data.toString('utf-8'));
            expect(parsed.exportRefId).toBe(result.exportRefId);
            expect(parsed.exportedBy).toBe(adminId.toHexString());
            expect(parsed.exportedAt).toBeDefined();
            expect(parsed.recordCount).toBe(1);
        });

        it('creates an audit entry on export', async () => {
            const jobId = await createJob();
            await createLog(jobId, new Date());

            const result = await exportData('all', adminId, 'superadmin', defaultConfig);

            const auditEntries = await SettingsAuditEntry.find({
                section: 'data_governance_export',
            }).lean();

            expect(auditEntries.length).toBe(1);
            expect(auditEntries[0].actorId.toString()).toBe(adminId.toString());
            expect(auditEntries[0].afterSnapshot).toHaveProperty('exportRefId', result.exportRefId);
            expect(auditEntries[0].afterSnapshot).toHaveProperty('scope', 'all');
        });
    });
});
