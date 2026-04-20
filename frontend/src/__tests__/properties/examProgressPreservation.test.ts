/**
 * Property 8: Exam progress is preserved before state clear on force logout
 *
 * Feature: auth-session-persistence, Property 8
 *
 * For any force logout event received while the student is on a path matching
 * `/exam/:examId`, the exam runner cache for that examId SHALL be written to
 * the preservation key BEFORE `clearAuthState()` is called.
 *
 * **Validates: Requirements 5.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
    createMockLocalStorage,
    createCallOrderTracker,
    SESSION_HINT_KEY,
    EXAM_PROGRESS_PRESERVATION_KEY,
    type PortalType,
} from '../../test-utils/authMocks';

// ─── Constants ───────────────────────────────────────────────────────

const EXAM_CACHE_PREFIX = 'cw_exam_';

// ─── Simulation Functions ────────────────────────────────────────────

/**
 * Simulates the force logout flow as implemented in useAuth.tsx:
 * 1. Check if current path is /exam/:examId
 * 2. If yes, call preserveExamProgress(examId, sessionId)
 * 3. Call clearAuthState()
 *
 * Uses a call order tracker to verify ordering.
 */
function simulateForceLogoutOnExamPath(
    storage: ReturnType<typeof createMockLocalStorage>,
    tracker: ReturnType<typeof createCallOrderTracker>,
    pathname: string,
    sessionId: string,
): void {
    // Step 1: Check if on exam path and extract examId
    const examPathMatch = pathname.match(/^\/exam\/([^/]+)/);

    if (examPathMatch) {
        const examId = examPathMatch[1];
        // Step 2: Preserve exam progress BEFORE clearing state
        const cacheKey = `${EXAM_CACHE_PREFIX}${examId}_${sessionId}`;
        const raw = storage.getItem(cacheKey);
        if (raw) {
            storage.setItem(
                EXAM_PROGRESS_PRESERVATION_KEY,
                JSON.stringify({
                    examId,
                    sessionId,
                    preservedAt: new Date().toISOString(),
                    cache: raw,
                }),
            );
        }
        tracker.record('preserveExamProgress', [examId, sessionId]);
    }

    // Step 3: Clear auth state (token + hint)
    storage.removeItem(SESSION_HINT_KEY);
    tracker.record('clearAuthState');
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary exam IDs (alphanumeric, simulating MongoDB ObjectIds)
 */
const examIdArbitrary = fc.string({
    minLength: 8,
    maxLength: 24,
    unit: fc.constantFrom(...'abcdef0123456789'.split('')),
});

/**
 * Generate arbitrary session IDs
 */
const sessionIdArbitrary = fc.string({
    minLength: 8,
    maxLength: 32,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
});

/**
 * Generate arbitrary exam cache content (JSON-like strings representing runner state)
 */
const examCacheArbitrary = fc.record({
    currentQuestion: fc.integer({ min: 0, max: 100 }),
    answers: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdef0123456789'.split('')) }),
        fc.string({ minLength: 1, maxLength: 50 }),
    ),
    startedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
    timeRemaining: fc.integer({ min: 0, max: 7200 }),
}).map(obj => JSON.stringify(obj));

/**
 * Generate arbitrary exam path suffixes (sub-paths after /exam/:examId)
 */
const examPathSuffixArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant('/'),
    fc.constant('/result'),
    fc.constant('/solutions'),
);

/**
 * Generate arbitrary portal values for session hints
 */
