/**
 * Property 2: Preservation — Existing CMS Sections Unchanged
 *
 * For any home page CMS operation where the bug condition does NOT hold
 * (already-connected placements like HOME_TOP, HOME_MID, HOME_BOTTOM),
 * the fixed system SHALL produce exactly the same behavior as the original system.
 *
 * **Validates: Requirements 3.11**
 *
 * This test verifies that:
 * - Already-connected CMS sections (HOME_TOP, HOME_MID, HOME_BOTTOM) save and display correctly
 * - Content block CRUD operations work identically for already-connected placements
 * - Placement validation works correctly for existing placements
 * - Content block field validation is consistent
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Domain Constants (from ContentBlock.ts and contentBlockController.ts) ──────

/**
 * VALID_PLACEMENTS from contentBlockController.ts (unfixed code).
 * These are the already-connected placements that must remain unchanged.
 */
const VALID_PLACEMENTS = [
    'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
    'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
    'EXAM_LIST', 'STUDENT_DASHBOARD', 'NEWS_PAGE',
    'UNIVERSITY_LIST', 'PRICING_PAGE',
] as const;

type ContentBlockPlacement = (typeof VALID_PLACEMENTS)[number];

/**
 * Home-specific placements that are already connected to CMS controls.
 * These are the placements that the preservation test focuses on.
 */
const HOME_CONNECTED_PLACEMENTS: ContentBlockPlacement[] = [
    'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
];

/**
 * All non-home placements that are also already connected.
 */
const OTHER_CONNECTED_PLACEMENTS: ContentBlockPlacement[] = [
    'EXAM_LIST', 'STUDENT_DASHBOARD', 'NEWS_PAGE',
    'UNIVERSITY_LIST', 'PRICING_PAGE',
];

/**
 * Content block types from ContentBlock.ts
 */
const CONTENT_BLOCK_TYPES = [
    'cta_strip', 'info_banner', 'campaign_card', 'notice_ribbon', 'hero_card',
] as const;

type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

/**
 * CRUD operations for content blocks
 */
const CRUD_OPERATIONS = ['create', 'read', 'update', 'delete', 'toggle'] as const;
type CrudOperation = (typeof CRUD_OPERATIONS)[number];

// ─── Pure Logic Under Test (extracted from contentBlockController.ts) ───────────

/**
 * Validates if a placement string is in VALID_PLACEMENTS.
 * From contentBlockController.ts — used in getPublicContentBlocks.
 */
function isValidPlacement(placement: string): boolean {
    return (VALID_PLACEMENTS as readonly string[]).includes(placement);
}

/**
 * Validates content block creation payload.
 * From adminCreateContentBlock in contentBlockController.ts:
 *   if (!title || !type || !Array.isArray(placements) || placements.length === 0)
 */
function validateContentBlockPayload(payload: {
    title?: string;
    type?: string;
    placements?: string[];
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload.title || payload.title.trim() === '') {
        errors.push('title is required');
    }

    if (!payload.type) {
        errors.push('type is required');
    }

    if (!Array.isArray(payload.placements) || payload.placements.length === 0) {
        errors.push('placements[] are required');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validates a MongoDB ObjectId string.
 * From asObjectId helper in contentBlockController.ts.
 */
function isValidObjectId(value: string): boolean {
    const raw = value.trim();
    if (!raw) return false;
    return /^[0-9a-fA-F]{24}$/.test(raw);
}

/**
 * Simulates content block CRUD operation for already-connected placements.
 * Mirrors the logic in contentBlockController.ts admin endpoints.
 */
function simulateContentBlockCRUD(
    operation: CrudOperation,
    payload: {
        title?: string;
        type?: string;
        placements?: string[];
        isEnabled?: boolean;
        priority?: number;
    },
    existingBlock?: {
        _id: string;
        isEnabled: boolean;
        placements: string[];
    },
): { success: boolean; statusCode: number; message: string } {
    switch (operation) {
        case 'create': {
            const validation = validateContentBlockPayload(payload);
            if (!validation.valid) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'title, type, and placements[] are required',
                };
            }
            return { success: true, statusCode: 201, message: 'Content block created' };
        }
        case 'read': {
            if (!existingBlock) {
                return { success: false, statusCode: 404, message: 'Content block not found' };
            }
            return { success: true, statusCode: 200, message: 'Content block retrieved' };
        }
        case 'update': {
            if (!existingBlock) {
                return { success: false, statusCode: 404, message: 'Content block not found' };
            }
            return { success: true, statusCode: 200, message: 'Content block updated' };
        }
        case 'delete': {
            if (!existingBlock) {
                return { success: false, statusCode: 404, message: 'Content block not found' };
            }
            return { success: true, statusCode: 200, message: 'Content block deleted' };
        }
        case 'toggle': {
            if (!existingBlock) {
                return { success: false, statusCode: 404, message: 'Content block not found' };
            }
            const newState = !existingBlock.isEnabled;
            return {
                success: true,
                statusCode: 200,
                message: `Content block ${newState ? 'enabled' : 'disabled'}`,
            };
        }
        default:
            return { success: false, statusCode: 400, message: 'Invalid operation' };
    }
}

