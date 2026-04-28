/**
 * Property 9: Lean API projection contains only specified fields
 *
 * Feature: home-card-cleanup-redesign, Property 9: Lean API projection contains only specified fields
 *
 * Validates: Requirements 7.1, 7.2
 *
 * For any university document object, mapLeanDeadlinePreview SHALL produce
 * an object containing exactly the 12 specified fields and no additional fields.
 */
import fc from 'fast-check';
import { mapLeanDeadlinePreview, mapLeanExamPreview } from '../src/controllers/homeAggregateController';

const EXPECTED_DEADLINE_KEYS: readonly string[] = [
    'id',
    'name',
    'shortForm',
    'slug',
    'category',
    'applicationStartDate',
    'applicationEndDate',
    'admissionWebsite',
    'logoUrl',
    'isHistorical',
    'endedAt',
    'timelineStatus',
];

/** Simple hex-like ID arbitrary (no filter needed) */
const arbObjectId = fc.tuple(
    fc.integer({ min: 0, max: 0xffffff }),
    fc.integer({ min: 0, max: 0xffffff }),
    fc.integer({ min: 0, max: 0xffffff }),
    fc.integer({ min: 0, max: 0xffffff }),
).map(([a, b, c, d]) =>
    [a, b, c, d].map((n) => n.toString(16).padStart(6, '0')).join(''),
);

/** Simple lowercase alpha key arbitrary (no filter needed) */
const arbExtraKey = fc.constantFrom(
    'foo', 'bar', 'baz', 'qux', 'extra', 'random', 'junk', 'noise', 'temp', 'misc',
    'xfield', 'yfield', 'zfield', 'data', 'meta',
);

const arbIsoDate = fc
    .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
    .map((ts) => new Date(ts).toISOString());

/**
 * Arbitrary that generates a random university-like document with the core
 * fields plus arbitrary extra fields to ensure the mapper strips them.
 */
const arbUniversityDocument = fc
    .record(
        {
            _id: fc.oneof(arbObjectId, fc.constant(undefined)),
            id: fc.oneof(arbObjectId, fc.constant(undefined)),
            name: fc.oneof(fc.string({ minLength: 0, maxLength: 80 }), fc.constant(undefined)),
            shortForm: fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.constant(undefined)),
            slug: fc.oneof(fc.string({ minLength: 1, maxLength: 30 }), fc.constant(undefined)),
            category: fc.oneof(
                fc.constantFrom('Individual Admission', 'Science & Technology', 'Medical College', 'DCU'),
                fc.string({ minLength: 0, maxLength: 40 }),
                fc.constant(undefined),
            ),
            applicationStartDate: fc.oneof(arbIsoDate, fc.constant(undefined), fc.constant('')),
            applicationEndDate: fc.oneof(arbIsoDate, fc.constant(undefined), fc.constant('')),
            admissionWebsite: fc.oneof(fc.constant('https://example.com'), fc.string(), fc.constant(undefined)),
            logoUrl: fc.oneof(fc.constant('https://logo.example.com/img.png'), fc.string(), fc.constant(undefined)),
            isHistorical: fc.oneof(fc.boolean(), fc.constant(undefined)),
            endedAt: fc.oneof(arbIsoDate, fc.constant(undefined), fc.constant('')),
            timelineStatus: fc.oneof(fc.constantFrom('upcoming', 'ended'), fc.constant(undefined), fc.constant('invalid')),
            // Extra fields that should NOT appear in the lean output
            contactNumber: fc.oneof(fc.string(), fc.constant(undefined)),
            established: fc.oneof(fc.integer({ min: 1900, max: 2030 }), fc.constant(undefined)),
            address: fc.oneof(fc.string(), fc.constant(undefined)),
            email: fc.oneof(fc.string(), fc.constant(undefined)),
            website: fc.oneof(fc.string(), fc.constant(undefined)),
            totalSeats: fc.oneof(fc.nat().map(String), fc.constant(undefined)),
            scienceSeats: fc.oneof(fc.nat().map(String), fc.constant(undefined)),
            artsSeats: fc.oneof(fc.nat().map(String), fc.constant(undefined)),
            businessSeats: fc.oneof(fc.nat().map(String), fc.constant(undefined)),
            scienceExamDate: fc.oneof(arbIsoDate, fc.constant(undefined)),
            artsExamDate: fc.oneof(arbIsoDate, fc.constant(undefined)),
            businessExamDate: fc.oneof(arbIsoDate, fc.constant(undefined)),
            examCenters: fc.oneof(fc.array(fc.record({ city: fc.string() }), { maxLength: 3 }), fc.constant(undefined)),
            shortDescription: fc.oneof(fc.string(), fc.constant(undefined)),
            clusterGroup: fc.oneof(fc.string(), fc.constant(undefined)),
            clusterId: fc.oneof(fc.string(), fc.constant(undefined)),
        },
        { requiredKeys: [] },
    )
    .chain((base) =>
        // Add random extra keys to stress-test field stripping
        fc.dictionary(
            arbExtraKey,
            fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
            { minKeys: 0, maxKeys: 5 },
        ).map((extras) => ({ ...extras, ...base })),
    );

