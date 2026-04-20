import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeObject, sanitizeStringValue } from '../middlewares/requestSanitizer';

/**
 * Property 9: Request Sanitization Safety
 *
 * Validates: Requirements 4.1, 4.4, 4.5
 *
 * For any input object, after sanitization:
 * - No `__proto__`, `constructor`, `prototype` keys exist (prototype pollution blocked)
 * - No `$`-prefixed MongoDB operator keys exist (NoSQL injection blocked)
 * - HTML content only contains allowed tags
 */

const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];
const ALLOWED_HTML_TAGS = ['b', 'strong', 'i', 'em', 'u', 'p', 'ul', 'ol', 'li', 'br', 'a', 'blockquote', 'code', 'pre'];

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

/** Recursively collect all string values from a nested object */
function collectAllStringValues(obj: unknown): string[] {
    const values: string[] = [];
    if (typeof obj === 'string') {
        values.push(obj);
    } else if (Array.isArray(obj)) {
        for (const item of obj) {
            values.push(...collectAllStringValues(item));
        }
    } else if (obj && typeof obj === 'object') {
        for (const value of Object.values(obj as Record<string, unknown>)) {
            values.push(...collectAllStringValues(value));
        }
    }
    return values;
}

/**
 * Extract HTML tag names from a string using regex.
 * Returns all tag names found in the string (opening tags only).
 */
function extractHtmlTags(html: string): string[] {
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    const tags: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
        tags.push(match[1].toLowerCase());
    }
    return tags;
}

describe('Property 9: Request Sanitization Safety', () => {
    it('sanitized output has no __proto__, constructor, or prototype keys', () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.anything()),
                (input) => {
                    const sanitized = sanitizeObject(input);
                    const allKeys = collectAllKeys(sanitized);
                    for (const blockedKey of BLOCKED_KEYS) {
                        if (allKeys.includes(blockedKey)) {
                            return false;
                        }
                    }
                    return true;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('sanitized output has no $-prefixed MongoDB operator keys', () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.anything()),
                (input) => {
                    const sanitized = sanitizeObject(input);
                    const allKeys = collectAllKeys(sanitized);
                    for (const key of allKeys) {
                        if (key.startsWith('$')) {
                            return false;
                        }
                    }
                    return true;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('sanitized HTML strings only contain allowed tags', () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.anything()),
                (input) => {
                    const sanitized = sanitizeObject(input);
                    const allStrings = collectAllStringValues(sanitized);
                    for (const str of allStrings) {
                        const tags = extractHtmlTags(str);
                        for (const tag of tags) {
                            if (!ALLOWED_HTML_TAGS.includes(tag)) {
                                return false;
                            }
                        }
                    }
                    return true;
                },
            ),
            { numRuns: 20 },
        );
    });

    it('sanitized HTML from sanitizeStringValue only contains allowed tags', () => {
        fc.assert(
            fc.property(
                fc.string(),
                (input) => {
                    const sanitized = sanitizeStringValue(input);
                    const tags = extractHtmlTags(sanitized);
                    for (const tag of tags) {
                        if (!ALLOWED_HTML_TAGS.includes(tag)) {
                            return false;
                        }
                    }
                    return true;
                },
            ),
            { numRuns: 20 },
        );
    });
});
