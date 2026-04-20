/**
 * Suppression Engine Service
 *
 * Maintains and evaluates suppression lists to prevent delivery to
 * hard-bounced, complained, invalid, or manually blacklisted contacts.
 * Removal requires elevated confirmation and is audit-logged.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 19.2
 */

import mongoose from 'mongoose';
import SuppressionEntry from '../models/SuppressionEntry';
import { log } from './settingsAuditLoggerService';

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Add a contact to the suppression list.
 * If the contact+channel combo already exists, the entry is updated in place.
 * Req 3.1, 3.2, 3.3, 3.4, 3.5
 */
export async function addSuppression(
    entry: {
        contactIdentifier: string;
        channel: string;
        reason: string;
        source: string;
    },
): Promise<void> {
    await SuppressionEntry.updateOne(
        { contactIdentifier: entry.contactIdentifier, channel: entry.channel },
        {
            $set: {
                reason: entry.reason,
                suppressedAt: new Date(),
                source: entry.source,
            },
        },
        { upsert: true },
    );
}

/**
 * Remove a contact from the suppression list.
 * Requires a confirmationToken equal to 'confirmed' (elevated confirmation).
 * Logs the override action via the Settings Audit Logger.
 * Req 3.7
 */
export async function removeSuppression(
    contactIdentifier: string,
    channel: string,
    actorId: mongoose.Types.ObjectId,
    confirmationToken: string,
): Promise<void> {
    if (confirmationToken !== 'confirmed') {
        throw new Error('Elevated confirmation required: confirmationToken must be "confirmed"');
    }

    const deleted = await SuppressionEntry.findOneAndDelete(
        { contactIdentifier, channel },
    ).lean();

    // Log the override action regardless of whether an entry existed
    await log({
        actorId,
        actorRole: 'admin',
        timestamp: new Date(),
        ipAddress: 'system',
        section: 'suppression',
        beforeSnapshot: deleted ? { contactIdentifier, channel, reason: deleted.reason } : {},
        afterSnapshot: {},
        diff: [
            {
                field: 'suppression_override',
                oldValue: deleted ? deleted.reason : null,
                newValue: null,
            },
        ],
    });
}

/**
 * Check whether a specific contact+channel is currently suppressed.
 * Uses the compound index on { contactIdentifier, channel }. Req 3.6, 19.2
 */
export async function isSuppressed(
    contactIdentifier: string,
    channel: string,
): Promise<boolean> {
    const entry = await SuppressionEntry.findOne(
        { contactIdentifier, channel },
    )
        .select('_id')
        .lean();

    return entry !== null;
}

/**
 * Filter a list of contacts, returning only the IDs of those NOT suppressed.
 * Req 3.6
 */
export async function filterSuppressed(
    contacts: Array<{ id: mongoose.Types.ObjectId; identifier: string }>,
    channel: string,
): Promise<mongoose.Types.ObjectId[]> {
    if (contacts.length === 0) return [];

    const identifiers = contacts.map((c) => c.identifier);

    const suppressedDocs = await SuppressionEntry.find({
        contactIdentifier: { $in: identifiers },
        channel,
    })
        .select('contactIdentifier')
        .lean();

    const suppressedSet = new Set(suppressedDocs.map((d) => d.contactIdentifier));

    return contacts
        .filter((c) => !suppressedSet.has(c.identifier))
        .map((c) => c.id);
}
