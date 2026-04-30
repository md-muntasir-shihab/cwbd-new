/**
 * Frontend Property-Based Tests — Integration Panel Audit
 *
 * Tests:
 * - 13.4 (Property 5): Category label completeness
 * - 13.5 (Property 8): Config field validation
 * - 13.6 (Property 11): Relative time formatting
 *
 * Library: fast-check
 * Minimum iterations: 100
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    getCategoryLabel,
    CATEGORY_LABELS,
    validateIntegrationFields,
    formatRelative,
} from '../pages/AdminSettingsIntegrations';
import type { IntegrationConfigField } from '../services/integrationsApi';

// ─── 13.4 Property 5: Category label completeness ───────────────────────────
// For any backend category, CATEGORY_LABELS returns non-empty string.
// For any unknown category string, the UI produces a fallback label.

describe('Feature: integration-panel-audit, Property 5: category label completeness', () => {
    /**
     * **Validates: Requirements 5.3**
     */
    it('returns a non-empty string for all known backend categories', () => {
        const BACKEND_CATEGORIES = ['search', 'image', 'email', 'marketing', 'notifications', 'analytics', 'backup', 'storage'];

        for (const category of BACKEND_CATEGORIES) {
            const label = getCategoryLabel(category);
            expect(label).toBeTruthy();
            expect(label.length).toBeGreaterThan(0);
            // Should be in CATEGORY_LABELS for known categories
            expect(CATEGORY_LABELS[category]).toBeDefined();
        }
    });

    /**
     * **Validates: Requirements 5.4**
     */
    it('returns a non-empty fallback label for any arbitrary unknown category string', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !CATEGORY_LABELS[s]),
                (unknownCategory) => {
                    const label = getCategoryLabel(unknownCategory);
                    // Must return a non-empty string
                    expect(label.length).toBeGreaterThan(0);
                    // Must not be undefined or null
                    expect(label).toBeTruthy();
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 5.3, 5.4**
     */
    it('for any category string (known or unknown), getCategoryLabel always returns a non-empty string', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }),
                (category) => {
                    const label = getCategoryLabel(category);
                    expect(typeof label).toBe('string');
                    expect(label.length).toBeGreaterThan(0);
                },
            ),
            { numRuns: 100 },
        );
    });
});

// ─── 13.5 Property 8: Config field validation ───────────────────────────────
// For any invalid URL/number/empty-required input, validation rejects.

