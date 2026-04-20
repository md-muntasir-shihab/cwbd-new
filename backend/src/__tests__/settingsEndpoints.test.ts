import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationSettings, {
    applyMigrationDefaults,
    ADVANCED_SETTINGS_DEFAULTS,
} from '../models/NotificationSettings';
import SettingsAuditEntry from '../models/SettingsAuditEntry';
import { validateSettingsBody } from '../middlewares/settingsValidator';
import {
    settingsRbac,
    detectModifiedSections,
    SETTINGS_PERMISSION_MATRIX,
} from '../middlewares/settingsRbac';
import {
    log as auditLog,
    getHistory,
    getVersionSnapshot,
} from '../services/settingsAuditLoggerService';

/**
 * API Integration Tests for Settings Endpoints
 *
 * Validates the key endpoint-level behaviors by testing the underlying
 * service/middleware logic against a real MongoDB instance:
 *
 * 1. GET migration: applyMigrationDefaults on a real MongoDB document
 * 2. PUT validation: validateSettingsBody rejects unknown keys
 * 3. PUT RBAC: settingsRbac rejects unauthorized role
 * 4. Version history: getVersionSnapshot returns correct snapshot
 * 5. Audit trail: getHistory filters by section
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 12.1, 12.2, 15.1, 18.1, 18.2
 */

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await NotificationSettings.deleteMany({});
    await SettingsAuditEntry.deleteMany({});
});

// ─── 1. GET migration: legacy MongoDB document → merged defaults (Req 1.1, 1.2) ─

describe('GET migration — applyMigrationDefaults on real MongoDB doc', () => {
    it('merges advanced defaults into a legacy document loaded from MongoDB', async () => {
        // Insert a legacy document directly (no schemaVersion, no advanced fields)
        await mongoose.connection.db!.collection('notificationsettings').insertOne({
            dailySmsLimit: 300,
            dailyEmailLimit: 1500,
            monthlySmsBudgetBDT: 3000,
            monthlyEmailBudgetBDT: 800,
        });

        // Simulate what the GET endpoint does: load + applyMigrationDefaults
        const raw = await mongoose.connection.db!
            .collection('notificationsettings')
            .findOne({});
        expect(raw).not.toBeNull();

        const doc = raw as Record<string, unknown>;
        const merged = applyMigrationDefaults(doc);

        // Original fields preserved
        expect(merged.dailySmsLimit).toBe(300);
        expect(merged.dailyEmailLimit).toBe(1500);

        // Advanced defaults merged in
        expect(merged.schemaVersion).toBe(2);
        expect(merged.frequencyCap).toEqual(ADVANCED_SETTINGS_DEFAULTS.frequencyCap);
        expect(merged.budgetGuardrails).toEqual(ADVANCED_SETTINGS_DEFAULTS.budgetGuardrails);
        expect(merged.observability).toEqual(ADVANCED_SETTINGS_DEFAULTS.observability);
        expect(merged.dataGovernance).toEqual(ADVANCED_SETTINGS_DEFAULTS.dataGovernance);
    });
});

// ─── 2. PUT validation: rejects unknown keys (Req 1.4) ──────────────────────

describe('PUT validation — validateSettingsBody rejects unknown keys', () => {
    it('returns error listing unknown keys when body contains invalid fields', () => {
        const body = { unknownField: 42, anotherBad: 'nope', dailySmsLimit: 100 };
        const errors = validateSettingsBody(body);

        expect(errors.length).toBe(1);
        expect(errors[0].path).toBe('_unknown');
        expect(errors[0].message).toContain('unknownField');
        expect(errors[0].message).toContain('anotherBad');
    });
});

// ─── 3. PUT RBAC: rejects unauthorized role (Req 12.1, 12.2) ────────────────