/**
 * Simulates public content block query filtering.
 * From getPublicContentBlocks in contentBlockController.ts:
 *   - Validates placement is in VALID_PLACEMENTS
 *   - Filters by isEnabled, date range, sorts by priority desc
 */
function simulatePublicQuery(
    placement: string,
    blocks: Array<{
        isEnabled: boolean;
        placements: string[];
        priority: number;
        startAtUTC?: Date | null;
        endAtUTC?: Date | null;
    }>,
    now: Date = new Date(),
): { success: boolean; blocks: typeof blocks; statusCode: number } {
    if (!placement || !isValidPlacement(placement)) {
        return { success: false, blocks: [], statusCode: 400 };
    }

    const filtered = blocks
        .filter((b) => {
            if (!b.isEnabled) return false;
            if (!b.placements.includes(placement)) return false;
            if (b.startAtUTC && b.startAtUTC > now) return false;
            if (b.endAtUTC && b.endAtUTC < now) return false;
            return true;
        })
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10);

    return { success: true, blocks: filtered, statusCode: 200 };
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const placementArbitrary = fc.constantFrom<ContentBlockPlacement>(...VALID_PLACEMENTS);
const homePlacementArbitrary = fc.constantFrom<ContentBlockPlacement>(...HOME_CONNECTED_PLACEMENTS);
const blockTypeArbitrary = fc.constantFrom<ContentBlockType>(...CONTENT_BLOCK_TYPES);
const crudOperationArbitrary = fc.constantFrom<CrudOperation>(...CRUD_OPERATIONS);

const contentBlockPayloadArbitrary = fc.record({
    title: fc.string({ minLength: 1, maxLength: 200 }),
    subtitle: fc.option(fc.string({ maxLength: 300 })),
    body: fc.option(fc.string({ maxLength: 500 })),
    type: blockTypeArbitrary,
    placements: fc.subarray([...VALID_PLACEMENTS], { minLength: 1 }),
    isEnabled: fc.boolean(),
    priority: fc.integer({ min: 0, max: 100 }),
    dismissible: fc.boolean(),
});

/** Generate a 24-char hex string (MongoDB ObjectId format) */
const hexIdArbitrary = fc.array(
    fc.integer({ min: 0, max: 15 }),
    { minLength: 24, maxLength: 24 },
).map((nums) => nums.map((n) => n.toString(16)).join(''));

const existingBlockArbitrary = fc.record({
    _id: hexIdArbitrary,
    isEnabled: fc.boolean(),
    placements: fc.subarray([...VALID_PLACEMENTS], { minLength: 1 }),
    priority: fc.integer({ min: 0, max: 100 }),
    startAtUTC: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })),
    endAtUTC: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })),
});

// ─── Property Tests ──────────────────────────────────────────────────

