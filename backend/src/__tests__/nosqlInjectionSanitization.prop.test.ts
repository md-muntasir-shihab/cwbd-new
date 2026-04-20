import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeObject } from '../middlewares/requestSanitizer';

/**
 * Feature: exam-question-bank, Property 21: NoSQL injection sanitization
 *
 * **Validates: Requirements 15.5, 15.6**
 *
 * For any text input containing MongoDB operator prefixes (e.g., $gt, $ne, $regex),
 * the sanitization layer should strip or escape these operators before they reach
 * the database query, preventing NoSQL injection.
 */

const MONGO_OPERATORS = [
    '$gt', '$gte', '$lt', '$lte',
    '$ne', '$eq',
    '$in', '$nin',
    '$or', '$and', '$not', '$nor',
    '$regex', '$where', '$exists',
    '$type', '$mod', '$text', '$search',
    '$elemMatch', '$size', '$all',
    '$set', '$unset', '$push', '$pull',
];

/** Recursively collect all keys from a nested object */
function collectAllKeys(obj: unknown): string[] {
    const keys: string[] = [];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            keys.push(key);
            keys.push(...collectAllKeys(value));
        }
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            keys.push(...collectAllKeys(item));
        }
    }
    return keys;
}

/** Generate a MongoDB operator key */
const mongoOperatorArb = fc.constantFrom(...MONGO_OPERATORS);

/** Generate a safe (non-$-prefixed, non-dot, non-blocked) key */
const safeKeyArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.startsWith('$') && !s.includes('.') && s.trim().length > 0)
    .filter((s) => !['__proto__', 'constructor', 'prototype'].includes(s));

/** Generate a simple leaf value (string, number, boolean) */
const leafValueArb = fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
);

describe('Feature: exam-question-bank, Property 21: NoSQL injection sanitization', () => {
    it('strips $-prefixed operator keys from top-level objects', () => {
        fc.assert(
            fc.property(
                mongoOperatorArb,
                leafValueArb,
                (operator, value) => {
                    const malicious = { [operator]: value, name: 'test' };
                    const sanitized = sanitizeObject(malicious);
                    const allKeys = collectAllKeys(sanitized);

                    // The operator key must be stripped
                    expect(allKeys).not.toContain(operator);
                    // Safe keys must survive
                    expect(allKeys).toContain('name');
                },
            ),
            { numRuns: 20 },
        );
    });

    it('strips $-prefixed operator keys from nested objects', () => {
        fc.assert(
            fc.property(
                mongoOperatorArb,
                safeKeyArb,
                leafValueArb,
                (operator, parentKey, value) => {
                    const malicious = {
                        [parentKey]: {
                            [operator]: value,
                            safe: 'kept',
                        },
                    };
                    const sanitized = sanitizeObject(malicious);
                    const allKeys = collectAllKeys(sanitized);

                    // Nested operator key must be stripped
                    expect(allKeys).not.toContain(operator);
                    // The parent key and safe nested key must survive
                    expect(allKeys).toContain(parentKey);
                    expect(allKeys).toContain('safe');
                },
            ),
            { numRuns: 20 },
        );
    });

    it('strips $-prefixed operator keys from objects inside arrays', () => {
        fc.assert(
            fc.property(
                mongoOperatorArb,
                leafValueArb,
                (operator, value) => {
                    const malicious = {
                        items: [
                            { [operator]: value, label: 'item1' },
                            { [operator]: value, label: 'item2' },
                        ],
                    };
                    const sanitized = sanitizeObject(malicious);
                    const allKeys = collectAllKeys(sanitized);

                    expect(allKeys).not.toContain(operator);
                    // Array items' safe keys must survive
                    expect(allKeys.filter((k) => k === 'label')).toHaveLength(2);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('passes clean inputs through unchanged', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
                    age: fc.integer({ min: 0, max: 150 }),
                    active: fc.boolean(),
                }),
                (cleanInput) => {
                    const sanitized = sanitizeObject(cleanInput);

                    expect(sanitized).toEqual(cleanInput);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('strips all $-prefixed keys from deeply nested structures', () => {
        fc.assert(
            fc.property(
                mongoOperatorArb,
                safeKeyArb,
                safeKeyArb,
                leafValueArb,
                (operator, key1, key2, value) => {
                    const malicious = {
                        [key1]: {
                            [key2]: {
                                [operator]: value,
                                clean: 'data',
                            },
                        },
                    };
                    const sanitized = sanitizeObject(malicious);
                    const allKeys = collectAllKeys(sanitized);

                    // No $-prefixed key should survive at any depth
                    for (const key of allKeys) {
                        expect(key.startsWith('$')).toBe(false);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('handles mixed malicious and clean keys, preserving only clean ones', () => {
        fc.assert(
            fc.property(
                fc.array(mongoOperatorArb, { minLength: 1, maxLength: 5 }),
                fc.array(safeKeyArb, { minLength: 1, maxLength: 5 }),
                leafValueArb,
                (operators, safeKeys, value) => {
                    const input: Record<string, unknown> = {};
                    for (const op of operators) {
                        input[op] = value;
                    }
                    for (const key of safeKeys) {
                        input[key] = value;
                    }

                    const sanitized = sanitizeObject(input);
                    const allKeys = collectAllKeys(sanitized);

                    // All operator keys must be gone
                    for (const op of operators) {
                        expect(allKeys).not.toContain(op);
                    }
                    // All safe keys must remain
                    for (const key of safeKeys) {
                        expect(allKeys).toContain(key);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });
});