describe('PUT RBAC — settingsRbac rejects unauthorized role', () => {
    it('returns 403 when editor tries to modify Budget section', () => {
        // Verify the permission matrix: Budget only allows superadmin, admin
        const budgetRoles = SETTINGS_PERMISSION_MATRIX['Budget'];
        expect(budgetRoles).not.toContain('editor');

        // Simulate middleware call with a mock req/res
        let statusCode = 0;
        let responseBody: Record<string, unknown> = {};

        const req = {
            user: { _id: new mongoose.Types.ObjectId(), role: 'editor' },
            body: { budgetGuardrails: { softLimitPercent: 90 } },
            headers: {},
        } as any;

        const res = {
            status(code: number) {
                statusCode = code;
                return this;
            },
            json(body: Record<string, unknown>) {
                responseBody = body;
                return this;
            },
        } as any;

        const next = () => { statusCode = 200; };

        settingsRbac(req, res, next);

        expect(statusCode).toBe(403);
        expect(responseBody.errorCode).toBe('FORBIDDEN');
        expect(responseBody.section).toBe('Budget');
    });

    it('allows admin to modify Budget section', () => {
        let statusCode = 0;

        const req = {
            user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
            body: { budgetGuardrails: { softLimitPercent: 90 } },
            headers: { 'x-elevated-confirmation': 'confirmed' },
        } as any;

        const res = {
            status(code: number) {
                statusCode = code;
                return this;
            },
            json() { return this; },
        } as any;

        const next = () => { statusCode = 200; };

        settingsRbac(req, res, next);

        expect(statusCode).toBe(200);
    });
});

// ─── 4. Version history: getVersionSnapshot returns correct snapshot (Req 18.1, 18.2) ─

describe('Version history — getVersionSnapshot after audit log entries', () => {
    it('returns the correct afterSnapshot for a specific version', async () => {
        const actorId = new mongoose.Types.ObjectId();

        // Log two version changes
        await auditLog({
            actorId,
            actorRole: 'superadmin',
            timestamp: new Date('2024-06-01T10:00:00Z'),
            ipAddress: '10.0.0.1',
            section: 'General',
            beforeSnapshot: { dailySmsLimit: 500 },
            afterSnapshot: { dailySmsLimit: 750 },
            diff: [{ field: 'dailySmsLimit', oldValue: 500, newValue: 750 }],
        });

        await auditLog({
            actorId,
            actorRole: 'superadmin',
            timestamp: new Date('2024-06-01T11:00:00Z'),
            ipAddress: '10.0.0.1',
            section: 'Caps',
            beforeSnapshot: { frequencyCap: { dailyCap: 5 } },
            afterSnapshot: { frequencyCap: { dailyCap: 10 } },
            diff: [{ field: 'frequencyCap.dailyCap', oldValue: 5, newValue: 10 }],
        });

        // Version 1 should have the General change
        const v1 = await getVersionSnapshot(1);
        expect(v1).not.toBeNull();
        expect(v1!.dailySmsLimit).toBe(750);

        // Version 2 should have the Caps change
        const v2 = await getVersionSnapshot(2);
        expect(v2).not.toBeNull();
        expect((v2!.frequencyCap as any).dailyCap).toBe(10);

        // Non-existent version returns null
        const v99 = await getVersionSnapshot(99);
        expect(v99).toBeNull();
    });
});

// ─── 5. Audit trail: getHistory filters by section (Req 18.1, 18.2) ─────────

describe('Audit trail — getHistory filtered by section', () => {
    it('returns only entries matching the requested section', async () => {
        const actorId = new mongoose.Types.ObjectId();
        const base = {
            actorId,
            actorRole: 'admin',
            ipAddress: '192.168.1.1',
            beforeSnapshot: {},
            afterSnapshot: {},
            diff: [],
        };

        await auditLog({ ...base, timestamp: new Date('2024-06-01T10:00:00Z'), section: 'General' });
        await auditLog({ ...base, timestamp: new Date('2024-06-01T11:00:00Z'), section: 'Budget' });
        await auditLog({ ...base, timestamp: new Date('2024-06-01T12:00:00Z'), section: 'General' });
        await auditLog({ ...base, timestamp: new Date('2024-06-01T13:00:00Z'), section: 'Caps' });

        const generalEntries = await getHistory('General');
        expect(generalEntries).toHaveLength(2);
        generalEntries.forEach((e) => expect(e.section).toBe('General'));

        const budgetEntries = await getHistory('Budget');
        expect(budgetEntries).toHaveLength(1);
        expect(budgetEntries[0].section).toBe('Budget');

        // All entries when no filter
        const allEntries = await getHistory();
        expect(allEntries).toHaveLength(4);
    });
});