describe('Property 9: Lean API projection contains only specified fields', () => {
    it('mapLeanDeadlinePreview output contains exactly the 12 specified fields and no extras', () => {
        fc.assert(
            fc.property(arbUniversityDocument, (doc) => {
                const result = mapLeanDeadlinePreview(doc as Record<string, unknown>);
                const resultKeys = Object.keys(result).sort();
                const expectedKeys = [...EXPECTED_DEADLINE_KEYS].sort();

                // Must have exactly the 12 expected keys
                expect(resultKeys).toEqual(expectedKeys);

                // Double-check: no extra keys
                for (const key of resultKeys) {
                    expect(EXPECTED_DEADLINE_KEYS).toContain(key);
                }

                // Double-check: all expected keys present
                for (const key of EXPECTED_DEADLINE_KEYS) {
                    expect(result).toHaveProperty(key);
                }
            }),
            { numRuns: 150, verbose: true },
        );
    });
});

/**
 * Property 9 (continued): Lean API projection — mapLeanExamPreview
 *
 * Feature: home-card-cleanup-redesign, Property 9: Lean API projection contains only specified fields
 *
 * Validates: Requirements 7.1, 7.2
 *
 * For any university document object, mapLeanExamPreview SHALL produce
 * an object containing exactly the 14 specified fields and no additional fields.
 */

const EXPECTED_EXAM_KEYS: readonly string[] = [
    'id',
    'name',
    'shortForm',
    'slug',
    'category',
    'scienceExamDate',
    'artsExamDate',
    'businessExamDate',
    'applicationEndDate',
    'admissionWebsite',
    'logoUrl',
    'isHistorical',
    'endedAt',
    'timelineStatus',
];

describe('Property 9: Lean API projection — mapLeanExamPreview', () => {
    it('mapLeanExamPreview output contains exactly the 14 specified fields and no extras', () => {
        fc.assert(
            fc.property(arbUniversityDocument, (doc) => {
                const result = mapLeanExamPreview(doc as Record<string, unknown>);
                const resultKeys = Object.keys(result).sort();
                const expectedKeys = [...EXPECTED_EXAM_KEYS].sort();

                // Must have exactly the 14 expected keys
                expect(resultKeys).toEqual(expectedKeys);

                // Double-check: no extra keys
                for (const key of resultKeys) {
                    expect(EXPECTED_EXAM_KEYS).toContain(key);
                }

                // Double-check: all expected keys present
                for (const key of EXPECTED_EXAM_KEYS) {
                    expect(result).toHaveProperty(key);
                }
            }),
            { numRuns: 150, verbose: true },
        );
    });
});
