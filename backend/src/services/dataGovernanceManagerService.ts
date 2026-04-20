/**
 * Data Governance Manager Service
 *
 * Enforces retention policies, PII masking, and secure data export with
 * permission verification and audit stamps.
 *
 * - purgeExpiredRecords(): deletes delivery logs older than retentionDays
 * - maskPII(): replaces email, phone, and name patterns with masked equivalents
 * - exportData(): permission-gated export with audit logging and stamping
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import { DataGovernanceConfig } from '../types/campaignSettings';
import * as settingsAuditLoggerService from './settingsAuditLoggerService';

// ─── PII Masking Patterns ────────────────────────────────────────────────────

/** Matches common email patterns: user@domain.tld */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Matches phone patterns: optional country code, digits with separators */
const PHONE_REGEX = /(\+?\d{1,3}[\s\-]?)?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g;

const EMAIL_MASK = '***@***.com';
const PHONE_MASK = '***-****-****';
const NAME_REDACTED = '[REDACTED]';

/** Keys that typically contain personal names */
const NAME_KEYS = new Set([
    'name', 'firstname', 'first_name', 'firstName',
    'lastname', 'last_name', 'lastName',
    'fullname', 'full_name', 'fullName',
    'recipientName', 'recipient_name',
    'studentName', 'student_name',
    'guardianName', 'guardian_name',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskString(value: string): string {
    let masked = value.replace(EMAIL_REGEX, EMAIL_MASK);
    masked = masked.replace(PHONE_REGEX, PHONE_MASK);
    return masked;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Purge delivery logs and event records older than the configured retention
 * period. Returns the count of purged documents.
 *
 * Req 14.1
 */
export async function purgeExpiredRecords(
    retentionDays: number,
): Promise<{ purgedCount: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await NotificationDeliveryLog.deleteMany({
        createdAt: { $lt: cutoff },
    });

    return { purgedCount: result.deletedCount ?? 0 };
}


/**
 * Mask PII in a data record. Replaces:
 * - Email addresses with ***@***.com
 * - Phone numbers with ***-****-****
 * - Name fields with [REDACTED]
 *
 * Recursively processes nested objects and arrays.
 *
 * Req 14.2
 */
export function maskPII(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        const keyLower = key.toLowerCase();

        if (NAME_KEYS.has(key) || NAME_KEYS.has(keyLower)) {
            result[key] = NAME_REDACTED;
        } else if (typeof value === 'string') {
            result[key] = maskString(value);
        } else if (Array.isArray(value)) {
            result[key] = value.map((item) => {
                if (typeof item === 'string') return maskString(item);
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    return maskPII(item as Record<string, unknown>);
                }
                return item;
            });
        } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
            result[key] = maskPII(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Export data for the given scope after verifying the requesting user has
 * the `data_export` permission (i.e. their role is in exportPermissionRoles).
 *
 * Stamps the export with userId, timestamp, and a unique exportRefId.
 * Logs the export request via SettingsAuditLogger.
 *
 * Req 14.3, 14.4, 14.5
 */
export async function exportData(
    scope: string,
    requestingUserId: mongoose.Types.ObjectId,
    requestingUserRole: string,
    config: DataGovernanceConfig,
): Promise<{ exportRefId: string; data: Buffer }> {
    // Verify data_export permission
    if (!config.exportPermissionRoles.includes(requestingUserRole)) {
        throw new Error('Forbidden: user does not have data_export permission');
    }

    const exportRefId = uuidv4();
    const timestamp = new Date();

    // Fetch scoped data — delivery logs for the given scope
    const query: Record<string, unknown> = {};
    if (scope && scope !== 'all') {
        query.originModule = scope;
    }

    const records = await NotificationDeliveryLog.find(query).lean();

    // Apply PII masking if enabled
    let exportRecords = records.map((r) => r as unknown as Record<string, unknown>);
    if (config.piiMaskingEnabled) {
        exportRecords = exportRecords.map((r) => maskPII(r));
    }

    // Build stamped export payload
    const exportPayload = {
        exportRefId,
        exportedBy: requestingUserId.toHexString(),
        exportedAt: timestamp.toISOString(),
        scope,
        recordCount: exportRecords.length,
        records: exportRecords,
    };

    const data = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf-8');

    // Log export request via audit logger (Req 14.5)
    await settingsAuditLoggerService.log({
        actorId: requestingUserId,
        actorRole: requestingUserRole,
        timestamp,
        ipAddress: '',
        section: 'data_governance_export',
        beforeSnapshot: {},
        afterSnapshot: { exportRefId, scope },
        diff: [{ field: 'export', oldValue: null, newValue: exportRefId }],
    });

    return { exportRefId, data };
}
