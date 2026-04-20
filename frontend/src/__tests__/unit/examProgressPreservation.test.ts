/**
 * Unit tests for exam progress preservation utilities
 * Tests preserveExamProgress, restoreExamProgress, and clearPreservedExamProgress
 * from CampusWay/frontend/src/utils/examProgressPreservation.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
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

Object.defineProperty(global, 'window', {
    value: {
        localStorage: mockLocalStorage,
    },
    writable: true,
});

import {
    preserveExamProgress,
    restoreExamProgress,
    clearPreservedExamProgress,
} from '../../utils/examProgressPreservation';

const PRESERVATION_KEY = 'cw_exam_force_logout_preserved';

describe('Exam Progress Preservation Utilities', () => {
    beforeEach(() => {
        mockLocalStorage._reset();
        mockLocalStorage.getItem.mockClear();
        mockLocalStorage.setItem.mockClear();
        mockLocalStorage.removeItem.mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('preserveExamProgress', () => {
        it('should write correct structure to the preservation key', () => {
            const examId = 'exam-abc123';
            const sessionId = 'session-xyz789';
            const cacheData = JSON.stringify({ answers: [1, 2, 3], currentQuestion: 5 });
            const cacheKey = `cw_exam_${examId}_${sessionId}`;

            // Seed the exam cache in localStorage
            mockLocalStorage.setItem(cacheKey, cacheData);
            mockLocalStorage.setItem.mockClear();

            preserveExamProgress(examId, sessionId);

            expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            const [key, value] = mockLocalStorage.setItem.mock.calls[0];
            expect(key).toBe(PRESERVATION_KEY);

            const parsed = JSON.parse(value);
            expect(parsed.examId).toBe(examId);
            expect(parsed.sessionId).toBe(sessionId);
            expect(parsed.cache).toBe(cacheData);
            expect(parsed.preservedAt).toBeDefined();
            // preservedAt should be a valid ISO string
            expect(new Date(parsed.preservedAt).toISOString()).toBe(parsed.preservedAt);
        });

        it('should handle missing cache gracefully (no-op)', () => {
            // No cache key exists in localStorage
            preserveExamProgress('nonexistent-exam', 'nonexistent-session');

            // setItem should NOT have been called for the preservation key
            expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
        });

        it('should preserve raw cache string as-is', () => {
            const examId = 'exam-1';
            const sessionId = 'sess-1';
            const rawCache = '{"complex":{"nested":true},"arr":[1,2]}';
            const cacheKey = `cw_exam_${examId}_${sessionId}`;

            mockLocalStorage.setItem(cacheKey, rawCache);
            mockLocalStorage.setItem.mockClear();

            preserveExamProgress(examId, sessionId);

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.cache).toBe(rawCache);
        });

        it('should overwrite previous preserved progress', () => {
            const examId = 'exam-2';
            const sessionId = 'sess-2';
            const cacheKey = `cw_exam_${examId}_${sessionId}`;

            // Seed existing preserved data
            mockLocalStorage.setItem(PRESERVATION_KEY, JSON.stringify({ examId: 'old', sessionId: 'old', cache: 'old' }));
            mockLocalStorage.setItem(cacheKey, '{"q":1}');
            mockLocalStorage.setItem.mockClear();

            preserveExamProgress(examId, sessionId);

            const [, value] = mockLocalStorage.setItem.mock.calls[0];
            const parsed = JSON.parse(value);
            expect(parsed.examId).toBe(examId);
            expect(parsed.sessionId).toBe(sessionId);
        });
    });

    describe('restoreExamProgress', () => {
        it('should return correct data when preservation key exists', () => {
            const preserved = {
                examId: 'exam-abc',
                sessionId: 'sess-xyz',
                preservedAt: new Date().toISOString(),
                cache: '{"answers":[1,2,3]}',
            };
            mockLocalStorage.setItem(PRESERVATION_KEY, JSON.stringify(preserved));

            const result = restoreExamProgress();

            expect(result).not.toBeNull();
            expect(result!.examId).toBe('exam-abc');
            expect(result!.sessionId).toBe('sess-xyz');
            expect(result!.cache).toBe('{"answers":[1,2,3]}');
        });

        it('should return null when preservation key is absent', () => {
            const result = restoreExamProgress();

            expect(result).toBeNull();
        });

        it('should return null when stored value is malformed JSON', () => {
            mockLocalStorage.setItem(PRESERVATION_KEY, 'not-valid-json{{{');

            const result = restoreExamProgress();

            expect(result).toBeNull();
        });

        it('should return null when stored object is missing required fields', () => {
            // Missing cache field
            mockLocalStorage.setItem(PRESERVATION_KEY, JSON.stringify({ examId: 'e1', sessionId: 's1' }));

            const result = restoreExamProgress();

            expect(result).toBeNull();
        });

        it('should return null when stored value is null JSON', () => {
            mockLocalStorage.setItem(PRESERVATION_KEY, 'null');

            const result = restoreExamProgress();

            expect(result).toBeNull();
        });
    });

    describe('clearPreservedExamProgress', () => {
        it('should remove the preservation key from localStorage', () => {
            mockLocalStorage.setItem(PRESERVATION_KEY, JSON.stringify({ examId: 'e', sessionId: 's', cache: 'c' }));
            mockLocalStorage.removeItem.mockClear();

            clearPreservedExamProgress();

            expect(mockLocalStorage.removeItem).toHaveBeenCalledTimes(1);
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(PRESERVATION_KEY);
        });

        it('should not throw when key does not exist', () => {
            expect(() => clearPreservedExamProgress()).not.toThrow();
            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(PRESERVATION_KEY);
        });
    });
});