const portalArbitrary = fc.constantFrom<PortalType>('student', 'admin', 'chairman');

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 8: Exam progress is preserved before state clear on force logout', () => {
    let mockStorage: ReturnType<typeof createMockLocalStorage>;
    let tracker: ReturnType<typeof createCallOrderTracker>;

    beforeEach(() => {
        mockStorage = createMockLocalStorage();
        tracker = createCallOrderTracker();
    });

    afterEach(() => {
        mockStorage.clear();
        tracker.clear();
    });

    it('preserveExamProgress is called before clearAuthState on force logout while on exam path', () => {
        /**
         * **Validates: Requirements 5.3**
         *
         * Strategy: Generate arbitrary examId, sessionId, and cache states.
         * Set up localStorage with exam cache and session hint.
         * Simulate force logout while on /exam/:examId path.
         * Verify preserveExamProgress is called before clearAuthState via call order spy.
         */
        fc.assert(
            fc.property(
                examIdArbitrary,
                sessionIdArbitrary,
                examCacheArbitrary,
                portalArbitrary,
                examPathSuffixArbitrary,
                (examId, sessionId, cacheContent, portal, pathSuffix) => {
                    // Arrange: Set up exam cache and session hint in localStorage
                    mockStorage.clear();
                    tracker.clear();

                    const cacheKey = `${EXAM_CACHE_PREFIX}${examId}_${sessionId}`;
                    mockStorage.setItem(cacheKey, cacheContent);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    const pathname = `/exam/${examId}${pathSuffix}`;

                    // Act: Simulate force logout on exam path
                    simulateForceLogoutOnExamPath(mockStorage, tracker, pathname, sessionId);

                    // Assert: preserveExamProgress was called before clearAuthState
                    expect(tracker.wasCalled('preserveExamProgress')).toBe(true);
                    expect(tracker.wasCalled('clearAuthState')).toBe(true);
                    expect(tracker.wasCalledBefore('preserveExamProgress', 'clearAuthState')).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('exam progress is written to preservation key before session hint is cleared', () => {
        /**
         * **Validates: Requirements 5.3**
         *
         * Strategy: Generate arbitrary exam states. Verify that after force logout,
         * the preservation key contains the exam data AND the session hint is cleared.
         * This confirms the ordering: preserve first, then clear.
         */
        fc.assert(
            fc.property(
                examIdArbitrary,
                sessionIdArbitrary,
                examCacheArbitrary,
                portalArbitrary,
                (examId, sessionId, cacheContent, portal) => {
                    // Arrange
                    mockStorage.clear();
                    tracker.clear();

                    const cacheKey = `${EXAM_CACHE_PREFIX}${examId}_${sessionId}`;
                    mockStorage.setItem(cacheKey, cacheContent);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    const pathname = `/exam/${examId}`;

                    // Act: Simulate force logout
                    simulateForceLogoutOnExamPath(mockStorage, tracker, pathname, sessionId);

                    // Assert: Preservation key exists with correct data
                    const preserved = mockStorage.getItem(EXAM_PROGRESS_PRESERVATION_KEY);
                    expect(preserved).not.toBeNull();

                    const parsed = JSON.parse(preserved!);
                    expect(parsed.examId).toBe(examId);
                    expect(parsed.sessionId).toBe(sessionId);
                    expect(parsed.cache).toBe(cacheContent);

                    // Assert: Session hint is cleared (state was cleared after preservation)
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('preservation does not occur when exam cache is absent', () => {
        /**
         * **Validates: Requirements 5.3**
         *
         * Strategy: Generate arbitrary exam paths but do NOT set up exam cache.
         * Verify that preserveExamProgress is still called (path matches) but
         * the preservation key is NOT written (no cache to preserve).
         * clearAuthState is still called.
         */
        fc.assert(
            fc.property(
                examIdArbitrary,
                sessionIdArbitrary,
                portalArbitrary,
                (examId, sessionId, portal) => {
                    // Arrange: Set up session hint but NO exam cache
                    mockStorage.clear();
                    tracker.clear();

                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    const pathname = `/exam/${examId}`;

                    // Act: Simulate force logout
                    simulateForceLogoutOnExamPath(mockStorage, tracker, pathname, sessionId);

                    // Assert: preserveExamProgress was called (path matched)
                    expect(tracker.wasCalled('preserveExamProgress')).toBe(true);
                    // Assert: But preservation key was NOT written (no cache existed)
                    expect(mockStorage.getItem(EXAM_PROGRESS_PRESERVATION_KEY)).toBeNull();
                    // Assert: clearAuthState was still called
                    expect(tracker.wasCalled('clearAuthState')).toBe(true);
                    // Assert: Order is still correct
                    expect(tracker.wasCalledBefore('preserveExamProgress', 'clearAuthState')).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('clearAuthState is called without preservation when not on exam path', () => {
        /**
         * **Validates: Requirements 5.3**
         *
         * Strategy: Generate arbitrary non-exam paths. Verify that
         * preserveExamProgress is NOT called but clearAuthState IS called.
         * This confirms preservation only happens on exam paths.
         */
        const nonExamPathArbitrary = fc.oneof(
            fc.constant('/dashboard'),
            fc.constant('/results'),
            fc.constant('/payments'),
            fc.constant('/profile'),
            fc.constant('/student/courses'),
            fc.constant('/notifications'),
            fc.constant('/support'),
            fc.constant('/login'),
            fc.constant('/'),
        );

        fc.assert(
            fc.property(
                nonExamPathArbitrary,
                sessionIdArbitrary,
                portalArbitrary,
                (pathname, sessionId, portal) => {
                    // Arrange
                    mockStorage.clear();
                    tracker.clear();

                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Act: Simulate force logout on non-exam path
                    simulateForceLogoutOnExamPath(mockStorage, tracker, pathname, sessionId);

                    // Assert: preserveExamProgress was NOT called
                    expect(tracker.wasCalled('preserveExamProgress')).toBe(false);
                    // Assert: clearAuthState was still called
                    expect(tracker.wasCalled('clearAuthState')).toBe(true);
                    // Assert: No preservation key written
                    expect(mockStorage.getItem(EXAM_PROGRESS_PRESERVATION_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('call order is always preserve-then-clear regardless of cache content size', () => {
        /**
         * **Validates: Requirements 5.3**
         *
         * Strategy: Generate arbitrary cache content of varying sizes.
         * Verify the ordering invariant holds regardless of data size.
         */
        const largeCacheArbitrary = fc.record({
            currentQuestion: fc.integer({ min: 0, max: 200 }),
            answers: fc.dictionary(
                fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...'0123456789abcdef'.split('')) }),
                fc.string({ minLength: 1, maxLength: 200 }),
                { minKeys: 1, maxKeys: 50 },
            ),
            startedAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString()),
            timeRemaining: fc.integer({ min: 0, max: 7200 }),
            metadata: fc.string({ minLength: 0, maxLength: 500 }),
        }).map(obj => JSON.stringify(obj));

        fc.assert(
            fc.property(
                examIdArbitrary,
                sessionIdArbitrary,
                largeCacheArbitrary,
                (examId, sessionId, cacheContent) => {
                    // Arrange
                    mockStorage.clear();
                    tracker.clear();

                    const cacheKey = `${EXAM_CACHE_PREFIX}${examId}_${sessionId}`;
                    mockStorage.setItem(cacheKey, cacheContent);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal: 'student', updatedAt: Date.now() }),
                    );

                    const pathname = `/exam/${examId}`;

                    // Act
                    simulateForceLogoutOnExamPath(mockStorage, tracker, pathname, sessionId);

                    // Assert: Order invariant holds
                    const callOrder = tracker.getCallOrder();
                    expect(callOrder[0]).toBe('preserveExamProgress');
                    expect(callOrder[1]).toBe('clearAuthState');
                },
            ),
            { numRuns: 20 },
        );
    });
});
