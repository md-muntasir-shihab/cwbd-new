/**
 * SendTime Optimizer Service
 *
 * Timezone-aware delivery scheduling with quiet-hour exception policies
 * and optional best-time scoring.
 *
 * - shouldBypassQuietHours(): returns true when the campaign type is listed
 *   in the quiet-hour exception policy.
 * - computeSendTime(): schedules delivery within the configured window
 *   adjusted to the recipient's timezone, deferring past quiet hours
 *   when applicable, and adding a small random offset when best-time
 *   scoring is enabled.
 *
 * Uses simple UTC-offset timezone calculation (no heavy library needed).
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { SendTimeConfig } from '../types/campaignSettings';
import { IQuietHours } from '../models/NotificationSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a timezone string into a UTC offset in hours.
 *
 * Supports:
 *  - IANA-style names via Intl (e.g. "America/New_York", "Asia/Dhaka")
 *  - Explicit UTC±N strings (e.g. "UTC+6", "UTC-5")
 *
 * Falls back to 0 (UTC) when the timezone cannot be resolved.
 */
export function getTimezoneOffsetHours(timezone: string): number {
    // Handle explicit UTC±N format
    const utcMatch = timezone.match(/^UTC([+-]\d+(?:\.\d+)?)$/i);
    if (utcMatch) {
        return parseFloat(utcMatch[1]);
    }

    // Try Intl-based resolution for IANA names
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'shortOffset',
        });
        const parts = formatter.formatToParts(now);
        const tzPart = parts.find((p) => p.type === 'timeZoneName');
        if (tzPart) {
            // tzPart.value is like "GMT+6", "GMT-5", "GMT+5:30", or "GMT"
            const offsetMatch = tzPart.value.match(/GMT([+-]\d+(?::(\d+))?)?/);
            if (offsetMatch) {
                if (!offsetMatch[1]) return 0; // plain "GMT"
                const hours = parseInt(offsetMatch[1], 10);
                const minutes = offsetMatch[2] ? parseInt(offsetMatch[2], 10) : 0;
                return hours + (hours < 0 ? -minutes : minutes) / 60;
            }
        }
    } catch {
        // Invalid IANA name — fall through to default
    }

    return 0;
}

/**
 * Convert a UTC Date to the local hour (0-23) in the given timezone offset.
 */
function getLocalHour(utcDate: Date, offsetHours: number): number {
    const localMs = utcDate.getTime() + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    return localDate.getUTCHours();
}

/**
 * Check whether a given local hour falls within quiet hours.
 *
 * Handles wrap-around windows (e.g. startHour=22, endHour=7 means
 * quiet from 22:00 to 07:00).
 */
function isWithinQuietHours(
    localHour: number,
    startHour: number,
    endHour: number,
): boolean {
    if (startHour <= endHour) {
        // Same-day window: e.g. 1:00 – 6:00
        return localHour >= startHour && localHour < endHour;
    }
    // Wrap-around window: e.g. 22:00 – 7:00
    return localHour >= startHour || localHour < endHour;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if the given campaign type is listed in the quiet-hour
 * exception policy, meaning it should bypass quiet hours.
 *
 * Req 10.2, 10.3
 */
export function shouldBypassQuietHours(
    campaignType: string,
    exceptions: string[],
): boolean {
    return exceptions.includes(campaignType);
}

/**
 * Compute the optimal send time for a recipient.
 *
 * Algorithm:
 *  1. Start with "now" as the candidate send time.
 *  2. If a delivery window is configured, clamp the candidate to the
 *     window boundaries in the recipient's local timezone. If the current
 *     local hour is past the window end, defer to the window start on the
 *     next day.
 *  3. If quiet hours are active and the campaign type does NOT bypass them,
 *     defer the candidate to after quiet hours end (in the recipient's
 *     local timezone).
 *  4. If bestTimeEnabled, add a small random offset (0-59 min) within the
 *     remaining window to simulate best-time scoring.
 *  5. Return the computed UTC Date.
 *
 * Req 10.1, 10.2, 10.3, 10.4
 */
export async function computeSendTime(
    recipientTimezone: string,
    campaignType: string,
    config: SendTimeConfig,
    quietHours: IQuietHours,
): Promise<Date> {
    const offsetHours = getTimezoneOffsetHours(recipientTimezone);
    const now = new Date();
    let candidate = new Date(now);

    // ── Step 1: Apply delivery window (Req 10.1) ────────────────────────
    if (config.deliveryWindow) {
        const { startHour, endHour } = config.deliveryWindow;
        const localHour = getLocalHour(candidate, offsetHours);

        if (startHour <= endHour) {
            // Same-day window (e.g. 9–17)
            if (localHour < startHour) {
                // Before window — defer to window start today
                candidate = setLocalHour(candidate, startHour, offsetHours);
            } else if (localHour >= endHour) {
                // Past window — defer to window start next day
                candidate = setLocalHour(candidate, startHour, offsetHours);
                candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
            }
            // else: within window — keep candidate as-is
        } else {
            // Wrap-around window (e.g. 20–6)
            if (localHour < startHour && localHour >= endHour) {
                // Outside the wrap-around window — defer to window start today
                candidate = setLocalHour(candidate, startHour, offsetHours);
            }
            // else: within wrap-around window — keep candidate as-is
        }
    }

    // ── Step 2: Apply quiet hours (Req 10.2, 10.3) ─────────────────────
    if (
        quietHours.enabled &&
        !shouldBypassQuietHours(campaignType, config.quietHourExceptions)
    ) {
        const localHour = getLocalHour(candidate, offsetHours);

        if (isWithinQuietHours(localHour, quietHours.startHour, quietHours.endHour)) {
            // Defer to quiet hours end
            candidate = setLocalHour(candidate, quietHours.endHour, offsetHours);

            // If deferring moved us backwards (wrap-around), push to next day
            if (candidate.getTime() <= now.getTime()) {
                candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
            }
        }
    }

    // ── Step 3: Best-time scoring offset (Req 10.4) ─────────────────────
    if (config.bestTimeEnabled) {
        // Add a random offset of 0–59 minutes to spread sends within the window
        const randomMinutes = Math.floor(Math.random() * 60);
        candidate = new Date(candidate.getTime() + randomMinutes * 60 * 1000);
    }

    return candidate;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Set the candidate date to a specific local hour (zeroing minutes/seconds)
 * in the recipient's timezone, returning the equivalent UTC Date.
 */
function setLocalHour(
    utcDate: Date,
    targetLocalHour: number,
    offsetHours: number,
): Date {
    // Get the current local date components
    const localMs = utcDate.getTime() + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);

    // Set to target hour, zero out minutes/seconds
    localDate.setUTCHours(targetLocalHour, 0, 0, 0);

    // Convert back to UTC
    return new Date(localDate.getTime() - offsetHours * 60 * 60 * 1000);
}
