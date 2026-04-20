/**
 * Unit tests for Session_Hint lifecycle functions
 * Tests the utility functions in api.ts that manage the Session_Hint in localStorage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to mock localStorage before importing the api module
const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string): string | null => store[key] ?? null),
        setItem: vi.fn((key: string, value: string): void => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string): void => {
            delete store[key];
        }),
        clear: vi.fn((): void => {
            store = {};
        }),
        get length(): number {
            return Object.keys(store).length;
        },
        key: vi.fn((index: number): string | null => {
            const keys = Object.keys(store);
            return keys[index] ?? null;
        }),
        _getStore: () => ({ ...store }),
        _reset: () => {
            store = {};
        },
    };
})();

// Mock window.localStorage
Object.defineProperty(global, 'window', {
    value: {
        localStorage: mockLocalStorage,
    },
    writable: true,
});

// Import the functions after mocking
import {
    markAuthSessionHint,
    clearAuthSessionHint,
    hasAuthSessionHint,
    readAuthSessionHint,
} from '../../services/api';

const SESSION_HINT_KEY = 'campusway-auth-session-hint';

describe('Session_Hint Lifecycle Functions', () => {
    beforeEach(() => {
        // Reset localStorage mock before each test
        mockLocalStorage._reset();
        mockLocalStorage.getItem.mockClear();
        mockLocalStorage.setItem.mockClear();
        mockLocalStorage.removeItem.mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('markAuthSessionHint', () => {
        it('should write correct structure with portal "student"', () => {
            const beforeTime = Date.now();
            markAuthSessionHint('student');
            const afterTime = Date.now();

            expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            const [key, value] = mockLocalStorage.setItem.mock.calls[0];
            expect(key).toBe(SESSION_HINT_KEY);

            const parsed = JSON.parse(value);
            expect(parsed.active).toBe(true);
            expect(parsed.portal).toBe('student');
            expect(parsed.updatedAt).toBeGreaterThanOrEqual(beforeTime);
            expect(parsed.updatedAt).toBeLessThanOrEqual(afterTime);
        });

        it('should write correct structure with portal "admin"', () => {
            markAuthSessionHint('admin');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.active).toBe(true);
            expect(parsed.portal).toBe('admin');
        });

        it('should write correct structure with portal "chairman"', () => {
            markAuthSessionHint('chairman');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.active).toBe(true);
            expect(parsed.portal).toBe('chairman');
        });

        it('should normalize portal to lowercase', () => {
            markAuthSessionHint('STUDENT');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('student');
        });

        it('should trim whitespace from portal', () => {
            markAuthSessionHint('  admin  ');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('admin');
        });

        it('should default to "unknown" when portal is undefined', () => {
            markAuthSessionHint();

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('unknown');
        });

        it('should default to "unknown" when portal is empty string', () => {
            markAuthSessionHint('');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('unknown');
        });

        it('should default to "unknown" when portal is whitespace only', () => {
            markAuthSessionHint('   ');

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('unknown');
        });

        it('should include updatedAt timestamp', () => {
            const beforeTime = Date.now();
            markAuthSessionHint('student');
            const afterTime = Date.now();

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(typeof parsed.updatedAt).toBe('number');
            expect(parsed.updatedAt).toBeGreaterThanOrEqual(beforeTime);
            expect(parsed.updatedAt).toBeLessThanOrEqual(afterTime);
        });

        it('should overwrite existing hint when called again', () => {
            markAuthSessionHint('student');
            markAuthSessionHint('admin');

            expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
            const [, value] = mockLocalStorage.setItem.mock.calls[1];
            const parsed = JSON.parse(value);
            expect(parsed.portal).toBe('admin');
        });
    });

    describe('clearAuthSessionHint', () => {
        it('should remove the key from localStorage', () => {
            // First write a hint
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify({ active: true, portal: 'student', updatedAt: Date.now() }));

            clearAuthSessionHint();

            expect(mockLocalStorage.removeItem).toHaveBeenCalledTimes(1);
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(SESSION_HINT_KEY);
        });

        it('should not throw when key does not exist', () => {
            expect(() => clearAuthSessionHint()).not.toThrow();
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(SESSION_HINT_KEY);
        });
    });

    describe('hasAuthSessionHint', () => {
        it('should return true when hint exists with content', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify({ active: true, portal: 'student', updatedAt: Date.now() }));

            expect(hasAuthSessionHint()).toBe(true);
        });

        it('should return false when key does not exist', () => {
            expect(hasAuthSessionHint()).toBe(false);
        });

        it('should return false when value is empty string', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '');

            expect(hasAuthSessionHint()).toBe(false);
        });

        it('should return true when value is non-empty (even if malformed)', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, 'not-valid-json');

            expect(hasAuthSessionHint()).toBe(true);
        });

        it('should return true when value is whitespace only (trimmed to empty)', () => {
            // The implementation trims the value, so whitespace-only becomes empty
            mockLocalStorage.setItem(SESSION_HINT_KEY, '   ');

            // After trim, '   ' becomes '', so length is 0
            expect(hasAuthSessionHint()).toBe(false);
        });
    });

    describe('readAuthSessionHint', () => {
        it('should parse JSON correctly and return hint object', () => {
            const timestamp = Date.now();
            const hint = { active: true, portal: 'student', updatedAt: timestamp };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result).not.toBeNull();
            expect(result!.active).toBe(true);
            expect(result!.portal).toBe('student');
            expect(result!.updatedAt).toBe(timestamp);
        });

        it('should return null when key does not exist', () => {
            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should return null when value is empty string', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should handle malformed JSON gracefully and return null', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, 'not-valid-json');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should handle incomplete JSON gracefully and return null', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '{ "active": true, "portal":');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should handle JSON array gracefully', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '[1, 2, 3]');

            const result = readAuthSessionHint();

            // Arrays are objects in JS, so they pass the typeof === 'object' check
            // The implementation coerces the values, resulting in defaults
            expect(result).not.toBeNull();
            expect(result!.active).toBe(false); // Boolean([1,2,3]) is true, but parsed.active is undefined
            expect(result!.portal).toBe('unknown');
            expect(result!.updatedAt).toBe(0);
        });

        it('should handle JSON null gracefully and return null', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, 'null');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should handle JSON primitive gracefully and return null', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '"just a string"');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should handle JSON number gracefully and return null', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '12345');

            const result = readAuthSessionHint();

            expect(result).toBeNull();
        });

        it('should coerce active to boolean', () => {
            const hint = { active: 1, portal: 'student', updatedAt: Date.now() };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.active).toBe(true);
        });

        it('should coerce falsy active to false', () => {
            const hint = { active: 0, portal: 'student', updatedAt: Date.now() };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.active).toBe(false);
        });

        it('should default portal to "unknown" when missing', () => {
            const hint = { active: true, updatedAt: Date.now() };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.portal).toBe('unknown');
        });

        it('should coerce portal to string', () => {
            const hint = { active: true, portal: 123, updatedAt: Date.now() };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.portal).toBe('123');
        });

        it('should default updatedAt to 0 when missing', () => {
            const hint = { active: true, portal: 'student' };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.updatedAt).toBe(0);
        });

        it('should coerce updatedAt to number', () => {
            const hint = { active: true, portal: 'student', updatedAt: '12345' };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.updatedAt).toBe(12345);
        });

        it('should default updatedAt to 0 when not a valid number', () => {
            const hint = { active: true, portal: 'student', updatedAt: 'not-a-number' };
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));

            const result = readAuthSessionHint();

            expect(result!.updatedAt).toBe(0);
        });

        it('should handle empty object gracefully', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, '{}');

            const result = readAuthSessionHint();

            expect(result).not.toBeNull();
            expect(result!.active).toBe(false);
            expect(result!.portal).toBe('unknown');
            expect(result!.updatedAt).toBe(0);
        });
    });

    describe('Integration: markAuthSessionHint + readAuthSessionHint', () => {
        it('should write and read back the same portal value', () => {
            markAuthSessionHint('student');

            // Simulate reading from what was written
            const writtenValue = mockLocalStorage.setItem.mock.calls[0][1];
            mockLocalStorage.setItem(SESSION_HINT_KEY, writtenValue);

            const result = readAuthSessionHint();

            expect(result!.portal).toBe('student');
            expect(result!.active).toBe(true);
        });

        it('should write and read back for all portal types', () => {
            const portals = ['student', 'admin', 'chairman'] as const;

            for (const portal of portals) {
                mockLocalStorage._reset();
                markAuthSessionHint(portal);

                const writtenValue = mockLocalStorage.setItem.mock.calls[mockLocalStorage.setItem.mock.calls.length - 1][1];
                mockLocalStorage.setItem(SESSION_HINT_KEY, writtenValue);

                const result = readAuthSessionHint();
                expect(result!.portal).toBe(portal);
            }
        });
    });

    describe('Integration: clearAuthSessionHint + hasAuthSessionHint', () => {
        it('should return false after clearing', () => {
            mockLocalStorage.setItem(SESSION_HINT_KEY, JSON.stringify({ active: true, portal: 'student', updatedAt: Date.now() }));
            expect(hasAuthSessionHint()).toBe(true);

            clearAuthSessionHint();

            expect(hasAuthSessionHint()).toBe(false);
        });
    });
});
