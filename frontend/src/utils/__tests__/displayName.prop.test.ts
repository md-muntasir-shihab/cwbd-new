import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { displayName } from '../displayName';

/**
 * Property 1: Populated reference display always yields human-readable text
 *
 * Validates: Requirements 2.4, 7.3
 *
 * For any populated reference value (null, undefined, a raw ObjectId string,
 * an object with full_name, an object with only username, an object with only
 * name, or an empty object), the displayName utility function SHALL return a
 * non-empty human-readable string (never a raw 24-character hex ObjectId),
 * falling back to "—" when no name field is available.
 */

/** Matches a raw 24-character hex MongoDB ObjectId */
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Arbitrary that generates the full range of populated reference shapes:
 * null, undefined, plain strings, objects with various field combos, empty objects.
 */
const populatedRefArb = fc.oneof(
    // null / undefined
    fc.constant(null),
    fc.constant(undefined),

    // plain strings (including empty)
    fc.string(),

    // object with full_name (highest priority field)
    fc.record({
        full_name: fc.string({ minLength: 1 }),
        username: fc.option(fc.string(), { nil: undefined }),
        email: fc.option(fc.string(), { nil: undefined }),
    }),

    // object with name only (vendor-style)
    fc.record({
        name: fc.string({ minLength: 1 }),
    }),

    // object with username only (fallback)
    fc.record({
        username: fc.string({ minLength: 1 }),
    }),

    // object with all three fields
    fc.record({
        full_name: fc.string({ minLength: 1 }),
        name: fc.string({ minLength: 1 }),
        username: fc.string({ minLength: 1 }),
    }),

    // empty object (no name fields)
    fc.constant({}),

    // object with only non-name fields
    fc.record({
        _id: fc.string(),
        email: fc.string(),
    }),
);

describe('Feature: finance-detail-view, Property 1: Populated reference display always yields human-readable text', () => {
    it('always returns a non-empty string for any reference shape', () => {
        fc.assert(
            fc.property(populatedRefArb, (ref) => {
                const result = displayName(ref);
                expect(typeof result).toBe('string');
                expect(result.length).toBeGreaterThan(0);
            }),
            { numRuns: 20 },
        );
    });

    it('never returns a raw 24-character hex ObjectId string', () => {
        fc.assert(
            fc.property(populatedRefArb, (ref) => {
                const result = displayName(ref);
                expect(result).not.toMatch(OBJECT_ID_RE);
            }),
            { numRuns: 20 },
        );
    });
});
