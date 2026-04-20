/**
 * Settings Audit Logger Service
 *
 * Provides an immutable audit trail for every settings mutation.
 * Only create and read operations are exposed — no update or delete.
 *
 * Requirements: 12.4, 14.5, 18.1, 18.2
 */

import mongoose from 'mongoose';
import SettingsAuditEntry from '../models/SettingsAuditEntry';
import type { IDiffItem } from '../models/SettingsAuditEntry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SettingsAuditEntryInput {
    actorId: mongoose.Types.ObjectId;
    actorRole: string;
    timestamp: Date;
    ipAddress: string;
    section: string;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    diff: IDiffItem[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Log an immutable settings audit entry.
 * Auto-increments the version number based on the latest existing entry.
 */
export async function log(entry: SettingsAuditEntryInput): Promise<void> {
    try {
        const lastEntry = await SettingsAuditEntry.findOne()
            .sort({ version: -1 })
            .select('version')
            .lean();

        const nextVersion = lastEntry ? lastEntry.version + 1 : 1;

        await SettingsAuditEntry.create({
            actorId: entry.actorId,
            actorRole: entry.actorRole,
            timestamp: entry.timestamp,
            ipAddress: entry.ipAddress,
            section: entry.section,
            beforeSnapshot: entry.beforeSnapshot,
            afterSnapshot: entry.afterSnapshot,
            diff: entry.diff,
            version: nextVersion,
        });
    } catch (err) {
        // Audit logging must never crash the request pipeline
        console.error('[SettingsAuditLogger] Failed to log settings audit entry:', err);
    }
}

/**
 * Retrieve settings audit history, optionally filtered by section.
 * Results are ordered by timestamp descending (most recent first).
 */
export async function getHistory(
    section?: string,
    limit: number = 50,
    offset: number = 0,
) {
    const filter: Record<string, unknown> = {};
    if (section) {
        filter.section = section;
    }

    return SettingsAuditEntry.find(filter)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .lean();
}

/**
 * Retrieve the afterSnapshot for a specific version number.
 * Returns null if the version does not exist.
 *
 * Requirement 18.2: Support reading settings at any previous version.
 */
export async function getVersionSnapshot(
    version: number,
): Promise<Record<string, unknown> | null> {
    const entry = await SettingsAuditEntry.findOne({ version })
        .select('afterSnapshot')
        .lean();

    return entry ? entry.afterSnapshot : null;
}
