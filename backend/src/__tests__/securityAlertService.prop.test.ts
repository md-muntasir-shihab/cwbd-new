import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
    shouldTriggerAlert,
    ALERT_THRESHOLDS,
    type AlertType,
} from '../services/securityAlertService';

/**
 * Property 11: Security Alert Threshold Correctness
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4
 *
 * For any alert type and event count, an alert triggers if and only if
 * the event count meets or exceeds the configured threshold.
 * Below threshold → no alert. At or above threshold → alert triggers.
 */

const ALERT_TYPES: AlertType[] = [
    'auth_failure_spike',
    'otp_abuse',
    'suspicious_admin_activity',
    'anti_cheat_spike',
];

const alertTypeArb = fc.constantFrom(...ALERT_TYPES);

describe('Property 11: Security Alert Threshold Correctness', () => {
    it('shouldTriggerAlert returns true if and only if eventCount >= threshold', () => {
        fc.assert(
            fc.property(
                alertTypeArb,
                fc.integer({ min: 0, max: 100 }),
                (alertType, eventCount) => {
                    const threshold = ALERT_THRESHOLDS[alertType].count;
                    const result = shouldTriggerAlert(alertType, eventCount, threshold);

                    if (eventCount >= threshold) {
                        return result === true;
                    } else {
                        return result === false;
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('alert never triggers when eventCount is strictly below threshold', () => {
        fc.assert(
            fc.property(
                alertTypeArb,
                fc.integer({ min: 0, max: 100 }),
                (alertType, eventCount) => {
                    const threshold = ALERT_THRESHOLDS[alertType].count;
                    // Only test cases where eventCount < threshold
                    fc.pre(eventCount < threshold);
                    return shouldTriggerAlert(alertType, eventCount, threshold) === false;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('alert always triggers when eventCount meets or exceeds threshold', () => {
        fc.assert(
            fc.property(
                alertTypeArb,
                fc.integer({ min: 0, max: 100 }),
                (alertType, eventCount) => {
                    const threshold = ALERT_THRESHOLDS[alertType].count;
                    // Only test cases where eventCount >= threshold
                    fc.pre(eventCount >= threshold);
                    return shouldTriggerAlert(alertType, eventCount, threshold) === true;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('threshold boundary: eventCount === threshold - 1 does not trigger, eventCount === threshold does trigger', () => {
        fc.assert(
            fc.property(alertTypeArb, (alertType) => {
                const threshold = ALERT_THRESHOLDS[alertType].count;

                const belowResult = shouldTriggerAlert(alertType, threshold - 1, threshold);
                const atResult = shouldTriggerAlert(alertType, threshold, threshold);

                return belowResult === false && atResult === true;
            }),
            { numRuns: 20 },
        );
    });
});