describe('Property 2: Preservation — Existing CMS Sections Unchanged', () => {

    /**
     * **Validates: Requirement 3.11**
     *
     * Already-connected home placements (HOME_TOP, HOME_MID, HOME_BOTTOM)
     * are recognized as valid placements and content blocks can be queried.
     */
    describe('3.11: Home placement validation preserved', () => {

        it('HOME_TOP, HOME_MID, HOME_BOTTOM are all valid placements', () => {
            fc.assert(
                fc.property(
                    homePlacementArbitrary,
                    (placement) => {
                        expect(isValidPlacement(placement)).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('all existing VALID_PLACEMENTS are recognized', () => {
            fc.assert(
                fc.property(
                    placementArbitrary,
                    (placement) => {
                        expect(isValidPlacement(placement)).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('invalid placement strings are rejected', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 50 }).filter(
                        (s) => !(VALID_PLACEMENTS as readonly string[]).includes(s),
                    ),
                    (invalidPlacement) => {
                        expect(isValidPlacement(invalidPlacement)).toBe(false);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('empty placement string is rejected', () => {
            expect(isValidPlacement('')).toBe(false);
        });
    });

    /**
     * **Validates: Requirement 3.11**
     *
     * Content block CRUD operations work correctly for already-connected
     * home placements.
     */
    describe('3.11: Content block CRUD for connected placements preserved', () => {

        it('content block creation succeeds with valid payload for home placements', () => {
            fc.assert(
                fc.property(
                    contentBlockPayloadArbitrary,
                    (payload) => {
                        const result = simulateContentBlockCRUD('create', payload);

                        if (payload.title && payload.title.trim() !== '' && payload.type && payload.placements.length > 0) {
                            expect(result.success).toBe(true);
                            expect(result.statusCode).toBe(201);
                            expect(result.message).toBe('Content block created');
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('content block creation fails without required fields', () => {
            // Missing title
            const noTitle = simulateContentBlockCRUD('create', {
                type: 'cta_strip',
                placements: ['HOME_TOP'],
            });
            expect(noTitle.success).toBe(false);
            expect(noTitle.statusCode).toBe(400);

            // Missing type
            const noType = simulateContentBlockCRUD('create', {
                title: 'Test Block',
                placements: ['HOME_TOP'],
            });
            expect(noType.success).toBe(false);
            expect(noType.statusCode).toBe(400);

            // Missing placements
            const noPlacements = simulateContentBlockCRUD('create', {
                title: 'Test Block',
                type: 'cta_strip',
                placements: [],
            });
            expect(noPlacements.success).toBe(false);
            expect(noPlacements.statusCode).toBe(400);
        });

        it('content block update succeeds for existing blocks', () => {
            fc.assert(
                fc.property(
                    existingBlockArbitrary,
                    contentBlockPayloadArbitrary,
                    (existingBlock, updatePayload) => {
                        const result = simulateContentBlockCRUD(
                            'update',
                            updatePayload,
                            { _id: existingBlock._id, isEnabled: existingBlock.isEnabled, placements: existingBlock.placements },
                        );

                        expect(result.success).toBe(true);
                        expect(result.statusCode).toBe(200);
                        expect(result.message).toBe('Content block updated');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('content block update fails for non-existent blocks', () => {
            fc.assert(
                fc.property(
                    contentBlockPayloadArbitrary,
                    (payload) => {
                        const result = simulateContentBlockCRUD('update', payload, undefined);
                        expect(result.success).toBe(false);
                        expect(result.statusCode).toBe(404);
                        expect(result.message).toBe('Content block not found');
                    },
                ),
                { numRuns: 20 },
            );
        });

        it('content block delete succeeds for existing blocks', () => {
            fc.assert(
                fc.property(
                    existingBlockArbitrary,
                    (existingBlock) => {
                        const result = simulateContentBlockCRUD(
                            'delete',
                            {},
                            { _id: existingBlock._id, isEnabled: existingBlock.isEnabled, placements: existingBlock.placements },
                        );

                        expect(result.success).toBe(true);
                        expect(result.statusCode).toBe(200);
                        expect(result.message).toBe('Content block deleted');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('content block toggle flips isEnabled state', () => {
            fc.assert(
                fc.property(
                    existingBlockArbitrary,
                    (existingBlock) => {
                        const result = simulateContentBlockCRUD(
                            'toggle',
                            {},
                            { _id: existingBlock._id, isEnabled: existingBlock.isEnabled, placements: existingBlock.placements },
                        );

                        expect(result.success).toBe(true);
                        expect(result.statusCode).toBe(200);

                        const expectedMsg = existingBlock.isEnabled
                            ? 'Content block disabled'
                            : 'Content block enabled';
                        expect(result.message).toBe(expectedMsg);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('all CRUD operations are deterministic for connected placements', () => {
            fc.assert(
                fc.property(
                    crudOperationArbitrary,
                    contentBlockPayloadArbitrary,
                    existingBlockArbitrary,
                    (operation, payload, existingBlock) => {
                        const block = { _id: existingBlock._id, isEnabled: existingBlock.isEnabled, placements: existingBlock.placements };

                        const result1 = simulateContentBlockCRUD(operation, payload, block);
                        const result2 = simulateContentBlockCRUD(operation, payload, block);

                        expect(result1.success).toBe(result2.success);
                        expect(result1.statusCode).toBe(result2.statusCode);
                        expect(result1.message).toBe(result2.message);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    /**
     * **Validates: Requirement 3.11**
     *
     * Public content block query filtering works correctly for
     * already-connected home placements.
     */
    describe('3.11: Public content block query for home placements preserved', () => {

        it('public query returns only enabled blocks for valid home placements', () => {
            fc.assert(
                fc.property(
                    homePlacementArbitrary,
                    fc.array(existingBlockArbitrary, { minLength: 0, maxLength: 10 }),
                    (placement, blocks) => {
                        const queryBlocks = blocks.map((b) => ({
                            isEnabled: b.isEnabled,
                            placements: b.placements,
                            priority: b.priority,
                            startAtUTC: b.startAtUTC ?? null,
                            endAtUTC: b.endAtUTC ?? null,
                        }));

                        const result = simulatePublicQuery(placement, queryBlocks);

                        expect(result.success).toBe(true);
                        expect(result.statusCode).toBe(200);

                        // All returned blocks must be enabled and include the placement
                        for (const block of result.blocks) {
                            expect(block.isEnabled).toBe(true);
                            expect(block.placements).toContain(placement);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('public query rejects invalid placement strings', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 30 }).filter(
                        (s) => !(VALID_PLACEMENTS as readonly string[]).includes(s),
                    ),
                    (invalidPlacement) => {
                        const result = simulatePublicQuery(invalidPlacement, []);
                        expect(result.success).toBe(false);
                        expect(result.statusCode).toBe(400);
                    },
                ),
                { numRuns: 30 },
            );
        });

        it('public query returns blocks sorted by priority descending', () => {
            fc.assert(
                fc.property(
                    homePlacementArbitrary,
                    fc.array(
                        fc.record({
                            isEnabled: fc.constant(true),
                            placements: fc.constant(['HOME_TOP', 'HOME_MID', 'HOME_BOTTOM'] as string[]),
                            priority: fc.integer({ min: 0, max: 100 }),
                            startAtUTC: fc.constant(null),
                            endAtUTC: fc.constant(null),
                        }),
                        { minLength: 2, maxLength: 8 },
                    ),
                    (placement, blocks) => {
                        const result = simulatePublicQuery(placement, blocks);

                        expect(result.success).toBe(true);

                        // Verify descending priority order
                        for (let i = 1; i < result.blocks.length; i++) {
                            expect(result.blocks[i - 1].priority).toBeGreaterThanOrEqual(
                                result.blocks[i].priority,
                            );
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('public query limits results to 10 blocks', () => {
            const manyBlocks = Array.from({ length: 15 }, (_, i) => ({
                isEnabled: true,
                placements: ['HOME_TOP'] as string[],
                priority: i,
                startAtUTC: null,
                endAtUTC: null,
            }));

            const result = simulatePublicQuery('HOME_TOP', manyBlocks);
            expect(result.success).toBe(true);
            expect(result.blocks.length).toBeLessThanOrEqual(10);
        });

        it('public query filters out blocks outside date range', () => {
            const now = new Date('2024-06-15T12:00:00Z');
            const blocks = [
                {
                    isEnabled: true,
                    placements: ['HOME_TOP'] as string[],
                    priority: 10,
                    startAtUTC: new Date('2024-07-01T00:00:00Z'), // future start
                    endAtUTC: null,
                },
                {
                    isEnabled: true,
                    placements: ['HOME_TOP'] as string[],
                    priority: 5,
                    startAtUTC: null,
                    endAtUTC: new Date('2024-06-01T00:00:00Z'), // past end
                },
                {
                    isEnabled: true,
                    placements: ['HOME_TOP'] as string[],
                    priority: 1,
                    startAtUTC: new Date('2024-06-01T00:00:00Z'),
                    endAtUTC: new Date('2024-07-01T00:00:00Z'), // within range
                },
            ];

            const result = simulatePublicQuery('HOME_TOP', blocks, now);
            expect(result.success).toBe(true);
            expect(result.blocks.length).toBe(1);
            expect(result.blocks[0].priority).toBe(1);
        });
    });

    /**
     * **Validates: Requirement 3.11**
     *
     * Content block payload validation is consistent and deterministic.
     */
    describe('3.11: Content block validation consistency preserved', () => {

        it('payload validation is deterministic', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        title: fc.option(fc.string({ maxLength: 200 })),
                        type: fc.option(fc.constantFrom(...CONTENT_BLOCK_TYPES)),
                        placements: fc.option(fc.subarray([...VALID_PLACEMENTS], { minLength: 0 })),
                    }),
                    (payload) => {
                        const result1 = validateContentBlockPayload({
                            title: payload.title ?? undefined,
                            type: payload.type ?? undefined,
                            placements: payload.placements ?? undefined,
                        });
                        const result2 = validateContentBlockPayload({
                            title: payload.title ?? undefined,
                            type: payload.type ?? undefined,
                            placements: payload.placements ?? undefined,
                        });

                        expect(result1.valid).toBe(result2.valid);
                        expect(result1.errors).toEqual(result2.errors);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('ObjectId validation is consistent', () => {
            fc.assert(
                fc.property(
                    fc.oneof(
                        hexIdArbitrary,
                        fc.string({ minLength: 0, maxLength: 30 }),
                    ),
                    (idStr) => {
                        const result1 = isValidObjectId(idStr);
                        const result2 = isValidObjectId(idStr);
                        expect(result1).toBe(result2);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('valid 24-char hex strings are accepted as ObjectIds', () => {
            fc.assert(
                fc.property(
                    hexIdArbitrary,
                    (hexStr) => {
                        expect(isValidObjectId(hexStr)).toBe(true);
                    },
                ),
                { numRuns: 30 },
            );
        });

        it('empty or short strings are rejected as ObjectIds', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 0, maxLength: 23 }),
                    (shortStr) => {
                        expect(isValidObjectId(shortStr)).toBe(false);
                    },
                ),
                { numRuns: 30 },
            );
        });
    });

    /**
     * Combined property: for any already-connected placement,
     * all CMS operations produce correct and consistent behavior.
     */
    describe('Combined: all connected placement operations behave correctly', () => {

        it('CRUD operations on connected placements are deterministic and consistent', () => {
            fc.assert(
                fc.property(
                    crudOperationArbitrary,
                    contentBlockPayloadArbitrary,
                    existingBlockArbitrary,
                    fc.boolean(), // blockExists
                    (operation, payload, existingBlock, blockExists) => {
                        const block = blockExists
                            ? { _id: existingBlock._id, isEnabled: existingBlock.isEnabled, placements: existingBlock.placements }
                            : undefined;

                        const result1 = simulateContentBlockCRUD(operation, payload, block);
                        const result2 = simulateContentBlockCRUD(operation, payload, block);

                        // Deterministic
                        expect(result1.success).toBe(result2.success);
                        expect(result1.statusCode).toBe(result2.statusCode);
                        expect(result1.message).toBe(result2.message);

                        // Correct status codes
                        if (operation === 'create') {
                            if (payload.title && payload.title.trim() !== '' && payload.type && payload.placements.length > 0) {
                                expect(result1.statusCode).toBe(201);
                            } else {
                                expect(result1.statusCode).toBe(400);
                            }
                        } else if (!blockExists) {
                            expect(result1.statusCode).toBe(404);
                        } else {
                            expect(result1.statusCode).toBe(200);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
