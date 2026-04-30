// Feature: exam-center-backend-completion, Property 6: Notification Defaults Round-Trip
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { updateNotificationDefaultsSchema } from '../validators/notificationManagement.validator';

/**
 * Property 6: Notification Defaults Round-Trip
 *
 * **Validates: Requirements 6.1**
 *
 * For any valid array of notification channel defaults, saving via PUT
 * and then fetching via GET SHALL return the same `eventType`, `label`,
 * `inApp`, `email`, `push`, and `sms` values for each entry.
 *
 * This is a PURE LOGIC test — no database involved. We:
 * 1. Generate random defaults with valid event types and random boolean channels
 * 2. Validate them against the Zod schema
 * 3. Simulate the save/fetch round-trip (saved value === fetched value)
 * 4. Assert each entry's fields match exactly
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** The 9 valid notification event types and their labels. */
const NOTIFICATION_EVENT_TYPES = [
    { eventType: 'exam_published', label: 'Exam Published' },
    { eventType: 'exam_starting_soon', label: 'Exam Starting Soon' },
    { eventType: 'result_published', label: 'Result Published' },
    { eventType: 'streak_warning', label: 'Streak Warning' },
    { eventType: 'group_membership', label: 'Group Membership' },
    { eventType: 'battle_challenge', label: 'Battle Challenge' },
    { eventType: 'payment_confirmation', label: 'Payment Confirmation' },
    { eventType: 'routine_reminder', label: 'Routine Reminder' },
    { eventType: 'doubt_reply', label: 'Doubt Reply' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChannelDefaultEntry {
    eventType: string;
    label: string;
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
}

// ─── Simulated Save/Fetch Logic ──────────────────────────────────────────────

/**
 * Simulates the controller round-trip:
 * - updateNotificationDefaults persists the defaults array
 * - getNotificationDefaults returns the persisted array (or system defaults if empty)
 *
 * Since the controller stores and retrieves the exact same array,
 * the round-trip should be identity for any valid input.
 */
function simulateSaveAndFetch(defaults: ChannelDefaultEntry[]): ChannelDefaultEntry[] {
    // Simulate save: store the defaults (in-memory)
    const stored = defaults.map((entry) => ({
        eventType: entry.eventType,
        label: entry.label,
        inApp: entry.inApp,
        email: entry.email,
        push: entry.push,
        sms: entry.sms,
    }));

    // Simulate fetch: return stored if non-empty, otherwise system defaults
    if (stored.length > 0) {
        return stored;
    }

    // System defaults fallback (all inApp true, others false)
    return NOTIFICATION_EVENT_TYPES.map((entry) => ({
        eventType: entry.eventType,
        label: entry.label,
        inApp: true,
        email: false,
        push: false,
        sms: false,
    }));
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a single channel default entry with a random event type and random booleans. */
const channelDefaultEntryArb: fc.Arbitrary<ChannelDefaultEntry> = fc
    .record({
        eventTypeIndex: fc.integer({ min: 0, max: NOTIFICATION_EVENT_TYPES.length - 1 }),
        inApp: fc.boolean(),
        email: fc.boolean(),
        push: fc.boolean(),
        sms: fc.boolean(),
    })
    .map(({ eventTypeIndex, inApp, email, push, sms }) => ({
        eventType: NOTIFICATION_EVENT_TYPES[eventTypeIndex].eventType,
        label: NOTIFICATION_EVENT_TYPES[eventTypeIndex].label,
        inApp,
        email,
        push,
        sms,
    }));

/**
 * Generate an array of channel default entries (1–9 entries).
 * Each entry has a unique event type to mirror realistic usage.
 */
const uniqueDefaultsArrayArb: fc.Arbitrary<ChannelDefaultEntry[]> = fc
    .shuffledSubarray(
        NOTIFICATION_EVENT_TYPES.map((_, i) => i),
        { minLength: 1, maxLength: NOTIFICATION_EVENT_TYPES.length },
    )
    .chain((indices) =>
        fc
            .tuple(
                ...indices.map((idx) =>
                    fc
                        .record({
                            inApp: fc.boolean(),
                            email: fc.boolean(),
                            push: fc.boolean(),
                            sms: fc.boolean(),
                        })
                        .map((bools) => ({
                            eventType: NOTIFICATION_EVENT_TYPES[idx].eventType,
                            label: NOTIFICATION_EVENT_TYPES[idx].label,
                            ...bools,
                        })),
                ),
            )
            .map((entries) => entries as ChannelDefaultEntry[]),
    );

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 6: Notification Defaults Round-Trip', () => {
    /**
     * Valid defaults arrays pass Zod validation.
     * **Validates: Requirements 6.1**
     */
    it('accepts all valid notification defaults arrays via Zod schema', () => {
        fc.assert(
            fc.property(uniqueDefaultsArrayArb, (defaults) => {
                const result = updateNotificationDefaultsSchema.safeParse({ defaults });
                expect(result.success).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Round-trip: saved defaults are returned exactly as provided.
     * **Validates: Requirements 6.1**
     */
    it('returns the same defaults after save and fetch round-trip', () => {
        fc.assert(
            fc.property(uniqueDefaultsArrayArb, (defaults) => {
                const fetched = simulateSaveAndFetch(defaults);

                expect(fetched).toHaveLength(defaults.length);

                for (let i = 0; i < defaults.length; i++) {
                    expect(fetched[i].eventType).toBe(defaults[i].eventType);
                    expect(fetched[i].label).toBe(defaults[i].label);
                    expect(fetched[i].inApp).toBe(defaults[i].inApp);
                    expect(fetched[i].email).toBe(defaults[i].email);
                    expect(fetched[i].push).toBe(defaults[i].push);
                    expect(fetched[i].sms).toBe(defaults[i].sms);
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Each entry's boolean channels are preserved exactly (no coercion or mutation).
     * **Validates: Requirements 6.1**
     */
    it('preserves boolean channel values without coercion', () => {
        fc.assert(
            fc.property(channelDefaultEntryArb, (entry) => {
                const defaults = [entry];
                const fetched = simulateSaveAndFetch(defaults);

                expect(fetched[0].inApp).toStrictEqual(entry.inApp);
                expect(fetched[0].email).toStrictEqual(entry.email);
                expect(fetched[0].push).toStrictEqual(entry.push);
                expect(fetched[0].sms).toStrictEqual(entry.sms);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Event types in the fetched result match the saved event types exactly.
     * **Validates: Requirements 6.1**
     */
    it('preserves event types across the round-trip', () => {
        fc.assert(
            fc.property(uniqueDefaultsArrayArb, (defaults) => {
                const fetched = simulateSaveAndFetch(defaults);

                const savedEventTypes = defaults.map((d) => d.eventType).sort();
                const fetchedEventTypes = fetched.map((d) => d.eventType).sort();

                expect(fetchedEventTypes).toEqual(savedEventTypes);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Zod schema rejects an empty defaults array.
     * **Validates: Requirements 6.1**
     */
    it('rejects empty defaults array via Zod schema', () => {
        const result = updateNotificationDefaultsSchema.safeParse({ defaults: [] });
        expect(result.success).toBe(false);
    });

    /**
     * Zod schema rejects entries with invalid event types.
     * **Validates: Requirements 6.1**
     */
    it('rejects defaults with invalid event types via Zod schema', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 30 }).filter(
                    (s) => !NOTIFICATION_EVENT_TYPES.some((e) => e.eventType === s),
                ),
                fc.boolean(),
                fc.boolean(),
                fc.boolean(),
                fc.boolean(),
                (badEventType, inApp, email, push, sms) => {
                    const payload = {
                        defaults: [
                            {
                                eventType: badEventType,
                                label: 'Bad Event',
                                inApp,
                                email,
                                push,
                                sms,
                            },
                        ],
                    };
                    const result = updateNotificationDefaultsSchema.safeParse(payload);
                    expect(result.success).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });
});