describe('Feature: integration-panel-audit, Property 8: config field validation', () => {
    /**
     * **Validates: Requirements 8.1**
     */
    it('rejects empty values for required fields', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 30 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (fieldName, fieldLabel) => {
                    const fields: IntegrationConfigField[] = [
                        { name: fieldName, label: fieldLabel, type: 'text', required: true },
                    ];
                    const values: Record<string, string> = { [fieldName]: '' };
                    const errors = validateIntegrationFields(fields, values);
                    expect(errors[fieldName]).toBeDefined();
                    expect(errors[fieldName].length).toBeGreaterThan(0);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 8.2**
     */
    it('rejects invalid URLs for url-type fields', () => {
        // Generate strings that are NOT valid URLs and not whitespace-only
        // (whitespace-only strings trim to empty and are skipped by validation)
        const invalidUrlArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
            if (s.trim() === '') return false; // whitespace-only → treated as empty, skip
            try {
                new URL(s);
                return false; // valid URL, skip
            } catch {
                return true; // invalid URL, keep
            }
        });

        fc.assert(
            fc.property(
                invalidUrlArb,
                (invalidUrl) => {
                    const fields: IntegrationConfigField[] = [
                        { name: 'testUrl', label: 'Test URL', type: 'url' },
                    ];
                    const values: Record<string, string> = { testUrl: invalidUrl };
                    const errors = validateIntegrationFields(fields, values);
                    expect(errors['testUrl']).toBeDefined();
                    expect(errors['testUrl']).toContain('valid URL');
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 8.3**
     */
    it('rejects invalid numbers for number-type fields', () => {
        // Generate strings that are NOT valid finite numbers
        const invalidNumberArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            const trimmed = s.trim();
            if (trimmed === '') return false; // empty is handled by required check
            const n = Number(trimmed);
            return !Number.isFinite(n);
        });

        fc.assert(
            fc.property(
                invalidNumberArb,
                (invalidNumber) => {
                    const fields: IntegrationConfigField[] = [
                        { name: 'testNum', label: 'Test Number', type: 'number' },
                    ];
                    const values: Record<string, string> = { testNum: invalidNumber };
                    const errors = validateIntegrationFields(fields, values);
                    expect(errors['testNum']).toBeDefined();
                    expect(errors['testNum']).toContain('valid number');
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 8.2**
     */
    it('accepts valid URLs for url-type fields', () => {
        const validUrlArb = fc.webUrl();

        fc.assert(
            fc.property(
                validUrlArb,
                (validUrl) => {
                    const fields: IntegrationConfigField[] = [
                        { name: 'testUrl', label: 'Test URL', type: 'url' },
                    ];
                    const values: Record<string, string> = { testUrl: validUrl };
                    const errors = validateIntegrationFields(fields, values);
                    expect(errors['testUrl']).toBeUndefined();
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 8.3**
     */
    it('accepts valid numbers for number-type fields', () => {
        fc.assert(
            fc.property(
                fc.double({ noNaN: true, noDefaultInfinity: true }),
                (validNumber) => {
                    const fields: IntegrationConfigField[] = [
                        { name: 'testNum', label: 'Test Number', type: 'number' },
                    ];
                    const values: Record<string, string> = { testNum: String(validNumber) };
                    const errors = validateIntegrationFields(fields, values);
                    expect(errors['testNum']).toBeUndefined();
                },
            ),
            { numRuns: 100 },
        );
    });
});

// ─── 13.6 Property 11: Relative time formatting ─────────────────────────────
// For any past ISO date, formatRelative returns time-ago string.

describe('Feature: integration-panel-audit, Property 11: relative time formatting', () => {
    /**
     * **Validates: Requirements 9.2**
     */
    it('returns "never" for null input', () => {
        expect(formatRelative(null)).toBe('never');
    });

    /**
     * **Validates: Requirements 9.2**
     */
    it('returns a time-ago string containing a time unit suffix for any past ISO date', () => {
        // Generate past dates (between 1 second ago and 365 days ago)
        const pastDateArb = fc.integer({ min: 1, max: 365 * 24 * 60 * 60 }).map((secondsAgo) => {
            const date = new Date(Date.now() - secondsAgo * 1000);
            return date.toISOString();
        });

        fc.assert(
            fc.property(
                pastDateArb,
                (isoDate) => {
                    const result = formatRelative(isoDate);
                    // Must be a non-empty string
                    expect(result.length).toBeGreaterThan(0);
                    // Must contain "ago" suffix (e.g., "5s ago", "3m ago", "2h ago", "1d ago")
                    expect(result).toContain('ago');
                    // Must contain a time unit (s, m, h, or d)
                    expect(result).toMatch(/\d+(s|m|h|d) ago/);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 9.2**
     */
    it('returns "never" for invalid ISO date strings', () => {
        const invalidDateArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            return Number.isNaN(Date.parse(s));
        });

        fc.assert(
            fc.property(
                invalidDateArb,
                (invalidDate) => {
                    const result = formatRelative(invalidDate);
                    expect(result).toBe('never');
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirements 9.2**
     */
    it('returns correct time unit based on elapsed time', () => {
        // Test seconds range (0-59 seconds ago)
        const recentDate = new Date(Date.now() - 30 * 1000).toISOString();
        expect(formatRelative(recentDate)).toMatch(/\d+s ago/);

        // Test minutes range (1-59 minutes ago)
        const minutesDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        expect(formatRelative(minutesDate)).toMatch(/\d+m ago/);

        // Test hours range (1-23 hours ago)
        const hoursDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
        expect(formatRelative(hoursDate)).toMatch(/\d+h ago/);

        // Test days range (1+ days ago)
        const daysDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        expect(formatRelative(daysDate)).toMatch(/\d+d ago/);
    });
});
